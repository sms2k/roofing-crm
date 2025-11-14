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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // ===========================
  // Sending Notifications
  // ===========================

  @Post('send')
  async sendNotification(
    @Req() req: any,
    @Body()
    body: {
      userId: string;
      type: string;
      title: string;
      message: string;
      priority?: string;
      channels?: string[];
      data?: Record<string, any>;
      actionUrl?: string;
      actionText?: string;
      scheduledAt?: string;
      expiresAt?: string;
    },
  ) {
    const tenantId = req.tenantId || 'default';
    return this.notificationsService.send(tenantId, {
      ...body,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    } as any);
  }

  @Post('send-bulk')
  async sendBulkNotification(
    @Req() req: any,
    @Body()
    body: {
      userIds: string[];
      type: string;
      title: string;
      message: string;
      priority?: string;
      channels?: string[];
      data?: Record<string, any>;
      actionUrl?: string;
      actionText?: string;
    },
  ) {
    const tenantId = req.tenantId || 'default';
    return this.notificationsService.sendBulk(tenantId, body as any);
  }

  // ===========================
  // Predefined Notification Types
  // ===========================

  @Post('appointment-reminder')
  async sendAppointmentReminder(
    @Req() req: any,
    @Body()
    body: {
      userId: string;
      appointmentData: {
        date: string;
        time: string;
        address: string;
        portalLink?: string;
      };
    },
  ) {
    const tenantId = req.tenantId || 'default';
    return this.notificationsService.notifyAppointmentReminder(
      tenantId,
      body.userId,
      body.appointmentData,
    );
  }

  @Post('quote-ready')
  async sendQuoteReady(
    @Req() req: any,
    @Body()
    body: {
      userId: string;
      quoteData: {
        address: string;
        amount: string;
        portalLink?: string;
      };
    },
  ) {
    const tenantId = req.tenantId || 'default';
    return this.notificationsService.notifyQuoteReady(
      tenantId,
      body.userId,
      body.quoteData,
    );
  }

  @Post('job-started')
  async sendJobStarted(
    @Req() req: any,
    @Body()
    body: {
      userId: string;
      jobData: {
        projectType: string;
        startDate: string;
        portalLink?: string;
      };
    },
  ) {
    const tenantId = req.tenantId || 'default';
    return this.notificationsService.notifyJobStarted(
      tenantId,
      body.userId,
      body.jobData,
    );
  }

  @Post('payment-due')
  async sendPaymentDue(
    @Req() req: any,
    @Body()
    body: {
      userId: string;
      paymentData: {
        amount: string;
        dueDate: string;
        paymentLink?: string;
      };
    },
  ) {
    const tenantId = req.tenantId || 'default';
    return this.notificationsService.notifyPaymentDue(
      tenantId,
      body.userId,
      body.paymentData,
    );
  }

  @Post('task-assigned')
  async sendTaskAssigned(
    @Req() req: any,
    @Body()
    body: {
      userId: string;
      taskData: {
        taskName: string;
        dueDate?: string;
        taskUrl?: string;
      };
    },
  ) {
    const tenantId = req.tenantId || 'default';
    return this.notificationsService.notifyTaskAssigned(
      tenantId,
      body.userId,
      body.taskData,
    );
  }

  // ===========================
  // User Notifications
  // ===========================

  @Get('user/:userId')
  async getUserNotifications(
    @Req() req: any,
    @Param('userId') userId: string,
    @Query('isRead') isRead?: string,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const tenantId = req.tenantId || 'default';
    return this.notificationsService.getUserNotifications(tenantId, userId, {
      isRead: isRead !== undefined ? isRead === 'true' : undefined,
      type: type as any,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });
  }

  @Get('user/:userId/unread-count')
  async getUnreadCount(@Req() req: any, @Param('userId') userId: string) {
    const tenantId = req.tenantId || 'default';
    const count = await this.notificationsService.getUnreadCount(tenantId, userId);
    return { count };
  }

  @Put(':notificationId/read')
  async markAsRead(
    @Req() req: any,
    @Param('notificationId') notificationId: string,
  ) {
    const tenantId = req.tenantId || 'default';
    const userId = req.user?.id || req.body.userId;

    if (!userId) {
      throw new Error('User ID is required');
    }

    return this.notificationsService.markAsRead(tenantId, userId, notificationId);
  }

  @Put('user/:userId/mark-all-read')
  async markAllAsRead(@Req() req: any, @Param('userId') userId: string) {
    const tenantId = req.tenantId || 'default';
    return this.notificationsService.markAllAsRead(tenantId, userId);
  }

  @Delete(':notificationId')
  async deleteNotification(
    @Req() req: any,
    @Param('notificationId') notificationId: string,
  ) {
    const tenantId = req.tenantId || 'default';
    const userId = req.user?.id || req.body.userId;

    if (!userId) {
      throw new Error('User ID is required');
    }

    return this.notificationsService.delete(tenantId, userId, notificationId);
  }

  @Delete('user/:userId/read')
  async deleteAllRead(@Req() req: any, @Param('userId') userId: string) {
    const tenantId = req.tenantId || 'default';
    return this.notificationsService.deleteAllRead(tenantId, userId);
  }

  // ===========================
  // Preferences
  // ===========================

  @Get('preferences/:userId')
  async getPreferences(@Req() req: any, @Param('userId') userId: string) {
    const tenantId = req.tenantId || 'default';
    return this.notificationsService.getPreferences(tenantId, userId);
  }

  @Put('preferences/:userId')
  async updatePreferences(
    @Req() req: any,
    @Param('userId') userId: string,
    @Body()
    body: {
      preferences: Array<{
        notificationType: string;
        channel: string;
        enabled: boolean;
      }>;
    },
  ) {
    const tenantId = req.tenantId || 'default';
    return this.notificationsService.updatePreferences(
      tenantId,
      userId,
      body.preferences as any,
    );
  }

  // ===========================
  // Statistics & Cleanup
  // ===========================

  @Get('stats')
  async getStats(@Req() req: any, @Query('userId') userId?: string) {
    const tenantId = req.tenantId || 'default';
    return this.notificationsService.getStats(tenantId, userId);
  }

  @Post('cleanup-expired')
  @HttpCode(HttpStatus.OK)
  async cleanupExpired(@Req() req: any) {
    const tenantId = req.tenantId || 'default';
    return this.notificationsService.cleanupExpired(tenantId);
  }
}
