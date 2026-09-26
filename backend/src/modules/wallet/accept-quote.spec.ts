import { somToTiyin as som } from '../../common/money/money.js';
import { acceptQuote } from './accept-quote.js';

const base = { feeBps: 250, acceptThresholdBps: 250, heldDemo: 0n, heldReal: 0n };

describe('acceptQuote (docs/01-biznes-qoidalar.md §4, §6)', () => {
  it('T6: 800 000 with 4 500 available needs 20 000, short by 15 500', () => {
    const quote = acceptQuote({ ...base, price: som(800_000n), real: som(4_500n), demo: 0n });
    expect(quote).toMatchObject({
      required: som(20_000n),
      available: som(4_500n),
      shortfall: som(15_500n),
      sufficient: false,
    });
  });

  it('T6: with a 300 bps threshold the requirement is 24 000', () => {
    const quote = acceptQuote({
      ...base,
      acceptThresholdBps: 300,
      price: som(800_000n),
      real: som(4_500n),
      demo: 0n,
    });
    expect(quote.required).toBe(som(24_000n));
    expect(quote.shortfall).toBe(som(19_500n));
  });

  it('T1: fee 4 500 takes the 1 500 demo first, 3 000 from real', () => {
    const quote = acceptQuote({
      ...base,
      price: som(180_000n),
      real: som(551_250n),
      demo: som(1_500n),
    });
    expect(quote).toMatchObject({
      sufficient: true,
      fee: som(4_500n),
      feeDemo: som(1_500n),
      feeReal: som(3_000n),
    });
  });

  it('T2: fee 12 500 fully from a 14 000 demo balance', () => {
    const quote = acceptQuote({ ...base, price: som(500_000n), real: 0n, demo: som(14_000n) });
    expect(quote).toMatchObject({ fee: som(12_500n), feeDemo: som(12_500n), feeReal: 0n });
  });

  it('demo already reserved by another active job is not used twice', () => {
    const quote = acceptQuote({
      ...base,
      price: som(200_000n),
      real: som(10_000n),
      demo: som(6_000n),
      heldDemo: som(5_000n),
    });
    // available = 10 000 + 6 000 − 5 000 = 11 000; fee 5 000: demo 1 000 + real 4 000
    expect(quote).toMatchObject({
      available: som(11_000n),
      feeDemo: som(1_000n),
      feeReal: som(4_000n),
    });
  });

  it('T10 rounding: fee of 123 457 is 3 086, threshold rounds up to 3 087', () => {
    const quote = acceptQuote({ ...base, price: som(123_457n), real: som(10_000n), demo: 0n });
    expect(quote.fee).toBe(som(3_086n));
    expect(quote.required).toBe(som(3_087n));
  });

  it('a debt blocks new jobs until it is repaid, even when demo would cover the fee', () => {
    const quote = acceptQuote({
      ...base,
      price: som(100_000n),
      real: som(-3_000n),
      demo: som(20_000n),
    });
    // available 17 000 ≥ required 2 500, but REAL is 3 000 below zero (§5)
    expect(quote).toMatchObject({ sufficient: false, shortfall: som(3_000n) });
  });
});
