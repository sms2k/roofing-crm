import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { IntegrationsService } from '../integrations/integrations.service';

/**
 * Canvassing Service
 * Field mapping, property tagging, and contact lookup for door-to-door sales
 */
@Injectable()
export class CanvassingService {
  private readonly logger = new Logger(CanvassingService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly integrations: IntegrationsService
  ) {}

  /**
   * Create canvassing area
   */
  async createArea(
    tenantId: string,
    data: {
      name: string;
      description?: string;
      bounds: any; // GeoJSON polygon
      zipCodes: string[];
      assignedTo?: string[];
      priority?: string;
    }
  ) {
    return this.db.canvassingArea.create({
      data: {
        tenantId,
        ...data,
        assignedTo: data.assignedTo || [],
        priority: data.priority || 'MEDIUM',
      },
    });
  }

  /**
   * Get canvassing areas
   */
  async getAreas(tenantId: string, filters?: {
    status?: string;
    assignedTo?: string;
  }) {
    return this.db.canvassingArea.findMany({
      where: {
        tenantId,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.assignedTo && {
          assignedTo: {
            has: filters.assignedTo,
          },
        }),
      },
      include: {
        _count: {
          select: { pins: true },
        },
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  /**
   * Create canvassing pin (property tag)
   */
  async createPin(
    tenantId: string,
    userId: string,
    data: {
      areaId?: string;
      latitude: number;
      longitude: number;
      address?: string;
      status: string;
      roofCondition?: string;
      notes?: string;
      photos?: string[];
    }
  ) {
    const pin = await this.db.canvassingPin.create({
      data: {
        tenantId,
        ...data,
        contactedAt: new Date(),
        contactedBy: userId,
        photos: data.photos || [],
      },
    });

    // Attempt automatic property lookup if address provided
    if (data.address) {
      try {
        const lookup = await this.integrations.lookupProperty(tenantId, data.address);

        // Update pin with owner information
        await this.db.canvassingPin.update({
          where: { id: pin.id },
          data: {
            ownerName: lookup.ownerName,
            ownerPhone: lookup.ownerPhone,
            ownerEmail: lookup.ownerEmail,
            propertyData: lookup.cachedData,
          },
        });

        return { ...pin, ownerInfo: lookup };
      } catch (error) {
        this.logger.warn(`Property lookup failed for ${data.address}:`, error.message);
        return pin;
      }
    }

    return pin;
  }

  /**
   * Update pin status
   */
  async updatePin(pinId: string, data: {
    status?: string;
    roofCondition?: string;
    notes?: string;
    photos?: string[];
  }) {
    return this.db.canvassingPin.update({
      where: { id: pinId },
      data,
    });
  }

  /**
   * Create lead from canvassing pin
   */
  async createLeadFromPin(pinId: string, tenantId: string, userId: string) {
    const pin = await this.db.canvassingPin.findUnique({
      where: { id: pinId },
    });

    if (!pin) {
      throw new Error('Pin not found');
    }

    if (pin.leadCreated) {
      throw new Error('Lead already created from this pin');
    }

    // Extract name parts
    const nameParts = pin.ownerName?.split(' ') || ['Unknown'];
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || 'Unknown';

    // Create contact
    const contact = await this.db.contact.create({
      data: {
        tenantId,
        firstName,
        lastName,
        phone: pin.ownerPhone,
        email: pin.ownerEmail,
        address: pin.address ? JSON.parse(JSON.stringify({ street: pin.address })) : null,
        preferredContact: 'PHONE',
        tags: ['Canvassing'],
      },
    });

    // Create property if address available
    let property = null;
    if (pin.address) {
      property = await this.db.property.create({
        data: {
          tenantId,
          address: { street: pin.address },
          condition: pin.roofCondition,
        },
      });
    }

    // Create lead
    const lead = await this.db.lead.create({
      data: {
        tenantId,
        source: 'CANVASSING',
        status: pin.status === 'INTERESTED' ? 'QUALIFIED' : 'NEW',
        contactId: contact.id,
        propertyId: property?.id,
        assignedToId: userId,
        urgency: pin.roofCondition === 'DAMAGED' ? 'HIGH' : 'MEDIUM',
        tags: ['Canvassing', pin.roofCondition].filter(Boolean),
        customFields: {
          canvassingPinId: pin.id,
          notes: pin.notes,
        },
      },
    });

    // Update pin
    await this.db.canvassingPin.update({
      where: { id: pinId },
      data: {
        leadCreated: true,
        leadId: lead.id,
      },
    });

    // Update area stats
    if (pin.areaId) {
      await this.updateAreaStats(pin.areaId);
    }

    return { lead, contact, property };
  }

  /**
   * Update area statistics
   */
  async updateAreaStats(areaId: string) {
    const pins = await this.db.canvassingPin.findMany({
      where: { areaId },
    });

    const stats = {
      totalHouses: pins.length,
      contacted: pins.filter(p => p.contactedAt).length,
      interested: pins.filter(p => p.status === 'INTERESTED').length,
    };

    return this.db.canvassingArea.update({
      where: { id: areaId },
      data: stats,
    });
  }

  /**
   * Get pins in area
   */
  async getPinsInArea(areaId: string) {
    return this.db.canvassingPin.findMany({
      where: { areaId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get pins by status
   */
  async getPinsByStatus(tenantId: string, status: string) {
    return this.db.canvassingPin.findMany({
      where: { tenantId, status },
      include: {
        area: true,
        lead: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get canvassing performance metrics
   */
  async getPerformanceMetrics(tenantId: string, userId?: string, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const pins = await this.db.canvassingPin.findMany({
      where: {
        tenantId,
        ...(userId && { contactedBy: userId }),
        createdAt: { gte: since },
      },
    });

    const total = pins.length;
    const interested = pins.filter(p => p.status === 'INTERESTED').length;
    const leadsCreated = pins.filter(p => p.leadCreated).length;
    const notHome = pins.filter(p => p.status === 'NOT_HOME').length;
    const notInterested = pins.filter(p => p.status === 'NOT_INTERESTED').length;

    // Get revenue from canvassing leads
    const leads = pins.filter(p => p.leadId).map(p => p.leadId);
    const jobs = await this.db.job.findMany({
      where: {
        tenantId,
        leadId: { in: leads },
      },
    });

    const revenue = jobs.reduce((sum, job) => sum + (job.value || 0), 0);

    return {
      doors: {
        total,
        contacted: total - notHome,
        contactRate: total ? ((total - notHome) / total) * 100 : 0,
      },
      interest: {
        interested,
        notInterested,
        interestRate: total ? (interested / total) * 100 : 0,
      },
      leads: {
        created: leadsCreated,
        conversionRate: total ? (leadsCreated / total) * 100 : 0,
      },
      revenue: {
        total: revenue,
        perDoor: total ? revenue / total : 0,
        jobs: jobs.length,
        averageJobValue: jobs.length ? revenue / jobs.length : 0,
      },
    };
  }

  /**
   * Optimize canvassing route
   */
  async optimizeRoute(pinIds: string[]) {
    const pins = await this.db.canvassingPin.findMany({
      where: { id: { in: pinIds } },
    });

    // Simple nearest-neighbor algorithm
    // Start from first pin and always go to nearest unvisited pin
    const route: typeof pins = [];
    const unvisited = [...pins];

    let current = unvisited.shift();
    route.push(current);

    while (unvisited.length > 0) {
      let nearestIndex = 0;
      let nearestDistance = this.calculateDistance(
        current.latitude,
        current.longitude,
        unvisited[0].latitude,
        unvisited[0].longitude
      );

      for (let i = 1; i < unvisited.length; i++) {
        const distance = this.calculateDistance(
          current.latitude,
          current.longitude,
          unvisited[i].latitude,
          unvisited[i].longitude
        );

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = i;
        }
      }

      current = unvisited.splice(nearestIndex, 1)[0];
      route.push(current);
    }

    return route;
  }

  /**
   * Calculate distance between two points (Haversine formula)
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3959; // Earth's radius in miles
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Export canvassing data
   */
  async exportData(areaId: string, format: 'csv' | 'json' = 'csv') {
    const pins = await this.getPinsInArea(areaId);

    if (format === 'json') {
      return pins;
    }

    // Convert to CSV
    const headers = [
      'Address',
      'Status',
      'Roof Condition',
      'Owner Name',
      'Owner Phone',
      'Notes',
      'Contacted At',
      'Lead Created',
    ];

    const rows = pins.map(pin => [
      pin.address || '',
      pin.status,
      pin.roofCondition || '',
      pin.ownerName || '',
      pin.ownerPhone || '',
      pin.notes || '',
      pin.contactedAt?.toISOString() || '',
      pin.leadCreated ? 'Yes' : 'No',
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');

    return csv;
  }
}
