import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { SmsService } from './sms.service';
import { SmsTemplatesService } from './sms-templates.service';
import { SmsCampaignsService } from './sms-campaigns.service';

@Controller('sms')
export class SmsController {
  constructor(
    private readonly smsService: SmsService,
    private readonly templatesService: SmsTemplatesService,
    private readonly campaignsService: SmsCampaignsService,
  ) {}

  // ===========================
  // SMS Sending Endpoints
  // ===========================

  @Post('send')
  async sendSms(
    @Req() req: any,
    @Body()
    body: {
      to: string;
      message: string;
      from?: string;
      mediaUrls?: string[];
    },
  ) {
    const tenantId = req.tenantId || 'default';
    return this.smsService.sendSms(tenantId, body);
  }

  @Post('send-templated')
  async sendTemplatedSms(
    @Req() req: any,
    @Body()
    body: {
      to: string;
      templateId: string;
      variables?: Record<string, string>;
    },
  ) {
    const tenantId = req.tenantId || 'default';
    return this.smsService.sendTemplatedSms(
      tenantId,
      body.templateId,
      body.to,
      body.variables,
    );
  }

  @Post('send-bulk')
  async sendBulkSms(
    @Req() req: any,
    @Body()
    body: {
      recipients: Array<{
        contactId: string;
        phone: string;
        variables?: Record<string, string>;
      }>;
      templateId?: string;
      message?: string;
      from?: string;
      mediaUrls?: string[];
    },
  ) {
    const tenantId = req.tenantId || 'default';
    return this.smsService.sendBulkSms(tenantId, body);
  }

  @Post('schedule')
  async scheduleSms(
    @Req() req: any,
    @Body()
    body: {
      to: string;
      message: string;
      scheduledAt: string;
      from?: string;
      mediaUrls?: string[];
    },
  ) {
    const tenantId = req.tenantId || 'default';
    return this.smsService.scheduleSms(tenantId, {
      ...body,
      scheduledAt: new Date(body.scheduledAt),
    });
  }

  @Delete('scheduled/:messageId')
  async cancelScheduledSms(@Req() req: any, @Param('messageId') messageId: string) {
    const tenantId = req.tenantId || 'default';
    return this.smsService.cancelScheduledSms(tenantId, messageId);
  }

  // ===========================
  // SMS History & Stats
  // ===========================

  @Get('history/contact/:contactId')
  async getContactHistory(@Req() req: any, @Param('contactId') contactId: string) {
    const tenantId = req.tenantId || 'default';
    return this.smsService.getContactSmsHistory(tenantId, contactId);
  }

  @Get('history/phone/:phone')
  async getPhoneHistory(@Req() req: any, @Param('phone') phone: string) {
    const tenantId = req.tenantId || 'default';
    return this.smsService.getPhoneSmsHistory(tenantId, phone);
  }

