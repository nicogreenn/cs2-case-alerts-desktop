const { app, BrowserWindow, Tray, Menu, nativeImage, Notification, ipcMain } = require('electron');
const path = require('path');
const axios = require('axios');
const Store = require('./store');
const Watcher = require('./watcher');

let win, tray, watcher, store;

function getTrayIcon() {
  const p = process.platform;
  const icon = p === 'darwin' ? 'trayTemplate.png' : 'tray.png';
  return nativeImage.createFromPath(path.join(__dirname, 'renderer', icon));
}

function createWindow() {
  win = new BrowserWindow({
    width: 940, height: 720,
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('close', (e) => { if (!app.isQuiting) { e.preventDefault(); win.hide(); } });
}

function createTray() {
  tray = new Tray(getTrayIcon());
  const buildMenu = (running) => Menu.buildFromTemplate([
    { label: running ? 'Pause checks' : 'Resume checks', click: () => { if (running) watcher.pause(); else watcher.resume(); tray.setContextMenu(buildMenu(!running)); } },
    { label: 'Open', click: () => win.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuiting = true; app.quit(); } }
  ]);
  tray.setToolTip('CS2 Case Alerts');
  tray.setContextMenu(buildMenu(true));
  tray.on('click', () => win.show());
}

function sendNativeNotification(title, body) { new Notification({ title, body, silent:false }).show(); }

app.whenReady().then(() => {
  store = new Store();
  watcher = new Watcher({
    store,
    onLog: (evt) => win && win.webContents.send('watch-log', evt), // {id,msg}
    onNotify: ({ title, message }) => sendNativeNotification(title, message)
  });

  createWindow(); createTray();

  // Settings + watches
  ipcMain.handle('get-settings', () => store.getSettings());
  ipcMain.handle('save-settings', (_e, s) => { store.saveSettings(s); watcher.reload(); return true; });
  ipcMain.handle('get-watches', () => store.getWatches());
  ipcMain.handle('add-watch', (_e, w) => { store.addWatch(w); return store.getWatches(); });
  ipcMain.handle('remove-watch', (_e, id) => { store.removeWatch(id); return store.getWatches(); });
  ipcMain.handle('update-watch', (_e, { id, patch }) => store.updateWatch(id, patch));

  ipcMain.handle('toggle-running', () => { if (watcher.isRunning()) watcher.pause(); else watcher.resume(); return watcher.isRunning(); });
  ipcMain.handle('get-status', () => ({ running: watcher.isRunning(), nextCheckInSec: watcher.timeUntilNextCheck() }));

  // Fetch image (main process avoids renderer CSP)
  ipcMain.handle('fetch-image', async (_e, { appid, name }) => {
    const url = `https://steamcommunity.com/market/listings/${appid}/${encodeURIComponent(name)}`;
    const res = await axios.get(url, { timeout: 15000 });
    const html = res.data;
    // try og:image first
    const og = /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/.exec(html);
    if (og?.[1]) return og[1];
    // fallback to large listing image
    const im = /market_listing_largeimage.*?src=["']([^"']+)["']/.exec(html);
    if (im?.[1]) return im[1];
    return "";
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(); else win.show();
  });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
