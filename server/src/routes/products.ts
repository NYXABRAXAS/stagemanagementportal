import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { ah, badRequest, notFound } from '../lib/errors';
import { audit } from '../lib/audit';
import { requirePermission } from '../middleware/auth';
import { exportSnapshot, importSnapshot } from '../lib/snapshot';
import { currentDraft, latestPublished } from '../lib/versions';

const r = Router();

const productBody = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9_]+$/, 'Code must be UPPER_CASE letters, digits or _'),
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().max(60).optional().nullable(),
  description: z.string().trim().max(1000).optional().nullable(),
  sortOrder: z.number().int().optional(),
});

async function productSummaries() {
  const products = await prisma.product.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      schemes: { orderBy: { code: 'asc' } },
      versions: { orderBy: { versionNo: 'desc' }, select: { id: true, versionNo: true, status: true, publishedAt: true, updatedAt: true } },
    },
  });
  const counts = await prisma.$queryRaw<{ versionId: string; stages: bigint; subs: bigint; fields: bigint }[]>`
    SELECT v.id as "versionId",
      (SELECT count(*) FROM "Stage" s WHERE s."versionId" = v.id) as stages,
      (SELECT count(*) FROM "SubStage" ss JOIN "Stage" s ON ss."stageId" = s.id WHERE s."versionId" = v.id) as subs,
      (SELECT count(*) FROM "Field" f JOIN "SubStage" ss ON f."subStageId" = ss.id JOIN "Stage" s ON ss."stageId" = s.id WHERE s."versionId" = v.id) as fields
    FROM "ConfigVersion" v`;
  const byVersion = new Map(counts.map((c) => [c.versionId, { stages: Number(c.stages), subStages: Number(c.subs), fields: Number(c.fields) }]));
  return products.map((p) => {
    const published = p.versions.find((v) => v.status === 'PUBLISHED') ?? null;
    const open = p.versions.find((v) => ['DRAFT', 'SUBMITTED', 'APPROVED'].includes(v.status)) ?? null;
    const working = open ?? published;
    return {
      ...p,
      published,
      openVersion: open,
      counts: working ? byVersion.get(working.id) ?? { stages: 0, subStages: 0, fields: 0 } : { stages: 0, subStages: 0, fields: 0 },
    };
  });
}

r.get(
  '/products',
  requirePermission('config.view'),
  ah(async (_req, res) => res.json(await productSummaries())),
);

r.get(
  '/products/:id',
  requirePermission('config.view'),
  ah(async (req, res) => {
    const p = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { schemes: { orderBy: { code: 'asc' } }, versions: { orderBy: { versionNo: 'desc' } } },
    });
    if (!p) throw notFound('Product');
    res.json(p);
  }),
);

r.post(
  '/products',
  requirePermission('product.manage'),
  ah(async (req, res) => {
    const body = productBody.parse(req.body);
    const p = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({ data: { ...body, sortOrder: body.sortOrder ?? 100 } });
      await tx.configVersion.create({
        data: { productId: created.id, versionNo: 1, status: 'DRAFT', title: 'Initial draft', createdByName: req.user!.username, createdById: req.user!.id, lastModifiedByName: req.user!.username },
      });
      await audit(req, { action: 'CREATE', entityType: 'Product', entityId: created.id, productId: created.id, summary: `Created product ${created.name}`, after: created }, tx);
      return created;
    });
    res.status(201).json(p);
  }),
);

r.put(
  '/products/:id',
  requirePermission('product.manage'),
  ah(async (req, res) => {
    const body = productBody.partial().parse(req.body);
    const before = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound('Product');
    const p = await prisma.product.update({ where: { id: req.params.id }, data: body });
    await audit(req, { action: 'UPDATE', entityType: 'Product', entityId: p.id, productId: p.id, summary: `Updated product ${p.name}`, before, after: p });
    res.json(p);
  }),
);

r.patch(
  '/products/:id/active',
  requirePermission('product.manage'),
  ah(async (req, res) => {
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    const p = await prisma.product.update({ where: { id: req.params.id }, data: { active } });
    await audit(req, { action: active ? 'ACTIVATE' : 'DEACTIVATE', entityType: 'Product', entityId: p.id, productId: p.id, summary: `${active ? 'Activated' : 'Deactivated'} product ${p.name}` });
    res.json(p);
  }),
);

