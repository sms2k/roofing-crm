import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface CreateProductDto {
  categoryId?: string;
  sku?: string;
  name: string;
  description?: string;
  manufacturer?: string;
  model?: string;
  unit?: string;
  cost?: number;
  retailPrice?: number;
  laborRate?: number;
  images?: string[];
  primaryImage?: string;
  documents?: any[];
  specs?: Record<string, any>;
  warranty?: string;
  trackInventory?: boolean;
  quantityOnHand?: number;
  reorderPoint?: number;
  tags?: string[];
}

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Create a new product
   */
  async create(tenantId: string, dto: CreateProductDto) {
    return this.db.product.create({
      data: {
        tenantId,
        ...dto,
        images: dto.images || [],
        documents: dto.documents || [],
        tags: dto.tags || [],
      },
    });
  }

  /**
   * Get all products
   */
  async findAll(tenantId: string, filters?: {
    categoryId?: string;
    search?: string;
    tags?: string[];
    isActive?: boolean;
  }) {
    return this.db.product.findMany({
      where: {
        tenantId,
        ...(filters?.categoryId && { categoryId: filters.categoryId }),
        ...(filters?.isActive !== undefined && { isActive: filters.isActive }),
        ...(filters?.search && {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' } },
            { description: { contains: filters.search, mode: 'insensitive' } },
            { sku: { contains: filters.search, mode: 'insensitive' } },
          ],
        }),
        ...(filters?.tags && filters.tags.length > 0 && {
          tags: {
            hasSome: filters.tags,
          },
        }),
      },
      include: {
        category: true,
      },
      orderBy: [
        { category: { sortOrder: 'asc' } },
        { name: 'asc' },
      ],
    });
  }

  /**
   * Get single product
   */
  async findOne(id: string, tenantId: string) {
    return this.db.product.findFirst({
      where: { id, tenantId },
      include: {
        category: true,
      },
    });
  }

  /**
   * Update product
   */
  async update(id: string, tenantId: string, data: Partial<CreateProductDto>) {
    return this.db.product.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete product
   */
  async delete(id: string) {
    return this.db.product.delete({
      where: { id },
    });
  }

  /**
   * Upload product image
   */
  async uploadImage(productId: string, tenantId: string, imageUrl: string, isPrimary = false) {
    const product = await this.findOne(productId, tenantId);

    const images = [...(product.images as string[]), imageUrl];

    return this.db.product.update({
      where: { id: productId },
      data: {
        images,
        ...(isPrimary && { primaryImage: imageUrl }),
      },
    });
  }

  /**
   * Delete product image
   */
  async deleteImage(productId: string, imageUrl: string) {
    const product = await this.db.product.findUnique({
      where: { id: productId },
    });

    const images = (product.images as string[]).filter(img => img !== imageUrl);

    return this.db.product.update({
      where: { id: productId },
      data: {
        images,
        ...(product.primaryImage === imageUrl && { primaryImage: images[0] || null }),
      },
    });
  }

  /**
   * Update inventory
   */
  async updateInventory(productId: string, quantity: number, operation: 'add' | 'subtract' | 'set') {
    const product = await this.db.product.findUnique({
      where: { id: productId },
    });

    let newQuantity = product.quantityOnHand || 0;

    switch (operation) {
      case 'add':
        newQuantity += quantity;
        break;
      case 'subtract':
        newQuantity -= quantity;
        break;
      case 'set':
        newQuantity = quantity;
        break;
    }

    return this.db.product.update({
      where: { id: productId },
      data: {
        quantityOnHand: Math.max(0, newQuantity),
      },
    });
  }

  /**
   * Get products low in stock
   */
  async getLowStock(tenantId: string) {
    return this.db.product.findMany({
      where: {
        tenantId,
        trackInventory: true,
        isActive: true,
      },
      // Note: Prisma doesn't support direct field comparison in where clause
      // This would need to be filtered in application code or use raw SQL
    });
  }

  /**
   * Bulk import products from CSV
   */
  async bulkImport(tenantId: string, products: CreateProductDto[]) {
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const product of products) {
      try {
        await this.create(tenantId, product);
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`${product.name}: ${error.message}`);
      }
    }

    return results;
  }
}
