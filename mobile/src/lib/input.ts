/**
 * Input masks and checks for the sign-up screens. The backend validates everything again;
 * these only help the user type and give instant feedback.
 */

/** The 9 digits after +998, from whatever the user typed or pasted. */
export function phoneDigits(text: string): string {
  let digits = text.replace(/\D/g, '');
  if (digits.startsWith('998') && digits.length > 9) digits = digits.slice(3);
  return digits.slice(0, 9);
}

/** "901234567" → "90 123 45 67" (partial input is formatted as far as it goes). */
export function formatLocalPhone(digits: string): string {
  const parts = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)];
  return parts.filter(Boolean).join(' ');
}

export function toE164(digits: string): string | null {
  return /^\d{9}$/.test(digits) ? `+998${digits}` : null;
}

/** Same rule as the backend (K2): 8+ characters, at least one letter and one digit. */
export function isStrongPassword(password: string): boolean {
  return (
    password.length >= 8 && password.length <= 128 && /\p{L}/u.test(password) && /\d/.test(password)
  );
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/** Masks a birth date as DD.MM.YYYY while typing. */
export function formatBirthDateInput(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('.');
}

/** "12.05.1987" → "1987-05-12"; null for impossible or future dates. */
export function birthDateToIso(text: string, today: Date = new Date()): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
  if (!match) return null;
  const [, dd, mm, yyyy] = match as unknown as [string, string, string, string];
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  const valid =
    date.getUTCFullYear() === Number(yyyy) &&
    date.getUTCMonth() === Number(mm) - 1 &&
    date.getUTCDate() === Number(dd) &&
    Number(yyyy) >= 1900 &&
    date.getTime() <= today.getTime();
  return valid ? `${yyyy}-${mm}-${dd}` : null;
}

/** Document series and number as shown on K3b: "AD 1234567". */
export function formatDocNumber(text: string): string {
  const raw = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const series = raw.slice(0, 2).replace(/[^A-Z]/g, '');
  const number = series.length === 2 ? raw.slice(2).replace(/\D/g, '').slice(0, 7) : '';
  return number ? `${series} ${number}` : series;
}

export function isValidDocNumber(formatted: string): boolean {
  return /^[A-Z]{2} \d{7}$/.test(formatted);
}

/** "Bekzod", "Rahimov" → "BR". */
export function initials(firstName?: string | null, lastName?: string | null): string {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

/** Seconds as m:ss for the resend timer ("0:42"). */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

/** Longest price the BY2 field accepts, in whole so‘m digits (999 999 999 999). */
const PRICE_MAX_DIGITS = 12;

/** Whole so‘m typed in the price field: digits only, no leading zeros. */
export function priceDigits(text: string): string {
  return text.replace(/\D/g, '').replace(/^0+/, '').slice(0, PRICE_MAX_DIGITS);
}

/** Whole so‘m digits → tiyin string for the API ("500000" → "50000000"); null when empty. */
export function somDigitsToTiyin(digits: string): string | null {
  return /^[1-9]\d*$/.test(digits) ? `${digits}00` : null;
}
