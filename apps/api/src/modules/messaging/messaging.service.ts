import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface CreateChannelDto {
  name: string;
  description?: string;
  type: 'PUBLIC' | 'PRIVATE' | 'DIRECT';
  memberIds?: string[];
}

export interface CreateMessageDto {
  channelId: string;
  content: string;
  attachments?: Array<{
    filename: string;
    url: string;
    type: string;
    size: number;
  }>;
  mentionedUserIds?: string[];
  replyToMessageId?: string;
}

export interface UpdateChannelDto {
  name?: string;
  description?: string;
  archived?: boolean;
}

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(private readonly db: DatabaseService) {}

  // ===========================
  // Channels
  // ===========================

  /**
   * Create a new channel
   */
  async createChannel(tenantId: string, userId: string, data: CreateChannelDto) {
    // If direct message, ensure only 2 members
    if (data.type === 'DIRECT' && data.memberIds) {
      if (data.memberIds.length !== 2) {
        throw new BadRequestException(
          'Direct message channels must have exactly 2 members',
        );
      }

      // Check if DM channel already exists between these users
      const existingDM = await this.findDirectMessageChannel(
        tenantId,
        data.memberIds[0],
        data.memberIds[1],
      );

      if (existingDM) {
        return existingDM;
      }
    }

    const channel = await this.db.channel.create({
      data: {
        tenantId,
        name: data.name,
        description: data.description,
        type: data.type,
        createdById: userId,
      },
    });

    // Add members
    const memberIds = data.memberIds || [userId];
    await Promise.all(
      memberIds.map((memberId) =>
        this.db.channelMember.create({
          data: {
            channelId: channel.id,
            userId: memberId,
            role: memberId === userId ? 'ADMIN' : 'MEMBER',
          },
        }),
      ),
    );

    this.logger.log(
      `Created ${data.type} channel: ${channel.name} (${channel.id})`,
    );

    return this.getChannelWithMembers(channel.id);
  }

  /**
   * Find existing direct message channel between two users
   */
  async findDirectMessageChannel(
    tenantId: string,
    userId1: string,
    userId2: string,
  ) {
    const channels = await this.db.channel.findMany({
      where: {
        tenantId,
        type: 'DIRECT',
      },
      include: {
        members: true,
      },
    });

    return channels.find((channel) => {
      const memberUserIds = channel.members.map((m) => m.userId);
      return (
        memberUserIds.includes(userId1) && memberUserIds.includes(userId2)
      );
    });
  }

  /**
   * Get channel with members
   */
  async getChannelWithMembers(channelId: string) {
    return this.db.channel.findUnique({
      where: { id: channelId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                avatar: true,
              },
            },
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  /**
   * Get all channels for a user
   */
  async getUserChannels(tenantId: string, userId: string) {
    const memberships = await this.db.channelMember.findMany({
      where: { userId },
      include: {
        channel: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    avatar: true,
                  },
                },
              },
            },
            _count: {
              select: {
                messages: true,
              },
            },
          },
        },
      },
    });

    // Filter by tenant and not archived
    return memberships
      .filter((m) => m.channel.tenantId === tenantId && !m.channel.archived)
      .map((m) => ({
        ...m.channel,
        role: m.role,
        lastReadAt: m.lastReadAt,
      }));
  }

  /**
   * Update channel
   */
  async updateChannel(channelId: string, data: UpdateChannelDto) {
    return this.db.channel.update({
      where: { id: channelId },
      data,
    });
  }

  /**
   * Archive/Delete channel
   */
  async archiveChannel(channelId: string) {
    return this.db.channel.update({
      where: { id: channelId },
      data: { archived: true },
    });
  }

  /**
   * Add member to channel
   */
  async addMember(channelId: string, userId: string, role: 'ADMIN' | 'MEMBER' = 'MEMBER') {
    // Check if already member
    const existing = await this.db.channelMember.findUnique({
      where: {
        channelId_userId: {
          channelId,
          userId,
        },
      },
    });

    if (existing) {
      return existing;
    }

    return this.db.channelMember.create({
      data: {
        channelId,
        userId,
        role,
      },
    });
  }

  /**
   * Remove member from channel
   */
  async removeMember(channelId: string, userId: string) {
    return this.db.channelMember.delete({
      where: {
        channelId_userId: {
          channelId,
          userId,
        },
      },
    });
  }

  // ===========================
  // Messages
  // ===========================

  /**
   * Create a message
   */
  async createMessage(tenantId: string, userId: string, data: CreateMessageDto) {
    const message = await this.db.message.create({
      data: {
        tenantId,
        channelId: data.channelId,
        senderId: userId,
        content: data.content,
        attachments: data.attachments || [],
        mentionedUserIds: data.mentionedUserIds || [],
        replyToId: data.replyToMessageId,
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        replyTo: {
          include: {
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    this.logger.log(`Message created in channel ${data.channelId}`);

    return message;
  }

  /**
   * Get messages for a channel
   */
  async getChannelMessages(
    channelId: string,
    options?: {
      limit?: number;
      offset?: number;
      before?: Date;
      after?: Date;
    },
  ) {
    const where: any = { channelId };

    if (options?.before || options?.after) {
      where.createdAt = {};
      if (options.before) where.createdAt.lt = options.before;
      if (options.after) where.createdAt.gt = options.after;
    }

    return this.db.message.findMany({
      where,
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        replyTo: {
          include: {
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        reactions: true,
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0,
    });
  }

  /**
   * Update message
   */
  async updateMessage(messageId: string, userId: string, content: string) {
    const message = await this.db.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new BadRequestException('Message not found');
    }

    if (message.senderId !== userId) {
      throw new BadRequestException('You can only edit your own messages');
    }

    return this.db.message.update({
      where: { id: messageId },
      data: {
        content,
        edited: true,
        editedAt: new Date(),
      },
    });
  }

  /**
   * Delete message
   */
  async deleteMessage(messageId: string, userId: string) {
    const message = await this.db.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new BadRequestException('Message not found');
    }

    if (message.senderId !== userId) {
      throw new BadRequestException('You can only delete your own messages');
    }

    return this.db.message.delete({
      where: { id: messageId },
    });
  }

  /**
   * Add reaction to message
   */
  async addReaction(messageId: string, userId: string, emoji: string) {
    // Check if reaction already exists
    const existing = await this.db.messageReaction.findUnique({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId,
          emoji,
        },
      },
    });

    if (existing) {
      return existing;
    }

    return this.db.messageReaction.create({
      data: {
        messageId,
        userId,
        emoji,
      },
    });
  }

  /**
   * Remove reaction
   */
  async removeReaction(messageId: string, userId: string, emoji: string) {
    return this.db.messageReaction.delete({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId,
          emoji,
        },
      },
    });
  }

  // ===========================
  // Read Receipts & Typing
  // ===========================

  /**
   * Mark channel as read
   */
  async markChannelAsRead(channelId: string, userId: string) {
    return this.db.channelMember.update({
      where: {
        channelId_userId: {
          channelId,
          userId,
        },
      },
      data: {
        lastReadAt: new Date(),
      },
    });
  }

  /**
   * Get unread message count
   */
  async getUnreadCount(channelId: string, userId: string) {
    const member = await this.db.channelMember.findUnique({
      where: {
        channelId_userId: {
          channelId,
          userId,
        },
      },
    });

    if (!member) {
      return 0;
    }

    const count = await this.db.message.count({
      where: {
        channelId,
        createdAt: {
          gt: member.lastReadAt || new Date(0),
        },
        senderId: {
          not: userId, // Don't count own messages
        },
      },
    });

    return count;
  }

  /**
   * Get total unread count across all channels
   */
  async getTotalUnreadCount(tenantId: string, userId: string) {
    const channels = await this.getUserChannels(tenantId, userId);
    let total = 0;

    for (const channel of channels) {
      const count = await this.getUnreadCount(channel.id, userId);
      total += count;
    }

    return total;
  }

  /**
   * Search messages
   */
  async searchMessages(
    tenantId: string,
    userId: string,
    query: string,
    channelId?: string,
  ) {
    const where: any = {
      tenantId,
      content: {
        contains: query,
        mode: 'insensitive',
      },
    };

    if (channelId) {
      where.channelId = channelId;
    } else {
      // Only search in user's channels
      const userChannels = await this.getUserChannels(tenantId, userId);
      where.channelId = {
        in: userChannels.map((c) => c.id),
      };
    }

    return this.db.message.findMany({
      where,
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        channel: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Get message statistics
   */
  async getStats(tenantId: string, userId?: string) {
    const where: any = { tenantId };
    if (userId) {
      const userChannels = await this.getUserChannels(tenantId, userId);
      where.channelId = { in: userChannels.map((c) => c.id) };
    }

    const [totalMessages, totalChannels, messagesByChannel] = await Promise.all([
      this.db.message.count({ where }),
      this.db.channel.count({ where: { tenantId, archived: false } }),
      this.db.message.groupBy({
        by: ['channelId'],
        where,
        _count: true,
      }),
    ]);

    return {
      totalMessages,
      totalChannels,
      messagesByChannel: messagesByChannel.reduce((acc: any, item: any) => {
        acc[item.channelId] = item._count;
        return acc;
      }, {}),
    };
  }

  /**
   * Create or get direct message channel
   */
  async getOrCreateDirectMessage(
    tenantId: string,
    userId1: string,
    userId2: string,
  ) {
    // Try to find existing DM
    const existing = await this.findDirectMessageChannel(
      tenantId,
      userId1,
      userId2,
    );

    if (existing) {
      return existing;
    }

    // Create new DM channel
    const user1 = await this.db.user.findUnique({ where: { id: userId1 } });
    const user2 = await this.db.user.findUnique({ where: { id: userId2 } });

    return this.createChannel(tenantId, userId1, {
      name: `${user1?.firstName} & ${user2?.firstName}`,
      type: 'DIRECT',
      memberIds: [userId1, userId2],
    });
  }
}
