import React, { useState } from 'react';
import { Zap, Flame, RefreshCw, Thermometer, History, Gauge } from 'lucide-react';
import { useApp, useApi } from '../lib/store.jsx';
import { api, listOf, ago, date, num, pct, bytes } from '../lib/util.js';
import { PageHeader, Button, Card, Field, Select, Loading, ErrorState, Badge, Segmented, Stat } from '../components/ui.jsx';

const TYPES = [
  { value: 'url', label: 'URLs', hint: 'One full URL per line' },
  { value: 'file', label: 'File IDs', hint: 'All URLs, signed URLs and image variants of each file' },
  { value: 'folder', label: 'Folder IDs', hint: 'Everything beneath each folder' },
  { value: 'tag', label: 'Cache tags', hint: 'Every file carrying the tag' },
  { value: 'zone', label: 'Zone IDs', hint: 'All content in each zone' },
  { value: 'everything', label: 'Everything', hint: 'Purges the entire CDN cache' },
];

export default function Cache() {
  const { activeId, toast, confirm } = useApp();
  const [type, setType] = useState('url');
  const [targets, setTargets] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState('7d');
  const [warm, setWarm] = useState({ urls: '', top: '50' });
  const zones = useApi((pid) => api(pid, 'GET', '/api/v1/zones'));
  const purges = useApi((pid) => api(pid, 'GET', '/api/v1/cache/purges', { query: { limit: 30 } }));
  const stats = useApi((pid) => api(pid, 'GET', '/api/v1/cache/stats', { query: { period, zone_id: zoneId || undefined } }), [period, zoneId]);
  const t = TYPES.find((x) => x.value === type);
  const zoneOpts = [{ value: '', label: 'All zones' }, ...listOf(zones.data).map((z) => ({ value: z.id, label: z.name }))];

  const purge = async () => {
    const list = targets.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    if (type !== 'everything' && !list.length) { toast('Add at least one target', 'warn'); return; }
    if (type === 'everything' && !(await confirm({ title: 'Purge the entire cache?', message: 'All edge caches will be cleared. Origin load will spike while caches refill.', danger: true, confirmText: 'Purge everything' }))) return;
    setBusy(true);
    try {
      const r = await api(activeId, 'POST', '/api/v1/cache/purge', { body: { type, targets: type === 'everything' ? undefined : list, zone_id: zoneId || undefined } });
      toast(`Purge ${r?.status || 'queued'}${r?.mode === 'origin_only' ? ' (origin only: Cloudflare not configured)' : ''}`, 'success');
      setTargets(''); purges.reload();
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  const prewarm = async () => {
    try {
      const urls = warm.urls.split(/\n+/).map((s) => s.trim()).filter(Boolean);
      await api(activeId, 'POST', '/api/v1/cache/prewarm', { body: { urls: urls.length ? urls : undefined, top: !urls.length && warm.top ? Number(warm.top) : undefined, zone_id: zoneId || undefined } });
      toast('Pre-warm started', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };
  const s = stats.data || {};
  return (
    <div className="page">
      <PageHeader icon={Zap} title="Cache" subtitle="Purge, pre-warm and inspect edge caching">
        <Select value={zoneId} onChange={setZoneId} options={zoneOpts} />
        <Segmented value={period} onChange={setPeriod} options={['24h', '7d', '30d'].map((v) => ({ value: v, label: v }))} />
      </PageHeader>
      {stats.data && (
        <div className="stats">
          <Stat icon={Gauge} label="Hit ratio" value={pct(s.hit_ratio ?? s.cache_hit_ratio)} tone="green" />
          <Stat icon={Zap} label="Hits" value={num(s.hits ?? s.cache_hits)} />
          <Stat icon={RefreshCw} label="Misses" value={num(s.misses ?? s.cache_misses)} tone="amber" />
          <Stat icon={Thermometer} label="Bandwidth saved" value={bytes(s.bandwidth_saved ?? s.saved_bytes)} tone="cyan" />
        </div>
      )}
      {stats.error && <ErrorState error={stats.error} compact />}
      <div className="grid-2">
        <Card title="Purge cache" icon={Flame}>
          <div className="stack">
            <div className="chips">{TYPES.map((x) => <button key={x.value} className={`chip ${type === x.value ? 'on' : ''}`} onClick={() => setType(x.value)}>{x.label}</button>)}</div>
            <div className="muted small">{t.hint}</div>
            {type !== 'everything' && <textarea className="input mono code-area" rows={7} placeholder={type === 'url' ? 'https://cdn.example.com/files/…' : type === 'tag' ? 'avatars' : 'file_…'} value={targets} onChange={(e) => setTargets(e.target.value)} />}
            <Button variant={type === 'everything' ? 'danger' : 'primary'} icon={Flame} onClick={purge} loading={busy}>{type === 'everything' ? 'Purge everything' : 'Purge'}</Button>
          </div>
        </Card>
        <Card title="Pre-warm edge" icon={Thermometer}>
          <div className="stack">
            <div className="muted small">Fetch URLs through the edge so the first real visitor gets a cache hit. Leave URLs empty to warm the most-requested files.</div>
            <textarea className="input mono code-area" rows={5} placeholder="One URL per line (optional)" value={warm.urls} onChange={(e) => setWarm({ ...warm, urls: e.target.value })} />
            <Field label="Or warm top N files" row><input className="input" type="number" style={{ width: 100 }} value={warm.top} onChange={(e) => setWarm({ ...warm, top: e.target.value })} /></Field>
            <Button icon={Thermometer} onClick={prewarm}>Start pre-warm</Button>
          </div>
        </Card>
      </div>
      <Card title="Purge history" icon={History} pad={false} actions={<Button size="sm" variant="ghost" icon={RefreshCw} onClick={purges.reload} />}>
        {purges.loading ? <Loading /> : purges.error ? <div className="card-body"><ErrorState error={purges.error} compact /></div> : (
          <table className="table compact">
            <thead><tr><th>When</th><th>Type</th><th>Targets</th><th>Status</th><th>By</th></tr></thead>
            <tbody>
              {listOf(purges.data, 'purges').map((p) => (
                <tr key={p.id}>
                  <td className="muted nowrap" title={date(p.created_at)}>{ago(p.created_at)}</td>
                  <td><Badge tone="accent">{p.type}</Badge></td>
                  <td className="mono small ellipsis" style={{ maxWidth: 420 }}>{(p.targets || []).join(', ') || '—'}</td>
                  <td><Badge tone={p.status === 'completed' || p.status === 'done' ? 'green' : p.status === 'failed' ? 'red' : 'amber'}>{p.status}</Badge></td>
                  <td className="muted small">{p.created_by?.name || p.api_key?.name || p.actor || '—'}</td>
                </tr>
              ))}
              {!listOf(purges.data, 'purges').length && <tr><td colSpan={5}><div className="chart-empty small">No purges yet</div></td></tr>}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
