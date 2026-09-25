/** API shapes (backend/src/modules/*). Money fields are tiyin strings. */

export type Language = 'uz' | 'ru' | 'en' | 'tg';
export type ThemeModeApi = 'LIGHT' | 'DARK' | 'AUTO';
export type Role = 'CUSTOMER' | 'EXECUTOR';
export type OnboardingStep = 'IDENTITY' | 'ROLE' | 'DONE';

export interface Me {
  id: string;
  phone: string;
  email: string;
  lang: Language;
  theme: ThemeModeApi;
  active_role: Role | null;
  status: 'ACTIVE' | 'BLOCKED';
  onboarding_step: OnboardingStep;
  identity: { first_name: string; last_name: string; middle_name: string | null } | null;
  referral: { code: string; link: string };
  staff: { role: 'ADMIN' | 'SUPER_ADMIN'; permissions: string[] } | null;
  executor: { free_period_start: string; free_period_end: string } | null;
  created_at: string;
}

export interface TokenPair {
  access_token: string;
  access_expires_in: number;
  refresh_token: string;
}

export interface SignedIn {
  tokens: TokenPair;
  user: Me;
}

export interface OtpTicket {
  length: number;
  ttl_sec: number;
  resend_after_sec: number;
}

export type LoginResult =
  ({ otp_required: false } & SignedIn) | { otp_required: true; otp: OtpTicket };

export interface Invite {
  kind: 'USER' | 'PLATFORM';
  inviter: { first_name: string; last_name: string } | null;
}

export interface PublicConfig {
  referral_required: boolean;
  free_period_days: number;
  demo_bonus: string;
  min_age_years: number;
  otp_length: number;
}

export interface DeviceInfo {
  id: string;
  name?: string;
  platform: 'ios' | 'android';
}

export interface DuplicatePersonParams {
  phone_masked: string;
  created_at: string;
  free_period_used: boolean;
}
