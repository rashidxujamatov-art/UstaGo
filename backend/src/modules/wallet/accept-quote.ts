import { applyBps } from '../../common/money/money.js';

export interface AcceptQuoteInput {
  /** Order price, tiyin. */
  price: bigint;
  feeBps: number;
  acceptThresholdBps: number;
  /** Executor balances, tiyin. */
  real: bigint;
  demo: bigint;
  /** Sums of the executor's active holds, tiyin. */
  heldDemo: bigint;
  heldReal: bigint;
}

export interface AcceptQuote {
  /** Balance the executor must have to take the job (§4). */
  required: bigint;
  /** real + demo − active holds. */
  available: bigint;
  /** required − available when positive, else 0. */
  shortfall: bigint;
  sufficient: boolean;
  /** Service fee reserved at acceptance and its split (§6). */
  fee: bigint;
  feeDemo: bigint;
  feeReal: bigint;
}

/**
 * Acceptance check and service-fee split (docs/01-biznes-qoidalar.md §4, §6):
 *   required  = CEIL(price × accept_threshold_bps / 10 000)
 *   available = real + demo_active − Σ active holds
 *   fee       = ROUND_HALF_UP(price × fee_bps / 10 000)
 *   fee_demo  = MIN(demo still free of holds, fee); fee_real = fee − fee_demo
 * All results are whole so'm, in tiyin.
 */
export function acceptQuote(input: AcceptQuoteInput): AcceptQuote {
  const required = applyBps(input.price, input.acceptThresholdBps, 'CEIL');
  const available = input.real + input.demo - input.heldDemo - input.heldReal;
  const shortfall = required > available ? required - available : 0n;

  const fee = applyBps(input.price, input.feeBps, 'HALF_UP');
  const demoFree = input.demo > input.heldDemo ? input.demo - input.heldDemo : 0n;
  const feeDemo = demoFree < fee ? demoFree : fee;

  return {
    required,
    available,
    shortfall,
    sufficient: shortfall === 0n,
    fee,
    feeDemo,
    feeReal: fee - feeDemo,
  };
}
