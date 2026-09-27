/**
 * SA2 "Komissiya va to'lovlar" field parsing. Percents are bps (CLAUDE.md rule 1: "Foizlar
 * bps'da saqlanadi"); everything here is integer arithmetic, no floating point.
 */

const BPS_MAX = 10_000; // 100.00%

/** "2.5" → 250, "0.25" → 25, "50" → 5000. Returns null for anything else, or over 100%. */
export function parsePercentToBps(text: string): number | null {
  const match = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const whole = match[1] ?? '0';
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const bps = Number(whole) * 100 + Number(fraction);
  return bps <= BPS_MAX ? bps : null;
}

/** A positive whole count (seconds, hours, days) — no leading zeros, no decimals. */
export function parsePositiveInt(text: string): number | null {
  const trimmed = text.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

/** `VALIDATION_FAILED` params from `PUT /sa/settings`: `{ fields: "fee_bps,ref_l1_bps" }`. */
export function invalidFieldSet(fields: unknown): ReadonlySet<string> {
  return new Set(typeof fields === 'string' ? fields.split(',').map((f) => f.trim()) : []);
}
