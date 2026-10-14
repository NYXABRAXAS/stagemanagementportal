import fs from 'fs';
import path from 'path';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { prisma } from './db';
import { errorHandler } from './lib/errors';
import { requireAuth } from './middleware/auth';
import authRoutes from './routes/auth';
import productRoutes from './routes/products';
import versionRoutes from './routes/versions';
import hierarchyRoutes from './routes/hierarchy';
import fieldRoutes from './routes/fields';
import documentRoutes from './routes/documents';
import workflowRoutes from './routes/workflow';
import adminRoutes from './routes/admin';
import copyRoutes from './routes/copy';
import previewRoutes from './routes/preview';
import dashboardRoutes from './routes/dashboard';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          // the portal is commonly served over plain HTTP on an internal network
          upgradeInsecureRequests: null,
        },
      },
    }),
  );
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());

  // Dev only: allow the Vite dev server origin (production serves the UI from this same origin)
  if (!config.isProduction) {
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && config.corsOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
        if (req.method === 'OPTIONS') return res.sendStatus(204);
      }
      next();
    });
  }

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'ok', time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'unreachable', time: new Date().toISOString() });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api', requireAuth);
  app.use('/api', dashboardRoutes);
  app.use('/api', productRoutes);
  app.use('/api', versionRoutes);
  app.use('/api', hierarchyRoutes);
  app.use('/api', fieldRoutes);
  app.use('/api', documentRoutes);
  app.use('/api', workflowRoutes);
  app.use('/api', adminRoutes);
  app.use('/api', copyRoutes);
  app.use('/api', previewRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));

  // Serve the built React app (single-port production deployment)
  const dist = [config.clientDist, config.clientDistDev].find((p) => fs.existsSync(path.join(p, 'index.html')));
  if (dist) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
