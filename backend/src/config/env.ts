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

    /** Fixed OTP code (all zeros). Allowed only with NODE_ENV=development (CLAUDE.md rule 6). */
    OTP_TEST_MODE: booleanString.default(false),

    /** Payouts stay behind this flag until the legal scheme is approved (docs/01 §14). */
    FEATURE_PAYOUTS_ENABLED: booleanString.default(false),
  })
  .superRefine((env, ctx) => {
    if (env.OTP_TEST_MODE && env.NODE_ENV !== 'development') {
      ctx.addIssue({
        code: 'custom',
        path: ['OTP_TEST_MODE'],
        message: 'allowed only when NODE_ENV=development',
      });
    }
    if (env.NODE_ENV === 'production') {
      for (const key of ['SMS_PROVIDER', 'IDENTITY_PROVIDER'] as const) {
        if (env[key] === 'mock') {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'mock is not allowed in production',
          });
        }
      }
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
