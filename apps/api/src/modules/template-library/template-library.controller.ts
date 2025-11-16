import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Request,
} from '@nestjs/common';
import { TemplateLibraryService } from './template-library.service';

class CreateTemplateDto {
  type: 'WORKFLOW' | 'EMAIL' | 'SMS' | 'SCRIPT' | 'DOCUMENTATION';
  category: string;
  name: string;
  description: string;
  content: any;
  tags: string[];
  isPremium: boolean;
  price: number;
  version: string;
  screenshots?: string[];
}

class UpdateTemplateDto {
  content?: any;
  version: string;
  changes: string;
}

class SearchTemplatesDto {
  type?: 'WORKFLOW' | 'EMAIL' | 'SMS' | 'SCRIPT' | 'DOCUMENTATION';
  category?: string;
  tags?: string;
  isPremium?: boolean;
  minRating?: number;
  searchTerm?: string;
}

class PurchaseTemplateDto {
  paymentMethodId: string;
}

class SubmitReviewDto {
  rating: number;
  comment: string;
}

@Controller('template-library')
export class TemplateLibraryController {
  constructor(private readonly templateLibrary: TemplateLibraryService) {}

  /**
   * Create template
   * POST /template-library/templates
   */
  @Post('templates')
  async createTemplate(@Body() body: CreateTemplateDto, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;

    return this.templateLibrary.createTemplate(tenantId, userId, body);
  }

  /**
   * Get template by ID
   * GET /template-library/templates/:id
   */
  @Get('templates/:id')
  async getTemplate(@Param('id') id: string) {
    return this.templateLibrary.getTemplate(id);
  }

  /**
   * Publish template
   * POST /template-library/templates/:id/publish
   */
  @Post('templates/:id/publish')
  async publishTemplate(@Param('id') id: string, @Request() req: any) {
    const userId = req.user.userId;
    return this.templateLibrary.publishTemplate(id, userId);
  }

  /**
   * Update template version
   * PUT /template-library/templates/:id
   */
  @Put('templates/:id')
  async updateTemplate(
    @Param('id') id: string,
    @Body() body: UpdateTemplateDto,
    @Request() req: any,
  ) {
    const userId = req.user.userId;
    return this.templateLibrary.updateTemplateVersion(id, userId, body);
  }

  /**
   * Search templates
   * GET /template-library/search
   */
  @Get('search')
  async searchTemplates(@Query() query: SearchTemplatesDto) {
    const filters: any = {
      type: query.type,
      category: query.category,
      isPremium: query.isPremium !== undefined ? query.isPremium === true || query.isPremium === 'true' : undefined,
      minRating: query.minRating ? parseFloat(query.minRating as any) : undefined,
      searchTerm: query.searchTerm,
    };

    if (query.tags) {
      filters.tags = query.tags.split(',');
    }

    return this.templateLibrary.searchTemplates(filters);
  }

  /**
   * Get featured templates
   * GET /template-library/featured
   */
  @Get('featured')
  async getFeaturedTemplates(@Query('limit') limit?: string) {
    const maxResults = limit ? parseInt(limit) : 10;
    return this.templateLibrary.getFeaturedTemplates(maxResults);
  }

  /**
   * Install template
   * POST /template-library/templates/:id/install
   */
  @Post('templates/:id/install')
  async installTemplate(@Param('id') id: string, @Request() req: any) {
    const userId = req.user.userId;
    const tenantId = req.user.tenantId;

    return this.templateLibrary.installTemplate(id, userId, tenantId);
  }

  /**
   * Purchase template
   * POST /template-library/templates/:id/purchase
   */
  @Post('templates/:id/purchase')
  async purchaseTemplate(
    @Param('id') id: string,
    @Body() body: PurchaseTemplateDto,
    @Request() req: any,
  ) {
    const userId = req.user.userId;
    return this.templateLibrary.purchaseTemplate(id, userId, body.paymentMethodId);
  }

  /**
   * Submit review
   * POST /template-library/templates/:id/reviews
   */
  @Post('templates/:id/reviews')
  async submitReview(
    @Param('id') id: string,
    @Body() body: SubmitReviewDto,
    @Request() req: any,
  ) {
    const userId = req.user.userId;
    return this.templateLibrary.submitReview(id, userId, body);
  }

  /**
   * Get template reviews
   * GET /template-library/templates/:id/reviews
   */
  @Get('templates/:id/reviews')
  async getTemplateReviews(@Param('id') id: string) {
    const reviews = await (this.templateLibrary as any).getTemplateReviews(id);

    return {
      total: reviews.length,
      reviews,
      averageRating:
        reviews.length > 0
          ? reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length
          : 0,
    };
  }

