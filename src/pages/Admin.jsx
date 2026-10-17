import React, { useState } from 'react';
import {
  UserCircle, Users as UsersIcon, ScrollText, ShieldAlert, LogIn, LogOut, Monitor, Trash2, KeyRound, RefreshCw, Plus, Ban,
  CheckCircle2, MailPlus, ShieldOff, Search, Lock,
} from 'lucide-react';
import { useApp, useApi } from '../lib/store.jsx';
import { api, listOf, ago, date, num, classNames, initials } from '../lib/util.js';
import { PageHeader, Button, Card, Loading, ErrorState, Badge, Empty, KV, Modal, Field, Toggle, Stat, Select } from '../components/ui.jsx';

// Shown in place of staff-only pages until the user signs in.
export function StaffGate({ children, title, icon: Icon }) {
  const { hasStaff, openLogin, active } = useApp();
  if (hasStaff) return children;
  return (
    <div className="page">
      <PageHeader icon={Icon} title={title} />
      <div className="gate">
        <div className="gate-icon"><Lock size={26} /></div>
        <h2>Sign in to {active?.name}</h2>
        <p className="muted">This area uses your CDN staff account. API keys can’t access users, audit logs, security events, API key management or webhooks.</p>
        <Button variant="primary" size="lg" icon={LogIn} onClick={() => openLogin(true)}>Sign in</Button>
      </div>
    </div>
  );
}
const sess = { mode: 'session' };

