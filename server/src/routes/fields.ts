import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { ah, badRequest, conflict, notFound } from '../lib/errors';
import { audit } from '../lib/audit';
import { requirePermission } from '../middleware/auth';
import { assertDraft, touchVersion, versionIdOfField, versionIdOfSubStage } from '../lib/versions';
import { FIELD_TYPE_CODES, OPERATOR_CODES, OPTION_TYPES, formulaReferences } from '../../../shared/src/ruleEngine';
import { keySchema, toKey } from './hierarchy';

const r = Router();

const condition = z.object({
  fieldKey: z.string().min(1),
  operator: z.string().refine((o) => OPERATOR_CODES.includes(o), 'Unknown operator'),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]).optional(),
});

const ruleBody = z.object({
  ruleType: z.enum(['VISIBILITY', 'REQUIRED', 'VALIDATION']),
  logic: z.enum(['ALL', 'ANY']).default('ALL'),
  conditions: z.array(condition).default([]),
  expression: z.string().max(2000).optional().nullable(),
  message: z.string().max(500).optional().nullable(),
  active: z.boolean().default(true),
});

const optionBody = z.object({
  value: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(200),
  active: z.boolean().default(true),
});

const nullableNum = z.union([z.number(), z.null()]).optional();
const nullableInt = z.union([z.number().int().min(0), z.null()]).optional();
const nullableStr = (max = 500) => z.union([z.string().max(max), z.null()]).optional();

export const fieldBody = z.object({
  key: keySchema.optional(),
  label: z.string().trim().min(1).max(200),
  type: z.string().refine((t) => FIELD_TYPE_CODES.includes(t), 'Unknown field type'),
  moduleId: z.union([z.string(), z.null()]).optional(),
  definitionId: z.union([z.string(), z.null()]).optional(),
  helpText: nullableStr(1000),
  placeholder: nullableStr(200),
  requirement: z.enum(['MANDATORY', 'OPTIONAL', 'CONDITIONAL']).default('OPTIONAL'),
  defaultValue: nullableStr(500),
  minValue: nullableNum,
  maxValue: nullableNum,
  minLength: nullableInt,
  maxLength: nullableInt,
  pattern: nullableStr(500),
  patternMessage: nullableStr(300),
  format: nullableStr(60),
  dateMin: nullableStr(40),
  dateMax: nullableStr(40),
  readOnly: z.boolean().optional(),
  formula: nullableStr(1000),
  active: z.boolean().optional(),
  sensitive: z.boolean().optional(),
  maskingRule: nullableStr(100),
  dataMapping: nullableStr(300),
  schemeCodes: z.array(z.string()).optional(),
  visibleRoleCodes: z.array(z.string()).optional(),
  editableRoleCodes: z.array(z.string()).optional(),
  needsConfirmation: z.boolean().optional(),
  sourceRef: nullableStr(500),
  notes: nullableStr(2000),
  options: z.array(optionBody).optional(),
  rules: z.array(ruleBody).optional(),
});

type FieldInput = z.infer<typeof fieldBody>;

function checkFieldInput(f: Partial<FieldInput>) {
  if (f.minValue != null && f.maxValue != null && f.minValue > f.maxValue) throw badRequest('Minimum value cannot be greater than maximum value.');
  if (f.minLength != null && f.maxLength != null && f.minLength > f.maxLength) throw badRequest('Minimum length cannot be greater than maximum length.');
  if (f.pattern) {
    try {
      new RegExp(f.pattern);
    } catch {
      throw badRequest(`Validation pattern is not a valid regular expression: ${f.pattern}`);
    }
  }
  if (f.options) {
    const vals = f.options.map((o) => o.value);
    if (new Set(vals).size !== vals.length) throw badRequest('Dropdown options must have unique values.');
  }
  if (f.type === 'CALCULATED' && f.formula) formulaReferences(f.formula); // throws nothing; syntax checked by validator
}

function relations(f: Partial<FieldInput>) {
  return {
    options: f.options
      ? { create: f.options.map((o, i) => ({ value: o.value, label: o.label, active: o.active, sequence: (i + 1) * 10 })) }
      : undefined,
    rules: f.rules
      ? {
          create: f.rules.map((ru) => ({
            ruleType: ru.ruleType,
            logic: ru.logic,
            conditions: ru.conditions as Prisma.InputJsonValue,
            expression: ru.expression ?? null,
            message: ru.message ?? null,
            active: ru.active,
          })),
        }
      : undefined,
  };
}

const fieldInclude = { options: { orderBy: { sequence: 'asc' } }, rules: true } satisfies Prisma.FieldInclude;

async function assertModuleInSubStage(moduleId: string | null | undefined, subStageId: string) {
  if (!moduleId) return;
  const m = await prisma.module.findUnique({ where: { id: moduleId } });
  if (!m || m.subStageId !== subStageId) throw badRequest('The selected section does not belong to this sub-stage.');
}

r.get(
  '/subStages/:subStageId/fields',
  requirePermission('config.view'),
  ah(async (req, res) => {
    res.json(await prisma.field.findMany({ where: { subStageId: req.params.subStageId }, orderBy: { sequence: 'asc' }, include: fieldInclude }));
  }),
);

