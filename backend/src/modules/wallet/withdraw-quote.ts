import {
  applyBps,
  divide,
  somToTiyin,
  TIYIN_PER_SOM,
  toBigIntRate,
} from '../../common/money/money.js';

export interface WithdrawQuoteInput {
  /** REAL balance, tiyin (may be negative after a dispute: a debt, §5). */
  real: bigint;
  /** Active demo, tiyin: covers the demo part of held fees. */
  demoActive: bigint;
  /** Σ active holds (demo + real parts), tiyin. */
  held: bigint;
  withdrawFeeBps: number;
}

export interface WithdrawQuote {
  /** Fees that must stay in the account for active jobs. */
  mustKeep: bigint;
  /** Largest amount that can be withdrawn with its bank fee on top. */
  max: bigint;
  /** Bank transfer fee of `max`. */
  maxFee: bigint;
}

/**
 * Withdrawal limit (docs/01-biznes-qoidalar.md §7):
 *
 *   must_keep    = MAX(0, Σ active holds − demo_active)
 *   wfee(M)      = ROUND_HALF_UP(M × withdraw_fee_bps / 10 000)
 *   max_withdraw = the largest M with M + wfee(M) ≤ real − must_keep
 *
 * Amounts are whole so'm, in tiyin.
 */
export function withdrawQuote(input: WithdrawQuoteInput): WithdrawQuote {
  const mustKeep = input.held > input.demoActive ? input.held - input.demoActive : 0n;
  const room = input.real - mustKeep;
  if (room <= 0n) return { mustKeep, max: 0n, maxFee: 0n };

  // Whole so'm available; M + wfee(M) is non-decreasing in M, so start near the answer
  // (room / (1 + rate)) and step to the exact boundary.
  const roomSom = room / TIYIN_PER_SOM;
  const bps = toBigIntRate(input.withdrawFeeBps);
  const cost = (som: bigint) => {
    const amount = somToTiyin(som);
    return amount + applyBps(amount, bps, 'HALF_UP');
  };
  let som = divide(roomSom * 10_000n, 10_000n + bps, 'FLOOR');
  while (cost(som + 1n) <= somToTiyin(roomSom)) som += 1n;
  while (som > 0n && cost(som) > somToTiyin(roomSom)) som -= 1n;

  const max = somToTiyin(som);
  return { mustKeep, max, maxFee: applyBps(max, bps, 'HALF_UP') };
}

/** Bank transfer fee for a requested amount (tiyin, whole so'm). */
export function withdrawFee(amount: bigint, withdrawFeeBps: number): bigint {
  return applyBps(amount, withdrawFeeBps, 'HALF_UP');
}
