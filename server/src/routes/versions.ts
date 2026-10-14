import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { ah, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { audit } from '../lib/audit';
import { requirePermission } from '../middleware/auth';
import { exportSnapshot } from '../lib/snapshot';
import { diffSnapshots } from '../lib/diff';
import { validateSnapshot } from '../lib/validateConfig';
import { createDraft, getVersionOrThrow, latestPublished } from '../lib/versions';
import { getBoolSetting } from '../lib/settings';

const r = Router();

export async function roleCodes() {
  return (await prisma.role.findMany({ select: { code: true } })).map((x) => x.code);
}

export async function validateVersion(versionId: string) {
  return validateSnapshot(await exportSnapshot(versionId), await roleCodes());
}

r.get(
  '/products/:id/versions',
  requirePermission('config.view'),
  ah(async (req, res) => {
    const versions = await prisma.configVersion.findMany({ where: { productId: req.params.id }, orderBy: { versionNo: 'desc' } });
    res.json(versions);
  }),
);

r.post(
  '/products/:id/versions',
  requirePermission('config.create'),
  ah(async (req, res) => {
    const body = z.object({ basedOnVersionId: z.string().optional().nullable(), title: z.string().max(200).optional() }).parse(req.body ?? {});
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) throw notFound('Product');
    const draft = await prisma.$transaction(
      async (tx) => {
        const d = await createDraft(product.id, { ...body, userName: req.user!.username, userId: req.user!.id }, tx);
        await audit(req, { action: 'CREATE_DRAFT', entityType: 'ConfigVersion', entityId: d.id, productId: product.id, versionId: d.id, summary: `Created draft v${d.versionNo} of ${product.name}` }, tx);
        return d;
      },
      { timeout: 120000 },
    );
    res.status(201).json(draft);
  }),
);

r.get(
  '/versions/:id',
  requirePermission('config.view'),
  ah(async (req, res) => res.json(await getVersionOrThrow(req.params.id))),
);

/** Full hierarchy with ids, for the Stage Builder tree. */
r.get(
  '/versions/:id/tree',
  requirePermission('config.view'),
  ah(async (req, res) => {
    const v = await prisma.configVersion.findUnique({
      where: { id: req.params.id },
      include: {
        product: { include: { schemes: { orderBy: { code: 'asc' } } } },
        stages: {
          orderBy: { sequence: 'asc' },
          include: {
            subStages: {
              orderBy: { sequence: 'asc' },
              include: {
                modules: { orderBy: { sequence: 'asc' } },
                fields: { orderBy: { sequence: 'asc' }, include: { options: { orderBy: { sequence: 'asc' } }, rules: true } },
                _count: { select: { documents: true, transitionsFrom: true } },
              },
            },
          },
        },
      },
    });
    if (!v) throw notFound('Configuration version');
    res.json(v);
  }),
);

r.get(
  '/versions/:id/snapshot',
  requirePermission('config.view'),
  ah(async (req, res) => {
    const v = await getVersionOrThrow(req.params.id);
    res.json({ product: v.product.code, versionNo: v.versionNo, status: v.status, publishedAt: v.publishedAt, ...(await exportSnapshot(v.id)) });
  }),
);

r.post(
  '/versions/:id/validate',
  requirePermission('config.view'),
  ah(async (req, res) => res.json(await validateVersion(req.params.id))),
);

/** Diff this version against another version (default: the version it was based on, else latest published). */
r.get(
  '/versions/:id/diff',
  requirePermission('config.view'),
  ah(async (req, res) => {
    const v = await getVersionOrThrow(req.params.id);
    let againstId = typeof req.query.against === 'string' ? req.query.against : undefined;
    if (!againstId || againstId === 'base') {
      againstId = v.basedOnVersionId ?? (await latestPublished(v.productId))?.id;
    } else if (againstId === 'published') {
      againstId = (await latestPublished(v.productId))?.id;
    }
    const newer = await exportSnapshot(v.id);
    if (!againstId || againstId === v.id) {
      const empty = { stages: [], documents: [], transitions: [] };
      return res.json({ against: null, ...diffSnapshots(empty, newer) });
    }
    const other = await getVersionOrThrow(againstId);
    res.json({ against: { id: other.id, versionNo: other.versionNo, status: other.status, product: other.product.name }, ...diffSnapshots(await exportSnapshot(other.id), newer) });
  }),
);

async function transition(
  req: Request,
  versionId: string,
  allowedFrom: string[],
  to: string,
  extra: Record<string, unknown>,
  action: string,
) {
  const v = await getVersionOrThrow(versionId);
  if (!allowedFrom.includes(v.status)) throw conflict(`Version v${v.versionNo} is ${v.status}; cannot ${action.toLowerCase()} from this status.`);
  const updated = await prisma.configVersion.update({ where: { id: v.id }, data: { status: to, ...extra } });
  await audit(req, { action, entityType: 'ConfigVersion', entityId: v.id, productId: v.productId, versionId: v.id, summary: `${action} v${v.versionNo} of ${v.product.name}`, before: { status: v.status }, after: { status: to } });
  return updated;
}

