const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),

  getWatches: () => ipcRenderer.invoke('get-watches'),
  addWatch: (w) => ipcRenderer.invoke('add-watch', w),
  removeWatch: (id) => ipcRenderer.invoke('remove-watch', id),
  updateWatch: (id, patch) => ipcRenderer.invoke('update-watch', { id, patch }),

  toggleRunning: () => ipcRenderer.invoke('toggle-running'),
  getStatus: () => ipcRenderer.invoke('get-status'),

  fetchImage: (appid, name) => ipcRenderer.invoke('fetch-image', { appid, name }),

  onWatchLog: (cb) => ipcRenderer.on('watch-log', (_e, evt) => cb(evt)),
  onWatchesChanged: (cb) => ipcRenderer.on('watches-changed', cb)
});
