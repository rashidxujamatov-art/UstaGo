import { z } from 'zod';
import { normalizePhone } from '../../common/phone.js';

export const phoneSchema = z
  .string()
  .max(32)
  .transform((value, ctx) => {
    const phone = normalizePhone(value);
    if (!phone) {
      ctx.addIssue({ code: 'custom', message: 'expected +998XXXXXXXXX' });
      return z.NEVER;
    }
    return phone;
  });

export const languageSchema = z.enum(['uz', 'ru', 'en', 'tg']);

/** The app instance: a random id kept in secure storage, plus a display name. */
export const deviceSchema = z.object({
  id: z.string().min(8).max(64),
  name: z.string().trim().max(64).optional(),
  platform: z.enum(['ios', 'android']),
});
export type DeviceInput = z.infer<typeof deviceSchema>;

const otpCode = z.string().regex(/^\d{4,8}$/);

export const registerSchema = z.object({
  phone: phoneSchema,
  email: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  /** Strength is checked separately to return AUTH_WEAK_PASSWORD. */
  password: z.string().max(128),
  referral_code: z.string().trim().max(32).optional(),
  lang: languageSchema,
  device: deviceSchema,
  accept_terms: z.literal(true),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const verifyOtpSchema = z.object({
  purpose: z.enum(['REGISTER', 'LOGIN']),
  phone: phoneSchema,
  code: otpCode,
  device: deviceSchema,
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const resendOtpSchema = z.object({
  purpose: z.enum(['REGISTER', 'LOGIN', 'PASSWORD_RESET']),
  phone: phoneSchema,
  lang: languageSchema,
  device: deviceSchema.optional(),
});
export type ResendOtpInput = z.infer<typeof resendOtpSchema>;

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1).max(128),
  lang: languageSchema,
  device: deviceSchema,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refresh_token: z.string().min(20).max(200),
});

export const passwordResetSchema = z.object({
  phone: phoneSchema,
  lang: languageSchema,
});

export const passwordResetConfirmSchema = z.object({
  phone: phoneSchema,
  code: otpCode,
  new_password: z.string().max(128),
});
