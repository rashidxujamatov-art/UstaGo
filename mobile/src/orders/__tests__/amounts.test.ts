import { netIncome, topUpOptions } from '../amounts';

describe('BJ3 top-up chips', () => {
  it('offers the shortfall, then 50 000 and 100 000 so‘m steps above it', () => {
    // 15 500 so‘m short (design example) → 15 500, 50 000, 100 000.
    expect(topUpOptions(1_550_000n)).toEqual([1_550_000n, 5_000_000n, 10_000_000n]);
    // Exactly 50 000 short → 50 000, 100 000, 200 000.
    expect(topUpOptions(5_000_000n)).toEqual([5_000_000n, 10_000_000n, 20_000_000n]);
  });
});

describe('BJ2 net income', () => {
  it('subtracts the fee in tiyin', () => {
    // 180 000 so‘m job, 2.5% fee = 4 500 so‘m → 175 500 so‘m (design example).
    expect(netIncome('18000000', '450000')).toBe(17_550_000n);
  });
});
