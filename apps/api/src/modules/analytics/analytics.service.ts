import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ReportColumn {
  field: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'currency' | 'percentage';
  aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
}

export interface ReportFilter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'between';
  value: any;
}

export interface ReportGrouping {
  field: string;
  interval?: 'day' | 'week' | 'month' | 'quarter' | 'year';
}

export interface ReportDefinition {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  dataSource: 'leads' | 'jobs' | 'invoices' | 'payments' | 'customers' | 'custom';
  columns: ReportColumn[];
  filters: ReportFilter[];
  groupBy?: ReportGrouping[];
  orderBy?: { field: string; direction: 'asc' | 'desc' }[];
  limit?: number;
  createdBy: string;
  isShared: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChartConfig {
  type: 'line' | 'bar' | 'pie' | 'area' | 'scatter' | 'heatmap' | 'funnel';
  xAxis?: string;
  yAxis?: string | string[];
  series?: string;
  colors?: string[];
}

export interface ScheduledReport {
  id: string;
  reportId: string;
  tenantId: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  dayOfWeek?: number; // 0-6 for weekly
  dayOfMonth?: number; // 1-31 for monthly
  recipients: string[];
  format: 'pdf' | 'excel' | 'csv';
  isActive: boolean;
  lastSent?: Date;
  nextRun: Date;
}

export interface ReportData {
  columns: ReportColumn[];
  rows: any[];
  summary?: {
    totalRows: number;
    aggregations: Record<string, number>;
  };
  metadata: {
    executionTime: number;
    generatedAt: Date;
    filters: ReportFilter[];
  };
}

export interface DashboardWidget {
  id: string;
  type: 'metric' | 'chart' | 'table' | 'goal' | 'trend';
  title: string;
  reportId?: string;
  config: any;
  position: { x: number; y: number; w: number; h: number };
}

export interface Dashboard {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  widgets: DashboardWidget[];
  isDefault: boolean;
  createdBy: string;
  sharedWith: string[];
}

export interface ComparisonReport {
  metric: string;
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'flat';
}

export interface CohortAnalysis {
  cohortDate: Date;
  cohortSize: number;
  metrics: {
    period: number; // months or weeks since cohort start
    retention: number;
    revenue: number;
    ltv: number;
  }[];
}

@Injectable()
export class AnalyticsService {
  constructor(private db: PrismaService) {}

  // ==================== REPORT BUILDER ====================

