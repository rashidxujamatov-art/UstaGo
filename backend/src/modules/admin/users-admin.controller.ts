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
import { maskPhone } from '../../common/phone.js';
import { ZodPipe } from '../../common/validation/zod-body.pipe.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { WalletService } from '../wallet/wallet.service.js';

const uuid = new ParseUUIDPipe();
const PAGE = 30;

const listQuery = z.object({
  search: z.string().trim().max(100).optional(),
  role: z.enum(['CUSTOMER', 'EXECUTOR']).optional(),
  status: z.enum(['ACTIVE', 'BLOCKED']).optional(),
  verification: z.enum(['PENDING']).optional(),
  before: z.uuid().optional(),
});
const blockSchema = z.object({ reason: z.string().trim().min(1).max(500) });

/** AD2 "Foydalanuvchilar" (users.manage, stage 7). */
@Injectable()
export class UsersAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(query: z.output<typeof listQuery>) {
    const where: Prisma.UserWhereInput = {};
    if (query.role) where.activeRole = query.role;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { phone: { contains: query.search } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { identity: { firstName: { contains: query.search, mode: 'insensitive' } } },
        { identity: { lastName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    if (query.verification === 'PENDING') {
      const pending = await this.prisma.taxVerification.findMany({
        where: { status: 'PENDING' },
        select: { userId: true },
        distinct: ['userId'],
      });
      where.id = { in: pending.map((p) => p.userId) };
    }
    if (query.before)
      where.id = { ...(typeof where.id === 'object' ? where.id : {}), lt: query.before };

    const rows = await this.prisma.user.findMany({
      where,
      include: {
        identity: true,
        executorProfile: true,
      },
      orderBy: { id: 'desc' },
      take: PAGE + 1,
    });
    const page = rows.slice(0, PAGE);
    const items = await Promise.all(page.map((user) => this.toListItem(user.id, user)));
    return { items, next: rows.length > PAGE ? (page.at(-1)?.id ?? null) : null };
  }

  async detail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { identity: true, executorProfile: true },
    });
    if (!user) throw new AppError(ErrorCode.NOT_FOUND, {}, HttpStatus.NOT_FOUND);
    const [wallet, asCustomer, asExecutor, block] = await Promise.all([
      this.wallet.balances(userId),
      this.prisma.order.count({ where: { customerId: userId } }),
      this.prisma.order.count({ where: { executorId: userId } }),
      user.status === 'BLOCKED'
        ? this.prisma.auditLog.findFirst({
            where: { action: 'user.block', entityId: userId },
            orderBy: { createdAt: 'desc' },
          })
        : null,
    ]);
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      lang: user.lang,
      active_role: user.activeRole,
      status: user.status,
      created_at: user.createdAt.toISOString(),
      identity: user.identity
        ? {
            first_name: user.identity.firstName,
            last_name: user.identity.lastName,
            middle_name: user.identity.middleName,
            birth_date: user.identity.birthDate.toISOString().slice(0, 10),
            doc_type: user.identity.docType,
            verified_at: user.identity.verifiedAt.toISOString(),
          }
        : null,
      executor: user.executorProfile
        ? {
            free_period_ends_at: user.executorProfile.freePeriodEnd.toISOString(),
            tax_method: user.executorProfile.taxMethod,
            tax_status: user.executorProfile.taxStatus,
            tax_valid_until: user.executorProfile.taxValidUntil?.toISOString() ?? null,
          }
        : null,
      wallet: {
        real: wallet.real.toString(),
        demo: wallet.demoActive.toString(),
        holds: (wallet.heldDemo + wallet.heldReal).toString(),
      },
      orders_count: { as_customer: asCustomer, as_executor: asExecutor },
      block: block
        ? {
            reason: (block.data as { reason?: string } | null)?.reason ?? null,
            blocked_at: block.createdAt.toISOString(),
            blocked_by: block.actorId,
          }
        : null,
    };
  }

  async block(adminId: string, userId: string, reason: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (!user) throw new AppError(ErrorCode.NOT_FOUND, {}, HttpStatus.NOT_FOUND);
    if (user.status === 'BLOCKED')
      throw new AppError(ErrorCode.USER_ALREADY_BLOCKED, {}, HttpStatus.CONFLICT);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { status: 'BLOCKED' } });
      await this.audit.log(
        {
          actorId: adminId,
          actorType: 'USER',
          action: 'user.block',
          entityType: 'user',
          entityId: userId,
          data: { reason },
        },
        tx,
      );
    });
    await this.notifications.notify(userId, { type: 'USER_BLOCKED', params: { reason } });
    return this.detail(userId);
  }

  async unblock(adminId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (!user) throw new AppError(ErrorCode.NOT_FOUND, {}, HttpStatus.NOT_FOUND);
    if (user.status !== 'BLOCKED')
      throw new AppError(ErrorCode.USER_NOT_BLOCKED, {}, HttpStatus.CONFLICT);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
      await this.audit.log(
        {
          actorId: adminId,
          actorType: 'USER',
          action: 'user.unblock',
          entityType: 'user',
          entityId: userId,
        },
        tx,
      );
    });
    await this.notifications.notify(userId, { type: 'USER_UNBLOCKED' });
    return this.detail(userId);
  }

  private async toListItem(
    id: string,
    user: {
      phone: string;
      email: string;
      activeRole: string | null;
      status: string;
      createdAt: Date;
      identity: { firstName: string; lastName: string; verifiedAt: Date } | null;
      executorProfile: { taxMethod: string | null; taxStatus: string } | null;
    },
  ) {
    return {
      id,
      phone_masked: maskPhone(user.phone),
      email: user.email,
      first_name: user.identity?.firstName ?? '',
      last_name: user.identity?.lastName ?? '',
      active_role: user.activeRole,
      status: user.status,
      created_at: user.createdAt.toISOString(),
      identity_verified: user.identity !== null,
      tax: user.executorProfile
        ? { method: user.executorProfile.taxMethod, status: user.executorProfile.taxStatus }
        : null,
    };
  }
}

/** AD2 (users.manage, stage 7). */
@Controller('admin/users')
@RequireStaff('users.manage')
export class UsersAdminController {
  constructor(private readonly users: UsersAdminService) {}

  @Get()
  list(@Query(new ZodPipe(listQuery)) query: z.output<typeof listQuery>) {
    return this.users.list(query);
  }

  @Get(':id')
  detail(@Param('id', uuid) id: string) {
    return this.users.detail(id);
  }

  @Post(':id/block')
  @HttpCode(HttpStatus.OK)
  block(
    @Auth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(blockSchema)) body: z.output<typeof blockSchema>,
  ) {
    return this.users.block(auth.userId, id, body.reason);
  }

  @Post(':id/unblock')
  @HttpCode(HttpStatus.OK)
  unblock(@Auth() auth: AuthContext, @Param('id', uuid) id: string) {
    return this.users.unblock(auth.userId, id);
  }
}
