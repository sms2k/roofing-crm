import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { AiSalesBotService } from './ai-sales-bot.service';

interface ChatSocket extends Socket {
  sessionId?: string;
  tenantId?: string;
}

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/ai-chat',
})
export class AiSalesBotGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(AiSalesBotGateway.name);

  constructor(private readonly aiSalesBot: AiSalesBotService) {}

  async handleConnection(client: ChatSocket) {
    this.logger.log(`Client connected: ${client.id}`);

    // Send welcome message
    client.emit('connected', {
      message: 'Connected to AI Sales Bot',
      timestamp: new Date(),
    });
  }

  async handleDisconnect(client: ChatSocket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    // End conversation if session exists
    if (client.sessionId) {
      await this.aiSalesBot.endConversation(client.sessionId);
    }
  }

  /**
   * Start a new chat session
   */
  @SubscribeMessage('chat:start')
  async handleStartChat(
    @MessageBody() data: { tenantId: string; sessionId?: string },
    @ConnectedSocket() client: ChatSocket,
  ) {
    this.logger.log(`Starting chat session for tenant ${data.tenantId}`);

    try {
      const context = await this.aiSalesBot.startConversation(data.tenantId, data.sessionId);

      client.sessionId = context.sessionId;
      client.tenantId = data.tenantId;

      const greeting = context.messages[context.messages.length - 1].content;

      client.emit('chat:started', {
        sessionId: context.sessionId,
        greeting,
        timestamp: new Date(),
      });

      return { success: true, sessionId: context.sessionId };
    } catch (error) {
      this.logger.error(`Failed to start chat: ${error.message}`);
      client.emit('chat:error', { message: 'Failed to start chat session' });
      return { success: false, error: error.message };
    }
  }

  /**
   * Send a message in the chat
   */
  @SubscribeMessage('chat:message')
  async handleMessage(
    @MessageBody() data: { message: string },
    @ConnectedSocket() client: ChatSocket,
  ) {
    if (!client.sessionId) {
      client.emit('chat:error', { message: 'No active session. Please start a chat first.' });
      return { success: false, error: 'No active session' };
    }

    this.logger.log(`Message received in session ${client.sessionId}`);

    try {
      // Show typing indicator
      client.emit('chat:typing', { isTyping: true });

      // Get bot response
      const response = await this.aiSalesBot.chat(client.sessionId, data.message);

      // Send response
      client.emit('chat:message', {
        role: 'assistant',
        content: response.message,
        timestamp: new Date(),
        stage: response.stage,
      });

      // Stop typing indicator
      client.emit('chat:typing', { isTyping: false });

      // Send additional data if available
      const context = this.aiSalesBot.getConversation(client.sessionId);
      if (context) {
        client.emit('chat:context', {
          stage: context.stage,
          hasContactInfo: !!(context.customerInfo.email || context.customerInfo.phone),
          qualification: context.leadQualification,
        });
      }

      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to process message: ${error.message}`);
      client.emit('chat:typing', { isTyping: false });
      client.emit('chat:error', { message: 'Failed to process your message' });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get available appointment slots
   */
  @SubscribeMessage('chat:get-slots')
  async handleGetSlots(
    @MessageBody() data: { days?: number },
    @ConnectedSocket() client: ChatSocket,
  ) {
    if (!client.tenantId) {
      return { success: false, error: 'No tenant ID' };
    }

    try {
      const slots = await this.aiSalesBot.getAvailableSlots(client.tenantId, data.days || 7);

      const availableSlots = slots.filter((s) => s.available);

      client.emit('chat:slots', {
        slots: availableSlots,
        count: availableSlots.length,
      });

      return { success: true, count: availableSlots.length };
    } catch (error) {
      this.logger.error(`Failed to get slots: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update customer information
   */
  @SubscribeMessage('chat:update-info')
  async handleUpdateInfo(
    @MessageBody()
    data: { name?: string; email?: string; phone?: string; address?: string },
    @ConnectedSocket() client: ChatSocket,
  ) {
    if (!client.sessionId) {
      return { success: false, error: 'No active session' };
    }

    const context = this.aiSalesBot.getConversation(client.sessionId);
    if (!context) {
      return { success: false, error: 'Session not found' };
    }

    // Update info
    if (data.name) context.customerInfo.name = data.name;
    if (data.email) context.customerInfo.email = data.email;
    if (data.phone) context.customerInfo.phone = data.phone;
    if (data.address) context.customerInfo.address = data.address;

    client.emit('chat:info-updated', {
      customerInfo: context.customerInfo,
    });

    return { success: true };
  }

  /**
   * End the chat session
   */
  @SubscribeMessage('chat:end')
  async handleEndChat(@ConnectedSocket() client: ChatSocket) {
    if (!client.sessionId) {
      return { success: false, error: 'No active session' };
    }

    try {
      await this.aiSalesBot.endConversation(client.sessionId);

      client.emit('chat:ended', {
        message: 'Thank you for chatting with us!',
        timestamp: new Date(),
      });

      client.sessionId = undefined;

      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to end chat: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Request human agent
   */
  @SubscribeMessage('chat:request-human')
  async handleRequestHuman(@ConnectedSocket() client: ChatSocket) {
    if (!client.sessionId) {
      return { success: false, error: 'No active session' };
    }

    const context = this.aiSalesBot.getConversation(client.sessionId);
    if (!context) {
      return { success: false, error: 'Session not found' };
    }

    context.stage = 'TRANSFERRED';

    client.emit('chat:message', {
      role: 'assistant',
      content:
        "I'll connect you with one of our roofing experts right away. They'll be with you shortly!",
      timestamp: new Date(),
    });

    // Would notify agents and create task
    this.logger.log(`Human agent requested for session ${client.sessionId}`);

    return { success: true };
  }

  /**
   * Get conversation transcript
   */
  @SubscribeMessage('chat:get-transcript')
  async handleGetTranscript(@ConnectedSocket() client: ChatSocket) {
    if (!client.sessionId) {
      return { success: false, error: 'No active session' };
    }

    const context = this.aiSalesBot.getConversation(client.sessionId);
    if (!context) {
      return { success: false, error: 'Session not found' };
    }

    const transcript = context.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      }));

    client.emit('chat:transcript', {
      messages: transcript,
      customerInfo: context.customerInfo,
      qualification: context.leadQualification,
    });

    return { success: true, messageCount: transcript.length };
  }

  /**
   * Ping to keep connection alive
   */
  @SubscribeMessage('ping')
  async handlePing(@ConnectedSocket() client: ChatSocket) {
    client.emit('pong', { timestamp: new Date() });
    return { success: true };
  }
}