/** Clone a product (new product + draft copied from the source's working configuration). */
r.post(
  '/products/:id/clone',
  requirePermission('product.manage', 'config.create'),
  ah(async (req, res) => {
    const body = productBody.extend({ confirm: z.boolean().optional(), includeSchemes: z.boolean().optional() }).parse(req.body);
    const src = await prisma.product.findUnique({ where: { id: req.params.id }, include: { schemes: true } });
    if (!src) throw notFound('Source product');
    const srcVersion = (await currentDraft(src.id)) ?? (await latestPublished(src.id));
    if (!srcVersion) throw badRequest('Source product has no configuration to clone.');
    const snap = await exportSnapshot(srcVersion.id);
    const preview = {
      source: { product: src.name, versionNo: srcVersion.versionNo, status: srcVersion.status },
      target: { code: body.code, name: body.name },
      stages: snap.stages.length,
      subStages: snap.stages.reduce((n, s) => n + s.subStages.length, 0),
      fields: snap.stages.reduce((n, s) => n + s.subStages.reduce((m, ss) => m + ss.fields.length, 0), 0),
      documents: snap.documents.length,
      transitions: snap.transitions.length,
      schemes: body.includeSchemes ? src.schemes.length : 0,
      note: 'A new product is created; the source product is not changed.',
    };
    if (!body.confirm) return res.json({ preview });
    const created = await prisma.$transaction(
      async (tx) => {
        const p = await tx.product.create({
          data: { code: body.code, name: body.name, category: body.category ?? src.category, description: body.description ?? `Cloned from ${src.name}`, sortOrder: body.sortOrder ?? src.sortOrder + 1 },
        });
        if (body.includeSchemes)
          for (const s of src.schemes)
            await tx.scheme.create({ data: { productId: p.id, code: s.code, name: s.name, description: s.description, active: s.active, needsConfirmation: true, sourceRef: `Cloned from ${src.name}` } });
        const v = await tx.configVersion.create({
          data: { productId: p.id, versionNo: 1, status: 'DRAFT', title: `Cloned from ${src.name} v${srcVersion.versionNo}`, createdByName: req.user!.username, createdById: req.user!.id, lastModifiedByName: req.user!.username },
        });
        await importSnapshot(tx, v.id, snap);
        await audit(req, { action: 'CLONE', entityType: 'Product', entityId: p.id, productId: p.id, versionId: v.id, summary: `Cloned ${src.name} v${srcVersion.versionNo} into new product ${p.name}`, after: preview }, tx);
        return p;
      },
      { timeout: 120000 },
    );
    res.status(201).json({ product: created, preview });
  }),
);

// ── Schemes ──
const schemeBody = z.object({
  code: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional().nullable(),
  active: z.boolean().optional(),
  needsConfirmation: z.boolean().optional(),
});

r.post(
  '/products/:id/schemes',
  requirePermission('product.manage'),
  ah(async (req, res) => {
    const body = schemeBody.parse(req.body);
    const s = await prisma.scheme.create({ data: { ...body, productId: req.params.id } });
    await audit(req, { action: 'CREATE', entityType: 'Scheme', entityId: s.id, productId: s.productId, summary: `Added scheme ${s.name}`, after: s });
    res.status(201).json(s);
  }),
);

r.put(
  '/schemes/:id',
  requirePermission('product.manage'),
  ah(async (req, res) => {
    const body = schemeBody.partial().parse(req.body);
    const before = await prisma.scheme.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound('Scheme');
    const s = await prisma.scheme.update({ where: { id: req.params.id }, data: body });
    await audit(req, { action: 'UPDATE', entityType: 'Scheme', entityId: s.id, productId: s.productId, summary: `Updated scheme ${s.name}`, before, after: s });
    res.json(s);
  }),
);

r.delete(
  '/schemes/:id',
  requirePermission('product.manage'),
  ah(async (req, res) => {
    const s = await prisma.scheme.findUnique({ where: { id: req.params.id } });
    if (!s) throw notFound('Scheme');
    await prisma.scheme.delete({ where: { id: s.id } });
    await audit(req, { action: 'DELETE', entityType: 'Scheme', entityId: s.id, productId: s.productId, summary: `Deleted scheme ${s.name}`, before: s });
    res.json({ ok: true });
  }),
);

export default r;
