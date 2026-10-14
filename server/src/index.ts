import { config } from './config';
import { createApp } from './app';
import { prisma } from './db';

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`[los-stage-portal] API listening on http://localhost:${config.port} (${config.env})`);
});

async function shutdown(signal: string) {
  console.log(`[los-stage-portal] ${signal} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
