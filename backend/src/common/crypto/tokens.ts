import { createHash, randomBytes, randomInt } from 'node:crypto';

/** Opaque random token (refresh tokens, one-time keys), URL-safe. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Uniformly random numeric code with leading zeros, e.g. an SMS code. */
export function randomDigits(length: number): string {
  let code = '';
  for (let i = 0; i < length; i += 1) code += randomInt(0, 10).toString();
  return code;
}

/** Characters without look-alikes (no 0/O, 1/I/L) for codes people type by hand. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Random human-friendly code, e.g. a referral or invite code. */
export function randomCode(length = 8): string {
  let code = '';
  for (let i = 0; i < length; i += 1) code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  return code;
}

/** Normalizes a code typed by a person: trims, upper-cases, drops spaces and dashes. */
export function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]/g, '');
}
