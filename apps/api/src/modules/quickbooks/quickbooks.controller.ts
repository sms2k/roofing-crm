import { Controller, Get, Post, Body, Query, Param, Request, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { QuickBooksService, AccountMapping } from './quickbooks.service';

interface AuthRequest extends Request {
  user: { userId: string; tenantId: string };
}

@Controller('quickbooks')
export class QuickBooksController {
  constructor(private quickbooksService: QuickBooksService) {}

  // ==================== OAUTH FLOW ====================

  @Get('auth/url')
  async getAuthorizationUrl(@Request() req: AuthRequest, @Query('redirect_uri') redirectUri: string) {
    const { tenantId } = req.user;

    if (!redirectUri) {
      return { error: 'redirect_uri is required' };
    }

    const authUrl = this.quickbooksService.getAuthorizationUrl(tenantId, redirectUri);

    return {
      authUrl,
      message: 'Redirect user to this URL to authorize QuickBooks connection',
    };
  }

  @Post('auth/callback')
  async handleCallback(
    @Request() req: AuthRequest,
    @Body()
    body: {
      code: string;
      realmId: string;
      redirect_uri: string;
    },
  ) {
    const { tenantId } = req.user;

    const config = await this.quickbooksService.handleCallback(
      tenantId,
      body.code,
      body.realmId,
      body.redirect_uri,
    );

    return {
      success: true,
      message: 'QuickBooks connected successfully',
      companyId: config.companyId,
      connectedAt: config.createdAt,
    };
  }

  @Get('status')
  async getConnectionStatus(@Request() req: AuthRequest) {
    const { tenantId } = req.user;

    try {
      const config = await this.quickbooksService.getConfig(tenantId);

      return {
        connected: true,
        companyId: config.companyId,
        lastSyncAt: config.lastSyncAt,
        tokenExpiresAt: config.tokenExpiresAt,
      };
    } catch (error) {
      return {
        connected: false,
        message: 'QuickBooks not connected',
      };
    }
  }

  @Post('disconnect')
  async disconnect(@Request() req: AuthRequest) {
    const { tenantId } = req.user;

    await this.quickbooksService.disconnect(tenantId);

    return {
      success: true,
      message: 'QuickBooks disconnected successfully',
    };
  }

  // ==================== SYNC OPERATIONS ====================

  @Post('sync/customers')
  async syncCustomers(
    @Request() req: AuthRequest,
    @Body() body: { direction?: 'to_qb' | 'from_qb' | 'both' },
  ) {
    const { tenantId } = req.user;

    const result = await this.quickbooksService.syncCustomers(tenantId, body.direction || 'both');

    return {
      success: true,
      ...result,
    };
  }

  @Post('sync/invoices')
  async syncInvoices(
    @Request() req: AuthRequest,
    @Body() body: { direction?: 'to_qb' | 'from_qb' | 'both' },
  ) {
    const { tenantId } = req.user;

    const result = await this.quickbooksService.syncInvoices(tenantId, body.direction || 'both');

    return {
      success: true,
      ...result,
    };
  }

  @Post('sync/payments')
  async syncPayments(
    @Request() req: AuthRequest,
    @Body() body: { direction?: 'to_qb' | 'from_qb' | 'both' },
  ) {
    const { tenantId } = req.user;

    const result = await this.quickbooksService.syncPayments(tenantId, body.direction || 'both');

    return {
      success: true,
      ...result,
    };
  }

  @Post('sync/expenses')
  async syncExpenses(
    @Request() req: AuthRequest,
    @Body() body: { direction?: 'to_qb' | 'from_qb' | 'both' },
  ) {
    const { tenantId } = req.user;

    const result = await this.quickbooksService.syncExpenses(tenantId, body.direction || 'both');

    return {
      success: true,
      ...result,
    };
  }

  @Post('sync/all')
  async syncAll(@Request() req: AuthRequest, @Body() body: { direction?: 'to_qb' | 'from_qb' | 'both' }) {
    const { tenantId } = req.user;

    const results = await this.quickbooksService.syncAll(tenantId, body.direction || 'both');

    const totalSynced = results.reduce((sum, r) => sum + r.synced, 0);
    const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    return {
      success: true,
      results,
      summary: {
        totalSynced,
        totalFailed,
        totalDuration,
      },
    };
  }

  // ==================== CHART OF ACCOUNTS ====================

  @Get('accounts')
  async getChartOfAccounts(@Request() req: AuthRequest) {
    const { tenantId } = req.user;

    const accounts = await this.quickbooksService.getChartOfAccounts(tenantId);

    return {
      success: true,
      accounts,
      total: accounts.length,
    };
  }

  @Post('accounts/mappings')
  async createAccountMapping(
    @Request() req: AuthRequest,
    @Body()
    body: {
      quickBooksAccountId: string;
      quickBooksAccountName: string;
      crmAccountType: 'revenue' | 'expense' | 'asset' | 'liability' | 'equity';
      crmCategory?: string;
    },
  ) {
    const { tenantId } = req.user;

    const mapping = await this.quickbooksService.createAccountMapping(tenantId, body);

    return {
      success: true,
      mapping,
    };
  }

  @Get('accounts/mappings')
  async getAccountMappings(@Request() req: AuthRequest) {
    const { tenantId } = req.user;

    const mappings = await this.quickbooksService.getAccountMappings(tenantId);

    return {
      success: true,
      mappings,
      total: mappings.length,
    };
  }

  // ==================== WEBHOOKS ====================

  @Post('webhooks')
  async handleWebhook(@Body() payload: any) {
    // QuickBooks webhook endpoint for real-time sync
    await this.quickbooksService.handleWebhook(payload);

    return {
      success: true,
    };
  }

  // ==================== MANUAL OPERATIONS ====================

  @Post('refresh-token')
  async refreshToken(@Request() req: AuthRequest) {
    const { tenantId } = req.user;

    await this.quickbooksService.refreshTokenIfNeeded(tenantId);

    return {
      success: true,
      message: 'Token refreshed successfully',
    };
  }

  @Get('config')
  async getConfig(@Request() req: AuthRequest) {
    const { tenantId } = req.user;

    const config = await this.quickbooksService.getConfig(tenantId);

    return {
      success: true,
      config: {
        companyId: config.companyId,
        isActive: config.isActive,
        lastSyncAt: config.lastSyncAt,
        tokenExpiresAt: config.tokenExpiresAt,
        createdAt: config.createdAt,
      },
    };
  }
}
