import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { ah, badRequest, conflict, notFound } from '../lib/errors';
import { audit } from '../lib/audit';
import { requirePermission } from '../middleware/auth';
import { assertDraft, touchVersion, versionIdOfModule, versionIdOfStage, versionIdOfSubStage } from '../lib/versions';

const r = Router();

export const keySchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Key must start with a letter and use only letters, digits and _');

/** Turns "Loan Details" into "loanDetails" when the user does not supply a key. */
export function toKey(name: string) {
  const parts = name
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const k = parts.map((p, i) => (i === 0 ? p.toLowerCase() : p[0].toUpperCase() + p.slice(1).toLowerCase())).join('');
  return /^[A-Za-z]/.test(k) ? k : `k${k}`;
}

const stageBody = z.object({
  key: keySchema.optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  platform: z.string().max(40).optional().nullable(),
  active: z.boolean().optional(),
  needsConfirmation: z.boolean().optional(),
  sourceRef: z.string().max(500).optional().nullable(),
});

const subStageBody = stageBody.extend({ primaryRoleCode: z.string().max(60).optional().nullable() });

const moduleBody = z.object({
  key: keySchema.optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  repeatable: z.boolean().optional(),
  active: z.boolean().optional(),
  needsConfirmation: z.boolean().optional(),
  sourceRef: z.string().max(500).optional().nullable(),
});

const reorderBody = z.object({ orderedIds: z.array(z.string()).min(1) });

async function nextSeq(max: number | null | undefined) {
  return (max ?? 0) + 10;
}

// ────────────────────────── Stages ──────────────────────────

r.post(
  '/versions/:versionId/stages',
  requirePermission('config.create'),
  ah(async (req, res) => {
    const body = stageBody.parse(req.body);
    const v = await assertDraft(req.params.versionId);
    const key = body.key ?? toKey(body.name);
    if (await prisma.stage.findFirst({ where: { versionId: v.id, key } })) throw conflict(`A stage with key "${key}" already exists in this configuration.`);
    const max = await prisma.stage.aggregate({ where: { versionId: v.id }, _max: { sequence: true } });
    const s = await prisma.stage.create({ data: { ...body, key, versionId: v.id, sequence: await nextSeq(max._max.sequence) } });
    await touchVersion(v.id, req.user!.username);
    await audit(req, { action: 'CREATE', entityType: 'Stage', entityId: s.id, productId: v.productId, versionId: v.id, summary: `Added stage "${s.name}" to ${v.product.name} v${v.versionNo}`, after: s });
    res.status(201).json(s);
  }),
);

r.put(
  '/stages/:id',
  requirePermission('config.edit'),
  ah(async (req, res) => {
    const body = stageBody.partial().parse(req.body);
    const v = await assertDraft(await versionIdOfStage(req.params.id));
    const before = await prisma.stage.findUniqueOrThrow({ where: { id: req.params.id } });
    if (body.key && body.key !== before.key && (await prisma.stage.findFirst({ where: { versionId: v.id, key: body.key } })))
      throw conflict(`A stage with key "${body.key}" already exists.`);
    const s = await prisma.stage.update({ where: { id: before.id }, data: body });
    await touchVersion(v.id, req.user!.username);
    await audit(req, { action: 'UPDATE', entityType: 'Stage', entityId: s.id, productId: v.productId, versionId: v.id, summary: `Updated stage "${s.name}"`, before, after: s });
    res.json(s);
  }),
);

/** What would be removed with this stage — shown in the delete confirmation. */
r.get(
  '/stages/:id/impact',
  requirePermission('config.view'),
  ah(async (req, res) => {
    const s = await prisma.stage.findUnique({
      where: { id: req.params.id },
      include: { subStages: { orderBy: { sequence: 'asc' }, include: { _count: { select: { fields: true, modules: true, documents: true, transitionsFrom: true, transitionsTo: true } } } } },
    });
    if (!s) throw notFound('Stage');
    res.json({
      name: s.name,
      subStages: s.subStages.map((ss) => ({ id: ss.id, name: ss.name, ...ss._count })),
      totals: s.subStages.reduce(
        (t, ss) => ({ subStages: t.subStages + 1, modules: t.modules + ss._count.modules, fields: t.fields + ss._count.fields, documents: t.documents + ss._count.documents, transitions: t.transitions + ss._count.transitionsFrom + ss._count.transitionsTo }),
        { subStages: 0, modules: 0, fields: 0, documents: 0, transitions: 0 },
      ),
    });
  }),
);

