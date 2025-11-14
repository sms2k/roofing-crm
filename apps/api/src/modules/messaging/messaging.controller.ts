import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { MessagingGateway } from './messaging.gateway';

@Controller('messaging')
export class MessagingController {
  constructor(
    private readonly messagingService: MessagingService,
    private readonly messagingGateway: MessagingGateway,
  ) {}

  // ===========================
  // Channels
  // ===========================

  @Post('channels')
  async createChannel(
    @Req() req: any,
    @Body()
    body: {
      name: string;
      description?: string;
      type: 'PUBLIC' | 'PRIVATE' | 'DIRECT';
      memberIds?: string[];
    },
  ) {
    const tenantId = req.tenantId || 'default';
    const userId = req.user?.id || req.body.userId;

    return this.messagingService.createChannel(tenantId, userId, body);
  }

  @Get('channels')
  async getUserChannels(@Req() req: any) {
    const tenantId = req.tenantId || 'default';
    const userId = req.user?.id || req.query.userId;

    return this.messagingService.getUserChannels(tenantId, userId);
  }

  @Get('channels/:channelId')
  async getChannel(@Param('channelId') channelId: string) {
    return this.messagingService.getChannelWithMembers(channelId);
  }

  @Put('channels/:channelId')
  async updateChannel(
    @Param('channelId') channelId: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      archived?: boolean;
    },
  ) {
    return this.messagingService.updateChannel(channelId, body);
  }

  @Delete('channels/:channelId')
  async archiveChannel(@Param('channelId') channelId: string) {
    return this.messagingService.archiveChannel(channelId);
  }

  @Post('channels/:channelId/members')
  async addMember(
    @Param('channelId') channelId: string,
    @Body() body: { userId: string; role?: 'ADMIN' | 'MEMBER' },
  ) {
    return this.messagingService.addMember(channelId, body.userId, body.role);
  }

  @Delete('channels/:channelId/members/:userId')
  async removeMember(
    @Param('channelId') channelId: string,
    @Param('userId') userId: string,
  ) {
    return this.messagingService.removeMember(channelId, userId);
  }

  @Get('channels/:channelId/unread-count')
  async getUnreadCount(
    @Param('channelId') channelId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.query.userId;
    const count = await this.messagingService.getUnreadCount(channelId, userId);
    return { count };
  }

  @Put('channels/:channelId/read')
  async markAsRead(@Param('channelId') channelId: string, @Req() req: any) {
    const userId = req.user?.id || req.body.userId;
    return this.messagingService.markChannelAsRead(channelId, userId);
  }

  // ===========================
  // Direct Messages
  // ===========================

  @Post('direct-messages')
  async createOrGetDirectMessage(
    @Req() req: any,
    @Body() body: { otherUserId: string },
  ) {
    const tenantId = req.tenantId || 'default';
    const userId = req.user?.id || req.body.userId;

    return this.messagingService.getOrCreateDirectMessage(
      tenantId,
      userId,
      body.otherUserId,
    );
  }

  // ===========================
  // Messages
  // ===========================

  @Get('channels/:channelId/messages')
  async getChannelMessages(
    @Param('channelId') channelId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('before') before?: string,
    @Query('after') after?: string,
  ) {
    return this.messagingService.getChannelMessages(channelId, {
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
      before: before ? new Date(before) : undefined,
      after: after ? new Date(after) : undefined,
    });
  }

  @Post('messages')
  async createMessage(
    @Req() req: any,
    @Body()
    body: {
      channelId: string;
      content: string;
      attachments?: any[];
      mentionedUserIds?: string[];
      replyToMessageId?: string;
    },
  ) {
    const tenantId = req.tenantId || 'default';
    const userId = req.user?.id || req.body.userId;

    const message = await this.messagingService.createMessage(
      tenantId,
      userId,
      body,
    );

    // Broadcast via WebSocket
    this.messagingGateway.sendToChannel(body.channelId, 'message:new', message);

    return message;
  }

  @Put('messages/:messageId')
  async updateMessage(
    @Param('messageId') messageId: string,
    @Req() req: any,
    @Body() body: { content: string },
  ) {
    const userId = req.user?.id || req.body.userId;

    const message = await this.messagingService.updateMessage(
      messageId,
      userId,
      body.content,
    );

    // Broadcast via WebSocket
    const fullMessage = await this.messagingService['db'].message.findUnique({
      where: { id: messageId },
    });

    if (fullMessage) {
      this.messagingGateway.sendToChannel(
        fullMessage.channelId,
        'message:edited',
        message,
      );
    }

    return message;
  }

  @Delete('messages/:messageId')
  async deleteMessage(@Param('messageId') messageId: string, @Req() req: any) {
    const userId = req.user?.id || req.body.userId;

    // Get channel before deleting
    const fullMessage = await this.messagingService['db'].message.findUnique({
      where: { id: messageId },
    });

    await this.messagingService.deleteMessage(messageId, userId);

    // Broadcast via WebSocket
    if (fullMessage) {
      this.messagingGateway.sendToChannel(
        fullMessage.channelId,
        'message:deleted',
        { messageId },
      );
    }

    return { deleted: true };
  }

  @Post('messages/:messageId/reactions')
  async addReaction(
    @Param('messageId') messageId: string,
    @Req() req: any,
    @Body() body: { emoji: string },
  ) {
    const userId = req.user?.id || req.body.userId;

    const reaction = await this.messagingService.addReaction(
      messageId,
      userId,
      body.emoji,
    );

    // Broadcast via WebSocket
    const message = await this.messagingService['db'].message.findUnique({
      where: { id: messageId },
    });

    if (message) {
      this.messagingGateway.sendToChannel(message.channelId, 'message:reaction', {
        messageId,
        userId,
        emoji: body.emoji,
        action: 'add',
      });
    }

    return reaction;
  }

  @Delete('messages/:messageId/reactions/:emoji')
  async removeReaction(
    @Param('messageId') messageId: string,
    @Param('emoji') emoji: string,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.body.userId;

    await this.messagingService.removeReaction(messageId, userId, emoji);

    // Broadcast via WebSocket
    const message = await this.messagingService['db'].message.findUnique({
      where: { id: messageId },
    });

    if (message) {
      this.messagingGateway.sendToChannel(message.channelId, 'message:reaction', {
        messageId,
        userId,
        emoji,
        action: 'remove',
      });
    }

    return { removed: true };
  }

  // ===========================
  // Search & Stats
  // ===========================

  @Get('search')
  async searchMessages(
    @Req() req: any,
    @Query('q') query: string,
    @Query('channelId') channelId?: string,
  ) {
    const tenantId = req.tenantId || 'default';
    const userId = req.user?.id || req.query.userId;

    return this.messagingService.searchMessages(
      tenantId,
      userId,
      query,
      channelId,
    );
  }

  @Get('stats')
  async getStats(@Req() req: any, @Query('userId') userId?: string) {
    const tenantId = req.tenantId || 'default';
    return this.messagingService.getStats(tenantId, userId);
  }

  @Get('unread-count')
  async getTotalUnreadCount(@Req() req: any) {
    const tenantId = req.tenantId || 'default';
    const userId = req.user?.id || req.query.userId;

    const count = await this.messagingService.getTotalUnreadCount(
      tenantId,
      userId,
    );
    return { count };
  }

  // ===========================
  // Online Status
  // ===========================

  @Get('online-users')
  async getOnlineUsers() {
    return {
      onlineUsers: this.messagingGateway.getOnlineUserIds(),
    };
  }

  @Get('users/:userId/online')
  async isUserOnline(@Param('userId') userId: string) {
    return {
      userId,
      isOnline: this.messagingGateway.isUserOnline(userId),
    };
  }
}
