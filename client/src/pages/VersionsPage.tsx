import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, GitCompare, RotateCcw, Send, ThumbsDown, ThumbsUp, Trash2, Undo2, Upload } from 'lucide-react';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useProducts, useSelectedProduct } from '../lib/hooks';
import type { DiffResult, ValidationReport, Version } from '../lib/types';
import DiffView from '../components/DiffView';
import { Badge, Banner, Empty, Labeled, Loading, Modal, StatusBadge, errMsg, fmtDate, useConfirm, useToast } from '../components/ui';

export default function VersionsPage() {
  const { products, product, select, loading } = useSelectedProduct();
  const { can, user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const versions = useQuery({ queryKey: ['versions', product?.id], queryFn: () => api.get<Version[]>(`/products/${product!.id}/versions`), enabled: !!product });
  const [diffFor, setDiffFor] = useState<Version | null>(null);
  const [validation, setValidation] = useState<{ v: Version; r: ValidationReport } | null>(null);
  const [reject, setReject] = useState<Version | null>(null);
  const [tab, setTab] = useState<'versions' | 'compare'>('versions');

  if (loading) return <Loading />;
  if (!product) return <Empty title="No products" />;

  async function act(v: Version, action: string, body?: unknown, ok?: string) {
    try {
      await api.post(`/versions/${v.id}/${action}`, body);
      toast(ok ?? 'Done', 'ok');
      qc.invalidateQueries();
    } catch (e) {
      const details = (e as { details?: ValidationReport }).details;
      if (details && 'errors' in details) setValidation({ v, r: details });
      toast(errMsg(e), 'error');
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Configuration Versions</h1>
          <p>Draft → Submit → Approve → Publish. Published versions are immutable; previous versions stay available for audit and can be restored as a new draft. Customer applications keep the version they started with.</p>
        </div>
        <select className="inp" style={{ width: 260 }} value={product.id} onChange={(e) => select(e.target.value)} aria-label="Product" data-testid="versions-product">
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="tabs" style={{ marginBottom: 12 }}>
        <button className={tab === 'versions' ? 'on' : ''} onClick={() => setTab('versions')}>Version history</button>
        <button className={tab === 'compare' ? 'on' : ''} onClick={() => setTab('compare')} data-testid="tab-compare"><GitCompare size={13} style={{ verticalAlign: -2 }} /> Compare configurations</button>
      </div>
      {tab === 'compare' ? <ComparePanel /> : (
        <div className="card">
          {!versions.data ? <Loading /> : versions.data.length === 0 ? <Empty title="No versions" /> : (
            <div className="table-wrap">
              <table className="tbl" data-testid="versions-table">
                <thead><tr><th>Version</th><th>Status</th><th>Title</th><th>Created / modified</th><th>Submitted</th><th>Approved</th><th>Published</th><th>Actions</th></tr></thead>
                <tbody>
                  {versions.data.map((v) => {
                    const mine = v.submittedByName === user?.username;
                    return (
                      <tr key={v.id}>
                        <td><strong>v{v.versionNo}</strong></td>
                        <td><StatusBadge status={v.status} /></td>
                        <td className="small" style={{ maxWidth: 260 }}>{v.title}{v.rejectionNote && <div className="danger-text">Returned: {v.rejectionNote}</div>}</td>
                        <td className="small">{v.createdByName ?? '—'} · {fmtDate(v.createdAt)}<div className="muted">last edit: {v.lastModifiedByName ?? '—'} · {fmtDate(v.updatedAt)}</div></td>
                        <td className="small">{v.submittedByName ? <>{v.submittedByName}<div className="muted">{fmtDate(v.submittedAt)}</div></> : '—'}</td>
                        <td className="small">{v.approvedByName ? <>{v.approvedByName}<div className="muted">{fmtDate(v.approvedAt)}</div></> : '—'}</td>
                        <td className="small">{v.publishedByName ? <>{v.publishedByName}<div className="muted">{fmtDate(v.publishedAt)}</div></> : '—'}</td>
                        <td>
                          <div className="btn-group">
                            <Link className="btn sm" to={`/stage-builder?product=${product.id}&version=${v.id}`}>Open</Link>
                            <button className="btn sm" onClick={() => setDiffFor(v)} data-testid={`diff-v${v.versionNo}`}><GitCompare size={12} /> Diff</button>
                            <button className="btn sm" onClick={async () => setValidation({ v, r: await api.post<ValidationReport>(`/versions/${v.id}/validate`) })}><CheckCircle2 size={12} /> Validate</button>
                            {v.status === 'DRAFT' && can('config.submit') && <button className="btn sm primary" onClick={() => act(v, 'submit', {}, `v${v.versionNo} submitted for approval`)} data-testid={`submit-v${v.versionNo}`}><Send size={12} /> Submit</button>}
                            {['SUBMITTED', 'APPROVED'].includes(v.status) && can('config.submit') && <button className="btn sm" onClick={() => act(v, 'withdraw', {}, 'Withdrawn to draft')}><Undo2 size={12} /> Withdraw</button>}
                            {v.status === 'SUBMITTED' && can('config.approve') && <button className="btn sm ok" disabled={mine} title={mine ? 'Maker-checker: another user must approve' : ''} onClick={() => act(v, 'approve', {}, `v${v.versionNo} approved`)} data-testid={`approve-v${v.versionNo}`}><ThumbsUp size={12} /> Approve</button>}
                            {['SUBMITTED', 'APPROVED'].includes(v.status) && can('config.approve') && <button className="btn sm danger" onClick={() => setReject(v)}><ThumbsDown size={12} /> Reject</button>}
                            {['APPROVED', 'SUBMITTED'].includes(v.status) && can('config.publish') && <button className="btn sm primary" onClick={async () => {
                              const ok = await confirm({ title: `Publish v${v.versionNo} of ${product.name}?`, confirmText: 'Publish', body: publishBody(v.versionNo) });
                              if (ok) act(v, 'publish', {}, `v${v.versionNo} published`);
                            }} data-testid={`publish-v${v.versionNo}`}><Upload size={12} /> Publish</button>}
                            {['PUBLISHED', 'ARCHIVED'].includes(v.status) && can('config.publish') && can('config.create') && <button className="btn sm" onClick={async () => {
                              if (await confirm({ title: `Restore v${v.versionNo}?`, confirmText: 'Create restore draft', body: 'A new draft is created with the content of this version. It must be submitted, approved and published like any other change. History is not rewritten.' })) act(v, 'rollback', {}, `Draft created from v${v.versionNo}`);
                            }} data-testid={`rollback-v${v.versionNo}`}><RotateCcw size={12} /> Restore</button>}
                            {v.status === 'DRAFT' && can('config.delete') && <button className="btn sm danger" onClick={async () => {
                              if (await confirm({ title: `Discard draft v${v.versionNo}?`, danger: true, confirmText: 'Discard draft', body: 'All unpublished changes in this draft are permanently removed. Published versions are not affected.' })) {
                                try { await api.del(`/versions/${v.id}`); toast('Draft discarded', 'ok'); qc.invalidateQueries(); } catch (e) { toast(errMsg(e), 'error'); }
                              }
                            }}><Trash2 size={12} /></button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {diffFor && <DiffModal v={diffFor} versions={versions.data ?? []} onClose={() => setDiffFor(null)} />}
      {validation && (
        <Modal wide title={`Validation — v${validation.v.versionNo}`} onClose={() => setValidation(null)}>
          <div className="stack" data-testid="validation-modal">
            {validation.r.valid ? <Banner kind="ok">No blocking errors. {validation.r.warnings.length} warning(s).</Banner> : <Banner kind="danger">{validation.r.errors.length} error(s) must be fixed before submitting / publishing.</Banner>}
            <div className="row wrap">{Object.entries(validation.r.stats).map(([k, n]) => <Badge key={k}>{k}: {n}</Badge>)}</div>
            {validation.r.errors.map((e, i) => <div key={i} className="small danger-text"><strong>{e.path}</strong> — {e.message}</div>)}
            <div style={{ maxHeight: 320, overflow: 'auto' }}>{validation.r.warnings.map((e, i) => <div key={i} className="small"><Badge kind="warn">warning</Badge> <strong>{e.path}</strong> — {e.message}</div>)}</div>
          </div>
        </Modal>
      )}
      {reject && <RejectModal v={reject} onClose={() => setReject(null)} onReject={(reason) => { act(reject, 'reject', { reason }, 'Returned to draft'); setReject(null); }} />}
    </div>
  );
}

function publishBody(versionNo: number) {
  return (
    <div className="stack">
      <p>The current published version will be archived (kept for audit and rollback). New applications will use v{versionNo}; existing applications keep their original version.</p>
      <Banner>Review the Diff before publishing.</Banner>
    </div>
  );
}

function RejectModal({ v, onClose, onReject }: { v: Version; onClose: () => void; onReject: (r: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <Modal title={`Reject v${v.versionNo}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn danger solid" disabled={reason.trim().length < 3} onClick={() => onReject(reason)}>Reject and return to draft</button></>}>
      <Labeled label="Reason" required><textarea className="inp" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Labeled>
    </Modal>
  );
}

function DiffModal({ v, versions, onClose }: { v: Version; versions: Version[]; onClose: () => void }) {
  const [against, setAgainst] = useState('base');
  const diff = useQuery({ queryKey: ['diff', v.id, against], queryFn: () => api.get<DiffResult & { against: { versionNo: number; status: string } | null }>(`/versions/${v.id}/diff${qs({ against })}`) });
  return (
    <Modal wide title={`Changes in v${v.versionNo}`} onClose={onClose}>
      <div className="stack-lg">
        <div className="row">
          <label className="lbl" style={{ margin: 0 }}>Compared with</label>
          <select className="inp" style={{ width: 300 }} value={against} onChange={(e) => setAgainst(e.target.value)}>
            <option value="base">Version it was based on</option>
            <option value="published">Current published version</option>
            {versions.filter((x) => x.id !== v.id).map((x) => <option key={x.id} value={x.id}>v{x.versionNo} ({x.status})</option>)}
          </select>
          {diff.data?.against && <span className="small muted">old = v{diff.data.against.versionNo}, new = v{v.versionNo}</span>}
          {diff.data && !diff.data.against && <span className="small muted">no earlier version — everything shows as added</span>}
        </div>
        {!diff.data ? <Loading /> : <DiffView diff={diff.data} />}
      </div>
    </Modal>
  );
}

function ComparePanel() {
  const products = useProducts();
  const [a, setA] = useState({ product: '', version: '' });
  const [b, setB] = useState({ product: '', version: '' });
  const va = useQuery({ queryKey: ['versions', a.product], queryFn: () => api.get<Version[]>(`/products/${a.product}/versions`), enabled: !!a.product });
  const vb = useQuery({ queryKey: ['versions', b.product], queryFn: () => api.get<Version[]>(`/products/${b.product}/versions`), enabled: !!b.product });
  const diff = useQuery({ queryKey: ['compare', a.version, b.version], queryFn: () => api.get<DiffResult>(`/compare${qs({ a: a.version, b: b.version })}`), enabled: !!a.version && !!b.version });
  const side = (label: string, s: typeof a, setS: (x: typeof a) => void, list?: Version[], tid?: string) => (
    <div className="card" style={{ padding: 12 }}>
      <h3>{label}</h3>
      <div className="form-grid" style={{ marginTop: 8 }}>
        <Labeled label="Product"><select className="inp" value={s.product} onChange={(e) => setS({ product: e.target.value, version: '' })} data-testid={`${tid}-product`}><option value="">Select…</option>{products.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Labeled>
        <Labeled label="Version"><select className="inp" value={s.version} onChange={(e) => setS({ ...s, version: e.target.value })} data-testid={`${tid}-version`}><option value="">Select…</option>{list?.map((v) => <option key={v.id} value={v.id}>v{v.versionNo} — {v.status}</option>)}</select></Labeled>
      </div>
    </div>
  );
  return (
    <div className="stack-lg">
      <Banner>Compare any two configurations — two versions of one product, or two different products (e.g. New Tractor vs Used Tractor). Items are matched by their keys.</Banner>
      <div className="grid grid-2">{side('Baseline (A)', a, setA, va.data, 'cmp-a')}{side('Compared (B)', b, setB, vb.data, 'cmp-b')}</div>
      <div className="card card-body">{!a.version || !b.version ? <Empty title="Select two versions to compare" /> : !diff.data ? <Loading /> : <DiffView diff={diff.data} />}</div>
    </div>
  );
}
