import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    // The first run on a cold cache (generated Prisma client, Windows Defender) can be slow.
    testTimeout: 15_000,
  },
});