  /**
   * Get marketplace analytics
   * GET /template-library/analytics
   */
  @Get('analytics')
  async getAnalytics() {
    return this.templateLibrary.getMarketplaceAnalytics();
  }

  /**
   * Get my templates
   * GET /template-library/my-templates
   */
  @Get('my-templates')
  async getMyTemplates(@Request() req: any) {
    const userId = req.user.userId;
    const templates = await this.templateLibrary.getUserTemplates(userId);

    return {
      total: templates.length,
      templates,
      published: templates.filter((t) => t.isPublic).length,
      totalDownloads: templates.reduce((sum, t) => sum + t.downloads, 0),
    };
  }

  /**
   * Get my installations
   * GET /template-library/my-installations
   */
  @Get('my-installations')
  async getMyInstallations(@Request() req: any) {
    const userId = req.user.userId;
    const installations = await this.templateLibrary.getUserInstallations(userId);

    return {
      total: installations.length,
      installations: installations.sort(
        (a, b) => b.installedAt.getTime() - a.installedAt.getTime(),
      ),
    };
  }

  /**
   * Get templates by type
   * GET /template-library/by-type/:type
   */
  @Get('by-type/:type')
  async getByType(@Param('type') type: string) {
    const templates = await this.templateLibrary.searchTemplates({
      type: type.toUpperCase() as any,
    });

    return {
      type,
      total: templates.length,
      templates,
    };
  }

  /**
   * Get templates by category
   * GET /template-library/by-category/:category
   */
  @Get('by-category/:category')
  async getByCategory(@Param('category') category: string) {
    const templates = await this.templateLibrary.searchTemplates({ category });

    return {
      category,
      total: templates.length,
      templates,
    };
  }

  /**
   * Get trending templates
   * GET /template-library/trending
   */
  @Get('trending')
  async getTrendingTemplates(@Query('days') days?: string) {
    const daysBack = days ? parseInt(days) : 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    const allTemplates = await (this.templateLibrary as any).getAllTemplates();

    // Filter by recent activity and sort by downloads
    const trending = allTemplates
      .filter((t: any) => t.isPublic && t.updatedAt >= cutoffDate)
      .sort((a: any, b: any) => {
        const scoreA = a.downloads * 10 + a.rating;
        const scoreB = b.downloads * 10 + b.rating;
        return scoreB - scoreA;
      })
      .slice(0, 20);

    return {
      period: `Last ${daysBack} days`,
      total: trending.length,
      templates: trending,
    };
  }

  /**
   * Get new templates
   * GET /template-library/new
   */
  @Get('new')
  async getNewTemplates(@Query('limit') limit?: string) {
    const maxResults = limit ? parseInt(limit) : 20;
    const allTemplates = await (this.templateLibrary as any).getAllTemplates();

    const newTemplates = allTemplates
      .filter((t: any) => t.isPublic)
      .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, maxResults);

