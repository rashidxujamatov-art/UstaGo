/**
 * End-to-end tests of stage 1 (docs/02-arxitektura.md §13): registration, SMS codes,
 * MyID (mock), roles, sign-in on new devices, sessions and password reset.
 *
 * Needs a real PostgreSQL (with migrations applied) and Redis. They are taken from
 * E2E_DATABASE_URL and E2E_REDIS_URL ("mock" = in-memory ioredis-mock, for machines
 * without Redis); without them the suite is skipped. The tables
 * are emptied, so never point these at a database with real data.
 */
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { Redis } from 'ioredis';
import RedisMock from 'ioredis-mock';
import request from 'supertest';
import { settingsDefaults } from '../../prisma/seed/settings.defaults.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';

const databaseUrl = process.env.E2E_DATABASE_URL;
const redisUrl = process.env.E2E_REDIS_URL;
const enabled = Boolean(databaseUrl && redisUrl);

type Api = ReturnType<typeof request>;

const device = (id: string) => ({
  id: `device-${id}-0000`,
  name: `Phone ${id}`,
  platform: 'android',
});

describe.skipIf(!enabled)('auth flow (e2e)', () => {
  let app: INestApplication;
  let api: () => Api;
  let prisma: PrismaClient;
  let redis: Redis;
  let sms: { lastTo(phone: string): { text: string } | undefined };
  let phoneCounter = 1_000_000;

  const nextPhone = () => `+99890${(phoneCounter += 1).toString().padStart(7, '0')}`;
  const lastCode = (phone: string) => /\b(\d{6})\b/.exec(sms.lastTo(phone)?.text ?? '')?.[1] ?? '';

  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl === 'mock' ? 'redis://localhost:6379' : redisUrl,
      APP_NAME: 'GTM',
      APP_DOMAIN: 'example.test',
      JWT_ACCESS_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
      PINFL_ENC_KEY: Buffer.alloc(32, 3).toString('base64'),
      PINFL_HMAC_KEY: 'e2e-hmac-key-e2e-hmac-key-e2e-hmac-key',
      SMS_PROVIDER: 'mock',
      IDENTITY_PROVIDER: 'mock',
      OTP_TEST_MODE: 'false',
      LOG_LEVEL: 'fatal',
    });

    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    redis = redisUrl === 'mock' ? (new RedisMock() as unknown as Redis) : new Redis(redisUrl!);
    await prisma.$executeRawUnsafe(
      'TRUNCATE users, invite_codes, audit_logs, settings RESTART IDENTITY CASCADE',
    );
    await redis.flushdb();
    // Generous IP limits: every request here comes from 127.0.0.1.
    const settings = { ...settingsDefaults, otp_ip_limit: 10_000 };
    await prisma.setting.createMany({
      data: Object.entries(settings).map(([key, value]) => ({ key, value })),
    });

    const { AppModule } = await import('../../src/app.module.js');
    const { SMS_PROVIDER } = await import('../../src/modules/sms/sms.provider.js');
    const { REDIS } = await import('../../src/infra/redis/redis.module.js');
    const builder = Test.createTestingModule({ imports: [AppModule] });
    if (redisUrl === 'mock') builder.overrideProvider(REDIS).useValue(redis);
    const moduleRef = await builder.compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    await app.init();
    sms = app.get(SMS_PROVIDER);
    api = () => request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await redis?.quit();
  });

  async function platformCode(maxUses: number | null = null): Promise<string> {
    const code = `PLAT${(phoneCounter += 1).toString(36).toUpperCase()}`;
    await prisma.inviteCode.create({ data: { code, maxUses } });
    return code;
  }

  /** K2 → K3: returns tokens of a new account that still needs MyID. */
  async function register(referralCode: string, phone = nextPhone(), id = phone.slice(-4)) {
    await api()
      .post('/api/v1/auth/register')
      .send({
        phone,
        email: `u${phone.slice(-7)}@example.test`,
        password: 'parol1234',
        referral_code: referralCode,
        lang: 'uz',
        device: device(id),
        accept_terms: true,
      })
      .expect(202);
    const res = await api()
      .post('/api/v1/auth/otp/verify')
      .send({ purpose: 'REGISTER', phone, code: lastCode(phone), device: device(id) })
      .expect(200);
    return { phone, id, access: res.body.tokens.access_token as string, body: res.body };
  }

  async function verifyIdentity(access: string, docNumber: string, birthDate = '1990-01-15') {
    const start = await api()
      .post('/api/v1/identity/myid/session')
      .set('Authorization', `Bearer ${access}`)
      .send({
        doc_type: 'ID_CARD',
        doc_number: docNumber,
        birth_date: birthDate,
        consent: true,
        device_id: 'device-x-0000',
      })
      .expect(200);
    return api()
      .post('/api/v1/identity/myid/complete')
      .set('Authorization', `Bearer ${access}`)
      .send({ session_id: start.body.session_id });
  }

  /** A fully registered person (MyID + role) whose referral code works. */
  async function fullUser(docNumber: string, role: 'CUSTOMER' | 'EXECUTOR' = 'CUSTOMER') {
    const user = await register(await platformCode());
    await (
      await verifyIdentity(user.access, docNumber)
    ).body;
    const me = await api()
      .post('/api/v1/me/role')
      .set('Authorization', `Bearer ${user.access}`)
      .send({ role })
      .expect(200);
    return { ...user, me: me.body };
  }

  it('serves the public config the app shows before sign-in', async () => {
    const res = await api().get('/api/v1/config').expect(200);
    expect(res.body).toMatchObject({
      free_period_days: 30,
      demo_bonus: '2500000',
      min_age_years: 16,
    });
  });

  it('rejects requests without a token', async () => {
    const res = await api().get('/api/v1/me').expect(401);
    expect(res.body).toEqual({ code: 'UNAUTHORIZED', params: {} });
  });

  it('registers with a platform code: K2 → K3 → K3b/K3c → K4 (§2)', async () => {
    const code = await platformCode(5);
    const { access, body } = await register(code);

    expect(body.user).toMatchObject({
      onboarding_step: 'IDENTITY',
      identity: null,
      active_role: null,
    });
    expect((await prisma.inviteCode.findUniqueOrThrow({ where: { code } })).used).toBe(1);
    const created = await prisma.user.findFirstOrThrow({ where: { inviteCode: { code } } });
    expect(created.referrerId).toBeNull(); // platform code: no L1

    const identity = await verifyIdentity(access, 'AD1234567');
    expect(identity.status).toBe(200);
    expect(identity.body).toMatchObject({ onboarding_step: 'ROLE' });
    expect(identity.body.identity.first_name).toBeTruthy();

    const role = await api()
      .post('/api/v1/me/role')
      .set('Authorization', `Bearer ${access}`)
      .send({ role: 'EXECUTOR' })
      .expect(200);
    expect(role.body).toMatchObject({ onboarding_step: 'DONE', active_role: 'EXECUTOR' });
    const days =
      (Date.parse(role.body.executor.free_period_end) -
        Date.parse(role.body.executor.free_period_start)) /
      86_400_000;
    expect(days).toBe(30); // free_period_days

    // PINFL is stored encrypted and hashed, never in plain text (rule 9).
    const stored = await prisma.identity.findUniqueOrThrow({ where: { userId: role.body.id } });
    expect(stored.pinflHash).toMatch(/^[0-9a-f]{64}$/);
    expect(Buffer.from(stored.pinflEnc).toString('latin1')).not.toMatch(/\d{14}/);
  });

  it('requires a valid referral code (T16) and only counts finished accounts as inviters', async () => {
    const phone = nextPhone();
    const payload = {
      phone,
      email: `x${phone.slice(-7)}@example.test`,
      password: 'parol1234',
      lang: 'uz',
      device: device('ref0'),
      accept_terms: true,
    };
    expect((await api().post('/api/v1/auth/register').send(payload).expect(400)).body.code).toBe(
      'AUTH_REFERRAL_REQUIRED',
    );
    expect(
      (
        await api()
          .post('/api/v1/auth/register')
          .send({ ...payload, referral_code: 'NOPE1234' })
          .expect(400)
      ).body.code,
    ).toBe('AUTH_REFERRAL_INVALID');

    const unfinished = await register(await platformCode());
    const code = (await api().get('/api/v1/me').set('Authorization', `Bearer ${unfinished.access}`))
      .body.referral.code as string;
    expect((await api().get(`/api/v1/auth/invite/${code}`).expect(400)).body.code).toBe(
      'AUTH_REFERRAL_INVALID',
    );
  });

  it('links L1 when a person invites another and shows the inviter on K2', async () => {
    const inviter = await fullUser('AB1111111');
    const invite = await api().get(`/api/v1/auth/invite/${inviter.me.referral.code}`).expect(200);
    expect(invite.body).toEqual({
      kind: 'USER',
      inviter: {
        first_name: inviter.me.identity.first_name,
        last_name: inviter.me.identity.last_name,
      },
    });

    const invited = await register(inviter.me.referral.code);
    const row = await prisma.user.findUniqueOrThrow({ where: { phone: invited.phone } });
    expect(row.referrerId).toBe(inviter.me.id);
  });

  it('allows one account per person: a second MyID with the same PINFL is refused (K3d)', async () => {
    const first = await fullUser('AC2222222', 'EXECUTOR');
    const second = await register(await platformCode());

    const res = await verifyIdentity(second.access, 'AC2222222');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      code: 'AUTH_DUPLICATE_PERSON',
      params: {
        phone_masked: `+998 90 *** ** ${first.phone.slice(-2)}`,
        created_at: first.me.created_at,
        free_period_used: true,
      },
    });
    // The duplicate registration is gone; its phone is free again.
    expect(await prisma.user.findUnique({ where: { phone: second.phone } })).toBeNull();
  });

  it('refuses people younger than min_age_years (16)', async () => {
    const user = await register(await platformCode());
    const now = new Date();
    const fifteen = `${now.getUTCFullYear() - 15}-01-01`;
    const res = await verifyIdentity(user.access, 'AE3333333', fifteen);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 'AUTH_AGE_RESTRICTED', params: { min_age: 16 } });
  });

  it('asks for an SMS code on a new device only (§2)', async () => {
    const user = await fullUser('AF4444444');
    const login = (id: string) =>
      api()
        .post('/api/v1/auth/login')
        .send({ phone: user.phone, password: 'parol1234', lang: 'uz', device: device(id) });

    const trusted = await login(user.id).expect(200);
    expect(trusted.body.otp_required).toBe(false);
    expect(trusted.body.tokens.access_token).toBeTruthy();

    const fresh = await login('new1').expect(200);
    expect(fresh.body).toMatchObject({ otp_required: true, otp: { length: 6 } });
    const verified = await api()
      .post('/api/v1/auth/otp/verify')
      .send({
        purpose: 'LOGIN',
        phone: user.phone,
        code: lastCode(user.phone),
        device: device('new1'),
      })
      .expect(200);
    expect(verified.body.user.id).toBe(user.me.id);

    // Now trusted: no SMS the second time.
    expect((await login('new1').expect(200)).body.otp_required).toBe(false);
  });

  it('locks sign-in after login_attempt_limit wrong passwords', async () => {
    const user = await fullUser('AG5555555');
    for (let i = 0; i < 5; i += 1) {
      const res = await api()
        .post('/api/v1/auth/login')
        .send({ phone: user.phone, password: 'wrong1234', lang: 'uz', device: device(user.id) })
        .expect(401);
      expect(res.body.code).toBe('AUTH_INVALID_CREDENTIALS');
    }
    const locked = await api()
      .post('/api/v1/auth/login')
      .send({ phone: user.phone, password: 'parol1234', lang: 'uz', device: device(user.id) })
      .expect(429);
    expect(locked.body.code).toBe('RATE_LIMITED');
  });

  it('rotates refresh tokens and signs everything out when an old one is reused', async () => {
    const user = await register(await platformCode());
    const firstRefresh = user.body.tokens.refresh_token as string;

    const rotated = await api()
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: firstRefresh })
      .expect(200);
    const newAccess = rotated.body.access_token as string;
    await api().get('/api/v1/me').set('Authorization', `Bearer ${newAccess}`).expect(200);

    const reuse = await api()
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: firstRefresh })
      .expect(401);
    expect(reuse.body.code).toBe('AUTH_SESSION_INVALID');
    await api().get('/api/v1/me').set('Authorization', `Bearer ${newAccess}`).expect(401);
    await api()
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: rotated.body.refresh_token })
      .expect(401);
  });

  it('logs out the current session', async () => {
    const user = await register(await platformCode());
    await api()
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${user.access}`)
      .expect(204);
    await api().get('/api/v1/me').set('Authorization', `Bearer ${user.access}`).expect(401);
  });

  it('resets the password by SMS and closes all sessions', async () => {
    const user = await fullUser('AH6666666');
    await api()
      .post('/api/v1/auth/password/reset')
      .send({ phone: user.phone, lang: 'ru' })
      .expect(202);
    expect(sms.lastTo(user.phone)?.text).toMatch(/код подтверждения/);

    await api()
      .post('/api/v1/auth/password/reset/confirm')
      .send({ phone: user.phone, code: lastCode(user.phone), new_password: 'yangi5678' })
      .expect(204);
    await api().get('/api/v1/me').set('Authorization', `Bearer ${user.access}`).expect(401);

    const login = await api()
      .post('/api/v1/auth/login')
      .send({ phone: user.phone, password: 'yangi5678', lang: 'uz', device: device(user.id) })
      .expect(200);
    expect(login.body.otp_required).toBe(false);
  });

  it('answers a password reset for an unknown phone like any other', async () => {
    const res = await api()
      .post('/api/v1/auth/password/reset')
      .send({ phone: nextPhone(), lang: 'uz' })
      .expect(202);
    expect(res.body.otp).toMatchObject({ length: 6 });
  });

  it('lists devices and signs one out', async () => {
    const user = await fullUser('AJ7777777');
    const auth = { Authorization: `Bearer ${user.access}` };
    const list = await api().get('/api/v1/me/devices').set(auth).expect(200);
    expect(list.body).toEqual([
      expect.objectContaining({ current: true, trusted: true, platform: 'android' }),
    ]);

    await api().delete(`/api/v1/me/devices/${list.body[0].id}`).set(auth).expect(204);
    await api().get('/api/v1/me').set(auth).expect(401);
  });

  it('refuses a role before MyID and a second MyID after it', async () => {
    const user = await register(await platformCode());
    const auth = { Authorization: `Bearer ${user.access}` };
    expect(
      (await api().post('/api/v1/me/role').set(auth).send({ role: 'CUSTOMER' }).expect(403)).body
        .code,
    ).toBe('AUTH_IDENTITY_REQUIRED');
    await verifyIdentity(user.access, 'AK8888888');
    const again = await api()
      .post('/api/v1/identity/myid/session')
      .set(auth)
      .send({
        doc_type: 'ID_CARD',
        doc_number: 'AK8888888',
        birth_date: '1990-01-15',
        consent: true,
        device_id: 'device-x-0000',
      })
      .expect(409);
    expect(again.body.code).toBe('AUTH_IDENTITY_ALREADY_VERIFIED');
  });

  it('returns field names, not messages, for invalid input', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ phone: '123', lang: 'xx' })
      .expect(400);
    expect(res.body).toEqual({
      code: 'VALIDATION_FAILED',
      params: { fields: expect.stringContaining('phone') },
    });
  });
});
