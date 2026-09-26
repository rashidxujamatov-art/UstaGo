import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { Env } from '../../config/env.js';
import type { Withdrawal } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import { withdrawFee, withdrawQuote } from '../wallet/withdraw-quote.js';
import { WithdrawalsService } from '../wallet/withdrawals.service.js';
import { CardsService } from './cards.service.js';
import { PAYOUT_PROVIDER, type PayoutProvider } from './payout.provider.js';

export const PAYOUTS_QUEUE = 'payouts';
export const PAYOUT_JOB = 'payout-process';

export interface WithdrawPreview {
  /** Tiyin strings. */
  real: string;
  must_keep: string;
  max: string;
  max_fee: string;
  fee_bps: number;
  /** Fee for the requested amount, when one was given. */
  fee: string | null;
  /** Service fees reserved for active jobs (BJ7 "Xizmat haqi 2.5% · #1107"). */
  holds: { order_number: number; price: string; fee: string; fee_bps: number | null }[];
  enabled: boolean;
}

export interface WithdrawalView {
  id: string;
  amount: string;
  fee: string;
  status: Withdrawal['status'];
  card_id: string | null;
  created_at: string;
}

/**
 * Withdrawals to a saved card (BJ7, docs/01-biznes-qoidalar.md §7). The request books the
 * money (WithdrawalsService); the payout job sends it and refunds on failure. Everything
 * stays behind FEATURE_PAYOUTS_ENABLED until the legal scheme is approved (§14).
 */
@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly settings: SettingsService,
    private readonly wallet: WalletService,
    private readonly withdrawals: WithdrawalsService,
    private readonly cards: CardsService,
    @Inject(PAYOUT_PROVIDER) private readonly provider: PayoutProvider,
    @InjectQueue(PAYOUTS_QUEUE) private readonly queue: Queue,
  ) {}

  async preview(userId: string, amount?: bigint): Promise<WithdrawPreview> {
    const [s, b, holds] = await Promise.all([
      this.settings.getAll(),
      this.wallet.balances(userId),
      this.prisma.walletHold.findMany({
        where: { userId, status: 'ACTIVE' },
        select: {
          amountDemo: true,
          amountReal: true,
          order: { select: { number: true, price: true, feeBpsSnapshot: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const quote = withdrawQuote({
      real: b.real,
      demoActive: b.demoActive,
      held: b.heldDemo + b.heldReal,
      withdrawFeeBps: s.withdraw_fee_bps,
    });
    return {
      real: b.real.toString(),
      must_keep: quote.mustKeep.toString(),
      max: quote.max.toString(),
      max_fee: quote.maxFee.toString(),
      fee_bps: s.withdraw_fee_bps,
      fee: amount === undefined ? null : withdrawFee(amount, s.withdraw_fee_bps).toString(),
      holds: holds.map((hold) => ({
        order_number: hold.order.number,
        price: hold.order.price.toString(),
        fee: (hold.amountDemo + hold.amountReal).toString(),
        fee_bps: hold.order.feeBpsSnapshot,
      })),
      enabled: this.config.get('FEATURE_PAYOUTS_ENABLED', { infer: true }),
    };
  }

  /** BJ7 "Yechib olish": books the withdrawal and queues the payout. */
  async request(
    userId: string,
    input: { amount: bigint; cardId: string; idempotencyKey: string },
  ): Promise<WithdrawalView> {
    if (!this.config.get('FEATURE_PAYOUTS_ENABLED', { infer: true })) {
      throw new AppError(ErrorCode.WITHDRAWALS_DISABLED, {}, HttpStatus.SERVICE_UNAVAILABLE);
    }
    // A blocked user may withdraw, but not while a dispute of theirs is open (§1).
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { status: true },
    });
    if (user.status === 'BLOCKED') {
      const disputed = await this.prisma.order.count({
        where: { status: 'DISPUTED', OR: [{ customerId: userId }, { executorId: userId }] },
      });
      if (disputed > 0) throw new AppError(ErrorCode.USER_BLOCKED, {}, HttpStatus.FORBIDDEN);
    }
    await this.cards.token(userId, input.cardId); // the card must be the user's and verified
    const withdrawal = await this.withdrawals.request(
      userId,
      input.amount,
      input.idempotencyKey,
      input.cardId,
    );
    await this.queue.add(
      PAYOUT_JOB,
      { withdrawalId: withdrawal.id },
      { jobId: withdrawal.id, attempts: 5, backoff: { type: 'exponential', delay: 30_000 } },
    );
    return view(withdrawal);
  }

  /** Sends one requested withdrawal to the provider (payout job). */
  async process(withdrawalId: string): Promise<Withdrawal | null> {
    const withdrawal = await this.withdrawals.claim(withdrawalId);
    if (!withdrawal) return null;
    if (!withdrawal.cardId) return this.withdrawals.markFailed(withdrawal.id, 'no card');
    const { token } = await this.cards.token(withdrawal.userId, withdrawal.cardId);
    const result = await this.provider.send({
      withdrawalId: withdrawal.id,
      cardToken: token,
      amount: withdrawal.amount,
    });
    if (result.status === 'PAID') return this.withdrawals.markPaid(withdrawal.id, result.ref);
    this.logger.warn(`Payout ${withdrawal.id} failed: ${result.reason ?? 'unknown'}`);
    return this.withdrawals.markFailed(withdrawal.id, result.reason ?? 'payout failed');
  }
}

function view(withdrawal: Withdrawal): WithdrawalView {
  return {
    id: withdrawal.id,
    amount: withdrawal.amount.toString(),
    fee: withdrawal.fee.toString(),
    status: withdrawal.status,
    card_id: withdrawal.cardId,
    created_at: withdrawal.createdAt.toISOString(),
  };
}
