import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { ah, badRequest, notFound } from '../lib/errors';
import { audit } from '../lib/audit';
import { requirePermission } from '../middleware/auth';
import { assertDraft, touchVersion, versionIdOfSubStage } from '../lib/versions';
import { OPERATOR_CODES } from '../../../shared/src/ruleEngine';

const r = Router();

const condition = z.object({
  fieldKey: z.string().min(1),
  operator: z.string().refine((o) => OPERATOR_CODES.includes(o), 'Unknown operator'),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]).optional(),
});

export const OUTCOMES = ['SUBMIT', 'APPROVE', 'REJECT', 'RETURN', 'QUERY', 'HOLD', 'AUTO'] as const;

const transitionBody = z.object({
  fromSubStageId: z.string(),
  toSubStageId: z.union([z.string(), z.null()]).optional(),
  actionCode: z.string().trim().min(1).max(60).regex(/^[A-Z0-9_]+$/, 'Action code must be UPPER_CASE letters, digits or _'),
  actionLabel: z.string().trim().min(1).max(120),
  outcome: z.enum(OUTCOMES),
  resultingStatus: z.union([z.string().max(120), z.null()]).optional(),
  conditionLogic: z.enum(['ALL', 'ANY']).default('ALL'),
  conditions: z.array(condition).default([]),
  allowedRoleCodes: z.array(z.string()).default([]),
  remarksRequired: z.boolean().default(false),
  requireAllMandatoryFields: z.boolean().default(false),
  requiredFieldKeys: z.array(z.string()).default([]),
  requiredDocCodes: z.array(z.string()).default([]),
  exceptionHandling: z.union([z.string().max(2000), z.null()]).optional(),
  isTerminal: z.boolean().default(false),
  active: z.boolean().optional(),
  needsConfirmation: z.boolean().optional(),
  sourceRef: z.union([z.string().max(500), z.null()]).optional(),
});

async function checkEnds(versionId: string, from?: string, to?: string | null) {
  if (from && (await versionIdOfSubStage(from)) !== versionId) throw badRequest('Source sub-stage is not part of this configuration.');
  if (to && (await versionIdOfSubStage(to)) !== versionId) throw badRequest('Destination sub-stage is not part of this configuration.');
}

const include = {
  fromSubStage: { select: { id: true, name: true, stage: { select: { id: true, name: true, sequence: true } }, sequence: true } },
  toSubStage: { select: { id: true, name: true, stage: { select: { id: true, name: true } } } },
} satisfies Prisma.WorkflowTransitionInclude;

r.get(
  '/versions/:versionId/transitions',
  requirePermission('config.view'),
  ah(async (req, res) => {
    const list = await prisma.workflowTransition.findMany({ where: { versionId: req.params.versionId }, include, orderBy: { sequence: 'asc' } });
    list.sort((a, b) => a.fromSubStage.stage.sequence - b.fromSubStage.stage.sequence || a.fromSubStage.sequence - b.fromSubStage.sequence || a.sequence - b.sequence);
    res.json(list);
  }),
);

r.post(
  '/versions/:versionId/transitions',
  requirePermission('config.create'),
  ah(async (req, res) => {
    const body = transitionBody.parse(req.body);
    const v = await assertDraft(req.params.versionId);
    await checkEnds(v.id, body.fromSubStageId, body.toSubStageId);
    const max = await prisma.workflowTransition.aggregate({ where: { versionId: v.id, fromSubStageId: body.fromSubStageId }, _max: { sequence: true } });
    const t = await prisma.workflowTransition.create({
      data: { ...body, conditions: body.conditions as Prisma.InputJsonValue, versionId: v.id, sequence: (max._max.sequence ?? 0) + 10 },
      include,
    });
    await touchVersion(v.id, req.user!.username);
    await audit(req, { action: 'CREATE', entityType: 'WorkflowTransition', entityId: t.id, productId: v.productId, versionId: v.id, summary: `Added workflow action "${t.actionLabel}" on ${t.fromSubStage.name}`, after: t });
    res.status(201).json(t);
  }),
);

r.put(
  '/transitions/:id',
  requirePermission('config.edit'),
  ah(async (req, res) => {
    const body = transitionBody.partial().parse(req.body);
    const before = await prisma.workflowTransition.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound('Workflow transition');
    const v = await assertDraft(before.versionId);
    await checkEnds(v.id, body.fromSubStageId, body.toSubStageId);
    const t = await prisma.workflowTransition.update({
      where: { id: before.id },
      data: { ...body, conditions: body.conditions ? (body.conditions as Prisma.InputJsonValue) : undefined },
      include,
    });
    await touchVersion(v.id, req.user!.username);
    await audit(req, { action: 'UPDATE', entityType: 'WorkflowTransition', entityId: t.id, productId: v.productId, versionId: v.id, summary: `Updated workflow action "${t.actionLabel}"`, before, after: t });
    res.json(t);
  }),
);

r.delete(
  '/transitions/:id',
  requirePermission('config.delete'),
  ah(async (req, res) => {
    const before = await prisma.workflowTransition.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound('Workflow transition');
    const v = await assertDraft(before.versionId);
    await prisma.workflowTransition.delete({ where: { id: before.id } });
    await touchVersion(v.id, req.user!.username);
    await audit(req, { action: 'DELETE', entityType: 'WorkflowTransition', entityId: before.id, productId: v.productId, versionId: v.id, summary: `Deleted workflow action "${before.actionLabel}"`, before });
    res.json({ ok: true });
  }),
);

export default r;
