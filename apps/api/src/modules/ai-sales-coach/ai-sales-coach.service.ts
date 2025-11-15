import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { OllamaService } from '../ollama/ollama.service';

interface RepPerformanceMetrics {
  repId: string;
  repName: string;
  period: { start: Date; end: Date };
  metrics: {
    totalLeads: number;
    contactedLeads: number;
    quotesGenerated: number;
    jobsWon: number;
    jobsLost: number;
    revenue: number;
    contactRate: number; // percentage
    quoteRate: number; // percentage
    closeRate: number; // percentage
    averageDealSize: number;
    averageResponseTime: number; // hours
    followUpRate: number; // percentage
  };
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  score: number; // 0-100
}

interface LeadScoreResult {
  leadId: string;
  score: number; // 0-100
  closeProbability: number; // 0-1
  factors: {
    name: string;
    impact: number; // -10 to +10
    reason: string;
  }[];
  recommendedActions: string[];
  predictedValue: number;
  timeToClose: number; // days
}

interface ScriptRecommendation {
  leadId: string;
  leadType: string;
  situation: string;
  openingScript: string;
  keyTalkingPoints: string[];
  objectionHandlers: {
    objection: string;
    response: string;
  }[];
  closingScript: string;
  followUpStrategy: string;
}

interface CallGuidance {
  callId: string;
  leadId: string;
  stage: 'opening' | 'discovery' | 'presentation' | 'objection' | 'closing';
  currentScript: string;
  nextSteps: string[];
  warnings: string[];
  opportunities: string[];
  detectedObjection?: string;
  suggestedResponse?: string;
  sentiment: 'positive' | 'neutral' | 'negative';
}

interface AnalyzeCallTranscriptDto {
  leadId: string;
  transcript: string;
  duration: number; // seconds
}

interface GetCallGuidanceDto {
  leadId: string;
  transcript: string;
  stage?: string;
}

@Injectable()
export class AiSalesCoachService {
  private readonly logger = new Logger(AiSalesCoachService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly ollama: OllamaService,
  ) {}

