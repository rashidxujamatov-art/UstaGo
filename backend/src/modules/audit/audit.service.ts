import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

export type AuditActorType = 'USER' | 'SYSTEM' | 'CLI';

export interface AuditEntry {
  actorId?: string | null;
  actorType: AuditActorType;
  action: string;
  entityType: string;
  entityId?: string | null;
  data?: Prisma.InputJsonValue;
}

/**
 * Append-only audit log for admin, super-admin and money actions (CLAUDE.md rule 10).
 * Pass the transaction client so the entry commits together with the change it records.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, db: Prisma.TransactionClient = this.prisma): Promise<void> {
    await db.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        actorType: entry.actorType,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        data: entry.data,
      },
    });
  }
}
