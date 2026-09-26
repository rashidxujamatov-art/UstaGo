import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { Prisma, type OrderStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ChatService, type SystemMessageCode } from '../chat/chat.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { PushType } from '../notifications/push-texts.js';
import { RealtimePublisher } from '../realtime/realtime.publisher.js';
import { SettingsService } from '../settings/settings.service.js';
import { UploadsService } from '../storage/uploads.service.js';
import { acceptQuote } from '../wallet/accept-quote.js';
import { WalletService } from '../wallet/wallet.service.js';
import {
  ACTIVE_STATUSES,
  cancelNeedsReason,
  FINISHED_STATUSES,
  HOLDING_STATUSES,
  ORDER_RULES,
} from './order-state.js';
import { orderInclude, type OrderView, type OrderWithParties, toOrderView } from './order-view.js';
import type { CancelOrderInput, CreateOrderInput, FeedQuery } from './orders.schemas.js';

type Tx = Prisma.TransactionClient;
type ExecutorStep = 'DEPART' | 'ARRIVE' | 'START' | 'FINISH';

const STEP_EFFECTS: Record<
  ExecutorStep,
  {
    stamp: 'departedAt' | 'arrivedAt' | 'startedAt' | 'finishedAt';
    chat: SystemMessageCode;
    push: PushType;
  }
> = {
  DEPART: { stamp: 'departedAt', chat: 'EXECUTOR_EN_ROUTE', push: 'ORDER_EN_ROUTE' },
  ARRIVE: { stamp: 'arrivedAt', chat: 'EXECUTOR_ARRIVED', push: 'ORDER_ARRIVED' },
  START: { stamp: 'startedAt', chat: 'WORK_STARTED', push: 'ORDER_STARTED' },
  FINISH: { stamp: 'finishedAt', chat: 'WORK_FINISHED', push: 'ORDER_FINISHED' },
};

const FEED_LIMIT = 50;

export interface AcceptPreview {
  required: string;
  available: string;
  shortfall: string;
  sufficient: boolean;
  fee: string;
  fee_demo: string;
  fee_real: string;
  fee_bps: number;
}

