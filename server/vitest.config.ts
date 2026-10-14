import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    setupFiles: ['tests/setupEnv.ts'],
    testTimeout: 60000,
    hookTimeout: 300000,
    fileParallelism: false,
    pool: 'forks',
  },
});
