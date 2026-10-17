import React, { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, FolderOpen, ArrowDownUp, Share2, Trash2, BarChart3, Zap, Globe2, KeyRound, TerminalSquare,
  Settings as SettingsIcon, ChevronsUpDown, Plus, Check, Server, Upload, Cloud, Sparkles, Webhook,
  UserCircle, Users as UsersIcon, ScrollText, ShieldAlert, LogIn, LogOut,
} from 'lucide-react';
import { useApp } from './lib/store.jsx';
import { classNames, initials } from './lib/util.js';
import { DialogHost, Toasts, ContextMenu, Button } from './components/ui.jsx';
import ServerEditor from './components/ServerEditor.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Files from './pages/Files.jsx';
import Transfers from './pages/Transfers.jsx';
import Shares from './pages/Shares.jsx';
import Trash from './pages/Trash.jsx';
import Analytics from './pages/Analytics.jsx';
import Cache from './pages/Cache.jsx';
import Zones from './pages/Zones.jsx';
import ApiKeys from './pages/ApiKeys.jsx';
import Webhooks from './pages/Webhooks.jsx';
import Console from './pages/Console.jsx';
import Settings from './pages/Settings.jsx';
import { Account, Users, Audit, Security, StaffGate } from './pages/Admin.jsx';
import { LoginDialog } from './components/StaffLogin.jsx';

