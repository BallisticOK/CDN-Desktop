import React, { useEffect, useMemo, useState } from 'react';
import { TerminalSquare, Search, Send, RefreshCw, Copy, ChevronRight, Lock, Clock } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { cdn, classNames } from '../lib/util.js';
import { PageHeader, Button, Loading, ErrorState, Badge, Field } from '../components/ui.jsx';
import CodeView from '../components/CodeView.jsx';

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

export default function Console() {
  const { activeId, active, copy } = useApp();
  const [spec, setSpec] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [history, setHistory] = useState([]);

  const load = async (force) => {
    setError(null);
    try { setSpec(await cdn.openapi(activeId, force)); } catch (e) { setError(e); }
  };
  useEffect(() => { load(false); }, [activeId]); // eslint-disable-line

  const ops = useMemo(() => {
    if (!spec) return [];
    const out = [];
    for (const [path, item] of Object.entries(spec.paths || {})) for (const m of METHODS) if (item[m]) {
      const op = item[m];
      out.push({ path, method: m, op, tag: op.tags?.[0] || 'Other', id: `${m} ${path}`, params: [...(item.parameters || []), ...(op.parameters || [])].map((p) => deref(spec, p)) });
    }
    return out;
  }, [spec]);
  const filtered = ops.filter((o) => !q || `${o.method} ${o.path} ${o.op.summary || ''} ${o.tag}`.toLowerCase().includes(q.toLowerCase()));
  const groups = useMemo(() => {
    const g = new Map();
    for (const o of filtered) { if (!g.has(o.tag)) g.set(o.tag, []); g.get(o.tag).push(o); }
    return [...g.entries()];
  }, [filtered]);

  return (
    <div className="page console-page">
      <PageHeader icon={TerminalSquare} title="API console" subtitle={spec ? `${spec.info?.title} v${spec.info?.version} · ${ops.length} endpoints · authenticated as ${active?.name}` : 'Call any endpoint on your server'}>
        <Button icon={RefreshCw} onClick={() => load(true)}>Reload spec</Button>
      </PageHeader>
      {error ? <ErrorState error={error} onRetry={() => load(true)} /> : !spec ? <Loading label="Loading openapi.json…" /> : (
        <div className="console">
          <div className="console-nav">
            <div className="search full"><Search size={15} /><input placeholder="Filter endpoints…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="console-ops">
              {groups.map(([tag, list]) => (
                <div key={tag}>
                  <div className="console-tag">{tag}</div>
                  {list.map((o) => (
                    <button key={o.id} className={classNames('console-op', sel?.id === o.id && 'active')} onClick={() => setSel(o)}>
                      <span className={`method m-${o.method}`}>{o.method.toUpperCase()}</span>
                      <span className="ellipsis grow">{o.op.summary || o.path}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="console-main">
            {sel ? <OperationForm key={sel.id} spec={spec} op={sel} onSent={(h) => setHistory((x) => [h, ...x].slice(0, 30))} copy={copy} baseUrl={active?.baseUrl} /> : (
              <div className="console-intro">
                <TerminalSquare size={36} />
                <h3>Pick an endpoint</h3>
                <p className="muted">Every endpoint your server exposes is listed from its live OpenAPI spec. Requests are sent with this server’s API key.</p>
                {history.length > 0 && <>
                  <div className="section-title">Recent requests</div>
                  {history.map((h, i) => (
                    <div key={i} className="history-row"><span className={`method m-${h.method}`}>{h.method.toUpperCase()}</span><span className="mono small grow ellipsis">{h.path}</span><Badge tone={h.status < 300 ? 'green' : h.status < 500 ? 'amber' : 'red'}>{h.status}</Badge><span className="muted small">{h.ms} ms</span></div>
                  ))}
                </>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OperationForm({ spec, op, onSent, copy, baseUrl }) {
  const { activeId } = useApp();
  const pathParams = op.params.filter((p) => p.in === 'path');
  const queryParams = op.params.filter((p) => p.in === 'query');
  const rb = op.op.requestBody ? deref(spec, op.op.requestBody) : null;
  const jsonBody = rb?.content?.['application/json'];
  const otherBody = rb && !jsonBody ? Object.keys(rb.content || {})[0] : null;
  const [values, setValues] = useState({});
  const [body, setBody] = useState(() => jsonBody ? JSON.stringify(jsonBody.example ?? sample(spec, jsonBody.schema), null, 2) : '');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const scopes = [].concat(op.op['x-required-scopes'] || op.op['x-scopes'] || []);

  const resolvedPath = op.path.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(values[k] || `{${k}}`));
  const query = Object.fromEntries(queryParams.map((p) => [p.name, values[p.name]]).filter(([, v]) => v !== undefined && v !== ''));
  const qs = new URLSearchParams(query).toString();

  const send = async () => {
    setBusy(true);
    let parsed;
    if (jsonBody && body.trim()) { try { parsed = JSON.parse(body); } catch (e) { setRes({ ok: false, status: 0, data: { error: { message: `Body is not valid JSON: ${e.message}` } } }); setBusy(false); return; } }
    const r = await cdn.request({ profileId: activeId, method: op.method.toUpperCase(), path: resolvedPath, query, body: parsed });
    setRes(r); setBusy(false);
    onSent({ method: op.method, path: resolvedPath + (qs ? `?${qs}` : ''), status: r.status, ms: r.ms });
  };
  const curl = () => {
    let c = `curl -X ${op.method.toUpperCase()} "${baseUrl}${resolvedPath}${qs ? `?${qs}` : ''}" \\\n  -H "Authorization: Bearer $CDN_API_KEY"`;
    if (jsonBody && body.trim()) c += ` \\\n  -H "Content-Type: application/json" \\\n  -d '${body.replace(/\s*\n\s*/g, ' ')}'`;
    copy(c, 'cURL copied (key replaced with $CDN_API_KEY)');
  };

  return (
    <div className="op">
      <div className="op-head">
        <span className={`method big m-${op.method}`}>{op.method.toUpperCase()}</span>
        <span className="mono op-path">{op.path}</span>
      </div>
      <h2 className="op-title">{op.op.summary}</h2>
      {op.op.description && <p className="muted op-desc">{op.op.description}</p>}
      {scopes.length > 0 && <div className="scope-list"><Lock size={13} className="muted" />{scopes.map((s) => <Badge key={s} tone="accent">{s}</Badge>)}</div>}

      {(pathParams.length > 0 || queryParams.length > 0) && <div className="section-title">Parameters</div>}
      <div className="form-grid two">
        {[...pathParams, ...queryParams].map((p) => {
          const sch = deref(spec, p.schema || {});
          const en = sch.enum || sch.anyOf?.find((x) => x.enum)?.enum;
          return (
            <Field key={p.in + p.name} label={<>{p.name}{p.required && <span className="text-red"> *</span>} <span className="muted small">{p.in}</span></>} hint={p.description}>
              {en ? (
                <select className="input" value={values[p.name] || ''} onChange={(e) => setValues({ ...values, [p.name]: e.target.value })}>
                  <option value="">—</option>{en.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              ) : <input className="input mono" placeholder={sch.default !== undefined ? String(sch.default) : sch.type || ''} value={values[p.name] || ''} onChange={(e) => setValues({ ...values, [p.name]: e.target.value })} />}
            </Field>
          );
        })}
      </div>

      {jsonBody && <>
        <div className="section-title">JSON body</div>
        <div className="code-box"><CodeView value={body} onChange={setBody} filename="body.json" height="220px" /></div>
      </>}
      {otherBody && <div className="banner banner-info">This endpoint takes <span className="mono">{otherBody}</span>. Use the Files page for uploads.</div>}

      <div className="row gap" style={{ marginTop: 14 }}>
        <Button variant="primary" icon={Send} onClick={send} loading={busy}>Send request</Button>
        <Button icon={Copy} onClick={curl}>Copy as cURL</Button>
        <span className="mono small muted ellipsis">{resolvedPath}{qs ? `?${qs}` : ''}</span>
      </div>

      {res && (
        <div className="response">
          <div className="row gap response-head">
            <Badge tone={res.status >= 200 && res.status < 300 ? 'green' : res.status >= 500 || res.status === 0 ? 'red' : 'amber'}>{res.status || 'ERR'}</Badge>
            <span className="muted small"><Clock size={12} /> {res.ms} ms</span>
            {res.headers?.['x-ratelimit-remaining'] && <span className="muted small">rate limit {res.headers['x-ratelimit-remaining']}/{res.headers['x-ratelimit-limit']}</span>}
            {res.headers?.['x-request-id'] && <span className="mono small muted">{res.headers['x-request-id']}</span>}
            <div className="grow" />
            <Button size="sm" variant="ghost" icon={Copy} onClick={() => copy(typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2), 'Response copied')} />
          </div>
          <div className="code-box"><CodeView value={typeof res.data === 'string' ? res.data.slice(0, 200000) : JSON.stringify(res.data ?? res.error, null, 2)} filename="response.json" readOnly height="380px" /></div>
        </div>
      )}
    </div>
  );
}

function deref(spec, o, depth = 0) {
  if (!o || typeof o !== 'object' || !o.$ref || depth > 8) return o;
  const parts = o.$ref.replace(/^#\//, '').split('/');
  let cur = spec; for (const p of parts) cur = cur?.[p];
  return deref(spec, cur, depth + 1) || {};
}
function sample(spec, schema, depth = 0) {
  schema = deref(spec, schema);
  if (!schema || depth > 5) return null;
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum) return schema.enum[0];
  if (schema.allOf) return Object.assign({}, ...schema.allOf.map((s) => sample(spec, s, depth + 1)));
  if (schema.anyOf || schema.oneOf) return sample(spec, (schema.anyOf || schema.oneOf).find((s) => !s.not) || {}, depth + 1);
  if (schema.type === 'object' || schema.properties) {
    const o = {};
    const req = new Set(schema.required || []);
    for (const [k, v] of Object.entries(schema.properties || {})) if (req.size === 0 || req.has(k)) o[k] = sample(spec, v, depth + 1);
    return o;
  }
  if (schema.type === 'array') return [sample(spec, schema.items, depth + 1)].filter((x) => x !== null);
  if (schema.type === 'integer' || schema.type === 'number') return 0;
  if (schema.type === 'boolean') return false;
  if (schema.type === 'string') return schema.format === 'date-time' ? new Date().toISOString() : '';
  return null;
}
