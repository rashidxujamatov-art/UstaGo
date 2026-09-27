/**
 * SA1/SA4 finance breakdown math. Integer-only (CLAUDE.md rule 1): money stays bigint,
 * percentages stay bps. Nothing here computes a ledger amount — the backend already
 * returns every money field; this only derives the display-only splits and ratios.
 */

/** fee_bps − ref_l1_bps − ref_l2_bps: the platform's own share of the commission (SA1/SA2). */
export function netBps(feeBps: number, refL1Bps: number, refL2Bps: number): number {
  return feeBps - refL1Bps - refL2Bps;
}

/** commission_real − referral.l1 − referral.l2, tiyin (the "Platforma" breakdown row, SA1). */
export function platformShare(
  commissionReal: string | bigint,
  refL1: string | bigint,
  refL2: string | bigint,
): bigint {
  const toBig = (value: string | bigint) => (typeof value === 'bigint' ? value : BigInt(value));
  return toBig(commissionReal) - toBig(refL1) - toBig(refL2);
}

/**
 * Integer-only ratio of two tiyin amounts, in bps (0–10 000), for a display-only proportion
 * (the SA1 progress bar). Never used for money math, only for a visual share. 0 when `whole`
 * is 0, so a bar with no data yet renders empty instead of throwing.
 */
export function sharePercentBps(part: string | bigint, whole: string | bigint): number {
  const toBig = (value: string | bigint) => (typeof value === 'bigint' ? value : BigInt(value));
  const wholeAmount = toBig(whole);
  if (wholeAmount === 0n) return 0;
  return Number((toBig(part) * 10_000n) / wholeAmount);
}

/** Asia/Tashkent is UTC+5 all year (docs/02 §11), same constant `lib/format.ts` uses. */
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * SA1/SA4 "Bugun/Hafta/Oy" segmented period, as a Tashkent-local day/ISO-week/calendar-month
 * window ending now. `GET /sa/finance/orders` always takes an explicit `from`/`to` (no period
 * shorthand, stage7-contract §10), so the screens compute it client-side from the same three
 * choices `GET /sa/dashboard` and `GET /sa/finance/summary` accept as `period`.
 */
export function periodRange(
  period: 'today' | 'week' | 'month',
  now: Date = new Date(),
): { from: string; to: string } {
  const shifted = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  const startOfToday = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  const startShiftedMs =
    period === 'today'
      ? startOfToday
      : period === 'week'
        ? startOfToday - ((shifted.getUTCDay() + 6) % 7) * DAY_MS // Monday start
        : Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1);
  return {
    from: new Date(startShiftedMs - TASHKENT_OFFSET_MS).toISOString(),
    to: now.toISOString(),
  };
}
