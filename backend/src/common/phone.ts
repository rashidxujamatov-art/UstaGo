const UZ_MOBILE = /^\+998\d{9}$/;

/**
 * Normalizes an Uzbek phone number to E.164 (+998XXXXXXXXX).
 * Accepts spaces, dashes, brackets and a missing "+". Returns null for anything else.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s()-]/g, '');
  const withPlus = digits.startsWith('+') ? digits : `+${digits}`;
  return UZ_MOBILE.test(withPlus) ? withPlus : null;
}

/** "+998 90 *** ** 67": for screens that show someone else's number (K3d, admin lists). */
export function maskPhone(phone: string): string {
  const match = /^\+998(\d{2})\d{5}(\d{2})$/.exec(phone);
  return match ? `+998 ${match[1]} *** ** ${match[2]}` : '***';
}
