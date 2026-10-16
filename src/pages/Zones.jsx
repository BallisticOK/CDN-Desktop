import React, { useState } from 'react';
import { Globe2, RefreshCw, Plus, ShieldCheck, Stethoscope, Star, Trash2, Copy as CopyIcon, Settings2, Save } from 'lucide-react';
import { useApp, useApi } from '../lib/store.jsx';
import { api, listOf, ago, VISIBILITIES, VIS_LABEL } from '../lib/util.js';
import { PageHeader, Button, Card, Loading, ErrorState, Badge, Empty, KV, Modal, Field, Select, Toggle } from '../components/ui.jsx';

export default function Zones() {
  const { activeId, toast, prompt, confirm } = useApp();
  const { data, error, loading, reload } = useApi((pid) => api(pid, 'GET', '/api/v1/zones'));
  const zones = listOf(data);
  const [editing, setEditing] = useState(null);

  const act = async (fn, ok) => { try { await fn(); toast(ok, 'success'); reload(); } catch (e) { toast(e.message, 'error'); } };
  const addDomain = async (z) => {
    const hostname = await prompt({ title: `Add domain to ${z.name}`, label: 'Hostname', placeholder: 'assets.example.com', confirmText: 'Add' });
    if (hostname) act(() => api(activeId, 'POST', `/api/v1/zones/${z.id}/domains`, { body: { hostname: hostname.trim() } }), 'Domain added. Verify it once DNS is set');
  };
  const removeDomain = async (d) => {
    if (await confirm({ title: `Remove ${d.hostname}?`, message: 'The domain will stop serving this zone.', danger: true, confirmText: 'Remove' }))
      act(() => api(activeId, 'DELETE', `/api/v1/domains/${d.id}`), 'Domain removed');
  };

  return (
    <div className="page">
      <PageHeader icon={Globe2} title="Zones & domains" subtitle="Delivery zones, custom hostnames, TLS and replication">
        <Button icon={RefreshCw} onClick={reload} />
      </PageHeader>
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !zones.length ? <Empty icon={Globe2} title="No zones">Zones group content under custom domains with their own caching rules.</Empty> : (
        <div className="zone-grid">
          {zones.map((z) => (
            <Card key={z.id} title={z.name} icon={Globe2} actions={<>
              <Badge tone={z.enabled ? 'green' : 'neutral'} dot>{z.enabled ? 'enabled' : 'disabled'}</Badge>
              <Button size="sm" variant="ghost" icon={Settings2} onClick={() => setEditing(z)} title="Zone settings" />
            </>}>
              <KV rows={[
                ['Root folder', <span className="mono">{z.root_folder?.path || '/'}</span>],
                ['Edge TTL', ttl(z.edge_ttl)], ['Browser TTL', ttl(z.browser_ttl)],
                ['Replication', z.replication_strategy],
                ['Zone ID', <span className="mono small selectable">{z.id}</span>],
              ]} />
              <div className="section-title row">Domains <div className="grow" /><Button size="sm" variant="ghost" icon={Plus} onClick={() => addDomain(z)}>Add</Button></div>
              {(z.domains || []).map((d) => (
                <div key={d.id} className="domain-row">
                  <div className="grow">
                    <div className="mono">{d.hostname} {d.primary && <Star size={12} className="text-amber" />}</div>
                    <div className="row gap">
                      <Badge tone={d.status === 'ACTIVE' ? 'green' : 'amber'} dot>{d.status?.toLowerCase()}</Badge>
                      <Badge tone={d.tls_status === 'active' ? 'green' : 'amber'}>TLS {d.tls_status}</Badge>
                      <Badge tone={d.health_status === 'healthy' ? 'green' : d.health_status ? 'red' : 'neutral'}>{d.health_status || 'unchecked'}</Badge>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" icon={ShieldCheck} title="Verify" onClick={() => act(() => api(activeId, 'POST', `/api/v1/domains/${d.id}/verify`), 'Verification requested')} />
                  <Button size="sm" variant="ghost" icon={Stethoscope} title="Health check" onClick={() => act(() => api(activeId, 'POST', `/api/v1/domains/${d.id}/check`), 'Health check run')} />
                  {!d.primary && <Button size="sm" variant="ghost" icon={Star} title="Make primary" onClick={() => act(() => api(activeId, 'PATCH', `/api/v1/domains/${d.id}`, { body: { primary: true } }), 'Primary domain set')} />}
                  <Button size="sm" variant="ghost-danger" icon={Trash2} title="Remove" onClick={() => removeDomain(d)} />
                </div>
              ))}
              {!z.domains?.length && <div className="muted small">No custom domains</div>}
              <div className="row gap" style={{ marginTop: 12 }}>
                <Button size="sm" icon={CopyIcon} onClick={() => act(() => api(activeId, 'POST', `/api/v1/zones/${z.id}/replicate`), 'Replication started')}>Replicate now</Button>
                <Button size="sm" icon={RefreshCw} onClick={() => act(() => api(activeId, 'POST', '/api/v1/cache/purge', { body: { type: 'zone', targets: [z.id] } }), 'Zone purge queued')}>Purge zone</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && <ZoneSettings zoneId={editing.id} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

function ZoneSettings({ zoneId, onClose, onSaved }) {
  const { activeId, toast } = useApp();
  const { data, loading, error } = useApi((pid) => api(pid, 'GET', `/api/v1/zones/${zoneId}`), [zoneId]);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const z = f || data;
  const set = (k) => (v) => setF({ ...(f || data), [k]: v?.target ? v.target.value : v });
  const save = async () => {
    setBusy(true);
    try {
      await api(activeId, 'PATCH', `/api/v1/zones/${zoneId}`, { body: {
        name: z.name, enabled: z.enabled, edge_ttl: Number(z.edge_ttl), browser_ttl: Number(z.browser_ttl), default_visibility: z.default_visibility || undefined,
        image_optimization: z.image_optimization, require_signed_transforms: z.require_signed_transforms, video_processing: z.video_processing,
        allow_empty_referrer: z.allow_empty_referrer, replication_strategy: z.replication_strategy,
        allowed_referrers: arr(z.allowed_referrers), allowed_countries: arr(z.allowed_countries), blocked_countries: arr(z.blocked_countries),
      } });
      toast('Zone saved', 'success'); onSaved();
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  return (
    <Modal title="Zone settings" subtitle={z?.name} icon={Settings2} onClose={onClose} width={640}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={Save} loading={busy} onClick={save} disabled={!f}>Save</Button></>}>
      {loading ? <Loading /> : error ? <ErrorState error={error} compact /> : z && (
        <div className="form-grid two">
          <Field label="Name"><input className="input" value={z.name || ''} onChange={set('name')} /></Field>
          <Field label="Default visibility"><Select value={z.default_visibility || ''} onChange={set('default_visibility')} options={[{ value: '', label: '—' }, ...VISIBILITIES.map((v) => ({ value: v, label: VIS_LABEL[v] }))]} /></Field>
          <Field label="Edge TTL (seconds)"><input className="input" type="number" value={z.edge_ttl ?? ''} onChange={set('edge_ttl')} /></Field>
          <Field label="Browser TTL (seconds)"><input className="input" type="number" value={z.browser_ttl ?? ''} onChange={set('browser_ttl')} /></Field>
          <Field label="Replication"><Select value={z.replication_strategy || 'PRIMARY_ONLY'} onChange={set('replication_strategy')} options={['PRIMARY_ONLY', 'MIRROR', 'NEAREST', 'FAILOVER']} /></Field>
          <Field label="Allowed referrers"><input className="input" value={join(z.allowed_referrers)} onChange={set('allowed_referrers')} placeholder="example.com, *.example.com" /></Field>
          <Field label="Allowed countries"><input className="input" value={join(z.allowed_countries)} onChange={set('allowed_countries')} placeholder="any" /></Field>
          <Field label="Blocked countries"><input className="input" value={join(z.blocked_countries)} onChange={set('blocked_countries')} placeholder="none" /></Field>
          <Field label="Enabled" row><Toggle checked={!!z.enabled} onChange={set('enabled')} /></Field>
          <Field label="Image optimisation" row><Toggle checked={!!z.image_optimization} onChange={set('image_optimization')} /></Field>
          <Field label="Require signed transforms" row><Toggle checked={!!z.require_signed_transforms} onChange={set('require_signed_transforms')} /></Field>
          <Field label="Video processing" row><Toggle checked={!!z.video_processing} onChange={set('video_processing')} /></Field>
          <Field label="Allow empty referrer" row><Toggle checked={!!z.allow_empty_referrer} onChange={set('allow_empty_referrer')} /></Field>
        </div>
      )}
    </Modal>
  );
}
const join = (v) => (Array.isArray(v) ? v.join(', ') : v || '');
const arr = (v) => (Array.isArray(v) ? v : String(v || '').split(',').map((s) => s.trim()).filter(Boolean));
function ttl(s) {
  if (s === null || s === undefined) return '—';
  if (s >= 86400 * 365) return `${Math.round(s / 86400 / 365)}y`;
  if (s >= 86400) return `${Math.round(s / 86400)}d`;
  if (s >= 3600) return `${Math.round(s / 3600)}h`;
  return `${s}s`;
}
