import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown, ArrowRightLeft, ArrowUp, ChevronDown, ChevronRight, Copy, CopyPlus, Eye, FolderTree, Layers, Plus, Save, Trash2, Undo2, CheckCircle2,
} from 'lucide-react';
import { api } from '../lib/api';
import { useRoles, useSelectedProduct, useWorkingVersion } from '../lib/hooks';
import type { Field, Module, Stage, SubStage, ValidationReport, VersionTree } from '../lib/types';
import ProductBar from '../components/ProductBar';
import FieldEditor, { blankField, type FieldDraft } from '../components/FieldEditor';
import CopyDialog, { type CopyItem } from '../components/CopyDialog';
import { SortableItem, SortableList } from '../components/Sortable';
import { Badge, Banner, Check, Empty, Labeled, Loading, Modal, NcBadge, SearchBox, errMsg, useConfirm, useToast } from '../components/ui';
import { FIELD_TYPES } from '../../../shared/src/ruleEngine';

type Sel = { type: 'stage' | 'subStage' | 'module' | 'field'; id: string } | null;
const typeLabel = (t: string) => FIELD_TYPES.find((x) => x.code === t)?.label ?? t;
const PLATFORMS = ['MOBILE', 'WEB', 'WEB / AGENCY', 'SYSTEM', 'BOTH'];

