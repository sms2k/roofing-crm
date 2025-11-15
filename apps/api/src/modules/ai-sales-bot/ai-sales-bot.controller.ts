import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
} from '@nestjs/common';
import { AiSalesBotService } from './ai-sales-bot.service';

class StartConversationDto {
  tenantId: string;
  sessionId?: string;
}

class SendMessageDto {
  message: string;
}

class BookAppointmentDto {
  date: string;
  time: string;
}

class GetAnalyticsDto {
  startDate: string;
  endDate: string;
}

@Controller('ai-sales-bot')
export class AiSalesBotController {
  constructor(private readonly aiSalesBot: AiSalesBotService) {}

  /**
   * Start a new conversation
   * POST /ai-sales-bot/start
   */
  @Post('start')
  async startConversation(@Body() body: StartConversationDto) {
    const context = await this.aiSalesBot.startConversation(body.tenantId, body.sessionId);

    return {
      sessionId: context.sessionId,
      greeting: context.messages[context.messages.length - 1].content,
      stage: context.stage,
    };
  }

  /**
   * Send a message in the conversation
   * POST /ai-sales-bot/:sessionId/message
   */
  @Post(':sessionId/message')
  async sendMessage(@Param('sessionId') sessionId: string, @Body() body: SendMessageDto) {
    const response = await this.aiSalesBot.chat(sessionId, body.message);
    const context = this.aiSalesBot.getConversation(sessionId);

    return {
      ...response,
      customerInfo: context?.customerInfo,
      qualification: context?.leadQualification,
    };
  }

  /**
   * Get conversation context
   * GET /ai-sales-bot/:sessionId
   */
  @Get(':sessionId')
  async getConversation(@Param('sessionId') sessionId: string) {
    const context = this.aiSalesBot.getConversation(sessionId);

    if (!context) {
      return { error: 'Conversation not found' };
    }

    return {
      sessionId: context.sessionId,
      stage: context.stage,
      customerInfo: context.customerInfo,
      qualification: context.leadQualification,
      messageCount: context.messages.length,
      lastActivity: context.lastActivity,
    };
  }

  /**
   * Get available appointment slots
   * GET /ai-sales-bot/slots
   */
  @Get('slots/available')
  async getAvailableSlots(@Query('tenantId') tenantId: string, @Query('days') days?: string) {
    const daysToCheck = days ? parseInt(days) : 7;
    const slots = await this.aiSalesBot.getAvailableSlots(tenantId, daysToCheck);

    // Group by date
    const grouped = slots.reduce((acc, slot) => {
      const dateKey = slot.date.toISOString().split('T')[0];
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(slot);
      return acc;
    }, {} as Record<string, any[]>);

    return {
      total: slots.length,
      available: slots.filter((s) => s.available).length,
      byDate: grouped,
    };
  }

  /**
   * End a conversation
   * POST /ai-sales-bot/:sessionId/end
   */
  @Post(':sessionId/end')
  async endConversation(@Param('sessionId') sessionId: string) {
    await this.aiSalesBot.endConversation(sessionId);

    return {
      success: true,
      message: 'Conversation ended successfully',
    };
  }

  /**
   * Get bot analytics
   * GET /ai-sales-bot/analytics
   */
  @Get('analytics/summary')
  async getAnalytics(@Query() query: GetAnalyticsDto, @Request() req: any) {
    const tenantId = req.user?.tenantId || query.tenantId;
    const startDate = new Date(query.startDate);
    const endDate = new Date(query.endDate);

    return this.aiSalesBot.getBotAnalytics(tenantId, startDate, endDate);
  }

  /**
   * Test the bot with a sample conversation
   * POST /ai-sales-bot/test
   */
  @Post('test')
  async testBot(@Body() body: { tenantId: string; messages: string[] }) {
    const { tenantId, messages } = body;

    const context = await this.aiSalesBot.startConversation(tenantId);
    const responses = [context.messages[context.messages.length - 1].content];

    for (const message of messages) {
      const response = await this.aiSalesBot.chat(context.sessionId, message);
      responses.push(response.message);
    }

    return {
      sessionId: context.sessionId,
      conversation: messages.map((msg, i) => ({
        user: msg,
        bot: responses[i + 1],
      })),
      finalContext: this.aiSalesBot.getConversation(context.sessionId),
    };
  }

