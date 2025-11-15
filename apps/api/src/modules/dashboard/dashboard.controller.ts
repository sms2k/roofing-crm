import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Request,
} from '@nestjs/common';
import { DashboardService } from './dashboard.service';

class GetKPIsDto {
  startDate: string;
  endDate: string;
}

class GetForecastDto {
  months?: number;
}

class GetTeamPerformanceDto {
  startDate: string;
  endDate: string;
}

class GenerateReportDto {
  name: string;
  type: 'KPI' | 'REVENUE' | 'PIPELINE' | 'TEAM' | 'CUSTOM';
  filters: {
    dateRange: { start: string; end: string };
    userIds?: string[];
    sources?: string[];
    statuses?: string[];
  };
  metrics: string[];
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * Get comprehensive KPI metrics
   * GET /dashboard/kpis
   */
  @Get('kpis')
  async getKPIs(@Query() query: GetKPIsDto, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const startDate = new Date(query.startDate);
    const endDate = new Date(query.endDate);

    return this.dashboardService.getKPIMetrics(tenantId, startDate, endDate);
  }

  /**
   * Get revenue forecast
   * GET /dashboard/forecast
   */
  @Get('forecast')
  async getForecast(@Query() query: GetForecastDto, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const months = query.months ? parseInt(query.months as any) : 3;

    return this.dashboardService.generateRevenueForecast(tenantId, months);
  }

  /**
   * Get pipeline health analysis
   * GET /dashboard/pipeline-health
   */
  @Get('pipeline-health')
  async getPipelineHealth(@Request() req: any) {
    const tenantId = req.user.tenantId;
    return this.dashboardService.analyzePipelineHealth(tenantId);
  }

  /**
   * Get team performance leaderboard
   * GET /dashboard/team-performance
   */
  @Get('team-performance')
  async getTeamPerformance(@Query() query: GetTeamPerformanceDto, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const startDate = new Date(query.startDate);
    const endDate = new Date(query.endDate);

    return this.dashboardService.getTeamPerformance(tenantId, startDate, endDate);
  }

  /**
   * Get executive summary
   * GET /dashboard/executive-summary
   */
  @Get('executive-summary')
  async getExecutiveSummary(@Request() req: any) {
    const tenantId = req.user.tenantId;
    return this.dashboardService.getExecutiveSummary(tenantId);
  }

  /**
   * Generate custom report
   * POST /dashboard/generate-report
   */
  @Post('generate-report')
  async generateReport(@Body() body: GenerateReportDto, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;

    const config = {
      name: body.name,
      type: body.type,
      filters: {
        dateRange: {
          start: new Date(body.filters.dateRange.start),
          end: new Date(body.filters.dateRange.end),
        },
        userIds: body.filters.userIds,
        sources: body.filters.sources,
        statuses: body.filters.statuses,
      },
      metrics: body.metrics,
    };

    return this.dashboardService.generateCustomReport(tenantId, userId, config);
  }