  async createReport(tenantId: string, userId: string, reportData: Partial<ReportDefinition>): Promise<ReportDefinition> {
    const report: ReportDefinition = {
      id: `rpt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tenantId,
      name: reportData.name || 'Untitled Report',
      description: reportData.description,
      dataSource: reportData.dataSource || 'leads',
      columns: reportData.columns || [],
      filters: reportData.filters || [],
      groupBy: reportData.groupBy,
      orderBy: reportData.orderBy,
      limit: reportData.limit,
      createdBy: userId,
      isShared: reportData.isShared || false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Validate report definition
    this.validateReport(report);

    // Store in database (using JSON field or separate table)
    await this.db.$executeRaw`
      INSERT INTO reports (id, tenant_id, name, description, data_source, definition, created_by, is_shared, created_at, updated_at)
      VALUES (${report.id}, ${tenantId}, ${report.name}, ${report.description}, ${report.dataSource}, ${JSON.stringify(report)}::jsonb, ${userId}, ${report.isShared}, NOW(), NOW())
    `;

    return report;
  }

  private validateReport(report: ReportDefinition): void {
    if (!report.name || report.name.trim().length === 0) {
      throw new BadRequestException('Report name is required');
    }

    if (report.columns.length === 0) {
      throw new BadRequestException('At least one column is required');
    }

    const validDataSources = ['leads', 'jobs', 'invoices', 'payments', 'customers', 'custom'];
    if (!validDataSources.includes(report.dataSource)) {
      throw new BadRequestException('Invalid data source');
    }
  }

  async getReport(tenantId: string, reportId: string): Promise<ReportDefinition> {
    const result = await this.db.$queryRaw<any[]>`
      SELECT * FROM reports WHERE id = ${reportId} AND tenant_id = ${tenantId}
    `;

    if (result.length === 0) {
      throw new NotFoundException('Report not found');
    }

    return JSON.parse(result[0].definition);
  }

  async updateReport(tenantId: string, reportId: string, updates: Partial<ReportDefinition>): Promise<ReportDefinition> {
    const report = await this.getReport(tenantId, reportId);

    const updated: ReportDefinition = {
      ...report,
      ...updates,
      id: report.id,
      tenantId: report.tenantId,
      createdBy: report.createdBy,
      createdAt: report.createdAt,
      updatedAt: new Date(),
    };

    this.validateReport(updated);

    await this.db.$executeRaw`
      UPDATE reports
      SET name = ${updated.name},
          description = ${updated.description},
          definition = ${JSON.stringify(updated)}::jsonb,
          updated_at = NOW()
      WHERE id = ${reportId} AND tenant_id = ${tenantId}
    `;

    return updated;
  }

  async deleteReport(tenantId: string, reportId: string): Promise<void> {
    await this.db.$executeRaw`
      DELETE FROM reports WHERE id = ${reportId} AND tenant_id = ${tenantId}
    `;
  }

  async listReports(tenantId: string, userId?: string): Promise<ReportDefinition[]> {
    let results;
    if (userId) {
      results = await this.db.$queryRaw<any[]>`
        SELECT * FROM reports
        WHERE tenant_id = ${tenantId}
        AND (created_by = ${userId} OR is_shared = true)
        ORDER BY updated_at DESC
      `;
    } else {
      results = await this.db.$queryRaw<any[]>`
        SELECT * FROM reports
        WHERE tenant_id = ${tenantId}
        ORDER BY updated_at DESC
      `;
    }

    return results.map((r) => JSON.parse(r.definition));
  }

  // ==================== REPORT EXECUTION ====================

  async executeReport(tenantId: string, reportId: string, additionalFilters?: ReportFilter[]): Promise<ReportData> {
    const startTime = Date.now();
    const report = await this.getReport(tenantId, reportId);

    // Combine report filters with additional filters
    const allFilters = [...report.filters, ...(additionalFilters || [])];

    // Build and execute query based on data source
    const rows = await this.executeQuery(tenantId, report, allFilters);

    // Calculate aggregations
    const aggregations = this.calculateAggregations(rows, report.columns);

    const executionTime = Date.now() - startTime;

    return {
      columns: report.columns,
      rows,
      summary: {
        totalRows: rows.length,
        aggregations,
      },
      metadata: {
        executionTime,
        generatedAt: new Date(),
        filters: allFilters,
      },
    };
  }

  private async executeQuery(tenantId: string, report: ReportDefinition, filters: ReportFilter[]): Promise<any[]> {
    // Build SQL query based on data source and filters
    let baseQuery = '';
    let whereClauses = [`tenant_id = '${tenantId}'`];

    switch (report.dataSource) {
      case 'leads':
        baseQuery = 'SELECT * FROM leads';
        break;
      case 'jobs':
        baseQuery = 'SELECT * FROM jobs';
        break;
      case 'invoices':
        baseQuery = 'SELECT * FROM invoices';
        break;
      case 'payments':
        baseQuery = 'SELECT * FROM payments';
        break;
      case 'customers':
        baseQuery = 'SELECT * FROM customers';
        break;
      default:
        throw new BadRequestException('Unsupported data source');
    }

    // Apply filters
    filters.forEach((filter) => {
      const clause = this.buildWhereClause(filter);
      if (clause) whereClauses.push(clause);
    });

    let query = `${baseQuery} WHERE ${whereClauses.join(' AND ')}`;

    // Apply grouping
    if (report.groupBy && report.groupBy.length > 0) {
      const groupFields = report.groupBy.map((g) => this.getGroupByField(g)).join(', ');
      query += ` GROUP BY ${groupFields}`;
    }

    // Apply ordering
    if (report.orderBy && report.orderBy.length > 0) {
      const orderFields = report.orderBy.map((o) => `${o.field} ${o.direction.toUpperCase()}`).join(', ');
      query += ` ORDER BY ${orderFields}`;
    }

    // Apply limit
    if (report.limit) {
      query += ` LIMIT ${report.limit}`;
    }

    const results = await this.db.$queryRawUnsafe<any[]>(query);
    return results;
  }

  private buildWhereClause(filter: ReportFilter): string {
    const { field, operator, value } = filter;

    switch (operator) {
      case 'eq':
        return `${field} = '${value}'`;
      case 'ne':
        return `${field} != '${value}'`;
      case 'gt':
        return `${field} > ${value}`;
      case 'gte':
        return `${field} >= ${value}`;
      case 'lt':
        return `${field} < ${value}`;
      case 'lte':
        return `${field} <= ${value}`;
      case 'contains':
        return `${field} ILIKE '%${value}%'`;
      case 'in':
        const values = Array.isArray(value) ? value : [value];
        return `${field} IN (${values.map((v) => `'${v}'`).join(', ')})`;
      case 'between':
        return `${field} BETWEEN '${value[0]}' AND '${value[1]}'`;
      default:
        return '';
    }
  }

  private getGroupByField(grouping: ReportGrouping): string {
    if (grouping.interval) {
      // Group by date interval
      switch (grouping.interval) {
        case 'day':
          return `DATE(${grouping.field})`;
        case 'week':
          return `DATE_TRUNC('week', ${grouping.field})`;
        case 'month':
          return `DATE_TRUNC('month', ${grouping.field})`;
        case 'quarter':
          return `DATE_TRUNC('quarter', ${grouping.field})`;
        case 'year':
          return `DATE_TRUNC('year', ${grouping.field})`;
        default:
          return grouping.field;
      }
    }
    return grouping.field;
  }

  private calculateAggregations(rows: any[], columns: ReportColumn[]): Record<string, number> {
    const aggregations: Record<string, number> = {};

    columns.forEach((column) => {
      if (column.aggregation) {
        const values = rows.map((row) => row[column.field]).filter((v) => v != null);

        switch (column.aggregation) {
          case 'sum':
            aggregations[column.field] = values.reduce((sum, val) => sum + Number(val), 0);
            break;
          case 'avg':
            aggregations[column.field] = values.reduce((sum, val) => sum + Number(val), 0) / values.length;
            break;
          case 'count':
            aggregations[column.field] = values.length;
            break;
          case 'min':
            aggregations[column.field] = Math.min(...values.map(Number));
            break;
          case 'max':
            aggregations[column.field] = Math.max(...values.map(Number));
            break;
        }
      }
    });

    return aggregations;
  }

  // ==================== DATA VISUALIZATION ====================

  async generateChart(tenantId: string, reportId: string, chartConfig: ChartConfig): Promise<any> {
    const reportData = await this.executeReport(tenantId, reportId);

    const chartData = this.transformDataForChart(reportData, chartConfig);

    return {
      type: chartConfig.type,
      data: chartData,
      config: chartConfig,
    };
  }

  private transformDataForChart(reportData: ReportData, config: ChartConfig): any {
    const { type, xAxis, yAxis, series } = config;

    switch (type) {
      case 'line':
      case 'bar':
      case 'area':
        return {
          labels: reportData.rows.map((row) => row[xAxis!]),
          datasets: Array.isArray(yAxis)
            ? yAxis.map((y, i) => ({
                label: y,
                data: reportData.rows.map((row) => row[y]),
                backgroundColor: config.colors?.[i] || this.getDefaultColor(i),
              }))
            : [
                {
                  label: yAxis,
                  data: reportData.rows.map((row) => row[yAxis!]),
                  backgroundColor: config.colors?.[0] || this.getDefaultColor(0),
                },
              ],
        };

      case 'pie':
        return {
          labels: reportData.rows.map((row) => row[xAxis!]),
          datasets: [
            {
              data: reportData.rows.map((row) => row[yAxis as string]),
              backgroundColor: config.colors || reportData.rows.map((_, i) => this.getDefaultColor(i)),
            },
          ],
        };

      case 'scatter':
        return {
          datasets: [
            {
              label: 'Data Points',
              data: reportData.rows.map((row) => ({
                x: row[xAxis!],
                y: row[yAxis as string],
              })),
              backgroundColor: config.colors?.[0] || this.getDefaultColor(0),
            },
          ],
        };

      case 'heatmap':
        // Group data for heatmap
        const grouped = new Map<string, Map<string, number>>();
        reportData.rows.forEach((row) => {
          const x = row[xAxis!];
          const y = row[yAxis as string];
          const value = row[series!] || 1;

          if (!grouped.has(x)) grouped.set(x, new Map());
          grouped.get(x)!.set(y, (grouped.get(x)!.get(y) || 0) + value);
        });

        return {
          xLabels: Array.from(new Set(reportData.rows.map((r) => r[xAxis!]))),
          yLabels: Array.from(new Set(reportData.rows.map((r) => r[yAxis as string]))),
          data: Array.from(grouped.entries()).map(([x, yMap]) =>
            Array.from(yMap.entries()).map(([y, value]) => ({ x, y, value })),
          ),
        };

      case 'funnel':
        return {
          stages: reportData.rows.map((row) => ({
            name: row[xAxis!],
            value: row[yAxis as string],
            percentage: 100, // Calculate based on first stage
          })),
        };

      default:
        return reportData.rows;
    }
  }

  private getDefaultColor(index: number): string {
    const colors = [
      '#3B82F6', // blue
      '#10B981', // green
      '#F59E0B', // amber
      '#EF4444', // red
      '#8B5CF6', // purple
      '#EC4899', // pink
      '#14B8A6', // teal
      '#F97316', // orange
    ];
    return colors[index % colors.length];
  }

  // ==================== SCHEDULED REPORTS ====================

  async createScheduledReport(
    tenantId: string,
    reportId: string,
    schedule: Partial<ScheduledReport>,
  ): Promise<ScheduledReport> {
    const scheduledReport: ScheduledReport = {
      id: `sched_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      reportId,
      tenantId,
      frequency: schedule.frequency || 'weekly',
      dayOfWeek: schedule.dayOfWeek,
      dayOfMonth: schedule.dayOfMonth,
      recipients: schedule.recipients || [],
      format: schedule.format || 'pdf',
      isActive: schedule.isActive !== false,
      nextRun: this.calculateNextRun(schedule.frequency || 'weekly', schedule.dayOfWeek, schedule.dayOfMonth),
    };

    await this.db.$executeRaw`
      INSERT INTO scheduled_reports (id, report_id, tenant_id, frequency, day_of_week, day_of_month, recipients, format, is_active, next_run)
      VALUES (${scheduledReport.id}, ${reportId}, ${tenantId}, ${scheduledReport.frequency}, ${scheduledReport.dayOfWeek}, ${scheduledReport.dayOfMonth}, ${JSON.stringify(scheduledReport.recipients)}, ${scheduledReport.format}, ${scheduledReport.isActive}, ${scheduledReport.nextRun})
    `;

    return scheduledReport;
  }

