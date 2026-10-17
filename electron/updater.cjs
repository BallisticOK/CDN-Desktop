// Self-updater backed by GitHub Releases.
// - Installed copy (NSIS): downloads the new Setup exe and runs it silently, then relaunches.
// - Portable copy: downloads the new portable exe and swaps it in place of the running one.
const { app, shell } = require('electron');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');

const REPO = (() => {
  try {
    const url = require('../package.json').repository?.url || '';
    const m = url.match(/github\.com[/:]([^/]+\/[^/.]+)/);
    if (m) return m[1];
  } catch {}
  return 'BallisticOK/CDN-Desktop';
})();

let state = { status: 'idle', current: app.getVersion(), latest: null, notes: '', url: '', progress: 0, error: null, installType: installType(), checkedAt: null };
let downloaded = null; // { file, asset }
let currentAsset = null;
let emit = () => {};
let controller = null;

function installType() {
  if (process.env.PORTABLE_EXECUTABLE_FILE) return 'portable';
  if (!app.isPackaged) return 'dev';
  return 'installed';
}

function set(patch) { state = { ...state, ...patch }; emit({ ...state }); }

function newer(a, b) {
  const pa = String(a).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
}

function pickAsset(release) {
  const assets = release.assets || [];
  const exe = assets.filter((a) => a.name.toLowerCase().endsWith('.exe'));
  if (state.installType === 'portable') return exe.find((a) => /portable/i.test(a.name));
  return exe.find((a) => /setup/i.test(a.name)) || exe.find((a) => !/portable/i.test(a.name));
}

async function check({ silent = false } = {}) {
  if (['downloading', 'installing'].includes(state.status)) return state;
  set({ status: 'checking', error: null });
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `CDN-Desktop/${app.getVersion()}` },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 404) throw new Error('No published releases found (is the repository public?)');
    if (!res.ok) throw new Error(`GitHub returned HTTP ${res.status}`);
    const rel = await res.json();
    const latest = rel.tag_name.replace(/^v/, '');
    const asset = pickAsset(rel);
    const available = newer(latest, state.current) && !!asset;
    set({
      status: available ? (downloaded?.asset?.id === asset.id ? 'ready' : 'available') : 'up-to-date',
      latest, notes: rel.body || '', url: rel.html_url, publishedAt: rel.published_at,
      asset: asset ? { id: asset.id, name: asset.name, size: asset.size } : null, checkedAt: Date.now(),
    });
    currentAsset = asset;
  } catch (e) {
    set({ status: silent ? 'idle' : 'error', error: e.message, checkedAt: Date.now() });
  }
  return state;
}

async function download() {
  const asset = currentAsset;
  if (!asset) throw new Error('Check for updates first.');
  if (state.installType === 'dev') throw new Error('Updates are disabled when running from source. Use git pull instead.');
  controller = new AbortController();
  set({ status: 'downloading', progress: 0, error: null });
  const dir = path.join(app.getPath('temp'), 'cdn-desktop-update');
  await fsp.mkdir(dir, { recursive: true });
  const file = path.join(dir, asset.name);
  try {
    const res = await fetch(asset.browser_download_url, { headers: { 'User-Agent': `CDN-Desktop/${app.getVersion()}` }, signal: controller.signal });
    if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);
    const total = Number(res.headers.get('content-length')) || asset.size;
    const hash = crypto.createHash('sha256');
    let loaded = 0; let last = 0;
    const meter = new Transform({
      transform(chunk, _e, cb) {
        loaded += chunk.length; hash.update(chunk);
        const now = Date.now();
        if (now - last > 150) { last = now; set({ progress: total ? loaded / total : 0 }); }
        cb(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(res.body), meter, fs.createWriteStream(file));
    const digest = 'sha256:' + hash.digest('hex');
    if (asset.digest && asset.digest !== digest) { await fsp.unlink(file).catch(() => {}); throw new Error('Downloaded file failed its checksum. Please try again.'); }
    downloaded = { file, asset };
    set({ status: 'ready', progress: 1 });
    return state;
  } catch (e) {
    set({ status: controller.signal.aborted ? 'available' : 'error', error: controller.signal.aborted ? null : e.message });
    throw e;
  } finally { controller = null; }
}

function cancel() { controller?.abort(); }

// Writes a tiny PowerShell script that waits for this process to exit, then finishes the update.
function runAfterExit(lines) {
  const script = path.join(app.getPath('temp'), `cdn-desktop-update-${Date.now()}.ps1`);
  fs.writeFileSync(script, [
    '$ErrorActionPreference = "Stop"',
    `try { Wait-Process -Id ${process.pid} -Timeout 60 -ErrorAction SilentlyContinue } catch {}`,
    'Start-Sleep -Milliseconds 500',
    ...lines,
    'Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue',
  ].join('\r\n'));
  spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function install(quit) {
  if (!downloaded) throw new Error('No update has been downloaded yet.');
  set({ status: 'installing' });
  if (state.installType === 'portable') {
    // Replace the running portable exe (keeping its name so shortcuts keep working), then relaunch it.
    const target = process.env.PORTABLE_EXECUTABLE_FILE;
    runAfterExit([
      `$src = ${q(downloaded.file)}; $dst = ${q(target)}`,
      'for ($i = 0; $i -lt 20; $i++) { try { Copy-Item -LiteralPath $src -Destination $dst -Force; break } catch { Start-Sleep -Milliseconds 500 } }',
      'Remove-Item -LiteralPath $src -Force -ErrorAction SilentlyContinue',
      'Start-Process -FilePath $dst',
    ]);
  } else {
    // Silent NSIS upgrade into the existing install location; --force-run relaunches the app afterwards.
    runAfterExit([
      `Start-Process -FilePath ${q(downloaded.file)} -ArgumentList '/S','--updated','--force-run' -Wait`,
      `Remove-Item -LiteralPath ${q(downloaded.file)} -Force -ErrorAction SilentlyContinue`,
    ]);
  }
  quit();
}

function init(onState) { emit = onState; }
function getState() { return { ...state }; }
function openReleasePage() { if (state.url) shell.openExternal(state.url); else shell.openExternal(`https://github.com/${REPO}/releases`); }

module.exports = { init, check, download, cancel, install, getState, openReleasePage, REPO };
