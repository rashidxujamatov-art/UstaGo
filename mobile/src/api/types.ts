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
  fee_bps: number;
  tax_methods_enabled: TaxMethod[];
  /** BJ9: the certificate expiry reminder is sent this many days before. */
  self_employed_reminder_days: number;
  withdraw_fee_bps: number;
  /** Stage 6: how often the executor's app posts a location point while sharing. */
  location_interval_sec: number;
  /** Stage 6: distance to the destination that auto-stops sharing (`NEAR_DESTINATION`). */
  auto_stop_radius_m: number;
  /** Stage 6: a trip older than this is force-stopped (`MAX_DURATION`). */
  max_trip_minutes: number;
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
  /** BY9: the pro's Paynet Xolis QR, offered instead of cash when they use Xolis. */
  xolis_qr: string | null;
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

// ---------------------------------------------------------------- stage 5

export type TaxMethod = 'SELF_EMPLOYED' | 'XOLIS';
export type TaxStatusValue = 'NONE' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';

/** BJ8-BJ10, the "Soliq holati" screen (docs/01 §9). */
export interface TaxStatus {
  method: TaxMethod | null;
  /** A verified certificate past its `valid_until` reads EXPIRED even before the daily job runs. */
  status: TaxStatusValue;
  valid_until: string | null;
  checked_at: string | null;
  reminders: boolean;
  xolis_phone: string | null;
  /** A request waiting for an admin (AD1). */
  pending: { id: string; method: TaxMethod; created_at: string } | null;
  /** The latest request, when an admin rejected it. */
  rejected: { method: TaxMethod; reason: string | null } | null;
  methods_enabled: TaxMethod[];
  free_period: { ends_at: string; active: boolean };
}

/** AD1 "Hujjat murojaatlari" queue item. */
export interface TaxVerification {
  id: string;
  method: TaxMethod;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  created_at: string;
  user: { id: string; first_name: string; last_name: string; phone_masked: string };
  certificate_url: string | null;
  xolis_qr: string | null;
  xolis_phone: string | null;
}

/** SA5 "Soliq usullari" overview. */
export interface TaxMethodsOverview {
  enabled: TaxMethod[];
  counts: { SELF_EMPLOYED: number; XOLIS: number };
  without_method: number;
}

// ---------------------------------------------------------------- stage 6

/** Why a trip stopped sending location (docs/01 §10). */
export type TripEndReason =
  'ARRIVED' | 'NEAR_DESTINATION' | 'CANCELLED' | 'DECLINED' | 'MAX_DURATION' | 'STOPPED';

export interface TripPosition {
  lat: number;
  lng: number;
  heading: number | null;
  at: string;
}

/** `GET /orders/:id/trip`: both parties may read it, only the pro's app posts to it. */
export interface TripView {
  /** NONE: the pro did not share (or has not departed yet). */
  status: 'NONE' | 'ACTIVE' | 'ENDED';
  /** Only while ACTIVE. */
  position: TripPosition | null;
  eta_sec: number | null;
  distance_m: number | null;
  end_reason: TripEndReason | null;
  started_at: string | null;
  destination: { lat: number; lng: number };
}

/** One point the background location task batches up before posting. */
export interface TripPointInput {
  lat: number;
  lng: number;
  at: string;
  accuracy_m?: number;
  speed?: number;
  heading?: number;
}

/** `POST /orders/:id/trip/points` response: tells the app whether to keep tracking. */
export interface TripPointsResult {
  active: boolean;
  end_reason: TripEndReason | null;
  eta_sec: number | null;
  distance_m: number | null;
}

/** SA6 "Xarita va joylashuv": editable through `PUT /sa/maps`. */
export interface MapsSettings {
  location_interval_sec: number;
  eta_refresh_sec: number;
  route_deviation_m: number;
  auto_stop_radius_m: number;
  max_trip_minutes: number;
  track_retention_days: number;
}

export interface MapsUsage {
  geocode: number;
  places: number;
  routes: number;
}

export interface MapsOverview {
  provider: 'mock' | 'google';
  /** The server key itself is never returned, only whether one is configured. */
  server_key_configured: boolean;
  usage_this_month: MapsUsage;
  settings: MapsSettings;
}

// ---------------------------------------------------------------- stage 7

/** The six grantable admin permission keys (stage7-contract §0, `staff/staff.service.ts`). */
export type AdminPermission =
  | 'orders.moderate'
  | 'users.manage'
  | 'disputes.resolve'
  | 'categories.manage'
  | 'finance.view'
  | 'notifications.broadcast';

export type PermissionRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** AD1 "Ruxsat so'rash" / SA3 inbox row. */
export interface PermissionRequest {
  id: string;
  permission: AdminPermission;
  status: PermissionRequestStatus;
  created_at: string;
}

