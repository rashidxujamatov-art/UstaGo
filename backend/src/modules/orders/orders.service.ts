import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { formatSom } from '../../common/money/money.js';
import { Prisma, type OrderStatus, type PaymentMethod } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ChatService, type SystemMessageCode } from '../chat/chat.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { PushType } from '../notifications/push-texts.js';
import { RealtimePublisher } from '../realtime/realtime.publisher.js';
import { SettingsService } from '../settings/settings.service.js';
import { UploadsService } from '../storage/uploads.service.js';
import { acceptQuote } from '../wallet/accept-quote.js';
import { effectiveStatus } from '../tax/tax.service.js';
import { TripsService } from '../trips/trips.service.js';
import { SettlementService } from '../wallet/settlement.service.js';
import { type WalletBalances, WalletService } from '../wallet/wallet.service.js';
import {
  ACTIVE_STATUSES,
  ADMIN_CANCELLABLE_STATUSES,
  cancelNeedsReason,
  FINISHED_STATUSES,
  HOLDING_STATUSES,
  ORDER_RULES,
  PARTY_CONFIRMED_METHODS,
} from './order-state.js';
import {
  orderInclude,
  type OrderView,
  type OrderWithParties,
  toAdminOrderView,
  toOrderView,
} from './order-view.js';
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

/** An online payment that committed; notifyOnlinePaid() sends the updates. */
export interface OnlinePaid {
  orderId: string;
  executorId: string;
  customerId: string;
  fee: bigint;
}

/** Balances as the §4 acceptance check sees them: only demo that still counts. */
function quoteBalances(b: WalletBalances) {
  return { real: b.real, demo: b.demoActive, heldDemo: b.heldDemo, heldReal: b.heldReal };
}

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

