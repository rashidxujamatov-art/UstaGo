import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { Env } from '../../config/env.js';
import type { Language, Prisma, Role, ThemeMode } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';

/** Which onboarding screen the user still has to pass (K3b → K4), or DONE. */
export type OnboardingStep = 'IDENTITY' | 'ROLE' | 'DONE';

export interface MeView {
  id: string;
  phone: string;
  email: string;
  lang: Language;
  theme: ThemeMode;
  active_role: Role | null;
  status: 'ACTIVE' | 'BLOCKED';
  onboarding_step: OnboardingStep;
  identity: { first_name: string; last_name: string; middle_name: string | null } | null;
  referral: { code: string; link: string };
  staff: { role: 'ADMIN' | 'SUPER_ADMIN'; permissions: string[] } | null;
  executor: { free_period_start: string; free_period_end: string } | null;
  created_at: string;
}

export interface DeviceView {
  id: string;
  name: string | null;
  platform: string;
  trusted: boolean;
  last_seen_at: string;
  current: boolean;
}

const meInclude = {
  identity: { select: { firstName: true, lastName: true, middleName: true } },
  staff: { select: { role: true, permissions: true } },
  executorProfile: { select: { freePeriodStart: true, freePeriodEnd: true } },
} satisfies Prisma.UserInclude;

type Db = Prisma.TransactionClient;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async me(userId: string, db: Db = this.prisma): Promise<MeView> {
    const user = await db.user.findUnique({ where: { id: userId }, include: meInclude });
    if (!user) throw new AppError(ErrorCode.UNAUTHORIZED, {}, HttpStatus.UNAUTHORIZED);

    const domain = this.config.get('APP_DOMAIN', { infer: true });
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      lang: user.lang,
      theme: user.theme,
      active_role: user.activeRole,
      status: user.status,
      onboarding_step: !user.identity ? 'IDENTITY' : !user.activeRole ? 'ROLE' : 'DONE',
      identity: user.identity
        ? {
            first_name: user.identity.firstName,
            last_name: user.identity.lastName,
            middle_name: user.identity.middleName,
          }
        : null,
      referral: { code: user.referralCode, link: `https://${domain}/r/${user.referralCode}` },
      staff: user.staff,
      executor: user.executorProfile
        ? {
            free_period_start: user.executorProfile.freePeriodStart.toISOString(),
            free_period_end: user.executorProfile.freePeriodEnd.toISOString(),
          }
        : null,
      created_at: user.createdAt.toISOString(),
    };
  }

  async updatePreferences(
    userId: string,
    input: { lang?: Language; theme?: ThemeMode },
  ): Promise<MeView> {
    await this.prisma.user.update({ where: { id: userId }, data: input });
    return this.me(userId);
  }

  /**
   * Switches the active role (K4, U1). Needs a finished MyID check.
   * The first switch to EXECUTOR starts the free period, once per person (§8);
   * the demo bonus is credited by the wallet in stage 3.
   */
  async setRole(userId: string, role: Role): Promise<MeView> {
    const { free_period_days: freeDays } = await this.settings.getAll();

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          identity: { select: { userId: true } },
          executorProfile: { select: { userId: true } },
        },
      });
      if (!user?.identity) {
        throw new AppError(ErrorCode.AUTH_IDENTITY_REQUIRED, {}, HttpStatus.FORBIDDEN);
      }
      if (role === 'EXECUTOR' && !user.executorProfile) {
        const start = new Date();
        await tx.executorProfile.create({
          data: {
            userId,
            freePeriodStart: start,
            freePeriodEnd: new Date(start.getTime() + freeDays * 24 * 3600 * 1000),
          },
        });
      }
      await tx.user.update({ where: { id: userId }, data: { activeRole: role } });
      return this.me(userId, tx);
    });
  }

  async devices(userId: string, currentSessionId: string): Promise<DeviceView[]> {
    const current = await this.prisma.session.findUnique({
      where: { id: currentSessionId },
      select: { deviceRowId: true },
    });
    const devices = await this.prisma.device.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
    });
    return devices.map((device) => ({
      id: device.id,
      name: device.name,
      platform: device.platform,
      trusted: device.trustedAt !== null,
      last_seen_at: device.lastSeenAt.toISOString(),
      current: device.id === current?.deviceRowId,
    }));
  }

  /** Signs a device out: closes its sessions and forgets it, so it needs SMS next time. */
  async removeDevice(userId: string, deviceRowId: string): Promise<void> {
    const device = await this.prisma.device.findFirst({ where: { id: deviceRowId, userId } });
    if (!device) throw new AppError(ErrorCode.NOT_FOUND, {}, HttpStatus.NOT_FOUND);
    // Sessions cascade with the device, so its access tokens stop working at once.
    await this.prisma.device.delete({ where: { id: device.id } });
  }
}
