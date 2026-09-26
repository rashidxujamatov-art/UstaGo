import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

export interface FinanceSummary {
  /** Prices of the orders settled in the period (turnover). */
  turnover: bigint;
  /** Real service fees: platform revenue before referral. */
  commissionReal: bigint;
  /** Fees paid from demo: not revenue ("Demo komissiya — daromadga qo'shilmaydi"). */
  demoCommission: bigint;
  refL1: bigint;
  /** Part of refL1 paid from the marketing budget ("Demo ishlar referali"). */
  refL1Budget: bigint;
  refL2: bigint;
  refL2Budget: bigint;
  /** commissionReal − real referral parts. */
  platform: bigint;
  /** Referral paid from PLATFORM_MARKETING. */
  marketing: bigint;
  /** platform − marketing. */
  platformNet: bigint;
  /** Bank fees on withdrawals, passed to the payout provider; never revenue (§7). */
  payoutProviderFees: bigint;
}

interface Row {
  type: string;
  kind: string;
  platform: boolean;
  total: bigint;
}

/**
 * Finance totals from the ledger for a period (docs/01-biznes-qoidalar.md §6, §11 T11).
 * The SA4 screen (stage 7) shows them; the numbers come only from ledger entries.
 */
@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(from: Date, to: Date): Promise<FinanceSummary> {
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT t.type, a.kind::text AS kind, (a.owner_key = 'PLATFORM') AS platform,
             SUM(e.amount)::bigint AS total
      FROM ledger_entries e
      JOIN ledger_transactions t ON t.id = e.transaction_id
      JOIN wallet_accounts a ON a.id = e.account_id
      WHERE t.created_at >= ${from} AND t.created_at < ${to}
        AND t.type IN ('SERVICE_FEE', 'REFERRAL_L1', 'REFERRAL_L2',
                       'WITHDRAWAL_FEE', 'WITHDRAWAL_FEE_REFUND')
      GROUP BY t.type, a.kind, (a.owner_key = 'PLATFORM')`;
    const sum = (type: string | string[], kind: string, platform: boolean) =>
      rows
        .filter(
          (row) =>
            (Array.isArray(type) ? type.includes(row.type) : row.type === type) &&
            row.kind === kind &&
            row.platform === platform,
        )
        .reduce((total, row) => total + row.total, 0n);

    const [turnover] = await this.prisma.$queryRaw<{ total: bigint | null }[]>`
      SELECT SUM(o.price)::bigint AS total
      FROM orders o
      WHERE o.id IN (SELECT t.order_id FROM ledger_transactions t
                     WHERE t.type = 'SERVICE_FEE'
                       AND t.created_at >= ${from} AND t.created_at < ${to})`;

    const commissionReal = sum('SERVICE_FEE', 'PLATFORM_REVENUE', true);
    const demoCommission = sum('SERVICE_FEE', 'DEMO_SINK', true);
    const refL1 = sum('REFERRAL_L1', 'REAL', false);
    const refL1Budget = -sum('REFERRAL_L1', 'PLATFORM_MARKETING', true);
    const refL2 = sum('REFERRAL_L2', 'REAL', false);
    const refL2Budget = -sum('REFERRAL_L2', 'PLATFORM_MARKETING', true);
    const platform =
      commissionReal +
      sum('REFERRAL_L1', 'PLATFORM_REVENUE', true) +
      sum('REFERRAL_L2', 'PLATFORM_REVENUE', true);
    const marketing = refL1Budget + refL2Budget;

    return {
      turnover: turnover?.total ?? 0n,
      commissionReal,
      demoCommission,
      refL1,
      refL1Budget,
      refL2,
      refL2Budget,
      platform,
      marketing,
      platformNet: platform - marketing,
      payoutProviderFees: sum(
        ['WITHDRAWAL_FEE', 'WITHDRAWAL_FEE_REFUND'],
        'PAYOUT_PROVIDER_FEES',
        true,
      ),
    };
  }
}
