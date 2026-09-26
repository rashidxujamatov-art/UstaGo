import type { ConfigService } from '@nestjs/config';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import { settingsDefaults } from '../../../prisma/seed/settings.defaults.js';
import { AppError } from '../../common/errors/app-error.js';
import { RateLimiter } from '../../common/rate-limit/rate-limiter.service.js';
import type { Env } from '../../config/env.js';
import { parseSettings } from '../settings/settings.service.js';
import type { SettingsService } from '../settings/settings.service.js';
import { MockSmsProvider } from '../sms/mock-sms.provider.js';
import { OtpService } from './otp.service.js';

const PHONE = '+998901234567';

// ioredis-mock shares data between instances with the same port; give each test its own.
let mockPort = 7000;

function setup(options: { testMode?: boolean; overrides?: Record<string, unknown> } = {}) {
  const redis = new RedisMock({ port: (mockPort += 1) }) as unknown as Redis;
  const settings = parseSettings(
    Object.entries({ ...settingsDefaults, ...options.overrides }).map(([key, value]) => ({
      key,
      value,
    })),
  );
  const settingsService = { getAll: () => Promise.resolve(settings) } as SettingsService;
  const config = {
    get: (key: keyof Env) =>
      ({ OTP_TEST_MODE: options.testMode ?? false, APP_NAME: 'GTM' })[key as 'APP_NAME'],
  } as unknown as ConfigService<Env, true>;
  const sms = new MockSmsProvider(false);
  const otp = new OtpService(redis, sms, settingsService, new RateLimiter(redis), config);
  const lastCode = () => /\b(\d{6})\b/.exec(sms.lastTo(PHONE)?.text ?? '')?.[1] ?? '';
  return { otp, sms, redis, lastCode };
}

async function expectCode(promise: Promise<unknown>, code: string, params?: object) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ code, ...(params ? { params } : {}) });
}

const send = (otp: OtpService, ip = '10.0.0.1', purpose: 'REGISTER' | 'LOGIN' = 'REGISTER') =>
  otp.send({ purpose, phone: PHONE, language: 'uz', ip });

describe('OtpService (docs/01-biznes-qoidalar.md §2)', () => {
  it('sends a 6-digit code in the chosen language and accepts it once', async () => {
    const { otp, sms, lastCode } = setup();

    await expect(send(otp)).resolves.toEqual({ length: 6, ttl_sec: 300, resend_after_sec: 60 });
    expect(sms.lastTo(PHONE)?.text).toMatch(/^GTM: tasdiqlash kodi \d{6}\./);

    const code = lastCode();
    await expect(otp.verify('REGISTER', PHONE, code)).resolves.toBeUndefined();
    await expectCode(otp.verify('REGISTER', PHONE, code), 'AUTH_OTP_EXPIRED');
  });

  it('keeps codes of different purposes apart', async () => {
    const { otp, lastCode } = setup();
    await send(otp);
    await expectCode(otp.verify('LOGIN', PHONE, lastCode()), 'AUTH_OTP_EXPIRED');
  });

  it('counts wrong codes and burns the code after the last attempt', async () => {
    const { otp, lastCode } = setup();
    await send(otp);
    const code = lastCode();
    const wrong = code === '000000' ? '111111' : '000000';

    for (let left = 4; left >= 0; left -= 1) {
      await expectCode(otp.verify('REGISTER', PHONE, wrong), 'AUTH_OTP_INVALID', {
        attempts_left: left,
      });
    }
    await expectCode(otp.verify('REGISTER', PHONE, code), 'AUTH_OTP_EXPIRED');
  });

  it('refuses a resend before otp_resend_sec', async () => {
    const { otp } = setup();
    await send(otp);
    await expectCode(send(otp), 'AUTH_OTP_TOO_EARLY');
  });

  it('limits codes per phone and per IP within the window', async () => {
    const { otp } = setup({
      overrides: { otp_resend_sec: 1, otp_phone_limit: 2, otp_ip_limit: 10 },
    });
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      await send(otp);
      vi.setSystemTime(Date.now() + 1_500);
      await send(otp);
      vi.setSystemTime(Date.now() + 1_500);
      await expectCode(send(otp), 'RATE_LIMITED');
    } finally {
      vi.useRealTimers();
    }

    const perIp = setup({ overrides: { otp_ip_limit: 1 } });
    await send(perIp.otp, '10.0.0.9');
    await expectCode(
      perIp.otp.send({ purpose: 'LOGIN', phone: '+998935552108', language: 'uz', ip: '10.0.0.9' }),
      'RATE_LIMITED',
    );
  });

  it('uses 000000 only in test mode', async () => {
    const { otp, lastCode } = setup({ testMode: true });
    await send(otp);
    expect(lastCode()).toBe('000000');
  });
});
