import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useRoles, useSelectedProduct, useWorkingVersion } from '../lib/hooks';
import type { Condition, Transition, VersionTree } from '../lib/types';
import ProductBar from '../components/ProductBar';
import { Badge, Banner, Check, Empty, Labeled, Loading, Modal, NcBadge, SearchBox, errMsg, useConfirm, useToast } from '../components/ui';
import { OPERATORS } from '../../../shared/src/ruleEngine';

const OUTCOMES = ['SUBMIT', 'APPROVE', 'REJECT', 'RETURN', 'QUERY', 'HOLD', 'AUTO'];
const OUTCOME_KIND: Record<string, string> = { APPROVE: 'ok', SUBMIT: 'info', AUTO: 'brand', REJECT: 'danger', RETURN: 'warn', QUERY: '', HOLD: '' };

export default function WorkflowPage() {
  const { products, product, select, loading } = useSelectedProduct();
  const { versionId, tree, editable, explicit } = useWorkingVersion(product);
  const confirm = useConfirm();
  const toast = useToast();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['transitions', versionId], queryFn: () => api.get<Transition[]>(`/versions/${versionId}/transitions`), enabled: !!versionId });
  const [filter, setFilter] = useState('');
  const [fromFilter, setFromFilter] = useState('');
  const [editing, setEditing] = useState<Partial<Transition> | null>(null);

  const t = tree.data;
  const subs = useMemo(() => t?.stages.flatMap((s) => s.subStages.map((ss) => ({ id: ss.id, label: `${s.name} › ${ss.name}`, fields: ss.fields }))) ?? [], [t]);
  const rows = (list.data ?? []).filter((x) => (!fromFilter || x.fromSubStageId === fromFilter) && (!filter || `${x.actionLabel} ${x.fromSubStage.name} ${x.toSubStage?.name ?? ''} ${x.resultingStatus ?? ''}`.toLowerCase().includes(filter.toLowerCase())));
  const grouped = rows.reduce<Record<string, Transition[]>>((acc, x) => { (acc[x.fromSubStageId] ??= []).push(x); return acc; }, {});

  if (loading) return <Loading />;
  if (!product) return <Empty title="No products" />;

  async function remove(x: Transition) {
    if (!(await confirm({ title: `Delete action "${x.actionLabel}"?`, danger: true, body: `From ${x.fromSubStage.name}. This changes routing in the draft only.` }))) return;
    try {
      await api.del(`/transitions/${x.id}`);
      toast('Workflow action deleted', 'ok');
      qc.invalidateQueries({ queryKey: ['transitions'] });
    } catch (e) { toast(errMsg(e), 'error'); }
  }

  return (
    <div>
      <ProductBar products={products} product={product} onSelect={select} tree={t} explicitVersion={explicit} />
      <Banner>Workflow routing is separate from the display order of stages. Each row is an action available on a sub-stage, who may perform it, what must be complete first, and where the case goes next.</Banner>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <div className="row wrap">
            <SearchBox value={filter} onChange={setFilter} placeholder="Search actions / statuses" />
            <select className="inp" style={{ width: 300 }} value={fromFilter} onChange={(e) => setFromFilter(e.target.value)} aria-label="From sub-stage">
              <option value="">All sub-stages</option>
              {subs.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          {editable && <button className="btn primary" onClick={() => setEditing({ fromSubStageId: fromFilter || subs[0]?.id, outcome: 'SUBMIT', conditions: [], allowedRoleCodes: [], requiredFieldKeys: [], requiredDocCodes: [], conditionLogic: 'ALL', active: true })} data-testid="add-transition"><Plus size={14} /> Add action</button>}
        </div>
        {!list.data ? <Loading /> : rows.length === 0 ? <Empty title="No workflow actions">Add the actions that move a case between sub-stages.</Empty> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>From</th><th>Action</th><th>Outcome</th><th>Destination</th><th>Resulting status</th><th>Roles</th><th>Before submission</th><th /></tr></thead>
              <tbody>
                {Object.entries(grouped).map(([from, items]) => items.map((x, i) => (
                  <tr key={x.id} className={x.active ? '' : 'inactive'}>
                    <td>{i === 0 ? <strong>{x.fromSubStage.stage.name} › {x.fromSubStage.name}</strong> : ''}</td>
                    <td>{x.actionLabel} <NcBadge show={x.needsConfirmation} /><div className="small muted mono">{x.actionCode}</div></td>
                    <td><Badge kind={OUTCOME_KIND[x.outcome]}>{x.outcome}</Badge></td>
                    <td>{x.toSubStage ? <span className="row"><ArrowRight size={12} /> {x.toSubStage.stage.name} › {x.toSubStage.name}</span> : x.isTerminal ? <Badge kind="danger">End of journey</Badge> : <span className="muted">— (stays / parallel)</span>}</td>
                    <td className="small">{x.resultingStatus ?? '—'}</td>
                    <td className="small">{x.allowedRoleCodes.join(', ') || <span className="danger-text">none</span>}</td>
                    <td className="small">
                      {x.remarksRequired && <div>Remarks required</div>}
                      {x.requireAllMandatoryFields && <div>All mandatory fields</div>}
                      {x.requiredFieldKeys.length > 0 && <div>Fields: {x.requiredFieldKeys.join(', ')}</div>}
                      {x.requiredDocCodes.length > 0 && <div>Docs: {x.requiredDocCodes.join(', ')}</div>}
                      {(x.conditions as Condition[]).length > 0 && <div>When: {(x.conditions as Condition[]).map((c) => `${c.fieldKey} ${c.operator} ${String(c.value ?? '')}`).join(` ${x.conditionLogic} `)}</div>}
                      {x.exceptionHandling && <div className="muted" title={x.exceptionHandling}>ⓘ {x.exceptionHandling.slice(0, 80)}{x.exceptionHandling.length > 80 ? '…' : ''}</div>}
                    </td>
                    <td className="btn-group" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn sm" onClick={() => setEditing(x)}>{editable ? <><Pencil size={12} /> Edit</> : 'View'}</button>
                      {editable && <button className="btn sm danger" onClick={() => remove(x)}><Trash2 size={12} /></button>}
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && t && <TransitionDialog value={editing} tree={t} editable={editable} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TransitionDialog({ value, tree, editable, onClose }: { value: Partial<Transition>; tree: VersionTree; editable: boolean; onClose: () => void }) {
  const roles = useRoles();
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState<Partial<Transition>>(value);
  const [err, setErr] = useState<string | null>(null);
  const subs = tree.stages.flatMap((s) => s.subStages.map((ss) => ({ ...ss, label: `${s.name} › ${ss.name}` })));
  const from = subs.find((s) => s.id === v.fromSubStageId);
  const set = <K extends keyof Transition>(k: K, x: Transition[K]) => setV((s) => ({ ...s, [k]: x }));
  const toggle = (k: 'allowedRoleCodes' | 'requiredFieldKeys' | 'requiredDocCodes', code: string) => {
    const list = (v[k] ?? []) as string[];
    set(k, list.includes(code) ? list.filter((c) => c !== code) : [...list, code]);
  };
  const docs = useQuery({ queryKey: ['documents', tree.id], queryFn: () => api.get<{ code: string; name: string; subStageId: string | null }[]>(`/versions/${tree.id}/documents`) });
  const conds = (v.conditions ?? []) as Condition[];

  async function save() {
    setErr(null);
    const body = {
      fromSubStageId: v.fromSubStageId, toSubStageId: v.toSubStageId || null, actionCode: v.actionCode, actionLabel: v.actionLabel, outcome: v.outcome,
      resultingStatus: v.resultingStatus || null, conditionLogic: v.conditionLogic ?? 'ALL', conditions: conds.filter((c) => c.fieldKey),
      allowedRoleCodes: v.allowedRoleCodes ?? [], remarksRequired: !!v.remarksRequired, requireAllMandatoryFields: !!v.requireAllMandatoryFields,
      requiredFieldKeys: v.requiredFieldKeys ?? [], requiredDocCodes: v.requiredDocCodes ?? [], exceptionHandling: v.exceptionHandling || null,
      isTerminal: !!v.isTerminal, active: v.active !== false, needsConfirmation: !!v.needsConfirmation, sourceRef: v.sourceRef || null,
    };
    try {
      if (v.id) await api.put(`/transitions/${v.id}`, body);
      else await api.post(`/versions/${tree.id}/transitions`, body);
      toast('Workflow action saved', 'ok');
      qc.invalidateQueries({ queryKey: ['transitions'] });
      qc.invalidateQueries({ queryKey: ['tree'] });
      onClose();
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  return (
    <Modal wide title={v.id ? `Workflow action — ${v.actionLabel}` : 'Add workflow action'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>{editable ? 'Cancel' : 'Close'}</button>{editable && <button className="btn primary" onClick={save} disabled={!v.actionLabel || !v.actionCode || !v.fromSubStageId} data-testid="save-transition">Save action</button>}</>}>
      {err && <div style={{ marginBottom: 10 }}><Banner kind="danger">{err}</Banner></div>}
      <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0 }} className="stack-lg">
        <div className="form-grid">
          <Labeled label="Current stage / sub-stage" required>
            <select className="inp" value={v.fromSubStageId ?? ''} onChange={(e) => set('fromSubStageId', e.target.value)} data-testid="tr-from">{subs.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
          </Labeled>
          <Labeled label="Destination stage / sub-stage" help="Leave empty for parallel / query / hold actions or the end of the journey.">
            <select className="inp" value={v.toSubStageId ?? ''} onChange={(e) => set('toSubStageId', e.target.value || null)} data-testid="tr-to"><option value="">— none —</option>{subs.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
          </Labeled>
          <Labeled label="Action label" required><input className="inp" value={v.actionLabel ?? ''} onChange={(e) => setV((s) => ({ ...s, actionLabel: e.target.value, actionCode: s.id ? s.actionCode : e.target.value.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '') }))} data-testid="tr-label" /></Labeled>
          <Labeled label="Action code" required><input className="inp mono" value={v.actionCode ?? ''} onChange={(e) => set('actionCode', e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))} /></Labeled>
          <Labeled label="Outcome">
            <select className="inp" value={v.outcome ?? 'SUBMIT'} onChange={(e) => set('outcome', e.target.value)}>{OUTCOMES.map((o) => <option key={o}>{o}</option>)}</select>
          </Labeled>
          <Labeled label="Resulting case status" help="e.g. Cam Pending, Loan Declined"><input className="inp" value={v.resultingStatus ?? ''} onChange={(e) => set('resultingStatus', e.target.value)} /></Labeled>
        </div>
        <div>
          <label className="lbl">Roles allowed to perform this action</label>
          <div className="chips">{roles.data?.filter((r) => r.roleType === 'LOS').map((r) => <button type="button" key={r.code} className={`chip ${(v.allowedRoleCodes ?? []).includes(r.code) ? 'on' : ''}`} onClick={() => toggle('allowedRoleCodes', r.code)}>{r.name}</button>)}</div>
        </div>
        <div className="row wrap" style={{ gap: 18 }}>
          <Check checked={!!v.remarksRequired} onChange={(x) => set('remarksRequired', x)} label="Remarks required" />
          <Check checked={!!v.requireAllMandatoryFields} onChange={(x) => set('requireAllMandatoryFields', x)} label="All mandatory fields must be complete" />
          <Check checked={!!v.isTerminal} onChange={(x) => set('isTerminal', x)} label="Ends the journey (terminal)" />
          <Check checked={v.active !== false} onChange={(x) => set('active', x)} label="Active" />
          <Check checked={!!v.needsConfirmation} onChange={(x) => set('needsConfirmation', x)} label="Requires confirmation" />
        </div>
        <div>
          <label className="lbl">Specific fields required before submission</label>
          <div className="chips" style={{ maxHeight: 120, overflow: 'auto' }}>{from?.fields.map((f) => <button type="button" key={f.key} className={`chip ${(v.requiredFieldKeys ?? []).includes(f.key) ? 'on' : ''}`} onClick={() => toggle('requiredFieldKeys', f.key)}>{f.label}</button>)}</div>
        </div>
        <div>
          <label className="lbl">Documents required before submission</label>
          <div className="chips">{docs.data?.filter((d) => !d.subStageId || d.subStageId === v.fromSubStageId || (v.requiredDocCodes ?? []).includes(d.code)).map((d) => <button type="button" key={d.code} className={`chip ${(v.requiredDocCodes ?? []).includes(d.code) ? 'on' : ''}`} onClick={() => toggle('requiredDocCodes', d.code)}>{d.name}</button>)}</div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="row between"><h3>Routing conditions</h3>
            <div className="row"><span className="small muted">Match</span><select className="inp" style={{ width: 90 }} value={v.conditionLogic ?? 'ALL'} onChange={(e) => set('conditionLogic', e.target.value as 'ALL' | 'ANY')}><option>ALL</option><option>ANY</option></select></div>
          </div>
          <div className="help">The action is offered only when these conditions hold on the current sub-stage's fields (e.g. FI Status equals Negative).</div>
          <div className="stack" style={{ marginTop: 8 }}>
            {conds.map((c, i) => (
              <div className="row" key={i}>
                <select className="inp" value={c.fieldKey} onChange={(e) => set('conditions', conds.map((x, j) => (j === i ? { ...x, fieldKey: e.target.value } : x)))}><option value="">— field —</option>{from?.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select>
                <select className="inp" style={{ width: 170 }} value={c.operator} onChange={(e) => set('conditions', conds.map((x, j) => (j === i ? { ...x, operator: e.target.value } : x)))}>{OPERATORS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select>
                <input className="inp" value={String(c.value ?? '')} onChange={(e) => set('conditions', conds.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="value" />
                <button className="btn icon danger" onClick={() => set('conditions', conds.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
              </div>
            ))}
            <div><button className="btn sm" onClick={() => set('conditions', [...conds, { fieldKey: '', operator: 'EQUALS', value: '' }])}><Plus size={12} /> Add condition</button></div>
          </div>
        </div>
        <div className="form-grid">
          <Labeled label="Exception handling / notes" full><textarea className="inp" rows={2} value={v.exceptionHandling ?? ''} onChange={(e) => set('exceptionHandling', e.target.value)} /></Labeled>
          <Labeled label="Source reference" full><input className="inp" value={v.sourceRef ?? ''} onChange={(e) => set('sourceRef', e.target.value)} /></Labeled>
        </div>
      </fieldset>
    </Modal>
  );
}
