import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { Message, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RealtimePublisher } from '../realtime/realtime.publisher.js';
import { UploadsService } from '../storage/uploads.service.js';
import { CHAT_OPEN_STATUSES } from '../orders/order-state.js';

/** Status notes shown in the chat; the app renders them in the reader's language. */
export type SystemMessageCode =
  | 'ORDER_ACCEPTED'
  | 'EXECUTOR_EN_ROUTE'
  | 'EXECUTOR_ARRIVED'
  | 'WORK_STARTED'
  | 'WORK_FINISHED'
  | 'ORDER_CANCELLED'
  | 'CUSTOMER_PAID'
  | 'PAYMENT_RECEIVED'
  | 'ORDER_PAID'
  | 'DISPUTE_OPENED';

export interface MessageView {
  id: string;
  kind: 'TEXT' | 'PHOTO' | 'SYSTEM';
  text: string | null;
  photo_url: string | null;
  system_code: string | null;
  from_me: boolean;
  created_at: string;
  read_at: string | null;
}

const PAGE_SIZE = 50;

/**
 * Order chat (BY4, docs/01-biznes-qoidalar.md §3.4): only the customer and the current
 * executor, only after acceptance. A new executor does not see an earlier executor's chat.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly realtime: RealtimePublisher,
    private readonly notifications: NotificationsService,
  ) {}

  async list(userId: string, orderId: string, before?: string): Promise<MessageView[]> {
    const order = await this.partyOrder(userId, orderId);
    const cursor = before
      ? await this.prisma.message.findFirst({
          where: { id: before, orderId },
          select: { createdAt: true },
        })
      : null;
    const messages = await this.prisma.message.findMany({
      where: {
        orderId,
        executorId: order.executorId,
        ...(cursor ? { createdAt: { lt: cursor.createdAt } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
    });
    return Promise.all(messages.reverse().map((message) => this.view(message, userId)));
  }

  async send(
    userId: string,
    orderId: string,
    input: { text?: string; photo_key?: string },
  ): Promise<MessageView> {
    const order = await this.partyOrder(userId, orderId);
    if (!CHAT_OPEN_STATUSES.includes(order.status)) {
      throw new AppError(ErrorCode.CHAT_NOT_AVAILABLE, {}, HttpStatus.CONFLICT);
    }
    if (input.photo_key) await this.uploads.verify(userId, 'CHAT_PHOTO', [input.photo_key]);

    const message = await this.prisma.message.create({
      data: {
        orderId,
        executorId: order.executorId,
        senderId: userId,
        kind: input.photo_key ? 'PHOTO' : 'TEXT',
        text: input.text ?? null,
        photoKey: input.photo_key ?? null,
      },
    });

    const recipient = userId === order.customerId ? order.executorId : order.customerId;
    this.realtime.toUsers([recipient], 'chat.message', {
      order_id: orderId,
      message: await this.view(message, recipient),
    });
    await this.notifications.notify(recipient, {
      type: 'CHAT_MESSAGE',
      orderId,
      orderNumber: order.number,
    });
    return this.view(message, userId);
  }

  /** Marks the other party's messages as read (double tick on BY4). */
  async markRead(userId: string, orderId: string): Promise<void> {
    const order = await this.partyOrder(userId, orderId);
    const { count } = await this.prisma.message.updateMany({
      where: {
        orderId,
        executorId: order.executorId,
        senderId: { not: userId },
        kind: { not: 'SYSTEM' },
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    if (count > 0) {
      const other = userId === order.customerId ? order.executorId : order.customerId;
      this.realtime.toUsers([other], 'chat.read', { order_id: orderId });
    }
  }

  /** Status note written in the same transaction as the status change. */
  async system(
    tx: Prisma.TransactionClient,
    order: { id: string; executorId: string | null },
    code: SystemMessageCode,
  ): Promise<void> {
    if (!order.executorId) return;
    await tx.message.create({
      data: { orderId: order.id, executorId: order.executorId, kind: 'SYSTEM', systemCode: code },
    });
  }

  private async partyOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, number: true, status: true, customerId: true, executorId: true },
    });
    const isParty = order && (order.customerId === userId || order.executorId === userId);
    if (!order || !isParty || !order.executorId) {
      throw new AppError(ErrorCode.NOT_FOUND, {}, HttpStatus.NOT_FOUND);
    }
    return { ...order, executorId: order.executorId };
  }

  private async view(message: Message, viewerId: string): Promise<MessageView> {
    return {
      id: message.id,
      kind: message.kind,
      text: message.text,
      photo_url: message.photoKey ? await this.uploads.viewUrl(message.photoKey) : null,
      system_code: message.systemCode,
      from_me: message.senderId === viewerId,
      created_at: message.createdAt.toISOString(),
      read_at: message.readAt?.toISOString() ?? null,
    };
  }
}
