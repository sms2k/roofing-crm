import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
} from '@nestjs/common';
import { AiProductionManagerService } from './ai-production-manager.service';

class GetWeatherDto {
  latitude: number;
  longitude: number;
  days?: number;
}

class GetSchedulingRecommendationDto {
  // jobId in params
}

class OptimizeCrewDto {
  date: string;
}

class AutoRescheduleDto {
  newDate: string;
}

class CheckAlertsDto {
  days?: number;
}

@Controller('ai-production-manager')
export class AiProductionManagerController {
  constructor(private readonly aiProductionManager: AiProductionManagerService) {}

  /**
   * Get weather forecast for a location
   * GET /ai-production-manager/weather
   */
  @Get('weather')
  async getWeather(@Query() query: GetWeatherDto) {
    const days = query.days || 7;
    return this.aiProductionManager.getWeatherForecast(
      query.latitude,
      query.longitude,
      days,
    );
  }

  /**
   * Predict job duration
   * GET /ai-production-manager/jobs/:jobId/predict-duration
   */
  @Get('jobs/:jobId/predict-duration')
  async predictDuration(@Param('jobId') jobId: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    return this.aiProductionManager.predictJobDuration(tenantId, jobId);
  }

  /**
   * Get scheduling recommendation for a job
   * GET /ai-production-manager/jobs/:jobId/schedule-recommendation
   */
  @Get('jobs/:jobId/schedule-recommendation')
  async getSchedulingRecommendation(@Param('jobId') jobId: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    return this.aiProductionManager.getSchedulingRecommendation(tenantId, jobId);
  }

  /**
   * Optimize crew schedule for a date
   * POST /ai-production-manager/optimize-crew
   */
  @Post('optimize-crew')
  async optimizeCrewSchedule(@Body() body: OptimizeCrewDto, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const date = new Date(body.date);
    return this.aiProductionManager.optimizeCrewSchedule(tenantId, date);
  }

  /**
   * Check reschedule alerts
   * GET /ai-production-manager/reschedule-alerts
   */
  @Get('reschedule-alerts')
  async checkRescheduleAlerts(@Query() query: CheckAlertsDto, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const days = query.days || 7;
    return this.aiProductionManager.checkRescheduleAlerts(tenantId, days);
  }

  /**
   * Auto-reschedule a job
   * POST /ai-production-manager/jobs/:jobId/auto-reschedule
   */
  @Post('jobs/:jobId/auto-reschedule')
  async autoReschedule(
    @Param('jobId') jobId: string,
    @Body() body: AutoRescheduleDto,
    @Request() req: any,
  ) {
    const tenantId = req.user.tenantId;
    const newDate = new Date(body.newDate);
    return this.aiProductionManager.autoRescheduleJob(tenantId, jobId, newDate);
  }

  /**
   * Get production dashboard
   * GET /ai-production-manager/dashboard
   */
  @Get('dashboard')
  async getDashboard(@Request() req: any) {
    const tenantId = req.user.tenantId;
    return this.aiProductionManager.getProductionDashboard(tenantId);
  }

  /**
   * Get AI production recommendations
   * GET /ai-production-manager/recommendations
   */
  @Get('recommendations')
  async getRecommendations(@Request() req: any) {
    const tenantId = req.user.tenantId;
    return this.aiProductionManager.getProductionRecommendations(tenantId);
  }

  /**
   * Batch predict durations for multiple jobs
   * POST /ai-production-manager/batch-predict-duration
   */
  @Post('batch-predict-duration')
  async batchPredictDuration(@Body() body: { jobIds: string[] }, @Request() req: any) {
    const tenantId = req.user.tenantId;

    const predictions = await Promise.all(
      body.jobIds.map((jobId) =>
        this.aiProductionManager.predictJobDuration(tenantId, jobId),
      ),
    );

    return {
      total: predictions.length,
      predictions,
      summary: {
        totalHours: predictions.reduce((sum, p) => sum + p.estimatedDuration, 0),
        averageDuration:
          predictions.reduce((sum, p) => sum + p.estimatedDuration, 0) / predictions.length,
        averageConfidence:
          predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length,
      },
    };
  }

  /**
   * Get crew performance analytics
   * GET /ai-production-manager/crew-analytics
   */
  @Get('crew-analytics')
  async getCrewAnalytics(@Request() req: any) {
    const tenantId = req.user.tenantId;

    const db = (this.aiProductionManager as any).db;

    // Get all crew members
    const crews = await db.user.findMany({
      where: {
        tenantId,
        role: 'CREW',
      },
      include: {
        contact: true,
      },
    });

    // Get completed jobs for each crew member
    const crewStats = await Promise.all(
      crews.map(async (crew: any) => {
        const completedJobs = await db.job.findMany({
          where: {
            tenantId,
            status: 'COMPLETED',
            // assignedCrewId: crew.id, // Would need this field
          },
        });

        const totalJobs = completedJobs.length;

        // Calculate average job duration
        const durations = completedJobs
          .filter((j: any) => j.startedAt && j.completedAt)
          .map((j: any) => {
            return (j.completedAt.getTime() - j.startedAt.getTime()) / (1000 * 60 * 60);
          });

        const avgDuration =
          durations.length > 0
            ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length
            : 0;

        return {
          crewMember: {
            id: crew.id,
            name: `${crew.contact.firstName} ${crew.contact.lastName}`,
          },
          stats: {
            totalJobs,
            avgDuration: Math.round(avgDuration * 2) / 2,
            efficiency: totalJobs > 0 ? 85 : 0, // Would calculate based on predicted vs actual
          },
        };
      }),
    );

    return {
      totalCrew: crews.length,
      crewStats: crewStats.sort((a, b) => b.stats.totalJobs - a.stats.totalJobs),
    };
  }

