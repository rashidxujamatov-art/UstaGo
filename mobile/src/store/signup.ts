import { create } from 'zustand';
import type { DuplicatePersonParams, Invite, OtpTicket } from '../api/types';

export type OtpPurpose = 'REGISTER' | 'LOGIN';

interface SignupState {
  /** Referral code from an invite link (/r/CODE) or typed on K2. */
  referralCode: string | null;
  invite: Invite | null;
  /** The number waiting for an SMS code on K3. */
  phone: string | null;
  purpose: OtpPurpose | null;
  otp: OtpTicket | null;
  /** When the last code was sent (ms), for the resend timer. */
  otpSentAt: number | null;
  /** Existing account shown on K3d. */
  duplicate: DuplicatePersonParams | null;
  /** Open MyID session between K3b and K3c (kept out of the URL). */
  identitySession: string | null;

  setReferral: (code: string | null, invite: Invite | null) => void;
  startOtp: (phone: string, purpose: OtpPurpose, otp: OtpTicket) => void;
  setDuplicate: (duplicate: DuplicatePersonParams | null) => void;
  setIdentitySession: (session: string | null) => void;
  clearOtp: () => void;
}

/** State shared by the sign-up / sign-in screens (Main, K2, K3, K3d). Not persisted. */
export const useSignup = create<SignupState>()((set) => ({
  referralCode: null,
  invite: null,
  phone: null,
  purpose: null,
  otp: null,
  otpSentAt: null,
  duplicate: null,
  identitySession: null,
  setReferral: (referralCode, invite) => set({ referralCode, invite }),
  startOtp: (phone, purpose, otp) => set({ phone, purpose, otp, otpSentAt: Date.now() }),
  setDuplicate: (duplicate) => set({ duplicate }),
  setIdentitySession: (identitySession) => set({ identitySession }),
  clearOtp: () => set({ phone: null, purpose: null, otp: null, otpSentAt: null }),
}));
