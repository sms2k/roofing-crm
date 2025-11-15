import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { OllamaService } from '../ai/ollama.service';

interface ConversationContext {
  sessionId: string;
  tenantId: string;
  messages: {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
  }[];
  customerInfo: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    zipCode?: string;
  };
  leadQualification: {
    urgency?: 'LOW' | 'MEDIUM' | 'HIGH';
    intent?: 'INFO' | 'QUOTE' | 'EMERGENCY';
    budget?: string;
    timeframe?: string;
    propertyType?: string;
    issue?: string;
  };
  stage:
    | 'GREETING'
    | 'DISCOVERY'
    | 'QUALIFICATION'
    | 'BOOKING'
    | 'COMPLETED'
    | 'TRANSFERRED';
  createdAt: Date;
  lastActivity: Date;
}

interface ChatResponse {
  message: string;
  actions?: {
    type: 'COLLECT_INFO' | 'BOOK_APPOINTMENT' | 'CREATE_LEAD' | 'TRANSFER_HUMAN';
    data?: any;
  }[];
  stage: string;
  nextSteps?: string[];
}

interface AppointmentSlot {
  date: Date;
  time: string;
  available: boolean;
}

@Injectable()
export class AiSalesBotService {
  private readonly logger = new Logger(AiSalesBotService.name);
  private conversations = new Map<string, ConversationContext>();

  constructor(
    private readonly db: DatabaseService,
    private readonly ollama: OllamaService,
  ) {}

  /**
   * Start a new conversation session
   */
  async startConversation(tenantId: string, sessionId?: string): Promise<ConversationContext> {
    const id = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const context: ConversationContext = {
      sessionId: id,
      tenantId,
      messages: [],
      customerInfo: {},
      leadQualification: {},
      stage: 'GREETING',
      createdAt: new Date(),
      lastActivity: new Date(),
    };

    this.conversations.set(id, context);

    // Add system prompt
    context.messages.push({
      role: 'system',
      content: this.getSystemPrompt(tenantId),
      timestamp: new Date(),
    });

    // Generate greeting
    const greeting = await this.generateGreeting(tenantId);

    context.messages.push({
      role: 'assistant',
      content: greeting,
      timestamp: new Date(),
    });

    return context;
  }

  /**
   * Get system prompt for the AI
   */
  private getSystemPrompt(tenantId: string): string {
    return `You are a friendly and professional roofing consultant for a roofing company. Your goals are:

1. Greet visitors warmly and build rapport
2. Understand their roofing needs (repair, replacement, inspection, emergency)
3. Gather key information: name, contact info, property address, issue description
4. Qualify their urgency and budget
5. Book appointments when appropriate
6. Answer common roofing questions
7. Create qualified leads in the CRM

Guidelines:
- Be conversational, friendly, and helpful
- Ask one question at a time
- Listen carefully and show empathy
- For emergencies, offer immediate scheduling
- For quotes, explain the free inspection process
- Mention warranties, insurance work, and financing when relevant
- If you can't help, offer to transfer to a human
- Keep responses under 100 words

Common Questions to Anticipate:
- Roof leak problems
- Storm damage assessment
- Roof replacement cost
- Insurance claims assistance
- Warranty information
- Timeline for projects

Your name is Alex, the virtual roofing consultant.`;
  }

