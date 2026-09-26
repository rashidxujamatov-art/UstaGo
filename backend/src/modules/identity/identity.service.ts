import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { PinflCipher } from '../../common/crypto/pinfl-cipher.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { maskPhone } from '../../common/phone.js';
import type { Env } from '../../config/env.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS } from '../../infra/redis/redis.module.js';
import { SettingsService } from '../settings/settings.service.js';
import { type MeView, UsersService } from '../users/users.service.js';
import { ageInYears } from './age.js';
import {
  IDENTITY_PROVIDER,
  IdentityCheckFailedError,
  type IdentityDocument,
  type IdentityProvider,
  type IdentityResult,
} from './identity.provider.js';

/** Version of the consent texts shown on K2/K3b. Bump when the legal text changes (§14). */
export const CONSENT_VERSION = '2026-09-draft';

interface PendingSession {
  userId: string;
  docType: IdentityDocument['docType'];
}

/** How long a started MyID session can be completed. Technical timeout, not a business term. */
const SESSION_TTL_SEC = 15 * 60;

@Injectable()
export class IdentityService {
  private readonly cipher: PinflCipher;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(IDENTITY_PROVIDER) private readonly provider: IdentityProvider,
    private readonly settings: SettingsService,
    private readonly users: UsersService,
    config: ConfigService<Env, true>,
  ) {
    this.cipher = new PinflCipher(
      config.get('PINFL_ENC_KEY', { infer: true }),
      config.get('PINFL_HMAC_KEY', { infer: true }),
    );
  }

  /** K3b: records the consents and opens a MyID session for the mobile SDK. */
  async startSession(
    userId: string,
    document: IdentityDocument,
    deviceId: string,
  ): Promise<{ session_id: string; provider: IdentityProvider['name'] }> {
    await this.ensureNotVerified(userId);

    await this.prisma.consent.createMany({
      data: (['PERSONAL_DATA', 'BIOMETRY'] as const).map((type) => ({
        userId,
        type,
        version: CONSENT_VERSION,
        deviceId,
      })),
    });

    const { sessionId } = await this.provider.startSession(document);
    const pending: PendingSession = { userId, docType: document.docType };
    await this.redis.set(
      this.sessionKey(sessionId),
      JSON.stringify(pending),
      'EX',
      SESSION_TTL_SEC,
    );
    return { session_id: sessionId, provider: this.provider.name };
  }

  /**
   * K3c → K4 or K3d. Reads the MyID result, checks the minimum age and that the person
   * has no other account (one PINFL = one account, §2). A duplicate registration is
   * removed and the existing account is described for the K3d screen.
   */
  async complete(userId: string, sessionId: string): Promise<MeView> {
    const stored = await this.redis.get(this.sessionKey(sessionId));
    const pending = stored ? (JSON.parse(stored) as PendingSession) : null;
    if (pending?.userId !== userId) throw new AppError(ErrorCode.AUTH_IDENTITY_FAILED);
    await this.ensureNotVerified(userId);

    let result: IdentityResult;
    try {
      result = await this.provider.getResult(sessionId);
    } catch (error) {
      if (error instanceof IdentityCheckFailedError) {
        throw new AppError(ErrorCode.AUTH_IDENTITY_FAILED);
      }
      throw error;
    }

    const { min_age_years: minAge } = await this.settings.getAll();
    if (ageInYears(result.birthDate) < minAge) {
      throw new AppError(ErrorCode.AUTH_AGE_RESTRICTED, { min_age: minAge }, HttpStatus.FORBIDDEN);
    }

    const pinflHash = this.cipher.hash(result.pinfl);
    const existing = await this.prisma.identity.findUnique({ where: { pinflHash } });
    if (existing) await this.rejectDuplicate(userId, existing.userId);

    try {
      await this.prisma.identity.create({
        data: {
          userId,
          pinflHash,
          pinflEnc: new Uint8Array(this.cipher.encrypt(result.pinfl)),
          lastName: result.lastName,
          firstName: result.firstName,
          middleName: result.middleName,
          birthDate: new Date(`${result.birthDate}T00:00:00Z`),
          docType: pending.docType,
          myidRef: result.reference,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.prisma.identity.findUnique({ where: { pinflHash } });
        if (winner) await this.rejectDuplicate(userId, winner.userId);
      }
      throw error;
    }

    await this.redis.del(this.sessionKey(sessionId));
    return this.users.me(userId);
  }

  private async rejectDuplicate(newUserId: string, existingUserId: string): Promise<never> {
    const existing = await this.prisma.user.findUniqueOrThrow({
      where: { id: existingUserId },
      select: { phone: true, createdAt: true, executorProfile: { select: { userId: true } } },
    });

    // The new registration never became a person's account: remove it and give back
    // the platform invite slot it used.
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: newUserId },
        select: { inviteCodeId: true },
      });
      if (!user) return;
      if (user.inviteCodeId) {
        await tx.inviteCode.update({
          where: { id: user.inviteCodeId },
          data: { used: { decrement: 1 } },
        });
      }
      await tx.user.delete({ where: { id: newUserId } });
    });

    throw new AppError(
      ErrorCode.AUTH_DUPLICATE_PERSON,
      {
        phone_masked: maskPhone(existing.phone),
        created_at: existing.createdAt.toISOString(),
        free_period_used: existing.executorProfile !== null,
      },
      HttpStatus.CONFLICT,
    );
  }

  private async ensureNotVerified(userId: string): Promise<void> {
    const identity = await this.prisma.identity.findUnique({
      where: { userId },
      select: { userId: true },
    });
    if (identity) {
      throw new AppError(ErrorCode.AUTH_IDENTITY_ALREADY_VERIFIED, {}, HttpStatus.CONFLICT);
    }
  }

  private sessionKey(sessionId: string): string {
    return `myid:${sessionId}`;
  }
}