    return {
      total: newTemplates.length,
      templates: newTemplates,
    };
  }

  /**
   * Get free templates
   * GET /template-library/free
   */
  @Get('free')
  async getFreeTemplates() {
    const templates = await this.templateLibrary.searchTemplates({ isPremium: false });

    return {
      total: templates.length,
      templates,
    };
  }

  /**
   * Get premium templates
   * GET /template-library/premium
   */
  @Get('premium')
  async getPremiumTemplates() {
    const templates = await this.templateLibrary.searchTemplates({ isPremium: true });

    return {
      total: templates.length,
      templates,
    };
  }

  /**
   * Get template categories
   * GET /template-library/categories
   */
  @Get('categories')
  async getCategories() {
    const allTemplates = await (this.templateLibrary as any).getAllTemplates();
    const publicTemplates = allTemplates.filter((t: any) => t.isPublic);

    const categories = publicTemplates.reduce((acc: any, template: any) => {
      const category = template.category || 'Other';
      if (!acc[category]) {
        acc[category] = { name: category, count: 0 };
      }
      acc[category].count++;
      return acc;
    }, {});

    return {
      categories: Object.values(categories).sort(
        (a: any, b: any) => b.count - a.count,
      ),
    };
  }

  /**
   * Get popular tags
   * GET /template-library/tags
   */
  @Get('tags')
  async getPopularTags(@Query('limit') limit?: string) {
    const maxResults = limit ? parseInt(limit) : 20;
    const allTemplates = await (this.templateLibrary as any).getAllTemplates();
    const publicTemplates = allTemplates.filter((t: any) => t.isPublic);

    const tagCounts = publicTemplates.reduce((acc: any, template: any) => {
      template.tags.forEach((tag: string) => {
        acc[tag] = (acc[tag] || 0) + 1;
      });
      return acc;
    }, {});

    const sortedTags = Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, maxResults);

    return {
      tags: sortedTags,
    };
  }

  /**
   * Get creator stats
   * GET /template-library/creator-stats/:userId
   */
  @Get('creator-stats/:userId')
  async getCreatorStats(@Param('userId') userId: string) {
    const templates = await this.templateLibrary.getUserTemplates(userId);
    const purchases = await (this.templateLibrary as any).getAllPurchases();

    const creatorPurchases = purchases.filter(
      (p: any) => p.sellerId === userId && p.status === 'COMPLETED',
    );

    const totalRevenue = creatorPurchases.reduce((sum: number, p: any) => sum + p.sellerPayout, 0);

    return {
      totalTemplates: templates.length,
      publishedTemplates: templates.filter((t) => t.isPublic).length,
      totalDownloads: templates.reduce((sum, t) => sum + t.downloads, 0),
      totalRevenue,
      averageRating:
        templates.length > 0
          ? templates.reduce((sum, t) => sum + t.rating, 0) / templates.length
          : 0,
      bestTemplate: templates.sort((a, b) => b.downloads - a.downloads)[0] || null,
    };
  }

  /**
   * Check if template purchased
   * GET /template-library/templates/:id/purchased
   */
  @Get('templates/:id/purchased')
  async checkPurchased(@Param('id') id: string, @Request() req: any) {
    const userId = req.user.userId;
    const hasPurchased = await this.templateLibrary.hasPurchased(id, userId);

    return {
      templateId: id,
      purchased: hasPurchased,
    };
  }

  /**
   * Get my purchases
   * GET /template-library/my-purchases
   */
  @Get('my-purchases')
  async getMyPurchases(@Request() req: any) {
    const userId = req.user.userId;
    const allPurchases = await (this.templateLibrary as any).getAllPurchases();

    const myPurchases = allPurchases.filter((p: any) => p.buyerId === userId);

    return {
      total: myPurchases.length,
      purchases: myPurchases.sort((a: any, b: any) => b.purchasedAt - a.purchasedAt),
      totalSpent: myPurchases.reduce((sum: number, p: any) => sum + p.amount, 0),
    };
  }

  /**
   * Get my earnings
   * GET /template-library/my-earnings
   */
  @Get('my-earnings')
  async getMyEarnings(@Request() req: any) {
    const userId = req.user.userId;
    const allPurchases = await (this.templateLibrary as any).getAllPurchases();

    const myEarnings = allPurchases.filter(
      (p: any) => p.sellerId === userId && p.status === 'COMPLETED',
    );

    return {
      totalSales: myEarnings.length,
      grossRevenue: myEarnings.reduce((sum: number, p: any) => sum + p.amount, 0),
      platformFees: myEarnings.reduce((sum: number, p: any) => sum + p.platformFee, 0),
      netEarnings: myEarnings.reduce((sum: number, p: any) => sum + p.sellerPayout, 0),
      sales: myEarnings.sort((a: any, b: any) => b.purchasedAt - a.purchasedAt),
    };
  }

  /**
   * Get statistics
   * GET /template-library/stats
   */
  @Get('stats')
  async getStats() {
    const allTemplates = await (this.templateLibrary as any).getAllTemplates();
    const allInstallations = await (this.templateLibrary as any).getAllInstallations();
    const allPurchases = await (this.templateLibrary as any).getAllPurchases();

    const publicTemplates = allTemplates.filter((t: any) => t.isPublic);

    return {
      totalTemplates: publicTemplates.length,
      totalInstallations: allInstallations.length,
      totalDownloads: publicTemplates.reduce((sum: number, t: any) => sum + t.downloads, 0),
      totalPurchases: allPurchases.filter((p: any) => p.status === 'COMPLETED').length,
      byType: {
        WORKFLOW: publicTemplates.filter((t: any) => t.type === 'WORKFLOW').length,
        EMAIL: publicTemplates.filter((t: any) => t.type === 'EMAIL').length,
        SMS: publicTemplates.filter((t: any) => t.type === 'SMS').length,
        SCRIPT: publicTemplates.filter((t: any) => t.type === 'SCRIPT').length,
        DOCUMENTATION: publicTemplates.filter((t: any) => t.type === 'DOCUMENTATION').length,
      },
      pricing: {
        free: publicTemplates.filter((t: any) => !t.isPremium).length,
        premium: publicTemplates.filter((t: any) => t.isPremium).length,
      },
    };
  }
}
