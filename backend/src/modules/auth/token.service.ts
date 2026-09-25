import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, SignJWT } from 'jose';
import { randomToken, sha256Hex } from '../../common/crypto/tokens.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { Env } from '../../config/env.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

export interface AccessClaims {
  userId: string;
  sessionId: string;
}

export interface TokenPair {
  access_token: string;
  access_expires_in: number;
  refresh_token: string;
}

const invalidSession = () =>
  new AppError(ErrorCode.AUTH_SESSION_INVALID, {}, HttpStatus.UNAUTHORIZED);

/**
 * Access tokens: short-lived JWT (HS256) carrying the user and session id.
 * Refresh tokens: opaque random strings, stored only as SHA-256, rotated on every use.
 * Reusing a rotated refresh token revokes all of the user's sessions (docs/02 §10).
 */
@Injectable()
export class TokenService {
  private readonly secret: Uint8Array;
  private readonly accessTtlSec: number;
  private readonly refreshTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.secret = new TextEncoder().encode(config.get('JWT_ACCESS_SECRET', { infer: true }));
    this.accessTtlSec = config.get('ACCESS_TOKEN_TTL_SEC', { infer: true });
    this.refreshTtlMs = config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * 24 * 3600 * 1000;
  }

  /** Opens a new session for a device. */
  async createSession(
    userId: string,
    deviceRowId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<TokenPair> {
    const refreshToken = randomToken();
    const session = await db.session.create({
      data: {
        userId,
        deviceRowId,
        refreshHash: sha256Hex(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlMs),
      },
    });
    return this.pair(userId, session.id, refreshToken);
  }

  /** Exchanges a refresh token for a new pair; the old token stops working. */
  async rotate(refreshToken: string): Promise<TokenPair> {
    const session = await this.prisma.session.findUnique({
      where: { refreshHash: sha256Hex(refreshToken) },
    });
    if (!session) throw invalidSession();

    if (session.revokedAt) {
      if (session.replacedById) await this.revokeAll(session.userId); // token theft suspected
      throw invalidSession();
    }
    if (session.expiresAt.getTime() <= Date.now()) throw invalidSession();

    const newToken = randomToken();
    const rotated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.session.create({
        data: {
          userId: session.userId,
          deviceRowId: session.deviceRowId,
          refreshHash: sha256Hex(newToken),
          expiresAt: new Date(Date.now() + this.refreshTtlMs),
        },
      });
      const { count } = await tx.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedById: next.id },
      });
      return count === 1 ? next : null;
    });

    if (!rotated) {
      // A parallel request already rotated this token: treat as reuse.
      await this.revokeAll(session.userId);
      throw invalidSession();
    }
    await this.prisma.device.update({
      where: { id: session.deviceRowId },
      data: { lastSeenAt: new Date() },
    });
    return this.pair(session.userId, rotated.id, newToken);
  }

  /** Verifies an access token and that its session is still open. */
  async verifyAccess(token: string): Promise<AccessClaims> {
    let claims: AccessClaims;
    try {
      const { payload } = await jwtVerify(token, this.secret, { algorithms: ['HS256'] });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') throw new Error();
      claims = { userId: payload.sub, sessionId: payload.sid };
    } catch {
      throw new AppError(ErrorCode.UNAUTHORIZED, {}, HttpStatus.UNAUTHORIZED);
    }

    const session = await this.prisma.session.findUnique({
      where: { id: claims.sessionId },
      select: { revokedAt: true, expiresAt: true, replacedById: true },
    });
    // A rotated session stays valid for its remaining access-token lifetime.
    const closed =
      !session ||
      (session.revokedAt && !session.replacedById) ||
      session.expiresAt.getTime() <= Date.now();
    if (closed) throw new AppError(ErrorCode.UNAUTHORIZED, {}, HttpStatus.UNAUTHORIZED);
    return claims;
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Closes every session of a user, including rotated ones whose access tokens would
   * otherwise stay valid until they expire.
   */
  async revokeAll(userId: string, db: Prisma.TransactionClient = this.prisma): Promise<void> {
    await db.session.updateMany({
      where: { userId, OR: [{ revokedAt: null }, { replacedById: { not: null } }] },
      data: { revokedAt: new Date(), replacedById: null },
    });
  }

  private async pair(userId: string, sessionId: string, refreshToken: string): Promise<TokenPair> {
    const accessToken = await new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(`${this.accessTtlSec}s`)
      .sign(this.secret);
    return {
      access_token: accessToken,
      access_expires_in: this.accessTtlSec,
      refresh_token: refreshToken,
    };
  }
}
