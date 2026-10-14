import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { ah, badRequest, conflict, notFound } from '../lib/errors';
import { audit } from '../lib/audit';
import { requirePermission } from '../middleware/auth';
import { SETTING_DEFAULTS } from '../lib/settings';

const r = Router();

// ────────────────────────── Roles & permissions ──────────────────────────

r.get(
  '/roles',
  requirePermission('config.view'),
  ah(async (_req, res) => {
    const roles = await prisma.role.findMany({
      orderBy: [{ roleType: 'desc' }, { name: 'asc' }],
      include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
    });
    res.json(roles.map((r) => ({ ...r, permissions: r.permissions.map((p) => p.permission.code) })));
  }),
);

r.get('/permissions', requirePermission('config.view'), ah(async (_req, res) => res.json(await prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { code: 'asc' }] }))));

const roleBody = z.object({
  code: z.string().trim().min(2).max(60).regex(/^[A-Z0-9_]+$/, 'Code must be UPPER_CASE letters, digits or _'),
  name: z.string().trim().min(2).max(120),
  description: z.union([z.string().max(1000), z.null()]).optional(),
  roleType: z.enum(['PORTAL', 'LOS']).default('LOS'),
  platform: z.union([z.string().max(40), z.null()]).optional(),
  active: z.boolean().optional(),
});

r.post(
  '/roles',
  requirePermission('role.manage'),
  ah(async (req, res) => {
    const body = roleBody.parse(req.body);
    const role = await prisma.role.create({ data: body });
    await audit(req, { action: 'CREATE', entityType: 'Role', entityId: role.id, summary: `Created role ${role.name}`, after: role });
    res.status(201).json(role);
  }),
);

r.put(
  '/roles/:id',
  requirePermission('role.manage'),
  ah(async (req, res) => {
    const body = roleBody.partial().parse(req.body);
    const before = await prisma.role.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound('Role');
    if (before.isSystem && body.code && body.code !== before.code) throw badRequest('The code of a system role cannot be changed.');
    const role = await prisma.role.update({ where: { id: before.id }, data: body });
    await audit(req, { action: 'UPDATE', entityType: 'Role', entityId: role.id, summary: `Updated role ${role.name}`, before, after: role });
    res.json(role);
  }),
);

r.delete(
  '/roles/:id',
  requirePermission('role.manage'),
  ah(async (req, res) => {
    const role = await prisma.role.findUnique({ where: { id: req.params.id }, include: { _count: { select: { users: true } } } });
    if (!role) throw notFound('Role');
    if (role.isSystem) throw badRequest('System roles cannot be deleted. Deactivate the role instead.');
    if (role._count.users > 0) throw conflict('Role is assigned to users. Remove it from the users first, or deactivate it.');
    await prisma.role.delete({ where: { id: role.id } });
    await audit(req, { action: 'DELETE', entityType: 'Role', entityId: role.id, summary: `Deleted role ${role.name}`, before: role });
    res.json({ ok: true });
  }),
);

r.put(
  '/roles/:id/permissions',
  requirePermission('role.manage'),
  ah(async (req, res) => {
    const { permissions } = z.object({ permissions: z.array(z.string()) }).parse(req.body);
    const role = await prisma.role.findUnique({ where: { id: req.params.id }, include: { permissions: { include: { permission: true } } } });
    if (!role) throw notFound('Role');
    const perms = await prisma.permission.findMany({ where: { code: { in: permissions } } });
    if (perms.length !== permissions.length) throw badRequest('Unknown permission code supplied.');
    if (role.code === 'SYSTEM_ADMIN' && !permissions.includes('role.manage'))
      throw badRequest('System Administrator must keep "role.manage", otherwise nobody could administer permissions.');
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
      prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })) }),
    ]);
    await audit(req, {
      action: 'UPDATE_PERMISSIONS', entityType: 'Role', entityId: role.id, summary: `Changed permissions of ${role.name}`,
      before: role.permissions.map((p) => p.permission.code), after: permissions,
    });
    res.json({ ok: true });
  }),
);

// ────────────────────────── Users ──────────────────────────

const userBody = z.object({
  username: z.string().trim().min(3).max(60).regex(/^[A-Za-z0-9._-]+$/),
  fullName: z.string().trim().min(2).max(120),
  email: z.union([z.string().email(), z.literal(''), z.null()]).optional(),
  password: z.string().min(10, 'Password must be at least 10 characters').optional(),
  active: z.boolean().optional(),
  roleCodes: z.array(z.string()).optional(),
});

r.get(
  '/users',
  requirePermission('user.manage'),
  ah(async (_req, res) => {
    const users = await prisma.user.findMany({ orderBy: { username: 'asc' }, include: { roles: { include: { role: true } } } });
    res.json(users.map(({ passwordHash: _p, ...u }) => ({ ...u, roles: u.roles.map((x) => ({ code: x.role.code, name: x.role.name })) })));
  }),
);

