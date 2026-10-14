import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useRoles } from '../lib/hooks';
import type { Permission, Role } from '../lib/types';
import { Badge, Banner, Check, Empty, Labeled, Loading, Modal, errMsg, fmtDate, useConfirm, useToast } from '../components/ui';

interface UserRow { id: string; username: string; fullName: string; email: string | null; active: boolean; lastLoginAt: string | null; roles: { code: string; name: string }[] }

export default function RolesPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<'matrix' | 'roles' | 'users'>('matrix');
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Role & Permission Management</h1>
          <p>Portal permissions are enforced by the API on every request — hiding a button is never the only control. LOS business roles (from the Tractor manual) are used for workflow routing, field visibility and preview-as-role; their exact authority mapping (e.g. Credit L0–L5) still needs business confirmation.</p>
        </div>
      </div>
      <div className="tabs" style={{ marginBottom: 12 }}>
        <button className={tab === 'matrix' ? 'on' : ''} onClick={() => setTab('matrix')}>Permission matrix</button>
        <button className={tab === 'roles' ? 'on' : ''} onClick={() => setTab('roles')}>Roles</button>
        {can('user.manage') && <button className={tab === 'users' ? 'on' : ''} onClick={() => setTab('users')} data-testid="tab-users">Users</button>}
      </div>
      {tab === 'matrix' && <Matrix />}
      {tab === 'roles' && <RolesList />}
      {tab === 'users' && <Users />}
    </div>
  );
}

