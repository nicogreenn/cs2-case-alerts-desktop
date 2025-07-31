const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function id() { return `${Date.now()}-${Math.random().toString(36).slice(2,7)}`; }

class Store {
  constructor() {
    this.base = app.getPath('userData');
    this.settingsPath = path.join(this.base, 'settings.json');
    this.watchesPath = path.join(this.base, 'watches.json');
    this._ensureFiles();
  }
  _ensureFiles() {
    if (!fs.existsSync(this.settingsPath)) {
      fs.writeFileSync(this.settingsPath, JSON.stringify({
        currency: 2, checkEverySeconds: 60, alertCooldownMinutes: 20,
        discordWebhook: "", feeRate: 0.15
      }, null, 2));
    }
    if (!fs.existsSync(this.watchesPath)) {
      const s = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
      const f = Number(s.feeRate ?? 0.15);
      const roi = 0.15; // 15% profit after 15% fee
      const sellFor = (b) => Number(((b * (1 + roi)) / (1 - f)).toFixed(2));
      const seeded = [
        { id: id(), appid: 730, market_hash_name: "Revolution Case",          buyBelowOrEqual: 0.32, sellAtOrAbove: sellFor(0.32), imageUrl: "" },
        { id: id(), appid: 730, market_hash_name: "Kilowatt Case",            buyBelowOrEqual: 0.26, sellAtOrAbove: sellFor(0.26), imageUrl: "" },
        { id: id(), appid: 730, market_hash_name: "Fracture Case",            buyBelowOrEqual: 0.24, sellAtOrAbove: sellFor(0.24), imageUrl: "" },
        { id: id(), appid: 730, market_hash_name: "Dreams & Nightmares Case", buyBelowOrEqual: 1.37, sellAtOrAbove: sellFor(1.37), imageUrl: "" }
      ];
      fs.writeFileSync(this.watchesPath, JSON.stringify(seeded, null, 2));
    }
  }
  _readWatches() { return JSON.parse(fs.readFileSync(this.watchesPath, 'utf8')); }
  _writeWatches(all) { fs.writeFileSync(this.watchesPath, JSON.stringify(all, null, 2)); }

  getSettings() { return JSON.parse(fs.readFileSync(this.settingsPath, 'utf8')); }
  saveSettings(s) { fs.writeFileSync(this.settingsPath, JSON.stringify(s, null, 2)); }

  getWatches() { return this._readWatches(); }
  addWatch(w) {
    const all = this._readWatches();
    if (!w.id) w.id = id();
    all.push(w);
    this._writeWatches(all);
  }
  updateWatch(wid, patch) {
    const all = this._readWatches();
    const idx = all.findIndex(x => x.id === wid);
    if (idx !== -1) {
      all[idx] = { ...all[idx], ...patch };
      this._writeWatches(all);
      return all[idx];
    }
    return null;
  }
  removeWatch(wid) {
    const all = this._readWatches().filter(x => x.id !== wid);
    this._writeWatches(all);
  }
}

module.exports = Store;
