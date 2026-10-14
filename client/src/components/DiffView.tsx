import { useState } from 'react';
import type { DiffResult } from '../lib/types';
import { Badge, Empty } from './ui';

const LEVEL: Record<string, string> = { stage: 'Stage', subStage: 'Sub-stage', module: 'Section', field: 'Field', document: 'Document', transition: 'Workflow' };

function fmt(v: unknown) {
  if (v === null || v === undefined || v === '') return '∅';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export default function DiffView({ diff }: { diff: DiffResult }) {
  const [level, setLevel] = useState('');
  const [kind, setKind] = useState('');
  const entries = diff.entries.filter((e) => (!level || e.level === level) && (!kind || e.kind === kind));
  return (
    <div className="stack" data-testid="diff-view">
      <div className="row wrap">
        <Badge kind="ok">+{diff.summary.added} added</Badge>
        <Badge kind="danger">−{diff.summary.removed} removed</Badge>
        <Badge kind="warn">~{diff.summary.changed} changed</Badge>
        <div style={{ flex: 1 }} />
        <select className="inp" style={{ width: 150 }} value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Level"><option value="">All levels</option>{Object.entries(LEVEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className="inp" style={{ width: 130 }} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Change type"><option value="">All changes</option><option value="added">Added</option><option value="removed">Removed</option><option value="changed">Changed</option></select>
      </div>
      {entries.length === 0 ? <Empty title="No differences" /> : (
        <div className="table-wrap" style={{ maxHeight: 480 }}>
          <table className="tbl">
            <thead><tr><th style={{ width: 90 }}>Change</th><th style={{ width: 100 }}>Level</th><th>Item</th><th>Details</th></tr></thead>
            <tbody>
              {entries.slice(0, 800).map((e, i) => (
                <tr key={i}>
                  <td className={`diff-${e.kind}`}><strong>{e.kind}</strong></td>
                  <td className="small">{LEVEL[e.level] ?? e.level}</td>
                  <td>{e.label}<div className="small muted mono">{e.path}</div></td>
                  <td className="small">{e.changes?.map((c) => (
                    <div key={c.prop}><span className="mono">{c.prop}</span>: <span className="diff-removed">{fmt(c.from).slice(0, 120)}</span> → <span className="diff-added">{fmt(c.to).slice(0, 120)}</span></div>
                  ))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {entries.length > 800 && <div className="small muted" style={{ padding: 8 }}>Showing first 800 differences.</div>}
        </div>
      )}
    </div>
  );
}