  /**
   * Analyze sales rep performance over a period
   */
  async analyzeRepPerformance(
    tenantId: string,
    repId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<RepPerformanceMetrics> {
    this.logger.log(`Analyzing performance for rep ${repId} from ${startDate} to ${endDate}`);

    // Get rep info
    const rep = await this.db.user.findFirst({
      where: { id: repId, tenantId },
      include: { contact: true },
    });

    if (!rep) {
      throw new NotFoundException('Sales rep not found');
    }

    // Get all leads assigned to this rep in the period
    const leads = await this.db.lead.findMany({
      where: {
        tenantId,
        assignedToId: repId,
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        job: true,
        notes: true,
        tasks: true,
      },
    });

    // Calculate basic metrics
    const totalLeads = leads.length;
    const contactedLeads = leads.filter((l) => l.contactedAt !== null).length;
    const quotesGenerated = leads.filter((l) => l.status === 'QUOTED' || l.job).length;
    const jobsWon = leads.filter((l) => l.job && l.job.status !== 'CANCELLED').length;
    const jobsLost = leads.filter((l) => l.status === 'LOST').length;

    // Calculate revenue
    const revenue = leads.reduce((sum, lead) => {
      if (lead.job && lead.job.totalPrice) {
        return sum + parseFloat(lead.job.totalPrice.toString());
      }
      return sum;
    }, 0);

    // Calculate rates
    const contactRate = totalLeads > 0 ? (contactedLeads / totalLeads) * 100 : 0;
    const quoteRate = contactedLeads > 0 ? (quotesGenerated / contactedLeads) * 100 : 0;
    const closeRate = quotesGenerated > 0 ? (jobsWon / quotesGenerated) * 100 : 0;

    // Calculate average deal size
    const averageDealSize = jobsWon > 0 ? revenue / jobsWon : 0;

    // Calculate average response time
    const responseTimes = leads
      .filter((l) => l.contactedAt && l.createdAt)
      .map((l) => {
        const diff = l.contactedAt!.getTime() - l.createdAt.getTime();
        return diff / (1000 * 60 * 60); // hours
      });
    const averageResponseTime =
      responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;

    // Calculate follow-up rate
    const leadsNeedingFollowUp = leads.filter((l) => l.status === 'CONTACTED').length;
    const leadsWithFollowUp = leads.filter((l) => l.notes.length > 1).length;
    const followUpRate =
      leadsNeedingFollowUp > 0 ? (leadsWithFollowUp / leadsNeedingFollowUp) * 100 : 0;

    const metrics = {
      totalLeads,
      contactedLeads,
      quotesGenerated,
      jobsWon,
      jobsLost,
      revenue,
      contactRate,
      quoteRate,
      closeRate,
      averageDealSize,
      averageResponseTime,
      followUpRate,
    };

    // Use AI to analyze and provide recommendations
    const aiAnalysis = await this.getAIPerformanceAnalysis(rep.contact.firstName, metrics);

    // Calculate overall score (0-100)
    const score = this.calculatePerformanceScore(metrics);

    return {
      repId,
      repName: `${rep.contact.firstName} ${rep.contact.lastName}`,
      period: { start: startDate, end: endDate },
      metrics,
      strengths: aiAnalysis.strengths,
      weaknesses: aiAnalysis.weaknesses,
      recommendations: aiAnalysis.recommendations,
      score,
    };
  }

  /**
   * Get AI-powered performance analysis
   */
  private async getAIPerformanceAnalysis(
    repName: string,
    metrics: any,
  ): Promise<{ strengths: string[]; weaknesses: string[]; recommendations: string[] }> {
    const prompt = `You are an expert sales coach analyzing the performance of a roofing sales representative named ${repName}.

Here are their metrics:
- Total Leads: ${metrics.totalLeads}
- Contact Rate: ${metrics.contactRate.toFixed(1)}%
- Quote Rate: ${metrics.quoteRate.toFixed(1)}%
- Close Rate: ${metrics.closeRate.toFixed(1)}%
- Average Deal Size: $${metrics.averageDealSize.toFixed(0)}
- Average Response Time: ${metrics.averageResponseTime.toFixed(1)} hours
- Follow-up Rate: ${metrics.followUpRate.toFixed(1)}%
- Total Revenue: $${metrics.revenue.toFixed(0)}

Analyze this performance and provide:
1. Top 3 strengths (what they're doing well)
2. Top 3 weaknesses (areas for improvement)
3. Top 5 specific, actionable recommendations

Format your response as JSON:
{
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "weaknesses": ["weakness 1", "weakness 2", "weakness 3"],
  "recommendations": ["rec 1", "rec 2", "rec 3", "rec 4", "rec 5"]
}`;

    try {
      const response = await this.ollama.generate({
        model: 'gemma2:27b',
        prompt,
        options: {
          temperature: 0.7,
        },
      });

      const analysis = JSON.parse(response);
      return analysis;
    } catch (error) {
      this.logger.error(`Failed to get AI analysis: ${error.message}`);
      // Fallback to rule-based analysis
      return this.getRuleBasedAnalysis(metrics);
    }
  }

  /**
   * Rule-based fallback for performance analysis
   */
  private getRuleBasedAnalysis(metrics: any): {
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
  } {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const recommendations: string[] = [];

    // Analyze contact rate
    if (metrics.contactRate >= 80) {
      strengths.push('Excellent lead contact rate - consistently reaching out to new leads');
    } else if (metrics.contactRate < 50) {
      weaknesses.push('Low contact rate - many leads not being reached');
      recommendations.push('Set a goal to contact all new leads within 24 hours');
    }

    // Analyze response time
    if (metrics.averageResponseTime <= 2) {
      strengths.push('Outstanding response time - quick to follow up with leads');
    } else if (metrics.averageResponseTime > 24) {
      weaknesses.push('Slow response time - waiting too long to contact leads');
      recommendations.push('Aim to respond to new leads within 2 hours for better conversion');
    }

    // Analyze close rate
    if (metrics.closeRate >= 30) {
      strengths.push('Strong close rate - effectively converting quotes to jobs');
    } else if (metrics.closeRate < 15) {
      weaknesses.push('Low close rate - struggling to convert quotes to signed jobs');
      recommendations.push('Review objection handling techniques and follow-up strategy');
      recommendations.push('Consider role-playing common objections with manager');
    }

    // Analyze follow-up rate
    if (metrics.followUpRate < 60) {
      weaknesses.push('Inconsistent follow-up - not staying engaged with prospects');
      recommendations.push('Create a follow-up checklist for all leads in "contacted" status');
    }

    // Analyze average deal size
    if (metrics.averageDealSize < 5000 && metrics.jobsWon > 0) {
      recommendations.push('Focus on upselling additional services to increase deal size');
    }

    // Ensure we have at least 3 of each
    while (strengths.length < 3) {
      strengths.push('Showing dedication to the sales process');
    }

    while (recommendations.length < 5) {
      recommendations.push('Continue building relationships with homeowners');
    }

    return { strengths, weaknesses, recommendations };
  }

  /**
   * Calculate overall performance score (0-100)
   */
  private calculatePerformanceScore(metrics: any): number {
    let score = 0;

    // Contact rate (20 points)
    score += (metrics.contactRate / 100) * 20;

    // Quote rate (20 points)
    score += (metrics.quoteRate / 100) * 20;

    // Close rate (30 points)
    score += (metrics.closeRate / 100) * 30;

    // Response time (15 points) - faster is better
    const responseScore = Math.max(0, 15 - metrics.averageResponseTime * 0.5);
    score += Math.min(15, responseScore);

    // Follow-up rate (15 points)
    score += (metrics.followUpRate / 100) * 15;

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  /**
   * Score a lead and predict close probability
   */
  async scoreLead(tenantId: string, leadId: string): Promise<LeadScoreResult> {
    this.logger.log(`Scoring lead ${leadId}`);

    const lead = await this.db.lead.findFirst({
      where: { id: leadId, tenantId },
      include: {
        contact: true,
        property: true,
        notes: true,
        tasks: true,
        job: true,
      },
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    const factors: { name: string; impact: number; reason: string }[] = [];
    let totalScore = 50; // Start at neutral

    // Factor 1: Lead source quality
    if (lead.source === 'REFERRAL') {
      factors.push({
        name: 'Lead Source',
        impact: 10,
        reason: 'Referrals have highest close rate',
      });
      totalScore += 10;
    } else if (lead.source === 'WEBSITE' || lead.source === 'SOCIAL_MEDIA') {
      factors.push({
        name: 'Lead Source',
        impact: 5,
        reason: 'Inbound leads show active interest',
      });
      totalScore += 5;
    }

    // Factor 2: Response time
    if (lead.contactedAt) {
      const responseTime =
        (lead.contactedAt.getTime() - lead.createdAt.getTime()) / (1000 * 60 * 60);
      if (responseTime <= 1) {
        factors.push({
          name: 'Response Speed',
          impact: 8,
          reason: 'Contacted within 1 hour',
        });
        totalScore += 8;
      } else if (responseTime <= 24) {
        factors.push({
          name: 'Response Speed',
          impact: 4,
          reason: 'Contacted within 24 hours',
        });
        totalScore += 4;
      } else {
        factors.push({
          name: 'Response Speed',
          impact: -5,
          reason: 'Slow response may reduce interest',
        });
        totalScore -= 5;
      }
    } else {
      factors.push({
        name: 'Response Speed',
        impact: -8,
        reason: 'Lead not yet contacted',
      });
      totalScore -= 8;
    }

    // Factor 3: Engagement level (notes, tasks)
    const engagementScore = lead.notes.length * 2 + lead.tasks.length * 3;
    if (engagementScore >= 10) {
      factors.push({
        name: 'Engagement',
        impact: 7,
        reason: 'High activity shows strong interest',
      });
      totalScore += 7;
    } else if (engagementScore < 3) {
      factors.push({
        name: 'Engagement',
        impact: -3,
        reason: 'Low engagement level',
      });
      totalScore -= 3;
    }

    // Factor 4: Property value estimate
    if (lead.estimatedValue) {
      const value = parseFloat(lead.estimatedValue.toString());
      if (value >= 10000) {
        factors.push({
          name: 'Deal Size',
          impact: 6,
          reason: 'High-value project',
        });
        totalScore += 6;
      } else if (value < 5000) {
        factors.push({
          name: 'Deal Size',
          impact: -2,
          reason: 'Small project may have lower priority',
        });
        totalScore -= 2;
      }
    }

    // Factor 5: Time in pipeline
    const daysInPipeline =
      (Date.now() - lead.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysInPipeline > 30) {
      factors.push({
        name: 'Pipeline Age',
        impact: -6,
        reason: 'Lead getting stale, interest may be declining',
      });
      totalScore -= 6;
    } else if (daysInPipeline < 7) {
      factors.push({
        name: 'Pipeline Age',
        impact: 5,
        reason: 'Fresh lead with high urgency',
      });
      totalScore += 5;
    }

    // Factor 6: Current status
    if (lead.status === 'QUALIFIED') {
      factors.push({
        name: 'Lead Status',
        impact: 8,
        reason: 'Lead has been qualified',
      });
      totalScore += 8;
    } else if (lead.status === 'NEW') {
      factors.push({
        name: 'Lead Status',
        impact: -4,
        reason: 'Not yet qualified',
      });
      totalScore -= 4;
    }

    // Factor 7: Has insurance claim
    if (lead.claimNumber) {
      factors.push({
        name: 'Insurance Claim',
        impact: 9,
        reason: 'Insurance-backed projects have higher close rate',
      });
      totalScore += 9;
    }

    // Normalize score to 0-100
    const finalScore = Math.max(0, Math.min(100, totalScore));
    const closeProbability = finalScore / 100;

    // Generate recommended actions
    const recommendedActions = this.generateRecommendedActions(lead, factors, finalScore);

    // Predict value and time to close
    const predictedValue = lead.estimatedValue
      ? parseFloat(lead.estimatedValue.toString())
      : 8000;
    const timeToClose = this.predictTimeToClose(finalScore, daysInPipeline);

    return {
      leadId,
      score: finalScore,
      closeProbability,
      factors,
      recommendedActions,
      predictedValue,
      timeToClose,
    };
  }

  /**
   * Generate recommended actions based on lead score
   */
  private generateRecommendedActions(lead: any, factors: any[], score: number): string[] {
    const actions: string[] = [];

    // Check if not contacted
    if (!lead.contactedAt) {
      actions.push('URGENT: Contact this lead immediately to maximize close probability');
    }

    // Check response time factor
    const responseTimeFactor = factors.find((f) => f.name === 'Response Speed');
    if (responseTimeFactor && responseTimeFactor.impact < 0) {
      actions.push('Schedule a follow-up call or visit within the next 24 hours');
    }

    // Check engagement
    const engagementFactor = factors.find((f) => f.name === 'Engagement');
    if (engagementFactor && engagementFactor.impact < 0) {
      actions.push('Increase engagement - send educational content about roofing options');
    }

    // Check if has insurance claim
    if (lead.claimNumber) {
      actions.push('Coordinate with insurance adjuster for inspection timeline');
    }

    // High score actions
    if (score >= 70) {
      actions.push('HOT LEAD: Prioritize this lead and aim to close this week');
      actions.push('Prepare detailed quote and financing options');
    }

    // Medium score actions
    if (score >= 40 && score < 70) {
      actions.push('Nurture relationship with value-added content and check-ins');
      actions.push('Address any concerns or questions proactively');
    }

    // Low score actions
    if (score < 40) {
      actions.push('Re-qualify this lead to determine if still interested');
      actions.push('Consider moving to long-term nurture campaign');
    }

    return actions;
  }

  /**
   * Predict days to close based on score
   */
  private predictTimeToClose(score: number, currentDaysInPipeline: number): number {
    // Base prediction on industry averages and score
    let baseDays = 21; // Average roofing sales cycle

    if (score >= 80) {
      baseDays = 7; // Hot leads close fast
    } else if (score >= 60) {
      baseDays = 14;
    } else if (score >= 40) {
      baseDays = 21;
    } else {
      baseDays = 45; // Cold leads take longer
    }

    // Adjust for time already spent
    return Math.max(3, baseDays - Math.floor(currentDaysInPipeline));
  }

  /**
   * Get recommended script for a lead
   */
  async getScriptRecommendation(
    tenantId: string,
    leadId: string,
  ): Promise<ScriptRecommendation> {
    this.logger.log(`Getting script recommendation for lead ${leadId}`);

    const lead = await this.db.lead.findFirst({
      where: { id: leadId, tenantId },
      include: {
        contact: true,
        property: true,
      },
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    // Determine lead type and situation
    const leadType = this.determineLeadType(lead);
    const situation = this.determineSituation(lead);

    // Use AI to generate personalized script
    const script = await this.generateAIScript(lead, leadType, situation);

    return {
      leadId,
      leadType,
      situation,
      ...script,
    };
  }

  /**
   * Determine lead type
   */
  private determineLeadType(lead: any): string {
    if (lead.claimNumber) return 'Insurance Claim';
    if (lead.source === 'REFERRAL') return 'Referral';
    if (lead.source === 'STORM_CHASER') return 'Storm Damage';
    if (lead.urgency === 'HIGH') return 'Emergency Repair';
    return 'General Inquiry';
  }

  /**
   * Determine situation context
   */
  private determineSituation(lead: any): string {
    const situations: string[] = [];

    if (lead.status === 'NEW') situations.push('First Contact');
    if (lead.status === 'CONTACTED') situations.push('Follow-up');
    if (lead.status === 'QUALIFIED') situations.push('Quote Presentation');

    if (lead.claimNumber) situations.push('Insurance Involved');
    if (lead.urgency === 'HIGH') situations.push('Urgent Need');

    return situations.join(', ') || 'Initial Conversation';
  }

  /**
   * Generate AI-powered sales script
   */
  private async generateAIScript(
    lead: any,
    leadType: string,
    situation: string,
  ): Promise<Omit<ScriptRecommendation, 'leadId' | 'leadType' | 'situation'>> {
    const customerName = lead.contact.firstName;
    const propertyAddress = lead.property?.address || 'their property';

    const prompt = `You are an expert roofing sales coach. Generate a personalized sales script for this situation:

Lead Type: ${leadType}
Situation: ${situation}
Customer Name: ${customerName}
Property: ${propertyAddress}

Provide a complete sales conversation script including:
1. Opening (warm, professional introduction)
2. 3-5 key talking points specific to this lead type
3. 4 common objections with effective responses
4. Closing statement that creates urgency
5. Follow-up strategy

Format as JSON:
{
  "openingScript": "...",
  "keyTalkingPoints": ["point 1", "point 2", ...],
  "objectionHandlers": [
    {"objection": "...", "response": "..."}
  ],
  "closingScript": "...",
  "followUpStrategy": "..."
}`;

    try {
      const response = await this.ollama.generate({
        model: 'gemma2:27b',
        prompt,
        options: {
          temperature: 0.8,
        },
      });

      return JSON.parse(response);
    } catch (error) {
      this.logger.error(`Failed to generate AI script: ${error.message}`);
      // Fallback to template-based script
      return this.getTemplateScript(leadType, customerName);
    }
  }

  /**
   * Get template-based script fallback
   */
  private getTemplateScript(
    leadType: string,
    customerName: string,
  ): Omit<ScriptRecommendation, 'leadId' | 'leadType' | 'situation'> {
    return {
      openingScript: `Hi ${customerName}, this is [Your Name] from [Company Name]. I understand you're interested in getting your roof evaluated. I've helped many homeowners in your area, and I'd love to show you how we can protect your biggest investment. Is now a good time to chat for a few minutes?`,
      keyTalkingPoints: [
        'We specialize in working with insurance companies to maximize your claim',
        'Our crews are certified and we offer a lifetime workmanship warranty',
        'We use premium materials from GAF/Owens Corning with extended warranties',
        'We can typically complete installation within 1-2 days',
        'Financing options available with approved credit',
      ],
      objectionHandlers: [
        {
          objection: "I need to get multiple quotes",
          response:
            "I completely understand - this is a big investment. What I can do is provide you with a detailed breakdown so you can do an apples-to-apples comparison. Many homeowners find our warranty and service set us apart. Can I schedule a time to provide that detailed quote?",
        },
        {
          objection: "The price is too high",
          response:
            "I appreciate your concern about the investment. Let me break down exactly what's included - materials, labor, warranty, and our guarantee. We also have financing options that can make this very affordable with payments as low as $XXX per month. Would you like to explore those options?",
        },
        {
          objection: "I need to think about it",
          response:
            "Of course, this is an important decision. Can I ask what specific concerns you'd like to think over? That way I can provide any additional information that might help. Also, I should mention we have [limited time offer] that expires soon.",
        },
        {
          objection: "I want to wait until after storm season",
          response:
            "I understand the temptation to wait, but there are two risks: First, existing damage can worsen and potentially void insurance coverage. Second, after a major storm, contractors get booked out for months. Let's at least get the inspection done now so you know exactly where you stand.",
        },
      ],
      closingScript: `${customerName}, based on everything we've discussed, I really think we're the right fit for your project. I can get you on the schedule for [timeframe] and we'll take care of everything from permits to final inspection. What questions can I answer to help you move forward today?`,
      followUpStrategy:
        'Send detailed quote within 24 hours. Follow up call in 2 days if no response. Send testimonial video on day 4. Final call on day 7 with limited-time incentive.',
    };
  }

  /**
   * Analyze call transcript and provide insights
   */
  async analyzeCallTranscript(
    tenantId: string,
    userId: string,
    data: AnalyzeCallTranscriptDto,
  ): Promise<any> {
    this.logger.log(`Analyzing call transcript for lead ${data.leadId}`);

    const lead = await this.db.lead.findFirst({
      where: { id: data.leadId, tenantId },
      include: { contact: true },
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    const prompt = `You are an expert sales coach analyzing a roofing sales call.

Call Duration: ${Math.floor(data.duration / 60)} minutes
Transcript:
${data.transcript}

Analyze this call and provide:
1. Overall sentiment (positive/neutral/negative)
2. What went well (3 points)
3. What could be improved (3 points)
4. Detected objections and whether they were handled well
5. Recommended next steps
6. Call quality score (0-100)

Format as JSON:
{
  "sentiment": "positive|neutral|negative",
  "strengths": ["...", "...", "..."],
  "improvements": ["...", "...", "..."],
  "objections": [{"objection": "...", "handledWell": true/false, "feedback": "..."}],
  "nextSteps": ["...", "..."],
  "score": 85
}`;

    try {
      const response = await this.ollama.generate({
        model: 'gemma2:27b',
        prompt,
        options: {
          temperature: 0.7,
        },
      });

      const analysis = JSON.parse(response);

      // Store the analysis as a note
      await this.db.note.create({
        data: {
          tenantId,
          leadId: data.leadId,
          content: `Call Analysis (${Math.floor(data.duration / 60)} min call):\n\nSentiment: ${analysis.sentiment}\nScore: ${analysis.score}/100\n\nStrengths:\n${analysis.strengths.map((s: string) => `- ${s}`).join('\n')}\n\nImprovements:\n${analysis.improvements.map((i: string) => `- ${i}`).join('\n')}`,
          createdById: userId,
        },
      });

      return analysis;
    } catch (error) {
      this.logger.error(`Failed to analyze call: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get real-time call guidance
   */
  async getCallGuidance(tenantId: string, data: GetCallGuidanceDto): Promise<CallGuidance> {
    this.logger.log(`Getting real-time call guidance for lead ${data.leadId}`);

    const lead = await this.db.lead.findFirst({
      where: { id: data.leadId, tenantId },
      include: { contact: true, property: true },
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    // Determine current stage if not provided
    let stage: any = data.stage || 'opening';

    // Detect stage from transcript
    if (data.transcript.toLowerCase().includes('how much') ||
        data.transcript.toLowerCase().includes('price') ||
        data.transcript.toLowerCase().includes('cost')) {
      stage = 'objection';
    }

    const prompt = `You are a real-time sales coach providing guidance during a roofing sales call.

Current Stage: ${stage}
Customer: ${lead.contact.firstName}
Recent Conversation:
${data.transcript.slice(-500)} // Last 500 chars

Provide real-time guidance:
1. Current script suggestion for this stage
2. 3 next steps to move the conversation forward
3. Any warnings or red flags
4. Any opportunities to highlight
5. Sentiment (positive/neutral/negative)
6. If objection detected, provide the objection and suggested response

Format as JSON:
{
  "currentScript": "...",
  "nextSteps": ["...", "...", "..."],
  "warnings": ["..."],
  "opportunities": ["..."],
  "sentiment": "positive|neutral|negative",
  "detectedObjection": "..." or null,
  "suggestedResponse": "..." or null
}`;

    try {
      const response = await this.ollama.generate({
        model: 'gemma2:27b',
        prompt,
        options: {
          temperature: 0.7,
        },
      });

      const guidance = JSON.parse(response);

      return {
        callId: `call_${Date.now()}`,
        leadId: data.leadId,
        stage,
        ...guidance,
      };
    } catch (error) {
      this.logger.error(`Failed to get call guidance: ${error.message}`);

      // Fallback guidance
      return {
        callId: `call_${Date.now()}`,
        leadId: data.leadId,
        stage,
        currentScript: this.getFallbackScript(stage),
        nextSteps: ['Build rapport', 'Ask discovery questions', 'Present solution'],
        warnings: [],
        opportunities: [],
        sentiment: 'neutral',
      };
    }
  }

  /**
   * Get fallback script for stage
   */
  private getFallbackScript(stage: string): string {
    const scripts = {
      opening: "Hi, I'm calling about your roofing inquiry. Is now a good time to discuss your project?",
      discovery: "Tell me more about what's prompting you to look into your roof. Have you noticed any issues?",
      presentation: "Based on what you've shared, here's what I recommend...",
      objection: "I understand your concern. Let me address that...",
      closing: "I'd love to get started on your project. When works best for the installation?",
    };

    return scripts[stage as keyof typeof scripts] || scripts.opening;
  }

  /**
   * Get top performing reps
   */
  async getTopPerformers(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    limit: number = 10,
  ): Promise<RepPerformanceMetrics[]> {
    this.logger.log('Getting top performing reps');

    // Get all sales reps
    const reps = await this.db.user.findMany({
      where: {
        tenantId,
        role: 'SALES_REP',
      },
    });

    // Analyze each rep
    const performances = await Promise.all(
      reps.map((rep) => this.analyzeRepPerformance(tenantId, rep.id, startDate, endDate)),
    );

    // Sort by score
    performances.sort((a, b) => b.score - a.score);

    return performances.slice(0, limit);
  }

  /**
   * Get team performance summary
   */
  async getTeamPerformance(tenantId: string, startDate: Date, endDate: Date): Promise<any> {
    this.logger.log('Getting team performance summary');

    const reps = await this.db.user.findMany({
      where: { tenantId, role: 'SALES_REP' },
    });

    const performances = await Promise.all(
      reps.map((rep) => this.analyzeRepPerformance(tenantId, rep.id, startDate, endDate)),
    );

    // Calculate team averages
    const teamMetrics = {
      totalReps: performances.length,
      averageScore: performances.reduce((sum, p) => sum + p.score, 0) / performances.length,
      totalRevenue: performances.reduce((sum, p) => sum + p.metrics.revenue, 0),
      totalLeads: performances.reduce((sum, p) => sum + p.metrics.totalLeads, 0),
      totalJobsWon: performances.reduce((sum, p) => sum + p.metrics.jobsWon, 0),
      averageCloseRate:
        performances.reduce((sum, p) => sum + p.metrics.closeRate, 0) / performances.length,
      averageContactRate:
        performances.reduce((sum, p) => sum + p.metrics.contactRate, 0) / performances.length,
      topPerformer: performances[0],
      needsImprovement: performances.filter((p) => p.score < 60),
    };

    return teamMetrics;
  }
}
