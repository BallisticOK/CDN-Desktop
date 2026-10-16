import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FolderOpen, Upload, FolderPlus, Search, LayoutGrid, List, RefreshCw, ChevronRight, Home, Download, Trash2, Link2,
  Eye, Pencil, FolderInput, Copy, Share2, History, FileEdit, Globe, Lock, Zap, Info, ClipboardPaste, X, FolderUp,
  ExternalLink, CheckSquare, Shield, ArrowDownWideNarrow, ArrowUpNarrowWide, MoreHorizontal, Image as ImageIcon,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { api, cdn, listOf, bytes, ago, date, fileKind, isEditable, VISIBILITIES, VIS_LABEL, classNames, num } from '../lib/util.js';
import { copyLinks, downloadFiles, deleteFiles, openInBrowser, purgeFiles } from '../lib/actions.js';
import { Button, Select, Segmented, useContextMenu, Badge, visTone, Empty, ErrorState, Loading, Dropdown, Spinner } from '../components/ui.jsx';
import FileIcon from '../components/FileIcon.jsx';
import FileDetails from '../components/FileDetails.jsx';
import Preview from '../components/Preview.jsx';
import TextEditor from '../components/TextEditor.jsx';
import FolderPicker from '../components/FolderPicker.jsx';
import ShareDialog from '../components/ShareDialog.jsx';

const TYPES = [
  { value: '', label: 'All types' }, { value: 'image', label: 'Images' }, { value: 'video', label: 'Videos' }, { value: 'audio', label: 'Audio' },
  { value: 'document', label: 'Documents' }, { value: 'archive', label: 'Archives' }, { value: 'other', label: 'Other' },
];
const SORTS = [{ value: 'created_at', label: 'Date added' }, { value: 'name', label: 'Name' }, { value: 'size', label: 'Size' }, { value: 'downloads', label: 'Downloads' }, { value: 'bandwidth', label: 'Bandwidth' }];

