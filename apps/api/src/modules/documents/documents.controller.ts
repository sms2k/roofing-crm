import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { DocumentsService, DocumentTemplate, SignatureRequest } from './documents.service';

interface AuthRequest extends Request {
  user: { userId: string; tenantId: string };
}

@Controller('documents')
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  // ==================== TEMPLATES ====================

  @Post('templates')
  async createTemplate(@Request() req: AuthRequest, @Body() templateData: Partial<DocumentTemplate>) {
    const { tenantId, userId } = req.user;
    return this.documentsService.createTemplate(tenantId, userId, templateData);
  }

  @Get('templates/:templateId')
  async getTemplate(@Request() req: AuthRequest, @Param('templateId') templateId: string) {
    const { tenantId } = req.user;
    return this.documentsService.getTemplate(tenantId, templateId);
  }

  @Get('templates')
  async listTemplates(@Request() req: AuthRequest, @Query('type') type?: string) {
    const { tenantId } = req.user;
    return this.documentsService.listTemplates(tenantId, type);
  }

  @Put('templates/:templateId')
  async updateTemplate(
    @Request() req: AuthRequest,
    @Param('templateId') templateId: string,
    @Body() updates: Partial<DocumentTemplate>,
  ) {
    const { tenantId } = req.user;
    return this.documentsService.updateTemplate(tenantId, templateId, updates);
  }

  // ==================== DOCUMENT GENERATION ====================

  @Post('generate')
  async generateDocument(
    @Request() req: AuthRequest,
    @Body()
    body: {
      templateId: string;
      data: Record<string, any>;
      name?: string;
      jobId?: string;
      customerId?: string;
      propertyId?: string;
    },
  ) {
    const { tenantId, userId } = req.user;
    const document = await this.documentsService.generateDocument(tenantId, userId, body.templateId, body.data, {
      name: body.name,
      jobId: body.jobId,
      customerId: body.customerId,
      propertyId: body.propertyId,
    });

    // Auto-file document
    await this.documentsService.autoFileDocument(tenantId, document.id);

    return document;
  }

  // ==================== E-SIGNATURES ====================

  @Post(':documentId/send-for-signature')
  async sendForSignature(
    @Request() req: AuthRequest,
    @Param('documentId') documentId: string,
    @Body()
    body: {
      signers: { role: string; name: string; email: string }[];
      message?: string;
    },
  ) {
    const { tenantId } = req.user;
    return this.documentsService.sendForSignature(tenantId, documentId, body.signers, body.message);
  }

  @Get('signatures/:signatureRequestId/status')
  async getSignatureStatus(@Request() req: AuthRequest, @Param('signatureRequestId') signatureRequestId: string) {
    const { tenantId } = req.user;
    return this.documentsService.getSignatureStatus(tenantId, signatureRequestId);
  }

  @Post('webhooks/docusign')
  async handleDocuSignWebhook(@Body() payload: any) {
    await this.documentsService.handleDocuSignWebhook(payload);
    return { success: true };
  }

  // ==================== DOCUMENT MANAGEMENT ====================

  @Get(':documentId')
  async getDocument(@Request() req: AuthRequest, @Param('documentId') documentId: string) {
    const { tenantId } = req.user;
    return this.documentsService.getDocument(tenantId, documentId);
  }

  @Get()
  async listDocuments(
    @Request() req: AuthRequest,
    @Query('jobId') jobId?: string,
    @Query('customerId') customerId?: string,
    @Query('propertyId') propertyId?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    const { tenantId } = req.user;
    return this.documentsService.listDocuments(tenantId, {
      jobId,
      customerId,
      propertyId,
      type,
      status,
    });
  }

  @Put(':documentId')
  async updateDocument(
    @Request() req: AuthRequest,
    @Param('documentId') documentId: string,
    @Body() updates: any,
  ) {
    const { tenantId } = req.user;
    return this.documentsService.updateDocument(tenantId, documentId, updates);
  }

  @Delete(':documentId')
  async deleteDocument(@Request() req: AuthRequest, @Param('documentId') documentId: string) {
    const { tenantId } = req.user;
    await this.documentsService.deleteDocument(tenantId, documentId);
    return { success: true };
  }

  // ==================== FOLDERS ====================

  @Post('folders')
  async createFolder(@Request() req: AuthRequest, @Body() folderData: any) {
    const { tenantId, userId } = req.user;
    return this.documentsService.createFolder(tenantId, userId, folderData);
  }

  @Get('folders')
  async listFolders(@Request() req: AuthRequest, @Query('type') type?: string) {
    const { tenantId } = req.user;
    return this.documentsService.listFolders(tenantId, type);
  }

  // ==================== VERSIONING ====================

  @Post(':documentId/versions')
  async createVersion(
    @Request() req: AuthRequest,
    @Param('documentId') documentId: string,
    @Body() body: { url: string; changes?: string },
  ) {
    const { tenantId, userId } = req.user;
    return this.documentsService.createVersion(tenantId, documentId, userId, body.url, body.changes);
  }

  @Get(':documentId/versions')
  async getVersions(@Request() req: AuthRequest, @Param('documentId') documentId: string) {
    const { tenantId } = req.user;
    return this.documentsService.getVersions(tenantId, documentId);
  }
}
