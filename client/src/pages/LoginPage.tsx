import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { Banner, errMsg } from '../components/ui';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-art">
        <div className="brand" style={{ border: 0, padding: 0 }}>
          <div className="logo"><span className="logo-mark">P</span> ProHorizon</div>
        </div>
        <div>
          <h1>LOS Stage Management Portal</h1>
          <p style={{ color: '#c9d8ea', maxWidth: 460 }}>Configure products, stages, sub-stages, sections, fields, documents and workflow for the Loan Origination System — without changing source code.</p>
          <ul>
            <li>Product → Stage → Sub-stage → Section → Field hierarchy</li>
            <li>Draft, approval and published versions with full audit</li>
            <li>Live preview of every configured screen</li>
          </ul>
        </div>
        <div className="small" style={{ color: '#9db6d3' }}>Internal use only · ProHorizon Digtech Pvt Ltd</div>
      </div>
      <div className="login-form">
        <form onSubmit={submit} className="stack-lg" aria-label="Sign in">
          <div>
            <h1>Sign in</h1>
            <p className="muted">Use your portal account.</p>
          </div>
          {error && <Banner kind="danger">{error}</Banner>}
          <div>
            <label className="lbl" htmlFor="username">Username</label>
            <input id="username" className="inp" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
          </div>
          <div>
            <label className="lbl" htmlFor="password">Password</label>
            <input id="password" className="inp" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="btn primary" style={{ height: 38, justifyContent: 'center' }} disabled={busy} type="submit">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
