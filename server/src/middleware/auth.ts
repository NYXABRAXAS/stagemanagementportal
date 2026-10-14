import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../db';
import { HttpError } from '../lib/errors';

export const SESSION_COOKIE = 'lsp_session';

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  roles: { code: string; name: string }[];
  permissions: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signSession(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: `${config.sessionHours}h` });
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.cookieSecure,
    maxAge: config.sessionHours * 3600 * 1000,
    path: '/',
  };
}

export async function loadAuthUser(userId: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
  });
  if (!user || !user.active) return null;
  const activeRoles = user.roles.map((r) => r.role).filter((r) => r.active);
  const perms = new Set<string>();
  activeRoles.forEach((r) => r.permissions.forEach((p) => perms.add(p.permission.code)));
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    roles: activeRoles.map((r) => ({ code: r.code, name: r.name })),
    permissions: [...perms].sort(),
  };
}

/** Requires a valid session cookie (or Bearer token) and loads the user + permissions. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = req.cookies?.[SESSION_COOKIE] ?? (header?.startsWith('Bearer ') ? header.slice(7) : undefined);
    if (!token) throw new HttpError(401, 'Please sign in.');
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    } catch {
      throw new HttpError(401, 'Your session has expired. Please sign in again.');
    }
    const user = await loadAuthUser(String(payload.sub));
    if (!user) throw new HttpError(401, 'Account is inactive or no longer exists.');
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

/** Backend permission enforcement — the UI hides buttons, but this is the real gate. */
export function requirePermission(...codes: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const have = req.user?.permissions ?? [];
    const missing = codes.filter((c) => !have.includes(c));
    if (missing.length) {
      return next(new HttpError(403, `You do not have permission to perform this action (requires: ${missing.join(', ')}).`));
    }
    next();
  };
}

export function hasPermission(req: Request, code: string) {
  return (req.user?.permissions ?? []).includes(code);
}