/** Order lifecycle up to "Ishni tugatdim" (docs/01-biznes-qoidalar.md §3, §4, §5.1). */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly wallet: WalletService,
    private readonly uploads: UploadsService,
    private readonly chat: ChatService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimePublisher,
  ) {}

  // ---------------------------------------------------------------- customer

  /** BY2: posts a job. Blocked while an earlier job waits for the customer's payment (§5.1). */
  async create(userId: string, input: CreateOrderInput): Promise<OrderView> {
    await this.assertActiveMember(userId, 'CUSTOMER');

    const unpaid = await this.prisma.order.findFirst({
      where: { customerId: userId, status: 'DONE_BY_EXECUTOR' },
      select: { number: true },
      orderBy: { finishedAt: 'asc' },
    });
    if (unpaid) {
      throw new AppError(
        ErrorCode.ORDER_CUSTOMER_CONFIRMATION_REQUIRED,
        { order: unpaid.number },
        HttpStatus.CONFLICT,
      );
    }

    const s = await this.settings.getAll();
    if (!s.payment_methods_enabled.includes(input.payment_method)) {
      throw new AppError(ErrorCode.ORDER_PAYMENT_METHOD_DISABLED);
    }
    if (input.photo_keys.length > s.order_photos_max) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, { fields: 'photo_keys' });
    }
    const category = await this.prisma.category.findUnique({
      where: { id: input.category_id },
      select: { active: true },
    });
    if (!category?.active) throw new AppError(ErrorCode.ORDER_CATEGORY_INVALID);

    const timeFrom = new Date(input.time_from);
    const timeTo = new Date(input.time_to);
    if (!(timeFrom < timeTo) || timeTo <= new Date())
      throw new AppError(ErrorCode.ORDER_TIME_INVALID);

    await this.uploads.verify(userId, 'ORDER_PHOTO', input.photo_keys);

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          customerId: userId,
          categoryId: input.category_id,
          title: input.title,
          description: input.description,
          photoKeys: input.photo_keys,
          addressText: input.address.text,
          lat: input.address.lat,
          lng: input.address.lng,
          entrance: input.address.entrance ?? null,
          floor: input.address.floor ?? null,
          apartment: input.address.apartment ?? null,
          landmark: input.address.landmark ?? null,
          timeFrom,
          timeTo,
          price: input.price,
          paymentMethod: input.payment_method,
        },
        select: { id: true },
      });
      await tx.$executeRaw`
        UPDATE orders
        SET location = ST_SetSRID(ST_MakePoint(${input.address.lng}, ${input.address.lat}), 4326)::geography
        WHERE id = ${created.id}::uuid`;
      await tx.orderEvent.create({
        data: { orderId: created.id, fromStatus: null, toStatus: 'PUBLISHED', actorId: userId },
      });
      return tx.order.findUniqueOrThrow({ where: { id: created.id }, include: orderInclude });
    });
    return this.view(order, userId);
  }

  /** BY1 list: all, active or finished. */
  async listForCustomer(
    userId: string,
    scope: 'all' | 'active' | 'finished',
  ): Promise<OrderView[]> {
    const statuses =
      scope === 'active' ? ACTIVE_STATUSES : scope === 'finished' ? FINISHED_STATUSES : null;
    const orders = await this.prisma.order.findMany({
      where: { customerId: userId, ...(statuses ? { status: { in: [...statuses] } } : {}) },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return Promise.all(orders.map((order) => this.view(order, userId)));
  }

  /** BY3 "⋮ → Bekor qilish". A reason is required once a pro took the job (§3.3). */
  async cancel(userId: string, orderId: string, input: CancelOrderInput): Promise<OrderView> {
    const order = await this.findForParty(orderId, userId);
    if (order.customerId !== userId) throw this.notFound();
    const rule = ORDER_RULES.CANCEL;
    if (!rule.from.includes(order.status)) throw this.conflict(order.status);
    if (cancelNeedsReason(order.status) && !input.reason) {
      throw new AppError(ErrorCode.ORDER_CANCEL_REASON_REQUIRED);
    }

    const executorId = order.executorId;
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: orderId, status: order.status },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledBy: userId,
          cancelReason: input.reason ?? null,
          cancelNote: input.note ?? null,
        },
      });
      if (count === 0) throw this.conflict(order.status);
      await this.wallet.releaseHold(tx, orderId);
      await this.event(tx, orderId, order.status, 'CANCELLED', userId, {
        reason: input.reason ?? null,
      });
      await this.chat.system(tx, order, 'ORDER_CANCELLED');
    });

    await this.afterChange(
      orderId,
      'CANCELLED',
      executorId ? { userId: executorId, push: 'ORDER_CANCELLED' } : null,
    );
    return this.get(userId, orderId);
  }

  // ---------------------------------------------------------------- shared

  /** BY3 / BJ2. Parties see their job; anyone may see a published job (the feed is public). */
  async get(userId: string, orderId: string): Promise<OrderView> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: orderInclude,
    });
    const visible =
      order &&
      (order.customerId === userId || order.executorId === userId || order.status === 'PUBLISHED');
    if (!order || !visible) throw this.notFound();
    return this.view(order, userId);
  }

  // ---------------------------------------------------------------- executor

  /** BJ1 "Yangi": open jobs, optionally near the executor and by payment type. */
  async feed(userId: string, query: FeedQuery): Promise<OrderView[]> {
    const s = await this.settings.getAll();
    const point =
      query.lat !== undefined && query.lng !== undefined
        ? Prisma.sql`ST_SetSRID(ST_MakePoint(${query.lng}, ${query.lat}), 4326)::geography`
        : null;
    const conditions: Prisma.Sql[] = [
      Prisma.sql`o.status = 'PUBLISHED'`,
      Prisma.sql`o.customer_id <> ${userId}::uuid`,
      Prisma.sql`o.time_to > now()`,
    ];
    if (point && query.nearby === 'true') {
      conditions.push(Prisma.sql`ST_DWithin(o.location, ${point}, ${s.feed_nearby_radius_m})`);
    }
    if (query.payment === 'cash') {
      conditions.push(Prisma.sql`o.payment_method IN ('CASH', 'XOLIS_QR')`);
    } else if (query.payment === 'online') {
      conditions.push(Prisma.sql`o.payment_method IN ('BALANCE', 'CLICK', 'PAYME', 'CARD')`);
    }
    if (query.category_id) conditions.push(Prisma.sql`o.category_id = ${query.category_id}::uuid`);

    const distance = point
      ? Prisma.sql`ST_Distance(o.location, ${point})`
      : Prisma.sql`NULL::float8`;
    const rows = await this.prisma.$queryRaw<{ id: string; distance: number | null }[]>`
      SELECT o.id, ${distance} AS distance
      FROM orders o
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY o.created_at DESC
      LIMIT ${FEED_LIMIT}`;
    if (rows.length === 0) return [];

    const orders = await this.prisma.order.findMany({
      where: { id: { in: rows.map((row) => row.id) } },
      include: orderInclude,
    });
    const byId = new Map(orders.map((order) => [order.id, order]));
    return Promise.all(
      rows.flatMap((row) => {
        const order = byId.get(row.id);
        return order ? [this.view(order, userId, row.distance)] : [];
      }),
    );
  }

  /** BJ1 "Mening ishlarim" / "Tarix". */
  async listForExecutor(userId: string, scope: 'active' | 'history'): Promise<OrderView[]> {
    const statuses = scope === 'active' ? HOLDING_STATUSES : FINISHED_STATUSES;
    const orders = await this.prisma.order.findMany({
      where: { executorId: userId, status: { in: [...statuses] } },
      include: orderInclude,
      orderBy: { acceptedAt: 'desc' },
      take: 100,
    });
    return Promise.all(orders.map((order) => this.view(order, userId)));
  }

  /** BJ2 bottom line and BJ3 sheet: what taking the job would reserve (§4). */
  async acceptPreview(userId: string, orderId: string): Promise<AcceptPreview> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true, price: true },
    });
    if (!order) throw this.notFound();
    const s = await this.settings.getAll();
    const quote = acceptQuote({
      price: order.price,
      feeBps: s.fee_bps,
      acceptThresholdBps: s.accept_threshold_bps,
      ...(await this.wallet.balances(userId)),
    });
    return {
      required: quote.required.toString(),
      available: quote.available.toString(),
      shortfall: quote.shortfall.toString(),
      sufficient: quote.sufficient,
      fee: quote.fee.toString(),
      fee_demo: quote.feeDemo.toString(),
      fee_real: quote.feeReal.toString(),
      fee_bps: s.fee_bps,
    };
  }

  /**
   * "Buyurtmani qabul qilish" (BJ2). All §4 conditions are checked, then in one transaction
   * with the wallet rows locked: the order is taken by the first executor, the rates are
   * snapshotted and the service fee is held.
   */
  async accept(userId: string, orderId: string): Promise<OrderView> {
    await this.assertCanTakeJobs(userId);

    await this.prisma.$transaction(async (tx) => {
      await this.wallet.lock(tx, userId);
      const [order] = await tx.$queryRaw<
        { status: OrderStatus; customer_id: string; price: bigint }[]
      >`
        SELECT status, customer_id, price FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
      if (!order) throw this.notFound();
      if (order.customer_id === userId) throw new AppError(ErrorCode.ORDER_OWN);
      if (order.status !== 'PUBLISHED') {
        throw new AppError(ErrorCode.ORDER_NOT_AVAILABLE, {}, HttpStatus.CONFLICT);
      }

      const s = await this.settings.getAll(tx);
      const quote = acceptQuote({
        price: order.price,
        feeBps: s.fee_bps,
        acceptThresholdBps: s.accept_threshold_bps,
        ...(await this.wallet.balances(userId, tx)),
      });
      if (!quote.sufficient) {
        throw new AppError(ErrorCode.WALLET_INSUFFICIENT_TO_ACCEPT, {
          shortfall: quote.shortfall,
          required: quote.required,
          available: quote.available,
        });
      }

      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'ACCEPTED',
          executorId: userId,
          acceptedAt: new Date(),
          feeBpsSnapshot: s.fee_bps,
          refL1BpsSnapshot: s.ref_l1_bps,
          refL2BpsSnapshot: s.ref_l2_bps,
          fee: quote.fee,
          feeDemo: quote.feeDemo,
          feeReal: quote.feeReal,
        },
      });
      await this.wallet.placeHold(tx, {
        userId,
        orderId,
        amountDemo: quote.feeDemo,
        amountReal: quote.feeReal,
      });
      await this.event(tx, orderId, 'PUBLISHED', 'ACCEPTED', userId, { fee: quote.fee.toString() });
      await this.chat.system(tx, { id: orderId, executorId: userId }, 'ORDER_ACCEPTED');
    });

    const { customerId } = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { customerId: true },
    });
    await this.afterChange(orderId, 'ACCEPTED', { userId: customerId, push: 'ORDER_ACCEPTED' });
    return this.get(userId, orderId);
  }

  /** The executor withdraws before arriving: the job is published again, the hold released. */
  async decline(userId: string, orderId: string): Promise<OrderView> {
    const order = await this.findForParty(orderId, userId);
    if (order.executorId !== userId) throw this.notFound();
    if (!ORDER_RULES.DECLINE.from.includes(order.status)) throw this.conflict(order.status);

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: orderId, executorId: userId, status: order.status },
        data: {
          status: 'PUBLISHED',
          executorId: null,
          acceptedAt: null,
          departedAt: null,
          feeBpsSnapshot: null,
          refL1BpsSnapshot: null,
          refL2BpsSnapshot: null,
          fee: null,
          feeDemo: null,
          feeReal: null,
        },
      });
      if (count === 0) throw this.conflict(order.status);
      await this.wallet.releaseHold(tx, orderId);
      await this.event(tx, orderId, order.status, 'PUBLISHED', userId, { declined: true });
    });

    await this.afterChange(
      orderId,
      'PUBLISHED',
      { userId: order.customerId, push: 'ORDER_DECLINED' },
      [userId],
    );
    return this.get(userId, orderId);
  }

  /** "Yo'lga chiqdim", "Yetib keldim", "Ishni boshladim", "Ishni tugatdim". */
  async step(
    userId: string,
    orderId: string,
    action: ExecutorStep,
    finishPhotoKeys: string[] = [],
  ): Promise<OrderView> {
    const rule = ORDER_RULES[action];
    const effects = STEP_EFFECTS[action];
    const order = await this.findForParty(orderId, userId);
    if (order.executorId !== userId) throw this.notFound();
    if (!rule.from.includes(order.status)) throw this.conflict(order.status);
    if (action === 'FINISH') await this.uploads.verify(userId, 'FINISH_PHOTO', finishPhotoKeys);

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: orderId, executorId: userId, status: { in: [...rule.from] } },
        data: {
          status: rule.to,
          [effects.stamp]: new Date(),
          ...(action === 'FINISH' ? { finishPhotoKeys } : {}),
        },
      });
      if (count === 0) throw this.conflict(order.status);
      await this.event(tx, orderId, order.status, rule.to, userId);
      await this.chat.system(tx, order, effects.chat);
    });

    await this.afterChange(orderId, rule.to, { userId: order.customerId, push: effects.push });
    return this.get(userId, orderId);
  }

  // ---------------------------------------------------------------- system

  /**
   * Cancels published jobs whose time window has passed (§13, 2026-09-26).
   * Run by the worker; returns how many orders expired.
   */
  async expireOverdue(): Promise<number> {
    const overdue = await this.prisma.order.findMany({
      where: { status: 'PUBLISHED', timeTo: { lt: new Date() } },
      select: { id: true, customerId: true },
      take: 200,
    });
    let expired = 0;
    for (const order of overdue) {
      const changed = await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.order.updateMany({
          where: { id: order.id, status: 'PUBLISHED' },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelledBy: null,
            cancelReason: 'EXPIRED',
          },
        });
        if (count === 1)
          await this.event(tx, order.id, 'PUBLISHED', 'CANCELLED', null, { reason: 'EXPIRED' });
        return count === 1;
      });
      if (changed) {
        expired += 1;
        await this.afterChange(order.id, 'CANCELLED', {
          userId: order.customerId,
          push: 'ORDER_EXPIRED',
        });
      }
    }
    return expired;
  }

  // ---------------------------------------------------------------- checks

  /** Signed-in, verified, not blocked, with the given role active. */
  private async assertActiveMember(userId: string, role: 'CUSTOMER' | 'EXECUTOR') {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        activeRole: true,
        identity: { select: { userId: true } },
        executorProfile: { select: { freePeriodEnd: true, taxStatus: true } },
      },
    });
    if (!user) throw new AppError(ErrorCode.UNAUTHORIZED, {}, HttpStatus.UNAUTHORIZED);
    if (!user.identity)
      throw new AppError(ErrorCode.AUTH_IDENTITY_REQUIRED, {}, HttpStatus.FORBIDDEN);
    if (user.status === 'BLOCKED')
      throw new AppError(ErrorCode.USER_BLOCKED, {}, HttpStatus.FORBIDDEN);
    if (user.activeRole !== role) {
      throw new AppError(ErrorCode.ORDER_ROLE_REQUIRED, { role }, HttpStatus.FORBIDDEN);
    }
    return user;
  }

  /** §4 conditions that do not depend on the order itself. */
  private async assertCanTakeJobs(userId: string): Promise<void> {
    const user = await this.assertActiveMember(userId, 'EXECUTOR');

    const unconfirmed = await this.prisma.order.findFirst({
      where: {
        executorId: userId,
        paymentMethod: { in: ['CASH', 'XOLIS_QR'] },
        status: { in: ['DONE_BY_EXECUTOR', 'COMPLETED'] },
        executorReceivedAt: null,
      },
      select: { number: true },
      orderBy: { finishedAt: 'asc' },
    });
    if (unconfirmed) {
      throw new AppError(
        ErrorCode.ORDER_EXECUTOR_CONFIRMATION_REQUIRED,
        { order: unconfirmed.number },
        HttpStatus.CONFLICT,
      );
    }

    const profile = user.executorProfile;
    const freePeriodOver = !profile || profile.freePeriodEnd <= new Date();
    if (freePeriodOver && profile?.taxStatus !== 'VERIFIED') {
      throw new AppError(ErrorCode.TAX_METHOD_REQUIRED, {}, HttpStatus.FORBIDDEN);
    }
  }

  // ---------------------------------------------------------------- helpers

  private async findForParty(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, number: true, status: true, customerId: true, executorId: true },
    });
    if (!order || (order.customerId !== userId && order.executorId !== userId))
      throw this.notFound();
    return order;
  }

  private event(
    tx: Tx,
    orderId: string,
    fromStatus: OrderStatus | null,
    toStatus: OrderStatus,
    actorId: string | null,
    payload?: Prisma.InputJsonValue,
  ) {
    return tx.orderEvent.create({ data: { orderId, fromStatus, toStatus, actorId, payload } });
  }

  /** Real-time update to both parties (plus anyone in `alsoNotify`) and a push to one of them. */
  private async afterChange(
    orderId: string,
    status: OrderStatus,
    push: { userId: string; push: PushType } | null,
    alsoNotify: string[] = [],
  ): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { number: true, customerId: true, executorId: true },
    });
    if (!order) return;
    this.realtime.toUsers([order.customerId, order.executorId, ...alsoNotify], 'order.status', {
      order_id: orderId,
      number: order.number,
      status,
    });
    if (push) {
      await this.notifications.notify(push.userId, {
        type: push.push,
        orderId,
        orderNumber: order.number,
      });
    }
  }

  private async view(order: OrderWithParties, userId: string, distanceM?: number | null) {
    return toOrderView(
      order,
      { userId },
      {
        photoUrls: await this.uploads.viewUrls(order.photoKeys),
        finishPhotoUrls: await this.uploads.viewUrls(order.finishPhotoKeys),
        distanceM: distanceM === null || distanceM === undefined ? null : Math.round(distanceM),
      },
    );
  }

  private notFound() {
    return new AppError(ErrorCode.NOT_FOUND, {}, HttpStatus.NOT_FOUND);
  }

  private conflict(status: OrderStatus) {
    return new AppError(ErrorCode.ORDER_STATUS_CONFLICT, { status }, HttpStatus.CONFLICT);
  }
}
