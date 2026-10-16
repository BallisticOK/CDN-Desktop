import React, { useEffect, useMemo, useState } from 'react';
import {
  X, Download, Share2, Pencil, Trash2, FolderInput, Eye, FileEdit, History, RotateCcw, Upload, Link2, BarChart3, Info, Wand2,
  Braces, Save, ExternalLink, Zap, Film,
} from 'lucide-react';
import { useApp, useApi } from '../lib/store.jsx';
import { api, cdn, bytes, date, ago, num, fileKind, isEditable, VISIBILITIES, VIS_LABEL, listOf, fileInlineUrl, duration } from '../lib/util.js';
import { openInBrowser, purgeFiles, copyLinks } from '../lib/actions.js';
import { Button, Tabs, CopyField, KV, Select, Badge, visTone, Toggle, Loading, ErrorState, Field } from './ui.jsx';
import { AreaChart } from './charts.jsx';
import FileIcon from './FileIcon.jsx';

export default function FileDetails({ file, onClose, onChanged, onAction }) {
  const [tab, setTab] = useState('overview');
  const kind = fileKind(file);
  const tabs = [
    { value: 'overview', label: 'Overview', icon: Info },
    { value: 'versions', label: 'Versions', icon: History },
    { value: 'shares', label: 'Shares', icon: Share2 },
    kind === 'image' && { value: 'image', label: 'Transform', icon: Wand2 },
    (kind === 'video' || kind === 'audio') && { value: 'media', label: 'Media', icon: Film },
    { value: 'stats', label: 'Stats', icon: BarChart3 },
    { value: 'meta', label: 'Metadata', icon: Braces },
  ].filter(Boolean);
  return (
    <aside className="drawer">
      <div className="drawer-head">
        <FileIcon file={file} size={36} thumb />
        <div className="grow ellipsis">
          <div className="drawer-title ellipsis" title={file.name}>{file.name}</div>
          <small className="muted">{file.folder_path || '/'} · {bytes(file.size)}</small>
        </div>
        <button className="icon-btn" onClick={onClose}><X size={18} /></button>
      </div>
      <div className="drawer-actions">
        <Button size="sm" icon={Eye} onClick={() => onAction('preview')} title="Preview" />
        <Button size="sm" icon={Download} onClick={() => onAction('download')} title="Download" />
        <Button size="sm" icon={Link2} onClick={() => onAction('copy')} title="Copy link" />
        {isEditable(file) && <Button size="sm" icon={FileEdit} onClick={() => onAction('edit')} title="Edit text" />}
        <Button size="sm" icon={Share2} onClick={() => onAction('share')} title="Share" />
        <Button size="sm" icon={Pencil} onClick={() => onAction('rename')} title="Rename" />
        <Button size="sm" icon={FolderInput} onClick={() => onAction('move')} title="Move" />
        <Button size="sm" variant="ghost-danger" icon={Trash2} onClick={() => onAction('delete')} title="Delete" />
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="drawer-body">
        {tab === 'overview' && <Overview file={file} onChanged={onChanged} />}
        {tab === 'versions' && <Versions file={file} onChanged={onChanged} reload={() => onAction('reload')} />}
        {tab === 'shares' && <Shares file={file} />}
        {tab === 'image' && <ImageStudio file={file} />}
        {tab === 'media' && <Media file={file} />}
        {tab === 'stats' && <Stats file={file} />}
        {tab === 'meta' && <Metadata file={file} onChanged={onChanged} />}
      </div>
    </aside>
  );
}

