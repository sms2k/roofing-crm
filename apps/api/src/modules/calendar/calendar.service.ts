import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { google } from 'googleapis';
import axios from 'axios';

export type CalendarProvider = 'GOOGLE' | 'OUTLOOK';

export interface CalendarEvent {
  id?: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  attendees?: string[];
  reminders?: number[]; // Minutes before event
}

export interface SyncResult {
  provider: CalendarProvider;
  synced: number;
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  // ===========================
  // OAuth & Connection
  // ===========================

  /**
   * Get Google OAuth URL
   */
  getGoogleAuthUrl(tenantId: string, userId: string): string {
    const oauth2Client = this.getGoogleOAuthClient();

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar'],
      state: JSON.stringify({ tenantId, userId, provider: 'GOOGLE' }),
    });

    return authUrl;
  }

  /**
   * Get Outlook OAuth URL
   */
  getOutlookAuthUrl(tenantId: string, userId: string): string {
    const clientId = this.config.get('OUTLOOK_CLIENT_ID');
    const redirectUri = this.config.get('OUTLOOK_REDIRECT_URI');

    const scopes = 'Calendars.ReadWrite offline_access';
    const state = JSON.stringify({ tenantId, userId, provider: 'OUTLOOK' });

    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}`;
  }

  /**
   * Handle Google OAuth callback
   */
  async handleGoogleCallback(code: string, tenantId: string, userId: string) {
    const oauth2Client = this.getGoogleOAuthClient();

    const { tokens } = await oauth2Client.getToken(code);

    // Store tokens in database
    await this.storeCalendarSync(tenantId, userId, 'GOOGLE', {
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token!,
      expiresAt: new Date(tokens.expiry_date!),
    });

    this.logger.log(`Google Calendar connected for user ${userId}`);

    return { success: true, provider: 'GOOGLE' };
  }

  /**
   * Handle Outlook OAuth callback
   */
  async handleOutlookCallback(code: string, tenantId: string, userId: string) {
    const clientId = this.config.get('OUTLOOK_CLIENT_ID');
    const clientSecret = this.config.get('OUTLOOK_CLIENT_SECRET');
    const redirectUri = this.config.get('OUTLOOK_REDIRECT_URI');

    try {
      const response = await axios.post(
        'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );

      const { access_token, refresh_token, expires_in } = response.data;

      // Store tokens in database
      await this.storeCalendarSync(tenantId, userId, 'OUTLOOK', {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: new Date(Date.now() + expires_in * 1000),
      });

      this.logger.log(`Outlook Calendar connected for user ${userId}`);

      return { success: true, provider: 'OUTLOOK' };
    } catch (error) {
      this.logger.error(`Outlook OAuth error: ${error.message}`);
      throw new BadRequestException('Failed to connect Outlook Calendar');
    }
  }

  /**
   * Disconnect calendar
   */
  async disconnectCalendar(
    tenantId: string,
    userId: string,
    provider: CalendarProvider,
  ) {
    await this.db.calendarSync.deleteMany({
      where: {
        tenantId,
        userId,
        provider,
      },
    });

    this.logger.log(`${provider} Calendar disconnected for user ${userId}`);

    return { success: true };
  }

  // ===========================
  // Calendar Sync
  // ===========================

  /**
   * Sync appointments to calendar
   */
  async syncToCalendar(
    tenantId: string,
    userId: string,
    provider: CalendarProvider,
  ): Promise<SyncResult> {
    const sync = await this.getCalendarSync(tenantId, userId, provider);

    if (!sync) {
      throw new BadRequestException(
        `${provider} Calendar not connected for this user`,
      );
    }

    // Refresh token if needed
    await this.refreshTokenIfNeeded(sync);

    const result: SyncResult = {
      provider,
      synced: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      errors: [],
    };

    try {
      // Get appointments from CRM that need syncing
      const appointments = await this.db.appointment.findMany({
        where: {
          tenantId,
          userId,
          startTime: { gte: new Date() }, // Future appointments
        },
      });

      for (const appointment of appointments) {
        try {
          if (!appointment.calendarEventId) {
            // Create new calendar event
            const eventId = await this.createCalendarEvent(
              sync,
              provider,
              this.appointmentToEvent(appointment),
            );

            // Update appointment with calendar event ID
            await this.db.appointment.update({
              where: { id: appointment.id },
              data: {
                calendarEventId: eventId,
                calendarSyncedAt: new Date(),
              },
            });

            result.created++;
          } else {
            // Update existing calendar event
            await this.updateCalendarEvent(
              sync,
              provider,
              appointment.calendarEventId,
              this.appointmentToEvent(appointment),
            );

            await this.db.appointment.update({
              where: { id: appointment.id },
              data: { calendarSyncedAt: new Date() },
            });

            result.updated++;
          }

          result.synced++;
        } catch (error) {
          result.errors.push(
            `Appointment ${appointment.id}: ${error.message}`,
          );
        }
      }

      this.logger.log(
        `${provider} sync completed: ${result.synced} appointments synced`,
      );
    } catch (error) {
      this.logger.error(`${provider} sync error: ${error.message}`);
      result.errors.push(error.message);
    }

    return result;
  }

  /**
   * Sync from calendar to CRM
   */
  async syncFromCalendar(
    tenantId: string,
    userId: string,
    provider: CalendarProvider,
  ): Promise<SyncResult> {
    const sync = await this.getCalendarSync(tenantId, userId, provider);

    if (!sync) {
      throw new BadRequestException(
        `${provider} Calendar not connected for this user`,
      );
    }

    await this.refreshTokenIfNeeded(sync);

    const result: SyncResult = {
      provider,
      synced: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      errors: [],
    };

    try {
      // Get events from calendar
      const events = await this.getCalendarEvents(sync, provider);

      for (const event of events) {
        try {
          // Check if appointment already exists
          const existing = await this.db.appointment.findFirst({
            where: {
              tenantId,
              userId,
              calendarEventId: event.id,
            },
          });

          if (!existing) {
            // Create new appointment
            await this.db.appointment.create({
              data: {
                tenantId,
                userId,
                title: event.title,
                description: event.description,
                startTime: event.startTime,
                endTime: event.endTime,
                location: event.location,
                calendarEventId: event.id,
                calendarSyncedAt: new Date(),
              },
            });

            result.created++;
          } else {
            // Update existing appointment
            await this.db.appointment.update({
              where: { id: existing.id },
              data: {
                title: event.title,
                description: event.description,
                startTime: event.startTime,
                endTime: event.endTime,
                location: event.location,
                calendarSyncedAt: new Date(),
              },
            });

            result.updated++;
          }

          result.synced++;
        } catch (error) {
          result.errors.push(`Event ${event.id}: ${error.message}`);
        }
      }

      this.logger.log(
        `${provider} sync from calendar completed: ${result.synced} events synced`,
      );
    } catch (error) {
      this.logger.error(`${provider} sync from calendar error: ${error.message}`);
      result.errors.push(error.message);
    }

    return result;
  }

  /**
   * Two-way sync (both directions)
   */
  async syncBothWays(
    tenantId: string,
    userId: string,
    provider: CalendarProvider,
  ) {
    const toCalendar = await this.syncToCalendar(tenantId, userId, provider);
    const fromCalendar = await this.syncFromCalendar(tenantId, userId, provider);

    return {
      toCalendar,
      fromCalendar,
      totalSynced: toCalendar.synced + fromCalendar.synced,
    };
  }

  // ===========================
  // Calendar API Operations
  // ===========================

  /**
   * Create calendar event
   */
  private async createCalendarEvent(
    sync: any,
    provider: CalendarProvider,
    event: CalendarEvent,
  ): Promise<string> {
    if (provider === 'GOOGLE') {
      return this.createGoogleEvent(sync, event);
    } else {
      return this.createOutlookEvent(sync, event);
    }
  }

  /**
   * Update calendar event
   */
  private async updateCalendarEvent(
    sync: any,
    provider: CalendarProvider,
    eventId: string,
    event: CalendarEvent,
  ): Promise<void> {
    if (provider === 'GOOGLE') {
      await this.updateGoogleEvent(sync, eventId, event);
    } else {
      await this.updateOutlookEvent(sync, eventId, event);
    }
  }

  /**
   * Get calendar events
   */
  private async getCalendarEvents(
    sync: any,
    provider: CalendarProvider,
  ): Promise<CalendarEvent[]> {
    if (provider === 'GOOGLE') {
      return this.getGoogleEvents(sync);
    } else {
      return this.getOutlookEvents(sync);
    }
  }

  // ===========================
  // Google Calendar
  // ===========================

  private getGoogleOAuthClient() {
    return new google.auth.OAuth2(
      this.config.get('GOOGLE_CLIENT_ID'),
      this.config.get('GOOGLE_CLIENT_SECRET'),
      this.config.get('GOOGLE_REDIRECT_URI'),
    );
  }

  private async createGoogleEvent(sync: any, event: CalendarEvent): Promise<string> {
    const oauth2Client = this.getGoogleOAuthClient();
    oauth2Client.setCredentials({
      access_token: sync.accessToken,
      refresh_token: sync.refreshToken,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: event.title,
        description: event.description,
        location: event.location,
        start: {
          dateTime: event.startTime.toISOString(),
          timeZone: 'America/New_York', // Configurable
        },
        end: {
          dateTime: event.endTime.toISOString(),
          timeZone: 'America/New_York',
        },
        attendees: event.attendees?.map((email) => ({ email })),
        reminders: {
          useDefault: false,
          overrides: event.reminders?.map((minutes) => ({
            method: 'popup',
            minutes,
          })),
        },
      },
    });

    return response.data.id!;
  }

  private async updateGoogleEvent(
    sync: any,
    eventId: string,
    event: CalendarEvent,
  ): Promise<void> {
    const oauth2Client = this.getGoogleOAuthClient();
    oauth2Client.setCredentials({
      access_token: sync.accessToken,
      refresh_token: sync.refreshToken,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    await calendar.events.update({
      calendarId: 'primary',
      eventId,
      requestBody: {
        summary: event.title,
        description: event.description,
        location: event.location,
        start: {
          dateTime: event.startTime.toISOString(),
          timeZone: 'America/New_York',
        },
        end: {
          dateTime: event.endTime.toISOString(),
          timeZone: 'America/New_York',
        },
      },
    });
  }

  private async getGoogleEvents(sync: any): Promise<CalendarEvent[]> {
    const oauth2Client = this.getGoogleOAuthClient();
    oauth2Client.setCredentials({
      access_token: sync.accessToken,
      refresh_token: sync.refreshToken,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 100,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return (
      response.data.items?.map((item) => ({
        id: item.id!,
        title: item.summary || 'Untitled Event',
        description: item.description,
        startTime: new Date(item.start!.dateTime || item.start!.date!),
        endTime: new Date(item.end!.dateTime || item.end!.date!),
        location: item.location,
        attendees: item.attendees?.map((a) => a.email!),
      })) || []
    );
  }

  // ===========================
  // Outlook Calendar
  // ===========================

  private async createOutlookEvent(sync: any, event: CalendarEvent): Promise<string> {
    const response = await axios.post(
      'https://graph.microsoft.com/v1.0/me/events',
      {
        subject: event.title,
        body: {
          contentType: 'HTML',
          content: event.description || '',
        },
        start: {
          dateTime: event.startTime.toISOString(),
          timeZone: 'Eastern Standard Time',
        },
        end: {
          dateTime: event.endTime.toISOString(),
          timeZone: 'Eastern Standard Time',
        },
        location: {
          displayName: event.location || '',
        },
        attendees: event.attendees?.map((email) => ({
          emailAddress: { address: email },
          type: 'required',
        })),
      },
      {
        headers: {
          Authorization: `Bearer ${sync.accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    return response.data.id;
  }

  private async updateOutlookEvent(
    sync: any,
    eventId: string,
    event: CalendarEvent,
  ): Promise<void> {
    await axios.patch(
      `https://graph.microsoft.com/v1.0/me/events/${eventId}`,
      {
        subject: event.title,
        body: {
          contentType: 'HTML',
          content: event.description || '',
        },
        start: {
          dateTime: event.startTime.toISOString(),
          timeZone: 'Eastern Standard Time',
        },
        end: {
          dateTime: event.endTime.toISOString(),
          timeZone: 'Eastern Standard Time',
        },
        location: {
          displayName: event.location || '',
        },
      },
      {
        headers: {
          Authorization: `Bearer ${sync.accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );
  }

  private async getOutlookEvents(sync: any): Promise<CalendarEvent[]> {
    const response = await axios.get(
      'https://graph.microsoft.com/v1.0/me/events',
      {
        params: {
          $filter: `start/dateTime ge '${new Date().toISOString()}'`,
          $top: 100,
          $orderby: 'start/dateTime',
        },
        headers: {
          Authorization: `Bearer ${sync.accessToken}`,
        },
      },
    );

    return response.data.value.map((item: any) => ({
      id: item.id,
      title: item.subject,
      description: item.body?.content,
      startTime: new Date(item.start.dateTime),
      endTime: new Date(item.end.dateTime),
      location: item.location?.displayName,
      attendees: item.attendees?.map((a: any) => a.emailAddress.address),
    }));
  }

  // ===========================
  // Helper Methods
  // ===========================

  private async storeCalendarSync(
    tenantId: string,
    userId: string,
    provider: CalendarProvider,
    tokens: {
      accessToken: string;
      refreshToken: string;
      expiresAt: Date;
    },
  ) {
    // Delete existing sync
    await this.db.calendarSync.deleteMany({
      where: { tenantId, userId, provider },
    });

    // Create new sync
    return this.db.calendarSync.create({
      data: {
        tenantId,
        userId,
        provider,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        enabled: true,
      },
    });
  }

  private async getCalendarSync(
    tenantId: string,
    userId: string,
    provider: CalendarProvider,
  ) {
    return this.db.calendarSync.findFirst({
      where: { tenantId, userId, provider, enabled: true },
    });
  }

  private async refreshTokenIfNeeded(sync: any) {
    // Check if token is expired or will expire in 5 minutes
    if (new Date(sync.expiresAt).getTime() - Date.now() < 5 * 60 * 1000) {
      this.logger.log(`Refreshing ${sync.provider} token for user ${sync.userId}`);

      if (sync.provider === 'GOOGLE') {
        await this.refreshGoogleToken(sync);
      } else {
        await this.refreshOutlookToken(sync);
      }
    }
  }

  private async refreshGoogleToken(sync: any) {
    const oauth2Client = this.getGoogleOAuthClient();
    oauth2Client.setCredentials({
      refresh_token: sync.refreshToken,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();

    await this.db.calendarSync.update({
      where: { id: sync.id },
      data: {
        accessToken: credentials.access_token!,
        expiresAt: new Date(credentials.expiry_date!),
      },
    });
  }

  private async refreshOutlookToken(sync: any) {
    const clientId = this.config.get('OUTLOOK_CLIENT_ID');
    const clientSecret = this.config.get('OUTLOOK_CLIENT_SECRET');

    const response = await axios.post(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: sync.refreshToken,
        grant_type: 'refresh_token',
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );

    await this.db.calendarSync.update({
      where: { id: sync.id },
      data: {
        accessToken: response.data.access_token,
        expiresAt: new Date(Date.now() + response.data.expires_in * 1000),
      },
    });
  }

  private appointmentToEvent(appointment: any): CalendarEvent {
    return {
      title: appointment.title || 'Appointment',
      description: appointment.description,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      location: appointment.location,
      attendees: appointment.attendeeEmails || [],
      reminders: [15, 60], // 15 mins and 1 hour before
    };
  }

  /**
   * Get connected calendars for user
   */
  async getConnectedCalendars(tenantId: string, userId: string) {
    return this.db.calendarSync.findMany({
      where: { tenantId, userId, enabled: true },
      select: {
        provider: true,
        lastSyncedAt: true,
        createdAt: true,
      },
    });
  }
}