  /**
   * Get real-time metrics
   * GET /dashboard/realtime
   */
  @Get('realtime')
  async getRealtimeMetrics(@Request() req: any) {
    const tenantId = req.user.tenantId;
    const db = (this.dashboardService as any).db;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      leadsToday,
      jobsToday,
      activeUsers,
      recentActivity,
    ] = await Promise.all([
      db.lead.count({
        where: {
          tenantId,
          createdAt: { gte: today },
        },
      }),
      db.job.count({
        where: {
          tenantId,
          createdAt: { gte: today },
        },
      }),
      db.user.count({
        where: {
          tenantId,
          isActive: true,
        },
      }),
      db.note.findMany({
        where: {
          tenantId,
          createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }, // Last hour
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      timestamp: now,
      today: {
        leadsCreated: leadsToday,
        jobsCreated: jobsToday,
      },
      system: {
        activeUsers,
        recentActivity: recentActivity.length,
      },
    };
  }

  /**
   * Get revenue trends (time series)
   * GET /dashboard/revenue-trends
   */
  @Get('revenue-trends')
  async getRevenueTrends(
    @Query('period') period: 'day' | 'week' | 'month' | 'year',
    @Query('count') count: string,
    @Request() req: any,
  ) {
    const tenantId = req.user.tenantId;
    const periods = parseInt(count) || 12;
    const db = (this.dashboardService as any).db;

    const trends: { period: string; revenue: number; jobs: number }[] = [];

    for (let i = periods - 1; i >= 0; i--) {
      const periodStart = new Date();
      const periodEnd = new Date();

      switch (period) {
        case 'day':
          periodStart.setDate(periodStart.getDate() - i);
          periodStart.setHours(0, 0, 0, 0);
          periodEnd.setDate(periodEnd.getDate() - i);
          periodEnd.setHours(23, 59, 59, 999);
          break;
        case 'week':
          periodStart.setDate(periodStart.getDate() - i * 7);
          periodEnd.setDate(periodEnd.getDate() - i * 7 + 6);
          break;
        case 'month':
          periodStart.setMonth(periodStart.getMonth() - i);
          periodStart.setDate(1);
          periodEnd.setMonth(periodEnd.getMonth() - i + 1);
          periodEnd.setDate(0);
          break;
        case 'year':
          periodStart.setFullYear(periodStart.getFullYear() - i);
          periodStart.setMonth(0, 1);
          periodEnd.setFullYear(periodEnd.getFullYear() - i);
          periodEnd.setMonth(11, 31);
          break;
      }

      const jobs = await db.job.findMany({
        where: {
          tenantId,
          completedAt: {
            gte: periodStart,
            lte: periodEnd,
          },
          status: 'COMPLETED',
        },
      });

      const revenue = jobs.reduce(
        (sum: number, job: any) => sum + parseFloat(job.totalPrice?.toString() || '0'),
        0,
      );

      trends.push({
        period: periodStart.toISOString().split('T')[0],
        revenue,
        jobs: jobs.length,
      });
    }

    return {
      period,
      trends,
      total: trends.reduce((sum, t) => sum + t.revenue, 0),
      averagePerPeriod:
        trends.reduce((sum, t) => sum + t.revenue, 0) / (trends.length || 1),
    };
  }

  /**
   * Get conversion funnel
   * GET /dashboard/conversion-funnel
   */
  @Get('conversion-funnel')
  async getConversionFunnel(@Request() req: any) {
    const tenantId = req.user.tenantId;
    const db = (this.dashboardService as any).db;

    const leads = await db.lead.findMany({
      where: { tenantId },
      include: { job: true },
    });

    const stages = [
      { stage: 'NEW', count: 0 },
      { stage: 'CONTACTED', count: 0 },
      { stage: 'QUALIFIED', count: 0 },
      { stage: 'QUOTED', count: 0 },
      { stage: 'WON', count: 0 },
    ];

    leads.forEach((lead: any) => {
      const stageIndex = stages.findIndex((s) => s.stage === lead.status);
      if (stageIndex !== -1) {
        // Count this stage and all previous stages
        for (let i = 0; i <= stageIndex; i++) {
          stages[i].count++;
        }
      }

      // If has job, count as WON
      if (lead.job) {
        stages[stages.length - 1].count++;
      }
    });

    return {
      stages,
      conversionRates: stages.map((stage, i) => {
        if (i === 0) return { stage: stage.stage, rate: 100 };
        return {
          stage: stage.stage,
          rate: stages[0].count > 0 ? (stage.count / stages[0].count) * 100 : 0,
        };
      }),
    };
  }

  /**
   * Get lead source breakdown
   * GET /dashboard/lead-sources
   */
  @Get('lead-sources')
  async getLeadSources(@Query() query: GetKPIsDto, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const db = (this.dashboardService as any).db;

    const startDate = new Date(query.startDate);
    const endDate = new Date(query.endDate);

    const leads = await db.lead.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        job: true,
      },
    });

    const sourceBreakdown = leads.reduce((acc: any, lead: any) => {
      const source = lead.source || 'UNKNOWN';
      if (!acc[source]) {
        acc[source] = {
          count: 0,
          converted: 0,
          revenue: 0,
        };
      }
      acc[source].count++;
      if (lead.job) {
        acc[source].converted++;
        acc[source].revenue += parseFloat(lead.job.totalPrice?.toString() || '0');
      }
      return acc;
    }, {});

    // Calculate ROI if we had cost data
    const sources = Object.entries(sourceBreakdown).map(([source, data]: [string, any]) => ({
      source,
      count: data.count,
      converted: data.converted,
      conversionRate: (data.converted / data.count) * 100,
      revenue: data.revenue,
      averageDealSize: data.converted > 0 ? data.revenue / data.converted : 0,
    }));

