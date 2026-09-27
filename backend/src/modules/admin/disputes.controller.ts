import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { Auth, type AuthContext } from '../../common/auth/auth.decorators.js';
import { RequireStaff } from '../../common/auth/staff.guard.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { formatSom } from '../../common/money/money.js';
import { ZodPipe } from '../../common/validation/zod-body.pipe.js';
import type { DisputeDecision, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { partialDisputeQuote } from '../orders/dispute-partial.js';
import { orderInclude, toAdminOrderView } from '../orders/order-view.js';
import { RealtimePublisher } from '../realtime/realtime.publisher.js';
import { SettingsService } from '../settings/settings.service.js';
import { SettlementService } from '../wallet/settlement.service.js';
import { TripsService } from '../trips/trips.service.js';
import { WalletService } from '../wallet/wallet.service.js';

type Tx = Prisma.TransactionClient;
const uuid = new ParseUUIDPipe();
const PAGE = 30;
const ONLINE_METHODS = new Set(['BALANCE', 'CLICK', 'PAYME', 'CARD']);

const listQuery = z.object({
  status: z.enum(['OPEN', 'DECIDED']).optional(),
  before: z.uuid().optional(),
});
const decideSchema = z.object({
  decision: z.enum(['FULL', 'PARTIAL', 'CANCEL']),
  note: z.string().trim().max(1000).optional(),
});
const rejectSchema = z.object({ reason: z.string().trim().min(1).max(500) });

/** AD3 / SA "Shikoyat" (disputes.resolve, super admin approval — stage 7 decision of
 * 2026-09-27: pre-payment only, no refunds). */
@Injectable()
export class DisputesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly wallet: WalletService,
    private readonly settlement: SettlementService,
    private readonly trips: TripsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async list(query: z.output<typeof listQuery>) {
    const where: Prisma.OrderWhereInput =
      query.status === 'DECIDED'
        ? { status: 'DISPUTED', disputeDecision: { not: null } }
        : query.status === 'OPEN'
          ? { status: 'DISPUTED', disputeDecision: null }
          : { status: 'DISPUTED' };
    if (query.before) where.id = { lt: query.before };
    const rows = await this.prisma.order.findMany({
      where,
      orderBy: { id: 'desc' },
      take: PAGE + 1,
      select: {
        id: true,
        number: true,
        paymentMethod: true,
        price: true,
        disputedAt: true,
        disputedBy: true,
        customerId: true,
        disputeDecision: true,
        disputeApproval: true,
      },
    });
    const page = rows.slice(0, PAGE);
    return {
      items: page.map((row) => ({
        id: row.id,
        number: row.number,
        payment_method: row.paymentMethod,
        price: row.price.toString(),
        disputed_at: row.disputedAt?.toISOString() ?? null,
        disputed_by: row.disputedBy === row.customerId ? 'CUSTOMER' : 'EXECUTOR',
        decision: row.disputeDecision,
        approval: row.disputeApproval,
      })),
      next: rows.length > PAGE ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async detail(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: orderInclude,
    });
    if (!order) throw new AppError(ErrorCode.ORDER_NOT_FOUND, {}, HttpStatus.NOT_FOUND);
    const view = toAdminOrderView(order);
    return {
      order: view,
      dispute: {
        opened_by: order.disputedBy === order.customerId ? 'CUSTOMER' : 'EXECUTOR',
        note: order.disputeNote,
        opened_at: order.disputedAt?.toISOString() ?? null,
        customer_paid_at: order.customerPaidAt?.toISOString() ?? null,
        executor_received_at: order.executorReceivedAt?.toISOString() ?? null,
        payment_hold_active: order.status === 'DISPUTED',
        decision: order.disputeDecision,
        decision_note: order.disputeDecisionNote,
        decided_by: order.disputeDecidedBy,
        decided_at: order.disputeDecidedAt?.toISOString() ?? null,
        approval: order.disputeApproval,
        approved_by: order.disputeApprovedBy,
        rejected_reason: order.disputeRejectReason,
        original_price: order.disputeOriginalPrice?.toString() ?? null,
      },
    };
  }

  /** §10 "Saqlash": only through this endpoint, audited on every read. */
  async track(adminId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true },
    });
    if (!order) throw new AppError(ErrorCode.ORDER_NOT_FOUND, {}, HttpStatus.NOT_FOUND);
    const track = await this.trips.adminTrack(orderId);
    await this.audit.log({
      actorId: adminId,
      actorType: 'USER',
      action: 'dispute.track_view',
      entityType: 'order',
      entityId: orderId,
    });
    return track;
  }

  /** `disputes.resolve` proposes; a super admin proposing directly executes at once (§1.4). */
  async decide(
    adminId: string,
    orderId: string,
    decision: DisputeDecision,
    note: string | undefined,
  ) {
    const isSuperAdmin = await this.callerIsSuperAdmin(adminId);
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError(ErrorCode.ORDER_NOT_FOUND, {}, HttpStatus.NOT_FOUND);
    if (order.status !== 'DISPUTED')
      throw new AppError(ErrorCode.DISPUTE_NOT_DISPUTED, {}, HttpStatus.CONFLICT);
    if (order.disputeDecision !== null) {
      throw new AppError(ErrorCode.DISPUTE_ALREADY_DECIDED, {}, HttpStatus.CONFLICT);
    }
    if (decision === 'PARTIAL' && !ONLINE_METHODS.has(order.paymentMethod)) {
      throw new AppError(ErrorCode.DISPUTE_DECISION_NOT_ALLOWED, {}, HttpStatus.CONFLICT);
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
      const { count } = await tx.order.updateMany({
        where: { id: orderId, status: 'DISPUTED', disputeDecision: null },
        data: {
          disputeDecision: decision,
          disputeDecisionNote: note ?? null,
          disputeDecidedBy: adminId,
          disputeDecidedAt: now,
          ...(decision === 'FULL' || isSuperAdmin
            ? { disputeApproval: 'APPROVED', disputeApprovedBy: adminId, disputeApprovedAt: now }
            : { disputeApproval: 'PENDING' }),
        },
      });
      if (count === 0)
        throw new AppError(ErrorCode.DISPUTE_ALREADY_DECIDED, {}, HttpStatus.CONFLICT);
      if (decision === 'FULL' || isSuperAdmin) {
        await this.execute(tx, orderId, decision, adminId);
      }
    });
    if (decision === 'FULL' || isSuperAdmin) await this.notifyDecision(orderId, decision);
    return this.detail(orderId);
  }

  /** SA-side: applies a pending PARTIAL/CANCEL decision (§1.4). */
  async approve(superAdminId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError(ErrorCode.ORDER_NOT_FOUND, {}, HttpStatus.NOT_FOUND);
    if (order.disputeApproval !== 'PENDING') {
      throw new AppError(ErrorCode.DISPUTE_APPROVAL_NOT_PENDING, {}, HttpStatus.CONFLICT);
    }
    const decision = order.disputeDecision as DisputeDecision;
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
      const { count } = await tx.order.updateMany({
        where: { id: orderId, disputeApproval: 'PENDING' },
        data: {
          disputeApproval: 'APPROVED',
          disputeApprovedBy: superAdminId,
          disputeApprovedAt: now,
        },
      });
      if (count === 0) {
        throw new AppError(ErrorCode.DISPUTE_APPROVAL_NOT_PENDING, {}, HttpStatus.CONFLICT);
      }
      await this.execute(tx, orderId, decision, superAdminId);
    });
    await this.notifyDecision(orderId, decision);
    return this.detail(orderId);
  }

  async reject(superAdminId: string, orderId: string, reason: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { disputeApproval: true },
    });
    if (!order) throw new AppError(ErrorCode.ORDER_NOT_FOUND, {}, HttpStatus.NOT_FOUND);
    if (order.disputeApproval !== 'PENDING') {
      throw new AppError(ErrorCode.DISPUTE_APPROVAL_NOT_PENDING, {}, HttpStatus.CONFLICT);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
      const { count } = await tx.order.updateMany({
        where: { id: orderId, disputeApproval: 'PENDING' },
        data: {
          disputeApproval: 'REJECTED',
          disputeRejectReason: reason,
          disputeDecision: null,
          disputeDecisionNote: null,
          disputeDecidedBy: null,
          disputeDecidedAt: null,
        },
      });
      if (count === 0) {
        throw new AppError(ErrorCode.DISPUTE_APPROVAL_NOT_PENDING, {}, HttpStatus.CONFLICT);
      }
      await this.audit.log(
        {
          actorId: superAdminId,
          actorType: 'USER',
          action: 'dispute.reject_decision',
          entityType: 'order',
          entityId: orderId,
          data: { reason },
        },
        tx,
      );
    });
    return this.detail(orderId);
  }

  async pendingApproval() {
    const rows = await this.prisma.order.findMany({
      where: { disputeApproval: 'PENDING' },
      orderBy: { disputeDecidedAt: 'asc' },
      take: 200,
      select: {
        id: true,
        number: true,
        paymentMethod: true,
        price: true,
        disputedAt: true,
        disputedBy: true,
        customerId: true,
        disputeDecision: true,
        disputeApproval: true,
      },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        number: row.number,
        payment_method: row.paymentMethod,
        price: row.price.toString(),
        disputed_at: row.disputedAt?.toISOString() ?? null,
        disputed_by: row.disputedBy === row.customerId ? 'CUSTOMER' : 'EXECUTOR',
        decision: row.disputeDecision,
        approval: row.disputeApproval,
      })),
      next: null,
    };
  }

  // ---------------------------------------------------------------- effect (§1.2)

  private async execute(
    tx: Tx,
    orderId: string,
    decision: DisputeDecision,
    actorId: string,
  ): Promise<void> {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const now = new Date();

    if (!ONLINE_METHODS.has(order.paymentMethod)) {
      // CASH / XOLIS_QR: FULL or CANCEL only (already enforced at decide()).
      if (decision === 'FULL') {
        await tx.order.update({ where: { id: orderId }, data: { status: 'PAID', paidAt: now } });
        await this.settlement.settle(
          tx,
          {
            id: order.id,
            price: order.price,
            paymentMethod: order.paymentMethod,
            customerId: order.customerId,
            executorId: order.executorId as string,
            fee: order.fee,
            feeDemo: order.feeDemo,
            feeReal: order.feeReal,
            feeBpsSnapshot: order.feeBpsSnapshot,
            refL1BpsSnapshot: order.refL1BpsSnapshot,
            refL2BpsSnapshot: order.refL2BpsSnapshot,
          },
          actorId,
        );
      } else {
        await this.wallet.releaseHold(tx, orderId);
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: 'CANCELLED',
            cancelledAt: now,
            cancelledBy: null,
            cancelReason: 'DISPUTE',
          },
        });
      }
      await tx.orderEvent.create({
        data: {
          orderId,
          fromStatus: 'DISPUTED',
          toStatus: decision === 'FULL' ? 'PAID' : 'CANCELLED',
          actorId,
          payload: { dispute: decision },
        },
      });
      await tx.order.update({ where: { id: orderId }, data: { disputeExecutedAt: now } });
      return;
    }

    // BALANCE / CLICK / PAYME / CARD — nothing has been charged yet (§1.1).
    if (decision === 'FULL') {
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'DONE_BY_EXECUTOR', disputeExecutedAt: now },
      });
    } else if (decision === 'PARTIAL') {
      const s = await this.settings.getAll(tx);
      const quote = partialDisputeQuote({
        price: order.price,
        feeBpsSnapshot: order.feeBpsSnapshot ?? s.fee_bps,
        disputePartialBps: s.dispute_partial_bps,
        feeDemo: order.feeDemo ?? 0n,
      });
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'DONE_BY_EXECUTOR',
          price: quote.price,
          disputeOriginalPrice: order.price,
          fee: quote.fee,
          feeDemo: quote.feeDemo,
          feeReal: quote.feeReal,
          disputeExecutedAt: now,
        },
      });
      await tx.walletHold.updateMany({
        where: { orderId, status: 'ACTIVE' },
        data: { amountDemo: quote.feeDemo, amountReal: quote.feeReal },
      });
    } else {
      await this.wallet.releaseHold(tx, orderId);
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          cancelledBy: null,
          cancelReason: 'DISPUTE',
          disputeExecutedAt: now,
        },
      });
    }
    await tx.orderEvent.create({
      data: {
        orderId,
        fromStatus: 'DISPUTED',
        toStatus: decision === 'CANCEL' ? 'CANCELLED' : 'DONE_BY_EXECUTOR',
        actorId,
        payload: { dispute: decision },
      },
    });
  }

  private async notifyDecision(orderId: string, decision: DisputeDecision): Promise<void> {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { number: true, customerId: true, executorId: true, price: true },
    });
    this.realtime.toUsers([order.customerId, order.executorId], 'order.status', {
      order_id: orderId,
      number: order.number,
    });
    const type =
      decision === 'FULL'
        ? 'DISPUTE_RESOLVED_FULL'
        : decision === 'PARTIAL'
          ? 'DISPUTE_RESOLVED_PARTIAL'
          : 'DISPUTE_RESOLVED_CANCELLED';
    for (const recipient of [order.customerId, order.executorId]) {
      if (!recipient) continue;
      await this.notifications.notify(recipient, {
        type,
        orderId,
        orderNumber: order.number,
        params: decision === 'PARTIAL' ? { price: formatSom(order.price) } : {},
      });
    }
  }

  private async callerIsSuperAdmin(userId: string): Promise<boolean> {
    const staff = await this.prisma.staffPermission.findUnique({
      where: { userId },
      select: { role: true },
    });
    return staff?.role === 'SUPER_ADMIN';
  }
}

