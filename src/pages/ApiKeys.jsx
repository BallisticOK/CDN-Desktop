import React, { useState } from 'react';
import { KeyRound, Plus, RefreshCw, RotateCw, Ban, Power, CheckCircle2, ShieldOff } from 'lucide-react';
import { useApp, useApi } from '../lib/store.jsx';
import { api, listOf, ago, date, num } from '../lib/util.js';
import { PageHeader, Button, Loading, ErrorState, Badge, Empty, Modal, Field, Select, CopyField, Toggle } from '../components/ui.jsx';

const SCOPES = {
  'files:read': 'List, inspect and download files, create signed URLs', 'files:upload': 'Upload files', 'files:update': 'Rename, move, copy files and change settings',
  'files:delete': 'Delete files', 'folders:read': 'List and inspect folders', 'folders:write': 'Create, update and delete folders', 'analytics:read': 'Read analytics',
  'metadata:read': 'Read file metadata', 'metadata:write': 'Write custom file metadata', 'zones:read': 'List projects, zones and domains',
  'zones:write': 'Create and configure zones, domains and cache rules', 'cache:purge': 'Purge and pre-warm the CDN cache', 'shares:write': 'Create and revoke share links', 'usage:read': 'Read usage and quotas',
};

export default function ApiKeys() {
  const { activeId, toast, confirm, me } = useApp();
  const [status, setStatus] = useState('');
  const { data, error, loading, reload } = useApi((pid) => api(pid, 'GET', '/api/v1/api-keys', { query: { status: status || undefined, limit: 100 } }), [status]);
  const keys = listOf(data);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState(null);

  const act = async (fn, ok) => { try { const r = await fn(); toast(ok, 'success'); reload(); return r; } catch (e) { toast(e.message, 'error'); } };
  const rotate = async (k) => {
    if (!(await confirm({ title: `Rotate “${k.name}”?`, message: 'A new secret is issued. The old one keeps working for a 1 hour grace period so you can update your apps.', confirmText: 'Rotate' }))) return;
    const r = await act(() => api(activeId, 'POST', `/api/v1/api-keys/${k.id}/rotate`, { body: { grace_period_seconds: 3600 } }), 'Key rotated');
    if (r?.key) setNewKey({ name: k.name, key: r.key });
  };
  const revoke = async (k) => {
    if (!(await confirm({ title: `Revoke “${k.name}”?`, message: `Anything using ${k.prefix}… will stop working immediately.${me?.api_key?.id === k.id ? ' This is the key this app is using!' : ''}`, danger: true, confirmText: 'Revoke' }))) return;
    act(() => api(activeId, 'DELETE', `/api/v1/api-keys/${k.id}`), 'Key revoked');
  };

  return (
    <div className="page">
      <PageHeader icon={KeyRound} title="API keys" subtitle="Scoped keys for apps, CI and bots">
        <Select value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'revoked', label: 'Revoked' }, { value: 'expired', label: 'Expired' }]} />
        <Button icon={RefreshCw} onClick={reload} />
        <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New key</Button>
      </PageHeader>
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !keys.length ? <Empty icon={KeyRound} title="No API keys" /> : (
        <div className="card">
          <table className="table">
            <thead><tr><th>Name</th><th>Key</th><th>Scopes</th><th>Status</th><th>Requests</th><th>Last used</th><th /></tr></thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td><b>{k.name}</b>{me?.api_key?.id === k.id && <Badge tone="accent">this app</Badge>}<div className="muted small">{k.created_by?.name ? `by ${k.created_by.name} · ` : ''}{ago(k.created_at)}</div></td>
                  <td className="mono small">{k.masked_key || `${k.prefix}…`}<div><Badge tone={k.environment === 'live' ? 'green' : 'amber'}>{k.environment}</Badge></div></td>
                  <td><div className="scope-list tight">{(k.scopes || []).slice(0, 4).map((s) => <Badge key={s} tone="neutral">{s}</Badge>)}{k.scopes?.length > 4 && <Badge tone="neutral">+{k.scopes.length - 4}</Badge>}</div></td>
                  <td><Badge tone={k.status === 'active' && k.enabled ? 'green' : k.status === 'suspended' ? 'amber' : 'red'} dot>{k.enabled === false && k.status === 'active' ? 'disabled' : k.status}</Badge>{k.expires_at && <div className="muted small">exp. {ago(k.expires_at)}</div>}</td>
                  <td className="muted">{num(k.request_count)}<div className="small">{k.rate_limit ? `${k.rate_limit}/min` : ''}</div></td>
                  <td className="muted small" title={date(k.last_used_at)}>{ago(k.last_used_at)}<div className="mono">{k.last_used_ip || ''}</div></td>
                  <td className="nowrap right">
                    {k.status === 'suspended' && <Button size="sm" variant="ghost" icon={ShieldOff} title="Lift suspension" onClick={() => act(() => api(activeId, 'POST', `/api/v1/api-keys/${k.id}/unsuspend`), 'Suspension lifted')} />}
                    {k.status === 'active' && <>
                      <Button size="sm" variant="ghost" icon={Power} title={k.enabled ? 'Disable' : 'Enable'} onClick={() => act(() => api(activeId, 'PATCH', `/api/v1/api-keys/${k.id}`, { body: { enabled: !k.enabled } }), k.enabled ? 'Key disabled' : 'Key enabled')} />
                      <Button size="sm" variant="ghost" icon={RotateCw} title="Rotate" onClick={() => rotate(k)} />
                      <Button size="sm" variant="ghost-danger" icon={Ban} title="Revoke" onClick={() => revoke(k)} />
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <CreateKey onClose={() => setCreating(false)} onCreated={(r) => { setCreating(false); setNewKey(r); reload(); }} />}
      {newKey && (
        <Modal title="Copy your new key" icon={CheckCircle2} onClose={() => setNewKey(null)} footer={<Button variant="primary" onClick={() => setNewKey(null)}>I’ve saved it</Button>}>
          <div className="stack">
            <div className="muted">This is the only time <b>{newKey.name}</b>’s secret will be shown.</div>
            <CopyField value={newKey.key} />
          </div>
        </Modal>
      )}
    </div>
  );
}

