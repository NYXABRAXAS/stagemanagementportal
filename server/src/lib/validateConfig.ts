import { FIELD_TYPE_CODES, OPTION_TYPES, OPERATOR_CODES, formulaReferences } from '../../../shared/src/ruleEngine';
import type { Snapshot } from './snapshot';
import { subRef } from './snapshot';

export interface Issue {
  severity: 'error' | 'warning';
  path: string;
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  errors: Issue[];
  warnings: Issue[];
  stats: { stages: number; subStages: number; modules: number; fields: number; documents: number; transitions: number; needsConfirmation: number };
}

const KEY_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

/**
 * Checks a configuration before it can be published. Errors block publishing;
 * warnings (e.g. items still marked "requires confirmation") are informational.
 */
export function validateSnapshot(snap: Snapshot, knownRoleCodes: string[] = []): ValidationReport {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const err = (path: string, message: string) => errors.push({ severity: 'error', path, message });
  const warn = (path: string, message: string) => warnings.push({ severity: 'warning', path, message });
  const stats = { stages: 0, subStages: 0, modules: 0, fields: 0, documents: snap.documents.length, transitions: snap.transitions.length, needsConfirmation: 0 };
  const roleSet = new Set(knownRoleCodes);
  const refs = new Set<string>();

  if (snap.stages.filter((s) => s.active).length === 0) err('configuration', 'The configuration has no active stages.');

  const stageKeys = new Set<string>();
  for (const s of snap.stages) {
    stats.stages++;
    if (s.needsConfirmation) stats.needsConfirmation++;
    if (stageKeys.has(s.key)) err(s.name, `Duplicate stage key "${s.key}".`);
    stageKeys.add(s.key);
    if (!KEY_RE.test(s.key)) err(s.name, `Stage key "${s.key}" must start with a letter and contain only letters, digits and _.`);
    if (s.active && s.subStages.filter((x) => x.active).length === 0) warn(s.name, 'Stage has no active sub-stages.');
    const subKeys = new Set<string>();
    for (const ss of s.subStages) {
      stats.subStages++;
      if (ss.needsConfirmation) stats.needsConfirmation++;
      const p = `${s.name} › ${ss.name}`;
      refs.add(subRef(s.key, ss.key));
      if (subKeys.has(ss.key)) err(p, `Duplicate sub-stage key "${ss.key}" within stage.`);
      subKeys.add(ss.key);
      if (ss.primaryRoleCode && roleSet.size && !roleSet.has(ss.primaryRoleCode))
        warn(p, `Primary role "${ss.primaryRoleCode}" is not a defined role.`);
      const modKeys = new Set<string>();
      for (const m of ss.modules) {
        stats.modules++;
        if (m.needsConfirmation) stats.needsConfirmation++;
        if (modKeys.has(m.key)) err(p, `Duplicate module key "${m.key}".`);
        modKeys.add(m.key);
      }
      const fieldKeys = new Set(ss.fields.map((f) => f.key));
      const seen = new Set<string>();
      for (const f of ss.fields) {
        stats.fields++;
        if (f.needsConfirmation) stats.needsConfirmation++;
        const fp = `${p} › ${f.label}`;
        if (seen.has(f.key)) err(fp, `Duplicate field key "${f.key}" in this sub-stage.`);
        seen.add(f.key);
        if (!KEY_RE.test(f.key)) err(fp, `Field key "${f.key}" must start with a letter and contain only letters, digits and _.`);
        if (!FIELD_TYPE_CODES.includes(f.type)) err(fp, `Unknown field type "${f.type}".`);
        if (!f.active) continue;
        if (OPTION_TYPES.includes(f.type) && f.options.filter((o) => o.active).length === 0)
          (f.needsConfirmation ? warn : err)(fp, 'Option-based field has no active options.');
        const optVals = f.options.map((o) => o.value);
        if (new Set(optVals).size !== optVals.length) err(fp, 'Dropdown has duplicate option values.');
        if (f.minValue != null && f.maxValue != null && f.minValue > f.maxValue) err(fp, 'Minimum value is greater than maximum value.');
        if (f.minLength != null && f.maxLength != null && f.minLength > f.maxLength) err(fp, 'Minimum length is greater than maximum length.');
        if (f.pattern) {
          try {
            new RegExp(f.pattern);
          } catch {
            err(fp, `Invalid validation pattern: ${f.pattern}`);
          }
        }
        if (f.type === 'CALCULATED') {
          if (!f.formula) err(fp, 'Calculated field has no formula.');
          else
            formulaReferences(f.formula)
              .filter((r) => !fieldKeys.has(r))
              .forEach((r) => err(fp, `Formula references unknown field "${r}".`));
        }
        if (f.requirement === 'CONDITIONAL' && !f.rules.some((r) => r.ruleType === 'REQUIRED' && r.active))
          err(fp, 'Conditionally mandatory field has no "required when" rule.');
        for (const r of f.rules) {
          const conds = (Array.isArray(r.conditions) ? r.conditions : []) as { fieldKey?: string; operator?: string }[];
          if (r.active && conds.length === 0) warn(fp, `${r.ruleType} rule has no conditions.`);
          for (const c of conds) {
            if (!c.fieldKey || !fieldKeys.has(c.fieldKey)) err(fp, `Rule refers to unknown field "${c.fieldKey ?? ''}".`);
            if (!c.operator || !OPERATOR_CODES.includes(c.operator)) err(fp, `Rule uses unknown operator "${c.operator ?? ''}".`);
          }
        }
        for (const rc of [...f.visibleRoleCodes, ...f.editableRoleCodes])
          if (roleSet.size && !roleSet.has(rc)) warn(fp, `Role "${rc}" is not a defined role.`);
      }
    }
  }
  for (const d of snap.documents) {
    if (d.needsConfirmation) stats.needsConfirmation++;
    if (d.subStageRef && !refs.has(d.subStageRef)) err(`Document ${d.name}`, `Linked sub-stage ${d.subStageRef} does not exist.`);
    if (d.maxCount != null && d.minCount > d.maxCount) err(`Document ${d.name}`, 'Minimum count exceeds maximum count.');
  }
  for (const t of snap.transitions) {
    if (t.needsConfirmation) stats.needsConfirmation++;
    const tp = `Workflow ${t.fromRef} → ${t.actionLabel}`;
    if (!refs.has(t.fromRef)) err(tp, 'Source sub-stage does not exist.');
    if (t.toRef && !refs.has(t.toRef)) err(tp, 'Destination sub-stage does not exist.');
    if (!t.toRef && !t.isTerminal && t.outcome !== 'QUERY' && t.outcome !== 'HOLD')
      warn(tp, 'Transition has no destination and is not marked terminal.');
    if (t.allowedRoleCodes.length === 0) warn(tp, 'No roles are allowed to perform this action.');
  }
  if (stats.needsConfirmation > 0)
    warnings.push({ severity: 'warning', path: 'configuration', message: `${stats.needsConfirmation} item(s) are marked "requires confirmation" against the source material.` });
  return { valid: errors.length === 0, errors, warnings, stats };
}
