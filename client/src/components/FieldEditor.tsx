import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { FIELD_TYPES, OPERATORS, OPTION_TYPES, NUMERIC_TYPES, TEXT_TYPES, DATE_TYPES, formulaReferences } from '../../../shared/src/ruleEngine';
import type { Condition, Field, Module, Option, Role, Rule, Scheme } from '../lib/types';
import { Banner, Check, Labeled, NcBadge } from './ui';

export type FieldDraft = Omit<Field, 'id' | 'subStageId' | 'sequence'> & { id?: string };

export function blankField(moduleId: string | null = null): FieldDraft {
  return {
    moduleId, key: '', label: '', type: 'TEXT', helpText: null, placeholder: null, requirement: 'OPTIONAL', defaultValue: null,
    minValue: null, maxValue: null, minLength: null, maxLength: null, pattern: null, patternMessage: null, format: null,
    dateMin: null, dateMax: null, readOnly: false, formula: null, active: true, sensitive: false, maskingRule: null, dataMapping: null,
    schemeCodes: [], visibleRoleCodes: [], editableRoleCodes: [], needsConfirmation: false, sourceRef: null, notes: null, options: [], rules: [],
  };
}

const MASKS = ['', 'MASK_ALL', 'MASK_ALL_BUT_LAST_4', 'SHOW_LAST_4', 'MASK_MIDDLE'];
const num = (v: string) => (v === '' ? null : Number(v));
const str = (v: string) => (v === '' ? null : v);

