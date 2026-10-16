import React, { useState } from 'react';
import { Trash2, RotateCcw, RefreshCw, Search, Flame } from 'lucide-react';
import { useApp, useApi } from '../lib/store.jsx';
import { api, listOf, bytes, ago, date, num } from '../lib/util.js';
import { PageHeader, Button, Loading, ErrorState, Empty } from '../components/ui.jsx';
import FileIcon from '../components/FileIcon.jsx';

export default function Trash() {
  const { activeId, toast, confirm, bumpFiles } = useApp();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Set());
  const { data, error, loading, reload } = useApi((pid) => api(pid, 'GET', '/api/v1/trash', { query: { q: q || undefined, page, limit: 100 } }), [q, page]);
  const items = listOf(data, 'files');
  const pg = data?.pagination;
  const sel = items.filter((f) => selected.has(f.id));

  const restore = async (list) => {
    const res = await Promise.allSettled(list.map((f) => api(activeId, 'POST', `/api/v1/files/${f.id}/restore`, { body: {} })));
    const ok = res.filter((r) => r.status === 'fulfilled').length;
    toast(`Restored ${ok} file${ok === 1 ? '' : 's'}`, ok === list.length ? 'success' : 'warn');
    setSelected(new Set()); reload(); bumpFiles();
  };
  const purge = async (list) => {
    if (!(await confirm({ title: `Permanently delete ${list.length} file${list.length > 1 ? 's' : ''}?`, message: 'This cannot be undone.', danger: true, confirmText: 'Delete forever' }))) return;
    const res = await Promise.allSettled(list.map((f) => api(activeId, 'DELETE', `/api/v1/trash/${f.id}`)));
    toast(`Deleted ${res.filter((r) => r.status === 'fulfilled').length} permanently`, 'success');
    setSelected(new Set()); reload();
  };
  const empty = async () => {
    if (!(await confirm({ title: 'Empty the recycle bin?', message: 'Every file in the recycle bin will be permanently deleted. This cannot be undone.', danger: true, confirmText: 'Empty bin' }))) return;
    try { await api(activeId, 'POST', '/api/v1/trash/empty'); toast('Recycle bin emptied', 'success'); reload(); }
    catch (e) { toast(e.message, 'error'); }
  };
  const toggle = (id) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); };

  return (
    <div className="page">
      <PageHeader icon={Trash2} title="Recycle bin" subtitle={pg ? `${num(pg.total)} deleted files kept for the retention period` : 'Deleted files kept for the retention period'}>
        <div className="search"><Search size={15} /><input placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        <Button icon={RefreshCw} onClick={reload} />
        <Button variant="danger" icon={Flame} onClick={empty} disabled={!items.length}>Empty bin</Button>
      </PageHeader>
      {sel.length > 0 && (
        <div className="bulkbar">
          <b>{sel.length} selected</b>
          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => restore(sel)}>Restore</Button>
          <Button size="sm" variant="ghost-danger" icon={Trash2} onClick={() => purge(sel)}>Delete forever</Button>
        </div>
      )}
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !items.length ? (
        <Empty icon={Trash2} title="Recycle bin is empty">Deleted files show up here and can be restored.</Empty>
      ) : (
        <div className="card">
          <table className="table">
            <thead><tr><th style={{ width: 36 }}><input type="checkbox" checked={sel.length === items.length} onChange={(e) => setSelected(new Set(e.target.checked ? items.map((f) => f.id) : []))} /></th><th>Name</th><th>Original folder</th><th>Size</th><th>Deleted</th><th>Purges</th><th /></tr></thead>
            <tbody>
              {items.map((f) => (
                <tr key={f.id} className={selected.has(f.id) ? 'selected' : ''}>
                  <td><input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} /></td>
                  <td><div className="name-cell"><FileIcon file={f} size={28} /><span className="ellipsis">{f.name}</span></div></td>
                  <td className="muted">{f.folder_path || '/'}</td>
                  <td className="muted">{bytes(f.size)}</td>
                  <td className="muted" title={date(f.deleted_at)}>{ago(f.deleted_at)}</td>
                  <td className="muted">{f.purge_at || f.expires_at ? ago(f.purge_at || f.expires_at) : '—'}</td>
                  <td className="nowrap right">
                    <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => restore([f])}>Restore</Button>
                    <Button size="sm" variant="ghost-danger" icon={Trash2} onClick={() => purge([f])} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pg && pg.total_pages > 1 && <div className="pager"><Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span className="muted small">Page {page} of {pg.total_pages}</span><Button size="sm" disabled={!pg.has_more} onClick={() => setPage(page + 1)}>Next</Button></div>}
        </div>
      )}
    </div>
  );
}
