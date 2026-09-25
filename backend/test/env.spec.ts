import { validateEnv } from '../src/config/env.js';

const valid = {
  NODE_ENV: 'development',
  APP_NAME: 'GTM',
  APP_DOMAIN: 'localhost',
  DATABASE_URL: 'postgresql://app:secret@localhost:5432/app',
  REDIS_URL: 'redis://:secret@localhost:6379/0',
};

describe('validateEnv', () => {
  it('applies non-secret defaults', () => {
    expect(validateEnv(valid)).toMatchObject({
      PORT: 4000,
      LOG_LEVEL: 'info',
      CORS_ORIGINS: [],
      FEATURE_PAYOUTS_ENABLED: false,
    });
  });

  it('has no default for secrets and names every missing key', () => {
    const { DATABASE_URL: _db, REDIS_URL: _redis, ...rest } = valid;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL[\s\S]*REDIS_URL/);
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
});
