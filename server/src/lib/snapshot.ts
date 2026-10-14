/**
 * Portable, id-free representation of a configuration version.
 * Used for: cloning drafts, copying configuration between products, rollback,
 * version comparison (diff) and export. Sub-stages are referenced as
 * "stageKey/subStageKey" so a snapshot can be re-imported into any version.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { badRequest, notFound } from './errors';

type Tx = Prisma.TransactionClient;

export interface SnapOption { value: string; label: string; sequence: number; active: boolean }
export interface SnapRule { ruleType: string; logic: string; conditions: unknown; expression: string | null; message: string | null; active: boolean }
export interface SnapField {
  key: string; moduleKey: string | null; label: string; type: string; helpText: string | null; placeholder: string | null;
  requirement: string; defaultValue: string | null; minValue: number | null; maxValue: number | null;
  minLength: number | null; maxLength: number | null; pattern: string | null; patternMessage: string | null;
  format: string | null; dateMin: string | null; dateMax: string | null; readOnly: boolean; formula: string | null;
  sequence: number; active: boolean; sensitive: boolean; maskingRule: string | null; dataMapping: string | null;
  schemeCodes: string[]; visibleRoleCodes: string[]; editableRoleCodes: string[]; needsConfirmation: boolean;
  sourceRef: string | null; notes: string | null; options: SnapOption[]; rules: SnapRule[];
}
export interface SnapModule { key: string; name: string; description: string | null; repeatable: boolean; sequence: number; active: boolean; needsConfirmation: boolean; sourceRef: string | null }
export interface SnapSubStage {
  key: string; name: string; description: string | null; platform: string | null; primaryRoleCode: string | null;
  sequence: number; active: boolean; needsConfirmation: boolean; sourceRef: string | null;
  modules: SnapModule[]; fields: SnapField[];
}
export interface SnapStage {
  key: string; name: string; description: string | null; platform: string | null; sequence: number; active: boolean;
  needsConfirmation: boolean; sourceRef: string | null; subStages: SnapSubStage[];
}
export interface SnapDocument {
  subStageRef: string | null; code: string; name: string; category: string | null; requirement: string; captureMode: string;
  allowedTypes: string | null; maxSizeMb: number | null; minCount: number; maxCount: number | null; schemeCodes: string[];
  validatedByRoleCodes: string[]; sequence: number; active: boolean; needsConfirmation: boolean; sourceRef: string | null; notes: string | null;
}
export interface SnapTransition {
  fromRef: string; toRef: string | null; actionCode: string; actionLabel: string; outcome: string; resultingStatus: string | null;
  conditionLogic: string; conditions: unknown; allowedRoleCodes: string[]; remarksRequired: boolean; requireAllMandatoryFields: boolean;
  requiredFieldKeys: string[]; requiredDocCodes: string[]; exceptionHandling: string | null; isTerminal: boolean;
  sequence: number; active: boolean; needsConfirmation: boolean; sourceRef: string | null;
}
export interface Snapshot { stages: SnapStage[]; documents: SnapDocument[]; transitions: SnapTransition[] }

export const subRef = (stageKey: string, subKey: string) => `${stageKey}/${subKey}`;

const versionInclude = {
  stages: {
    orderBy: { sequence: 'asc' },
    include: {
      subStages: {
        orderBy: { sequence: 'asc' },
        include: {
          modules: { orderBy: { sequence: 'asc' } },
          fields: {
            orderBy: { sequence: 'asc' },
            include: { options: { orderBy: { sequence: 'asc' } }, rules: true, module: true },
          },
        },
      },
    },
  },
  documents: { orderBy: { sequence: 'asc' }, include: { subStage: { include: { stage: true } } } },
  transitions: {
    orderBy: { sequence: 'asc' },
    include: { fromSubStage: { include: { stage: true } }, toSubStage: { include: { stage: true } } },
  },
} satisfies Prisma.ConfigVersionInclude;

export async function exportSnapshot(versionId: string, tx: Tx | typeof prisma = prisma): Promise<Snapshot> {
  const v = await tx.configVersion.findUnique({ where: { id: versionId }, include: versionInclude });
  if (!v) throw notFound('Configuration version');
  return {
    stages: v.stages.map((s) => ({
      key: s.key, name: s.name, description: s.description, platform: s.platform, sequence: s.sequence, active: s.active,
      needsConfirmation: s.needsConfirmation, sourceRef: s.sourceRef,
      subStages: s.subStages.map((ss) => ({
        key: ss.key, name: ss.name, description: ss.description, platform: ss.platform, primaryRoleCode: ss.primaryRoleCode,
        sequence: ss.sequence, active: ss.active, needsConfirmation: ss.needsConfirmation, sourceRef: ss.sourceRef,
        modules: ss.modules.map((m) => ({
          key: m.key, name: m.name, description: m.description, repeatable: m.repeatable, sequence: m.sequence,
          active: m.active, needsConfirmation: m.needsConfirmation, sourceRef: m.sourceRef,
        })),
        fields: ss.fields.map((f) => ({
          key: f.key, moduleKey: f.module?.key ?? null, label: f.label, type: f.type, helpText: f.helpText, placeholder: f.placeholder,
          requirement: f.requirement, defaultValue: f.defaultValue, minValue: f.minValue, maxValue: f.maxValue,
          minLength: f.minLength, maxLength: f.maxLength, pattern: f.pattern, patternMessage: f.patternMessage, format: f.format,
          dateMin: f.dateMin, dateMax: f.dateMax, readOnly: f.readOnly, formula: f.formula, sequence: f.sequence, active: f.active,
          sensitive: f.sensitive, maskingRule: f.maskingRule, dataMapping: f.dataMapping, schemeCodes: f.schemeCodes,
          visibleRoleCodes: f.visibleRoleCodes, editableRoleCodes: f.editableRoleCodes, needsConfirmation: f.needsConfirmation,
          sourceRef: f.sourceRef, notes: f.notes,
          options: f.options.map((o) => ({ value: o.value, label: o.label, sequence: o.sequence, active: o.active })),
          rules: f.rules.map((r) => ({
            ruleType: r.ruleType, logic: r.logic, conditions: r.conditions, expression: r.expression, message: r.message, active: r.active,
          })),
        })),
      })),
    })),
    documents: v.documents.map((d) => ({
      subStageRef: d.subStage ? subRef(d.subStage.stage.key, d.subStage.key) : null,
      code: d.code, name: d.name, category: d.category, requirement: d.requirement, captureMode: d.captureMode,
      allowedTypes: d.allowedTypes, maxSizeMb: d.maxSizeMb, minCount: d.minCount, maxCount: d.maxCount, schemeCodes: d.schemeCodes,
      validatedByRoleCodes: d.validatedByRoleCodes, sequence: d.sequence, active: d.active, needsConfirmation: d.needsConfirmation,
      sourceRef: d.sourceRef, notes: d.notes,
    })),
    transitions: v.transitions.map((t) => ({
      fromRef: subRef(t.fromSubStage.stage.key, t.fromSubStage.key),
      toRef: t.toSubStage ? subRef(t.toSubStage.stage.key, t.toSubStage.key) : null,
      actionCode: t.actionCode, actionLabel: t.actionLabel, outcome: t.outcome, resultingStatus: t.resultingStatus,
      conditionLogic: t.conditionLogic, conditions: t.conditions, allowedRoleCodes: t.allowedRoleCodes,
      remarksRequired: t.remarksRequired, requireAllMandatoryFields: t.requireAllMandatoryFields,
      requiredFieldKeys: t.requiredFieldKeys, requiredDocCodes: t.requiredDocCodes, exceptionHandling: t.exceptionHandling,
      isTerminal: t.isTerminal, sequence: t.sequence, active: t.active, needsConfirmation: t.needsConfirmation, sourceRef: t.sourceRef,
    })),
  };
}

/** Creates one sub-stage (with modules, fields, options, rules) under a stage. Returns the new id. */
export async function importSubStage(tx: Tx, stageId: string, ss: SnapSubStage, sequence = ss.sequence): Promise<string> {
  const created = await tx.subStage.create({
    data: {
      stageId, key: ss.key, name: ss.name, description: ss.description, platform: ss.platform, primaryRoleCode: ss.primaryRoleCode,
      sequence, active: ss.active, needsConfirmation: ss.needsConfirmation, sourceRef: ss.sourceRef,
    },
  });
  const moduleIds = new Map<string, string>();
  for (const m of ss.modules) {
    const mm = await tx.module.create({
      data: {
        subStageId: created.id, key: m.key, name: m.name, description: m.description, repeatable: m.repeatable,
        sequence: m.sequence, active: m.active, needsConfirmation: m.needsConfirmation, sourceRef: m.sourceRef,
      },
    });
    moduleIds.set(m.key, mm.id);
  }
  for (const f of ss.fields) {
    if (f.moduleKey && !moduleIds.has(f.moduleKey)) throw badRequest(`Field ${f.key} references unknown module ${f.moduleKey}`);
    await tx.field.create({
      data: {
        subStageId: created.id, moduleId: f.moduleKey ? moduleIds.get(f.moduleKey)! : null,
        key: f.key, label: f.label, type: f.type, helpText: f.helpText, placeholder: f.placeholder, requirement: f.requirement,
        defaultValue: f.defaultValue, minValue: f.minValue, maxValue: f.maxValue, minLength: f.minLength, maxLength: f.maxLength,
        pattern: f.pattern, patternMessage: f.patternMessage, format: f.format, dateMin: f.dateMin, dateMax: f.dateMax,
        readOnly: f.readOnly, formula: f.formula, sequence: f.sequence, active: f.active, sensitive: f.sensitive,
        maskingRule: f.maskingRule, dataMapping: f.dataMapping, schemeCodes: f.schemeCodes, visibleRoleCodes: f.visibleRoleCodes,
        editableRoleCodes: f.editableRoleCodes, needsConfirmation: f.needsConfirmation, sourceRef: f.sourceRef, notes: f.notes,
        options: { create: f.options.map((o) => ({ value: o.value, label: o.label, sequence: o.sequence, active: o.active })) },
        rules: {
          create: f.rules.map((r) => ({
            ruleType: r.ruleType, logic: r.logic, conditions: (r.conditions ?? []) as Prisma.InputJsonValue,
            expression: r.expression, message: r.message, active: r.active,
          })),
        },
      },
    });
  }
  return created.id;
}

