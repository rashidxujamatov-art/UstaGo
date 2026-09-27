import { disputeDecisionOptions, disputeNeedsApproval, partialPrice } from '../dispute-decision';

describe('AD3 decision options', () => {
  it('offers only full and cancel for cash and Xolis (§1.5 DISPUTE_DECISION_NOT_ALLOWED)', () => {
    expect(disputeDecisionOptions('CASH')).toEqual(['FULL', 'CANCEL']);
    expect(disputeDecisionOptions('XOLIS_QR')).toEqual(['FULL', 'CANCEL']);
  });

  it('offers full, partial and cancel for every online method', () => {
    expect(disputeDecisionOptions('BALANCE')).toEqual(['FULL', 'PARTIAL', 'CANCEL']);
    expect(disputeDecisionOptions('CLICK')).toEqual(['FULL', 'PARTIAL', 'CANCEL']);
    expect(disputeDecisionOptions('PAYME')).toEqual(['FULL', 'PARTIAL', 'CANCEL']);
    expect(disputeDecisionOptions('CARD')).toEqual(['FULL', 'PARTIAL', 'CANCEL']);
  });
});

describe('AD3 partial price (§1.2)', () => {
  it('halves the price at the default 5000 bps (AD3 design example)', () => {
    // 300 000 so'm job, 50% → 150 000 so'm.
    expect(partialPrice('30000000', 5000)).toBe(15_000_000n);
  });

  it('rounds half up on an odd tiyin split', () => {
    expect(partialPrice('3', 5000)).toBe(2n); // 1.5 -> 2
    expect(partialPrice('5', 5000)).toBe(3n); // 2.5 -> 3
  });

  it('accepts a bigint price too', () => {
    expect(partialPrice(30_000_000n, 2500)).toBe(7_500_000n);
  });
});

describe('AD3 approval gate (§1.4)', () => {
  it('never requires approval for FULL', () => {
    expect(disputeNeedsApproval('FULL', false)).toBe(false);
    expect(disputeNeedsApproval('FULL', true)).toBe(false);
  });

  it('requires approval for PARTIAL/CANCEL from a plain admin', () => {
    expect(disputeNeedsApproval('PARTIAL', false)).toBe(true);
    expect(disputeNeedsApproval('CANCEL', false)).toBe(true);
  });

  it('a super admin deciding directly counts as already approved', () => {
    expect(disputeNeedsApproval('PARTIAL', true)).toBe(false);
    expect(disputeNeedsApproval('CANCEL', true)).toBe(false);
  });
});
