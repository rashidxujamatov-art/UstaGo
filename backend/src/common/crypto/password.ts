import { hash, verify } from '@node-rs/argon2';

/**
 * Passwords are stored as argon2id hashes (docs/02-arxitektura.md §10) with the library
 * defaults (m=19 MiB, t=2, p=1 — the OWASP baseline).
 */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Password rule from K2: at least 8 characters with at least one letter and one digit. */
export function isStrongPassword(password: string): boolean {
  return (
    password.length >= 8 &&
    password.length <= 128 &&
    /\p{L}/u.test(password) &&
    /\p{Nd}/u.test(password)
  );
}
