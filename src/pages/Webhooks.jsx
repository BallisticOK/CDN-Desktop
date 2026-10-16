import React, { useState } from 'react';
import { Webhook, Plus, RefreshCw, Send, Trash2, Pencil, RotateCw, ListChecks, Repeat } from 'lucide-react';
import { useApp, useApi } from '../lib/store.jsx';
import { api, listOf, ago, date } from '../lib/util.js';
import { PageHeader, Button, Loading, ErrorState, Badge, Empty, Modal, Field, Toggle, CopyField, Card } from '../components/ui.jsx';

const EVENTS = ['file.uploaded', 'file.updated', 'file.deleted', 'upload.failed', 'api_key.created', 'api_key.revoked', 'api_key.suspended', 'file.trashed', 'file.restored', 'file.version_created', 'file.expired', 'cache.purged', 'domain.verified', 'domain.unhealthy', 'media.ready', 'replication.failed', 'share.created', 'share.downloaded', 'quota.threshold'];

export default function Webhooks() {
  const { activeId, toast, confirm } = useApp();
  const { data, error, loading, reload } = useApi((pid) => api(pid, 'GET', '/api/v1/webhooks'));
  const hooks = listOf(data);
  const events = data?.events || EVENTS;
  const [editing, setEditing] = useState(null);
  const [secret, setSecret] = useState(null);
  const [deliveries, setDeliveries] = useState(null);

  const act = async (fn, ok) => { try { const r = await fn(); toast(ok, 'success'); reload(); return r; } catch (e) { toast(e.message, 'error'); } };
  return (
    <div className="page">
      <PageHeader icon={Webhook} title="Webhooks" subtitle="Get notified when things happen on your CDN (e.g. post to a Discord webhook)">
        <Button icon={RefreshCw} onClick={reload} />
        <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>New webhook</Button>
      </PageHeader>
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !hooks.length ? <Empty icon={Webhook} title="No webhooks" action={<Button variant="primary" icon={Plus} onClick={() => setEditing({})}>New webhook</Button>} /> : (
        <div className="stack">
          {hooks.map((h) => (
            <Card key={h.id} title={h.name} icon={Webhook} actions={<>
              <Badge tone={h.enabled ? 'green' : 'neutral'} dot>{h.enabled ? 'enabled' : 'disabled'}</Badge>
              <Button size="sm" variant="ghost" icon={Send} title="Send test" onClick={() => act(() => api(activeId, 'POST', `/api/v1/webhooks/${h.id}/test`), 'Test event sent')} />
              <Button size="sm" variant="ghost" icon={ListChecks} title="Deliveries" onClick={() => setDeliveries(h)} />
              <Button size="sm" variant="ghost" icon={RotateCw} title="Rotate secret" onClick={async () => { const r = await act(() => api(activeId, 'POST', `/api/v1/webhooks/${h.id}/rotate-secret`), 'Secret rotated'); if (r?.secret) setSecret(r.secret); }} />
              <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(h)} />
              <Button size="sm" variant="ghost-danger" icon={Trash2} onClick={async () => { if (await confirm({ title: `Delete ${h.name}?`, danger: true, confirmText: 'Delete', message: 'Deliveries stop immediately.' })) act(() => api(activeId, 'DELETE', `/api/v1/webhooks/${h.id}`), 'Webhook deleted'); }} />
            </>}>
              <div className="mono small">{h.url}</div>
              <div className="scope-list" style={{ marginTop: 10 }}>{(h.events || []).map((e) => <Badge key={e} tone="accent">{e}</Badge>)}</div>
            </Card>
          ))}
        </div>
      )}
      {editing && <HookEditor hook={editing} events={events} onClose={() => setEditing(null)} onSaved={(s) => { setEditing(null); reload(); if (s) setSecret(s); }} />}
      {secret && <Modal title="Signing secret" onClose={() => setSecret(null)} footer={<Button variant="primary" onClick={() => setSecret(null)}>Done</Button>}><div className="stack"><div className="muted">Use this to verify webhook signatures. It is only shown once.</div><CopyField value={secret} /></div></Modal>}
      {deliveries && <Deliveries hook={deliveries} onClose={() => setDeliveries(null)} />}
    </div>
  );
}

function HookEditor({ hook, events, onClose, onSaved }) {
  const { activeId, toast } = useApp();
  const [f, setF] = useState({ name: hook.name || '', url: hook.url || '', events: hook.events || ['file.uploaded'], enabled: hook.enabled ?? true });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const r = hook.id ? await api(activeId, 'PATCH', `/api/v1/webhooks/${hook.id}`, { body: f }) : await api(activeId, 'POST', '/api/v1/webhooks', { body: f });
      toast('Webhook saved', 'success'); onSaved(r?.secret);
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  const toggle = (e) => setF({ ...f, events: f.events.includes(e) ? f.events.filter((x) => x !== e) : [...f.events, e] });
  return (
    <Modal title={hook.id ? 'Edit webhook' : 'New webhook'} icon={Webhook} onClose={onClose} width={600} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      <div className="form-grid">
        <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Endpoint URL"><input className="input mono" placeholder="https://…" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></Field>
        <Field label="Enabled" row><Toggle checked={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} /></Field>
      </div>
      <div className="section-title">Events</div>
      <div className="chips">{events.map((e) => <button key={e} className={`chip ${f.events.includes(e) ? 'on' : ''}`} onClick={() => toggle(e)}>{e}</button>)}</div>
    </Modal>
  );
}

function Deliveries({ hook, onClose }) {
  const { activeId, toast } = useApp();
  const { data, error, loading, reload } = useApi((pid) => api(pid, 'GET', `/api/v1/webhooks/${hook.id}/deliveries`, { query: { limit: 50 } }), [hook.id]);
  const list = listOf(data, 'deliveries');
  const retry = async (d, replay) => {
    try { await api(activeId, 'POST', `/api/v1/webhooks/deliveries/${d.id}/${replay ? 'replay' : 'retry'}`); toast(replay ? 'Replayed' : 'Retry queued', 'success'); reload(); }
    catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal title="Deliveries" subtitle={hook.name} icon={ListChecks} onClose={onClose} width={760}>
      {loading ? <Loading /> : error ? <ErrorState error={error} compact /> : list.length ? (
        <table className="table compact">
          <thead><tr><th>When</th><th>Event</th><th>Status</th><th>Attempts</th><th /></tr></thead>
          <tbody>{list.map((d) => (
            <tr key={d.id}>
              <td className="muted nowrap" title={date(d.created_at)}>{ago(d.created_at)}</td>
              <td className="mono small">{d.event || d.type}</td>
              <td><Badge tone={d.status === 'delivered' || d.status === 'success' || (d.response_status >= 200 && d.response_status < 300) ? 'green' : d.status === 'pending' ? 'amber' : 'red'}>{d.response_status || d.status}</Badge></td>
              <td className="muted">{d.attempts ?? d.attempt ?? '—'}</td>
              <td className="right nowrap"><Button size="sm" variant="ghost" icon={RotateCw} onClick={() => retry(d)} title="Retry" /><Button size="sm" variant="ghost" icon={Repeat} onClick={() => retry(d, true)} title="Replay" /></td>
            </tr>
          ))}</tbody>
        </table>
      ) : <div className="chart-empty small">No deliveries yet</div>}
    </Modal>
  );
}
