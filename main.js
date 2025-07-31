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
    width: 940,
    height: 720,
    show: false,                         // avoid white flash
    backgroundColor: '#0b0d10',          // dark window bg
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
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

function sendNativeNotification(title, body) {
  new Notification({ title, body, silent: false }).show();
}

// --- robust thumbnail fetcher ---
async function fetchImageUrl(appid, name) {
  const url = `https://steamcommunity.com/market/listings/${appid}/${encodeURIComponent(name)}`;
  const { data: html } = await axios.get(url, {
    timeout: 20000,
    headers: {
      // mimic a real browser
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });

  // 1) og:image
  let m = /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i.exec(html);
  if (m?.[1]) return m[1];

  // 2) twitter:image
  m = /<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i.exec(html);
  if (m?.[1]) return m[1];

  // 3) listing big image
  m = /market_listing_largeimage.*?src=["']([^"']+)["']/i.exec(html);
  if (m?.[1]) return m[1];

  // 4) economy image from g_rgAssets (icon_url)
  // Try to find something like "icon_url":"<hash>"
  const icon = /"icon_url"\s*:\s*"([^"]+)"/.exec(html)?.[1];
  if (icon) {
    return `https://community.cloudflare.steamstatic.com/economy/image/${icon}`;
  }

  return "";
}

// --- prefetch any missing images on boot ---
async function prefetchMissingImages() {
  try {
    const watches = store.getWatches();
    let updated = false;
    for (const w of watches) {
      if (!w.imageUrl) {
        try {
          await new Promise(r => setTimeout(r, 120 + Math.random() * 240)); // polite jitter
          const url = await fetchImageUrl(w.appid || 730, w.market_hash_name);
          if (url) {
            store.updateWatch(w.id, { imageUrl: url });
            updated = true;
          }
        } catch {
          // ignore per-item errors
        }
      }
    }
    if (updated && win) win.webContents.send('watches-changed'); // tell renderer to refresh cards
  } catch {}
}

app.whenReady().then(async () => {
  store = new Store();
  watcher = new Watcher({
    store,
    onLog: (evt) => win && win.webContents.send('watch-log', evt), // {id,msg}
    onNotify: ({ title, message }) => sendNativeNotification(title, message)
  });

  createWindow();
  createTray();

  // Settings + watches IPC
  ipcMain.handle('get-settings', () => store.getSettings());
  ipcMain.handle('save-settings', (_e, s) => { store.saveSettings(s); watcher.reload(); return true; });
  ipcMain.handle('get-watches', () => store.getWatches());
  ipcMain.handle('add-watch', (_e, w) => { store.addWatch(w); return store.getWatches(); });
  ipcMain.handle('remove-watch', (_e, id) => { store.removeWatch(id); return store.getWatches(); });
  ipcMain.handle('update-watch', (_e, { id, patch }) => store.updateWatch(id, patch));

  ipcMain.handle('toggle-running', () => { if (watcher.isRunning()) watcher.pause(); else watcher.resume(); return watcher.isRunning(); });
  ipcMain.handle('get-status', () => ({ running: watcher.isRunning(), nextCheckInSec: watcher.timeUntilNextCheck() }));

  // still expose manual fetch-image (optional)
  ipcMain.handle('fetch-image', async (_e, { appid, name }) => fetchImageUrl(appid, name));

  // do the prefetch in background
  prefetchMissingImages();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(); else win.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
