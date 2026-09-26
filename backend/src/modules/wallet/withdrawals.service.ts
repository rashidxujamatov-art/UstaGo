import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { TIYIN_PER_SOM } from '../../common/money/money.js';
import type { Withdrawal } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { LedgerService, PLATFORM } from './ledger.service.js';
import { WalletService } from './wallet.service.js';
import { type WithdrawQuote, withdrawFee, withdrawQuote } from './withdraw-quote.js';

/**
 * Withdrawals from the REAL account (docs/01-biznes-qoidalar.md §7). The amount goes to
 * PAYOUT_CLEARING until the provider pays it out; the 1% bank fee goes to
 * PAYOUT_PROVIDER_FEES and is never platform revenue (T17). A FAILED payout returns both.
 *
 * Card binding, the payout provider and the endpoint (BJ7) come with stage 4, behind the
 * payout feature flag (§14).
 */
@Injectable()
export class WithdrawalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly wallet: WalletService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /** Limit shown on BJ7 before the user types an amount. */
  async quote(userId: string): Promise<WithdrawQuote> {
    const s = await this.settings.getAll();
    const b = await this.wallet.balances(userId);
    return withdrawQuote({
      real: b.real,
      demoActive: b.demoActive,
      held: b.heldDemo + b.heldReal,
      withdrawFeeBps: s.withdraw_fee_bps,
    });
  }

  /**
   * Books a withdrawal request. `idempotencyKey` comes from the client, so a repeated
   * request returns the same withdrawal instead of taking the money twice.
   */
  async request(userId: string, amount: bigint, idempotencyKey: string): Promise<Withdrawal> {
    if (amount <= 0n || amount % TIYIN_PER_SOM !== 0n) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, { fields: 'amount' });
    }
    const key = `withdrawal:${userId}:${idempotencyKey}`;

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.withdrawal.findUnique({ where: { idempotencyKey: key } });
      if (existing) return existing;

      await this.wallet.lock(tx, userId);
      const s = await this.settings.getAll(tx);
      const b = await this.wallet.balances(userId, tx);
      const limit = withdrawQuote({
        real: b.real,
        demoActive: b.demoActive,
        held: b.heldDemo + b.heldReal,
        withdrawFeeBps: s.withdraw_fee_bps,
      });
      if (amount > limit.max) {
        throw new AppError(
          ErrorCode.WALLET_WITHDRAW_EXCEEDS_LIMIT,
          { must_keep: limit.mustKeep, max: limit.max, fee: limit.maxFee },
          HttpStatus.CONFLICT,
        );
      }

      const fee = withdrawFee(amount, s.withdraw_fee_bps);
      const withdrawal = await tx.withdrawal.create({
        data: { userId, amount, fee, feeBps: s.withdraw_fee_bps, idempotencyKey: key },
      });
      const real = await this.ledger.accountId(tx, userId, 'REAL');
      await this.ledger.post(tx, {
        type: 'WITHDRAWAL',
        idempotencyKey: `withdrawal:${withdrawal.id}`,
        createdBy: userId,
        entries: [
          { accountId: real, amount: -amount },
          { accountId: await this.ledger.accountId(tx, PLATFORM, 'PAYOUT_CLEARING'), amount },
        ],
      });
      if (fee > 0n) {
        await this.ledger.post(tx, {
          type: 'WITHDRAWAL_FEE',
          idempotencyKey: `withdrawal:${withdrawal.id}:fee`,
          createdBy: userId,
          entries: [
            { accountId: real, amount: -fee },
            {
              accountId: await this.ledger.accountId(tx, PLATFORM, 'PAYOUT_PROVIDER_FEES'),
              amount: fee,
            },
          ],
        });
      }
      await this.audit.log(
        {
          actorId: userId,
          actorType: 'USER',
          action: 'wallet.withdrawal_request',
          entityType: 'withdrawal',
          entityId: withdrawal.id,
          data: { amount: amount.toString(), fee: fee.toString() },
        },
        tx,
      );
      return withdrawal;
    });
  }

  /** The provider rejected the payout: amount and bank fee go back to REAL (§7). */
  async markFailed(withdrawalId: string, reason: string): Promise<Withdrawal> {
    return this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM withdrawals WHERE id = ${withdrawalId}::uuid FOR UPDATE`;
      if (!row) throw new AppError(ErrorCode.NOT_FOUND, {}, HttpStatus.NOT_FOUND);
      const withdrawal = await tx.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
      if (withdrawal.status === 'FAILED') return withdrawal;
      if (withdrawal.status === 'PAID') {
        throw new AppError(ErrorCode.VALIDATION_FAILED, { fields: 'status' }, HttpStatus.CONFLICT);
      }

      await this.wallet.lock(tx, withdrawal.userId);
      const real = await this.ledger.accountId(tx, withdrawal.userId, 'REAL');
      await this.ledger.post(tx, {
        type: 'WITHDRAWAL_REFUND',
        idempotencyKey: `withdrawal:${withdrawal.id}:refund`,
        entries: [
          {
            accountId: await this.ledger.accountId(tx, PLATFORM, 'PAYOUT_CLEARING'),
            amount: -withdrawal.amount,
          },
          { accountId: real, amount: withdrawal.amount },
        ],
      });
      if (withdrawal.fee > 0n) {
        await this.ledger.post(tx, {
          type: 'WITHDRAWAL_FEE_REFUND',
          idempotencyKey: `withdrawal:${withdrawal.id}:fee-refund`,
          entries: [
            {
              accountId: await this.ledger.accountId(tx, PLATFORM, 'PAYOUT_PROVIDER_FEES'),
              amount: -withdrawal.fee,
            },
            { accountId: real, amount: withdrawal.fee },
          ],
        });
      }
      const failed = await tx.withdrawal.update({
        where: { id: withdrawal.id },
        data: { status: 'FAILED', failureReason: reason },
      });
      await this.audit.log(
        {
          actorType: 'SYSTEM',
          action: 'wallet.withdrawal_failed',
          entityType: 'withdrawal',
          entityId: withdrawal.id,
          data: { reason },
        },
        tx,
      );
      return failed;
    });
  }
}
