import React, { useState } from 'react';
import { FileText, FileImage, FileVideo, FileAudio, FileArchive, File, FileCode, FileType2, Folder } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { fileKind, fileInlineUrl } from '../lib/util.js';

const KIND = {
  image: { icon: FileImage, color: '#34d399' },
  video: { icon: FileVideo, color: '#f472b6' },
  audio: { icon: FileAudio, color: '#fbbf24' },
  pdf: { icon: FileType2, color: '#f87171' },
  archive: { icon: FileArchive, color: '#a78bfa' },
  text: { icon: FileCode, color: '#60a5fa' },
  other: { icon: File, color: '#94a3b8' },
};
const THUMB_LIMIT = 12 * 1024 * 1024;

export default function FileIcon({ file, size = 40, thumb = false, folder = false, cover = false }) {
  const { activeId } = useApp();
  const [failed, setFailed] = useState(false);
  if (folder) return <span className="file-icon folder" style={{ width: size, height: size }}><Folder size={size * 0.55} /></span>;
  const kind = fileKind(file);
  const { icon: I, color } = KIND[kind] || KIND.other;
  if (thumb && kind === 'image' && !failed && (file.size ?? 0) <= THUMB_LIMIT) {
    return (
      <span className={cover ? 'file-thumb cover' : 'file-thumb'} style={cover ? undefined : { width: size, height: size }}>
        <img src={fileInlineUrl(activeId, file)} loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} alt="" />
      </span>
    );
  }
  const ext = (file.extension || file.name?.split('.').pop() || '').slice(0, 4).toUpperCase();
  return (
    <span className={cover ? 'file-icon cover' : 'file-icon'} style={{ ...(cover ? {} : { width: size, height: size }), '--fc': color }}>
      <I size={cover ? 42 : size * 0.5} />
      {cover && ext && <span className="file-ext">{ext}</span>}
    </span>
  );
}
