/** Round-up steps for the extra top-up chips on BJ3 (50 000 and 100 000 so‘m, in tiyin). */
const TOP_UP_STEPS = [5_000_000n, 10_000_000n];

/** Top-up suggestions: the exact shortfall, then round amounts above it (BJ3 chips). */
export function topUpOptions(shortfall: bigint): bigint[] {
  const options = [shortfall];
  for (const step of TOP_UP_STEPS) {
    const previous = options.at(-1) ?? shortfall;
    options.push(((previous + step) / step) * step);
  }
  return options;
}

/** What the executor keeps from the job after the service fee (BJ2 "Sof daromadingiz"). */
export function netIncome(price: string, fee: string): bigint {
  return BigInt(price) - BigInt(fee);
}
