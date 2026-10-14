import { execSync } from 'child_process';
import path from 'path';

/** Fresh migrations + seed on the disposable test database before the browser tests. */
export default function globalSetup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || url === process.env.DATABASE_URL) throw new Error('Refusing to reset: TEST_DATABASE_URL missing or equal to DATABASE_URL.');
  execSync('npx prisma migrate reset --force --skip-generate', {
    cwd: path.resolve(__dirname, '../server'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}