function Matrix() {
  const { can } = useAuth();
  const roles = useRoles();
  const perms = useQuery({ queryKey: ['permissions'], queryFn: () => api.get<Permission[]>('/permissions') });
  const [edits, setEdits] = useState<Record<string, string[]>>({});
  const qc = useQueryClient();
  const toast = useToast();
  const [showLos, setShowLos] = useState(false);
  if (!roles.data || !perms.data) return <Loading />;
  const editable = can('role.manage');
  const list = roles.data.filter((r) => showLos || r.roleType === 'PORTAL');
  const get = (r: Role) => edits[r.id] ?? r.permissions;
  const dirtyIds = Object.keys(edits);
  async function save() {
    try {
      for (const id of dirtyIds) await api.put(`/roles/${id}/permissions`, { permissions: edits[id] });
      toast('Permissions saved', 'ok');
      setEdits({});
      qc.invalidateQueries({ queryKey: ['roles'] });
    } catch (e) { toast(errMsg(e), 'error'); }
  }
  return (
    <div className="card">
      <div className="card-head">
        <Check checked={showLos} onChange={setShowLos} label="Show LOS business roles too" />
        {editable && <button className="btn primary" disabled={!dirtyIds.length} onClick={save} data-testid="save-matrix"><Save size={14} /> Save changes</button>}
      </div>
      <div className="table-wrap">
        <table className="tbl matrix" data-testid="perm-matrix">
          <thead>
            <tr><th>Permission</th>{list.map((r) => <th key={r.id} style={{ minWidth: 90 }}>{r.name}</th>)}</tr>
          </thead>
          <tbody>
            {perms.data.map((p) => (
              <tr key={p.id}>
                <td><strong>{p.name}</strong><div className="small muted mono">{p.code} · {p.module}</div></td>
                {list.map((r) => (
                  <td key={r.id}>
                    <input type="checkbox" aria-label={`${r.code} ${p.code}`} disabled={!editable} checked={get(r).includes(p.code)} onChange={(e) => setEdits((s) => ({ ...s, [r.id]: e.target.checked ? [...get(r), p.code] : get(r).filter((x) => x !== p.code) }))} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RolesList() {
  const { can } = useAuth();
  const roles = useRoles();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [edit, setEdit] = useState<Partial<Role> | null>(null);
  if (!roles.data) return <Loading />;
  return (
    <div className="card">
      <div className="card-head"><h2>{roles.data.length} roles</h2>{can('role.manage') && <button className="btn primary" onClick={() => setEdit({ roleType: 'LOS', active: true })} data-testid="add-role"><Plus size={14} /> Add role</button>}</div>
      <table className="tbl">
        <thead><tr><th>Role</th><th>Type</th><th>Platform</th><th>Description</th><th>Users</th><th>Status</th><th /></tr></thead>
        <tbody>
          {roles.data.map((r) => (
            <tr key={r.id} className={r.active ? '' : 'inactive'}>
              <td><strong>{r.name}</strong><div className="small muted mono">{r.code}</div></td>
              <td><Badge kind={r.roleType === 'PORTAL' ? 'brand' : ''}>{r.roleType}</Badge></td>
              <td className="small">{r.platform ?? '—'}</td>
              <td className="small" style={{ maxWidth: 420 }}>{r.description}{r.sourceRef && <div className="muted">Source: {r.sourceRef}</div>}</td>
              <td>{r._count.users}</td>
              <td>{r.active ? <Badge kind="ok">Active</Badge> : <Badge>Inactive</Badge>}</td>
              <td className="btn-group">
                {can('role.manage') && <button className="btn sm" onClick={() => setEdit(r)}><Pencil size={12} /></button>}
                {can('role.manage') && !r.isSystem && <button className="btn sm danger" onClick={async () => { if (await confirm({ title: `Delete role ${r.name}?`, danger: true })) { try { await api.del(`/roles/${r.id}`); qc.invalidateQueries({ queryKey: ['roles'] }); } catch (e) { toast(errMsg(e), 'error'); } } }}><Trash2 size={12} /></button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit && <RoleDialog value={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function RoleDialog({ value, onClose }: { value: Partial<Role>; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ code: value.code ?? '', name: value.name ?? '', description: value.description ?? '', roleType: value.roleType ?? 'LOS', platform: value.platform ?? '', active: value.active !== false });
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    try {
      const body = { ...v, description: v.description || null, platform: v.platform || null };
      if (value.id) await api.put(`/roles/${value.id}`, body); else await api.post('/roles', body);
      qc.invalidateQueries({ queryKey: ['roles'] });
      onClose();
    } catch (e) { setErr(errMsg(e)); }
  }
  return (
    <Modal title={value.id ? `Edit ${value.name}` : 'Add role'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!v.code || !v.name} onClick={save} data-testid="save-role">Save</button></>}>
      {err && <div style={{ marginBottom: 10 }}><Banner kind="danger">{err}</Banner></div>}
      <div className="form-grid">
        <Labeled label="Name" required><input className="inp" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value, code: value.id ? v.code : e.target.value.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '') })} data-testid="role-name" /></Labeled>
        <Labeled label="Code" required><input className="inp mono" value={v.code} disabled={!!value.isSystem} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })} /></Labeled>
        <Labeled label="Type" help="PORTAL = users of this portal; LOS = business role in the loan journey"><select className="inp" value={v.roleType} onChange={(e) => setV({ ...v, roleType: e.target.value as 'PORTAL' | 'LOS' })}><option>LOS</option><option>PORTAL</option></select></Labeled>
        <Labeled label="Platform"><input className="inp" value={v.platform} onChange={(e) => setV({ ...v, platform: e.target.value })} /></Labeled>
        <Labeled label="Description" full><textarea className="inp" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Labeled>
        <div className="full"><Check checked={v.active} onChange={(x) => setV({ ...v, active: x })} label="Active" /></div>
      </div>
    </Modal>
  );
}

function Users() {
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<UserRow[]>('/users') });
  const roles = useRoles();
  const [edit, setEdit] = useState<Partial<UserRow> | null>(null);
  if (!users.data) return <Loading />;
  return (
    <div className="card">
      <div className="card-head"><h2>Portal users</h2><button className="btn primary" onClick={() => setEdit({ active: true, roles: [] })} data-testid="add-user"><Plus size={14} /> Add user</button></div>
      {users.data.length === 0 ? <Empty title="No users" /> : (
        <table className="tbl">
          <thead><tr><th>User</th><th>Roles</th><th>Last login</th><th>Status</th><th /></tr></thead>
          <tbody>
            {users.data.map((u) => (
              <tr key={u.id} className={u.active ? '' : 'inactive'}>
                <td><strong>{u.fullName}</strong><div className="small muted mono">{u.username}</div></td>
                <td className="small">{u.roles.map((r) => r.name).join(', ')}</td>
                <td className="small">{fmtDate(u.lastLoginAt)}</td>
                <td>{u.active ? <Badge kind="ok">Active</Badge> : <Badge>Inactive</Badge>}</td>
                <td><button className="btn sm" onClick={() => setEdit(u)}><Pencil size={12} /> Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {edit && roles.data && <UserDialog value={edit} roles={roles.data} onClose={() => setEdit(null)} />}
    </div>
  );
}

function UserDialog({ value, roles, onClose }: { value: Partial<UserRow>; roles: Role[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState({ username: value.username ?? '', fullName: value.fullName ?? '', email: value.email ?? '', password: '', active: value.active !== false, roleCodes: (value.roles ?? []).map((r) => r.code) });
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    try {
      const body = { ...v, password: v.password || undefined };
      if (value.id) await api.put(`/users/${value.id}`, body); else await api.post('/users', body);
      toast('User saved', 'ok');
      qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    } catch (e) { setErr(errMsg(e)); }
  }
  return (
    <Modal title={value.id ? `Edit ${value.username}` : 'Add user'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!v.username || !v.fullName || (!value.id && v.password.length < 10)} onClick={save} data-testid="save-user">Save</button></>}>
      {err && <div style={{ marginBottom: 10 }}><Banner kind="danger">{err}</Banner></div>}
      <div className="form-grid">
        <Labeled label="Username" required><input className="inp" value={v.username} disabled={!!value.id} onChange={(e) => setV({ ...v, username: e.target.value })} /></Labeled>
        <Labeled label="Full name" required><input className="inp" value={v.fullName} onChange={(e) => setV({ ...v, fullName: e.target.value })} /></Labeled>
        <Labeled label="Email"><input className="inp" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Labeled>
        <Labeled label={value.id ? 'Reset password' : 'Initial password'} required={!value.id} help="At least 10 characters."><input className="inp" type="password" autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} /></Labeled>
        <div className="full">
          <label className="lbl"><KeyRound size={12} /> Roles</label>
          <div className="chips">{roles.filter((r) => r.roleType === 'PORTAL').map((r) => <button type="button" key={r.code} className={`chip ${v.roleCodes.includes(r.code) ? 'on' : ''}`} onClick={() => setV({ ...v, roleCodes: v.roleCodes.includes(r.code) ? v.roleCodes.filter((x) => x !== r.code) : [...v.roleCodes, r.code] })}>{r.name}</button>)}</div>
        </div>
        <div className="full"><Check checked={v.active} onChange={(x) => setV({ ...v, active: x })} label="Active" /></div>
      </div>
    </Modal>
  );
}
