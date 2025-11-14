import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface CreateEmailTemplateDto {
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
}

export interface UpdateEmailTemplateDto {
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
}

@Injectable()
export class EmailTemplatesService {
  private readonly logger = new Logger(EmailTemplatesService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Extract variables from template
   * Looks for {{variableName}} patterns
   */
  private extractVariables(content: string): string[] {
    const regex = /\{\{(\w+)\}\}/g;
    const variables: string[] = [];
    let match;

    while ((match = regex.exec(content)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }

    return variables;
  }

  /**
   * Validate template
   */
  private validateTemplate(data: {
    subject: string;
    html: string;
  }): { valid: boolean; error?: string } {
    if (!data.subject || data.subject.trim().length === 0) {
      return { valid: false, error: 'Subject cannot be empty' };
    }

    if (!data.html || data.html.trim().length === 0) {
      return { valid: false, error: 'HTML content cannot be empty' };
    }

    // Check for balanced braces
    const openBraces = (data.html.match(/\{\{/g) || []).length;
    const closeBraces = (data.html.match(/\}\}/g) || []).length;

    if (openBraces !== closeBraces) {
      return { valid: false, error: 'Unbalanced variable braces {{}}' };
    }

    return { valid: true };
  }

  /**
   * Create a new email template
   */
  async create(tenantId: string, data: CreateEmailTemplateDto) {
    const validation = this.validateTemplate({
      subject: data.subject,
      html: data.html,
    });

    if (!validation.valid) {
      throw new BadRequestException(validation.error);
    }

    // Auto-extract variables from subject and html if not provided
    const subjectVars = this.extractVariables(data.subject);
    const htmlVars = this.extractVariables(data.html);
    const textVars = data.text ? this.extractVariables(data.text) : [];

    const allVariables = Array.from(
      new Set([...subjectVars, ...htmlVars, ...textVars]),
    );
    const variables = data.variables || allVariables;

    // Create template
    const template = {
      id: `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: data.name,
      subject: data.subject,
      html: data.html,
      text: data.text || this.htmlToText(data.html),
      category: data.category || 'general',
      variables,
      from: data.from,
      replyTo: data.replyTo,
      isActive: data.isActive !== false,
      previewText: data.previewText,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Store in tenant settings
    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
    });

    const currentTemplates = (tenant?.settings as any)?.emailTemplates || [];
    const updatedTemplates = [...currentTemplates, template];

    await this.db.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...(tenant?.settings as any),
          emailTemplates: updatedTemplates,
        },
      },
    });

    this.logger.log(`Created email template: ${template.name} (${template.id})`);

    return template;
  }

  /**
   * Get all templates for a tenant
   */
  async findAll(
    tenantId: string,
    options?: { category?: string; isActive?: boolean },
  ) {
    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
    });

    let templates = (tenant?.settings as any)?.emailTemplates || [];

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
  async update(
    tenantId: string,
    templateId: string,
    data: UpdateEmailTemplateDto,
  ) {
    if (data.subject && data.html) {
      const validation = this.validateTemplate({
        subject: data.subject,
        html: data.html,
      });

      if (!validation.valid) {
        throw new BadRequestException(validation.error);
      }
    }

    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
    });

    const templates = (tenant?.settings as any)?.emailTemplates || [];
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

    // Re-extract variables if content changed
    if (data.subject || data.html || data.text) {
      const subjectVars = this.extractVariables(
        data.subject || templates[templateIndex].subject,
      );
      const htmlVars = this.extractVariables(
        data.html || templates[templateIndex].html,
      );
      const textVars = this.extractVariables(
        data.text || templates[templateIndex].text || '',
      );

      updated.variables = Array.from(new Set([...subjectVars, ...htmlVars, ...textVars]));
    }

    templates[templateIndex] = updated;

    await this.db.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...(tenant?.settings as any),
          emailTemplates: templates,
        },
      },
    });

    this.logger.log(`Updated email template: ${templateId}`);

    return updated;
  }

  /**
   * Delete a template
   */
  async delete(tenantId: string, templateId: string) {
    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
    });

    let templates = (tenant?.settings as any)?.emailTemplates || [];
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
          emailTemplates: templates,
        },
      },
    });

    this.logger.log(`Deleted email template: ${templateId}`);

    return { deleted: true };
  }

  /**
   * Render a template with variables
   */
  async render(
    tenantId: string,
    templateId: string,
    variables: Record<string, any>,
  ): Promise<{ subject: string; html: string; text: string }> {
    const template = await this.findOne(tenantId, templateId);

    let subject = template.subject;
    let html = template.html;
    let text = template.text || '';

    // Replace all variables
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      subject = subject.replace(regex, String(value));
      html = html.replace(regex, String(value));
      text = text.replace(regex, String(value));
    });

    return { subject, html, text };
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
      subject: template.subject,
      html: template.html,
      text: template.text,
      category: template.category,
      variables: template.variables,
      from: template.from,
      replyTo: template.replyTo,
      isActive: template.isActive,
      previewText: template.previewText,
    });
  }

  /**
   * Simple HTML to text conversion
   */
  private htmlToText(html: string): string {
    return html
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Get predefined roofing email templates
   */
  async getPredefinedTemplates(): Promise<CreateEmailTemplateDto[]> {
    return [
      {
        name: 'Welcome Email',
        subject: 'Welcome to {{companyName}}!',
        category: 'onboarding',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
    <h1 style="color: #2c3e50; margin-bottom: 20px;">Welcome, {{firstName}}!</h1>
    <p>Thank you for choosing {{companyName}} for your roofing needs.</p>
    <p>We're excited to work with you and provide the best roofing services in {{city}}.</p>
    <div style="background-color: #fff; padding: 20px; margin: 20px 0; border-radius: 5px;">
      <h3 style="color: #3498db;">What's Next?</h3>
      <ul style="line-height: 2;">
        <li>We'll call you within 24 hours to schedule your free inspection</li>
        <li>Our expert will assess your roof and provide recommendations</li>
        <li>You'll receive a detailed estimate within 48 hours</li>
      </ul>
    </div>
    <p>If you have any questions, feel free to reach out:</p>
    <p>
      📞 {{phone}}<br>
      📧 {{email}}
    </p>
    <p>Best regards,<br>The {{companyName}} Team</p>
  </div>
</body>
</html>
        `,
        variables: ['firstName', 'companyName', 'city', 'phone', 'email'],
        previewText: 'Welcome to our roofing family!',
      },
      {
        name: 'Quote Ready',
        subject: 'Your Roof Estimate is Ready, {{firstName}}!',
        category: 'sales',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
    <h1 style="color: #2c3e50; margin-bottom: 20px;">Your Estimate is Ready!</h1>
    <p>Hi {{firstName}},</p>
    <p>Great news! Your roof estimate for {{address}} is ready for review.</p>
    <div style="background-color: #3498db; color: white; padding: 20px; margin: 20px 0; border-radius: 5px; text-align: center;">
      <h2 style="margin: 0;">Estimated Investment</h2>
      <p style="font-size: 32px; font-weight: bold; margin: 10px 0;">\${{amount}}</p>
    </div>
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{portalLink}}" style="background-color: #2ecc71; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
        View Full Estimate
      </a>
    </div>
    <p>Your estimate includes:</p>
    <ul style="line-height: 2;">
      <li>Detailed scope of work</li>
      <li>Material specifications</li>
      <li>Labor costs</li>
      <li>Project timeline</li>
      <li>Warranty information</li>
    </ul>
    <p>Questions? Call me directly at {{salesRepPhone}} or reply to this email.</p>
    <p>Best regards,<br>{{salesRepName}}<br>{{companyName}}</p>
  </div>
</body>
</html>
        `,
        variables: [
          'firstName',
          'address',
          'amount',
          'portalLink',
          'salesRepPhone',
          'salesRepName',
          'companyName',
        ],
        previewText: 'Your custom roofing estimate is ready to view',
      },
      {
        name: 'Appointment Confirmation',
        subject: 'Confirmed: Roof Inspection on {{date}}',
        category: 'appointments',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
    <h1 style="color: #2c3e50; margin-bottom: 20px;">✓ Appointment Confirmed</h1>
    <p>Hi {{firstName}},</p>
    <p>Your roof inspection is confirmed for:</p>
    <div style="background-color: #fff; padding: 20px; margin: 20px 0; border-radius: 5px; border-left: 4px solid #3498db;">
      <p style="margin: 5px 0;"><strong>Date:</strong> {{date}}</p>
      <p style="margin: 5px 0;"><strong>Time:</strong> {{time}}</p>
      <p style="margin: 5px 0;"><strong>Address:</strong> {{address}}</p>
      <p style="margin: 5px 0;"><strong>Inspector:</strong> {{inspectorName}}</p>
    </div>
    <p><strong>What to expect:</strong></p>
    <ul style="line-height: 2;">
      <li>We'll call 15 minutes before arrival</li>
      <li>Inspection typically takes 45-60 minutes</li>
      <li>You'll get a detailed report with photos</li>
      <li>We'll discuss findings and answer all questions</li>
    </ul>
    <p>Need to reschedule? Call us at {{phone}} or reply to this email.</p>
    <p>Looking forward to seeing you!<br>{{companyName}}</p>
  </div>
</body>
</html>
        `,
        variables: [
          'firstName',
          'date',
          'time',
          'address',
          'inspectorName',
          'phone',
          'companyName',
        ],
        previewText: 'Your roof inspection is confirmed',
      },
      {
        name: 'Job Start Notification',
        subject: 'Your Roof Project Starts {{startDate}}!',
        category: 'production',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
    <h1 style="color: #2c3e50; margin-bottom: 20px;">🏗️ Your Roof Project Begins!</h1>
    <p>Hi {{firstName}},</p>
    <p>Exciting news! Your roof {{projectType}} is scheduled to begin on <strong>{{startDate}}</strong>.</p>
    <div style="background-color: #fff; padding: 20px; margin: 20px 0; border-radius: 5px;">
      <h3 style="color: #3498db;">Project Details</h3>
      <p><strong>Start Date:</strong> {{startDate}}</p>
      <p><strong>Estimated Duration:</strong> {{duration}}</p>
      <p><strong>Crew Leader:</strong> {{foremanName}} ({{foremanPhone}})</p>
      <p><strong>Weather Permitting:</strong> We monitor weather daily and will notify you of any delays</p>
    </div>
    <p><strong>Before we begin:</strong></p>
    <ul style="line-height: 2;">
      <li>Clear driveway for equipment and material delivery</li>
      <li>Move vehicles from work areas</li>
      <li>Remove items from garage walls (vibrations may cause items to fall)</li>
      <li>Cover items in attic if accessible</li>
      <li>Keep pets indoors during work hours</li>
    </ul>
    <p>Track your project progress anytime: <a href="{{portalLink}}">View Project Portal</a></p>
    <p>Questions? Contact {{foremanName}} at {{foremanPhone}}</p>
    <p>Thank you for choosing {{companyName}}!</p>
  </div>
</body>
</html>
        `,
        variables: [
          'firstName',
          'projectType',
          'startDate',
          'duration',
          'foremanName',
          'foremanPhone',
          'portalLink',
          'companyName',
        ],
        previewText: 'Your roofing project is starting soon!',
      },
      {
        name: 'Payment Receipt',
        subject: 'Payment Received - Thank You!',
        category: 'billing',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
    <h1 style="color: #2c3e50; margin-bottom: 20px;">✓ Payment Received</h1>
    <p>Hi {{firstName}},</p>
    <p>Thank you! We've received your payment.</p>
    <div style="background-color: #fff; padding: 20px; margin: 20px 0; border-radius: 5px; border-left: 4px solid #2ecc71;">
      <p><strong>Payment Details:</strong></p>
      <p style="margin: 5px 0;">Amount: <strong>\${{amount}}</strong></p>
      <p style="margin: 5px 0;">Payment Method: {{paymentMethod}}</p>
      <p style="margin: 5px 0;">Transaction ID: {{transactionId}}</p>
      <p style="margin: 5px 0;">Date: {{paymentDate}}</p>
    </div>
    <p><strong>Project Balance:</strong> \${{remainingBalance}}</p>
    <p>View your full payment history and project details: <a href="{{portalLink}}">Customer Portal</a></p>
    <p>Questions about your payment? Contact us at {{phone}} or {{email}}</p>
    <p>Thank you for your business!<br>{{companyName}}</p>
  </div>
</body>
</html>
        `,
        variables: [
          'firstName',
          'amount',
          'paymentMethod',
          'transactionId',
          'paymentDate',
          'remainingBalance',
          'portalLink',
          'phone',
          'email',
          'companyName',
        ],
        previewText: 'Your payment has been received',
      },
      {
        name: 'Review Request',
        subject: 'How did we do? Share your experience',
        category: 'feedback',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px; text-align: center;">
    <h1 style="color: #2c3e50; margin-bottom: 20px;">We'd Love Your Feedback!</h1>
    <p>Hi {{firstName}},</p>
    <p>Thank you for choosing {{companyName}} for your roof {{projectType}}!</p>
    <p>Your opinion matters to us and helps other homeowners make informed decisions.</p>
    <div style="margin: 30px 0;">
      <p style="font-size: 18px; font-weight: bold; margin-bottom: 15px;">How would you rate your experience?</p>
      <div style="font-size: 40px; letter-spacing: 10px;">
        ⭐⭐⭐⭐⭐
      </div>
    </div>
    <div style="margin: 30px 0;">
      <a href="{{reviewLink}}" style="background-color: #3498db; color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 16px;">
        Leave a Review
      </a>
    </div>
    <p style="font-size: 14px; color: #666; margin-top: 30px;">
      It only takes 60 seconds and means the world to us!
    </p>
    <p style="margin-top: 30px;">Thanks again,<br>{{companyName}} Team</p>
  </div>
</body>
</html>
        `,
        variables: ['firstName', 'companyName', 'projectType', 'reviewLink'],
        previewText: 'Share your experience with us!',
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

    this.logger.log(`Installed ${installed.length} predefined email templates`);

    return installed;
  }
}
