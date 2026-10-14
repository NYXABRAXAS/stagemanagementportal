import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Camera, CheckCircle2, RotateCcw, ShieldCheck, Upload, XCircle } from 'lucide-react';
import { api, qs } from '../lib/api';
import { useProducts, useRoles } from '../lib/hooks';
import type { DocumentReq, Field, Module, Version, VersionTree } from '../lib/types';
import { Badge, Banner, Empty, Loading, NcBadge, StatusBadge, errMsg } from '../components/ui';
import { applyCalculations, isEditable, isRequired, isVisible, validateForm, type Values } from '../../../shared/src/ruleEngine';

interface PreviewForm {
  product: { id: string; name: string };
  version: { id: string; versionNo: number; status: string };
  stage: { id: string; name: string };
  subStage: { id: string; name: string; description: string | null; platform: string | null; primaryRoleCode: string | null; needsConfirmation: boolean };
  modules: Module[];
  fields: Field[];
  documents: DocumentReq[];
  transitions: { id: string; actionLabel: string; outcome: string; toName: string | null; remarksRequired: boolean; active: boolean }[];
}
interface ServerResult { valid: boolean; errors: Record<string, string[]>; missingDocuments: string[]; actions: { id: string; actionLabel: string; outcome: string; to: string | null; resultingStatus: string | null; available: boolean; routable: boolean; blockers: string[] }[] }

