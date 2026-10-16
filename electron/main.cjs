// CDN Desktop — Electron main process.
// All network traffic to CDN servers goes through here so API keys never reach the renderer
// and requests are not subject to browser CORS rules.
const {
  app, BrowserWindow, ipcMain, dialog, shell, clipboard, safeStorage, protocol, net,
  Tray, Menu, nativeImage, globalShortcut, Notification, nativeTheme,
} = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const CONFIG_PATH = () => path.join(app.getPath('userData'), 'config.json');
const SMALL_UPLOAD_LIMIT = 48 * 1024 * 1024; // above this, use the chunked upload API
const CHUNK_PARALLEL = 3;

protocol.registerSchemesAsPrivileged([
  { scheme: 'cdnx', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true } },
]);

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null;
let tray = null;
let quitting = false;

// ---------------------------------------------------------------------------
// Config store
// ---------------------------------------------------------------------------
const DEFAULT_SETTINGS = {
  theme: 'dark',              // dark | light | system
  accent: '#7c5cff',
  linkFormat: 'url',          // url | path_url | signed
  signedTtl: 3600,
  askWhereToSave: false,
  downloadDir: '',
  minimizeToTray: true,
  quickUploadHotkey: 'CommandOrControl+Alt+U',
  quickUploadEnabled: true,
  notifications: true,
  confirmDeletes: true,
  defaultView: 'grid',
  pageSize: 60,
};

let config = { profiles: [], activeId: null, settings: { ...DEFAULT_SETTINGS } };

function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH(), 'utf8'));
    config = { profiles: raw.profiles || [], activeId: raw.activeId || null, settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) } };
  } catch { /* first run */ }
}
function saveConfig() {
  fs.mkdirSync(path.dirname(CONFIG_PATH()), { recursive: true });
  const tmp = CONFIG_PATH() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2));
  fs.renameSync(tmp, CONFIG_PATH());
}

