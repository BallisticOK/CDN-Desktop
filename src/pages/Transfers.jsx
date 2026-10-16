import React, { useMemo } from 'react';
import { ArrowDownUp, Upload, Download, X, FolderOpen, Link2, CheckCircle2, XCircle, Ban, Trash2 } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { cdn, bytes, duration, ago } from '../lib/util.js';
import { copyLinks } from '../lib/actions.js';
import { PageHeader, Button, Progress, Empty, Badge } from '../components/ui.jsx';

export default function Transfers() {
  const app = useApp();
  const { transfers, setTransfers } = app;
  const list = useMemo(() => Object.values(transfers).sort((a, b) => b.startedAt - a.startedAt), [transfers]);
  const active = list.filter((t) => t.status === 'running' || t.status === 'queued');
  const done = list.filter((t) => !(t.status === 'running' || t.status === 'queued'));
  const totalSpeed = active.reduce((a, t) => a + (t.speed || 0), 0);

  const clear = async () => {
    await cdn.transfers.clear();
    setTransfers((prev) => Object.fromEntries(Object.entries(prev).filter(([, t]) => t.status === 'running' || t.status === 'queued')));
  };

  return (
    <div className="page">
      <PageHeader icon={ArrowDownUp} title="Transfers" subtitle={active.length ? `${active.length} active · ${bytes(totalSpeed)}/s` : 'Uploads and downloads from this session'}>
        <Button icon={Trash2} onClick={clear} disabled={!done.length}>Clear finished</Button>
      </PageHeader>
      {!list.length ? (
        <Empty icon={ArrowDownUp} title="No transfers yet">Uploads and downloads appear here with live progress. Large files upload in parallel resumable chunks automatically.</Empty>
      ) : (
        <div className="transfer-list">
          {list.map((t) => <TransferRow key={t.id} t={t} app={app} />)}
        </div>
      )}
    </div>
  );
}

function TransferRow({ t, app }) {
  const running = t.status === 'running' || t.status === 'queued';
  const frac = t.size ? t.loaded / t.size : running ? 0 : 1;
  const eta = running && t.speed > 0 ? (t.size - t.loaded) / t.speed : null;
  const Icon = t.kind === 'upload' ? Upload : Download;
  const tone = t.status === 'done' ? 'green' : t.status === 'error' ? 'red' : t.status === 'cancelled' ? 'neutral' : 'accent';
  return (
    <div className={`transfer transfer-${t.status}`}>
      <div className={`transfer-ic ${t.kind}`}><Icon size={18} /></div>
      <div className="grow">
        <div className="row gap">
          <b className="ellipsis">{t.name}</b>
          <Badge tone="neutral">{t.profileName}</Badge>
          <div className="grow" />
          <span className="muted small nowrap">
            {running ? `${bytes(t.loaded)} / ${bytes(t.size)} · ${bytes(t.speed)}/s${eta !== null ? ` · ${duration(eta)} left` : ''}`
              : t.status === 'done' ? `${bytes(t.size)} · ${ago(t.finishedAt)}` : t.error || t.status}
          </span>
        </div>
        <Progress value={frac} tone={tone} />
      </div>
      <div className="transfer-actions">
        {running && <Button size="sm" variant="ghost" icon={X} onClick={() => cdn.transfers.cancel(t.id)} title="Cancel" />}
        {t.status === 'done' && t.kind === 'download' && <Button size="sm" variant="ghost" icon={FolderOpen} onClick={() => cdn.shell.showItem(t.savePath)} title="Show in folder" />}
        {t.status === 'done' && t.kind === 'upload' && t.file && <Button size="sm" variant="ghost" icon={Link2} onClick={() => copyLinks(app, [t.file])} title="Copy link" />}
        {t.status === 'done' && <CheckCircle2 size={18} className="text-green" />}
        {t.status === 'error' && <XCircle size={18} className="text-red" />}
        {t.status === 'cancelled' && <Ban size={18} className="muted" />}
      </div>
    </div>
  );
}