export default function Files({ params = {} }) {
  const app = useApp();
  const { activeId, active, toast, prompt, confirm, settings, filesVersion, copy } = app;
  const [folderId, setFolderId] = useState(params.folderId ?? null);
  const [folder, setFolder] = useState(null);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [qLive, setQLive] = useState('');
  const [scopeAll, setScopeAll] = useState(true);
  const [type, setType] = useState('');
  const [visibility, setVisibility] = useState('');
  const [sort, setSort] = useState('created_at');
  const [order, setOrder] = useState('desc');
  const [view, setView] = useState(settings.defaultView || 'grid');
  const [selected, setSelected] = useState(new Set(params.selectId ? [params.selectId] : []));
  const [anchor, setAnchor] = useState(null);
  const [detailsId, setDetailsId] = useState(params.selectId || null);
  const [preview, setPreview] = useState(null);
  const [editing, setEditing] = useState(null);
  const [moving, setMoving] = useState(null);
  const [sharing, setSharing] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [dropFolder, setDropFolder] = useState(null);
  const [openMenu, menuEl] = useContextMenu();
  const dragDepth = useRef(0);
  const searching = !!q.trim();

  // Debounce search input
  useEffect(() => { const t = setTimeout(() => setQ(qLive), 280); return () => clearTimeout(t); }, [qLive]);

  const fileQuery = useCallback((page) => ({
    page, limit: settings.pageSize || 60, sort, order, q: q.trim() || undefined, type: type || undefined, visibility: visibility || undefined,
    folder_id: searching && scopeAll ? undefined : (folderId || 'root'),
  }), [settings.pageSize, sort, order, q, type, visibility, searching, scopeAll, folderId]);

  const load = useCallback(async (silent = false) => {
    if (!activeId) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [fl, fo, info] = await Promise.all([
        api(activeId, 'GET', '/api/v1/files', { query: fileQuery(1) }),
        searching ? Promise.resolve(null) : api(activeId, 'GET', '/api/v1/folders', { query: { parent_id: folderId || 'root', limit: 500 } }).catch(() => null),
        folderId ? api(activeId, 'GET', `/api/v1/folders/${folderId}`).catch(() => null) : Promise.resolve(null),
      ]);
      setFiles(listOf(fl)); setPagination(fl?.pagination || null);
      setFolders(fo ? listOf(fo) : []);
      setFolder(info);
    } catch (e) { setError(e); setFiles([]); setFolders([]); }
    setLoading(false);
  }, [activeId, fileQuery, searching, folderId, type, visibility]);

  useEffect(() => { load(); }, [load, filesVersion]);
  useEffect(() => { setSelected((s) => (params.selectId && s.has(params.selectId) ? s : new Set())); }, [folderId]); // eslint-disable-line

  const loadMore = async () => {
    if (!pagination?.has_more) return;
    setLoadingMore(true);
    try {
      const fl = await api(activeId, 'GET', '/api/v1/files', { query: fileQuery((pagination.page || 1) + 1) });
      setFiles((prev) => [...prev, ...listOf(fl)]); setPagination(fl.pagination);
    } catch (e) { toast(e.message, 'error'); }
    setLoadingMore(false);
  };

  const navigateTo = (id) => { setFolderId(id); setQLive(''); setQ(''); setDetailsId(null); };

  const selectedFiles = useMemo(() => files.filter((f) => selected.has(f.id)), [files, selected]);
  const detailsFile = files.find((f) => f.id === detailsId) || null;

  const replaceFile = (f) => setFiles((prev) => prev.map((x) => (x.id === f.id ? { ...x, ...f } : x)));
  const removeFiles = (ids) => { setFiles((prev) => prev.filter((x) => !ids.includes(x.id))); setSelected(new Set()); if (ids.includes(detailsId)) setDetailsId(null); };

  // ---------------------------------------------------------------- uploads
  const uploadPaths = async (paths, targetFolder = folderId) => {
    if (!paths.length) return;
    toast(`Uploading ${paths.length} item${paths.length > 1 ? 's' : ''}…`, 'info');
    try {
      const r = await cdn.transfers.uploadPaths({ profileId: activeId, paths, folderId: targetFolder || undefined, visibility: active?.defaultVisibility || undefined });
      toast(`Uploaded ${r.ok} of ${r.total} file${r.total === 1 ? '' : 's'}`, r.failed ? 'warn' : 'success', r.files.length === 1 ? { action: { label: 'Copy link', onClick: () => copyLinks(app, r.files) } } : {});
      load(true);
    } catch (e) { toast(e.message, 'error'); }
  };
  const uploadBuffer = async (name, buf) => {
    try {
      const f = await cdn.transfers.uploadBuffer({ profileId: activeId, name, data: buf, folderId: folderId || undefined, visibility: active?.defaultVisibility || undefined });
      toast(`Uploaded ${f.name}`, 'success', { action: { label: 'Copy link', onClick: () => copyLinks(app, [f]) } });
      load(true);
    } catch (e) { toast(e.message, 'error'); }
  };
  const pickFiles = async (folders = false) => uploadPaths(await cdn.dialog.openFiles({ folders, title: folders ? 'Upload folders' : 'Upload files' }));
  const pasteClipboard = async () => {
    const png = await cdn.clipboard.image();
    if (!png) { toast('No image on the clipboard', 'warn'); return; }
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    uploadBuffer(`paste-${ts}.png`, png);
  };

  // Paste (Ctrl+V) files or images straight into the current folder
  useEffect(() => {
    const onPaste = async (e) => {
      if (e.target?.closest?.('input, textarea, .cm-editor')) return;
      const items = [...(e.clipboardData?.files || [])];
      if (!items.length) return;
      e.preventDefault();
      const paths = items.map((f) => cdn.pathForFile(f)).filter(Boolean);
      if (paths.length) return uploadPaths(paths);
      for (const f of items) uploadBuffer(f.name || 'pasted.png', new Uint8Array(await f.arrayBuffer()));
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  // ---------------------------------------------------------------- drag & drop
  const isInternal = (e) => e.dataTransfer.types.includes('application/x-cdn-files');
  const onDragEnter = (e) => { if (isInternal(e)) return; e.preventDefault(); dragDepth.current++; setDragOver(true); };
  const onDragLeave = (e) => { if (isInternal(e)) return; dragDepth.current--; if (dragDepth.current <= 0) { dragDepth.current = 0; setDragOver(false); } };
  const onDragOver = (e) => { e.preventDefault(); };
  const onDrop = (e, targetFolder = folderId) => {
    e.preventDefault(); e.stopPropagation(); dragDepth.current = 0; setDragOver(false); setDropFolder(null);
    if (isInternal(e)) {
      const ids = JSON.parse(e.dataTransfer.getData('application/x-cdn-files'));
      if (targetFolder !== folderId || ids.folders?.length) moveItems(ids.files || [], ids.folders || [], targetFolder);
      return;
    }
    const paths = [...e.dataTransfer.files].map((f) => cdn.pathForFile(f)).filter(Boolean);
    uploadPaths(paths, targetFolder);
  };
  const startDrag = (e, f) => {
    const ids = selected.has(f.id) ? [...selected] : [f.id];
    e.dataTransfer.setData('application/x-cdn-files', JSON.stringify({ files: ids }));
    e.dataTransfer.effectAllowed = 'move';
  };
  const startFolderDrag = (e, fo) => {
    e.dataTransfer.setData('application/x-cdn-files', JSON.stringify({ folders: [fo.id] }));
    e.dataTransfer.effectAllowed = 'move';
  };

  // ---------------------------------------------------------------- actions
  const moveItems = async (fileIds, folderIds, target) => {
    folderIds = folderIds.filter((id) => id !== target);
    try {
      await Promise.all([
        ...fileIds.map((id) => api(activeId, 'POST', `/api/v1/files/${id}/move`, { body: { folder_id: target || null } })),
        ...folderIds.map((id) => api(activeId, 'PATCH', `/api/v1/folders/${id}`, { body: { parent_id: target || null } })),
      ]);
      const n = fileIds.length + folderIds.length;
      toast(`Moved ${n} item${n > 1 ? 's' : ''}`, 'success');
      load(true); setSelected(new Set());
    } catch (e) { toast(e.message, 'error'); load(true); }
  };
  const newFolder = async () => {
    const name = await prompt({ title: 'New folder', label: 'Folder name', placeholder: 'e.g. images', confirmText: 'Create' });
    if (!name?.trim()) return;
    try { await api(activeId, 'POST', '/api/v1/folders', { body: { name: name.trim(), parent_id: folderId || undefined } }); toast('Folder created', 'success'); load(true); }
    catch (e) { toast(e.message, 'error'); }
  };
  const renameFile = async (f) => {
    const name = await prompt({ title: 'Rename file', label: 'New name', value: f.name, selectStem: true, confirmText: 'Rename' });
    if (!name?.trim() || name === f.name) return;
    try { replaceFile(await api(activeId, 'PATCH', `/api/v1/files/${f.id}`, { body: { name: name.trim() } })); toast('Renamed', 'success'); }
    catch (e) { toast(e.message, 'error'); }
  };
  const renameFolder = async (fo) => {
    const name = await prompt({ title: 'Rename folder', label: 'New name', value: fo.name, confirmText: 'Rename' });
    if (!name?.trim() || name === fo.name) return;
    try { await api(activeId, 'PATCH', `/api/v1/folders/${fo.id}`, { body: { name: name.trim() } }); load(true); toast('Renamed', 'success'); }
    catch (e) { toast(e.message, 'error'); }
  };
  const deleteFolder = async (fo) => {
    const hasStuff = (fo.file_count || 0) + (fo.folder_count || 0) > 0;
    if (!(await confirm({ title: `Delete folder “${fo.name}”?`, message: hasStuff ? `It contains ${fo.file_count || 0} files and ${fo.folder_count || 0} folders, which will also be deleted.` : 'The folder is empty.', danger: true, confirmText: 'Delete' }))) return;
    try { await api(activeId, 'DELETE', `/api/v1/folders/${fo.id}`, { query: hasStuff ? { recursive: 'true' } : undefined }); toast('Folder deleted', 'success'); load(true); }
    catch (e) { toast(e.message, 'error'); }
  };
  const setVis = async (list, v) => {
    try {
      const out = await Promise.all(list.map((f) => api(activeId, 'PATCH', `/api/v1/files/${f.id}`, { body: { visibility: v } })));
      out.forEach(replaceFile); toast(`Visibility set to ${VIS_LABEL[v]}`, 'success');
    } catch (e) { toast(e.message, 'error'); }
  };
  const setFolderVis = async (fo, v) => {
    try { await api(activeId, 'PATCH', `/api/v1/folders/${fo.id}`, { body: { visibility: v } }); toast(`Folder is now ${VIS_LABEL[v]}`, 'success'); load(true); }
    catch (e) { toast(e.message, 'error'); }
  };
  const duplicate = async (f) => {
    try { await api(activeId, 'POST', `/api/v1/files/${f.id}/copy`, { body: { folder_id: f.folder_id || undefined } }); toast('Copy created', 'success'); load(true); }
    catch (e) { toast(e.message, 'error'); }
  };
  const doDelete = (list) => deleteFiles(app, list, { onDone: () => { removeFiles(list.map((f) => f.id)); load(true); } });

  const openFile = (f) => {
    const kind = fileKind(f);
    if (['image', 'video', 'audio', 'pdf', 'text'].includes(kind)) setPreview(files.filter((x) => ['image', 'video', 'audio', 'pdf', 'text'].includes(fileKind(x))).findIndex((x) => x.id === f.id));
    else setDetailsId(f.id);
  };

  const fileMenu = (e, f) => {
    let list = selected.has(f.id) ? selectedFiles : [f];
    if (!selected.has(f.id)) { setSelected(new Set([f.id])); setAnchor(f.id); }
    const multi = list.length > 1;
    openMenu(e, [
      multi && { header: `${list.length} files selected` },
      !multi && { label: 'Open preview', icon: Eye, onClick: () => openFile(f), shortcut: 'Enter' },
      !multi && isEditable(f) && { label: 'Edit text', icon: FileEdit, onClick: () => setEditing(f) },
      { label: multi ? 'Download all' : 'Download', icon: Download, onClick: () => downloadFiles(app, list) },
      { divider: true },
      { label: multi ? 'Copy links' : 'Copy link', icon: Link2, onClick: () => copyLinks(app, list), shortcut: 'Ctrl+C' },
      {
        label: 'Copy as…', icon: Copy, submenu: [
          { label: 'CDN URL', onClick: () => copyLinks(app, list, 'url') },
          { label: 'Friendly path URL', onClick: () => copyLinks(app, list, 'path_url') },
          { label: 'Signed URL (expiring)', onClick: () => copyLinks(app, list, 'signed') },
          { label: 'API download URL', onClick: () => copyLinks(app, list, 'download_url') },
          { divider: true },
          { label: 'Markdown', onClick: () => copy(list.map((x) => fileKind(x) === 'image' ? `![${x.name}](${x.url})` : `[${x.name}](${x.url})`).join('\n'), 'Markdown copied') },
          { label: 'HTML', onClick: () => copy(list.map((x) => fileKind(x) === 'image' ? `<img src="${x.url}" alt="${x.name}">` : `<a href="${x.url}">${x.name}</a>`).join('\n'), 'HTML copied') },
          { label: 'File ID', onClick: () => copy(list.map((x) => x.id).join('\n'), 'ID copied') },
        ],
      },
      !multi && { label: 'Open in browser', icon: ExternalLink, onClick: () => openInBrowser(app, f) },
      !multi && { label: 'Create share link…', icon: Share2, onClick: () => setSharing(f) },
      { divider: true },
      !multi && { label: 'Rename', icon: Pencil, onClick: () => renameFile(f), shortcut: 'F2' },
      { label: 'Move to…', icon: FolderInput, onClick: () => setMoving({ files: list.map((x) => x.id) }) },
      !multi && { label: 'Make a copy', icon: Copy, onClick: () => duplicate(f) },
      { label: 'Visibility', icon: Shield, submenu: VISIBILITIES.map((v) => ({ label: VIS_LABEL[v], checked: !multi && f.visibility === v, onClick: () => setVis(list, v) })) },
      { label: 'Purge from cache', icon: Zap, onClick: () => purgeFiles(app, list) },
      !multi && { label: 'Details & versions', icon: Info, onClick: () => setDetailsId(f.id), shortcut: 'Space' },
      { divider: true },
      { label: multi ? `Delete ${list.length} files` : 'Delete', icon: Trash2, danger: true, onClick: () => doDelete(list), shortcut: 'Del' },
    ]);
  };
  const folderMenu = (e, fo) => openMenu(e, [
    { label: 'Open', icon: FolderOpen, onClick: () => navigateTo(fo.id) },
    { label: 'Upload here…', icon: Upload, onClick: async () => uploadPaths(await cdn.dialog.openFiles({}), fo.id) },
    { divider: true },
    { label: 'Rename', icon: Pencil, onClick: () => renameFolder(fo) },
    { label: 'Move to…', icon: FolderInput, onClick: () => setMoving({ folders: [fo.id] }) },
    { label: 'Visibility', icon: Shield, submenu: VISIBILITIES.map((v) => ({ label: VIS_LABEL[v], checked: fo.visibility === v, onClick: () => setFolderVis(fo, v) })) },
    { label: 'Purge from cache', icon: Zap, onClick: async () => { try { await api(activeId, 'POST', '/api/v1/cache/purge', { body: { type: 'folder', targets: [fo.id] } }); toast('Folder purge queued', 'success'); } catch (er) { toast(er.message, 'error'); } } },
    { label: 'Copy folder ID', icon: Copy, onClick: () => copy(fo.id) },
    { divider: true },
    { label: 'Delete folder', icon: Trash2, danger: true, onClick: () => deleteFolder(fo) },
  ]);
  const bgMenu = (e) => {
    if (e.target?.closest?.('.tile, .row-item')) return;
    openMenu(e, [
      { label: 'Upload files…', icon: Upload, onClick: () => pickFiles(false) },
      { label: 'Upload folder…', icon: FolderUp, onClick: () => pickFiles(true) },
      { label: 'Paste image from clipboard', icon: ClipboardPaste, onClick: pasteClipboard },
      { label: 'New folder', icon: FolderPlus, onClick: newFolder },
      { divider: true },
      { label: 'Select all', icon: CheckSquare, onClick: () => setSelected(new Set(files.map((f) => f.id))), shortcut: 'Ctrl+A' },
      { label: 'Refresh', icon: RefreshCw, onClick: () => load(), shortcut: 'F5' },
    ]);
  };

  // ---------------------------------------------------------------- selection
  const clickFile = (e, f) => {
    if (e.shiftKey && anchor) {
      const a = files.findIndex((x) => x.id === anchor); const b = files.findIndex((x) => x.id === f.id);
      const [s, t] = a < b ? [a, b] : [b, a];
      const next = new Set(e.ctrlKey ? selected : []);
      files.slice(s, t + 1).forEach((x) => next.add(x.id));
      setSelected(next);
    } else if (e.ctrlKey || e.metaKey) {
      const next = new Set(selected); next.has(f.id) ? next.delete(f.id) : next.add(f.id); setSelected(next); setAnchor(f.id);
    } else { setSelected(new Set([f.id])); setAnchor(f.id); if (detailsId) setDetailsId(f.id); }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const k = (e) => {
      if (e.target?.closest?.('input, textarea, select, .cm-editor, .modal')) return;
      if (preview !== null || editing) return;
      if (e.key === 'a' && e.ctrlKey) { e.preventDefault(); setSelected(new Set(files.map((f) => f.id))); }
      else if (e.key === 'Escape') { setSelected(new Set()); setDetailsId(null); }
      else if (e.key === 'Delete' && selectedFiles.length) doDelete(selectedFiles);
      else if (e.key === 'F2' && selectedFiles.length === 1) renameFile(selectedFiles[0]);
      else if (e.key === 'F5') { e.preventDefault(); load(); }
      else if (e.key === 'Enter' && selectedFiles.length === 1) openFile(selectedFiles[0]);
      else if (e.key === ' ' && selectedFiles.length === 1) { e.preventDefault(); setDetailsId(detailsId ? null : selectedFiles[0].id); }
      else if (e.key === 'c' && e.ctrlKey && selectedFiles.length && !window.getSelection()?.toString()) { e.preventDefault(); copyLinks(app, selectedFiles); }
      else if (e.key === 'Backspace' && folder) navigateTo(folder.parent_id || null);
      else if (e.key === 'f' && e.ctrlKey) { e.preventDefault(); document.getElementById('file-search')?.focus(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const crumbs = folder?.breadcrumbs || (folder ? [{ id: folder.id, name: folder.name }] : []);
  const previewList = useMemo(() => files.filter((x) => ['image', 'video', 'audio', 'pdf', 'text'].includes(fileKind(x))), [files]);
  const empty = !loading && !error && !files.length && !folders.length;

  return (
    <div className={classNames('page files-page', detailsFile && 'with-drawer')} onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={(e) => onDrop(e)}>
      <div className="files-main" onContextMenu={bgMenu} onClick={(e) => { if (!e.target?.closest?.('.tile, .row-item, .bulkbar, .toolbar')) setSelected(new Set()); }}>
        <div className="toolbar">
          <div className="crumbs">
            <button className={classNames('crumb', !folderId && !searching && 'current', dropFolder === 'root' && 'drop')} onClick={() => navigateTo(null)}
              onDragOver={(e) => { e.preventDefault(); setDropFolder('root'); }} onDragLeave={() => setDropFolder(null)} onDrop={(e) => onDrop(e, null)}>
              <Home size={15} /><span>{active?.name}</span>
            </button>
            {!searching && crumbs.map((c, i) => (
              <React.Fragment key={c.id}>
                <ChevronRight size={14} className="muted" />
                <button className={classNames('crumb', i === crumbs.length - 1 && 'current', dropFolder === c.id && 'drop')} onClick={() => navigateTo(c.id)}
                  onDragOver={(e) => { e.preventDefault(); setDropFolder(c.id); }} onDragLeave={() => setDropFolder(null)} onDrop={(e) => onDrop(e, c.id)}>{c.name}</button>
              </React.Fragment>
            ))}
            {searching && <><ChevronRight size={14} className="muted" /><span className="crumb current">Search results{pagination ? ` · ${num(pagination.total)}` : ''}</span></>}
          </div>
          <div className="grow" />
          <div className="search">
            <Search size={15} />
            <input id="file-search" placeholder="Search name, ID or SHA-256…  (Ctrl+F)" value={qLive} onChange={(e) => setQLive(e.target.value)} />
            {qLive && <button className="icon-btn" onClick={() => setQLive('')}><X size={14} /></button>}
          </div>
          <Button icon={FolderPlus} onClick={newFolder} title="New folder" />
          <Dropdown align="right" trigger={<Button variant="primary" icon={Upload}>Upload</Button>} items={[
            { label: 'Files…', icon: Upload, onClick: () => pickFiles(false) },
            { label: 'Folder…', icon: FolderUp, onClick: () => pickFiles(true) },
            { label: 'Image from clipboard', icon: ClipboardPaste, onClick: pasteClipboard },
          ]} />
        </div>

        <div className="filterbar">
          <Select value={type} onChange={setType} options={TYPES} />
          <Select value={visibility} onChange={setVisibility} options={[{ value: '', label: 'Any visibility' }, ...VISIBILITIES.map((v) => ({ value: v, label: VIS_LABEL[v] }))]} />
          <Select value={sort} onChange={setSort} options={SORTS} />
          <Button size="sm" variant="ghost" icon={order === 'desc' ? ArrowDownWideNarrow : ArrowUpNarrowWide} onClick={() => setOrder(order === 'desc' ? 'asc' : 'desc')} title={order === 'desc' ? 'Descending' : 'Ascending'} />
          {searching && <Segmented value={scopeAll ? 'all' : 'here'} onChange={(v) => setScopeAll(v === 'all')} options={[{ value: 'all', label: 'Everywhere' }, { value: 'here', label: 'This folder' }]} />}
          <div className="grow" />
          <span className="muted small">{pagination ? `${num(files.length)} of ${num(pagination.total)} files` : ''}{folders.length ? ` · ${folders.length} folders` : ''}</span>
          <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => load()} title="Refresh (F5)" />
          <Segmented value={view} onChange={setView} options={[{ value: 'grid', icon: LayoutGrid, title: 'Grid' }, { value: 'list', icon: List, title: 'List' }]} />
        </div>

        {selected.size > 0 && (
          <div className="bulkbar">
            <b>{selected.size} selected</b>
            <Button size="sm" variant="ghost" icon={Download} onClick={() => downloadFiles(app, selectedFiles)}>Download</Button>
            <Button size="sm" variant="ghost" icon={Link2} onClick={() => copyLinks(app, selectedFiles)}>Copy links</Button>
            <Button size="sm" variant="ghost" icon={FolderInput} onClick={() => setMoving({ files: [...selected] })}>Move</Button>
            <Dropdown trigger={<Button size="sm" variant="ghost" icon={Shield}>Visibility</Button>} items={VISIBILITIES.map((v) => ({ label: VIS_LABEL[v], onClick: () => setVis(selectedFiles, v) }))} />
            <Button size="sm" variant="ghost" icon={Zap} onClick={() => purgeFiles(app, selectedFiles)}>Purge</Button>
            <Button size="sm" variant="ghost-danger" icon={Trash2} onClick={() => doDelete(selectedFiles)}>Delete</Button>
            <div className="grow" />
            <Button size="sm" variant="ghost" icon={X} onClick={() => setSelected(new Set())} />
          </div>
        )}

        <div className="files-scroll">
          {loading ? <Loading label="Loading files…" /> : error ? <ErrorState error={error} onRetry={load} /> : empty ? (
            <Empty icon={searching ? Search : FolderOpen} title={searching ? 'No matches' : 'This folder is empty'}
              action={!searching && <div className="row gap"><Button variant="primary" icon={Upload} onClick={() => pickFiles(false)}>Upload files</Button><Button icon={FolderPlus} onClick={newFolder}>New folder</Button></div>}>
              {searching ? 'Try a different name, ID or checksum.' : 'Drag files or folders here, paste with Ctrl+V, or use the Upload button.'}
            </Empty>
          ) : view === 'grid' ? (
            <>
            {folders.length > 0 && <div className="grid-label">Folders</div>}
            <div className="tiles folder-tiles">
              {folders.map((fo) => (
                <div key={fo.id} className={classNames('tile folder-tile', dropFolder === fo.id && 'drop')} draggable onDragStart={(e) => startFolderDrag(e, fo)}
                  onDoubleClick={() => navigateTo(fo.id)} onContextMenu={(e) => folderMenu(e, fo)}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropFolder(fo.id); }} onDragLeave={() => setDropFolder(null)} onDrop={(e) => onDrop(e, fo.id)}>
                  <FileIcon folder size={44} />
                  <div className="tile-meta"><div className="tile-name">{fo.name}</div><small>{num(fo.file_count || 0)} files{fo.folder_count ? ` · ${fo.folder_count} folders` : ''}</small></div>
                  {fo.visibility && fo.visibility !== 'PUBLIC' && <Lock size={13} className="tile-lock" />}
                </div>
              ))}
            </div>
            {folders.length > 0 && files.length > 0 && <div className="grid-label">Files</div>}
            <div className="tiles">
              {files.map((f) => (
                <div key={f.id} className={classNames('tile file-tile', selected.has(f.id) && 'selected')} draggable onDragStart={(e) => startDrag(e, f)}
                  onClick={(e) => clickFile(e, f)} onDoubleClick={() => openFile(f)} onContextMenu={(e) => fileMenu(e, f)}>
                  <div className="tile-cover">
                    <FileIcon file={f} thumb cover />
                    {f.duration_seconds ? <span className="tile-dur">{Math.floor(f.duration_seconds / 60)}:{String(Math.round(f.duration_seconds % 60)).padStart(2, '0')}</span> : null}
                    {f.status && f.status !== 'READY' && <span className="tile-status"><Badge tone={f.status === 'FAILED' || f.status === 'QUARANTINED' ? 'red' : 'amber'}>{f.status.toLowerCase()}</Badge></span>}
                    <button className="tile-more" onClick={(e) => fileMenu(e, f)}><MoreHorizontal size={16} /></button>
                    <span className={`tile-vis vis-${visTone(f.visibility)}`} title={VIS_LABEL[f.visibility]}>{f.visibility === 'PUBLIC' ? <Globe size={12} /> : <Lock size={12} />}</span>
                  </div>
                  <div className="tile-meta">
                    <div className="tile-name" title={f.name}>{f.name}</div>
                    <small>{bytes(f.size)}{f.width ? ` · ${f.width}×${f.height}` : ''} · {ago(f.created_at)}</small>
                  </div>
                </div>
              ))}
            </div>
            </>
          ) : (
            <table className="table files-table">
              <thead><tr><th style={{ width: '46%' }}>Name</th><th>Size</th><th>Visibility</th><th>Downloads</th><th>Added</th><th style={{ width: 40 }} /></tr></thead>
              <tbody>
                {folders.map((fo) => (
                  <tr key={fo.id} className={classNames('row-item', dropFolder === fo.id && 'drop')} draggable onDragStart={(e) => startFolderDrag(e, fo)} onDoubleClick={() => navigateTo(fo.id)} onContextMenu={(e) => folderMenu(e, fo)}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropFolder(fo.id); }} onDragLeave={() => setDropFolder(null)} onDrop={(e) => onDrop(e, fo.id)}>
                    <td><div className="name-cell"><FileIcon folder size={30} /><span>{fo.name}</span></div></td>
                    <td className="muted">{num(fo.file_count || 0)} files</td>
                    <td>{fo.visibility && <Badge tone={visTone(fo.visibility)}>{VIS_LABEL[fo.visibility]}</Badge>}</td>
                    <td className="muted">—</td><td className="muted">{ago(fo.created_at)}</td>
                    <td><button className="icon-btn" onClick={(e) => folderMenu(e, fo)}><MoreHorizontal size={16} /></button></td>
                  </tr>
                ))}
                {files.map((f) => (
                  <tr key={f.id} className={classNames('row-item', selected.has(f.id) && 'selected')} draggable onDragStart={(e) => startDrag(e, f)}
                    onClick={(e) => clickFile(e, f)} onDoubleClick={() => openFile(f)} onContextMenu={(e) => fileMenu(e, f)}>
                    <td><div className="name-cell"><FileIcon file={f} size={30} thumb /><span className="ellipsis" title={f.name}>{f.name}</span>{searching && <small className="muted">{f.folder_path || '/'}</small>}</div></td>
                    <td className="muted nowrap">{bytes(f.size)}</td>
                    <td><Badge tone={visTone(f.visibility)}>{VIS_LABEL[f.visibility] || f.visibility}</Badge></td>
                    <td className="muted">{num(f.download_count || 0)}</td>
                    <td className="muted nowrap" title={date(f.created_at)}>{ago(f.created_at)}</td>
                    <td><button className="icon-btn" onClick={(e) => fileMenu(e, f)}><MoreHorizontal size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {pagination?.has_more && !loading && (
            <div className="load-more"><Button onClick={loadMore} loading={loadingMore}>Load more ({num(pagination.total - files.length)} remaining)</Button></div>
          )}
        </div>
      </div>

      {detailsFile && (
        <FileDetails key={detailsFile.id} file={detailsFile} onClose={() => setDetailsId(null)} onChanged={replaceFile}
          onAction={(a) => ({
            preview: () => openFile(detailsFile), edit: () => setEditing(detailsFile), share: () => setSharing(detailsFile),
            move: () => setMoving({ files: [detailsFile.id] }), rename: () => renameFile(detailsFile), delete: () => doDelete([detailsFile]),
            download: () => downloadFiles(app, [detailsFile]), copy: () => copyLinks(app, [detailsFile]), reload: () => load(true),
          })[a]?.()} />
      )}

      {dragOver && (
        <div className="dropzone">
          <div className="dropzone-inner"><Upload size={40} /><b>Drop to upload</b><span>to {folder?.path || folder?.name || active?.name}</span></div>
        </div>
      )}

      {preview !== null && previewList[preview] && (
        <Preview files={previewList} index={preview} onIndex={setPreview} onClose={() => setPreview(null)}
          onEdit={(f) => { setPreview(null); setEditing(f); }} onDetails={(f) => { setPreview(null); setDetailsId(f.id); }} />
      )}
      {editing && <TextEditor file={editing} onClose={() => setEditing(null)} onSaved={(f) => { if (f?.id) replaceFile(f); else load(true); }} />}
      {moving && <FolderPicker title={`Move ${(moving.files?.length || 0) + (moving.folders?.length || 0)} item(s) to…`} exclude={moving.folders || []} initial={folderId}
        onClose={() => setMoving(null)} onPick={(target) => { setMoving(null); moveItems(moving.files || [], moving.folders || [], target); }} />}
      {sharing && <ShareDialog file={sharing} onClose={() => setSharing(null)} />}
      {menuEl}
    </div>
  );
}
