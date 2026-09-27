import { Controller, Get, Injectable, Query } from '@nestjs/common';
import { z } from 'zod';
import { RequireStaff } from '../../common/auth/staff.guard.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { ZodPipe } from '../../common/validation/zod-body.pipe.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { FinanceService } from '../wallet/finance.service.js';

const periodQuery = z.object({
  period: z.enum(['today', 'week', 'month', 'custom']).default('today'),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});
const ordersQuery = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  before: z.uuid().optional(),
});
const PAGE = 30;

function resolvePeriod(query: z.output<typeof periodQuery>): { from: Date; to: Date } {
  const now = new Date();
  if (query.period === 'custom') {
    if (!query.from || !query.to) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, { fields: 'from,to' });
    }
    return { from: new Date(query.from), to: new Date(query.to) };
  }
  const from = new Date(now);
  if (query.period === 'today') from.setUTCHours(0, 0, 0, 0);
  else if (query.period === 'week') from.setUTCDate(from.getUTCDate() - 7);
  else from.setUTCMonth(from.getUTCMonth() - 1);
  return { from, to: now };
}

/** SA1 "Boshqaruv paneli" and SA4 "Moliya" (stage 7) — both read `FinanceService.summary()`. */
@Injectable()
export class FinanceAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
  ) {}

  async summary(from: Date, to: Date) {
    const [s, prosInFreePeriod, customers, executors] = await Promise.all([
      this.finance.summary(from, to),
      this.prisma.executorProfile.count({ where: { freePeriodEnd: { gt: new Date() } } }),
      this.prisma.user.count({ where: { activeRole: 'CUSTOMER' } }),
      this.prisma.user.count({ where: { activeRole: 'EXECUTOR' } }),
    ]);
    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      turnover: s.turnover.toString(),
      platform_net: s.platformNet.toString(),
      commission_real: s.commissionReal.toString(),
      demo_commission: s.demoCommission.toString(),
      referral: {
        l1: s.refL1.toString(),
        l1_budget: s.refL1Budget.toString(),
        l2: s.refL2.toString(),
        l2_budget: s.refL2Budget.toString(),
      },
      marketing_budget_spent: s.marketing.toString(),
      payout_provider_fees: s.payoutProviderFees.toString(),
      pros_in_free_period: prosInFreePeriod,
      users_total: { customers, executors },
    };
  }

  async orders(from: Date, to: Date, before?: string) {
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        number: number;
        paid_at: Date | null;
        payment_method: string;
        price: bigint;
        fee: bigint | null;
        fee_demo: bigint | null;
        fee_real: bigint | null;
      }[]
    >`SELECT o.id, o.number, o.paid_at, o.payment_method::text, o.price, o.fee, o.fee_demo, o.fee_real
      FROM orders o
      WHERE o.id IN (
        SELECT DISTINCT t.order_id FROM ledger_transactions t
        WHERE t.type = 'SERVICE_FEE' AND t.created_at >= ${from} AND t.created_at < ${to}
      )
      ${before ? Prisma.sql`AND o.id < ${before}::uuid` : Prisma.empty}
      ORDER BY o.id DESC
      LIMIT ${PAGE + 1}`;
    const page = rows.slice(0, PAGE);
    const referrals = await this.prisma.ledgerEntry.groupBy({
      by: ['transactionId'],
      where: {
        transaction: {
          orderId: { in: page.map((r) => r.id) },
          type: { in: ['REFERRAL_L1', 'REFERRAL_L2'] },
        },
        amount: { gt: 0 },
      },
      _sum: { amount: true },
    });
    const refByOrder = new Map<string, { l1: bigint; l2: bigint }>();
    const txs = await this.prisma.ledgerTransaction.findMany({
      where: { id: { in: referrals.map((r) => r.transactionId) } },
      select: { id: true, orderId: true, type: true },
    });
    const txById = new Map(txs.map((t) => [t.id, t]));
    for (const r of referrals) {
      const tx = txById.get(r.transactionId);
      if (!tx?.orderId) continue;
      const entry = refByOrder.get(tx.orderId) ?? { l1: 0n, l2: 0n };
      const amount = r._sum.amount ?? 0n;
      if (tx.type === 'REFERRAL_L1') entry.l1 += amount;
      else entry.l2 += amount;
      refByOrder.set(tx.orderId, entry);
    }

    return {
      items: page.map((row) => {
        const ref = refByOrder.get(row.id) ?? { l1: 0n, l2: 0n };
        const feeReal = row.fee_real ?? 0n;
        return {
          id: row.id,
          number: row.number,
          paid_at: row.paid_at?.toISOString() ?? null,
          payment_method: row.payment_method,
          price: row.price.toString(),
          fee: (row.fee ?? 0n).toString(),
          fee_demo: (row.fee_demo ?? 0n).toString(),
          fee_real: feeReal.toString(),
          ref_l1: ref.l1.toString(),
          ref_l2: ref.l2.toString(),
          platform_net: (feeReal - ref.l1 - ref.l2).toString(),
        };
      }),
      next: rows.length > PAGE ? (page.at(-1)?.id ?? null) : null,
    };
  }
}

/** SA1 (super admin only). */
@Controller('sa/dashboard')
@RequireStaff('SUPER_ADMIN')
export class SaDashboardController {
  constructor(private readonly finance: FinanceAdminService) {}

  @Get()
  get(@Query(new ZodPipe(periodQuery)) query: z.output<typeof periodQuery>) {
    const { from, to } = resolvePeriod(query);
    return this.finance.summary(from, to);
  }
}

/** SA4 — also open to a plain `finance.view` admin (RequireStaff lets SUPER_ADMIN through too). */
@Controller('sa/finance')
@RequireStaff('finance.view')
export class SaFinanceController {
  constructor(private readonly finance: FinanceAdminService) {}

  @Get('summary')
  summary(@Query(new ZodPipe(periodQuery)) query: z.output<typeof periodQuery>) {
    const { from, to } = resolvePeriod(query);
    return this.finance.summary(from, to);
  }

  @Get('orders')
  orders(@Query(new ZodPipe(ordersQuery)) query: z.output<typeof ordersQuery>) {
    return this.finance.orders(new Date(query.from), new Date(query.to), query.before);
  }
}