r.get(
  '/fields/:id',
  requirePermission('config.view'),
  ah(async (req, res) => {
    const f = await prisma.field.findUnique({ where: { id: req.params.id }, include: fieldInclude });
    if (!f) throw notFound('Field');
    res.json(f);
  }),
);

r.post(
  '/subStages/:subStageId/fields',
  requirePermission('config.create'),
  ah(async (req, res) => {
    const body = fieldBody.parse(req.body);
    checkFieldInput(body);
    const subStageId = req.params.subStageId;
    const v = await assertDraft(await versionIdOfSubStage(subStageId));
    await assertModuleInSubStage(body.moduleId, subStageId);
    const key = body.key ?? toKey(body.label);
    if (await prisma.field.findFirst({ where: { subStageId, key } })) throw conflict(`A field with key "${key}" already exists in this sub-stage.`);
    const max = await prisma.field.aggregate({ where: { subStageId }, _max: { sequence: true } });
    const { options: _o, rules: _r, ...scalar } = body;
    const f = await prisma.field.create({
      data: { ...scalar, key, subStageId, sequence: (max._max.sequence ?? 0) + 10, ...relations(body) },
      include: fieldInclude,
    });
    await touchVersion(v.id, req.user!.username);
    await audit(req, { action: 'CREATE', entityType: 'Field', entityId: f.id, productId: v.productId, versionId: v.id, summary: `Added field "${f.label}" (${f.type})`, after: f });
    res.status(201).json(f);
  }),
);

r.put(
  '/fields/:id',
  requirePermission('config.edit'),
  ah(async (req, res) => {
    const body = fieldBody.partial().parse(req.body);
    const v = await assertDraft(await versionIdOfField(req.params.id));
    const before = await prisma.field.findUniqueOrThrow({ where: { id: req.params.id }, include: fieldInclude });
    checkFieldInput({ ...before, ...body } as Partial<FieldInput>);
    await assertModuleInSubStage(body.moduleId, before.subStageId);
    if (body.key && body.key !== before.key && (await prisma.field.findFirst({ where: { subStageId: before.subStageId, key: body.key } })))
      throw conflict(`A field with key "${body.key}" already exists in this sub-stage.`);
    const { options, rules, ...scalar } = body;
    const f = await prisma.$transaction(async (tx) => {
      if (options) await tx.fieldOption.deleteMany({ where: { fieldId: before.id } });
      if (rules) await tx.fieldRule.deleteMany({ where: { fieldId: before.id } });
      return tx.field.update({ where: { id: before.id }, data: { ...scalar, ...relations({ options, rules }) }, include: fieldInclude });
    });
    if (!OPTION_TYPES.includes(f.type) && f.options.length) {
      // options are kept (harmless) so switching the type back does not lose them
    }
    await touchVersion(v.id, req.user!.username);
    await audit(req, { action: 'UPDATE', entityType: 'Field', entityId: f.id, productId: v.productId, versionId: v.id, summary: `Updated field "${f.label}"`, before, after: f });
    res.json(f);
  }),
);

r.delete(
  '/fields/:id',
  requirePermission('config.delete'),
  ah(async (req, res) => {
    const v = await assertDraft(await versionIdOfField(req.params.id));
    const before = await prisma.field.findUniqueOrThrow({ where: { id: req.params.id }, include: fieldInclude });
    // rules of other fields that reference this field key
    const dependants = await prisma.field.findMany({ where: { subStageId: before.subStageId, NOT: { id: before.id } }, include: { rules: true } });
    const refs = dependants.filter((d) =>
      d.rules.some((ru) => (ru.conditions as { fieldKey?: string }[]).some((c) => c.fieldKey === before.key)) || (d.formula ? formulaReferences(d.formula).includes(before.key) : false),
    );
    if (refs.length && req.query.force !== 'true')
      throw conflict(`Field "${before.label}" is referenced by: ${refs.map((d) => d.label).join(', ')}. Remove those rules first, or delete with force.`, { dependants: refs.map((d) => d.label) });
    await prisma.field.delete({ where: { id: before.id } });
    await touchVersion(v.id, req.user!.username);
    await audit(req, { action: 'DELETE', entityType: 'Field', entityId: before.id, productId: v.productId, versionId: v.id, summary: `Deleted field "${before.label}"`, before });
    res.json({ ok: true });
  }),
);

r.post(
  '/fields/:id/duplicate',
  requirePermission('config.create'),
  ah(async (req, res) => {
    const v = await assertDraft(await versionIdOfField(req.params.id));
    const src = await prisma.field.findUniqueOrThrow({ where: { id: req.params.id }, include: fieldInclude });
    let key = `${src.key}Copy`;
    for (let i = 2; await prisma.field.findFirst({ where: { subStageId: src.subStageId, key } }); i++) key = `${src.key}Copy${i}`;
    const { id: _id, options, rules, ...rest } = src;
    const f = await prisma.field.create({
      data: {
        ...rest,
        key,
        label: `${src.label} (copy)`,
        sequence: src.sequence + 1,
        options: { create: options.map((o) => ({ value: o.value, label: o.label, sequence: o.sequence, active: o.active })) },
        rules: { create: rules.map((ru) => ({ ruleType: ru.ruleType, logic: ru.logic, conditions: ru.conditions as Prisma.InputJsonValue, expression: ru.expression, message: ru.message, active: ru.active })) },
      },
      include: fieldInclude,
    });
    await touchVersion(v.id, req.user!.username);
    await audit(req, { action: 'CREATE', entityType: 'Field', entityId: f.id, productId: v.productId, versionId: v.id, summary: `Duplicated field "${src.label}"`, after: f });
    res.status(201).json(f);
  }),
);

