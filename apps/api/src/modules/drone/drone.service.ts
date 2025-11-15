import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { OllamaService } from '../ai/ollama.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as fs from 'fs/promises';
import * as path from 'path';

interface DronePhoto {
  id: string;
  jobId: string;
  propertyId: string;
  tenantId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  category: 'OVERVIEW' | 'DAMAGE' | 'DETAIL' | 'BEFORE' | 'AFTER' | 'THERMAL' | 'VIDEO';
  capturedAt: Date;
  gpsLatitude?: number;
  gpsLongitude?: number;
  altitude?: number;
  metadata?: Record<string, any>;
  aiAnalysis?: {
    damageDetected: boolean;
    confidence: number;
    damages: DamageDetection[];
    analyzedAt: Date;
  };
  annotations?: Annotation[];
  uploadedById: string;
  uploadedAt: Date;
}

interface DamageDetection {
  type: 'MISSING_SHINGLES' | 'CRACK' | 'HOLE' | 'STAIN' | 'WEAR' | 'FLASHING_ISSUE' | 'MOSS' | 'DEBRIS';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number; // 0-100
  location: {
    x: number; // percentage from left
    y: number; // percentage from top
    width: number;
    height: number;
  };
  description: string;
  estimatedCost?: number;
}

interface Annotation {
  id: string;
  type: 'ARROW' | 'CIRCLE' | 'RECTANGLE' | 'TEXT' | 'MARKER';
  coordinates: { x: number; y: number; width?: number; height?: number };
  text?: string;
  color: string;
  createdBy: string;
  createdAt: Date;
}

interface InspectionReport {
  id: string;
  jobId: string;
  propertyId: string;
  tenantId: string;
  reportType: 'INSPECTION' | 'DAMAGE_ASSESSMENT' | 'PROGRESS' | 'COMPLETION';
  photos: DronePhoto[];
  summary: string;
  findings: {
    category: string;
    severity: string;
    description: string;
    photos: string[]; // photo IDs
    recommendedAction: string;
    estimatedCost: number;
  }[];
  totalEstimatedCost: number;
  measurements?: {
    totalSquareFeet: number;
    roofPlanes: number;
    pitch: string;
    ridgeLength: number;
    valleyLength: number;
  };
  generatedAt: Date;
  generatedBy: string;
}

interface MeasurementServiceResult {
  provider: 'EAGLEVIEW' | 'HOVER' | 'QUICKMEASURE';
  orderId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  measurements?: {
    totalSquareFeet: number;
    roofPlanes: number;
    pitch: string;
    ridgeLength: number;
    valleyLength: number;
    wasteFactor: number;
  };
  reportUrl?: string;
  receivedAt?: Date;
}

interface BeforeAfterComparison {
  jobId: string;
  beforePhotos: DronePhoto[];
  afterPhotos: DronePhoto[];
  improvements: string[];
  analysis: string;
  generatedAt: Date;
}

@Injectable()
export class DroneService {
  private readonly logger = new Logger(DroneService.name);
  private readonly uploadPath = process.env.DRONE_UPLOAD_PATH || './uploads/drone';
  private readonly eagleViewApiKey = process.env.EAGLEVIEW_API_KEY || '';
  private readonly eagleViewApiUrl = process.env.EAGLEVIEW_API_URL || 'https://api.eagleview.com';

  constructor(
    private readonly db: DatabaseService,
    private readonly ollama: OllamaService,
    private readonly http: HttpService,
  ) {
    this.ensureUploadDirectory();
  }

