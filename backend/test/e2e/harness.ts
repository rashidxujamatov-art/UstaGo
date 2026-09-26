/**
 * Shared end-to-end setup: a real PostgreSQL (E2E_DATABASE_URL, migrations applied) and
 * Redis (E2E_REDIS_URL, or "mock" for an in-memory ioredis-mock). Tables are emptied —
 * never point these at a database with real data.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { Redis } from 'ioredis';
import RedisMock from 'ioredis-mock';
import request from 'supertest';
import { categoriesSeed } from '../../prisma/seed/categories.js';
import { settingsDefaults } from '../../prisma/seed/settings.defaults.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';

export const e2eDatabaseUrl = process.env.E2E_DATABASE_URL;
export const e2eRedisUrl = process.env.E2E_REDIS_URL;
export const e2eEnabled = Boolean(e2eDatabaseUrl && e2eRedisUrl);
export const realRedis = e2eEnabled && e2eRedisUrl !== 'mock';

export interface Harness {
  app: INestApplication;
  api: () => ReturnType<typeof request>;
  prisma: PrismaClient;
  redis: Redis;
  /** Base URL of the listening server (for Socket.IO). */
  url: string;
  lastSmsCode: (phone: string) => string;
  close: () => Promise<void>;
}

export async function createHarness(): Promise<Harness> {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: e2eDatabaseUrl,
    REDIS_URL: realRedis ? e2eRedisUrl : 'redis://localhost:6379',
    APP_NAME: 'GTM',
    APP_DOMAIN: 'example.test',
    JWT_ACCESS_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
    PINFL_ENC_KEY: Buffer.alloc(32, 3).toString('base64'),
    PINFL_HMAC_KEY: 'e2e-hmac-key-e2e-hmac-key-e2e-hmac-key',
    SMS_PROVIDER: 'mock',
    IDENTITY_PROVIDER: 'mock',
    MAPS_PROVIDER: 'mock',
    STORAGE_PROVIDER: 'mock',
    PUSH_PROVIDER: 'mock',
    OTP_TEST_MODE: 'false',
    LOG_LEVEL: 'fatal',
  });

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: e2eDatabaseUrl! }) });
  const redis = realRedis ? new Redis(e2eRedisUrl!) : (new RedisMock() as unknown as Redis);
  await prisma.$executeRawUnsafe(
    `TRUNCATE users, invite_codes, audit_logs, settings, categories, orders, order_events,
       messages, wallet_accounts, ledger_transactions, ledger_entries, wallet_holds, maps_usage
     RESTART IDENTITY CASCADE`,
  );
  await redis.flushdb();
  // Generous IP limits: every request here comes from 127.0.0.1.
  await prisma.setting.createMany({
    data: Object.entries({ ...settingsDefaults, otp_ip_limit: 10_000 }).map(([key, value]) => ({
      key,
      value,
    })),
  });
  await prisma.category.createMany({
    data: categoriesSeed.map((category, index) => ({ ...category, sortOrder: index + 1 })),
  });

  const { AppModule } = await import('../../src/app.module.js');
  const { REDIS } = await import('../../src/infra/redis/redis.module.js');
  const { SMS_PROVIDER } = await import('../../src/modules/sms/sms.provider.js');
  const { RedisIoAdapter } = await import('../../src/infra/redis-io.adapter.js');

  const builder = Test.createTestingModule({ imports: [AppModule] });
  if (!realRedis) builder.overrideProvider(REDIS).useValue(redis);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1');
  if (realRedis) app.useWebSocketAdapter(new RedisIoAdapter(app, app.get(REDIS), []));
  await app.listen(0);
  const address = app.getHttpServer().address() as { port: number };

  const sms = app.get<{ lastTo(phone: string): { text: string } | undefined }>(SMS_PROVIDER);
  return {
    app,
    api: () => request(app.getHttpServer()),
    prisma,
    redis,
    url: `http://127.0.0.1:${address.port}`,
    lastSmsCode: (phone) => /\b(\d{6})\b/.exec(sms.lastTo(phone)?.text ?? '')?.[1] ?? '',
    close: async () => {
      await app.close();
      await prisma.$disconnect();
      if (realRedis) await redis.quit();
    },
  };
}

let counter = 2_000_000;
export const nextPhone = () => `+99891${(counter += 1).toString().padStart(7, '0')}`;
export const device = (id: string) => ({
  id: `device-${id}-0000`,
  name: `Phone ${id}`,
  platform: 'android',
});

/** A person who finished sign-up, MyID and role choice. */
export async function fullUser(
  h: Harness,
  docNumber: string,
  role: 'CUSTOMER' | 'EXECUTOR',
): Promise<{ id: string; phone: string; token: string; auth: { Authorization: string } }> {
  const code = `P${(counter += 1).toString(36).toUpperCase()}`;
  await h.prisma.inviteCode.create({ data: { code } });
  const phone = nextPhone();
  const dev = device(phone.slice(-6));
  await h
    .api()
    .post('/api/v1/auth/register')
    .send({
      phone,
      email: `u${phone.slice(-7)}@example.test`,
      password: 'parol1234',
      referral_code: code,
      lang: 'uz',
      device: dev,
      accept_terms: true,
    })
    .expect(202);
  const signed = await h
    .api()
    .post('/api/v1/auth/otp/verify')
    .send({ purpose: 'REGISTER', phone, code: h.lastSmsCode(phone), device: dev })
    .expect(200);
  const token = signed.body.tokens.access_token as string;
  const auth = { Authorization: `Bearer ${token}` };
  const session = await h
    .api()
    .post('/api/v1/identity/myid/session')
    .set(auth)
    .send({
      doc_type: 'ID_CARD',
      doc_number: docNumber,
      birth_date: '1990-01-15',
      consent: true,
      device_id: dev.id,
    })
    .expect(200);
  await h
    .api()
    .post('/api/v1/identity/myid/complete')
    .set(auth)
    .send({ session_id: session.body.session_id })
    .expect(200);
  const me = await h.api().post('/api/v1/me/role').set(auth).send({ role }).expect(200);
  return { id: me.body.id as string, phone, token, auth };
}
