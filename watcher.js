const axios = require('axios');

function parsePrice(txt) {
  if (!txt) return null;
  let s = (txt + '').trim().replace(/[^\d,.\-]/g, '');
  if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
  const parts = s.split('.');
  if (parts.length > 2) s = parts.slice(0, -1).join('') + '.' + parts.at(-1);
  const v = parseFloat(s);
  return Number.isNaN(v) ? null : v;
}
const fmt = (v,c) => ({1:'$',2:'£',3:'€'}[c]||'') + (v?.toFixed(2) ?? 'n/a');

class Watcher {
  constructor({ store, onLog, onNotify }) {
    this.store = store;
    this.onLog = onLog || (()=>{});
    this.onNotify = onNotify || (()=>{});
    this.running = true;
    this.lastAlerts = {}; // id -> {buy, sell}
    this._timer = null;
    this._schedule();
  }
  _schedule() {
    if (this._timer) clearTimeout(this._timer);
    const s = this.store.getSettings();
    const interval = Math.max(10, s.checkEverySeconds|0);
    this._timer = setTimeout(() => this._tick().finally(()=>this._schedule()), interval*1000);
    this._nextCheck = Date.now() + interval*1000;
  }
  timeUntilNextCheck(){ return Math.max(0, Math.round((this._nextCheck - Date.now())/1000)); }
  isRunning(){ return this.running; } pause(){ this.running=false; } resume(){ this.running=true; }
  reload(){ this._schedule(); }

  async _tick() {
    if (!this.running) return;
    const s = this.store.getSettings();
    const fee = Number(s.feeRate ?? 0.15);
    const cooldown = (Number(s.alertCooldownMinutes ?? 20))*60*1000;
    const currency = Number(s.currency ?? 2);
    const webhook = (s.discordWebhook ?? '').trim();
    const watches = this.store.getWatches();

    for (const w of watches) {
      const { id, appid=730, market_hash_name, buyBelowOrEqual, sellAtOrAbove } = w;
      if (!id || !market_hash_name) continue;
      if (!this.lastAlerts[id]) this.lastAlerts[id] = { buy: 0, sell: 0 };

      try {
        await new Promise(r => setTimeout(r, 120 + Math.random()*240));
        const { data } = await axios.get('https://steamcommunity.com/market/priceoverview/', {
          params: { appid, market_hash_name, currency }, timeout: 15000,
          headers: { 'User-Agent': 'cs2-case-alerts (desktop)', 'Accept': 'application/json' }
        });
        if (!data?.success) { this.onLog({id, msg:`[warn] fetch failed: ${JSON.stringify(data)}`}); continue; }
        const price = parsePrice(data.lowest_price || data.median_price);
        if (price == null) { this.onLog({id, msg:`[warn] cannot parse price: ${data.lowest_price || data.median_price}`}); continue; }

        const net = price * (1-fee);
        this.onLog({id, msg:`${market_hash_name}: ${fmt(price,currency)} (net≈ ${fmt(net,currency)}) | buy≤${fmt(buyBelowOrEqual,currency)} sell≥${fmt(sellAtOrAbove,currency)}`});

        const now = Date.now();
        // BUY
        if (price <= Number(buyBelowOrEqual) && now - this.lastAlerts[id].buy >= cooldown) {
          this.lastAlerts[id].buy = now;
          const title = `BUY: ${market_hash_name}`;
          const message = `Now ${fmt(price,currency)} (≤ ${fmt(buyBelowOrEqual,currency)})`;
          this.onNotify({ title, message });
          this.onLog({id, msg:`🔔 ${title} — ${message}`});
          if (webhook) try {
            await axios.post(webhook, { embeds:[{ title, description:`${message}\nURL: https://steamcommunity.com/market/listings/${appid}/${encodeURIComponent(market_hash_name)}`, timestamp:new Date().toISOString() }]});
          } catch {}
        }
        // SELL
        if (price >= Number(sellAtOrAbove) && now - this.lastAlerts[id].sell >= cooldown) {
          this.lastAlerts[id].sell = now;
          const title = `SELL: ${market_hash_name}`;
          const message = `Now ${fmt(price,currency)} (≥ ${fmt(sellAtOrAbove,currency)}) • net≈ ${fmt(net,currency)}`;
          this.onNotify({ title, message });
          this.onLog({id, msg:`🔔 ${title} — ${message}`});
          if (webhook) try {
            await axios.post(webhook, { embeds:[{ title, description:`${message}\nURL: https://steamcommunity.com/market/listings/${appid}/${encodeURIComponent(market_hash_name)}`, timestamp:new Date().toISOString() }]});
          } catch {}
        }
      } catch (e) {
        this.onLog({id, msg:`[error] ${e.message || e}`});
      }
    }
  }
}
module.exports = Watcher;