export async function importStage(tx: Tx, versionId: string, s: SnapStage, sequence = s.sequence) {
  const stage = await tx.stage.create({
    data: {
      versionId, key: s.key, name: s.name, description: s.description, platform: s.platform, sequence,
      active: s.active, needsConfirmation: s.needsConfirmation, sourceRef: s.sourceRef,
    },
  });
  for (const ss of s.subStages) await importSubStage(tx, stage.id, ss);
  return stage.id;
}

/** Map "stageKey/subKey" → subStage id for a version. */
export async function subStageRefMap(tx: Tx | typeof prisma, versionId: string): Promise<Map<string, string>> {
  const subs = await tx.subStage.findMany({ where: { stage: { versionId } }, include: { stage: true } });
  return new Map(subs.map((s) => [subRef(s.stage.key, s.key), s.id]));
}

export async function importDocuments(tx: Tx, versionId: string, docs: SnapDocument[], refs: Map<string, string>) {
  for (const d of docs) {
    await tx.documentRequirement.create({
      data: {
        versionId, subStageId: d.subStageRef ? refs.get(d.subStageRef) ?? null : null,
        code: d.code, name: d.name, category: d.category, requirement: d.requirement, captureMode: d.captureMode,
        allowedTypes: d.allowedTypes, maxSizeMb: d.maxSizeMb, minCount: d.minCount, maxCount: d.maxCount,
        schemeCodes: d.schemeCodes, validatedByRoleCodes: d.validatedByRoleCodes, sequence: d.sequence, active: d.active,
        needsConfirmation: d.needsConfirmation, sourceRef: d.sourceRef, notes: d.notes,
      },
    });
  }
}