function Overview({ file, onChanged }) {
  const app = useApp();
  const { activeId, toast } = app;
  const kind = fileKind(file);
  const [saving, setSaving] = useState(false);
  const [cacheControl, setCacheControl] = useState(file.cache_control || '');
  const [tags, setTags] = useState((file.cache_tags || []).join(', '));
  const patch = async (body) => {
    setSaving(true);
    try { onChanged(await api(activeId, 'PATCH', `/api/v1/files/${file.id}`, { body })); toast('Saved', 'success'); }
    catch (e) { toast(e.message, 'error'); }
    setSaving(false);
  };
  return (
    <div className="stack">
      <div className="drawer-preview">
        {kind === 'image' ? <img src={fileInlineUrl(activeId, file)} alt="" />
          : kind === 'video' ? <video src={fileInlineUrl(activeId, file)} controls preload="metadata" />
            : kind === 'audio' ? <audio src={fileInlineUrl(activeId, file)} controls preload="metadata" />
              : <FileIcon file={file} cover />}
      </div>

      <div className="section-title">Links</div>
      <CopyField label="CDN" value={file.url} />
      {file.path_url && <CopyField label="Path" value={file.path_url} />}
      <CopyField label="API" value={file.download_url} />
      <div className="row gap wrap">
        <Button size="sm" icon={Link2} onClick={() => copyLinks(app, [file], 'signed')}>Copy signed URL</Button>
        <Button size="sm" icon={ExternalLink} onClick={() => openInBrowser(app, file)}>Open in browser</Button>
        <Button size="sm" icon={Zap} onClick={() => purgeFiles(app, [file])}>Purge cache</Button>
      </div>

      <div className="section-title">Delivery</div>
      <Field label="Visibility" row>
        <Select value={file.visibility} onChange={(v) => patch({ visibility: v })} options={VISIBILITIES.map((v) => ({ value: v, label: VIS_LABEL[v] }))} />
      </Field>
      <Field label="Force download" row><Toggle checked={!!file.force_download} onChange={(v) => patch({ force_download: v })} /></Field>
      <Field label="Cache-Control" hint="Blank uses the zone default, e.g. public, max-age=31536000, immutable">
        <div className="row gap">
          <input className="input mono" value={cacheControl} placeholder="zone default" onChange={(e) => setCacheControl(e.target.value)} />
          <Button size="sm" icon={Save} loading={saving} disabled={cacheControl === (file.cache_control || '')} onClick={() => patch({ cache_control: cacheControl || null })} />
        </div>
      </Field>
      <Field label="Cache tags" hint="Comma-separated; purge by tag from the Cache page">
        <div className="row gap">
          <input className="input" value={tags} placeholder="e.g. avatars, v2" onChange={(e) => setTags(e.target.value)} />
          <Button size="sm" icon={Save} loading={saving} onClick={() => patch({ cache_tags: tags.split(',').map((s) => s.trim()).filter(Boolean) })} />
        </div>
      </Field>

      <div className="section-title">Details</div>
      <KV rows={[
        ['Status', <Badge tone={file.status === 'READY' ? 'green' : 'amber'}>{file.status}</Badge>],
        file.status_reason && ['Reason', file.status_reason],
        ['Type', <span className="mono">{file.mime_type}</span>],
        ['Size', `${bytes(file.size)} (${num(file.size)} bytes)`],
        file.width && ['Dimensions', `${file.width} × ${file.height}`],
        file.duration_seconds && ['Duration', duration(file.duration_seconds)],
        ['Downloads', num(file.download_count)],
        ['Bandwidth', bytes(file.bandwidth_bytes)],
        ['Last accessed', file.last_accessed_at ? `${ago(file.last_accessed_at)}` : 'never'],
        ['Uploaded', date(file.created_at)],
        ['Updated', date(file.updated_at)],
        ['Uploaded by', file.uploaded_by?.name || file.uploaded_by?.email || (file.uploaded_by_api_key ? `🔑 ${file.uploaded_by_api_key.name}` : '—')],
        file.storage_provider && ['Storage', `${file.storage_provider.name} (${file.storage_provider.kind})`],
        file.expires_at && ['Expires', date(file.expires_at)],
        file.version && ['Revision', `v${file.version}`],
        ['ID', <span className="mono small selectable">{file.id}</span>],
        file.sha256 && ['SHA-256', <span className="mono small selectable break">{file.sha256}</span>],
      ]} />
    </div>
  );
}

