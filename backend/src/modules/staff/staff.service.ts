import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { maskPhone, normalizePhone } from '../../common/phone.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

/** Admin permission keys (docs/01-biznes-qoidalar.md §1). */
export const ADMIN_PERMISSIONS = [
  'orders.moderate',
  'users.manage',
  'disputes.resolve',
  'categories.manage',
  'finance.view',
  'notifications.broadcast',
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export interface StaffListItem {
  id: string;
  phone_masked: string;
  first_name: string;
  last_name: string;
  role: 'ADMIN' | 'SUPER_ADMIN';
  permissions: string[];
  created_at: string;
}

/**
 * Staff roles. SUPER_ADMIN is never created through the app, only from the server CLI
 * (§1, decision of 2026-09-25). Every change is audited. `grantSuperAdmin`/`revokeStaff`
 * are the CLI's own entry points (plain `Error`, phone-based); everything else here is
 * SA3's HTTP surface (stage 7), which needs proper `AppError` codes and an id, not a phone.
 */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- CLI (unchanged)

  async grantSuperAdmin(rawPhone: string): Promise<{ userId: string }> {
    const user = await this.findByPhone(rawPhone);
    await this.prisma.$transaction(async (tx) => {
      await tx.staffPermission.upsert({
        where: { userId: user.id },
        create: { userId: user.id, role: 'SUPER_ADMIN', permissions: [...ADMIN_PERMISSIONS] },
        update: { role: 'SUPER_ADMIN', permissions: [...ADMIN_PERMISSIONS] },
      });
      await this.audit.log(
        {
          actorType: 'CLI',
          action: 'staff.super_admin.grant',
          entityType: 'user',
          entityId: user.id,
        },
        tx,
      );
    });
    return { userId: user.id };
  }

  async revokeStaff(rawPhone: string): Promise<{ userId: string }> {
    const user = await this.findByPhone(rawPhone);
    await this.prisma.$transaction(async (tx) => {
      await tx.staffPermission.deleteMany({ where: { userId: user.id } });
      await this.audit.log(
        { actorType: 'CLI', action: 'staff.revoke', entityType: 'user', entityId: user.id },
        tx,
      );
    });
    return { userId: user.id };
  }

  // ---------------------------------------------------------------- SA3 (stage 7)

  /** SA3 "Adminlar ro'yxati". No pagination — staff lists are small. */
  async list(): Promise<StaffListItem[]> {
    const rows = await this.prisma.staffPermission.findMany({
      include: { user: { select: { phone: true, identity: true } } },
      orderBy: { grantedAt: 'asc' },
    });
    return rows.map(toListItem);
  }

  /** SA3 "Adminni tayinlash": grants ADMIN by phone (never SUPER_ADMIN — CLI only). */
  async grantAdmin(
    actorId: string,
    rawPhone: string,
    permissions: string[],
  ): Promise<StaffListItem> {
    this.assertValidPermissions(permissions);
    const user = await this.findVerifiedUserByPhone(rawPhone);
    const existing = await this.prisma.staffPermission.findUnique({ where: { userId: user.id } });
    if (existing?.role === 'SUPER_ADMIN') {
      throw new AppError(ErrorCode.STAFF_ALREADY_SUPER_ADMIN, {}, HttpStatus.CONFLICT);
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const upserted = await tx.staffPermission.upsert({
        where: { userId: user.id },
        create: { userId: user.id, role: 'ADMIN', permissions },
        update: { role: 'ADMIN', permissions },
        include: { user: { select: { phone: true, identity: true } } },
      });
      await this.audit.log(
        {
          actorId,
          actorType: 'USER',
          action: 'staff.grant',
          entityType: 'user',
          entityId: user.id,
          data: { permissions },
        },
        tx,
      );
      return upserted;
    });
    return toListItem(row);
  }

  /** SA3 permission toggles: full replacement, matching the screen's set of switches. */
  async setPermissions(
    actorId: string,
    userId: string,
    permissions: string[],
  ): Promise<StaffListItem> {
    this.assertValidPermissions(permissions);
    const existing = await this.prisma.staffPermission.findUnique({ where: { userId } });
    if (!existing) throw new AppError(ErrorCode.NOT_FOUND, {}, HttpStatus.NOT_FOUND);
    if (existing.role === 'SUPER_ADMIN') {
      throw new AppError(ErrorCode.STAFF_ALREADY_SUPER_ADMIN, {}, HttpStatus.CONFLICT);
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.staffPermission.update({
        where: { userId },
        data: { permissions },
        include: { user: { select: { phone: true, identity: true } } },
      });
      await this.audit.log(
        {
          actorId,
          actorType: 'USER',
          action: 'staff.permissions_update',
          entityType: 'user',
          entityId: userId,
          data: { permissions },
        },
        tx,
      );
      return updated;
    });
    return toListItem(row);
  }

  /** SA3 "Adminni olib tashlash" through the app — SUPER_ADMIN stays CLI-only. */
  async revokeById(actorId: string, userId: string): Promise<void> {
    const existing = await this.prisma.staffPermission.findUnique({ where: { userId } });
    if (!existing) throw new AppError(ErrorCode.NOT_FOUND, {}, HttpStatus.NOT_FOUND);
    if (existing.role === 'SUPER_ADMIN') {
      throw new AppError(ErrorCode.STAFF_ALREADY_SUPER_ADMIN, {}, HttpStatus.CONFLICT);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.staffPermission.delete({ where: { userId } });
      await this.audit.log(
        {
          actorId,
          actorType: 'USER',
          action: 'staff.revoke',
          entityType: 'user',
          entityId: userId,
        },
        tx,
      );
    });
  }

  // ---------------------------------------------------------------- helpers

  private assertValidPermissions(permissions: string[]): void {
    const unique = new Set(permissions);
    const bad = [...unique].find((p) => !(ADMIN_PERMISSIONS as readonly string[]).includes(p));
    if (bad) throw new AppError(ErrorCode.STAFF_PERMISSION_INVALID, { permission: bad });
  }

  private async findVerifiedUserByPhone(
    rawPhone: string,
  ): Promise<{ id: string; identity: { userId: string } | null }> {
    const phone = normalizePhone(rawPhone);
    if (!phone) throw new AppError(ErrorCode.VALIDATION_FAILED, { fields: 'phone' });
    const user = await this.prisma.user.findUnique({
      where: { phone },
      select: { id: true, identity: { select: { userId: true } } },
    });
    if (!user) throw new AppError(ErrorCode.STAFF_USER_NOT_FOUND, {}, HttpStatus.NOT_FOUND);
    if (!user.identity) {
      throw new AppError(ErrorCode.STAFF_IDENTITY_REQUIRED, {}, HttpStatus.CONFLICT);
    }
    return user;
  }

  /** CLI only — kept as plain `Error` so `cli.ts`'s existing catch-and-print stays simple. */
  private async findByPhone(rawPhone: string): Promise<{ id: string }> {
    const phone = normalizePhone(rawPhone);
    if (!phone) throw new Error(`Not a valid Uzbek phone number: ${rawPhone}`);
    const user = await this.prisma.user.findUnique({
      where: { phone },
      select: { id: true, identity: { select: { userId: true } } },
    });
    if (!user) throw new Error(`No user with phone ${phone}. Register in the app first.`);
    if (!user.identity) throw new Error('The user has not finished the MyID check yet.');
    return user;
  }
}

interface StaffRow {
  userId: string;
  role: 'ADMIN' | 'SUPER_ADMIN';
  permissions: string[];
  grantedAt: Date;
  user: {
    phone: string;
    identity: { firstName: string; lastName: string } | null;
  };
}

function toListItem(row: StaffRow): StaffListItem {
  return {
    id: row.userId,
    phone_masked: maskPhone(row.user.phone),
    first_name: row.user.identity?.firstName ?? '',
    last_name: row.user.identity?.lastName ?? '',
    role: row.role,
    permissions: row.permissions,
    created_at: row.grantedAt.toISOString(),
  };
}