  private calculateNextRun(frequency: string, dayOfWeek?: number, dayOfMonth?: number): Date {
    const now = new Date();

    switch (frequency) {
      case 'daily':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);

      case 'weekly':
        const daysUntilTarget = ((dayOfWeek || 1) - now.getDay() + 7) % 7 || 7;
        return new Date(now.getTime() + daysUntilTarget * 24 * 60 * 60 * 1000);

      case 'monthly':
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, dayOfMonth || 1);
        return nextMonth;

      case 'quarterly':
        const nextQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 1);
        return nextQuarter;

      default:
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
  }

  async getScheduledReports(tenantId: string): Promise<ScheduledReport[]> {
    const results = await this.db.$queryRaw<any[]>`
      SELECT * FROM scheduled_reports WHERE tenant_id = ${tenantId} ORDER BY next_run ASC
    `;

    return results.map((r) => ({
      ...r,
      recipients: JSON.parse(r.recipients),
    }));
  }

  async updateScheduledReport(
    tenantId: string,
    scheduleId: string,
    updates: Partial<ScheduledReport>,
  ): Promise<ScheduledReport> {
    const current = await this.db.$queryRaw<any[]>`
      SELECT * FROM scheduled_reports WHERE id = ${scheduleId} AND tenant_id = ${tenantId}
    `;

    if (current.length === 0) {
      throw new NotFoundException('Scheduled report not found');
    }

    const updated = {
      ...current[0],
      ...updates,
      recipients: JSON.stringify(updates.recipients || JSON.parse(current[0].recipients)),
    };

    await this.db.$executeRaw`
      UPDATE scheduled_reports
      SET frequency = ${updated.frequency},
          day_of_week = ${updated.day_of_week},
          day_of_month = ${updated.day_of_month},
          recipients = ${updated.recipients}::jsonb,
          format = ${updated.format},
          is_active = ${updated.is_active}
      WHERE id = ${scheduleId} AND tenant_id = ${tenantId}
    `;

    return {
      ...updated,
      recipients: JSON.parse(updated.recipients),
    };
  }

  // ==================== DASHBOARDS ====================

  async createDashboard(tenantId: string, userId: string, dashboardData: Partial<Dashboard>): Promise<Dashboard> {
    const dashboard: Dashboard = {
      id: `dash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tenantId,
      name: dashboardData.name || 'New Dashboard',
      description: dashboardData.description,
      widgets: dashboardData.widgets || [],
      isDefault: dashboardData.isDefault || false,
      createdBy: userId,
      sharedWith: dashboardData.sharedWith || [],
    };

    await this.db.$executeRaw`
      INSERT INTO dashboards (id, tenant_id, name, description, widgets, is_default, created_by, shared_with, created_at)
      VALUES (${dashboard.id}, ${tenantId}, ${dashboard.name}, ${dashboard.description}, ${JSON.stringify(dashboard.widgets)}::jsonb, ${dashboard.isDefault}, ${userId}, ${JSON.stringify(dashboard.sharedWith)}::jsonb, NOW())
    `;

    return dashboard;
  }

  async getDashboard(tenantId: string, dashboardId: string): Promise<Dashboard> {
    const results = await this.db.$queryRaw<any[]>`
      SELECT * FROM dashboards WHERE id = ${dashboardId} AND tenant_id = ${tenantId}
    `;

    if (results.length === 0) {
      throw new NotFoundException('Dashboard not found');
    }

    return {
      ...results[0],
      widgets: JSON.parse(results[0].widgets),
      sharedWith: JSON.parse(results[0].shared_with),
    };
  }

  async updateDashboard(tenantId: string, dashboardId: string, updates: Partial<Dashboard>): Promise<Dashboard> {
    const dashboard = await this.getDashboard(tenantId, dashboardId);

    const updated = {
      ...dashboard,
      ...updates,
    };

    await this.db.$executeRaw`
      UPDATE dashboards
      SET name = ${updated.name},
          description = ${updated.description},
          widgets = ${JSON.stringify(updated.widgets)}::jsonb,
          is_default = ${updated.isDefault},
          shared_with = ${JSON.stringify(updated.sharedWith)}::jsonb
      WHERE id = ${dashboardId} AND tenant_id = ${tenantId}
    `;

    return updated;
  }

  async listDashboards(tenantId: string, userId: string): Promise<Dashboard[]> {
    const results = await this.db.$queryRaw<any[]>`
      SELECT * FROM dashboards
      WHERE tenant_id = ${tenantId}
      AND (created_by = ${userId} OR ${userId} = ANY(shared_with::text[]))
      ORDER BY is_default DESC, name ASC
    `;

    return results.map((r) => ({
      ...r,
      widgets: JSON.parse(r.widgets),
      sharedWith: JSON.parse(r.shared_with),
    }));
  }

  // ==================== COMPARISON REPORTS ====================

  async generateComparisonReport(
    tenantId: string,
    metric: string,
    currentPeriod: { start: Date; end: Date },
    previousPeriod: { start: Date; end: Date },
  ): Promise<ComparisonReport> {
    // Get current period data
    const currentData = await this.db.$queryRaw<any[]>`
      SELECT SUM(${metric}) as total
      FROM jobs
      WHERE tenant_id = ${tenantId}
      AND created_at BETWEEN ${currentPeriod.start} AND ${currentPeriod.end}
    `;

    // Get previous period data
    const previousData = await this.db.$queryRaw<any[]>`
      SELECT SUM(${metric}) as total
      FROM jobs
      WHERE tenant_id = ${tenantId}
      AND created_at BETWEEN ${previousPeriod.start} AND ${previousPeriod.end}
    `;

    const current = Number(currentData[0]?.total || 0);
    const previous = Number(previousData[0]?.total || 0);
    const change = current - previous;
    const changePercent = previous !== 0 ? (change / previous) * 100 : 0;

    return {
      metric,
      current,
      previous,
      change,
      changePercent,
      trend: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
    };
  }

  async generateYearOverYearReport(tenantId: string, metric: string, year: number): Promise<ComparisonReport[]> {
    const reports: ComparisonReport[] = [];

    for (let month = 0; month < 12; month++) {
      const currentStart = new Date(year, month, 1);
      const currentEnd = new Date(year, month + 1, 0);
      const previousStart = new Date(year - 1, month, 1);
      const previousEnd = new Date(year - 1, month + 1, 0);

      const comparison = await this.generateComparisonReport(
        tenantId,
        metric,
        { start: currentStart, end: currentEnd },
        { start: previousStart, end: previousEnd },
      );

      reports.push(comparison);
    }

    return reports;
  }

  // ==================== COHORT ANALYSIS ====================

  async generateCohortAnalysis(
    tenantId: string,
    cohortField: 'created_at' | 'first_purchase_at',
    metricField: string,
    periods: number = 12,
  ): Promise<CohortAnalysis[]> {
    // Group customers by cohort (month they joined)
    const cohorts = await this.db.$queryRaw<any[]>`
      SELECT
        DATE_TRUNC('month', ${cohortField}) as cohort_date,
        COUNT(*) as cohort_size
      FROM customers
      WHERE tenant_id = ${tenantId}
      GROUP BY cohort_date
      ORDER BY cohort_date DESC
      LIMIT ${periods}
    `;

    const analyses: CohortAnalysis[] = [];

    for (const cohort of cohorts) {
      const cohortDate = new Date(cohort.cohort_date);
      const cohortSize = Number(cohort.cohort_size);

      const metrics = [];

      // Calculate metrics for each period after cohort start
      for (let period = 0; period < periods; period++) {
        const periodStart = new Date(cohortDate);
        periodStart.setMonth(periodStart.getMonth() + period);
        const periodEnd = new Date(periodStart);
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        // Calculate retention
        const retained = await this.db.$queryRaw<any[]>`
          SELECT COUNT(DISTINCT customer_id) as count
          FROM jobs
          WHERE tenant_id = ${tenantId}
          AND customer_id IN (
            SELECT id FROM customers
            WHERE tenant_id = ${tenantId}
            AND DATE_TRUNC('month', ${cohortField}) = ${cohortDate}
          )
          AND created_at BETWEEN ${periodStart} AND ${periodEnd}
        `;

        const retainedCount = Number(retained[0]?.count || 0);
        const retention = cohortSize > 0 ? retainedCount / cohortSize : 0;

        // Calculate revenue
        const revenueData = await this.db.$queryRaw<any[]>`
          SELECT SUM(${metricField}) as revenue
          FROM jobs
          WHERE tenant_id = ${tenantId}
          AND customer_id IN (
            SELECT id FROM customers
            WHERE tenant_id = ${tenantId}
            AND DATE_TRUNC('month', ${cohortField}) = ${cohortDate}
          )
          AND created_at BETWEEN ${periodStart} AND ${periodEnd}
        `;

        const revenue = Number(revenueData[0]?.revenue || 0);

        // Calculate LTV (cumulative revenue)
        const ltvData = await this.db.$queryRaw<any[]>`
          SELECT SUM(${metricField}) / ${cohortSize} as ltv
          FROM jobs
          WHERE tenant_id = ${tenantId}
          AND customer_id IN (
            SELECT id FROM customers
            WHERE tenant_id = ${tenantId}
            AND DATE_TRUNC('month', ${cohortField}) = ${cohortDate}
          )
          AND created_at <= ${periodEnd}
        `;

        const ltv = Number(ltvData[0]?.ltv || 0);

        metrics.push({
          period,
          retention,
          revenue,
          ltv,
        });
      }

      analyses.push({
        cohortDate,
        cohortSize,
        metrics,
      });
    }

    return analyses;
  }

  // ==================== EXPORT ====================

  async exportReport(tenantId: string, reportId: string, format: 'pdf' | 'excel' | 'csv'): Promise<Buffer> {
    const reportData = await this.executeReport(tenantId, reportId);

    switch (format) {
      case 'csv':
        return this.exportToCSV(reportData);
      case 'excel':
        return this.exportToExcel(reportData);
      case 'pdf':
        return this.exportToPDF(reportData);
      default:
        throw new BadRequestException('Unsupported export format');
    }
  }

  private exportToCSV(reportData: ReportData): Buffer {
    // Build CSV content
    const headers = reportData.columns.map((c) => c.label).join(',');
    const rows = reportData.rows.map((row) => reportData.columns.map((c) => row[c.field] || '').join(',')).join('\n');

    const csv = `${headers}\n${rows}`;
    return Buffer.from(csv, 'utf-8');
  }

  private exportToExcel(reportData: ReportData): Buffer {
    // In real implementation, use a library like 'exceljs'
    // For now, return CSV as placeholder
    return this.exportToCSV(reportData);
  }

  private exportToPDF(reportData: ReportData): Buffer {
    // In real implementation, use a library like 'pdfkit' or 'puppeteer'
    // For now, return simple text as placeholder
    const content = `
Report Generated: ${reportData.metadata.generatedAt.toISOString()}
Total Rows: ${reportData.summary?.totalRows}

${reportData.columns.map((c) => c.label).join(' | ')}
${reportData.rows.map((row) => reportData.columns.map((c) => row[c.field]).join(' | ')).join('\n')}
    `;

    return Buffer.from(content, 'utf-8');
  }
}
