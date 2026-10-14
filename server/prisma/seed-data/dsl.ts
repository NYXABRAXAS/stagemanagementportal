/**
 * Small DSL for writing the source-derived seed configurations compactly.
 * Converts to the same portable Snapshot format the API uses for clone/copy,
 * so seeding goes through exactly the same import code path as the portal.
 */
import type { Snapshot, SnapDocument, SnapField, SnapStage, SnapSubStage, SnapTransition } from '../../src/lib/snapshot';

export type Req = 'M' | 'O' | 'C';
export interface Cond {
  fieldKey: string;
  operator: string;
  value?: string | string[] | number | boolean | null;
}

export interface FOpts {
  key?: string;
  req?: Req;
  opts?: string[];
  ro?: boolean;
  help?: string;
  ph?: string;
  formula?: string;
  min?: number;
  max?: number;
  minLen?: number;
  maxLen?: number;
  pattern?: string;
  patternMsg?: string;
  format?: string;
  dateMin?: string;
  dateMax?: string;
  nc?: boolean;
  src?: string;
  notes?: string;
  sensitive?: boolean;
  mask?: string;
  map?: string;
  vis?: Cond[];
  reqWhen?: Cond[];
  schemes?: string[];
}

export interface FieldSpec extends FOpts {
  type: string;
  label: string;
}

export interface ModuleSpec {
  key: string;
  name: string;
  repeatable?: boolean;
  nc?: boolean;
  src?: string;
  desc?: string;
  vis?: Cond[];
  fields: FieldSpec[];
}

export interface SubSpec {
  key: string;
  name: string;
  platform: 'MOBILE' | 'WEB' | 'SYSTEM' | 'WEB / AGENCY';
  role?: string;
  src: string;
  nc?: boolean;
  desc?: string;
  modules?: ModuleSpec[];
  fields?: FieldSpec[];
}

export interface StageSpec {
  key: string;
  name: string;
  platform?: string;
  desc?: string;
  src?: string;
  nc?: boolean;
  subs: SubSpec[];
}

export interface DocSpec {
  sub: string; // stageKey/subKey
  code: string;
  name: string;
  category?: string;
  req?: 'MANDATORY' | 'OPTIONAL' | 'CONDITIONAL';
  capture?: 'CAMERA' | 'UPLOAD' | 'CAMERA_OR_UPLOAD' | 'SYSTEM_GENERATED';
  validatedBy?: string[];
  nc?: boolean;
  src: string;
  notes?: string;
  schemes?: string[];
}

export interface TransSpec {
  from: string;
  to?: string | null;
  code: string;
  label: string;
  outcome: 'SUBMIT' | 'APPROVE' | 'REJECT' | 'RETURN' | 'QUERY' | 'HOLD' | 'AUTO';
  status?: string;
  roles: string[];
  remarks?: boolean;
  allMandatory?: boolean;
  fields?: string[];
  docs?: string[];
  conds?: Cond[];
  logic?: 'ALL' | 'ANY';
  exception?: string;
  terminal?: boolean;
  nc?: boolean;
  src: string;
}

export function toKey(label: string) {
  const parts = label
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const k = parts.map((p, i) => (i === 0 ? p.toLowerCase() : p[0].toUpperCase() + p.slice(1).toLowerCase())).join('');
  return /^[A-Za-z]/.test(k) ? k : `f${k}`;
}

const mk = (type: string) => (label: string, o: FOpts = {}): FieldSpec => ({ type, label, ...o });
export const text = mk('TEXT');
export const area = mk('TEXTAREA');
export const int = mk('INTEGER');
export const dec = mk('DECIMAL');
export const cur = mk('CURRENCY');
export const date = (label: string, o: FOpts = {}) => mk('DATE')(label, { format: 'DD-MM-YYYY', ...o });
export const dd = (label: string, opts: string[] = [], o: FOpts = {}) => mk('DROPDOWN')(label, { opts, nc: o.nc ?? opts.length === 0, ...o });
export const radio = (label: string, opts: string[], o: FOpts = {}) => mk('RADIO')(label, { opts, ...o });
export const yn = mk('YESNO');
export const check = mk('CHECKBOX');
export const file = mk('FILE');
export const image = mk('IMAGE');
export const ro = (label: string, o: FOpts = {}) => mk('READONLY')(label, { ro: true, ...o });
export const calc = (label: string, formula: string, o: FOpts = {}) => mk('CALCULATED')(label, { formula, ro: true, ...o });
export const eq = (fieldKey: string, value: string | boolean): Cond => ({ fieldKey, operator: 'EQUALS', value });
export const neq = (fieldKey: string, value: string | boolean): Cond => ({ fieldKey, operator: 'NOT_EQUALS', value });

const REQ = { M: 'MANDATORY', O: 'OPTIONAL', C: 'CONDITIONAL' } as const;

