import { Injectable, Logger, OnModuleInit, Inject, forwardRef, NotFoundException } from '@nestjs/common';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { QUEUE_NAMES } from '../../common/constants/app.constants';
import { PrismaService } from '../../database/prisma.service';
import { NotificationType, NotificationChannel } from '@prisma/client';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { MessagingGateway } from '../messaging/messaging.gateway';

export interface EmailJobData {
  to: string;
  subject: string;
  template: string;
  context: Record<string, any>;
}

export interface PushJobData {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface SmsJobData {
  to: string;
  message: string;
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private fcmInitialized = false;
  private firebaseApp: App | null = null;

  constructor(
    @InjectQueue(QUEUE_NAMES.EMAIL) private readonly emailQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly pushQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => MessagingGateway))
    private readonly messagingGateway?: MessagingGateway,
  ) {}

  onModuleInit() {
    const projectId = this.config.get<string>('FCM_PROJECT_ID');
    const clientEmail = this.config.get<string>('FCM_CLIENT_EMAIL');
    const privateKey = this.config.get<string>('FCM_PRIVATE_KEY');

    if (
      projectId &&
      clientEmail &&
      privateKey &&
      !projectId.startsWith('your-') &&
      !getApps().length
    ) {
      try {
        this.firebaseApp = initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey: privateKey.replace(/\\n/g, '\n'),
          }),
        });
        this.fcmInitialized = true;
        this.logger.log('Firebase Admin SDK initialized (FCM ready)');
      } catch (err: any) {
        this.logger.warn(`Firebase Admin init failed: ${err.message}`);
      }
    } else {
      this.logger.warn(
        'FCM credentials not configured — push notifications are disabled. Set FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY in .env to enable.',
      );
    }
  }

  // ─── Email ───────────────────────────────────────────────────

  async sendEmail(
    to: string,
    subject: string,
    template: string,
    context: Record<string, any>,
  ): Promise<void> {
    await this.emailQueue.add(
      'send',
      { to, subject, template, context } as EmailJobData,
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: true },
    );
    this.logger.debug(`Queued email to ${to} with template ${template}`);
  }

  async getNotificationsForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markAsRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  async createInAppNotification(
    userId: string,
    title: string,
    body: string,
    type: NotificationType,
    data?: any,
  ) {
    try {
      const notification = await this.prisma.notification.create({
        data: {
          userId,
          title,
          body,
          type,
          channel: NotificationChannel.IN_APP,
          data: data || undefined,
        },
      });
      this.logger.debug(`Created in-app notification for user ${userId}: ${title}`);
      return notification;
    } catch (error) {
      this.logger.error(`Failed to create in-app notification: ${(error as Error).message}`);
    }
  }

  // ─── FCM Push ────────────────────────────────────────────────

  /**
   * Send a real FCM push to a device token.
   * No-ops gracefully if firebase-admin was not initialized.
   */
  async sendFcmPush(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!this.fcmInitialized) {
      this.logger.debug(`[FCM STUB] To: ${token} | ${title}: ${body}`);
      return;
    }

    try {
      const messaging = getMessaging(this.firebaseApp!);
      const result = await messaging.send({
        token,
        notification: { title, body },
        data: data || {},
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          },
        },
        apns: {
          payload: {
            aps: { sound: 'default', badge: 1 },
          },
        },
      });
      this.logger.log(`FCM push sent: ${result}`);
    } catch (err: any) {
      this.logger.error(`FCM push failed: ${err.message}`);
    }
  }

  /**
   * Enqueue a push notification job (Bull queue → PushProcessor).
   */
  async sendPushNotification(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    await this.pushQueue.add(
      'push',
      { token, title, body, data } as PushJobData,
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: true },
    );
    this.logger.debug(`Queued push notification to device`);
  }

  async sendSms(to: string, message: string): Promise<void> {
    this.logger.log(`[SMS Queue Simulation] To: ${to} | Msg: ${message}`);
  }

  // ─── In-App Notifications ────────────────────────────────────

  async createNotification(
    userId: string,
    data: {
      type: NotificationType;
      title: string;
      body: string;
      channel?: NotificationChannel;
      data?: any;
    },
  ) {
    const notif = await this.prisma.notification.create({
      data: {
        userId,
        type: data.type,
        channel: data.channel || NotificationChannel.IN_APP,
        title: data.title,
        body: data.body,
        data: data.data || null,
      },
    });
    this.logger.log(`Created in-app notification for user ${userId} (ID: ${notif.id})`);

    // Real-time WebSocket Push to user!
    try {
      if (this.messagingGateway) {
        const unreadCounts = await this.getUnreadCounts(userId);
        this.messagingGateway.sendToUser(userId, 'notification', {
          notification: notif,
          unreadCounts,
        });
      }
    } catch (err: any) {
      this.logger.error(`Failed to broadcast socket notification: ${err.message}`);
    }

    return notif;
  }

  /**
   * Returns total unread count + per-type breakdown.
   * Used by frontend sidebar to show per-module badge numbers.
   */
  async getUnreadCounts(userId: string): Promise<{ total: number; byType: Record<string, number> }> {
    const unread = await this.prisma.notification.findMany({
      where: { userId, isRead: false },
      select: { type: true },
    });

    const byType: Record<string, number> = {};
    for (const n of unread) {
      byType[n.type] = (byType[n.type] ?? 0) + 1;
    }

    return { total: unread.length, byType };
  }

  /**
   * Create notification AND optionally send FCM push to device.
   * Use this as the single entry point from other services.
   */
  async notify(
    userId: string,
    data: {
      type: NotificationType;
      title: string;
      body: string;
      channel?: NotificationChannel;
      extraData?: any;
      fcmToken?: string;
    },
  ) {
    // 1. Persist in-app notification
    const notif = await this.createNotification(userId, {
      type: data.type,
      title: data.title,
      body: data.body,
      channel: data.channel ?? NotificationChannel.IN_APP,
      data: data.extraData,
    });

    // 2. Send FCM push if token is provided
    if (data.fcmToken) {
      await this.sendFcmPush(data.fcmToken, data.title, data.body, {
        notificationId: notif.id,
        type: data.type,
      });
    }

    return notif;
  }

  /**
   * Save FCM token for a patient or psychologist user.
   */
  async saveFcmToken(userId: string, role: string, token: string): Promise<{ success: boolean }> {
    if (role === 'PATIENT') {
      await this.prisma.patient.updateMany({
        where: { userId },
        data: { fcmToken: token },
      });
    } else if (role === 'PSYCHOLOGIST') {
      await this.prisma.psychologist.updateMany({
        where: { userId },
        data: { fcmToken: token },
      });
    }
    this.logger.log(`Updated FCM token for user ${userId} (${role})`);
    return { success: true };
  }

  /**
   * Delete a single notification for a user.
   */
  async deleteNotification(userId: string, id: string): Promise<{ success: boolean }> {
    await this.prisma.notification.deleteMany({
      where: { id, userId },
    });
    return { success: true };
  }

  /**
   * Delete all notifications for a user.
   */
  async deleteAllNotifications(userId: string): Promise<{ success: boolean }> {
    await this.prisma.notification.deleteMany({
      where: { userId },
    });
    return { success: true };
  }
}
