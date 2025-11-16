import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as docusign from 'docusign-esign';
import * as PDFDocument from 'pdfkit';
import * as fs from 'fs';

export interface DocumentTemplate {
  id: string;
  name: string;
  type: 'CONTRACT' | 'PROPOSAL' | 'INVOICE' | 'ESTIMATE' | 'WARRANTY' | 'WORK_ORDER' | 'CHANGE_ORDER';
  category: string;
  content: string; // HTML or template string
  variables: { name: string; label: string; type: 'text' | 'number' | 'date' | 'currency' }[];
  requiresSignature: boolean;
  signatureFields?: {
    role: string; // 'customer', 'contractor', 'witness'
    label: string;
    required: boolean;
    page: number;
    x: number;
    y: number;
  }[];
  createdAt: Date;
}

export interface GeneratedDocument {
  id: string;
  tenantId: string;
  templateId: string;
  name: string;
  type: string;
  url: string;
  pdfUrl?: string;
  status: 'DRAFT' | 'PENDING_SIGNATURE' | 'SIGNED' | 'VOIDED';
  jobId?: string;
  customerId?: string;
  propertyId?: string;
  metadata: Record<string, any>;
  createdAt: Date;
  signedAt?: Date;
}

export interface SignatureRequest {
  id: string;
  documentId: string;
  envelopeId?: string; // DocuSign envelope ID
  signers: {
    role: string;
    name: string;
    email: string;
    status: 'PENDING' | 'SENT' | 'VIEWED' | 'SIGNED' | 'DECLINED';
    signedAt?: Date;
  }[];
  status: 'DRAFT' | 'SENT' | 'COMPLETED' | 'DECLINED' | 'VOIDED';
  sentAt?: Date;
  completedAt?: Date;
  expiresAt?: Date;
}

export interface DocumentFolder {
  id: string;
  name: string;
  description?: string;
  type: 'PROJECT' | 'CUSTOMER' | 'PROPERTY' | 'GENERAL';
  parentId?: string;
  documentCount: number;
  createdAt: Date;
}

export interface DocumentVersion {
  version: number;
  documentId: string;
  url: string;
  uploadedBy: string;
  uploadedAt: Date;
  changes?: string;
}

@Injectable()
export class DocumentsService {
  private docuSignApiClient: docusign.ApiClient;

  constructor(private db: PrismaService) {
    // Initialize DocuSign client
    this.docuSignApiClient = new docusign.ApiClient();
    this.docuSignApiClient.setBasePath(process.env.DOCUSIGN_BASE_PATH || 'https://demo.docusign.net/restapi');
  }

  // ==================== TEMPLATE MANAGEMENT ====================

