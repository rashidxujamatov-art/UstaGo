import type { DisputeDecisionValue, PaymentMethod } from '../api/types';

const BPS_DENOMINATOR = 10_000n;

/**
 * AD3 "Qaror": which decisions the payment method allows (stage7-contract §1.2/§1.5).
 * Cash and Xolis settle directly between the two people, so there is no price to shrink —
 * only pay in full or cancel. Every online method also offers PARTIAL.
 */
export function disputeDecisionOptions(method: PaymentMethod): DisputeDecisionValue[] {
  return method === 'CASH' || method === 'XOLIS_QR'
    ? ['FULL', 'CANCEL']
    : ['FULL', 'PARTIAL', 'CANCEL'];
}

/**
 * §1.2 PARTIAL: `ROUND_HALF_UP(price × dispute_partial_bps / 10 000)`, tiyin in and out.
 * Bigint only — money is never a JS number (CLAUDE.md rule 1).
 */
export function partialPrice(price: string | bigint, disputePartialBps: number): bigint {
  const amount = typeof price === 'bigint' ? price : BigInt(price);
  const bps = BigInt(disputePartialBps);
  const numerator = amount * bps;
  const quotient = numerator / BPS_DENOMINATOR;
  const remainder = numerator % BPS_DENOMINATOR;
  return remainder * 2n >= BPS_DENOMINATOR ? quotient + 1n : quotient;
}

/**
 * §1.4: FULL never needs a second signature. PARTIAL/CANCEL do, unless the caller proposing
 * it is already a super admin — a super admin's own decision is recorded as approved at once.
 */
export function disputeNeedsApproval(
  decision: DisputeDecisionValue,
  callerIsSuperAdmin: boolean,
): boolean {
  return decision !== 'FULL' && !callerIsSuperAdmin;
}
