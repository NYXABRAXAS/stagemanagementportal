/**
 * Shared rule engine — used by the API (server-side preview validation and
 * configuration checks) and by the React preview renderer, so both sides apply
 * exactly the same visibility / requiredness / validation semantics.
 *
 * No eval(): calculated-field formulas are parsed by a small arithmetic parser.
 */

export const FIELD_TYPES = [
  { code: 'TEXT', label: 'Text' },
  { code: 'TEXTAREA', label: 'Text Area' },
  { code: 'INTEGER', label: 'Integer' },
  { code: 'DECIMAL', label: 'Decimal' },
  { code: 'CURRENCY', label: 'Currency / Amount' },
  { code: 'DATE', label: 'Date' },
  { code: 'DATETIME', label: 'Date and Time' },
  { code: 'DROPDOWN', label: 'Dropdown' },
  { code: 'MULTISELECT', label: 'Multi-select' },
  { code: 'RADIO', label: 'Radio Button' },
  { code: 'CHECKBOX', label: 'Checkbox' },
  { code: 'YESNO', label: 'Yes / No' },
  { code: 'FILE', label: 'File Upload' },
  { code: 'IMAGE', label: 'Image Capture' },
  { code: 'READONLY', label: 'Read-only / System-generated' },
  { code: 'CALCULATED', label: 'Calculated Field' },
] as const;

export type FieldType = (typeof FIELD_TYPES)[number]['code'];
export const FIELD_TYPE_CODES = FIELD_TYPES.map((t) => t.code) as string[];
export const OPTION_TYPES = ['DROPDOWN', 'MULTISELECT', 'RADIO'];
export const NUMERIC_TYPES = ['INTEGER', 'DECIMAL', 'CURRENCY'];
export const TEXT_TYPES = ['TEXT', 'TEXTAREA'];
export const DATE_TYPES = ['DATE', 'DATETIME'];
export const SYSTEM_TYPES = ['READONLY', 'CALCULATED'];

export const REQUIREMENTS = ['MANDATORY', 'OPTIONAL', 'CONDITIONAL'] as const;

export const OPERATORS = [
  { code: 'EQUALS', label: 'equals' },
  { code: 'NOT_EQUALS', label: 'does not equal' },
  { code: 'IN', label: 'is one of' },
  { code: 'NOT_IN', label: 'is not one of' },
  { code: 'IS_EMPTY', label: 'is empty' },
  { code: 'IS_NOT_EMPTY', label: 'is not empty' },
  { code: 'GREATER_THAN', label: 'is greater than' },
  { code: 'LESS_THAN', label: 'is less than' },
  { code: 'GREATER_OR_EQUAL', label: 'is ≥' },
  { code: 'LESS_OR_EQUAL', label: 'is ≤' },
  { code: 'CONTAINS', label: 'contains' },
] as const;
export const OPERATOR_CODES = OPERATORS.map((o) => o.code) as string[];

export interface RuleCondition {
  fieldKey: string;
  operator: string;
  value?: string | string[] | number | boolean | null;
}

export interface RuleLike {
  ruleType: string; // VISIBILITY | REQUIRED | VALIDATION
  logic?: string; // ALL | ANY
  conditions: RuleCondition[];
  message?: string | null;
  active?: boolean;
}

export interface OptionLike {
  value: string;
  label: string;
  active?: boolean;
}

export interface FieldLike {
  key: string;
  label: string;
  type: string;
  requirement: string;
  readOnly?: boolean;
  active?: boolean;
  minValue?: number | null;
  maxValue?: number | null;
  minLength?: number | null;
  maxLength?: number | null;
  pattern?: string | null;
  patternMessage?: string | null;
  dateMin?: string | null;
  dateMax?: string | null;
  formula?: string | null;
  schemeCodes?: string[];
  visibleRoleCodes?: string[];
  editableRoleCodes?: string[];
  options?: OptionLike[];
  rules?: RuleLike[];
}

