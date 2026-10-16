import React, { useCallback, useEffect, useState } from 'react';
import { FileEdit, Save, WrapText, AlertTriangle, RotateCcw } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { api, bytes } from '../lib/util.js';
import { Modal, Button, Loading, ErrorState, Badge } from './ui.jsx';
import CodeView from './CodeView.jsx';

export default function TextEditor({ file, onClose, onSaved }) {
  const { activeId, toast, confirm } = useApp();
  const [state, setState] = useState({ loading: true });
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [version, setVersion] = useState(null);
  const [saving, setSaving] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [conflict, setConflict] = useState(false);
  const dirty = content !== original;

  const load = useCallback(async () => {
    setState({ loading: true }); setConflict(false);
    try {
      const r = await api(activeId, 'GET', `/api/v1/files/${file.id}/text`);
      const c = r.content ?? r.text ?? '';
      setContent(c); setOriginal(c); setVersion(r.version ?? r.base_version ?? null);
      setState({});
    } catch (e) { setState({ error: e }); }
  }, [activeId, file.id]);
  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (force = false) => {
    if (saving) return;
    setSaving(true);
    try {
      let base = version;
      if (force) { const latest = await api(activeId, 'GET', `/api/v1/files/${file.id}/text`); base = latest.version; }
      const r = await api(activeId, 'PUT', `/api/v1/files/${file.id}/text`, { body: { content, base_version: base ?? undefined } });
      setOriginal(content); setVersion(r.version ?? r.file?.version ?? (base ?? 0) + 1); setConflict(false);
      toast('Saved. Edge caches are being purged', 'success');
      onSaved?.(r.file || (r.id ? r : null));
    } catch (e) {
      if (e.code === 'conflict' || e.status === 409) setConflict(true);
      else toast(e.message, 'error');
    }
    setSaving(false);
  }, [saving, version, activeId, file.id, content, toast, onSaved]);

  const close = async () => {
    if (dirty && !(await confirm({ title: 'Discard unsaved changes?', message: `Your edits to ${file.name} have not been saved.`, danger: true, confirmText: 'Discard' }))) return;
    onClose();
  };

  useEffect(() => {
    const k = (e) => { if (e.ctrlKey && e.key === 's') { e.preventDefault(); if (dirty) save(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [dirty, save]);

  return (
    <Modal title={<span className="row gap">{file.name} {dirty && <Badge tone="amber" dot>unsaved</Badge>}</span>} subtitle={`${file.folder_path || '/'} · ${bytes(new Blob([content]).size)}${version !== null ? ` · revision v${version}` : ''}`}
      icon={FileEdit} onClose={close} width="min(1200px, 94vw)" className="editor-modal" bodyClass="editor-body"
      footer={<>
        <Button variant="ghost" icon={WrapText} onClick={() => setWrap(!wrap)}>{wrap ? 'No wrap' : 'Wrap'}</Button>
        <span className="muted small">Saving creates a new revision; the old content stays in history.</span>
        <div className="grow" />
        <Button variant="ghost" onClick={close}>Close</Button>
        <Button variant="primary" icon={Save} onClick={() => save()} loading={saving} disabled={!dirty}>Save <kbd>Ctrl S</kbd></Button>
      </>}>
      {conflict && (
        <div className="banner banner-warn">
          <AlertTriangle size={16} /><span className="grow">This file was changed by someone else since you opened it.</span>
          <Button size="sm" icon={RotateCcw} onClick={load}>Reload theirs</Button>
          <Button size="sm" variant="danger" onClick={() => save(true)}>Overwrite with mine</Button>
        </div>
      )}
      {state.loading ? <Loading /> : state.error ? <ErrorState error={state.error} onRetry={load} /> : (
        <CodeView value={content} onChange={setContent} filename={file.name} wrap={wrap} />
      )}
    </Modal>
  );
}
