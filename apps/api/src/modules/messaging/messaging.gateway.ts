import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { MessagingService } from './messaging.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  tenantId?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*', // Configure appropriately for production
    credentials: true,
  },
  namespace: '/messaging',
})
export class MessagingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MessagingGateway.name);
  private onlineUsers = new Map<string, Set<string>>(); // userId -> Set of socketIds

  constructor(private readonly messagingService: MessagingService) {}

  // ===========================
  // Connection Management
  // ===========================

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Extract user info from handshake (you'd implement proper auth here)
      const userId = client.handshake.auth.userId;
      const tenantId = client.handshake.auth.tenantId;

      if (!userId || !tenantId) {
        this.logger.warn('Connection rejected: missing auth');
        client.disconnect();
        return;
      }

      client.userId = userId;
      client.tenantId = tenantId;

      // Track online user
      if (!this.onlineUsers.has(userId)) {
        this.onlineUsers.set(userId, new Set());
      }
      this.onlineUsers.get(userId)!.add(client.id);

      // Get user's channels and join rooms
      const channels = await this.messagingService.getUserChannels(
        tenantId,
        userId,
      );

      for (const channel of channels) {
        client.join(`channel:${channel.id}`);
      }

      // Broadcast user online status
      this.broadcastUserStatus(userId, 'online');

      this.logger.log(`User ${userId} connected (${client.id})`);
    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    const userId = client.userId;

    if (userId) {
      // Remove from online users
      const userSockets = this.onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(client.id);

        // If no more sockets, user is offline
        if (userSockets.size === 0) {
          this.onlineUsers.delete(userId);
          this.broadcastUserStatus(userId, 'offline');
        }
      }

      this.logger.log(`User ${userId} disconnected (${client.id})`);
    }
  }

  // ===========================
  // Message Events
  // ===========================

  @SubscribeMessage('message:send')
  async handleSendMessage(
    @MessageBody()
    data: {
      channelId: string;
      content: string;
      attachments?: any[];
      mentionedUserIds?: string[];
      replyToMessageId?: string;
    },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    try {
      const message = await this.messagingService.createMessage(
        client.tenantId!,
        client.userId!,
        data,
      );

      // Broadcast to channel
      this.server.to(`channel:${data.channelId}`).emit('message:new', message);

      // Send confirmation to sender
      return { success: true, message };
    } catch (error) {
      this.logger.error(`Send message error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('message:edit')
  async handleEditMessage(
    @MessageBody() data: { messageId: string; content: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    try {
      const message = await this.messagingService.updateMessage(
        data.messageId,
        client.userId!,
        data.content,
      );

      // Get channel from message
      const fullMessage = await this.messagingService['db'].message.findUnique({
        where: { id: data.messageId },
      });

      if (fullMessage) {
        this.server
          .to(`channel:${fullMessage.channelId}`)
          .emit('message:edited', message);
      }

      return { success: true, message };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('message:delete')
  async handleDeleteMessage(
    @MessageBody() data: { messageId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    try {
      // Get channel before deleting
      const fullMessage = await this.messagingService['db'].message.findUnique({
        where: { id: data.messageId },
      });

      await this.messagingService.deleteMessage(
        data.messageId,
        client.userId!,
      );

      if (fullMessage) {
        this.server
          .to(`channel:${fullMessage.channelId}`)
          .emit('message:deleted', { messageId: data.messageId });
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('message:react')
  async handleReaction(
    @MessageBody() data: { messageId: string; emoji: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    try {
      const reaction = await this.messagingService.addReaction(
        data.messageId,
        client.userId!,
        data.emoji,
      );

      // Get channel from message
      const message = await this.messagingService['db'].message.findUnique({
        where: { id: data.messageId },
      });

      if (message) {
        this.server.to(`channel:${message.channelId}`).emit('message:reaction', {
          messageId: data.messageId,
          userId: client.userId,
          emoji: data.emoji,
          action: 'add',
        });
      }

      return { success: true, reaction };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('message:unreact')
  async handleRemoveReaction(
    @MessageBody() data: { messageId: string; emoji: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    try {
      await this.messagingService.removeReaction(
        data.messageId,
        client.userId!,
        data.emoji,
      );

      // Get channel from message
      const message = await this.messagingService['db'].message.findUnique({
        where: { id: data.messageId },
      });

      if (message) {
        this.server.to(`channel:${message.channelId}`).emit('message:reaction', {
          messageId: data.messageId,
          userId: client.userId,
          emoji: data.emoji,
          action: 'remove',
        });
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ===========================
  // Typing Indicators
  // ===========================

  @SubscribeMessage('typing:start')
  handleTypingStart(
    @MessageBody() data: { channelId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    client.to(`channel:${data.channelId}`).emit('user:typing', {
      userId: client.userId,
      channelId: data.channelId,
      isTyping: true,
    });

    return { success: true };
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @MessageBody() data: { channelId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    client.to(`channel:${data.channelId}`).emit('user:typing', {
      userId: client.userId,
      channelId: data.channelId,
      isTyping: false,
    });

    return { success: true };
  }

  // ===========================
  // Channel Events
  // ===========================

  @SubscribeMessage('channel:join')
  async handleJoinChannel(
    @MessageBody() data: { channelId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    client.join(`channel:${data.channelId}`);
    this.logger.log(
      `User ${client.userId} joined channel ${data.channelId}`,
    );

    // Mark as read
    await this.messagingService.markChannelAsRead(
      data.channelId,
      client.userId!,
    );

    return { success: true };
  }

  @SubscribeMessage('channel:leave')
  handleLeaveChannel(
    @MessageBody() data: { channelId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    client.leave(`channel:${data.channelId}`);
    this.logger.log(
      `User ${client.userId} left channel ${data.channelId}`,
    );

    return { success: true };
  }

  @SubscribeMessage('channel:read')
  async handleMarkAsRead(
    @MessageBody() data: { channelId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    try {
      await this.messagingService.markChannelAsRead(
        data.channelId,
        client.userId!,
      );

      // Broadcast read receipt to channel
      this.server.to(`channel:${data.channelId}`).emit('channel:read', {
        userId: client.userId,
        channelId: data.channelId,
        readAt: new Date(),
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ===========================
  // User Status
  // ===========================

  @SubscribeMessage('user:status')
  getOnlineUsers() {
    return {
      onlineUsers: Array.from(this.onlineUsers.keys()),
    };
  }

  /**
   * Broadcast user status change
   */
  private broadcastUserStatus(userId: string, status: 'online' | 'offline') {
    this.server.emit('user:status', {
      userId,
      status,
      timestamp: new Date(),
    });
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId: string): boolean {
    return this.onlineUsers.has(userId) && this.onlineUsers.get(userId)!.size > 0;
  }

  /**
   * Get all online users
   */
  getOnlineUserIds(): string[] {
    return Array.from(this.onlineUsers.keys());
  }

  /**
   * Send notification to specific user
   */
  sendToUser(userId: string, event: string, data: any) {
    const userSockets = this.onlineUsers.get(userId);
    if (userSockets) {
      userSockets.forEach((socketId) => {
        this.server.to(socketId).emit(event, data);
      });
    }
  }

  /**
   * Send notification to channel
   */
  sendToChannel(channelId: string, event: string, data: any) {
    this.server.to(`channel:${channelId}`).emit(event, data);
  }
}