export type Values = Record<string, unknown>;

export function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (v === undefined || v === null) return [];
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function norm(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return v === undefined || v === null ? '' : String(v).trim().toLowerCase();
}

export function evaluateCondition(c: RuleCondition, values: Values): boolean {
  const actual = values[c.fieldKey];
  switch (c.operator) {
    case 'EQUALS':
      if (Array.isArray(actual)) return actual.map(norm).includes(norm(c.value));
      return norm(actual) === norm(c.value);
    case 'NOT_EQUALS':
      if (Array.isArray(actual)) return !actual.map(norm).includes(norm(c.value));
      return norm(actual) !== norm(c.value);
    case 'IN': {
      const list = asList(c.value).map(norm);
      if (Array.isArray(actual)) return actual.some((a) => list.includes(norm(a)));
      return list.includes(norm(actual));
    }
    case 'NOT_IN': {
      const list = asList(c.value).map(norm);
      if (Array.isArray(actual)) return !actual.some((a) => list.includes(norm(a)));
      return !list.includes(norm(actual));
    }
    case 'IS_EMPTY':
      return isEmpty(actual);
    case 'IS_NOT_EMPTY':
      return !isEmpty(actual);
    case 'CONTAINS':
      if (Array.isArray(actual)) return actual.map(norm).includes(norm(c.value));
      return norm(actual).includes(norm(c.value));
    case 'GREATER_THAN':
    case 'LESS_THAN':
    case 'GREATER_OR_EQUAL':
    case 'LESS_OR_EQUAL': {
      if (isEmpty(actual)) return false;
      const a = Number(actual);
      const b = Number(c.value);
      if (Number.isNaN(a) || Number.isNaN(b)) return false;
      if (c.operator === 'GREATER_THAN') return a > b;
      if (c.operator === 'LESS_THAN') return a < b;
      if (c.operator === 'GREATER_OR_EQUAL') return a >= b;
      return a <= b;
    }
    default:
      return false;
  }
}

export function evaluateRule(rule: RuleLike, values: Values): boolean {
  const conds = rule.conditions ?? [];
  if (conds.length === 0) return true;
  return (rule.logic ?? 'ALL') === 'ANY'
    ? conds.some((c) => evaluateCondition(c, values))
    : conds.every((c) => evaluateCondition(c, values));
}

function activeRules(field: FieldLike, type: string): RuleLike[] {
  return (field.rules ?? []).filter((r) => r.ruleType === type && r.active !== false);
}

export interface Context {
  roleCode?: string | null;
  schemeCode?: string | null;
}

/** Field applies to the selected scheme (empty list = all schemes). */
export function appliesToScheme(field: FieldLike, ctx: Context): boolean {
  const list = field.schemeCodes ?? [];
  if (!ctx.schemeCode || list.length === 0) return true;
  return list.includes(ctx.schemeCode);
}

/** Visible to the selected role (empty list = all roles). */
export function visibleToRole(field: FieldLike, ctx: Context): boolean {
  const list = field.visibleRoleCodes ?? [];
  if (!ctx.roleCode || list.length === 0) return true;
  return list.includes(ctx.roleCode);
}

export function isVisible(field: FieldLike, values: Values, ctx: Context = {}): boolean {
  if (field.active === false) return false;
  if (!appliesToScheme(field, ctx) || !visibleToRole(field, ctx)) return false;
  return activeRules(field, 'VISIBILITY').every((r) => evaluateRule(r, values));
}

export function isEditable(field: FieldLike, ctx: Context = {}): boolean {
  if (field.readOnly || SYSTEM_TYPES.includes(field.type)) return false;
  const list = field.editableRoleCodes ?? [];
  if (!ctx.roleCode || list.length === 0) return true;
  return list.includes(ctx.roleCode);
}

