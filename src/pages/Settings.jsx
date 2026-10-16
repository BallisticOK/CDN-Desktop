import React, { useEffect, useState } from 'react';
import {
  Settings as SettingsIcon, Server, Palette, Link2, Download, Keyboard, Info, Plus, Pencil, Check, ArrowUp, ArrowDown, Upload as UploadIcon,
  FileDown, FileUp, PlugZap, CheckCircle2, XCircle, FolderOpen, Moon, Sun, Monitor, Shield,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { cdn, ACCENTS, classNames, initials } from '../lib/util.js';
import { PageHeader, Button, Card, Field, Toggle, Select, Segmented, Badge, Spinner } from '../components/ui.jsx';
import ServerEditor from '../components/ServerEditor.jsx';

const TABS = [
  { value: 'servers', label: 'Servers', icon: Server },
  { value: 'appearance', label: 'Appearance', icon: Palette },
  { value: 'links', label: 'Links & sharing', icon: Link2 },
  { value: 'downloads', label: 'Downloads', icon: Download },
  { value: 'quick', label: 'Quick upload', icon: Keyboard },
  { value: 'about', label: 'About', icon: Info },
];

export default function Settings({ params = {} }) {
  const [tab, setTab] = useState(params.tab || 'servers');
  return (
    <div className="page">
      <PageHeader icon={SettingsIcon} title="Settings" subtitle="Servers, accounts and app preferences" />
      <div className="settings">
        <nav className="settings-nav">
          {TABS.map((t) => (
            <button key={t.value} className={classNames('settings-tab', tab === t.value && 'active')} onClick={() => setTab(t.value)}><t.icon size={16} />{t.label}</button>
          ))}
        </nav>
        <div className="settings-body">
          {tab === 'servers' && <Servers />}
          {tab === 'appearance' && <Appearance />}
          {tab === 'links' && <Links />}
          {tab === 'downloads' && <Downloads />}
          {tab === 'quick' && <QuickUpload />}
          {tab === 'about' && <About />}
        </div>
      </div>
    </div>
  );
}

function Servers() {
  const { profiles, activeId, setActive, refreshProfiles, toast } = useApp();
  const [editor, setEditor] = useState(null);
  const [status, setStatus] = useState({});

  const testAll = async () => {
    for (const p of profiles) {
      setStatus((s) => ({ ...s, [p.id]: { loading: true } }));
      cdn.profiles.test({ id: p.id, baseUrl: p.baseUrl })
        .then((r) => setStatus((s) => ({ ...s, [p.id]: { ok: r.me.ok, ms: r.health.ms, msg: r.me.ok ? (r.me.data?.api_key?.name || r.me.data?.type) : (r.me.error?.message || 'failed') } })))
        .catch((e) => setStatus((s) => ({ ...s, [p.id]: { ok: false, msg: e.message } })));
    }
  };
  useEffect(() => { if (profiles.length) testAll(); }, []); // eslint-disable-line

  const move = async (i, d) => {
    const ids = profiles.map((p) => p.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    await cdn.profiles.reorder(ids); refreshProfiles();
  };
  const exportAll = async () => {
    const withKeys = window.confirm('Include API keys in the export file?\n\nOK = include keys (keep the file safe)\nCancel = export without keys');
    const p = await cdn.profiles.exportAll(withKeys);
    if (p) toast('Servers exported', 'success', { detail: p });
  };
  const importAll = async () => {
    try { const n = await cdn.profiles.importAll(); if (n) { toast(`Imported ${n} server${n > 1 ? 's' : ''}`, 'success'); refreshProfiles(); } }
    catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="stack">
      <div className="row gap">
        <div className="grow">
          <h3 className="settings-h">Your CDN servers</h3>
          <div className="muted small">Each server has its own URL and API key. Switch with the sidebar picker or <kbd>Ctrl</kbd>+<kbd>1–9</kbd>.</div>
        </div>
        <Button icon={PlugZap} onClick={testAll}>Test all</Button>
        <Button icon={FileUp} onClick={importAll}>Import</Button>
        <Button icon={FileDown} onClick={exportAll} disabled={!profiles.length}>Export</Button>
        <Button variant="primary" icon={Plus} onClick={() => setEditor({})}>Add server</Button>
      </div>
      <div className="server-list">
        {profiles.map((p, i) => {
          const st = status[p.id];
          return (
            <div key={p.id} className={classNames('server-card', p.id === activeId && 'active')} style={{ '--sc': p.color }}>
              <span className="avatar lg" style={{ background: p.color }}>{initials(p.name)}</span>
              <div className="grow">
                <div className="row gap"><b>{p.name}</b>{p.id === activeId && <Badge tone="accent">active</Badge>}{i < 9 && <kbd>Ctrl {i + 1}</kbd>}</div>
                <div className="mono small muted">{p.baseUrl}</div>
                <div className="row gap small">
                  <span className="muted">{p.hasKey ? <>🔑 {p.keyPreview}</> : <span className="text-red">no API key</span>}</span>
                  {st?.loading ? <Spinner size={12} /> : st ? (
                    <span className={st.ok ? 'text-green' : 'text-red'}>{st.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {st.msg}{st.ms !== undefined ? ` · ${st.ms} ms` : ''}</span>
                  ) : null}
                </div>
                {p.notes && <div className="small muted">{p.notes}</div>}
              </div>
              <div className="server-actions">
                <Button size="sm" variant="ghost" icon={ArrowUp} disabled={i === 0} onClick={() => move(i, -1)} />
                <Button size="sm" variant="ghost" icon={ArrowDown} disabled={i === profiles.length - 1} onClick={() => move(i, 1)} />
                <Button size="sm" icon={Pencil} onClick={() => setEditor(p)}>Edit</Button>
                {p.id !== activeId && <Button size="sm" variant="primary" icon={Check} onClick={() => setActive(p.id)}>Use</Button>}
              </div>
            </div>
          );
        })}
        {!profiles.length && <div className="empty"><Server size={28} /><div className="empty-title">No servers yet</div><Button variant="primary" icon={Plus} onClick={() => setEditor({})}>Add server</Button></div>}
      </div>
      {editor && <ServerEditor profile={editor} onClose={() => { setEditor(null); testAll(); }} />}
    </div>
  );
}

function Appearance() {
  const { settings, setSettings } = useApp();
  return (
    <Card>
      <div className="stack">
        <Field label="Theme" row>
          <Segmented value={settings.theme} onChange={(v) => setSettings({ theme: v })} options={[{ value: 'dark', label: 'Dark', icon: Moon }, { value: 'light', label: 'Light', icon: Sun }, { value: 'system', label: 'System', icon: Monitor }]} />
        </Field>
        <Field label="Accent colour" row>
          <div className="swatches">
            {ACCENTS.map((c) => <button key={c} className={classNames('swatch', settings.accent === c && 'active')} style={{ background: c }} onClick={() => setSettings({ accent: c })} />)}
            <input type="color" className="color-input" value={settings.accent} onChange={(e) => setSettings({ accent: e.target.value })} />
          </div>
        </Field>
        <Field label="Default file view" row>
          <Segmented value={settings.defaultView} onChange={(v) => setSettings({ defaultView: v })} options={[{ value: 'grid', label: 'Grid' }, { value: 'list', label: 'List' }]} />
        </Field>
        <Field label="Files per page" row>
          <Select value={String(settings.pageSize)} onChange={(v) => setSettings({ pageSize: Number(v) })} options={['30', '60', '100', '200', '500']} />
        </Field>
        <Field label="Confirm before deleting" row hint="Deleted files go to the recycle bin either way."><Toggle checked={settings.confirmDeletes} onChange={(v) => setSettings({ confirmDeletes: v })} /></Field>
        <Field label="Keep running in the tray when closed" row><Toggle checked={settings.minimizeToTray} onChange={(v) => setSettings({ minimizeToTray: v })} /></Field>
        <Field label="Desktop notifications" row><Toggle checked={settings.notifications} onChange={(v) => setSettings({ notifications: v })} /></Field>
      </div>
    </Card>
  );
}

function Links() {
  const { settings, setSettings } = useApp();
  return (
    <Card>
      <div className="stack">
        <Field label="“Copy link” uses" hint="Direct CDN URLs embed nicely in Discord and other chat apps. Signed URLs work for private files but expire.">
          <Segmented value={settings.linkFormat} onChange={(v) => setSettings({ linkFormat: v })} options={[{ value: 'url', label: 'CDN URL' }, { value: 'path_url', label: 'Friendly path' }, { value: 'signed', label: 'Signed URL' }]} />
        </Field>
        <Field label="Signed URL lifetime" row>
          <Select value={String(settings.signedTtl)} onChange={(v) => setSettings({ signedTtl: Number(v) })} options={[{ value: '300', label: '5 minutes' }, { value: '3600', label: '1 hour' }, { value: '86400', label: '24 hours' }, { value: '604800', label: '7 days' }]} />
        </Field>
        <div className="banner banner-info"><Info size={16} /><span>Examples: <span className="mono">https://cdn…/files/file_01J…</span> (CDN URL) · <span className="mono">https://cdn…/p/images/cat.png</span> (friendly path)</span></div>
      </div>
    </Card>
  );
}

function Downloads() {
  const { settings, setSettings } = useApp();
  return (
    <Card>
      <div className="stack">
        <Field label="Download folder" hint="Defaults to your Windows Downloads folder.">
          <div className="row gap">
            <input className="input mono" readOnly value={settings.downloadDir || 'Downloads (default)'} />
            <Button icon={FolderOpen} onClick={async () => { const d = await cdn.dialog.pickDir(); if (d) setSettings({ downloadDir: d }); }}>Choose…</Button>
            {settings.downloadDir && <Button variant="ghost" onClick={() => setSettings({ downloadDir: '' })}>Reset</Button>}
          </div>
        </Field>
        <Field label="Ask where to save each file" row><Toggle checked={settings.askWhereToSave} onChange={(v) => setSettings({ askWhereToSave: v })} /></Field>
      </div>
    </Card>
  );
}

function QuickUpload() {
  const { settings, setSettings, toast, active } = useApp();
  const [recording, setRecording] = useState(false);
  useEffect(() => {
    if (!recording) return;
    const k = async (e) => {
      e.preventDefault();
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
      if (e.key === 'Escape') { setRecording(false); return; }
      const parts = [];
      if (e.ctrlKey) parts.push('CommandOrControl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      if (!parts.length) { toast('Use at least one modifier (Ctrl, Alt or Shift)', 'warn'); return; }
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key.replace('Arrow', '');
      const accel = [...parts, key].join('+');
      setRecording(false);
      const r = await setSettings({ quickUploadHotkey: accel });
      toast(r.hotkeyOk ? `Hotkey set to ${pretty(accel)}` : `${pretty(accel)} is in use by another app`, r.hotkeyOk ? 'success' : 'error');
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [recording, setSettings, toast]);

  return (
    <Card>
      <div className="stack">
        <div className="quick-hero">
          <UploadIcon size={22} />
          <div>
            <b>Clipboard → CDN link in one keystroke</b>
            <div className="muted small">Take a screenshot (Win+Shift+S) or copy a file in Explorer, press the hotkey, and the link to the uploaded file is put on your clipboard, ready to paste into Discord. Works even when the app is hidden in the tray. Uploads go to the active server{active ? ` (${active.name})` : ''}.</div>
          </div>
        </div>
        <Field label="Enable global hotkey" row><Toggle checked={settings.quickUploadEnabled} onChange={(v) => setSettings({ quickUploadEnabled: v })} /></Field>
        <Field label="Hotkey" row>
          <div className="row gap">
            <span className={classNames('hotkey', recording && 'recording')}>{recording ? 'Press keys…' : pretty(settings.quickUploadHotkey)}</span>
            <Button size="sm" onClick={() => setRecording(!recording)}>{recording ? 'Cancel' : 'Change'}</Button>
          </div>
        </Field>
        <Button icon={UploadIcon} onClick={() => cdn.quickUpload()}>Try it now</Button>
      </div>
    </Card>
  );
}
const pretty = (a = '') => a.replace('CommandOrControl', 'Ctrl').split('+').join(' + ');

function About() {
  const [info, setInfo] = useState(null);
  useEffect(() => { cdn.appInfo().then(setInfo); }, []);
  return (
    <Card>
      {info && (
        <div className="stack">
          <div className="about-hero"><div className="welcome-logo sm"><UploadIcon size={22} /></div><div><b>CDN Desktop</b><div className="muted small">v{info.version} · Electron {info.electron}</div></div></div>
          <div className="row gap"><Shield size={16} className={info.encryption ? 'text-green' : 'text-amber'} /><span>{info.encryption ? 'API keys are encrypted with Windows DPAPI (tied to your Windows account).' : 'OS encryption unavailable: keys are stored obfuscated only.'}</span></div>
          <Field label="Settings & data folder"><div className="row gap"><input className="input mono" readOnly value={info.userData} /><Button icon={FolderOpen} onClick={() => cdn.shell.openPath(info.userData)}>Open</Button></div></Field>
          <div className="muted small">Shortcuts: Ctrl+1–9 switch server · Ctrl+, settings · in Files: Ctrl+A, Del, F2, F5, Enter, Space, Ctrl+C (copy link), Ctrl+V (paste upload), Backspace (up a folder).</div>
        </div>
      )}
    </Card>
  );
}
