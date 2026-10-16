import React, { useState } from 'react';
import { Share2, CheckCircle2 } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { api, cdn } from '../lib/util.js';
import { Modal, Button, Field, Select, Toggle, CopyField } from './ui.jsx';

const EXPIRY = [
  { value: '', label: 'Never' }, { value: '3600', label: '1 hour' }, { value: '86400', label: '24 hours' },
  { value: '604800', label: '7 days' }, { value: '2592000', label: '30 days' },
];

export default function ShareDialog({ file, onClose }) {
  const { activeId, toast } = useApp();
  const [f, setF] = useState({ expires_in: '604800', max_downloads: '', password: '', one_time: false, require_email: false, message: '', allowed_countries: '', allowed_ips: '' });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const create = async () => {
    setBusy(true);
    try {
      const body = {
        message: f.message || undefined, expires_in: f.expires_in ? Number(f.expires_in) : undefined,
        max_downloads: f.max_downloads ? Number(f.max_downloads) : undefined, password: f.password || undefined,
        one_time: f.one_time || undefined, require_email: f.require_email || undefined,
        allowed_countries: f.allowed_countries ? f.allowed_countries.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : undefined,
        allowed_ips: f.allowed_ips ? f.allowed_ips.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      };
      const r = await api(activeId, 'POST', `/api/v1/files/${file.id}/shares`, { body });
      const url = r.url || r.share_url || r.share?.url || r.link;
      setResult({ ...r, url });
      if (url) await cdn.clipboard.write(url);
      toast('Share link created and copied', 'success');
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  return (
    <Modal title="Create share link" subtitle={file.name} icon={Share2} onClose={onClose} width={540}
      footer={result ? <Button variant="primary" onClick={onClose}>Done</Button> : <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={create} loading={busy}>Create link</Button></>}>
      {result ? (
        <div className="stack">
          <div className="success-hero"><CheckCircle2 size={36} /><b>Share link ready</b><span className="muted small">This URL contains a secret token and is only shown once. It has been copied to your clipboard.</span></div>
          {result.url && <CopyField value={result.url} />}
        </div>
      ) : (
        <div className="form-grid two">
          <Field label="Expires"><Select value={f.expires_in} onChange={set('expires_in')} options={EXPIRY} /></Field>
          <Field label="Max downloads"><input className="input" type="number" min="1" placeholder="Unlimited" value={f.max_downloads} onChange={set('max_downloads')} /></Field>
          <Field label="Password"><input className="input" type="password" placeholder="Optional" value={f.password} onChange={set('password')} /></Field>
          <Field label="Allowed countries"><input className="input" placeholder="e.g. US, GB" value={f.allowed_countries} onChange={set('allowed_countries')} /></Field>
          <Field label="Allowed IPs / CIDRs"><input className="input mono" placeholder="Optional" value={f.allowed_ips} onChange={set('allowed_ips')} /></Field>
          <Field label="Message for recipient"><input className="input" placeholder="Optional" value={f.message} onChange={set('message')} /></Field>
          <Field label="One-time link" row><Toggle checked={f.one_time} onChange={set('one_time')} /></Field>
          <Field label="Require email" row><Toggle checked={f.require_email} onChange={set('require_email')} /></Field>
        </div>
      )}
    </Modal>
  );
}
