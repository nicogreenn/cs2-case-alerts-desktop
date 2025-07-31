const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),

  getWatches: () => ipcRenderer.invoke('get-watches'),
  addWatch: (w) => ipcRenderer.invoke('add-watch', w),
  removeWatch: (id) => ipcRenderer.invoke('remove-watch', id),

  toggleRunning: () => ipcRenderer.invoke('toggle-running'),
  getStatus: () => ipcRenderer.invoke('get-status'),

  onLog: (cb) => ipcRenderer.on('log', (_e, msg) => cb(msg))
});
