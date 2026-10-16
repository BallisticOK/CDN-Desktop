import { api, cdn } from './util.js';

export async function getLink(profileId, file, format = 'url', ttl = 3600) {
  if (format === 'signed' || (format === 'auto' && file.visibility !== 'PUBLIC')) {
    const r = await api(profileId, 'POST', `/api/v1/files/${file.id}/signed-url`, { body: { expires_in: Number(ttl) || 3600 } });
    return r.url;
  }
  if (format === 'path_url' && file.path_url) return file.path_url;
  if (format === 'download_url') return file.download_url;
  return file.url;
}

export async function copyLinks(app, files, format) {
  const { activeId, settings, toast } = app;
  try {
    const links = [];
    for (const f of files) links.push(await getLink(activeId, f, format || settings.linkFormat, settings.signedTtl));
    await cdn.clipboard.write(links.join('\n'));
    toast(files.length > 1 ? `Copied ${files.length} links` : 'Link copied', 'success', { detail: files.length === 1 ? links[0] : undefined });
  } catch (e) { toast(e.message, 'error'); }
}

export async function openInBrowser(app, file) {
  try {
    const link = await getLink(app.activeId, file, file.visibility === 'PUBLIC' ? 'url' : 'signed', 600);
    cdn.shell.open(link);
  } catch (e) { app.toast(e.message, 'error'); }
}

export async function downloadFiles(app, files) {
  const { activeId, toast } = app;
  if (!files.length) return;
  try {
    if (files.length === 1) {
      const f = files[0];
      const r = await cdn.transfers.download({ profileId: activeId, fileId: f.id, name: f.name, size: f.size });
      if (r?.path) toast(`Downloaded ${f.name}`, 'success', { action: { label: 'Show', onClick: () => cdn.shell.showItem(r.path) } });
    } else {
      const r = await cdn.transfers.downloadMany({ profileId: activeId, files: files.map((f) => ({ id: f.id, name: f.name, size: f.size })) });
      if (!r.cancelled) toast(`Downloaded ${r.ok} file${r.ok === 1 ? '' : 's'}${r.failed ? `, ${r.failed} failed` : ''}`, r.failed ? 'warn' : 'success', { action: { label: 'Open folder', onClick: () => cdn.shell.openPath(r.dir) } });
    }
  } catch (e) { toast(e.message, 'error'); }
}

export async function deleteFiles(app, files, { permanent = false, onDone } = {}) {
  const { activeId, toast, confirm, settings } = app;
  if (!files.length) return false;
  if (settings.confirmDeletes || permanent) {
    const ok = await confirm({
      title: permanent ? 'Delete permanently?' : `Move ${files.length > 1 ? `${files.length} files` : `“${files[0].name}”`} to the recycle bin?`,
      message: permanent ? 'This cannot be undone. Files are removed from storage and caches.' : 'You can restore them from the recycle bin until the retention period expires.',
      danger: true, confirmText: permanent ? 'Delete forever' : 'Delete',
    });
    if (!ok) return false;
  }
  try {
    if (files.length === 1) await api(activeId, 'DELETE', `/api/v1/files/${files[0].id}`, { query: permanent ? { permanent: 'true' } : undefined });
    else await api(activeId, 'POST', '/api/v1/files/bulk-delete', { body: { ids: files.map((f) => f.id), permanent } });
    onDone?.();
    toast(`Deleted ${files.length} file${files.length > 1 ? 's' : ''}`, 'success', permanent ? {} : {
      duration: 6000,
      action: {
        label: 'Undo', onClick: async () => {
          await Promise.allSettled(files.map((f) => api(activeId, 'POST', `/api/v1/files/${f.id}/restore`, { body: {} })));
          toast('Restored', 'success'); onDone?.();
        },
      },
    });
    return true;
  } catch (e) { toast(e.message, 'error'); return false; }
}

export async function purgeFiles(app, files) {
  try {
    await api(app.activeId, 'POST', '/api/v1/cache/purge', { body: { type: 'file', targets: files.map((f) => f.id) } });
    app.toast('Cache purge queued', 'success');
  } catch (e) { app.toast(e.message, 'error'); }
}
