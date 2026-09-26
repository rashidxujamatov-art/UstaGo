import { somToTiyin as som } from '../../common/money/money.js';
import { withdrawFee, withdrawQuote } from './withdraw-quote.js';

const base = { demoActive: 0n, held: 0n, withdrawFeeBps: 100 };

describe('withdrawQuote (docs/01-biznes-qoidalar.md §7, §11)', () => {
  it('T7: 621 000 with a 15 000 hold — keep 15 000, at most 600 000, fee 6 000', () => {
    const quote = withdrawQuote({ ...base, real: som(621_000n), held: som(15_000n) });
    expect(quote).toEqual({ mustKeep: som(15_000n), max: som(600_000n), maxFee: som(6_000n) });
  });

  it('T8 / T17: 100 000 with no holds — at most 99 010, bank fee 990', () => {
    const quote = withdrawQuote({ ...base, real: som(100_000n) });
    expect(quote).toEqual({ mustKeep: 0n, max: som(99_010n), maxFee: som(990n) });
    expect(som(99_011n) + withdrawFee(som(99_011n), 100)).toBeGreaterThan(som(100_000n));
  });

  it('demo covers the demo part of held fees', () => {
    const quote = withdrawQuote({
      ...base,
      real: som(50_000n),
      held: som(4_500n),
      demoActive: som(20_000n),
    });
    expect(quote.mustKeep).toBe(0n);
    expect(quote.max).toBe(som(49_505n)); // 49 505 + 495 (495.05 rounded) = 50 000
  });

  it('nothing can be withdrawn from a debt or a balance fully reserved', () => {
    expect(withdrawQuote({ ...base, real: som(-3_000n) }).max).toBe(0n);
    expect(withdrawQuote({ ...base, real: som(7_500n), held: som(7_500n) }).max).toBe(0n);
    expect(withdrawQuote({ ...base, real: som(1n) }).max).toBe(som(1n)); // fee 0.01 → 0
  });

  it('finds the exact boundary for any balance', () => {
    for (let real = 1n; real < 5_000n; real += 37n) {
      const { max, maxFee } = withdrawQuote({ ...base, real: som(real) });
      expect(max + maxFee).toBeLessThanOrEqual(som(real));
      expect(som(real) < max + som(1n) + withdrawFee(max + som(1n), 100)).toBe(true);
    }
  });

  it('works with a zero fee rate', () => {
    expect(withdrawQuote({ ...base, real: som(1_234n), withdrawFeeBps: 0 })).toEqual({
      mustKeep: 0n,
      max: som(1_234n),
      maxFee: 0n,
    });
  });
});
