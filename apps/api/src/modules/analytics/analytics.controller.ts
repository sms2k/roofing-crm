import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  Request,
} from '@nestjs/common';
import { Response } from 'express';
import { AnalyticsService, ReportDefinition, ScheduledReport, Dashboard, ChartConfig } from './analytics.service';

interface AuthRequest extends Request {
  user: { userId: string; tenantId: string };
}

@Controller('analytics')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  // ==================== REPORT BUILDER ====================

  @Post('reports')
  async createReport(@Request() req: AuthRequest, @Body() reportData: Partial<ReportDefinition>) {
    const { tenantId, userId } = req.user;
    return this.analyticsService.createReport(tenantId, userId, reportData);
  }

  @Get('reports/:reportId')
  async getReport(@Request() req: AuthRequest, @Param('reportId') reportId: string) {
    const { tenantId } = req.user;
    return this.analyticsService.getReport(tenantId, reportId);
  }

  @Put('reports/:reportId')
  async updateReport(
    @Request() req: AuthRequest,
    @Param('reportId') reportId: string,
    @Body() updates: Partial<ReportDefinition>,
  ) {
    const { tenantId } = req.user;
    return this.analyticsService.updateReport(tenantId, reportId, updates);
  }

  @Delete('reports/:reportId')
  async deleteReport(@Request() req: AuthRequest, @Param('reportId') reportId: string) {
    const { tenantId } = req.user;
    await this.analyticsService.deleteReport(tenantId, reportId);
    return { success: true };
  }

  @Get('reports')
  async listReports(@Request() req: AuthRequest, @Query('userId') userId?: string) {
    const { tenantId, userId: currentUserId } = req.user;
    return this.analyticsService.listReports(tenantId, userId || currentUserId);
  }

  // ==================== REPORT EXECUTION ====================

  @Post('reports/:reportId/execute')
  async executeReport(
    @Request() req: AuthRequest,
    @Param('reportId') reportId: string,
    @Body() body: { filters?: any[] },
  ) {
    const { tenantId } = req.user;
    return this.analyticsService.executeReport(tenantId, reportId, body.filters);
  }

  // ==================== DATA VISUALIZATION ====================

  @Post('reports/:reportId/chart')
  async generateChart(
    @Request() req: AuthRequest,
    @Param('reportId') reportId: string,
    @Body() chartConfig: ChartConfig,
  ) {
    const { tenantId } = req.user;
    return this.analyticsService.generateChart(tenantId, reportId, chartConfig);
  }

  // ==================== SCHEDULED REPORTS ====================

  @Post('reports/:reportId/schedule')
  async createScheduledReport(
    @Request() req: AuthRequest,
    @Param('reportId') reportId: string,
    @Body() schedule: Partial<ScheduledReport>,
  ) {
    const { tenantId } = req.user;
    return this.analyticsService.createScheduledReport(tenantId, reportId, schedule);
  }

  @Get('scheduled-reports')
  async getScheduledReports(@Request() req: AuthRequest) {
    const { tenantId } = req.user;
    return this.analyticsService.getScheduledReports(tenantId);
  }

  @Put('scheduled-reports/:scheduleId')
  async updateScheduledReport(
    @Request() req: AuthRequest,
    @Param('scheduleId') scheduleId: string,
    @Body() updates: Partial<ScheduledReport>,
  ) {
    const { tenantId } = req.user;
    return this.analyticsService.updateScheduledReport(tenantId, scheduleId, updates);
  }

  // ==================== DASHBOARDS ====================

  @Post('dashboards')
  async createDashboard(@Request() req: AuthRequest, @Body() dashboardData: Partial<Dashboard>) {
    const { tenantId, userId } = req.user;
    return this.analyticsService.createDashboard(tenantId, userId, dashboardData);
  }

  @Get('dashboards/:dashboardId')
  async getDashboard(@Request() req: AuthRequest, @Param('dashboardId') dashboardId: string) {
    const { tenantId } = req.user;
    return this.analyticsService.getDashboard(tenantId, dashboardId);
  }

  @Put('dashboards/:dashboardId')
  async updateDashboard(
    @Request() req: AuthRequest,
    @Param('dashboardId') dashboardId: string,
    @Body() updates: Partial<Dashboard>,
  ) {
    const { tenantId } = req.user;
    return this.analyticsService.updateDashboard(tenantId, dashboardId, updates);
  }

  @Get('dashboards')
  async listDashboards(@Request() req: AuthRequest) {
    const { tenantId, userId } = req.user;
    return this.analyticsService.listDashboards(tenantId, userId);
  }

  // ==================== COMPARISON REPORTS ====================

  @Post('comparison')
  async generateComparisonReport(
    @Request() req: AuthRequest,
    @Body()
    body: {
      metric: string;
      currentPeriod: { start: string; end: string };
      previousPeriod: { start: string; end: string };
    },
  ) {
    const { tenantId } = req.user;
    return this.analyticsService.generateComparisonReport(
      tenantId,
      body.metric,
      { start: new Date(body.currentPeriod.start), end: new Date(body.currentPeriod.end) },
      { start: new Date(body.previousPeriod.start), end: new Date(body.previousPeriod.end) },
    );
  }

  @Get('year-over-year')
  async generateYearOverYearReport(
    @Request() req: AuthRequest,
    @Query('metric') metric: string,
    @Query('year') year: string,
  ) {
    const { tenantId } = req.user;
    return this.analyticsService.generateYearOverYearReport(tenantId, metric, parseInt(year, 10));
  }

  // ==================== COHORT ANALYSIS ====================

  @Post('cohort-analysis')
  async generateCohortAnalysis(
    @Request() req: AuthRequest,
    @Body()
    body: {
      cohortField: 'created_at' | 'first_purchase_at';
      metricField: string;
      periods?: number;
    },
  ) {
    const { tenantId } = req.user;
    return this.analyticsService.generateCohortAnalysis(tenantId, body.cohortField, body.metricField, body.periods);
  }

  // ==================== EXPORT ====================

  @Get('reports/:reportId/export')
  async exportReport(
    @Request() req: AuthRequest,
    @Param('reportId') reportId: string,
    @Query('format') format: 'pdf' | 'excel' | 'csv',
    @Res() res: Response,
  ) {
    const { tenantId } = req.user;
    const buffer = await this.analyticsService.exportReport(tenantId, reportId, format);

    let contentType = 'text/csv';
    let extension = 'csv';

    if (format === 'pdf') {
      contentType = 'application/pdf';
      extension = 'pdf';
    } else if (format === 'excel') {
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      extension = 'xlsx';
    }

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="report-${reportId}.${extension}"`,
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }

  // ==================== PRE-BUILT REPORTS ====================

  @Get('prebuilt/sales-pipeline')
  async getSalesPipelineReport(@Request() req: AuthRequest) {
    const { tenantId, userId } = req.user;

    // Create a sales pipeline report
    const report = await this.analyticsService.createReport(tenantId, userId, {
      name: 'Sales Pipeline Analysis',
      description: 'Overview of leads and opportunities by stage',
      dataSource: 'leads',
      columns: [
        { field: 'stage', label: 'Stage', type: 'string' },
        { field: 'id', label: 'Count', type: 'number', aggregation: 'count' },
        { field: 'estimated_value', label: 'Total Value', type: 'currency', aggregation: 'sum' },
        { field: 'estimated_value', label: 'Avg Deal Size', type: 'currency', aggregation: 'avg' },
      ],
      groupBy: [{ field: 'stage' }],
      orderBy: [{ field: 'stage', direction: 'asc' }],
    });

    return this.analyticsService.executeReport(tenantId, report.id);
  }

  @Get('prebuilt/revenue-by-month')
  async getRevenueByMonthReport(@Request() req: AuthRequest, @Query('year') year?: string) {
    const { tenantId, userId } = req.user;

    const currentYear = year ? parseInt(year, 10) : new Date().getFullYear();

    const report = await this.analyticsService.createReport(tenantId, userId, {
      name: 'Monthly Revenue',
      description: 'Revenue breakdown by month',
      dataSource: 'jobs',
      columns: [
        { field: 'created_at', label: 'Month', type: 'date' },
        { field: 'total_amount', label: 'Revenue', type: 'currency', aggregation: 'sum' },
        { field: 'id', label: 'Jobs', type: 'number', aggregation: 'count' },
      ],
      filters: [
        {
          field: 'created_at',
          operator: 'between',
          value: [new Date(currentYear, 0, 1), new Date(currentYear, 11, 31)],
        },
      ],
      groupBy: [{ field: 'created_at', interval: 'month' }],
      orderBy: [{ field: 'created_at', direction: 'asc' }],
    });

    return this.analyticsService.executeReport(tenantId, report.id);
  }

  @Get('prebuilt/lead-sources')
  async getLeadSourcesReport(@Request() req: AuthRequest) {
    const { tenantId, userId } = req.user;

    const report = await this.analyticsService.createReport(tenantId, userId, {
      name: 'Lead Sources Performance',
      description: 'Leads and conversion rates by source',
      dataSource: 'leads',
      columns: [
        { field: 'source', label: 'Source', type: 'string' },
        { field: 'id', label: 'Leads', type: 'number', aggregation: 'count' },
        { field: 'estimated_value', label: 'Potential Value', type: 'currency', aggregation: 'sum' },
      ],
      groupBy: [{ field: 'source' }],
      orderBy: [{ field: 'id', direction: 'desc' }],
    });

    return this.analyticsService.executeReport(tenantId, report.id);
  }

  @Get('prebuilt/team-performance')
  async getTeamPerformanceReport(@Request() req: AuthRequest) {
    const { tenantId, userId } = req.user;

    const report = await this.analyticsService.createReport(tenantId, userId, {
      name: 'Team Performance',
      description: 'Sales and revenue by team member',
      dataSource: 'jobs',
      columns: [
        { field: 'assigned_to', label: 'Team Member', type: 'string' },
        { field: 'id', label: 'Jobs Completed', type: 'number', aggregation: 'count' },
        { field: 'total_amount', label: 'Revenue', type: 'currency', aggregation: 'sum' },
        { field: 'total_amount', label: 'Avg Deal Size', type: 'currency', aggregation: 'avg' },
      ],
      filters: [{ field: 'status', operator: 'eq', value: 'COMPLETED' }],
      groupBy: [{ field: 'assigned_to' }],
      orderBy: [{ field: 'total_amount', direction: 'desc' }],
    });

    return this.analyticsService.executeReport(tenantId, report.id);
  }

  @Get('prebuilt/customer-lifetime-value')
  async getCustomerLifetimeValueReport(@Request() req: AuthRequest) {
    const { tenantId, userId } = req.user;

    const report = await this.analyticsService.createReport(tenantId, userId, {
      name: 'Customer Lifetime Value',
      description: 'Total revenue per customer',
      dataSource: 'jobs',
      columns: [
        { field: 'customer_id', label: 'Customer', type: 'string' },
        { field: 'id', label: 'Jobs', type: 'number', aggregation: 'count' },
        { field: 'total_amount', label: 'Total Revenue', type: 'currency', aggregation: 'sum' },
        { field: 'total_amount', label: 'Avg Job Value', type: 'currency', aggregation: 'avg' },
      ],
      groupBy: [{ field: 'customer_id' }],
      orderBy: [{ field: 'total_amount', direction: 'desc' }],
      limit: 100,
    });

    return this.analyticsService.executeReport(tenantId, report.id);
  }

  @Get('prebuilt/conversion-funnel')
  async getConversionFunnelReport(@Request() req: AuthRequest) {
    const { tenantId, userId } = req.user;

    // Get counts at each stage
    const stages = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'];
    const funnelData = [];

    for (const stage of stages) {
      const report = await this.analyticsService.createReport(tenantId, userId, {
        name: `Funnel - ${stage}`,
        dataSource: 'leads',
        columns: [{ field: 'id', label: 'Count', type: 'number', aggregation: 'count' }],
        filters: [{ field: 'stage', operator: 'eq', value: stage }],
      });

      const data = await this.analyticsService.executeReport(tenantId, report.id);
      const count = data.summary?.aggregations.id || 0;

      funnelData.push({
        stage,
        count,
        percentage: 0, // Will calculate after getting all counts
      });

      // Clean up temporary report
      await this.analyticsService.deleteReport(tenantId, report.id);
    }

    // Calculate percentages based on first stage
    const totalLeads = funnelData[0]?.count || 1;
    funnelData.forEach((item) => {
      item.percentage = (item.count / totalLeads) * 100;
    });

    return funnelData;
  }

  @Get('prebuilt/job-completion-time')
  async getJobCompletionTimeReport(@Request() req: AuthRequest) {
    const { tenantId, userId } = req.user;

    const report = await this.analyticsService.createReport(tenantId, userId, {
      name: 'Job Completion Time',
      description: 'Average time to complete jobs',
      dataSource: 'jobs',
      columns: [
        { field: 'type', label: 'Job Type', type: 'string' },
        { field: 'id', label: 'Jobs', type: 'number', aggregation: 'count' },
        { field: 'duration_days', label: 'Avg Duration', type: 'number', aggregation: 'avg' },
      ],
      filters: [{ field: 'status', operator: 'eq', value: 'COMPLETED' }],
      groupBy: [{ field: 'type' }],
      orderBy: [{ field: 'duration_days', direction: 'asc' }],
    });

    return this.analyticsService.executeReport(tenantId, report.id);
  }

  // ==================== REAL-TIME METRICS ====================

  @Get('metrics/today')
  async getTodayMetrics(@Request() req: AuthRequest) {
    const { tenantId } = req.user;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [newLeads, jobsCompleted, revenue, appointments] = await Promise.all([
      this.analyticsService.executeReport(tenantId, 'temp', [
        { field: 'created_at', operator: 'gte', value: today },
      ]),
      this.analyticsService.executeReport(tenantId, 'temp', [
        { field: 'status', operator: 'eq', value: 'COMPLETED' },
        { field: 'completed_at', operator: 'gte', value: today },
      ]),
      this.analyticsService.executeReport(tenantId, 'temp', [
        { field: 'created_at', operator: 'gte', value: today },
      ]),
      this.analyticsService.executeReport(tenantId, 'temp', [
        { field: 'scheduled_at', operator: 'between', value: [today, tomorrow] },
      ]),
    ]);

    return {
      newLeads: newLeads.summary?.totalRows || 0,
      jobsCompleted: jobsCompleted.summary?.totalRows || 0,
      revenue: revenue.summary?.aggregations.total_amount || 0,
      appointments: appointments.summary?.totalRows || 0,
    };
  }

  @Get('metrics/this-week')
  async getThisWeekMetrics(@Request() req: AuthRequest) {
    const { tenantId } = req.user;
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    return {
      period: 'week',
      start: startOfWeek,
      end: endOfWeek,
      // Add metrics here
    };
  }

  @Get('metrics/this-month')
  async getThisMonthMetrics(@Request() req: AuthRequest) {
    const { tenantId } = req.user;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    return {
      period: 'month',
      start: startOfMonth,
      end: endOfMonth,
      // Add metrics here
    };
  }

  // ==================== DRILL-DOWN ANALYTICS ====================

  @Post('drill-down')
  async drillDown(
    @Request() req: AuthRequest,
    @Body()
    body: {
      reportId: string;
      dimension: string;
      value: any;
    },
  ) {
    const { tenantId } = req.user;
    const { reportId, dimension, value } = body;

    // Execute original report with additional filter for drill-down
    const additionalFilter = {
      field: dimension,
      operator: 'eq' as const,
      value,
    };

    return this.analyticsService.executeReport(tenantId, reportId, [additionalFilter]);
  }
}
