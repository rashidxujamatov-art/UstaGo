import { z } from 'zod';

/**
 * Shape and validation of every super-admin setting (docs/01-biznes-qoidalar.md §12).
 *
 * Values live only in the `settings` table (CLAUDE.md rule 7). This file defines
 * types and limits, not values: there is deliberately no runtime fallback to defaults.
 * Default values are seed data: prisma/seed/settings.defaults.ts.
 */

const bps = z.number().int().min(0).max(10_000);
const positiveInt = z.number().int().positive();
/** Money is stored as a decimal string of tiyin so JSON never goes through a float. */
const tiyin = z
  .string()
  .regex(/^\d+$/, 'expected a non-negative integer amount in tiyin')
  .transform((value) => BigInt(value));

const uniqueList = <T extends z.ZodType>(item: T) =>
  z.array(item).refine((values) => new Set(values).size === values.length, 'values must be unique');

export const TAX_METHODS = ['SELF_EMPLOYED', 'XOLIS'] as const;
export const PAYMENT_METHODS = ['BALANCE', 'CLICK', 'PAYME', 'CARD', 'CASH', 'XOLIS_QR'] as const;

export const settingsShape = {
  fee_bps: bps,
  ref_l1_bps: bps,
  ref_l2_bps: bps,
  accept_threshold_bps: bps,
  withdraw_fee_bps: bps,
  topup_min: tiyin,
  free_period_days: positiveInt,
  free_period_reminder_days: uniqueList(positiveInt).min(1),
  demo_bonus: tiyin,
  otp_length: z.number().int().min(4).max(8),
  otp_ttl_sec: positiveInt,
  otp_resend_sec: positiveInt,
  otp_max_attempts: positiveInt,
  otp_phone_limit: positiveInt,
  otp_ip_limit: positiveInt,
  otp_limit_window_sec: positiveInt,
  login_attempt_limit: positiveInt,
  login_attempt_window_sec: positiveInt,
  min_age_years: z.number().int().min(0).max(120),
  order_photos_max: positiveInt,
  feed_nearby_radius_m: positiveInt,
  upload_max_mb: positiveInt,
  qr_payment_ttl_sec: positiveInt,
  location_interval_sec: positiveInt,
  eta_refresh_sec: positiveInt,
  route_deviation_m: positiveInt,
  auto_stop_radius_m: positiveInt,
  max_trip_minutes: positiveInt,
  track_retention_days: positiveInt,
  self_employed_reminder_days: positiveInt,
  tax_methods_enabled: uniqueList(z.enum(TAX_METHODS)),
  payment_methods_enabled: uniqueList(z.enum(PAYMENT_METHODS)),
  referral_required: z.boolean(),
  ref_on_demo_fee: z.boolean(),
  address_visible_before_accept: z.boolean(),
  confirm_reminder_hours: uniqueList(positiveInt).min(1),
  confirm_admin_task_hours: positiveInt,
} as const;

export const settingsSchema = z.object(settingsShape).superRefine((settings, ctx) => {
  // Referral shares are paid out of the fee; the platform share must not go negative (§6).
  if (settings.ref_l1_bps + settings.ref_l2_bps > settings.fee_bps) {
    ctx.addIssue({
      code: 'custom',
      path: ['ref_l1_bps'],
      message: 'ref_l1_bps + ref_l2_bps must not exceed fee_bps',
    });
  }
});

export type SettingKey = keyof typeof settingsShape;
/** Parsed settings as used by the code (money as bigint). */
export type Settings = z.output<typeof settingsSchema>;
/** Settings as stored in the database (money as tiyin strings). */
export type StoredSettings = z.input<typeof settingsSchema>;

export const SETTING_KEYS = Object.keys(settingsShape) as SettingKey[];
