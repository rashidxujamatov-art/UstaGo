import { applyBps, divide, mulDivToSom, parseTiyin, somToTiyin, toBigIntRate } from './money.js';

const som = somToTiyin;

describe('divide', () => {
  it.each([
    [10n, 4n, 'FLOOR', 2n],
    [10n, 4n, 'CEIL', 3n],
    [10n, 4n, 'HALF_UP', 3n], // 2.5 -> 3
    [9n, 4n, 'HALF_UP', 2n], // 2.25 -> 2
    [12n, 4n, 'CEIL', 3n], // exact division is never rounded
    [0n, 7n, 'CEIL', 0n],
  ] as const)('%s / %s (%s) = %s', (numerator, denominator, rounding, expected) => {
    expect(divide(numerator, denominator, rounding)).toBe(expected);
  });

  it('rejects non-positive denominators and negative numerators', () => {
    expect(() => divide(1n, 0n, 'FLOOR')).toThrow(RangeError);
    expect(() => divide(-1n, 2n, 'FLOOR')).toThrow(RangeError);
  });
});

describe('applyBps / mulDivToSom (docs/01-biznes-qoidalar.md §11)', () => {
  it('T6: accept threshold uses CEIL at 250 and 300 bps', () => {
    expect(applyBps(som(800_000n), 250, 'CEIL')).toBe(som(20_000n));
    expect(applyBps(som(800_000n), 300, 'CEIL')).toBe(som(24_000n));
  });

  it('T10: fee rounds half up to whole so‘m, referral shares round down', () => {
    const fee = applyBps(som(123_457n), 250, 'HALF_UP'); // 3 086.425 -> 3 086
    expect(fee).toBe(som(3_086n));
    expect(mulDivToSom(fee, 25, 250, 'FLOOR')).toBe(som(308n)); // 308.6 -> 308
    expect(mulDivToSom(fee, 12, 250, 'FLOOR')).toBe(som(148n)); // 148.128 -> 148
  });

  it('T8: bank transfer fee is 1% rounded half up', () => {
    expect(applyBps(som(99_010n), 100, 'HALF_UP')).toBe(som(990n)); // 990.1 -> 990
  });

  it('always returns whole so‘m in tiyin', () => {
    expect(applyBps(som(1n) + 50n, 250, 'CEIL') % 100n).toBe(0n);
  });
});

describe('parsing', () => {
  it('parses integer tiyin strings only', () => {
    expect(parseTiyin('2500000')).toBe(2_500_000n);
    expect(parseTiyin('-450000')).toBe(-450_000n);
    expect(() => parseTiyin('12.5')).toThrow(RangeError);
    expect(() => parseTiyin('1e3')).toThrow(RangeError);
    expect(() => parseTiyin('')).toThrow(RangeError);
  });

  it('accepts only safe integer rates', () => {
    expect(toBigIntRate(250)).toBe(250n);
    expect(() => toBigIntRate(2.5)).toThrow(RangeError);
    expect(() => toBigIntRate(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });
});