function Versions({ file, onChanged, reload }) {
  const { activeId, toast, confirm } = useApp();
  const { data, error, loading, reload: refresh } = useApi((pid) => api(pid, 'GET', `/api/v1/files/${file.id}/versions`), [file.id, file.updated_at]);
  const versions = listOf(data, 'versions', 'revisions');
  const [busy, setBusy] = useState(false);
  const uploadRevision = async () => {
    const [p] = await cdn.dialog.openFiles({ title: 'Choose the new revision' });
    if (!p) return;
    setBusy(true);
    try { const r = await cdn.transfers.newVersion({ profileId: activeId, fileId: file.id, filePath: p, keepName: true }); if (r?.id) onChanged(r.file || r); toast('New revision uploaded', 'success'); refresh(); reload(); }
    catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  const restore = async (v) => {
    if (!(await confirm({ title: `Roll back to v${v.version}?`, message: 'The current content becomes a revision, so you can always switch back.', confirmText: 'Roll back' }))) return;
    try { const r = await api(activeId, 'POST', `/api/v1/files/${file.id}/versions/${v.version}/restore`); if (r?.id) onChanged(r.file || r); toast(`Restored v${v.version}`, 'success'); refresh(); reload(); }
    catch (e) { toast(e.message, 'error'); }
  };
  const remove = async (v) => {
    if (!(await confirm({ title: `Delete revision v${v.version}?`, message: 'This revision is removed permanently.', danger: true, confirmText: 'Delete' }))) return;
    try { await api(activeId, 'DELETE', `/api/v1/files/${file.id}/versions/${v.version}`); toast('Revision deleted', 'success'); refresh(); }
    catch (e) { toast(e.message, 'error'); }
  };
  return (
    <div className="stack">
      <div className="row gap">
        <div className="grow muted small">Current revision: <b>v{file.version ?? data?.current_version ?? '?'}</b>. Uploading a revision keeps the same ID and URLs.</div>
        <Button size="sm" variant="primary" icon={Upload} onClick={uploadRevision} loading={busy}>New revision</Button>
      </div>
      {loading ? <Loading /> : error ? <ErrorState error={error} compact onRetry={refresh} /> : versions.length ? (
        <div className="timeline">
          {versions.map((v) => (
            <div key={v.version ?? v.id} className="timeline-item">
              <div className="timeline-dot" />
              <div className="grow">
                <div><b>v{v.version}</b> <span className="muted">· {bytes(v.size)} · {ago(v.created_at)}</span></div>
                <small className="muted">{v.name || v.original_name || ''} {v.created_by?.name ? `by ${v.created_by.name}` : ''} {v.sha256 ? <span className="mono">{v.sha256.slice(0, 12)}…</span> : null}</small>
              </div>
              <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => restore(v)} title="Roll back" />
              <Button size="sm" variant="ghost-danger" icon={Trash2} onClick={() => remove(v)} title="Delete revision" />
            </div>
          ))}
        </div>
      ) : <div className="chart-empty small">No previous revisions</div>}
    </div>
  );
}

