/**
 * Copy Configuration / Apply to Products, and Compare Product Configurations.
 * Every copy is computed as a plan first (preview) and only written when the
 * caller sends confirm: true. Targets always receive the change in a DRAFT, so
 * nothing published is ever altered.
 */
import { Router, type Request } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { ah, badRequest, notFound } from '../lib/errors';
import { audit } from '../lib/audit';
import { requirePermission } from '../middleware/auth';
import {
  exportSnapshot, importDocuments, importStage, importSubStage, importTransitions, subRef, subStageRefMap,
  type Snapshot, type SnapField, type SnapStage, type SnapSubStage,
} from '../lib/snapshot';
import { diffSnapshots } from '../lib/diff';
import { createDraft, currentDraft, getVersionOrThrow, latestPublished } from '../lib/versions';

const r = Router();

const item = z.discriminatedUnion('type', [
  z.object({ type: z.literal('stage'), stageKey: z.string() }),
  z.object({ type: z.literal('subStage'), ref: z.string() }),
  z.object({ type: z.literal('field'), ref: z.string(), fieldKey: z.string() }),
]);

const copyBody = z.object({
  sourceVersionId: z.string(),
  items: z.array(item).min(1, 'Select at least one stage, sub-stage or field to copy'),
  targetProductIds: z.array(z.string()).min(1, 'Select at least one target product'),
  conflictMode: z.enum(['SKIP', 'REPLACE']).default('SKIP'),
  includeDocuments: z.boolean().default(true),
  includeTransitions: z.boolean().default(true),
  confirm: z.boolean().optional(),
});
type CopyBody = z.infer<typeof copyBody>;

interface PlanAction {
  op: 'CREATE_STAGE' | 'ADD_SUBSTAGE' | 'REPLACE_SUBSTAGE' | 'SKIP_SUBSTAGE' | 'ADD_FIELD' | 'REPLACE_FIELD' | 'SKIP_FIELD' | 'CREATE_SUBSTAGE_FOR_FIELD';
  target: string;
  detail?: string;
}

function findSub(snap: Snapshot, ref: string): { stage: SnapStage; sub: SnapSubStage } | null {
  const [sk, ssk] = ref.split('/');
  const stage = snap.stages.find((s) => s.key === sk);
  const sub = stage?.subStages.find((s) => s.key === ssk);
  return stage && sub ? { stage, sub } : null;
}

/** Computes what will happen in one target configuration. Pure function over snapshots. */
export function planCopy(source: Snapshot, target: Snapshot, body: Pick<CopyBody, 'items' | 'conflictMode'>) {
  const actions: PlanAction[] = [];
  const wholeStages = new Set(body.items.filter((i) => i.type === 'stage').map((i) => (i as { stageKey: string }).stageKey));
  const subRefs = new Set<string>();
  for (const sk of wholeStages) {
    const st = source.stages.find((s) => s.key === sk);
    if (!st) throw badRequest(`Stage "${sk}" not found in the source configuration.`);
    st.subStages.forEach((ss) => subRefs.add(subRef(sk, ss.key)));
  }
  body.items.filter((i) => i.type === 'subStage').forEach((i) => subRefs.add((i as { ref: string }).ref));

  const createdStages = new Set<string>();
  for (const ref of subRefs) {
    const found = findSub(source, ref);
    if (!found) throw badRequest(`Sub-stage "${ref}" not found in the source configuration.`);
    const tStage = target.stages.find((s) => s.key === found.stage.key);
    if (!tStage && !createdStages.has(found.stage.key)) {
      createdStages.add(found.stage.key);
      actions.push({ op: 'CREATE_STAGE', target: found.stage.name });
    }
    const exists = tStage?.subStages.find((s) => s.key === found.sub.key);
    if (!exists) actions.push({ op: 'ADD_SUBSTAGE', target: `${found.stage.name} › ${found.sub.name}`, detail: `${found.sub.fields.length} field(s), ${found.sub.modules.length} section(s)` });
    else if (body.conflictMode === 'REPLACE')
      actions.push({ op: 'REPLACE_SUBSTAGE', target: `${found.stage.name} › ${found.sub.name}`, detail: `replaces existing (${exists.fields.length} field(s)) with ${found.sub.fields.length} field(s)` });
    else actions.push({ op: 'SKIP_SUBSTAGE', target: `${found.stage.name} › ${found.sub.name}`, detail: 'already exists in target (choose Replace to overwrite)' });
  }
  for (const it of body.items) {
    if (it.type !== 'field' || subRefs.has(it.ref)) continue;
    const found = findSub(source, it.ref);
    const f = found?.sub.fields.find((x) => x.key === it.fieldKey);
    if (!found || !f) throw badRequest(`Field "${it.fieldKey}" not found in ${it.ref}.`);
    const tSub = findSub(target, it.ref);
    if (!tSub) {
      actions.push({ op: 'CREATE_SUBSTAGE_FOR_FIELD', target: `${found.stage.name} › ${found.sub.name}`, detail: 'sub-stage does not exist in target; it will be created with only the selected field(s)' });
      actions.push({ op: 'ADD_FIELD', target: `${found.sub.name} › ${f.label}` });
      continue;
    }
    const tf = tSub.sub.fields.find((x) => x.key === f.key);
    if (!tf) actions.push({ op: 'ADD_FIELD', target: `${tSub.sub.name} › ${f.label}` });
    else if (body.conflictMode === 'REPLACE') actions.push({ op: 'REPLACE_FIELD', target: `${tSub.sub.name} › ${f.label}` });
    else actions.push({ op: 'SKIP_FIELD', target: `${tSub.sub.name} › ${f.label}`, detail: 'field key already exists in target' });
  }
  return { actions, subRefs: [...subRefs] };
}

