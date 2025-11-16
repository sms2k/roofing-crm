import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

interface Template {
  id: string;
  tenantId: string;
  createdById: string;
  type: 'WORKFLOW' | 'EMAIL' | 'SMS' | 'SCRIPT' | 'DOCUMENTATION';
  category: string;
  name: string;
  description: string;
  content: any; // Template-specific content
  tags: string[];
  isPremium: boolean;
  price: number;
  version: string;
  isPublic: boolean;
  downloads: number;
  rating: number;
  reviewCount: number;
  screenshots?: string[];
  previewUrl?: string;
  changelog?: {
    version: string;
    changes: string;
    date: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

interface WorkflowTemplate extends Template {
  type: 'WORKFLOW';
  content: {
    trigger: {
      type: string;
      config: any;
    };
    actions: {
      type: string;
      config: any;
      delay?: number;
    }[];
    variables: string[];
  };
}

interface EmailTemplate extends Template {
  type: 'EMAIL';
  content: {
    subject: string;
    html: string;
    text?: string;
    variables: string[];
    preheader?: string;
  };
}

interface SMSTemplate extends Template {
  type: 'SMS';
  content: {
    body: string;
    variables: string[];
    maxLength: number;
  };
}

interface ScriptTemplate extends Template {
  type: 'SCRIPT';
  content: {
    scenario: string;
    opening: string;
    keyPoints: string[];
    objectionHandlers: {
      objection: string;
      response: string;
    }[];
    closing: string;
  };
}

interface DocumentationTemplate extends Template {
  type: 'DOCUMENTATION';
  content: {
    title: string;
    sections: {
      heading: string;
      content: string;
    }[];
    attachments?: string[];
  };
}

interface TemplateReview {
  id: string;
  templateId: string;
  userId: string;
  rating: number;
  comment: string;
  helpful: number;
  createdAt: Date;
}

interface TemplatePurchase {
  id: string;
  templateId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  platformFee: number;
  sellerPayout: number;
  status: 'PENDING' | 'COMPLETED' | 'REFUNDED';
  purchasedAt: Date;
}

interface TemplateInstallation {
  id: string;
  templateId: string;
  userId: string;
  tenantId: string;
  installedContent: any;
  installedAt: Date;
}

interface MarketplaceAnalytics {
  totalTemplates: number;
  totalDownloads: number;
  totalRevenue: number;
  topTemplates: {
    id: string;
    name: string;
    type: string;
    downloads: number;
    rating: number;
    revenue: number;
  }[];
  topCreators: {
    id: string;
    name: string;
    templates: number;
    downloads: number;
    revenue: number;
  }[];
}

@Injectable()
export class TemplateLibraryService {
  private readonly logger = new Logger(TemplateLibraryService.name);
  private readonly platformFeePercent = parseFloat(process.env.TEMPLATE_PLATFORM_FEE || '20');

  constructor(private readonly db: DatabaseService) {}

  /**
   * Create template
   */
  async createTemplate(
    tenantId: string,
    userId: string,
    data: {
      type: Template['type'];
      category: string;
      name: string;
      description: string;
      content: any;
      tags: string[];
      isPremium: boolean;
      price: number;
      version: string;
      screenshots?: string[];
    },
  ): Promise<Template> {
    this.logger.log(`Creating ${data.type} template: ${data.name}`);

    if (data.isPremium && data.price <= 0) {
      throw new BadRequestException('Premium templates must have a price > 0');
    }

    const template: Template = {
      id: `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tenantId,
      createdById: userId,
      type: data.type,
      category: data.category,
      name: data.name,
      description: data.description,
      content: data.content,
      tags: data.tags,
      isPremium: data.isPremium,
      price: data.price,
      version: data.version,
      isPublic: false, // Must be published separately
      downloads: 0,
      rating: 0,
      reviewCount: 0,
      screenshots: data.screenshots,
      changelog: [
        {
          version: data.version,
          changes: 'Initial release',
          date: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.storeTemplate(template);

    return template;
  }

  /**
   * Publish template to marketplace
   */
  async publishTemplate(templateId: string, userId: string): Promise<Template> {
    this.logger.log(`Publishing template ${templateId}`);

    const template = await this.getTemplate(templateId);

    if (template.createdById !== userId) {
      throw new BadRequestException('Only the creator can publish this template');
    }

    template.isPublic = true;
    template.updatedAt = new Date();

    await this.updateTemplate(template);

    return template;
  }

  /**
   * Update template
   */
  async updateTemplateVersion(
    templateId: string,
    userId: string,
    updates: {
      content?: any;
      version: string;
      changes: string;
    },
  ): Promise<Template> {
    this.logger.log(`Updating template ${templateId} to version ${updates.version}`);

    const template = await this.getTemplate(templateId);

    if (template.createdById !== userId) {
      throw new BadRequestException('Only the creator can update this template');
    }

    if (updates.content) {
      template.content = updates.content;
    }

    template.version = updates.version;
    template.updatedAt = new Date();

    template.changelog = template.changelog || [];
    template.changelog.push({
      version: updates.version,
      changes: updates.changes,
      date: new Date(),
    });

    await this.updateTemplate(template);

    return template;
  }

  /**
   * Search templates
   */
  async searchTemplates(filters: {
    type?: Template['type'];
    category?: string;
    tags?: string[];
    isPremium?: boolean;
    minRating?: number;
    searchTerm?: string;
  }): Promise<Template[]> {
    const allTemplates = await this.getAllTemplates();

    let filtered = allTemplates.filter((t) => t.isPublic);

    if (filters.type) {
      filtered = filtered.filter((t) => t.type === filters.type);
    }

    if (filters.category) {
      filtered = filtered.filter((t) => t.category === filters.category);
    }

    if (filters.tags) {
      filtered = filtered.filter((t) =>
        filters.tags!.some((tag) => t.tags.includes(tag)),
      );
    }

    if (filters.isPremium !== undefined) {
      filtered = filtered.filter((t) => t.isPremium === filters.isPremium);
    }

    if (filters.minRating) {
      filtered = filtered.filter((t) => t.rating >= filters.minRating!);
    }

    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.name.toLowerCase().includes(term) ||
          t.description.toLowerCase().includes(term) ||
          t.tags.some((tag) => tag.toLowerCase().includes(term)),
      );
    }

    // Sort by rating and downloads
    return filtered.sort((a, b) => {
      const scoreA = a.rating * 10 + Math.log10(a.downloads + 1);
      const scoreB = b.rating * 10 + Math.log10(b.downloads + 1);
      return scoreB - scoreA;
    });
  }

  /**
   * Get featured templates
   */
  async getFeaturedTemplates(limit: number = 10): Promise<Template[]> {
    const templates = await this.searchTemplates({ minRating: 4.0 });
    return templates.slice(0, limit);
  }

  /**
   * Install template
   */
  async installTemplate(
    templateId: string,
    userId: string,
    tenantId: string,
  ): Promise<TemplateInstallation> {
    this.logger.log(`Installing template ${templateId} for user ${userId}`);

    const template = await this.getTemplate(templateId);

    // Check if premium and not purchased
    if (template.isPremium) {
      const hasPurchased = await this.hasPurchased(templateId, userId);
      if (!hasPurchased && template.createdById !== userId) {
        throw new BadRequestException('Must purchase this premium template first');
      }
    }

    // Increment download count
    template.downloads++;
    await this.updateTemplate(template);

    // Create installation record
    const installation: TemplateInstallation = {
      id: `inst_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      templateId,
      userId,
      tenantId,
      installedContent: template.content,
      installedAt: new Date(),
    };

    await this.storeInstallation(installation);

    // Actually install based on type
    await this.performInstallation(template, tenantId, userId);

    return installation;
  }

  /**
   * Perform actual installation
   */
  private async performInstallation(
    template: Template,
    tenantId: string,
    userId: string,
  ): Promise<void> {
    switch (template.type) {
      case 'WORKFLOW':
        await this.installWorkflow(template as WorkflowTemplate, tenantId);
        break;
      case 'EMAIL':
        await this.installEmailTemplate(template as EmailTemplate, tenantId);
        break;
      case 'SMS':
        await this.installSMSTemplate(template as SMSTemplate, tenantId);
        break;
      case 'SCRIPT':
        await this.installScript(template as ScriptTemplate, tenantId, userId);
        break;
      case 'DOCUMENTATION':
        await this.installDocumentation(template as DocumentationTemplate, tenantId);
        break;
    }
  }

  /**
   * Install workflow
   */
  private async installWorkflow(template: WorkflowTemplate, tenantId: string): Promise<void> {
    // Create workflow in automation system
    await this.db.workflow.create({
      data: {
        tenantId,
        name: template.name,
        description: template.description,
        trigger: template.content.trigger as any,
        actions: template.content.actions as any,
        isActive: false, // User must activate
      },
    });
  }

  /**
   * Install email template
   */
  private async installEmailTemplate(template: EmailTemplate, tenantId: string): Promise<void> {
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId } });
    const templates = (tenant?.settings as any)?.emailTemplates || [];

