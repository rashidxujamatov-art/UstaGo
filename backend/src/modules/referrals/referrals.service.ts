import { Injectable } from '@nestjs/common';
import { normalizeCode, randomCode } from '../../common/crypto/tokens.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

/** Who a referral code belongs to. */
export type ResolvedInvite =
  | { kind: 'USER'; referrerId: string; inviter: { firstName: string; lastName: string } }
  | { kind: 'PLATFORM'; inviteCodeId: string };

type Db = Prisma.TransactionClient;

/**
 * Referral and platform invite codes (docs/01-biznes-qoidalar.md §2, §6).
 * A person's code works only after they finished MyID and while they are not blocked
 * (decision of 2026-09-26, §13). Platform codes have no L1.
 */
@Injectable()
export class ReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Resolves a code or throws AUTH_REFERRAL_INVALID. Does not consume platform codes. */
  async resolve(rawCode: string, db: Db = this.prisma): Promise<ResolvedInvite> {
    const code = normalizeCode(rawCode);
    if (!code) throw new AppError(ErrorCode.AUTH_REFERRAL_INVALID);

    const owner = await db.user.findUnique({
      where: { referralCode: code },
      select: {
        id: true,
        status: true,
        identity: { select: { firstName: true, lastName: true } },
      },
    });
    if (owner) {
      if (owner.status !== 'ACTIVE' || !owner.identity) {
        throw new AppError(ErrorCode.AUTH_REFERRAL_INVALID);
      }
      return { kind: 'USER', referrerId: owner.id, inviter: owner.identity };
    }

    const invite = await db.inviteCode.findUnique({ where: { code } });
    if (invite && isInviteUsable(invite)) return { kind: 'PLATFORM', inviteCodeId: invite.id };
    throw new AppError(ErrorCode.AUTH_REFERRAL_INVALID);
  }

  /** Uses one slot of a platform code atomically; false when it ran out or expired. */
  async consumeInvite(inviteCodeId: string, db: Db): Promise<boolean> {
    const updated = await db.$executeRaw`
      UPDATE invite_codes SET used = used + 1
      WHERE id = ${inviteCodeId}::uuid
        AND (max_uses IS NULL OR used < max_uses)
        AND (expires_at IS NULL OR expires_at > now())`;
    return updated === 1;
  }

  /** A new unique personal referral code. */
  async newUserCode(db: Db = this.prisma): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = randomCode(8);
      const [user, invite] = await Promise.all([
        db.user.findUnique({ where: { referralCode: code }, select: { id: true } }),
        db.inviteCode.findUnique({ where: { code }, select: { id: true } }),
      ]);
      if (!user && !invite) return code;
    }
    throw new Error('Could not generate a unique referral code');
  }

  /** Creates a platform invite code (CLI now, SA screens in stage 7). Audited. */
  async createPlatformCode(input: {
    code?: string;
    maxUses?: number | null;
    expiresAt?: Date | null;
    actor: { id: string | null; type: 'USER' | 'CLI' };
  }): Promise<{ id: string; code: string }> {
    const code = input.code ? normalizeCode(input.code) : await this.newUserCode();
    return this.prisma.$transaction(async (tx) => {
      const taken = await tx.user.findUnique({
        where: { referralCode: code },
        select: { id: true },
      });
      if (taken) throw new Error(`Code ${code} is already a personal referral code`);
      const invite = await tx.inviteCode.create({
        data: {
          code,
          maxUses: input.maxUses ?? null,
          expiresAt: input.expiresAt ?? null,
          createdBy: input.actor.id,
        },
      });
      await this.audit.log(
        {
          actorId: input.actor.id,
          actorType: input.actor.type,
          action: 'invite_code.create',
          entityType: 'invite_code',
          entityId: invite.id,
          data: {
            code,
            maxUses: invite.maxUses,
            expiresAt: invite.expiresAt?.toISOString() ?? null,
          },
        },
        tx,
      );
      return { id: invite.id, code };
    });
  }
}

export function isInviteUsable(
  invite: { maxUses: number | null; used: number; expiresAt: Date | null },
  now = new Date(),
): boolean {
  return (
    (invite.maxUses === null || invite.used < invite.maxUses) &&
    (invite.expiresAt === null || invite.expiresAt > now)
  );
}