function Shares({ file }) {
  const { activeId, toast } = useApp();
  const { data, error, loading, reload } = useApi((pid) => api(pid, 'GET', '/api/v1/shares', { query: { file_id: file.id, state: 'all' } }), [file.id]);
  const shares = listOf(data, 'shares');
  const revoke = async (s) => {
    try { await api(activeId, 'POST', `/api/v1/shares/${s.id}/revoke`); toast('Share revoked', 'success'); reload(); }
    catch (e) { toast(e.message, 'error'); }
  };
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} compact onRetry={reload} />;
  return shares.length ? (
    <div className="stack">
      {shares.map((s) => <ShareRow key={s.id} s={s} onRevoke={() => revoke(s)} />)}
    </div>
  ) : <div className="chart-empty small">No share links for this file yet</div>;
}
export function ShareRow({ s, onRevoke }) {
  const activeShare = !s.revoked_at && s.state !== 'revoked' && s.state !== 'inactive' && s.active !== false;
  return (
    <div className="share-row">
      <div className="grow">
        <div className="row gap">
          <Badge tone={activeShare ? 'green' : 'neutral'} dot>{s.state || (activeShare ? 'active' : 'inactive')}</Badge>
          {s.has_password || s.password_protected ? <Badge tone="amber">password</Badge> : null}
          {s.one_time ? <Badge tone="blue">one-time</Badge> : null}
        </div>
        <small className="muted">
          {num(s.download_count ?? s.downloads ?? 0)}{s.max_downloads ? ` / ${s.max_downloads}` : ''} downloads · created {ago(s.created_at)}{s.expires_at ? ` · expires ${ago(s.expires_at)}` : ''}
        </small>
        {s.message && <div className="small">“{s.message}”</div>}
      </div>
      {activeShare && <Button size="sm" variant="ghost-danger" onClick={onRevoke}>Revoke</Button>}
    </div>
  );
}

function ImageStudio({ file }) {
  const { activeId, toast, copy } = useApp();
  const [p, setP] = useState({ w: '800', h: '', fit: 'cover', format: 'webp', q: '80', dpr: '', rotate: '', blur: '', grayscale: false });
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setP((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const params = useMemo(() => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== '' && v !== false).map(([k, v]) => [k, v === true ? 'true' : v])), [p]);
  const sign = async () => {
    setBusy(true);
    try {
      const r = await api(activeId, 'POST', '/api/v1/images/sign', { body: { file_id: file.id, params } });
      setUrl(r.url || r.signed_url || '');
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  return (
    <div className="stack">
      <div className="muted small">Generate an optimised, signed variant URL (resized, converted, cropped). Variants are cached at the edge.</div>
      <div className="form-grid two">
        <Field label="Width"><input className="input" value={p.w} onChange={set('w')} placeholder="auto" /></Field>
        <Field label="Height"><input className="input" value={p.h} onChange={set('h')} placeholder="auto" /></Field>
        <Field label="Fit"><Select value={p.fit} onChange={set('fit')} options={['cover', 'contain', 'fill', 'inside', 'outside']} /></Field>
        <Field label="Format"><Select value={p.format} onChange={set('format')} options={['auto', 'webp', 'avif', 'jpeg', 'png']} /></Field>
        <Field label="Quality"><input className="input" type="number" min="1" max="100" value={p.q} onChange={set('q')} /></Field>
        <Field label="DPR"><Select value={p.dpr} onChange={set('dpr')} options={[{ value: '', label: '1×' }, { value: '2', label: '2×' }, { value: '3', label: '3×' }]} /></Field>
        <Field label="Rotate"><Select value={p.rotate} onChange={set('rotate')} options={[{ value: '', label: 'None' }, '90', '180', '270']} /></Field>
        <Field label="Blur"><input className="input" value={p.blur} onChange={set('blur')} placeholder="0.3–100" /></Field>
      </div>
      <Field label="Greyscale" row><Toggle checked={p.grayscale} onChange={set('grayscale')} /></Field>
      <Button variant="primary" icon={Wand2} onClick={sign} loading={busy}>Generate signed URL</Button>
      {url && <>
        <CopyField value={url} />
        <div className="drawer-preview checker"><img src={url} alt="" /></div>
        <div className="row gap"><Button size="sm" onClick={() => copy(`![${file.name}](${url})`, 'Markdown copied')}>Copy Markdown</Button><Button size="sm" icon={ExternalLink} onClick={() => cdn.shell.open(url)}>Open</Button></div>
      </>}
    </div>
  );
}

function Media({ file }) {
  const { activeId, toast } = useApp();
  const { data, error, loading, reload } = useApi((pid) => api(pid, 'GET', `/api/v1/files/${file.id}/media`), [file.id]);
  const [kinds, setKinds] = useState(['thumbnail', 'mp4_h264', 'hls']);
  const all = ['thumbnail', 'preview', 'mp4_h264', 'mp4_h265', 'webm_av1', 'hls', 'dash', 'audio', 'waveform'];
  const renditions = listOf(data, 'renditions', 'media');
  const process = async () => {
    try { await api(activeId, 'POST', `/api/v1/files/${file.id}/media/process`, { body: { kinds } }); toast('Processing queued', 'success'); setTimeout(reload, 1500); }
    catch (e) { toast(e.message, 'error'); }
  };
  return (
    <div className="stack">
      <div className="section-title">Renditions</div>
      {loading ? <Loading /> : error ? <ErrorState error={error} compact /> : renditions.length ? renditions.map((r, i) => (
        <div key={i} className="share-row">
          <div className="grow"><b>{r.kind}</b> <span className="muted small">{r.status} {r.size ? `· ${bytes(r.size)}` : ''} {r.width ? `· ${r.width}×${r.height}` : ''}</span></div>
          {r.url && <CopyField value={r.url} />}
        </div>
      )) : <div className="chart-empty small">No renditions yet</div>}
      <div className="section-title">Generate</div>
      <div className="chips">
        {all.map((k) => <button key={k} className={`chip ${kinds.includes(k) ? 'on' : ''}`} onClick={() => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k])}>{k}</button>)}
      </div>
      <Button variant="primary" icon={Film} onClick={process} disabled={!kinds.length}>Process media</Button>
    </div>
  );
}

