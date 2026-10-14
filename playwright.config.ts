import path from 'path';
import dotenv from 'dotenv';
import { defineConfig } from '@playwright/test';

dotenv.config({ path: path.resolve(__dirname, 'server/.env') });

const PORT = 4173;
const TEST_DB = process.env.TEST_DATABASE_URL;
if (!TEST_DB) throw new Error('TEST_DATABASE_URL must be set in server/.env to run the end-to-end tests.');

/**
 * End-to-end tests run against the PRODUCTION build (API + built React UI on one port)
 * connected to the disposable test database, which e2e/globalSetup.ts resets and seeds.
 * Uses the locally installed Microsoft Edge by default (set PW_CHANNEL=chromium to use
 * Playwright's bundled browser after `npx playwright install chromium`).
 */
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/globalSetup.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.PW_CHANNEL ?? 'msedge',
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && node server/dist/server/src/index.js',
    url: `http://localhost:${PORT}/api/health`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      NODE_ENV: 'production',
      API_PORT: String(PORT),
      DATABASE_URL: TEST_DB,
      JWT_SECRET: 'e2e-secret-not-for-production-0123456789abcdef',
      COOKIE_SECURE: 'false',
    },
  },
});