  @Get('stats')
  async getStats(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const tenantId = req.tenantId || 'default';
    return this.smsService.getSmsStats(
      tenantId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('status')
  async getStatus() {
    return {
      available: this.smsService.isAvailable(),
      provider: 'twilio',
    };
  }

  // ===========================
  // Webhooks
  // ===========================

  @Post('webhooks/incoming')
  @HttpCode(HttpStatus.OK)
  async handleIncoming(@Body() body: any) {
    await this.smsService.handleIncomingSms(body);
    return { status: 'ok' };
  }

  @Post('webhooks/status')
  @HttpCode(HttpStatus.OK)
  async handleStatus(@Body() body: any) {
    await this.smsService.handleStatusCallback(body);
    return { status: 'ok' };
  }

  // ===========================
  // Templates Endpoints
  // ===========================

  @Post('templates')
  async createTemplate(
    @Req() req: any,
    @Body()
    body: {
      name: string;
      body: string;
      category?: string;
      variables?: string[];
      isActive?: boolean;
    },
  ) {
    const tenantId = req.tenantId || 'default';
    return this.templatesService.create(tenantId, body);
  }

  @Get('templates')
  async getTemplates(
    @Req() req: any,
    @Query('category') category?: string,
    @Query('isActive') isActive?: string,
  ) {
    const tenantId = req.tenantId || 'default';
    return this.templatesService.findAll(tenantId, {
      category,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });
  }

  @Get('templates/predefined')
  async getPredefinedTemplates() {
    return this.templatesService.getPredefinedTemplates();
  }

  @Post('templates/install-predefined')
  async installPredefinedTemplates(@Req() req: any) {
    const tenantId = req.tenantId || 'default';
    return this.templatesService.installPredefinedTemplates(tenantId);
  }

  @Get('templates/categories')
  async getTemplateCategories(@Req() req: any) {
    const tenantId = req.tenantId || 'default';
    return this.templatesService.getCategories(tenantId);
  }

  @Get('templates/:templateId')
  async getTemplate(@Req() req: any, @Param('templateId') templateId: string) {
    const tenantId = req.tenantId || 'default';
    return this.templatesService.findOne(tenantId, templateId);
  }

  @Put('templates/:templateId')
  async updateTemplate(
    @Req() req: any,
    @Param('templateId') templateId: string,
    @Body()
    body: {
      name?: string;
      body?: string;
      category?: string;
      variables?: string[];
      isActive?: boolean;
    },
  ) {
    const tenantId = req.tenantId || 'default';
    return this.templatesService.update(tenantId, templateId, body);
  }

  @Delete('templates/:templateId')
  async deleteTemplate(@Req() req: any, @Param('templateId') templateId: string) {
    const tenantId = req.tenantId || 'default';
    return this.templatesService.delete(tenantId, templateId);
  }

  @Post('templates/:templateId/duplicate')
  async duplicateTemplate(
    @Req() req: any,
    @Param('templateId') templateId: string,
    @Body() body: { name?: string },
  ) {
    const tenantId = req.tenantId || 'default';
    return this.templatesService.duplicate(tenantId, templateId, body.name);
  }

  @Post('templates/:templateId/render')
  async renderTemplate(
    @Req() req: any,
    @Param('templateId') templateId: string,
    @Body() body: { variables: Record<string, string> },
  ) {
    const tenantId = req.tenantId || 'default';
    const rendered = await this.templatesService.render(
      tenantId,
      templateId,
      body.variables,
    );
    return { rendered };
  }

  // ===========================
  // Campaigns Endpoints
  // ===========================

  @Post('campaigns')
  async createCampaign(
    @Req() req: any,
    @Body()
    body: {
      name: string;
      templateId?: string;
      message?: string;
      scheduledAt?: string;
      recipientFilters?: any;
      recipientIds?: string[];
    },
  ) {
    const tenantId = req.tenantId || 'default';
    return this.campaignsService.create(tenantId, {
      ...body,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
    });
  }

  @Get('campaigns')
  async getCampaigns(@Req() req: any, @Query('status') status?: string) {
    const tenantId = req.tenantId || 'default';
    return this.campaignsService.findAll(tenantId, { status });
  }

  @Get('campaigns/:campaignId')
  async getCampaign(@Req() req: any, @Param('campaignId') campaignId: string) {
    const tenantId = req.tenantId || 'default';
    return this.campaignsService.findOne(tenantId, campaignId);
  }

  @Put('campaigns/:campaignId')
  async updateCampaign(
    @Req() req: any,
    @Param('campaignId') campaignId: string,
    @Body() body: any,
  ) {
    const tenantId = req.tenantId || 'default';
    return this.campaignsService.update(tenantId, campaignId, body);
  }

  @Post('campaigns/:campaignId/execute')
  async executeCampaign(@Req() req: any, @Param('campaignId') campaignId: string) {
    const tenantId = req.tenantId || 'default';
    const userId = req.user?.id;
    return this.campaignsService.execute(tenantId, campaignId, userId);
  }

  @Post('campaigns/:campaignId/cancel')
  async cancelCampaign(@Req() req: any, @Param('campaignId') campaignId: string) {
    const tenantId = req.tenantId || 'default';
    return this.campaignsService.cancel(tenantId, campaignId);
  }

  @Delete('campaigns/:campaignId')
  async deleteCampaign(@Req() req: any, @Param('campaignId') campaignId: string) {
    const tenantId = req.tenantId || 'default';
    return this.campaignsService.delete(tenantId, campaignId);
  }

  @Get('campaigns/:campaignId/stats')
  async getCampaignStats(@Req() req: any, @Param('campaignId') campaignId: string) {
    const tenantId = req.tenantId || 'default';
    return this.campaignsService.getStats(tenantId, campaignId);
  }

  @Post('campaigns/:campaignId/duplicate')
  async duplicateCampaign(
    @Req() req: any,
    @Param('campaignId') campaignId: string,
    @Body() body: { name?: string },
  ) {
    const tenantId = req.tenantId || 'default';
    return this.campaignsService.duplicate(tenantId, campaignId, body.name);
  }

  @Post('campaigns/preview-recipients')
  async previewCampaignRecipients(
    @Req() req: any,
    @Body()
    body: {
      recipientFilters?: any;
      recipientIds?: string[];
      limit?: number;
    },
  ) {
    const tenantId = req.tenantId || 'default';
    return this.campaignsService.previewRecipients(
      tenantId,
      {
        name: 'Preview',
        ...body,
      },
      body.limit,
    );
  }
}
