import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { PaymentMethod, Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { type FeeSplit, splitFee } from './fee-split.js';
import { type LedgerEntryInput, LedgerService, PLATFORM } from './ledger.service.js';
import { WalletService } from './wallet.service.js';

type Tx = Prisma.TransactionClient;

/** The order fields settlement needs; the caller has locked the order row. */
export interface SettleOrder {
  id: string;
  price: bigint;
  paymentMethod: PaymentMethod;
  customerId: string;
  executorId: string;
  fee: bigint | null;
  feeDemo: bigint | null;
  feeReal: bigint | null;
  feeBpsSnapshot: number | null;
  refL1BpsSnapshot: number | null;
  refL2BpsSnapshot: number | null;
}

export interface Settlement extends FeeSplit {
  fee: bigint;
  feeDemo: bigint;
  feeReal: bigint;
  /** Executor income booked by GTM (online methods); 0 for cash and Xolis. */
  income: bigint;
  l1UserId: string | null;
  l2UserId: string | null;
}

/** Methods whose money passes through GTM (§5 step 1). */
const ONLINE_METHODS: readonly PaymentMethod[] = ['BALANCE', 'CLICK', 'PAYME', 'CARD'];

/**
 * Settlement of a paid order (docs/01-biznes-qoidalar.md §5, §6), inside the caller's
 * transaction:
 *
 * 1. online methods: the price goes to the executor's REAL account — from the customer's
 *    REAL account (BALANCE) or from the provider clearing account (Click, Payme, card);
 * 2. the fee fixed at acceptance is charged: fee_demo from DEMO to DEMO_SINK (not
 *    revenue), fee_real from REAL to PLATFORM_REVENUE; the hold is closed;
 * 3. referral: L1 and L2 get their share on REAL — the real part out of the platform
 *    share, the demo part from PLATFORM_MARKETING.
 *
 * Each step is its own idempotent ledger transaction (keys `order:{id}:…`), which also
 * gives the wallet history one row per movement.
 */
@Injectable()
export class SettlementService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly wallet: WalletService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  async settle(tx: Tx, order: SettleOrder, actorId: string | null): Promise<Settlement> {
    const online = ONLINE_METHODS.includes(order.paymentMethod);
    const payer = order.paymentMethod === 'BALANCE' ? order.customerId : null;
    // Lock both wallets in a fixed order (CLAUDE.md rule 3; no deadlocks between orders).
    for (const userId of [order.executorId, payer].filter(isString).sort()) {
      await this.wallet.lock(tx, userId);
    }

    const acc = (owner: string, kind: Parameters<LedgerService['accountId']>[2]) =>
      this.ledger.accountId(tx, owner, kind);
    const executorReal = await acc(order.executorId, 'REAL');

    // 1. Income.
    const income = online ? order.price : 0n;
    if (online) {
      let source: string;
      if (payer) {
        const { real } = await this.wallet.balances(payer, tx);
        if (real < order.price) {
          throw new AppError(
            ErrorCode.WALLET_INSUFFICIENT_FUNDS,
            { shortfall: order.price - real },
            HttpStatus.CONFLICT,
          );
        }
        source = await acc(payer, 'REAL');
      } else {
        source = await acc(PLATFORM, 'PAYMENT_CLEARING');
      }
      await this.ledger.post(tx, {
        type: 'ORDER_INCOME',
        idempotencyKey: `order:${order.id}:income`,
        orderId: order.id,
        createdBy: actorId,
        entries: [
          { accountId: source, amount: -order.price },
          { accountId: executorReal, amount: order.price },
        ],
      });
    }

    // 2. Service fee, exactly as reserved at acceptance (§4: later rate or free-period
    // changes do not affect it).
    const fee = order.fee ?? 0n;
    const feeDemo = order.feeDemo ?? 0n;
    const feeReal = order.feeReal ?? 0n;
    if (fee > 0n) {
      const entries: LedgerEntryInput[] = [];
      if (feeDemo > 0n) {
        entries.push({ accountId: await acc(order.executorId, 'DEMO'), amount: -feeDemo });
        entries.push({ accountId: await acc(PLATFORM, 'DEMO_SINK'), amount: feeDemo });
      }
      if (feeReal > 0n) {
        entries.push({ accountId: executorReal, amount: -feeReal });
        entries.push({ accountId: await acc(PLATFORM, 'PLATFORM_REVENUE'), amount: feeReal });
      }
      await this.ledger.post(tx, {
        type: 'SERVICE_FEE',
        idempotencyKey: `order:${order.id}:fee`,
        orderId: order.id,
        createdBy: actorId,
        entries,
        // A shortfall here can only follow a dispute; it stays as a debt (§5).
        allowNegative: [executorReal],
      });
    }
    await tx.walletHold.updateMany({
      where: { orderId: order.id, status: 'ACTIVE' },
      data: { status: 'SETTLED', closedAt: new Date() },
    });

    // 3. Referral chain, fixed at registration (§6). Blocked referrers get nothing.
    const executor = await tx.user.findUniqueOrThrow({
      where: { id: order.executorId },
      select: {
        referrer: {
          select: {
            id: true,
            status: true,
            referrer: { select: { id: true, status: true } },
          },
        },
      },
    });
    const l1 = executor.referrer?.status === 'ACTIVE' ? executor.referrer : null;
    const l2Candidate = executor.referrer?.referrer ?? null;
    const l2 = l2Candidate?.status === 'ACTIVE' ? l2Candidate : null;

    const s = await this.settings.getAll(tx);
    const split = splitFee({
      fee,
      feeDemo,
      feeReal,
      feeBps: order.feeBpsSnapshot ?? s.fee_bps,
      refL1Bps: order.refL1BpsSnapshot ?? s.ref_l1_bps,
      refL2Bps: order.refL2BpsSnapshot ?? s.ref_l2_bps,
      hasL1: l1 !== null,
      hasL2: l2 !== null,
      refOnDemoFee: s.ref_on_demo_fee,
    });

    for (const [level, referrer, share] of [
      ['L1', l1, split.l1],
      ['L2', l2, split.l2],
    ] as const) {
      if (!referrer || share.total === 0n) continue;
      const entries: LedgerEntryInput[] = [
        { accountId: await acc(referrer.id, 'REAL'), amount: share.total },
      ];
      if (share.real > 0n) {
        entries.push({ accountId: await acc(PLATFORM, 'PLATFORM_REVENUE'), amount: -share.real });
      }
      if (share.marketing > 0n) {
        entries.push({
          accountId: await acc(PLATFORM, 'PLATFORM_MARKETING'),
          amount: -share.marketing,
        });
      }
      await this.ledger.post(tx, {
        type: level === 'L1' ? 'REFERRAL_L1' : 'REFERRAL_L2',
        idempotencyKey: `order:${order.id}:ref-${level.toLowerCase()}`,
        orderId: order.id,
        createdBy: actorId,
        entries,
      });
    }

    const result: Settlement = {
      ...split,
      fee,
      feeDemo,
      feeReal,
      income,
      l1UserId: l1?.id ?? null,
      l2UserId: l2?.id ?? null,
    };
    await this.audit.log(
      {
        actorId,
        actorType: actorId ? 'USER' : 'SYSTEM',
        action: 'wallet.settlement',
        entityType: 'order',
        entityId: order.id,
        data: {
          method: order.paymentMethod,
          income: income.toString(),
          fee: fee.toString(),
          feeDemo: feeDemo.toString(),
          feeReal: feeReal.toString(),
          refL1: split.l1.total.toString(),
          refL2: split.l2.total.toString(),
          platform: split.platform.toString(),
          marketing: split.marketing.toString(),
        },
      },
      tx,
    );
    return result;
  }
}

function isString(value: string | null): value is string {
  return value !== null;
}