    templates.push({
      id: `tpl_${Date.now()}`,
      name: template.name,
      subject: template.content.subject,
      html: template.content.html,
      text: template.content.text,
      variables: template.content.variables,
      fromMarketplace: true,
      marketplaceTemplateId: template.id,
    });

    await this.db.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...(tenant?.settings as any),
          emailTemplates: templates,
        },
      },
    });
  }

  /**
   * Install SMS template
   */
  private async installSMSTemplate(template: SMSTemplate, tenantId: string): Promise<void> {
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId } });
    const templates = (tenant?.settings as any)?.smsTemplates || [];

    templates.push({
      id: `tpl_${Date.now()}`,
      name: template.name,
      body: template.content.body,
      variables: template.content.variables,
      fromMarketplace: true,
      marketplaceTemplateId: template.id,
    });

    await this.db.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...(tenant?.settings as any),
          smsTemplates: templates,
        },
      },
    });
  }

  /**
   * Install script
   */
  private async installScript(
    template: ScriptTemplate,
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId } });
    const scripts = (tenant?.settings as any)?.salesScripts || [];

    scripts.push({
      id: `script_${Date.now()}`,
      name: template.name,
      scenario: template.content.scenario,
      content: template.content,
      fromMarketplace: true,
      marketplaceTemplateId: template.id,
    });

    await this.db.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...(tenant?.settings as any),
          salesScripts: scripts,
        },
      },
    });
  }

  /**
   * Install documentation
   */
  private async installDocumentation(
    template: DocumentationTemplate,
    tenantId: string,
  ): Promise<void> {
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId } });
    const docs = (tenant?.settings as any)?.documentation || [];

    docs.push({
      id: `doc_${Date.now()}`,
      title: template.content.title,
      sections: template.content.sections,
      fromMarketplace: true,
      marketplaceTemplateId: template.id,
    });

    await this.db.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...(tenant?.settings as any),
          documentation: docs,
        },
      },
    });
  }

  /**
   * Purchase template
   */
  async purchaseTemplate(
    templateId: string,
    buyerId: string,
    paymentMethodId: string,
  ): Promise<TemplatePurchase> {
    this.logger.log(`Processing purchase of template ${templateId}`);

    const template = await this.getTemplate(templateId);

    if (!template.isPremium) {
      throw new BadRequestException('This template is free');
    }

    const platformFee = template.price * (this.platformFeePercent / 100);
    const sellerPayout = template.price - platformFee;

    // In production, would process payment via Stripe
    const purchase: TemplatePurchase = {
      id: `purch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      templateId,
      buyerId,
      sellerId: template.createdById,
      amount: template.price,
      platformFee,
      sellerPayout,
      status: 'COMPLETED',
      purchasedAt: new Date(),
    };

    await this.storePurchase(purchase);

    return purchase;
  }

  /**
   * Check if user purchased template
   */
  async hasPurchased(templateId: string, userId: string): Promise<boolean> {
    const allPurchases = await this.getAllPurchases();
    return allPurchases.some(
      (p) => p.templateId === templateId && p.buyerId === userId && p.status === 'COMPLETED',
    );
  }

  /**
   * Submit review
   */
  async submitReview(
    templateId: string,
    userId: string,
    data: {
      rating: number;
      comment: string;
    },
  ): Promise<TemplateReview> {
    this.logger.log(`Submitting review for template ${templateId}`);

    const template = await this.getTemplate(templateId);

    // Check if user installed the template
    const installations = await this.getUserInstallations(userId);
    const hasInstalled = installations.some((i) => i.templateId === templateId);

    if (!hasInstalled) {
      throw new BadRequestException('Must install template before reviewing');
    }

    const review: TemplateReview = {
      id: `rev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      templateId,
      userId,
      rating: data.rating,
      comment: data.comment,
      helpful: 0,
      createdAt: new Date(),
    };

    await this.storeReview(review);

    // Update template rating
    await this.updateTemplateRating(templateId);

    return review;
  }

  /**
   * Update template rating
   */
  private async updateTemplateRating(templateId: string): Promise<void> {
    const template = await this.getTemplate(templateId);
    const reviews = await this.getTemplateReviews(templateId);

    if (reviews.length === 0) return;

    const averageRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

    template.rating = Math.round(averageRating * 10) / 10;
    template.reviewCount = reviews.length;

    await this.updateTemplate(template);
  }

  /**
   * Get marketplace analytics
   */
  async getMarketplaceAnalytics(): Promise<MarketplaceAnalytics> {
    this.logger.log('Getting marketplace analytics');

    const templates = await this.getAllTemplates();
    const purchases = await this.getAllPurchases();

    const totalTemplates = templates.filter((t) => t.isPublic).length;
    const totalDownloads = templates.reduce((sum, t) => sum + t.downloads, 0);
    const totalRevenue = purchases
      .filter((p) => p.status === 'COMPLETED')
      .reduce((sum, p) => sum + p.amount, 0);

    // Top templates
    const topTemplates = templates
      .filter((t) => t.isPublic)
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, 10)
      .map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        downloads: t.downloads,
        rating: t.rating,
        revenue: purchases
          .filter((p) => p.templateId === t.id && p.status === 'COMPLETED')
          .reduce((sum, p) => sum + p.amount, 0),
      }));

    // Top creators
    const creatorStats = new Map<string, any>();

    templates.forEach((t) => {
      if (!creatorStats.has(t.createdById)) {
        creatorStats.set(t.createdById, {
          id: t.createdById,
          name: `Creator ${t.createdById.slice(0, 8)}`,
          templates: 0,
          downloads: 0,
          revenue: 0,
        });
      }

      const stats = creatorStats.get(t.createdById)!;
      stats.templates++;
      stats.downloads += t.downloads;
    });

    purchases
      .filter((p) => p.status === 'COMPLETED')
      .forEach((p) => {
        const stats = creatorStats.get(p.sellerId);
        if (stats) {
          stats.revenue += p.sellerPayout;
        }
      });

    const topCreators = Array.from(creatorStats.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return {
      totalTemplates,
      totalDownloads,
      totalRevenue,
      topTemplates,
      topCreators,
    };
  }

  /**
   * Get user's created templates
   */
  async getUserTemplates(userId: string): Promise<Template[]> {
    const templates = await this.getAllTemplates();
    return templates.filter((t) => t.createdById === userId);
  }

  /**
   * Get user's installations
   */
  async getUserInstallations(userId: string): Promise<TemplateInstallation[]> {
    const allInstallations = await this.getAllInstallations();
    return allInstallations.filter((i) => i.userId === userId);
  }

  // Storage helpers
  private async storeTemplate(template: Template): Promise<void> {
    const allTemplates = await this.getAllTemplates();
    allTemplates.push(template);
    await this.saveAllTemplates(allTemplates);
  }

  private async updateTemplate(template: Template): Promise<void> {
    const allTemplates = await this.getAllTemplates();
    const index = allTemplates.findIndex((t) => t.id === template.id);
    if (index !== -1) {
      allTemplates[index] = template;
      await this.saveAllTemplates(allTemplates);
    }
  }

  async getTemplate(templateId: string): Promise<Template> {
    const allTemplates = await this.getAllTemplates();
    const template = allTemplates.find((t) => t.id === templateId);
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  private async getAllTemplates(): Promise<Template[]> {
    // In production, would use a dedicated table
    const tenants = await this.db.tenant.findMany();
    const templates: Template[] = [];

    tenants.forEach((tenant) => {
      const tenantTemplates = (tenant.settings as any)?.marketplaceTemplates || [];
      templates.push(...tenantTemplates);
    });

    return templates;
  }

  private async saveAllTemplates(templates: Template[]): Promise<void> {
    // Simple storage - in production would use dedicated table
    const firstTenant = await this.db.tenant.findFirst();
    if (firstTenant) {
      await this.db.tenant.update({
        where: { id: firstTenant.id },
        data: {
          settings: {
            ...(firstTenant.settings as any),
            marketplaceTemplates: templates,
          },
        },
      });
    }
  }

  private async storeReview(review: TemplateReview): Promise<void> {
    const firstTenant = await this.db.tenant.findFirst();
    if (firstTenant) {
      const reviews = (firstTenant.settings as any)?.templateReviews || [];
      reviews.push(review);
      await this.db.tenant.update({
        where: { id: firstTenant.id },
        data: {
          settings: {
            ...(firstTenant.settings as any),
            templateReviews: reviews,
          },
        },
      });
    }
  }

  private async getTemplateReviews(templateId: string): Promise<TemplateReview[]> {
    const firstTenant = await this.db.tenant.findFirst();
    const reviews = (firstTenant?.settings as any)?.templateReviews || [];
    return reviews.filter((r: TemplateReview) => r.templateId === templateId);
  }

  private async storePurchase(purchase: TemplatePurchase): Promise<void> {
    const firstTenant = await this.db.tenant.findFirst();
    if (firstTenant) {
      const purchases = (firstTenant.settings as any)?.templatePurchases || [];
      purchases.push(purchase);
      await this.db.tenant.update({
        where: { id: firstTenant.id },
        data: {
          settings: {
            ...(firstTenant.settings as any),
            templatePurchases: purchases,
          },
        },
      });
    }
  }

  private async getAllPurchases(): Promise<TemplatePurchase[]> {
    const firstTenant = await this.db.tenant.findFirst();
    return (firstTenant?.settings as any)?.templatePurchases || [];
  }

  private async storeInstallation(installation: TemplateInstallation): Promise<void> {
    const firstTenant = await this.db.tenant.findFirst();
    if (firstTenant) {
      const installations = (firstTenant.settings as any)?.templateInstallations || [];
      installations.push(installation);
      await this.db.tenant.update({
        where: { id: firstTenant.id },
        data: {
          settings: {
            ...(firstTenant.settings as any),
            templateInstallations: installations,
          },
        },
      });
    }
  }

  private async getAllInstallations(): Promise<TemplateInstallation[]> {
    const firstTenant = await this.db.tenant.findFirst();
    return (firstTenant?.settings as any)?.templateInstallations || [];
  }
}
