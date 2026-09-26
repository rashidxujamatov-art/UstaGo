import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { randomDigits, sha256Hex } from '../../common/crypto/tokens.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { RateLimiter } from '../../common/rate-limit/rate-limiter.service.js';
import type { Env } from '../../config/env.js';
import type { Language } from '../../generated/prisma/client.js';
import { REDIS } from '../../infra/redis/redis.module.js';
import { SettingsService } from '../settings/settings.service.js';
import { SMS_PROVIDER, type SmsProvider } from '../sms/sms.provider.js';
import { otpSmsText } from '../sms/sms-texts.js';

export type OtpPurpose = 'REGISTER' | 'LOGIN' | 'PASSWORD_RESET';

export interface OtpTicket {
  length: number;
  ttl_sec: number;
  resend_after_sec: number;
}

export interface SendOtpInput {
  purpose: OtpPurpose;
  phone: string;
  language: Language;
  ip: string;
}

/**
 * SMS codes (docs/01-biznes-qoidalar.md §2): length, lifetime, resend delay, attempts and
 * phone/IP limits all come from settings. Only a hash of the code is kept in Redis.
 */
@Injectable()
export class OtpService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    private readonly settings: SettingsService,
    private readonly rateLimiter: RateLimiter,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async send({ purpose, phone, language, ip }: SendOtpInput): Promise<OtpTicket> {
    const s = await this.settings.getAll();
    const key = this.key(purpose, phone);

    const sentAt = Number(await this.redis.hget(key, 'sentAt'));
    if (sentAt) {
      const waitMs = sentAt + s.otp_resend_sec * 1000 - Date.now();
      if (waitMs > 0) {
        throw new AppError(
          ErrorCode.AUTH_OTP_TOO_EARLY,
          { retry_after: Math.ceil(waitMs / 1000) },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const window = s.otp_limit_window_sec;
    await this.rateLimiter.hit({
      key: `otp:phone:${phone}`,
      limit: s.otp_phone_limit,
      windowSec: window,
    });
    await this.rateLimiter.hit({ key: `otp:ip:${ip}`, limit: s.otp_ip_limit, windowSec: window });

    const code = this.config.get('OTP_TEST_MODE', { infer: true })
      ? '0'.repeat(s.otp_length)
      : randomDigits(s.otp_length);

    await this.redis
      .multi()
      .del(key)
      .hset(key, { hash: this.hash(purpose, phone, code), attempts: 0, sentAt: Date.now() })
      .pexpire(key, s.otp_ttl_sec * 1000)
      .exec();

    try {
      await this.sms.send(
        phone,
        otpSmsText(language, this.config.get('APP_NAME', { infer: true }), code),
      );
    } catch (error) {
      await this.redis.del(key);
      throw error;
    }

    return { length: s.otp_length, ttl_sec: s.otp_ttl_sec, resend_after_sec: s.otp_resend_sec };
  }

  /**
   * Checks a code. A correct code is consumed. Each wrong code uses one attempt;
   * after the last attempt the code is deleted and a new one must be requested.
   */
  async verify(purpose: OtpPurpose, phone: string, code: string): Promise<void> {
    const key = this.key(purpose, phone);
    const stored = await this.redis.hget(key, 'hash');
    if (!stored) throw new AppError(ErrorCode.AUTH_OTP_EXPIRED);

    if (stored === this.hash(purpose, phone, code)) {
      // Only one concurrent request may consume the code.
      if ((await this.redis.del(key)) === 0) throw new AppError(ErrorCode.AUTH_OTP_EXPIRED);
      return;
    }

    const { otp_max_attempts: maxAttempts } = await this.settings.getAll();
    const attempts = await this.redis.hincrby(key, 'attempts', 1);
    const attemptsLeft = Math.max(maxAttempts - attempts, 0);
    if (attemptsLeft === 0) await this.redis.del(key);
    throw new AppError(ErrorCode.AUTH_OTP_INVALID, { attempts_left: attemptsLeft });
  }

  private key(purpose: OtpPurpose, phone: string): string {
    return `otp:${purpose}:${phone}`;
  }

  private hash(purpose: OtpPurpose, phone: string, code: string): string {
    return sha256Hex(`${purpose}:${phone}:${code}`);
  }
}
