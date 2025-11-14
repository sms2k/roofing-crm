import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * Storm Tracking Service
 * Integrates with NOAA, weather services, and hail mapping
 */
@Injectable()
export class StormService {
  private readonly logger = new Logger(StormService.name);
  private readonly noaaBaseUrl = 'https://www.ncdc.noaa.gov/stormevents/csv';

  constructor(
    private readonly db: DatabaseService,
    private readonly httpService: HttpService
  ) {}

  /**
   * Fetch storm events from NOAA
   */
  async fetchNOAAStormEvents(
    startDate: Date,
    endDate: Date,
    states: string[]
  ) {
    // NOAA Storm Events Database API
    // https://www.ncdc.noaa.gov/stormevents/

    try {
      const response = await firstValueFrom(
        this.httpService.get(this.noaaBaseUrl, {
          params: {
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            states: states.join(','),
          },
        })
      );

      // Parse CSV response and create storm reports
      const events = this.parseNOAAResponse(response.data);

      return events;
    } catch (error) {
      this.logger.error('NOAA API error:', error);
      throw error;
    }
  }

  /**
   * Parse NOAA CSV response
   */
  private parseNOAAResponse(csvData: string) {
    // Simplified CSV parsing
    // In production, use a proper CSV parser like papaparse
    const lines = csvData.split('\n');
    const headers = lines[0].split(',');

    return lines.slice(1).map(line => {
      const values = line.split(',');
      const event: any = {};

      headers.forEach((header, index) => {
        event[header] = values[index];
      });

      return event;
    });
  }

  /**
   * Create storm report
   */
  async createStormReport(
    tenantId: string,
    data: {
      name?: string;
      type: string;
      date: Date;
      latitude: number;
      longitude: number;
      radius?: number;
      hailSize?: number;
      windSpeed?: number;
      severity: string;
      noaaEventId?: string;
    }
  ) {
    // Calculate affected zip codes based on radius
    const affectedZips = await this.calculateAffectedZips(
      data.latitude,
      data.longitude,
      data.radius || 25
    );

    return this.db.stormReport.create({
      data: {
        tenantId,
        ...data,
        affectedZips,
        affectedCities: [], // Would calculate from zips
      },
    });
  }

  /**
   * Calculate affected zip codes within radius
   */
  private async calculateAffectedZips(
    latitude: number,
    longitude: number,
    radiusMiles: number
  ): Promise<string[]> {
    // Simplified zip code calculation
    // In production, use a zip code database with lat/lng data
    // and calculate distance using Haversine formula

    // Placeholder: return some zips
    return ['75001', '75002', '75003'];
  }

  /**
   * Get hail reports for storm
   */
  async getHailReports(
    latitude: number,
    longitude: number,
    radiusMiles: number,
    startTime: Date,
    endTime: Date
  ) {
    // Convert radius to approximate lat/lng bounds
    const latDelta = radiusMiles / 69; // Approx miles per degree latitude
    const lngDelta = radiusMiles / 54.6; // Approx miles per degree longitude at mid-latitudes

    return this.db.hailReport.findMany({
      where: {
        latitude: {
          gte: latitude - latDelta,
          lte: latitude + latDelta,
        },
        longitude: {
          gte: longitude - lngDelta,
          lte: longitude + lngDelta,
        },
        timestamp: {
          gte: startTime,
          lte: endTime,
        },
      },
      orderBy: {
        size: 'desc', // Largest hail first
      },
    });
  }

  /**
   * Create hail report
   */
  async createHailReport(
    stormId: string,
    data: {
      latitude: number;
      longitude: number;
      size: number;
      timestamp: Date;
      source: string;
      verified?: boolean;
    }
  ) {
    return this.db.hailReport.create({
      data: {
        stormId,
        ...data,
        verified: data.verified || false,
      },
    });
  }