function CreateKey({ onClose, onCreated }) {
  const { activeId, toast } = useApp();
  const [f, setF] = useState({ name: '', environment: 'live', scopes: ['files:read', 'files:upload'], expires: '', rate_limit: '', ip_restrictions: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const toggle = (s) => set('scopes')(f.scopes.includes(s) ? f.scopes.filter((x) => x !== s) : [...f.scopes, s]);
  const create = async () => {
    if (!f.name.trim()) { toast('Name the key', 'warn'); return; }
    setBusy(true);
    try {
      const r = await api(activeId, 'POST', '/api/v1/api-keys', { body: {
        name: f.name.trim(), environment: f.environment, scopes: f.scopes,
        expires_at: f.expires ? new Date(Date.now() + Number(f.expires) * 86400000).toISOString() : undefined,
        rate_limit: f.rate_limit ? Number(f.rate_limit) : undefined,
        ip_restrictions: f.ip_restrictions ? f.ip_restrictions.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        notes: f.notes || undefined,
      } });
      onCreated({ name: f.name, key: r.key });
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  return (
    <Modal title="New API key" icon={KeyRound} onClose={onClose} width={620} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={create}>Create key</Button></>}>
      <div className="form-grid two">
        <Field label="Name"><input className="input" autoFocus placeholder="e.g. Discord bot" value={f.name} onChange={set('name')} /></Field>
        <Field label="Environment"><Select value={f.environment} onChange={set('environment')} options={[{ value: 'live', label: 'Live' }, { value: 'test', label: 'Test' }]} /></Field>
        <Field label="Expires"><Select value={f.expires} onChange={set('expires')} options={[{ value: '', label: 'Never' }, { value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: '1 year' }]} /></Field>
        <Field label="Rate limit (req/min)"><input className="input" type="number" placeholder="Default" value={f.rate_limit} onChange={set('rate_limit')} /></Field>
        <Field label="IP restrictions"><input className="input mono" placeholder="203.0.113.0/24, …" value={f.ip_restrictions} onChange={set('ip_restrictions')} /></Field>
        <Field label="Notes"><input className="input" value={f.notes} onChange={set('notes')} /></Field>
      </div>
      <div className="section-title row">Scopes <div className="grow" /><Button size="sm" variant="ghost" onClick={() => set('scopes')(Object.keys(SCOPES))}>All</Button><Button size="sm" variant="ghost" onClick={() => set('scopes')([])}>None</Button></div>
      <div className="scope-grid">
        {Object.entries(SCOPES).map(([s, d]) => (
          <label key={s} className={`scope-opt ${f.scopes.includes(s) ? 'on' : ''}`}>
            <Toggle checked={f.scopes.includes(s)} onChange={() => toggle(s)} />
            <div><div className="mono small">{s}</div><div className="muted small">{d}</div></div>
          </label>
        ))}
      </div>
    </Modal>
  );
}
