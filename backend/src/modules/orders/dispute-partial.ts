import { applyBps } from '../../common/money/money.js';

export interface PartialDisputeQuoteInput {
  /** Order price at acceptance, tiyin. */
  price: bigint;
  /** Rate snapshotted onto the order at acceptance (CLAUDE.md rule 7) — never today's setting. */
  feeBpsSnapshot: number;
  /** `dispute_partial_bps` (today's setting — the decision uses the rate in effect now). */
  disputePartialBps: number;
  /** The order's `fee_demo` as held today (§4); only ever shrinks, never grows. */
  feeDemo: bigint;
}

export interface PartialDisputeQuote {
  /** New `price`, replacing the original (AD3 "qisman"). */
  price: bigint;
  fee: bigint;
  feeDemo: bigint;
  feeReal: bigint;
}

/**
 * AD3 "qisman (50%)" on a not-yet-paid online order (docs/01 §5, stage 7 decision of
 * 2026-09-27): the order's own price shrinks, and the fee held for it shrinks with it —
 * nothing has been charged yet, so there is nothing to reverse or refund.
 *
 *   price    = ROUND_HALF_UP(price × dispute_partial_bps / 10 000)
 *   fee      = ROUND_HALF_UP(new price × fee_bps_snapshot / 10 000)     (§6)
 *   fee_demo = MIN(old fee_demo, new fee)                                (can only shrink)
 *   fee_real = fee − fee_demo
 */
export function partialDisputeQuote(input: PartialDisputeQuoteInput): PartialDisputeQuote {
  const price = applyBps(input.price, input.disputePartialBps, 'HALF_UP');
  const fee = applyBps(price, input.feeBpsSnapshot, 'HALF_UP');
  const feeDemo = input.feeDemo < fee ? input.feeDemo : fee;
  return { price, fee, feeDemo, feeReal: fee - feeDemo };
}