r.delete(
  '/stages/:id',
  requirePermission('config.delete'),
  ah(async (req, res) => {
    const v = await assertDraft(await versionIdOfStage(req.params.id));
    const before = await prisma.stage.findUniqueOrThrow({ where: { id: req.params.id }, include: { subStages: { select: { name: true } } } });
    await prisma.$transaction(async (tx) => {
      // transitions pointing at sub-stages of this stage
      const subIds = (await tx.subStage.findMany({ where: { stageId: before.id }, select: { id: true } })).map((s) => s.id);
      await tx.workflowTransition.deleteMany({ where: { OR: [{ fromSubStageId: { in: subIds } }, { toSubStageId: { in: subIds } }] } });
      await tx.documentRequirement.deleteMany({ where: { subStageId: { in: subIds } } });
      await tx.stage.delete({ where: { id: before.id } });
    });
    await touchVersion(v.id, req.user!.username);
    await audit(req, { action: 'DELETE', entityType: 'Stage', entityId: before.id, productId: v.productId, versionId: v.id, summary: `Deleted stage "${before.name}" (${before.subStages.length} sub-stage(s)) from draft v${v.versionNo}`, before });
    res.json({ ok: true });
  }),
);

r.post(
  '/versions/:versionId/stages/reorder',
  requirePermission('config.edit'),
  ah(async (req, res) => {
    const { orderedIds } = reorderBody.parse(req.body);
    const v = await assertDraft(req.params.versionId);
    const existing = await prisma.stage.findMany({ where: { versionId: v.id }, select: { id: true } });
    if (existing.length !== orderedIds.length || !existing.every((e) => orderedIds.includes(e.id)))
      throw badRequest('orderedIds must list every stage of this version exactly once.');
    await prisma.$transaction(orderedIds.map((id, i) => prisma.stage.update({ where: { id }, data: { sequence: (i + 1) * 10 } })));
    await touchVersion(v.id, req.user!.username);
    await audit(req, { action: 'REORDER', entityType: 'Stage', productId: v.productId, versionId: v.id, summary: `Re-ordered stages of ${v.product.name} v${v.versionNo}`, after: orderedIds });
    res.json({ ok: true });
  }),
);

// ────────────────────────── Sub-stages ──────────────────────────

r.post(
  '/stages/:stageId/subStages',
  requirePermission('config.create'),
  ah(async (req, res) => {
    const body = subStageBody.parse(req.body);
    const v = await assertDraft(await versionIdOfStage(req.params.stageId));
    const key = body.key ?? toKey(body.name);
    if (await prisma.subStage.findFirst({ where: { stageId: req.params.stageId, key } })) throw conflict(`A sub-stage with key "${key}" already exists in this stage.`);
    const max = await prisma.subStage.aggregate({ where: { stageId: req.params.stageId }, _max: { sequence: true } });
    const s = await prisma.subStage.create({ data: { ...body, key, stageId: req.params.stageId, sequence: await nextSeq(max._max.sequence) } });
    await touchVersion(v.id, req.user!.username);
    await audit(req, { action: 'CREATE', entityType: 'SubStage', entityId: s.id, productId: v.productId, versionId: v.id, summary: `Added sub-stage "${s.name}"`, after: s });
    res.status(201).json(s);
  }),
);

r.put(
  '/subStages/:id',
  requirePermission('config.edit'),
  ah(async (req, res) => {
    const body = subStageBody.partial().parse(req.body);
    const v = await assertDraft(await versionIdOfSubStage(req.params.id));
    const before = await prisma.subStage.findUniqueOrThrow({ where: { id: req.params.id } });
    if (body.key && body.key !== before.key && (await prisma.subStage.findFirst({ where: { stageId: before.stageId, key: body.key } })))
      throw conflict(`A sub-stage with key "${body.key}" already exists in this stage.`);
    const s = await prisma.subStage.update({ where: { id: before.id }, data: body });
    await touchVersion(v.id, req.user!.username);
    await audit(req, { action: 'UPDATE', entityType: 'SubStage', entityId: s.id, productId: v.productId, versionId: v.id, summary: `Updated sub-stage "${s.name}"`, before, after: s });
    res.json(s);
  }),
);

