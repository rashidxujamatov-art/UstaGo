import { invalidFieldSet, parsePercentToBps, parsePositiveInt } from '../settings-input';

describe('parsePercentToBps', () => {
  it('parses whole and fractional percents (SA2 design examples)', () => {
    expect(parsePercentToBps('2.5')).toBe(250);
    expect(parsePercentToBps('0.25')).toBe(25);
    expect(parsePercentToBps('0.12')).toBe(12);
    expect(parsePercentToBps('1')).toBe(100);
    expect(parsePercentToBps('50')).toBe(5000);
    expect(parsePercentToBps('100')).toBe(10_000);
  });

  it('accepts a comma decimal separator too', () => {
    expect(parsePercentToBps('2,5')).toBe(250);
  });

  it('rejects over 100%, empty and malformed input', () => {
    expect(parsePercentToBps('100.01')).toBeNull();
    expect(parsePercentToBps('101')).toBeNull();
    expect(parsePercentToBps('')).toBeNull();
    expect(parsePercentToBps('abc')).toBeNull();
    expect(parsePercentToBps('1.234')).toBeNull();
  });
});

describe('parsePositiveInt', () => {
  it('parses a plain positive whole number', () => {
    expect(parsePositiveInt('30')).toBe(30);
    expect(parsePositiveInt('300')).toBe(300);
  });

  it('rejects zero, negatives, decimals, leading zeros and empty input', () => {
    expect(parsePositiveInt('0')).toBeNull();
    expect(parsePositiveInt('-1')).toBeNull();
    expect(parsePositiveInt('1.5')).toBeNull();
    expect(parsePositiveInt('01')).toBeNull();
    expect(parsePositiveInt('')).toBeNull();
  });
});

describe('invalidFieldSet', () => {
  it("splits the backend's comma-separated fields param", () => {
    expect(invalidFieldSet('fee_bps,ref_l1_bps')).toEqual(new Set(['fee_bps', 'ref_l1_bps']));
    expect(invalidFieldSet('fee_bps')).toEqual(new Set(['fee_bps']));
  });

  it('is empty for a missing or non-string param', () => {
    expect(invalidFieldSet(undefined).size).toBe(0);
    expect(invalidFieldSet(42).size).toBe(0);
  });
});
