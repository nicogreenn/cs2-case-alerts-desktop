const { app, BrowserWindow, Tray, Menu, nativeImage, Notification, ipcMain } = require('electron');
const path = require('path');
const Store = require('./store');
const Watcher = require('./watcher');

let win;
let tray;
let watcher;

function getTrayIcon() {
  const p = process.platform;
  const icon = p === 'darwin' ? 'trayTemplate.png' : 'tray.png';
  return nativeImage.createFromPath(path.join(__dirname, 'renderer', icon));
}

function createWindow() {
  win = new BrowserWindow({
    width: 860,
    height: 640,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function createTray() {
  tray = new Tray(getTrayIcon());
  const buildMenu = (running) => Menu.buildFromTemplate([
    { label: running ? 'Pause checks' : 'Resume checks', click: () => {
      if (running) watcher.pause(); else watcher.resume();
      tray.setContextMenu(buildMenu(!running));
    }},
    { label: 'Open', click: () => win.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuiting = true; app.quit(); } }
  ]);
  tray.setToolTip('CS2 Case Alerts');
  tray.setContextMenu(buildMenu(true));
  tray.on('click', () => win.show());
}

function sendNativeNotification(title, body) {
  new Notification({ title, body, silent: false }).show();
}

app.whenReady().then(() => {
  const store = new Store();
  watcher = new Watcher({
    store,
    onLog: (msg) => win && win.webContents.send('log', msg),
    onNotify: ({ title, message }) => sendNativeNotification(title, message)
  });

  createWindow();
  createTray();

  ipcMain.handle('get-settings', () => store.getSettings());
  ipcMain.handle('save-settings', (_e, s) => { store.saveSettings(s); watcher.reload(); return true; });

  ipcMain.handle('get-watches', () => store.getWatches());
  ipcMain.handle('add-watch', (_e, w) => { store.addWatch(w); return store.getWatches(); });
  ipcMain.handle('remove-watch', (_e, id) => { store.removeWatch(id); return store.getWatches(); });
  ipcMain.handle('toggle-running', () => {
    if (watcher.isRunning()) watcher.pause(); else watcher.resume();
    return watcher.isRunning();
  });
  ipcMain.handle('get-status', () => ({
    running: watcher.isRunning(),
    nextCheckInSec: watcher.timeUntilNextCheck()
  }));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else win.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
