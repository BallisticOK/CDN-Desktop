export const cdn = window.cdn;

export class ApiError extends Error {
  constructor(message, { code, status, requestId } = {}) {
    super(message);
    this.code = code; this.status = status; this.requestId = requestId;
  }
}

export async function api(profileId, method, path, { query, body, mode } = {}) {
  const r = await cdn.request({ profileId, method, path, query, body, mode });
  if (!r.ok) {
    throw new ApiError(r.error?.message || `Request failed (${r.status})`, { code: r.error?.code, status: r.status, requestId: r.error?.request_id });
  }
  return r.data;
}

// Many list endpoints return { data: [...] }, some return arrays or other wrappers.
export function listOf(res, ...keys) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  for (const k of ['data', ...keys, 'items', 'results']) if (Array.isArray(res[k])) return res[k];
  return [];
}

export function proxyUrl(profileId, path) {
  return `cdnx://${profileId}${path.startsWith('/') ? path : '/' + path}`;
}
export function fileInlineUrl(profileId, file) {
  return proxyUrl(profileId, `/api/v1/files/${file.id}/download?disposition=inline`);
}

export function bytes(n, digits = 1) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  n = Number(n);
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(n >= 100 ? 0 : digits)} ${u[i]}`;
}
export function num(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  n = Number(n);
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString();
}
export function pct(n) { return n === null || n === undefined ? '—' : `${(Number(n) * 100).toFixed(1)}%`; }
export function date(d) {
  if (!d) return '—';
  const x = new Date(d);
  return x.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function ago(d) {
  if (!d) return 'never';
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  const fut = s < 0; const a = Math.abs(s);
  const f = (v, u) => `${Math.floor(v)} ${u}${Math.floor(v) === 1 ? '' : 's'}`;
  let out;
  if (a < 45) out = 'just now';
  else if (a < 3600) out = f(a / 60, 'min');
  else if (a < 86400) out = f(a / 3600, 'hour');
  else if (a < 86400 * 30) out = f(a / 86400, 'day');
  else if (a < 86400 * 365) out = f(a / 86400 / 30, 'month');
  else out = f(a / 86400 / 365, 'year');
  if (out === 'just now') return out;
  return fut ? `in ${out}` : `${out} ago`;
}
export function duration(sec) {
  if (sec === null || sec === undefined || !isFinite(sec)) return '—';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

const TEXT_EXT = new Set(['txt', 'md', 'markdown', 'json', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'css', 'scss', 'less', 'html', 'htm', 'xml', 'svg', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'env', 'csv', 'tsv', 'log', 'py', 'rb', 'php', 'go', 'rs', 'java', 'kt', 'c', 'h', 'cpp', 'hpp', 'cs', 'sh', 'bash', 'ps1', 'bat', 'sql', 'lua', 'vue', 'svelte', 'gitignore', 'dockerfile', 'm3u8', 'vtt', 'srt']);
export function fileKind(f) {
  const m = (f.mime_type || '').toLowerCase();
  const ext = (f.extension || f.name?.split('.').pop() || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m === 'application/pdf') return 'pdf';
  if (/zip|rar|7z|tar|gzip|x-xz|bzip/.test(m)) return 'archive';
  if (m.startsWith('text/') || /json|xml|javascript|yaml|toml|x-sh|sql/.test(m) || TEXT_EXT.has(ext)) return 'text';
  return 'other';
}
export function isEditable(f) { if (typeof f.editable === 'boolean') return f.editable; return fileKind(f) === 'text' && (f.size ?? 0) <= 2 * 1024 * 1024; }

export const VISIBILITIES = ['PUBLIC', 'PRIVATE', 'AUTHENTICATED', 'SIGNED_URL_ONLY'];
export const VIS_LABEL = { PUBLIC: 'Public', PRIVATE: 'Private', AUTHENTICATED: 'Authenticated', SIGNED_URL_ONLY: 'Signed only' };

export const ACCENTS = ['#7c5cff', '#3b82f6', '#06b6d4', '#10b981', '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#a855f7'];

export function classNames(...a) { return a.filter(Boolean).join(' '); }

export function initials(name = '') {
  const parts = name.replace(/https?:\/\//, '').split(/[\s.\-_]+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

export function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
