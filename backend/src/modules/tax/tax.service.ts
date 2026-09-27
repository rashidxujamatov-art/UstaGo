import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinflCipher } from '../../common/crypto/pinfl-cipher.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { maskPhone, normalizePhone } from '../../common/phone.js';
import type { Env } from '../../config/env.js';
import type {
  ExecutorProfile,
  TaxMethod,
  TaxStatus,
  TaxVerification,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { UploadsService } from '../storage/uploads.service.js';
import { TAX_STATUS_PROVIDER, type TaxStatusProvider } from './tax-status.provider.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** remindedDays mark for the "free month is over, choose a tax method" push (BJ8). */
const FREE_PERIOD_ENDED_MARK = 0;

export interface TaxStatusView {
  method: TaxMethod | null;
  /** Effective status: an expired certificate reads EXPIRED even before the job runs. */
  status: TaxStatus;
  valid_until: string | null;
  checked_at: string | null;
  reminders: boolean;
  xolis_phone: string | null;
  /** A request waiting for an admin (AD1). */
  pending: { id: string; method: TaxMethod; created_at: string } | null;
  /** The latest request, when an admin rejected it. */
  rejected: { method: TaxMethod; reason: string | null } | null;
  methods_enabled: TaxMethod[];
  free_period: { ends_at: string; active: boolean };
}

export interface VerificationView {
  id: string;
  method: TaxMethod;
  status: TaxVerification['status'];
  created_at: string;
  user: { id: string; first_name: string; last_name: string; phone_masked: string };
  certificate_url: string | null;
  xolis_qr: string | null;
  xolis_phone: string | null;
}

/**
 * Tax methods of executors (docs/01-biznes-qoidalar.md §9): after the free period a pro
 * takes new jobs only with a VERIFIED method. Self-employed is checked in the tax system by
 * PINFL, or from a certificate by an admin; Paynet Xolis is always checked by an admin.
 * GTM never withholds tax.
 */
@Injectable()
export class TaxService {
  private readonly cipher: PinflCipher;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly uploads: UploadsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @Inject(TAX_STATUS_PROVIDER) private readonly provider: TaxStatusProvider,
    config: ConfigService<Env, true>,
  ) {
    this.cipher = new PinflCipher(
      config.get('PINFL_ENC_KEY', { infer: true }),
      config.get('PINFL_HMAC_KEY', { infer: true }),
    );
  }

  // ---------------------------------------------------------------- executor

  async status(userId: string, now = new Date()): Promise<TaxStatusView> {
    const profile = await this.profile(userId);
    const [s, pending, latest] = await Promise.all([
      this.settings.getAll(),
      this.prisma.taxVerification.findFirst({
        where: { userId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.taxVerification.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      method: profile.taxMethod,
      status: effectiveStatus(profile, now),
      valid_until: profile.taxValidUntil?.toISOString() ?? null,
      checked_at: profile.taxCheckedAt?.toISOString() ?? null,
      reminders: profile.taxReminders,
      xolis_phone: profile.xolisPhone,
      pending: pending
        ? { id: pending.id, method: pending.method, created_at: pending.createdAt.toISOString() }
        : null,
      rejected:
        latest?.status === 'REJECTED' ? { method: latest.method, reason: latest.reason } : null,
      methods_enabled: s.tax_methods_enabled,
      free_period: {
        ends_at: profile.freePeriodEnd.toISOString(),
        active: profile.freePeriodEnd > now,
      },
    };
  }

  /**
   * BJ8 "O‘zini o‘zi band qilganman": first the tax system by PINFL; when it cannot
   * confirm, the app asks for the certificate photo and an admin checks it (AD1).
   */
  async selfEmployed(userId: string, certificateKey?: string): Promise<TaxStatusView> {
    await this.assertCanRequest(userId, 'SELF_EMPLOYED');
    if (certificateKey) {
      await this.uploads.verify(userId, 'TAX_CERTIFICATE', [certificateKey]);
      await this.queue(userId, 'SELF_EMPLOYED', { fileKey: certificateKey });
      return this.status(userId);
    }

    const identity = await this.prisma.identity.findUniqueOrThrow({
      where: { userId },
      select: { pinflEnc: true },
    });
    const check = await this.provider.checkSelfEmployed(this.cipher.decrypt(identity.pinflEnc));
    if (check.status !== 'VERIFIED') {
      throw new AppError(ErrorCode.TAX_CERTIFICATE_REQUIRED, {}, HttpStatus.UNPROCESSABLE_ENTITY);
    }
    await this.prisma.$transaction(async (tx) => {
      const verification = await tx.taxVerification.create({
        data: {
          userId,
          method: 'SELF_EMPLOYED',
          status: 'VERIFIED',
          source: 'AUTO',
          validUntil: check.validUntil,
          checkedAt: new Date(),
        },
      });
      await tx.executorProfile.update({
        where: { userId },
        data: verifiedProfile('SELF_EMPLOYED', check.validUntil),
      });
      await this.audit.log(
        {
          actorId: userId,
          actorType: 'USER',
          action: 'tax.verified',
          entityType: 'tax_verification',
          entityId: verification.id,
          data: { method: 'SELF_EMPLOYED', source: 'AUTO' },
        },
        tx,
      );
    });
    return this.status(userId);
  }

  /** BJ10: the Xolis QR customers pay to and the phone registered in Xolis. */
  async connectXolis(userId: string, input: { qr: string; phone: string }): Promise<TaxStatusView> {
    const phone = normalizePhone(input.phone);
    const qr = input.qr.trim();
    if (!phone || qr.length === 0) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, { fields: phone ? 'qr' : 'phone' });
    }
    await this.assertCanRequest(userId, 'XOLIS');
    await this.queue(userId, 'XOLIS', { xolisQr: qr, xolisPhone: phone });
    return this.status(userId);
  }

  /** BJ9 "Muddat tugashidan 7 kun oldin eslatish". */
  async setReminders(userId: string, enabled: boolean): Promise<TaxStatusView> {
    await this.profile(userId);
    await this.prisma.executorProfile.update({
      where: { userId },
      data: { taxReminders: enabled },
    });
    return this.status(userId);
  }

  // ---------------------------------------------------------------- admin (AD1)

  async queueList(): Promise<VerificationView[]> {
    const rows = await this.prisma.taxVerification.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return Promise.all(rows.map((row) => this.verificationView(row)));
  }

  async queueItem(id: string): Promise<VerificationView> {
    const row = await this.prisma.taxVerification.findUnique({ where: { id } });
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, {}, HttpStatus.NOT_FOUND);
    return this.verificationView(row);
  }

  /**
   * An admin's decision (users.manage). Approving a self-employed certificate needs its end
   * date; rejecting needs a reason the executor will see. Audited (CLAUDE.md rule 10).
   */
  async decide(
    adminId: string,
    id: string,
    input: { approve: boolean; validUntil?: Date; reason?: string },
  ): Promise<VerificationView> {
    const decided = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tax_verifications WHERE id = ${id}::uuid FOR UPDATE`;
      const row = await tx.taxVerification.findUnique({ where: { id } });
      if (!row) throw new AppError(ErrorCode.NOT_FOUND, {}, HttpStatus.NOT_FOUND);
      if (row.status !== 'PENDING') {
        throw new AppError(ErrorCode.TAX_ALREADY_DECIDED, {}, HttpStatus.CONFLICT);
      }
      const now = new Date();
      if (input.approve) {
        const validUntil = row.method === 'SELF_EMPLOYED' ? input.validUntil : undefined;
        if (row.method === 'SELF_EMPLOYED' && (!validUntil || validUntil <= now)) {
          throw new AppError(ErrorCode.VALIDATION_FAILED, { fields: 'valid_until' });
        }
        await tx.executorProfile.update({
          where: { userId: row.userId },
          data: {
            ...verifiedProfile(row.method, validUntil ?? null),
            ...(row.method === 'XOLIS' ? { xolisQr: row.xolisQr, xolisPhone: row.xolisPhone } : {}),
          },
        });
      } else {
        if (!input.reason?.trim()) {
          throw new AppError(ErrorCode.VALIDATION_FAILED, { fields: 'reason' });
        }
        const profile = await tx.executorProfile.findUniqueOrThrow({
          where: { userId: row.userId },
        });
        // A pro who already has a verified method keeps it while a change is refused.
        if (effectiveStatus(profile, now) !== 'VERIFIED') {
          await tx.executorProfile.update({
            where: { userId: row.userId },
            data: { taxStatus: 'REJECTED', taxMethod: row.method },
          });
        }
      }
      const updated = await tx.taxVerification.update({
        where: { id },
        data: {
          status: input.approve ? 'VERIFIED' : 'REJECTED',
          reviewerId: adminId,
          reason: input.approve ? null : (input.reason?.trim() ?? null),
          validUntil: input.approve ? (input.validUntil ?? null) : null,
          checkedAt: now,
        },
      });
      await this.audit.log(
        {
          actorId: adminId,
          actorType: 'USER',
          action: input.approve ? 'tax.approve' : 'tax.reject',
          entityType: 'tax_verification',
          entityId: id,
          data: { userId: row.userId, method: row.method, reason: updated.reason },
        },
        tx,
      );
      return updated;
    });
    await this.notifications.notify(decided.userId, {
      type: input.approve ? 'TAX_VERIFIED' : 'TAX_REJECTED',
    });
    return this.verificationView(decided);
  }

  // ---------------------------------------------------------------- super admin (SA5)

  async methodsOverview(now = new Date()) {
    const [s, selfEmployed, xolis, withoutMethod] = await Promise.all([
      this.settings.getAll(),
      this.countVerified('SELF_EMPLOYED', now),
      this.countVerified('XOLIS', now),
      this.withoutMethodCount(now),
    ]);
    return {
      enabled: s.tax_methods_enabled,
      counts: { SELF_EMPLOYED: selfEmployed, XOLIS: xolis },
      without_method: withoutMethod,
    };
  }

  /** SA5 toggles (super admin only; a new list applies to new choices). Audited. */
  async setMethodsEnabled(adminId: string, enabled: TaxMethod[]) {
    const unique = [...new Set(enabled)];
    await this.prisma.$transaction(async (tx) => {
      await tx.setting.update({
        where: { key: 'tax_methods_enabled' },
        data: { value: unique },
      });
      await this.audit.log(
        {
          actorId: adminId,
          actorType: 'USER',
          action: 'settings.update',
          entityType: 'setting',
          entityId: 'tax_methods_enabled',
          data: { value: unique },
        },
        tx,
      );
    });
    return this.methodsOverview();
  }

  /** SA5 "Eslatma yuborish": pros whose free month ended without a method. */
  async remindWithoutMethod(adminId: string, now = new Date()): Promise<{ sent: number }> {
    const profiles = await this.prisma.executorProfile.findMany({
      where: { freePeriodEnd: { lte: now }, ...withoutMethodWhere(now) },
      select: { userId: true },
      take: 5_000,
    });
    for (const profile of profiles) {
      await this.notifications.notify(profile.userId, { type: 'TAX_METHOD_REMINDER' });
    }
    await this.audit.log({
      actorId: adminId,
      actorType: 'USER',
      action: 'tax.remind',
      entityType: 'executor_profile',
      data: { sent: profiles.length },
    });
    return { sent: profiles.length };
  }

  // ---------------------------------------------------------------- worker

  /**
   * Hourly (docs/02 §8 tax-status-check): the free-month-over push (BJ8), the reminder
   * `self_employed_reminder_days` before a certificate ends, and EXPIRED after it ends.
   */
  async dailyCheck(
    now = new Date(),
  ): Promise<{ ended: number; reminded: number; expired: number }> {
    const s = await this.settings.getAll();

    const ended = await this.prisma.executorProfile.findMany({
      where: {
        freePeriodEnd: { lte: now },
        AND: [{ NOT: { remindedDays: { has: FREE_PERIOD_ENDED_MARK } } }, withoutMethodWhere(now)],
      },
      select: { userId: true, remindedDays: true },
      take: 1_000,
    });
    for (const profile of ended) {
      const { count } = await this.prisma.executorProfile.updateMany({
        where: { userId: profile.userId, remindedDays: { equals: profile.remindedDays } },
        data: { remindedDays: [...profile.remindedDays, FREE_PERIOD_ENDED_MARK] },
      });
      if (count === 1) {
        await this.notifications.notify(profile.userId, { type: 'FREE_PERIOD_ENDED' });
      }
    }

    const horizon = new Date(now.getTime() + s.self_employed_reminder_days * DAY_MS);
    const expiring = await this.prisma.executorProfile.findMany({
      where: {
        taxStatus: 'VERIFIED',
        taxReminders: true,
        taxValidUntil: { gt: now, lte: horizon },
      },
      select: { userId: true, taxValidUntil: true, taxRemindedFor: true },
      take: 1_000,
    });
    let reminded = 0;
    for (const profile of expiring) {
      const validUntil = profile.taxValidUntil;
      if (!validUntil || profile.taxRemindedFor?.getTime() === validUntil.getTime()) continue;
      await this.prisma.executorProfile.update({
        where: { userId: profile.userId },
        data: { taxRemindedFor: validUntil },
      });
      await this.notifications.notify(profile.userId, {
        type: 'TAX_EXPIRING',
        params: { days: Math.ceil((validUntil.getTime() - now.getTime()) / DAY_MS) },
      });
      reminded += 1;
    }

    const lapsed = await this.prisma.executorProfile.findMany({
      where: { taxStatus: 'VERIFIED', taxValidUntil: { lte: now } },
      select: { userId: true },
      take: 1_000,
    });
    for (const profile of lapsed) {
      const { count } = await this.prisma.executorProfile.updateMany({
        where: { userId: profile.userId, taxStatus: 'VERIFIED' },
        data: { taxStatus: 'EXPIRED' },
      });
      if (count === 1) await this.notifications.notify(profile.userId, { type: 'TAX_EXPIRED' });
    }
    return { ended: ended.length, reminded, expired: lapsed.length };
  }

  // ---------------------------------------------------------------- helpers

  private async profile(userId: string): Promise<ExecutorProfile> {
    const profile = await this.prisma.executorProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new AppError(ErrorCode.ORDER_ROLE_REQUIRED, { role: 'EXECUTOR' }, HttpStatus.FORBIDDEN);
    }
    return profile;
  }

  private async assertCanRequest(userId: string, method: TaxMethod): Promise<void> {
    await this.profile(userId);
    const s = await this.settings.getAll();
    if (!s.tax_methods_enabled.includes(method)) {
      throw new AppError(ErrorCode.TAX_METHOD_DISABLED, { method }, HttpStatus.CONFLICT);
    }
    const pending = await this.prisma.taxVerification.count({
      where: { userId, status: 'PENDING' },
    });
    if (pending > 0)
      throw new AppError(ErrorCode.TAX_VERIFICATION_PENDING, {}, HttpStatus.CONFLICT);
  }

  /** A request for an admin. The profile shows it as PENDING unless a method is verified. */
  private async queue(
    userId: string,
    method: TaxMethod,
    data: { fileKey?: string; xolisQr?: string; xolisPhone?: string },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const verification = await tx.taxVerification.create({
        data: { userId, method, status: 'PENDING', source: 'MANUAL', ...data },
      });
      const profile = await tx.executorProfile.findUniqueOrThrow({ where: { userId } });
      if (effectiveStatus(profile, new Date()) !== 'VERIFIED') {
        await tx.executorProfile.update({
          where: { userId },
          data: { taxStatus: 'PENDING', taxMethod: method },
        });
      }
      await this.audit.log(
        {
          actorId: userId,
          actorType: 'USER',
          action: 'tax.request',
          entityType: 'tax_verification',
          entityId: verification.id,
          data: { method },
        },
        tx,
      );
    });
  }

  private async verificationView(row: TaxVerification): Promise<VerificationView> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: row.userId },
      select: { phone: true, identity: { select: { firstName: true, lastName: true } } },
    });
    return {
      id: row.id,
      method: row.method,
      status: row.status,
      created_at: row.createdAt.toISOString(),
      user: {
        id: row.userId,
        first_name: user.identity?.firstName ?? '',
        last_name: user.identity?.lastName ?? '',
        phone_masked: maskPhone(user.phone),
      },
      certificate_url: row.fileKey
        ? ((await this.uploads.viewUrls([row.fileKey]))[0] ?? null)
        : null,
      xolis_qr: row.xolisQr,
      xolis_phone: row.xolisPhone,
    };
  }

  private countVerified(method: TaxMethod, now: Date): Promise<number> {
    return this.prisma.executorProfile.count({
      where: {
        taxMethod: method,
        taxStatus: 'VERIFIED',
        OR: [{ taxValidUntil: null }, { taxValidUntil: { gt: now } }],
      },
    });
  }

  private withoutMethodCount(now: Date): Promise<number> {
    return this.prisma.executorProfile.count({
      where: { freePeriodEnd: { lte: now }, ...withoutMethodWhere(now) },
    });
  }
}

/** Executors who cannot take jobs for lack of a valid method (their free month is over). */
function withoutMethodWhere(now: Date) {
  return {
    NOT: {
      taxStatus: 'VERIFIED' as const,
      OR: [{ taxValidUntil: null }, { taxValidUntil: { gt: now } }],
    },
  };
}

function verifiedProfile(method: TaxMethod, validUntil: Date | null) {
  return {
    taxStatus: 'VERIFIED' as const,
    taxMethod: method,
    taxValidUntil: validUntil,
    taxCheckedAt: new Date(),
    taxRemindedFor: null,
  };
}

/** The status the rules use (§4, §9): a verified certificate past its end counts as EXPIRED. */
export function effectiveStatus(
  profile: Pick<ExecutorProfile, 'taxStatus' | 'taxValidUntil'>,
  now: Date,
): TaxStatus {
  if (profile.taxStatus === 'VERIFIED' && profile.taxValidUntil && profile.taxValidUntil <= now) {
    return 'EXPIRED';
  }
  return profile.taxStatus;
}
