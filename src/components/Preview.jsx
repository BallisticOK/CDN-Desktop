import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Download, Link2, FileEdit, Info, ExternalLink, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { api, fileKind, fileInlineUrl, bytes, isEditable } from '../lib/util.js';
import { copyLinks, downloadFiles, openInBrowser } from '../lib/actions.js';
import { Button, Loading, ErrorState } from './ui.jsx';
import CodeView from './CodeView.jsx';

export default function Preview({ files, index, onIndex, onClose, onEdit, onDetails }) {
  const app = useApp();
  const file = files[index];
  const kind = fileKind(file);
  const [zoom, setZoom] = useState(1);
  useEffect(() => setZoom(1), [index]);

  useEffect(() => {
    const k = (e) => {
      if (e.target?.closest?.('.cm-editor')) return;
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if (e.key === 'ArrowRight' && index < files.length - 1) onIndex(index + 1);
      else if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(6, z * 1.25));
      else if (e.key === '-') setZoom((z) => Math.max(0.2, z / 1.25));
      else if (e.key === '0') setZoom(1);
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [index, files.length, onIndex, onClose]);

  const src = fileInlineUrl(app.activeId, file);
  return createPortal(
    <div className="lightbox" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lb-bar">
        <div className="grow ellipsis"><b>{file.name}</b> <span className="muted">· {bytes(file.size)}{file.width ? ` · ${file.width}×${file.height}` : ''} · {index + 1} / {files.length}</span></div>
        {kind === 'image' && <>
          <Button variant="ghost" icon={ZoomOut} onClick={() => setZoom((z) => Math.max(0.2, z / 1.25))} />
          <span className="muted small" style={{ width: 44, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" icon={ZoomIn} onClick={() => setZoom((z) => Math.min(6, z * 1.25))} />
          <Button variant="ghost" icon={Maximize} onClick={() => setZoom(1)} />
        </>}
        {isEditable(file) && <Button variant="ghost" icon={FileEdit} onClick={() => onEdit(file)}>Edit</Button>}
        <Button variant="ghost" icon={Link2} onClick={() => copyLinks(app, [file])} title="Copy link" />
        <Button variant="ghost" icon={Download} onClick={() => downloadFiles(app, [file])} title="Download" />
        <Button variant="ghost" icon={ExternalLink} onClick={() => openInBrowser(app, file)} title="Open in browser" />
        <Button variant="ghost" icon={Info} onClick={() => onDetails(file)} title="Details" />
        <Button variant="ghost" icon={X} onClick={onClose} />
      </div>
      {index > 0 && <button className="lb-nav left" onClick={() => onIndex(index - 1)}><ChevronLeft size={28} /></button>}
      {index < files.length - 1 && <button className="lb-nav right" onClick={() => onIndex(index + 1)}><ChevronRight size={28} /></button>}
      <div className="lb-stage" onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        onWheel={(e) => { if (kind === 'image' && e.ctrlKey) setZoom((z) => Math.max(0.2, Math.min(6, z * (e.deltaY < 0 ? 1.1 : 0.9)))); }}>
        {kind === 'image' && <img key={file.id} src={src} style={{ transform: `scale(${zoom})` }} onDoubleClick={() => setZoom(zoom === 1 ? 2 : 1)} alt="" draggable={false} />}
        {kind === 'video' && <video key={file.id} src={src} controls autoPlay />}
        {kind === 'audio' && <div className="lb-audio"><div className="lb-audio-art">♪</div><audio key={file.id} src={src} controls autoPlay /></div>}
        {kind === 'pdf' && <iframe key={file.id} src={src} title={file.name} />}
        {kind === 'text' && <TextPreview key={file.id} file={file} />}
      </div>
    </div>,
    document.body,
  );
}

function TextPreview({ file }) {
  const { activeId } = useApp();
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        if ((file.size ?? 0) <= 2 * 1024 * 1024) {
          const r = await api(activeId, 'GET', `/api/v1/files/${file.id}/text`);
          if (alive) setState({ content: r.content ?? r.text ?? '' });
        } else {
          const res = await fetch(fileInlineUrl(activeId, file), { headers: { Range: 'bytes=0-262143' } });
          const t = await res.text();
          if (alive) setState({ content: t + '\n\n… (preview truncated)' });
        }
      } catch (e) { if (alive) setState({ error: e }); }
    };
    load();
    return () => { alive = false; };
  }, [file, activeId]);
  if (state.loading) return <Loading />;
  if (state.error) return <ErrorState error={state.error} />;
  return <div className="lb-text"><CodeView value={state.content} filename={file.name} readOnly /></div>;
}