@Controller('admin/disputes')
@RequireStaff('disputes.resolve')
export class AdminDisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Get()
  list(@Query(new ZodPipe(listQuery)) query: z.output<typeof listQuery>) {
    return this.disputes.list(query);
  }

  @Get(':orderId')
  detail(@Param('orderId', uuid) orderId: string) {
    return this.disputes.detail(orderId);
  }

  @Get(':orderId/track')
  track(@Auth() auth: AuthContext, @Param('orderId', uuid) orderId: string) {
    return this.disputes.track(auth.userId, orderId);
  }

  @Post(':orderId/decide')
  @HttpCode(HttpStatus.OK)
  decide(
    @Auth() auth: AuthContext,
    @Param('orderId', uuid) orderId: string,
    @Body(new ZodPipe(decideSchema)) body: z.output<typeof decideSchema>,
  ) {
    return this.disputes.decide(auth.userId, orderId, body.decision, body.note);
  }
}

@Controller('sa/disputes')
@RequireStaff('SUPER_ADMIN')
export class SaDisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Get('pending-approval')
  pendingApproval() {
    return this.disputes.pendingApproval();
  }

  @Post(':orderId/approve')
  @HttpCode(HttpStatus.OK)
  approve(@Auth() auth: AuthContext, @Param('orderId', uuid) orderId: string) {
    return this.disputes.approve(auth.userId, orderId);
  }

  @Post(':orderId/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @Auth() auth: AuthContext,
    @Param('orderId', uuid) orderId: string,
    @Body(new ZodPipe(rejectSchema)) body: z.output<typeof rejectSchema>,
  ) {
    return this.disputes.reject(auth.userId, orderId, body.reason);
  }
}
