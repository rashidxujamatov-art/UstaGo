import { defineConfig } from 'vitest/config';

// End-to-end tests against a real PostgreSQL and Redis (see test/e2e/*.e2e-spec.ts).
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/e2e/**/*.e2e-spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