/** Reorder fields of a sub-stage (the full ordered list across sections). */
r.post(
  '/subStages/:subStageId/fields/reorder',
  requirePermission('config.edit'),
  ah(async (req, res) => {
    const { orderedIds } = z.object({ orderedIds: z.array(z.string()).min(1) }).parse(req.body);
    const v = await assertDraft(await versionIdOfSubStage(req.params.subStageId));
    const existing = await prisma.field.findMany({ where: { subStageId: req.params.subStageId }, select: { id: true } });
    if (existing.length !== orderedIds.length || !existing.every((e) => orderedIds.includes(e.id)))
      throw badRequest('orderedIds must list every field of this sub-stage exactly once.');
    await prisma.$transaction(orderedIds.map((id, i) => prisma.field.update({ where: { id }, data: { sequence: (i + 1) * 10 } })));
    await touchVersion(v.id, req.user!.username);
    await audit(req, { action: 'REORDER', entityType: 'Field', entityId: req.params.subStageId, productId: v.productId, versionId: v.id, summary: 'Re-ordered fields', after: orderedIds });
    res.json({ ok: true });
  }),
);

/** Move a field to another section and/or another sub-stage of the same configuration. */
r.post(
  '/fields/:id/move',
  requirePermission('config.edit'),
  ah(async (req, res) => {
    const body = z.object({ targetSubStageId: z.string(), targetModuleId: z.union([z.string(), z.null()]).optional() }).parse(req.body);
    const versionId = await versionIdOfField(req.params.id);
    const v = await assertDraft(versionId);
    if ((await versionIdOfSubStage(body.targetSubStageId)) !== versionId) throw badRequest('Fields can only be moved within the same product configuration.');
    await assertModuleInSubStage(body.targetModuleId, body.targetSubStageId);
    const f = await prisma.field.findUniqueOrThrow({ where: { id: req.params.id } });
    if (body.targetSubStageId !== f.subStageId && (await prisma.field.findFirst({ where: { subStageId: body.targetSubStageId, key: f.key } })))
      throw conflict(`The target sub-stage already has a field with key "${f.key}".`);
    const max = await prisma.field.aggregate({ where: { subStageId: body.targetSubStageId }, _max: { sequence: true } });
    const moved = await prisma.field.update({
      where: { id: f.id },
      data: { subStageId: body.targetSubStageId, moduleId: body.targetModuleId ?? null, sequence: body.targetSubStageId === f.subStageId ? f.sequence : (max._max.sequence ?? 0) + 10 },
    });
    await touchVersion(v.id, req.user!.username);
    await audit(req, { action: 'MOVE', entityType: 'Field', entityId: f.id, productId: v.productId, versionId: v.id, summary: `Moved field "${f.label}"`, before: { subStageId: f.subStageId, moduleId: f.moduleId }, after: { subStageId: moved.subStageId, moduleId: moved.moduleId } });
    res.json(moved);
  }),
);

// ────────────── Field definition library (reusable templates) ──────────────

const defBody = z.object({
  key: keySchema,
  label: z.string().trim().min(1).max(200),
  type: z.string().refine((t) => FIELD_TYPE_CODES.includes(t), 'Unknown field type'),
  description: z.string().max(1000).optional().nullable(),
  defaults: z.record(z.unknown()).optional().nullable(),
});

r.get('/field-definitions', requirePermission('config.view'), ah(async (_req, res) => res.json(await prisma.fieldDefinition.findMany({ orderBy: { label: 'asc' } }))));

r.post(
  '/field-definitions',
  requirePermission('config.create'),
  ah(async (req, res) => {
    const body = defBody.parse(req.body);
    const d = await prisma.fieldDefinition.create({ data: { ...body, defaults: (body.defaults ?? undefined) as Prisma.InputJsonValue | undefined } });
    await audit(req, { action: 'CREATE', entityType: 'FieldDefinition', entityId: d.id, summary: `Added "${d.label}" to the field library`, after: d });
    res.status(201).json(d);
  }),
);

r.delete(
  '/field-definitions/:id',
  requirePermission('config.delete'),
  ah(async (req, res) => {
    const d = await prisma.fieldDefinition.delete({ where: { id: req.params.id } });
    await prisma.field.updateMany({ where: { definitionId: d.id }, data: { definitionId: null } });
    await audit(req, { action: 'DELETE', entityType: 'FieldDefinition', entityId: d.id, summary: `Removed "${d.label}" from the field library`, before: d });
    res.json({ ok: true });
  }),
);

export default r;
