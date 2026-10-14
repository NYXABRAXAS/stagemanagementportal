import { testDatabaseUrl } from './testDb';

// Must run before the app / Prisma client is imported by a test file.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-not-for-production-0123456789';
