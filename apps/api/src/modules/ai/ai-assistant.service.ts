import { Injectable, Logger } from '@nestjs/common';
import { OllamaService, OllamaMessage } from './ollama.service';
import { AIRouterService } from './ai-router.service';
import { AIToolsService } from './ai-tools.service';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatResponse {
  message: string;
  toolCalls?: Array<{
    tool: string;
    arguments: Record<string, any>;
    result: any;
  }>;
  model: string;
  provider: string;
}

@Injectable()
export class AIAssistantService {
  private readonly logger = new Logger(AIAssistantService.name);

  private readonly systemPrompt = `You are an intelligent AI assistant for a roofing CRM system. Your role is to help roofing contractors manage their business efficiently.

You have access to various tools to:
- Create and manage leads
- Schedule appointments
- Update job statuses
- Create tasks for team members
- Draft emails and SMS messages
- Calculate rough estimates
- Provide company information

Key roofing knowledge:
- 1 roofing square = 100 square feet
- Common roof types: Asphalt shingle (most common), Metal, Tile, Flat
- Roof pitch: Ratio of rise over run (e.g., 6/12 means 6" rise for every 12" run)
- Storm damage often requires insurance claims
- Typical timeline: Inspection → Estimate → Contract → Installation (1-3 days for residential)

Communication style:
- Be professional but friendly
- Use roofing terminology when appropriate
- Always confirm important details (dates, times, addresses)
- Be proactive in suggesting next steps
- When booking appointments, always check availability first

Important:
- Always search for existing leads before creating duplicates
- Create tasks for follow-ups to ensure nothing falls through
- Update lead/job status as conversations progress
- Ask clarifying questions when information is incomplete`;

  constructor(
    private readonly ollamaService: OllamaService,
    private readonly aiRouter: AIRouterService,
    private readonly aiTools: AIToolsService
  ) {}

  /**
   * Chat with the AI assistant
   */
  async chat(
    messages: ChatMessage[],
    tenantId: string,
    userId?: string,
    options?: {
      model?: string;
      temperature?: number;
      maxIterations?: number;
    }
  ): Promise<ChatResponse> {
    const maxIterations = options?.maxIterations || 5;
    let iteration = 0;

    // Select appropriate model
    const { provider, model } = options?.model
      ? { provider: 'ollama' as any, model: options.model }
      : this.aiRouter.selectModel({ task: 'general', preferLocal: true });

    this.logger.debug(`Using ${provider}/${model} for chat`);

    // Prepare messages with system prompt
    const ollamaMessages: OllamaMessage[] = [
      { role: 'system', content: this.systemPrompt },
      ...messages.map((m) => ({
        role: m.role === 'user' || m.role === 'assistant' ? m.role : 'system',
        content: m.content,
      })),
    ];

    // Get available tools
    const tools = this.aiTools.getTools();

    const toolCalls: Array<{
      tool: string;
      arguments: Record<string, any>;
      result: any;
    }> = [];

    // Main chat loop with tool calling
    while (iteration < maxIterations) {
      iteration++;

      try {
        const response = await this.ollamaService.generate({
          model,
          messages: ollamaMessages,
          tools,
          temperature: options?.temperature || 0.7,
        });

        // Check if AI wants to call tools
        if (response.message.tool_calls && response.message.tool_calls.length > 0) {
          // Execute all tool calls
          for (const toolCall of response.message.tool_calls) {
            const toolName = toolCall.function.name;
            const args = JSON.parse(toolCall.function.arguments);

            this.logger.debug(`AI calling tool: ${toolName}`);

            // Execute the tool
            const result = await this.aiTools.executeTool(toolName, args, tenantId, userId);

            toolCalls.push({
              tool: toolName,
              arguments: args,
              result,
            });

            // Add tool result to conversation
            ollamaMessages.push({
              role: 'assistant',
              content: `[Tool Call: ${toolName}]`,
            });
            ollamaMessages.push({
              role: 'system',
              content: `Tool result: ${JSON.stringify(result)}`,
            });
          }

          // Continue conversation with tool results
          continue;
        }

        // No more tool calls, return final response
        return {
          message: response.message.content,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          model,
          provider,
        };
      } catch (error) {
        this.logger.error('Error in chat:', error);
        throw new Error(`AI chat failed: ${error.message}`);
      }
    }

    // Max iterations reached
    return {
      message: 'I apologize, but I need more information to help with that. Can you provide more details?',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      model,
      provider,
    };
  }

