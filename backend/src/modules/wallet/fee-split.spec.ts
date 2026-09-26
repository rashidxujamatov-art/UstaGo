import { applyBps, somToTiyin as som } from '../../common/money/money.js';
import { acceptQuote } from './accept-quote.js';
import { splitFee } from './fee-split.js';

const rates = { feeBps: 250, refL1Bps: 25, refL2Bps: 12, refOnDemoFee: true };
const chain = { hasL1: true, hasL2: true };

/** Fee and its demo / real parts as fixed at acceptance (§4), for an executor's balances. */
function feeFor(price: number, demo: number, real = 1_000_000) {
  const quote = acceptQuote({
    price: som(BigInt(price)),
    feeBps: 250,
    acceptThresholdBps: 250,
    real: som(BigInt(real)),
    demo: som(BigInt(demo)),
    heldDemo: 0n,
    heldReal: 0n,
  });
  return { fee: quote.fee, feeDemo: quote.feeDemo, feeReal: quote.feeReal };
}

describe('splitFee (docs/01-biznes-qoidalar.md §6, §11)', () => {
  it('T1: 180 000 with 1 500 demo — L1 450 (300 + 150), L2 216 (144 + 72)', () => {
    const fee = feeFor(180_000, 1_500, 551_250);
    expect(fee).toEqual({ fee: som(4_500n), feeDemo: som(1_500n), feeReal: som(3_000n) });
    const split = splitFee({ ...fee, ...rates, ...chain });
    expect(split.l1).toEqual({ total: som(450n), real: som(300n), marketing: som(150n) });
    expect(split.l2).toEqual({ total: som(216n), real: som(144n), marketing: som(72n) });
    expect(split.platform).toBe(som(2_556n));
    expect(split.marketing).toBe(som(222n));
  });

  it('T2: 500 000 fully from demo — referral only from the budget, platform 0', () => {
    const fee = feeFor(500_000, 14_000, 0);
    expect(fee).toEqual({ fee: som(12_500n), feeDemo: som(12_500n), feeReal: 0n });
    const split = splitFee({ ...fee, ...rates, ...chain });
    expect(split.l1).toEqual({ total: som(1_250n), real: 0n, marketing: som(1_250n) });
    expect(split.l2).toEqual({ total: som(600n), real: 0n, marketing: som(600n) });
    expect(split.platform).toBe(0n);
    expect(split.marketing).toBe(som(1_850n));
  });

  it.each([
    ['T3', 600_000, 15_000n, 1_500n, 720n, 12_780n],
    ['T4', 300_000, 7_500n, 750n, 360n, 6_390n],
    ['T5', 400_000, 10_000n, 1_000n, 480n, 8_520n],
    ['T10', 123_457, 3_086n, 308n, 148n, 2_630n],
  ] as const)('%s: %s without demo', (_, price, feeSom, l1, l2, platform) => {
    const fee = feeFor(price, 0);
    expect(fee.fee).toBe(som(feeSom));
    const split = splitFee({ ...fee, ...rates, ...chain });
    expect(split.l1.total).toBe(som(l1));
    expect(split.l2.total).toBe(som(l2));
    expect(split.platform).toBe(som(platform));
    expect(split.marketing).toBe(0n);
  });

  it('T9: no referral — the platform keeps the whole fee', () => {
    const fee = feeFor(200_000, 0);
    const split = splitFee({ ...fee, ...rates, hasL1: false, hasL2: false });
    expect(split.l1.total + split.l2.total).toBe(0n);
    expect(split.platform).toBe(som(5_000n));
  });

  it('a blocked or missing L2 leaves its real part with the platform and costs no budget', () => {
    const fee = feeFor(180_000, 1_500);
    const split = splitFee({ ...fee, ...rates, hasL1: true, hasL2: false });
    expect(split.l2.total).toBe(0n);
    expect(split.platform).toBe(som(3_000n - 300n));
    expect(split.marketing).toBe(som(150n));
  });

  it('ref_on_demo_fee off: nothing is paid for the demo part', () => {
    const fee = feeFor(500_000, 14_000, 0);
    const split = splitFee({ ...fee, ...rates, ...chain, refOnDemoFee: false });
    expect(split.l1.total + split.l2.total + split.marketing).toBe(0n);
  });

  it('T11: report over 52 000 000 turnover, 5 600 000 of it paid from demo', () => {
    // Totals are linear when every fee is a whole multiple, as in the §11 report example.
    const demoFee = applyBps(som(5_600_000n), 250, 'HALF_UP');
    const realFee = applyBps(som(46_400_000n), 250, 'HALF_UP');
    const demo = splitFee({ fee: demoFee, feeDemo: demoFee, feeReal: 0n, ...rates, ...chain });
    const real = splitFee({ fee: realFee, feeDemo: 0n, feeReal: realFee, ...rates, ...chain });

    expect(realFee).toBe(som(1_160_000n));
    expect(demo.l1.total + real.l1.total).toBe(som(130_000n));
    expect(demo.l1.marketing).toBe(som(14_000n));
    expect(demo.l2.total + real.l2.total).toBe(som(62_400n));
    expect(demo.l2.marketing).toBe(som(6_720n));
    expect(demo.platform + real.platform).toBe(som(988_320n));
    expect(demo.marketing + real.marketing).toBe(som(20_720n));
    expect(demo.platform + real.platform - demo.marketing - real.marketing).toBe(som(967_600n));
    expect(demoFee).toBe(som(140_000n));
  });

  it('never creates or loses money: shares add up to the fee', () => {
    for (const [price, demo] of [
      [123_457, 700],
      [99_999, 0],
      [1_000_001, 25_000],
      [55_555, 1_388],
    ] as const) {
      const fee = feeFor(price, demo);
      const split = splitFee({ ...fee, ...rates, ...chain });
      const paidToReferrers = split.l1.total + split.l2.total;
      // fee_real funds the platform and the real referral parts; the budget funds the rest.
      expect(split.platform + split.l1.real + split.l2.real).toBe(fee.feeReal);
      expect(paidToReferrers).toBe(split.l1.real + split.l2.real + split.marketing);
    }
  });
});
