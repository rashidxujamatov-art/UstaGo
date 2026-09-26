import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { LedgerService, PLATFORM } from './ledger.service.js';
import { withdrawQuote } from './withdraw-quote.js';

type Db = PrismaService | Prisma.TransactionClient;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface WalletBalances {
  /** REAL account; negative only as a debt after a dispute (§5). */
  real: bigint;
  /** DEMO account as booked. */
  demo: bigint;
  /**
   * Demo that still counts (§4 demo_active): all of it during the free period; afterwards
   * only the part held for jobs taken before it ended, even if the expiry job has not run.
   */
  demoActive: bigint;
  heldDemo: bigint;
  heldReal: bigint;
}

export interface WalletView {
  real: string;
  demo: string;
  holds: string;
  available: string;
  /** Withdrawal limit (§7): fees that must stay, and the most that can be withdrawn. */
  must_keep: string;
  max_withdraw: string;
  /** Demo bonus credited to this person (BJ5 "1 500 / 25 000"); "0" for customers. */
  demo_granted: string;
  /** Executors only. */
  free_period: { ends_at: string; days_left: number; active: boolean } | null;
}

/**
 * Executor and customer money (docs/01-biznes-qoidalar.md §7, §8): balances, holds, the
 * demo bonus and its expiry. Settlement lives in SettlementService, payouts in
 * WithdrawalsService; every balance change goes through LedgerService.
 */
