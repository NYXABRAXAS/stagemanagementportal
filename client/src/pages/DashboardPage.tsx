import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Badge, Empty, Loading, StatusBadge, fmtDate } from '../components/ui';
import type { AuditEntry } from '../lib/types';

interface Dash {
  totals: Record<string, number>;
  products: { id: string; name: string; code: string; active: boolean; published: number | null; openVersion: { versionNo: number; status: string } | null; emptySubStages: number; emptyStages: number; needsConfirmation: number; incomplete: boolean }[];
  recent: AuditEntry[];
}

export default function DashboardPage() {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dash>('/dashboard') });
  if (q.isLoading || !q.data) return <Loading />;
  const t = q.data.totals;
  const stats = [
    { label: 'Total products', value: t.products, hint: `${t.activeProducts} active` },
    { label: 'Configured products', value: t.configuredProducts, hint: 'have a published configuration' },
    { label: 'Draft configurations', value: t.draftConfigurations, hint: `${t.pendingApproval} awaiting approval / publish` },
    { label: 'Published configurations', value: t.publishedConfigurations, hint: `${t.archivedConfigurations} archived versions kept` },
    { label: 'Incomplete configurations', value: t.incompleteConfigurations, hint: 'unpublished, or empty stages / sub-stages' },
  ];
  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Configuration status across all LOS products. Seeded source baselines are marked as pending business confirmation.</p>
        </div>
        <div className="btn-group">
          <Link className="btn primary" to="/stage-builder">Open Stage Builder</Link>
          <Link className="btn" to="/versions">Versions</Link>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        {stats.map((s) => (
          <div className="card stat" key={s.label} data-testid={`stat-${s.label}`}>
            <div className="label">{s.label}</div>
            <div className="value">{s.value}</div>
            <div className="hint">{s.hint}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-2">
        <div className="card">
          <div className="card-head"><h2>Products</h2><Link to="/products" className="small">Product Catalogue →</Link></div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Product</th><th>Published</th><th>Open version</th><th>Gaps</th><th>To confirm</th></tr></thead>
              <tbody>
                {q.data.products.map((p) => (
                  <tr key={p.id} className={p.active ? '' : 'inactive'}>
                    <td><Link to={`/stage-builder?product=${p.id}`}>{p.name}</Link>{!p.active && <> <Badge>Inactive</Badge></>}</td>
                    <td>{p.published ? <StatusBadge status="PUBLISHED" /> : <span className="muted">—</span>} {p.published && <span className="small muted">v{p.published}</span>}</td>
                    <td>{p.openVersion ? <><StatusBadge status={p.openVersion.status} /> <span className="small muted">v{p.openVersion.versionNo}</span></> : <span className="muted">—</span>}</td>
                    <td>{p.incomplete ? <Badge kind="danger">{p.emptySubStages + p.emptyStages} empty</Badge> : <Badge kind="ok">Complete</Badge>}</td>
                    <td>{p.needsConfirmation ? <Badge kind="warn">{p.needsConfirmation}</Badge> : <span className="muted">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Recent configuration changes</h2>{can('audit.view') && <Link to="/audit" className="small">Audit history →</Link>}</div>
          {!can('audit.view') ? (
            <Empty title="Not available">Your role cannot view audit history.</Empty>
          ) : q.data.recent.length === 0 ? (
            <Empty title="No changes yet" />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <tbody>
                  {q.data.recent.map((a) => (
                    <tr key={a.id}>
                      <td style={{ width: 140 }} className="small muted">{fmtDate(a.at)}</td>
                      <td><Badge kind="brand">{a.action}</Badge></td>
                      <td>{a.summary}<div className="small muted">by {a.username}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
