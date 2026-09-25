import {
  formatAmount,
  formatDate,
  formatOrderNumber,
  formatPhone,
  formatTime,
  GROUP_SEPARATOR as S,
  maskPhone,
  MINUS_SIGN,
} from '../format';

describe('formatAmount', () => {
  it('groups thousands with a no-break space (docs/03 §2.3)', () => {
    expect(formatAmount(18_000_000n, 'uz')).toBe(`180${S}000`);
    expect(formatAmount('55275000', 'ru')).toBe(`552${S}750`);
    expect(formatAmount(99_900n, 'tg')).toBe('999');
  });

  it('uses a typographic minus for negative amounts', () => {
    expect(formatAmount(-450_000n, 'uz')).toBe(`${MINUS_SIGN}4${S}500`);
  });

  it('uses commas in English, as on the U4 screen', () => {
    expect(formatAmount(55_275_000n, 'en')).toBe('552,750');
  });

  it('shows tiyin only when there are any', () => {
    expect(formatAmount(100_050n, 'uz')).toBe(`1${S}000,50`);
    expect(formatAmount(100_005n, 'en')).toBe('1,000.05');
  });

  it('never loses precision on large amounts', () => {
    expect(formatAmount('900719925474099312', 'en')).toBe('9,007,199,254,740,993.12');
  });
});

describe('dates in Tashkent time (UTC+5)', () => {
  const instant = new Date('2026-10-18T05:41:00Z');

  it('formats date and time', () => {
    expect(formatDate(instant)).toBe('18.10.2026');
    expect(formatTime(instant)).toBe('10:41');
  });

  it('rolls over to the next day after 19:00 UTC', () => {
    expect(formatDate(new Date('2026-12-31T19:30:00Z'))).toBe('01.01.2027');
    expect(formatTime(new Date('2026-12-31T19:30:00Z'))).toBe('00:30');
  });
});

describe('phones and order numbers', () => {
  it('formats and masks Uzbek numbers', () => {
    expect(formatPhone('+998901234567')).toBe('+998 90 123 45 67');
    expect(formatPhone('998 (93) 555-21-08')).toBe('+998 93 555 21 08');
    expect(maskPhone('+998935552108')).toBe('+998 93 *** 21 08');
  });

  it('leaves other values unchanged', () => {
    expect(formatPhone('+7 999 123 45 67')).toBe('+7 999 123 45 67');
  });

  it('prefixes order numbers with #', () => {
    expect(formatOrderNumber(1024)).toBe('#1024');
  });
});
