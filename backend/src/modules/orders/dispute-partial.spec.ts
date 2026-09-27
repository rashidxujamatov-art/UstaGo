import { somToTiyin as som } from '../../common/money/money.js';
import { partialDisputeQuote } from './dispute-partial.js';

describe('partialDisputeQuote (docs/01 §5/§6, stage 7 decision of 2026-09-27)', () => {
  it('halves the price and the fee at the default 5000 bps', () => {
    const quote = partialDisputeQuote({
      price: som(300_000n),
      feeBpsSnapshot: 250,
      disputePartialBps: 5_000,
      feeDemo: 0n,
    });
    expect(quote).toEqual({
      price: som(150_000n),
      fee: som(3_750n),
      feeDemo: 0n,
      feeReal: som(3_750n),
    });
  });

  it('caps fee_demo at the new, smaller fee — it never grows back', () => {
    // Original fee was 4 500 (1 500 demo + 3 000 real) on a 180 000 order; halved, the new
    // fee is 2 250 — the demo part must shrink to that, not stay at 1 500... wait: 1 500 < 2 250,
    // so it actually stays at 1 500 here (MIN caps, doesn't scale). feeReal becomes 750.
    const quote = partialDisputeQuote({
      price: som(180_000n),
      feeBpsSnapshot: 250,
      disputePartialBps: 5_000,
      feeDemo: som(1_500n),
    });
    expect(quote.price).toBe(som(90_000n));
    expect(quote.fee).toBe(som(2_250n));
    expect(quote.feeDemo).toBe(som(1_500n));
    expect(quote.feeReal).toBe(som(750n));
  });

  it('MIN caps fee_demo when the old demo part is larger than the new fee', () => {
    // Old fee_demo (12 500) exceeds the new, much smaller fee (3 125) — capped, not carried
    // over in full, so fee_real stays 0 instead of going negative.
    const quote = partialDisputeQuote({
      price: som(500_000n),
      feeBpsSnapshot: 250,
      disputePartialBps: 5_000,
      feeDemo: som(12_500n),
    });
    expect(quote.price).toBe(som(250_000n));
    expect(quote.fee).toBe(som(6_250n));
    expect(quote.feeDemo).toBe(som(6_250n));
    expect(quote.feeReal).toBe(0n);
  });

  it('T10-style rounding: an odd price still rounds half up at each step', () => {
    const quote = partialDisputeQuote({
      price: som(123_457n),
      feeBpsSnapshot: 250,
      disputePartialBps: 5_000,
      feeDemo: 0n,
    });
    // price × 5000/10000 = 61 728.5 → 61 729 (HALF_UP); fee = 61 729 × 250/10000 = 1 543.225 → 1 543
    expect(quote.price).toBe(som(61_729n));
    expect(quote.fee).toBe(som(1_543n));
  });

  it('a non-default dispute_partial_bps (e.g. 3000 = 30%) is honoured', () => {
    const quote = partialDisputeQuote({
      price: som(200_000n),
      feeBpsSnapshot: 250,
      disputePartialBps: 3_000,
      feeDemo: 0n,
    });
    expect(quote.price).toBe(som(60_000n));
    expect(quote.fee).toBe(som(1_500n));
  });
});