function useRun() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: async ({ fn }: { fn: () => Promise<unknown>; ok?: string }) => fn(),
    onSuccess: (_d, v) => {
      if (v.ok) toast(v.ok, 'ok');
      qc.invalidateQueries({ queryKey: ['tree'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });
}

export function cleanFieldBody(f: FieldDraft) {
  const { id: _id, ...rest } = f as FieldDraft & { subStageId?: string; sequence?: number; definitionId?: string | null };
  const body: Record<string, unknown> = { ...rest };
  delete body.subStageId;
  delete body.sequence;
  delete body.definitionId;
  if (!body.key) delete body.key;
  body.options = f.options.filter((o) => o.value.trim()).map((o) => ({ value: o.value.trim(), label: (o.label || o.value).trim(), active: o.active }));
  body.rules = f.rules
    .map((r) => ({ ruleType: r.ruleType, logic: r.logic, conditions: r.conditions.filter((c) => c.fieldKey), message: r.message ?? null, active: r.active }))
    .filter((r) => r.conditions.length > 0);
  return body;
}

export default function StageBuilderPage() {
  const { products, product, select, loading } = useSelectedProduct();
  const { versionId, tree, editable, explicit } = useWorkingVersion(product);
  const [sel, setSel] = useState<Sel>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [addStage, setAddStage] = useState(false);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const run = useRun();

  useEffect(() => setSel(null), [versionId]);
  useEffect(() => {
    if (tree.data && expanded.size === 0) setExpanded(new Set(tree.data.stages.slice(0, 1).map((s) => s.id)));
  }, [tree.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = tree.data;
  const index = useMemo(() => buildIndex(t), [t]);

  // Reveal the selected item: expand its stage (and sub-stage for sections / fields).
  useEffect(() => {
    if (!sel) return;
    const open: string[] = [];
    if (sel.type === 'subStage') open.push(index.subs.get(sel.id)?.stageId ?? '');
    if (sel.type === 'module' || sel.type === 'field') {
      const sub = sel.type === 'module' ? index.subOfModule.get(sel.id) : index.subOfField.get(sel.id);
      if (sub) open.push(sub.stageId, sub.id);
    }
    const missing = open.filter((id) => id && !expanded.has(id));
    if (missing.length) setExpanded((s) => new Set([...s, ...missing]));
  }, [sel, index]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Loading />;
  if (!product) return <Empty title="No products yet">Create a product in the Product Catalogue first.</Empty>;

  const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const q = search.trim().toLowerCase();
  const match = (s: string) => !q || s.toLowerCase().includes(q);

  async function validate() {
    try {
      setReport(await api.post<ValidationReport>(`/versions/${versionId}/validate`));
    } catch (e) {
      setReport({ valid: false, errors: [{ severity: 'error', path: '', message: errMsg(e) }], warnings: [], stats: {} });
    }
  }

  return (
    <div>
      <ProductBar products={products} product={product} onSelect={select} tree={t} explicitVersion={explicit}
        extra={t && (
          <>
            <button className="btn" onClick={validate} data-testid="validate-btn"><CheckCircle2 size={14} /> Validate</button>
            <Link className="btn" to={`/preview?product=${product.id}${explicit ? `&version=${versionId}` : ''}`}><Eye size={14} /> Preview</Link>
          </>
        )}
      />
      {!t ? <Loading /> : (
        <div className="builder">
          <div className="card tree-panel">
            <div className="card-head">
              <div className="row"><FolderTree size={16} /><h2>{product.name}</h2></div>
              {editable && <button className="btn sm primary" onClick={() => setAddStage(true)} data-testid="add-stage"><Plus size={13} /> Stage</button>}
            </div>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
              <SearchBox value={search} onChange={setSearch} placeholder="Search stages, sections, fields…" width={330} />
            </div>
            <div className="panel-scroll tree" data-testid="tree">
              {t.stages.length === 0 && <Empty title="No stages yet" action={editable && <button className="btn primary" onClick={() => setAddStage(true)}><Plus size={14} /> Add the first stage</button>}>A configuration is built as Stage → Sub-stage → Section → Field.</Empty>}
              <SortableList ids={t.stages.map((s) => s.id)} disabled={!editable || !!q} onReorder={(ids) => run.mutate({ fn: () => api.post(`/versions/${t.id}/stages/reorder`, { orderedIds: ids }), ok: 'Stage order saved' })}>
                {t.stages.map((s) => {
                  const subMatches = s.subStages.filter((ss) => match(ss.name) || ss.modules.some((m) => match(m.name)) || ss.fields.some((f) => match(f.label) || match(f.key)));
                  if (q && !match(s.name) && subMatches.length === 0) return null;
                  const open = expanded.has(s.id) || !!q;
                  return (
                    <SortableItem key={s.id} id={s.id} disabled={!editable || !!q}>
                      {(handle) => (
                        <div>
                          <div className={`tree-node ${sel?.id === s.id ? 'selected' : ''} ${s.active ? '' : 'inactive'}`} onClick={() => setSel({ type: 'stage', id: s.id })} data-testid={`stage-node-${s.key}`}>
                            {handle}
                            <span className="chev" onClick={(e) => { e.stopPropagation(); toggle(s.id); }}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                            <Layers size={14} color="var(--brand)" />
                            <span className="name">{s.name}</span>
                            {s.needsConfirmation && <span className="nc-dot" title="Requires confirmation" />}
                            <span className="count">{s.subStages.length}</span>
                          </div>
                          {open && (
                            <div className="tree-children">
                              <SortableList ids={s.subStages.map((x) => x.id)} disabled={!editable || !!q} onReorder={(ids) => run.mutate({ fn: () => api.post(`/stages/${s.id}/subStages/reorder`, { orderedIds: ids }), ok: 'Sub-stage order saved' })}>
                                {(q ? subMatches : s.subStages).map((ss) => (
                                  <SortableItem key={ss.id} id={ss.id} disabled={!editable || !!q}>
                                    {(h2) => (
                                      <div>
                                        <div className={`tree-node ${sel?.id === ss.id ? 'selected' : ''} ${ss.active ? '' : 'inactive'}`} onClick={() => setSel({ type: 'subStage', id: ss.id })} data-testid={`sub-node-${ss.key}`}>
                                          {h2}
                                          <span className="chev" onClick={(e) => { e.stopPropagation(); toggle(ss.id); }}>{ss.modules.length > 0 ? (expanded.has(ss.id) || q ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : null}</span>
                                          <span className="name">{ss.name}</span>
                                          {ss.needsConfirmation && <span className="nc-dot" title="Requires confirmation" />}
                                          <span className="count">{ss.fields.length}f</span>
                                        </div>
                                        {(expanded.has(ss.id) || !!q) && ss.modules.length > 0 && (
                                          <div className="tree-children">
                                            {ss.modules.filter((m) => !q || match(m.name) || ss.fields.some((f) => f.moduleId === m.id && (match(f.label) || match(f.key))) || match(ss.name)).map((m) => (
                                              <div key={m.id} className={`tree-node ${sel?.id === m.id ? 'selected' : ''} ${m.active ? '' : 'inactive'}`} onClick={() => setSel({ type: 'module', id: m.id })} data-testid={`module-node-${m.key}`}>
                                                <span style={{ width: 14 }} />
                                                <span className="name">{m.name}</span>
                                                {m.repeatable && <Badge>list</Badge>}
                                                <span className="count">{ss.fields.filter((f) => f.moduleId === m.id).length}f</span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                        {q && (
                                          <div className="tree-children">
                                            {ss.fields.filter((f) => match(f.label) || match(f.key)).map((f) => (
                                              <div key={f.id} className={`tree-node ${sel?.id === f.id ? 'selected' : ''}`} onClick={() => setSel({ type: 'field', id: f.id })}>
                                                <span style={{ width: 14 }} /><span className="name">{f.label}</span><span className="count">{typeLabel(f.type)}</span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </SortableItem>
                                ))}
                              </SortableList>
                            </div>
                          )}
                        </div>
                      )}
                    </SortableItem>
                  );
                })}
              </SortableList>
            </div>
            <div className="small muted" style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
              {editable ? 'Drag ⋮⋮ to reorder. Display order does not change workflow routing.' : 'Read-only view.'} <span className="nc-dot" style={{ display: 'inline-block' }} /> = requires confirmation
            </div>
          </div>
          <div className="card editor-panel">
            <div className="panel-scroll">
              {report && <ValidationPanel report={report} onClose={() => setReport(null)} />}
              {!sel && <Overview tree={t} />}
              {sel?.type === 'stage' && index.stages.get(sel.id) && <StageEditor key={sel.id} stage={index.stages.get(sel.id)!} tree={t} editable={editable} onSelect={setSel} run={run} />}
              {sel?.type === 'subStage' && index.subs.get(sel.id) && <SubStageEditor key={sel.id} sub={index.subs.get(sel.id)!} tree={t} editable={editable} onSelect={setSel} run={run} productId={product.id} />}
              {sel?.type === 'module' && index.modules.get(sel.id) && <ModuleEditor key={sel.id} mod={index.modules.get(sel.id)!} sub={index.subOfModule.get(sel.id)!} tree={t} editable={editable} onSelect={setSel} run={run} />}
              {sel?.type === 'field' && index.fields.get(sel.id) && <FieldPanel key={sel.id} field={index.fields.get(sel.id)!} sub={index.subOfField.get(sel.id)!} tree={t} editable={editable} onSelect={setSel} productId={product.id} />}
              {sel && !index.stages.get(sel.id) && !index.subs.get(sel.id) && !index.modules.get(sel.id) && !index.fields.get(sel.id) && <Empty title="Item no longer exists" />}
            </div>
          </div>
        </div>
      )}
      {addStage && t && <AddDialog title="Add stage" onClose={() => setAddStage(false)} withPlatform onSave={async (v) => {
        const s = await api.post<Stage>(`/versions/${t.id}/stages`, v);
        run.mutate({ fn: async () => s, ok: `Stage "${s.name}" added` });
        setSel({ type: 'stage', id: s.id });
      }} />}
    </div>
  );
}

function buildIndex(t?: VersionTree) {
  const stages = new Map<string, Stage>();
  const subs = new Map<string, SubStage>();
  const modules = new Map<string, Module>();
  const subOfModule = new Map<string, SubStage>();
  const fields = new Map<string, Field>();
  const subOfField = new Map<string, SubStage>();
  t?.stages.forEach((s) => {
    stages.set(s.id, s);
    s.subStages.forEach((ss) => {
      subs.set(ss.id, ss);
      ss.modules.forEach((m) => { modules.set(m.id, m); subOfModule.set(m.id, ss); });
      ss.fields.forEach((f) => { fields.set(f.id, f); subOfField.set(f.id, ss); });
    });
  });
  return { stages, subs, modules, subOfModule, fields, subOfField };
}

function Overview({ tree }: { tree: VersionTree }) {
  const subs = tree.stages.reduce((n, s) => n + s.subStages.length, 0);
  const fields = tree.stages.reduce((n, s) => n + s.subStages.reduce((m, ss) => m + ss.fields.length, 0), 0);
  const nc = tree.stages.reduce((n, s) => n + (s.needsConfirmation ? 1 : 0) + s.subStages.reduce((m, ss) => m + (ss.needsConfirmation ? 1 : 0) + ss.fields.filter((f) => f.needsConfirmation).length, 0), 0);
  return (
    <div className="card-body stack-lg">
      <div>
        <h2>{tree.product.name} — v{tree.versionNo}</h2>
        <p className="muted">{tree.notes ?? tree.product.description}</p>
      </div>
      <div className="grid grid-4">
        {[['Stages', tree.stages.length], ['Sub-stages', subs], ['Fields', fields], ['Requires confirmation', nc]].map(([l, v]) => (
          <div className="card stat" key={l as string}><div className="label">{l}</div><div className="value">{v}</div></div>
        ))}
      </div>
      <Banner>Select a stage, sub-stage, section or field in the tree to view and edit its properties. Stage order here is the display order; routing between sub-stages is configured on the Workflow page.</Banner>
      <table className="tbl">
        <thead><tr><th>#</th><th>Stage</th><th>Platform</th><th>Sub-stages</th></tr></thead>
        <tbody>
          {tree.stages.map((s, i) => (
            <tr key={s.id} className={s.active ? '' : 'inactive'}><td>{i + 1}</td><td>{s.name} <NcBadge show={s.needsConfirmation} /></td><td>{s.platform ?? '—'}</td><td className="small">{s.subStages.map((x) => x.name).join(' · ')}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ValidationPanel({ report, onClose }: { report: ValidationReport; onClose: () => void }) {
  return (
    <div className="card-body" style={{ borderBottom: '1px solid var(--border)' }} data-testid="validation-report">
      <div className="row between">
        <h2>{report.valid ? 'Configuration is valid' : `${report.errors.length} error(s) block publishing`}</h2>
        <button className="btn sm" onClick={onClose}>Close</button>
      </div>
      <div className="stack" style={{ marginTop: 8, maxHeight: 220, overflow: 'auto' }}>
        {report.errors.map((e, i) => <Banner key={`e${i}`} kind="danger"><strong>{e.path}</strong> — {e.message}</Banner>)}
        {report.warnings.slice(0, 50).map((e, i) => <div key={`w${i}`} className="small"><Badge kind="warn">warning</Badge> <strong>{e.path}</strong> — {e.message}</div>)}
        {report.warnings.length > 50 && <div className="small muted">…and {report.warnings.length - 50} more warnings</div>}
      </div>
    </div>
  );
}

type Run = ReturnType<typeof useRun>;

function MoveButtons({ ids, id, onReorder, editable }: { ids: string[]; id: string; onReorder: (ids: string[]) => void; editable: boolean }) {
  const i = ids.indexOf(id);
  const mv = (d: number) => {
    const next = [...ids];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onReorder(next);
  };
  return (
    <>
      <button className="btn" disabled={!editable || i <= 0} onClick={() => mv(-1)} title="Move up" data-testid="move-up"><ArrowUp size={14} /> Up</button>
      <button className="btn" disabled={!editable || i < 0 || i >= ids.length - 1} onClick={() => mv(1)} title="Move down" data-testid="move-down"><ArrowDown size={14} /> Down</button>
    </>
  );
}

function PropsForm({ value, onChange, editable, withPlatform, withRole, withRepeatable }: {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  editable: boolean;
  withPlatform?: boolean;
  withRole?: boolean;
  withRepeatable?: boolean;
}) {
  const roles = useRoles();
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v });
  return (
    <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0 }}>
      <div className="form-grid">
        <Labeled label="Name" required><input className="inp" value={String(value.name ?? '')} onChange={(e) => set('name', e.target.value)} data-testid="prop-name" /></Labeled>
        <Labeled label="Key" help="Stable internal identifier used by the LOS."><input className="inp mono" value={String(value.key ?? '')} onChange={(e) => set('key', e.target.value.replace(/[^A-Za-z0-9_]/g, ''))} /></Labeled>
        {withPlatform && (
          <Labeled label="Platform">
            <select className="inp" value={String(value.platform ?? '')} onChange={(e) => set('platform', e.target.value || null)}>
              <option value="">—</option>
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Labeled>
        )}
        {withRole && (
          <Labeled label="Primary role">
            <select className="inp" value={String(value.primaryRoleCode ?? '')} onChange={(e) => set('primaryRoleCode', e.target.value || null)}>
              <option value="">—</option>
              {(roles.data ?? []).filter((r) => r.roleType === 'LOS').map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </select>
          </Labeled>
        )}
        <Labeled label="Description" full><textarea className="inp" rows={2} value={String(value.description ?? '')} onChange={(e) => set('description', e.target.value || null)} /></Labeled>
        <Labeled label="Source reference" full><input className="inp" value={String(value.sourceRef ?? '')} onChange={(e) => set('sourceRef', e.target.value || null)} /></Labeled>
        <div className="full row wrap" style={{ gap: 18 }}>
          <Check checked={value.active !== false} onChange={(v) => set('active', v)} label="Active" />
          <Check checked={!!value.needsConfirmation} onChange={(v) => set('needsConfirmation', v)} label="Requires confirmation" />
          {withRepeatable && <Check checked={!!value.repeatable} onChange={(v) => set('repeatable', v)} label="Repeatable list (e.g. + Add Land)" />}
        </div>
      </div>
    </fieldset>
  );
}

function pick(o: object, keys: string[]) {
  const src = o as Record<string, unknown>;
  return Object.fromEntries(keys.map((k) => [k, src[k]]));
}
const STAGE_KEYS = ['name', 'key', 'description', 'platform', 'active', 'needsConfirmation', 'sourceRef'];
const SUB_KEYS = [...STAGE_KEYS, 'primaryRoleCode'];
const MOD_KEYS = ['name', 'key', 'description', 'repeatable', 'active', 'needsConfirmation', 'sourceRef'];

function StageEditor({ stage, tree, editable, onSelect, run }: { stage: Stage; tree: VersionTree; editable: boolean; onSelect: (s: Sel) => void; run: Run }) {
  const confirm = useConfirm();
  const [form, setForm] = useState(pick(stage, STAGE_KEYS));
  const [addSub, setAddSub] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(pick(stage, STAGE_KEYS));
  const stageIds = tree.stages.map((s) => s.id);

  async function remove() {
    const impact = await api.get<{ subStages: { name: string; fields: number; documents: number }[]; totals: Record<string, number> }>(`/stages/${stage.id}/impact`);
    const ok = await confirm({
      title: `Delete stage "${stage.name}"?`, danger: true, confirmText: 'Delete stage',
      body: (
        <div className="stack">
          <p>This removes the stage from this <strong>draft</strong>. Published versions keep it for audit and existing applications.</p>
          {impact.subStages.length > 0 ? (
            <>
              <Banner kind="warn">The following will also be deleted: {impact.totals.subStages} sub-stage(s), {impact.totals.modules} section(s), {impact.totals.fields} field(s), {impact.totals.documents} document requirement(s), {impact.totals.transitions} workflow action(s).</Banner>
              <ul className="small">{impact.subStages.map((s) => <li key={s.name}>{s.name} — {s.fields} fields, {s.documents} documents</li>)}</ul>
              <p className="small muted">Tip: deactivate the stage instead if you may need it again.</p>
            </>
          ) : <p className="muted">The stage is empty.</p>}
        </div>
      ),
    });
    if (ok) run.mutate({ fn: () => api.del(`/stages/${stage.id}`), ok: 'Stage deleted' }, { onSuccess: () => onSelect(null) });
  }

  return (
    <div>
      <div className="card-head">
        <div><div className="small muted">Stage</div><h2>{stage.name} <NcBadge show={stage.needsConfirmation} /></h2></div>
        <div className="btn-group">
          <MoveButtons ids={stageIds} id={stage.id} editable={editable} onReorder={(ids) => run.mutate({ fn: () => api.post(`/versions/${tree.id}/stages/reorder`, { orderedIds: ids }), ok: 'Stage moved' })} />
          {editable && <button className="btn danger" onClick={remove} data-testid="delete-stage"><Trash2 size={14} /> Delete</button>}
        </div>
      </div>
      <div className="card-body stack-lg">
        <PropsForm value={form} onChange={setForm} editable={editable} withPlatform />
        {editable && (
          <div className="row">
            <button className="btn primary" disabled={!dirty || !String(form.name ?? '').trim()} onClick={() => run.mutate({ fn: () => api.put(`/stages/${stage.id}`, form), ok: 'Stage saved' })} data-testid="save-stage"><Save size={14} /> Save</button>
            <button className="btn" disabled={!dirty} onClick={() => setForm(pick(stage, STAGE_KEYS))}><Undo2 size={14} /> Cancel</button>
          </div>
        )}
        <div className="divider" />
        <div className="row between"><h3>Sub-stages ({stage.subStages.length})</h3>{editable && <button className="btn sm primary" onClick={() => setAddSub(true)} data-testid="add-substage"><Plus size={13} /> Add sub-stage</button>}</div>
        {stage.subStages.length === 0 ? <Empty title="No sub-stages">Add a sub-stage such as "Lead Creation" or "Loan Details".</Empty> : (
          <table className="tbl">
            <thead><tr><th>#</th><th>Sub-stage</th><th>Platform</th><th>Sections</th><th>Fields</th></tr></thead>
            <tbody>
              {stage.subStages.map((ss, i) => (
                <tr key={ss.id} className={ss.active ? '' : 'inactive'} style={{ cursor: 'pointer' }} onClick={() => onSelect({ type: 'subStage', id: ss.id })}>
                  <td>{i + 1}</td><td><a>{ss.name}</a> <NcBadge show={ss.needsConfirmation} /></td><td>{ss.platform ?? '—'}</td><td>{ss.modules.length}</td><td>{ss.fields.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {addSub && <AddDialog title={`Add sub-stage to ${stage.name}`} withPlatform withRole onClose={() => setAddSub(false)} onSave={async (v) => {
        const s = await api.post<SubStage>(`/stages/${stage.id}/subStages`, v);
        run.mutate({ fn: async () => s, ok: `Sub-stage "${s.name}" added` });
        onSelect({ type: 'subStage', id: s.id });
      }} />}
    </div>
  );
}

function SubStageEditor({ sub, tree, editable, onSelect, run, productId }: { sub: SubStage; tree: VersionTree; editable: boolean; onSelect: (s: Sel) => void; run: Run; productId: string }) {
  const confirm = useConfirm();
  const [tab, setTab] = useState<'fields' | 'sections' | 'props'>('fields');
  const [form, setForm] = useState(pick(sub, SUB_KEYS));
  const [addMod, setAddMod] = useState(false);
  const [newField, setNewField] = useState<FieldDraft | null>(null);
  const [moveTo, setMoveTo] = useState(false);
  const [copy, setCopy] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(pick(sub, SUB_KEYS));
  const stage = tree.stages.find((s) => s.id === sub.stageId)!;
  const siblingIds = stage.subStages.map((s) => s.id);

  async function remove() {
    const impact = await api.get<{ modules: string[]; fields: string[]; documents: number; transitions: number }>(`/subStages/${sub.id}/impact`);
    const ok = await confirm({
      title: `Delete sub-stage "${sub.name}"?`, danger: true, confirmText: 'Delete sub-stage',
      body: (
        <div className="stack">
          <p>Removes it from this draft only. Published versions are unchanged.</p>
          {(impact.fields.length > 0 || impact.modules.length > 0 || impact.documents || impact.transitions) ? (
            <Banner kind="warn">Also deleted: {impact.modules.length} section(s), {impact.fields.length} field(s), {impact.documents} document requirement(s), {impact.transitions} workflow action(s).</Banner>
          ) : <p className="muted">The sub-stage is empty.</p>}
          {impact.fields.length > 0 && <div className="small muted" style={{ maxHeight: 120, overflow: 'auto' }}>{impact.fields.join(' · ')}</div>}
        </div>
      ),
    });
    if (ok) run.mutate({ fn: () => api.del(`/subStages/${sub.id}`), ok: 'Sub-stage deleted' }, { onSuccess: () => onSelect({ type: 'stage', id: sub.stageId }) });
  }

  return (
    <div>
      <div className="card-head" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="small muted">{stage.name} › Sub-stage</div>
          <h2>{sub.name} <NcBadge show={sub.needsConfirmation} /></h2>
          {sub.description && <div className="small text-2" style={{ marginTop: 4, maxWidth: 640 }}>{sub.description}</div>}
        </div>
        <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
          <MoveButtons ids={siblingIds} id={sub.id} editable={editable} onReorder={(ids) => run.mutate({ fn: () => api.post(`/stages/${stage.id}/subStages/reorder`, { orderedIds: ids }), ok: 'Sub-stage moved' })} />
          {editable && <button className="btn" onClick={() => setMoveTo(true)} data-testid="move-to"><ArrowRightLeft size={14} /> Move to…</button>}
          <Link className="btn" to={`/preview?product=${productId}&version=${tree.id}&subStage=${sub.id}`}><Eye size={14} /> Preview</Link>
          <button className="btn" onClick={() => setCopy(true)}><CopyPlus size={14} /> Copy to products</button>
          {editable && <button className="btn danger" onClick={remove} data-testid="delete-substage"><Trash2 size={14} /></button>}
        </div>
      </div>
      <div className="tabs">
        <button className={tab === 'fields' ? 'on' : ''} onClick={() => setTab('fields')}>Fields ({sub.fields.length})</button>
        <button className={tab === 'sections' ? 'on' : ''} onClick={() => setTab('sections')} data-testid="tab-sections">Sections ({sub.modules.length})</button>
        <button className={tab === 'props' ? 'on' : ''} onClick={() => setTab('props')} data-testid="tab-props">Properties</button>
      </div>
      <div className="card-body">
        {tab === 'props' && (
          <div className="stack-lg">
            <PropsForm value={form} onChange={setForm} editable={editable} withPlatform withRole />
            {editable && (
              <div className="row">
                <button className="btn primary" disabled={!dirty} onClick={() => run.mutate({ fn: () => api.put(`/subStages/${sub.id}`, form), ok: 'Sub-stage saved' })} data-testid="save-substage"><Save size={14} /> Save</button>
                <button className="btn" disabled={!dirty} onClick={() => setForm(pick(sub, SUB_KEYS))}><Undo2 size={14} /> Cancel</button>
              </div>
            )}
            <div className="small muted">{sub._count?.documents ?? 0} document requirement(s) · {sub._count?.transitionsFrom ?? 0} workflow action(s) — manage on the Document and Workflow pages.</div>
          </div>
        )}
        {tab === 'sections' && (
          <div className="stack-lg">
            <div className="row between"><span className="muted small">Sections group fields into tabs / blocks on the screen (e.g. Personal, Address, Office, Reference).</span>{editable && <button className="btn sm primary" onClick={() => setAddMod(true)} data-testid="add-section"><Plus size={13} /> Add section</button>}</div>
            {sub.modules.length === 0 ? <Empty title="No sections">Fields can sit directly on the sub-stage, or be grouped into sections.</Empty> : (
              <SortableList ids={sub.modules.map((m) => m.id)} disabled={!editable} onReorder={(ids) => run.mutate({ fn: () => api.post(`/subStages/${sub.id}/modules/reorder`, { orderedIds: ids }), ok: 'Section order saved' })}>
                {sub.modules.map((m) => (
                  <SortableItem key={m.id} id={m.id} disabled={!editable}>
                    {(h) => (
                      <div className="field-list"><div className="field-row" style={{ gridTemplateColumns: '22px 1fr 110px 80px' }}>
                        {h}
                        <a style={{ cursor: 'pointer' }} onClick={() => onSelect({ type: 'module', id: m.id })}>{m.name} {m.repeatable && <Badge>repeatable list</Badge>} <NcBadge show={m.needsConfirmation} /></a>
                        <span className="small muted mono">{m.key}</span>
                        <span className="small">{sub.fields.filter((f) => f.moduleId === m.id).length} fields</span>
                      </div></div>
                    )}
                  </SortableItem>
                ))}
              </SortableList>
            )}
          </div>
        )}
        {tab === 'fields' && (
          <FieldList sub={sub} editable={editable} onSelect={onSelect} run={run} onAdd={(moduleId) => setNewField(blankField(moduleId))} />
        )}
      </div>
      {addMod && <AddDialog title="Add section" withRepeatable onClose={() => setAddMod(false)} onSave={async (v) => {
        const m = await api.post<Module>(`/subStages/${sub.id}/modules`, v);
        run.mutate({ fn: async () => m, ok: `Section "${m.name}" added` });
      }} />}
      {newField && <NewFieldDialog sub={sub} tree={tree} draft={newField} onClose={() => setNewField(null)} onCreated={(f) => { setNewField(null); onSelect({ type: 'field', id: f.id }); }} />}
      {moveTo && <MoveSubStageDialog sub={sub} tree={tree} onClose={() => setMoveTo(false)} run={run} />}
      {copy && <CopyDialogWrapper tree={tree} productId={productId} items={[{ type: 'subStage', ref: `${stage.key}/${sub.key}` }]} label={`${stage.name} › ${sub.name}`} onClose={() => setCopy(false)} />}
    </div>
  );
}

function CopyDialogWrapper({ tree, productId, items, label, onClose }: { tree: VersionTree; productId: string; items: CopyItem[]; label: string; onClose: () => void }) {
  const { products } = useSelectedProduct();
  return <CopyDialog sourceVersionId={tree.id} sourceProductId={productId} items={items} itemLabel={label} products={products} onClose={onClose} />;
}

function FieldList({ sub, editable, onSelect, run, onAdd, moduleFilter }: { sub: SubStage; editable: boolean; onSelect: (s: Sel) => void; run: Run; onAdd: (moduleId: string | null) => void; moduleFilter?: string }) {
  const groups: { id: string | null; name: string }[] = [
    ...(sub.fields.some((f) => !f.moduleId) || sub.modules.length === 0 ? [{ id: null, name: sub.modules.length ? 'Not in a section' : 'Fields' }] : []),
    ...sub.modules.map((m) => ({ id: m.id, name: m.name })),
  ].filter((g) => moduleFilter === undefined || g.id === moduleFilter);
  const all = sub.fields;
  const reorderGroup = (groupId: string | null, ids: string[]) => {
    // keep positions of other groups, place this group's fields in the new relative order
    const slots = all.map((f, i) => ((f.moduleId ?? null) === groupId ? i : -1)).filter((i) => i >= 0);
    const next = all.map((f) => f.id);
    slots.forEach((slot, i) => (next[slot] = ids[i]));
    run.mutate({ fn: () => api.post(`/subStages/${sub.id}/fields/reorder`, { orderedIds: next }), ok: 'Field order saved' });
  };
  return (
    <div className="stack-lg">
      {editable && <div className="row between"><span className="small muted">Drag ⋮⋮ or use the arrows to reorder. Click a field to edit all of its properties.</span><button className="btn sm primary" onClick={() => onAdd(moduleFilter ?? sub.modules[0]?.id ?? null)} data-testid="add-field"><Plus size={13} /> Add field</button></div>}
      {sub.fields.length === 0 && <Empty title="No fields yet" action={editable && <button className="btn primary" onClick={() => onAdd(moduleFilter ?? null)}><Plus size={14} /> Add a field</button>}>Add the fields this screen should capture.</Empty>}
      {groups.map((g) => {
        const fields = all.filter((f) => (f.moduleId ?? null) === g.id);
        if (fields.length === 0 && moduleFilter === undefined && g.id === null) return null;
        const ids = fields.map((f) => f.id);
        return (
          <div className="card field-list" key={g.id ?? 'none'} data-testid={`field-group-${g.name}`}>
            <div className="group-head"><span style={{ flex: 1 }}>{g.name}</span><span className="small muted">{fields.length} field(s)</span>{editable && <button className="btn sm ghost" onClick={() => onAdd(g.id)}><Plus size={12} /> Field here</button>}</div>
            {fields.length === 0 && <div className="small muted" style={{ padding: 10 }}>No fields in this section.</div>}
            <SortableList ids={ids} disabled={!editable} onReorder={(n) => reorderGroup(g.id, n)}>
              {fields.map((f, i) => (
                <SortableItem key={f.id} id={f.id} disabled={!editable}>
                  {(h) => (
                    <div className={`field-row ${f.active ? '' : 'inactive'}`} data-testid={`field-row-${f.key}`}>
                      {h}
                      <a style={{ cursor: 'pointer', minWidth: 0 }} onClick={() => onSelect({ type: 'field', id: f.id })}>
                        <span style={{ textDecoration: f.active ? 'none' : 'line-through' }}>{f.label}</span>
                        {f.requirement === 'MANDATORY' && <span className="req">*</span>}
                        <div className="small muted mono">{f.key}{f.rules.length > 0 && ' · rules'}{f.needsConfirmation && ' · to confirm'}</div>
                      </a>
                      <span className="small">{typeLabel(f.type)}</span>
                      <span>{f.requirement === 'MANDATORY' ? <Badge kind="danger">Mandatory</Badge> : f.requirement === 'CONDITIONAL' ? <Badge kind="warn">Conditional</Badge> : <Badge>Optional</Badge>}</span>
                      <span className="btn-group">
                        <button className="btn icon" disabled={!editable || i === 0} title="Move up" onClick={() => { const n = [...ids]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; reorderGroup(g.id, n); }}><ArrowUp size={13} /></button>
                        <button className="btn icon" disabled={!editable || i === ids.length - 1} title="Move down" onClick={() => { const n = [...ids]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; reorderGroup(g.id, n); }}><ArrowDown size={13} /></button>
                      </span>
                    </div>
                  )}
                </SortableItem>
              ))}
            </SortableList>
          </div>
        );
      })}
    </div>
  );
}

function ModuleEditor({ mod, sub, tree, editable, onSelect, run }: { mod: Module; sub: SubStage; tree: VersionTree; editable: boolean; onSelect: (s: Sel) => void; run: Run }) {
  const confirm = useConfirm();
  const [form, setForm] = useState(pick(mod, MOD_KEYS));
  const [newField, setNewField] = useState<FieldDraft | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(pick(mod, MOD_KEYS));
  const count = sub.fields.filter((f) => f.moduleId === mod.id).length;
  async function remove(action: 'delete' | 'detach') {
    const ok = await confirm({
      title: `Delete section "${mod.name}"?`, danger: true, confirmText: 'Delete section',
      body: count === 0 ? <p>The section is empty.</p> : action === 'delete'
        ? <Banner kind="warn">The {count} field(s) in this section will also be deleted from the draft.</Banner>
        : <Banner>The {count} field(s) will be kept directly on the sub-stage.</Banner>,
    });
    if (ok) run.mutate({ fn: () => api.del(`/modules/${mod.id}?fieldsAction=${action}`), ok: 'Section deleted' }, { onSuccess: () => onSelect({ type: 'subStage', id: sub.id }) });
  }
  return (
    <div>
      <div className="card-head">
        <div><div className="small muted">{sub.name} › Section</div><h2>{mod.name} <NcBadge show={mod.needsConfirmation} /></h2></div>
        <div className="btn-group">
          <MoveButtons ids={sub.modules.map((m) => m.id)} id={mod.id} editable={editable} onReorder={(ids) => run.mutate({ fn: () => api.post(`/subStages/${sub.id}/modules/reorder`, { orderedIds: ids }), ok: 'Section moved' })} />
          {editable && <button className="btn danger" onClick={() => remove('detach')} title="Delete section, keep its fields">Delete (keep fields)</button>}
          {editable && <button className="btn danger" onClick={() => remove('delete')} data-testid="delete-section"><Trash2 size={14} /> Delete with fields</button>}
        </div>
      </div>
      <div className="card-body stack-lg">
        <PropsForm value={form} onChange={setForm} editable={editable} withRepeatable />
        {editable && (
          <div className="row">
            <button className="btn primary" disabled={!dirty} onClick={() => run.mutate({ fn: () => api.put(`/modules/${mod.id}`, form), ok: 'Section saved' })} data-testid="save-section"><Save size={14} /> Save</button>
            <button className="btn" disabled={!dirty} onClick={() => setForm(pick(mod, MOD_KEYS))}><Undo2 size={14} /> Cancel</button>
          </div>
        )}
        <div className="divider" />
        <FieldList sub={sub} editable={editable} onSelect={onSelect} run={run} moduleFilter={mod.id} onAdd={() => setNewField(blankField(mod.id))} />
      </div>
      {newField && <NewFieldDialog sub={sub} tree={tree} draft={newField} onClose={() => setNewField(null)} onCreated={(f) => { setNewField(null); onSelect({ type: 'field', id: f.id }); }} />}
    </div>
  );
}

export function NewFieldDialog({ sub, tree, draft, onClose, onCreated }: { sub: SubStage; tree: VersionTree; draft: FieldDraft; onClose: () => void; onCreated: (f: Field) => void }) {
  const roles = useRoles();
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState(draft);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const created = await api.post<Field>(`/subStages/${sub.id}/fields`, cleanFieldBody(f));
      toast(`Field "${created.label}" added`, 'ok');
      await qc.invalidateQueries({ queryKey: ['tree'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      onCreated(created);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal wide title={`Add field to ${sub.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy || !f.label.trim()} data-testid="save-new-field"><Save size={14} /> Add field</button></>}>
      {err && <div style={{ marginBottom: 10 }}><Banner kind="danger">{err}</Banner></div>}
      <FieldEditor value={f} onChange={setF} modules={sub.modules} siblings={sub.fields} schemes={tree.product.schemes} roles={roles.data ?? []} />
    </Modal>
  );
}

export function FieldPanel({ field, sub, tree, editable, onSelect, productId, compact }: { field: Field; sub: SubStage; tree: VersionTree; editable: boolean; onSelect: (s: Sel) => void; productId: string; compact?: boolean }) {
  const roles = useRoles();
  const run = useRun();
  const confirm = useConfirm();
  const [f, setF] = useState<FieldDraft>(field);
  const [moving, setMoving] = useState(false);
  const [copy, setCopy] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(field);
  const stage = tree.stages.find((s) => s.id === sub.stageId)!;
  const mod = sub.modules.find((m) => m.id === field.moduleId);

  async function remove() {
    const ok = await confirm({ title: `Delete field "${field.label}"?`, danger: true, confirmText: 'Delete field', body: <p>The field is removed from this draft. Published versions keep it. To hide it without deleting, untick <em>Active</em> instead.</p> });
    if (!ok) return;
    try {
      await api.del(`/fields/${field.id}`);
      run.mutate({ fn: async () => null, ok: 'Field deleted' });
      onSelect({ type: 'subStage', id: sub.id });
    } catch (e) {
      const deps = (e as { details?: { dependants?: string[] } }).details?.dependants;
      if (deps && (await confirm({ title: 'Field is referenced by rules', danger: true, confirmText: 'Delete anyway', body: <p>{errMsg(e)}</p> }))) {
        run.mutate({ fn: () => api.del(`/fields/${field.id}?force=true`), ok: 'Field deleted' }, { onSuccess: () => onSelect({ type: 'subStage', id: sub.id }) });
      } else if (!deps) run.mutate({ fn: async () => { throw e; } });
    }
  }

  return (
    <div>
      <div className="card-head" style={{ alignItems: 'flex-start' }}>
        <div>
          {!compact && <div className="small muted"><a onClick={() => onSelect({ type: 'stage', id: stage.id })} style={{ cursor: 'pointer' }}>{stage.name}</a> › <a onClick={() => onSelect({ type: 'subStage', id: sub.id })} style={{ cursor: 'pointer' }}>{sub.name}</a>{mod && <> › {mod.name}</>} › Field</div>}
          <h2>{field.label} <span className="mono muted small">{field.key}</span> <NcBadge show={field.needsConfirmation} /></h2>
        </div>
        <div className="btn-group">
          {editable && <button className="btn" onClick={() => run.mutate({ fn: () => api.post(`/fields/${field.id}/duplicate`), ok: 'Field duplicated' })}><Copy size={14} /> Duplicate</button>}
          {editable && <button className="btn" onClick={() => setMoving(true)} data-testid="move-field"><ArrowRightLeft size={14} /> Move</button>}
          <button className="btn" onClick={() => setCopy(true)}><CopyPlus size={14} /> Apply to products</button>
          {editable && <button className="btn danger" onClick={remove} data-testid="delete-field"><Trash2 size={14} /></button>}
        </div>
      </div>
      <div className="card-body" style={{ paddingTop: 0 }}>
        <FieldEditor value={f} onChange={setF} modules={sub.modules} siblings={sub.fields} schemes={tree.product.schemes} roles={roles.data ?? []} readOnly={!editable} />
        {field.notes && <div style={{ marginTop: 12 }}><Banner kind={field.needsConfirmation ? 'warn' : 'info'}>{field.notes}</Banner></div>}
        {editable && (
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn primary" disabled={!dirty || !f.label.trim()} onClick={() => run.mutate({ fn: () => api.put(`/fields/${field.id}`, cleanFieldBody(f)), ok: 'Field saved' })} data-testid="save-field"><Save size={14} /> Save field</button>
            <button className="btn" disabled={!dirty} onClick={() => setF(field)}><Undo2 size={14} /> Cancel</button>
            {dirty && <span className="small muted">Unsaved changes</span>}
          </div>
        )}
      </div>
      {moving && <MoveFieldDialog field={field} tree={tree} onClose={() => setMoving(false)} run={run} />}
      {copy && <CopyDialogWrapper tree={tree} productId={productId} items={[{ type: 'field', ref: `${stage.key}/${sub.key}`, fieldKey: field.key }]} label={`${sub.name} › ${field.label}`} onClose={() => setCopy(false)} />}
    </div>
  );
}

function MoveSubStageDialog({ sub, tree, onClose, run }: { sub: SubStage; tree: VersionTree; onClose: () => void; run: Run }) {
  const [target, setTarget] = useState(tree.stages.find((s) => s.id !== sub.stageId)?.id ?? '');
  return (
    <Modal title={`Move "${sub.name}" to another stage`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!target} onClick={() => run.mutate({ fn: () => api.post(`/subStages/${sub.id}/move`, { targetStageId: target }), ok: 'Sub-stage moved' }, { onSuccess: onClose })} data-testid="confirm-move">Move</button></>}>
      <Labeled label="Destination stage" help="The sub-stage keeps all of its sections, fields, documents and workflow actions. It is placed at the end of the destination stage.">
        <select className="inp" value={target} onChange={(e) => setTarget(e.target.value)} data-testid="move-target">
          {tree.stages.filter((s) => s.id !== sub.stageId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Labeled>
    </Modal>
  );
}

function MoveFieldDialog({ field, tree, onClose, run }: { field: Field; tree: VersionTree; onClose: () => void; run: Run }) {
  const subs = tree.stages.flatMap((s) => s.subStages.map((ss) => ({ ...ss, stageName: s.name })));
  const [subId, setSubId] = useState(field.subStageId);
  const [modId, setModId] = useState<string>(field.moduleId ?? '');
  const target = subs.find((s) => s.id === subId);
  return (
    <Modal title={`Move field "${field.label}"`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => run.mutate({ fn: () => api.post(`/fields/${field.id}/move`, { targetSubStageId: subId, targetModuleId: modId || null }), ok: 'Field moved' }, { onSuccess: onClose })} data-testid="confirm-move-field">Move</button></>}>
      <div className="stack-lg">
        <Labeled label="Sub-stage">
          <select className="inp" value={subId} onChange={(e) => { setSubId(e.target.value); setModId(''); }}>
            {subs.map((s) => <option key={s.id} value={s.id}>{s.stageName} › {s.name}</option>)}
          </select>
        </Labeled>
        <Labeled label="Section">
          <select className="inp" value={modId} onChange={(e) => setModId(e.target.value)}>
            <option value="">(no section)</option>
            {target?.modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Labeled>
      </div>
    </Modal>
  );
}

function AddDialog({ title, onClose, onSave, withPlatform, withRole, withRepeatable }: { title: string; onClose: () => void; onSave: (v: Record<string, unknown>) => Promise<void>; withPlatform?: boolean; withRole?: boolean; withRepeatable?: boolean }) {
  const [v, setV] = useState<Record<string, unknown>>({ name: '', key: '', active: true });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const body = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x !== undefined));
      await onSave(body);
      onClose();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={title} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !String(v.name).trim()} onClick={save} data-testid="add-dialog-save"><Save size={14} /> Add</button></>}>
      {err && <div style={{ marginBottom: 10 }}><Banner kind="danger">{err}</Banner></div>}
      <PropsForm value={v} onChange={setV} editable withPlatform={withPlatform} withRole={withRole} withRepeatable={withRepeatable} />
      <div className="help" style={{ marginTop: 8 }}>Leave Key blank to generate it from the name.</div>
    </Modal>
  );
}
