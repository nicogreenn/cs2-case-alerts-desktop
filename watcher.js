const axios = require('axios');

function parsePrice(txt) {
  if (!txt) return null;
  let s = (txt + '').trim();
  s = s.replace(/[^\d,.\-]/g, '');
  if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
  const parts = s.split('.');
  if (parts.length > 2) s = parts.slice(0, -1).join('') + '.' + parts[parts.length-1];
  const v = parseFloat(s);
  return Number.isNaN(v) ? null : v;
}

function fmt(v, currency) {
  const map = {1:'$',2:'£',3:'€'};
  const sym = map[currency] || '';
  return sym + (v?.toFixed(2) ?? 'n/a');
}

class Watcher {
  constructor({ store, onLog, onNotify }) {
    this.store = store;
    this.onLog = onLog || (()=>{});
    this.onNotify = onNotify || (()=>{});
    this.running = true;
    this.lastAlerts = {}; // key -> { buy: Date, sell: Date }
    this._timer = null;
    this._schedule();
  }

  _schedule() {
    if (this._timer) clearTimeout(this._timer);
    const s = this.store.getSettings();
    const interval = Math.max(10, s.checkEverySeconds|0);
    this._timer = setTimeout(() => this._tick().catch(()=>{}).finally(()=>this._schedule()), interval*1000);
    this._nextCheck = Date.now() + interval*1000;
  }

  timeUntilNextCheck() {
    return Math.max(0, Math.round((this._nextCheck - Date.now())/1000));
  }

  isRunning() { return this.running; }
  pause() { this.running = false; }
  resume() { this.running = true; }

  reload() { this._schedule(); }

  async _tick() {
    if (!this.running) return;
    const s = this.store.getSettings();
    const feeRate = Number(s.feeRate ?? 0.15);
    const cooldownMs = (Number(s.alertCooldownMinutes ?? 20)) * 60 * 1000;
    const currency = Number(s.currency ?? 2);
    const webhook = (s.discordWebhook ?? '').trim();
    const watches = this.store.getWatches();

    for (const w of watches) {
      const { appid = 730, market_hash_name, buyBelowOrEqual, sellAtOrAbove } = w;
      if (!market_hash_name) continue;

      const key = `${appid}:${market_hash_name}`;
      if (!this.lastAlerts[key]) this.lastAlerts[key] = { buy: 0, sell: 0 };

      try {
        await new Promise(r => setTimeout(r, 150 + Math.random()*300));
        const { data } = await axios.get('https://steamcommunity.com/market/priceoverview/', {
          params: { appid, market_hash_name, currency },
          headers: { 'User-Agent': 'cs2-case-alerts (desktop)', 'Accept': 'application/json' },
          timeout: 15000
        });
        if (!data?.success) {
          this.onLog(`[warn] Failed to fetch ${market_hash_name}: ${JSON.stringify(data)}`);
          continue;
        }
        const raw = data.lowest_price || data.median_price;
        const price = parsePrice(raw);
        if (price == null) {
          this.onLog(`[warn] Could not parse price for ${market_hash_name}: ${raw}`);
          continue;
        }
        const net = price * (1 - feeRate);
        this.onLog(`${market_hash_name}: ${fmt(price, currency)} (net est. ${fmt(net, currency)}) | buy≤${fmt(buyBelowOrEqual, currency)}, sell≥${fmt(sellAtOrAbove, currency)}`);

        const now = Date.now();
        // BUY
        if (price <= Number(buyBelowOrEqual) && now - this.lastAlerts[key].buy >= cooldownMs) {
          this.lastAlerts[key].buy = now;
          const title = `BUY: ${market_hash_name}`;
          const message = `Now ${fmt(price, currency)} (≤ ${fmt(buyBelowOrEqual, currency)})`;
          this.onNotify({ title, message });
          this._discord(webhook, title, `${message}\nURL: https://steamcommunity.com/market/listings/${appid}/${encodeURIComponent(market_hash_name)}`);
        }
        // SELL
        if (price >= Number(sellAtOrAbove) && now - this.lastAlerts[key].sell >= cooldownMs) {
          this.lastAlerts[key].sell = now;
          const title = `SELL: ${market_hash_name}`;
          const message = `Now ${fmt(price, currency)} (≥ ${fmt(sellAtOrAbove, currency)}) • est. net ${fmt(net, currency)}`;
          this.onNotify({ title, message });
          this._discord(webhook, title, `${message}\nURL: https://steamcommunity.com/market/listings/${appid}/${encodeURIComponent(market_hash_name)}`);
        }
      } catch (err) {
        this.onLog(`[error] ${market_hash_name}: ${err.message || err}`);
      }
    }
  }

  async _discord(webhook, title, description) {
    if (!webhook) return;
    try {
      await axios.post(webhook, { embeds: [{ title, description, timestamp: new Date().toISOString() }] }, { timeout: 10000 });
    } catch { /* ignore */ }
  }
}

module.exports = Watcher;
