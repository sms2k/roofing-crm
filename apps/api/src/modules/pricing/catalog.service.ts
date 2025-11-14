import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

/**
 * Catalog Service - Manages product categories and catalog organization
 */
@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Create product category
   */
  async createCategory(
    tenantId: string,
    data: {
      name: string;
      description?: string;
      parentId?: string;
      sortOrder?: number;
    }
  ) {
    return this.db.productCategory.create({
      data: {
        tenantId,
        ...data,
      },
    });
  }

  /**
   * Get all categories with hierarchy
   */
  async getCategories(tenantId: string) {
    const categories = await this.db.productCategory.findMany({
      where: { tenantId, isActive: true },
      include: {
        children: true,
        _count: {
          select: { products: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    // Build category tree
    return this.buildCategoryTree(categories);
  }

  /**
   * Build hierarchical category tree
   */
  private buildCategoryTree(categories: any[]) {
    const categoryMap = new Map();
    const rootCategories = [];

    // First pass: create map
    categories.forEach(cat => {
      categoryMap.set(cat.id, { ...cat, children: [] });
    });

    // Second pass: build tree
    categories.forEach(cat => {
      const category = categoryMap.get(cat.id);
      if (cat.parentId) {
        const parent = categoryMap.get(cat.parentId);
        if (parent) {
          parent.children.push(category);
        }
      } else {
        rootCategories.push(category);
      }
    });

    return rootCategories;
  }

  /**
   * Create pricing template
   */
  async createTemplate(
    tenantId: string,
    data: {
      name: string;
      description?: string;
      type: string;
      lineItems: any[];
      isDefault?: boolean;
    }
  ) {
    // If setting as default, unset other defaults
    if (data.isDefault) {
      await this.db.pricingTemplate.updateMany({
        where: { tenantId, type: data.type },
        data: { isDefault: false },
      });
    }

    return this.db.pricingTemplate.create({
      data: {
        tenantId,
        ...data,
      },
    });
  }

  /**
   * Get pricing templates
   */
  async getTemplates(tenantId: string, type?: string) {
    return this.db.pricingTemplate.findMany({
      where: {
        tenantId,
        ...(type && { type }),
      },
      orderBy: [
        { isDefault: 'desc' },
        { name: 'asc' },
      ],
    });
  }

  /**
   * Get default template for job type
   */
  async getDefaultTemplate(tenantId: string, type: string) {
    return this.db.pricingTemplate.findFirst({
      where: {
        tenantId,
        type,
        isDefault: true,
      },
    });
  }

  /**
   * Generate estimate from template
   */
  async generateFromTemplate(templateId: string, jobData: any) {
    const template = await this.db.pricingTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new Error('Template not found');
    }

    // Process template line items with job-specific data
    const lineItems = (template.lineItems as any[]).map((item, index) => ({
      ...item,
      sortOrder: index,
      // Apply any job-specific calculations here
    }));

    return {
      template: template.name,
      lineItems,
      subtotal: this.calculateSubtotal(lineItems),
    };
  }

  /**
   * Calculate subtotal from line items
   */
  private calculateSubtotal(lineItems: any[]): number {
    return lineItems.reduce((sum, item) => {
      const itemTotal = item.quantity * item.unitPrice * (1 + (item.markup / 100));
      return sum + itemTotal;
    }, 0);
  }

  /**
   * Search catalog
   */
  async search(tenantId: string, query: string) {
    return this.db.product.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { sku: { contains: query, mode: 'insensitive' } },
          { manufacturer: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: {
        category: true,
      },
      take: 20,
    });
  }
}
