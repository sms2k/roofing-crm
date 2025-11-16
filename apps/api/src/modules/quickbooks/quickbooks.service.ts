import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import OAuthClient from 'intuit-oauth';

export interface QuickBooksConfig {
  id: string;
  tenantId: string;
  companyId: string; // QuickBooks realm ID
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  isActive: boolean;
  lastSyncAt?: Date;
  createdAt: Date;
}

export interface QuickBooksInvoice {
  Id?: string;
  CustomerRef: { value: string; name?: string };
  Line: Array<{
    Amount: number;
    DetailType: 'SalesItemLineDetail';
    SalesItemLineDetail: {
      ItemRef: { value: string; name?: string };
      Qty?: number;
      UnitPrice?: number;
    };
    Description?: string;
  }>;
  TxnDate: string;
  DueDate?: string;
  TotalAmt: number;
  Balance?: number;
  BillEmail?: { Address: string };
  DocNumber?: string;
}

export interface QuickBooksCustomer {
  Id?: string;
  DisplayName: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  BillAddr?: {
    Line1?: string;
    City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
  };
  CompanyName?: string;
}

export interface QuickBooksPayment {
  Id?: string;
  CustomerRef: { value: string };
  TotalAmt: number;
  TxnDate: string;
  PaymentMethodRef?: { value: string };
  Line: Array<{
    Amount: number;
    LinkedTxn: Array<{ TxnId: string; TxnType: string }>;
  }>;
}

export interface QuickBooksExpense {
  Id?: string;
  AccountRef: { value: string; name?: string };
  PaymentType: 'Cash' | 'Check' | 'CreditCard';
  TotalAmt: number;
  TxnDate: string;
  Line: Array<{
    Amount: number;
    DetailType: 'AccountBasedExpenseLineDetail';
    AccountBasedExpenseLineDetail: {
      AccountRef: { value: string; name?: string };
    };
    Description?: string;
  }>;
}

export interface SyncResult {
  entityType: 'invoice' | 'payment' | 'customer' | 'expense';
  synced: number;
  failed: number;
  errors: string[];
  duration: number;
}

export interface AccountMapping {
  tenantId: string;
  quickBooksAccountId: string;
  quickBooksAccountName: string;
  crmAccountType: 'revenue' | 'expense' | 'asset' | 'liability' | 'equity';
  crmCategory?: string;
}

@Injectable()
export class QuickBooksService {
  private oauthClients: Map<string, OAuthClient> = new Map();

  constructor(private db: PrismaService) {}

  // ==================== OAUTH & CONNECTION ====================

  getAuthorizationUrl(tenantId: string, redirectUri: string): string {
    const oauthClient = new OAuthClient({
      clientId: process.env.QUICKBOOKS_CLIENT_ID!,
      clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET!,
      environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox', // 'sandbox' or 'production'
      redirectUri,
    });

    this.oauthClients.set(tenantId, oauthClient);

    const authUri = oauthClient.authorizeUri({
      scope: [OAuthClient.scopes.Accounting, OAuthClient.scopes.OpenId],
      state: tenantId,
    });

    return authUri;
  }

