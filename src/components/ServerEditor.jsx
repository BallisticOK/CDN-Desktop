import React, { useState } from 'react';
import { Server, Eye, EyeOff, PlugZap, CheckCircle2, XCircle, Trash2, ShieldCheck, LogOut, LogIn } from 'lucide-react';
import { Modal, Button, Field, Select, Badge } from './ui.jsx';
import { useApp } from '../lib/store.jsx';
import { StaffLoginSection } from './StaffLogin.jsx';
import { cdn, ACCENTS, VISIBILITIES, VIS_LABEL, classNames } from '../lib/util.js';

export default function ServerEditor({ profile, onClose }) {
  const { refreshProfiles, toast, setActive, confirm, profiles } = useApp();
  const isNew = !profile.id;
  const [form, setForm] = useState({
    name: profile.name || '', baseUrl: profile.baseUrl || '', apiKey: '', color: profile.color || ACCENTS[profiles.length % ACCENTS.length],
    defaultVisibility: profile.defaultVisibility || '', notes: profile.notes || '',
  });
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  const runTest = async () => {
    setTesting(true); setTest(null);
    try { setTest(await cdn.profiles.test({ id: profile.id, baseUrl: form.baseUrl, apiKey: form.apiKey || undefined })); }
    catch (e) { setTest({ error: e.message }); }
    setTesting(false);
  };

  const save = async () => {
    if (!form.baseUrl.trim()) { toast('Enter the server URL', 'warn'); return; }
    if (isNew && !form.apiKey.trim()) { toast('Enter an API key', 'warn'); return; }
    setSaving(true);
    try {
      const saved = await cdn.profiles.save({ id: profile.id, ...form });
      await refreshProfiles();
      if (isNew) await setActive(saved.id);
      toast(isNew ? `Added ${saved.name}` : 'Server updated', 'success');
      onClose();
    } catch (e) { toast(e.message, 'error'); }
    setSaving(false);
  };

  const remove = async () => {
    if (!(await confirm({ title: `Remove ${profile.name}?`, message: 'The server and its stored API key will be removed from this app. Nothing on the server is deleted.', danger: true, confirmText: 'Remove' }))) return;
    await cdn.profiles.remove(profile.id);
    await refreshProfiles();
    toast('Server removed', 'success');
    onClose();
  };

  const me = test?.me?.data;
  return (
    <Modal title={isNew ? 'Add server' : `Edit ${profile.name}`} subtitle="Connect a CDN Platform server with an API key" icon={Server} onClose={onClose} width={580}
      footer={<>
        {!isNew && <Button variant="ghost-danger" icon={Trash2} onClick={remove}>Remove</Button>}
        <div className="grow" />
        <Button variant="ghost" icon={PlugZap} onClick={runTest} loading={testing}>Test connection</Button>
        <Button variant="primary" onClick={save} loading={saving}>{isNew ? 'Add server' : 'Save changes'}</Button>
      </>}>
      <div className="form-grid">
        <Field label="Display name"><input className="input" placeholder="Main CDN" value={form.name} onChange={set('name')} autoFocus /></Field>
        <Field label="Server URL"><input className="input mono" placeholder="https://cdn.example.com" value={form.baseUrl} onChange={set('baseUrl')} /></Field>
        <Field label="API key" hint={profile.hasKey ? `Stored: ${profile.keyPreview}. Leave blank to keep it.` : 'Create one in your CDN dashboard under API Keys (cdn_live_… or cdn_test_…).'}>
          <div className="input-wrap">
            <input className="input mono" type={showKey ? 'text' : 'password'} placeholder={profile.hasKey ? '••••••••••••••••' : 'cdn_live_…'} value={form.apiKey} onChange={set('apiKey')} />
            <button className="input-adorn" onClick={() => setShowKey(!showKey)} type="button">{showKey ? <EyeOff size={15} /> : <Eye size={15} />}</button>
          </div>
        </Field>
        <Field label="Colour">
          <div className="swatches">
            {ACCENTS.map((c) => <button key={c} className={classNames('swatch', form.color === c && 'active')} style={{ background: c }} onClick={() => set('color')(c)} />)}
          </div>
        </Field>
        <Field label="Default upload visibility" hint="Applied to uploads unless you choose otherwise.">
          <Select value={form.defaultVisibility} onChange={set('defaultVisibility')} options={[{ value: '', label: 'Server default' }, ...VISIBILITIES.map((v) => ({ value: v, label: VIS_LABEL[v] }))]} />
        </Field>
        <Field label="Notes"><input className="input" placeholder="Optional" value={form.notes} onChange={set('notes')} /></Field>
      </div>

      <StaffLoginSection profile={profile} />

      {test && (
        <div className={classNames('test-result', test.me?.ok ? 'ok' : 'bad')}>
          {test.error ? <div className="row"><XCircle size={18} /><span>{test.error}</span></div> : <>
            <div className="row">
              {test.health?.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
              <span>Server {test.health?.ok ? 'reachable' : `unreachable (${test.health?.error?.message || test.health?.status})`}</span>
              {test.health?.ms !== undefined && <span className="muted">{test.health.ms} ms</span>}
            </div>
            <div className="row">
              {test.me?.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
              <span>{test.me?.ok ? <>Authenticated as <b>{me?.api_key?.name || me?.user?.name || me?.user?.email || me?.type}</b></> : `Authentication failed: ${test.me?.error?.message || test.me?.status}`}</span>
            </div>
            {me?.scopes && <div className="scope-list">{me.scopes.map((s) => <Badge key={s} tone="accent">{s}</Badge>)}</div>}
          </>}
        </div>
      )}
    </Modal>
  );
}