@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  async balances(userId: string, db: Db = this.prisma, now = new Date()): Promise<WalletBalances> {
    const [accounts, holds, profile] = await Promise.all([
      db.walletAccount.findMany({
        where: { ownerKey: userId, kind: { in: ['REAL', 'DEMO'] } },
        select: { kind: true, balance: true },
      }),
      db.walletHold.aggregate({
        where: { userId, status: 'ACTIVE' },
        _sum: { amountDemo: true, amountReal: true },
      }),
      db.executorProfile.findUnique({ where: { userId }, select: { freePeriodEnd: true } }),
    ]);
    const balance = (kind: 'REAL' | 'DEMO') =>
      accounts.find((account) => account.kind === kind)?.balance ?? 0n;
    const demo = balance('DEMO');
    const heldDemo = holds._sum.amountDemo ?? 0n;
    const freePeriodActive = profile !== null && profile.freePeriodEnd > now;
    return {
      real: balance('REAL'),
      demo,
      demoActive: freePeriodActive ? demo : demo < heldDemo ? demo : heldDemo,
      heldDemo,
      heldReal: holds._sum.amountReal ?? 0n,
    };
  }

  /** `GET /wallet` (BJ5 and the header balance); money as tiyin strings. */
  async view(userId: string, now = new Date()): Promise<WalletView> {
    const [b, granted, profile, s] = await Promise.all([
      this.balances(userId, this.prisma, now),
      this.prisma.ledgerEntry.aggregate({
        where: {
          account: { ownerKey: userId, kind: 'DEMO' },
          transaction: { type: 'DEMO_BONUS' },
          amount: { gt: 0n },
        },
        _sum: { amount: true },
      }),
      this.prisma.executorProfile.findUnique({
        where: { userId },
        select: { freePeriodEnd: true },
      }),
      this.settings.getAll(),
    ]);
    const holds = b.heldDemo + b.heldReal;
    const limit = withdrawQuote({
      real: b.real,
      demoActive: b.demoActive,
      held: holds,
      withdrawFeeBps: s.withdraw_fee_bps,
    });
    const msLeft = profile ? profile.freePeriodEnd.getTime() - now.getTime() : 0;
    return {
      real: b.real.toString(),
      demo: b.demoActive.toString(),
      holds: holds.toString(),
      available: (b.real + b.demoActive - holds).toString(),
      must_keep: limit.mustKeep.toString(),
      max_withdraw: limit.max.toString(),
      demo_granted: (granted._sum.amount ?? 0n).toString(),
      free_period: profile
        ? {
            ends_at: profile.freePeriodEnd.toISOString(),
            days_left: msLeft > 0 ? Math.ceil(msLeft / DAY_MS) : 0,
            active: msLeft > 0,
          }
        : null,
    };
  }

  /**
   * Locks the user's REAL and DEMO accounts (SELECT … FOR UPDATE) for the rest of the
   * transaction, so balance checks and holds cannot race (CLAUDE.md rule 3).
   */
  async lock(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await this.ledger.accountId(tx, userId, 'REAL');
    await this.ledger.accountId(tx, userId, 'DEMO');
    await tx.$queryRaw`SELECT id FROM wallet_accounts WHERE owner_key = ${userId} ORDER BY kind FOR UPDATE`;
  }

  /**
   * Credits the one-time demo bonus when the free period starts (§8). Keyed by the PINFL
   * hash, so the same person never gets it twice, even with a new account.
   */
  async grantDemoBonus(
    tx: Prisma.TransactionClient,
    userId: string,
    pinflHash: string,
  ): Promise<void> {
    const { demo_bonus: amount } = await this.settings.getAll(tx);
    if (amount <= 0n) return;

    const { duplicate, transactionId } = await this.ledger.post(tx, {
      type: 'DEMO_BONUS',
      idempotencyKey: `demo-bonus:${pinflHash}`,
      entries: [
        { accountId: await this.ledger.accountId(tx, PLATFORM, 'DEMO_ISSUANCE'), amount: -amount },
        { accountId: await this.ledger.accountId(tx, userId, 'DEMO'), amount },
      ],
    });
    if (!duplicate) {
      await this.audit.log(
        {
          actorType: 'SYSTEM',
          action: 'wallet.demo_bonus',
          entityType: 'ledger_transaction',
          entityId: transactionId,
          data: { userId, amount: amount.toString() },
        },
        tx,
      );
    }
  }

  /**
   * Burns the demo left after the free period (§8 DEMO_EXPIRE). Demo held for jobs taken
   * before the end stays until those jobs settle or are released (§4, T18); released
   * demo burns on a later run. Returns how many users were affected.
   */
  async expireDemo(now = new Date()): Promise<number> {
    const candidates = await this.prisma.$queryRaw<{ user_id: string }[]>`
      SELECT p.user_id::text AS user_id
      FROM executor_profiles p
      JOIN wallet_accounts a ON a.owner_key = p.user_id::text AND a.kind = 'DEMO'
      WHERE p.free_period_end <= ${now}
        AND a.balance > COALESCE(
          (SELECT SUM(h.amount_demo) FROM wallet_holds h
           WHERE h.user_id = p.user_id AND h.status = 'ACTIVE'), 0)
      LIMIT 500`;

    let affected = 0;
    for (const { user_id: userId } of candidates) {
      const burned = await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, userId);
        const b = await this.balances(userId, tx, now);
        const amount = b.demo - b.heldDemo;
        if (amount <= 0n) return false;
        // The demo balance only goes down, so it identifies this burn among later ones.
        const { transactionId } = await this.ledger.post(tx, {
          type: 'DEMO_EXPIRE',
          idempotencyKey: `demo-expire:${userId}:${b.demo}`,
          entries: [
            { accountId: await this.ledger.accountId(tx, userId, 'DEMO'), amount: -amount },
            {
              accountId: await this.ledger.accountId(tx, PLATFORM, 'DEMO_ISSUANCE'),
              amount,
            },
          ],
        });
        await this.audit.log(
          {
            actorType: 'SYSTEM',
            action: 'wallet.demo_expire',
            entityType: 'ledger_transaction',
            entityId: transactionId,
            data: { userId, amount: amount.toString() },
          },
          tx,
        );
        return true;
      });
      if (burned) affected += 1;
    }
    return affected;
  }

  async placeHold(
    tx: Prisma.TransactionClient,
    hold: { userId: string; orderId: string; amountDemo: bigint; amountReal: bigint },
  ): Promise<void> {
    await tx.walletHold.create({ data: hold });
  }

  /** Gives the reserved fee back (cancel, decline, dispute decision). */
  async releaseHold(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
    await tx.walletHold.updateMany({
      where: { orderId, status: 'ACTIVE' },
      data: { status: 'RELEASED', closedAt: new Date() },
    });
  }
}
