import { taxMethodExample } from '../amounts';

describe('BJ8 500 000 so‘m example', () => {
  it('matches the design example at the standard 2.5% fee', () => {
    // docs/01-biznes-qoidalar.md §9: "GTM 12 500 so‘m oladi, soliq 5 000 so‘m".
    expect(taxMethodExample(250)).toEqual({
      amount: 50_000_000n,
      fee: 1_250_000n,
      tax: 500_000n,
    });
  });

  it('recomputes the fee from a different fee_bps setting, tax share unchanged', () => {
    // 3% of 500 000 so‘m = 15 000 so‘m.
    expect(taxMethodExample(300)).toEqual({
      amount: 50_000_000n,
      fee: 1_500_000n,
      tax: 500_000n,
    });
  });

  it('handles a small fee_bps without going through a float', () => {
    expect(taxMethodExample(1).fee).toBe(50n * 100n); // 0.01% of 500 000 so‘m = 50 so‘m
  });
});
