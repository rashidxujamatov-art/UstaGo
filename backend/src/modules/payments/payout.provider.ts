export const PAYOUT_PROVIDER = Symbol('PAYOUT_PROVIDER');

export interface PayoutResult {
  status: 'PAID' | 'FAILED';
  ref: string | null;
  reason?: string;
}

/**
 * Money out to a saved card (BJ7). The provider and the legal scheme are not chosen yet
 * (docs/01-biznes-qoidalar.md §14), so only the mock exists and payouts stay behind
 * FEATURE_PAYOUTS_ENABLED.
 */
export interface PayoutProvider {
  send(input: { withdrawalId: string; cardToken: string; amount: bigint }): Promise<PayoutResult>;
}

/** Pays at once; cards ending in 0000 fail, so the refund path can be tried. */
export class MockPayoutProvider implements PayoutProvider {
  send(input: { withdrawalId: string; cardToken: string }): Promise<PayoutResult> {
    if (input.cardToken.startsWith('mock:0000:')) {
      return Promise.resolve({ status: 'FAILED', ref: null, reason: 'card declined' });
    }
    return Promise.resolve({ status: 'PAID', ref: `mock-payout-${input.withdrawalId}` });
  }
}
