import React, { useState } from 'react';
import { BarChart3, RefreshCw, Activity, Download, Gauge, AlertTriangle, Globe2, FileText, KeyRound, Timer, HardDrive } from 'lucide-react';
import { useApi } from '../lib/store.jsx';
import { api, num, bytes, pct, ago, listOf } from '../lib/util.js';
import { PageHeader, Segmented, Button, Card, Stat, Loading, ErrorState, Badge } from '../components/ui.jsx';
import { AreaChart, BarList, Donut } from '../components/charts.jsx';

const METRICS = {
  requests: { label: 'Requests', color: 'var(--accent)', format: num },
  bandwidth: { label: 'Bandwidth', color: '#fbbf24', format: (v) => bytes(v, 0) },
  downloads: { label: 'Downloads', color: '#22d3ee', format: num },
  errors: { label: 'Errors', color: '#f87171', format: num },
  uploads: { label: 'Uploads', color: '#34d399', format: num },
  avg_ms: { label: 'Avg latency', color: '#f472b6', format: (v) => `${Math.round(v)}ms` },
};

export default function Analytics() {
  const [period, setPeriod] = useState('7d');
  const [metric, setMetric] = useState('requests');
  const { data, error, loading, reload } = useApi((pid) => api(pid, 'GET', '/api/v1/analytics', { query: { period } }), [period]);
  const usage = useApi((pid) => api(pid, 'GET', '/api/v1/usage', { query: { scope_type: 'global' } }));
  const t = data?.totals || {};
  const b = data?.breakdowns || {};
  const m = METRICS[metric];

  return (
    <div className="page">
      <PageHeader icon={BarChart3} title="Analytics" subtitle={data?.range ? `${new Date(data.range.from).toLocaleDateString()} → ${new Date(data.range.to).toLocaleDateString()} · per ${data.range.unit}` : 'Delivery performance and traffic'}>
        <Segmented value={period} onChange={setPeriod} options={['24h', '7d', '30d', '90d'].map((v) => ({ value: v, label: v }))} />
        <Button icon={RefreshCw} onClick={() => { reload(); usage.reload(); }} />
      </PageHeader>
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : <>
        <div className="stats">
          <Stat icon={Activity} label="Requests" value={num(t.requests)} sub={`${num(t.views)} views · ${num(t.clicks)} clicks`} />
          <Stat icon={Download} label="Bandwidth" value={bytes(t.bandwidth)} sub={`${num(t.downloads)} downloads`} tone="amber" />
          <Stat icon={Gauge} label="Cache hit ratio" value={pct(t.cache_hit_ratio)} sub={`${num(t.cache_hits)} hits`} tone="green" />
          <Stat icon={Timer} label="Response time" value={t.avg_response_ms !== undefined ? `${t.avg_response_ms} ms` : '—'} sub={`p95 ${t.p95_response_ms ?? '—'} ms`} tone="pink" />
          <Stat icon={AlertTriangle} label="Errors" value={num(t.errors)} sub={`${num(t.api_errors)} API errors`} tone="red" />
        </div>

        <Card title="Over time" icon={Activity} actions={<Segmented value={metric} onChange={setMetric} options={Object.entries(METRICS).map(([k, v]) => ({ value: k, label: v.label }))} />}>
          <AreaChart data={data.series || []} height={300} series={[{ key: metric, ...m }]} />
        </Card>

        <div className="grid-3">
          <Card title="Status codes" icon={BarChart3}>
            <Donut items={(b.status_codes || []).map((s) => ({ label: String(s.code), value: s.count, color: s.code < 300 ? '#34d399' : s.code < 400 ? '#60a5fa' : s.code < 500 ? '#fbbf24' : '#f87171' }))} format={num} centerLabel="responses" />
          </Card>
          <Card title="Countries" icon={Globe2}>
            <BarList items={(b.countries || []).slice(0, 10).map((c) => ({ label: c.country_name || c.country || c.code || c.label, value: c.count ?? c.requests }))} format={num} empty="No geo data" />
          </Card>
          <Card title="Content types" icon={FileText}>
            <BarList items={(b.mime_types || []).slice(0, 10).map((c) => ({ label: c.mime_type || c.mime || c.label, value: c.count ?? c.requests ?? c.bandwidth }))} format={num} color="#22d3ee" empty="No data" />
          </Card>
        </div>

        <div className="grid-2">
          <Card title="Top files" icon={FileText}>
            <BarList items={(b.top_files || []).slice(0, 10).map((f) => ({ label: f.name || f.file_name || f.id, value: f.requests ?? f.count ?? f.downloads ?? 0 }))} format={num} empty="No traffic" />
          </Card>
          <Card title="Top folders" icon={HardDrive}>
            <BarList items={(b.top_folders || []).slice(0, 10).map((f) => ({ label: f.path || f.name || f.id, value: f.requests ?? f.count ?? 0 }))} format={num} color="#a78bfa" empty="No traffic" />
          </Card>
          <Card title="Top API keys" icon={KeyRound}>
            <BarList items={(b.top_api_keys || []).slice(0, 10).map((k) => ({ label: k.name || k.prefix || k.id, value: k.requests ?? k.count ?? 0 }))} format={num} color="#34d399" empty="No API usage" />
          </Card>
          <Card title="Month-to-date usage" icon={Gauge}>
            {usage.loading ? <Loading /> : usage.error ? <ErrorState error={usage.error} compact /> : <UsageView u={usage.data} />}
          </Card>
        </div>

        {(data.recent_errors || []).length > 0 && (
          <Card title="Recent errors" icon={AlertTriangle} pad={false}>
            <table className="table compact">
              <thead><tr><th>When</th><th>Status</th><th>Path</th><th>Code</th><th>IP</th></tr></thead>
              <tbody>{data.recent_errors.slice(0, 25).map((e, i) => (
                <tr key={i}><td className="nowrap muted">{ago(e.created_at || e.t || e.at)}</td><td><Badge tone={e.status >= 500 ? 'red' : 'amber'}>{e.status}</Badge></td><td className="mono small ellipsis" style={{ maxWidth: 420 }}>{e.path || e.url}</td><td className="mono small">{e.code || e.error_code || ''}</td><td className="mono small muted">{e.ip}</td></tr>
              ))}</tbody>
            </table>
          </Card>
        )}
      </>}
    </div>
  );
}

function UsageView({ u }) {
  if (!u) return null;
  const rows = Object.entries(u.usage || u.metrics || u).filter(([, v]) => typeof v === 'number' || (v && typeof v === 'object' && ('used' in v || 'value' in v)));
  if (!rows.length) return <pre className="json-view small">{JSON.stringify(u, null, 2)}</pre>;
  return (
    <div className="usage-list">
      {rows.map(([k, v]) => {
        const used = typeof v === 'number' ? v : v.used ?? v.value;
        const limit = typeof v === 'object' ? v.limit ?? v.quota : null;
        const isBytes = /byte|storage|egress|bandwidth/i.test(k);
        return (
          <div key={k} className="usage-row">
            <span className="grow">{k.replace(/_/g, ' ')}</span>
            <b>{isBytes ? bytes(used) : num(used)}</b>
            {limit ? <span className="muted small"> / {isBytes ? bytes(limit) : num(limit)}</span> : null}
          </div>
        );
      })}
      {u.cost_estimate !== undefined && <div className="usage-row"><span className="grow">estimated cost</span><b>{typeof u.cost_estimate === 'object' ? JSON.stringify(u.cost_estimate) : u.cost_estimate}</b></div>}
    </div>
  );
}
