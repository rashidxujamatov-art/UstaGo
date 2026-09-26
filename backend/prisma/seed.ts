import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { settingsSchema } from '../src/modules/settings/settings.schema.js';
import { categoriesSeed } from './seed/categories.js';
import { settingsDefaults } from './seed/settings.defaults.js';

/**
 * Idempotent seed. Settings are only created when missing, so values the super admin
 * already changed are never overwritten by a re-run.
 */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set (see backend/.env.example)');

  settingsSchema.parse(settingsDefaults);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    const existing = new Set(
      (await prisma.setting.findMany({ select: { key: true } })).map((row) => row.key),
    );
    const missing = Object.entries(settingsDefaults).filter(([key]) => !existing.has(key));

    await prisma.setting.createMany({
      data: missing.map(([key, value]) => ({ key, value })),
      skipDuplicates: true,
    });

    console.log(
      `settings: ${missing.length} created, ${Object.keys(settingsDefaults).length - missing.length} already present`,
    );

    // Categories: created when missing, never overwritten (the super admin edits them).
    const { count } = await prisma.category.createMany({
      data: categoriesSeed.map((category, index) => ({ ...category, sortOrder: index + 1 })),
      skipDuplicates: true,
    });
    console.log(`categories: ${count} created`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