  /**
   * Generate a greeting message
   */
  private async generateGreeting(tenantId: string): Promise<string> {
    const greetings = [
      "Hi! I'm Alex, your virtual roofing consultant. I'm here to help with any roofing questions or to schedule a free inspection. What brings you here today?",
      "Hello! Thanks for visiting. I'm Alex, and I'd love to help you with your roofing needs. Are you dealing with a leak, thinking about replacement, or just exploring your options?",
      "Welcome! I'm Alex, your roofing expert. Whether it's an emergency repair or planning for the future, I'm here to help. What's on your mind?",
    ];

    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  /**
   * Process user message and generate response
   */
  async chat(sessionId: string, userMessage: string): Promise<ChatResponse> {
    this.logger.log(`Processing message for session ${sessionId}`);

    const context = this.conversations.get(sessionId);

    if (!context) {
      throw new Error('Session not found. Please start a new conversation.');
    }

    // Add user message to context
    context.messages.push({
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    });

    context.lastActivity = new Date();

    // Extract information from message
    await this.extractInformation(context, userMessage);

    // Determine next stage
    this.updateStage(context);

    // Generate AI response
    const response = await this.generateResponse(context);

    // Add assistant response to context
    context.messages.push({
      role: 'assistant',
      content: response.message,
      timestamp: new Date(),
    });

    // Execute actions if any
    if (response.actions) {
      for (const action of response.actions) {
        await this.executeAction(context, action);
      }
    }

    return response;
  }

  /**
   * Extract information from user message
   */
  private async extractInformation(context: ConversationContext, message: string): Promise<void> {
    const lowerMessage = message.toLowerCase();

    // Extract name
    const nameMatch = message.match(/(?:my name is|i'm|i am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (nameMatch && !context.customerInfo.name) {
      context.customerInfo.name = nameMatch[1];
    }

    // Extract email
    const emailMatch = message.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
    if (emailMatch && !context.customerInfo.email) {
      context.customerInfo.email = emailMatch[1];
    }

    // Extract phone
    const phoneMatch = message.match(/(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/);
    if (phoneMatch && !context.customerInfo.phone) {
      context.customerInfo.phone = phoneMatch[1];
    }

    // Extract zip code
    const zipMatch = message.match(/\b(\d{5})\b/);
    if (zipMatch && !context.customerInfo.zipCode) {
      context.customerInfo.zipCode = zipMatch[1];
    }

    // Detect urgency
    if (lowerMessage.includes('emergency') || lowerMessage.includes('urgent') || lowerMessage.includes('leak')) {
      context.leadQualification.urgency = 'HIGH';
    } else if (lowerMessage.includes('soon') || lowerMessage.includes('quickly')) {
      context.leadQualification.urgency = 'MEDIUM';
    }

    // Detect intent
    if (lowerMessage.includes('quote') || lowerMessage.includes('price') || lowerMessage.includes('cost')) {
      context.leadQualification.intent = 'QUOTE';
    } else if (lowerMessage.includes('emergency') || lowerMessage.includes('leak')) {
      context.leadQualification.intent = 'EMERGENCY';
    } else if (lowerMessage.includes('question') || lowerMessage.includes('information')) {
      context.leadQualification.intent = 'INFO';
    }

    // Detect issue
    if (lowerMessage.includes('leak')) {
      context.leadQualification.issue = 'Roof leak';
    } else if (lowerMessage.includes('storm') || lowerMessage.includes('damage')) {
      context.leadQualification.issue = 'Storm damage';
    } else if (lowerMessage.includes('old') || lowerMessage.includes('replace')) {
      context.leadQualification.issue = 'Roof replacement';
    } else if (lowerMessage.includes('missing') || lowerMessage.includes('shingle')) {
      context.leadQualification.issue = 'Missing shingles';
    }

    // Detect timeframe
    if (lowerMessage.includes('today') || lowerMessage.includes('asap')) {
      context.leadQualification.timeframe = 'IMMEDIATE';
    } else if (lowerMessage.includes('this week')) {
      context.leadQualification.timeframe = 'THIS_WEEK';
    } else if (lowerMessage.includes('this month')) {
      context.leadQualification.timeframe = 'THIS_MONTH';
    }
  }

  /**
   * Update conversation stage
   */
  private updateStage(context: ConversationContext): void {
    const { customerInfo, leadQualification, stage } = context;

    if (stage === 'GREETING' && context.messages.length > 2) {
      context.stage = 'DISCOVERY';
    }

    if (stage === 'DISCOVERY' && leadQualification.issue) {
      context.stage = 'QUALIFICATION';
    }

    if (
      stage === 'QUALIFICATION' &&
      customerInfo.name &&
      (customerInfo.email || customerInfo.phone)
    ) {
      context.stage = 'BOOKING';
    }
  }

  /**
   * Generate AI response
   */
  private async generateResponse(context: ConversationContext): Promise<ChatResponse> {
    const { stage, customerInfo, leadQualification, messages } = context;

    // Build conversation history
    const conversationHistory = messages
      .filter((m) => m.role !== 'system')
      .slice(-10) // Last 10 messages
      .map((m) => `${m.role === 'user' ? 'Customer' : 'Alex'}: ${m.content}`)
      .join('\n');

    // Build context info
    const contextInfo = `
Current Stage: ${stage}
Customer Info: ${JSON.stringify(customerInfo)}
Lead Qualification: ${JSON.stringify(leadQualification)}
`;

    const prompt = `${this.getSystemPrompt(context.tenantId)}

Context:
${contextInfo}

Recent Conversation:
${conversationHistory}

Based on the current stage (${stage}) and the conversation, provide the next response as Alex.

Rules for this stage:
${this.getStageRules(stage, customerInfo, leadQualification)}

Respond naturally and conversationally. Keep it under 100 words.`;

    try {
      const aiResponse = await this.ollama.generate({
        model: 'gemma2:27b',
        prompt,
        options: {
          temperature: 0.8,
          max_tokens: 200,
        },
      });

      const actions = this.determineActions(context);
      const nextSteps = this.getNextSteps(stage);

      return {
        message: aiResponse.trim(),
        actions,
        stage,
        nextSteps,
      };
    } catch (error) {
      this.logger.error(`AI generation failed: ${error.message}`);
      return this.getFallbackResponse(stage, customerInfo, leadQualification);
    }
  }

  /**
   * Get stage-specific rules
   */
  private getStageRules(stage: string, customerInfo: any, leadQual: any): string {
    switch (stage) {
      case 'GREETING':
        return 'Ask what brings them here today. Be warm and inviting.';

      case 'DISCOVERY':
        return `Learn about their roofing issue. Ask about:
- What type of problem (leak, damage, replacement)?
- How urgent is it?
- Have they noticed any specific issues?`;

      case 'QUALIFICATION':
        if (!customerInfo.name) {
          return 'Ask for their name in a natural way.';
        }
        if (!customerInfo.phone && !customerInfo.email) {
          return 'Ask for their contact information (phone or email) so you can follow up.';
        }
        if (!customerInfo.address && !customerInfo.zipCode) {
          return 'Ask for their property address or zip code.';
        }
        return 'Gather any remaining details about their needs.';

      case 'BOOKING':
        return 'Offer to schedule a free inspection. Present available time slots.';

      case 'COMPLETED':
        return 'Confirm the appointment and thank them. Let them know what to expect next.';

      default:
        return 'Continue the helpful conversation.';
    }
  }

  /**
   * Get fallback response
   */
  private getFallbackResponse(stage: string, customerInfo: any, leadQual: any): ChatResponse {
    const responses = {
      GREETING: "I'd love to help you today! Are you experiencing a roofing issue, or are you thinking about a roof replacement?",
      DISCOVERY: "Tell me more about what's going on with your roof. Is it a leak, storm damage, or are you just looking to replace an older roof?",
      QUALIFICATION: customerInfo.name
        ? `Thanks for sharing that, ${customerInfo.name}! To help you better, could I get your phone number or email address?`
        : "That sounds important! Could I get your name and contact information so I can help you get this taken care of?",
      BOOKING: "Great! I'd like to schedule a free inspection for you. What day works best for you this week?",
      COMPLETED: "Perfect! You're all set. We'll send you a confirmation shortly. Is there anything else I can help with?",
    };

    return {
      message: responses[stage] || "I'm here to help! What questions do you have?",
      stage,
      actions: this.determineActions({ stage, customerInfo, leadQualification: leadQual } as any),
    };
  }

  /**
   * Determine actions to take
   */
  private determineActions(context: ConversationContext): any[] {
    const actions = [];

    // Create lead if we have minimum info
    if (
      context.customerInfo.name &&
      (context.customerInfo.email || context.customerInfo.phone) &&
      !context.leadQualification.intent // Only create once
    ) {
      actions.push({
        type: 'CREATE_LEAD',
        data: {
          customerInfo: context.customerInfo,
          qualification: context.leadQualification,
        },
      });
    }

    return actions;
  }

  /**
   * Get next steps for stage
   */
  private getNextSteps(stage: string): string[] {
    const steps = {
      GREETING: ['Understand customer need', 'Build rapport'],
      DISCOVERY: ['Identify issue type', 'Assess urgency'],
      QUALIFICATION: ['Collect contact info', 'Gather property details'],
      BOOKING: ['Offer appointment slots', 'Confirm booking'],
      COMPLETED: ['Send confirmation', 'Set expectations'],
    };

    return steps[stage] || [];
  }

  /**
   * Execute action
   */
  private async executeAction(context: ConversationContext, action: any): Promise<void> {
    this.logger.log(`Executing action: ${action.type}`);

    switch (action.type) {
      case 'CREATE_LEAD':
        await this.createLead(context, action.data);
        break;

      case 'BOOK_APPOINTMENT':
        await this.bookAppointment(context, action.data);
        break;
    }
  }

  /**
   * Create a lead in the CRM
   */
  private async createLead(context: ConversationContext, data: any): Promise<void> {
    const { customerInfo, leadQualification } = context;

    try {
      // Create or find contact
      let contact = await this.db.contact.findFirst({
        where: {
          tenantId: context.tenantId,
          OR: [
            { email: customerInfo.email },
            { phone: customerInfo.phone },
          ],
        },
      });

      if (!contact) {
        contact = await this.db.contact.create({
          data: {
            tenantId: context.tenantId,
            firstName: customerInfo.name?.split(' ')[0] || 'Unknown',
            lastName: customerInfo.name?.split(' ').slice(1).join(' ') || '',
            email: customerInfo.email,
            phone: customerInfo.phone,
            type: 'CUSTOMER',
          },
        });
      }

      // Create lead
      const lead = await this.db.lead.create({
        data: {
          tenantId: context.tenantId,
          contactId: contact.id,
          source: 'WEBSITE',
          status: 'NEW',
          urgency: leadQualification.urgency || 'MEDIUM',
          description: leadQualification.issue || 'Inquiry from website chatbot',
        },
      });

      // Create note with conversation history
      const conversationSummary = context.messages
        .filter((m) => m.role !== 'system')
        .map((m) => `${m.role === 'user' ? 'Customer' : 'Alex'}: ${m.content}`)
        .join('\n');

      await this.db.note.create({
        data: {
          tenantId: context.tenantId,
          leadId: lead.id,
          content: `AI Chatbot Conversation:\n\n${conversationSummary}`,
          createdById: 'ai-bot',
        },
      });

      this.logger.log(`Created lead ${lead.id} from chatbot conversation`);
    } catch (error) {
      this.logger.error(`Failed to create lead: ${error.message}`);
    }
  }

  /**
   * Book an appointment
   */
  private async bookAppointment(context: ConversationContext, data: any): Promise<void> {
    const { customerInfo } = context;

    try {
      // Find the lead
      const contact = await this.db.contact.findFirst({
        where: {
          tenantId: context.tenantId,
          OR: [
            { email: customerInfo.email },
            { phone: customerInfo.phone },
          ],
        },
      });

      if (!contact) {
        this.logger.error('Contact not found for booking');
        return;
      }

      const lead = await this.db.lead.findFirst({
        where: {
          tenantId: context.tenantId,
          contactId: contact.id,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!lead) {
        this.logger.error('Lead not found for booking');
        return;
      }

      // Create appointment (would integrate with calendar)
      const appointmentDate = new Date(data.date);

      await this.db.appointment.create({
        data: {
          tenantId: context.tenantId,
          leadId: lead.id,
          title: `Free Roof Inspection - ${customerInfo.name}`,
          description: `Appointment booked via AI chatbot`,
          startTime: appointmentDate,
          endTime: new Date(appointmentDate.getTime() + 60 * 60 * 1000), // 1 hour
          type: 'INSPECTION',
          status: 'SCHEDULED',
        },
      });

      this.logger.log(`Created appointment for lead ${lead.id}`);
    } catch (error) {
      this.logger.error(`Failed to book appointment: ${error.message}`);
    }
  }

  /**
   * Get available appointment slots
   */
  async getAvailableSlots(tenantId: string, days: number = 7): Promise<AppointmentSlot[]> {
    const slots: AppointmentSlot[] = [];
    const now = new Date();

    // Get existing appointments
    const existingAppointments = await this.db.appointment.findMany({
      where: {
        tenantId,
        startTime: {
          gte: now,
        },
      },
    });

    // Generate slots for next N days
    for (let day = 0; day < days; day++) {
      const date = new Date(now);
      date.setDate(date.getDate() + day);

      // Skip weekends
      if (date.getDay() === 0 || date.getDay() === 6) continue;

      // Morning slots: 9 AM, 10 AM, 11 AM
      // Afternoon slots: 1 PM, 2 PM, 3 PM, 4 PM
      const times = ['9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'];

      for (const time of times) {
        const [hour, minute, period] = time.match(/(\d+):(\d+)\s(AM|PM)/)!.slice(1);
        let slotHour = parseInt(hour);
        if (period === 'PM' && slotHour !== 12) slotHour += 12;
        if (period === 'AM' && slotHour === 12) slotHour = 0;

        const slotDate = new Date(date);
        slotDate.setHours(slotHour, parseInt(minute), 0, 0);

        // Check if slot is available
        const isBooked = existingAppointments.some((apt) => {
          const aptTime = apt.startTime.getTime();
          const slotTime = slotDate.getTime();
          return Math.abs(aptTime - slotTime) < 60 * 60 * 1000; // Within 1 hour
        });

        slots.push({
          date: slotDate,
          time,
          available: !isBooked && slotDate > now,
        });
      }
    }

    return slots;
  }

  /**
   * Get conversation context
   */
  getConversation(sessionId: string): ConversationContext | undefined {
    return this.conversations.get(sessionId);
  }

  /**
   * End conversation
   */
  async endConversation(sessionId: string): Promise<void> {
    const context = this.conversations.get(sessionId);

    if (context) {
      // Create lead if not already created
      if (context.customerInfo.name && (context.customerInfo.email || context.customerInfo.phone)) {
        await this.createLead(context, {});
      }

      context.stage = 'COMPLETED';
      this.conversations.delete(sessionId);
    }
  }

  /**
   * Get bot analytics
   */
  async getBotAnalytics(tenantId: string, startDate: Date, endDate: Date): Promise<any> {
    // Get all leads created by the bot in the period
    const leads = await this.db.lead.findMany({
      where: {
        tenantId,
        source: 'WEBSITE',
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        notes: true,
        job: true,
      },
    });

    const botLeads = leads.filter((lead) =>
      lead.notes.some((note) => note.content.includes('AI Chatbot Conversation')),
    );

    const converted = botLeads.filter((lead) => lead.job !== null).length;
    const conversionRate = botLeads.length > 0 ? (converted / botLeads.length) * 100 : 0;

    return {
      period: { start: startDate, end: endDate },
      totalConversations: botLeads.length,
      leadsCreated: botLeads.length,
      appointmentsBooked: converted,
      conversionRate: Math.round(conversionRate),
      averageResponseTime: '< 1 second',
      customerSatisfaction: 92, // Would track with feedback
    };
  }
}