r.get(
  '/subStages/:id/impact',
  requirePermission('config.view'),
  ah(async (req, res) => {
    const s = await prisma.subStage.findUnique({
      where: { id: req.params.id },
      include: {
        modules: { select: { name: true } },
        fields: { select: { label: true }, orderBy: { sequence: 'asc' } },
        _count: { select: { documents: true, transitionsFrom: true, transitionsTo: true } },
      },
    });
    if (!s) throw notFound('Sub-stage');
    res.json({ name: s.name, modules: s.modules.map((m) => m.name), fields: s.fields.map((f) => f.label), documents: s._count.documents, transitions: s._count.transitionsFrom + s._count.transitionsTo });
  }),
);

r.delete(
  '/subStages/:id',
  requirePermission('config.delete'),
  ah(async (req, res) => {
    const v = await assertDraft(await versionIdOfSubStage(req.params.id));
    const before = await prisma.subStage.findUniqueOrThrow({ where: { id: req.params.id } });
    await prisma.$transaction(async (tx) => {
      await tx.workflowTransition.deleteMany({ where: { OR: [{ fromSubStageId: before.id }, { toSubStageId: before.id }] } });
      await tx.documentRequirement.deleteMany({ where: { subStageId: before.id } });
      await tx.subStage.delete({ where: { id: before.id } });
    });
    await touchVersion(v.id, req.user!.username);
    await audit(req, { action: 'DELETE', entityType: 'SubStage', entityId: before.id, productId: v.productId, versionId: v.id, summary: `Deleted sub-stage "${before.name}"`, before });
    res.json({ ok: true });
  }),
);

r.post(
  '/stages/:stageId/subStages/reorder',
  requirePermission('config.edit'),
  ah(async (req, res) => {
    const { orderedIds } = reorderBody.parse(req.body);
    const v = await assertDraft(await versionIdOfStage(req.params.stageId));
    const existing = await prisma.subStage.findMany({ where: { stageId: req.params.stageId }, select: { id: true } });
    if (existing.length !== orderedIds.length || !existing.every((e) => orderedIds.includes(e.id)))
      throw badRequest('orderedIds must list every sub-stage of this stage exactly once.');
    await prisma.$transaction(orderedIds.map((id, i) => prisma.subStage.update({ where: { id }, data: { sequence: (i + 1) * 10 } })));
    await touchVersion(v.id, req.user!.username);
    await audit(req, { action: 'REORDER', entityType: 'SubStage', entityId: req.params.stageId, productId: v.productId, versionId: v.id, summary: 'Re-ordered sub-stages', after: orderedIds });
    res.json({ ok: true });
  }),
);

/** Move a sub-stage (with everything inside it) to another stage of the same configuration. */
r.post(
  '/subStages/:id/move',
  requirePermission('config.edit'),
  ah(async (req, res) => {
    const body = z.object({ targetStageId: z.string(), position: z.number().int().min(0).optional() }).parse(req.body);
    const versionId = await versionIdOfSubStage(req.params.id);
    const v = await assertDraft(versionId);
    if ((await versionIdOfStage(body.targetStageId)) !== versionId) throw badRequest('A sub-stage can only be moved within the same product configuration. Use Copy Configuration for other products.');
    const sub = await prisma.subStage.findUniqueOrThrow({ where: { id: req.params.id }, include: { stage: true } });
    if (await prisma.subStage.findFirst({ where: { stageId: body.targetStageId, key: sub.key, NOT: { id: sub.id } } }))
      throw conflict(`The target stage already has a sub-stage with key "${sub.key}". Rename the key first.`);
    const siblings = await prisma.subStage.findMany({ where: { stageId: body.targetStageId, NOT: { id: sub.id } }, orderBy: { sequence: 'asc' }, select: { id: true } });
    const ids = siblings.map((s) => s.id);
    ids.splice(body.position ?? ids.length, 0, sub.id);
    await prisma.$transaction([
      prisma.subStage.update({ where: { id: sub.id }, data: { stageId: body.targetStageId } }),
      ...ids.map((id, i) => prisma.subStage.update({ where: { id }, data: { sequence: (i + 1) * 10 } })),
    ]);
    const target = await prisma.stage.findUniqueOrThrow({ where: { id: body.targetStageId } });
    await touchVersion(v.id, req.user!.username);
    await audit(req, { action: 'MOVE', entityType: 'SubStage', entityId: sub.id, productId: v.productId, versionId: v.id, summary: `Moved sub-stage "${sub.name}" from "${sub.stage.name}" to "${target.name}"`, before: { stage: sub.stage.name }, after: { stage: target.name } });
    res.json({ ok: true });
  }),
);

