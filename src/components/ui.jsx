import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, CheckCircle2, Info, XCircle, Copy, Check, Lock, RefreshCw, Inbox, ChevronDown } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { classNames, initials } from '../lib/util.js';

export function Button({ variant = 'default', size, icon: Icon, children, loading, className, ...rest }) {
  return (
    <button className={classNames('btn', `btn-${variant}`, size && `btn-${size}`, !children && 'btn-icon', className)} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Spinner size={14} /> : Icon && <Icon size={size === 'sm' ? 14 : 16} />}
      {children && <span>{children}</span>}
    </button>
  );
}

export function Spinner({ size = 18 }) {
  return <span className="spinner" style={{ width: size, height: size }} />;
}

export function Modal({ title, subtitle, icon: Icon, onClose, children, footer, width = 520, className, bodyClass }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onClose]);
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={classNames('modal', className)} style={{ width }}>
        {title && (
          <div className="modal-head">
            {Icon && <div className="modal-icon"><Icon size={18} /></div>}
            <div className="grow">
              <div className="modal-title">{title}</div>
              {subtitle && <div className="modal-sub">{subtitle}</div>}
            </div>
            <button className="icon-btn" onClick={onClose}><X size={18} /></button>
          </div>
        )}
        <div className={classNames('modal-body', bodyClass)}>{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function DialogHost() {
  const { dialog, closeDialog } = useApp();
  const [value, setValue] = useState('');
  const inputRef = useRef(null);
  useEffect(() => {
    if (dialog?.kind === 'prompt') {
      setValue(dialog.value || '');
      setTimeout(() => { inputRef.current?.focus(); if (dialog.selectStem && dialog.value) { const i = dialog.value.lastIndexOf('.'); inputRef.current?.setSelectionRange(0, i > 0 ? i : dialog.value.length); } else inputRef.current?.select(); }, 30);
    }
  }, [dialog]);
  if (!dialog) return null;
  if (dialog.kind === 'confirm') {
    return (
      <Modal title={dialog.title} icon={dialog.danger ? AlertTriangle : Info} onClose={() => closeDialog(false)} width={440} className={dialog.danger ? 'modal-danger' : ''}
        footer={<>
          <Button variant="ghost" onClick={() => closeDialog(false)}>Cancel</Button>
          <Button variant={dialog.danger ? 'danger' : 'primary'} onClick={() => closeDialog(true)} autoFocus>{dialog.confirmText || 'Confirm'}</Button>
        </>}>
        <div className="muted" style={{ lineHeight: 1.6 }}>{dialog.message}</div>
      </Modal>
    );
  }
  const submit = (e) => { e.preventDefault(); closeDialog(value); };
  return (
    <Modal title={dialog.title} onClose={() => closeDialog(null)} width={460}
      footer={<>
        <Button variant="ghost" onClick={() => closeDialog(null)}>Cancel</Button>
        <Button variant="primary" onClick={submit}>{dialog.confirmText || 'Save'}</Button>
      </>}>
      <form onSubmit={submit}>
        {dialog.label && <label className="label">{dialog.label}</label>}
        <input ref={inputRef} className="input" value={value} placeholder={dialog.placeholder} onChange={(e) => setValue(e.target.value)} />
      </form>
    </Modal>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  const icons = { success: CheckCircle2, error: XCircle, warn: AlertTriangle, info: Info };
  return createPortal(
    <div className="toasts">
      {toasts.map((t) => {
        const I = icons[t.type] || Info;
        return (
          <div key={t.id} className={`toast toast-${t.type}`} onClick={() => dismissToast(t.id)}>
            <I size={18} />
            <div className="grow">
              <div>{t.message}</div>
              {t.detail && <div className="toast-detail">{t.detail}</div>}
            </div>
            {t.action && <button className="toast-action" onClick={(e) => { e.stopPropagation(); t.action.onClick(); dismissToast(t.id); }}>{t.action.label}</button>}
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

// Context menu: items = [{label, icon, onClick, danger, disabled, shortcut, submenu, divider}]
export function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.min(x, window.innerWidth - r.width - 8), top: Math.min(y, window.innerHeight - r.height - 8) });
  }, [x, y]);
  useEffect(() => {
    const close = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const key = (e) => e.key === 'Escape' && onClose();
    setTimeout(() => { window.addEventListener('mousedown', close); window.addEventListener('contextmenu', close); }, 0);
    window.addEventListener('keydown', key); window.addEventListener('blur', onClose);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('contextmenu', close); window.removeEventListener('keydown', key); window.removeEventListener('blur', onClose); };
  }, [onClose]);
  return createPortal(
    <div ref={ref} className="ctx-menu" style={pos}>
      <MenuItems items={items} onClose={onClose} />
    </div>,
    document.body,
  );
}
function MenuItems({ items, onClose }) {
  const [sub, setSub] = useState(null);
  return items.filter(Boolean).map((it, i) => {
    if (it.divider) return <div key={i} className="ctx-divider" />;
    if (it.header) return <div key={i} className="ctx-header">{it.header}</div>;
    const I = it.icon;
    return (
      <div key={i} className={classNames('ctx-item', it.danger && 'danger', it.disabled && 'disabled', it.checked && 'checked')}
        onMouseEnter={() => setSub(it.submenu ? i : null)}
        onClick={() => { if (it.disabled || it.submenu) return; onClose(); it.onClick?.(); }}>
        <span className="ctx-ic">{I ? <I size={15} /> : it.checked && <Check size={15} />}</span>
        <span className="grow">{it.label}</span>
        {I && it.checked && <Check size={14} className="ctx-check" />}
        {it.shortcut && <span className="ctx-short">{it.shortcut}</span>}
        {it.submenu && <ChevronDown size={14} style={{ transform: 'rotate(-90deg)' }} />}
        {it.submenu && sub === i && <div className="ctx-menu ctx-sub"><MenuItems items={it.submenu} onClose={onClose} /></div>}
      </div>
    );
  });
}
export function useContextMenu() {
  const [menu, setMenu] = useState(null);
  const open = (e, items) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, items }); };
  const el = menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />;
  return [open, el];
}