function ConditionEditor({ conditions, onChange, fieldKeys, disabled }: { conditions: Condition[]; onChange: (c: Condition[]) => void; fieldKeys: { key: string; label: string; options: Option[] }[]; disabled?: boolean }) {
  return (
    <div className="stack">
      {conditions.map((c, i) => {
        const target = fieldKeys.find((f) => f.key === c.fieldKey);
        const noValue = c.operator === 'IS_EMPTY' || c.operator === 'IS_NOT_EMPTY';
        return (
          <div className="row" key={i}>
            <select className="inp" value={c.fieldKey} disabled={disabled} onChange={(e) => onChange(conditions.map((x, j) => (j === i ? { ...x, fieldKey: e.target.value } : x)))} aria-label="Condition field">
              <option value="">— field —</option>
              {fieldKeys.map((f) => <option key={f.key} value={f.key}>{f.label} ({f.key})</option>)}
            </select>
            <select className="inp" style={{ width: 170 }} value={c.operator} disabled={disabled} onChange={(e) => onChange(conditions.map((x, j) => (j === i ? { ...x, operator: e.target.value } : x)))} aria-label="Operator">
              {OPERATORS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
            </select>
            {!noValue && (target && target.options.length > 0 && !['IN', 'NOT_IN'].includes(c.operator) ? (
              <select className="inp" value={String(c.value ?? '')} disabled={disabled} onChange={(e) => onChange(conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} aria-label="Value">
                <option value="">— value —</option>
                {target.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input className="inp" placeholder={['IN', 'NOT_IN'].includes(c.operator) ? 'comma-separated values' : 'value (true/false for checkbox)'} value={Array.isArray(c.value) ? c.value.join(', ') : String(c.value ?? '')} disabled={disabled}
                onChange={(e) => onChange(conditions.map((x, j) => (j === i ? { ...x, value: ['IN', 'NOT_IN'].includes(c.operator) ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean) : e.target.value } : x)))} aria-label="Value" />
            ))}
            <button className="btn icon danger" disabled={disabled} onClick={() => onChange(conditions.filter((_, j) => j !== i))} title="Remove condition"><Trash2 size={14} /></button>
          </div>
        );
      })}
      <div><button className="btn sm" disabled={disabled} onClick={() => onChange([...conditions, { fieldKey: '', operator: 'EQUALS', value: '' }])}><Plus size={13} /> Add condition</button></div>
    </div>
  );
}

function RuleBlock({ title, help, rule, onChange, fieldKeys, disabled, withMessage }: { title: string; help: string; rule: Rule | undefined; onChange: (r: Rule | undefined) => void; fieldKeys: { key: string; label: string; options: Option[] }[]; disabled?: boolean; withMessage?: boolean }) {
  const r = rule;
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="row between">
        <div><h3>{title}</h3><div className="help">{help}</div></div>
        {!r ? (
          <button className="btn sm" disabled={disabled} onClick={() => onChange({ ruleType: 'VISIBILITY', logic: 'ALL', conditions: [{ fieldKey: '', operator: 'EQUALS', value: '' }], active: true })}><Plus size={13} /> Add rule</button>
        ) : (
          <div className="row">
            <span className="small muted">Match</span>
            <select className="inp" style={{ width: 90 }} value={r.logic} disabled={disabled} onChange={(e) => onChange({ ...r, logic: e.target.value as 'ALL' | 'ANY' })} aria-label="Match logic">
              <option value="ALL">ALL</option><option value="ANY">ANY</option>
            </select>
            <button className="btn sm danger" disabled={disabled} onClick={() => onChange(undefined)}>Remove rule</button>
          </div>
        )}
      </div>
      {r && (
        <div style={{ marginTop: 10 }} className="stack">
          <ConditionEditor conditions={r.conditions} onChange={(c) => onChange({ ...r, conditions: c })} fieldKeys={fieldKeys} disabled={disabled} />
          {withMessage && <input className="inp" placeholder="Error message shown when the rule fails" value={r.message ?? ''} disabled={disabled} onChange={(e) => onChange({ ...r, message: e.target.value })} />}
        </div>
      )}
    </div>
  );
}

const TABS = ['Basics', 'Validation', 'Options', 'Conditions', 'Access & Data', 'Source'] as const;

export default function FieldEditor({ value, onChange, modules, siblings, schemes, roles, readOnly }: {
  value: FieldDraft;
  onChange: (f: FieldDraft) => void;
  modules: Module[];
  siblings: Field[];
  schemes: Scheme[];
  roles: Role[];
  readOnly?: boolean;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Basics');
  const f = value;
  const set = <K extends keyof FieldDraft>(k: K, v: FieldDraft[K]) => onChange({ ...f, [k]: v });
  useEffect(() => setTab('Basics'), [f.id]);

  const otherFields = useMemo(() => siblings.filter((s) => s.id !== f.id).map((s) => ({ key: s.key, label: s.label, options: s.options })), [siblings, f.id]);
  const ruleOf = (t: Rule['ruleType']) => f.rules.find((r) => r.ruleType === t);
  const setRule = (t: Rule['ruleType'], r: Rule | undefined) => onChange({ ...f, rules: [...f.rules.filter((x) => x.ruleType !== t), ...(r ? [{ ...r, ruleType: t }] : [])] });
  const isOption = OPTION_TYPES.includes(f.type);
  const unknownRefs = f.type === 'CALCULATED' && f.formula ? formulaReferences(f.formula).filter((k) => !siblings.some((s) => s.key === k)) : [];
  const losRoles = roles.filter((r) => r.roleType === 'LOS');

  const toggle = (list: string[], code: string) => (list.includes(code) ? list.filter((c) => c !== code) : [...list, code]);

  return (
    <div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)} role="tab" aria-selected={tab === t}>
            {t}
            {t === 'Options' && isOption && <span className="badge" style={{ marginLeft: 6 }}>{f.options.length}</span>}
            {t === 'Conditions' && f.rules.length > 0 && <span className="badge" style={{ marginLeft: 6 }}>{f.rules.length}</span>}
          </button>
        ))}
      </div>
      <fieldset disabled={readOnly} style={{ border: 0, padding: '14px 2px 0', margin: 0 }}>
        {tab === 'Basics' && (
          <div className="form-grid">
            <Labeled label="Display label" required>
              <input className="inp" value={f.label} onChange={(e) => set('label', e.target.value)} data-testid="field-label" />
            </Labeled>
            <Labeled label="Internal field key" help="Unique within the sub-stage. Leave blank to generate from the label.">
              <input className="inp mono" value={f.key} onChange={(e) => set('key', e.target.value.replace(/[^A-Za-z0-9_]/g, ''))} placeholder="e.g. vehicleRegistrationNumber" data-testid="field-key" />
            </Labeled>
            <Labeled label="Field type" required>
              <select className="inp" value={f.type} onChange={(e) => onChange({ ...f, type: e.target.value, readOnly: e.target.value === 'READONLY' || e.target.value === 'CALCULATED' ? true : f.readOnly })} data-testid="field-type">
                {FIELD_TYPES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </Labeled>
            <Labeled label="Section">
              <select className="inp" value={f.moduleId ?? ''} onChange={(e) => set('moduleId', e.target.value || null)} data-testid="field-module">
                <option value="">(no section — directly on the sub-stage)</option>
                {modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Labeled>
            <Labeled label="Requirement" help={f.requirement === 'CONDITIONAL' ? 'Define the "Required when" rule on the Conditions tab.' : undefined}>
              <div className="seg" role="radiogroup">
                {(['MANDATORY', 'OPTIONAL', 'CONDITIONAL'] as const).map((r) => (
                  <button type="button" key={r} className={f.requirement === r ? 'on' : ''} onClick={() => set('requirement', r)} data-testid={`req-${r}`}>
                    {r === 'MANDATORY' ? 'Mandatory' : r === 'OPTIONAL' ? 'Optional' : 'Conditional'}
                  </button>
                ))}
              </div>
            </Labeled>
            <Labeled label="Default value"><input className="inp" value={f.defaultValue ?? ''} onChange={(e) => set('defaultValue', str(e.target.value))} /></Labeled>
            <Labeled label="Placeholder"><input className="inp" value={f.placeholder ?? ''} onChange={(e) => set('placeholder', str(e.target.value))} /></Labeled>
            <Labeled label="Help text"><input className="inp" value={f.helpText ?? ''} onChange={(e) => set('helpText', str(e.target.value))} /></Labeled>
            {f.type === 'CALCULATED' && (
              <Labeled label="Formula" full help="Arithmetic on other field keys, e.g. totalAssetCost - appliedLoanAmount. Operators: + − × ÷ and brackets." error={unknownRefs.length ? `Unknown field key(s): ${unknownRefs.join(', ')}` : null}>
                <input className="inp mono" value={f.formula ?? ''} onChange={(e) => set('formula', str(e.target.value))} data-testid="field-formula" />
              </Labeled>
            )}
            <div className="full row wrap" style={{ gap: 18 }}>
              <Check checked={f.readOnly} onChange={(v) => set('readOnly', v)} label="Read-only (not editable on screen)" />
              <Check checked={f.active} onChange={(v) => set('active', v)} label="Active" />
              <Check checked={f.needsConfirmation} onChange={(v) => set('needsConfirmation', v)} label="Requires confirmation" />
            </div>
          </div>
        )}

        {tab === 'Validation' && (
          <div className="stack-lg">
            {(NUMERIC_TYPES.includes(f.type)) && (
              <div className="form-grid">
                <Labeled label="Minimum value"><input className="inp" type="number" value={f.minValue ?? ''} onChange={(e) => set('minValue', num(e.target.value))} data-testid="field-min" /></Labeled>
                <Labeled label="Maximum value"><input className="inp" type="number" value={f.maxValue ?? ''} onChange={(e) => set('maxValue', num(e.target.value))} data-testid="field-max" /></Labeled>
              </div>
            )}
            {(TEXT_TYPES.includes(f.type) || f.type === 'INTEGER') && (
              <div className="form-grid">
                <Labeled label="Minimum length"><input className="inp" type="number" min={0} value={f.minLength ?? ''} onChange={(e) => set('minLength', num(e.target.value))} /></Labeled>
                <Labeled label="Maximum length"><input className="inp" type="number" min={0} value={f.maxLength ?? ''} onChange={(e) => set('maxLength', num(e.target.value))} /></Labeled>
              </div>
            )}
            {!['CHECKBOX', 'YESNO', 'FILE', 'IMAGE', 'CALCULATED', 'READONLY', ...OPTION_TYPES, ...DATE_TYPES].includes(f.type) && (
              <div className="form-grid">
                <Labeled label="Format / pattern (regular expression)" help="e.g. ^[A-Z]{5}[0-9]{4}[A-Z]$ for PAN">
                  <input className="inp mono" value={f.pattern ?? ''} onChange={(e) => set('pattern', str(e.target.value))} />
                </Labeled>
                <Labeled label="Pattern error message"><input className="inp" value={f.patternMessage ?? ''} onChange={(e) => set('patternMessage', str(e.target.value))} /></Labeled>
              </div>
            )}
            {DATE_TYPES.includes(f.type) && (
              <div className="form-grid-3">
                <Labeled label="Display format"><input className="inp" value={f.format ?? ''} onChange={(e) => set('format', str(e.target.value))} placeholder="DD-MM-YYYY" /></Labeled>
                <Labeled label="Earliest date" help="today, today-18y, today+30d or yyyy-mm-dd"><input className="inp" value={f.dateMin ?? ''} onChange={(e) => set('dateMin', str(e.target.value))} /></Labeled>
                <Labeled label="Latest date" help="e.g. today (no future dates)"><input className="inp" value={f.dateMax ?? ''} onChange={(e) => set('dateMax', str(e.target.value))} /></Labeled>
              </div>
            )}
            <RuleBlock title="Custom validation rule" help="Field is valid only when these conditions hold (cross-field checks)." rule={ruleOf('VALIDATION')} onChange={(r) => setRule('VALIDATION', r)} fieldKeys={otherFields} disabled={readOnly} withMessage />
          </div>
        )}

        {tab === 'Options' && (
          isOption ? <OptionsEditor options={f.options} onChange={(o) => set('options', o)} readOnly={readOnly} /> : <Banner>Options apply to Dropdown, Multi-select and Radio fields. Change the field type on the Basics tab to configure options.</Banner>
        )}

        {tab === 'Conditions' && (
          <div className="stack-lg">
            <RuleBlock title="Show this field only when…" help="Conditional visibility. Example: Customer Type equals Business." rule={ruleOf('VISIBILITY')} onChange={(r) => setRule('VISIBILITY', r)} fieldKeys={otherFields} disabled={readOnly} />
            <RuleBlock title="Required when…" help="Conditional requiredness — used when Requirement is Conditional." rule={ruleOf('REQUIRED')} onChange={(r) => setRule('REQUIRED', r)} fieldKeys={otherFields} disabled={readOnly} />
            {f.requirement === 'CONDITIONAL' && !ruleOf('REQUIRED') && <Banner kind="warn">Requirement is Conditional but no "Required when" rule is defined — publishing will be blocked.</Banner>}
          </div>
        )}

        {tab === 'Access & Data' && (
          <div className="stack-lg">
            <div>
              <label className="lbl">Scheme applicability</label>
              <div className="help" style={{ marginBottom: 6 }}>None selected = applies to all schemes of this product.</div>
              <div className="chips">
                {schemes.length === 0 && <span className="muted small">This product has no schemes configured.</span>}
                {schemes.map((s) => <button type="button" key={s.code} className={`chip ${f.schemeCodes.includes(s.code) ? 'on' : ''}`} onClick={() => set('schemeCodes', toggle(f.schemeCodes, s.code))}>{s.name}</button>)}
              </div>
            </div>
            <div>
              <label className="lbl">Visible to roles</label>
              <div className="help" style={{ marginBottom: 6 }}>None selected = visible to every role.</div>
              <div className="chips">{losRoles.map((r) => <button type="button" key={r.code} className={`chip ${f.visibleRoleCodes.includes(r.code) ? 'on' : ''}`} onClick={() => set('visibleRoleCodes', toggle(f.visibleRoleCodes, r.code))}>{r.name}</button>)}</div>
            </div>
            <div>
              <label className="lbl">Editable by roles</label>
              <div className="help" style={{ marginBottom: 6 }}>None selected = editable by every role that can see it (unless Read-only).</div>
              <div className="chips">{losRoles.map((r) => <button type="button" key={r.code} className={`chip ${f.editableRoleCodes.includes(r.code) ? 'on' : ''}`} onClick={() => set('editableRoleCodes', toggle(f.editableRoleCodes, r.code))}>{r.name}</button>)}</div>
            </div>
            <div className="form-grid">
              <Labeled label="Data mapping" help="Target column / API attribute in the LOS, e.g. applicant.pan"><input className="inp mono" value={f.dataMapping ?? ''} onChange={(e) => set('dataMapping', str(e.target.value))} /></Labeled>
              <div className="stack">
                <Check checked={f.sensitive} onChange={(v) => set('sensitive', v)} label="Sensitive data (PII)" />
                <Labeled label="Masking rule">
                  <select className="inp" value={f.maskingRule ?? ''} onChange={(e) => set('maskingRule', str(e.target.value))} disabled={readOnly || !f.sensitive}>
                    {MASKS.map((m) => <option key={m} value={m}>{m || '(none)'}</option>)}
                  </select>
                </Labeled>
              </div>
            </div>
          </div>
        )}

        {tab === 'Source' && (
          <div className="form-grid">
            <Labeled label="Source reference" full help="Where this field comes from (manual figure / screenshot number)."><input className="inp" value={f.sourceRef ?? ''} onChange={(e) => set('sourceRef', str(e.target.value))} /></Labeled>
            <Labeled label="Notes / open questions" full><textarea className="inp" value={f.notes ?? ''} onChange={(e) => set('notes', str(e.target.value))} /></Labeled>
            <div className="full"><NcBadge show={f.needsConfirmation} /></div>
          </div>
        )}
      </fieldset>
    </div>
  );
}