/** Order lifecycle and its payment confirmation (docs/01-biznes-qoidalar.md §3, §4, §5). */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly wallet: WalletService,
    private readonly settlement: SettlementService,
    private readonly uploads: UploadsService,
    private readonly chat: ChatService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimePublisher,
    private readonly trips: TripsService,
  ) {}

  // ---------------------------------------------------------------- customer

  /** BY2: posts a job. Blocked while an earlier job waits for the customer's payment (§5.1). */
  async create(userId: string, input: CreateOrderInput): Promise<OrderView> {
    await this.assertActiveMember(userId, 'CUSTOMER');

    const unpaid = await this.prisma.order.findFirst({
      where: { customerId: userId, status: 'DONE_BY_EXECUTOR' },
      select: { id: true, number: true },
      orderBy: { finishedAt: 'asc' },
    });
    if (unpaid) {
      throw new AppError(
        ErrorCode.ORDER_CUSTOMER_CONFIRMATION_REQUIRED,
        { order: unpaid.number, order_id: unpaid.id },
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
    const endedTrip = await this.prisma.$transaction(async (tx) => {
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
      return this.trips.endTripInTx(tx, orderId, 'CANCELLED');
    });
    await this.trips.notifyTripEnded(orderId, 'CANCELLED', endedTrip);

    await this.afterChange(
      orderId,
      'CANCELLED',
      executorId ? { userId: executorId, push: 'ORDER_CANCELLED' } : null,
    );
    return this.get(userId, orderId);
  }

  /**
   * Orders moderation (`orders.moderate`, stage 7): an admin cancels any order that is not
   * `DISPUTED` (that has its own resolution flow) and not already terminal. Reason is always
   * required — this is an exceptional, non-customer-initiated cancel.
   */
  async adminCancel(adminId: string, orderId: string, reason: string): Promise<OrderView> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, number: true, status: true, customerId: true, executorId: true },
    });
    if (!order) throw this.notFound();
    if (!ADMIN_CANCELLABLE_STATUSES.includes(order.status)) {
      throw new AppError(ErrorCode.ORDER_MODERATE_NOT_CANCELLABLE, { status: order.status });
    }

    const endedTrip = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: orderId, status: order.status },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledBy: null,
          cancelReason: 'ADMIN',
          cancelNote: reason,
        },
      });
      if (count === 0) throw this.conflict(order.status);
      await this.wallet.releaseHold(tx, orderId);
      await this.event(tx, orderId, order.status, 'CANCELLED', adminId, { reason, admin: true });
      await this.chat.system(tx, order, 'ORDER_CANCELLED');
      return this.trips.endTripInTx(tx, orderId, 'CANCELLED');
    });
    await this.trips.notifyTripEnded(orderId, 'CANCELLED', endedTrip);

    // Neither party initiated this one — both get a push, unlike the customer's own cancel.
    await this.afterChange(orderId, 'CANCELLED', null);
    for (const recipient of [order.customerId, order.executorId]) {
      if (recipient) {
        await this.notifications.notify(recipient, {
          type: 'ORDER_CANCELLED',
          orderId,
          orderNumber: order.number,
        });
      }
    }
    // Not `this.get()`: the admin is neither party, and the order is no longer PUBLISHED, so
    // that visibility check would (wrongly) 404 an admin looking at the order they just acted on.
    const cancelled = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: orderInclude,
    });
    return toAdminOrderView(cancelled);
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
      ...quoteBalances(await this.wallet.balances(userId)),
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
        ...quoteBalances(await this.wallet.balances(userId, tx)),
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

    const endedTrip = await this.prisma.$transaction(async (tx) => {
      // Ends the trip while the order still names its executor: the update below clears
      // executorId, and the pro who just declined still needs the trip.ended event.
      const ended = await this.trips.endTripInTx(tx, orderId, 'DECLINED');
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
      return ended;
    });
    await this.trips.notifyTripEnded(orderId, 'DECLINED', endedTrip);

    await this.afterChange(
      orderId,
      'PUBLISHED',
      { userId: order.customerId, push: 'ORDER_DECLINED' },
      [userId],
    );
    return this.get(userId, orderId);
  }

  /**
   * "Yo'lga chiqdim", "Yetib keldim", "Ishni boshladim", "Ishni tugatdim". `depart` starts
   * a trip when the pro opted to share their location (§10); `arrive` ends it (ARRIVED).
   */
  async step(
    userId: string,
    orderId: string,
    action: ExecutorStep,
    finishPhotoKeys: string[] = [],
    depart?: { shareLocation: boolean; sessionId: string },
  ): Promise<OrderView> {
    const rule = ORDER_RULES[action];
    const effects = STEP_EFFECTS[action];
    const order = await this.findForParty(orderId, userId);
    if (order.executorId !== userId) throw this.notFound();
    if (!rule.from.includes(order.status)) throw this.conflict(order.status);
    if (action === 'FINISH') await this.uploads.verify(userId, 'FINISH_PHOTO', finishPhotoKeys);

    const endedTrip = await this.prisma.$transaction(async (tx) => {
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
      if (action === 'DEPART' && depart?.shareLocation) {
        await this.trips.startTrip(tx, { id: orderId }, userId, depart.sessionId);
      }
      return action === 'ARRIVE' ? this.trips.endTripInTx(tx, orderId, 'ARRIVED') : null;
    });
    if (action === 'ARRIVE') await this.trips.notifyTripEnded(orderId, 'ARRIVED', endedTrip);

    await this.afterChange(orderId, rule.to, { userId: order.customerId, push: effects.push });
    return this.get(userId, orderId);
  }

  // ---------------------------------------------------------------- payment (§5.1)

  /** BY9 "To'ladim": the customer says they paid cash or to the pro's Xolis QR. */
  async customerPaid(
    userId: string,
    orderId: string,
    via: 'CASH' | 'XOLIS_QR' = 'CASH',
  ): Promise<OrderView> {
    const order = await this.findForParty(orderId, userId);
    if (order.customerId !== userId) throw this.notFound();
    this.assertPartyConfirmed(order.paymentMethod);
    const rule = ORDER_RULES.CUSTOMER_PAID;
    if (!rule.from.includes(order.status)) throw this.conflict(order.status);
    // A cash job may be paid to the pro's Paynet Xolis QR instead (stage 5 decision).
    if (via === 'XOLIS_QR' && !(await this.xolisQrFor(order.executorId))) {
      throw new AppError(ErrorCode.XOLIS_NOT_AVAILABLE, {}, HttpStatus.CONFLICT);
    }

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: orderId, status: order.status },
        data: {
          status: rule.to,
          customerPaidAt: new Date(),
          ...(via === 'XOLIS_QR' ? { paymentMethod: 'XOLIS_QR' as const } : {}),
        },
      });
      if (count === 0) throw this.conflict(order.status);
      await this.event(tx, orderId, order.status, rule.to, userId);
      await this.chat.system(tx, order, 'CUSTOMER_PAID');
    });

    await this.afterChange(
      orderId,
      rule.to,
      order.executorId ? { userId: order.executorId, push: 'PAYMENT_CUSTOMER_PAID' } : null,
    );
    return this.get(userId, orderId);
  }

  /**
   * BJ13 "Pulni qabul qildim": closes a cash / Xolis job and settles it — the fee held at
   * acceptance is charged and the referral paid (§5 steps 3–4). Allowed before the
   * customer's "To'ladim" too; that also lifts the customer's block.
   */
  async paymentReceived(userId: string, orderId: string): Promise<OrderView> {
    const order = await this.findForParty(orderId, userId);
    if (order.executorId !== userId) throw this.notFound();
    this.assertPartyConfirmed(order.paymentMethod);
    const rule = ORDER_RULES.PAYMENT_RECEIVED;
    if (!rule.from.includes(order.status)) throw this.conflict(order.status);

    const fee = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockForPayment(tx, orderId, rule.from);
      const now = new Date();
      await tx.order.update({
        where: { id: orderId },
        data: { status: rule.to, executorReceivedAt: now, paidAt: now },
      });
      const settled = await this.settlement.settle(tx, locked, userId);
      await this.event(tx, orderId, locked.status, rule.to, userId, {
        fee: settled.fee.toString(),
      });
      await this.chat.system(tx, order, 'PAYMENT_RECEIVED');
      return settled.fee;
    });

    await this.afterChange(orderId, rule.to, { userId, push: 'ORDER_PAID_FEE', params: { fee } });
    await this.notifyPaid(orderId, order.customerId);
    return this.get(userId, orderId);
  }

  /**
   * Online payment confirmed (provider callback, card or balance payment): the price goes
   * to the executor and the job is settled (§5 steps 1–4). Returns false when the order
   * was already paid, so a repeated callback changes nothing.
   */
  async settleOnlinePayment(orderId: string, actorId: string | null = null): Promise<boolean> {
    const paid = await this.prisma.$transaction((tx) =>
      this.settleOnlineInTx(tx, orderId, actorId),
    );
    if (!paid) return false;
    await this.notifyOnlinePaid(paid);
    return true;
  }

  /**
   * The settlement part of an online payment inside the caller's transaction, so a
   * provider transaction and the money it moves commit together. Null when already paid;
   * ORDER_STATUS_CONFLICT when the order cannot be paid online now.
   */
  async settleOnlineInTx(
    tx: Tx,
    orderId: string,
    actorId: string | null,
  ): Promise<OnlinePaid | null> {
    const rule = ORDER_RULES.ONLINE_PAID;
    const [row] = await tx.$queryRaw<{ status: OrderStatus }[]>`
      SELECT status FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
    if (!row) throw this.notFound();
    if (row.status === 'PAID') return null;
    const locked = await this.lockForPayment(tx, orderId, rule.from);
    if (PARTY_CONFIRMED_METHODS.includes(locked.paymentMethod)) throw this.conflict(row.status);
    await tx.order.update({
      where: { id: orderId },
      data: { status: rule.to, paidAt: new Date() },
    });
    const settled = await this.settlement.settle(tx, locked, actorId);
    await this.event(tx, orderId, locked.status, rule.to, actorId, { fee: settled.fee.toString() });
    await this.chat.system(tx, { id: orderId, executorId: locked.executorId }, 'ORDER_PAID');
    return {
      orderId,
      executorId: locked.executorId,
      customerId: locked.customerId,
      fee: settled.fee,
    };
  }

  /** Real-time updates and pushes once an online payment has committed. */
  async notifyOnlinePaid(paid: OnlinePaid): Promise<void> {
    await this.afterChange(paid.orderId, 'PAID', {
      userId: paid.executorId,
      push: 'ORDER_PAID_FEE',
      params: { fee: paid.fee },
    });
    await this.notifyPaid(paid.orderId, paid.customerId);
  }

  /** BY5 "Hisobdan o‘tkazish": a BALANCE order paid from the customer's REAL account. */
  async payFromBalance(userId: string, orderId: string): Promise<OrderView> {
    const order = await this.findForParty(orderId, userId);
    if (order.customerId !== userId) throw this.notFound();
    if (order.paymentMethod !== 'BALANCE') {
      throw new AppError(
        ErrorCode.ORDER_PAYMENT_METHOD_MISMATCH,
        { method: order.paymentMethod },
        HttpStatus.CONFLICT,
      );
    }
    await this.settleOnlinePayment(orderId, userId);
    return this.get(userId, orderId);
  }

  /** Who may pay an order online and how much (BY5, the BJ4 QR, provider callbacks). */
  async payableOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        number: true,
        status: true,
        price: true,
        paymentMethod: true,
        customerId: true,
        executorId: true,
      },
    });
    if (!order) throw this.notFound();
    return {
      ...order,
      payable: ORDER_RULES.ONLINE_PAID.from.includes(order.status),
    };
  }

  /**
   * "Pul kelmadi" (executor) or "Muammo bor" (customer) → DISPUTED. The admin decides
   * (stage 7); meanwhile the hold stays and both §5.1 blocks for this order are lifted.
   */
  async dispute(userId: string, orderId: string, note?: string): Promise<OrderView> {
    const order = await this.findForParty(orderId, userId);
    const rule = ORDER_RULES.DISPUTE;
    if (!rule.from.includes(order.status)) throw this.conflict(order.status);

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: orderId, status: order.status },
        data: {
          status: rule.to,
          disputedAt: new Date(),
          disputedBy: userId,
          disputeNote: note ?? null,
          // A fresh dispute cycle starts clean (stage 7): an earlier resolution on this same
          // order (e.g. a reopened online job disputed again) must not carry over.
          disputeDecision: null,
          disputeDecisionNote: null,
          disputeDecidedBy: null,
          disputeDecidedAt: null,
          disputeApproval: 'NONE',
          disputeApprovedBy: null,
          disputeApprovedAt: null,
          disputeRejectReason: null,
          disputeOriginalPrice: null,
          disputeExecutedAt: null,
        },
      });
      if (count === 0) throw this.conflict(order.status);
      await this.event(tx, orderId, order.status, rule.to, userId, { note: note ?? null });
      await this.chat.system(tx, order, 'DISPUTE_OPENED');
    });

    const other = userId === order.customerId ? order.executorId : order.customerId;
    await this.afterChange(
      orderId,
      rule.to,
      other ? { userId: other, push: 'ORDER_DISPUTED' } : null,
    );
    return this.get(userId, orderId);
  }

  /**
   * §5.1 reminders: `confirm_reminder_hours` (2, 24) after the job was reported done, the
   * customer is reminded to press "To'ladim"; after the customer's "To'ladim", the
   * executor to press "Pulni qabul qildim". Each mark is pushed once. Run by the worker.
   */
  async sendPaymentReminders(now = new Date()): Promise<number> {
    const { confirm_reminder_hours: marks } = await this.settings.getAll();
    const hoursSince = (date: Date | null) =>
      date ? Math.floor((now.getTime() - date.getTime()) / 3_600_000) : -1;
    const earliest = new Date(now.getTime() - Math.min(...marks) * 3_600_000);

    const waiting = await this.prisma.order.findMany({
      where: {
        OR: [
          { status: 'DONE_BY_EXECUTOR', finishedAt: { lte: earliest } },
          {
            status: 'COMPLETED',
            paymentMethod: { in: [...PARTY_CONFIRMED_METHODS] },
            customerPaidAt: { lte: earliest },
          },
        ],
      },
      select: {
        id: true,
        number: true,
        status: true,
        customerId: true,
        executorId: true,
        finishedAt: true,
        customerPaidAt: true,
        customerReminded: true,
        executorReminded: true,
      },
      take: 500,
    });

    let sent = 0;
    for (const order of waiting) {
      const forCustomer = order.status === 'DONE_BY_EXECUTOR';
      const since = hoursSince(forCustomer ? order.finishedAt : order.customerPaidAt);
      const done = forCustomer ? order.customerReminded : order.executorReminded;
      const due = marks.filter((mark) => since >= mark && !done.includes(mark));
      const recipient = forCustomer ? order.customerId : order.executorId;
      if (due.length === 0 || !recipient) continue;

      const field = forCustomer ? 'customerReminded' : 'executorReminded';
      const { count } = await this.prisma.order.updateMany({
        where: { id: order.id, status: order.status, [field]: { equals: done } },
        data: { [field]: [...done, ...due] },
      });
      if (count === 0) continue;
      await this.notifications.notify(recipient, {
        type: forCustomer ? 'REMIND_CUSTOMER_PAY' : 'REMIND_EXECUTOR_RECEIVED',
        orderId: order.id,
        orderNumber: order.number,
      });
      sent += 1;
    }
    return sent;
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
        executorProfile: {
          select: { freePeriodEnd: true, taxStatus: true, taxValidUntil: true },
        },
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
      select: { id: true, number: true },
      orderBy: { finishedAt: 'asc' },
    });
    if (unconfirmed) {
      throw new AppError(
        ErrorCode.ORDER_EXECUTOR_CONFIRMATION_REQUIRED,
        { order: unconfirmed.number, order_id: unconfirmed.id },
        HttpStatus.CONFLICT,
      );
    }

    const profile = user.executorProfile;
    const now = new Date();
    const freePeriodOver = !profile || profile.freePeriodEnd <= now;
    if (freePeriodOver && (!profile || effectiveStatus(profile, now) !== 'VERIFIED')) {
      throw new AppError(ErrorCode.TAX_METHOD_REQUIRED, {}, HttpStatus.FORBIDDEN);
    }
  }

  /** The executor's Xolis QR when they are verified on Paynet Xolis and Xolis is enabled. */
  private async xolisQrFor(executorId: string | null): Promise<string | null> {
    if (!executorId) return null;
    const [profile, s] = await Promise.all([
      this.prisma.executorProfile.findUnique({
        where: { userId: executorId },
        select: { taxMethod: true, taxStatus: true, taxValidUntil: true, xolisQr: true },
      }),
      this.settings.getAll(),
    ]);
    const ok =
      profile?.taxMethod === 'XOLIS' &&
      effectiveStatus(profile, new Date()) === 'VERIFIED' &&
      s.payment_methods_enabled.includes('XOLIS_QR');
    return ok ? (profile.xolisQr ?? null) : null;
  }

  private assertPartyConfirmed(method: PaymentMethod): void {
    if (!PARTY_CONFIRMED_METHODS.includes(method)) {
      throw new AppError(ErrorCode.ORDER_PAYMENT_METHOD_MISMATCH, { method }, HttpStatus.CONFLICT);
    }
  }

  // ---------------------------------------------------------------- helpers

  /** Locks the order row and returns what settlement needs; checks the status again. */
  private async lockForPayment(tx: Tx, orderId: string, from: readonly OrderStatus[]) {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        price: true,
        paymentMethod: true,
        customerId: true,
        executorId: true,
        fee: true,
        feeDemo: true,
        feeReal: true,
        feeBpsSnapshot: true,
        refL1BpsSnapshot: true,
        refL2BpsSnapshot: true,
      },
    });
    if (!from.includes(order.status) || !order.executorId) throw this.conflict(order.status);
    return { ...order, executorId: order.executorId };
  }

  /** Tells the customer the job is closed. */
  private async notifyPaid(orderId: string, customerId: string): Promise<void> {
    const { number } = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { number: true },
    });
    await this.notifications.notify(customerId, {
      type: 'ORDER_PAID',
      orderId,
      orderNumber: number,
    });
  }

  private async findForParty(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        number: true,
        status: true,
        paymentMethod: true,
        customerId: true,
        executorId: true,
      },
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
    push: { userId: string; push: PushType; params?: { fee: bigint } } | null,
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
        ...(push.params ? { params: { fee: formatSom(push.params.fee) } } : {}),
      });
    }
  }

  private async view(order: OrderWithParties, userId: string, distanceM?: number | null) {
    const xolisQr =
      order.customerId === userId &&
      order.paymentMethod === 'CASH' &&
      order.status === 'DONE_BY_EXECUTOR'
        ? await this.xolisQrFor(order.executorId)
        : null;
    return toOrderView(
      order,
      { userId },
      {
        xolisQr,
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