async function targetVersionInfo(productId: string) {
  const open = await currentDraft(productId);
  if (open && open.status !== 'DRAFT')
    return { error: `Target has version v${open.versionNo} in ${open.status} status. Withdraw or publish it before copying.` };
  const base = open ?? (await latestPublished(productId));
  return { open, base };
}

async function applyToTarget(
  tx: Prisma.TransactionClient,
  req: Request,
  productId: string,
  source: Snapshot,
  body: CopyBody,
) {
  let draft = await tx.configVersion.findFirst({ where: { productId, status: 'DRAFT' } });
  if (!draft) draft = await createDraft(productId, { userName: req.user!.username, userId: req.user!.id, title: 'Draft for copied configuration' }, tx);
  const target = await exportSnapshot(draft.id, tx);
  const plan = planCopy(source, target, body);

  const copiedRefs: string[] = [];
  for (const ref of plan.subRefs) {
    const { stage, sub } = findSub(source, ref)!;
    let tStage = await tx.stage.findFirst({ where: { versionId: draft.id, key: stage.key } });
    if (!tStage) {
      const max = await tx.stage.aggregate({ where: { versionId: draft.id }, _max: { sequence: true } });
      const id = await importStage(tx, draft.id, { ...stage, subStages: [] }, (max._max.sequence ?? 0) + 10);
      tStage = await tx.stage.findUniqueOrThrow({ where: { id } });
    }
    const existing = await tx.subStage.findFirst({ where: { stageId: tStage.id, key: sub.key } });
    if (existing && body.conflictMode === 'SKIP') continue;
    let seq = sub.sequence;
    if (existing) {
      seq = existing.sequence;
      await tx.workflowTransition.deleteMany({ where: { OR: [{ fromSubStageId: existing.id }, { toSubStageId: existing.id }] } });
      await tx.documentRequirement.deleteMany({ where: { subStageId: existing.id } });
      await tx.subStage.delete({ where: { id: existing.id } });
    } else {
      const max = await tx.subStage.aggregate({ where: { stageId: tStage.id }, _max: { sequence: true } });
      seq = (max._max.sequence ?? 0) + 10;
    }
    await importSubStage(tx, tStage.id, sub, seq);
    copiedRefs.push(ref);
  }

  // field-level items
  for (const it of body.items) {
    if (it.type !== 'field' || plan.subRefs.includes(it.ref)) continue;
    const { stage, sub } = findSub(source, it.ref)!;
    const f = sub.fields.find((x) => x.key === it.fieldKey)!;
    let tStage = await tx.stage.findFirst({ where: { versionId: draft.id, key: stage.key } });
    if (!tStage) {
      const max = await tx.stage.aggregate({ where: { versionId: draft.id }, _max: { sequence: true } });
      const id = await importStage(tx, draft.id, { ...stage, subStages: [] }, (max._max.sequence ?? 0) + 10);
      tStage = await tx.stage.findUniqueOrThrow({ where: { id } });
    }
    let tSub = await tx.subStage.findFirst({ where: { stageId: tStage.id, key: sub.key } });
    if (!tSub) {
      const id = await importSubStage(tx, tStage.id, { ...sub, fields: [], modules: [] });
      tSub = await tx.subStage.findUniqueOrThrow({ where: { id } });
    }
    const existing = await tx.field.findFirst({ where: { subStageId: tSub.id, key: f.key } });
    if (existing && body.conflictMode === 'SKIP') continue;
    if (existing) await tx.field.delete({ where: { id: existing.id } });
    await importSingleField(tx, tSub.id, f, sub);
  }

  const refs = await subStageRefMap(tx, draft.id);
  let skippedTransitions = 0;
  if (body.includeDocuments)
    await importDocuments(tx, draft.id, source.documents.filter((d) => d.subStageRef && copiedRefs.includes(d.subStageRef)), refs);
  if (body.includeTransitions) {
    const ts = source.transitions.filter((t) => copiedRefs.includes(t.fromRef));
    skippedTransitions = (await importTransitions(tx, draft.id, ts, refs)).length;
  }
  return { draft, plan, skippedTransitions };
}