function toSnapField(f: FieldSpec, seq: number, moduleKey: string | null, moduleVis: Cond[] | undefined): SnapField {
  const rules: SnapField['rules'] = [];
  const vis = [...(moduleVis ?? []), ...(f.vis ?? [])];
  if (vis.length) rules.push({ ruleType: 'VISIBILITY', logic: 'ALL', conditions: vis, expression: null, message: null, active: true });
  if (f.reqWhen?.length) rules.push({ ruleType: 'REQUIRED', logic: 'ALL', conditions: f.reqWhen, expression: null, message: null, active: true });
  return {
    key: f.key ?? toKey(f.label),
    moduleKey,
    label: f.label,
    type: f.type,
    helpText: f.help ?? null,
    placeholder: f.ph ?? null,
    requirement: f.reqWhen?.length ? 'CONDITIONAL' : REQ[f.req ?? 'O'],
    defaultValue: null,
    minValue: f.min ?? null,
    maxValue: f.max ?? null,
    minLength: f.minLen ?? null,
    maxLength: f.maxLen ?? null,
    pattern: f.pattern ?? null,
    patternMessage: f.patternMsg ?? null,
    format: f.format ?? null,
    dateMin: f.dateMin ?? null,
    dateMax: f.dateMax ?? null,
    readOnly: !!f.ro,
    formula: f.formula ?? null,
    sequence: seq,
    active: true,
    sensitive: !!f.sensitive,
    maskingRule: f.mask ?? null,
    dataMapping: f.map ?? null,
    schemeCodes: f.schemes ?? [],
    visibleRoleCodes: [],
    editableRoleCodes: [],
    needsConfirmation: !!f.nc,
    sourceRef: f.src ?? null,
    notes: f.notes ?? null,
    options: (f.opts ?? []).map((o, i) => ({ value: o, label: o, sequence: (i + 1) * 10, active: true })),
    rules,
  };
}

export function buildSub(s: SubSpec, seq: number): SnapSubStage {
  const fields: SnapField[] = [];
  let n = 0;
  for (const f of s.fields ?? []) fields.push(toSnapField(f, (++n) * 10, null, undefined));
  for (const m of s.modules ?? []) for (const f of m.fields) fields.push(toSnapField(f, (++n) * 10, m.key, m.vis));
  const seen = new Set<string>();
  for (const f of fields) {
    if (seen.has(f.key)) throw new Error(`Seed error: duplicate field key "${f.key}" in sub-stage ${s.key}`);
    seen.add(f.key);
  }
  return {
    key: s.key,
    name: s.name,
    description: s.desc ?? null,
    platform: s.platform,
    primaryRoleCode: s.role ?? null,
    sequence: seq,
    active: true,
    needsConfirmation: !!s.nc,
    sourceRef: s.src,
    modules: (s.modules ?? []).map((m, i) => ({
      key: m.key, name: m.name, description: m.desc ?? null, repeatable: !!m.repeatable, sequence: (i + 1) * 10,
      active: true, needsConfirmation: !!m.nc, sourceRef: m.src ?? null,
    })),
    fields,
  };
}

export function buildSnapshot(stages: StageSpec[], docs: DocSpec[], trans: TransSpec[]): Snapshot {
  const snapStages: SnapStage[] = stages.map((st, i) => ({
    key: st.key, name: st.name, description: st.desc ?? null, platform: st.platform ?? null, sequence: (i + 1) * 10,
    active: true, needsConfirmation: !!st.nc, sourceRef: st.src ?? null,
    subStages: st.subs.map((s, j) => buildSub(s, (j + 1) * 10)),
  }));
  const refs = new Set(snapStages.flatMap((s) => s.subStages.map((ss) => `${s.key}/${ss.key}`)));
  const documents: SnapDocument[] = docs.map((d, i) => {
    if (!refs.has(d.sub)) throw new Error(`Seed error: document ${d.code} refers to unknown sub-stage ${d.sub}`);
    return {
      subStageRef: d.sub, code: d.code, name: d.name, category: d.category ?? null, requirement: d.req ?? 'MANDATORY',
      captureMode: d.capture ?? 'CAMERA_OR_UPLOAD', allowedTypes: d.capture === 'SYSTEM_GENERATED' ? 'pdf' : 'jpg,jpeg,png,pdf',
      maxSizeMb: null, minCount: d.req === 'OPTIONAL' ? 0 : 1, maxCount: null, schemeCodes: d.schemes ?? [],
      validatedByRoleCodes: d.validatedBy ?? [], sequence: (i + 1) * 10, active: true, needsConfirmation: !!d.nc,
      sourceRef: d.src, notes: d.notes ?? null,
    };
  });
  const seqByFrom = new Map<string, number>();
  const transitions: SnapTransition[] = trans.map((t) => {
    if (!refs.has(t.from)) throw new Error(`Seed error: transition ${t.code} from unknown ${t.from}`);
    if (t.to && !refs.has(t.to)) throw new Error(`Seed error: transition ${t.code} to unknown ${t.to}`);
    const seq = (seqByFrom.get(t.from) ?? 0) + 10;
    seqByFrom.set(t.from, seq);
    return {
      fromRef: t.from, toRef: t.to ?? null, actionCode: t.code, actionLabel: t.label, outcome: t.outcome,
      resultingStatus: t.status ?? null, conditionLogic: t.logic ?? 'ALL', conditions: t.conds ?? [],
      allowedRoleCodes: t.roles, remarksRequired: !!t.remarks, requireAllMandatoryFields: !!t.allMandatory,
      requiredFieldKeys: t.fields ?? [], requiredDocCodes: t.docs ?? [], exceptionHandling: t.exception ?? null,
      isTerminal: !!t.terminal, sequence: seq, active: true, needsConfirmation: !!t.nc, sourceRef: t.src,
    };
  });
  return { stages: snapStages, documents, transitions };
}
