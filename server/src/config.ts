import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') }); // when running from dist/server/src

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}. Copy .env.example to server/.env.`);
  return v;
}

const isTest = process.env.NODE_ENV === 'test';

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest,
  port: Number(process.env.API_PORT ?? 4000),
  jwtSecret: isTest ? process.env.JWT_SECRET ?? 'test-secret-not-for-production' : required('JWT_SECRET'),
  sessionHours: Number(process.env.SESSION_HOURS ?? 8),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
  // Built React app, served by the API in production (single process / single port)
  clientDist: path.resolve(__dirname, '../../../../client/dist'),
  clientDistDev: path.resolve(__dirname, '../../client/dist'),
};

if (config.isProduction && config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production.');
}
