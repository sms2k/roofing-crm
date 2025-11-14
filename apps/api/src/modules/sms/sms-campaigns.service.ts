import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SmsService, SmsCampaignRecipient } from './sms.service';

export interface CreateSmsCampaignDto {
  name: string;
  templateId?: string;
  message?: string;
  scheduledAt?: Date;
  recipientFilters?: {
    leadSource?: string[];
    leadStatus?: string[];
    jobStatus?: string[];
    tags?: string[];
    zipCodes?: string[];
    customQuery?: any;
  };
  recipientIds?: string[]; // Explicit contact IDs
}

export interface SmsCampaign {
  id: string;
  tenantId: string;
  name: string;
  templateId?: string;
  message?: string;
  status: 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'COMPLETED' | 'CANCELLED';
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  totalRecipients: number;
  sent: number;
  delivered: number;
  failed: number;
  recipientFilters?: any;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class SmsCampaignsService {
  private readonly logger = new Logger(SmsCampaignsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly smsService: SmsService,
  ) {}

  /**
   * Create a new SMS campaign
   */
  async create(tenantId: string, data: CreateSmsCampaignDto): Promise<SmsCampaign> {
    if (!data.templateId && !data.message) {
      throw new BadRequestException('Either templateId or message is required');
    }

    if (!data.recipientFilters && !data.recipientIds) {
      throw new BadRequestException('Recipients must be specified');
    }

    // Get recipient count
    const recipients = await this.getRecipients(tenantId, data);

    const campaign: SmsCampaign = {
      id: `camp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tenantId,
      name: data.name,
      templateId: data.templateId,
      message: data.message,
      status: data.scheduledAt ? 'SCHEDULED' : 'DRAFT',
      scheduledAt: data.scheduledAt,
      totalRecipients: recipients.length,
      sent: 0,
      delivered: 0,
      failed: 0,
      recipientFilters: data.recipientFilters,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Store campaign in tenant settings
    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
    });

    const campaigns = (tenant?.settings as any)?.smsCampaigns || [];
    campaigns.push(campaign);

    await this.db.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...(tenant?.settings as any),
          smsCampaigns: campaigns,
        },
      },
    });

    this.logger.log(
      `Created SMS campaign: ${campaign.name} (${campaign.id}) with ${recipients.length} recipients`,
    );

    return campaign;
  }

  /**
   * Get recipients based on filters
   */
  private async getRecipients(
    tenantId: string,
    data: CreateSmsCampaignDto,
  ): Promise<SmsCampaignRecipient[]> {
    const recipients: SmsCampaignRecipient[] = [];

    // If explicit IDs provided
    if (data.recipientIds && data.recipientIds.length > 0) {
      const contacts = await this.db.contact.findMany({
        where: {
          tenantId,
          id: { in: data.recipientIds },
          phone: { not: null },
        },
        select: {
          id: true,
          phone: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      });

      return contacts.map((c) => ({
        contactId: c.id,
        phone: c.phone!,
        variables: {
          firstName: c.firstName || '',
          lastName: c.lastName || '',
          email: c.email || '',
        },
      }));
    }

    // If filters provided
    if (data.recipientFilters) {
      const filters = data.recipientFilters;
      const where: any = { tenantId, phone: { not: null } };

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
        phone: c.phone!,
        variables: {
          firstName: c.firstName || '',
          lastName: c.lastName || '',
          email: c.email || '',
        },
      }));
    }

    return recipients;
  }

  /**
   * Get all campaigns for a tenant
   */
  async findAll(tenantId: string, options?: { status?: string }): Promise<SmsCampaign[]> {
    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
    });

    let campaigns = (tenant?.settings as any)?.smsCampaigns || [];

    if (options?.status) {
      campaigns = campaigns.filter((c: SmsCampaign) => c.status === options.status);
    }

    return campaigns.sort(
      (a: SmsCampaign, b: SmsCampaign) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  /**
   * Get a single campaign
   */
  async findOne(tenantId: string, campaignId: string): Promise<SmsCampaign> {
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
    data: Partial<CreateSmsCampaignDto>,
  ): Promise<SmsCampaign> {
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

    const campaigns = (tenant?.settings as any)?.smsCampaigns || [];
    const index = campaigns.findIndex((c: SmsCampaign) => c.id === campaignId);

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
      } as CreateSmsCampaignDto);
      campaigns[index].totalRecipients = recipients.length;
    }

    await this.db.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...(tenant?.settings as any),
          smsCampaigns: campaigns,
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

    this.logger.log(`Executing SMS campaign: ${campaign.name} (${campaignId})`);

    // Get recipients
    const recipients = await this.getRecipients(tenantId, {
      recipientFilters: campaign.recipientFilters,
      recipientIds: campaign.recipientFilters ? undefined : [], // Would need to store IDs
    } as CreateSmsCampaignDto);

    // Send bulk SMS
    const results = await this.smsService.sendBulkSms(tenantId, {
      recipients,
      templateId: campaign.templateId,
      message: campaign.message,
    });

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
    status: SmsCampaign['status'],
    updates: Partial<SmsCampaign> = {},
  ) {
    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
    });

    const campaigns = (tenant?.settings as any)?.smsCampaigns || [];
    const index = campaigns.findIndex((c: SmsCampaign) => c.id === campaignId);

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
            smsCampaigns: campaigns,
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
      throw new BadRequestException('Cannot cancel campaign that is currently sending');
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
      throw new BadRequestException('Cannot delete campaign that is currently sending');
    }

    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
    });

    let campaigns = (tenant?.settings as any)?.smsCampaigns || [];
    campaigns = campaigns.filter((c: SmsCampaign) => c.id !== campaignId);

    await this.db.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...(tenant?.settings as any),
          smsCampaigns: campaigns,
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
    const failureRate =
      campaign.sent > 0 ? (campaign.failed / campaign.sent) * 100 : 0;

    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      totalRecipients: campaign.totalRecipients,
      sent: campaign.sent,
      delivered: campaign.delivered,
      failed: campaign.failed,
      deliveryRate: Math.round(deliveryRate * 100) / 100,
      failureRate: Math.round(failureRate * 100) / 100,
      startedAt: campaign.startedAt,
      completedAt: campaign.completedAt,
      duration: campaign.startedAt && campaign.completedAt
        ? new Date(campaign.completedAt).getTime() -
          new Date(campaign.startedAt).getTime()
        : null,
    };
  }

  /**
   * Duplicate a campaign
   */
  async duplicate(tenantId: string, campaignId: string, newName?: string) {
    const campaign = await this.findOne(tenantId, campaignId);

    return this.create(tenantId, {
      name: newName || `${campaign.name} (Copy)`,
      templateId: campaign.templateId,
      message: campaign.message,
      recipientFilters: campaign.recipientFilters,
    });
  }

  /**
   * Preview campaign recipients
   */
  async previewRecipients(
    tenantId: string,
    data: CreateSmsCampaignDto,
    limit = 10,
  ) {
    const recipients = await this.getRecipients(tenantId, data);

    return {
      total: recipients.length,
      sample: recipients.slice(0, limit),
    };
  }
}
