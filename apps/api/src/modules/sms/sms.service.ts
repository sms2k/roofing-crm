import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';
import { DatabaseService } from '../database/database.service';

export interface SendSmsOptions {
  to: string;
  message: string;
  from?: string;
  mediaUrls?: string[];
  scheduledAt?: Date;
  statusCallback?: string;
}

export interface SmsCampaignRecipient {
  contactId: string;
  phone: string;
  variables?: Record<string, string>;
}

export interface SendBulkSmsOptions {
  recipients: SmsCampaignRecipient[];
  templateId?: string;
  message?: string;
  from?: string;
  mediaUrls?: string[];
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private twilioClient: Twilio;
  private defaultFrom: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {
    const accountSid = this.config.get('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get('TWILIO_AUTH_TOKEN');
    this.defaultFrom = this.config.get('TWILIO_PHONE_NUMBER');

    if (accountSid && authToken) {
      this.twilioClient = new Twilio(accountSid, authToken);
      this.logger.log('Twilio SMS service initialized');
    } else {
      this.logger.warn(
        'Twilio credentials not configured - SMS service disabled',
      );
    }
  }

  /**
   * Check if Twilio is configured and available
   */
  isAvailable(): boolean {
    return !!this.twilioClient;
  }

  /**
   * Validate phone number format (E.164)
   */
  validatePhoneNumber(phone: string): string {
    // Remove all non-numeric characters except +
    let cleaned = phone.replace(/[^\d+]/g, '');

    // If it doesn't start with +, assume US number and add +1
    if (!cleaned.startsWith('+')) {
      cleaned = `+1${cleaned}`;
    }

    // Validate format
    if (!/^\+\d{11,15}$/.test(cleaned)) {
      throw new BadRequestException(
        'Invalid phone number format. Use E.164 format (e.g., +15555551234)',
      );
    }

    return cleaned;
  }

  /**
   * Send a single SMS message
   */
  async sendSms(tenantId: string, options: SendSmsOptions) {
    if (!this.isAvailable()) {
      throw new BadRequestException('SMS service is not configured');
    }

    const to = this.validatePhoneNumber(options.to);
    const from = options.from || this.defaultFrom;

    this.logger.log(`Sending SMS to ${to}`);

    try {
      // Send via Twilio
      const twilioMessage = await this.twilioClient.messages.create({
        body: options.message,
        to,
        from,
        mediaUrl: options.mediaUrls,
        statusCallback: options.statusCallback,
        sendAt: options.scheduledAt,
        scheduleType: options.scheduledAt ? 'fixed' : undefined,
      });

      // Store in database
      const smsMessage = await this.db.smsMessage.create({
        data: {
          tenantId,
          to,
          from,
          body: options.message,
          direction: 'OUTBOUND',
          status: twilioMessage.status.toUpperCase(),
          twilioSid: twilioMessage.sid,
          mediaUrls: options.mediaUrls || [],
          scheduledAt: options.scheduledAt,
          sentAt: new Date(),
        },
      });

      this.logger.log(`SMS sent successfully: ${twilioMessage.sid}`);

      return {
        id: smsMessage.id,
        twilioSid: twilioMessage.sid,
        status: twilioMessage.status,
        to,
        from,
      };
    } catch (error) {
      this.logger.error(`Failed to send SMS: ${error.message}`, error.stack);

      // Store failed message in database
      await this.db.smsMessage.create({
        data: {
          tenantId,
          to,
          from,
          body: options.message,
          direction: 'OUTBOUND',
          status: 'FAILED',
          errorMessage: error.message,
          mediaUrls: options.mediaUrls || [],
        },
      });

      throw new BadRequestException(`Failed to send SMS: ${error.message}`);
    }
  }

  /**
   * Send SMS using a template
   */
  async sendTemplatedSms(
    tenantId: string,
    templateId: string,
    to: string,
    variables: Record<string, string> = {},
  ) {
    const template = await this.db.smsMessage.findFirst({
      where: {
        id: templateId,
        tenantId,
      },
    });

    if (!template) {
      throw new BadRequestException('SMS template not found');
    }

    // Replace variables in template
    let message = template.body;
    Object.entries(variables).forEach(([key, value]) => {
      message = message.replace(new RegExp(`{{${key}}}`, 'g'), value);
    });

    return this.sendSms(tenantId, {
      to,
      message,
      from: template.from,
    });
  }

  /**
   * Send bulk SMS (campaigns, notifications)
   */
  async sendBulkSms(tenantId: string, options: SendBulkSmsOptions) {
    if (!this.isAvailable()) {
      throw new BadRequestException('SMS service is not configured');
    }

    const results = {
      total: options.recipients.length,
      sent: 0,
      failed: 0,
      errors: [] as Array<{ phone: string; error: string }>,
    };

    // Get template if provided
    let templateBody: string | undefined;
    if (options.templateId) {
      const template = await this.db.smsMessage.findFirst({
        where: { id: options.templateId, tenantId },
      });
      if (template) {
        templateBody = template.body;
      }
    }

    // Send to each recipient
    for (const recipient of options.recipients) {
      try {
        let message = options.message || templateBody;
        if (!message) {
          throw new Error('No message or template provided');
        }

        // Replace variables if template is used
        if (recipient.variables) {
          Object.entries(recipient.variables).forEach(([key, value]) => {
            message = message.replace(new RegExp(`{{${key}}}`, 'g'), value);
          });
        }

        await this.sendSms(tenantId, {
          to: recipient.phone,
          message,
          from: options.from,
          mediaUrls: options.mediaUrls,
        });

        results.sent++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          phone: recipient.phone,
          error: error.message,
        });
        this.logger.error(
          `Failed to send bulk SMS to ${recipient.phone}: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `Bulk SMS campaign completed: ${results.sent} sent, ${results.failed} failed`,
    );

    return results;
  }

  /**
   * Handle incoming SMS webhook from Twilio
   */
  async handleIncomingSms(data: any) {
    const {
      MessageSid,
      From,
      To,
      Body,
      NumMedia,
      MediaUrl0,
      MediaUrl1,
      MediaUrl2,
      MediaUrl3,
    } = data;

    // Collect media URLs
    const mediaUrls: string[] = [];
    if (NumMedia && parseInt(NumMedia) > 0) {
      [MediaUrl0, MediaUrl1, MediaUrl2, MediaUrl3].forEach((url) => {
        if (url) mediaUrls.push(url);
      });
    }

    this.logger.log(`Received SMS from ${From}: ${Body}`);

    // Find tenant by phone number (the 'To' number)
    // This is a simplified example - you may need more sophisticated tenant resolution
    const tenants = await this.db.tenant.findMany({
      where: {
        settings: {
          path: ['twilioPhoneNumber'],
          equals: To,
        },
      },
    });

    const tenantId = tenants[0]?.id || 'default';

    // Store incoming message
    const smsMessage = await this.db.smsMessage.create({
      data: {
        tenantId,
        from: From,
        to: To,
        body: Body,
        direction: 'INBOUND',
        status: 'RECEIVED',
        twilioSid: MessageSid,
        mediaUrls,
        receivedAt: new Date(),
      },
    });

    // Try to match to a contact
    const contact = await this.db.contact.findFirst({
      where: {
        tenantId,
        phone: From,
      },
    });

    if (contact) {
      // Create a note on the contact
      await this.db.note.create({
        data: {
          tenantId,
          entityType: 'Contact',
          entityId: contact.id,
          content: `SMS received: ${Body}`,
          createdById: null, // System-generated
        },
      });

      // Link SMS to contact
      await this.db.smsMessage.update({
        where: { id: smsMessage.id },
        data: { contactId: contact.id },
      });
    }

    return smsMessage;
  }

  /**
   * Handle SMS status callback from Twilio
   */
  async handleStatusCallback(data: any) {
    const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = data;

    this.logger.log(`SMS status update: ${MessageSid} -> ${MessageStatus}`);

    // Update message status in database
    const updated = await this.db.smsMessage.updateMany({
      where: { twilioSid: MessageSid },
      data: {
        status: MessageStatus.toUpperCase(),
        errorCode: ErrorCode,
        errorMessage: ErrorMessage,
        deliveredAt:
          MessageStatus === 'delivered' ? new Date() : undefined,
      },
    });

    return { updated: updated.count };
  }

  /**
   * Get SMS message history for a contact
   */
  async getContactSmsHistory(tenantId: string, contactId: string) {
    return this.db.smsMessage.findMany({
      where: {
        tenantId,
        contactId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Get SMS message history for a phone number
   */
  async getPhoneSmsHistory(tenantId: string, phone: string) {
    const normalized = this.validatePhoneNumber(phone);

    return this.db.smsMessage.findMany({
      where: {
        tenantId,
        OR: [{ to: normalized }, { from: normalized }],
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Get SMS statistics for tenant
   */
  async getSmsStats(tenantId: string, startDate?: Date, endDate?: Date) {
    const where: any = { tenantId };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [total, sent, delivered, failed, inbound, outbound] =
      await Promise.all([
        this.db.smsMessage.count({ where }),
        this.db.smsMessage.count({
          where: { ...where, status: 'SENT' },
        }),
        this.db.smsMessage.count({
          where: { ...where, status: 'DELIVERED' },
        }),
        this.db.smsMessage.count({
          where: { ...where, status: 'FAILED' },
        }),
        this.db.smsMessage.count({
          where: { ...where, direction: 'INBOUND' },
        }),
        this.db.smsMessage.count({
          where: { ...where, direction: 'OUTBOUND' },
        }),
      ]);

    return {
      total,
      sent,
      delivered,
      failed,
      inbound,
      outbound,
      deliveryRate: sent > 0 ? (delivered / sent) * 100 : 0,
    };
  }

  /**
   * Schedule an SMS for future delivery
   */
  async scheduleSms(
    tenantId: string,
    options: SendSmsOptions & { scheduledAt: Date },
  ) {
    if (!this.isAvailable()) {
      throw new BadRequestException('SMS service is not configured');
    }

    const to = this.validatePhoneNumber(options.to);
    const from = options.from || this.defaultFrom;

    // Store scheduled message
    const smsMessage = await this.db.smsMessage.create({
      data: {
        tenantId,
        to,
        from,
        body: options.message,
        direction: 'OUTBOUND',
        status: 'SCHEDULED',
        mediaUrls: options.mediaUrls || [],
        scheduledAt: options.scheduledAt,
      },
    });

    this.logger.log(
      `SMS scheduled for ${options.scheduledAt.toISOString()}: ${smsMessage.id}`,
    );

    return smsMessage;
  }

  /**
   * Cancel a scheduled SMS
   */
  async cancelScheduledSms(tenantId: string, messageId: string) {
    const message = await this.db.smsMessage.findFirst({
      where: { id: messageId, tenantId, status: 'SCHEDULED' },
    });

    if (!message) {
      throw new BadRequestException('Scheduled message not found');
    }

    // If it has a Twilio SID, try to cancel via Twilio
    if (message.twilioSid && this.isAvailable()) {
      try {
        await this.twilioClient.messages(message.twilioSid).update({
          status: 'canceled',
        });
      } catch (error) {
        this.logger.warn(
          `Could not cancel via Twilio: ${error.message}`,
        );
      }
    }

    // Update in database
    return this.db.smsMessage.update({
      where: { id: messageId },
      data: { status: 'CANCELLED' },
    });
  }
}
