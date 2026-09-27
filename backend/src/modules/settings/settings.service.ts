import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { SETTING_KEYS, type Settings, settingsSchema } from './settings.schema.js';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Reads and validates all settings. Pass a transaction client to read them inside
   * the same transaction that snapshots rates onto an order (CLAUDE.md rule 7).
   * A missing or malformed key is a deployment error, never silently defaulted.
   */
  async getAll(db: Db = this.prisma): Promise<Settings> {
    const rows = await db.setting.findMany({ select: { key: true, value: true } });
    return parseSettings(rows);
  }

  /**
   * SA2 (stage 7): a partial update, validated against the *whole* merged settings object
   * (cross-field rules like `ref_l1_bps + ref_l2_bps ≤ fee_bps` need every key, not just the
   * changed ones). Stores each changed key exactly as sent — the same tiyin-string / bps-number
   * shape `getAll()` later re-parses — and audits every changed key individually
   * (CLAUDE.md rule 10), same pattern as `trips.service.ts`'s `updateMapsSettings`.
   */
  async update(actorId: string, patch: Record<string, unknown>): Promise<Settings> {
    const keys = Object.keys(patch);
    const unknownKeys = keys.filter((key) => !(SETTING_KEYS as string[]).includes(key));
    if (unknownKeys.length > 0) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, { fields: unknownKeys.join(',') });
    }

    const rows = await this.prisma.setting.findMany({ select: { key: true, value: true } });
    const merged = { ...Object.fromEntries(rows.map((row) => [row.key, row.value])), ...patch };
    const result = settingsSchema.safeParse(merged);
    if (!result.success) {
      const badKeys = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
      throw new AppError(ErrorCode.VALIDATION_FAILED, { fields: badKeys.join(',') });
    }

    await this.prisma.$transaction(async (tx) => {
      for (const key of keys) {
        await tx.setting.update({
          where: { key },
          data: { value: patch[key] as Prisma.InputJsonValue, updatedBy: actorId },
        });
        await this.audit.log(
          {
            actorId,
            actorType: 'USER',
            action: 'settings.update',
            entityType: 'setting',
            entityId: key,
            data: { value: patch[key] as Prisma.InputJsonValue },
          },
          tx,
        );
      }
    });
    return this.getAll();
  }
}

export function parseSettings(rows: ReadonlyArray<{ key: string; value: unknown }>): Settings {
  const raw = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const result = settingsSchema.safeParse(raw);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new AppError(
      ErrorCode.SETTINGS_INVALID,
      { keys: keys.join(',') },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
  return result.data;
}