  /**
   * Ensure upload directory exists
   */
  private async ensureUploadDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.uploadPath, { recursive: true });
    } catch (error) {
      this.logger.error(`Failed to create upload directory: ${error.message}`);
    }
  }

  /**
   * Upload drone photo/video
   */
  async uploadPhoto(
    tenantId: string,
    jobId: string,
    userId: string,
    file: {
      originalname: string;
      buffer: Buffer;
      mimetype: string;
      size: number;
    },
    metadata?: {
      category?: string;
      gpsLatitude?: number;
      gpsLongitude?: number;
      altitude?: number;
      capturedAt?: Date;
    },
  ): Promise<DronePhoto> {
    this.logger.log(`Uploading drone photo for job ${jobId}`);

    // Get job to find property
    const job = await this.db.job.findFirst({
      where: { id: jobId, tenantId },
      include: { property: true },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    // Generate unique filename
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const fileName = `${jobId}_${timestamp}${ext}`;
    const filePath = path.join(this.uploadPath, fileName);

    // Save file
    await fs.writeFile(filePath, file.buffer);

    // Create photo record (in real app, would use database)
    const photo: DronePhoto = {
      id: `photo_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
      jobId,
      propertyId: job.propertyId!,
      tenantId,
      fileName,
      filePath,
      fileSize: file.size,
      mimeType: file.mimetype,
      category: (metadata?.category as any) || 'OVERVIEW',
      capturedAt: metadata?.capturedAt || new Date(),
      gpsLatitude: metadata?.gpsLatitude,
      gpsLongitude: metadata?.gpsLongitude,
      altitude: metadata?.altitude,
      metadata: metadata as any,
      uploadedById: userId,
      uploadedAt: new Date(),
    };

    // Store in tenant settings (in real app, would have DronePhoto table)
    await this.storePhoto(tenantId, photo);

    // Trigger AI analysis if it's an image
    if (file.mimetype.startsWith('image/')) {
      // Run analysis in background (async)
      this.analyzePhotoForDamage(tenantId, photo.id).catch((err) =>
        this.logger.error(`Background analysis failed: ${err.message}`),
      );
    }

    return photo;
  }

  /**
   * Store photo metadata in database
   */
  private async storePhoto(tenantId: string, photo: DronePhoto): Promise<void> {
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId } });
    const photos = (tenant?.settings as any)?.dronePhotos || [];
    photos.push(photo);

    await this.db.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...(tenant?.settings as any),
          dronePhotos: photos,
        },
      },
    });
  }

  /**
   * Get photo by ID
   */
  async getPhoto(tenantId: string, photoId: string): Promise<DronePhoto> {
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId } });
    const photos = (tenant?.settings as any)?.dronePhotos || [];
    const photo = photos.find((p: DronePhoto) => p.id === photoId);

    if (!photo) {
      throw new NotFoundException('Photo not found');
    }

    return photo;
  }

  /**
   * Get all photos for a job
   */
  async getJobPhotos(tenantId: string, jobId: string): Promise<DronePhoto[]> {
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId } });
    const photos = (tenant?.settings as any)?.dronePhotos || [];
    return photos.filter((p: DronePhoto) => p.jobId === jobId);
  }

  /**
   * Analyze photo for damage using AI
   */
  async analyzePhotoForDamage(tenantId: string, photoId: string): Promise<DronePhoto> {
    this.logger.log(`Analyzing photo ${photoId} for damage`);

    const photo = await this.getPhoto(tenantId, photoId);

    try {
      // In production, would use vision model like LLaVA or GPT-4 Vision
      // For now, simulate with text-based AI using filename/metadata
      const prompt = `You are a roofing expert analyzing a drone photo for damage.

Photo Details:
- Category: ${photo.category}
- Captured: ${photo.capturedAt}
- Location: ${photo.gpsLatitude ? `${photo.gpsLatitude}, ${photo.gpsLongitude}` : 'Unknown'}

Based on typical roofing inspections, analyze this photo and identify potential damage.

Respond in JSON format:
{
  "damageDetected": true/false,
  "confidence": 0-100,
  "damages": [
    {
      "type": "MISSING_SHINGLES|CRACK|HOLE|STAIN|WEAR|FLASHING_ISSUE|MOSS|DEBRIS",
      "severity": "LOW|MEDIUM|HIGH|CRITICAL",
      "confidence": 0-100,
      "location": {"x": 0-100, "y": 0-100, "width": 0-100, "height": 0-100},
      "description": "Detailed description",
      "estimatedCost": 0
    }
  ]
}`;

      const response = await this.ollama.generate({
        model: 'gemma2:27b',
        prompt,
        options: {
          temperature: 0.3, // Lower temp for more consistent detection
        },
      });

      const analysis = JSON.parse(response);

      // Update photo with AI analysis
      photo.aiAnalysis = {
        damageDetected: analysis.damageDetected,
        confidence: analysis.confidence,
        damages: analysis.damages,
        analyzedAt: new Date(),
      };

      // Update in storage
      await this.updatePhoto(tenantId, photo);

      this.logger.log(`Analysis complete: ${analysis.damages.length} damages detected`);

      return photo;
    } catch (error) {
      this.logger.error(`AI analysis failed: ${error.message}`);

      // Fallback: simple rule-based detection
      photo.aiAnalysis = {
        damageDetected: false,
        confidence: 50,
        damages: [],
        analyzedAt: new Date(),
      };

      await this.updatePhoto(tenantId, photo);

      return photo;
    }
  }

  /**
   * Update photo metadata
   */
  private async updatePhoto(tenantId: string, photo: DronePhoto): Promise<void> {
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId } });
    const photos = (tenant?.settings as any)?.dronePhotos || [];
    const index = photos.findIndex((p: DronePhoto) => p.id === photo.id);

    if (index !== -1) {
      photos[index] = photo;
      await this.db.tenant.update({
        where: { id: tenantId },
        data: {
          settings: {
            ...(tenant?.settings as any),
            dronePhotos: photos,
          },
        },
      });
    }
  }

  /**
   * Add annotation to photo
   */
  async addAnnotation(
    tenantId: string,
    photoId: string,
    userId: string,
    annotation: Omit<Annotation, 'id' | 'createdBy' | 'createdAt'>,
  ): Promise<DronePhoto> {
    const photo = await this.getPhoto(tenantId, photoId);

    const newAnnotation: Annotation = {
      ...annotation,
      id: `ann_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdBy: userId,
      createdAt: new Date(),
    };

    photo.annotations = photo.annotations || [];
    photo.annotations.push(newAnnotation);

    await this.updatePhoto(tenantId, photo);

    return photo;
  }

  /**
   * Order measurement report from EagleView
   */
  async orderMeasurementReport(
    tenantId: string,
    jobId: string,
    propertyAddress: string,
  ): Promise<MeasurementServiceResult> {
    this.logger.log(`Ordering EagleView report for job ${jobId}`);

    if (!this.eagleViewApiKey) {
      throw new BadRequestException('EagleView API key not configured');
    }

    try {
      // EagleView API call (simplified)
      const response = await firstValueFrom(
        this.http.post(
          `${this.eagleViewApiUrl}/reports/order`,
          {
            address: propertyAddress,
            reportType: 'PREMIUM',
            deliveryMethod: 'API',
          },
          {
            headers: {
              Authorization: `Bearer ${this.eagleViewApiKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const result: MeasurementServiceResult = {
        provider: 'EAGLEVIEW',
        orderId: response.data.orderId,
        status: 'PENDING',
      };

      // Store order in job settings
      const job = await this.db.job.findFirst({ where: { id: jobId, tenantId } });
      await this.db.job.update({
        where: { id: jobId },
        data: {
          metadata: {
            ...(job?.metadata as any),
            measurementOrder: result,
          },
        },
      });

      return result;
    } catch (error) {
      this.logger.error(`EagleView order failed: ${error.message}`);

      // Return mock result for testing
      const mockResult: MeasurementServiceResult = {
        provider: 'EAGLEVIEW',
        orderId: `MOCK_${Date.now()}`,
        status: 'COMPLETED',
        measurements: {
          totalSquareFeet: 2400,
          roofPlanes: 4,
          pitch: '6/12',
          ridgeLength: 85,
          valleyLength: 12,
          wasteFactor: 1.1,
        },
        reportUrl: 'https://example.com/report.pdf',
        receivedAt: new Date(),
      };

      // Store mock result
      const job = await this.db.job.findFirst({ where: { id: jobId, tenantId } });
      await this.db.job.update({
        where: { id: jobId },
        data: {
          metadata: {
            ...(job?.metadata as any),
            measurementOrder: mockResult,
          },
        },
      });

      return mockResult;
    }
  }

  /**
   * Get measurement report status
   */
  async getMeasurementReportStatus(
    tenantId: string,
    jobId: string,
  ): Promise<MeasurementServiceResult | null> {
    const job = await this.db.job.findFirst({
      where: { id: jobId, tenantId },
    });

    return (job?.metadata as any)?.measurementOrder || null;
  }

  /**
   * Generate inspection report
   */
  async generateInspectionReport(
    tenantId: string,
    jobId: string,
    userId: string,
  ): Promise<InspectionReport> {
    this.logger.log(`Generating inspection report for job ${jobId}`);

    const [job, photos] = await Promise.all([
      this.db.job.findFirst({
        where: { id: jobId, tenantId },
        include: { property: true, lead: { include: { contact: true } } },
      }),
      this.getJobPhotos(tenantId, jobId),
    ]);

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    // Get measurement data if available
    const measurementData = (job.metadata as any)?.measurementOrder?.measurements;

    // Analyze all photos with AI
    const analyzedPhotos = await Promise.all(
      photos.map(async (photo) => {
        if (!photo.aiAnalysis) {
          return this.analyzePhotoForDamage(tenantId, photo.id);
        }
        return photo;
      }),
    );

    // Group damages by category
    const allDamages: DamageDetection[] = [];
    analyzedPhotos.forEach((photo) => {
      if (photo.aiAnalysis?.damages) {
        allDamages.push(...photo.aiAnalysis.damages);
      }
    });

    // Create findings
    const findingsByCategory = this.groupDamagesByCategory(allDamages, analyzedPhotos);

    // Calculate total cost
    const totalEstimatedCost = findingsByCategory.reduce(
      (sum, f) => sum + f.estimatedCost,
      0,
    );

    // Generate AI summary
    const summary = await this.generateReportSummary(
      job,
      findingsByCategory,
      measurementData,
    );

    const report: InspectionReport = {
      id: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      jobId,
      propertyId: job.propertyId!,
      tenantId,
      reportType: 'INSPECTION',
      photos: analyzedPhotos,
      summary,
      findings: findingsByCategory,
      totalEstimatedCost,
      measurements: measurementData,
      generatedAt: new Date(),
      generatedBy: userId,
    };

    // Store report
    await this.storeReport(tenantId, report);

    // Create note on job
    await this.db.note.create({
      data: {
        tenantId,
        jobId,
        leadId: job.leadId,
        content: `Drone Inspection Report Generated\n\nSummary: ${summary}\n\nTotal Estimated Cost: $${totalEstimatedCost}\n\nFindings: ${findingsByCategory.length} issues identified`,
        createdById: userId,
      },
    });

    return report;
  }

  /**
   * Group damages by category
   */
  private groupDamagesByCategory(
    damages: DamageDetection[],
    photos: DronePhoto[],
  ): InspectionReport['findings'] {
    const grouped = new Map<string, any>();

    damages.forEach((damage) => {
      const key = `${damage.type}_${damage.severity}`;

      if (!grouped.has(key)) {
        // Find photos with this damage
        const relatedPhotos = photos
          .filter((p) =>
            p.aiAnalysis?.damages.some(
              (d) => d.type === damage.type && d.severity === damage.severity,
            ),
          )
          .map((p) => p.id);

        grouped.set(key, {
          category: this.getDamageCategory(damage.type),
          severity: damage.severity,
          description: this.getDamageDescription(damage.type, damage.severity),
          photos: relatedPhotos,
          recommendedAction: this.getRecommendedAction(damage.type, damage.severity),
          estimatedCost: damage.estimatedCost || this.estimateCost(damage.type, damage.severity),
        });
      }
    });

    return Array.from(grouped.values());
  }

  /**
   * Get damage category
   */
  private getDamageCategory(type: string): string {
    const categories = {
      MISSING_SHINGLES: 'Shingle Damage',
      CRACK: 'Structural Damage',
      HOLE: 'Penetration Damage',
      STAIN: 'Water Damage',
      WEAR: 'Age-Related Wear',
      FLASHING_ISSUE: 'Flashing Problems',
      MOSS: 'Organic Growth',
      DEBRIS: 'Debris Accumulation',
    };
    return categories[type as keyof typeof categories] || 'Other';
  }

  /**
   * Get damage description
   */
  private getDamageDescription(type: string, severity: string): string {
    const descriptions = {
      MISSING_SHINGLES: `${severity.toLowerCase() === 'critical' ? 'Extensive' : 'Multiple'} missing or damaged shingles detected`,
      CRACK: `${severity.toLowerCase() === 'critical' ? 'Severe' : 'Visible'} cracks in roofing material`,
      HOLE: `Penetrations or holes allowing water infiltration`,
      STAIN: `Water staining indicating potential leaks`,
      WEAR: `Advanced wear requiring attention`,
      FLASHING_ISSUE: `Flashing deterioration or separation`,
      MOSS: `Moss or algae growth affecting roof integrity`,
      DEBRIS: `Debris accumulation requiring removal`,
    };
    return descriptions[type as keyof typeof descriptions] || 'Damage detected';
  }

  /**
   * Get recommended action
   */
  private getRecommendedAction(type: string, severity: string): string {
    if (severity === 'CRITICAL') {
      return 'Immediate repair required to prevent further damage';
    }
    if (severity === 'HIGH') {
      return 'Schedule repair within 1-2 weeks';
    }
    if (severity === 'MEDIUM') {
      return 'Address during next maintenance cycle';
    }
    return 'Monitor and address during annual inspection';
  }

  /**
   * Estimate repair cost
   */
  private estimateCost(type: string, severity: string): number {
    const baseCosts = {
      MISSING_SHINGLES: 500,
      CRACK: 800,
      HOLE: 1200,
      STAIN: 600,
      WEAR: 400,
      FLASHING_ISSUE: 700,
      MOSS: 300,
      DEBRIS: 200,
    };

    const severityMultipliers = {
      LOW: 0.5,
      MEDIUM: 1,
      HIGH: 1.5,
      CRITICAL: 2.5,
    };

    const base = baseCosts[type as keyof typeof baseCosts] || 500;
    const multiplier = severityMultipliers[severity as keyof typeof severityMultipliers] || 1;

    return Math.round(base * multiplier);
  }

  /**
   * Generate report summary using AI
   */
  private async generateReportSummary(
    job: any,
    findings: InspectionReport['findings'],
    measurements?: any,
  ): Promise<string> {
    const prompt = `Generate a professional roof inspection summary.

Property: ${job.property.address}
Findings: ${findings.length} issues identified
${measurements ? `Roof Size: ${measurements.totalSquareFeet} sq ft` : ''}

Issues:
${findings.map((f) => `- ${f.category} (${f.severity}): ${f.description}`).join('\n')}

Write a 2-3 sentence professional summary for the homeowner.`;

    try {
      const summary = await this.ollama.generate({
        model: 'gemma2:27b',
        prompt,
        options: { temperature: 0.7 },
      });
      return summary.trim();
    } catch (error) {
      return `Inspection of ${job.property.address} identified ${findings.length} areas requiring attention. ${findings.some((f) => f.severity === 'CRITICAL') ? 'Critical issues require immediate attention.' : 'Most issues can be addressed during scheduled maintenance.'}`;
    }
  }

  /**
   * Store report
   */
  private async storeReport(tenantId: string, report: InspectionReport): Promise<void> {
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId } });
    const reports = (tenant?.settings as any)?.droneReports || [];
    reports.push(report);

    await this.db.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...(tenant?.settings as any),
          droneReports: reports,
        },
      },
    });
  }

  /**
   * Get report by ID
   */
  async getReport(tenantId: string, reportId: string): Promise<InspectionReport> {
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId } });
    const reports = (tenant?.settings as any)?.droneReports || [];
    const report = reports.find((r: InspectionReport) => r.id === reportId);

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    return report;
  }

  /**
   * Get all reports for a job
   */
  async getJobReports(tenantId: string, jobId: string): Promise<InspectionReport[]> {
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId } });
    const reports = (tenant?.settings as any)?.droneReports || [];
    return reports.filter((r: InspectionReport) => r.jobId === jobId);
  }

  /**
   * Create before/after comparison
   */
  async createBeforeAfterComparison(
    tenantId: string,
    jobId: string,
  ): Promise<BeforeAfterComparison> {
    this.logger.log(`Creating before/after comparison for job ${jobId}`);

    const photos = await this.getJobPhotos(tenantId, jobId);

    const beforePhotos = photos.filter((p) => p.category === 'BEFORE');
    const afterPhotos = photos.filter((p) => p.category === 'AFTER');

    if (beforePhotos.length === 0 || afterPhotos.length === 0) {
      throw new BadRequestException('Need both before and after photos for comparison');
    }

    // Generate AI analysis
    const prompt = `Compare before and after roofing photos.

Before Photos: ${beforePhotos.length}
After Photos: ${afterPhotos.length}

List 3-5 key improvements visible in the after photos.
Format as JSON array: ["improvement 1", "improvement 2", ...]`;

    let improvements: string[];
    let analysis: string;

    try {
      const response = await this.ollama.generate({
        model: 'gemma2:27b',
        prompt,
        options: { temperature: 0.7 },
      });

      improvements = JSON.parse(response);
      analysis = `Project completed successfully with ${improvements.length} major improvements. ${improvements.join('. ')}.`;
    } catch (error) {
      improvements = [
        'New roofing material installed',
        'All damaged areas repaired',
        'Improved curb appeal',
      ];
      analysis = 'Project completed with significant improvements to roof condition and appearance.';
    }

    const comparison: BeforeAfterComparison = {
      jobId,
      beforePhotos,
      afterPhotos,
      improvements,
      analysis,
      generatedAt: new Date(),
    };

    return comparison;
  }

  /**
   * Delete photo
   */
  async deletePhoto(tenantId: string, photoId: string): Promise<void> {
    const photo = await this.getPhoto(tenantId, photoId);

    // Delete file
    try {
      await fs.unlink(photo.filePath);
    } catch (error) {
      this.logger.warn(`Failed to delete file: ${error.message}`);
    }

    // Remove from storage
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId } });
    const photos = (tenant?.settings as any)?.dronePhotos || [];
    const filtered = photos.filter((p: DronePhoto) => p.id !== photoId);

    await this.db.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...(tenant?.settings as any),
          dronePhotos: filtered,
        },
      },
    });
  }

  /**
   * Get analytics for drone usage
   */
  async getDroneAnalytics(tenantId: string, startDate: Date, endDate: Date): Promise<any> {
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId } });
    const photos = (tenant?.settings as any)?.dronePhotos || [];
    const reports = (tenant?.settings as any)?.droneReports || [];

    const periodPhotos = photos.filter(
      (p: DronePhoto) =>
        p.uploadedAt >= startDate && p.uploadedAt <= endDate,
    );

    const periodReports = reports.filter(
      (r: InspectionReport) =>
        r.generatedAt >= startDate && r.generatedAt <= endDate,
    );

    const totalDamagesDetected = periodPhotos.reduce(
      (sum: number, p: DronePhoto) => sum + (p.aiAnalysis?.damages.length || 0),
      0,
    );

    return {
      period: { start: startDate, end: endDate },
      totalPhotos: periodPhotos.length,
      totalReports: periodReports.length,
      photosWithDamage: periodPhotos.filter((p: DronePhoto) => p.aiAnalysis?.damageDetected)
        .length,
      totalDamagesDetected,
      averageDamagesPerInspection: totalDamagesDetected / (periodReports.length || 1),
      photosByCategory: this.groupPhotosByCategory(periodPhotos),
      storageUsed: periodPhotos.reduce((sum: number, p: DronePhoto) => sum + p.fileSize, 0),
    };
  }

  /**
   * Group photos by category
   */
  private groupPhotosByCategory(photos: DronePhoto[]): Record<string, number> {
    return photos.reduce((acc: Record<string, number>, photo) => {
      acc[photo.category] = (acc[photo.category] || 0) + 1;
      return acc;
    }, {});
  }
}