// ---------------------------------------------------------------- My account
export function Account() {
  return <StaffGate title="My account" icon={UserCircle}><AccountInner /></StaffGate>;
}
function AccountInner() {
  const { activeId, staff, staffSignOut, toast, confirm, active } = useApp();
  const sessions = useApi((pid) => api(pid, 'GET', '/api/v1/auth/sessions', sess));
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const user = staff?.user || {};
  const list = listOf(sessions.data, 'sessions');

  const revoke = async (s) => {
    try { await api(activeId, 'DELETE', `/api/v1/auth/sessions/${s.id}`, sess); toast('Session signed out', 'success'); sessions.reload(); }
    catch (e) { toast(e.message, 'error'); }
  };
  const logoutAll = async () => {
    if (!(await confirm({ title: 'Sign out everywhere?', message: 'All of your sessions, including the web dashboard and this app, will be signed out.', danger: true, confirmText: 'Sign out all' }))) return;
    try { await api(activeId, 'POST', '/api/v1/auth/logout-all', sess); } catch {}
    await staffSignOut(); toast('Signed out of all devices', 'success');
  };
  const changePassword = async (e) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) { toast('New passwords do not match', 'warn'); return; }
    setBusy(true);
    try { await api(activeId, 'POST', '/api/v1/auth/password', { ...sess, body: { current_password: pw.current, new_password: pw.next } }); toast('Password changed', 'success'); setPw({ current: '', next: '', confirm: '' }); }
    catch (err) { toast(err.message, 'error'); }
    setBusy(false);
  };

  return (
    <div className="page">
      <PageHeader icon={UserCircle} title="My account" subtitle={`Staff account on ${active?.name}`}>
        <Button icon={LogOut} onClick={staffSignOut}>Sign out</Button>
      </PageHeader>
      <div className="grid-2">
        <Card>
          <div className="account-hero">
            <span className="avatar xl" style={{ background: active?.color }}>{initials(user.name || user.email)}</span>
            <div>
              <h2>{user.name || user.email}</h2>
              <div className="muted">{user.email}</div>
              <div className="scope-list" style={{ marginTop: 8 }}>{(staff?.roles || []).map((r) => <Badge key={r} tone="accent">{r}</Badge>)}
                <Badge tone={user.two_factor_enabled ? 'green' : 'amber'} dot>2FA {user.two_factor_enabled ? 'on' : 'off'}</Badge></div>
            </div>
          </div>
          <div className="section-title" style={{ marginTop: 18 }}>Permissions</div>
          <div className="scope-list tight" style={{ marginTop: 8 }}>{(staff?.permissions || []).map((p) => <Badge key={p} tone="neutral">{p}</Badge>)}</div>
        </Card>
        <Card title="Change password" icon={KeyRound}>
          <form className="stack" onSubmit={changePassword}>
            <Field label="Current password"><input className="input" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
            <Field label="New password"><input className="input" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
            <Field label="Confirm new password"><input className="input" type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
            <div><Button variant="primary" type="submit" loading={busy} disabled={!pw.current || !pw.next}>Update password</Button></div>
          </form>
        </Card>
      </div>
      <Card title="Active sessions" icon={Monitor} pad={false} actions={<><Button size="sm" variant="ghost" icon={RefreshCw} onClick={sessions.reload} /><Button size="sm" variant="ghost-danger" icon={LogOut} onClick={logoutAll}>Sign out everywhere</Button></>}>
        {sessions.loading ? <Loading /> : sessions.error ? <div className="card-body"><ErrorState error={sessions.error} compact /></div> : (
          <table className="table compact">
            <thead><tr><th>Device</th><th>IP</th><th>Signed in</th><th>Last active</th><th /></tr></thead>
            <tbody>{list.map((s) => (
              <tr key={s.id}>
                <td><div className="ellipsis" style={{ maxWidth: 380 }}>{s.user_agent || s.device || 'Unknown'}</div>{(s.current || s.id === staff?.session_id) && <Badge tone="accent">this app</Badge>}</td>
                <td className="mono small">{s.ip || s.last_ip || '—'}</td>
                <td className="muted" title={date(s.created_at)}>{ago(s.created_at)}</td>
                <td className="muted">{ago(s.last_seen_at || s.last_active_at || s.updated_at)}</td>
                <td className="right">{!(s.current || s.id === staff?.session_id) && <Button size="sm" variant="ghost-danger" icon={LogOut} onClick={() => revoke(s)}>Sign out</Button>}</td>
              </tr>
            ))}{!list.length && <tr><td colSpan={5}><div className="chart-empty small">No sessions listed</div></td></tr>}</tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- Users
export function Users() {
  return <StaffGate title="Users" icon={UsersIcon}><UsersInner /></StaffGate>;
}
function UsersInner() {
  const { activeId, toast, confirm } = useApp();
  const [q, setQ] = useState('');
  const { data, error, loading, reload } = useApi((pid) => api(pid, 'GET', '/api/v1/users', { ...sess, query: { q: q || undefined, limit: 100 } }), [q]);
  const roles = useApi((pid) => api(pid, 'GET', '/api/v1/roles', sess));
  const users = listOf(data);
  const [selected, setSelected] = useState(new Set());
  const [inviting, setInviting] = useState(false);

  const act = async (fn, ok) => { try { await fn(); toast(ok, 'success'); reload(); } catch (e) { toast(e.message, 'error'); } };
  const bulk = async (label, fn) => {
    const list = users.filter((u) => selected.has(u.id));
    if (!(await confirm({ title: `${label} ${list.length} user${list.length > 1 ? 's' : ''}?`, message: list.map((u) => u.email).join(', '), danger: label === 'Delete' || label === 'Disable', confirmText: label }))) return;
    const r = await Promise.allSettled(list.map(fn));
    toast(`${label}: ${r.filter((x) => x.status === 'fulfilled').length}/${list.length} done`, r.every((x) => x.status === 'fulfilled') ? 'success' : 'warn');
    setSelected(new Set()); reload();
  };
  const toggle = (id) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); };

  return (
    <div className="page">
      <PageHeader icon={UsersIcon} title="Users" subtitle="Staff accounts on this server">
        <div className="search"><Search size={15} /><input placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Button icon={RefreshCw} onClick={reload} />
        <Button variant="primary" icon={Plus} onClick={() => setInviting(true)}>Add user</Button>
      </PageHeader>
      {selected.size > 0 && (
        <div className="bulkbar">
          <b>{selected.size} selected</b>
          <Button size="sm" variant="ghost" icon={CheckCircle2} onClick={() => bulk('Enable', (u) => api(activeId, 'POST', `/api/v1/users/${u.id}/enable`, sess))}>Enable</Button>
          <Button size="sm" variant="ghost" icon={Ban} onClick={() => bulk('Disable', (u) => api(activeId, 'POST', `/api/v1/users/${u.id}/disable`, sess))}>Disable</Button>
          <Button size="sm" variant="ghost" icon={LogOut} onClick={() => bulk('Sign out', (u) => api(activeId, 'DELETE', `/api/v1/users/${u.id}/sessions`, sess))}>Sign out</Button>
          <Button size="sm" variant="ghost-danger" icon={Trash2} onClick={() => bulk('Delete', (u) => api(activeId, 'DELETE', `/api/v1/users/${u.id}`, sess))}>Delete</Button>
        </div>
      )}
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !users.length ? <Empty icon={UsersIcon} title="No users found" /> : (
        <div className="card">
          <table className="table">
            <thead><tr><th style={{ width: 36 }}><input type="checkbox" checked={selected.size === users.length} onChange={(e) => setSelected(new Set(e.target.checked ? users.map((u) => u.id) : []))} /></th><th>User</th><th>Roles</th><th>Status</th><th>2FA</th><th>Last login</th><th /></tr></thead>
            <tbody>{users.map((u) => (
              <tr key={u.id} className={selected.has(u.id) ? 'selected' : ''}>
                <td><input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} /></td>
                <td><div className="name-cell"><span className="avatar">{initials(u.name || u.email)}</span><div><b>{u.name || '—'}</b><div className="muted small">{u.email}</div></div></div></td>
                <td><div className="scope-list tight">{(u.roles || []).map((r) => <Badge key={r.id || r} tone="accent">{r.name || r}</Badge>)}</div></td>
                <td><Badge tone={u.status === 'ACTIVE' ? 'green' : u.status === 'INVITED' ? 'blue' : 'red'} dot>{String(u.status || '').toLowerCase()}</Badge></td>
                <td><Badge tone={u.two_factor_enabled ? 'green' : u.require_two_factor ? 'amber' : 'neutral'}>{u.two_factor_enabled ? 'on' : u.require_two_factor ? 'required' : 'off'}</Badge></td>
                <td className="muted small" title={date(u.last_login_at)}>{ago(u.last_login_at)}<div className="mono">{u.last_login_ip || ''}</div></td>
                <td className="nowrap right">
                  {u.status === 'ACTIVE' ? <Button size="sm" variant="ghost" icon={Ban} title="Disable" onClick={() => act(() => api(activeId, 'POST', `/api/v1/users/${u.id}/disable`, sess), 'User disabled')} />
                    : <Button size="sm" variant="ghost" icon={CheckCircle2} title="Enable" onClick={() => act(() => api(activeId, 'POST', `/api/v1/users/${u.id}/enable`, sess), 'User enabled')} />}
                  <Button size="sm" variant="ghost" icon={MailPlus} title="Send password reset" onClick={() => act(() => api(activeId, 'POST', `/api/v1/users/${u.id}/reset-password`, sess), 'Reset link issued')} />
                  {u.two_factor_enabled && <Button size="sm" variant="ghost" icon={ShieldOff} title="Reset 2FA" onClick={async () => { if (await confirm({ title: `Reset 2FA for ${u.email}?`, message: 'They will have to enrol again at next sign-in.', confirmText: 'Reset 2FA' })) act(() => api(activeId, 'POST', `/api/v1/users/${u.id}/reset-2fa`, sess), '2FA reset'); }} />}
                  <Button size="sm" variant="ghost-danger" icon={Trash2} title="Delete" onClick={async () => { if (await confirm({ title: `Delete ${u.email}?`, message: 'This cannot be undone.', danger: true, confirmText: 'Delete' })) act(() => api(activeId, 'DELETE', `/api/v1/users/${u.id}`, sess), 'User deleted'); }} />
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {inviting && <InviteUser roles={listOf(roles.data, 'roles')} onClose={() => setInviting(false)} onDone={() => { setInviting(false); reload(); }} />}
    </div>
  );
}
function InviteUser({ roles, onClose, onDone }) {
  const { activeId, toast } = useApp();
  const [f, setF] = useState({ email: '', name: '', role_ids: [], invite: true, password: '', require_two_factor: false });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api(activeId, 'POST', '/api/v1/users', { ...sess, body: { email: f.email, name: f.name || undefined, role_ids: f.role_ids, invite: f.invite, password: f.invite ? undefined : f.password, require_two_factor: f.require_two_factor } });
      toast(f.invite ? 'Invitation sent' : 'User created', 'success'); onDone();
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  return (
    <Modal title="Add user" icon={UsersIcon} onClose={onClose} width={520} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save} disabled={!f.email}>{f.invite ? 'Send invite' : 'Create user'}</Button></>}>
      <div className="form-grid">
        <Field label="Email"><input className="input" type="email" autoFocus value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Roles">
          <div className="chips">{roles.map((r) => <button type="button" key={r.id} className={`chip ${f.role_ids.includes(r.id) ? 'on' : ''}`} onClick={() => setF({ ...f, role_ids: f.role_ids.includes(r.id) ? f.role_ids.filter((x) => x !== r.id) : [...f.role_ids, r.id] })}>{r.name}</button>)}
            {!roles.length && <span className="muted small">No roles available</span>}</div>
        </Field>
        <Field label="Send invitation email" row><Toggle checked={f.invite} onChange={(v) => setF({ ...f, invite: v })} /></Field>
        {!f.invite && <Field label="Password"><input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>}
        <Field label="Require 2FA" row><Toggle checked={f.require_two_factor} onChange={(v) => setF({ ...f, require_two_factor: v })} /></Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Audit log
export function Audit() {
  return <StaffGate title="Audit log" icon={ScrollText}><AuditInner /></StaffGate>;
}
function AuditInner() {
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const actions = useApi((pid) => api(pid, 'GET', '/api/v1/audit-logs/actions', sess));
  const { data, error, loading, reload } = useApi((pid) => api(pid, 'GET', '/api/v1/audit-logs', { ...sess, query: { q: q || undefined, action: action || undefined, page, limit: 100 } }), [q, action, page]);
  const rows = listOf(data);
  const pg = data?.pagination;
  const actionList = listOf(actions.data, 'actions').map((a) => (typeof a === 'string' ? a : a.action));
  const [open, setOpen] = useState(null);
  return (
    <div className="page">
      <PageHeader icon={ScrollText} title="Audit log" subtitle={pg ? `${num(pg.total)} recorded actions` : 'Who did what, and when'}>
        <div className="search"><Search size={15} /><input placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        <Select value={action} onChange={(v) => { setAction(v); setPage(1); }} options={[{ value: '', label: 'All actions' }, ...actionList.map((a) => ({ value: a, label: a }))]} />
        <Button icon={RefreshCw} onClick={reload} />
      </PageHeader>
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : (
        <div className="card">
          <table className="table compact">
            <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>IP</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} onClick={() => setOpen(r)} style={{ cursor: 'pointer' }}>
                <td className="muted nowrap" title={date(r.timestamp || r.created_at)}>{ago(r.timestamp || r.created_at)}</td>
                <td>{r.actor_label || r.actor_id}<div className="muted small">{r.actor_type}</div></td>
                <td><Badge tone={/DELETE|REVOKE|DISABLE|FAIL/.test(r.action) ? 'red' : /CREATE|ENABLE/.test(r.action) ? 'green' : 'accent'}>{r.action}</Badge></td>
                <td className="mono small">{r.target_type}{r.target_id ? ` · ${r.target_id}` : ''}</td>
                <td className="mono small muted">{r.ip}</td>
              </tr>
            ))}{!rows.length && <tr><td colSpan={5}><div className="chart-empty small">No entries</div></td></tr>}</tbody>
          </table>
          {pg && pg.total_pages > 1 && <div className="pager"><Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span className="muted small">Page {page} of {pg.total_pages}</span><Button size="sm" disabled={!pg.has_more} onClick={() => setPage(page + 1)}>Next</Button></div>}
        </div>
      )}
      {open && (
        <Modal title={open.action} subtitle={date(open.timestamp || open.created_at)} icon={ScrollText} onClose={() => setOpen(null)} width={600}>
          <KV rows={[['Actor', `${open.actor_label || ''} (${open.actor_type})`], ['Target', `${open.target_type || ''} ${open.target_id || ''}`], ['IP', open.ip], ['User agent', open.user_agent]]} />
          <div className="section-title" style={{ margin: '16px 0 8px' }}>Metadata</div>
          <pre className="json-view">{JSON.stringify(open.metadata ?? {}, null, 2)}</pre>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Security
export function Security() {
  return <StaffGate title="Security" icon={ShieldAlert}><SecurityInner /></StaffGate>;
}
function SecurityInner() {
  const [severity, setSeverity] = useState('');
  const summary = useApi((pid) => api(pid, 'GET', '/api/v1/security/summary', sess));
  const events = useApi((pid) => api(pid, 'GET', '/api/v1/security/events', { ...sess, query: { severity: severity || undefined, limit: 100 } }), [severity]);
  const s = summary.data || {};
  const numeric = Object.entries(s).filter(([, v]) => typeof v === 'number').slice(0, 5);
  const rows = listOf(events.data, 'events');
  return (
    <div className="page">
      <PageHeader icon={ShieldAlert} title="Security" subtitle="Sign-in activity, suspicious requests and bans">
        <Select value={severity} onChange={setSeverity} options={[{ value: '', label: 'All severities' }, 'low', 'medium', 'high', 'critical'].map((o) => typeof o === 'string' ? { value: o, label: o } : o)} />
        <Button icon={RefreshCw} onClick={() => { summary.reload(); events.reload(); }} />
      </PageHeader>
      {summary.error ? <ErrorState error={summary.error} compact /> : numeric.length > 0 && (
        <div className="stats">{numeric.map(([k, v], i) => <Stat key={k} label={k.replace(/_/g, ' ')} value={num(v)} tone={['accent', 'red', 'amber', 'green', 'cyan'][i % 5]} icon={ShieldAlert} />)}</div>
      )}
      <Card title="Events" icon={ShieldAlert} pad={false}>
        {events.loading ? <Loading /> : events.error ? <div className="card-body"><ErrorState error={events.error} compact /></div> : (
          <table className="table compact">
            <thead><tr><th>When</th><th>Type</th><th>Severity</th><th>IP</th><th>Details</th></tr></thead>
            <tbody>{rows.map((e, i) => (
              <tr key={e.id || i}>
                <td className="muted nowrap" title={date(e.created_at || e.timestamp)}>{ago(e.created_at || e.timestamp)}</td>
                <td className="mono small">{e.type || e.event}</td>
                <td><Badge tone={{ critical: 'red', high: 'red', medium: 'amber', low: 'neutral' }[String(e.severity).toLowerCase()] || 'neutral'}>{e.severity || '—'}</Badge></td>
                <td className="mono small">{e.ip}</td>
                <td className="small ellipsis" style={{ maxWidth: 420 }}>{e.message || e.description || (e.metadata ? JSON.stringify(e.metadata) : '')}</td>
              </tr>
            ))}{!rows.length && <tr><td colSpan={5}><div className="chart-empty small">No security events</div></td></tr>}</tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
