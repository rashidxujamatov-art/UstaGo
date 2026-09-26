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
  /** Tiyin. */
  topup_min: string;
  withdraw_fee_bps: number;
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
    customer_paid_at: string | null;
    executor_received_at: string | null;
    paid_at: string | null;
    disputed_at: string | null;
    cancelled_at: string | null;
  };
  dispute: { by_me: boolean } | null;
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
  /** Demo that still counts (all of it during the free period). */
  demo: string;
  holds: string;
  available: string;
  must_keep: string;
  max_withdraw: string;
  /** Demo bonus credited (BJ5 "1 500 / 25 000"). */
  demo_granted: string;
  free_period: { ends_at: string; days_left: number; active: boolean } | null;
}

export type LedgerTxType =
  | 'DEMO_BONUS'
  | 'DEMO_EXPIRE'
  | 'ORDER_INCOME'
  | 'TOPUP'
  | 'TOPUP_REFUND'
  | 'SERVICE_FEE'
  | 'REFERRAL_L1'
  | 'REFERRAL_L2'
  | 'WITHDRAWAL'
  | 'WITHDRAWAL_FEE'
  | 'WITHDRAWAL_REFUND'
  | 'WITHDRAWAL_FEE_REFUND';

/** One row of BJ5 "Tarix". */
export interface WalletTransaction {
  id: string;
  type: LedgerTxType;
  /** Signed, tiyin. */
  amount: string;
  demo_amount: string;
  created_at: string;
  order: {
    id: string;
    number: number;
    title: string;
    price: string;
    payment_method: PaymentMethod;
    fee_bps: number | null;
  } | null;
  from: { first_name: string; last_initial: string } | null;
  /** Top-ups: PAYME, CLICK or CARD. */
  provider: PaymentProviderName | null;
}

export interface WalletTransactionsPage {
  items: WalletTransaction[];
  next: string | null;
}

// ---------------------------------------------------------------- stage 4

export type PaymentProviderName = 'PAYME' | 'CLICK' | 'CARD';
export type PaymentStatus = 'CREATED' | 'PENDING' | 'PAID' | 'CANCELLED' | 'REFUNDED' | 'EXPIRED';

/** A top-up or order payment through Payme, Click or a saved card. */
export interface PaymentInfo {
  id: string;
  provider: PaymentProviderName;
  purpose: 'TOPUP' | 'ORDER';
  /** Tiyin. */
  amount: string;
  status: PaymentStatus;
  order_id: string | null;
  /** Click / Payme link; also the BJ4 QR content. */
  checkout_url: string | null;
  expires_at: string;
  /** Development: the payment may be finished without the provider app. */
  test_mode: boolean;
}

export type CardBrand = 'UZCARD' | 'HUMO' | 'VISA' | 'MASTERCARD';

export interface SavedCard {
  id: string;
  masked_pan: string;
  last4: string;
  brand: CardBrand;
  expire: string;
}

/** BJ7. */
export interface WithdrawPreview {
  real: string;
  must_keep: string;
  max: string;
  max_fee: string;
  fee_bps: number;
  fee: string | null;
  holds: { order_number: number; price: string; fee: string; fee_bps: number | null }[];
  enabled: boolean;
}

export interface WithdrawalInfo {
  id: string;
  amount: string;
  fee: string;
  status: 'REQUESTED' | 'PROCESSING' | 'PAID' | 'FAILED';
  card_id: string | null;
  created_at: string;
}

/** U2 "Referal dasturi". */
export interface ReferralSummary {
  code: string;
  link: string;
  l1_bps: number;
  l2_bps: number;
  l1_count: number;
  l2_count: number;
  total: string;
  recent: {
    id: string;
    level: 1 | 2;
    amount: string;
    order_price: string | null;
    from: { first_name: string; last_name: string } | null;
    created_at: string;
  }[];
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
