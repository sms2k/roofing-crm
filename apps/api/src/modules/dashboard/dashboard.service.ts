import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { OllamaService } from '../ai/ollama.service';

interface KPIMetrics {
  period: { start: Date; end: Date };
  revenue: {
    total: number;
    previous: number;
    change: number; // percentage
    trend: 'UP' | 'DOWN' | 'FLAT';
  };
  jobs: {
    total: number;
    completed: number;
    inProgress: number;
    scheduled: number;
    cancelled: number;
    completionRate: number;
  };
  leads: {
    total: number;
    new: number;
    contacted: number;
    qualified: number;
    quoted: number;
    converted: number;
    conversionRate: number;
  };
  pipeline: {
    totalValue: number;
    averageDealSize: number;
    weightedValue: number;
    health: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  };
  team: {
    totalReps: number;
    activeReps: number;
    averageDealsPerRep: number;
    topPerformer: { id: string; name: string; revenue: number };
  };
}

interface RevenueForecast {
  predictions: {
    date: Date;
    predictedRevenue: number;
    confidence: number; // 0-100
    low: number; // pessimistic
    high: number; // optimistic
  }[];
  summary: {
    nextMonth: number;
    nextQuarter: number;
    yearEnd: number;
    growthRate: number; // percentage
  };
  factors: {
    name: string;
    impact: number; // percentage
    trend: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  }[];
}

interface PipelineHealth {
  overall: {
    score: number; // 0-100
    status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    issues: string[];
    recommendations: string[];
  };
  stages: {
    stage: string;
    count: number;
    value: number;
    averageAge: number; // days
    health: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  }[];
  conversion: {
    stage: string;
    nextStage: string;
    rate: number; // percentage
    benchmark: number; // industry average
  }[];
  velocity: {
    averageDaysToClose: number;
    medianDaysToClose: number;
    trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  };
}

interface TeamPerformance {
  leaderboard: {
    id: string;
    name: string;
    rank: number;
    metrics: {
      revenue: number;
      jobsCompleted: number;
      conversionRate: number;
      averageDealSize: number;
      score: number; // 0-100
    };
  }[];
  distribution: {
    topPerformers: number; // count
    average: number;
    underperforming: number;
  };
  insights: string[];
}

