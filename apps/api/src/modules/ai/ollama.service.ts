import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaGenerateOptions {
  model: string;
  messages: OllamaMessage[];
  tools?: any[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
}

export interface OllamaGenerateResponse {
  model: string;
  message: {
    role: string;
    content: string;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }>;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_duration?: number;
  eval_duration?: number;
}

@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {
    this.baseUrl = this.configService.get('OLLAMA_BASE_URL', 'http://localhost:11434');
    this.defaultModel = this.configService.get('OLLAMA_DEFAULT_MODEL', 'gemma2:27b');
  }

  /**
   * Generate a chat completion with Ollama
   */
  async generate(options: OllamaGenerateOptions): Promise<OllamaGenerateResponse> {
    try {
      const model = options.model || this.defaultModel;
      this.logger.debug(`Generating with model: ${model}`);

      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/api/chat`, {
          model,
          messages: options.messages,
          tools: options.tools,
          stream: false,
          options: {
            temperature: options.temperature || 0.7,
            top_p: options.top_p || 0.9,
            num_predict: options.max_tokens || 2048,
          },
        })
      );

      return response.data;
    } catch (error) {
      this.logger.error('Error calling Ollama:', error.message);
      throw new Error(`Ollama generation failed: ${error.message}`);
    }
  }

  /**
   * Stream a chat completion (for real-time responses)
   */
  async *generateStream(options: OllamaGenerateOptions): AsyncGenerator<string> {
    try {
      const model = options.model || this.defaultModel;

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/api/chat`,
          {
            model,
            messages: options.messages,
            tools: options.tools,
            stream: true,
            options: {
              temperature: options.temperature || 0.7,
              top_p: options.top_p || 0.9,
            },
          },
          { responseType: 'stream' }
        )
      );

      for await (const chunk of response.data) {
        const lines = chunk.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) {
              yield parsed.message.content;
            }
          } catch (e) {
            // Skip invalid JSON lines
          }
        }
      }
    } catch (error) {
      this.logger.error('Error streaming from Ollama:', error.message);
      throw new Error(`Ollama streaming failed: ${error.message}`);
    }
  }

  /**
   * List available models
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/api/tags`)
      );

      return response.data.models?.map((m: any) => m.name) || [];
    } catch (error) {
      this.logger.error('Error listing models:', error.message);
      return [];
    }
  }

  /**
   * Check if Ollama is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/api/tags`, { timeout: 2000 })
      );
      return true;
    } catch (error) {
      this.logger.warn('Ollama is not available');
      return false;
    }
  }

  /**
   * Pull a model (download if not exists)
   */
  async pullModel(modelName: string): Promise<void> {
    try {
      this.logger.log(`Pulling model: ${modelName}`);

      await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/api/pull`, {
          name: modelName,
        })
      );

      this.logger.log(`Model ${modelName} pulled successfully`);
    } catch (error) {
      this.logger.error(`Error pulling model ${modelName}:`, error.message);
      throw new Error(`Failed to pull model: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for text (useful for semantic search)
   */
  async generateEmbeddings(text: string, model = 'nomic-embed-text'): Promise<number[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/api/embeddings`, {
          model,
          prompt: text,
        })
      );

      return response.data.embedding;
    } catch (error) {
      this.logger.error('Error generating embeddings:', error.message);
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }
}
