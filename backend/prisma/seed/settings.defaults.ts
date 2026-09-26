import type { StoredSettings } from '../../src/modules/settings/settings.schema.js';

/** Whole so'm → tiyin, as the decimal string the settings table stores. */
const som = (amount: bigint): string => (amount * 100n).toString();

/**
 * Seed-only default values from docs/01-biznes-qoidalar.md §12.
 * The application never reads this file: at runtime settings come from the database,
 * where the super admin changes them (SA2, SA5, SA6).
 */
export const settingsDefaults: StoredSettings = {
  fee_bps: 250,
  ref_l1_bps: 25,
  ref_l2_bps: 12,
  accept_threshold_bps: 250,
  withdraw_fee_bps: 100,
  topup_min: som(1_000n),
  free_period_days: 30,
  free_period_reminder_days: [7, 3, 1],
  demo_bonus: som(25_000n),
  otp_length: 6,
  otp_ttl_sec: 300,
  otp_resend_sec: 60,
  otp_max_attempts: 5,
  otp_phone_limit: 3,
  otp_ip_limit: 10,
  otp_limit_window_sec: 600,
  login_attempt_limit: 5,
  login_attempt_window_sec: 900,
  min_age_years: 16,
  order_photos_max: 5,
  feed_nearby_radius_m: 5_000,
  upload_max_mb: 5,
  qr_payment_ttl_sec: 300,
  location_interval_sec: 5,
  eta_refresh_sec: 120,
  route_deviation_m: 300,
  auto_stop_radius_m: 50,
  max_trip_minutes: 180,
  track_retention_days: 30,
  self_employed_reminder_days: 7,
  tax_methods_enabled: ['SELF_EMPLOYED', 'XOLIS'],
  payment_methods_enabled: ['BALANCE', 'CLICK', 'PAYME', 'CARD', 'CASH', 'XOLIS_QR'],
  referral_required: true,
  ref_on_demo_fee: true,
  address_visible_before_accept: true,
  confirm_reminder_hours: [2, 24],
  confirm_admin_task_hours: 48,
};
