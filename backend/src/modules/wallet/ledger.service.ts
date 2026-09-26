import { Injectable } from '@nestjs/common';
import { type Prisma, type WalletAccountKind } from '../../generated/prisma/client.js';

export const PLATFORM = 'PLATFORM';

/** Kinds of ledger transactions; the wallet history (BJ5) is built from them. */
export type LedgerTxType =
  | 'DEMO_BONUS'
  | 'DEMO_EXPIRE'
  | 'ORDER_INCOME'
  | 'TOPUP'
  | 'TOPUP_REFUND'
  | 'SERVICE_FEE'
  | 'REFERRAL_L1'
  | 'REFERRAL_L2'
  | 'WITHDRAWAL'
  | 'WITHDRAWAL_FEE'
  | 'WITHDRAWAL_REFUND'
  | 'WITHDRAWAL_FEE_REFUND';

export interface LedgerEntryInput {
  accountId: string;
  /** Tiyin; positive credits the account, negative debits it. */
  amount: bigint;
}

export interface PostInput {
  type: LedgerTxType;
  idempotencyKey: string;
  orderId?: string | null;
  paymentId?: string | null;
  createdBy?: string | null;
  entries: LedgerEntryInput[];
  /**
   * User accounts this posting may take below zero. Only the service fee at settlement
   * uses it: a shortfall there is recorded as a debt (docs/01 §5) instead of failing.
   */
  allowNegative?: string[];
}

type Tx = Prisma.TransactionClient;

/**
 * Double-entry ledger (CLAUDE.md rules 2-3). The only code that changes balances.
 * Always called inside a DB transaction; every posting has an idempotency key, so a
 * repeated request never moves money twice.
 */
@Injectable()
export class LedgerService {
  /** Account id for an owner (user id or PLATFORM) and kind, created on first use. */
  async accountId(tx: Tx, ownerKey: string, kind: WalletAccountKind): Promise<string> {
    const account = await tx.walletAccount.upsert({
      where: { ownerKey_kind: { ownerKey, kind } },
      create: { ownerKey, kind },
      update: {},
      select: { id: true },
    });
    return account.id;
  }

  /**
   * Posts a balanced transaction. Returns `duplicate: true` without changes when the
   * idempotency key was already used.
   */
  async post(tx: Tx, input: PostInput): Promise<{ transactionId: string; duplicate: boolean }> {
    if (input.entries.length < 2)
      throw new Error('A ledger transaction needs at least two entries');
    if (input.entries.some((entry) => entry.amount === 0n)) throw new Error('Zero ledger entry');
    const sum = input.entries.reduce((total, entry) => total + entry.amount, 0n);
    if (sum !== 0n) throw new Error(`Unbalanced ledger transaction: sum ${sum}`);

    // Serializes postings with the same key, so the existence check below is reliable.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.idempotencyKey}))`;
    const existing = await tx.ledgerTransaction.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true },
    });
    if (existing) return { transactionId: existing.id, duplicate: true };

    // Lock the accounts in a fixed order to avoid deadlocks.
    const accountIds = [...new Set(input.entries.map((entry) => entry.accountId))].sort();
    await tx.$queryRaw`SELECT id FROM wallet_accounts WHERE id = ANY(${accountIds}::uuid[]) ORDER BY id FOR UPDATE`;

    const transaction = await tx.ledgerTransaction.create({
      data: {
        type: input.type,
        idempotencyKey: input.idempotencyKey,
        orderId: input.orderId ?? null,
        paymentId: input.paymentId ?? null,
        createdBy: input.createdBy ?? null,
        entries: { create: input.entries.map(({ accountId, amount }) => ({ accountId, amount })) },
      },
      select: { id: true },
    });
    for (const { accountId, amount } of input.entries) {
      await tx.walletAccount.update({
        where: { id: accountId },
        data: { balance: { increment: amount } },
      });
    }

    // User money accounts never go below zero (docs/01 §11, invariant).
    const negative = await tx.walletAccount.findFirst({
      where: {
        id: { in: accountIds.filter((id) => !input.allowNegative?.includes(id)) },
        ownerKey: { not: PLATFORM },
        balance: { lt: 0n },
      },
      select: { id: true },
    });
    if (negative) throw new Error(`Ledger posting would make account ${negative.id} negative`);

    return { transactionId: transaction.id, duplicate: false };
  }
}