interface CustomReport {
  id: string;
  name: string;
  type: 'KPI' | 'REVENUE' | 'PIPELINE' | 'TEAM' | 'CUSTOM';
  filters: {
    dateRange: { start: Date; end: Date };
    userIds?: string[];
    sources?: string[];
    statuses?: string[];
  };
  metrics: string[];
  data: any;
  generatedAt: Date;
  generatedBy: string;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly ollama: OllamaService,
  ) {}

  /**
   * Get comprehensive KPI metrics
   */
  async getKPIMetrics(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<KPIMetrics> {
    this.logger.log(`Calculating KPIs for ${startDate} to ${endDate}`);

    // Get previous period for comparison
    const periodLength = endDate.getTime() - startDate.getTime();
    const prevStart = new Date(startDate.getTime() - periodLength);
    const prevEnd = startDate;

    const [
      revenueData,
      prevRevenueData,
      jobsData,
      leadsData,
      pipelineData,
      teamData,
    ] = await Promise.all([
      this.calculateRevenue(tenantId, startDate, endDate),
      this.calculateRevenue(tenantId, prevStart, prevEnd),
      this.calculateJobMetrics(tenantId, startDate, endDate),
      this.calculateLeadMetrics(tenantId, startDate, endDate),
      this.calculatePipelineMetrics(tenantId),
      this.calculateTeamMetrics(tenantId, startDate, endDate),
    ]);

    const revenueChange =
      prevRevenueData > 0 ? ((revenueData - prevRevenueData) / prevRevenueData) * 100 : 0;
    const revenueTrend =
      revenueChange > 5 ? 'UP' : revenueChange < -5 ? 'DOWN' : 'FLAT';

    return {
      period: { start: startDate, end: endDate },
      revenue: {
        total: revenueData,
        previous: prevRevenueData,
        change: revenueChange,
        trend: revenueTrend,
      },
      jobs: jobsData,
      leads: leadsData,
      pipeline: pipelineData,
      team: teamData,
    };
  }

  /**
   * Calculate total revenue
   */
  private async calculateRevenue(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const jobs = await this.db.job.findMany({
      where: {
        tenantId,
        completedAt: {
          gte: startDate,
          lte: endDate,
        },
        status: 'COMPLETED',
      },
    });

    return jobs.reduce((sum, job) => sum + parseFloat(job.totalPrice?.toString() || '0'), 0);
  }

  /**
   * Calculate job metrics
   */
  private async calculateJobMetrics(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<KPIMetrics['jobs']> {
    const jobs = await this.db.job.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const total = jobs.length;
    const completed = jobs.filter((j) => j.status === 'COMPLETED').length;
    const inProgress = jobs.filter((j) => j.status === 'IN_PROGRESS').length;
    const scheduled = jobs.filter((j) => j.status === 'SCHEDULED').length;
    const cancelled = jobs.filter((j) => j.status === 'CANCELLED').length;
    const completionRate = total > 0 ? (completed / total) * 100 : 0;

    return {
      total,
      completed,
      inProgress,
      scheduled,
      cancelled,
      completionRate,
    };
  }

  /**
   * Calculate lead metrics
   */
  private async calculateLeadMetrics(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<KPIMetrics['leads']> {
    const leads = await this.db.lead.findMany({
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

    const total = leads.length;
    const newLeads = leads.filter((l) => l.status === 'NEW').length;
    const contacted = leads.filter((l) => l.contactedAt !== null).length;
    const qualified = leads.filter((l) => l.status === 'QUALIFIED').length;
    const quoted = leads.filter((l) => l.status === 'QUOTED').length;
    const converted = leads.filter((l) => l.job !== null).length;
    const conversionRate = total > 0 ? (converted / total) * 100 : 0;

    return {
      total,
      new: newLeads,
      contacted,
      qualified,
      quoted,
      converted,
      conversionRate,
    };
  }

  /**
   * Calculate pipeline metrics
   */
  private async calculatePipelineMetrics(tenantId: string): Promise<KPIMetrics['pipeline']> {
    const activeLeads = await this.db.lead.findMany({
      where: {
        tenantId,
        status: {
          in: ['NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED'],
        },
      },
    });

    const totalValue = activeLeads.reduce(
      (sum, lead) => sum + parseFloat(lead.estimatedValue?.toString() || '0'),
      0,
    );

    const averageDealSize =
      activeLeads.length > 0 ? totalValue / activeLeads.length : 0;

    // Weighted value based on probability of close
    const weights = {
      NEW: 0.1,
      CONTACTED: 0.25,
      QUALIFIED: 0.5,
      QUOTED: 0.75,
    };

    const weightedValue = activeLeads.reduce(
      (sum, lead) =>
        sum +
        parseFloat(lead.estimatedValue?.toString() || '0') *
          (weights[lead.status as keyof typeof weights] || 0),
      0,
    );

    // Determine pipeline health
    let health: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
    if (activeLeads.length < 10) health = 'CRITICAL';
    else if (activeLeads.length < 25) health = 'WARNING';

    return {
      totalValue,
      averageDealSize,
      weightedValue,
      health,
    };
  }

  /**
   * Calculate team metrics
   */
  private async calculateTeamMetrics(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<KPIMetrics['team']> {
    const reps = await this.db.user.findMany({
      where: {
        tenantId,
        role: 'SALES_REP',
      },
      include: {
        contact: true,
      },
    });

    const totalReps = reps.length;
    const activeReps = reps.filter((r) => r.isActive !== false).length;

    // Get jobs per rep
    const repPerformance = await Promise.all(
      reps.map(async (rep) => {
        const jobs = await this.db.job.findMany({
          where: {
            tenantId,
            // assignedToId: rep.id, // Would need this field
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
            status: 'COMPLETED',
          },
        });

        const revenue = jobs.reduce(
          (sum, job) => sum + parseFloat(job.totalPrice?.toString() || '0'),
          0,
        );

        return {
          id: rep.id,
          name: `${rep.contact.firstName} ${rep.contact.lastName}`,
          revenue,
          jobs: jobs.length,
        };
      }),
    );

    const topPerformer = repPerformance.sort((a, b) => b.revenue - a.revenue)[0] || {
      id: '',
      name: 'N/A',
      revenue: 0,
    };

    const totalJobs = repPerformance.reduce((sum, rep) => sum + rep.jobs, 0);
    const averageDealsPerRep = activeReps > 0 ? totalJobs / activeReps : 0;

    return {
      totalReps,
      activeReps,
      averageDealsPerRep,
      topPerformer,
    };
  }

  /**
   * Generate revenue forecast using ML
   */
  async generateRevenueForecast(
    tenantId: string,
    months: number = 3,
  ): Promise<RevenueForecast> {
    this.logger.log(`Generating ${months}-month revenue forecast`);

    // Get historical data (last 12 months)
    const historicalMonths = 12;
    const monthlyRevenue: { month: Date; revenue: number }[] = [];

    for (let i = historicalMonths; i >= 0; i--) {
      const monthStart = new Date();
      monthStart.setMonth(monthStart.getMonth() - i);
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      monthEnd.setDate(0);
      monthEnd.setHours(23, 59, 59, 999);

      const revenue = await this.calculateRevenue(tenantId, monthStart, monthEnd);

      monthlyRevenue.push({
        month: new Date(monthStart),
        revenue,
      });
    }

    // Calculate trend using simple linear regression
    const { slope, intercept } = this.linearRegression(
      monthlyRevenue.map((_, i) => i),
      monthlyRevenue.map((m) => m.revenue),
    );

    // Generate predictions
    const predictions: RevenueForecast['predictions'] = [];
    const baseIndex = monthlyRevenue.length;

    for (let i = 1; i <= months; i++) {
      const predictedDate = new Date();
      predictedDate.setMonth(predictedDate.getMonth() + i);
      predictedDate.setDate(1);

      const predictedRevenue = slope * (baseIndex + i) + intercept;

      // Calculate confidence based on data consistency
      const stdDev = this.standardDeviation(monthlyRevenue.map((m) => m.revenue));
      const confidence = Math.max(50, 100 - (stdDev / predictedRevenue) * 100);

      predictions.push({
        date: predictedDate,
        predictedRevenue: Math.max(0, predictedRevenue),
        confidence: Math.round(confidence),
        low: Math.max(0, predictedRevenue - stdDev),
        high: predictedRevenue + stdDev,
      });
    }

    // Calculate summary metrics
    const nextMonth = predictions[0]?.predictedRevenue || 0;
    const nextQuarter =
      predictions.slice(0, 3).reduce((sum, p) => sum + p.predictedRevenue, 0);
    const yearEnd = predictions.reduce((sum, p) => sum + p.predictedRevenue, 0);

    const currentRevenue =
      monthlyRevenue[monthlyRevenue.length - 1]?.revenue || 1;
    const growthRate = ((nextMonth - currentRevenue) / currentRevenue) * 100;

    // Identify impact factors
    const factors = await this.identifyRevenuFactors(tenantId, monthlyRevenue);

    return {
      predictions,
      summary: {
        nextMonth,
        nextQuarter,
        yearEnd,
        growthRate,
      },
      factors,
    };
  }

  /**
   * Linear regression calculation
   */
  private linearRegression(x: number[], y: number[]): { slope: number; intercept: number } {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
  }

  /**
   * Calculate standard deviation
   */
  private standardDeviation(values: number[]): number {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map((value) => Math.pow(value - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
    return Math.sqrt(avgSquareDiff);
  }

  /**
   * Identify revenue impact factors
   */
  private async identifyRevenuFactors(
    tenantId: string,
    historicalData: { month: Date; revenue: number }[],
  ): Promise<RevenueForecast['factors']> {
    const factors: RevenueForecast['factors'] = [];

    // Check if revenue is growing
    const recentRevenue = historicalData.slice(-3).map((m) => m.revenue);
    const olderRevenue = historicalData.slice(-6, -3).map((m) => m.revenue);

    const recentAvg = recentRevenue.reduce((a, b) => a + b, 0) / recentRevenue.length;
    const olderAvg = olderRevenue.reduce((a, b) => a + b, 0) / olderRevenue.length;

    if (recentAvg > olderAvg * 1.1) {
      factors.push({
        name: 'Revenue Growth Momentum',
        impact: 15,
        trend: 'POSITIVE',
      });
    } else if (recentAvg < olderAvg * 0.9) {
      factors.push({
        name: 'Revenue Decline',
        impact: -15,
        trend: 'NEGATIVE',
      });
    }

    // Check pipeline strength
    const pipelineMetrics = await this.calculatePipelineMetrics(tenantId);
    if (pipelineMetrics.health === 'HEALTHY') {
      factors.push({
        name: 'Strong Pipeline',
        impact: 10,
        trend: 'POSITIVE',
      });
    } else if (pipelineMetrics.health === 'CRITICAL') {
      factors.push({
        name: 'Weak Pipeline',
        impact: -10,
        trend: 'NEGATIVE',
      });
    }

    // Seasonality factor (roofing is seasonal)
    const currentMonth = new Date().getMonth();
    if (currentMonth >= 3 && currentMonth <= 9) {
      // Spring/Summer/Fall
      factors.push({
        name: 'Peak Season',
        impact: 12,
        trend: 'POSITIVE',
      });
    } else {
      factors.push({
        name: 'Off Season',
        impact: -8,
        trend: 'NEGATIVE',
      });
    }

    return factors;
  }

  /**
   * Analyze pipeline health
   */
  async analyzePipelineHealth(tenantId: string): Promise<PipelineHealth> {
    this.logger.log('Analyzing pipeline health');

    const leads = await this.db.lead.findMany({
      where: {
        tenantId,
        status: {
          in: ['NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED'],
        },
      },
    });

    // Analyze by stage
    const stages = ['NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED'];
    const stageAnalysis = stages.map((stage) => {
      const stageLeads = leads.filter((l) => l.status === stage);
      const value = stageLeads.reduce(
        (sum, l) => sum + parseFloat(l.estimatedValue?.toString() || '0'),
        0,
      );

      // Calculate average age
      const ages = stageLeads.map(
        (l) => (Date.now() - l.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      const averageAge =
        ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : 0;

      // Determine health
      let health: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
      if (averageAge > 60) health = 'CRITICAL';
      else if (averageAge > 30) health = 'WARNING';

      return {
        stage,
        count: stageLeads.length,
        value,
        averageAge,
        health,
      };
    });

    // Calculate conversion rates
    const allLeads = await this.db.lead.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const conversion = [
      {
        stage: 'NEW',
        nextStage: 'CONTACTED',
        rate: this.calculateConversionRate(allLeads, 'NEW', 'CONTACTED'),
        benchmark: 80,
      },
      {
        stage: 'CONTACTED',
        nextStage: 'QUALIFIED',
        rate: this.calculateConversionRate(allLeads, 'CONTACTED', 'QUALIFIED'),
        benchmark: 40,
      },
      {
        stage: 'QUALIFIED',
        nextStage: 'QUOTED',
        rate: this.calculateConversionRate(allLeads, 'QUALIFIED', 'QUOTED'),
        benchmark: 60,
      },
    ];

    // Calculate velocity
    const closedLeads = await this.db.lead.findMany({
      where: {
        tenantId,
        status: 'WON',
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    const daysToClose = closedLeads
      .map((l) => (l.updatedAt.getTime() - l.createdAt.getTime()) / (1000 * 60 * 60 * 24))
      .filter((d) => d > 0);

    const averageDaysToClose =
      daysToClose.length > 0
        ? daysToClose.reduce((a, b) => a + b, 0) / daysToClose.length
        : 0;
    const medianDaysToClose =
      daysToClose.length > 0
        ? daysToClose.sort((a, b) => a - b)[Math.floor(daysToClose.length / 2)]
        : 0;

    // Calculate overall score
    let score = 100;
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check stage health
    stageAnalysis.forEach((stage) => {
      if (stage.health === 'CRITICAL') {
        score -= 20;
        issues.push(`${stage.stage} stage has stale leads (avg ${Math.round(stage.averageAge)} days)`);
        recommendations.push(`Review and reactivate ${stage.stage} leads`);
      } else if (stage.health === 'WARNING') {
        score -= 10;
      }
    });

    // Check conversion rates
    conversion.forEach((conv) => {
      if (conv.rate < conv.benchmark * 0.7) {
        score -= 15;
        issues.push(
          `${conv.stage} → ${conv.nextStage} conversion is below benchmark (${Math.round(conv.rate)}% vs ${conv.benchmark}%)`,
        );
        recommendations.push(`Improve ${conv.stage} stage processes`);
      }
    });

    const status: 'HEALTHY' | 'WARNING' | 'CRITICAL' =
      score >= 70 ? 'HEALTHY' : score >= 50 ? 'WARNING' : 'CRITICAL';

    return {
      overall: {
        score: Math.max(0, score),
        status,
        issues,
        recommendations,
      },
      stages: stageAnalysis,
      conversion,
      velocity: {
        averageDaysToClose: Math.round(averageDaysToClose),
        medianDaysToClose: Math.round(medianDaysToClose),
        trend: 'STABLE',
      },
    };
  }

  /**
   * Calculate conversion rate between stages
   */
  private calculateConversionRate(
    leads: any[],
    fromStage: string,
    toStage: string,
  ): number {
    const fromLeads = leads.filter((l) => l.status === fromStage).length;
    const convertedLeads = leads.filter(
      (l) => l.status === toStage || this.isAfterStage(l.status, toStage),
    ).length;

    return fromLeads > 0 ? (convertedLeads / fromLeads) * 100 : 0;
  }

  /**
   * Check if status is after given stage
   */
  private isAfterStage(status: string, stage: string): boolean {
    const order = ['NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED', 'WON'];
    return order.indexOf(status) > order.indexOf(stage);
  }

  /**
   * Get team performance leaderboard
   */
  async getTeamPerformance(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<TeamPerformance> {
    this.logger.log('Calculating team performance');

    const reps = await this.db.user.findMany({
      where: {
        tenantId,
        role: 'SALES_REP',
      },
      include: {
        contact: true,
      },
    });

    const leaderboard = await Promise.all(
      reps.map(async (rep, index) => {
        const leads = await this.db.lead.findMany({
          where: {
            tenantId,
            assignedToId: rep.id,
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
          include: {
            job: true,
          },
        });

        const jobs = leads.filter((l) => l.job && l.job.status === 'COMPLETED').map((l) => l.job);

        const revenue = jobs.reduce(
          (sum, job) => sum + parseFloat(job!.totalPrice?.toString() || '0'),
          0,
        );

        const conversionRate = leads.length > 0 ? (jobs.length / leads.length) * 100 : 0;
        const averageDealSize = jobs.length > 0 ? revenue / jobs.length : 0;

        // Calculate performance score
        const score = Math.min(
          100,
          conversionRate * 0.5 + // 50% weight on conversion
            Math.min(100, (revenue / 50000) * 30) + // 30% weight on revenue
            Math.min(100, (jobs.length / 10) * 20), // 20% weight on volume
        );

        return {
          id: rep.id,
          name: `${rep.contact.firstName} ${rep.contact.lastName}`,
          rank: 0, // Will be set after sorting
          metrics: {
            revenue,
            jobsCompleted: jobs.length,
            conversionRate,
            averageDealSize,
            score: Math.round(score),
          },
        };
      }),
    );

    // Sort and assign ranks
    leaderboard.sort((a, b) => b.metrics.score - a.metrics.score);
    leaderboard.forEach((rep, i) => (rep.rank = i + 1));

    // Calculate distribution
    const topPerformers = leaderboard.filter((r) => r.metrics.score >= 75).length;
    const underperforming = leaderboard.filter((r) => r.metrics.score < 50).length;
    const average =
      leaderboard.reduce((sum, r) => sum + r.metrics.score, 0) / (leaderboard.length || 1);

    // Generate insights
    const insights = this.generateTeamInsights(leaderboard);

    return {
      leaderboard,
      distribution: {
        topPerformers,
        average: Math.round(average),
        underperforming,
      },
      insights,
    };
  }

  /**
   * Generate team insights
   */
  private generateTeamInsights(leaderboard: TeamPerformance['leaderboard']): string[] {
    const insights: string[] = [];

    if (leaderboard.length === 0) {
      return ['No sales reps data available'];
    }

    const top = leaderboard[0];
    insights.push(
      `${top.name} is the top performer with $${top.metrics.revenue.toLocaleString()} in revenue`,
    );

    const avgRevenue =
      leaderboard.reduce((sum, r) => sum + r.metrics.revenue, 0) / leaderboard.length;
    const highPerformers = leaderboard.filter(
      (r) => r.metrics.revenue > avgRevenue * 1.5,
    ).length;

    if (highPerformers > 0) {
      insights.push(`${highPerformers} reps are exceeding average performance by 50%+`);
    }

    const lowConversion = leaderboard.filter((r) => r.metrics.conversionRate < 20);
    if (lowConversion.length > 0) {
      insights.push(
        `${lowConversion.length} reps need coaching on conversion (below 20%)`,
      );
    }

    return insights;
  }

  /**
   * Generate custom report
   */
  async generateCustomReport(
    tenantId: string,
    userId: string,
    config: {
      name: string;
      type: CustomReport['type'];
      filters: CustomReport['filters'];
      metrics: string[];
    },
  ): Promise<CustomReport> {
    this.logger.log(`Generating custom report: ${config.name}`);

    let data: any = {};

    // Generate data based on type
    switch (config.type) {
      case 'KPI':
        data = await this.getKPIMetrics(
          tenantId,
          config.filters.dateRange.start,
          config.filters.dateRange.end,
        );
        break;

      case 'REVENUE':
        data = await this.generateRevenueForecast(tenantId);
        break;

      case 'PIPELINE':
        data = await this.analyzePipelineHealth(tenantId);
        break;

      case 'TEAM':
        data = await this.getTeamPerformance(
          tenantId,
          config.filters.dateRange.start,
          config.filters.dateRange.end,
        );
        break;

      case 'CUSTOM':
        // Build custom data based on selected metrics
        data = await this.buildCustomMetrics(tenantId, config);
        break;
    }

    const report: CustomReport = {
      id: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: config.name,
      type: config.type,
      filters: config.filters,
      metrics: config.metrics,
      data,
      generatedAt: new Date(),
      generatedBy: userId,
    };

    return report;
  }

  /**
   * Build custom metrics
   */
  private async buildCustomMetrics(tenantId: string, config: any): Promise<any> {
    const metrics: any = {};

    for (const metric of config.metrics) {
      switch (metric) {
        case 'total_revenue':
          metrics.total_revenue = await this.calculateRevenue(
            tenantId,
            config.filters.dateRange.start,
            config.filters.dateRange.end,
          );
          break;

        case 'lead_count':
          metrics.lead_count = await this.db.lead.count({
            where: {
              tenantId,
              createdAt: {
                gte: config.filters.dateRange.start,
                lte: config.filters.dateRange.end,
              },
            },
          });
          break;

        case 'job_count':
          metrics.job_count = await this.db.job.count({
            where: {
              tenantId,
              createdAt: {
                gte: config.filters.dateRange.start,
                lte: config.filters.dateRange.end,
              },
            },
          });
          break;

        // Add more custom metrics as needed
      }
    }

    return metrics;
  }

  /**
   * Get executive summary
   */
  async getExecutiveSummary(tenantId: string): Promise<any> {
    this.logger.log('Generating executive summary');

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const [monthKPIs, quarterKPIs, yearKPIs, forecast, pipelineHealth] = await Promise.all([
      this.getKPIMetrics(tenantId, monthStart, now),
      this.getKPIMetrics(tenantId, quarterStart, now),
      this.getKPIMetrics(tenantId, yearStart, now),
      this.generateRevenueForecast(tenantId, 3),
      this.analyzePipelineHealth(tenantId),
    ]);

    return {
      period: {
        month: monthKPIs,
        quarter: quarterKPIs,
        year: yearKPIs,
      },
      forecast: {
        nextMonth: forecast.summary.nextMonth,
        nextQuarter: forecast.summary.nextQuarter,
        growthRate: forecast.summary.growthRate,
      },
      health: {
        pipeline: pipelineHealth.overall.score,
        status: pipelineHealth.overall.status,
        alerts: pipelineHealth.overall.issues.length,
      },
      generatedAt: new Date(),
    };
  }
}
