import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

/** 32 random bytes, base64-encoded (`openssl rand -base64 32`). */
const base64Key32 = z
  .string()
  .refine((value) => Buffer.from(value, 'base64').length === 32, 'must be 32 bytes, base64');

/**
 * Process environment. Secrets have no defaults on purpose (CLAUDE.md rule 5):
 * the process refuses to start when one is missing.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    /** Express "trust proxy": set when running behind Nginx/Caddy so client IPs are real. */
    TRUST_PROXY: booleanString.default(false),

    // Branding and identifiers are configuration, never literals in code (docs/01 §13, question 1).
    APP_NAME: z.string().min(1),
    APP_DOMAIN: z.string().min(1),

    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),

    /** Comma-separated list of allowed browser origins (admin web). Empty = CORS disabled. */
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),

    // Sessions (docs/02-arxitektura.md §10).
    JWT_ACCESS_SECRET: z.string().min(32),
    ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

    // PINFL protection (CLAUDE.md rule 9).
    PINFL_ENC_KEY: base64Key32,
    PINFL_HMAC_KEY: z.string().min(32),

    // External services: real adapters or mocks (docs/02-arxitektura.md §9).
    SMS_PROVIDER: z.enum(['mock', 'eskiz']),
    ESKIZ_EMAIL: z.string().optional(),
    ESKIZ_PASSWORD: z.string().optional(),
    /** Sender name approved by Eskiz. */
    ESKIZ_FROM: z.string().optional(),
    /** Only the mock exists until MyID keys are issued (docs/01 §14). */
    IDENTITY_PROVIDER: z.enum(['mock']),

    /** Google Maps Platform proxy (docs/01 §10). The server key is IP-restricted. */
    MAPS_PROVIDER: z.enum(['mock', 'google']),
    GOOGLE_MAPS_SERVER_KEY: z.string().optional(),

    /** Photos: S3-compatible storage (MinIO locally), or an in-memory mock for tests. */
    STORAGE_PROVIDER: z.enum(['mock', 's3']),
    S3_ENDPOINT: z.url().optional(),
    /** Endpoint the phones use in presigned URLs (e.g. http://10.0.2.2:9000 for the emulator). */
    S3_PUBLIC_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY: z.string().optional(),
    S3_SECRET_KEY: z.string().optional(),

    /** Push notifications (FCM). The mock only logs. */
    PUSH_PROVIDER: z.enum(['mock']),

    /** Fixed OTP code (all zeros). Allowed only with NODE_ENV=development (CLAUDE.md rule 6). */
    OTP_TEST_MODE: booleanString.default(false),

    /** Payouts stay behind this flag until the legal scheme is approved (docs/01 §14). */
    FEATURE_PAYOUTS_ENABLED: booleanString.default(false),

    // Payments (docs/02-arxitektura.md §9). Callbacks are always checked (CLAUDE.md rule 4):
    // without the key or secret below, every callback of that provider is refused.
    /** Payme merchant (cash desk) id and key; the key authenticates Payme's callbacks. */
    PAYME_MERCHANT_ID: z.string().optional(),
    PAYME_KEY: z.string().optional(),
    /** https://checkout.paycom.uz in production, https://test.paycom.uz in the sandbox. */
    PAYME_CHECKOUT_URL: z.url().default('https://checkout.paycom.uz'),
    /** Click merchant; the secret key signs Prepare / Complete. */
    CLICK_SERVICE_ID: z.string().optional(),
    CLICK_MERCHANT_ID: z.string().optional(),
    CLICK_SECRET_KEY: z.string().optional(),
    /** Card tokens and card payments (BY5, BJ6): mock locally, Payme Subscribe API for real. */
    CARD_PROVIDER: z.enum(['mock', 'payme']),
    /** Payme Subscribe API endpoint (https://checkout.paycom.uz/api; sandbox test.paycom.uz/api). */
    PAYME_SUBSCRIBE_URL: z.url().default('https://checkout.paycom.uz/api'),
    /** Card tokens are stored encrypted (AES-256-GCM). */
    CARD_TOKEN_ENC_KEY: base64Key32,
    /** Payouts to cards (BJ7). The provider is not chosen yet (docs/01 §14): only the mock. */
    PAYOUT_PROVIDER: z.enum(['mock']),
    /**
     * Lets the payer finish a Click / Payme payment without the provider app, for local
     * testing. Allowed only with NODE_ENV=development, like OTP_TEST_MODE.
     */
    PAYMENT_TEST_MODE: booleanString.default(false),
  })
  .superRefine((env, ctx) => {
    for (const key of ['OTP_TEST_MODE', 'PAYMENT_TEST_MODE'] as const) {
      if (env[key] && env.NODE_ENV !== 'development') {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'allowed only when NODE_ENV=development',
        });
      }
    }
    if (env.NODE_ENV === 'production') {
      for (const key of [
        'SMS_PROVIDER',
        'IDENTITY_PROVIDER',
        'MAPS_PROVIDER',
        'STORAGE_PROVIDER',
        'PUSH_PROVIDER',
        'CARD_PROVIDER',
      ] as const) {
        if (env[key] === 'mock') {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'mock is not allowed in production',
          });
        }
      }
    }
    const requireKeys = (keys: readonly (keyof typeof env)[], reason: string) => {
      for (const key of keys) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: reason });
      }
    };
    if (env.CARD_PROVIDER === 'payme') {
      requireKeys(['PAYME_MERCHANT_ID', 'PAYME_KEY'], 'required when CARD_PROVIDER=payme');
    }
    if (env.MAPS_PROVIDER === 'google') {
      requireKeys(['GOOGLE_MAPS_SERVER_KEY'], 'required when MAPS_PROVIDER=google');
    }
    if (env.STORAGE_PROVIDER === 's3') {
      requireKeys(
        ['S3_ENDPOINT', 'S3_PUBLIC_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'],
        'required when STORAGE_PROVIDER=s3',
      );
    }
    if (env.SMS_PROVIDER === 'eskiz') {
      for (const key of ['ESKIZ_EMAIL', 'ESKIZ_PASSWORD', 'ESKIZ_FROM'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'required when SMS_PROVIDER=eskiz',
          });
        }
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Used by ConfigModule.forRoot({ validate }). Throws a readable error listing every bad key. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}
