import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Banner, Labeled, Loading, errMsg, fmtDate, useToast } from '../components/ui';

interface Setting { key: string; value: string; description: string; updatedAt: string | null; updatedBy: string | null }
const BOOL = ['requireApproval', 'makerChecker'];
const LABEL: Record<string, string> = { portalName: 'Portal name', requireApproval: 'Require approval before publishing', makerChecker: 'Maker-checker (approver ≠ submitter)', applicationVersionPolicy: 'Existing application version policy' };

export default function SettingsPage() {
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Setting[]>('/settings') });
  const health = useQuery({ queryKey: ['health'], queryFn: () => api.get<{ status: string; database: string; time: string }>('/health') });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const manage = can('settings.manage');
  async function save(key: string, value: string) {
    try { await api.put(`/settings/${key}`, { value }); toast('Setting saved', 'ok'); qc.invalidateQueries({ queryKey: ['settings'] }); } catch (e) { toast(errMsg(e), 'error'); }
  }
  return (
    <div className="stack-lg">
      <div className="page-head"><div><h1>System Settings</h1><p>Governance switches for publishing, plus your own account.</p></div></div>
      <div className="card">
        <div className="card-head"><h2>Governance</h2>{!manage && <span className="small muted">Read-only for your role</span>}</div>
        {!settings.data ? <Loading /> : (
          <table className="tbl">
            <tbody>
              {settings.data.map((s) => (
                <tr key={s.key}>
                  <td style={{ width: 320 }}><strong>{LABEL[s.key] ?? s.key}</strong><div className="small muted">{s.description}</div></td>
                  <td>
                    {BOOL.includes(s.key) ? (
                      <label className="check"><input type="checkbox" disabled={!manage} checked={s.value === 'true'} onChange={(e) => save(s.key, String(e.target.checked))} data-testid={`setting-${s.key}`} /> {s.value === 'true' ? 'Enabled' : 'Disabled'}</label>
                    ) : s.key === 'applicationVersionPolicy' ? (
                      <span className="badge info">{s.value}</span>
                    ) : (
                      <input className="inp" defaultValue={s.value} disabled={!manage} onBlur={(e) => e.target.value !== s.value && save(s.key, e.target.value)} />
                    )}
                  </td>
                  <td className="small muted">{s.updatedBy ? `${s.updatedBy} · ${fmtDate(s.updatedAt)}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="grid grid-2">
        <div className="card">
          <div className="card-head"><h2>Change my password</h2><span className="small muted">{user?.username}</span></div>
          <div className="card-body stack">
            <Labeled label="Current password"><input className="inp" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Labeled>
            <Labeled label="New password" help="At least 10 characters."><input className="inp" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Labeled>
            <div><button className="btn primary" disabled={!pw.currentPassword || pw.newPassword.length < 10} onClick={async () => { try { await api.post('/auth/change-password', pw); toast('Password changed', 'ok'); setPw({ currentPassword: '', newPassword: '' }); } catch (e) { toast(errMsg(e), 'error'); } }}>Change password</button></div>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>System status</h2></div>
          <div className="card-body">
            {health.data ? (
              <dl className="kv">
                <dt>API</dt><dd>{health.data.status}</dd>
                <dt>Database</dt><dd>{health.data.database}</dd>
                <dt>Server time</dt><dd>{fmtDate(health.data.time)}</dd>
                <dt>Health URL</dt><dd className="mono">/api/health</dd>
              </dl>
            ) : <Loading />}
            <div style={{ marginTop: 10 }}><Banner>Backups, logs and restart procedures are described in docs/DEPLOYMENT.md.</Banner></div>
          </div>
        </div>
      </div>
    </div>
  );
}
