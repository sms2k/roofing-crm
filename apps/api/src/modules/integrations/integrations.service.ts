import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * Integrations Service
 * Manages third-party service integrations for roofing industry
 */
@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly httpService: HttpService
  ) {}

  /**
   * Configure integration for tenant
   */
  async configure(
    tenantId: string,
    provider: string,
    credentials: {
      apiKey?: string;
      apiSecret?: string;
      username?: string;
      password?: string;
    },
    config?: Record<string, any>
  ) {
    return this.db.integration.upsert({
      where: {
        tenantId_provider: { tenantId, provider },
      },
      create: {
        tenantId,
        provider,
        name: this.getProviderName(provider),
        ...credentials,
        config,
        isEnabled: true,
      },
      update: {
        ...credentials,
        config,
        isEnabled: true,
      },
    });
  }

  /**
   * Get provider display name
   */
  private getProviderName(provider: string): string {
    const names: Record<string, string> = {
      EAGLEVIEW: 'EagleView',
      QUICKMEASURE: 'QuickMeasure',
      HOVER: 'Hover',
      DEMANDIQ: 'DemandIQ',
      ROOFLE: 'Roofle',
      NOAA: 'NOAA Weather',
      HAILTRACE: 'HailTraceData',
      MELISSA_DATA: 'Melissa Data',
      PROPERTY_RADAR: 'Property Radar',
    };
    return names[provider] || provider;
  }

  /**
   * Get integration status
   */
  async getIntegration(tenantId: string, provider: string) {
    return this.db.integration.findUnique({
      where: {
        tenantId_provider: { tenantId, provider },
      },
    });
  }

  /**
   * Order EagleView report
   */
  async orderEagleViewReport(
    tenantId: string,
    propertyId: string,
    reportType = 'PremiumReport'
  ) {
    const integration = await this.getIntegration(tenantId, 'EAGLEVIEW');

    if (!integration || !integration.isEnabled) {
      throw new Error('EagleView integration not configured');
    }

    const property = await this.db.property.findUnique({
      where: { id: propertyId },
    });

    // Call EagleView API
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          'https://api.eagleview.com/v1/reports',
          {
            address: property.address,
            reportType,
          },
          {
            headers: {
              Authorization: `Bearer ${integration.apiKey}`,
            },
          }
        )
      );

      // Create measurement report record
      const report = await this.db.measurementReport.create({
        data: {
          tenantId,
          propertyId,
          provider: 'EAGLEVIEW',
          reportId: response.data.reportId,
          orderedAt: new Date(),
        },
      });

      // Update sync count
      await this.db.integration.update({
        where: { id: integration.id },
        data: {
          syncCount: { increment: 1 },
          lastSyncAt: new Date(),
        },
      });

      return report;
    } catch (error) {
      this.logger.error('EagleView API error:', error);
      throw new Error(`Failed to order EagleView report: ${error.message}`);
    }
  }

  /**
   * Get EagleView report status
   */
  async getEagleViewReportStatus(tenantId: string, reportId: string) {
    const integration = await this.getIntegration(tenantId, 'EAGLEVIEW');

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `https://api.eagleview.com/v1/reports/${reportId}`,
          {
            headers: {
              Authorization: `Bearer ${integration.apiKey}`,
            },
          }
        )
      );

      // Update measurement report if completed
      if (response.data.status === 'COMPLETED') {
        await this.db.measurementReport.updateMany({
          where: { reportId },
          data: {
            totalSquares: response.data.measurements.totalSquares,
            facets: response.data.measurements.facets,
            reportUrl: response.data.reportUrl,
            pdfUrl: response.data.pdfUrl,
            completedAt: new Date(),
          },
        });
      }

      return response.data;
    } catch (error) {
      this.logger.error('EagleView status check error:', error);
      throw error;
    }
  }

  /**
   * Property lookup via Melissa Data or similar
   */
  async lookupProperty(tenantId: string, address: string) {
    // Check cache first
    const cached = await this.db.propertyLookup.findUnique({
      where: {
        tenantId_address: { tenantId, address },
      },
    });

    // Return cached if not expired
    if (cached && cached.expiresAt && cached.expiresAt > new Date()) {
      return cached;
    }

    const integration = await this.getIntegration(tenantId, 'MELISSA_DATA');

    if (!integration || !integration.isEnabled) {
      throw new Error('Property lookup integration not configured');
    }

    try {
      // Call property lookup API
      const response = await firstValueFrom(
        this.httpService.get(
          'https://api.melissadata.com/property/lookup',
          {
            params: {
              address,
              id: integration.apiKey,
            },
          }
        )
      );

      const data = response.data;

      // Create or update cache
      const lookup = await this.db.propertyLookup.upsert({
        where: {
          tenantId_address: { tenantId, address },
        },
        create: {
          tenantId,
          address,
          ownerName: data.ownerName,
          ownerPhone: data.ownerPhone,
          ownerEmail: data.ownerEmail,
          mailingAddress: data.mailingAddress,
          yearBuilt: data.yearBuilt,
          squareFeet: data.squareFeet,
          propertyValue: data.propertyValue,
          source: 'MELISSA_DATA',
          confidence: data.confidence,
          cachedData: data,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
        update: {
          ownerName: data.ownerName,
          ownerPhone: data.ownerPhone,
          ownerEmail: data.ownerEmail,
          mailingAddress: data.mailingAddress,
          yearBuilt: data.yearBuilt,
          squareFeet: data.squareFeet,
          propertyValue: data.propertyValue,
          confidence: data.confidence,
          cachedData: data,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      // Update sync count
      await this.db.integration.update({
        where: { id: integration.id },
        data: {
          syncCount: { increment: 1 },
          lastSyncAt: new Date(),
        },
      });

      return lookup;
    } catch (error) {
      this.logger.error('Property lookup error:', error);
      throw new Error(`Property lookup failed: ${error.message}`);
    }
  }

  /**
   * Get instant estimate from DemandIQ
   */
  async getInstantEstimate(
    tenantId: string,
    propertyData: {
      address: string;
      squares?: number;
      roofType?: string;
      stories?: number;
    }
  ) {
    const integration = await this.getIntegration(tenantId, 'DEMANDIQ');

    if (!integration || !integration.isEnabled) {
      throw new Error('DemandIQ integration not configured');
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          'https://api.demandiq.com/estimate',
          propertyData,
          {
            headers: {
              'X-API-Key': integration.apiKey,
            },
          }
        )
      );

      return {
        lowEnd: response.data.lowEnd,
        highEnd: response.data.highEnd,
        average: response.data.average,
        breakdown: response.data.breakdown,
      };
    } catch (error) {
      this.logger.error('DemandIQ error:', error);
      throw error;
    }
  }

  /**
   * List all integrations for tenant
   */
  async listIntegrations(tenantId: string) {
    return this.db.integration.findMany({
      where: { tenantId },
      select: {
        id: true,
        provider: true,
        name: true,
        isEnabled: true,
        lastSyncAt: true,
        syncCount: true,
        // Don't expose credentials
      },
    });
  }

  /**
   * Toggle integration on/off
   */
  async toggleIntegration(integrationId: string, isEnabled: boolean) {
    return this.db.integration.update({
      where: { id: integrationId },
      data: { isEnabled },
    });
  }
}