export function isRequired(field: FieldLike, values: Values): boolean {
  if (SYSTEM_TYPES.includes(field.type)) return false;
  if (field.requirement === 'MANDATORY') return true;
  if (field.requirement === 'CONDITIONAL') {
    const rules = activeRules(field, 'REQUIRED');
    return rules.length > 0 && rules.some((r) => evaluateRule(r, values));
  }
  return false;
}

/** Resolves relative date tokens: today, today+30d, today-18y, or ISO yyyy-mm-dd. */
export function resolveDateToken(token: string, now: Date = new Date()): Date | null {
  const t = token.trim().toLowerCase();
  const m = /^today(?:\s*([+-])\s*(\d+)\s*([dmy]))?$/.exec(t);
  if (m) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (m[1]) {
      const n = Number(m[2]) * (m[1] === '-' ? -1 : 1);
      if (m[3] === 'd') d.setDate(d.getDate() + n);
      if (m[3] === 'm') d.setMonth(d.getMonth() + n);
      if (m[3] === 'y') d.setFullYear(d.getFullYear() + n);
    }
    return d;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  return null;
}

function parseDateValue(v: unknown): Date | null {
  if (v instanceof Date) return v;
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = /^(\d{2})-(\d{2})-(\d{4})/.exec(s); // DD-MM-YYYY (format used on OPTIM screens)
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return null;
}

/** Validates a single (visible) field value. Returns error messages. */
export function validateFieldValue(field: FieldLike, value: unknown, values: Values): string[] {
  const errors: string[] = [];
  const label = field.label;
  if (isRequired(field, values) && isEmpty(value) && !(field.type === 'CHECKBOX' && value === false)) {
    errors.push(`${label} is required.`);
    return errors;
  }
  if (field.type === 'CHECKBOX' && isRequired(field, values) && value !== true) {
    errors.push(`${label} must be checked.`);
    return errors;
  }
  if (isEmpty(value) || SYSTEM_TYPES.includes(field.type)) return errors;

  if (NUMERIC_TYPES.includes(field.type)) {
    const n = Number(String(value).replace(/,/g, ''));
    if (Number.isNaN(n)) errors.push(`${label} must be a number.`);
    else {
      if (field.type === 'INTEGER' && !Number.isInteger(n)) errors.push(`${label} must be a whole number.`);
      if (field.minValue != null && n < field.minValue) errors.push(`${label} must be at least ${field.minValue}.`);
      if (field.maxValue != null && n > field.maxValue) errors.push(`${label} must not exceed ${field.maxValue}.`);
    }
  }
  if (TEXT_TYPES.includes(field.type) || field.type === 'INTEGER') {
    const s = String(value);
    if (field.minLength != null && s.length < field.minLength)
      errors.push(`${label} must be at least ${field.minLength} characters.`);
    if (field.maxLength != null && s.length > field.maxLength)
      errors.push(`${label} must be at most ${field.maxLength} characters.`);
  }
  if (field.pattern && typeof value !== 'object') {
    try {
      if (!new RegExp(field.pattern).test(String(value)))
        errors.push(field.patternMessage || `${label} is not in the expected format.`);
    } catch {
      errors.push(`${label} has an invalid pattern configured.`);
    }
  }
  if (DATE_TYPES.includes(field.type)) {
    const d = parseDateValue(value);
    if (!d || Number.isNaN(d.getTime())) errors.push(`${label} must be a valid date.`);
    else {
      const min = field.dateMin ? resolveDateToken(field.dateMin) : null;
      const max = field.dateMax ? resolveDateToken(field.dateMax) : null;
      if (min && d < min) errors.push(`${label} must be on or after ${fmt(min)}.`);
      if (max && d > max) errors.push(`${label} must be on or before ${fmt(max)}.`);
    }
  }
  if (OPTION_TYPES.includes(field.type) && (field.options ?? []).length > 0) {
    const allowed = (field.options ?? []).filter((o) => o.active !== false).map((o) => o.value);
    const chosen = Array.isArray(value) ? value.map(String) : [String(value)];
    if (chosen.some((c) => !allowed.includes(c))) errors.push(`${label} has a value that is not in the list.`);
  }
  for (const r of activeRules(field, 'VALIDATION')) {
    if (!evaluateRule(r, values)) errors.push(r.message || `${label} failed a validation rule.`);
  }
  return errors;
}