  async handleCallback(
    tenantId: string,
    authorizationCode: string,
    realmId: string,
    redirectUri: string,
  ): Promise<QuickBooksConfig> {
    const oauthClient = this.oauthClients.get(tenantId) || new OAuthClient({
      clientId: process.env.QUICKBOOKS_CLIENT_ID!,
      clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET!,
      environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox',
      redirectUri,
    });

    const authResponse = await oauthClient.createToken(authorizationCode);
    const token = authResponse.getJson();

    const config: QuickBooksConfig = {
      id: `qb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tenantId,
      companyId: realmId,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
      isActive: true,
      createdAt: new Date(),
    };

    // Store in database
    await this.db.$executeRaw`
      INSERT INTO quickbooks_configs (id, tenant_id, company_id, access_token, refresh_token, token_expires_at, is_active, created_at)
      VALUES (${config.id}, ${tenantId}, ${config.companyId}, ${config.accessToken}, ${config.refreshToken}, ${config.tokenExpiresAt}, ${config.isActive}, NOW())
      ON CONFLICT (tenant_id) DO UPDATE SET
        company_id = ${config.companyId},
        access_token = ${config.accessToken},
        refresh_token = ${config.refreshToken},
        token_expires_at = ${config.tokenExpiresAt},
        is_active = ${config.isActive}
    `;

    // Store OAuth client for future use
    oauthClient.setToken(token);
    this.oauthClients.set(tenantId, oauthClient);

    return config;
  }

  async getConfig(tenantId: string): Promise<QuickBooksConfig> {
    const results = await this.db.$queryRaw<any[]>`
      SELECT * FROM quickbooks_configs WHERE tenant_id = ${tenantId} AND is_active = true
    `;

    if (results.length === 0) {
      throw new NotFoundException('QuickBooks not connected');
    }

    return results[0];
  }

  async refreshTokenIfNeeded(tenantId: string): Promise<void> {
    const config = await this.getConfig(tenantId);
    const now = new Date();

    // Refresh if expires within 5 minutes
    if (config.tokenExpiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
      const oauthClient = this.getOAuthClient(tenantId, config);

      try {
        const authResponse = await oauthClient.refresh();
        const token = authResponse.getJson();

        await this.db.$executeRaw`
          UPDATE quickbooks_configs
          SET access_token = ${token.access_token},
              refresh_token = ${token.refresh_token},
              token_expires_at = ${new Date(Date.now() + token.expires_in * 1000)}
          WHERE tenant_id = ${tenantId}
        `;

        // Update in-memory client
        oauthClient.setToken(token);
        this.oauthClients.set(tenantId, oauthClient);
      } catch (error) {
        throw new BadRequestException('Failed to refresh QuickBooks token');
      }
    }
  }

  private getOAuthClient(tenantId: string, config: QuickBooksConfig): OAuthClient {
    if (this.oauthClients.has(tenantId)) {
      return this.oauthClients.get(tenantId)!;
    }

    const oauthClient = new OAuthClient({
      clientId: process.env.QUICKBOOKS_CLIENT_ID!,
      clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET!,
      environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox',
      redirectUri: process.env.QUICKBOOKS_REDIRECT_URI!,
    });

    oauthClient.setToken({
      access_token: config.accessToken,
      refresh_token: config.refreshToken,
      expires_in: Math.floor((config.tokenExpiresAt.getTime() - Date.now()) / 1000),
    });

    this.oauthClients.set(tenantId, oauthClient);
    return oauthClient;
  }

  async disconnect(tenantId: string): Promise<void> {
    await this.db.$executeRaw`
      UPDATE quickbooks_configs SET is_active = false WHERE tenant_id = ${tenantId}
    `;

    this.oauthClients.delete(tenantId);
  }

  // ==================== API HELPERS ====================

  private async makeRequest(tenantId: string, method: string, endpoint: string, data?: any): Promise<any> {
    await this.refreshTokenIfNeeded(tenantId);

    const config = await this.getConfig(tenantId);
    const oauthClient = this.getOAuthClient(tenantId, config);

    const url = `${oauthClient.environment === 'sandbox' ? 'https://sandbox-quickbooks.api.intuit.com' : 'https://quickbooks.api.intuit.com'}/v3/company/${config.companyId}${endpoint}`;

    try {
      const response = await oauthClient.makeApiCall({
        url,
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: data ? JSON.stringify(data) : undefined,
      });

      return response.getJson();
    } catch (error: any) {
      throw new BadRequestException(`QuickBooks API error: ${error.message}`);
    }
  }

  // ==================== CUSTOMER SYNC ====================

  async syncCustomers(tenantId: string, direction: 'to_qb' | 'from_qb' | 'both' = 'both'): Promise<SyncResult> {
    const startTime = Date.now();
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    try {
      if (direction === 'to_qb' || direction === 'both') {
        // Sync CRM customers to QuickBooks
        const crmCustomers = await this.db.customer.findMany({
          where: { tenantId },
        });

        for (const customer of crmCustomers) {
          try {
            await this.createOrUpdateCustomer(tenantId, customer);
            synced++;
          } catch (error: any) {
            failed++;
            errors.push(`Customer ${customer.id}: ${error.message}`);
          }
        }
      }

      if (direction === 'from_qb' || direction === 'both') {
        // Sync QuickBooks customers to CRM
        const qbCustomers = await this.queryQuickBooks(tenantId, "SELECT * FROM Customer WHERE Active = true");

        for (const qbCustomer of qbCustomers.QueryResponse?.Customer || []) {
          try {
            await this.importCustomerFromQB(tenantId, qbCustomer);
            synced++;
          } catch (error: any) {
            failed++;
            errors.push(`QB Customer ${qbCustomer.Id}: ${error.message}`);
          }
        }
      }

      await this.updateLastSync(tenantId);

      return {
        entityType: 'customer',
        synced,
        failed,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      throw new BadRequestException(`Customer sync failed: ${error.message}`);
    }
  }

  private async createOrUpdateCustomer(tenantId: string, crmCustomer: any): Promise<void> {
    // Check if customer already exists in QB
    const qbCustomerId = crmCustomer.quickbooksId;

    const qbCustomer: QuickBooksCustomer = {
      DisplayName: crmCustomer.name || `${crmCustomer.firstName} ${crmCustomer.lastName}`,
      PrimaryEmailAddr: crmCustomer.email ? { Address: crmCustomer.email } : undefined,
      PrimaryPhone: crmCustomer.phone ? { FreeFormNumber: crmCustomer.phone } : undefined,
      CompanyName: crmCustomer.companyName,
    };

    if (qbCustomerId) {
      // Update existing customer
      const existing = await this.makeRequest(tenantId, 'GET', `/customer/${qbCustomerId}`);
      qbCustomer.Id = qbCustomerId;

      await this.makeRequest(tenantId, 'POST', '/customer', {
        ...qbCustomer,
        SyncToken: existing.Customer.SyncToken,
      });
    } else {
      // Create new customer
      const response = await this.makeRequest(tenantId, 'POST', '/customer', qbCustomer);

      // Store QB ID in CRM
      await this.db.customer.update({
        where: { id: crmCustomer.id },
        data: { quickbooksId: response.Customer.Id },
      });
    }
  }

  private async importCustomerFromQB(tenantId: string, qbCustomer: any): Promise<void> {
    // Check if customer already exists in CRM
    const existing = await this.db.customer.findFirst({
      where: {
        tenantId,
        quickbooksId: qbCustomer.Id,
      },
    });

    const customerData = {
      name: qbCustomer.DisplayName,
      email: qbCustomer.PrimaryEmailAddr?.Address,
      phone: qbCustomer.PrimaryPhone?.FreeFormNumber,
      companyName: qbCustomer.CompanyName,
      quickbooksId: qbCustomer.Id,
    };

    if (existing) {
      await this.db.customer.update({
        where: { id: existing.id },
        data: customerData,
      });
    } else {
      await this.db.customer.create({
        data: {
          ...customerData,
          tenantId,
        },
      });
    }
  }

  // ==================== INVOICE SYNC ====================

  async syncInvoices(tenantId: string, direction: 'to_qb' | 'from_qb' | 'both' = 'both'): Promise<SyncResult> {
    const startTime = Date.now();
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    try {
      if (direction === 'to_qb' || direction === 'both') {
        // Sync CRM invoices to QuickBooks
        const crmInvoices = await this.db.invoice.findMany({
          where: { tenantId },
          include: { job: true, customer: true },
        });

        for (const invoice of crmInvoices) {
          try {
            await this.createOrUpdateInvoice(tenantId, invoice);
            synced++;
          } catch (error: any) {
            failed++;
            errors.push(`Invoice ${invoice.id}: ${error.message}`);
          }
        }
      }

      if (direction === 'from_qb' || direction === 'both') {
        // Sync QuickBooks invoices to CRM
        const qbInvoices = await this.queryQuickBooks(tenantId, "SELECT * FROM Invoice");

        for (const qbInvoice of qbInvoices.QueryResponse?.Invoice || []) {
          try {
            await this.importInvoiceFromQB(tenantId, qbInvoice);
            synced++;
          } catch (error: any) {
            failed++;
            errors.push(`QB Invoice ${qbInvoice.Id}: ${error.message}`);
          }
        }
      }

      await this.updateLastSync(tenantId);

      return {
        entityType: 'invoice',
        synced,
        failed,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      throw new BadRequestException(`Invoice sync failed: ${error.message}`);
    }
  }

  private async createOrUpdateInvoice(tenantId: string, crmInvoice: any): Promise<void> {
    // Ensure customer has QB ID
    if (!crmInvoice.customer?.quickbooksId) {
      throw new BadRequestException('Customer must be synced to QuickBooks first');
    }

    const qbInvoice: QuickBooksInvoice = {
      CustomerRef: { value: crmInvoice.customer.quickbooksId },
      TxnDate: crmInvoice.issuedAt?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
      DueDate: crmInvoice.dueAt?.toISOString().split('T')[0],
      Line: [
        {
          Amount: crmInvoice.totalAmount,
          DetailType: 'SalesItemLineDetail',
          SalesItemLineDetail: {
            ItemRef: { value: '1', name: 'Services' }, // Default service item
            Qty: 1,
            UnitPrice: crmInvoice.totalAmount,
          },
          Description: crmInvoice.description || 'Roofing Services',
        },
      ],
      TotalAmt: crmInvoice.totalAmount,
      BillEmail: crmInvoice.customer.email ? { Address: crmInvoice.customer.email } : undefined,
    };

    if (crmInvoice.quickbooksId) {
      // Update existing invoice
      const existing = await this.makeRequest(tenantId, 'GET', `/invoice/${crmInvoice.quickbooksId}`);
      qbInvoice.Id = crmInvoice.quickbooksId;

      await this.makeRequest(tenantId, 'POST', '/invoice', {
        ...qbInvoice,
        SyncToken: existing.Invoice.SyncToken,
      });
    } else {
      // Create new invoice
      const response = await this.makeRequest(tenantId, 'POST', '/invoice', qbInvoice);

      // Store QB ID in CRM
      await this.db.invoice.update({
        where: { id: crmInvoice.id },
        data: { quickbooksId: response.Invoice.Id },
      });
    }
  }

  private async importInvoiceFromQB(tenantId: string, qbInvoice: any): Promise<void> {
    // Find corresponding customer
    const customer = await this.db.customer.findFirst({
      where: {
        tenantId,
        quickbooksId: qbInvoice.CustomerRef.value,
      },
    });

    if (!customer) {
      throw new BadRequestException('Customer not found in CRM');
    }

    const existing = await this.db.invoice.findFirst({
      where: {
        tenantId,
        quickbooksId: qbInvoice.Id,
      },
    });

    const invoiceData = {
      customerId: customer.id,
      totalAmount: qbInvoice.TotalAmt,
      issuedAt: new Date(qbInvoice.TxnDate),
      dueAt: qbInvoice.DueDate ? new Date(qbInvoice.DueDate) : undefined,
      status: qbInvoice.Balance === 0 ? 'PAID' : 'PENDING',
      quickbooksId: qbInvoice.Id,
    };

    if (existing) {
      await this.db.invoice.update({
        where: { id: existing.id },
        data: invoiceData,
      });
    } else {
      await this.db.invoice.create({
        data: {
          ...invoiceData,
          tenantId,
        },
      });
    }
  }

  // ==================== PAYMENT SYNC ====================

  async syncPayments(tenantId: string, direction: 'to_qb' | 'from_qb' | 'both' = 'both'): Promise<SyncResult> {
    const startTime = Date.now();
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    try {
      if (direction === 'from_qb' || direction === 'both') {
        // Sync QuickBooks payments to CRM
        const qbPayments = await this.queryQuickBooks(tenantId, "SELECT * FROM Payment");

        for (const qbPayment of qbPayments.QueryResponse?.Payment || []) {
          try {
            await this.importPaymentFromQB(tenantId, qbPayment);
            synced++;
          } catch (error: any) {
            failed++;
            errors.push(`QB Payment ${qbPayment.Id}: ${error.message}`);
          }
        }
      }

      await this.updateLastSync(tenantId);

      return {
        entityType: 'payment',
        synced,
        failed,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      throw new BadRequestException(`Payment sync failed: ${error.message}`);
    }
  }

  private async importPaymentFromQB(tenantId: string, qbPayment: any): Promise<void> {
    // Find corresponding customer
    const customer = await this.db.customer.findFirst({
      where: {
        tenantId,
        quickbooksId: qbPayment.CustomerRef.value,
      },
    });

    if (!customer) {
      throw new BadRequestException('Customer not found in CRM');
    }

    // Find corresponding invoice if linked
    let invoiceId: string | undefined;
    if (qbPayment.Line?.[0]?.LinkedTxn?.[0]?.TxnId) {
      const invoice = await this.db.invoice.findFirst({
        where: {
          tenantId,
          quickbooksId: qbPayment.Line[0].LinkedTxn[0].TxnId,
        },
      });
      invoiceId = invoice?.id;
    }

    const existing = await this.db.payment.findFirst({
      where: {
        tenantId,
        quickbooksId: qbPayment.Id,
      },
    });

    const paymentData = {
      customerId: customer.id,
      invoiceId,
      amount: qbPayment.TotalAmt,
      paidAt: new Date(qbPayment.TxnDate),
      method: qbPayment.PaymentMethodRef?.value || 'OTHER',
      quickbooksId: qbPayment.Id,
    };

    if (existing) {
      await this.db.payment.update({
        where: { id: existing.id },
        data: paymentData,
      });
    } else {
      await this.db.payment.create({
        data: {
          ...paymentData,
          tenantId,
        },
      });
    }

    // Update invoice status if linked
    if (invoiceId) {
      await this.db.invoice.update({
        where: { id: invoiceId },
        data: { status: 'PAID' },
      });
    }
  }

  // ==================== EXPENSE SYNC ====================

  async syncExpenses(tenantId: string, direction: 'to_qb' | 'from_qb' | 'both' = 'both'): Promise<SyncResult> {
    const startTime = Date.now();
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    try {
      if (direction === 'from_qb' || direction === 'both') {
        // Sync QuickBooks expenses to CRM
        const qbExpenses = await this.queryQuickBooks(tenantId, "SELECT * FROM Purchase WHERE PaymentType IN ('Cash', 'Check', 'CreditCard')");

        for (const qbExpense of qbExpenses.QueryResponse?.Purchase || []) {
          try {
            await this.importExpenseFromQB(tenantId, qbExpense);
            synced++;
          } catch (error: any) {
            failed++;
            errors.push(`QB Expense ${qbExpense.Id}: ${error.message}`);
          }
        }
      }

      await this.updateLastSync(tenantId);

      return {
        entityType: 'expense',
        synced,
        failed,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      throw new BadRequestException(`Expense sync failed: ${error.message}`);
    }
  }

  private async importExpenseFromQB(tenantId: string, qbExpense: any): Promise<void> {
    const existing = await this.db.expense.findFirst({
      where: {
        tenantId,
        quickbooksId: qbExpense.Id,
      },
    });

    const expenseData = {
      amount: qbExpense.TotalAmt,
      date: new Date(qbExpense.TxnDate),
      category: qbExpense.Line?.[0]?.AccountBasedExpenseLineDetail?.AccountRef?.name || 'General',
      description: qbExpense.Line?.[0]?.Description || 'Expense from QuickBooks',
      paymentMethod: qbExpense.PaymentType,
      quickbooksId: qbExpense.Id,
    };

    if (existing) {
      await this.db.expense.update({
        where: { id: existing.id },
        data: expenseData,
      });
    } else {
      await this.db.expense.create({
        data: {
          ...expenseData,
          tenantId,
        },
      });
    }
  }

  // ==================== QUERY HELPER ====================

  private async queryQuickBooks(tenantId: string, query: string): Promise<any> {
    return this.makeRequest(tenantId, 'GET', `/query?query=${encodeURIComponent(query)}`);
  }

  // ==================== ACCOUNT MAPPING ====================

  async getChartOfAccounts(tenantId: string): Promise<any[]> {
    const response = await this.queryQuickBooks(tenantId, "SELECT * FROM Account");
    return response.QueryResponse?.Account || [];
  }

  async createAccountMapping(tenantId: string, mapping: Omit<AccountMapping, 'tenantId'>): Promise<AccountMapping> {
    const accountMapping: AccountMapping = {
      tenantId,
      ...mapping,
    };

    await this.db.$executeRaw`
      INSERT INTO quickbooks_account_mappings (tenant_id, quickbooks_account_id, quickbooks_account_name, crm_account_type, crm_category)
      VALUES (${tenantId}, ${mapping.quickBooksAccountId}, ${mapping.quickBooksAccountName}, ${mapping.crmAccountType}, ${mapping.crmCategory})
    `;

    return accountMapping;
  }

  async getAccountMappings(tenantId: string): Promise<AccountMapping[]> {
    const results = await this.db.$queryRaw<AccountMapping[]>`
      SELECT * FROM quickbooks_account_mappings WHERE tenant_id = ${tenantId}
    `;

    return results;
  }

  // ==================== SYNC ALL ====================

  async syncAll(tenantId: string, direction: 'to_qb' | 'from_qb' | 'both' = 'both'): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    // Sync in order: customers first, then invoices, then payments, then expenses
    results.push(await this.syncCustomers(tenantId, direction));
    results.push(await this.syncInvoices(tenantId, direction));
    results.push(await this.syncPayments(tenantId, direction));
    results.push(await this.syncExpenses(tenantId, direction));

    return results;
  }

  private async updateLastSync(tenantId: string): Promise<void> {
    await this.db.$executeRaw`
      UPDATE quickbooks_configs SET last_sync_at = NOW() WHERE tenant_id = ${tenantId}
    `;
  }

  // ==================== WEBHOOKS ====================

  async handleWebhook(payload: any): Promise<void> {
    // QuickBooks webhooks for real-time sync
    const { eventNotifications } = payload;

    for (const event of eventNotifications || []) {
      const { realmId, dataChangeEvent } = event;

      // Find tenant by realm ID
      const config = await this.db.$queryRaw<any[]>`
        SELECT tenant_id FROM quickbooks_configs WHERE company_id = ${realmId}
      `;

      if (config.length === 0) continue;

      const tenantId = config[0].tenant_id;

      // Process each entity change
      for (const entity of dataChangeEvent.entities || []) {
        const { name, id, operation } = entity;

        try {
          if (name === 'Customer') {
            await this.syncCustomers(tenantId, 'from_qb');
          } else if (name === 'Invoice') {
            await this.syncInvoices(tenantId, 'from_qb');
          } else if (name === 'Payment') {
            await this.syncPayments(tenantId, 'from_qb');
          } else if (name === 'Purchase') {
            await this.syncExpenses(tenantId, 'from_qb');
          }
        } catch (error) {
          console.error(`Failed to process webhook for ${name} ${id}:`, error);
        }
      }
    }
  }
}
