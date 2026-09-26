/** Asia/Tashkent is UTC+5 all year. */
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Full years between a YYYY-MM-DD birth date and "today" in Tashkent. */
export function ageInYears(birthDate: string, now: Date = new Date()): number {
  const [year, month, day] = birthDate.split('-').map(Number) as [number, number, number];
  const today = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth() + 1;
  const d = today.getUTCDate();
  const hadBirthday = m > month || (m === month && d >= day);
  return y - year - (hadBirthday ? 0 : 1);
}
