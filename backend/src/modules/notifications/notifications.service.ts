import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Language } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RealtimePublisher } from '../realtime/realtime.publisher.js';
import { type PushParams, type PushType, pushText } from './push-texts.js';

export interface PushMessage {
  token: string;
  body: string;
  data: Record<string, string>;
}

/** Push adapter (docs/02-arxitektura.md §9): FCM in production, a recording mock locally. */
export interface PushProvider {
  send(messages: PushMessage[]): Promise<void>;
}

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

export class MockPushProvider implements PushProvider {
  private readonly logger = new Logger('MockPush');
  readonly sent: PushMessage[] = [];

  send(messages: PushMessage[]): Promise<void> {
    this.sent.push(...messages);
    for (const message of messages) this.logger.debug(`push: ${message.body}`);
    return Promise.resolve();
  }
}

export interface Notification {
  type: PushType;
  /** Set for order events; the app opens the order when the push is tapped. */
  orderId?: string;
  orderNumber?: number;
  /** Other text parameters ({fee}, {days}). */
  params?: PushParams;
}

/**
 * Tells a user about an order event: an in-app event over Socket.IO and a push to each
 * of their devices. Failures are logged and never break the action that caused them.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimePublisher,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
  ) {}

  async notify(userId: string, notification: Notification): Promise<void> {
    const data: Record<string, string> = { type: notification.type };
    if (notification.orderId) data.order_id = notification.orderId;
    if (notification.orderNumber !== undefined)
      data.order_number = String(notification.orderNumber);
    this.realtime.toUsers([userId], 'notification', data);

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          lang: true,
          devices: { where: { pushToken: { not: null } }, select: { pushToken: true } },
        },
      });
      if (!user || user.devices.length === 0) return;
      const body = pushText(notification.type, user.lang, {
        ...notification.params,
        ...(notification.orderNumber !== undefined ? { order: notification.orderNumber } : {}),
      });
      await this.push.send(
        user.devices.map((device) => ({ token: device.pushToken as string, body, data })),
      );
    } catch (error) {
      this.logger.warn(`Push failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Broadcast (stage 7, AD1 "Bildirishnoma"): admin-authored text in all four languages,
   * not a `PushType` from the fixed catalog above. Used only by `notifications.broadcast`.
   */
  async notifyCustom(
    userId: string,
    text: Record<Language, string>,
    data: Record<string, string>,
  ): Promise<void> {
    this.realtime.toUsers([userId], 'notification', data);
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          lang: true,
          devices: { where: { pushToken: { not: null } }, select: { pushToken: true } },
        },
      });
      if (!user || user.devices.length === 0) return;
      const body = text[user.lang];
      await this.push.send(
        user.devices.map((device) => ({ token: device.pushToken as string, body, data })),
      );
    } catch (error) {
      this.logger.warn(`Push failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