async function roleIds(codes: string[]) {
  const roles = await prisma.role.findMany({ where: { code: { in: codes } } });
  if (roles.length !== codes.length) throw badRequest('Unknown role code supplied.');
  return roles.map((r) => r.id);
}

r.post(
  '/users',
  requirePermission('user.manage'),
  ah(async (req, res) => {
    const body = userBody.parse(req.body);
    if (!body.password) throw badRequest('An initial password is required.');
    const ids = await roleIds(body.roleCodes ?? []);
    const u = await prisma.user.create({
      data: {
        username: body.username, fullName: body.fullName, email: body.email || null, active: body.active ?? true,
        passwordHash: await bcrypt.hash(body.password, 10), roles: { create: ids.map((roleId) => ({ roleId })) },
      },
    });
    await audit(req, { action: 'CREATE', entityType: 'User', entityId: u.id, summary: `Created user ${u.username} (${(body.roleCodes ?? []).join(', ')})` });
    res.status(201).json({ id: u.id });
  }),
);

r.put(
  '/users/:id',
  requirePermission('user.manage'),
  ah(async (req, res) => {
    const body = userBody.partial().parse(req.body);
    const before = await prisma.user.findUnique({ where: { id: req.params.id }, include: { roles: { include: { role: true } } } });
    if (!before) throw notFound('User');
    if (before.id === req.user!.id && body.active === false) throw badRequest('You cannot deactivate your own account.');
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: before.id },
        data: {
          fullName: body.fullName, email: body.email === '' ? null : body.email, active: body.active,
          passwordHash: body.password ? await bcrypt.hash(body.password, 10) : undefined,
        },
      });
      if (body.roleCodes) {
        const ids = await roleIds(body.roleCodes);
        await tx.userRole.deleteMany({ where: { userId: before.id } });
        await tx.userRole.createMany({ data: ids.map((roleId) => ({ roleId, userId: before.id })) });
      }
    });
    await audit(req, {
      action: 'UPDATE', entityType: 'User', entityId: before.id, summary: `Updated user ${before.username}${body.password ? ' (password reset)' : ''}`,
      before: { active: before.active, roles: before.roles.map((x) => x.role.code) }, after: { active: body.active, roles: body.roleCodes },
    });
    res.json({ ok: true });
  }),
);

// ────────────────────────── Audit history ──────────────────────────

r.get(
  '/audit',
  requirePermission('audit.view'),
  ah(async (req, res) => {
    const q = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(50),
        entityType: z.string().optional(),
        action: z.string().optional(),
        productId: z.string().optional(),
        versionId: z.string().optional(),
        username: z.string().optional(),
        search: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .parse(req.query);
    const where: Prisma.AuditLogWhereInput = {
      entityType: q.entityType || undefined,
      action: q.action || undefined,
      productId: q.productId || undefined,
      versionId: q.versionId || undefined,
      username: q.username ? { contains: q.username, mode: 'insensitive' } : undefined,
      summary: q.search ? { contains: q.search, mode: 'insensitive' } : undefined,
      at: q.from || q.to ? { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(`${q.to}T23:59:59`) : undefined } : undefined,
    };
    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ where, orderBy: { at: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);
    res.json({ total, page: q.page, pageSize: q.pageSize, items });
  }),
);

// ────────────────────────── System settings ──────────────────────────

r.get(
  '/settings',
  requirePermission('config.view'),
  ah(async (_req, res) => {
    const stored = await prisma.systemSetting.findMany();
    const map = new Map(stored.map((s) => [s.key, s]));
    res.json(
      Object.entries(SETTING_DEFAULTS).map(([key, d]) => ({
        key, value: map.get(key)?.value ?? d.value, description: d.description, updatedAt: map.get(key)?.updatedAt ?? null, updatedBy: map.get(key)?.updatedBy ?? null,
      })),
    );
  }),
);

r.put(
  '/settings/:key',
  requirePermission('settings.manage'),
  ah(async (req, res) => {
    if (!SETTING_DEFAULTS[req.params.key]) throw notFound('Setting');
    const { value } = z.object({ value: z.string().max(500) }).parse(req.body);
    if (['requireApproval', 'makerChecker'].includes(req.params.key) && !['true', 'false'].includes(value)) throw badRequest('Value must be true or false.');
    const before = await prisma.systemSetting.findUnique({ where: { key: req.params.key } });
    const s = await prisma.systemSetting.upsert({
      where: { key: req.params.key },
      update: { value, updatedBy: req.user!.username },
      create: { key: req.params.key, value, description: SETTING_DEFAULTS[req.params.key].description, updatedBy: req.user!.username },
    });
    await audit(req, { action: 'UPDATE', entityType: 'SystemSetting', entityId: s.key, summary: `Changed setting ${s.key} to "${value}"`, before: before?.value ?? SETTING_DEFAULTS[s.key].value, after: value });
    res.json(s);
  }),
);

export default r;
