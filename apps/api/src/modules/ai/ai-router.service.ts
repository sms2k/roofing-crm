import { Injectable, Logger } from '@nestjs/common';
import { OllamaService } from './ollama.service';
import { ConfigService } from '@nestjs/config';

export enum AIProvider {
  OLLAMA = 'ollama',
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
}

export enum AIModel {
  // Ollama models
  GEMMA_27B = 'gemma2:27b',
  LLAMA_3_1 = 'llama3.1:latest',
  LLAMA_3_2 = 'llama3.2:latest',
  MIXTRAL = 'mixtral:latest',
  CODELLAMA = 'codellama:latest',

  // OpenAI models
  GPT_4 = 'gpt-4',
  GPT_4_TURBO = 'gpt-4-turbo-preview',
  GPT_3_5 = 'gpt-3.5-turbo',

  // Anthropic models
  CLAUDE_3_OPUS = 'claude-3-opus-20240229',
  CLAUDE_3_SONNET = 'claude-3-sonnet-20240229',
}

export interface AITaskConfig {
  task: 'general' | 'code' | 'analysis' | 'creative' | 'voice' | 'fast';
  preferLocal?: boolean;
  maxCost?: number;
}

@Injectable()
export class AIRouterService {
  private readonly logger = new Logger(AIRouterService.name);
  private ollamaAvailable = false;

  constructor(
    private readonly ollamaService: OllamaService,
    private readonly configService: ConfigService
  ) {
    this.checkOllamaAvailability();
  }

  /**
   * Check if Ollama is available
   */
  private async checkOllamaAvailability() {
    this.ollamaAvailable = await this.ollamaService.isAvailable();
    if (this.ollamaAvailable) {
      this.logger.log('Ollama is available for local inference');
    } else {
      this.logger.warn('Ollama is not available, will use cloud providers');
    }
  }

  /**
   * Select the best model for a given task
   */
  selectModel(config: AITaskConfig): { provider: AIProvider; model: string } {
    const { task, preferLocal = true } = config;

    // If preferring local and Ollama is available
    if (preferLocal && this.ollamaAvailable) {
      switch (task) {
        case 'fast':
          return { provider: AIProvider.OLLAMA, model: AIModel.MIXTRAL };

        case 'code':
          return { provider: AIProvider.OLLAMA, model: AIModel.CODELLAMA };

        case 'general':
        case 'analysis':
        case 'creative':
          return { provider: AIProvider.OLLAMA, model: AIModel.GEMMA_27B };

        case 'voice':
          // Voice needs fast response
          return { provider: AIProvider.OLLAMA, model: AIModel.LLAMA_3_2 };

        default:
          return { provider: AIProvider.OLLAMA, model: AIModel.GEMMA_27B };
      }
    }

    // Fallback to cloud providers
    const hasOpenAI = !!this.configService.get('OPENAI_API_KEY');
    const hasAnthropic = !!this.configService.get('ANTHROPIC_API_KEY');

    if (hasOpenAI) {
      switch (task) {
        case 'fast':
        case 'voice':
          return { provider: AIProvider.OPENAI, model: AIModel.GPT_3_5 };

        case 'general':
        case 'analysis':
        case 'creative':
        case 'code':
          return { provider: AIProvider.OPENAI, model: AIModel.GPT_4_TURBO };

        default:
          return { provider: AIProvider.OPENAI, model: AIModel.GPT_4_TURBO };
      }
    }

    if (hasAnthropic) {
      return { provider: AIProvider.ANTHROPIC, model: AIModel.CLAUDE_3_SONNET };
    }

    // No providers available
    throw new Error('No AI providers available. Please configure Ollama, OpenAI, or Anthropic.');
  }

  /**
   * Get recommended models for roofing CRM tasks
   */
  getRecommendedModels() {
    return {
      leadQualification: this.selectModel({ task: 'analysis', preferLocal: true }),
      appointmentBooking: this.selectModel({ task: 'voice', preferLocal: true }),
      emailDrafting: this.selectModel({ task: 'creative', preferLocal: true }),
      estimateGeneration: this.selectModel({ task: 'analysis', preferLocal: true }),
      photoAnalysis: this.selectModel({ task: 'analysis', preferLocal: false }),
      chatAssistant: this.selectModel({ task: 'general', preferLocal: true }),
      quickResponses: this.selectModel({ task: 'fast', preferLocal: true }),
    };
  }

  /**
   * Check if a specific provider is available
   */
  async isProviderAvailable(provider: AIProvider): Promise<boolean> {
    switch (provider) {
      case AIProvider.OLLAMA:
        return this.ollamaAvailable;

      case AIProvider.OPENAI:
        return !!this.configService.get('OPENAI_API_KEY');

      case AIProvider.ANTHROPIC:
        return !!this.configService.get('ANTHROPIC_API_KEY');

      default:
        return false;
    }
  }

  /**
   * Get status of all providers
   */
  async getProvidersStatus() {
    return {
      ollama: {
        available: this.ollamaAvailable,
        models: this.ollamaAvailable ? await this.ollamaService.listModels() : [],
      },
      openai: {
        available: !!this.configService.get('OPENAI_API_KEY'),
        models: ['gpt-4-turbo-preview', 'gpt-3.5-turbo'],
      },
      anthropic: {
        available: !!this.configService.get('ANTHROPIC_API_KEY'),
        models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229'],
      },
    };
  }
}
