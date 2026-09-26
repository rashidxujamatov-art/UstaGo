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
  payment_methods_enabled: PaymentMethod[];
  order_photos_max: number;
  feed_nearby_radius_m: number;
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

// ---------------------------------------------------------------- stage 2

export type OrderStatus =
  | 'PUBLISHED'
  | 'ACCEPTED'
  | 'EN_ROUTE'
  | 'ARRIVED'
  | 'IN_PROGRESS'
  | 'DONE_BY_EXECUTOR'
  | 'COMPLETED'
  | 'PAID'
  | 'CANCELLED'
  | 'DISPUTED';

export type PaymentMethod = 'BALANCE' | 'CLICK' | 'PAYME' | 'CARD' | 'CASH' | 'XOLIS_QR';

export type CancelReason =
  'NOT_NEEDED' | 'FOUND_OTHER' | 'EXECUTOR_LATE' | 'NO_AGREEMENT' | 'OTHER';

export interface Category {
  id: string;
  slug: string;
  names: Record<Language, string>;
  icon: string;
  color: string;
}

export interface Order {
  id: string;
  number: number;
  status: OrderStatus;
  category: Category;
  title: string;
  description: string;
  photos: string[];
  address: {
    text: string;
    lat: number;
    lng: number;
    entrance: string | null;
    floor: string | null;
    apartment: string | null;
    landmark: string | null;
  };
  time_from: string;
  time_to: string;
  /** Tiyin. */
  price: string;
  payment_method: PaymentMethod;
  customer: {
    id: string;
    first_name: string;
    last_initial: string;
    orders_count: number;
    phone: string | null;
  };
  executor: { id: string; first_name: string; last_name: string; phone: string | null } | null;
  /** Executor only: the fee held at acceptance and the rate snapshot (bps). */
  fee: { fee: string; fee_demo: string; fee_real: string; fee_bps: number | null } | null;
  timeline: {
    created_at: string;
    accepted_at: string | null;
    departed_at: string | null;
    arrived_at: string | null;
    started_at: string | null;
    finished_at: string | null;
    cancelled_at: string | null;
  };
  cancel: { reason: string | null; by_me: boolean; by_system: boolean } | null;
  finish_photos: string[];
  distance_m: number | null;
  viewer_role: 'CUSTOMER' | 'EXECUTOR' | 'OTHER';
}

export interface AcceptPreview {
  required: string;
  available: string;
  shortfall: string;
  sufficient: boolean;
  fee: string;
  fee_demo: string;
  fee_real: string;
  fee_bps: number;
}

export interface Wallet {
  real: string;
  demo: string;
  holds: string;
  available: string;
}

export interface ChatMessage {
  id: string;
  kind: 'TEXT' | 'PHOTO' | 'SYSTEM';
  text: string | null;
  photo_url: string | null;
  system_code: string | null;
  from_me: boolean;
  created_at: string;
  read_at: string | null;
}

export interface NewOrderInput {
  category_id: string;
  title: string;
  description: string;
  photo_keys: string[];
  address: {
    text: string;
    lat: number;
    lng: number;
    entrance?: string;
    floor?: string;
    apartment?: string;
    landmark?: string;
  };
  time_from: string;
  time_to: string;
  price: string;
  payment_method: PaymentMethod;
}

export interface PlaceSuggestion {
  place_id: string;
  primary: string;
  secondary: string;
}
