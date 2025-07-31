const fs = require('fs');
const path = require('path');
const { app } = require('electron');

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
        currency: 2,                 // GBP
        checkEverySeconds: 60,
        alertCooldownMinutes: 20,
        discordWebhook: "",
        feeRate: 0.15
      }, null, 2));
    }
    if (!fs.existsSync(this.watchesPath)) {
      const s = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
      const f = Number(s.feeRate ?? 0.15);
      const roi = 0.15; // 15% target profit after fees
      const sellFor = (b) => Number(((b * (1 + roi)) / (1 - f)).toFixed(2));
      const seeded = [
        { appid: 730, market_hash_name: "Revolution Case",          buyBelowOrEqual: 0.32, sellAtOrAbove: sellFor(0.32) },
        { appid: 730, market_hash_name: "Kilowatt Case",            buyBelowOrEqual: 0.26, sellAtOrAbove: sellFor(0.26) },
        { appid: 730, market_hash_name: "Fracture Case",            buyBelowOrEqual: 0.24, sellAtOrAbove: sellFor(0.24) },
        { appid: 730, market_hash_name: "Dreams & Nightmares Case", buyBelowOrEqual: 1.37, sellAtOrAbove: sellFor(1.37) }
      ];
      fs.writeFileSync(this.watchesPath, JSON.stringify(seeded, null, 2));
    }
  }
  getSettings() {
    return JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
  }
  saveSettings(s) {
    fs.writeFileSync(this.settingsPath, JSON.stringify(s, null, 2));
  }
  getWatches() {
    return JSON.parse(fs.readFileSync(this.watchesPath, 'utf8'));
  }
  addWatch(w) {
    const all = this.getWatches();
    w.id = `${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    all.push(w);
    fs.writeFileSync(this.watchesPath, JSON.stringify(all, null, 2));
  }
  removeWatch(id) {
    const all = this.getWatches().filter(x => x.id !== id);
    fs.writeFileSync(this.watchesPath, JSON.stringify(all, null, 2));
  }
}

module.exports = Store;
