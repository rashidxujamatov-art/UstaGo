import {
  birthDateToIso,
  formatBirthDateInput,
  formatCountdown,
  formatDocNumber,
  formatLocalPhone,
  initials,
  isStrongPassword,
  isValidDocNumber,
  isValidEmail,
  phoneDigits,
  priceDigits,
  somDigitsToTiyin,
  toE164,
} from '../input';

describe('phone input', () => {
  it('keeps the 9 local digits, also from a pasted +998 number', () => {
    expect(phoneDigits('90 123-45-67')).toBe('901234567');
    expect(phoneDigits('+998 90 123 45 67')).toBe('901234567');
    expect(phoneDigits('9012345678999')).toBe('901234567');
  });

  it('formats as the user types', () => {
    expect(formatLocalPhone('90')).toBe('90');
    expect(formatLocalPhone('90123')).toBe('90 123');
    expect(formatLocalPhone('901234567')).toBe('90 123 45 67');
  });

  it('builds E.164 only from a full number', () => {
    expect(toE164('901234567')).toBe('+998901234567');
    expect(toE164('90123')).toBeNull();
  });
});

describe('password and email', () => {
  it('matches the backend password rule', () => {
    expect(isStrongPassword('parol123')).toBe(true);
    expect(isStrongPassword('parolparol')).toBe(false);
    expect(isStrongPassword('12345678')).toBe(false);
    expect(isStrongPassword('p1')).toBe(false);
  });

  it('checks the email shape', () => {
    expect(isValidEmail('aziza.yusupova@mail.uz')).toBe(true);
    expect(isValidEmail('aziza@mail')).toBe(false);
  });
});

describe('birth date (K3b)', () => {
  const today = new Date('2026-09-26T00:00:00Z');

  it('masks DD.MM.YYYY', () => {
    expect(formatBirthDateInput('12051987')).toBe('12.05.1987');
    expect(formatBirthDateInput('1205')).toBe('12.05');
  });

  it('converts to ISO and rejects impossible or future dates', () => {
    expect(birthDateToIso('12.05.1987', today)).toBe('1987-05-12');
    expect(birthDateToIso('31.02.1990', today)).toBeNull();
    expect(birthDateToIso('01.01.2030', today)).toBeNull();
    expect(birthDateToIso('12.05.87', today)).toBeNull();
  });
});

describe('document number (K3b)', () => {
  it('formats series and number as "AD 1234567"', () => {
    expect(formatDocNumber('ad1234567')).toBe('AD 1234567');
    expect(formatDocNumber('A')).toBe('A');
    expect(formatDocNumber('AD12345678')).toBe('AD 1234567');
    expect(isValidDocNumber('AD 1234567')).toBe(true);
    expect(isValidDocNumber('AD 123456')).toBe(false);
  });
});

describe('misc', () => {
  it('makes initials and countdowns', () => {
    expect(initials('Bekzod', 'Rahimov')).toBe('BR');
    expect(initials(null, null)).toBe('?');
    expect(formatCountdown(42)).toBe('0:42');
    expect(formatCountdown(61.2)).toBe('1:02');
  });
});

describe('price input (BY2)', () => {
  it('keeps whole so‘m digits without leading zeros', () => {
    expect(priceDigits('500 000 so‘m')).toBe('500000');
    expect(priceDigits('007')).toBe('7');
    expect(priceDigits('1234567890123456')).toBe('123456789012');
  });

  it('sends the price in tiyin', () => {
    expect(somDigitsToTiyin('500000')).toBe('50000000');
    expect(somDigitsToTiyin('')).toBeNull();
  });
});
