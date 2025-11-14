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
} from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailTemplatesService } from './email-templates.service';
import { EmailCampaignsService } from './email-campaigns.service';

@Controller('email')
export class EmailController {
  constructor(
    private readonly emailService: EmailService,
    private readonly templatesService: EmailTemplatesService,
    private readonly campaignsService: EmailCampaignsService,
  ) {}

  // ===========================
  // Email Sending Endpoints
  // ===========================

  @Post('send')
  async sendEmail(
    @Req() req: any,
    @Body()
    body: {
      to: string | string[];
      subject: string;
      html?: string;
      text?: string;
      from?: string;
      replyTo?: string;
      cc?: string | string[];
      bcc?: string | string[];
      attachments?: any[];
      trackOpens?: boolean;
      trackClicks?: boolean;
    },
  ) {
    const tenantId = req.tenantId || 'default';
    const userId = req.user?.id;
    return this.emailService.sendEmail(tenantId, body, userId);
  }

  @Post('send-templated')
  async sendTemplatedEmail(
    @Req() req: any,
    @Body()
    body: {
      to: string;
      templateId: string;
      variables?: Record<string, any>;
    },
  ) {
    const tenantId = req.tenantId || 'default';
    const userId = req.user?.id;
    return this.emailService.sendTemplatedEmail(
      tenantId,
      body.templateId,
      body.to,
      body.variables,
      userId,
    );
  }

  @Post('send-bulk')
  async sendBulkEmail(
    @Req() req: any,
    @Body()
    body: {
      recipients: Array<{
        contactId: string;
        email: string;
        variables?: Record<string, any>;
      }>;
      subject: string;
      templateId?: string;
      html?: string;
      text?: string;
      from?: string;
      replyTo?: string;
      attachments?: any[];
      trackOpens?: boolean;
      trackClicks?: boolean;
    },
  ) {
    const tenantId = req.tenantId || 'default';
    const userId = req.user?.id;
    return this.emailService.sendBulkEmail(tenantId, body, userId);
  }

  @Post('schedule')
  async scheduleEmail(
    @Req() req: any,
    @Body()
    body: {
      to: string | string[];
      subject: string;
      html?: string;
      text?: string;
      scheduledAt: string;
      from?: string;
      replyTo?: string;
      trackOpens?: boolean;
      trackClicks?: boolean;
    },
  ) {
    const tenantId = req.tenantId || 'default';
    const userId = req.user?.id;
    return this.emailService.scheduleEmail(
      tenantId,
      {
        ...body,
        scheduledAt: new Date(body.scheduledAt),
      },
      userId,
    );
  }

  @Delete('scheduled/:emailId')
  async cancelScheduledEmail(@Req() req: any, @Param('emailId') emailId: string) {
    const tenantId = req.tenantId || 'default';
    return this.emailService.cancelScheduledEmail(tenantId, emailId);
  }

  @Post('unsubscribe')
  async unsubscribe(@Req() req: any, @Body() body: { email: string }) {
    const tenantId = req.tenantId || 'default';
    return this.emailService.unsubscribe(tenantId, body.email);
  }

  // ===========================
  // Email History & Stats
  // ===========================

  @Get('history/contact/:contactId')
  async getContactHistory(@Req() req: any, @Param('contactId') contactId: string) {
    const tenantId = req.tenantId || 'default';
    return this.emailService.getContactEmailHistory(tenantId, contactId);
  }

  @Get('history/email/:email')
  async getEmailHistory(@Req() req: any, @Param('email') email: string) {
    const tenantId = req.tenantId || 'default';
    return this.emailService.getEmailHistory(tenantId, email);
  }

  @Get('stats')
  async getStats(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const tenantId = req.tenantId || 'default';
    return this.emailService.getEmailStats(
      tenantId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('status')
  async getStatus() {
    return {
      available: this.emailService.isAvailable(),
      provider: 'sendgrid',
    };
  }

  // ===========================
  // Webhooks
  // ===========================

  @Post('webhooks/events')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() body: any) {
    await this.emailService.handleWebhook(body);
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
      subject: string;
      html: string;
      text?: string;
      category?: string;
      variables?: string[];
      from?: string;
      replyTo?: string;
      isActive?: boolean;
      previewText?: string;
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
      subject?: string;
      html?: string;
      text?: string;
      category?: string;
      variables?: string[];
      from?: string;
      replyTo?: string;
      isActive?: boolean;
      previewText?: string;
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
    @Body() body: { variables: Record<string, any> },
  ) {
    const tenantId = req.tenantId || 'default';
    const rendered = await this.templatesService.render(
      tenantId,
      templateId,
      body.variables,
    );
    return rendered;
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
      subject: string;
      templateId?: string;
      html?: string;
      text?: string;
      from?: string;
      replyTo?: string;
      scheduledAt?: string;
      recipientFilters?: any;
      recipientIds?: string[];
      trackOpens?: boolean;
      trackClicks?: boolean;
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

  @Post('campaigns/:campaignId/test')
  async sendTestCampaign(
    @Req() req: any,
    @Param('campaignId') campaignId: string,
    @Body() body: { email: string },
  ) {
    const tenantId = req.tenantId || 'default';
    const userId = req.user?.id;
    return this.campaignsService.sendTest(tenantId, campaignId, body.email, userId);
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
      subject: string;
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
