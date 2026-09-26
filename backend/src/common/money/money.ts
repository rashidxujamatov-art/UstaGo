/**
 * Integer-only money helpers (CLAUDE.md rule 1).
 *
 * - Every amount is a `bigint` in tiyin (1 so'm = 100 tiyin). JS `number` is never used for money.
 * - Rates are integer basis points (1 bps = 0.01%, 2.5% = 250).
 * - Business formulas round to whole so'm and store the result in tiyin
 *   (docs/01-biznes-qoidalar.md §6), so the rounding helpers below work in so'm.
 */

export const TIYIN_PER_SOM = 100n;
export const BPS_DENOMINATOR = 10_000n;

export type Rounding = 'HALF_UP' | 'FLOOR' | 'CEIL';

/** Converts whole so'm to tiyin. */
export function somToTiyin(som: bigint): bigint {
  return som * TIYIN_PER_SOM;
}

/** Parses a decimal string of tiyin (API / JSON transport format). Rejects anything else. */
export function parseTiyin(value: string): bigint {
  if (!/^-?\d+$/.test(value)) {
    throw new RangeError(`Not an integer tiyin amount: "${value}"`);
  }
  return BigInt(value);
}

/** Converts an integer rate (e.g. a bps setting) to bigint, refusing fractions and unsafe values. */
export function toBigIntRate(rate: number | bigint): bigint {
  if (typeof rate === 'bigint') return rate;
  if (!Number.isSafeInteger(rate)) {
    throw new RangeError(`Rate must be a safe integer, got ${rate}`);
  }
  return BigInt(rate);
}

/** `numerator / denominator` for non-negative values with the given rounding. */
export function divide(numerator: bigint, denominator: bigint, rounding: Rounding): bigint {
  if (denominator <= 0n) throw new RangeError('Denominator must be positive');
  if (numerator < 0n) throw new RangeError('Numerator must be non-negative');

  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n) return quotient;

  switch (rounding) {
    case 'FLOOR':
      return quotient;
    case 'CEIL':
      return quotient + 1n;
    case 'HALF_UP':
      return remainder * 2n >= denominator ? quotient + 1n : quotient;
  }
}

/**
 * `amount × numerator / denominator`, rounded to whole so'm, returned in tiyin.
 * Covers every §6 formula, e.g. `ref_l1 = FLOOR(fee × ref_l1_bps / fee_bps)`.
 */
export function mulDivToSom(
  amountTiyin: bigint,
  numerator: number | bigint,
  denominator: number | bigint,
  rounding: Rounding,
): bigint {
  const som = divide(
    amountTiyin * toBigIntRate(numerator),
    toBigIntRate(denominator) * TIYIN_PER_SOM,
    rounding,
  );
  return somToTiyin(som);
}

/** `amount × bps / 10 000`, rounded to whole so'm, returned in tiyin. */
export function applyBps(amountTiyin: bigint, bps: number | bigint, rounding: Rounding): bigint {
  return mulDivToSom(amountTiyin, bps, BPS_DENOMINATOR, rounding);
}

const NO_BREAK_SPACE = String.fromCharCode(0xa0);

/** Whole so'm of a tiyin amount with no-break spaces between thousands ("7 500"). */
export function formatSom(tiyin: bigint): string {
  const som = tiyin / TIYIN_PER_SOM;
  const digits = (som < 0n ? -som : som)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, NO_BREAK_SPACE);
  return som < 0n ? `-${digits}` : digits;
}
