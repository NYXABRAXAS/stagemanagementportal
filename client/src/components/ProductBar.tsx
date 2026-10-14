import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FilePlus2, Lock } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Product, VersionTree } from '../lib/types';
import { Banner, StatusBadge, errMsg, useToast } from './ui';

/** Product selector + the working-version context shown at the top of every configuration page. */
export default function ProductBar({ products, product, onSelect, tree, explicitVersion, extra }: {
  products: Product[];
  product?: Product;
  onSelect: (id: string) => void;
  tree?: VersionTree;
  explicitVersion?: boolean;
  extra?: React.ReactNode;
}) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const createDraft = useMutation({
    mutationFn: () => api.post(`/products/${product!.id}/versions`, {}),
    onSuccess: () => {
      toast('Draft created as a copy of the published version. Edits now go to the draft.', 'ok');
      qc.invalidateQueries();
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  const status = tree?.status;
  const hasOpen = !!product?.openVersion;
  return (
    <div className="stack" style={{ marginBottom: 14 }}>
      <div className="card" style={{ padding: '10px 14px' }}>
        <div className="row wrap" style={{ gap: 14 }}>
          <div className="row">
            <label className="lbl" style={{ margin: 0 }} htmlFor="product-select">Product</label>
            <select id="product-select" className="inp" style={{ width: 240 }} value={product?.id ?? ''} onChange={(e) => onSelect(e.target.value)} data-testid="product-select">
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.active ? '' : ' (inactive)'}</option>
              ))}
            </select>
          </div>
          {tree && (
            <div className="row">
              <span className="muted small">Working on</span>
              <strong>v{tree.versionNo}</strong>
              <StatusBadge status={tree.status} />
              {tree.title && <span className="small muted" style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tree.title}</span>}
            </div>
          )}
          <div style={{ flex: 1 }} />
          {extra}
          {product && !hasOpen && can('config.create') && (
            <button className="btn primary" onClick={() => createDraft.mutate()} disabled={createDraft.isPending} data-testid="create-draft">
              <FilePlus2 size={14} /> Create draft to edit
            </button>
          )}
          <Link className="btn" to={`/versions?product=${product?.id ?? ''}`}>Versions</Link>
        </div>
      </div>
      {tree && status !== 'DRAFT' && (
        <Banner kind={status === 'PUBLISHED' ? 'info' : 'warn'}>
          <Lock size={13} style={{ verticalAlign: -2 }} />{' '}
          {status === 'PUBLISHED' && !explicitVersion && <>This is the <strong>published</strong> configuration and is read-only. {can('config.create') ? 'Use "Create draft to edit" — changes go to a new draft and the published version stays unchanged until the draft is approved and published.' : ''}</>}
          {status === 'PUBLISHED' && explicitVersion && <>Viewing published v{tree.versionNo} (read-only).</>}
          {status === 'ARCHIVED' && <>Viewing archived v{tree.versionNo} (read-only history). Restore it from Configuration Versions if needed.</>}
          {(status === 'SUBMITTED' || status === 'APPROVED') && <>v{tree.versionNo} is <strong>{status}</strong> and locked for review. Withdraw it on the Versions page to edit again.</>}
        </Banner>
      )}
      {tree?.status === 'DRAFT' && !can('config.edit') && <Banner kind="info">Your role can view but not edit this draft.</Banner>}
      {tree?.rejectionNote && tree.status === 'DRAFT' && <Banner kind="warn">Returned by the approver: {tree.rejectionNote}</Banner>}
    </div>
  );
}
