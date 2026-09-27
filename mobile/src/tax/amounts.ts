/**
 * BJ8 "500 000 so‘mlik misol": GTM's fee comes from the `fee_bps` setting (never hard-coded,
 * CLAUDE.md rule 7); the illustrative tax share is a fixed 1% for both methods, matching the
 * example in docs/01-biznes-qoidalar.md §9 ("GTM 12 500 so‘m oladi, soliq 5 000 so‘m").
 * Bigint only — money is never a JS number (CLAUDE.md rule 1).
 */

const EXAMPLE_SOM = 500_000n;
const EXAMPLE_AMOUNT_TIYIN = EXAMPLE_SOM * 100n;
/** docs/01 §9: the tax share shown in the example (not a GTM rate, so it is not a setting). */
const EXAMPLE_TAX_BPS = 100n;
const BPS_DENOMINATOR = 10_000n;

/** `ROUND_HALF_UP(amount × bps / 10 000)`, whole so‘m, returned in tiyin (docs/01 §6). */
function applyBpsHalfUp(amountTiyin: bigint, bps: bigint): bigint {
  const som = amountTiyin / 100n;
  const numerator = som * bps;
  const quotient = numerator / BPS_DENOMINATOR;
  const remainder = numerator % BPS_DENOMINATOR;
  const roundedSom = remainder * 2n >= BPS_DENOMINATOR ? quotient + 1n : quotient;
  return roundedSom * 100n;
}

export interface TaxMethodExample {
  /** Tiyin. */
  amount: bigint;
  /** Tiyin: what GTM's service fee takes from the example. */
  fee: bigint;
  /** Tiyin: the illustrative tax share of the example. */
  tax: bigint;
}

/** BJ8: the 500 000 so‘m example for both tax methods, computed from the live `fee_bps`. */
export function taxMethodExample(feeBps: number): TaxMethodExample {
  return {
    amount: EXAMPLE_AMOUNT_TIYIN,
    fee: applyBpsHalfUp(EXAMPLE_AMOUNT_TIYIN, BigInt(feeBps)),
    tax: applyBpsHalfUp(EXAMPLE_AMOUNT_TIYIN, EXAMPLE_TAX_BPS),
  };
}