    return {
      period: { start: startDate, end: endDate },
      sources: sources.sort((a, b) => b.count - a.count),
      total: leads.length,
    };
  }

  /**
   * Get activity timeline
   * GET /dashboard/activity-timeline
   */
  @Get('activity-timeline')
  async getActivityTimeline(@Query('days') days: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const db = (this.dashboardService as any).db;
    const daysBack = parseInt(days) || 7;

    const timeline: any[] = [];

    for (let i = daysBack - 1; i >= 0; i--) {
      const dayStart = new Date();
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const [leads, jobs, tasks, notes] = await Promise.all([
        db.lead.count({
          where: {
            tenantId,
            createdAt: { gte: dayStart, lte: dayEnd },
          },
        }),
        db.job.count({
          where: {
            tenantId,
            createdAt: { gte: dayStart, lte: dayEnd },
          },
        }),
        db.task.count({
          where: {
            tenantId,
            createdAt: { gte: dayStart, lte: dayEnd },
          },
        }),
        db.note.count({
          where: {
            tenantId,
            createdAt: { gte: dayStart, lte: dayEnd },
          },
        }),
      ]);

      timeline.push({
        date: dayStart.toISOString().split('T')[0],
        leads,
        jobs,
        tasks,
        notes,
        total: leads + jobs + tasks + notes,
      });
    }

    return {
      timeline,
      totals: {
        leads: timeline.reduce((sum, day) => sum + day.leads, 0),
        jobs: timeline.reduce((sum, day) => sum + day.jobs, 0),
        tasks: timeline.reduce((sum, day) => sum + day.tasks, 0),
        notes: timeline.reduce((sum, day) => sum + day.notes, 0),
      },
    };
  }

  /**
   * Get top opportunities (high-value leads)
   * GET /dashboard/top-opportunities
   */
  @Get('top-opportunities')
  async getTopOpportunities(@Query('limit') limit: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const db = (this.dashboardService as any).db;
    const maxResults = parseInt(limit) || 10;

    const leads = await db.lead.findMany({
      where: {
        tenantId,
        status: {
          in: ['QUALIFIED', 'QUOTED'],
        },
      },
      include: {
        contact: true,
        property: true,
        assignedTo: {
          include: { contact: true },
        },
      },
      orderBy: {
        estimatedValue: 'desc',
      },
      take: maxResults,
    });

    return {
      count: leads.length,
      totalValue: leads.reduce(
        (sum, lead) => sum + parseFloat(lead.estimatedValue?.toString() || '0'),
        0,
      ),
      opportunities: leads.map((lead: any) => ({
        id: lead.id,
        customerName: `${lead.contact.firstName} ${lead.contact.lastName}`,
        value: parseFloat(lead.estimatedValue?.toString() || '0'),
        status: lead.status,
        assignedTo: lead.assignedTo
          ? `${lead.assignedTo.contact.firstName} ${lead.assignedTo.contact.lastName}`
          : 'Unassigned',
        daysInPipeline: Math.floor(
          (Date.now() - lead.createdAt.getTime()) / (1000 * 60 * 60 * 24),
        ),
      })),
    };
  }

  /**
   * Get goals and targets
   * GET /dashboard/goals
   */
  @Get('goals')
  async getGoals(@Request() req: any) {
    const tenantId = req.user.tenantId;
    const db = (this.dashboardService as any).db;

    // Get current month progress
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const jobs = await db.job.findMany({
      where: {
        tenantId,
        completedAt: {
          gte: monthStart,
        },
        status: 'COMPLETED',
      },
    });

    const currentRevenue = jobs.reduce(
      (sum: number, job: any) => sum + parseFloat(job.totalPrice?.toString() || '0'),
      0,
    );

    // Sample goals (would be configured per tenant)
    const goals = {
      revenue: {
        target: 100000,
        current: currentRevenue,
        progress: (currentRevenue / 100000) * 100,
        status: currentRevenue >= 100000 ? 'ACHIEVED' : 'IN_PROGRESS',
      },
      jobs: {
        target: 20,
        current: jobs.length,
        progress: (jobs.length / 20) * 100,
        status: jobs.length >= 20 ? 'ACHIEVED' : 'IN_PROGRESS',
      },
      leads: {
        target: 50,
        current: 0, // Would calculate
        progress: 0,
        status: 'IN_PROGRESS',
      },
    };

    return {
      period: 'month',
      goals,
      overallProgress:
        (goals.revenue.progress + goals.jobs.progress + goals.leads.progress) / 3,
    };
  }
}