function Stats({ file }) {
  const [period, setPeriod] = useState('30d');
  const { data, error, loading } = useApi((pid) => api(pid, 'GET', `/api/v1/analytics/files/${file.id}`, { query: { period } }), [file.id, period]);
  const t = data?.totals || {};
  return (
    <div className="stack">
      <Select value={period} onChange={setPeriod} options={['24h', '7d', '30d', '90d']} />
      {loading ? <Loading /> : error ? <ErrorState error={error} compact /> : <>
        <div className="mini-stats">
          <div><small>Requests</small><b>{num(t.requests)}</b></div>
          <div><small>Downloads</small><b>{num(t.downloads ?? file.download_count)}</b></div>
          <div><small>Bandwidth</small><b>{bytes(t.bandwidth ?? file.bandwidth_bytes)}</b></div>
          <div><small>Cache hit</small><b>{t.cache_hit_ratio !== undefined ? `${(t.cache_hit_ratio * 100).toFixed(0)}%` : '—'}</b></div>
        </div>
        <AreaChart data={data?.series || []} height={180} series={[{ key: 'requests', label: 'Requests', color: 'var(--accent)', format: num }]} />
        {(data?.breakdowns?.countries || []).length > 0 && <KV rows={data.breakdowns.countries.slice(0, 8).map((c) => [c.country || c.code || c.label, num(c.count ?? c.requests)])} />}
      </>}
    </div>
  );
}

function Metadata({ file, onChanged }) {
  const { activeId, toast } = useApp();
  const { data, error, loading } = useApi((pid) => api(pid, 'GET', `/api/v1/files/${file.id}/metadata`), [file.id]);
  const [text, setText] = useState(JSON.stringify(file.metadata || {}, null, 2));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    let parsed;
    try { parsed = JSON.parse(text || '{}'); } catch { toast('Metadata must be valid JSON', 'error'); return; }
    setSaving(true);
    try { onChanged(await api(activeId, 'PATCH', `/api/v1/files/${file.id}`, { body: { metadata: parsed } })); toast('Metadata saved', 'success'); }
    catch (e) { toast(e.message, 'error'); }
    setSaving(false);
  };
  return (
    <div className="stack">
      <div className="section-title">Custom metadata</div>
      <textarea className="input mono code-area" rows={8} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      <Button variant="primary" size="sm" icon={Save} onClick={save} loading={saving}>Save metadata</Button>
      <div className="section-title">Extracted metadata</div>
      {loading ? <Loading /> : error ? <ErrorState error={error} compact /> : <pre className="json-view">{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}
