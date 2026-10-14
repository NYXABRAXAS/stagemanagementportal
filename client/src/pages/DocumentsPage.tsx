import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useRoles, useSelectedProduct, useWorkingVersion } from '../lib/hooks';
import type { DocumentReq, VersionTree } from '../lib/types';
import ProductBar from '../components/ProductBar';
import { Badge, Banner, Check, Empty, Labeled, Loading, Modal, NcBadge, SearchBox, errMsg, useConfirm, useToast } from '../components/ui';

const CAPTURE = ['CAMERA', 'UPLOAD', 'CAMERA_OR_UPLOAD', 'SYSTEM_GENERATED'];

export default function DocumentsPage() {
  const { products, product, select, loading } = useSelectedProduct();
  const { versionId, tree, editable, explicit } = useWorkingVersion(product);
  const list = useQuery({ queryKey: ['documents', versionId], queryFn: () => api.get<DocumentReq[]>(`/versions/${versionId}/documents`), enabled: !!versionId });
  const confirm = useConfirm();
  const toast = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Partial<DocumentReq> | null>(null);
  const rows = useMemo(() => (list.data ?? []).filter((d) => !q || `${d.name} ${d.code} ${d.category ?? ''} ${d.subStage?.name ?? ''}`.toLowerCase().includes(q.toLowerCase())), [list.data, q]);

  if (loading) return <Loading />;
  if (!product) return <Empty title="No products" />;

  return (
    <div>
      <ProductBar products={products} product={product} onSelect={select} tree={tree.data} explicitVersion={explicit} />
      <div className="card">
        <div className="card-head">
          <div className="row"><h2>Document requirements</h2><SearchBox value={q} onChange={setQ} placeholder="Search documents" /></div>
          {editable && <button className="btn primary" onClick={() => setEditing({ requirement: 'MANDATORY', captureMode: 'CAMERA_OR_UPLOAD', minCount: 1, active: true, schemeCodes: [], validatedByRoleCodes: [] })} data-testid="add-document"><Plus size={14} /> Add document</button>}
        </div>
        {!list.data ? <Loading /> : rows.length === 0 ? <Empty title="No document requirements">Configure which documents each sub-stage collects and who validates them.</Empty> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Document</th><th>Category</th><th>Captured at</th><th>Requirement</th><th>Capture</th><th>Count</th><th>Validated by</th><th /></tr></thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} className={d.active ? '' : 'inactive'}>
                    <td>{d.name} <NcBadge show={d.needsConfirmation} /><div className="small muted mono">{d.code}</div></td>
                    <td className="small">{d.category ?? '—'}</td>
                    <td className="small">{d.subStage ? `${d.subStage.stage.name} › ${d.subStage.name}` : 'Any stage'}</td>
                    <td>{d.requirement === 'MANDATORY' ? <Badge kind="danger">Mandatory</Badge> : d.requirement === 'CONDITIONAL' ? <Badge kind="warn">Conditional</Badge> : <Badge>Optional</Badge>}</td>
                    <td className="small">{d.captureMode.replace(/_/g, ' ').toLowerCase()}</td>
                    <td className="small">{d.minCount}{d.maxCount ? `–${d.maxCount}` : '+'}</td>
                    <td className="small">{d.validatedByRoleCodes.join(', ') || '—'}</td>
                    <td className="btn-group" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn sm" onClick={() => setEditing(d)}>{editable ? <><Pencil size={12} /> Edit</> : 'View'}</button>
                      {editable && <button className="btn sm danger" onClick={async () => {
                        if (!(await confirm({ title: `Delete "${d.name}"?`, danger: true, body: 'Removes the requirement from this draft. Workflow actions that require this document code will no longer find it.' }))) return;
                        try { await api.del(`/documents/${d.id}`); toast('Document requirement deleted', 'ok'); qc.invalidateQueries({ queryKey: ['documents'] }); } catch (e) { toast(errMsg(e), 'error'); }
                      }}><Trash2 size={12} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && tree.data && <DocDialog value={editing} tree={tree.data} editable={editable} onClose={() => setEditing(null)} />}
    </div>
  );
}