/** AD1 "Admin paneli" (`GET /admin/dashboard`). A `null` count means the caller lacks that permission. */
export interface AdminDashboard {
  tasks: {
    verifications_pending: number | null;
    disputes_open: number | null;
    orders_stuck: number | null;
    support_chats: 'soon';
  };
  stats: {
    orders_today: number;
    new_users_today: number;
    /** Tiyin; null when the caller lacks `finance.view`. */
    revenue_today: string | null;
  };
  my_permission_requests: PermissionRequest[];
  permissions: AdminPermission[];
}

// -------------------------------------------------------- AD2 users

export type AdminUserStatus = 'ACTIVE' | 'BLOCKED';

/** AD2 list row (`GET /admin/users`). */
export interface AdminUserListItem {
  id: string;
  phone_masked: string;
  email: string;
  first_name: string;
  last_name: string;
  active_role: Role | null;
  status: AdminUserStatus;
  created_at: string;
  identity_verified: boolean;
  tax: { method: TaxMethod; status: TaxStatusValue } | null;
}

export interface AdminUserListPage {
  items: AdminUserListItem[];
  next: string | null;
}

export interface AdminUserListFilter {
  search?: string;
  role?: Role;
  status?: AdminUserStatus;
  verification?: 'PENDING';
}

/** AD2 detail (`GET /admin/users/:id`). */
export interface AdminUserDetail {
  id: string;
  phone: string;
  email: string;
  lang: Language;
  active_role: Role | null;
  status: AdminUserStatus;
  created_at: string;
  identity: {
    first_name: string;
    last_name: string;
    middle_name: string | null;
    birth_date: string;
    doc_type: string;
    verified_at: string;
  } | null;
  executor: {
    free_period_ends_at: string | null;
    tax_method: TaxMethod | null;
    tax_status: TaxStatusValue | null;
    tax_valid_until: string | null;
  } | null;
  wallet: { real: string; demo: string; holds: string };
  orders_count: { as_customer: number; as_executor: number };
  block: { reason: string; blocked_at: string; blocked_by: string } | null;
}

// -------------------------------------------------------- AD3 disputes

export type DisputeDecisionValue = 'FULL' | 'PARTIAL' | 'CANCEL';
export type DisputeApprovalValue = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type DisputeOpenedBy = 'CUSTOMER' | 'EXECUTOR';
export type DisputeListFilter = 'OPEN' | 'DECIDED';

/** AD3 list row (`GET /admin/disputes`, `GET /sa/disputes/pending-approval`). */
export interface DisputeListItem {
  id: string;
  number: number;
  payment_method: PaymentMethod;
  /** Tiyin. */
  price: string;
  disputed_at: string;
  disputed_by: DisputeOpenedBy;
  decision: DisputeDecisionValue | null;
  approval: DisputeApprovalValue;
}

export interface DisputeListPage {
  items: DisputeListItem[];
  next: string | null;
}

/** AD3 detail (`GET /admin/disputes/:orderId`). */
export interface DisputeDetail {
  order: Order;
  dispute: {
    opened_by: DisputeOpenedBy;
    note: string | null;
    opened_at: string;
    customer_paid_at: string | null;
    executor_received_at: string | null;
    /** "To'lov to'xtatilgan": a pending online QR was rejected once the dispute opened. */
    payment_hold_active: boolean;
    decision: DisputeDecisionValue | null;
    decision_note: string | null;
    decided_by: string | null;
    decided_at: string | null;
    approval: DisputeApprovalValue;
    approved_by: string | null;
    rejected_reason: string | null;
    /** Tiyin: the price before a PARTIAL reduction, for "was X, now Y" display only. */
    original_price: string | null;
  };
}

export interface DisputeTrackPoint {
  lat: number;
  lng: number;
  at: string;
  accuracy_m: number | null;
}

/** `GET /admin/disputes/:orderId/track` — the stored route, audited on every read. */
export interface DisputeTrack {
  points: DisputeTrackPoint[];
  trip_started_at: string | null;
  trip_ended_at: string | null;
  end_reason: TripEndReason | null;
}

// -------------------------------------------------------- orders moderation

export interface OrderEvent {
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  actor_id: string | null;
  at: string;
}

export interface AdminOrderListFilter {
  search?: string;
  status?: OrderStatus;
  payment_method?: PaymentMethod;
  stuck?: boolean;
  from?: string;
  to?: string;
}

export interface AdminOrderListPage {
  items: Order[];
  next: string | null;
}

/** `GET /admin/orders/:id`: the order plus its status-change timeline. */
export interface AdminOrderDetail {
  order: Order;
  events: OrderEvent[];
}

// -------------------------------------------------------- categories (admin)

/** `GET/POST/PUT /admin/categories*`: every category, active or not. */
export interface AdminCategory {
  id: string;
  slug: string;
  names: Record<Language, string>;
  icon: string;
  color: string;
  sort_order: number;
  active: boolean;
  created_at: string;
}

