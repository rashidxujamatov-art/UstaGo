import { netBps, periodRange, platformShare, sharePercentBps } from '../finance-format';

describe('netBps', () => {
  it('subtracts both referral levels from the fee (SA1/SA2 design example)', () => {
    // 2.5% fee, 0.25% + 0.12% referral -> 2.13% net.
    expect(netBps(250, 25, 12)).toBe(213);
  });
});

describe('platformShare', () => {
  it('matches the SA1 design example (1 160 000 − 116 000 − 55 680 = 988 320)', () => {
    expect(platformShare('1160000', '116000', '55680')).toBe(988_320n);
  });

  it('accepts bigints too', () => {
    expect(platformShare(1_160_000n, 116_000n, 55_680n)).toBe(988_320n);
  });
});

describe('sharePercentBps', () => {
  it('returns a bps ratio of part over whole', () => {
    expect(sharePercentBps('50', '100')).toBe(5000);
    expect(sharePercentBps('25', '100')).toBe(2500);
  });

  it('is 0 when the whole is 0 instead of throwing', () => {
    expect(sharePercentBps('10', '0')).toBe(0);
  });
});

describe('periodRange', () => {
  // Sunday 2026-09-27, 14:30 in Tashkent (UTC+5).
  const now = new Date('2026-09-27T09:30:00.000Z');

  it('today starts at Tashkent local midnight', () => {
    expect(periodRange('today', now)).toEqual({
      from: '2026-09-26T19:00:00.000Z',
      to: now.toISOString(),
    });
  });

  it('week starts on the Monday (ISO week, docs/02 §11)', () => {
    expect(periodRange('week', now)).toEqual({
      from: '2026-09-20T19:00:00.000Z',
      to: now.toISOString(),
    });
  });

  it('month starts on the 1st', () => {
    expect(periodRange('month', now)).toEqual({
      from: '2026-08-31T19:00:00.000Z',
      to: now.toISOString(),
    });
  });
});