// ────────────────────────── Modules / Sections ──────────────────────────

r.post(
  '/subStages/:subStageId/modules',
  requirePermission('config.create'),
  ah(async (req, res) => {
    const body = moduleBody.parse(req.body);
    const v = await assertDraft(await versionIdOfSubStage(req.params.subStageId));
    const key = body.key ?? toKey(body.name);
    if (await prisma.module.findFirst({ where: { subStageId: req.params.subStageId, key } })) throw conflict(`A section with key "${key}" already exists in this sub-stage.`);
    const max = await prisma.module.aggregate({ where: { subStageId: req.params.subStageId }, _max: { sequence: true } });
    const m = await prisma.module.create({ data: { ...body, key, subStageId: req.params.subStageId, sequence: await nextSeq(max._max.sequence) } });
    await touchVersion(v.id, req.user!.username);
    await audit(req, { action: 'CREATE', entityType: 'Module', entityId: m.id, productId: v.productId, versionId: v.id, summary: `Added section "${m.name}"`, after: m });
    res.status(201).json(m);
  }),
);

r.put(
  '/modules/:id',
  requirePermission('config.edit'),
  ah(async (req, res) => {
    const body = moduleBody.partial().parse(req.body);
    const v = await assertDraft(await versionIdOfModule(req.params.id));
    const before = await prisma.module.findUniqueOrThrow({ where: { id: req.params.id } });
    if (body.key && body.key !== before.key && (await prisma.module.findFirst({ where: { subStageId: before.subStageId, key: body.key } })))
      throw conflict(`A section with key "${body.key}" already exists.`);
    const m = await prisma.module.update({ where: { id: before.id }, data: body });
    await touchVersion(v.id, req.user!.username);
    await audit(req, { action: 'UPDATE', entityType: 'Module', entityId: m.id, productId: v.productId, versionId: v.id, summary: `Updated section "${m.name}"`, before, after: m });
    res.json(m);
  }),
);

r.delete(
  '/modules/:id',
  requirePermission('config.delete'),
  ah(async (req, res) => {
    const v = await assertDraft(await versionIdOfModule(req.params.id));
    const { fieldsAction } = z.object({ fieldsAction: z.enum(['delete', 'detach']).default('delete') }).parse(req.query);
    const before = await prisma.module.findUniqueOrThrow({ where: { id: req.params.id }, include: { fields: { select: { id: true, label: true } } } });
    await prisma.$transaction(async (tx) => {
      if (fieldsAction === 'detach') await tx.field.updateMany({ where: { moduleId: before.id }, data: { moduleId: null } });
      await tx.module.delete({ where: { id: before.id } });
    });
    await touchVersion(v.id, req.user!.username);
    await audit(req, { action: 'DELETE', entityType: 'Module', entityId: before.id, productId: v.productId, versionId: v.id, summary: `Deleted section "${before.name}" (${before.fields.length} field(s) ${fieldsAction === 'detach' ? 'kept on the sub-stage' : 'removed'})`, before });
    res.json({ ok: true });
  }),
);

r.post(
  '/subStages/:subStageId/modules/reorder',
  requirePermission('config.edit'),
  ah(async (req, res) => {
    const { orderedIds } = reorderBody.parse(req.body);
    const v = await assertDraft(await versionIdOfSubStage(req.params.subStageId));
    const existing = await prisma.module.findMany({ where: { subStageId: req.params.subStageId }, select: { id: true } });
    if (existing.length !== orderedIds.length || !existing.every((e) => orderedIds.includes(e.id)))
      throw badRequest('orderedIds must list every section of this sub-stage exactly once.');
    await prisma.$transaction(orderedIds.map((id, i) => prisma.module.update({ where: { id }, data: { sequence: (i + 1) * 10 } })));
    await touchVersion(v.id, req.user!.username);
    await audit(req, { action: 'REORDER', entityType: 'Module', entityId: req.params.subStageId, productId: v.productId, versionId: v.id, summary: 'Re-ordered sections', after: orderedIds });
    res.json({ ok: true });
  }),
);

export default r;
