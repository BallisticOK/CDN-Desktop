import React, { useState } from 'react';
import { ShieldCheck, LogIn, LogOut, KeyRound, Mail, Lock, ArrowLeft } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { cdn, classNames, initials } from '../lib/util.js';
import { Modal, Button, Badge } from './ui.jsx';

// Email/password (+ 2FA) sign-in for a server's staff account. The password is never stored;
// only the resulting session cookie is kept, encrypted, by the main process.
export function StaffLoginForm({ profile, onDone, autoFocus }) {
  const { refreshProfiles, refreshStaff, toast } = useApp();
  const [email, setEmail] = useState(profile.staffUser?.email || '');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true); setError('');
    try {
      const r = mfaToken ? await cdn.profiles.staffMfa({ id: profile.id, mfaToken, code }) : await cdn.profiles.staffLogin({ id: profile.id, email, password });
      if (r.mfa) { setMfaToken(r.mfaToken); }
      else {
        setPassword(''); setMfaToken(null); setCode('');
        await refreshProfiles(); await refreshStaff();
        toast(`Signed in as ${r.user?.name || r.user?.email}`, 'success');
        onDone?.(r.user);
      }
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="login-form">
      {mfaToken ? (
        <>
          <div className="login-step"><KeyRound size={16} /><span>Two-factor authentication</span></div>
          <div className="muted small">Enter the 6-digit code from your authenticator app, or a recovery code.</div>
          <input className="input mono login-code" autoFocus inputMode="numeric" placeholder="123 456" value={code} onChange={(e) => setCode(e.target.value)} />
        </>
      ) : (
        <>
          <label className="login-field"><Mail size={15} /><input type="email" placeholder="Email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus={autoFocus} /></label>
          <label className="login-field"><Lock size={15} /><input type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        </>
      )}
      {error && <div className="login-error">{error}</div>}
      <div className="row gap">
        {mfaToken && <Button type="button" variant="ghost" icon={ArrowLeft} onClick={() => { setMfaToken(null); setCode(''); }}>Back</Button>}
        <Button type="submit" variant="primary" icon={LogIn} loading={busy} disabled={mfaToken ? !code.trim() : !email || !password} className="grow">{mfaToken ? 'Verify' : 'Sign in'}</Button>
      </div>
    </form>
  );
}

// Compact block for the server editor.
export function StaffLoginSection({ profile }) {
  const { profiles, staffSignOut, activeId, refreshProfiles, toast } = useApp();
  const live = profiles.find((p) => p.id === profile.id) || profile;
  if (!profile.id) return <div className="staff-box row gap muted small"><ShieldCheck size={16} /> After adding the server you can sign in with your staff account to unlock storage stats, API keys, webhooks, users and audit logs.</div>;
  const signOut = async () => {
    if (profile.id === activeId) await staffSignOut();
    else { await cdn.profiles.staffLogout(profile.id); await refreshProfiles(); }
    toast('Signed out', 'success');
  };
  return (
    <div className={classNames('staff-box', profile.focusStaff && !live.hasStaffSession && 'highlight')}>
      <div className="row gap"><ShieldCheck size={16} className="text-accent" /><b className="grow">Staff account <span className="muted small">(optional)</span></b>
        {live.hasStaffSession && <Badge tone="green" dot>signed in</Badge>}</div>
      {live.hasStaffSession ? (
        <div className="row gap">
          <span className="grow small">{live.staffUser?.name || live.staffUser?.email} {live.staffUser?.roles?.length ? <span className="muted">· {live.staffUser.roles.join(', ')}</span> : null}</span>
          <Button size="sm" variant="ghost" icon={LogOut} onClick={signOut}>Sign out</Button>
        </div>
      ) : (
        <>
          <div className="muted small">Sign in with your dashboard account to unlock admin features API keys can’t use: storage stats, API keys, webhooks, users, audit logs and security.</div>
          <StaffLoginForm profile={live} autoFocus={profile.focusStaff} />
        </>
      )}
    </div>
  );
}

export function LoginDialog() {
  const { loginOpen, openLogin, active } = useApp();
  if (!loginOpen || !active) return null;
  return (
    <Modal onClose={() => openLogin(false)} width={420} className="login-modal">
      <div className="login-hero">
        <span className="avatar lg" style={{ background: active.color }}>{initials(active.name)}</span>
        <h2>Sign in to {active.name}</h2>
        <div className="muted small mono">{active.baseUrl.replace(/^https?:\/\//, '')}</div>
      </div>
      <StaffLoginForm profile={active} autoFocus onDone={() => openLogin(false)} />
      <div className="hint" style={{ textAlign: 'center', marginTop: 14 }}>Uses your CDN dashboard account. Your password is not saved.</div>
    </Modal>
  );
}
