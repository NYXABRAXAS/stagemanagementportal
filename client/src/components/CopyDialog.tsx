import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Product } from '../lib/types';
import { Badge, Banner, Check, Modal, errMsg, useToast } from './ui';

export type CopyItem = { type: 'stage'; stageKey: string } | { type: 'subStage'; ref: string } | { type: 'field'; ref: string; fieldKey: string };

interface PreviewRow { productId: string; product: string; error?: string; targetVersion?: string; actions: { op: string; target: string; detail?: string }[] }

const OP_LABEL: Record<string, string> = {
  CREATE_STAGE: 'Create stage', ADD_SUBSTAGE: 'Add sub-stage', REPLACE_SUBSTAGE: 'Replace sub-stage', SKIP_SUBSTAGE: 'Skip (exists)',
  ADD_FIELD: 'Add field', REPLACE_FIELD: 'Replace field', SKIP_FIELD: 'Skip (exists)', CREATE_SUBSTAGE_FOR_FIELD: 'Create sub-stage',
};

/** "Copy Selected Configuration to Other Products" — preview first, then confirm. */
export default function CopyDialog({ sourceVersionId, sourceProductId, items, itemLabel, products, onClose }: {
  sourceVersionId: string;
  sourceProductId: string;
  items: CopyItem[];
  itemLabel: string;
  products: Product[];
  onClose: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [targets, setTargets] = useState<string[]>([]);
  const [conflictMode, setConflictMode] = useState<'SKIP' | 'REPLACE'>('SKIP');
  const [includeDocuments, setIncludeDocuments] = useState(true);
  const [includeTransitions, setIncludeTransitions] = useState(true);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const body = { sourceVersionId, items, targetProductIds: targets, conflictMode, includeDocuments, includeTransitions };

  async function doPreview() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post<{ preview: PreviewRow[] }>('/copy', body);
      setPreview(r.preview);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post<{ applied: { product: string; draftVersionNo: number }[] }>('/copy', { ...body, confirm: true });
      toast(`Copied into draft of: ${r.applied.map((a) => `${a.product} (v${a.draftVersionNo})`).join(', ')}`, 'ok');
      qc.invalidateQueries();
      onClose();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      wide
      title={`Copy to other products — ${itemLabel}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          {!preview ? (
            <button className="btn primary" disabled={!targets.length || busy} onClick={doPreview} data-testid="copy-preview">Preview changes</button>
          ) : (
            <>
              <button className="btn" onClick={() => setPreview(null)}>Back</button>
              <button className="btn primary" disabled={busy || preview.some((p) => p.error)} onClick={apply} data-testid="copy-apply">Confirm and copy</button>
            </>
          )}
        </>
      }
    >
      {err && <div style={{ marginBottom: 10 }}><Banner kind="danger">{err}</Banner></div>}
      {!preview ? (
        <div className="stack-lg">
          <Banner>Changes are written into each target product's <strong>draft</strong> (one is created from its published version if needed). Published configurations are never changed directly. Other products are untouched unless selected here.</Banner>
          <div>
            <label className="lbl">Target products</label>
            <div className="chips">
              {products.filter((p) => p.id !== sourceProductId).map((p) => (
                <button type="button" key={p.id} className={`chip ${targets.includes(p.id) ? 'on' : ''}`} onClick={() => setTargets((t) => (t.includes(p.id) ? t.filter((x) => x !== p.id) : [...t, p.id]))} data-testid={`copy-target-${p.code}`}>{p.name}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="lbl">If the item already exists in the target</label>
            <div className="seg">
              <button type="button" className={conflictMode === 'SKIP' ? 'on' : ''} onClick={() => setConflictMode('SKIP')}>Skip it (keep target)</button>
              <button type="button" className={conflictMode === 'REPLACE' ? 'on' : ''} onClick={() => setConflictMode('REPLACE')}>Replace it</button>
            </div>
          </div>
          <div className="row" style={{ gap: 20 }}>
            <Check checked={includeDocuments} onChange={setIncludeDocuments} label="Include document requirements" />
            <Check checked={includeTransitions} onChange={setIncludeTransitions} label="Include workflow actions (where both ends exist)" />
          </div>
        </div>
      ) : (
        <div className="stack-lg" data-testid="copy-preview-result">
          {preview.map((p) => (
            <div className="card" key={p.productId}>
              <div className="card-head"><h3>{p.product}</h3>{p.targetVersion && <span className="small muted">→ {p.targetVersion}</span>}</div>
              <div className="card-body">
                {p.error ? <Banner kind="danger">{p.error}</Banner> : p.actions.length === 0 ? <span className="muted">Nothing to change.</span> : (
                  <table className="tbl">
                    <tbody>
                      {p.actions.map((a, i) => (
                        <tr key={i}>
                          <td style={{ width: 170 }}><Badge kind={a.op.startsWith('SKIP') ? '' : a.op.startsWith('REPLACE') ? 'warn' : 'ok'}>{OP_LABEL[a.op] ?? a.op}</Badge></td>
                          <td>{a.target}{a.detail && <div className="small muted">{a.detail}</div>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
