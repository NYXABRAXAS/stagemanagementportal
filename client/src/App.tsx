import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import {
  Boxes, ClipboardCheck, FileStack, GitBranch, History, LayoutDashboard, ListTree, LogOut, Eye, Settings, ShieldCheck, SlidersHorizontal, FileText,
} from 'lucide-react';
import { useAuth } from './lib/auth';
import { Loading } from './components/ui';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProductsPage from './pages/ProductsPage';
import StageBuilderPage from './pages/StageBuilderPage';
import FieldBuilderPage from './pages/FieldBuilderPage';
import PreviewPage from './pages/PreviewPage';
import WorkflowPage from './pages/WorkflowPage';
import DocumentsPage from './pages/DocumentsPage';
import RolesPage from './pages/RolesPage';
import VersionsPage from './pages/VersionsPage';
import AuditPage from './pages/AuditPage';
import SettingsPage from './pages/SettingsPage';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/products', label: 'Product Catalogue', icon: Boxes },
  { section: 'Configuration' },
  { to: '/stage-builder', label: 'Stage Builder', icon: ListTree },
  { to: '/field-builder', label: 'Field Builder', icon: SlidersHorizontal },
  { to: '/preview', label: 'Screen Preview', icon: Eye },
  { to: '/workflow', label: 'Workflow Configuration', icon: GitBranch },
  { to: '/documents', label: 'Document Configuration', icon: FileStack },
  { section: 'Governance' },
  { to: '/versions', label: 'Configuration Versions', icon: ClipboardCheck },
  { to: '/roles', label: 'Roles & Permissions', icon: ShieldCheck },
  { to: '/audit', label: 'Audit History', icon: History, perm: 'audit.view' },
  { to: '/settings', label: 'System Settings', icon: Settings },
] as const;

const TITLES: Record<string, string> = {
  '/': 'Dashboard', '/products': 'Product Catalogue', '/stage-builder': 'Stage Builder', '/field-builder': 'Field Builder', '/preview': 'Screen & Field Preview',
  '/workflow': 'Workflow Configuration', '/documents': 'Document Configuration', '/versions': 'Configuration Versions', '/roles': 'Role & Permission Management',
  '/audit': 'Audit History', '/settings': 'System Settings',
};

export default function App() {
  const { user, loading, logout, can } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading text="Starting portal…" />;
  if (!user) return <LoginPage />;
  const initials = user.fullName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo"><span className="logo-mark">P</span> ProHorizon</div>
          <div className="sub">LOS Stage Management Portal</div>
        </div>
        <nav className="nav">
          {NAV.map((n, i) =>
            'section' in n ? (
              <div className="section" key={i}>{n.section}</div>
            ) : 'perm' in n && n.perm && !can(n.perm) ? null : (
              <NavLink key={n.to} to={n.to} end={'end' in n ? n.end : false} className={({ isActive }) => (isActive ? 'active' : '')}>
                <n.icon size={16} /> {n.label}
              </NavLink>
            ),
          )}
        </nav>
        <div className="sidebar-foot">
          <div className="row"><FileText size={12} /> Configuration only — no customer data</div>
          <div style={{ marginTop: 4 }}>ProHorizon Digtech Pvt Ltd</div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="title">ProHorizon — LOS Stage Management Portal <span className="muted" style={{ fontWeight: 400 }}>/ {TITLES[loc.pathname] ?? ''}</span></div>
          <div className="spacer" />
          <div className="userchip">
            <div className="avatar">{initials}</div>
            <div>
              <div style={{ fontWeight: 600 }}>{user.fullName}</div>
              <div className="muted small">{user.roles.map((r) => r.name).join(', ')}</div>
            </div>
            <button className="btn ghost sm" onClick={logout} title="Sign out" data-testid="logout"><LogOut size={14} /> Sign out</button>
          </div>
        </header>
        <main className="content">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/stage-builder" element={<StageBuilderPage />} />
            <Route path="/field-builder" element={<FieldBuilderPage />} />
            <Route path="/preview" element={<PreviewPage />} />
            <Route path="/workflow" element={<WorkflowPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/versions" element={<VersionsPage />} />
            <Route path="/roles" element={<RolesPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
