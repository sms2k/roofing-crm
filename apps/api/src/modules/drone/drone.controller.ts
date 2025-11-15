import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UploadedFile,
  UseInterceptors,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DroneService } from './drone.service';
import * as fs from 'fs';

class UploadPhotoDto {
  jobId: string;
  category?: string;
  gpsLatitude?: number;
  gpsLongitude?: number;
  altitude?: number;
  capturedAt?: string;
}

class AddAnnotationDto {
  type: 'ARROW' | 'CIRCLE' | 'RECTANGLE' | 'TEXT' | 'MARKER';
  coordinates: { x: number; y: number; width?: number; height?: number };
  text?: string;
  color: string;
}

class OrderMeasurementDto {
  propertyAddress: string;
}

class GetAnalyticsDto {
  startDate: string;
  endDate: string;
}

@Controller('drone')
export class DroneController {
  constructor(private readonly droneService: DroneService) {}

  /**
   * Upload drone photo/video
   * POST /drone/upload
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadPhoto(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadPhotoDto,
    @Request() req: any,
  ) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;

    const metadata = {
      category: body.category,
      gpsLatitude: body.gpsLatitude ? parseFloat(body.gpsLatitude as any) : undefined,
      gpsLongitude: body.gpsLongitude ? parseFloat(body.gpsLongitude as any) : undefined,
      altitude: body.altitude ? parseFloat(body.altitude as any) : undefined,
      capturedAt: body.capturedAt ? new Date(body.capturedAt) : undefined,
    };

    return this.droneService.uploadPhoto(tenantId, body.jobId, userId, file as any, metadata);
  }

  /**
   * Get photo by ID
   * GET /drone/photos/:photoId
   */
  @Get('photos/:photoId')
  async getPhoto(@Param('photoId') photoId: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    return this.droneService.getPhoto(tenantId, photoId);
  }

  /**
   * Get photo file (download)
   * GET /drone/photos/:photoId/file
   */
  @Get('photos/:photoId/file')
  async getPhotoFile(@Param('photoId') photoId: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const photo = await this.droneService.getPhoto(tenantId, photoId);

    const file = fs.createReadStream(photo.filePath);

    return new StreamableFile(file, {
      type: photo.mimeType,
      disposition: `inline; filename="${photo.fileName}"`,
    });
  }

  /**
   * Get all photos for a job
   * GET /drone/jobs/:jobId/photos
   */
  @Get('jobs/:jobId/photos')
  async getJobPhotos(@Param('jobId') jobId: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const photos = await this.droneService.getJobPhotos(tenantId, jobId);

    return {
      total: photos.length,
      photos,
      byCategory: photos.reduce((acc: any, photo) => {
        acc[photo.category] = (acc[photo.category] || 0) + 1;
        return acc;
      }, {}),
    };
  }

  /**
   * Analyze photo for damage
   * POST /drone/photos/:photoId/analyze
   */
  @Post('photos/:photoId/analyze')
  async analyzePhoto(@Param('photoId') photoId: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    return this.droneService.analyzePhotoForDamage(tenantId, photoId);
  }

  /**
   * Add annotation to photo
   * POST /drone/photos/:photoId/annotations
   */
  @Post('photos/:photoId/annotations')
  async addAnnotation(
    @Param('photoId') photoId: string,
    @Body() body: AddAnnotationDto,
    @Request() req: any,
  ) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;