const NAV = [
  { group: 'Workspace' },
  { name: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { name: 'files', label: 'Files', icon: FolderOpen },
  { name: 'transfers', label: 'Transfers', icon: ArrowDownUp },
  { name: 'shares', label: 'Share links', icon: Share2 },
  { name: 'trash', label: 'Recycle bin', icon: Trash2 },
  { group: 'Delivery' },
  { name: 'analytics', label: 'Analytics', icon: BarChart3 },
  { name: 'cache', label: 'Cache', icon: Zap },
  { name: 'zones', label: 'Zones & domains', icon: Globe2 },
  { group: 'Developer' },
  { name: 'keys', label: 'API keys', icon: KeyRound },
  { name: 'webhooks', label: 'Webhooks', icon: Webhook },
  { name: 'console', label: 'API console', icon: TerminalSquare },
  { group: 'Admin', staff: true },
  { name: 'account', label: 'My account', icon: UserCircle, staff: true },
  { name: 'users', label: 'Users', icon: UsersIcon, staff: true },
  { name: 'audit', label: 'Audit log', icon: ScrollText, staff: true },
  { name: 'security', label: 'Security', icon: ShieldAlert, staff: true },
];

const StaffKeys = () => <StaffGate title="API keys" icon={KeyRound}><ApiKeys /></StaffGate>;
const StaffWebhooks = () => <StaffGate title="Webhooks" icon={Webhook}><Webhooks /></StaffGate>;
const PAGES = { dashboard: Dashboard, files: Files, transfers: Transfers, shares: Shares, trash: Trash, analytics: Analytics, cache: Cache, zones: Zones, keys: StaffKeys, webhooks: StaffWebhooks, console: Console, settings: Settings, account: Account, users: Users, audit: Audit, security: Security };

export default function App() {
  const { profiles, active, page, navigate, settings, setActive, meError, serverEditor: editor, editServer: setEditor } = useApp();

  // Ctrl+1..9 switches servers, Ctrl+, opens settings
  useEffect(() => {
    const k = (e) => {
      if (!e.ctrlKey || e.altKey) return;
      if (e.key === ',') { e.preventDefault(); navigate('settings'); }
      const n = Number(e.key);
      if (n >= 1 && n <= 9 && profiles[n - 1]) { e.preventDefault(); setActive(profiles[n - 1].id); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [profiles, navigate, setActive]);

  if (!settings) return <div className="boot" />;

  const Page = PAGES[page.name] || Dashboard;
  return (
    <div className="app">
      <TitleBar />
      <div className="shell">
        <Sidebar onAddServer={() => setEditor({})} />
        <main className="main">
          {meError && active && page.name !== 'settings' && (
            <div className={`auth-banner ${meError.status === 0 ? 'offline' : ''}`}>
              <span className="grow">
                <b>{meError.status === 0 ? `Can't reach ${active.name}` : meError.status === 401 ? `${active.name} rejected its API key` : `${active.name}: ${meError.message}`}</b>
                <span className="muted"> · {meError.status === 0 ? meError.message : meError.status === 401 ? meError.message : ''}</span>
              </span>
              <Button size="sm" onClick={() => setEditor(active)}>Edit server</Button>
            </div>
          )}
          {!profiles.length && page.name !== 'settings' ? <Welcome onAdd={() => setEditor({})} /> : <Page key={`${page.name}:${active?.id}:${active?.hasStaffSession ? 's' : ''}`} params={page.params} />}
        </main>
      </div>
      {editor && <ServerEditor profile={editor} onClose={() => setEditor(null)} />}
      <LoginDialog />
      <DialogHost />
      <Toasts />
    </div>
  );
}

function TitleBar() {
  const { active, me } = useApp();
  return (
    <div className="titlebar">
      <div className="tb-brand"><div className="logo"><Cloud size={14} /></div><span>CDN Desktop</span></div>
      <div className="tb-center">
        {active && (
          <div className="tb-pill">
            <i style={{ background: active.color }} />
            <span>{active.name}</span>
            <span className="tb-host">{active.baseUrl.replace(/^https?:\/\//, '')}</span>
            {me?.api_key?.environment && <span className={`tb-env ${me.api_key.environment}`}>{me.api_key.environment}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function Sidebar({ onAddServer }) {
  const { profiles, active, setActive, page, navigate, transfers, meError, hasStaff, staff, openLogin, staffSignOut } = useApp();
  const [menu, setMenu] = useState(null);
  const running = useMemo(() => Object.values(transfers).filter((t) => t.status === 'running' || t.status === 'queued'), [transfers]);
  const progress = running.length ? running.reduce((a, t) => a + (t.loaded || 0), 0) / Math.max(1, running.reduce((a, t) => a + (t.size || 0), 0)) : 0;

  const openSwitcher = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({
      x: r.left, y: r.bottom + 6,
      items: [
        { header: 'Servers' },
        ...profiles.map((p, i) => ({ label: p.name, icon: () => <span className="dot" style={{ background: p.color }} />, checked: p.id === active?.id, shortcut: i < 9 ? `Ctrl+${i + 1}` : '', onClick: () => setActive(p.id) })),
        { divider: true },
        { label: 'Add server…', icon: Plus, onClick: onAddServer },
        { label: 'Manage servers', icon: Server, onClick: () => navigate('settings', { tab: 'servers' }) },
      ],
    });
  };

  return (
    <aside className="sidebar">
      <button className="switcher" onClick={openSwitcher}>
        {active ? <>
          <span className="avatar" style={{ background: active.color }}>{initials(active.name)}</span>
          <span className="grow switcher-text">
            <b>{active.name}</b>
            <small>{meError ? <span className="text-red">{meError.status === 0 ? 'offline' : 'auth error'}</span> : active.baseUrl.replace(/^https?:\/\//, '')}</small>
          </span>
        </> : <><span className="avatar"><Plus size={14} /></span><span className="grow switcher-text"><b>No server</b><small>Add one to begin</small></span></>}
        <ChevronsUpDown size={15} className="muted" />
      </button>

      <nav className="nav">
        {NAV.map((n, i) => n.group ? <div key={i} className="nav-group">{n.group}{n.staff && !hasStaff && <LockIcon />}</div> : (
          <button key={n.name} className={classNames('nav-item', page.name === n.name && 'active', n.staff && !hasStaff && 'locked')} onClick={() => navigate(n.name)} disabled={!active}>
            <n.icon size={17} />
            <span className="grow">{n.label}</span>
            {n.name === 'transfers' && running.length > 0 && <span className="nav-badge">{running.length}</span>}
          </button>
        ))}
      </nav>

      {running.length > 0 && (
        <button className="side-transfer" onClick={() => navigate('transfers')}>
          <div className="side-transfer-top"><Upload size={14} /><span className="grow">{running.length} transfer{running.length > 1 ? 's' : ''}</span><b>{Math.round(progress * 100)}%</b></div>
          <div className="progress"><span style={{ width: `${progress * 100}%` }} /></div>
        </button>
      )}

      {active && (hasStaff ? (
        <button className="account-chip" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left, y: r.top - 130, items: [
          { header: staff?.user?.email || active.staffUser?.email || 'Staff account' },
          { label: 'My account', icon: UserCircle, onClick: () => navigate('account') },
          { label: 'Sign out', icon: LogOut, danger: true, onClick: staffSignOut },
        ] }); }}>
          <span className="avatar sm" style={{ background: active.color }}>{initials(staff?.user?.name || active.staffUser?.name || active.staffUser?.email || '?')}</span>
          <span className="grow switcher-text"><b>{staff?.user?.name || active.staffUser?.name || active.staffUser?.email}</b><small>{(staff?.roles || active.staffUser?.roles || []).join(', ') || 'Staff'}</small></span>
        </button>
      ) : (
        <button className="account-chip signin" onClick={() => openLogin(true)}><LogIn size={16} /><span className="grow">Sign in for admin features</span></button>
      ))}
      <button className={classNames('nav-item', 'nav-settings', page.name === 'settings' && 'active')} onClick={() => navigate('settings')}>
        <SettingsIcon size={17} /><span className="grow">Settings</span><kbd>Ctrl ,</kbd>
      </button>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </aside>
  );
}

function Welcome({ onAdd }) {
  return (
    <div className="welcome">
      <div className="welcome-glow" />
      <div className="welcome-card">
        <div className="welcome-logo"><Cloud size={34} /></div>
        <h1>Welcome to CDN Desktop</h1>
        <p>Manage every one of your CDN servers from one place: upload, download, edit, share, purge and monitor without opening the web dashboard.</p>
        <div className="welcome-feats">
          <div><Server size={18} /><b>Multiple servers</b><span>Switch between domains instantly</span></div>
          <div><Upload size={18} /><b>Drag & drop uploads</b><span>Resumable chunked transfers</span></div>
          <div><Sparkles size={18} /><b>Quick upload hotkey</b><span>Clipboard → CDN link in one key</span></div>
        </div>
        <Button variant="primary" size="lg" icon={Plus} onClick={onAdd}>Add your first server</Button>
        <div className="hint" style={{ marginTop: 14 }}>API keys are encrypted with Windows DPAPI and never leave this PC except to your server.</div>
      </div>
    </div>
  );
}

function LockIcon() {
  return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 6, verticalAlign: -1 }}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
}
