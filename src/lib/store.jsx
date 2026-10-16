import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, cdn } from './util.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [profiles, setProfiles] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [settings, setSettingsState] = useState(null);
  const [me, setMe] = useState(null);
  const [meError, setMeError] = useState(null);
  const [page, setPageState] = useState({ name: 'dashboard', params: {} });
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [transfers, setTransfers] = useState({});
  const [filesVersion, setFilesVersion] = useState(0);
  const toastId = useRef(0);

  const refreshProfiles = useCallback(async () => {
    const { profiles, activeId } = await cdn.profiles.list();
    setProfiles(profiles); setActiveId(activeId);
    return { profiles, activeId };
  }, []);

  useEffect(() => {
    refreshProfiles();
    cdn.settings.get().then(setSettingsState);
    cdn.transfers.list().then((list) => setTransfers(Object.fromEntries(list.map((t) => [t.id, t]))));
    const offs = [
      cdn.on('transfer:event', (t) => setTransfers((prev) => ({ ...prev, [t.id]: t }))),
      cdn.on('profiles:changed', () => refreshProfiles()),
      cdn.on('files:changed', () => setFilesVersion((v) => v + 1)),
    ];
    return () => offs.forEach((f) => f());
  }, [refreshProfiles]);

  // Identify the caller whenever the active server changes.
  useEffect(() => {
    setMe(null); setMeError(null);
    if (!activeId) return;
    let alive = true;
    api(activeId, 'GET', '/api/v1/me').then((d) => alive && setMe(d)).catch((e) => alive && setMeError(e));
    return () => { alive = false; };
  }, [activeId]);

  // Theme + accent
  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      root.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    root.style.setProperty('--accent', settings.accent || '#7c5cff');
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings]);

  const setSettings = useCallback(async (patch) => {
    setSettingsState((s) => ({ ...s, ...patch }));
    const r = await cdn.settings.set(patch);
    setSettingsState(r.settings);
    return r;
  }, []);

  const setActive = useCallback(async (id) => {
    await cdn.profiles.setActive(id);
    setActiveId(id);
  }, []);

  const toast = useCallback((message, type = 'info', opts = {}) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message, type, ...opts }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts.duration || (type === 'error' ? 6000 : 3200));
  }, []);
  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const confirm = useCallback((opts) => new Promise((resolve) => setDialog({ kind: 'confirm', ...opts, resolve })), []);
  const prompt = useCallback((opts) => new Promise((resolve) => setDialog({ kind: 'prompt', ...opts, resolve })), []);
  const closeDialog = useCallback((value) => { setDialog((d) => { d?.resolve(value); return null; }); }, []);

  const navigate = useCallback((name, params = {}) => setPageState({ name, params }), []);

  const copy = useCallback(async (text, label = 'Copied to clipboard') => {
    await cdn.clipboard.write(text); toast(label, 'success');
  }, [toast]);

  const active = profiles.find((p) => p.id === activeId) || null;
  const scopes = me?.scopes || me?.permissions || null;
  const hasScope = useCallback((s) => !scopes || scopes.includes('*') || scopes.includes(s), [scopes]);

  const value = useMemo(() => ({
    profiles, activeId, active, refreshProfiles, setActive,
    settings, setSettings, me, meError, scopes, hasScope,
    page, navigate, toast, toasts, dismissToast, confirm, prompt, dialog, closeDialog, copy,
    transfers, setTransfers, filesVersion, bumpFiles: () => setFilesVersion((v) => v + 1),
  }), [profiles, activeId, active, refreshProfiles, setActive, settings, setSettings, me, meError, scopes, hasScope, page, navigate, toast, toasts, dismissToast, confirm, prompt, dialog, closeDialog, copy, transfers, filesVersion]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Data loading hook bound to the active server.
export function useApi(fn, deps = [], { skip = false } = {}) {
  const { activeId } = useApp();
  const [state, setState] = useState({ data: null, error: null, loading: !skip });
  const seq = useRef(0);
  const load = useCallback(async (silent = false) => {
    if (!activeId || skip) { setState({ data: null, error: null, loading: false }); return; }
    const my = ++seq.current;
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn(activeId);
      if (my === seq.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (my === seq.current) setState({ data: null, error, loading: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, skip, ...deps]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}
