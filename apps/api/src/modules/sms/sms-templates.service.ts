import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface CreateSmsTemplateDto {
  name: string;
  body: string;
  category?: string;
  variables?: string[];
  isActive?: boolean;
}

export interface UpdateSmsTemplateDto {
  name?: string;
  body?: string;
  category?: string;
  variables?: string[];
  isActive?: boolean;
}

@Injectable()
export class SmsTemplatesService {
  private readonly logger = new Logger(SmsTemplatesService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Extract variables from template body
   * Looks for {{variableName}} patterns
   */
  private extractVariables(body: string): string[] {
    const regex = /\{\{(\w+)\}\}/g;
    const variables: string[] = [];
    let match;

    while ((match = regex.exec(body)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }

    return variables;
  }

  /**
   * Validate template body
   */
  private validateTemplate(body: string): { valid: boolean; error?: string } {
    if (!body || body.trim().length === 0) {
      return { valid: false, error: 'Template body cannot be empty' };
    }

    if (body.length > 1600) {
      return {
        valid: false,
        error: 'Template body exceeds SMS limit (1600 characters)',
      };
    }

    // Check for balanced braces
    const openBraces = (body.match(/\{\{/g) || []).length;
    const closeBraces = (body.match(/\}\}/g) || []).length;

    if (openBraces !== closeBraces) {
      return { valid: false, error: 'Unbalanced variable braces {{}}' };
    }

    return { valid: true };
  }

  /**
   * Create a new SMS template
   */
  async create(tenantId: string, data: CreateSmsTemplateDto) {
    const validation = this.validateTemplate(data.body);
    if (!validation.valid) {
      throw new BadRequestException(validation.error);
    }

    // Auto-extract variables from body if not provided
    const variables = data.variables || this.extractVariables(data.body);

    // Check for duplicate name in tenant
    const existing = await this.db.tenant.findFirst({
      where: {
        id: tenantId,
        // Assuming templates are stored in tenant settings or separate table
      },
    });

    // Store template in database
    // Note: We're using a JSON field in tenant settings for now
    // In production, you'd want a separate SmsTemplate table
    const template = {
      id: `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: data.name,
      body: data.body,
      category: data.category || 'general',
      variables,
      isActive: data.isActive !== false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // For now, store in tenant settings
    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
    });

    const currentTemplates = (tenant?.settings as any)?.smsTemplates || [];
    const updatedTemplates = [...currentTemplates, template];

    await this.db.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...(tenant?.settings as any),
          smsTemplates: updatedTemplates,
        },
      },
    });

    this.logger.log(`Created SMS template: ${template.name} (${template.id})`);

    return template;
  }

  /**
   * Get all templates for a tenant
   */
  async findAll(tenantId: string, options?: { category?: string; isActive?: boolean }) {
    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
    });

    let templates = (tenant?.settings as any)?.smsTemplates || [];

    // Filter by category
    if (options?.category) {
      templates = templates.filter((t: any) => t.category === options.category);
    }

    // Filter by active status
    if (options?.isActive !== undefined) {
      templates = templates.filter((t: any) => t.isActive === options.isActive);
    }

    return templates;
  }

  /**
   * Get a single template
   */
  async findOne(tenantId: string, templateId: string) {
    const templates = await this.findAll(tenantId);
    const template = templates.find((t: any) => t.id === templateId);

    if (!template) {
      throw new BadRequestException('Template not found');
    }

    return template;
  }

  /**
   * Update a template
   */
  async update(tenantId: string, templateId: string, data: UpdateSmsTemplateDto) {
    if (data.body) {
      const validation = this.validateTemplate(data.body);
      if (!validation.valid) {
        throw new BadRequestException(validation.error);
      }
    }

    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
    });

    const templates = (tenant?.settings as any)?.smsTemplates || [];
    const templateIndex = templates.findIndex((t: any) => t.id === templateId);

    if (templateIndex === -1) {
      throw new BadRequestException('Template not found');
    }

    // Update template
    const updated = {
      ...templates[templateIndex],
      ...data,
      updatedAt: new Date(),
    };

    // Re-extract variables if body changed
    if (data.body) {
      updated.variables = this.extractVariables(data.body);
    }

    templates[templateIndex] = updated;

    await this.db.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...(tenant?.settings as any),
          smsTemplates: templates,
        },
      },
    });

    this.logger.log(`Updated SMS template: ${templateId}`);

    return updated;
  }

  /**
   * Delete a template
   */
  async delete(tenantId: string, templateId: string) {
    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
    });

    let templates = (tenant?.settings as any)?.smsTemplates || [];
    const originalLength = templates.length;

    templates = templates.filter((t: any) => t.id !== templateId);

    if (templates.length === originalLength) {
      throw new BadRequestException('Template not found');
    }

    await this.db.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...(tenant?.settings as any),
          smsTemplates: templates,
        },
      },
    });

    this.logger.log(`Deleted SMS template: ${templateId}`);

    return { deleted: true };
  }

  /**
   * Render a template with variables
   */
  async render(
    tenantId: string,
    templateId: string,
    variables: Record<string, string>,
  ): Promise<string> {
    const template = await this.findOne(tenantId, templateId);

    let rendered = template.body;

    // Replace all variables
    Object.entries(variables).forEach(([key, value]) => {
      rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    });

    // Check for unreplaced variables
    const unreplaced = this.extractVariables(rendered);
    if (unreplaced.length > 0) {
      this.logger.warn(
        `Template ${templateId} has unreplaced variables: ${unreplaced.join(', ')}`,
      );
    }

    return rendered;
  }

  /**
   * Get template categories
   */
  async getCategories(tenantId: string): Promise<string[]> {
    const templates = await this.findAll(tenantId);
    const categories = new Set<string>();

    templates.forEach((t: any) => {
      if (t.category) categories.add(t.category);
    });

    return Array.from(categories).sort();
  }

  /**
   * Duplicate a template
   */
  async duplicate(tenantId: string, templateId: string, newName: string) {
    const template = await this.findOne(tenantId, templateId);

    return this.create(tenantId, {
      name: newName || `${template.name} (Copy)`,
      body: template.body,
      category: template.category,
      variables: template.variables,
      isActive: template.isActive,
    });
  }

  /**
   * Get predefined template examples for roofing
   */
  async getPredefinedTemplates(): Promise<CreateSmsTemplateDto[]> {
    return [
      {
        name: 'Appointment Confirmation',
        body: 'Hi {{firstName}}, this confirms your roofing inspection on {{date}} at {{time}}. We\'ll call 15 mins before arrival. Reply STOP to cancel.',
        category: 'appointments',
        variables: ['firstName', 'date', 'time'],
      },
      {
        name: 'Appointment Reminder',
        body: 'Reminder: Your roof inspection is tomorrow at {{time}}. {{address}}. See you then! - {{companyName}}',
        category: 'appointments',
        variables: ['time', 'address', 'companyName'],
      },
      {
        name: 'On The Way',
        body: 'Hi {{firstName}}, our technician {{techName}} is on the way to {{address}}. ETA: {{eta}} minutes.',
        category: 'field',
        variables: ['firstName', 'techName', 'address', 'eta'],
      },
      {
        name: 'Quote Ready',
        body: 'Good news {{firstName}}! Your roof estimate is ready. View it here: {{portalLink}}. Questions? Call {{phone}}.',
        category: 'sales',
        variables: ['firstName', 'portalLink', 'phone'],
      },
      {
        name: 'Follow Up',
        body: 'Hi {{firstName}}, just following up on your roofing estimate from {{date}}. Do you have any questions? - {{salesRep}}',
        category: 'sales',
        variables: ['firstName', 'date', 'salesRep'],
      },
      {
        name: 'Storm Alert',
        body: 'STORM ALERT: {{stormType}} reported in {{area}}. Free roof inspections available. Call {{phone}} or book online: {{bookingLink}}',
        category: 'marketing',
        variables: ['stormType', 'area', 'phone', 'bookingLink'],
      },
      {
        name: 'Job Start',
        body: 'Hi {{firstName}}, your roof replacement starts {{date}}. Crew will arrive at {{time}}. Questions? Call {{foreman}} at {{phone}}.',
        category: 'production',
        variables: ['firstName', 'date', 'time', 'foreman', 'phone'],
      },
      {
        name: 'Job Complete',
        body: 'Your roof is complete! Final walkthrough scheduled for {{date}} at {{time}}. Thank you for choosing {{companyName}}!',
        category: 'production',
        variables: ['date', 'time', 'companyName'],
      },
      {
        name: 'Payment Reminder',
        body: 'Hi {{firstName}}, your {{amount}} payment is due {{dueDate}}. Pay online: {{paymentLink}} or call {{phone}}.',
        category: 'billing',
        variables: ['firstName', 'amount', 'dueDate', 'paymentLink', 'phone'],
      },
      {
        name: 'Review Request',
        body: 'Thanks for choosing {{companyName}}! We\'d love your feedback. Leave a review: {{reviewLink}}',
        category: 'feedback',
        variables: ['companyName', 'reviewLink'],
      },
    ];
  }

  /**
   * Install predefined templates for a tenant
   */
  async installPredefinedTemplates(tenantId: string) {
    const predefined = await this.getPredefinedTemplates();
    const installed = [];

    for (const template of predefined) {
      try {
        const created = await this.create(tenantId, template);
        installed.push(created);
      } catch (error) {
        this.logger.error(
          `Failed to install template "${template.name}": ${error.message}`,
        );
      }
    }

    this.logger.log(`Installed ${installed.length} predefined SMS templates`);

    return installed;
  }
}
