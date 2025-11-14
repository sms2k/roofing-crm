import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SmsService } from '../sms/sms.service';
import { EmailService } from '../email/email.service';

export type NotificationType =
  | 'APPOINTMENT_REMINDER'
  | 'APPOINTMENT_CONFIRMED'
  | 'QUOTE_READY'
  | 'JOB_STARTED'
  | 'JOB_COMPLETED'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_DUE'
  | 'INVOICE_SENT'
  | 'MESSAGE_RECEIVED'
  | 'TASK_ASSIGNED'
  | 'TASK_DUE'
  | 'LEAD_ASSIGNED'
  | 'SYSTEM_ALERT'
  | 'CUSTOM';

export type NotificationChannel = 'EMAIL' | 'SMS' | 'PUSH' | 'IN_APP';

export type NotificationPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface SendNotificationOptions {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  priority?: NotificationPriority;
  channels?: NotificationChannel[];
  data?: Record<string, any>;
  actionUrl?: string;
  actionText?: string;
  scheduledAt?: Date;
  expiresAt?: Date;
}

export interface BulkNotificationOptions {
  userIds: string[];
  type: NotificationType;
  title: string;
  message: string;
  priority?: NotificationPriority;
  channels?: NotificationChannel[];
  data?: Record<string, any>;
  actionUrl?: string;
  actionText?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly smsService: SmsService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Send a notification to a user
   */
  async send(tenantId: string, options: SendNotificationOptions) {
    const user = await this.db.user.findUnique({
      where: { id: options.userId },
      include: {
        contact: true,
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Get user notification preferences
    const preferences = await this.getPreferences(tenantId, options.userId);

    // Determine which channels to use
    let channels = options.channels || ['IN_APP'];

    // Check if user has opted out of certain channels for this notification type
    if (preferences) {
      channels = channels.filter((channel) => {
        const pref = preferences.find(
          (p: any) => p.notificationType === options.type && p.channel === channel,
        );
        return pref?.enabled !== false;
      });
    }

    const results = {
      channels: [] as string[],
      success: [] as string[],
      failed: [] as string[],
    };

    // Create in-app notification first
    if (channels.includes('IN_APP')) {
      try {
        await this.createInAppNotification(tenantId, options);
        results.channels.push('IN_APP');
        results.success.push('IN_APP');
      } catch (error) {
        this.logger.error(
          `Failed to create in-app notification: ${error.message}`,
        );
        results.channels.push('IN_APP');
        results.failed.push('IN_APP');
      }
    }

    // Send email notification
    if (channels.includes('EMAIL') && user.contact?.email) {
      try {
        await this.sendEmailNotification(tenantId, user, options);
        results.channels.push('EMAIL');
        results.success.push('EMAIL');
      } catch (error) {
        this.logger.error(`Failed to send email notification: ${error.message}`);
        results.channels.push('EMAIL');
        results.failed.push('EMAIL');
      }
    }

    // Send SMS notification
    if (channels.includes('SMS') && user.contact?.phone) {
      try {
        await this.sendSmsNotification(tenantId, user, options);
        results.channels.push('SMS');
        results.success.push('SMS');
      } catch (error) {
        this.logger.error(`Failed to send SMS notification: ${error.message}`);
        results.channels.push('SMS');
        results.failed.push('SMS');
      }
    }

    // Send push notification
    if (channels.includes('PUSH')) {
      try {
        await this.sendPushNotification(tenantId, user, options);
        results.channels.push('PUSH');
        results.success.push('PUSH');
      } catch (error) {
        this.logger.error(`Failed to send push notification: ${error.message}`);
        results.channels.push('PUSH');
        results.failed.push('PUSH');
      }
    }

    this.logger.log(
      `Notification sent to user ${options.userId}: ${results.success.length}/${results.channels.length} channels successful`,
    );

    return results;
  }

  /**
   * Send bulk notifications to multiple users
   */
  async sendBulk(tenantId: string, options: BulkNotificationOptions) {
    const results = {
      total: options.userIds.length,
      sent: 0,
      failed: 0,
      errors: [] as Array<{ userId: string; error: string }>,
    };

    for (const userId of options.userIds) {
      try {
        await this.send(tenantId, {
          userId,
          type: options.type,
          title: options.title,
          message: options.message,
          priority: options.priority,
          channels: options.channels,
          data: options.data,
          actionUrl: options.actionUrl,
          actionText: options.actionText,
        });
        results.sent++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          userId,
          error: error.message,
        });
        this.logger.error(
          `Failed to send bulk notification to user ${userId}: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `Bulk notification completed: ${results.sent} sent, ${results.failed} failed`,
    );

    return results;
  }

  /**
   * Create in-app notification
   */
  private async createInAppNotification(
    tenantId: string,
    options: SendNotificationOptions,
  ) {
    return this.db.notification.create({
      data: {
        tenantId,
        userId: options.userId,
        type: options.type,
        title: options.title,
        message: options.message,
        priority: options.priority || 'MEDIUM',
        data: options.data || {},
        actionUrl: options.actionUrl,
        actionText: options.actionText,
        scheduledAt: options.scheduledAt,
        expiresAt: options.expiresAt,
        isRead: false,
      },
    });
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(
    tenantId: string,
    user: any,
    options: SendNotificationOptions,
  ) {
    const subject = this.getEmailSubject(options.type, options.title);
    const html = this.buildEmailHtml(options);

    return this.emailService.sendEmail(tenantId, {
      to: user.contact.email,
      subject,
      html,
      trackOpens: true,
      trackClicks: true,
    });
  }

  /**
   * Send SMS notification
   */
  private async sendSmsNotification(
    tenantId: string,
    user: any,
    options: SendNotificationOptions,
  ) {
    // Keep SMS concise
    let message = `${options.title}: ${options.message}`;

    // Truncate if too long
    if (message.length > 160) {
      message = message.substring(0, 157) + '...';
    }

    return this.smsService.sendSms(tenantId, {
      to: user.contact.phone,
      message,
    });
  }

  /**
   * Send push notification
   */
  private async sendPushNotification(
    tenantId: string,
    user: any,
    options: SendNotificationOptions,
  ) {
    // This would integrate with a push notification service like Firebase Cloud Messaging
    // For now, we'll just log it
    this.logger.log(
      `Push notification would be sent to user ${user.id}: ${options.title}`,
    );

    // Store push notification record
    // In production, you'd integrate with FCM, APNS, or web push
    return Promise.resolve();
  }

  /**
   * Get user's notification preferences
   */
  async getPreferences(tenantId: string, userId: string) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
    });

    return (user?.settings as any)?.notificationPreferences || [];
  }

  /**
   * Update user's notification preferences
   */
  async updatePreferences(
    tenantId: string,
    userId: string,
    preferences: Array<{
      notificationType: NotificationType;
      channel: NotificationChannel;
      enabled: boolean;
    }>,
  ) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
    });

    const currentSettings = (user?.settings as any) || {};
    const updatedSettings = {
      ...currentSettings,
      notificationPreferences: preferences,
    };

    return this.db.user.update({
      where: { id: userId },
      data: { settings: updatedSettings },
    });
  }

  /**
   * Get all notifications for a user
   */
  async getUserNotifications(
    tenantId: string,
    userId: string,
    options?: {
      isRead?: boolean;
      type?: NotificationType;
      limit?: number;
      offset?: number;
    },
  ) {
    const where: any = { tenantId, userId };

    if (options?.isRead !== undefined) {
      where.isRead = options.isRead;
    }

    if (options?.type) {
      where.type = options.type;
    }

    // Don't show expired notifications
    where.OR = [{ expiresAt: null }, { expiresAt: { gte: new Date() } }];

    return this.db.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0,
    });
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(tenantId: string, userId: string) {
    return this.db.notification.count({
      where: {
        tenantId,
        userId,
        isRead: false,
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      },
    });
  }

  /**
   * Mark notification as read
   */
  async markAsRead(tenantId: string, userId: string, notificationId: string) {
    const notification = await this.db.notification.findFirst({
      where: { id: notificationId, tenantId, userId },
    });

    if (!notification) {
      throw new BadRequestException('Notification not found');
    }

    return this.db.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(tenantId: string, userId: string) {
    return this.db.notification.updateMany({
      where: {
        tenantId,
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Delete a notification
   */
  async delete(tenantId: string, userId: string, notificationId: string) {
    const notification = await this.db.notification.findFirst({
      where: { id: notificationId, tenantId, userId },
    });

    if (!notification) {
      throw new BadRequestException('Notification not found');
    }

    return this.db.notification.delete({
      where: { id: notificationId },
    });
  }

  /**
   * Delete all read notifications
   */
  async deleteAllRead(tenantId: string, userId: string) {
    return this.db.notification.deleteMany({
      where: {
        tenantId,
        userId,
        isRead: true,
      },
    });
  }

  /**
   * Get notification statistics
   */
  async getStats(tenantId: string, userId?: string) {
    const where: any = { tenantId };
    if (userId) where.userId = userId;

    const [total, unread, byType, byPriority] = await Promise.all([
      this.db.notification.count({ where }),
      this.db.notification.count({ where: { ...where, isRead: false } }),
      this.db.notification.groupBy({
        by: ['type'],
        where,
        _count: true,
      }),
      this.db.notification.groupBy({
        by: ['priority'],
        where,
        _count: true,
      }),
    ]);

    return {
      total,
      unread,
      read: total - unread,
      byType: byType.reduce((acc: any, item: any) => {
        acc[item.type] = item._count;
        return acc;
      }, {}),
      byPriority: byPriority.reduce((acc: any, item: any) => {
        acc[item.priority] = item._count;
        return acc;
      }, {}),
    };
  }

  /**
   * Clean up expired notifications
   */
  async cleanupExpired(tenantId: string) {
    const deleted = await this.db.notification.deleteMany({
      where: {
        tenantId,
        expiresAt: { lt: new Date() },
      },
    });

    this.logger.log(`Cleaned up ${deleted.count} expired notifications`);

    return { deleted: deleted.count };
  }

  /**
   * Get email subject based on notification type
   */
  private getEmailSubject(type: NotificationType, title: string): string {
    const prefixes: Record<NotificationType, string> = {
      APPOINTMENT_REMINDER: '⏰ Reminder',
      APPOINTMENT_CONFIRMED: '✓ Confirmed',
      QUOTE_READY: '📄 Quote Ready',
      JOB_STARTED: '🏗️ Job Started',
      JOB_COMPLETED: '✅ Job Completed',
      PAYMENT_RECEIVED: '💰 Payment Received',
      PAYMENT_DUE: '💳 Payment Due',
      INVOICE_SENT: '📧 Invoice Sent',
      MESSAGE_RECEIVED: '💬 New Message',
      TASK_ASSIGNED: '📋 Task Assigned',
      TASK_DUE: '⏰ Task Due',
      LEAD_ASSIGNED: '🎯 Lead Assigned',
      SYSTEM_ALERT: '⚠️ Alert',
      CUSTOM: '',
    };

    const prefix = prefixes[type] || '';
    return prefix ? `${prefix}: ${title}` : title;
  }

  /**
   * Build HTML email for notification
   */
  private buildEmailHtml(options: SendNotificationOptions): string {
    const actionButton = options.actionUrl
      ? `
      <div style="text-align: center; margin: 30px 0;">
        <a href="${options.actionUrl}" style="background-color: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
          ${options.actionText || 'View Details'}
        </a>
      </div>
    `
      : '';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
    <h2 style="color: #2c3e50; margin-bottom: 20px;">${options.title}</h2>
    <p style="font-size: 16px; line-height: 1.8;">${options.message}</p>
    ${actionButton}
    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
    <p style="font-size: 12px; color: #666; text-align: center;">
      This is an automated notification. Please do not reply to this email.
    </p>
  </div>
</body>
</html>
    `;
  }

  /**
   * Send notification for specific roofing events
   */

  async notifyAppointmentReminder(
    tenantId: string,
    userId: string,
    appointmentData: any,
  ) {
    return this.send(tenantId, {
      userId,
      type: 'APPOINTMENT_REMINDER',
      title: 'Appointment Reminder',
      message: `Your roof inspection is scheduled for ${appointmentData.date} at ${appointmentData.time}`,
      priority: 'HIGH',
      channels: ['EMAIL', 'SMS', 'IN_APP'],
      actionUrl: appointmentData.portalLink,
      actionText: 'View Appointment',
      data: appointmentData,
    });
  }

  async notifyQuoteReady(tenantId: string, userId: string, quoteData: any) {
    return this.send(tenantId, {
      userId,
      type: 'QUOTE_READY',
      title: 'Your Quote is Ready',
      message: `Your roofing estimate for ${quoteData.address} is ready to view`,
      priority: 'HIGH',
      channels: ['EMAIL', 'SMS', 'IN_APP'],
      actionUrl: quoteData.portalLink,
      actionText: 'View Quote',
      data: quoteData,
    });
  }

  async notifyJobStarted(tenantId: string, userId: string, jobData: any) {
    return this.send(tenantId, {
      userId,
      type: 'JOB_STARTED',
      title: 'Your Roof Project Has Started',
      message: `Work has begun on your ${jobData.projectType} project`,
      priority: 'MEDIUM',
      channels: ['EMAIL', 'SMS', 'IN_APP'],
      actionUrl: jobData.portalLink,
      actionText: 'Track Progress',
      data: jobData,
    });
  }

  async notifyPaymentDue(tenantId: string, userId: string, paymentData: any) {
    return this.send(tenantId, {
      userId,
      type: 'PAYMENT_DUE',
      title: 'Payment Due',
      message: `Your payment of $${paymentData.amount} is due on ${paymentData.dueDate}`,
      priority: 'HIGH',
      channels: ['EMAIL', 'SMS', 'IN_APP'],
      actionUrl: paymentData.paymentLink,
      actionText: 'Pay Now',
      data: paymentData,
    });
  }

  async notifyTaskAssigned(tenantId: string, userId: string, taskData: any) {
    return this.send(tenantId, {
      userId,
      type: 'TASK_ASSIGNED',
      title: 'New Task Assigned',
      message: `You've been assigned: ${taskData.taskName}`,
      priority: 'MEDIUM',
      channels: ['EMAIL', 'IN_APP'],
      actionUrl: taskData.taskUrl,
      actionText: 'View Task',
      data: taskData,
    });
  }
}