function fmt(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

export interface FormValidationResult {
  valid: boolean;
  errors: Record<string, string[]>;
  visibleKeys: string[];
  requiredKeys: string[];
}

export function validateForm(fields: FieldLike[], values: Values, ctx: Context = {}): FormValidationResult {
  const computed = applyCalculations(fields, values);
  const errors: Record<string, string[]> = {};
  const visibleKeys: string[] = [];
  const requiredKeys: string[] = [];
  for (const f of fields) {
    if (!isVisible(f, computed, ctx)) continue;
    visibleKeys.push(f.key);
    if (isRequired(f, computed)) requiredKeys.push(f.key);
    if (!isEditable(f, ctx) && !SYSTEM_TYPES.includes(f.type)) continue;
    const e = validateFieldValue(f, computed[f.key], computed);
    if (e.length) errors[f.key] = e;
  }
  return { valid: Object.keys(errors).length === 0, errors, visibleKeys, requiredKeys };
}

// ───────────────────── Calculated fields (safe arithmetic) ─────────────────────

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      out.push({ t: 'num', v: Number(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ t: 'id', v: src.slice(i, j) });
      i = j;
      continue;
    }
    if ('+-*/()'.includes(ch)) {
      out.push({ t: 'op', v: ch });
      i++;
      continue;
    }
    throw new Error(`Unexpected character "${ch}" in formula`);
  }
  return out;
}

/** Evaluates "a + b * (c - 2)" using field keys as variables. Throws on syntax errors. */
export function evaluateFormula(formula: string, values: Values): number {
  const toks = tokenize(formula);
  let p = 0;
  const peek = () => toks[p];
  const num = (k: string) => {
    const raw = values[k];
    const n = Number(String(raw ?? '').replace(/,/g, ''));
    return Number.isNaN(n) ? 0 : n;
  };
  function primary(): number {
    const t = toks[p++];
    if (!t) throw new Error('Unexpected end of formula');
    if (t.t === 'num') return t.v;
    if (t.t === 'id') return num(t.v);
    if (t.v === '(') {
      const v = expr();
      if (toks[p]?.v !== ')') throw new Error('Missing ")" in formula');
      p++;
      return v;
    }
    if (t.v === '-') return -primary();
    throw new Error(`Unexpected "${t.v}" in formula`);
  }
  function term(): number {
    let v = primary();
    while (peek() && (peek().v === '*' || peek().v === '/')) {
      const op = toks[p++].v;
      const r = primary();
      v = op === '*' ? v * r : r === 0 ? 0 : v / r;
    }
    return v;
  }
  function expr(): number {
    let v = term();
    while (peek() && (peek().v === '+' || peek().v === '-')) {
      const op = toks[p++].v;
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  const result = expr();
  if (p !== toks.length) throw new Error('Unexpected trailing tokens in formula');
  return Math.round(result * 100) / 100;
}

export function formulaReferences(formula: string): string[] {
  try {
    return tokenize(formula)
      .filter((t): t is { t: 'id'; v: string } => t.t === 'id')
      .map((t) => t.v);
  } catch {
    return [];
  }
}

/** Returns a copy of values with CALCULATED fields filled in. */
export function applyCalculations(fields: FieldLike[], values: Values): Values {
  const out: Values = { ...values };
  // two passes so a calculated field may depend on another calculated field
  for (let pass = 0; pass < 2; pass++) {
    for (const f of fields) {
      if (f.type === 'CALCULATED' && f.formula) {
        try {
          out[f.key] = evaluateFormula(f.formula, out);
        } catch {
          out[f.key] = null;
        }
      }
    }
  }
  return out;
}
