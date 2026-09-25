import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// DATABASE_URL comes from backend/.env (or the CI environment). It is optional here so that
// `prisma generate` (used by build, typecheck and tests) works without a database;
// migrate and seed commands fail with a clear error when it is missing.
const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
