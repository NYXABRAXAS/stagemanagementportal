import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Library, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useSelectedProduct, useWorkingVersion } from '../lib/hooks';
import type { Field, SubStage } from '../lib/types';
import ProductBar from '../components/ProductBar';
import { FieldPanel, NewFieldDialog } from './StageBuilderPage';
import { blankField, type FieldDraft } from '../components/FieldEditor';
import { Badge, Banner, Empty, Labeled, Loading, Modal, SearchBox, errMsg, useConfirm, useToast } from '../components/ui';
import { FIELD_TYPES } from '../../../shared/src/ruleEngine';

const typeLabel = (t: string) => FIELD_TYPES.find((x) => x.code === t)?.label ?? t;

interface FieldDef { id: string; key: string; label: string; type: string; description: string | null }

export default function FieldBuilderPage() {
  const { products, product, select, loading } = useSelectedProduct();
  const { tree, editable, explicit } = useWorkingVersion(product);
  const [subId, setSubId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [req, setReq] = useState('');
  const [onlyNc, setOnlyNc] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [newField, setNewField] = useState<FieldDraft | null>(null);
  const [tab, setTab] = useState<'fields' | 'library'>('fields');

  const t = tree.data;
  const subs = useMemo(() => t?.stages.flatMap((s) => s.subStages.map((ss) => ({ ...ss, stageName: s.name, stageKey: s.key }))) ?? [], [t]);
  const currentSub = subs.find((s) => s.id === subId);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return subs
      .filter((s) => !subId || s.id === subId)
      .flatMap((s) => s.fields.map((f) => ({ f, s })))
      .filter(({ f }) => (!q || f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q)) && (!type || f.type === type) && (!req || f.requirement === req) && (!onlyNc || f.needsConfirmation));
  }, [subs, subId, search, type, req, onlyNc]);

  if (loading) return <Loading />;
  if (!product) return <Empty title="No products" />;
  const sel = selected ? rows.find((r) => r.f.id === selected) ?? subs.flatMap((s) => s.fields.map((f) => ({ f, s }))).find((r) => r.f.id === selected) : null;

  return (
    <div>
      <ProductBar products={products} product={product} onSelect={(id) => { select(id); setSubId(''); setSelected(null); }} tree={t} explicitVersion={explicit} />
      <div className="tabs" style={{ marginBottom: 12 }}>
        <button className={tab === 'fields' ? 'on' : ''} onClick={() => setTab('fields')}>Configured fields</button>
        <button className={tab === 'library' ? 'on' : ''} onClick={() => setTab('library')}><Library size={13} style={{ verticalAlign: -2 }} /> Field library</button>
      </div>
      {tab === 'library' ? <LibraryTab subs={subs} editable={editable} /> : !t ? <Loading /> : (
        <div className="stack-lg">
          <div className="card" style={{ padding: 12 }}>
            <div className="row wrap" style={{ gap: 10 }}>
              <select className="inp" style={{ width: 320 }} value={subId} onChange={(e) => { setSubId(e.target.value); setSelected(null); }} aria-label="Sub-stage" data-testid="fb-substage">
                <option value="">All sub-stages ({subs.reduce((n, s) => n + s.fields.length, 0)} fields)</option>
                {t.stages.map((s) => (
                  <optgroup key={s.id} label={s.name}>
                    {s.subStages.map((ss) => <option key={ss.id} value={ss.id}>{ss.name} ({ss.fields.length})</option>)}
                  </optgroup>
                ))}
              </select>
              <SearchBox value={search} onChange={setSearch} placeholder="Search label or key" />
              <select className="inp" style={{ width: 170 }} value={type} onChange={(e) => setType(e.target.value)} aria-label="Type filter">
                <option value="">All types</option>
                {FIELD_TYPES.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
              </select>
              <select className="inp" style={{ width: 160 }} value={req} onChange={(e) => setReq(e.target.value)} aria-label="Requirement filter">
                <option value="">Any requirement</option><option value="MANDATORY">Mandatory</option><option value="OPTIONAL">Optional</option><option value="CONDITIONAL">Conditional</option>
              </select>
              <label className="check"><input type="checkbox" checked={onlyNc} onChange={(e) => setOnlyNc(e.target.checked)} /> Requires confirmation only</label>
              <div style={{ flex: 1 }} />
              {editable && <button className="btn primary" disabled={!currentSub} title={currentSub ? '' : 'Select a sub-stage first'} onClick={() => setNewField(blankField(currentSub?.modules[0]?.id ?? null))} data-testid="fb-add-field"><Plus size={14} /> Add field</button>}
            </div>
          </div>
          <div className="grid" style={{ gridTemplateColumns: sel ? 'minmax(0,1fr) minmax(0,1.15fr)' : '1fr' }}>
            <div className="card">
              <div className="card-head"><h2>{rows.length} field(s)</h2></div>
              <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 330px)' }}>
                <table className="tbl">
                  <thead><tr><th>Field</th><th>Sub-stage / section</th><th>Type</th><th>Requirement</th></tr></thead>
                  <tbody>
                    {rows.slice(0, 600).map(({ f, s }) => (
                      <tr key={f.id} onClick={() => setSelected(f.id)} style={{ cursor: 'pointer', background: selected === f.id ? '#eef4fb' : undefined }} className={f.active ? '' : 'inactive'}>
                        <td>{f.label}{f.needsConfirmation && <> <span className="nc-dot" style={{ display: 'inline-block' }} /></>}<div className="small muted mono">{f.key}</div></td>
                        <td className="small">{s.name}{f.moduleId && <div className="muted">{s.modules.find((m) => m.id === f.moduleId)?.name}</div>}</td>
                        <td className="small">{typeLabel(f.type)}</td>
                        <td>{f.requirement === 'MANDATORY' ? <Badge kind="danger">Mandatory</Badge> : f.requirement === 'CONDITIONAL' ? <Badge kind="warn">Conditional</Badge> : <Badge>Optional</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length === 0 && <Empty title="No matching fields" />}
                {rows.length > 600 && <div className="small muted" style={{ padding: 10 }}>Showing first 600 — narrow the filter.</div>}
              </div>
            </div>
            {sel && (
              <div className="card" style={{ maxHeight: 'calc(100vh - 260px)', overflow: 'auto' }}>
                <FieldPanel key={sel.f.id} field={sel.f as Field} sub={sel.s as SubStage} tree={t} editable={editable} productId={product.id} onSelect={(s) => s?.type !== 'field' && setSelected(null)} />
              </div>
            )}
          </div>
        </div>
      )}
      {newField && currentSub && t && <NewFieldDialog sub={currentSub} tree={t} draft={newField} onClose={() => setNewField(null)} onCreated={(f) => { setNewField(null); setSelected(f.id); }} />}
    </div>
  );
}

function LibraryTab({ subs, editable }: { subs: (SubStage & { stageName: string })[]; editable: boolean }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const defs = useQuery({ queryKey: ['field-definitions'], queryFn: () => api.get<FieldDef[]>('/field-definitions') });
  const [add, setAdd] = useState(false);
  const [form, setForm] = useState({ key: '', label: '', type: 'TEXT', description: '' });
  const [use, setUse] = useState<FieldDef | null>(null);
  const [target, setTarget] = useState('');
  return (
    <div className="card">
      <div className="card-head">
        <div><h2>Reusable field definitions</h2><div className="small muted">Save common fields once (e.g. PAN Number) and add them to any sub-stage. Each added field is an independent copy.</div></div>
        {can('config.create') && <button className="btn primary" onClick={() => setAdd(true)}><Plus size={14} /> New definition</button>}
      </div>
      {!defs.data ? <Loading /> : defs.data.length === 0 ? <Empty title="Library is empty">Add a definition to reuse it across products.</Empty> : (
        <table className="tbl">
          <thead><tr><th>Label</th><th>Key</th><th>Type</th><th>Description</th><th /></tr></thead>
          <tbody>
            {defs.data.map((d) => (
              <tr key={d.id}>
                <td>{d.label}</td><td className="mono small">{d.key}</td><td>{typeLabel(d.type)}</td><td className="small">{d.description}</td>
                <td className="btn-group">
                  {editable && <button className="btn sm" onClick={() => { setUse(d); setTarget(subs[0]?.id ?? ''); }}>Add to sub-stage</button>}
                  {can('config.delete') && <button className="btn sm danger" onClick={async () => { if (await confirm({ title: `Remove "${d.label}" from the library?`, danger: true, body: 'Fields already created from it are not affected.' })) { await api.del(`/field-definitions/${d.id}`); qc.invalidateQueries({ queryKey: ['field-definitions'] }); } }}><Trash2 size={12} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {add && (
        <Modal title="New field definition" onClose={() => setAdd(false)} footer={<><button className="btn" onClick={() => setAdd(false)}>Cancel</button><button className="btn primary" disabled={!form.key || !form.label} onClick={async () => {
          try { await api.post('/field-definitions', form); toast('Definition added', 'ok'); setAdd(false); qc.invalidateQueries({ queryKey: ['field-definitions'] }); } catch (e) { toast(errMsg(e), 'error'); }
        }}>Save</button></>}>
          <div className="form-grid">
            <Labeled label="Label" required><input className="inp" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></Labeled>
            <Labeled label="Key" required><input className="inp mono" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value.replace(/[^A-Za-z0-9_]/g, '') })} /></Labeled>
            <Labeled label="Type"><select className="inp" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{FIELD_TYPES.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}</select></Labeled>
            <Labeled label="Description"><input className="inp" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Labeled>
          </div>
        </Modal>
      )}
      {use && (
        <Modal title={`Add "${use.label}" to a sub-stage`} onClose={() => setUse(null)} footer={<><button className="btn" onClick={() => setUse(null)}>Cancel</button><button className="btn primary" disabled={!target} onClick={async () => {
          try { await api.post(`/subStages/${target}/fields`, { key: use.key, label: use.label, type: use.type, definitionId: use.id }); toast('Field added from library', 'ok'); setUse(null); qc.invalidateQueries({ queryKey: ['tree'] }); } catch (e) { toast(errMsg(e), 'error'); }
        }}>Add</button></>}>
          <Banner>Adds to the working draft of the selected product.</Banner>
          <div style={{ marginTop: 10 }}>
            <Labeled label="Sub-stage"><select className="inp" value={target} onChange={(e) => setTarget(e.target.value)}>{subs.map((s) => <option key={s.id} value={s.id}>{s.stageName} › {s.name}</option>)}</select></Labeled>
          </div>
        </Modal>
      )}
    </div>
  );
}
