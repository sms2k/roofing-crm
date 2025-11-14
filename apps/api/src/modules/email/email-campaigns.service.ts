import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { EmailService, EmailCampaignRecipient } from './email.service';

export interface CreateEmailCampaignDto {
  name: string;
  subject: string;
  templateId?: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  scheduledAt?: Date;
  recipientFilters?: {
    leadSource?: string[];
    leadStatus?: string[];
    jobStatus?: string[];
    tags?: string[];
    zipCodes?: string[];
    emailOptOut?: boolean;
    customQuery?: any;
  };
  recipientIds?: string[]; // Explicit contact IDs
  trackOpens?: boolean;
  trackClicks?: boolean;
}

export interface EmailCampaign {
  id: string;
  tenantId: string;
  name: string;
  subject: string;
  templateId?: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  status: 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'COMPLETED' | 'CANCELLED';
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  totalRecipients: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
  recipientFilters?: any;
  trackOpens: boolean;
  trackClicks: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class EmailCampaignsService {
  private readonly logger = new Logger(EmailCampaignsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Create a new email campaign
   */
  async create(tenantId: string, data: CreateEmailCampaignDto): Promise<EmailCampaign> {
    if (!data.templateId && !data.html) {
      throw new BadRequestException('Either templateId or html content is required');
    }

    if (!data.recipientFilters && !data.recipientIds) {
      throw new BadRequestException('Recipients must be specified');
    }

    // Get recipient count
    const recipients = await this.getRecipients(tenantId, data);

    const campaign: EmailCampaign = {
      id: `camp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tenantId,
      name: data.name,
      subject: data.subject,
      templateId: data.templateId,
      html: data.html,
      text: data.text,
      from: data.from,
      replyTo: data.replyTo,
      status: data.scheduledAt ? 'SCHEDULED' : 'DRAFT',
      scheduledAt: data.scheduledAt,
      totalRecipients: recipients.length,
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      failed: 0,
      recipientFilters: data.recipientFilters,
      trackOpens: data.trackOpens !== false,
      trackClicks: data.trackClicks !== false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Store campaign in tenant settings
    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
    });

    const campaigns = (tenant?.settings as any)?.emailCampaigns || [];
    campaigns.push(campaign);

    await this.db.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...(tenant?.settings as any),
          emailCampaigns: campaigns,
        },
      },
    });

    this.logger.log(
      `Created email campaign: ${campaign.name} (${campaign.id}) with ${recipients.length} recipients`,
    );

    return campaign;
  }

  /**
   * Get recipients based on filters
   */
  private async getRecipients(
    tenantId: string,
    data: CreateEmailCampaignDto,
  ): Promise<EmailCampaignRecipient[]> {
    const recipients: EmailCampaignRecipient[] = [];

    // If explicit IDs provided
    if (data.recipientIds && data.recipientIds.length > 0) {
      const contacts = await this.db.contact.findMany({
        where: {
          tenantId,
          id: { in: data.recipientIds },
          email: { not: null },
          emailOptOut: false,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
        },
      });

      return contacts.map((c) => ({
        contactId: c.id,
        email: c.email!,
        variables: {
          firstName: c.firstName || '',
          lastName: c.lastName || '',
          phone: c.phone || '',
        },
      }));
    }

    // If filters provided
    if (data.recipientFilters) {
      const filters = data.recipientFilters;
      const where: any = {
        tenantId,
        email: { not: null },
        emailOptOut: filters.emailOptOut !== undefined ? filters.emailOptOut : false,
      };

      // Build query based on filters
      if (filters.tags && filters.tags.length > 0) {
        where.tags = { hasSome: filters.tags };
      }

      if (filters.zipCodes && filters.zipCodes.length > 0) {
        where.zip = { in: filters.zipCodes };
      }

      // Get contacts matching filters
      let contacts = await this.db.contact.findMany({
        where,
        include: {
          leads: true,
          jobs: true,
        },
      });

      // Filter by lead source
      if (filters.leadSource && filters.leadSource.length > 0) {
        contacts = contacts.filter((c) =>
          c.leads.some((l) => filters.leadSource!.includes(l.source)),
        );
      }

      // Filter by lead status
      if (filters.leadStatus && filters.leadStatus.length > 0) {
        contacts = contacts.filter((c) =>
          c.leads.some((l) => filters.leadStatus!.includes(l.status)),
        );
      }

      // Filter by job status
      if (filters.jobStatus && filters.jobStatus.length > 0) {
        contacts = contacts.filter((c) =>
          c.jobs.some((j) => filters.jobStatus!.includes(j.status)),
        );
      }

      return contacts.map((c) => ({
        contactId: c.id,
        email: c.email!,
        variables: {
          firstName: c.firstName || '',
          lastName: c.lastName || '',
          phone: c.phone || '',
        },
      }));
    }

    return recipients;
  }

  /**
   * Get all campaigns for a tenant
   */
  async findAll(
    tenantId: string,
    options?: { status?: string },
  ): Promise<EmailCampaign[]> {
    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
    });

    let campaigns = (tenant?.settings as any)?.emailCampaigns || [];

    if (options?.status) {
      campaigns = campaigns.filter((c: EmailCampaign) => c.status === options.status);
    }

    return campaigns.sort(
      (a: EmailCampaign, b: EmailCampaign) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  /**
   * Get a single campaign
   */
  async findOne(tenantId: string, campaignId: string): Promise<EmailCampaign> {
    const campaigns = await this.findAll(tenantId);
    const campaign = campaigns.find((c) => c.id === campaignId);

    if (!campaign) {
      throw new BadRequestException('Campaign not found');
    }

    return campaign;
  }

  /**
   * Update campaign
   */
  async update(
    tenantId: string,
    campaignId: string,
    data: Partial<CreateEmailCampaignDto>,
  ): Promise<EmailCampaign> {
    const campaign = await this.findOne(tenantId, campaignId);

    // Can't update campaigns that are sending or completed
    if (['SENDING', 'COMPLETED'].includes(campaign.status)) {
      throw new BadRequestException(
        `Cannot update campaign with status ${campaign.status}`,
      );
    }

    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
    });

    const campaigns = (tenant?.settings as any)?.emailCampaigns || [];
    const index = campaigns.findIndex((c: EmailCampaign) => c.id === campaignId);

    if (index === -1) {
      throw new BadRequestException('Campaign not found');
    }

    // Update campaign
    campaigns[index] = {
      ...campaigns[index],
      ...data,
      updatedAt: new Date(),
    };

    // Recalculate recipients if filters changed
    if (data.recipientFilters || data.recipientIds) {
      const recipients = await this.getRecipients(tenantId, {
        ...campaign,
        ...data,
      } as CreateEmailCampaignDto);
      campaigns[index].totalRecipients = recipients.length;
    }

    await this.db.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...(tenant?.settings as any),
          emailCampaigns: campaigns,
        },
      },
    });

    return campaigns[index];
  }

  /**
   * Execute/send a campaign
   */
  async execute(tenantId: string, campaignId: string, userId?: string) {
    const campaign = await this.findOne(tenantId, campaignId);

    if (campaign.status === 'SENDING') {
      throw new BadRequestException('Campaign is already sending');
    }

    if (campaign.status === 'COMPLETED') {
      throw new BadRequestException('Campaign has already been sent');
    }

    // Update status to SENDING
    await this.updateStatus(tenantId, campaignId, 'SENDING', {
      startedAt: new Date(),
    });

    this.logger.log(`Executing email campaign: ${campaign.name} (${campaignId})`);

    // Get recipients
    const recipients = await this.getRecipients(tenantId, {
      recipientFilters: campaign.recipientFilters,
      recipientIds: campaign.recipientFilters ? undefined : [], // Would need to store IDs
    } as CreateEmailCampaignDto);

    // Send bulk emails
    const results = await this.emailService.sendBulkEmail(
      tenantId,
      {
        recipients,
        subject: campaign.subject,
        templateId: campaign.templateId,
        html: campaign.html,
        text: campaign.text,
        from: campaign.from,
        replyTo: campaign.replyTo,
        trackOpens: campaign.trackOpens,
        trackClicks: campaign.trackClicks,
      },
      userId,
    );

    // Update campaign with results
    await this.updateStatus(tenantId, campaignId, 'COMPLETED', {
      completedAt: new Date(),
      sent: results.sent,
      failed: results.failed,
    });

    this.logger.log(
      `Campaign ${campaignId} completed: ${results.sent} sent, ${results.failed} failed`,
    );

    return {
      campaignId,
      results,
    };
  }

  /**
   * Update campaign status
   */
  private async updateStatus(
    tenantId: string,
    campaignId: string,
    status: EmailCampaign['status'],
    updates: Partial<EmailCampaign> = {},
  ) {
    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
    });

    const campaigns = (tenant?.settings as any)?.emailCampaigns || [];
    const index = campaigns.findIndex((c: EmailCampaign) => c.id === campaignId);

    if (index !== -1) {
      campaigns[index] = {
        ...campaigns[index],
        status,
        ...updates,
        updatedAt: new Date(),
      };

      await this.db.tenant.update({
        where: { id: tenantId },
        data: {
          settings: {
            ...(tenant?.settings as any),
            emailCampaigns: campaigns,
          },
        },
      });
    }
  }

  /**
   * Cancel a campaign
   */
  async cancel(tenantId: string, campaignId: string) {
    const campaign = await this.findOne(tenantId, campaignId);

    if (campaign.status === 'COMPLETED') {
      throw new BadRequestException('Cannot cancel completed campaign');
    }

    if (campaign.status === 'SENDING') {
      throw new BadRequestException(
        'Cannot cancel campaign that is currently sending',
      );
    }

    await this.updateStatus(tenantId, campaignId, 'CANCELLED');

    this.logger.log(`Cancelled campaign: ${campaignId}`);

    return { cancelled: true };
  }

  /**
   * Delete a campaign
   */
  async delete(tenantId: string, campaignId: string) {
    const campaign = await this.findOne(tenantId, campaignId);

    if (campaign.status === 'SENDING') {
      throw new BadRequestException(
        'Cannot delete campaign that is currently sending',
      );
    }

    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
    });

    let campaigns = (tenant?.settings as any)?.emailCampaigns || [];
    campaigns = campaigns.filter((c: EmailCampaign) => c.id !== campaignId);

    await this.db.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...(tenant?.settings as any),
          emailCampaigns: campaigns,
        },
      },
    });

    this.logger.log(`Deleted campaign: ${campaignId}`);

    return { deleted: true };
  }

  /**
   * Get campaign statistics
   */
  async getStats(tenantId: string, campaignId: string) {
    const campaign = await this.findOne(tenantId, campaignId);

    const deliveryRate =
      campaign.sent > 0 ? (campaign.delivered / campaign.sent) * 100 : 0;
    const openRate =
      campaign.delivered > 0 ? (campaign.opened / campaign.delivered) * 100 : 0;
    const clickRate =
      campaign.opened > 0 ? (campaign.clicked / campaign.opened) * 100 : 0;
    const bounceRate =
      campaign.sent > 0 ? (campaign.bounced / campaign.sent) * 100 : 0;
    const failureRate =
      campaign.sent > 0 ? (campaign.failed / campaign.sent) * 100 : 0;

    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      totalRecipients: campaign.totalRecipients,
      sent: campaign.sent,
      delivered: campaign.delivered,
      opened: campaign.opened,
      clicked: campaign.clicked,
      bounced: campaign.bounced,
      failed: campaign.failed,
      deliveryRate: Math.round(deliveryRate * 100) / 100,
      openRate: Math.round(openRate * 100) / 100,
      clickRate: Math.round(clickRate * 100) / 100,
      clickThroughRate:
        campaign.delivered > 0
          ? Math.round((campaign.clicked / campaign.delivered) * 10000) / 100
          : 0,
      bounceRate: Math.round(bounceRate * 100) / 100,
      failureRate: Math.round(failureRate * 100) / 100,
      startedAt: campaign.startedAt,
      completedAt: campaign.completedAt,
      duration:
        campaign.startedAt && campaign.completedAt
          ? new Date(campaign.completedAt).getTime() -
            new Date(campaign.startedAt).getTime()
          : null,
    };
  }

  /**
   * Update campaign stats from email logs
   */
  async updateStatsFromLogs(tenantId: string, campaignId: string) {
    const campaign = await this.findOne(tenantId, campaignId);

    // Get all email logs for this campaign
    // This would require storing campaignId in email logs
    // For now, this is a placeholder

    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
    });

    const campaigns = (tenant?.settings as any)?.emailCampaigns || [];
    const index = campaigns.findIndex((c: EmailCampaign) => c.id === campaignId);

    if (index !== -1) {
      // Update stats
      // campaigns[index].delivered = ...
      // campaigns[index].opened = ...
      // campaigns[index].clicked = ...
      // campaigns[index].bounced = ...

      await this.db.tenant.update({
        where: { id: tenantId },
        data: {
          settings: {
            ...(tenant?.settings as any),
            emailCampaigns: campaigns,
          },
        },
      });
    }
  }

  /**
   * Duplicate a campaign
   */
  async duplicate(tenantId: string, campaignId: string, newName?: string) {
    const campaign = await this.findOne(tenantId, campaignId);

    return this.create(tenantId, {
      name: newName || `${campaign.name} (Copy)`,
      subject: campaign.subject,
      templateId: campaign.templateId,
      html: campaign.html,
      text: campaign.text,
      from: campaign.from,
      replyTo: campaign.replyTo,
      recipientFilters: campaign.recipientFilters,
      trackOpens: campaign.trackOpens,
      trackClicks: campaign.trackClicks,
    });
  }

  /**
   * Preview campaign recipients
   */
  async previewRecipients(
    tenantId: string,
    data: CreateEmailCampaignDto,
    limit = 10,
  ) {
    const recipients = await this.getRecipients(tenantId, data);

    return {
      total: recipients.length,
      sample: recipients.slice(0, limit),
    };
  }

  /**
   * Send test email
   */
  async sendTest(
    tenantId: string,
    campaignId: string,
    testEmail: string,
    userId?: string,
  ) {
    const campaign = await this.findOne(tenantId, campaignId);

    return this.emailService.sendEmail(
      tenantId,
      {
        to: testEmail,
        subject: `[TEST] ${campaign.subject}`,
        html: campaign.html,
        text: campaign.text,
        from: campaign.from,
        replyTo: campaign.replyTo,
      },
      userId,
    );
  }
}
