import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { ah, badRequest, conflict, notFound } from '../lib/errors';
import { audit } from '../lib/audit';
import { requirePermission } from '../middleware/auth';
import { assertDraft, touchVersion, versionIdOfSubStage } from '../lib/versions';

const r = Router();

const docBody = z.object({
  subStageId: z.union([z.string(), z.null()]).optional(),
  code: z.string().trim().min(1).max(80).regex(/^[A-Z0-9_]+$/, 'Code must be UPPER_CASE letters, digits or _'),
  name: z.string().trim().min(1).max(200),
  category: z.union([z.string().max(80), z.null()]).optional(),
  requirement: z.enum(['MANDATORY', 'OPTIONAL', 'CONDITIONAL']).default('MANDATORY'),
  captureMode: z.enum(['CAMERA', 'UPLOAD', 'CAMERA_OR_UPLOAD', 'SYSTEM_GENERATED']).default('CAMERA_OR_UPLOAD'),
  allowedTypes: z.union([z.string().max(200), z.null()]).optional(),
  maxSizeMb: z.union([z.number().positive(), z.null()]).optional(),
  minCount: z.number().int().min(0).default(1),
  maxCount: z.union([z.number().int().min(1), z.null()]).optional(),
  schemeCodes: z.array(z.string()).optional(),
  validatedByRoleCodes: z.array(z.string()).optional(),
  active: z.boolean().optional(),
  needsConfirmation: z.boolean().optional(),
  sourceRef: z.union([z.string().max(500), z.null()]).optional(),
  notes: z.union([z.string().max(2000), z.null()]).optional(),
});

async function checkSub(versionId: string, subStageId?: string | null) {
  if (subStageId && (await versionIdOfSubStage(subStageId)) !== versionId) throw badRequest('The selected sub-stage is not part of this configuration.');
}

r.get(
  '/versions/:versionId/documents',
  requirePermission('config.view'),
  ah(async (req, res) => {
    res.json(
      await prisma.documentRequirement.findMany({
        where: { versionId: req.params.versionId },
        orderBy: [{ sequence: 'asc' }],
        include: { subStage: { select: { id: true, name: true, stage: { select: { id: true, name: true, sequence: true } }, sequence: true } } },
      }),
    );
  }),
);

r.post(
  '/versions/:versionId/documents',
  requirePermission('config.create'),
  ah(async (req, res) => {
    const body = docBody.parse(req.body);
    const v = await assertDraft(req.params.versionId);
    await checkSub(v.id, body.subStageId);
    if (await prisma.documentRequirement.findFirst({ where: { versionId: v.id, subStageId: body.subStageId ?? null, code: body.code } }))
      throw conflict(`Document ${body.code} is already configured for this sub-stage.`);
    const max = await prisma.documentRequirement.aggregate({ where: { versionId: v.id }, _max: { sequence: true } });
    const d = await prisma.documentRequirement.create({ data: { ...body, versionId: v.id, sequence: (max._max.sequence ?? 0) + 10 } });
    await touchVersion(v.id, req.user!.username);
    await audit(req, { action: 'CREATE', entityType: 'DocumentRequirement', entityId: d.id, productId: v.productId, versionId: v.id, summary: `Added document requirement "${d.name}"`, after: d });
    res.status(201).json(d);
  }),
);

r.put(
  '/documents/:id',
  requirePermission('config.edit'),
  ah(async (req, res) => {
    const body = docBody.partial().parse(req.body);
    const before = await prisma.documentRequirement.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound('Document requirement');
    const v = await assertDraft(before.versionId);
    await checkSub(v.id, body.subStageId);
    const d = await prisma.documentRequirement.update({ where: { id: before.id }, data: body });
    await touchVersion(v.id, req.user!.username);
    await audit(req, { action: 'UPDATE', entityType: 'DocumentRequirement', entityId: d.id, productId: v.productId, versionId: v.id, summary: `Updated document requirement "${d.name}"`, before, after: d });
    res.json(d);
  }),
);

r.delete(
  '/documents/:id',
  requirePermission('config.delete'),
  ah(async (req, res) => {
    const before = await prisma.documentRequirement.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound('Document requirement');
    const v = await assertDraft(before.versionId);
    await prisma.documentRequirement.delete({ where: { id: before.id } });
    await touchVersion(v.id, req.user!.username);
    await audit(req, { action: 'DELETE', entityType: 'DocumentRequirement', entityId: before.id, productId: v.productId, versionId: v.id, summary: `Deleted document requirement "${before.name}"`, before });
    res.json({ ok: true });
  }),
);

r.post(
  '/versions/:versionId/documents/reorder',
  requirePermission('config.edit'),
  ah(async (req, res) => {
    const { orderedIds } = z.object({ orderedIds: z.array(z.string()).min(1) }).parse(req.body);
    const v = await assertDraft(req.params.versionId);
    const owned = await prisma.documentRequirement.count({ where: { versionId: v.id, id: { in: orderedIds } } });
    if (owned !== orderedIds.length) throw badRequest('Some documents do not belong to this configuration.');
    await prisma.$transaction(orderedIds.map((id, i) => prisma.documentRequirement.update({ where: { id }, data: { sequence: (i + 1) * 10 } })));
    await touchVersion(v.id, req.user!.username);
    await audit(req, { action: 'REORDER', entityType: 'DocumentRequirement', productId: v.productId, versionId: v.id, summary: 'Re-ordered document requirements' });
    res.json({ ok: true });
  }),
);

export default r;
