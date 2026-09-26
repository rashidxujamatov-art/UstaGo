import { mulDivToSom } from '../../common/money/money.js';

export interface FeeSplitInput {
  /** Service fee fixed at acceptance and its demo / real parts, tiyin (§4). */
  fee: bigint;
  feeDemo: bigint;
  feeReal: bigint;
  /** Rates snapshotted onto the order at acceptance (CLAUDE.md rule 7). */
  feeBps: number;
  refL1Bps: number;
  refL2Bps: number;
  /** Whether an active (not blocked) L1 / L2 exists for the executor. */
  hasL1: boolean;
  hasL2: boolean;
  /** `ref_on_demo_fee`: the platform pays referral on the demo part from its budget. */
  refOnDemoFee: boolean;
}

export interface ReferralShare {
  /** Paid to the referrer: `real + marketing`. */
  total: bigint;
  /** Part carried by the real fee (taken from the platform share). */
  real: bigint;
  /** Part for the demo fee, paid from PLATFORM_MARKETING. */
  marketing: bigint;
}

export interface FeeSplit {
  l1: ReferralShare;
  l2: ReferralShare;
  /** What stays with the platform: fee_real − paid real referral parts. */
  platform: bigint;
  /** Referral paid from the marketing budget (demo fee part). */
  marketing: bigint;
}

const NONE: ReferralShare = { total: 0n, real: 0n, marketing: 0n };

/**
 * Splits a service fee between the referral chain and the platform
 * (docs/01-biznes-qoidalar.md §6):
 *
 *   ref_l1        = FLOOR(fee × ref_l1_bps / fee_bps)
 *   ref_l1_real   = FLOOR(fee_real × ref_l1_bps / fee_bps)
 *   marketing     = (ref_l1 − ref_l1_real) + (ref_l2 − ref_l2_real)
 *   platform      = fee_real − ref_l1_real − ref_l2_real
 *
 * A missing or blocked referrer gets nothing: their real part stays with the platform and
 * no budget money is spent on their demo part.
 */
export function splitFee(input: FeeSplitInput): FeeSplit {
  if (input.fee === 0n || input.feeBps === 0) {
    return { l1: NONE, l2: NONE, platform: input.feeReal, marketing: 0n };
  }

  const share = (present: boolean, bps: number): ReferralShare => {
    if (!present || bps === 0) return NONE;
    const full = mulDivToSom(input.fee, bps, input.feeBps, 'FLOOR');
    const real = mulDivToSom(input.feeReal, bps, input.feeBps, 'FLOOR');
    const marketing = input.refOnDemoFee ? full - real : 0n;
    return { total: real + marketing, real, marketing };
  };

  const l1 = share(input.hasL1, input.refL1Bps);
  const l2 = share(input.hasL2, input.refL2Bps);
  return {
    l1,
    l2,
    platform: input.feeReal - l1.real - l2.real,
    marketing: l1.marketing + l2.marketing,
  };
}
