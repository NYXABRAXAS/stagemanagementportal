import { execSync } from 'child_process';
import path from 'path';
import { testDatabaseUrl } from './testDb';

/**
 * Scenario 16: run every migration and the seed against a clean database.
 * `prisma migrate reset` drops the test database schema, re-applies all migrations
 * from scratch and then runs the seed script.
 */
export default function setup() {
  const url = testDatabaseUrl();
  const cwd = path.resolve(__dirname, '..');
  const env = { ...process.env, DATABASE_URL: url, NODE_ENV: 'test', JWT_SECRET: 'test-secret-not-for-production-0123456789' };
  execSync('npx prisma migrate reset --force --skip-generate', { cwd, env, stdio: 'inherit' });
}
