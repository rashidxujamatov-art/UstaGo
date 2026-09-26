import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import type { LedgerTxType } from './ledger.service.js';

const PAGE = 30;
const RECENT_BONUSES = 20;

export interface HistoryItem {
  /** Ledger transaction id; also the cursor for the next page. */
  id: string;
  type: LedgerTxType;
  /** Signed change of REAL + DEMO, tiyin. */
  amount: string;
  /** Signed part of it on DEMO (the "DEMO" badge on BJ5). */
  demo_amount: string;
  created_at: string;
  order: {
    id: string;
    number: number;
    title: string;
    price: string;
    payment_method: string;
    fee_bps: number | null;
  } | null;
  /** Referral rows: the pro who did the job. */
  from: { first_name: string; last_initial: string } | null;
  /** Top-ups: PAYME, CLICK or CARD. */
  provider: string | null;
}

export interface ReferralSummary {
  code: string;
  link: string;
  l1_bps: number;
  l2_bps: number;
  /** People who registered with the code and finished MyID. */
  l1_count: number;
  l2_count: number;
  /** All referral bonuses received, tiyin. */
  total: string;
  recent: {
    id: string;
    level: 1 | 2;
    amount: string;
    order_price: string | null;
    from: { first_name: string; last_name: string } | null;
    created_at: string;
  }[];
}

interface Row {
  id: string;
  type: LedgerTxType;
  order_id: string | null;
  payment_id: string | null;
  created_at: Date;
  amount: bigint;
  demo_amount: bigint;
}

/** Read models of the wallet: history (BJ5) and the referral screen (U2). */
@Injectable()
export class WalletHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Newest first, one row per ledger transaction touching the user's REAL or DEMO. */
  async history(
    userId: string,
    before?: string,
  ): Promise<{ items: HistoryItem[]; next: string | null }> {
    const cursor = before ? Prisma.sql`AND t.id < ${before}::uuid` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT t.id::text AS id, t.type, t.order_id::text AS order_id,
             t.payment_id::text AS payment_id, t.created_at,
             SUM(e.amount)::bigint AS amount,
             SUM(CASE WHEN a.kind = 'DEMO' THEN e.amount ELSE 0 END)::bigint AS demo_amount
      FROM ledger_entries e
      JOIN wallet_accounts a ON a.id = e.account_id
      JOIN ledger_transactions t ON t.id = e.transaction_id
      WHERE a.owner_key = ${userId} AND a.kind IN ('REAL', 'DEMO') ${cursor}
      GROUP BY t.id
      ORDER BY t.id DESC
      LIMIT ${PAGE + 1}`;

    const page = rows.slice(0, PAGE);
    const orderIds = [...new Set(page.flatMap((row) => (row.order_id ? [row.order_id] : [])))];
    const orders = await this.prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: {
        id: true,
        number: true,
        title: true,
        price: true,
        paymentMethod: true,
        feeBpsSnapshot: true,
        executor: { select: { identity: { select: { firstName: true, lastName: true } } } },
      },
    });
    const byId = new Map(orders.map((order) => [order.id, order]));
    const paymentIds = page.flatMap((row) => (row.payment_id ? [row.payment_id] : []));
    const payments = await this.prisma.payment.findMany({
      where: { id: { in: paymentIds } },
      select: { id: true, provider: true },
    });
    const providers = new Map(payments.map((payment) => [payment.id, payment.provider]));

    const items = page.map((row): HistoryItem => {
      const order = row.order_id ? byId.get(row.order_id) : undefined;
      const referral = row.type === 'REFERRAL_L1' || row.type === 'REFERRAL_L2';
      const pro = order?.executor?.identity;
      return {
        id: row.id,
        type: row.type,
        amount: row.amount.toString(),
        demo_amount: row.demo_amount.toString(),
        created_at: row.created_at.toISOString(),
        order: order
          ? {
              id: order.id,
              number: order.number,
              title: order.title,
              price: order.price.toString(),
              payment_method: order.paymentMethod,
              fee_bps: order.feeBpsSnapshot,
            }
          : null,
        from:
          referral && pro
            ? { first_name: pro.firstName, last_initial: pro.lastName.slice(0, 1) }
            : null,
        provider: row.payment_id ? (providers.get(row.payment_id) ?? null) : null,
      };
    });
    return { items, next: rows.length > PAGE ? (page.at(-1)?.id ?? null) : null };
  }

  /** U2: the link, the two referral levels and the bonuses received. */
  async referrals(userId: string): Promise<ReferralSummary> {
    const [user, s, l1Count, l2Count, total, recent] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { referralCode: true },
      }),
      this.settings.getAll(),
      this.prisma.user.count({ where: { referrerId: userId, identity: { isNot: null } } }),
      this.prisma.user.count({
        where: { referrer: { referrerId: userId }, identity: { isNot: null } },
      }),
      this.prisma.ledgerEntry.aggregate({
        where: {
          account: { ownerKey: userId, kind: 'REAL' },
          transaction: { type: { in: ['REFERRAL_L1', 'REFERRAL_L2'] } },
        },
        _sum: { amount: true },
      }),
      this.prisma.ledgerEntry.findMany({
        where: {
          account: { ownerKey: userId, kind: 'REAL' },
          transaction: { type: { in: ['REFERRAL_L1', 'REFERRAL_L2'] } },
        },
        orderBy: { transactionId: 'desc' },
        take: RECENT_BONUSES,
        select: {
          amount: true,
          transaction: { select: { id: true, type: true, orderId: true, createdAt: true } },
        },
      }),
    ]);

    const orderIds = recent.flatMap((entry) =>
      entry.transaction.orderId ? [entry.transaction.orderId] : [],
    );
    const orders = await this.prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: {
        id: true,
        price: true,
        executor: { select: { identity: { select: { firstName: true, lastName: true } } } },
      },
    });
    const byId = new Map(orders.map((order) => [order.id, order]));
    const domain = this.config.get('APP_DOMAIN', { infer: true });

    return {
      code: user.referralCode,
      link: `https://${domain}/r/${user.referralCode}`,
      l1_bps: s.ref_l1_bps,
      l2_bps: s.ref_l2_bps,
      l1_count: l1Count,
      l2_count: l2Count,
      total: (total._sum.amount ?? 0n).toString(),
      recent: recent.map((entry) => {
        const order = entry.transaction.orderId ? byId.get(entry.transaction.orderId) : undefined;
        const pro = order?.executor?.identity;
        return {
          id: entry.transaction.id,
          level: entry.transaction.type === 'REFERRAL_L1' ? 1 : 2,
          amount: entry.amount.toString(),
          order_price: order ? order.price.toString() : null,
          from: pro ? { first_name: pro.firstName, last_name: pro.lastName } : null,
          created_at: entry.transaction.createdAt.toISOString(),
        };
      }),
    };
  }
}