/** Imports transitions whose endpoints exist in the target. Returns skipped transitions. */
export async function importTransitions(tx: Tx, versionId: string, ts: SnapTransition[], refs: Map<string, string>) {
  const skipped: SnapTransition[] = [];
  for (const t of ts) {
    const from = refs.get(t.fromRef);
    const to = t.toRef ? refs.get(t.toRef) : null;
    if (!from || (t.toRef && !to)) {
      skipped.push(t);
      continue;
    }
    await tx.workflowTransition.create({
      data: {
        versionId, fromSubStageId: from, toSubStageId: to ?? null, actionCode: t.actionCode, actionLabel: t.actionLabel,
        outcome: t.outcome, resultingStatus: t.resultingStatus, conditionLogic: t.conditionLogic,
        conditions: (t.conditions ?? []) as Prisma.InputJsonValue, allowedRoleCodes: t.allowedRoleCodes,
        remarksRequired: t.remarksRequired, requireAllMandatoryFields: t.requireAllMandatoryFields,
        requiredFieldKeys: t.requiredFieldKeys, requiredDocCodes: t.requiredDocCodes, exceptionHandling: t.exceptionHandling,
        isTerminal: t.isTerminal, sequence: t.sequence, active: t.active, needsConfirmation: t.needsConfirmation, sourceRef: t.sourceRef,
      },
    });
  }
  return skipped;
}

/** Imports a complete snapshot into an (empty) version. */
export async function importSnapshot(tx: Tx, versionId: string, snap: Snapshot) {
  for (const s of snap.stages) await importStage(tx, versionId, s);
  const refs = await subStageRefMap(tx, versionId);
  await importDocuments(tx, versionId, snap.documents, refs);
  const skipped = await importTransitions(tx, versionId, snap.transitions, refs);
  return { skippedTransitions: skipped.length };
}

/** Removes everything inside a version (used before replacing a draft's content). */
export async function clearVersion(tx: Tx, versionId: string) {
  await tx.workflowTransition.deleteMany({ where: { versionId } });
  await tx.documentRequirement.deleteMany({ where: { versionId } });
  await tx.stage.deleteMany({ where: { versionId } });
}