export function Dropdown({ trigger, items, align = 'left' }) {
  const [open, setOpen] = useState(null);
  const ref = useRef(null);
  return (
    <span ref={ref} onClick={(e) => { const r = ref.current.getBoundingClientRect(); setOpen({ x: align === 'right' ? r.right - 220 : r.left, y: r.bottom + 6 }); e.stopPropagation(); }}>
      {trigger}
      {open && <ContextMenu x={open.x} y={open.y} items={items} onClose={() => setOpen(null)} />}
    </span>
  );
}

export function Toggle({ checked, onChange, disabled }) {
  return (
    <button type="button" className={classNames('toggle', checked && 'on')} disabled={disabled} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

export function Select({ value, onChange, options, className, ...rest }) {
  return (
    <div className={classNames('select', className)}>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest}>
        {options.map((o) => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={14} />
    </div>
  );
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="segmented">
      {options.map((o) => {
        const I = o.icon;
        return (
          <button key={o.value} className={classNames(value === o.value && 'active')} onClick={() => onChange(o.value)} title={o.title}>
            {I && <I size={15} />}{o.label && <span>{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.value} className={classNames('tab', value === t.value && 'active')} onClick={() => onChange(t.value)}>
          {t.icon && <t.icon size={15} />}{t.label}{t.badge ? <span className="tab-badge">{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children, row }) {
  return (
    <div className={classNames('field', row && 'field-row')}>
      {label && <label className="label">{label}</label>}
      <div className="field-ctl">{children}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Badge({ children, tone = 'neutral', dot }) {
  return <span className={`badge badge-${tone}`}>{dot && <i />}{children}</span>;
}

export function visTone(v) {
  return { PUBLIC: 'green', PRIVATE: 'red', AUTHENTICATED: 'blue', SIGNED_URL_ONLY: 'amber' }[v] || 'neutral';
}

export function CopyField({ value, label, mono = true, secret }) {
  const { copy } = useApp();
  const [done, setDone] = useState(false);
  const [show, setShow] = useState(!secret);
  return (
    <div className="copy-field">
      {label && <span className="copy-label">{label}</span>}
      <span className={classNames('copy-value', mono && 'mono')} onClick={() => secret && setShow(!show)} title={value}>{show ? value : '•'.repeat(Math.min(32, String(value || '').length))}</span>
      <button className="icon-btn" onClick={async () => { await copy(value); setDone(true); setTimeout(() => setDone(false), 1200); }}>
        {done ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </div>
  );
}

export function Empty({ icon: Icon = Inbox, title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon size={28} /></div>
      <div className="empty-title">{title}</div>
      {children && <div className="empty-text">{children}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, compact }) {
  if (!error) return null;
  const forbidden = error.status === 403 || error.code === 'forbidden' || error.code === 'insufficient_scope';
  const unauth = error.status === 401;
  const staff = error.code === 'staff_session_required' || error.code === 'staff_session_expired';
  const { active, editServer } = useApp();
  const Icon = forbidden || unauth ? Lock : AlertTriangle;
  return (
    <div className={classNames('error-state', compact && 'compact')}>
      <Icon size={compact ? 18 : 26} />
      <div className="grow">
        <div className="error-title">{staff ? 'Staff sign-in required' : forbidden ? 'Not permitted' : unauth ? 'Authentication failed' : error.status === 0 ? 'Cannot reach server' : 'Something went wrong'}</div>
        <div className="error-text">{staff ? (error.code === 'staff_session_expired' ? error.message : 'API keys can’t use this feature. Sign in with your staff account for this server to unlock it.') : forbidden ? `${error.message} Your API key may be missing a scope for this feature.` : error.message}</div>
        {error.requestId && <div className="error-req mono">request {error.requestId}</div>}
      </div>
      {staff && active && <Button size="sm" variant="primary" icon={Lock} onClick={() => editServer({ ...active, focusStaff: true })}>Sign in as staff</Button>}
      {onRetry && !staff && <Button size="sm" icon={RefreshCw} onClick={() => onRetry()}>Retry</Button>}
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return <div className="loading"><Spinner size={22} /><span>{label}</span></div>;
}

export function Card({ title, icon: Icon, actions, children, className, pad = true }) {
  return (
    <section className={classNames('card', className)}>
      {(title || actions) && (
        <header className="card-head">
          {Icon && <Icon size={16} className="card-ic" />}
          <h3>{title}</h3>
          <div className="grow" />
          {actions}
        </header>
      )}
      <div className={pad ? 'card-body' : ''}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, icon: Icon, tone = 'accent', spark }) {
  return (
    <div className={`stat stat-${tone}`}>
      <div className="stat-top">
        {Icon && <div className="stat-ic"><Icon size={18} /></div>}
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
      {spark}
    </div>
  );
}

export function PageHeader({ title, subtitle, icon: Icon, children }) {
  return (
    <div className="page-header">
      {Icon && <div className="page-ic"><Icon size={20} /></div>}
      <div className="grow">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="page-actions">{children}</div>
    </div>
  );
}

export function KV({ rows }) {
  return (
    <dl className="kv">
      {rows.filter(Boolean).map(([k, v], i) => (
        <React.Fragment key={i}><dt>{k}</dt><dd>{v ?? '—'}</dd></React.Fragment>
      ))}
    </dl>
  );
}

export function Progress({ value, tone }) {
  return <div className={classNames('progress', tone && `progress-${tone}`)}><span style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} /></div>;
}

export function Avatar({ name, color, size = 28 }) {
  return <span className="avatar" style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}>{initials(name)}</span>;
}
