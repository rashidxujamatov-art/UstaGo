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
import { ZodPipe } from '../../common/validation/zod-body.pipe.js';
import type { OrderStatus, PaymentMethod, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { orderInclude, toAdminOrderView } from '../orders/order-view.js';
import { OrdersService } from '../orders/orders.service.js';
import { SettingsService } from '../settings/settings.service.js';

const uuid = new ParseUUIDPipe();
const PAGE = 30;

const listQuery = z.object({
  search: z.string().trim().max(100).optional(),
  status: z
    .enum([
      'PUBLISHED',
      'ACCEPTED',
      'EN_ROUTE',
      'ARRIVED',
      'IN_PROGRESS',
      'DONE_BY_EXECUTOR',
      'COMPLETED',
      'PAID',
      'CANCELLED',
      'DISPUTED',
    ])
    .optional(),
  payment_method: z.enum(['BALANCE', 'CLICK', 'PAYME', 'CARD', 'CASH', 'XOLIS_QR']).optional(),
  stuck: z.enum(['true']).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  before: z.uuid().optional(),
});
const cancelSchema = z.object({ reason: z.string().trim().min(1).max(500) });

/** `orders.moderate` (docs/01 §1, stage 7). */
@Injectable()
export class OrdersModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly orders: OrdersService,
  ) {}

  /** §2.1 of the stage 7 contract: unconfirmed §5.1 payment past confirm_admin_task_hours. */
  private async stuckWhere(): Promise<Prisma.OrderWhereInput> {
    const { confirm_admin_task_hours: hours } = await this.settings.getAll();
    const cutoff = new Date(Date.now() - hours * 3_600_000);
    return {
      OR: [
        { status: 'DONE_BY_EXECUTOR', finishedAt: { lte: cutoff } },
        {
          status: { in: ['DONE_BY_EXECUTOR', 'COMPLETED'] },
          paymentMethod: { in: ['CASH', 'XOLIS_QR'] },
          executorReceivedAt: null,
          finishedAt: { lte: cutoff },
        },
      ],
    };
  }

  async stuckCount(): Promise<number> {
    return this.prisma.order.count({ where: await this.stuckWhere() });
  }

  async list(query: z.output<typeof listQuery>) {
    const where: Prisma.OrderWhereInput = {};
    if (query.status) where.status = query.status as OrderStatus;
    if (query.payment_method) where.paymentMethod = query.payment_method as PaymentMethod;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }
    if (query.stuck === 'true') Object.assign(where, await this.stuckWhere());
    if (query.search) {
      const asNumber = Number(query.search);
      where.OR = [
        ...(Number.isInteger(asNumber) ? [{ number: asNumber }] : []),
        { customer: { phone: { contains: query.search } } },
        { executor: { phone: { contains: query.search } } },
      ];
    }
    if (query.before) where.id = { lt: query.before };

    const rows = await this.prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: { id: 'desc' },
      take: PAGE + 1,
    });
    const page = rows.slice(0, PAGE);
    return {
      items: page.map((order) => toAdminOrderView(order)),
      next: rows.length > PAGE ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async detail(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: orderInclude,
    });
    if (!order) throw new AppError(ErrorCode.ORDER_NOT_FOUND, {}, HttpStatus.NOT_FOUND);
    const events = await this.prisma.orderEvent.findMany({
      where: { orderId },
      orderBy: { at: 'asc' },
    });
    return {
      ...toAdminOrderView(order),
      events: events.map((e) => ({
        from_status: e.fromStatus,
        to_status: e.toStatus,
        actor_id: e.actorId,
        at: e.at.toISOString(),
      })),
    };
  }

  cancel(adminId: string, orderId: string, reason: string) {
    return this.orders.adminCancel(adminId, orderId, reason);
  }
}

@Controller('admin/orders')
@RequireStaff('orders.moderate')
export class OrdersModerationController {
  constructor(private readonly moderation: OrdersModerationService) {}

  @Get()
  list(@Query(new ZodPipe(listQuery)) query: z.output<typeof listQuery>) {
    return this.moderation.list(query);
  }

  @Get(':id')
  detail(@Param('id', uuid) id: string) {
    return this.moderation.detail(id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Auth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(cancelSchema)) body: z.output<typeof cancelSchema>,
  ) {
    return this.moderation.cancel(auth.userId, id, body.reason);
  }
}