  async createTemplate(tenantId: string, userId: string, templateData: Partial<DocumentTemplate>): Promise<DocumentTemplate> {
    const template: DocumentTemplate = {
      id: `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: templateData.name || 'Untitled Template',
      type: templateData.type || 'CONTRACT',
      category: templateData.category || 'General',
      content: templateData.content || '',
      variables: templateData.variables || [],
      requiresSignature: templateData.requiresSignature || false,
      signatureFields: templateData.signatureFields,
      createdAt: new Date(),
    };

    await this.db.$executeRaw`
      INSERT INTO document_templates (id, tenant_id, name, type, category, content, variables, requires_signature, signature_fields, created_by, created_at)
      VALUES (${template.id}, ${tenantId}, ${template.name}, ${template.type}, ${template.category}, ${template.content}, ${JSON.stringify(template.variables)}::jsonb, ${template.requiresSignature}, ${JSON.stringify(template.signatureFields || null)}::jsonb, ${userId}, NOW())
    `;

    return template;
  }

  async getTemplate(tenantId: string, templateId: string): Promise<DocumentTemplate> {
    const results = await this.db.$queryRaw<any[]>`
      SELECT * FROM document_templates WHERE id = ${templateId} AND tenant_id = ${tenantId}
    `;

    if (results.length === 0) {
      throw new NotFoundException('Template not found');
    }

    const template = results[0];
    return {
      ...template,
      variables: JSON.parse(template.variables || '[]'),
      signatureFields: template.signature_fields ? JSON.parse(template.signature_fields) : undefined,
    };
  }

  async listTemplates(tenantId: string, type?: string): Promise<DocumentTemplate[]> {
    let results;
    if (type) {
      results = await this.db.$queryRaw<any[]>`
        SELECT * FROM document_templates WHERE tenant_id = ${tenantId} AND type = ${type} ORDER BY created_at DESC
      `;
    } else {
      results = await this.db.$queryRaw<any[]>`
        SELECT * FROM document_templates WHERE tenant_id = ${tenantId} ORDER BY created_at DESC
      `;
    }

    return results.map((t) => ({
      ...t,
      variables: JSON.parse(t.variables || '[]'),
      signatureFields: t.signature_fields ? JSON.parse(t.signature_fields) : undefined,
    }));
  }

  async updateTemplate(tenantId: string, templateId: string, updates: Partial<DocumentTemplate>): Promise<DocumentTemplate> {
    const template = await this.getTemplate(tenantId, templateId);

    const updated = { ...template, ...updates };

    await this.db.$executeRaw`
      UPDATE document_templates
      SET name = ${updated.name},
          content = ${updated.content},
          variables = ${JSON.stringify(updated.variables)}::jsonb,
          requires_signature = ${updated.requiresSignature},
          signature_fields = ${JSON.stringify(updated.signatureFields || null)}::jsonb
      WHERE id = ${templateId} AND tenant_id = ${tenantId}
    `;

    return updated;
  }

  // ==================== DOCUMENT GENERATION ====================

  async generateDocument(
    tenantId: string,
    userId: string,
    templateId: string,
    data: Record<string, any>,
    options: {
      name?: string;
      jobId?: string;
      customerId?: string;
      propertyId?: string;
    } = {},
  ): Promise<GeneratedDocument> {
    const template = await this.getTemplate(tenantId, templateId);

    // Replace variables in content
    let content = template.content;
    template.variables.forEach((variable) => {
      const value = data[variable.name] || '';
      const regex = new RegExp(`{{${variable.name}}}`, 'g');
      content = content.replace(regex, this.formatValue(value, variable.type));
    });

    // Generate PDF
    const pdfUrl = await this.generatePDF(content, template.name);

    const document: GeneratedDocument = {
      id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tenantId,
      templateId,
      name: options.name || template.name,
      type: template.type,
      url: pdfUrl, // HTML content URL
      pdfUrl,
      status: template.requiresSignature ? 'PENDING_SIGNATURE' : 'DRAFT',
      jobId: options.jobId,
      customerId: options.customerId,
      propertyId: options.propertyId,
      metadata: data,
      createdAt: new Date(),
    };

    await this.db.$executeRaw`
      INSERT INTO documents (id, tenant_id, template_id, name, type, url, pdf_url, status, job_id, customer_id, property_id, metadata, created_by, created_at)
      VALUES (${document.id}, ${tenantId}, ${templateId}, ${document.name}, ${document.type}, ${document.url}, ${document.pdfUrl}, ${document.status}, ${options.jobId}, ${options.customerId}, ${options.propertyId}, ${JSON.stringify(document.metadata)}::jsonb, ${userId}, NOW())
    `;

    return document;
  }

  private formatValue(value: any, type: string): string {
    switch (type) {
      case 'currency':
        return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      case 'date':
        return new Date(value).toLocaleDateString('en-US');
      case 'number':
        return Number(value).toLocaleString('en-US');
      default:
        return String(value);
    }
  }

  private async generatePDF(htmlContent: string, title: string): Promise<string> {
    // In production, use a proper HTML-to-PDF library like puppeteer or wkhtmltopdf
    // For now, create a simple PDF with PDFKit

    const doc = new PDFDocument();
    const filename = `/tmp/${Date.now()}_${title.replace(/\s+/g, '_')}.pdf`;
    const stream = fs.createWriteStream(filename);

    doc.pipe(stream);
    doc.fontSize(12).text(htmlContent, {
      width: 500,
      align: 'left',
    });
    doc.end();

    await new Promise((resolve) => stream.on('finish', resolve));

    // In production, upload to S3 or cloud storage
    // Return URL to the PDF
    return `file://${filename}`;
  }

  // ==================== E-SIGNATURES (DOCUSIGN) ====================

  async sendForSignature(
    tenantId: string,
    documentId: string,
    signers: { role: string; name: string; email: string }[],
    message?: string,
  ): Promise<SignatureRequest> {
    const document = await this.getDocument(tenantId, documentId);

    if (!document.pdfUrl) {
      throw new BadRequestException('Document must have a PDF to send for signature');
    }

    // Get DocuSign access token
    const accessToken = await this.getDocuSignAccessToken();

    // Create envelope
    const envelopesApi = new docusign.EnvelopesApi(this.docuSignApiClient);

    // Read PDF file
    const pdfBytes = fs.readFileSync(document.pdfUrl.replace('file://', ''));
    const pdfBase64 = pdfBytes.toString('base64');

    // Create envelope definition
    const envDef = new docusign.EnvelopeDefinition();
    envDef.emailSubject = `Please sign: ${document.name}`;
    envDef.emailMessage = message || 'Please review and sign this document.';

    // Add document
    const doc = new docusign.Document();
    doc.documentBase64 = pdfBase64;
    doc.name = document.name;
    doc.fileExtension = 'pdf';
    doc.documentId = '1';
    envDef.documents = [doc];

    // Add signers
    const docuSignSigners = signers.map((signer, index) => {
      const dsigner = new docusign.Signer();
      dsigner.email = signer.email;
      dsigner.name = signer.name;
      dsigner.recipientId = String(index + 1);
      dsigner.routingOrder = String(index + 1);

      // Add signature tab
      const signHere = new docusign.SignHere();
      signHere.documentId = '1';
      signHere.pageNumber = '1';
      signHere.recipientId = String(index + 1);
      signHere.tabLabel = 'SignatureTab';
      signHere.xPosition = '100';
      signHere.yPosition = String(200 + index * 100);

      const tabs = new docusign.Tabs();
      tabs.signHereTabs = [signHere];
      dsigner.tabs = tabs;

      return dsigner;
    });

    const recipients = new docusign.Recipients();
    recipients.signers = docuSignSigners;
    envDef.recipients = recipients;

    envDef.status = 'sent';

    // Send envelope
    const accountId = process.env.DOCUSIGN_ACCOUNT_ID!;
    const results = await envelopesApi.createEnvelope(accountId, { envelopeDefinition: envDef });

    // Create signature request record
    const signatureRequest: SignatureRequest = {
      id: `sig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      documentId,
      envelopeId: results.envelopeId,
      signers: signers.map((s) => ({
        ...s,
        status: 'SENT',
      })),
      status: 'SENT',
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    };

    await this.db.$executeRaw`
      INSERT INTO signature_requests (id, document_id, envelope_id, signers, status, sent_at, expires_at)
      VALUES (${signatureRequest.id}, ${documentId}, ${results.envelopeId}, ${JSON.stringify(signatureRequest.signers)}::jsonb, ${signatureRequest.status}, NOW(), ${signatureRequest.expiresAt})
    `;

    // Update document status
    await this.db.$executeRaw`
      UPDATE documents SET status = 'PENDING_SIGNATURE' WHERE id = ${documentId}
    `;

    return signatureRequest;
  }

  private async getDocuSignAccessToken(): Promise<string> {
    // In production, implement OAuth 2.0 flow
    // For now, return from environment
    return process.env.DOCUSIGN_ACCESS_TOKEN || '';
  }

  async getSignatureStatus(tenantId: string, signatureRequestId: string): Promise<SignatureRequest> {
    const results = await this.db.$queryRaw<any[]>`
      SELECT * FROM signature_requests WHERE id = ${signatureRequestId}
    `;

    if (results.length === 0) {
      throw new NotFoundException('Signature request not found');
    }

    const request = results[0];

    // Get latest status from DocuSign
    if (request.envelope_id) {
      const accessToken = await this.getDocuSignAccessToken();
      const envelopesApi = new docusign.EnvelopesApi(this.docuSignApiClient);
      const accountId = process.env.DOCUSIGN_ACCOUNT_ID!;

      const envelope = await envelopesApi.getEnvelope(accountId, request.envelope_id);

      // Update status based on envelope
      if (envelope.status === 'completed') {
        await this.db.$executeRaw`
          UPDATE signature_requests SET status = 'COMPLETED', completed_at = NOW() WHERE id = ${signatureRequestId}
        `;
        await this.db.$executeRaw`
          UPDATE documents SET status = 'SIGNED', signed_at = NOW() WHERE id = ${request.document_id}
        `;
      }
    }

    return {
      ...request,
      signers: JSON.parse(request.signers),
    };
  }

  async handleDocuSignWebhook(payload: any): Promise<void> {
    // Handle DocuSign webhook events
    const { envelopeId, status } = payload;

    if (status === 'completed') {
      // Find signature request by envelope ID
      const results = await this.db.$queryRaw<any[]>`
        SELECT * FROM signature_requests WHERE envelope_id = ${envelopeId}
      `;

      if (results.length > 0) {
        const request = results[0];

        await this.db.$executeRaw`
          UPDATE signature_requests SET status = 'COMPLETED', completed_at = NOW() WHERE id = ${request.id}
        `;

        await this.db.$executeRaw`
          UPDATE documents SET status = 'SIGNED', signed_at = NOW() WHERE id = ${request.document_id}
        `;
      }
    }
  }

  // ==================== DOCUMENT MANAGEMENT ====================

  async getDocument(tenantId: string, documentId: string): Promise<GeneratedDocument> {
    const results = await this.db.$queryRaw<any[]>`
      SELECT * FROM documents WHERE id = ${documentId} AND tenant_id = ${tenantId}
    `;

    if (results.length === 0) {
      throw new NotFoundException('Document not found');
    }

    const doc = results[0];
    return {
      ...doc,
      metadata: JSON.parse(doc.metadata || '{}'),
    };
  }

  async listDocuments(
    tenantId: string,
    filters: {
      jobId?: string;
      customerId?: string;
      propertyId?: string;
      type?: string;
      status?: string;
    } = {},
  ): Promise<GeneratedDocument[]> {
    let query = `SELECT * FROM documents WHERE tenant_id = '${tenantId}'`;

    if (filters.jobId) query += ` AND job_id = '${filters.jobId}'`;
    if (filters.customerId) query += ` AND customer_id = '${filters.customerId}'`;
    if (filters.propertyId) query += ` AND property_id = '${filters.propertyId}'`;
    if (filters.type) query += ` AND type = '${filters.type}'`;
    if (filters.status) query += ` AND status = '${filters.status}'`;

    query += ' ORDER BY created_at DESC';

    const results = await this.db.$queryRawUnsafe<any[]>(query);

    return results.map((doc) => ({
      ...doc,
      metadata: JSON.parse(doc.metadata || '{}'),
    }));
  }

  async updateDocument(tenantId: string, documentId: string, updates: Partial<GeneratedDocument>): Promise<GeneratedDocument> {
    const document = await this.getDocument(tenantId, documentId);

    const updated = { ...document, ...updates };

    await this.db.$executeRaw`
      UPDATE documents
      SET name = ${updated.name},
          status = ${updated.status},
          metadata = ${JSON.stringify(updated.metadata)}::jsonb
      WHERE id = ${documentId} AND tenant_id = ${tenantId}
    `;

    return updated;
  }

  async deleteDocument(tenantId: string, documentId: string): Promise<void> {
    // Delete file from storage
    const document = await this.getDocument(tenantId, documentId);
    if (document.pdfUrl && document.pdfUrl.startsWith('file://')) {
      const filePath = document.pdfUrl.replace('file://', '');
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Delete from database
    await this.db.$executeRaw`
      DELETE FROM documents WHERE id = ${documentId} AND tenant_id = ${tenantId}
    `;
  }

  // ==================== FOLDERS ====================

  async createFolder(
    tenantId: string,
    userId: string,
    folderData: Partial<DocumentFolder>,
  ): Promise<DocumentFolder> {
    const folder: DocumentFolder = {
      id: `fld_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: folderData.name || 'New Folder',
      description: folderData.description,
      type: folderData.type || 'GENERAL',
      parentId: folderData.parentId,
      documentCount: 0,
      createdAt: new Date(),
    };

    await this.db.$executeRaw`
      INSERT INTO document_folders (id, tenant_id, name, description, type, parent_id, created_by, created_at)
      VALUES (${folder.id}, ${tenantId}, ${folder.name}, ${folder.description}, ${folder.type}, ${folder.parentId}, ${userId}, NOW())
    `;

    return folder;
  }

  async listFolders(tenantId: string, type?: string): Promise<DocumentFolder[]> {
    let results;
    if (type) {
      results = await this.db.$queryRaw<any[]>`
        SELECT f.*, COUNT(d.id) as document_count
        FROM document_folders f
        LEFT JOIN documents d ON d.folder_id = f.id
        WHERE f.tenant_id = ${tenantId} AND f.type = ${type}
        GROUP BY f.id
        ORDER BY f.created_at DESC
      `;
    } else {
      results = await this.db.$queryRaw<any[]>`
        SELECT f.*, COUNT(d.id) as document_count
        FROM document_folders f
        LEFT JOIN documents d ON d.folder_id = f.id
        WHERE f.tenant_id = ${tenantId}
        GROUP BY f.id
        ORDER BY f.created_at DESC
      `;
    }

    return results.map((f) => ({
      ...f,
      documentCount: parseInt(f.document_count, 10),
    }));
  }

  // ==================== VERSIONING ====================

  async createVersion(
    tenantId: string,
    documentId: string,
    userId: string,
    newUrl: string,
    changes?: string,
  ): Promise<DocumentVersion> {
    // Get current version number
    const versions = await this.db.$queryRaw<any[]>`
      SELECT MAX(version) as max_version FROM document_versions WHERE document_id = ${documentId}
    `;

    const nextVersion = (versions[0]?.max_version || 0) + 1;

    const version: DocumentVersion = {
      version: nextVersion,
      documentId,
      url: newUrl,
      uploadedBy: userId,
      uploadedAt: new Date(),
      changes,
    };

    await this.db.$executeRaw`
      INSERT INTO document_versions (document_id, version, url, uploaded_by, uploaded_at, changes)
      VALUES (${documentId}, ${nextVersion}, ${newUrl}, ${userId}, NOW(), ${changes})
    `;

    return version;
  }

  async getVersions(tenantId: string, documentId: string): Promise<DocumentVersion[]> {
    // Verify document belongs to tenant
    await this.getDocument(tenantId, documentId);

    const results = await this.db.$queryRaw<any[]>`
      SELECT * FROM document_versions WHERE document_id = ${documentId} ORDER BY version DESC
    `;

    return results;
  }

  // ==================== AUTO-FILING ====================

  async autoFileDocument(tenantId: string, documentId: string): Promise<void> {
    const document = await this.getDocument(tenantId, documentId);

    // Auto-create folder based on type and relationships
    let folderId: string | undefined;

    if (document.jobId) {
      // File under job folder
      const jobFolders = await this.listFolders(tenantId, 'PROJECT');
      let jobFolder = jobFolders.find((f) => f.name === `Job-${document.jobId}`);

      if (!jobFolder) {
        jobFolder = await this.createFolder(tenantId, 'system', {
          name: `Job-${document.jobId}`,
          type: 'PROJECT',
          description: 'Auto-created job folder',
        });
      }

      folderId = jobFolder.id;
    } else if (document.customerId) {
      // File under customer folder
      const customerFolders = await this.listFolders(tenantId, 'CUSTOMER');
      let customerFolder = customerFolders.find((f) => f.name === `Customer-${document.customerId}`);

      if (!customerFolder) {
        customerFolder = await this.createFolder(tenantId, 'system', {
          name: `Customer-${document.customerId}`,
          type: 'CUSTOMER',
          description: 'Auto-created customer folder',
        });
      }

      folderId = customerFolder.id;
    }

    if (folderId) {
      await this.db.$executeRaw`
        UPDATE documents SET folder_id = ${folderId} WHERE id = ${documentId}
      `;
    }
  }
}