  /**
   * Stream chat responses for real-time interaction
   */
  async *chatStream(
    messages: ChatMessage[],
    tenantId: string,
    userId?: string
  ): AsyncGenerator<string> {
    const { model } = this.aiRouter.selectModel({ task: 'fast', preferLocal: true });

    const ollamaMessages: OllamaMessage[] = [
      { role: 'system', content: this.systemPrompt },
      ...messages.map((m) => ({
        role: m.role === 'user' || m.role === 'assistant' ? m.role : 'system',
        content: m.content,
      })),
    ];

    try {
      for await (const chunk of this.ollamaService.generateStream({
        model,
        messages: ollamaMessages,
        temperature: 0.7,
      })) {
        yield chunk;
      }
    } catch (error) {
      this.logger.error('Error in chat stream:', error);
      yield `[Error: ${error.message}]`;
    }
  }

  /**
   * Analyze call transcription and extract key information
   */
  async analyzeCallTranscript(
    transcript: string,
    tenantId: string
  ): Promise<{
    summary: string;
    sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
    actionItems: string[];
    leadQuality: 'HIGH' | 'MEDIUM' | 'LOW';
    suggestedNextSteps: string[];
  }> {
    const { model } = this.aiRouter.selectModel({ task: 'analysis', preferLocal: true });

    const prompt = `Analyze this phone call transcript from a roofing company:

${transcript}

Provide a JSON response with:
1. summary: Brief summary of the call (2-3 sentences)
2. sentiment: Overall sentiment (POSITIVE, NEUTRAL, or NEGATIVE)
3. actionItems: List of action items mentioned or implied
4. leadQuality: Assessment of lead quality (HIGH, MEDIUM, LOW)
5. suggestedNextSteps: Recommended next steps for the sales rep

Return ONLY valid JSON, no other text.`;

    try {
      const response = await this.ollamaService.generate({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3, // Lower temperature for structured output
      });

      // Parse JSON response
      const content = response.message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Fallback if JSON parsing fails
      return {
        summary: 'Call transcript analyzed',
        sentiment: 'NEUTRAL',
        actionItems: [],
        leadQuality: 'MEDIUM',
        suggestedNextSteps: ['Follow up with customer'],
      };
    } catch (error) {
      this.logger.error('Error analyzing transcript:', error);
      throw error;
    }
  }

  /**
   * Generate personalized email content
   */
  async generateEmail(
    purpose: string,
    context: Record<string, any>,
    tenantId: string
  ): Promise<{ subject: string; body: string }> {
    const { model } = this.aiRouter.selectModel({ task: 'creative', preferLocal: true });

    const prompt = `Generate a professional email for a roofing company with the following details:

Purpose: ${purpose}
Context: ${JSON.stringify(context, null, 2)}

Generate:
1. A subject line
2. A professional but friendly email body

The email should be personalized, clear, and action-oriented.

Format the response as JSON with "subject" and "body" fields.`;

    try {
      const response = await this.ollamaService.generate({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8, // Higher temperature for creativity
      });

      const content = response.message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Fallback
      return {
        subject: `Regarding your roofing project`,
        body: `Hi there,\n\nThank you for your interest in our roofing services.\n\nBest regards,`,
      };
    } catch (error) {
      this.logger.error('Error generating email:', error);
      throw error;
    }
  }
}
