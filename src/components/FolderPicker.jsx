import React, { useMemo, useState } from 'react';
import { FolderInput, Folder, Home, Search, ChevronRight } from 'lucide-react';
import { useApi } from '../lib/store.jsx';
import { api, listOf, classNames } from '../lib/util.js';
import { Modal, Button, Loading, ErrorState } from './ui.jsx';

export default function FolderPicker({ title = 'Choose folder', onPick, onClose, exclude = [], initial = null }) {
  const { data, error, loading } = useApi((pid) => api(pid, 'GET', '/api/v1/folders', { query: { all: 'true', limit: 500 } }));
  const [sel, setSel] = useState(initial);
  const [q, setQ] = useState('');
  const folders = listOf(data);
  // Hide excluded folders and their descendants
  const excludedPaths = folders.filter((f) => exclude.includes(f.id)).map((f) => f.path + '/');
  const visible = useMemo(() => folders
    .filter((f) => !exclude.includes(f.id) && !excludedPaths.some((p) => (f.path + '/').startsWith(p)))
    .filter((f) => !q || f.path.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.path.localeCompare(b.path)), [folders, q]); // eslint-disable-line

  return (
    <Modal title={title} icon={FolderInput} onClose={onClose} width={520}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => onPick(sel)}>Move here</Button></>}>
      <div className="search full"><Search size={15} /><input autoFocus placeholder="Filter folders…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="folder-list">
        <button className={classNames('folder-opt', sel === null && 'active')} onClick={() => setSel(null)} onDoubleClick={() => onPick(null)}><Home size={16} /><span>Root</span></button>
        {loading ? <Loading /> : error ? <ErrorState error={error} compact /> : visible.map((f) => {
          const depth = (f.path.match(/\//g) || []).length - 1;
          return (
            <button key={f.id} className={classNames('folder-opt', sel === f.id && 'active')} style={{ paddingLeft: 14 + depth * 18 }} onClick={() => setSel(f.id)} onDoubleClick={() => onPick(f.id)}>
              {depth > 0 && <ChevronRight size={12} className="muted" />}<Folder size={16} /><span>{f.name}</span><small className="muted grow right">{f.path}</small>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
