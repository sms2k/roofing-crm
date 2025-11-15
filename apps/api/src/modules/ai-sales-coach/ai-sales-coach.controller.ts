import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AiSalesCoachService } from './ai-sales-coach.service';

class AnalyzeRepPerformanceDto {
  startDate: string;
  endDate: string;
}

class ScoreLeadDto {
  // No additional fields needed, leadId is in params
}

class GetScriptDto {
  // No additional fields needed, leadId is in params
}

class AnalyzeCallDto {
  transcript: string;
  duration: number;
}

class GetCallGuidanceDto {
  transcript: string;
  stage?: string;
}

class GetTopPerformersDto {
  startDate: string;
  endDate: string;
  limit?: number;
}

class GetTeamPerformanceDto {
  startDate: string;
  endDate: string;
}

class BatchScoreLeadsDto {
  leadIds: string[];
}

@Controller('ai-sales-coach')
export class AiSalesCoachController {
  constructor(private readonly aiSalesCoach: AiSalesCoachService) {}

  /**
   * Analyze sales rep performance
   * GET /ai-sales-coach/reps/:repId/performance
   */
  @Get('reps/:repId/performance')
  async analyzeRepPerformance(
    @Param('repId') repId: string,
    @Query() query: AnalyzeRepPerformanceDto,
    @Request() req: any,
  ) {
    const tenantId = req.user.tenantId;
    const startDate = new Date(query.startDate);
    const endDate = new Date(query.endDate);

    return this.aiSalesCoach.analyzeRepPerformance(tenantId, repId, startDate, endDate);
  }

  /**
   * Get my performance (current user)
   * GET /ai-sales-coach/my-performance
   */
  @Get('my-performance')
  async getMyPerformance(@Query() query: AnalyzeRepPerformanceDto, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;
    const startDate = new Date(query.startDate);
    const endDate = new Date(query.endDate);

    return this.aiSalesCoach.analyzeRepPerformance(tenantId, userId, startDate, endDate);
  }

  /**
   * Score a specific lead
   * GET /ai-sales-coach/leads/:leadId/score
   */
  @Get('leads/:leadId/score')
  async scoreLead(@Param('leadId') leadId: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    return this.aiSalesCoach.scoreLead(tenantId, leadId);
  }

  /**
   * Batch score multiple leads
   * POST /ai-sales-coach/leads/batch-score
   */
  @Post('leads/batch-score')
  async batchScoreLeads(@Body() body: BatchScoreLeadsDto, @Request() req: any) {
    const tenantId = req.user.tenantId;

    const results = await Promise.all(
      body.leadIds.map((leadId) => this.aiSalesCoach.scoreLead(tenantId, leadId)),
    );

    return {
      total: results.length,
      leads: results,
      summary: {
        hot: results.filter((r) => r.score >= 70).length,
        warm: results.filter((r) => r.score >= 40 && r.score < 70).length,
        cold: results.filter((r) => r.score < 40).length,
        averageScore: results.reduce((sum, r) => sum + r.score, 0) / results.length,
        totalPredictedValue: results.reduce((sum, r) => sum + r.predictedValue, 0),
      },
    };
  }

  /**
   * Get script recommendation for a lead
   * GET /ai-sales-coach/leads/:leadId/script
   */
  @Get('leads/:leadId/script')
  async getScriptRecommendation(@Param('leadId') leadId: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    return this.aiSalesCoach.getScriptRecommendation(tenantId, leadId);
  }

  /**
   * Analyze call transcript
   * POST /ai-sales-coach/leads/:leadId/analyze-call
   */
  @Post('leads/:leadId/analyze-call')
  async analyzeCall(
    @Param('leadId') leadId: string,
    @Body() body: AnalyzeCallDto,
    @Request() req: any,
  ) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;