function OptionsEditor({ options, onChange, readOnly }: { options: Option[]; onChange: (o: Option[]) => void; readOnly?: boolean }) {
  const [bulk, setBulk] = useState('');
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= options.length) return;
    const next = [...options];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const dupes = options.map((o) => o.value).filter((v, i, a) => a.indexOf(v) !== i);
  return (
    <div className="stack-lg">
      {options.length === 0 && <Banner kind="warn">No options yet. Add options below or paste a list.</Banner>}
      <div className="table-wrap">
        <table className="tbl" data-testid="options-table">
          <thead><tr><th style={{ width: 40 }}>#</th><th>Value (stored)</th><th>Label (displayed)</th><th style={{ width: 70 }}>Active</th><th style={{ width: 120 }} /></tr></thead>
          <tbody>
            {options.map((o, i) => (
              <tr key={i}>
                <td className="muted">{i + 1}</td>
                <td><input className={`inp ${dupes.includes(o.value) ? 'invalid' : ''}`} value={o.value} onChange={(e) => onChange(options.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} aria-label={`Option ${i + 1} value`} /></td>
                <td><input className="inp" value={o.label} onChange={(e) => onChange(options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label={`Option ${i + 1} label`} /></td>
                <td><input type="checkbox" checked={o.active} onChange={(e) => onChange(options.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)))} aria-label="Active" /></td>
                <td>
                  <div className="btn-group">
                    <button className="btn icon" onClick={() => move(i, -1)} title="Move up" disabled={readOnly || i === 0}><ArrowUp size={13} /></button>
                    <button className="btn icon" onClick={() => move(i, 1)} title="Move down" disabled={readOnly || i === options.length - 1}><ArrowDown size={13} /></button>
                    <button className="btn icon danger" onClick={() => onChange(options.filter((_, j) => j !== i))} title="Delete option"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dupes.length > 0 && <div className="err">Duplicate values: {[...new Set(dupes)].join(', ')}</div>}
      <div className="row">
        <button className="btn" onClick={() => onChange([...options, { value: '', label: '', active: true }])} data-testid="add-option"><Plus size={13} /> Add option</button>
      </div>
      <div>
        <label className="lbl">Quick add — one option per line</label>
        <div className="row">
          <textarea className="inp" rows={3} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'Individual\nBusiness'} />
          <button className="btn" disabled={!bulk.trim()} onClick={() => {
            const lines = bulk.split('\n').map((l) => l.trim()).filter(Boolean);
            onChange([...options, ...lines.filter((l) => !options.some((o) => o.value === l)).map((l) => ({ value: l, label: l, active: true }))]);
            setBulk('');
          }}>Add lines</button>
        </div>
      </div>
    </div>
  );
}