    return this.droneService.addAnnotation(tenantId, photoId, userId, body);
  }

  /**
   * Delete photo
   * DELETE /drone/photos/:photoId
   */
  @Delete('photos/:photoId')
  async deletePhoto(@Param('photoId') photoId: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    await this.droneService.deletePhoto(tenantId, photoId);

    return {
      success: true,
      message: 'Photo deleted successfully',
    };
  }

  /**
   * Order measurement report
   * POST /drone/jobs/:jobId/order-measurement
   */
  @Post('jobs/:jobId/order-measurement')
  async orderMeasurement(
    @Param('jobId') jobId: string,
    @Body() body: OrderMeasurementDto,
    @Request() req: any,
  ) {
    const tenantId = req.user.tenantId;
    return this.droneService.orderMeasurementReport(tenantId, jobId, body.propertyAddress);
  }

  /**
   * Get measurement report status
   * GET /drone/jobs/:jobId/measurement-status
   */
  @Get('jobs/:jobId/measurement-status')
  async getMeasurementStatus(@Param('jobId') jobId: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const status = await this.droneService.getMeasurementReportStatus(tenantId, jobId);

    if (!status) {
      return {
        ordered: false,
        message: 'No measurement report ordered for this job',
      };
    }

    return {
      ordered: true,
      ...status,
    };
  }

  /**
   * Generate inspection report
   * POST /drone/jobs/:jobId/generate-report
   */
  @Post('jobs/:jobId/generate-report')
  async generateReport(@Param('jobId') jobId: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;

    return this.droneService.generateInspectionReport(tenantId, jobId, userId);
  }

  /**
   * Get report by ID
   * GET /drone/reports/:reportId
   */
  @Get('reports/:reportId')
  async getReport(@Param('reportId') reportId: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    return this.droneService.getReport(tenantId, reportId);
  }

  /**
   * Get all reports for a job
   * GET /drone/jobs/:jobId/reports
   */
  @Get('jobs/:jobId/reports')
  async getJobReports(@Param('jobId') jobId: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const reports = await this.droneService.getJobReports(tenantId, jobId);

    return {
      total: reports.length,
      reports,
    };
  }

  /**
   * Create before/after comparison
   * POST /drone/jobs/:jobId/before-after
   */
  @Post('jobs/:jobId/before-after')
  async createBeforeAfter(@Param('jobId') jobId: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    return this.droneService.createBeforeAfterComparison(tenantId, jobId);
  }

  /**
   * Get drone analytics
   * GET /drone/analytics
   */
  @Get('analytics')
  async getAnalytics(@Query() query: GetAnalyticsDto, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const startDate = new Date(query.startDate);
    const endDate = new Date(query.endDate);

    return this.droneService.getDroneAnalytics(tenantId, startDate, endDate);
  }

  /**
   * Get damage summary across all jobs
   * GET /drone/damage-summary
   */
  @Get('damage-summary')
  async getDamageSummary(@Request() req: any) {
    const tenantId = req.user.tenantId;
    const tenant = await (this.droneService as any).db.tenant.findUnique({
      where: { id: tenantId },
    });
    const photos = (tenant?.settings as any)?.dronePhotos || [];

    const photosWithDamage = photos.filter((p: any) => p.aiAnalysis?.damageDetected);
    const allDamages: any[] = [];

    photosWithDamage.forEach((photo: any) => {
      if (photo.aiAnalysis?.damages) {
        allDamages.push(...photo.aiAnalysis.damages);
      }
    });

    // Group by type
    const byType = allDamages.reduce((acc: any, damage) => {
      acc[damage.type] = (acc[damage.type] || 0) + 1;
      return acc;
    }, {});

    // Group by severity
    const bySeverity = allDamages.reduce((acc: any, damage) => {
      acc[damage.severity] = (acc[damage.severity] || 0) + 1;
      return acc;
    }, {});

    return {
      totalPhotos: photos.length,
      photosWithDamage: photosWithDamage.length,
      totalDamages: allDamages.length,
      averageDamagesPerPhoto:
        allDamages.length / (photosWithDamage.length || 1),
      byType,
      bySeverity,
      criticalIssues: allDamages.filter((d) => d.severity === 'CRITICAL').length,
    };
  }

  /**
   * Batch analyze multiple photos
   * POST /drone/batch-analyze
   */
  @Post('batch-analyze')
  async batchAnalyze(@Body() body: { photoIds: string[] }, @Request() req: any) {
    const tenantId = req.user.tenantId;

    const results = await Promise.all(
      body.photoIds.map((photoId) =>
        this.droneService.analyzePhotoForDamage(tenantId, photoId),
      ),
    );

    return {
      total: results.length,
      analyzed: results.length,
      withDamage: results.filter((r) => r.aiAnalysis?.damageDetected).length,
      totalDamages: results.reduce((sum, r) => sum + (r.aiAnalysis?.damages.length || 0), 0),
    };
  }

  /**
   * Get photos by category
   * GET /drone/photos-by-category/:category
   */
  @Get('photos-by-category/:category')
  async getPhotosByCategory(@Param('category') category: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const tenant = await (this.droneService as any).db.tenant.findUnique({
      where: { id: tenantId },
    });
    const photos = (tenant?.settings as any)?.dronePhotos || [];

    const filtered = photos.filter((p: any) => p.category === category.toUpperCase());

    return {
      category,
      total: filtered.length,
      photos: filtered,
    };
  }

  /**
   * Get recent uploads
   * GET /drone/recent-uploads
   */
  @Get('recent-uploads')
  async getRecentUploads(@Query('limit') limit: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const tenant = await (this.droneService as any).db.tenant.findUnique({
      where: { id: tenantId },
    });
    const photos = (tenant?.settings as any)?.dronePhotos || [];

    const sorted = photos.sort(
      (a: any, b: any) => b.uploadedAt.getTime() - a.uploadedAt.getTime(),
    );

    const limitNum = limit ? parseInt(limit) : 10;

    return {
      total: sorted.length,
      recent: sorted.slice(0, limitNum),
    };
  }

  /**
   * Get storage usage
   * GET /drone/storage-usage
   */
  @Get('storage-usage')
  async getStorageUsage(@Request() req: any) {
    const tenantId = req.user.tenantId;
    const tenant = await (this.droneService as any).db.tenant.findUnique({
      where: { id: tenantId },
    });
    const photos = (tenant?.settings as any)?.dronePhotos || [];

    const totalBytes = photos.reduce((sum: number, p: any) => sum + p.fileSize, 0);
    const totalMB = totalBytes / (1024 * 1024);
    const totalGB = totalMB / 1024;

    return {
      totalPhotos: photos.length,
      totalBytes,
      totalMB: Math.round(totalMB * 100) / 100,
      totalGB: Math.round(totalGB * 100) / 100,
      averageSizePerPhoto: Math.round(totalBytes / (photos.length || 1)),
      byCategory: photos.reduce((acc: any, photo: any) => {
        if (!acc[photo.category]) {
          acc[photo.category] = { count: 0, bytes: 0 };
        }
        acc[photo.category].count++;
        acc[photo.category].bytes += photo.fileSize;
        return acc;
      }, {}),
    };
  }
}
