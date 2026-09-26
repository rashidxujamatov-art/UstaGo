import { HttpStatus, Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { hashPassword, isStrongPassword, verifyPassword } from '../../common/crypto/password.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { RateLimiter } from '../../common/rate-limit/rate-limiter.service.js';
import { type Language, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS } from '../../infra/redis/redis.module.js';
import { CONSENT_VERSION } from '../identity/identity.service.js';
import { ReferralsService } from '../referrals/referrals.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { type MeView, UsersService } from '../users/users.service.js';
import type {
  DeviceInput,
  LoginInput,
  RegisterInput,
  ResendOtpInput,
  VerifyOtpInput,
} from './auth.schemas.js';
import { type OtpTicket, OtpService } from './otp.service.js';
import { type TokenPair, TokenService } from './token.service.js';

export interface SignedIn {
  tokens: TokenPair;
  user: MeView;
}

export type LoginResult =
  ({ otp_required: false } & SignedIn) | { otp_required: true; otp: OtpTicket };

/** Registration data kept in Redis until the phone is confirmed (the user row comes after). */
interface PendingRegistration {
  email: string;
  passwordHash: string;
  lang: Language;
  deviceId: string;
  referral:
    { kind: 'USER'; referrerId: string } | { kind: 'PLATFORM'; inviteCodeId: string } | null;
}

/** How long a started registration waits for its SMS code. Technical timeout. */
const PENDING_REGISTRATION_TTL_SEC = 30 * 60;

@Injectable()
export class AuthService implements OnModuleInit {
  /** Hash checked when the phone is unknown, so response time does not reveal accounts. */
  private dummyHash = '';

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly referrals: ReferralsService,
    private readonly settings: SettingsService,
    private readonly users: UsersService,
    private readonly rateLimiter: RateLimiter,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hashPassword('timing-equalizer-not-a-password');
  }

  /** K2 → K3: validates the form and the referral code, then sends the SMS code. */
  async register(input: RegisterInput, ip: string): Promise<{ otp: OtpTicket }> {
    const s = await this.settings.getAll();
    await this.rateLimiter.hit({
      key: `register:ip:${ip}`,
      limit: s.otp_ip_limit,
      windowSec: s.otp_limit_window_sec,
    });

    if (!isStrongPassword(input.password)) throw new AppError(ErrorCode.AUTH_WEAK_PASSWORD);

    let referral: PendingRegistration['referral'] = null;
    if (input.referral_code) {
      const resolved = await this.referrals.resolve(input.referral_code);
      referral =
        resolved.kind === 'USER'
          ? { kind: 'USER', referrerId: resolved.referrerId }
          : { kind: 'PLATFORM', inviteCodeId: resolved.inviteCodeId };
    } else if (s.referral_required) {
      throw new AppError(ErrorCode.AUTH_REFERRAL_REQUIRED);
    }

    await this.ensureAvailable(input.phone, input.email);

    const pending: PendingRegistration = {
      email: input.email,
      passwordHash: await hashPassword(input.password),
      lang: input.lang,
      deviceId: input.device.id,
      referral,
    };
    await this.redis.set(
      this.pendingKey(input.phone),
      JSON.stringify(pending),
      'EX',
      PENDING_REGISTRATION_TTL_SEC,
    );

    const otp = await this.otp.send({
      purpose: 'REGISTER',
      phone: input.phone,
      language: input.lang,
      ip,
    });
    return { otp };
  }

  /** K3 (registration): creates the account on the device that asked for the code. */
  async verifyRegistration(input: VerifyOtpInput): Promise<SignedIn> {
    const raw = await this.redis.get(this.pendingKey(input.phone));
    const pending = raw ? (JSON.parse(raw) as PendingRegistration) : null;
    if (!pending || pending.deviceId !== input.device.id) {
      throw new AppError(ErrorCode.AUTH_OTP_EXPIRED);
    }
    await this.otp.verify('REGISTER', input.phone, input.code);

    const signedIn = await this.prisma
      .$transaction(async (tx) => {
        let referrerId: string | null = null;
        let inviteCodeId: string | null = null;
        if (pending.referral?.kind === 'USER') {
          const referrer = await tx.user.findUnique({
            where: { id: pending.referral.referrerId },
            select: { status: true, identity: { select: { userId: true } } },
          });
          if (referrer?.status !== 'ACTIVE' || !referrer.identity) {
            throw new AppError(ErrorCode.AUTH_REFERRAL_INVALID);
          }
          referrerId = pending.referral.referrerId;
        } else if (pending.referral?.kind === 'PLATFORM') {
          if (!(await this.referrals.consumeInvite(pending.referral.inviteCodeId, tx))) {
            throw new AppError(ErrorCode.AUTH_REFERRAL_INVALID);
          }
          inviteCodeId = pending.referral.inviteCodeId;
        }

        const user = await tx.user.create({
          data: {
            phone: input.phone,
            email: pending.email,
            passwordHash: pending.passwordHash,
            lang: pending.lang,
            referralCode: await this.referrals.newUserCode(tx),
            referrerId,
            inviteCodeId,
            phoneVerifiedAt: new Date(),
          },
        });
        await tx.consent.create({
          data: {
            userId: user.id,
            type: 'TERMS',
            version: CONSENT_VERSION,
            deviceId: input.device.id,
          },
        });
        const device = await this.trustDevice(user.id, input.device, tx);
        const tokens = await this.tokens.createSession(user.id, device.id, tx);
        return { tokens, user: await this.users.me(user.id, tx) };
      })
      .catch((error: unknown) => {
        throw this.mapUniqueViolation(error);
      });

    await this.redis.del(this.pendingKey(input.phone));
    return signedIn;
  }

  /** Phone + password. An unknown device must also confirm an SMS code (§2). */
  async login(input: LoginInput, ip: string): Promise<LoginResult> {
    const s = await this.settings.getAll();
    const attemptsKey = `login:${input.phone}`;
    const window = s.login_attempt_window_sec;
    await this.rateLimiter.ensureBelow({
      key: attemptsKey,
      limit: s.login_attempt_limit,
      windowSec: window,
    });

    const user = await this.prisma.user.findUnique({ where: { phone: input.phone } });
    const passwordOk = await verifyPassword(user?.passwordHash ?? this.dummyHash, input.password);
    if (!user || !passwordOk) {
      await this.rateLimiter.increment(attemptsKey, window);
      throw new AppError(ErrorCode.AUTH_INVALID_CREDENTIALS, {}, HttpStatus.UNAUTHORIZED);
    }
    await this.rateLimiter.reset(attemptsKey);

    const device = await this.prisma.device.findUnique({
      where: { userId_deviceId: { userId: user.id, deviceId: input.device.id } },
    });
    if (device?.trustedAt) {
      return { otp_required: false, ...(await this.signIn(user.id, input.device)) };
    }

    await this.redis.set(
      this.challengeKey(input.phone, input.device.id),
      user.id,
      'EX',
      s.otp_ttl_sec,
    );
    const otp = await this.otp.send({
      purpose: 'LOGIN',
      phone: input.phone,
      language: input.lang,
      ip,
    });
    return { otp_required: true, otp };
  }

  /** K3 (new device): the password was already checked by login(). */
  async verifyLogin(input: VerifyOtpInput): Promise<SignedIn> {
    const key = this.challengeKey(input.phone, input.device.id);
    const userId = await this.redis.get(key);
    if (!userId) throw new AppError(ErrorCode.AUTH_OTP_EXPIRED);
    await this.otp.verify('LOGIN', input.phone, input.code);
    await this.redis.del(key);
    return this.signIn(userId, input.device);
  }

  async resendOtp(input: ResendOtpInput, ip: string): Promise<{ otp: OtpTicket }> {
    if (input.purpose === 'PASSWORD_RESET')
      return this.requestPasswordReset(input.phone, input.lang, ip);

    const pendingExists =
      input.purpose === 'REGISTER'
        ? await this.redis.exists(this.pendingKey(input.phone))
        : input.device &&
          (await this.redis.exists(this.challengeKey(input.phone, input.device.id)));
    if (!pendingExists) throw new AppError(ErrorCode.AUTH_OTP_EXPIRED);

    const otp = await this.otp.send({
      purpose: input.purpose,
      phone: input.phone,
      language: input.lang,
      ip,
    });
    return { otp };
  }

  /**
   * Sends a reset code if the phone has an account. The answer is the same either way,
   * so the endpoint cannot be used to find out who is registered.
   */
  async requestPasswordReset(
    phone: string,
    language: Language,
    ip: string,
  ): Promise<{ otp: OtpTicket }> {
    const exists = await this.prisma.user.findUnique({ where: { phone }, select: { id: true } });
    if (exists)
      return { otp: await this.otp.send({ purpose: 'PASSWORD_RESET', phone, language, ip }) };

    const s = await this.settings.getAll();
    return {
      otp: { length: s.otp_length, ttl_sec: s.otp_ttl_sec, resend_after_sec: s.otp_resend_sec },
    };
  }

  /** Sets a new password and signs the account out everywhere. */
  async confirmPasswordReset(phone: string, code: string, newPassword: string): Promise<void> {
    if (!isStrongPassword(newPassword)) throw new AppError(ErrorCode.AUTH_WEAK_PASSWORD);
    await this.otp.verify('PASSWORD_RESET', phone, code);

    const passwordHash = await hashPassword(newPassword);
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { phone }, data: { passwordHash } });
      await this.tokens.revokeAll(user.id, tx);
    });
    await this.rateLimiter.reset(`login:${phone}`);
  }

  refresh(refreshToken: string): Promise<TokenPair> {
    return this.tokens.rotate(refreshToken);
  }

  logout(sessionId: string): Promise<void> {
    return this.tokens.revoke(sessionId);
  }

  private async signIn(userId: string, deviceInput: DeviceInput): Promise<SignedIn> {
    return this.prisma.$transaction(async (tx) => {
      const device = await this.trustDevice(userId, deviceInput, tx);
      const tokens = await this.tokens.createSession(userId, device.id, tx);
      return { tokens, user: await this.users.me(userId, tx) };
    });
  }

  private trustDevice(userId: string, device: DeviceInput, tx: Prisma.TransactionClient) {
    const now = new Date();
    return tx.device.upsert({
      where: { userId_deviceId: { userId, deviceId: device.id } },
      create: {
        userId,
        deviceId: device.id,
        name: device.name ?? null,
        platform: device.platform,
        trustedAt: now,
        lastSeenAt: now,
      },
      update: {
        name: device.name ?? null,
        platform: device.platform,
        trustedAt: now,
        lastSeenAt: now,
      },
    });
  }

  private async ensureAvailable(phone: string, email: string): Promise<void> {
    const [phoneOwner, emailOwner] = await Promise.all([
      this.prisma.user.findUnique({ where: { phone }, select: { id: true } }),
      this.prisma.user.findUnique({ where: { email }, select: { id: true } }),
    ]);
    if (phoneOwner) throw new AppError(ErrorCode.AUTH_PHONE_TAKEN, {}, HttpStatus.CONFLICT);
    if (emailOwner) throw new AppError(ErrorCode.AUTH_EMAIL_TAKEN, {}, HttpStatus.CONFLICT);
  }

  private mapUniqueViolation(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = JSON.stringify(error.meta ?? {});
      if (target.includes('phone'))
        return new AppError(ErrorCode.AUTH_PHONE_TAKEN, {}, HttpStatus.CONFLICT);
      if (target.includes('email'))
        return new AppError(ErrorCode.AUTH_EMAIL_TAKEN, {}, HttpStatus.CONFLICT);
    }
    return error;
  }

  private pendingKey(phone: string): string {
    return `reg:${phone}`;
  }

  private challengeKey(phone: string, deviceId: string): string {
    return `login-challenge:${phone}:${deviceId}`;
  }
}