async function importSingleField(tx: Prisma.TransactionClient, subStageId: string, f: SnapField, sourceSub: SnapSubStage) {
  let moduleId: string | null = null;
  if (f.moduleKey) {
    const m = await tx.module.findFirst({ where: { subStageId, key: f.moduleKey } });
    if (m) moduleId = m.id;
    else {
      const sm = sourceSub.modules.find((x) => x.key === f.moduleKey)!;
      moduleId = (await tx.module.create({ data: { subStageId, key: sm.key, name: sm.name, description: sm.description, repeatable: sm.repeatable, sequence: sm.sequence, needsConfirmation: sm.needsConfirmation, sourceRef: sm.sourceRef } })).id;
    }
  }
  const max = await tx.field.aggregate({ where: { subStageId }, _max: { sequence: true } });
  const { moduleKey: _mk, options, rules, ...rest } = f;
  await tx.field.create({
    data: {
      ...rest, subStageId, moduleId, sequence: (max._max.sequence ?? 0) + 10,
      options: { create: options },
      rules: { create: rules.map((ru) => ({ ...ru, conditions: (ru.conditions ?? []) as Prisma.InputJsonValue })) },
    },
  });
}

r.post(
  '/copy',
  requirePermission('config.view'),
  ah(async (req, res) => {
    const body = copyBody.parse(req.body);
    const srcVersion = await getVersionOrThrow(body.sourceVersionId);
    const source = await exportSnapshot(srcVersion.id);
    const targets = await prisma.product.findMany({ where: { id: { in: body.targetProductIds } } });
    if (targets.length !== body.targetProductIds.length) throw notFound('One of the target products');
    if (targets.some((t) => t.id === srcVersion.productId)) throw badRequest('The source product cannot also be a target.');

    const previews = [];
    for (const t of targets) {
      const info = await targetVersionInfo(t.id);
      if ('error' in info) {
        previews.push({ productId: t.id, product: t.name, error: info.error, actions: [] });
        continue;
      }
      const targetSnap = info.base ? await exportSnapshot(info.base.id) : { stages: [], documents: [], transitions: [] };
      const plan = planCopy(source, targetSnap, body);
      previews.push({
        productId: t.id, product: t.name, actions: plan.actions,
        targetVersion: info.open ? `existing draft v${info.open.versionNo}` : info.base ? `new draft based on published v${info.base.versionNo}` : 'new empty draft',
      });
    }
    if (!body.confirm) return res.json({ preview: previews, source: { product: srcVersion.product.name, versionNo: srcVersion.versionNo } });

    if (!req.user!.permissions.includes('config.create') || !req.user!.permissions.includes('config.edit'))
      return res.status(403).json({ error: 'You do not have permission to apply configuration changes (requires: config.create, config.edit).' });
    if (previews.some((p) => 'error' in p && p.error)) throw badRequest('Resolve the target errors shown in the preview before applying.', previews);

    const results = [];
    for (const t of targets) {
      const out = await prisma.$transaction((tx) => applyToTarget(tx, req, t.id, source, body), { timeout: 120000 });
      await audit(req, {
        action: 'COPY_CONFIGURATION', entityType: 'ConfigVersion', entityId: out.draft.id, productId: t.id, versionId: out.draft.id,
        summary: `Copied ${body.items.length} item(s) from ${srcVersion.product.name} v${srcVersion.versionNo} into ${t.name} draft v${out.draft.versionNo} (${body.conflictMode})`,
        after: { actions: out.plan.actions, skippedTransitions: out.skippedTransitions },
      });
      results.push({ productId: t.id, product: t.name, draftVersionId: out.draft.id, draftVersionNo: out.draft.versionNo, actions: out.plan.actions.length, skippedTransitions: out.skippedTransitions });
    }
    res.json({ applied: results });
  }),
);

/** Compare any two configuration versions (same or different products). */
r.get(
  '/compare',
  requirePermission('config.view'),
  ah(async (req, res) => {
    const { a, b } = z.object({ a: z.string(), b: z.string() }).parse(req.query);
    const [va, vb] = await Promise.all([getVersionOrThrow(a), getVersionOrThrow(b)]);
    const result = diffSnapshots(await exportSnapshot(va.id), await exportSnapshot(vb.id));
    res.json({
      a: { id: va.id, product: va.product.name, versionNo: va.versionNo, status: va.status },
      b: { id: vb.id, product: vb.product.name, versionNo: vb.versionNo, status: vb.status },
      ...result,
    });
  }),
);

export default r;
