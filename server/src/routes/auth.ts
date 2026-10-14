import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db';
import { ah, badRequest, HttpError } from '../lib/errors';
import { audit } from '../lib/audit';
import { loadAuthUser, requireAuth, SESSION_COOKIE, sessionCookieOptions, signSession } from '../middleware/auth';

const r = Router();

// Simple in-memory throttle against password guessing (per username+IP)
const attempts = new Map<string, { count: number; until: number }>();
const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60 * 1000;

r.post(
  '/login',
  ah(async (req, res) => {
    const body = z.object({ username: z.string().min(1), password: z.string().min(1) }).parse(req.body);
    const key = `${body.username.toLowerCase()}|${req.ip}`;
    const a = attempts.get(key);
    if (a && a.until > Date.now()) throw new HttpError(429, 'Too many failed attempts. Try again in a few minutes.');

    const user = await prisma.user.findFirst({ where: { username: { equals: body.username, mode: 'insensitive' } } });
    const ok = user && user.active && (await bcrypt.compare(body.password, user.passwordHash));
    if (!ok) {
      const count = (a?.count ?? 0) + 1;
      attempts.set(key, { count, until: count >= MAX_ATTEMPTS ? Date.now() + LOCK_MS : 0 });
      throw new HttpError(401, 'Invalid username or password.');
    }
    attempts.delete(key);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const authUser = await loadAuthUser(user.id);
    req.user = authUser!;
    await audit(req, { action: 'LOGIN', entityType: 'User', entityId: user.id, summary: `${user.username} signed in` });
    res.cookie(SESSION_COOKIE, signSession(user.id), sessionCookieOptions());
    res.json({ user: authUser });
  }),
);

r.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

r.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

r.post(
  '/change-password',
  requireAuth,
  ah(async (req, res) => {
    const body = z
      .object({ currentPassword: z.string().min(1), newPassword: z.string().min(10, 'New password must be at least 10 characters') })
      .parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) throw badRequest('Current password is incorrect.');
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(body.newPassword, 10) } });
    await audit(req, { action: 'CHANGE_PASSWORD', entityType: 'User', entityId: user.id, summary: `${user.username} changed password` });
    res.json({ ok: true });
  }),
);

export default r;
