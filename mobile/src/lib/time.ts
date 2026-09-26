/**
 * Tashkent-time helpers for order screens (UTC+5, no daylight saving). Texts such as
 * "Bugun" come from i18n; these functions only pick which one and format numbers.
 */

const OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (value: number) => value.toString().padStart(2, '0');

/** Days between the Tashkent calendar dates of `date` and `now` (0 = today, 1 = tomorrow). */
export function dayOffset(date: Date, now: Date = new Date()): number {
  const day = (d: Date) => Math.floor((d.getTime() + OFFSET_MS) / DAY_MS);
  return day(date) - day(now);
}

export function clock(date: Date): string {
  const shifted = new Date(date.getTime() + OFFSET_MS);
  return `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

export function shortDate(date: Date): string {
  const shifted = new Date(date.getTime() + OFFSET_MS);
  return `${pad(shifted.getUTCDate())}.${pad(shifted.getUTCMonth() + 1)}`;
}

export type DayLabel =
  { key: 'common.today' | 'common.tomorrow' | 'common.yesterday' } | { date: string };

/** "Bugun" / "Ertaga" / "Kecha" or "21.09". */
export function dayLabel(date: Date, now: Date = new Date()): DayLabel {
  const offset = dayOffset(date, now);
  if (offset === 0) return { key: 'common.today' };
  if (offset === 1) return { key: 'common.tomorrow' };
  if (offset === -1) return { key: 'common.yesterday' };
  return { date: shortDate(date) };
}

/** Time of a list row (BY1): "13:40" today, otherwise the day label. */
export function listTime(date: Date, now: Date = new Date()): DayLabel | { time: string } {
  return dayOffset(date, now) === 0 ? { time: clock(date) } : dayLabel(date, now);
}

export type Ago =
  | { key: 'common.justNow' }
  | { key: 'common.minutesAgo' | 'common.hoursAgo'; n: number }
  | DayLabel;

/** "2 daqiqa oldin" (BJ1 cards, BJ2 subtitle). */
export function ago(date: Date, now: Date = new Date()): Ago {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return { key: 'common.justNow' };
  if (minutes < 60) return { key: 'common.minutesAgo', n: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { key: 'common.hoursAgo', n: hours };
  return dayLabel(date, now);
}

/** Start of a Tashkent day plus minutes, as an absolute Date. */
export function tashkentDateTime(
  dayFromToday: number,
  minutes: number,
  now: Date = new Date(),
): Date {
  const todayStart = Math.floor((now.getTime() + OFFSET_MS) / DAY_MS) * DAY_MS - OFFSET_MS;
  return new Date(todayStart + dayFromToday * DAY_MS + minutes * 60_000);
}

/** Step of the time sheet (BY2 "Qachon"). */
export const SLOT_MINUTES = 30;
const LAST_SLOT = 24 * 60 - SLOT_MINUTES;

/** "10:30" for minutes after midnight. */
export function minutesLabel(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** Minutes after midnight (Tashkent) of `date`. */
export function tashkentMinutes(date: Date): number {
  const shifted = new Date(date.getTime() + OFFSET_MS);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** Start times offered for a day: every 30 minutes; today only those still ahead. */
export function startSlots(dayFromToday: number, now: Date = new Date()): number[] {
  const first =
    dayFromToday === 0 ? Math.ceil((tashkentMinutes(now) + 1) / SLOT_MINUTES) * SLOT_MINUTES : 0;
  const slots: number[] = [];
  for (let minutes = first; minutes < LAST_SLOT; minutes += SLOT_MINUTES) slots.push(minutes);
  return slots;
}

/** End times after a start, up to the last slot of the day. */
export function endSlots(start: number): number[] {
  const slots: number[] = [];
  for (let minutes = start + SLOT_MINUTES; minutes <= LAST_SLOT; minutes += SLOT_MINUTES) {
    slots.push(minutes);
  }
  return slots;
}

/** Distance label value: 1.2 (km, one decimal, §3.4). */
export function kmValue(meters: number): string {
  return (Math.round(meters / 100) / 10).toFixed(1);
}