  /**
   * Get weather alerts from NOAA
   */
  async fetchWeatherAlerts(tenantId: string, zipCodes: string[]) {
    try {
      // NOAA Weather Alerts API
      // https://api.weather.gov/alerts/active

      const response = await firstValueFrom(
        this.httpService.get('https://api.weather.gov/alerts/active', {
          params: {
            zone: zipCodes.join(','),
          },
        })
      );

      const alerts = response.data.features;

      // Create alert records
      for (const alert of alerts) {
        const properties = alert.properties;

        await this.db.weatherAlert.create({
          data: {
            tenantId,
            type: this.parseAlertType(properties.event),
            severity: properties.severity,
            headline: properties.headline,
            description: properties.description,
            affectedZips: zipCodes,
            affectedCounties: properties.areaDesc?.split(';') || [],
            startTime: new Date(properties.effective),
            endTime: properties.expires ? new Date(properties.expires) : null,
            noaaId: alert.id,
            urgency: properties.urgency,
            certainty: properties.certainty,
          },
        });
      }

      return alerts;
    } catch (error) {
      this.logger.error('Weather alerts fetch error:', error);
      throw error;
    }
  }

  /**
   * Parse alert event type
   */
  private parseAlertType(event: string): string {
    if (event.includes('Tornado')) return 'TORNADO';
    if (event.includes('Thunderstorm')) return 'SEVERE_THUNDERSTORM';
    if (event.includes('Hail')) return 'HAIL';
    if (event.includes('Wind')) return 'WIND';
    return 'OTHER';
  }

  /**
   * Get storms in area
   */
  async getStormsInArea(
    tenantId: string,
    latitude: number,
    longitude: number,
    radiusMiles: number,
    days = 30
  ) {
    const latDelta = radiusMiles / 69;
    const lngDelta = radiusMiles / 54.6;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    return this.db.stormReport.findMany({
      where: {
        tenantId,
        latitude: {
          gte: latitude - latDelta,
          lte: latitude + latDelta,
        },
        longitude: {
          gte: longitude - lngDelta,
          lte: longitude + lngDelta,
        },
        date: {
          gte: since,
        },
      },
      include: {
        hailReports: true,
      },
      orderBy: {
        date: 'desc',
      },
    });
  }

  /**
   * Check if address is in storm-affected area
   */
  async isAddressAffected(address: string, stormId: string) {
    const storm = await this.db.stormReport.findUnique({
      where: { id: stormId },
    });

    // Extract zip from address
    const zipMatch = address.match(/\b\d{5}\b/);
    if (!zipMatch) return false;

    const zip = zipMatch[0];

    return storm.affectedZips.includes(zip);
  }

  /**
   * Create storm marketing campaign
   */
  async createStormCampaign(stormId: string, campaignData: any) {
    // Mark storm as targeted
    await this.db.stormReport.update({
      where: { id: stormId },
      data: {
        isTargeted: true,
        campaignId: campaignData.id,
      },
    });

    // Create leads from storm-affected properties
    // This would integrate with your canvassing system
    // to identify properties in affected areas

    return { success: true, campaignId: campaignData.id };
  }

  /**
   * Get storm analytics
   */
  async getStormAnalytics(tenantId: string, stormId: string) {
    const storm = await this.db.stormReport.findUnique({
      where: { id: stormId },
      include: {
        stormLeads: true,
        _count: {
          select: { stormLeads: true },
        },
      },
    });

    // Calculate conversion metrics
    const totalLeads = storm._count.stormLeads;
    const convertedLeads = storm.stormLeads.filter(
      lead => lead.status === 'CONVERTED'
    ).length;

    const jobs = await this.db.job.findMany({
      where: {
        tenantId,
        leadId: { in: storm.stormLeads.map(l => l.id) },
      },
    });

    const totalRevenue = jobs.reduce((sum, job) => sum + (job.value || 0), 0);

    return {
      storm: {
        name: storm.name,
        date: storm.date,
        type: storm.type,
        severity: storm.severity,
      },
      leads: {
        total: totalLeads,
        converted: convertedLeads,
        conversionRate: totalLeads ? (convertedLeads / totalLeads) * 100 : 0,
      },
      revenue: {
        total: totalRevenue,
        perLead: totalLeads ? totalRevenue / totalLeads : 0,
        jobs: jobs.length,
        averageJobValue: jobs.length ? totalRevenue / jobs.length : 0,
      },
    };
  }
}
