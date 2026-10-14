import { cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useId, useState, type ReactElement, type ReactNode } from 'react';
import { AlertTriangle, Info, Search, X } from 'lucide-react';

// ─────────────── Toasts ───────────────
type ToastKind = 'info' | 'ok' | 'error';
interface ToastItem { id: number; kind: ToastKind; text: string }
const ToastCtx = createContext<(text: string, kind?: ToastKind) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ─────────────── Modal ───────────────
export function Modal({ title, onClose, children, footer, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ─────────────── Confirm dialog (promise based) ───────────────
interface ConfirmOpts { title: string; body?: ReactNode; confirmText?: string; danger?: boolean }
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <Modal
          title={state.title}
          onClose={() => close(false)}
          footer={
            <>
              <button className="btn" onClick={() => close(false)}>Cancel</button>
              <button className={`btn ${state.danger ? 'danger solid' : 'primary'}`} onClick={() => close(true)} autoFocus>
                {state.confirmText ?? 'Confirm'}
              </button>
            </>
          }
        >
          {state.body}
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}

// ─────────────── Small pieces ───────────────
export function Badge({ children, kind }: { children: ReactNode; kind?: string }) {
  return <span className={`badge ${kind ?? ''}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{status}</span>;
}

export function NcBadge({ show = true, title }: { show?: boolean; title?: string }) {
  if (!show) return null;
  return <span className="badge warn" title={title ?? 'Requires confirmation against the source material'}>Needs confirmation</span>;
}

export function Loading({ text = 'Loading…' }: { text?: string }) {
  return <div className="loading"><span className="spinner" /> {text}</div>;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <div className="small">{children}</div>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

export function Banner({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'danger' | 'ok'; children: ReactNode }) {
  return (
    <div className={`banner ${kind}`}>
      {kind === 'warn' || kind === 'danger' ? <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> : <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />}
      <div>{children}</div>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search…', width = 240 }: { value: string; onChange: (v: string) => void; placeholder?: string; width?: number }) {
  return (
    <div className="search" style={{ width }}>
      <Search size={14} />
      <input className="inp" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </div>
  );
}

export function Labeled({ label, required, help, error, children, full }: { label: ReactNode; required?: boolean; help?: ReactNode; error?: string | null; children: ReactNode; full?: boolean }) {
  const autoId = useId();
  // Associate the label with a single native form control so it is announced and clickable.
  const control = isValidElement<{ id?: string }>(children) && typeof children.type === 'string' && ['input', 'select', 'textarea'].includes(children.type);
  const id = control ? (children as ReactElement<{ id?: string }>).props.id ?? autoId : undefined;
  const child = control ? cloneElement(children as ReactElement<{ id?: string }>, { id }) : children;
  return (
    <div className={full ? 'full' : undefined}>
      <label className="lbl" htmlFor={id}>{label}{required && <span className="req">*</span>}</label>
      {child}
      {help && !error && <div className="help">{help}</div>}
      {error && <div className="err">{error}</div>}
    </div>
  );
}

export function Check({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      {label}
    </label>
  );
}

export function fmtDate(s?: string | null) {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