function encryptKey(key) {
  if (!key) return '';
  if (safeStorage.isEncryptionAvailable()) return 'enc:' + safeStorage.encryptString(key).toString('base64');
  return 'plain:' + Buffer.from(key).toString('base64');
}
function decryptKey(stored) {
  if (!stored) return '';
  try {
    if (stored.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'));
    if (stored.startsWith('plain:')) return Buffer.from(stored.slice(6), 'base64').toString();
  } catch { /* key unreadable (e.g. config copied from another user) */ }
  return '';
}
function maskKey(key) {
  if (!key) return '';
  const m = key.match(/^(cdn_(?:live|test)_[a-z0-9]{4})/i);
  return (m ? m[1] : key.slice(0, 6)) + '••••••••' + key.slice(-4);
}
function publicProfile(p) {
  const key = decryptKey(p.key);
  const { key: _k, ...rest } = p;
  return { ...rest, hasKey: !!key, keyPreview: maskKey(key) };
}
function getProfile(id) {
  const p = config.profiles.find((x) => x.id === (id || config.activeId));
  if (!p) throw new Error('No server selected. Add one in Settings → Servers.');
  return { ...p, apiKey: decryptKey(p.key), baseUrl: normalizeBase(p.baseUrl) };
}
function normalizeBase(u) {
  u = String(u || '').trim();
  if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u.replace(/\/+$/, '');
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function buildUrl(base, p, query) {
  const url = new URL(base + (p.startsWith('/') ? p : '/' + p));
  if (query) for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
    else url.searchParams.set(k, String(v));
  }
  return url.toString();
}
function authHeaders(profile, extra = {}) {
  const h = { 'User-Agent': `CDN-Desktop/${app.getVersion()}`, ...extra };
  if (profile.apiKey) h.Authorization = `Bearer ${profile.apiKey}`;
  return h;
}
function pickHeaders(res) {
  const out = {};
  for (const k of ['x-request-id', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'retry-after', 'content-type', 'content-length']) {
    const v = res.headers.get(k); if (v) out[k] = v;
  }
  return out;
}

async function apiRequest({ profileId, method = 'GET', path: p, query, body, baseUrl, apiKey, timeoutMs = 60000 }) {
  const profile = baseUrl ? { baseUrl: normalizeBase(baseUrl), apiKey } : getProfile(profileId);
  const url = buildUrl(profile.baseUrl, p, query);
  const headers = authHeaders(profile, { Accept: 'application/json' });
  let payload;
  if (body !== undefined && body !== null && method !== 'GET') { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const started = Date.now();
  try {
    const res = await fetch(url, { method, headers, body: payload, signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    const out = { ok: res.ok, status: res.status, data, headers: pickHeaders(res), ms: Date.now() - started, url };
    if (!res.ok) out.error = (data && data.error) || { code: `http_${res.status}`, message: res.statusText || 'Request failed' };
    return out;
  } catch (e) {
    return { ok: false, status: 0, data: null, headers: {}, ms: Date.now() - started, url, error: { code: 'network_error', message: e.cause?.message || e.message } };
  }
}

// Streaming request with upload progress. `parts` is an array of Buffers / strings / {path,start,end}.
function streamRequest({ url, method = 'POST', headers = {}, parts = [], onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'http:' ? http : https;
    const sizes = parts.map((pt) => (Buffer.isBuffer(pt) ? pt.length : typeof pt === 'string' ? Buffer.byteLength(pt) : pt.end - pt.start + 1));
    const total = sizes.reduce((a, b) => a + b, 0);
    const req = lib.request(u, { method, headers: { ...headers, 'Content-Length': total } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
        resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, data, headers: res.headers });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    if (signal) {
      if (signal.aborted) { req.destroy(new Error('Cancelled')); return; }
      signal.addEventListener('abort', () => req.destroy(new Error('Cancelled')), { once: true });
    }
    let sent = 0;
    const tick = (n) => { sent += n; onProgress && onProgress(sent, total); };
    (async () => {
      try {
        for (const pt of parts) {
          if (Buffer.isBuffer(pt) || typeof pt === 'string') {
            const b = Buffer.isBuffer(pt) ? pt : Buffer.from(pt);
            if (!req.write(b)) await new Promise((r) => req.once('drain', r));
            tick(b.length);
          } else {
            const rs = fs.createReadStream(pt.path, { start: pt.start, end: pt.end, highWaterMark: 256 * 1024 });
            for await (const c of rs) {
              if (!req.write(c)) await new Promise((r) => req.once('drain', r));
              tick(c.length);
            }
          }
        }
        req.end();
      } catch (e) { req.destroy(e); }
    })();
  });
}

function apiErr(res, fallback) {
  const e = res.data && res.data.error;
  return new Error(e ? `${e.message}${e.code ? ` (${e.code})` : ''}` : `${fallback} (HTTP ${res.status})`);
}

// ---------------------------------------------------------------------------
// Transfers (uploads & downloads) with progress events
// ---------------------------------------------------------------------------
const transfers = new Map(); // id -> { controller, state }

function emitTransfer(state) {
  if (win && !win.isDestroyed()) win.webContents.send('transfer:event', state);
}
function newTransfer(base) {
  const id = crypto.randomBytes(8).toString('hex');
  const controller = new AbortController();
  const state = { id, status: 'queued', loaded: 0, size: 0, speed: 0, startedAt: Date.now(), ...base };
  transfers.set(id, { controller, state });
  emitTransfer(state);
  return { id, controller, state };
}
function updateTransfer(id, patch) {
  const t = transfers.get(id); if (!t) return;
  Object.assign(t.state, patch);
  emitTransfer({ ...t.state });
}
function makeThrottle(id) {
  let last = 0; let lastLoaded = 0; let lastT = Date.now();
  return (loaded, size) => {
    const now = Date.now();
    if (now - last < 120 && loaded < size) return;
    const dt = (now - lastT) / 1000;
    const speed = dt > 0 ? (loaded - lastLoaded) / dt : 0;
    last = now; lastT = now; lastLoaded = loaded;
    updateTransfer(id, { loaded, size, speed, status: 'running' });
  };
}

async function multipartUpload(profile, { filePath, buffer, name, folderId, visibility, fields = {}, endpoint = '/api/v1/files' }, onProgress, signal) {
  const boundary = '----cdndesktop' + crypto.randomBytes(12).toString('hex');
  const parts = [];
  const field = (k, v) => `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
  if (folderId) parts.push(field('folder_id', folderId));
  if (visibility) parts.push(field('visibility', visibility));
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== '' && v !== null) parts.push(field(k, v));
  const safeName = String(name).replace(/["\r\n]/g, '_');
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeName}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
  if (buffer) parts.push(buffer);
  else { const st = await fsp.stat(filePath); if (st.size > 0) parts.push({ path: filePath, start: 0, end: st.size - 1 }); }
  parts.push(`\r\n--${boundary}--\r\n`);
  const res = await streamRequest({
    url: buildUrl(profile.baseUrl, endpoint), method: 'POST',
    headers: authHeaders(profile, { 'Content-Type': `multipart/form-data; boundary=${boundary}`, Accept: 'application/json' }),
    parts, onProgress, signal,
  });
  if (!res.ok) throw apiErr(res, 'Upload failed');
  return res.data;
}

async function chunkedUpload(profile, { filePath, name, size, folderId, visibility }, onProgress, signal) {
  const init = await apiRequest({ profileId: profile.id, method: 'POST', path: '/api/v1/uploads/init', body: { filename: name, size, folder_id: folderId || undefined, visibility: visibility || undefined } });
  if (!init.ok) throw apiErr(init, 'Could not start upload');
  const up = init.data;
  const chunkSize = up.chunk_size; const totalChunks = up.total_chunks || Math.ceil(size / chunkSize);
  const done = new Set(up.received_chunks || []);
  const inflight = new Map();
  let doneBytes = [...done].reduce((a, i) => a + Math.min(chunkSize, size - i * chunkSize), 0);
  const report = () => onProgress(doneBytes + [...inflight.values()].reduce((a, b) => a + b, 0), size);
  const queue = []; for (let i = 0; i < totalChunks; i++) if (!done.has(i)) queue.push(i);
  const worker = async () => {
    while (queue.length) {
      if (signal.aborted) throw new Error('Cancelled');
      const index = queue.shift();
      const start = index * chunkSize; const end = Math.min(size, start + chunkSize) - 1;
      for (let attempt = 1; ; attempt++) {
        try {
          inflight.set(index, 0);
          const res = await streamRequest({
            url: buildUrl(profile.baseUrl, `/api/v1/uploads/${up.id}/chunk`, { index }), method: 'POST',
            headers: authHeaders(profile, { 'Content-Type': 'application/octet-stream', Accept: 'application/json' }),
            parts: [{ path: filePath, start, end }], signal,
            onProgress: (s) => { inflight.set(index, s); report(); },
          });
          if (!res.ok) throw apiErr(res, `Chunk ${index} failed`);
          inflight.delete(index); doneBytes += end - start + 1; report();
          break;
        } catch (e) {
          inflight.delete(index);
          if (signal.aborted || attempt >= 4) throw e;
          await new Promise((r) => setTimeout(r, 800 * attempt));
        }
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(CHUNK_PARALLEL, queue.length || 1) }, worker));
  } catch (e) {
    if (signal.aborted) apiRequest({ profileId: profile.id, method: 'DELETE', path: `/api/v1/uploads/${up.id}` });
    throw e;
  }
  const fin = await apiRequest({ profileId: profile.id, method: 'POST', path: `/api/v1/uploads/${up.id}/complete`, timeoutMs: 600000 });
  if (!fin.ok) throw apiErr(fin, 'Could not finish upload');
  return fin.data;
}

async function runUpload(profileId, item) {
  const profile = getProfile(profileId);
  const size = item.buffer ? item.buffer.length : (await fsp.stat(item.filePath)).size;
  const { id, controller } = newTransfer({ kind: 'upload', name: item.name, size, profileId: profile.id, profileName: profile.name, folderPath: item.folderPath || '/' });
  const throttle = makeThrottle(id);
  // Multipart bodies include form headers, so scale reported bytes back to the file size.
  const onProgress = (sent, total) => throttle(total ? Math.min(size, Math.round((sent / total) * size)) : sent, size);
  updateTransfer(id, { status: 'running' });
  try {
    const file = (item.buffer || size <= SMALL_UPLOAD_LIMIT)
      ? await multipartUpload(profile, { ...item }, onProgress, controller.signal)
      : await chunkedUpload(profile, { ...item, size }, onProgress, controller.signal);
    updateTransfer(id, { status: 'done', loaded: size, file, finishedAt: Date.now() });
    return file;
  } catch (e) {
    updateTransfer(id, { status: controller.signal.aborted ? 'cancelled' : 'error', error: e.message, finishedAt: Date.now() });
    throw e;
  } finally {
    transfers.get(id) && (transfers.get(id).controller = null);
  }
}

// Simple concurrency limiter for upload batches.
function limit(n) {
  let active = 0; const q = [];
  const next = () => { if (active >= n || !q.length) return; active++; const { fn, res, rej } = q.shift(); fn().then(res, rej).finally(() => { active--; next(); }); };
  return (fn) => new Promise((res, rej) => { q.push({ fn, res, rej }); next(); });
}
const uploadLimit = limit(3);

async function walkDir(root) {
  const out = [];
  async function rec(dir, rel) {
    for (const ent of await fsp.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name); const r = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) { out.push({ type: 'dir', rel: r }); await rec(full, r); }
      else if (ent.isFile()) out.push({ type: 'file', rel: r, full });
    }
  }
  await rec(root, '');
  return out;
}

async function ensureFolder(profileId, parentId, name, cache) {
  const key = `${parentId || 'root'}/${name}`;
  if (cache.has(key)) return cache.get(key);
  const list = await apiRequest({ profileId, path: '/api/v1/folders', query: { parent_id: parentId || undefined, q: name, limit: 100 } });
  let found = list.ok && (list.data?.data || []).find((f) => f.name === name && (f.parent_id || null) === (parentId || null));
  if (!found) {
    const res = await apiRequest({ profileId, method: 'POST', path: '/api/v1/folders', body: { name, parent_id: parentId || undefined } });
    if (!res.ok) throw apiErr(res, `Could not create folder ${name}`);
    found = res.data?.folder || res.data;
  }
  cache.set(key, found.id);
  return found.id;
}

async function uploadPaths(profileId, paths, folderId, visibility) {
  const tasks = [];
  const cache = new Map();
  for (const p of paths) {
    const st = await fsp.stat(p);
    if (st.isDirectory()) {
      const rootId = await ensureFolder(profileId, folderId, path.basename(p), cache);
      const entries = await walkDir(p);
      const dirIds = new Map([['', rootId]]);
      for (const e of entries.filter((x) => x.type === 'dir')) {
        const parentRel = e.rel.includes('/') ? e.rel.slice(0, e.rel.lastIndexOf('/')) : '';
        dirIds.set(e.rel, await ensureFolder(profileId, dirIds.get(parentRel), e.rel.split('/').pop(), cache));
      }
      for (const e of entries.filter((x) => x.type === 'file')) {
        const parentRel = e.rel.includes('/') ? e.rel.slice(0, e.rel.lastIndexOf('/')) : '';
        tasks.push({ filePath: e.full, name: path.basename(e.full), folderId: dirIds.get(parentRel), visibility, folderPath: `${path.basename(p)}/${parentRel}` });
      }
    } else if (st.isFile()) {
      tasks.push({ filePath: p, name: path.basename(p), folderId, visibility });
    }
  }
  const results = await Promise.allSettled(tasks.map((t) => uploadLimit(() => runUpload(profileId, t))));
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  return { total: tasks.length, ok, failed: tasks.length - ok, files: results.filter((r) => r.status === 'fulfilled').map((r) => r.value) };
}

async function runDownload(profileId, { fileId, name, size, savePath }) {
  const profile = getProfile(profileId);
  let target = savePath;
  if (!target) {
    const dir = config.settings.downloadDir || app.getPath('downloads');
    if (config.settings.askWhereToSave) {
      const r = await dialog.showSaveDialog(win, { defaultPath: path.join(dir, name) });
      if (r.canceled) return { cancelled: true };
      target = r.filePath;
    } else target = await uniquePath(path.join(dir, name));
  }
  const { id, controller } = newTransfer({ kind: 'download', name: path.basename(target), size: size || 0, profileId: profile.id, profileName: profile.name, savePath: target });
  const onProgress = makeThrottle(id);
  try {
    const res = await fetch(buildUrl(profile.baseUrl, `/api/v1/files/${fileId}/download`, { disposition: 'attachment' }), { headers: authHeaders(profile), signal: controller.signal });
    if (!res.ok) { let d = null; try { d = await res.json(); } catch {} throw apiErr({ status: res.status, data: d }, 'Download failed'); }
    const total = Number(res.headers.get('content-length')) || size || 0;
    let loaded = 0;
    const tmp = target + '.part';
    const counter = new (require('stream').Transform)({ transform(c, _e, cb) { loaded += c.length; onProgress(loaded, total || loaded); cb(null, c); } });
    await pipeline(Readable.fromWeb(res.body), counter, fs.createWriteStream(tmp));
    await fsp.rename(tmp, target);
    updateTransfer(id, { status: 'done', loaded, size: total || loaded, finishedAt: Date.now() });
    return { path: target };
  } catch (e) {
    fsp.unlink(target + '.part').catch(() => {});
    updateTransfer(id, { status: controller.signal.aborted ? 'cancelled' : 'error', error: e.message, finishedAt: Date.now() });
    throw e;
  }
}
async function uniquePath(p) {
  const { dir, name, ext } = path.parse(p);
  let candidate = p; let i = 1;
  while (true) { try { await fsp.access(candidate); candidate = path.join(dir, `${name} (${i++})${ext}`); } catch { return candidate; } }
}

// ---------------------------------------------------------------------------
// Quick upload (global hotkey / tray): uploads clipboard image or copied files
// ---------------------------------------------------------------------------
function notify(title, body) {
  if (!config.settings.notifications || !Notification.isSupported()) return;
  new Notification({ title, body, silent: false }).show();
}
async function linkFor(profileId, file) {
  const fmt = config.settings.linkFormat;
  if (fmt === 'signed') {
    const r = await apiRequest({ profileId, method: 'POST', path: `/api/v1/files/${file.id}/signed-url`, body: { expires_in: config.settings.signedTtl } });
    if (r.ok && r.data?.url) return r.data.url;
  }
  if (fmt === 'path_url' && file.path_url) return file.path_url;
  return file.url;
}
function clipboardFilePaths() {
  // Windows Explorer puts copied files in CF_HDROP; Electron exposes FileNameW for single files.
  try {
    const buf = clipboard.readBuffer('FileNameW');
    if (buf && buf.length) { const p = buf.toString('ucs2').replace(/\0+$/, ''); if (p) return [p]; }
  } catch {}
  return [];
}
async function quickUpload() {
  if (!config.activeId) { notify('CDN Desktop', 'Add a server first.'); return; }
  const profile = getProfile();
  try {
    let file;
    const img = clipboard.readImage();
    const paths = clipboardFilePaths();
    if (paths.length) file = await runUpload(profile.id, { filePath: paths[0], name: path.basename(paths[0]) });
    else if (!img.isEmpty()) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      file = await runUpload(profile.id, { buffer: img.toPNG(), name: `screenshot-${ts}.png` });
    } else {
      notify('Nothing to upload', 'Copy an image or a file first, then press the hotkey.'); return;
    }
    const link = await linkFor(profile.id, file);
    clipboard.writeText(link);
    notify(`Uploaded to ${profile.name}`, `${file.name} — link copied to clipboard`);
    if (win) win.webContents.send('files:changed');
  } catch (e) {
    notify('Quick upload failed', e.message);
  }
}
function registerHotkey() {
  globalShortcut.unregisterAll();
  const s = config.settings;
  if (s.quickUploadEnabled && s.quickUploadHotkey) {
    try { return globalShortcut.register(s.quickUploadHotkey, quickUpload); } catch { return false; }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Window & tray
// ---------------------------------------------------------------------------
function themeColors() {
  const dark = config.settings.theme === 'dark' || (config.settings.theme === 'system' && nativeTheme.shouldUseDarkColors);
  return dark ? { color: '#0c0d12', symbolColor: '#c9cbd6' } : { color: '#f4f5f9', symbolColor: '#2a2c36' };
}
function appIcon() {
  const p = path.join(__dirname, 'icon.png');
  return fs.existsSync(p) ? nativeImage.createFromPath(p) : nativeImage.createEmpty();
}
function createWindow() {
  const tc = themeColors();
  win = new BrowserWindow({
    width: 1380, height: 880, minWidth: 980, minHeight: 640,
    backgroundColor: tc.color, show: false, icon: appIcon(),
    titleBarStyle: 'hidden', titleBarOverlay: { ...tc, height: 40 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.once('ready-to-show', () => win.show());
  win.on('close', (e) => {
    if (!quitting && config.settings.minimizeToTray && tray) { e.preventDefault(); win.hide(); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(process.env.VITE_DEV_SERVER_URL || 'file:')) { e.preventDefault(); shell.openExternal(url); } });
  if (isDev) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}
function createTray() {
  let icon = appIcon();
  if (icon.isEmpty()) return;
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('CDN Desktop');
  const rebuild = () => tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open CDN Desktop', click: () => { win.show(); win.focus(); } },
    { label: 'Quick upload clipboard', click: quickUpload },
    { type: 'separator' },
    { label: 'Active server', submenu: config.profiles.map((p) => ({ label: p.name, type: 'radio', checked: p.id === config.activeId, click: () => { config.activeId = p.id; saveConfig(); win.webContents.send('profiles:changed'); rebuild(); } })) },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
  rebuild();
  tray.on('double-click', () => { win.show(); win.focus(); });
  ipcMain.on('tray:rebuild', rebuild);
}
function rebuildTray() { ipcMain.emit('tray:rebuild'); }

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try { return { ok: true, value: await fn(...args) }; }
    catch (e) { return { ok: false, error: e.message || String(e) }; }
  });
}

function registerIpc() {
  handle('profiles:list', () => ({ profiles: config.profiles.map(publicProfile), activeId: config.activeId }));
  handle('profiles:save', (p) => {
    const baseUrl = normalizeBase(p.baseUrl);
    if (!baseUrl) throw new Error('Server URL is required');
    let existing = p.id && config.profiles.find((x) => x.id === p.id);
    if (!existing) {
      existing = { id: crypto.randomBytes(6).toString('hex'), createdAt: Date.now() };
      config.profiles.push(existing);
    }
    Object.assign(existing, {
      name: p.name || new URL(baseUrl).hostname, baseUrl, color: p.color || '#7c5cff',
      defaultVisibility: p.defaultVisibility || '', defaultFolderId: p.defaultFolderId || '', notes: p.notes || '',
    });
    if (p.apiKey !== undefined && p.apiKey !== null && p.apiKey !== '') existing.key = encryptKey(p.apiKey.trim());
    if (p.clearKey) existing.key = '';
    if (!config.activeId) config.activeId = existing.id;
    saveConfig(); rebuildTray();
    return publicProfile(existing);
  });
  handle('profiles:delete', (id) => {
    config.profiles = config.profiles.filter((x) => x.id !== id);
    if (config.activeId === id) config.activeId = config.profiles[0]?.id || null;
    saveConfig(); rebuildTray();
    return true;
  });
  handle('profiles:reorder', (ids) => {
    config.profiles.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    saveConfig(); rebuildTray(); return true;
  });
  handle('profiles:setActive', (id) => { config.activeId = id; saveConfig(); rebuildTray(); return true; });
  handle('profiles:test', async ({ id, baseUrl, apiKey }) => {
    let key = apiKey;
    if (!key && id) key = decryptKey(config.profiles.find((x) => x.id === id)?.key);
    const health = await apiRequest({ baseUrl, apiKey: key, path: '/health', timeoutMs: 10000 });
    const me = await apiRequest({ baseUrl, apiKey: key, path: '/api/v1/me', timeoutMs: 10000 });
    return { health, me };
  });

  handle('settings:get', () => config.settings);
  handle('settings:set', (patch) => {
    config.settings = { ...config.settings, ...patch };
    saveConfig();
    if ('theme' in patch && win) { try { win.setTitleBarOverlay(themeColors()); win.setBackgroundColor(themeColors().color); } catch {} }
    let hotkeyOk = true;
    if ('quickUploadHotkey' in patch || 'quickUploadEnabled' in patch) hotkeyOk = registerHotkey();
    return { settings: config.settings, hotkeyOk };
  });

  handle('api:request', (req) => apiRequest(req));
  const specCache = new Map();
  handle('api:openapi', async (profileId, force) => {
    const profile = getProfile(profileId);
    if (!force && specCache.has(profile.baseUrl)) return specCache.get(profile.baseUrl);
    let res = await apiRequest({ profileId, path: '/openapi.json', timeoutMs: 30000 });
    // The spec is public; retry without credentials if the stored key is rejected.
    if (!res.ok && (res.status === 401 || res.status === 403)) res = await apiRequest({ baseUrl: profile.baseUrl, path: '/openapi.json', timeoutMs: 30000 });
    if (!res.ok) throw new Error(res.error?.message || 'Could not load openapi.json');
    specCache.set(profile.baseUrl, res.data);
    return res.data;
  });

  handle('transfer:uploadPaths', ({ profileId, paths, folderId, visibility }) => uploadPaths(profileId, paths, folderId, visibility));
  handle('transfer:uploadBuffer', ({ profileId, name, data, folderId, visibility }) => runUpload(profileId, { buffer: Buffer.from(data), name, folderId, visibility }));
  handle('transfer:newVersion', async ({ profileId, fileId, filePath, keepName }) => {
    const profile = getProfile(profileId);
    const st = await fsp.stat(filePath);
    const { id, controller } = newTransfer({ kind: 'upload', name: `${path.basename(filePath)} (new revision)`, size: st.size, profileId: profile.id, profileName: profile.name });
    try {
      const r = await multipartUpload(profile, { filePath, name: path.basename(filePath), endpoint: `/api/v1/files/${fileId}/versions`, fields: { keep_name: keepName ? 'true' : 'false' } }, makeThrottle(id), controller.signal);
      updateTransfer(id, { status: 'done', loaded: st.size, finishedAt: Date.now() });
      return r;
    } catch (e) { updateTransfer(id, { status: 'error', error: e.message }); throw e; }
  });
  handle('transfer:download', ({ profileId, ...rest }) => runDownload(profileId, rest));
  handle('transfer:downloadMany', async ({ profileId, files }) => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], title: 'Download to folder' });
    if (r.canceled) return { cancelled: true };
    const dir = r.filePaths[0];
    const lim = limit(3);
    const res = await Promise.allSettled(files.map((f) => lim(async () => runDownload(profileId, { fileId: f.id, name: f.name, size: f.size, savePath: await uniquePath(path.join(dir, f.name)) }))));
    return { ok: res.filter((x) => x.status === 'fulfilled').length, failed: res.filter((x) => x.status === 'rejected').length, dir };
  });
  handle('transfer:cancel', (id) => { const t = transfers.get(id); t?.controller?.abort(); return true; });
  handle('transfer:list', () => [...transfers.values()].map((t) => t.state));
  handle('transfer:clear', () => { for (const [id, t] of transfers) if (t.state.status !== 'running' && t.state.status !== 'queued') transfers.delete(id); return true; });

  handle('dialog:openFiles', async (opts = {}) => {
    const r = await dialog.showOpenDialog(win, { properties: [opts.folders ? 'openDirectory' : 'openFile', 'multiSelections'], title: opts.title });
    return r.canceled ? [] : r.filePaths;
  });
  handle('dialog:pickDir', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? '' : r.filePaths[0];
  });
  handle('fs:isDir', async (p) => (await fsp.stat(p)).isDirectory());
  handle('shell:open', (url) => { if (/^https?:/i.test(url)) return shell.openExternal(url); return false; });
  handle('shell:showItem', (p) => shell.showItemInFolder(p));
  handle('shell:openPath', (p) => shell.openPath(p));
  handle('clipboard:write', (text) => { clipboard.writeText(String(text)); return true; });
  handle('clipboard:image', () => { const img = clipboard.readImage(); return img.isEmpty() ? null : img.toPNG(); });
  handle('quick:upload', quickUpload);
  handle('app:info', () => ({ version: app.getVersion(), electron: process.versions.electron, userData: app.getPath('userData'), encryption: safeStorage.isEncryptionAvailable(), platform: process.platform }));
  handle('app:exportProfiles', async (includeKeys) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: 'cdn-desktop-servers.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (r.canceled) return false;
    const data = config.profiles.map((p) => ({ name: p.name, baseUrl: p.baseUrl, color: p.color, defaultVisibility: p.defaultVisibility, notes: p.notes, ...(includeKeys ? { apiKey: decryptKey(p.key) } : {}) }));
    await fsp.writeFile(r.filePath, JSON.stringify({ app: 'cdn-desktop', version: 1, servers: data }, null, 2));
    return r.filePath;
  });
  handle('app:importProfiles', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (r.canceled) return 0;
    const data = JSON.parse(await fsp.readFile(r.filePaths[0], 'utf8'));
    let n = 0;
    for (const s of data.servers || []) {
      if (!s.baseUrl) continue;
      config.profiles.push({ id: crypto.randomBytes(6).toString('hex'), createdAt: Date.now(), name: s.name || s.baseUrl, baseUrl: normalizeBase(s.baseUrl), color: s.color || '#7c5cff', defaultVisibility: s.defaultVisibility || '', notes: s.notes || '', key: s.apiKey ? encryptKey(s.apiKey) : '' });
      n++;
    }
    if (!config.activeId && config.profiles[0]) config.activeId = config.profiles[0].id;
    saveConfig(); rebuildTray();
    return n;
  });
}

// Authenticated proxy for previews: cdnx://<profileId>/<path>?<query>
function registerProtocol() {
  protocol.handle('cdnx', async (request) => {
    try {
      const u = new URL(request.url);
      const profile = getProfile(u.hostname);
      const target = profile.baseUrl + u.pathname + u.search;
      const headers = authHeaders(profile);
      const range = request.headers.get('range'); if (range) headers.Range = range;
      return await net.fetch(target, { headers, bypassCustomProtocolHandlers: true });
    } catch (e) {
      return new Response(String(e.message), { status: 502 });
    }
  });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.whenReady().then(() => {
  app.setAppUserModelId('xyz.0x00sec.cdndesktop');
  loadConfig();
  registerProtocol();
  registerIpc();
  createWindow();
  createTray();
  registerHotkey();
  nativeTheme.on('updated', () => { if (config.settings.theme === 'system' && win) { try { win.setTitleBarOverlay(themeColors()); } catch {} } });
});
