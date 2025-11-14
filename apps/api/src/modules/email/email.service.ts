import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';
import { DatabaseService } from '../database/database.service';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: Array<{
    filename: string;
    content: string; // Base64 encoded
    type?: string;
    disposition?: 'attachment' | 'inline';
  }>;
  templateId?: string;
  templateData?: Record<string, any>;
  trackOpens?: boolean;
  trackClicks?: boolean;
  scheduledAt?: Date;
}

export interface EmailCampaignRecipient {
  contactId: string;
  email: string;
  variables?: Record<string, any>;
}

export interface SendBulkEmailOptions {
  recipients: EmailCampaignRecipient[];
  subject: string;
  html?: string;
  text?: string;
  templateId?: string;
  from?: string;
  replyTo?: string;
  attachments?: SendEmailOptions['attachments'];
  trackOpens?: boolean;
  trackClicks?: boolean;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly defaultFrom: string;
  private readonly defaultFromName: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {
    const apiKey = this.config.get('SENDGRID_API_KEY');
    this.defaultFrom = this.config.get('SENDGRID_FROM_EMAIL') || 'noreply@example.com';
    this.defaultFromName = this.config.get('SENDGRID_FROM_NAME') || 'Roofing CRM';

    if (apiKey) {
      sgMail.setApiKey(apiKey);
      this.logger.log('SendGrid email service initialized');
    } else {
      this.logger.warn('SendGrid API key not configured - email service disabled');
    }
  }

  /**
   * Check if SendGrid is configured and available
   */
  isAvailable(): boolean {
    return !!this.config.get('SENDGRID_API_KEY');
  }

  /**
   * Validate email address format
   */
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Format email with name
   */
  private formatEmail(email: string, name?: string): string {
    if (name) {
      return `${name} <${email}>`;
    }
    return email;
  }

  /**
   * Send a single email
   */
  async sendEmail(tenantId: string, options: SendEmailOptions, userId?: string) {
    if (!this.isAvailable()) {
      throw new BadRequestException('Email service is not configured');
    }

    const to = Array.isArray(options.to) ? options.to : [options.to];
    const from = options.from || this.formatEmail(this.defaultFrom, this.defaultFromName);

    // Validate recipients
    to.forEach((email) => {
      if (!this.validateEmail(email)) {
        throw new BadRequestException(`Invalid email address: ${email}`);
      }
    });

    this.logger.log(`Sending email to ${to.join(', ')}`);

    try {
      const msg: any = {
        to,
        from,
        subject: options.subject,
        html: options.html,
        text: options.text,
        replyTo: options.replyTo,
        cc: options.cc,
        bcc: options.bcc,
        attachments: options.attachments,
        trackingSettings: {
          clickTracking: {
            enable: options.trackClicks !== false,
          },
          openTracking: {
            enable: options.trackOpens !== false,
          },
        },
      };

      // Use SendGrid template if provided
      if (options.templateId) {
        msg.templateId = options.templateId;
        msg.dynamicTemplateData = options.templateData || {};
      }

      // Schedule email if requested
      if (options.scheduledAt) {
        msg.sendAt = Math.floor(options.scheduledAt.getTime() / 1000);
      }

      // Send via SendGrid
      const response = await sgMail.send(msg);

      // Store in database
      const emailLog = await this.db.emailLog.create({
        data: {
          tenantId,
          to: to.join(','),
          from,
          subject: options.subject,
          html: options.html,
          text: options.text,
          status: 'SENT',
          sendgridId: response[0].headers['x-message-id'],
          sentById: userId,
          scheduledAt: options.scheduledAt,
          sentAt: new Date(),
          trackOpens: options.trackOpens !== false,
          trackClicks: options.trackClicks !== false,
        },
      });

      this.logger.log(`Email sent successfully: ${emailLog.id}`);

      return {
        id: emailLog.id,
        sendgridId: response[0].headers['x-message-id'],
        status: 'sent',
        to,
      };
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`, error.stack);

      // Store failed email in database
      await this.db.emailLog.create({
        data: {
          tenantId,
          to: to.join(','),
          from,
          subject: options.subject,
          html: options.html,
          text: options.text,
          status: 'FAILED',
          errorMessage: error.message,
          sentById: userId,
        },
      });

      throw new BadRequestException(`Failed to send email: ${error.message}`);
    }
  }

  /**
   * Send email using a template
   */
  async sendTemplatedEmail(
    tenantId: string,
    templateId: string,
    to: string,
    variables: Record<string, any> = {},
    userId?: string,
  ) {
    const template = await this.getTemplate(tenantId, templateId);

    if (!template) {
      throw new BadRequestException('Email template not found');
    }

    // Replace variables in template
    let html = template.html || '';
    let text = template.text || '';
    let subject = template.subject || '';

    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      html = html.replace(regex, String(value));
      text = text.replace(regex, String(value));
      subject = subject.replace(regex, String(value));
    });

    return this.sendEmail(
      tenantId,
      {
        to,
        subject,
        html,
        text,
        from: template.from,
        replyTo: template.replyTo,
      },
      userId,
    );
  }

  /**
   * Send bulk emails (campaigns)
   */
  async sendBulkEmail(tenantId: string, options: SendBulkEmailOptions, userId?: string) {
    if (!this.isAvailable()) {
      throw new BadRequestException('Email service is not configured');
    }

    const results = {
      total: options.recipients.length,
      sent: 0,
      failed: 0,
      errors: [] as Array<{ email: string; error: string }>,
    };

    // Get template if provided
    let template: any = null;
    if (options.templateId) {
      template = await this.getTemplate(tenantId, options.templateId);
    }

    // Send to each recipient
    for (const recipient of options.recipients) {
      try {
        let html = options.html || template?.html || '';
        let text = options.text || template?.text || '';
        let subject = options.subject || template?.subject || '';

        // Replace variables if provided
        if (recipient.variables) {
          Object.entries(recipient.variables).forEach(([key, value]) => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            html = html.replace(regex, String(value));
            text = text.replace(regex, String(value));
            subject = subject.replace(regex, String(value));
          });
        }

        await this.sendEmail(
          tenantId,
          {
            to: recipient.email,
            subject,
            html,
            text,
            from: options.from,
            replyTo: options.replyTo,
            attachments: options.attachments,
            trackOpens: options.trackOpens,
            trackClicks: options.trackClicks,
          },
          userId,
        );

        results.sent++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          email: recipient.email,
          error: error.message,
        });
        this.logger.error(
          `Failed to send bulk email to ${recipient.email}: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `Bulk email campaign completed: ${results.sent} sent, ${results.failed} failed`,
    );

    return results;
  }

