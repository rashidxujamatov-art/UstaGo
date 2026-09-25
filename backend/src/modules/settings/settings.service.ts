import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { type Settings, settingsSchema } from './settings.schema.js';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reads and validates all settings. Pass a transaction client to read them inside
   * the same transaction that snapshots rates onto an order (CLAUDE.md rule 7).
   * A missing or malformed key is a deployment error, never silently defaulted.
   */
  async getAll(db: Db = this.prisma): Promise<Settings> {
    const rows = await db.setting.findMany({ select: { key: true, value: true } });
    return parseSettings(rows);
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
