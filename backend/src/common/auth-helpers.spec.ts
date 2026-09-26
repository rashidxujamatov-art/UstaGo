import { isStrongPassword } from './crypto/password.js';
import { PinflCipher } from './crypto/pinfl-cipher.js';
import { normalizeCode, randomCode, randomDigits } from './crypto/tokens.js';
import { maskPhone, normalizePhone } from './phone.js';
import { ageInYears } from '../modules/identity/age.js';

describe('normalizePhone', () => {
  it.each([
    ['+998901234567', '+998901234567'],
    ['998 90 123 45 67', '+998901234567'],
    ['+998 (93) 555-21-08', '+998935552108'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['+79991234567', '90 123 45 67', '+99890123456', '+9989012345678', 'abc'])(
    'rejects %s',
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );

  it('masks all but the operator code and the last two digits (K3d)', () => {
    expect(maskPhone('+998901234567')).toBe('+998 90 *** ** 67');
  });
});

describe('isStrongPassword (K2: 8+ characters, a letter and a digit)', () => {
  it.each(['parol123', 'Sal0mDunyo', 'пароль12'])('accepts %s', (password) => {
    expect(isStrongPassword(password)).toBe(true);
  });

  it.each(['short1', 'onlyletters', '12345678', 'a1'.repeat(65)])('rejects %s', (password) => {
    expect(isStrongPassword(password)).toBe(false);
  });
});

describe('codes', () => {
  it('generates numeric SMS codes of the requested length', () => {
    for (let i = 0; i < 50; i += 1) expect(randomDigits(6)).toMatch(/^\d{6}$/);
  });

  it('generates referral codes without look-alike characters', () => {
    for (let i = 0; i < 50; i += 1) expect(randomCode(8)).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  it('normalizes typed codes', () => {
    expect(normalizeCode(' dil-shod 7 ')).toBe('DILSHOD7');
  });
});

describe('PinflCipher (CLAUDE.md rule 9)', () => {
  const cipher = new PinflCipher(Buffer.alloc(32, 7).toString('base64'), 'h'.repeat(48));

  it('round-trips and never stores the plain PINFL', () => {
    const encrypted = cipher.encrypt('31205870123456');
    expect(encrypted.toString('utf8')).not.toContain('31205870123456');
    expect(cipher.decrypt(encrypted)).toBe('31205870123456');
  });

  it('uses a fresh IV every time but a stable hash for duplicate checks', () => {
    expect(cipher.encrypt('31205870123456').equals(cipher.encrypt('31205870123456'))).toBe(false);
    expect(cipher.hash('31205870123456')).toBe(cipher.hash('31205870123456'));
    expect(cipher.hash('31205870123456')).not.toBe(cipher.hash('31205870123457'));
  });

  it('detects tampering', () => {
    const encrypted = cipher.encrypt('31205870123456');
    const last = encrypted.length - 1;
    encrypted.writeUInt8(encrypted.readUInt8(last) ^ 1, last);
    expect(() => cipher.decrypt(encrypted)).toThrow();
  });
});

describe('ageInYears (Tashkent calendar)', () => {
  it('counts full years and the birthday itself', () => {
    const now = new Date('2026-09-26T10:00:00Z');
    expect(ageInYears('2010-09-26', now)).toBe(16);
    expect(ageInYears('2010-09-27', now)).toBe(15);
    expect(ageInYears('1987-05-12', now)).toBe(39);
  });

  it('uses the Tashkent date, not UTC', () => {
    // 20:00 UTC on 25 September is already 26 September in Tashkent.
    expect(ageInYears('2010-09-26', new Date('2026-09-25T20:00:00Z'))).toBe(16);
  });
});