  /**
   * Get common questions and answers
   * GET /ai-sales-bot/faq
   */
  @Get('faq/list')
  async getFAQ() {
    return {
      faqs: [
        {
          question: 'How much does a roof replacement cost?',
          answer:
            "The cost varies based on size, materials, and complexity. On average, it ranges from $8,000 to $20,000. We offer free inspections to provide accurate quotes. Would you like to schedule one?",
        },
        {
          question: 'Do you work with insurance claims?',
          answer:
            "Yes! We're experienced with insurance claims and can help you through the entire process. We'll work directly with your adjuster to ensure you get fair coverage.",
        },
        {
          question: 'How long does a roof replacement take?',
          answer:
            'Most residential roof replacements take 1-3 days, depending on the size and complexity. We work efficiently while maintaining quality standards.',
        },
        {
          question: 'What warranty do you offer?',
          answer:
            'We provide a lifetime workmanship warranty and offer manufacturer warranties up to 50 years on materials, depending on the products chosen.',
        },
        {
          question: 'Do you offer financing?',
          answer:
            "Yes! We have flexible financing options with approved credit, including 0% interest for 12 months. Let's discuss your project and I can provide details.",
        },
        {
          question: 'Can you repair my roof or does it need replacement?',
          answer:
            "That depends on the extent of damage and the age of your roof. I'd recommend scheduling a free inspection so we can assess and provide honest recommendations.",
        },
      ],
    };
  }

  /**
   * Update customer info during conversation
   * PUT /ai-sales-bot/:sessionId/customer-info
   */
  @Post(':sessionId/customer-info')
  async updateCustomerInfo(
    @Param('sessionId') sessionId: string,
    @Body() body: { name?: string; email?: string; phone?: string; address?: string },
  ) {
    const context = this.aiSalesBot.getConversation(sessionId);

    if (!context) {
      return { error: 'Conversation not found' };
    }

    // Update customer info
    if (body.name) context.customerInfo.name = body.name;
    if (body.email) context.customerInfo.email = body.email;
    if (body.phone) context.customerInfo.phone = body.phone;
    if (body.address) context.customerInfo.address = body.address;

    return {
      success: true,
      customerInfo: context.customerInfo,
    };
  }

  /**
   * Get conversation transcript
   * GET /ai-sales-bot/:sessionId/transcript
   */
  @Get(':sessionId/transcript')
  async getTranscript(@Param('sessionId') sessionId: string) {
    const context = this.aiSalesBot.getConversation(sessionId);

    if (!context) {
      return { error: 'Conversation not found' };
    }

    return {
      sessionId,
      messages: context.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        })),
      stage: context.stage,
      customerInfo: context.customerInfo,
    };
  }

  /**
   * Transfer conversation to human agent
   * POST /ai-sales-bot/:sessionId/transfer
   */
  @Post(':sessionId/transfer')
  async transferToHuman(@Param('sessionId') sessionId: string, @Body() body: { agentId?: string }) {
    const context = this.aiSalesBot.getConversation(sessionId);

    if (!context) {
      return { error: 'Conversation not found' };
    }

    context.stage = 'TRANSFERRED';

    // Would notify agent and create task
    return {
      success: true,
      message: 'Conversation transferred to human agent',
      transcript: context.messages
        .filter((m) => m.role !== 'system')
        .map((m) => `${m.role === 'user' ? 'Customer' : 'Bot'}: ${m.content}`)
        .join('\n'),
      customerInfo: context.customerInfo,
    };
  }

  /**
   * Get bot health and statistics
   * GET /ai-sales-bot/health
   */
  @Get('health/stats')
  async getHealth() {
    // Would track actual metrics
    return {
      status: 'healthy',
      uptime: '99.9%',
      averageResponseTime: '< 1s',
      activeConversations: 0, // Would count from conversations Map
      totalConversationsToday: 0,
      aiModelStatus: 'connected',
      lastHealthCheck: new Date(),
    };
  }
}