  /**
   * Handle SendGrid webhook events
   */
  async handleWebhook(events: any[]) {
    for (const event of events) {
      const { email, event: eventType, sg_message_id, timestamp } = event;

      this.logger.log(`Email event: ${eventType} for ${email}`);

      // Find email log by SendGrid ID
      const emailLog = await this.db.emailLog.findFirst({
        where: { sendgridId: sg_message_id },
      });

      if (!emailLog) {
        this.logger.warn(`Email log not found for SendGrid ID: ${sg_message_id}`);
        continue;
      }

      // Update status based on event type
      const updates: any = {};

      switch (eventType) {
        case 'delivered':
          updates.status = 'DELIVERED';
          updates.deliveredAt = new Date(timestamp * 1000);
          break;

        case 'open':
          updates.openedAt = new Date(timestamp * 1000);
          updates.opens = (emailLog.opens || 0) + 1;
          break;

        case 'click':
          updates.clickedAt = new Date(timestamp * 1000);
          updates.clicks = (emailLog.clicks || 0) + 1;
          break;

        case 'bounce':
          updates.status = 'BOUNCED';
          updates.bouncedAt = new Date(timestamp * 1000);
          updates.bounceReason = event.reason;
          break;

        case 'dropped':
          updates.status = 'DROPPED';
          updates.errorMessage = event.reason;
          break;

        case 'spamreport':
          updates.status = 'SPAM';
          updates.spamReportedAt = new Date(timestamp * 1000);
          break;

        case 'unsubscribe':
          updates.unsubscribedAt = new Date(timestamp * 1000);
          break;
      }

      if (Object.keys(updates).length > 0) {
        await this.db.emailLog.update({
          where: { id: emailLog.id },
          data: updates,
        });
      }
    }

    return { processed: events.length };
  }

