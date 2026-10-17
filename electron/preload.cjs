const { contextBridge, ipcRenderer, webUtils } = require('electron');

const call = async (channel, ...args) => {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const on = (channel, cb) => {
  const fn = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
};

contextBridge.exposeInMainWorld('cdn', {
  profiles: {
    list: () => call('profiles:list'),
    save: (p) => call('profiles:save', p),
    remove: (id) => call('profiles:delete', id),
    reorder: (ids) => call('profiles:reorder', ids),
    setActive: (id) => call('profiles:setActive', id),
    test: (p) => call('profiles:test', p),
    staffLogin: (o) => call('staff:login', o),
    staffMfa: (o) => call('staff:mfa', o),
    staffLogout: (id) => call('staff:logout', id),
    exportAll: (includeKeys) => call('app:exportProfiles', includeKeys),
    importAll: () => call('app:importProfiles'),
  },
  settings: { get: () => call('settings:get'), set: (patch) => call('settings:set', patch) },
  request: (req) => call('api:request', req),
  openapi: (profileId, force) => call('api:openapi', profileId, force),
  transfers: {
    uploadPaths: (o) => call('transfer:uploadPaths', o),
    uploadBuffer: (o) => call('transfer:uploadBuffer', o),
    newVersion: (o) => call('transfer:newVersion', o),
    download: (o) => call('transfer:download', o),
    downloadMany: (o) => call('transfer:downloadMany', o),
    cancel: (id) => call('transfer:cancel', id),
    list: () => call('transfer:list'),
    clear: () => call('transfer:clear'),
  },
  dialog: { openFiles: (o) => call('dialog:openFiles', o), pickDir: () => call('dialog:pickDir') },
  fs: { isDir: (p) => call('fs:isDir', p) },
  shell: { open: (u) => call('shell:open', u), showItem: (p) => call('shell:showItem', p), openPath: (p) => call('shell:openPath', p) },
  clipboard: { write: (t) => call('clipboard:write', t), image: () => call('clipboard:image') },
  quickUpload: () => call('quick:upload'),
  appInfo: () => call('app:info'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  on,
});
