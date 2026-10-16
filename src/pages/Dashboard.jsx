import React, { useState } from 'react';
import { LayoutDashboard, HardDrive, Files as FilesIcon, Activity, Gauge, Upload, RefreshCw, FileText, Image as ImageIcon, Download, ShieldCheck } from 'lucide-react';
import { useApp, useApi } from '../lib/store.jsx';
import { api, bytes, num, pct, ago, listOf, fileKind, cdn } from '../lib/util.js';
import { PageHeader, Card, Stat, Segmented, Button, ErrorState, Loading, Badge, visTone } from '../components/ui.jsx';
import { AreaChart, BarList, Donut, Sparkline } from '../components/charts.jsx';
import FileIcon from '../components/FileIcon.jsx';

export default function Dashboard() {
  const { me, active, navigate, activeId, toast, filesVersion } = useApp();
  const [period, setPeriod] = useState('7d');
  const analytics = useApi((pid) => api(pid, 'GET', '/api/v1/analytics', { query: { period } }), [period]);
  const storage = useApi((pid) => api(pid, 'GET', '/api/v1/storage'));
  const bw = useApi((pid) => api(pid, 'GET', '/api/v1/analytics/bandwidth', { query: { period } }), [period]);
  const recent = useApi((pid) => api(pid, 'GET', '/api/v1/files', { query: { limit: 8, sort: 'created_at', order: 'desc' } }), [filesVersion]);

  const t = analytics.data?.totals || {};
  const series = analytics.data?.series || [];
  const st = storage.data || {};
  const used = st.used_bytes ?? st.used ?? st.total_size ?? st.total_bytes ?? st.storage_used;
  const available = st.available_bytes ?? st.available ?? st.capacity_bytes;
  const fileCount = st.file_count ?? st.files ?? st.total_files ?? recent.data?.pagination?.total;
  const typeDist = normaliseDist(st.type_distribution || st.types || st.by_type);
  const who = me?.user?.name || me?.api_key?.name || 'there';

  const reloadAll = () => { analytics.reload(); storage.reload(); bw.reload(); recent.reload(); };

  const pickUpload = async () => {
    const paths = await cdn.dialog.openFiles({ title: 'Upload files' });
    if (!paths.length) return;
    toast(`Uploading ${paths.length} item${paths.length > 1 ? 's' : ''}…`, 'info');
    cdn.transfers.uploadPaths({ profileId: activeId, paths, visibility: active?.defaultVisibility || undefined })
      .then((r) => { toast(`Uploaded ${r.ok}/${r.total}`, r.failed ? 'warn' : 'success'); recent.reload(); })
      .catch((e) => toast(e.message, 'error'));
  };

  return (
    <div className="page">
      <PageHeader icon={LayoutDashboard} title={`Hey ${who}`} subtitle={<>Here’s what’s happening on <b style={{ color: active?.color }}>{active?.name}</b></>}>
        <Segmented value={period} onChange={setPeriod} options={[{ value: '24h', label: '24h' }, { value: '7d', label: '7d' }, { value: '30d', label: '30d' }, { value: '90d', label: '90d' }]} />
        <Button icon={RefreshCw} onClick={reloadAll} title="Refresh" />
        <Button variant="primary" icon={Upload} onClick={pickUpload}>Upload</Button>
      </PageHeader>

      <div className="stats">
        <Stat icon={HardDrive} label="Storage used" value={bytes(used)} sub={available ? `${bytes(available)} available` : storage.error ? 'unavailable' : ' '} tone="accent" />
        <Stat icon={FilesIcon} label="Files" value={num(fileCount)} sub={st.average_size || st.avg_size ? `avg ${bytes(st.average_size || st.avg_size)}` : ' '} tone="cyan" />
        <Stat icon={Activity} label={`Requests · ${period}`} value={num(t.requests)} sub={t.errors !== undefined ? `${num(t.errors)} errors` : analytics.error ? 'needs analytics:read' : ' '} tone="green"
          spark={<Sparkline values={series.map((s) => s.requests || 0)} color="var(--green)" />} />
        <Stat icon={Download} label={`Bandwidth · ${period}`} value={bytes(t.bandwidth)} sub={bw.data ? `${bytes(bw.data.today)} today · ${bytes(bw.data.this_month)} this month` : ' '} tone="amber"
          spark={<Sparkline values={series.map((s) => s.bandwidth || 0)} color="var(--amber)" />} />
        <Stat icon={Gauge} label="Cache hit ratio" value={pct(t.cache_hit_ratio)} sub={t.avg_response_ms !== undefined ? `${t.avg_response_ms} ms avg · p95 ${t.p95_response_ms} ms` : ' '} tone="pink" />
      </div>

      <div className="grid-2-1">
        <Card title="Traffic" icon={Activity}>
          {analytics.loading ? <Loading /> : analytics.error ? <ErrorState error={analytics.error} onRetry={analytics.reload} compact /> : (
            <AreaChart data={series} height={260} series={[
              { key: 'requests', label: 'Requests', color: 'var(--accent)', format: num },
              { key: 'downloads', label: 'Downloads', color: '#22d3ee', format: num },
            ]} />
          )}
        </Card>
        <Card title="Storage by type" icon={HardDrive}>
          {storage.loading ? <Loading /> : storage.error ? <ErrorState error={storage.error} compact /> : typeDist.length ? (
            <Donut items={typeDist.slice(0, 6)} format={bytes} centerLabel="stored" />
          ) : <div className="chart-empty small">No type breakdown reported</div>}
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Recent uploads" icon={Upload} actions={<Button size="sm" variant="ghost" onClick={() => navigate('files')}>Open files</Button>} pad={false}>
          {recent.loading ? <Loading /> : recent.error ? <div className="card-body"><ErrorState error={recent.error} compact /></div> : (
            <div className="mini-list">
              {listOf(recent.data).map((f) => (
                <button key={f.id} className="mini-row" onClick={() => navigate('files', { folderId: f.folder_id || null, selectId: f.id })}>
                  <FileIcon file={f} size={34} thumb />
                  <div className="grow ellipsis"><div className="ellipsis">{f.name}</div><small className="muted">{f.folder_path || '/'} · {bytes(f.size)}</small></div>
                  <Badge tone={visTone(f.visibility)}>{f.visibility?.toLowerCase().replace(/_/g, ' ')}</Badge>
                  <small className="muted nowrap">{ago(f.created_at)}</small>
                </button>
              ))}
              {!listOf(recent.data).length && <div className="chart-empty small">No files yet</div>}
            </div>
          )}
        </Card>
        <Card title="Top files" icon={FileText}>
          {analytics.data ? (
            <BarList format={num} items={(analytics.data.breakdowns?.top_files || []).slice(0, 8).map((f) => ({ label: f.name || f.file_name || f.id, value: f.requests ?? f.count ?? f.downloads ?? 0 }))} empty="No file traffic in this period" />
          ) : analytics.error ? <ErrorState error={analytics.error} compact /> : <Loading />}
        </Card>
      </div>

      {(st.largest_files || st.largest)?.length > 0 && (
        <Card title="Largest files" icon={ImageIcon}>
          <BarList format={bytes} color="var(--amber)" items={(st.largest_files || st.largest).slice(0, 8).map((f) => ({ label: f.name || f.id, value: f.size }))} />
        </Card>
      )}

      {me && (
        <Card title="This connection" icon={ShieldCheck}>
          <div className="scope-list">
            <Badge tone="neutral">{me.type}</Badge>
            {me.api_key?.prefix && <Badge tone="neutral">{me.api_key.prefix}…</Badge>}
            {(me.scopes || []).map((s) => <Badge key={s} tone="accent">{s}</Badge>)}
          </div>
        </Card>
      )}
    </div>
  );
}

function normaliseDist(d) {
  if (!d) return [];
  if (Array.isArray(d)) return d.map((x) => ({ label: x.type || x.label || x.mime || x.name || 'other', value: x.bytes ?? x.size ?? x.total_size ?? x.count ?? 0 })).sort((a, b) => b.value - a.value);
  return Object.entries(d).map(([k, v]) => ({ label: k, value: typeof v === 'object' ? (v.bytes ?? v.size ?? v.count ?? 0) : v })).sort((a, b) => b.value - a.value);
}
