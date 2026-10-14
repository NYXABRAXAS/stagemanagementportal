import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useProducts } from '../lib/hooks';
import type { AuditEntry } from '../lib/types';
import { Badge, Empty, Loading, Modal, SearchBox, fmtDate } from '../components/ui';

const ENTITIES = ['Product', 'Scheme', 'ConfigVersion', 'Stage', 'SubStage', 'Module', 'Field', 'FieldDefinition', 'DocumentRequirement', 'WorkflowTransition', 'Role', 'User', 'SystemSetting'];

export default function AuditPage() {
  const { can } = useAuth();
  const products = useProducts();
  const [f, setF] = useState({ search: '', entityType: '', productId: '', username: '', from: '', to: '', page: 1 });
  const [open, setOpen] = useState<AuditEntry | null>(null);
  const data = useQuery({ queryKey: ['audit', f], queryFn: () => api.get<{ total: number; items: AuditEntry[]; pageSize: number }>(`/audit${qs(f)}`), enabled: can('audit.view') });
  if (!can('audit.view')) return <Empty title="Not permitted">Your role cannot view audit history.</Empty>;
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v, page: 1 });
  const pages = data.data ? Math.max(1, Math.ceil(data.data.total / data.data.pageSize)) : 1;
  return (
    <div>
      <div className="page-head">
        <div><h1>Audit History</h1><p>Every configuration change, approval, publication, role change and sign-in is recorded with who, when and the before / after values.</p></div>
      </div>
      <div className="card" style={{ padding: 12, marginBottom: 14 }}>
        <div className="row wrap">
          <SearchBox value={f.search} onChange={(v) => set('search', v)} placeholder="Search summary" />
          <select className="inp" style={{ width: 190 }} value={f.entityType} onChange={(e) => set('entityType', e.target.value)} aria-label="Entity"><option value="">All entities</option>{ENTITIES.map((e) => <option key={e}>{e}</option>)}</select>
          <select className="inp" style={{ width: 210 }} value={f.productId} onChange={(e) => set('productId', e.target.value)} aria-label="Product"><option value="">All products</option>{products.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <input className="inp" style={{ width: 150 }} placeholder="User" value={f.username} onChange={(e) => set('username', e.target.value)} />
          <input className="inp" style={{ width: 150 }} type="date" value={f.from} onChange={(e) => set('from', e.target.value)} aria-label="From" />
          <input className="inp" style={{ width: 150 }} type="date" value={f.to} onChange={(e) => set('to', e.target.value)} aria-label="To" />
        </div>
      </div>
      <div className="card">
        {!data.data ? <Loading /> : data.data.items.length === 0 ? <Empty title="No audit entries match" /> : (
          <>
            <div className="table-wrap">
              <table className="tbl" data-testid="audit-table">
                <thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>Summary</th><th /></tr></thead>
                <tbody>
                  {data.data.items.map((a) => (
                    <tr key={a.id}>
                      <td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDate(a.at)}</td>
                      <td className="small">{a.username}</td>
                      <td><Badge kind="brand">{a.action}</Badge></td>
                      <td className="small">{a.entityType}</td>
                      <td>{a.summary}</td>
                      <td>{(a.before != null || a.after != null) && <button className="btn sm" onClick={() => setOpen(a)}>Details</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row between" style={{ padding: 10 }}>
              <span className="small muted">{data.data.total} entries</span>
              <div className="row">
                <button className="btn sm" disabled={f.page <= 1} onClick={() => setF({ ...f, page: f.page - 1 })}>Previous</button>
                <span className="small">Page {f.page} / {pages}</span>
                <button className="btn sm" disabled={f.page >= pages} onClick={() => setF({ ...f, page: f.page + 1 })}>Next</button>
              </div>
            </div>
          </>
        )}
      </div>
      {open && (
        <Modal wide title={open.summary} onClose={() => setOpen(null)}>
          <div className="grid grid-2">
            <div><label className="lbl">Before</label><pre className="json">{JSON.stringify(open.before, null, 2) ?? '—'}</pre></div>
            <div><label className="lbl">After</label><pre className="json">{JSON.stringify(open.after, null, 2) ?? '—'}</pre></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