export default function PreviewPage() {
  const [params, setParams] = useSearchParams();
  const products = useProducts();
  const roles = useRoles();
  const productId = params.get('product') ?? products.data?.[0]?.id ?? '';
  const product = products.data?.find((p) => p.id === productId);
  const versions = useQuery({ queryKey: ['versions', productId], queryFn: () => api.get<Version[]>(`/products/${productId}/versions`), enabled: !!productId });
  const versionId = params.get('version') ?? product?.openVersion?.id ?? product?.published?.id ?? versions.data?.[0]?.id ?? '';
  const tree = useQuery({ queryKey: ['tree', versionId], queryFn: () => api.get<VersionTree>(`/versions/${versionId}/tree`), enabled: !!versionId });
  const stageId = params.get('stage') ?? '';
  const subStageId = params.get('subStage') ?? '';
  const schemeCode = params.get('scheme') ?? '';
  const roleCode = params.get('role') ?? '';
  const set = (k: string, v: string, clear: string[] = []) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v); else n.delete(k);
    clear.forEach((c) => n.delete(c));
    setParams(n, { replace: true });
  };

  const t = tree.data;
  const stage = t?.stages.find((s) => s.id === stageId) ?? t?.stages.find((s) => s.subStages.some((ss) => ss.id === subStageId)) ?? t?.stages[0];
  const sub = stage?.subStages.find((s) => s.id === subStageId) ?? stage?.subStages[0];

  const form = useQuery({
    queryKey: ['preview', versionId, sub?.id],
    queryFn: () => api.get<PreviewForm>(`/preview/form${qs({ versionId, subStageId: sub!.id })}`),
    enabled: !!versionId && !!sub,
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Screen & Field Preview</h1>
          <p>Renders the configured screen from the saved configuration. Values entered here are never saved and never touch customer applications.</p>
        </div>
      </div>
      <div className="card" style={{ padding: 12, marginBottom: 14 }}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <Sel label="Product" value={productId} onChange={(v) => set('product', v, ['version', 'stage', 'subStage', 'scheme'])} testid="pv-product">
            {products.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Sel>
          <Sel label="Version" value={versionId} onChange={(v) => set('version', v, ['stage', 'subStage'])} testid="pv-version">
            {versions.data?.map((v) => <option key={v.id} value={v.id}>v{v.versionNo} — {v.status}</option>)}
          </Sel>
          <Sel label="Scheme" value={schemeCode} onChange={(v) => set('scheme', v)} testid="pv-scheme">
            <option value="">(any scheme)</option>
            {product?.schemes.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </Sel>
          <Sel label="Stage" value={stage?.id ?? ''} onChange={(v) => set('stage', v, ['subStage'])} testid="pv-stage">
            {t?.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Sel>
          <Sel label="Sub-stage" value={sub?.id ?? ''} onChange={(v) => set('subStage', v)} testid="pv-substage">
            {stage?.subStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Sel>
          <Sel label="Preview as role" value={roleCode} onChange={(v) => set('role', v)} testid="pv-role">
            <option value="">(all roles)</option>
            {roles.data?.filter((r) => r.roleType === 'LOS').map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
          </Sel>
        </div>
      </div>
      {!t || form.isLoading ? <Loading /> : !sub ? <Empty title="Nothing to preview">This configuration has no sub-stages.</Empty> : form.data ? (
        <PreviewScreen key={`${form.data.subStage.id}-${schemeCode}-${roleCode}-${versionId}`} data={form.data} schemeCode={schemeCode} roleCode={roleCode} />
      ) : form.error ? <Banner kind="danger">{errMsg(form.error)}</Banner> : null}
    </div>
  );
}

function Sel({ label, value, onChange, children, testid }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode; testid?: string }) {
  return (
    <div>
      <label className="lbl">{label}</label>
      <select className="inp" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testid}>{children}</select>
    </div>
  );
}

function initialValues(fields: Field[]): Values {
  const v: Values = {};
  fields.forEach((f) => {
    if (f.defaultValue != null) v[f.key] = f.type === 'CHECKBOX' ? f.defaultValue === 'true' : f.defaultValue;
    else if (f.type === 'CHECKBOX') v[f.key] = false;
    else if (f.type === 'READONLY') v[f.key] = '';
  });
  return v;
}

function PreviewScreen({ data, schemeCode, roleCode }: { data: PreviewForm; schemeCode: string; roleCode: string }) {
  const ctx = { schemeCode: schemeCode || null, roleCode: roleCode || null };
  const [values, setValues] = useState<Values>(() => initialValues(data.fields));
  const [docs, setDocs] = useState<Record<string, boolean>>({});
  const [remarks, setRemarks] = useState('');
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [checked, setChecked] = useState(false);
  const [server, setServer] = useState<ServerResult | null>(null);
  const [serverErr, setServerErr] = useState<string | null>(null);

  const computed = useMemo(() => applyCalculations(data.fields, values), [data.fields, values]);
  const visibleFields = data.fields.filter((f) => isVisible(f, computed, ctx));
  const hiddenCount = data.fields.filter((f) => f.active).length - visibleFields.length;
  const docList = data.documents.filter((d) => d.active && (d.schemeCodes.length === 0 || !schemeCode || d.schemeCodes.includes(schemeCode)));

  useEffect(() => {
    if (checked) setErrors(validateForm(data.fields, values, ctx).errors);
  }, [values]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runValidation() {
    const r = validateForm(data.fields, values, ctx);
    setErrors(r.errors);
    setChecked(true);
    try {
      setServerErr(null);
      setServer(await api.post<ServerResult>('/preview/validate', { versionId: data.version.id, subStageId: data.subStage.id, values, documents: docs, schemeCode: schemeCode || null, roleCode: roleCode || null, remarks }));
    } catch (e) {
      setServerErr(errMsg(e));
    }
  }
  function reset() {
    setValues(initialValues(data.fields));
    setDocs({});
    setErrors({});
    setChecked(false);
    setServer(null);
    setRemarks('');
  }

  const groups: { id: string | null; name: string; repeatable?: boolean }[] = [
    { id: null, name: data.subStage.name },
    ...data.modules.filter((m) => m.active).map((m) => ({ id: m.id, name: m.name, repeatable: m.repeatable })),
  ];
  const errCount = Object.keys(errors).length;

  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(300px, 1fr)', alignItems: 'start' }}>
      <div className="phone" data-testid="preview-screen">
        <div className="phone-head">
          <span>{data.subStage.name}</span>
          <span className="small" style={{ opacity: 0.85 }}>{data.product.name} · v{data.version.versionNo}</span>
        </div>
        <div className="phone-body">
          {data.subStage.needsConfirmation && <div style={{ marginBottom: 10 }}><Banner kind="warn">This sub-stage is marked "requires confirmation".</Banner></div>}
          {checked && (errCount ? <div style={{ marginBottom: 10 }} data-testid="preview-errors"><Banner kind="danger">{errCount} field(s) need attention.</Banner></div> : <div style={{ marginBottom: 10 }}><Banner kind="ok">All visible fields pass validation.</Banner></div>)}
          {groups.map((g) => {
            const fields = visibleFields.filter((f) => (f.moduleId ?? null) === g.id);
            if (fields.length === 0) return null;
            return (
              <div className="pv-section" key={g.id ?? 'root'}>
                <div className="pv-title"><span>{g.name}</span>{g.repeatable && <span className="small">+ Add (repeatable list)</span>}</div>
                <div className="pv-body">
                  {fields.map((f) => (
                    <PreviewField key={f.id} f={f} value={computed[f.key]} required={isRequired(f, computed)} editable={isEditable(f, ctx)} errors={errors[f.key]} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
                  ))}
                </div>
              </div>
            );
          })}
          {visibleFields.length === 0 && <Empty title="No visible fields">{data.fields.length ? 'All fields are hidden for the selected scheme / role / current values.' : 'This sub-stage has no fields configured.'}</Empty>}
          {docList.length > 0 && (
            <div className="pv-section">
              <div className="pv-title"><span>Documents</span><span className="small">simulated — nothing is uploaded</span></div>
              <div className="pv-body">
                {docList.map((d) => (
                  <div key={d.id} className="row between" style={{ border: '1px dashed var(--border-strong)', borderRadius: 6, padding: '8px 10px' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{d.name}{d.requirement === 'MANDATORY' && <span className="req">*</span>}</div>
                      <div className="small muted">{d.captureMode.replace(/_/g, ' ').toLowerCase()}{d.category ? ` · ${d.category}` : ''}</div>
                    </div>
                    <button className={`btn sm ${docs[d.code] ? 'ok' : ''}`} onClick={() => setDocs((s) => ({ ...s, [d.code]: !s[d.code] }))} disabled={d.captureMode === 'SYSTEM_GENERATED'}>
                      {docs[d.code] ? <><CheckCircle2 size={13} /> Captured</> : d.captureMode === 'CAMERA' ? <><Camera size={13} /> Capture</> : <><Upload size={13} /> Upload</>}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn primary" onClick={runValidation} data-testid="preview-validate"><ShieldCheck size={14} /> Validate / Submit (preview)</button>
            <button className="btn" onClick={reset}><RotateCcw size={14} /> Reset</button>
          </div>
        </div>
      </div>
      <div className="stack-lg" style={{ position: 'sticky', top: 0 }}>
        <div className="card">
          <div className="card-head"><h2>Screen summary</h2></div>
          <div className="card-body">
            <dl className="kv">
              <dt>Stage</dt><dd>{data.stage.name}</dd>
              <dt>Platform</dt><dd>{data.subStage.platform ?? '—'}</dd>
              <dt>Primary role</dt><dd>{data.subStage.primaryRoleCode ?? '—'}</dd>
              <dt>Version</dt><dd>v{data.version.versionNo} <StatusBadge status={data.version.status} /></dd>
              <dt>Fields</dt><dd>{visibleFields.length} visible{hiddenCount > 0 && <span className="muted"> · {hiddenCount} hidden by rules / scheme / role</span>}</dd>
              <dt>Mandatory now</dt><dd>{visibleFields.filter((f) => isRequired(f, computed)).length}</dd>
            </dl>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Workflow actions</h2></div>
          <div className="card-body stack">
            {data.transitions.length === 0 && <span className="muted">No workflow actions configured for this sub-stage.</span>}
            {data.transitions.some((t) => t.remarksRequired) && (
              <div><label className="lbl">Remarks</label><textarea className="inp" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
            )}
            {!server && data.transitions.length > 0 && <span className="small muted">Click "Validate / Submit (preview)" to see which actions would be available.</span>}
            {serverErr && <Banner kind="danger">{serverErr}</Banner>}
            {server?.actions.map((a) => (
              <div key={a.id} className="row" style={{ alignItems: 'flex-start' }} data-testid="preview-action">
                {a.available ? <CheckCircle2 size={16} color="var(--ok)" /> : <XCircle size={16} color={a.routable ? 'var(--danger)' : 'var(--muted)'} />}
                <div>
                  <strong>{a.actionLabel}</strong> <Badge>{a.outcome}</Badge>{a.to && <span className="small muted"> → {a.to}</span>}
                  {a.resultingStatus && <div className="small muted">Status: {a.resultingStatus}</div>}
                  {a.blockers.map((b, i) => <div className="small danger-text" key={i}>{b}</div>)}
                </div>
              </div>
            ))}
            {server && server.missingDocuments.length > 0 && <div className="small danger-text">Missing mandatory documents: {server.missingDocuments.join(', ')}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewField({ f, value, required, editable, errors, onChange }: { f: Field; value: unknown; required: boolean; editable: boolean; errors?: string[]; onChange: (v: unknown) => void }) {
  const invalid = !!errors?.length;
  const cls = `inp ${invalid ? 'invalid' : ''}`;
  const id = `pv-${f.key}`;
  const opts = f.options.filter((o) => o.active);
  const disabled = !editable;
  const label = (
    <label className="lbl" htmlFor={id}>
      {f.label}{required && <span className="req">*</span>} {f.needsConfirmation && <NcBadge />}
    </label>
  );
  let input: React.ReactNode;
  const sv = value == null ? '' : String(value);
  switch (f.type) {
    case 'TEXTAREA':
      input = <textarea id={id} className={cls} rows={3} value={sv} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={f.placeholder ?? ''} />;
      break;
    case 'INTEGER': case 'DECIMAL': case 'CURRENCY':
      input = <input id={id} className={cls} type="number" step={f.type === 'INTEGER' ? 1 : 'any'} value={sv} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={f.placeholder ?? (f.type === 'CURRENCY' ? '₹' : '')} />;
      break;
    case 'DATE':
      input = <input id={id} className={cls} type="date" value={sv} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
      break;
    case 'DATETIME':
      input = <input id={id} className={cls} type="datetime-local" value={sv} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
      break;
    case 'DROPDOWN':
      input = (
        <select id={id} className={cls} value={sv} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
          <option value="">Select</option>
          {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
      break;
    case 'MULTISELECT': {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      input = <div className="chips">{opts.map((o) => <button type="button" key={o.value} disabled={disabled} className={`chip ${arr.includes(o.value) ? 'on' : ''}`} onClick={() => onChange(arr.includes(o.value) ? arr.filter((x) => x !== o.value) : [...arr, o.value])}>{o.label}</button>)}</div>;
      break;
    }
    case 'RADIO':
      input = <div className="row wrap" id={id}>{opts.map((o) => <label key={o.value} className="check"><input type="radio" name={id} checked={sv === o.value} disabled={disabled} onChange={() => onChange(o.value)} /> {o.label}</label>)}</div>;
      break;
    case 'YESNO':
      input = <div className="seg" id={id}>{['Yes', 'No'].map((o) => <button type="button" key={o} className={sv === o ? 'on' : ''} disabled={disabled} onClick={() => onChange(o)}>{o}</button>)}</div>;
      break;
    case 'CHECKBOX':
      return (
        <div>
          <label className="check" style={{ alignItems: 'flex-start' }}><input id={id} type="checkbox" checked={value === true} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /> <span>{f.label}{required && <span className="req">*</span>}</span></label>
          {errors?.map((e) => <div className="err" key={e}>{e}</div>)}
        </div>
      );
    case 'FILE': case 'IMAGE':
      input = <button type="button" className={`btn ${value ? 'ok' : ''}`} disabled={disabled} onClick={() => onChange(value ? '' : 'captured')}>{value ? <><CheckCircle2 size={13} /> {f.type === 'IMAGE' ? 'Captured' : 'Uploaded'}</> : f.type === 'IMAGE' ? <><Camera size={13} /> Capture Image</> : <><Upload size={13} /> Choose file</>}</button>;
      break;
    case 'READONLY':
      input = <input id={id} className="inp" readOnly value={sv || '(system-generated)'} />;
      break;
    case 'CALCULATED':
      input = <input id={id} className="inp" readOnly value={value == null || value === '' ? '' : String(value)} placeholder={`= ${f.formula ?? ''}`} />;
      break;
    default:
      input = <input id={id} className={cls} type={f.sensitive ? 'password' : 'text'} value={sv} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={f.placeholder ?? ''} maxLength={f.maxLength ?? undefined} />;
  }
  return (
    <div data-testid={`pv-field-${f.key}`}>
      {label}
      {input}
      {f.helpText && !invalid && <div className="help">{f.helpText}</div>}
      {errors?.map((e) => <div className="err" key={e}>{e}</div>)}
    </div>
  );
}
