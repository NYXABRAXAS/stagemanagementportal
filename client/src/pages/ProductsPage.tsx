import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useProducts } from '../lib/hooks';
import type { Product, Scheme } from '../lib/types';
import { Badge, Banner, Check, Empty, Labeled, Loading, Modal, NcBadge, SearchBox, StatusBadge, errMsg, useConfirm, useToast } from '../components/ui';

export default function ProductsPage() {
  const { can } = useAuth();
  const products = useProducts();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Partial<Product> | null>(null);
  const [clone, setClone] = useState<Product | null>(null);
  const [schemes, setSchemes] = useState<Product | null>(null);
  const manage = can('product.manage');

  if (!products.data) return <Loading />;
  const rows = products.data.filter((p) => !q || `${p.name} ${p.code} ${p.category ?? ''}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Product Catalogue</h1>
          <p>Each product has its own independent configuration and version history. Changing one product never changes another unless you explicitly use Clone or Copy to Products.</p>
        </div>
        <div className="row">
          <SearchBox value={q} onChange={setQ} placeholder="Search products" />
          {manage && <button className="btn primary" onClick={() => setEdit({ active: true })} data-testid="create-product"><Plus size={14} /> Create product</button>}
        </div>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="tbl" data-testid="products-table">
            <thead><tr><th>Product</th><th>Category</th><th>Schemes</th><th>Published</th><th>Open version</th><th>Configuration</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className={p.active ? '' : 'inactive'} data-testid={`product-row-${p.code}`}>
                  <td><Link to={`/stage-builder?product=${p.id}`}><strong>{p.name}</strong></Link><div className="small muted mono">{p.code}</div>{p.sourceNote && <div className="small muted" style={{ maxWidth: 320 }}>{p.sourceNote}</div>}</td>
                  <td>{p.category ?? '—'}</td>
                  <td className="small">{p.schemes.length ? p.schemes.map((s) => <div key={s.id}>{s.name}</div>) : <span className="muted">none</span>}</td>
                  <td>{p.published ? <>v{p.published.versionNo} <StatusBadge status="PUBLISHED" /></> : <span className="muted">not published</span>}</td>
                  <td>{p.openVersion ? <>v{p.openVersion.versionNo} <StatusBadge status={p.openVersion.status} /></> : <span className="muted">—</span>}</td>
                  <td className="small">{p.counts?.stages} stages · {p.counts?.subStages} sub-stages · {p.counts?.fields} fields</td>
                  <td>{p.active ? <Badge kind="ok">Active</Badge> : <Badge>Inactive</Badge>}</td>
                  <td>
                    <div className="btn-group">
                      <Link className="btn sm" to={`/stage-builder?product=${p.id}`}>Configure</Link>
                      {manage && <button className="btn sm" onClick={() => setEdit(p)}><Pencil size={12} /> Edit</button>}
                      {manage && <button className="btn sm" onClick={() => setSchemes(p)}>Schemes</button>}
                      {manage && can('config.create') && <button className="btn sm" onClick={() => setClone(p)} data-testid={`clone-${p.code}`}><Copy size={12} /> Clone</button>}
                      {manage && <button className="btn sm" onClick={async () => {
                        if (await confirm({ title: `${p.active ? 'Deactivate' : 'Activate'} ${p.name}?`, body: p.active ? 'The product stays in the catalogue with its full history but is marked inactive.' : 'The product becomes available again.', danger: p.active })) {
                          try { await api.patch(`/products/${p.id}/active`, { active: !p.active }); toast(`${p.name} ${p.active ? 'deactivated' : 'activated'}`, 'ok'); qc.invalidateQueries(); } catch (e) { toast(errMsg(e), 'error'); }
                        }
                      }}><Power size={12} /> {p.active ? 'Deactivate' : 'Activate'}</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <Empty title="No products match" />}
        </div>
      </div>
      <div style={{ marginTop: 14 }}><Banner>Compare product configurations on <Link to="/versions">Configuration Versions → Compare</Link>. Copy a stage, sub-stage or field to other products from the Stage Builder ("Copy to products" / "Apply to products").</Banner></div>
      {edit && <ProductDialog value={edit} onClose={() => setEdit(null)} />}
      {clone && <CloneDialog source={clone} onClose={() => setClone(null)} />}
      {schemes && <SchemesDialog product={products.data.find((p) => p.id === schemes.id)!} onClose={() => setSchemes(null)} />}
    </div>
  );
}

function ProductDialog({ value, onClose }: { value: Partial<Product>; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState({ code: value.code ?? '', name: value.name ?? '', category: value.category ?? '', description: value.description ?? '' });
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    try {
      if (value.id) await api.put(`/products/${value.id}`, { name: v.name, category: v.category || null, description: v.description || null });
      else await api.post('/products', { ...v, category: v.category || null, description: v.description || null });
      toast(value.id ? 'Product updated' : 'Product created with an empty draft configuration', 'ok');
      qc.invalidateQueries();
      onClose();
    } catch (e) { setErr(errMsg(e)); }
  }
  return (
    <Modal title={value.id ? `Edit ${value.name}` : 'Create product'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!v.code || !v.name} onClick={save} data-testid="save-product">Save</button></>}>
      {err && <div style={{ marginBottom: 10 }}><Banner kind="danger">{err}</Banner></div>}
      <div className="form-grid">
        <Labeled label="Product name" required><input className="inp" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value, code: value.id ? v.code : e.target.value.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '') })} data-testid="product-name" /></Labeled>
        <Labeled label="Code" required help="Permanent identifier (UPPER_CASE)."><input className="inp mono" value={v.code} disabled={!!value.id} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })} /></Labeled>
        <Labeled label="Category"><input className="inp" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} placeholder="e.g. Tractor" /></Labeled>
        <Labeled label="Description" full><textarea className="inp" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Labeled>
      </div>
      {!value.id && <div style={{ marginTop: 10 }}><Banner>The product starts with an empty draft. Build it in the Stage Builder, or use Clone on an existing product to start from its configuration.</Banner></div>}
    </Modal>
  );
}

function CloneDialog({ source, onClose }: { source: Product; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState({ name: `${source.name} (copy)`, code: `${source.code}_COPY`, includeSchemes: true });
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function run(confirm: boolean) {
    setErr(null);
    try {
      const r = await api.post<{ preview: Record<string, unknown> }>(`/products/${source.id}/clone`, { ...v, confirm });
      if (!confirm) setPreview(r.preview);
      else { toast(`Created ${v.name} from ${source.name}`, 'ok'); qc.invalidateQueries(); onClose(); }
    } catch (e) { setErr(errMsg(e)); }
  }
  return (
    <Modal title={`Clone ${source.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button>{!preview ? <button className="btn primary" onClick={() => run(false)} disabled={!v.name || !v.code} data-testid="clone-preview">Preview</button> : <button className="btn primary" onClick={() => run(true)} data-testid="clone-confirm">Confirm clone</button>}</>}>
      {err && <div style={{ marginBottom: 10 }}><Banner kind="danger">{err}</Banner></div>}
      {!preview ? (
        <div className="form-grid">
          <Labeled label="New product name" required><input className="inp" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Labeled>
          <Labeled label="New product code" required><input className="inp mono" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })} /></Labeled>
          <div className="full"><Check checked={v.includeSchemes} onChange={(x) => setV({ ...v, includeSchemes: x })} label="Copy schemes too (marked requires confirmation)" /></div>
        </div>
      ) : (
        <div className="stack">
          <Banner>{String(preview.note)}</Banner>
          <dl className="kv">
            <dt>Source</dt><dd>{(preview.source as { product: string; versionNo: number; status: string }).product} v{(preview.source as { versionNo: number }).versionNo} ({(preview.source as { status: string }).status})</dd>
            <dt>New product</dt><dd>{v.name} ({v.code})</dd>
            <dt>Stages</dt><dd>{String(preview.stages)}</dd><dt>Sub-stages</dt><dd>{String(preview.subStages)}</dd><dt>Fields</dt><dd>{String(preview.fields)}</dd>
            <dt>Documents</dt><dd>{String(preview.documents)}</dd><dt>Workflow actions</dt><dd>{String(preview.transitions)}</dd><dt>Schemes</dt><dd>{String(preview.schemes)}</dd>
          </dl>
        </div>
      )}
    </Modal>
  );
}

function SchemesDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [add, setAdd] = useState({ code: '', name: '' });
  const refresh = () => qc.invalidateQueries({ queryKey: ['products'] });
  const upd = async (s: Scheme, body: Partial<Scheme>) => { try { await api.put(`/schemes/${s.id}`, body); refresh(); } catch (e) { toast(errMsg(e), 'error'); } };
  return (
    <Modal wide title={`Schemes — ${product.name}`} onClose={onClose}>
      <div className="stack-lg">
        <Banner>Schemes let individual fields and documents apply only to certain schemes (Field → Access & Data).</Banner>
        <table className="tbl">
          <thead><tr><th>Code</th><th>Name</th><th>Active</th><th>Source</th><th /></tr></thead>
          <tbody>
            {product.schemes.map((s) => (
              <tr key={s.id}>
                <td className="mono">{s.code}</td>
                <td><input className="inp" defaultValue={s.name} onBlur={(e) => e.target.value !== s.name && upd(s, { name: e.target.value })} /> <NcBadge show={s.needsConfirmation} /></td>
                <td><input type="checkbox" checked={s.active} onChange={(e) => upd(s, { active: e.target.checked })} /></td>
                <td className="small muted">{s.sourceRef}</td>
                <td><button className="btn sm danger" onClick={async () => { if (await confirm({ title: `Delete scheme ${s.name}?`, danger: true, body: 'Fields restricted to this scheme code will keep the code but it will no longer appear as an option.' })) { await api.del(`/schemes/${s.id}`); refresh(); } }}><Trash2 size={12} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {product.schemes.length === 0 && <Empty title="No schemes" />}
        <div className="row">
          <input className="inp" placeholder="Code" value={add.code} onChange={(e) => setAdd({ ...add, code: e.target.value })} style={{ width: 180 }} />
          <input className="inp" placeholder="Scheme name" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} />
          <button className="btn primary" disabled={!add.code || !add.name} onClick={async () => { try { await api.post(`/products/${product.id}/schemes`, add); setAdd({ code: '', name: '' }); refresh(); } catch (e) { toast(errMsg(e), 'error'); } }}><Plus size={14} /> Add scheme</button>
        </div>
      </div>
    </Modal>
  );
}
