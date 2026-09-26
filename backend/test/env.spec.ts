import { validateEnv } from '../src/config/env.js';

const valid = {
  NODE_ENV: 'development',
  APP_NAME: 'GTM',
  APP_DOMAIN: 'localhost',
  DATABASE_URL: 'postgresql://app:secret@localhost:5432/app',
  REDIS_URL: 'redis://:secret@localhost:6379/0',
  JWT_ACCESS_SECRET: 'x'.repeat(48),
  PINFL_ENC_KEY: Buffer.alloc(32, 1).toString('base64'),
  PINFL_HMAC_KEY: 'y'.repeat(48),
  SMS_PROVIDER: 'mock',
  IDENTITY_PROVIDER: 'mock',
  MAPS_PROVIDER: 'mock',
  STORAGE_PROVIDER: 'mock',
  PUSH_PROVIDER: 'mock',
  CARD_PROVIDER: 'mock',
  CARD_TOKEN_ENC_KEY: Buffer.alloc(32, 2).toString('base64'),
  PAYOUT_PROVIDER: 'mock',
};

describe('validateEnv', () => {
  it('applies non-secret defaults', () => {
    expect(validateEnv(valid)).toMatchObject({
      PORT: 4000,
      LOG_LEVEL: 'info',
      CORS_ORIGINS: [],
      FEATURE_PAYOUTS_ENABLED: false,
      OTP_TEST_MODE: false,
      PAYMENT_TEST_MODE: false,
      PAYME_CHECKOUT_URL: 'https://checkout.paycom.uz',
      ACCESS_TOKEN_TTL_SEC: 900,
      REFRESH_TOKEN_TTL_DAYS: 30,
    });
  });

  it('has no default for secrets and names every missing key', () => {
    const { DATABASE_URL: _db, JWT_ACCESS_SECRET: _jwt, PINFL_ENC_KEY: _key, ...rest } = valid;
    expect(() => validateEnv(rest)).toThrow(
      /DATABASE_URL[\s\S]*JWT_ACCESS_SECRET[\s\S]*PINFL_ENC_KEY/,
    );
  });

  it('parses the CORS list and the payouts flag', () => {
    expect(
      validateEnv({
        ...valid,
        CORS_ORIGINS: 'https://admin.example.com, http://localhost:5173',
        FEATURE_PAYOUTS_ENABLED: 'true',
      }),
    ).toMatchObject({
      CORS_ORIGINS: ['https://admin.example.com', 'http://localhost:5173'],
      FEATURE_PAYOUTS_ENABLED: true,
    });
  });

  it('rejects database URLs that are not PostgreSQL', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: 'mysql://localhost/app' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('rejects a PINFL key that is not 32 bytes', () => {
    expect(() =>
      validateEnv({ ...valid, PINFL_ENC_KEY: Buffer.alloc(16).toString('base64') }),
    ).toThrow(/PINFL_ENC_KEY/);
  });

  it('allows the fixed OTP code only in development (CLAUDE.md rule 6)', () => {
    expect(validateEnv({ ...valid, OTP_TEST_MODE: 'true' }).OTP_TEST_MODE).toBe(true);
    expect(() => validateEnv({ ...valid, NODE_ENV: 'staging', OTP_TEST_MODE: 'true' })).toThrow(
      /OTP_TEST_MODE/,
    );
  });

  it('refuses mock adapters in production and needs Eskiz credentials for Eskiz', () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: 'production' })).toThrow(
      /SMS_PROVIDER[\s\S]*IDENTITY_PROVIDER/,
    );
    expect(() => validateEnv({ ...valid, SMS_PROVIDER: 'eskiz' })).toThrow(
      /ESKIZ_EMAIL[\s\S]*ESKIZ_PASSWORD[\s\S]*ESKIZ_FROM/,
    );
    expect(() => validateEnv({ ...valid, NODE_ENV: 'production' })).toThrow(/CARD_PROVIDER/);
    expect(() => validateEnv({ ...valid, CARD_PROVIDER: 'payme' })).toThrow(
      /PAYME_MERCHANT_ID[\s\S]*PAYME_KEY/,
    );
  });

  it('allows the payment test mode only in development', () => {
    expect(validateEnv({ ...valid, PAYMENT_TEST_MODE: 'true' }).PAYMENT_TEST_MODE).toBe(true);
    expect(() => validateEnv({ ...valid, NODE_ENV: 'staging', PAYMENT_TEST_MODE: 'true' })).toThrow(
      /PAYMENT_TEST_MODE/,
    );
  });
});
