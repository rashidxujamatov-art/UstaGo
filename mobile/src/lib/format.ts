import type { Language } from '../i18n/languages';

/**
 * Display formats from docs/03-ekranlar-va-dizayn.md §2.3. Implemented by hand on
 * purpose: Hermes' Intl support differs between platforms (docs/02-arxitektura.md §11).
 *
 * Money arrives from the API as a decimal string of tiyin and is handled as bigint;
 * JS numbers are never used for money (CLAUDE.md rule 1).
 */

const TIYIN_PER_SOM = 100n;
/** No-break space keeps "180 000" on one line. */
export const GROUP_SEPARATOR = ' ';
/** Typographic minus, as in "−4 500 so‘m". */
export const MINUS_SIGN = '−';

/** Asia/Tashkent is UTC+5 all year (no daylight saving time). */
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

function groupThousands(digits: string, separator: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/**
 * Formats an amount in tiyin without the currency: "180 000", "−4 500", "1 000,50".
 * English uses "180,000" and "1,000.50" (U4 screen); the currency word comes from
 * the `common.money` translation.
 */
export function formatAmount(tiyin: bigint | string, language: Language): string {
  const value = typeof tiyin === 'bigint' ? tiyin : BigInt(tiyin);
  const negative = value < 0n;
  const absolute = negative ? -value : value;

  const som = absolute / TIYIN_PER_SOM;
  const rest = absolute % TIYIN_PER_SOM;
  const [groupSeparator, decimalSeparator] =
    language === 'en' ? [',', '.'] : [GROUP_SEPARATOR, ','];

  let text = groupThousands(som.toString(), groupSeparator);
  if (rest !== 0n) text += decimalSeparator + rest.toString().padStart(2, '0');
  return negative ? MINUS_SIGN + text : text;
}

function tashkentParts(date: Date) {
  const shifted = new Date(date.getTime() + TASHKENT_OFFSET_MS);
  const pad = (value: number) => value.toString().padStart(2, '0');
  return {
    day: pad(shifted.getUTCDate()),
    month: pad(shifted.getUTCMonth() + 1),
    year: shifted.getUTCFullYear().toString(),
    hours: pad(shifted.getUTCHours()),
    minutes: pad(shifted.getUTCMinutes()),
  };
}

/** "18.10.2026" in Tashkent time. */
export function formatDate(date: Date): string {
  const { day, month, year } = tashkentParts(date);
  return `${day}.${month}.${year}`;
}

/** "10:41" in Tashkent time. */
export function formatTime(date: Date): string {
  const { hours, minutes } = tashkentParts(date);
  return `${hours}:${minutes}`;
}

const UZ_PHONE = /^\+?998(\d{2})(\d{3})(\d{2})(\d{2})$/;

/** "+998 90 123 45 67". Anything that is not a full Uzbek number is returned unchanged. */
export function formatPhone(phone: string): string {
  const match = UZ_PHONE.exec(phone.replace(/[\s()-]/g, ''));
  if (!match) return phone;
  const [, operator, a, b, c] = match;
  return `+998 ${operator} ${a} ${b} ${c}`;
}

/** "+998 93 *** 21 08" — for admin lists and profile headers. */
export function maskPhone(phone: string): string {
  const match = UZ_PHONE.exec(phone.replace(/[\s()-]/g, ''));
  if (!match) return phone;
  const [, operator, , b, c] = match;
  return `+998 ${operator} *** ${b} ${c}`;
}

/** "#1024". */
export function formatOrderNumber(orderNumber: number | bigint | string): string {
  return `#${orderNumber}`;
}
