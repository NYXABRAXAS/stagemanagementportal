import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { ah, badRequest, notFound } from '../lib/errors';
import { requirePermission } from '../middleware/auth';
import { evaluateRule, isEmpty, validateForm, type FieldLike, type RuleCondition } from '../../../shared/src/ruleEngine';

const r = Router();

async function loadForm(versionId: string, subStageId: string) {
  const sub = await prisma.subStage.findUnique({
    where: { id: subStageId },
    include: {
      stage: { include: { version: { include: { product: { include: { schemes: true } } } } } },
      modules: { orderBy: { sequence: 'asc' } },
      fields: { orderBy: { sequence: 'asc' }, include: { options: { orderBy: { sequence: 'asc' } }, rules: true } },
      documents: { orderBy: { sequence: 'asc' } },
      transitionsFrom: { orderBy: { sequence: 'asc' }, include: { toSubStage: { include: { stage: true } } } },
    },
  });
  if (!sub || sub.stage.versionId !== versionId) throw notFound('Sub-stage in this configuration');
  return sub;
}

/** Everything the preview renderer needs for one sub-stage. Read-only — nothing is saved. */
r.get(
  '/preview/form',
  requirePermission('config.view'),
  ah(async (req, res) => {
    const q = z.object({ versionId: z.string(), subStageId: z.string() }).parse(req.query);
    const sub = await loadForm(q.versionId, q.subStageId);
    res.json({
      product: { id: sub.stage.version.product.id, name: sub.stage.version.product.name, schemes: sub.stage.version.product.schemes },
      version: { id: sub.stage.version.id, versionNo: sub.stage.version.versionNo, status: sub.stage.version.status },
      stage: { id: sub.stage.id, name: sub.stage.name },
      subStage: { id: sub.id, name: sub.name, description: sub.description, platform: sub.platform, primaryRoleCode: sub.primaryRoleCode, needsConfirmation: sub.needsConfirmation },
      modules: sub.modules,
      fields: sub.fields,
      documents: sub.documents,
      transitions: sub.transitionsFrom.map((t) => ({ ...t, toName: t.toSubStage ? `${t.toSubStage.stage.name} › ${t.toSubStage.name}` : null })),
    });
  }),
);

/**
 * Validates preview values with the same engine the UI uses, and evaluates which
 * workflow actions would be available. Nothing is persisted.
 */
r.post(
  '/preview/validate',
  requirePermission('config.view'),
  ah(async (req, res) => {
    const body = z
      .object({
        versionId: z.string(),
        subStageId: z.string(),
        values: z.record(z.unknown()).default({}),
        documents: z.record(z.boolean()).default({}),
        schemeCode: z.string().optional().nullable(),
        roleCode: z.string().optional().nullable(),
        remarks: z.string().optional(),
      })
      .parse(req.body);
    const sub = await loadForm(body.versionId, body.subStageId);
    const ctx = { schemeCode: body.schemeCode, roleCode: body.roleCode };
    const fields = sub.fields as unknown as FieldLike[];
    const result = validateForm(fields, body.values, ctx);

    const docs = sub.documents.filter((d) => d.active && (d.schemeCodes.length === 0 || !body.schemeCode || d.schemeCodes.includes(body.schemeCode)));
    const missingDocs = docs.filter((d) => d.requirement === 'MANDATORY' && !body.documents[d.code]).map((d) => d.name);

    const actions = sub.transitionsFrom
      .filter((t) => t.active)
      .map((t) => {
        const blockers: string[] = [];
        if (body.roleCode && t.allowedRoleCodes.length && !t.allowedRoleCodes.includes(body.roleCode)) blockers.push('Selected role is not allowed to perform this action.');
        const conds = (t.conditions as unknown as RuleCondition[]) ?? [];
        const condOk = evaluateRule({ ruleType: 'ROUTE', logic: t.conditionLogic, conditions: conds }, body.values);
        if (!condOk) blockers.push('Routing condition is not met.');
        if (t.requireAllMandatoryFields && !result.valid) blockers.push('All mandatory fields must be complete and valid.');
        const missingKeys = t.requiredFieldKeys.filter((k) => isEmpty(body.values[k]));
        if (missingKeys.length) blockers.push(`Required before submission: ${missingKeys.join(', ')}`);
        const missingReqDocs = t.requiredDocCodes.filter((c) => !body.documents[c]);
        if (missingReqDocs.length) blockers.push(`Documents required: ${missingReqDocs.join(', ')}`);
        if (t.remarksRequired && isEmpty(body.remarks)) blockers.push('Remarks are required for this action.');
        return { id: t.id, actionLabel: t.actionLabel, outcome: t.outcome, to: t.toSubStage ? `${t.toSubStage.stage.name} › ${t.toSubStage.name}` : null, resultingStatus: t.resultingStatus, available: blockers.length === 0 && condOk, routable: condOk, blockers };
      });
    if (!sub.fields.length && !docs.length && !actions.length) throw badRequest('This sub-stage has no fields, documents or actions configured yet.');
    res.json({ ...result, missingDocuments: missingDocs, actions, saved: false });
  }),
);

export default r;