  /**
   * Get weather impact analysis
   * GET /ai-production-manager/weather-impact
   */
  @Get('weather-impact')
  async getWeatherImpact(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Request() req: any,
  ) {
    const tenantId = req.user.tenantId;
    const db = (this.aiProductionManager as any).db;

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Get all jobs in date range
    const jobs = await db.job.findMany({
      where: {
        tenantId,
        scheduledDate: {
          gte: start,
          lte: end,
        },
      },
    });

    // Count rescheduled jobs (would need reschedule tracking)
    const rescheduled = jobs.filter((j: any) => j.status === 'RESCHEDULED').length;

    // Calculate weather delays
    const weatherDelays = Math.round((rescheduled / jobs.length) * 100) || 0;

    return {
      period: { start, end },
      totalJobs: jobs.length,
      rescheduled,
      weatherDelayRate: weatherDelayRate,
      estimatedCost: rescheduled * 500, // Estimated cost per reschedule
      insights: [
        `${weatherDelays}% of jobs were delayed by weather`,
        `Weather cost approximately $${rescheduled * 500} in lost productivity`,
        'Consider building in buffer days during high-risk seasons',
      ],
    };
  }

  /**
   * Smart job grouping by location
   * GET /ai-production-manager/optimize-routes
   */
  @Get('optimize-routes')
  async optimizeRoutes(@Query('date') date: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const db = (this.aiProductionManager as any).db;

    const targetDate = new Date(date);
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Get all jobs for the date
    const jobs = await db.job.findMany({
      where: {
        tenantId,
        scheduledDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        property: true,
        lead: { include: { contact: true } },
      },
    });

    // Group by proximity (simple zip code grouping)
    const grouped = jobs.reduce((acc: any, job: any) => {
      const zip = job.property?.zipCode || 'UNKNOWN';
      if (!acc[zip]) acc[zip] = [];
      acc[zip].push(job);
      return acc;
    }, {});

    const routes = Object.entries(grouped).map(([zip, jobsInZip]: [string, any]) => ({
      zipCode: zip,
      jobs: jobsInZip,
      count: jobsInZip.length,
      estimatedTravelTime: jobsInZip.length * 0.5, // 30 min between jobs
    }));

    return {
      date: targetDate,
      totalJobs: jobs.length,
      routes: routes.sort((a, b) => b.count - a.count),
      recommendations: [
        `${routes.length} different areas - consider grouping jobs by location`,
        routes.length > 5
          ? 'High route fragmentation - prioritize jobs in same area'
          : 'Good route efficiency',
      ],
    };
  }

  /**
   * Get equipment/material recommendations
   * GET /ai-production-manager/jobs/:jobId/materials
   */
  @Get('jobs/:jobId/materials')
  async getMaterialRecommendations(@Param('jobId') jobId: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const db = (this.aiProductionManager as any).db;

    const job = await db.job.findFirst({
      where: { id: jobId, tenantId },
      include: { property: true },
    });

    if (!job) {
      return { error: 'Job not found' };
    }

    // Calculate materials based on property size
    const squareFeet = job.property?.squareFeet || 2000;
    const squaresNeeded = Math.ceil(squareFeet / 100); // Roofing squares

    const materials = [
      {
        item: 'Roofing Shingles',
        quantity: squaresNeeded + 1, // +1 for waste
        unit: 'squares',
      },
      {
        item: 'Underlayment',
        quantity: Math.ceil(squareFeet / 400), // 4 sq per roll
        unit: 'rolls',
      },
      {
        item: 'Ridge Cap Shingles',
        quantity: Math.ceil(squareFeet * 0.05), // 5% of roof area
        unit: 'bundles',
      },
      {
        item: 'Roofing Nails',
        quantity: Math.ceil(squaresNeeded / 2), // 2 squares per box
        unit: 'boxes',
      },
      {
        item: 'Drip Edge',
        quantity: Math.ceil((squareFeet / 100) * 4), // Perimeter estimate
        unit: 'linear feet',
      },
    ];

    return {
      jobId,
      propertySize: squareFeet,
      squaresNeeded,
      materials,
      estimatedCost: squaresNeeded * 350, // $350 per square average
      notes: [
        'Add 10% for waste and cuts',
        'Confirm colors with homeowner before ordering',
        'Check if additional ventilation needed',
      ],
    };
  }
}
