import { Injectable } from '@nestjs/common';
import { normalizePhone } from '../../common/phone.js';
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

/**
 * Staff roles. SUPER_ADMIN is never created through the app, only from the server CLI
 * (§1, decision of 2026-09-25). Every change is audited.
 */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