r.post(
  '/versions/:id/submit',
  requirePermission('config.submit'),
  ah(async (req, res) => {
    const report = await validateVersion(req.params.id);
    if (!report.valid) throw badRequest('Fix the configuration errors before submitting.', report);
    const notes = z.object({ notes: z.string().max(2000).optional() }).parse(req.body ?? {}).notes;
    res.json(await transition(req, req.params.id, ['DRAFT'], 'SUBMITTED', { submittedByName: req.user!.username, submittedAt: new Date(), rejectionNote: null, ...(notes ? { notes } : {}) }, 'SUBMIT'));
  }),
);

r.post(
  '/versions/:id/withdraw',
  requirePermission('config.submit'),
  ah(async (req, res) => {
    res.json(await transition(req, req.params.id, ['SUBMITTED', 'APPROVED'], 'DRAFT', { approvedByName: null, approvedAt: null }, 'WITHDRAW'));
  }),
);

r.post(
  '/versions/:id/approve',
  requirePermission('config.approve'),
  ah(async (req, res) => {
    const v = await getVersionOrThrow(req.params.id);
    if ((await getBoolSetting('makerChecker')) && v.submittedByName === req.user!.username)
      throw forbidden('Maker-checker is enabled: a different user must approve the version you submitted.');
    res.json(await transition(req, v.id, ['SUBMITTED'], 'APPROVED', { approvedByName: req.user!.username, approvedAt: new Date() }, 'APPROVE'));
  }),
);

r.post(
  '/versions/:id/reject',
  requirePermission('config.approve'),
  ah(async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().min(3, 'A rejection reason is required') }).parse(req.body);
    res.json(await transition(req, req.params.id, ['SUBMITTED', 'APPROVED'], 'DRAFT', { rejectionNote: reason, approvedByName: null, approvedAt: null }, 'REJECT'));
  }),
);

r.post(
  '/versions/:id/publish',
  requirePermission('config.publish'),
  ah(async (req, res) => {
    const v = await getVersionOrThrow(req.params.id);
    const needApproval = await getBoolSetting('requireApproval');
    const allowed = needApproval ? ['APPROVED'] : ['SUBMITTED', 'APPROVED'];
    if (!allowed.includes(v.status))
      throw conflict(needApproval ? `Version must be APPROVED before publishing (currently ${v.status}).` : `Version must be submitted before publishing (currently ${v.status}).`);
    const report = await validateVersion(v.id);
    if (!report.valid) throw badRequest('Configuration has validation errors and cannot be published.', report);
    const published = await prisma.$transaction(async (tx) => {
      const prev = await tx.configVersion.findMany({ where: { productId: v.productId, status: 'PUBLISHED' } });
      await tx.configVersion.updateMany({ where: { productId: v.productId, status: 'PUBLISHED' }, data: { status: 'ARCHIVED' } });
      const p = await tx.configVersion.update({ where: { id: v.id }, data: { status: 'PUBLISHED', publishedByName: req.user!.username, publishedAt: new Date() } });
      await audit(req, { action: 'PUBLISH', entityType: 'ConfigVersion', entityId: v.id, productId: v.productId, versionId: v.id, summary: `Published v${v.versionNo} of ${v.product.name}${prev.length ? ` (v${prev.map((x) => x.versionNo).join(', ')} archived)` : ''}` }, tx);
      return p;
    });
    res.json(published);
  }),
);

/** Rollback = create a new draft whose content is a copy of an older version. History is preserved. */
r.post(
  '/versions/:id/rollback',
  requirePermission('config.create', 'config.publish'),
  ah(async (req, res) => {
    const v = await getVersionOrThrow(req.params.id);
    if (!['PUBLISHED', 'ARCHIVED'].includes(v.status)) throw badRequest('Only published or archived versions can be restored.');
    const draft = await prisma.$transaction(
      async (tx) => {
        const d = await createDraft(v.productId, { basedOnVersionId: v.id, title: `Rollback to v${v.versionNo}`, userName: req.user!.username, userId: req.user!.id }, tx);
        await audit(req, { action: 'ROLLBACK', entityType: 'ConfigVersion', entityId: d.id, productId: v.productId, versionId: d.id, summary: `Created draft v${d.versionNo} restoring v${v.versionNo} of ${v.product.name}` }, tx);
        return d;
      },
      { timeout: 120000 },
    );
    res.status(201).json(draft);
  }),
);

r.delete(
  '/versions/:id',
  requirePermission('config.delete'),
  ah(async (req, res) => {
    const v = await getVersionOrThrow(req.params.id);
    if (v.status !== 'DRAFT') throw conflict('Only an unsubmitted draft can be discarded. Published and archived versions are kept for audit.');
    await prisma.configVersion.delete({ where: { id: v.id } });
    await audit(req, { action: 'DISCARD_DRAFT', entityType: 'ConfigVersion', entityId: v.id, productId: v.productId, summary: `Discarded draft v${v.versionNo} of ${v.product.name}` });
    res.json({ ok: true });
  }),
);

/** Read-only runtime feed for the consuming LOS: the published configuration of a product. */
r.get(
  '/runtime/products/:code/published',
  requirePermission('config.view'),
  ah(async (req, res) => {
    const product = await prisma.product.findUnique({ where: { code: req.params.code } });
    if (!product) throw notFound('Product');
    const v = await latestPublished(product.id);
    if (!v) throw notFound('Published configuration');
    res.json({ product: product.code, versionId: v.id, versionNo: v.versionNo, publishedAt: v.publishedAt, ...(await exportSnapshot(v.id)) });
  }),
);

export default r;