    return this.aiSalesCoach.analyzeCallTranscript(tenantId, userId, {
      leadId,
      transcript: body.transcript,
      duration: body.duration,
    });
  }

  /**
   * Get real-time call guidance
   * POST /ai-sales-coach/leads/:leadId/call-guidance
   */
  @Post('leads/:leadId/call-guidance')
  async getCallGuidance(
    @Param('leadId') leadId: string,
    @Body() body: GetCallGuidanceDto,
    @Request() req: any,
  ) {
    const tenantId = req.user.tenantId;

    return this.aiSalesCoach.getCallGuidance(tenantId, {
      leadId,
      transcript: body.transcript,
      stage: body.stage,
    });
  }

  /**
   * Get top performing reps
   * GET /ai-sales-coach/top-performers
   */
  @Get('top-performers')
  async getTopPerformers(@Query() query: GetTopPerformersDto, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const startDate = new Date(query.startDate);
    const endDate = new Date(query.endDate);
    const limit = query.limit || 10;

    return this.aiSalesCoach.getTopPerformers(tenantId, startDate, endDate, limit);
  }

  /**
   * Get team performance summary
   * GET /ai-sales-coach/team-performance
   */
  @Get('team-performance')
  async getTeamPerformance(@Query() query: GetTeamPerformanceDto, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const startDate = new Date(query.startDate);
    const endDate = new Date(query.endDate);

    return this.aiSalesCoach.getTeamPerformance(tenantId, startDate, endDate);
  }

  /**
   * Get prioritized lead list (sorted by score)
   * GET /ai-sales-coach/prioritized-leads
   */
  @Get('prioritized-leads')
  async getPrioritizedLeads(@Query('assignedToId') assignedToId: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const repId = assignedToId || req.user.userId;

    // Get all active leads for this rep
    const db = (this.aiSalesCoach as any).db;
    const leads = await db.lead.findMany({
      where: {
        tenantId,
        assignedToId: repId,
        status: {
          in: ['NEW', 'CONTACTED', 'QUALIFIED'],
        },
      },
      include: {
        contact: true,
        property: true,
      },
      take: 50, // Limit to prevent overload
    });

    // Score all leads
    const scoredLeads = await Promise.all(
      leads.map(async (lead: any) => {
        const score = await this.aiSalesCoach.scoreLead(tenantId, lead.id);
        return {
          ...lead,
          aiScore: score,
        };
      }),
    );

    // Sort by score descending
    scoredLeads.sort((a, b) => b.aiScore.score - a.aiScore.score);

    return {
      total: scoredLeads.length,
      leads: scoredLeads,
      summary: {
        hot: scoredLeads.filter((l) => l.aiScore.score >= 70).length,
        warm: scoredLeads.filter((l) => l.aiScore.score >= 40 && l.aiScore.score < 70).length,
        cold: scoredLeads.filter((l) => l.aiScore.score < 40).length,
        totalPredictedRevenue: scoredLeads.reduce(
          (sum, l) => sum + l.aiScore.predictedValue,
          0,
        ),
      },
    };
  }

  /**
   * Get coaching insights for a specific rep
   * GET /ai-sales-coach/reps/:repId/insights
   */
  @Get('reps/:repId/insights')
  async getCoachingInsights(
    @Param('repId') repId: string,
    @Query() query: AnalyzeRepPerformanceDto,
    @Request() req: any,
  ) {
    const tenantId = req.user.tenantId;
    const startDate = new Date(query.startDate);
    const endDate = new Date(query.endDate);

    const performance = await this.aiSalesCoach.analyzeRepPerformance(
      tenantId,
      repId,
      startDate,
      endDate,
    );

    // Get their current leads and score them
    const db = (this.aiSalesCoach as any).db;
    const leads = await db.lead.findMany({
      where: {
        tenantId,
        assignedToId: repId,
        status: { in: ['NEW', 'CONTACTED', 'QUALIFIED'] },
      },
      take: 10,
    });

    const leadScores = await Promise.all(
      leads.map((lead: any) => this.aiSalesCoach.scoreLead(tenantId, lead.id)),
    );

    return {
      performance,
      currentPipeline: {
        totalLeads: leads.length,
        hotLeads: leadScores.filter((s) => s.score >= 70).length,
        totalPipelineValue: leadScores.reduce((sum, s) => sum + s.predictedValue, 0),
        averageLeadScore: leadScores.reduce((sum, s) => sum + s.score, 0) / leadScores.length,
      },
      actionItems: [
        ...performance.recommendations,
        `Focus on ${leadScores.filter((s) => s.score >= 70).length} hot leads first`,
      ],
    };
  }

  /**
   * Compare two reps
   * GET /ai-sales-coach/compare
   */
  @Get('compare')
  async compareReps(
    @Query('rep1Id') rep1Id: string,
    @Query('rep2Id') rep2Id: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Request() req: any,
  ) {
    const tenantId = req.user.tenantId;
    const start = new Date(startDate);
    const end = new Date(endDate);

    const [rep1, rep2] = await Promise.all([
      this.aiSalesCoach.analyzeRepPerformance(tenantId, rep1Id, start, end),
      this.aiSalesCoach.analyzeRepPerformance(tenantId, rep2Id, start, end),
    ]);

    return {
      rep1,
      rep2,
      comparison: {
        scoreWinner: rep1.score > rep2.score ? rep1.repName : rep2.repName,
        revenueWinner:
          rep1.metrics.revenue > rep2.metrics.revenue ? rep1.repName : rep2.repName,
        closeRateWinner:
          rep1.metrics.closeRate > rep2.metrics.closeRate ? rep1.repName : rep2.repName,
        differences: {
          score: Math.abs(rep1.score - rep2.score),
          revenue: Math.abs(rep1.metrics.revenue - rep2.metrics.revenue),
          closeRate: Math.abs(rep1.metrics.closeRate - rep2.metrics.closeRate),
        },
      },
    };
  }

  /**
   * Get daily coaching tips
   * GET /ai-sales-coach/daily-tips
   */
  @Get('daily-tips')
  async getDailyTips(@Request() req: any) {
    const tips = [
      {
        category: 'Opening',
        tip: 'Lead with value, not features. Instead of "We install roofs," try "We protect your biggest investment with industry-leading warranties."',
      },
      {
        category: 'Discovery',
        tip: 'Ask "What prompted you to look into your roof today?" This uncovers the real pain point and urgency.',
      },
      {
        category: 'Objection Handling',
        tip: 'When they say "I need to think about it," respond with "Of course! What specific concerns would you like to think over?" This reveals the real objection.',
      },
      {
        category: 'Closing',
        tip: 'Create urgency with insurance deadlines: "Your claim adjuster mentioned we have 30 days to file - let\'s get you on the schedule this week."',
      },
      {
        category: 'Follow-up',
        tip: 'Send a personalized video message after your visit. 90% of homeowners say this makes them feel valued and increases trust.',
      },
    ];

    // Return a random tip for the day
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 1000 / 60 / 60 / 24,
    );
    const tipIndex = dayOfYear % tips.length;

    return {
      tip: tips[tipIndex],
      allTips: tips,
    };
  }

  /**
   * Get win/loss analysis
   * GET /ai-sales-coach/win-loss-analysis
   */
  @Get('win-loss-analysis')
  async getWinLossAnalysis(
    @Query('repId') repId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Request() req: any,
  ) {
    const tenantId = req.user.tenantId;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const userId = repId || req.user.userId;

    const db = (this.aiSalesCoach as any).db;

    // Get won and lost deals
    const [wonLeads, lostLeads] = await Promise.all([
      db.lead.findMany({
        where: {
          tenantId,
          assignedToId: userId,
          createdAt: { gte: start, lte: end },
          job: { isNot: null },
        },
        include: { contact: true, property: true, job: true, notes: true },
      }),
      db.lead.findMany({
        where: {
          tenantId,
          assignedToId: userId,
          createdAt: { gte: start, lte: end },
          status: 'LOST',
        },
        include: { contact: true, property: true, notes: true },
      }),
    ]);

    // Analyze patterns
    const wonPatterns = {
      averageResponseTime:
        wonLeads
          .filter((l: any) => l.contactedAt)
          .reduce((sum: number, l: any) => {
            return (
              sum + (l.contactedAt.getTime() - l.createdAt.getTime()) / (1000 * 60 * 60)
            );
          }, 0) / wonLeads.length,
      averageNotes: wonLeads.reduce((sum: number, l: any) => sum + l.notes.length, 0) / wonLeads.length,
      averageDealSize:
        wonLeads.reduce((sum: number, l: any) => sum + (l.job?.totalPrice || 0), 0) /
        wonLeads.length,
      sources: this.groupBySource(wonLeads),
    };

    const lostPatterns = {
      averageResponseTime:
        lostLeads
          .filter((l: any) => l.contactedAt)
          .reduce((sum: number, l: any) => {
            return (
              sum + (l.contactedAt.getTime() - l.createdAt.getTime()) / (1000 * 60 * 60)
            );
          }, 0) / (lostLeads.filter((l: any) => l.contactedAt).length || 1),
      averageNotes: lostLeads.reduce((sum: number, l: any) => sum + l.notes.length, 0) / (lostLeads.length || 1),
      sources: this.groupBySource(lostLeads),
    };

    return {
      summary: {
        won: wonLeads.length,
        lost: lostLeads.length,
        winRate: (wonLeads.length / (wonLeads.length + lostLeads.length)) * 100,
      },
      wonPatterns,
      lostPatterns,
      insights: [
        `Won deals had ${((wonPatterns.averageResponseTime / lostPatterns.averageResponseTime) * 100).toFixed(0)}% faster response time`,
        `Won deals had ${wonPatterns.averageNotes.toFixed(1)} notes vs ${lostPatterns.averageNotes.toFixed(1)} for lost deals`,
        `Best performing source: ${Object.entries(wonPatterns.sources).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || 'N/A'}`,
      ],
    };
  }

  private groupBySource(leads: any[]): Record<string, number> {
    return leads.reduce((acc, lead) => {
      const source = lead.source || 'UNKNOWN';
      acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }
}
