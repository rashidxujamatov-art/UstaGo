import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { LedgerService, PLATFORM } from './ledger.service.js';

type Db = PrismaService | Prisma.TransactionClient;

export interface WalletBalances {
  real: bigint;
  demo: bigint;
  heldDemo: bigint;
  heldReal: bigint;
}

export interface WalletView {
  real: string;
  demo: string;
  holds: string;
  available: string;
}

/**
 * Executor and customer money (docs/01-biznes-qoidalar.md §7). Stage 2 covers accounts,
 * the demo bonus and holds; settlement, top-up and payouts follow in stages 3-4.
 */
@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  async balances(userId: string, db: Db = this.prisma): Promise<WalletBalances> {
    const [accounts, holds] = await Promise.all([
      db.walletAccount.findMany({
        where: { ownerKey: userId, kind: { in: ['REAL', 'DEMO'] } },
        select: { kind: true, balance: true },
      }),
      db.walletHold.aggregate({
        where: { userId, status: 'ACTIVE' },
        _sum: { amountDemo: true, amountReal: true },
      }),
    ]);
    const balance = (kind: 'REAL' | 'DEMO') =>
      accounts.find((account) => account.kind === kind)?.balance ?? 0n;
    return {
      real: balance('REAL'),
      demo: balance('DEMO'),
      heldDemo: holds._sum.amountDemo ?? 0n,
      heldReal: holds._sum.amountReal ?? 0n,
    };
  }

  /** `GET /wallet` shape; money as tiyin strings. */
  async view(userId: string): Promise<WalletView> {
    const b = await this.balances(userId);
    const holds = b.heldDemo + b.heldReal;
    return {
      real: b.real.toString(),
      demo: b.demo.toString(),
      holds: holds.toString(),
      available: (b.real + b.demo - holds).toString(),
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
