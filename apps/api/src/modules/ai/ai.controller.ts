import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { UserId } from '../../common/decorators/user.decorator';
import { AIAssistantService, ChatMessage } from './ai-assistant.service';
import { AIRouterService } from './ai-router.service';
import { AIToolsService } from './ai-tools.service';
import { OllamaService } from './ollama.service';

@ApiTags('ai')
@Controller('ai')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AIController {
  constructor(
    private readonly aiAssistant: AIAssistantService,
    private readonly aiRouter: AIRouterService,
    private readonly aiTools: AIToolsService,
    private readonly ollama: OllamaService
  ) {}

  @Post('chat')
  @ApiOperation({ summary: 'Chat with AI assistant' })
  @ApiBody({
    schema: {
      properties: {
        messages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', enum: ['user', 'assistant', 'system'] },
              content: { type: 'string' },
            },
          },
        },
        model: { type: 'string', required: false },
        temperature: { type: 'number', required: false },
      },
    },
  })
  async chat(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @Body() body: { messages: ChatMessage[]; model?: string; temperature?: number }
  ) {
    return this.aiAssistant.chat(body.messages, tenantId, userId, {
      model: body.model,
      temperature: body.temperature,
    });
  }

  @Sse('chat/stream')
  @ApiOperation({ summary: 'Stream chat responses (Server-Sent Events)' })
  async chatStream(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @Body() body: { messages: ChatMessage[] }
  ): Promise<Observable<MessageEvent>> {
    return new Observable((subscriber) => {
      (async () => {
        try {
          for await (const chunk of this.aiAssistant.chatStream(
            body.messages,
            tenantId,
            userId
          )) {
            subscriber.next({ data: chunk } as MessageEvent);
          }
          subscriber.complete();
        } catch (error) {
          subscriber.error(error);
        }
      })();
    });
  }

  @Post('analyze-call')
  @ApiOperation({ summary: 'Analyze call transcript' })
  @ApiBody({
    schema: {
      properties: {
        transcript: { type: 'string' },
      },
    },
  })
  async analyzeCall(
    @TenantId() tenantId: string,
    @Body() body: { transcript: string }
  ) {
    return this.aiAssistant.analyzeCallTranscript(body.transcript, tenantId);
  }

  @Post('generate-email')
  @ApiOperation({ summary: 'Generate personalized email' })
  @ApiBody({
    schema: {
      properties: {
        purpose: { type: 'string' },
        context: { type: 'object' },
      },
    },
  })
  async generateEmail(
    @TenantId() tenantId: string,
    @Body() body: { purpose: string; context: Record<string, any> }
  ) {
    return this.aiAssistant.generateEmail(body.purpose, body.context, tenantId);
  }

  @Get('tools')
  @ApiOperation({ summary: 'Get available AI tools' })
  async getTools() {
    return {
      tools: this.aiTools.getTools(),
      count: this.aiTools.getTools().length,
    };
  }

  @Get('models')
  @ApiOperation({ summary: 'Get available AI models and providers' })
  async getModels() {
    return {
      providers: await this.aiRouter.getProvidersStatus(),
      recommended: this.aiRouter.getRecommendedModels(),
    };
  }

  @Get('health')
  @ApiOperation({ summary: 'Check AI services health' })
  async health() {
    const ollamaAvailable = await this.ollama.isAvailable();
    const ollamaModels = ollamaAvailable ? await this.ollama.listModels() : [];

    return {
      ollama: {
        available: ollamaAvailable,
        models: ollamaModels,
      },
      status: ollamaAvailable ? 'healthy' : 'degraded',
      message: ollamaAvailable
        ? 'AI services operational'
        : 'Ollama not available, using cloud providers',
    };
  }
}
