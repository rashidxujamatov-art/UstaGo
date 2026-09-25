import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { parseArgs } from 'node:util';
import { validateEnv } from './config/env.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { ReferralsModule } from './modules/referrals/referrals.module.js';
import { ReferralsService } from './modules/referrals/referrals.service.js';
import { StaffService } from './modules/staff/staff.service.js';

const USAGE = `Usage (from backend/):
  npm run cli -- invite-code:create [--max-uses N] [--expires-days D] [--code CODE]
  npm run cli -- super-admin:grant --phone +998901234567
  npm run cli -- staff:revoke --phone +998901234567

The very first user signs up with a platform invite code, then gets the super admin
role with super-admin:grant. The person must have finished registration (MyID) first.`;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    PrismaModule,
    AuditModule,
    ReferralsModule,
  ],
  providers: [StaffService],
})
class CliModule {}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      phone: { type: 'string' },
      code: { type: 'string' },
      'max-uses': { type: 'string' },
      'expires-days': { type: 'string' },
    },
  });
  const [command] = positionals;
  if (!command) {
    console.log(USAGE);
    return;
  }

  const app = await NestFactory.createApplicationContext(CliModule, { logger: ['error'] });
  try {
    switch (command) {
      case 'invite-code:create': {
        const maxUses = values['max-uses'] ? Number(values['max-uses']) : null;
        const days = values['expires-days'] ? Number(values['expires-days']) : null;
        if ((maxUses !== null && !(maxUses > 0)) || (days !== null && !(days > 0))) {
          throw new Error('--max-uses and --expires-days must be positive numbers');
        }
        const invite = await app.get(ReferralsService).createPlatformCode({
          code: values.code,
          maxUses,
          expiresAt: days ? new Date(Date.now() + days * 24 * 3600 * 1000) : null,
          actor: { id: null, type: 'CLI' },
        });
        console.log(`Platform invite code: ${invite.code}`);
        break;
      }
      case 'super-admin:grant': {
        if (!values.phone) throw new Error('--phone is required');
        const { userId } = await app.get(StaffService).grantSuperAdmin(values.phone);
        console.log(`SUPER_ADMIN granted to user ${userId}`);
        break;
      }
      case 'staff:revoke': {
        if (!values.phone) throw new Error('--phone is required');
        const { userId } = await app.get(StaffService).revokeStaff(values.phone);
        console.log(`Staff role removed from user ${userId}`);
        break;
      }
      default:
        console.log(USAGE);
        process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