function DocDialog({ value, tree, editable, onClose }: { value: Partial<DocumentReq>; tree: VersionTree; editable: boolean; onClose: () => void }) {
  const roles = useRoles();
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState(value);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof DocumentReq>(k: K, x: DocumentReq[K]) => setV((s) => ({ ...s, [k]: x }));
  const subs = tree.stages.flatMap((s) => s.subStages.map((ss) => ({ id: ss.id, label: `${s.name} › ${ss.name}` })));
  const toggle = (k: 'schemeCodes' | 'validatedByRoleCodes', c: string) => { const l = (v[k] ?? []) as string[]; set(k, l.includes(c) ? l.filter((x) => x !== c) : [...l, c]); };
  async function save() {
    setErr(null);
    const body = {
      subStageId: v.subStageId || null, code: v.code, name: v.name, category: v.category || null, requirement: v.requirement, captureMode: v.captureMode,
      allowedTypes: v.allowedTypes || null, maxSizeMb: v.maxSizeMb ?? null, minCount: v.minCount ?? 1, maxCount: v.maxCount ?? null,
      schemeCodes: v.schemeCodes ?? [], validatedByRoleCodes: v.validatedByRoleCodes ?? [], active: v.active !== false, needsConfirmation: !!v.needsConfirmation,
      sourceRef: v.sourceRef || null, notes: v.notes || null,
    };
    try {
      if (v.id) await api.put(`/documents/${v.id}`, body); else await api.post(`/versions/${tree.id}/documents`, body);
      toast('Document requirement saved', 'ok');
      qc.invalidateQueries({ queryKey: ['documents'] });
      qc.invalidateQueries({ queryKey: ['tree'] });
      onClose();
    } catch (e) { setErr(errMsg(e)); }
  }
  return (
    <Modal wide title={v.id ? `Document — ${v.name}` : 'Add document requirement'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>{editable ? 'Cancel' : 'Close'}</button>{editable && <button className="btn primary" onClick={save} disabled={!v.code || !v.name} data-testid="save-document">Save</button>}</>}>
      {err && <div style={{ marginBottom: 10 }}><Banner kind="danger">{err}</Banner></div>}
      <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0 }} className="stack-lg">
        <div className="form-grid">
          <Labeled label="Document name" required><input className="inp" value={v.name ?? ''} onChange={(e) => setV((s) => ({ ...s, name: e.target.value, code: s.id ? s.code : e.target.value.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '') }))} data-testid="doc-name" /></Labeled>
          <Labeled label="Code" required><input className="inp mono" value={v.code ?? ''} onChange={(e) => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))} /></Labeled>
          <Labeled label="Category" help="e.g. KYC / OVD, Income, Scheme, Pre-Disbursement"><input className="inp" value={v.category ?? ''} onChange={(e) => set('category', e.target.value)} /></Labeled>
          <Labeled label="Captured in sub-stage"><select className="inp" value={v.subStageId ?? ''} onChange={(e) => set('subStageId', e.target.value || null)}><option value="">Any stage</option>{subs.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Labeled>
          <Labeled label="Requirement"><select className="inp" value={v.requirement} onChange={(e) => set('requirement', e.target.value)}><option>MANDATORY</option><option>OPTIONAL</option><option>CONDITIONAL</option></select></Labeled>
          <Labeled label="Capture mode"><select className="inp" value={v.captureMode} onChange={(e) => set('captureMode', e.target.value)}>{CAPTURE.map((c) => <option key={c}>{c}</option>)}</select></Labeled>
          <Labeled label="Allowed file types" help="comma-separated, e.g. jpg,png,pdf"><input className="inp" value={v.allowedTypes ?? ''} onChange={(e) => set('allowedTypes', e.target.value)} /></Labeled>
          <Labeled label="Max size (MB)"><input className="inp" type="number" value={v.maxSizeMb ?? ''} onChange={(e) => set('maxSizeMb', e.target.value === '' ? null : Number(e.target.value))} /></Labeled>
          <Labeled label="Minimum count"><input className="inp" type="number" min={0} value={v.minCount ?? 1} onChange={(e) => set('minCount', Number(e.target.value))} /></Labeled>
          <Labeled label="Maximum count"><input className="inp" type="number" min={1} value={v.maxCount ?? ''} onChange={(e) => set('maxCount', e.target.value === '' ? null : Number(e.target.value))} /></Labeled>
        </div>
        <div><label className="lbl">Validated by roles</label><div className="chips">{roles.data?.filter((r) => r.roleType === 'LOS').map((r) => <button type="button" key={r.code} className={`chip ${(v.validatedByRoleCodes ?? []).includes(r.code) ? 'on' : ''}`} onClick={() => toggle('validatedByRoleCodes', r.code)}>{r.name}</button>)}</div></div>
        <div><label className="lbl">Scheme applicability (none = all)</label><div className="chips">{tree.product.schemes.map((s) => <button type="button" key={s.code} className={`chip ${(v.schemeCodes ?? []).includes(s.code) ? 'on' : ''}`} onClick={() => toggle('schemeCodes', s.code)}>{s.name}</button>)}{tree.product.schemes.length === 0 && <span className="muted small">No schemes.</span>}</div></div>
        <div className="row" style={{ gap: 18 }}>
          <Check checked={v.active !== false} onChange={(x) => set('active', x)} label="Active" />
          <Check checked={!!v.needsConfirmation} onChange={(x) => set('needsConfirmation', x)} label="Requires confirmation" />
        </div>
        <div className="form-grid">
          <Labeled label="Notes" full><textarea className="inp" rows={2} value={v.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Labeled>
          <Labeled label="Source reference" full><input className="inp" value={v.sourceRef ?? ''} onChange={(e) => set('sourceRef', e.target.value)} /></Labeled>
        </div>
      </fieldset>
    </Modal>
  );
}