export interface NewCategoryInput {
  slug: string;
  names: Record<Language, string>;
  icon: string;
  color: string;
  sort_order: number;
}

export type CategoryUpdateInput = Partial<Omit<NewCategoryInput, 'slug'>>;

// -------------------------------------------------------- broadcast

export type BroadcastTarget = 'ALL' | 'CUSTOMER' | 'EXECUTOR';
export type BroadcastStatus = 'QUEUED' | 'SENDING' | 'DONE';

export interface NewBroadcastInput {
  target: BroadcastTarget;
  title: Record<Language, string>;
  body: Record<Language, string>;
}

export interface BroadcastCreateResult {
  id: string;
  status: BroadcastStatus;
  estimated_recipients: number;
}

export interface BroadcastListItem {
  id: string;
  target: BroadcastTarget;
  title: Record<Language, string>;
  recipients_count: number;
  status: BroadcastStatus;
  created_at: string;
  created_by: string;
}

export interface BroadcastListPage {
  items: BroadcastListItem[];
  next: string | null;
}

export interface BroadcastDetail extends BroadcastListItem {
  body: Record<Language, string>;
}

// -------------------------------------------------------- SA1 / SA4 finance

export type FinancePeriod = 'today' | 'week' | 'month' | 'custom';

/** SA1 "Boshqaruv" and SA4 "Moliya" share this shape (stage7-contract §7/§10). */
export interface FinanceSummary {
  period: { from: string; to: string };
  /** Every field below is tiyin except the two counts at the end. */
  turnover: string;
  platform_net: string;
  commission_real: string;
  demo_commission: string;
  referral: { l1: string; l1_budget: string; l2: string; l2_budget: string };
  marketing_budget_spent: string;
  payout_provider_fees: string;
  pros_in_free_period: number;
  users_total: { customers: number; executors: number };
}

/** SA4 per-order breakdown row (`GET /sa/finance/orders`). */
export interface FinanceOrderRow {
  id: string;
  number: number;
  paid_at: string;
  payment_method: PaymentMethod;
  price: string;
  fee: string;
  fee_demo: string;
  fee_real: string;
  ref_l1: string;
  ref_l2: string;
  platform_net: string;
}

export interface FinanceOrdersPage {
  items: FinanceOrderRow[];
  next: string | null;
}

// -------------------------------------------------------- SA2 settings

export interface SaSettingsRates {
  fee_bps: number;
  ref_l1_bps: number;
  ref_l2_bps: number;
  accept_threshold_bps: number;
  withdraw_fee_bps: number;
  dispute_partial_bps: number;
}

export interface SaSettingsFreePeriod {
  free_period_days: number;
  free_period_reminder_days: number;
  /** Tiyin. */
  demo_bonus: string;
}

export interface SaSettingsWallet {
  /** Tiyin. */
  topup_min: string;
}

export interface SaSettingsPayments {
  payment_methods_enabled: PaymentMethod[];
  qr_payment_ttl_sec: number;
}

export interface SaSettingsReferrals {
  referral_required: boolean;
  ref_on_demo_fee: boolean;
}

export interface SaSettingsConfirmations {
  confirm_reminder_hours: number;
  confirm_admin_task_hours: number;
}

export interface SaSettingsModeration {
  broadcast_min_interval_sec: number;
}

type SaSettingsEditableGroups = SaSettingsRates &
  SaSettingsFreePeriod &
  SaSettingsWallet &
  SaSettingsPayments &
  SaSettingsReferrals &
  SaSettingsConfirmations &
  SaSettingsModeration;

/** `GET /sa/settings`: every `settings` row, grouped as the SA2 screen lays them out. */
export interface SaSettings {
  rates: SaSettingsRates;
  free_period: SaSettingsFreePeriod;
  wallet: SaSettingsWallet;
  payments: SaSettingsPayments;
  referrals: SaSettingsReferrals;
  confirmations: SaSettingsConfirmations;
  moderation: SaSettingsModeration;
  /** otp_*, login_attempt_*, min_age_years, etc. — not individually editable on SA2. */
  other: Record<string, string | number | boolean>;
}

/** `PUT /sa/settings` body: a flat subset of the editable keys above. */
export type SaSettingsUpdate = Partial<SaSettingsEditableGroups>;

// -------------------------------------------------------- SA3 staff

export type StaffRole = 'ADMIN' | 'SUPER_ADMIN';

/** SA3 "Rollar va ruxsatlar" row (`GET /sa/staff`). */
export interface StaffMember {
  id: string;
  phone_masked: string;
  first_name: string;
  last_name: string;
  role: StaffRole;
  permissions: AdminPermission[];
  created_at: string;
}

/** SA3 inbox row (`GET /sa/permission-requests`). */
export interface AdminPermissionRequestItem {
  id: string;
  requested_by: { id: string; first_name: string; last_name: string };
  permission: AdminPermission;
  note: string | null;
  status: PermissionRequestStatus;
  created_at: string;
}