  /**
   * Get email statistics for tenant
   */
  async getEmailStats(tenantId: string, startDate?: Date, endDate?: Date) {
    const where: any = { tenantId };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [total, sent, delivered, opened, clicked, bounced, failed] =
      await Promise.all([
        this.db.emailLog.count({ where }),
        this.db.emailLog.count({ where: { ...where, status: 'SENT' } }),
        this.db.emailLog.count({ where: { ...where, status: 'DELIVERED' } }),
        this.db.emailLog.count({ where: { ...where, openedAt: { not: null } } }),
        this.db.emailLog.count({ where: { ...where, clickedAt: { not: null } } }),
        this.db.emailLog.count({ where: { ...where, status: 'BOUNCED' } }),
        this.db.emailLog.count({ where: { ...where, status: 'FAILED' } }),
      ]);

    const totalOpens = await this.db.emailLog.aggregate({
      where,
      _sum: { opens: true },
    });

    const totalClicks = await this.db.emailLog.aggregate({
      where,
      _sum: { clicks: true },
    });

    return {
      total,
      sent,
      delivered,
      opened,
      clicked,
      bounced,
      failed,
      totalOpens: totalOpens._sum.opens || 0,
      totalClicks: totalClicks._sum.clicks || 0,
      deliveryRate: sent > 0 ? (delivered / sent) * 100 : 0,
      openRate: delivered > 0 ? (opened / delivered) * 100 : 0,
      clickRate: opened > 0 ? (clicked / opened) * 100 : 0,
      bounceRate: sent > 0 ? (bounced / sent) * 100 : 0,
    };
  }

  /**
   * Get email history for a contact
   */
  async getContactEmailHistory(tenantId: string, contactId: string) {
    const contact = await this.db.contact.findUnique({
      where: { id: contactId },
    });

    if (!contact || !contact.email) {
      return [];
    }

    return this.db.emailLog.findMany({
      where: {
        tenantId,
        to: { contains: contact.email },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get email history for an email address
   */
  async getEmailHistory(tenantId: string, email: string) {
    return this.db.emailLog.findMany({
      where: {
        tenantId,
        to: { contains: email },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a template by ID
   */
  private async getTemplate(tenantId: string, templateId: string) {
    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
    });

    const templates = (tenant?.settings as any)?.emailTemplates || [];
    return templates.find((t: any) => t.id === templateId);
  }

  /**
   * Schedule an email for future delivery
   */
  async scheduleEmail(
    tenantId: string,
    options: SendEmailOptions & { scheduledAt: Date },
    userId?: string,
  ) {
    if (!this.isAvailable()) {
      throw new BadRequestException('Email service is not configured');
    }

    const to = Array.isArray(options.to) ? options.to : [options.to];

    // Store scheduled email
    const emailLog = await this.db.emailLog.create({
      data: {
        tenantId,
        to: to.join(','),
        from: options.from || this.formatEmail(this.defaultFrom, this.defaultFromName),
        subject: options.subject,
        html: options.html,
        text: options.text,
        status: 'SCHEDULED',
        scheduledAt: options.scheduledAt,
        sentById: userId,
        trackOpens: options.trackOpens !== false,
        trackClicks: options.trackClicks !== false,
      },
    });

    this.logger.log(
      `Email scheduled for ${options.scheduledAt.toISOString()}: ${emailLog.id}`,
    );

    return emailLog;
  }

  /**
   * Cancel a scheduled email
   */
  async cancelScheduledEmail(tenantId: string, emailId: string) {
    const email = await this.db.emailLog.findFirst({
      where: { id: emailId, tenantId, status: 'SCHEDULED' },
    });

    if (!email) {
      throw new BadRequestException('Scheduled email not found');
    }

    // Update status to cancelled
    return this.db.emailLog.update({
      where: { id: emailId },
      data: { status: 'CANCELLED' },
    });
  }

  /**
   * Mark email address as unsubscribed
   */
  async unsubscribe(tenantId: string, email: string) {
    // This would integrate with your contact management
    // For now, we'll just log it
    this.logger.log(`Unsubscribe request for ${email} in tenant ${tenantId}`);

    // Update all contacts with this email
    await this.db.contact.updateMany({
      where: { tenantId, email },
      data: {
        emailOptOut: true,
      },
    });

    return { unsubscribed: true, email };
  }

  /**
   * Check if email address is unsubscribed
   */
  async isUnsubscribed(tenantId: string, email: string): Promise<boolean> {
    const contact = await this.db.contact.findFirst({
      where: { tenantId, email },
    });

    return contact?.emailOptOut || false;
  }
}
