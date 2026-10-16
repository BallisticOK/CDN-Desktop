import React, { useState } from 'react';
import { Share2, RefreshCw, Ban, Eye, Pencil } from 'lucide-react';
import { useApp, useApi } from '../lib/store.jsx';
import { api, listOf, ago, date, num } from '../lib/util.js';
import { PageHeader, Button, Segmented, Loading, ErrorState, Empty, Badge, Modal, KV, Field, Select } from '../components/ui.jsx';

export default function Shares() {
  const { activeId, toast, confirm, navigate } = useApp();
  const [state, setState] = useState('active');
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const { data, error, loading, reload } = useApi((pid) => api(pid, 'GET', '/api/v1/shares', { query: { state, page, limit: 50 } }), [state, page]);
  const shares = listOf(data, 'shares');
  const pg = data?.pagination;

  const revoke = async (s) => {
    if (!(await confirm({ title: 'Revoke share link?', message: 'Anyone with the link will immediately lose access.', danger: true, confirmText: 'Revoke' }))) return;
    try { await api(activeId, 'POST', `/api/v1/shares/${s.id}/revoke`); toast('Share revoked', 'success'); reload(); }
    catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="page">
      <PageHeader icon={Share2} title="Share links" subtitle="Human-friendly links for files, with passwords, expiry and download limits">
        <Segmented value={state} onChange={(v) => { setState(v); setPage(1); }} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'all', label: 'All' }]} />
        <Button icon={RefreshCw} onClick={reload} />
      </PageHeader>
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !shares.length ? (
        <Empty icon={Share2} title="No share links" action={<Button onClick={() => navigate('files')}>Go to files</Button>}>Right-click any file and choose “Create share link…”.</Empty>
      ) : (
        <div className="card">
          <table className="table">
            <thead><tr><th>File</th><th>Status</th><th>Downloads</th><th>Protection</th><th>Expires</th><th>Created</th><th /></tr></thead>
            <tbody>
              {shares.map((s) => {
                const isActive = !s.revoked_at && s.state !== 'revoked' && s.state !== 'inactive' && s.active !== false;
                return (
                  <tr key={s.id}>
                    <td><div className="ellipsis" style={{ maxWidth: 320 }}><b>{s.file?.name || s.file_name || s.file_id}</b></div>{s.message && <small className="muted">“{s.message}”</small>}</td>
                    <td><Badge tone={isActive ? 'green' : 'neutral'} dot>{s.state || (isActive ? 'active' : 'inactive')}</Badge></td>
                    <td>{num(s.download_count ?? s.downloads ?? 0)}{s.max_downloads ? <span className="muted"> / {s.max_downloads}</span> : ''}</td>
                    <td className="row gap">{(s.has_password || s.password_protected) && <Badge tone="amber">password</Badge>}{s.one_time && <Badge tone="blue">one-time</Badge>}{s.require_email && <Badge tone="neutral">email</Badge>}{s.allowed_countries?.length ? <Badge tone="neutral">{s.allowed_countries.join(',')}</Badge> : null}</td>
                    <td className="muted" title={date(s.expires_at)}>{s.expires_at ? ago(s.expires_at) : 'never'}</td>
                    <td className="muted" title={date(s.created_at)}>{ago(s.created_at)}</td>
                    <td className="nowrap right">
                      <Button size="sm" variant="ghost" icon={Eye} onClick={() => setViewing(s)} title="Access log" />
                      {isActive && <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(s)} title="Edit" />}
                      {isActive && <Button size="sm" variant="ghost-danger" icon={Ban} onClick={() => revoke(s)} title="Revoke" />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pg && pg.total_pages > 1 && (
            <div className="pager"><Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span className="muted small">Page {page} of {pg.total_pages}</span><Button size="sm" disabled={!pg.has_more} onClick={() => setPage(page + 1)}>Next</Button></div>
          )}
        </div>
      )}
      {viewing && <ShareLog share={viewing} onClose={() => setViewing(null)} />}
      {editing && <ShareEdit share={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

function ShareLog({ share, onClose }) {
  const { data, error, loading } = useApi((pid) => api(pid, 'GET', `/api/v1/shares/${share.id}`), [share.id]);
  const s = data?.share || data || share;
  const log = data?.access_log || data?.accesses || data?.log || [];
  return (
    <Modal title="Share details" subtitle={s.file?.name || s.file_id} icon={Eye} onClose={onClose} width={640}>
      {loading ? <Loading /> : error ? <ErrorState error={error} compact /> : <>
        <KV rows={[['Created', date(s.created_at)], ['Expires', s.expires_at ? date(s.expires_at) : 'never'], ['Downloads', `${num(s.download_count ?? 0)}${s.max_downloads ? ` / ${s.max_downloads}` : ''}`], ['Revoked', s.revoked_at ? date(s.revoked_at) : '—']]} />
        <div className="section-title">Access log</div>
        {log.length ? (
          <table className="table compact"><thead><tr><th>When</th><th>Event</th><th>IP</th><th>Country</th><th>Email</th></tr></thead>
            <tbody>{log.map((l, i) => <tr key={i}><td className="nowrap">{ago(l.created_at || l.at)}</td><td>{l.event || l.action || l.type}</td><td className="mono small">{l.ip}</td><td>{l.country}</td><td>{l.email || '—'}</td></tr>)}</tbody>
          </table>
        ) : <div className="chart-empty small">No access recorded yet</div>}
      </>}
    </Modal>
  );
}

function ShareEdit({ share, onClose, onSaved }) {
  const { activeId, toast } = useApp();
  const [f, setF] = useState({ message: share.message || '', max_downloads: share.max_downloads || '', expires_at: share.expires_at ? share.expires_at.slice(0, 16) : '', password: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    setBusy(true);
    try {
      await api(activeId, 'PATCH', `/api/v1/shares/${share.id}`, { body: { message: f.message, max_downloads: f.max_downloads ? Number(f.max_downloads) : null, expires_at: f.expires_at ? new Date(f.expires_at).toISOString() : null, ...(f.password ? { password: f.password } : {}) } });
      toast('Share updated', 'success'); onSaved();
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  return (
    <Modal title="Edit share link" icon={Pencil} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      <div className="form-grid">
        <Field label="Message"><input className="input" value={f.message} onChange={set('message')} /></Field>
        <Field label="Max downloads"><input className="input" type="number" value={f.max_downloads} onChange={set('max_downloads')} placeholder="Unlimited" /></Field>
        <Field label="Expires at"><input className="input" type="datetime-local" value={f.expires_at} onChange={set('expires_at')} /></Field>
        <Field label="New password" hint="Leave blank to keep the current password"><input className="input" type="password" value={f.password} onChange={set('password')} /></Field>
      </div>
    </Modal>
  );
}
