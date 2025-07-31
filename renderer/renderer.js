const $ = (s) => document.querySelector(s);
const logs = $('#logs');
const statusTxt = $('#statusTxt');
const toggleBtn = $('#toggleRun');
const cards = $('#cards');

const money = (v, cur) => ({1:'$',2:'£',3:'€'}[cur]||'') + Number(v).toFixed(2);

function toast(t){ logs.textContent += `[info] ${t}\n`; logs.scrollTop = logs.scrollHeight; }

async function renderSettings() {
  const s = await window.api.getSettings();
  $('#currency').value = s.currency ?? 2;
  $('#interval').value = s.checkEverySeconds ?? 60;
  $('#cooldown').value = s.alertCooldownMinutes ?? 20;
  $('#feeRate').value = s.feeRate ?? 0.15;
  $('#webhook').value = s.discordWebhook ?? "";
  $('#calcFee').value = s.feeRate ?? 0.15;
}
async function saveSettings() {
  const s = {
    currency: Number($('#currency').value),
    checkEverySeconds: Number($('#interval').value),
    alertCooldownMinutes: Number($('#cooldown').value),
    feeRate: Number($('#feeRate').value),
    discordWebhook: $('#webhook').value.trim()
  };
  await window.api.saveSettings(s);
  $('#calcFee').value = s.feeRate;
  toast('Saved settings'); calc();
}

async function addWatch() {
  const w = {
    appid: Number($('#appid').value || 730),
    market_hash_name: $('#name').value.trim(),
    buyBelowOrEqual: Number($('#buy').value),
    sellAtOrAbove: Number($('#sell').value),
    imageUrl: ""
  };
  if (!w.market_hash_name || !isFinite(w.buyBelowOrEqual) || !isFinite(w.sellAtOrAbove)) return toast('Please fill all fields');
  await window.api.addWatch(w);
  $('#name').value=''; $('#buy').value=''; $('#sell').value='';
  renderWatches(); refreshCalcOptions();
}

async function renderWatches() {
  const s = await window.api.getSettings();
  const list = await window.api.getWatches();
  cards.innerHTML = '';
  list.forEach(w => cards.appendChild(cardEl(w, s.currency ?? 2)));
  refreshCalcOptions();
}

function cardEl(w, currency) {
  const wrap = document.createElement('div');
  wrap.className = 'case-card';
  wrap.innerHTML = `
    <div class="imgbox">
      <img src="${w.imageUrl || ''}" alt="${w.market_hash_name}" onerror="this.style.display='none'">
    </div>
    <div class="meta">
      <div class="title">${w.market_hash_name}</div>
      <div class="nums">Buy ≤ <b>${money(w.buyBelowOrEqual, currency)}</b> • Profit ≥ <b>${money(w.sellAtOrAbove, currency)}</b></div>
      <div class="actions">
        <a class="steam" href="https://steamcommunity.com/market/listings/${w.appid}/${encodeURIComponent(w.market_hash_name)}" target="_blank">Open on Steam</a>
        <button class="fetch">Fetch image</button>
        <button class="remove">Remove</button>
      </div>
    </div>
    <pre class="mini-log" id="log-${w.id}"></pre>
  `;
  wrap.querySelector('.remove').addEventListener('click', async () => { await window.api.removeWatch(w.id); renderWatches(); });
  wrap.querySelector('.fetch').addEventListener('click', async () => {
    const url = await window.api.fetchImage(w.appid, w.market_hash_name);
    if (url) { await window.api.updateWatch(w.id, { imageUrl: url }); renderWatches(); }
    else toast('Could not find an image for this case.');
  });
  return wrap;
}

async function refreshStatus() {
  const s = await window.api.getStatus();
  statusTxt.textContent = s.running ? `Running • next check in ~${s.nextCheckInSec}s` : `Paused`;
  toggleBtn.textContent = s.running ? 'Pause' : 'Resume';
}

$('#saveSettings').addEventListener('click', saveSettings);
$('#addWatch').addEventListener('click', addWatch);
toggleBtn.addEventListener('click', async () => { const r = await window.api.toggleRunning(); toggleBtn.textContent = r?'Pause':'Resume'; refreshStatus(); });

renderSettings();
renderWatches();
refreshStatus();
setInterval(refreshStatus, 2000);

// ===== Profit Calculator (unchanged behavior)
const calcSel = $('#calcWatch'), calcBuy = $('#calcBuy'), calcRoi = $('#calcRoi'), calcFee = $('#calcFee'), calcOut = $('#calcOut'), applyBtn = $('#applyToWatch');

function refreshCalcOptions() {
  window.api.getWatches().then(ws => {
    calcSel.innerHTML = '';
    ws.forEach(w => {
      const opt = document.createElement('option');
      opt.value = w.id; opt.textContent = `${w.market_hash_name} (buy≤ ${w.buyBelowOrEqual})`; calcSel.appendChild(opt);
    });
    if (ws.length){ calcSel.value = ws[0].id; calcBuy.value = ws[0].buyBelowOrEqual; }
    calc();
  });
}
function calc(){
  const B = Number(calcBuy.value), r = Number(calcRoi.value)/100, f = Number(calcFee.value);
  if (!isFinite(B)||!isFinite(r)||!isFinite(f)) { calcOut.textContent = 'Enter buy, ROI%, fee'; return; }
  const S = (B*(1+r))/(1-f), net = S*(1-f), profit = net - B, roi = (profit/B)*100;
  const cur = Number($('#currency').value)||2;
  calcOut.innerHTML = `Sell target (gross): <b>${money(S,cur)}</b> • Net after fees: <b>${money(net,cur)}</b> • Profit: <b>${money(profit,cur)}</b> (${roi.toFixed(1)}%)`;
}
document.querySelectorAll('.roiQuick').forEach(btn => btn.addEventListener('click', () => { calcRoi.value = btn.dataset.r; calc(); }));
[calcBuy, calcRoi].forEach(el => el.addEventListener('input', calc));
applyBtn.addEventListener('click', async () => {
  const id = calcSel.value; if (!id) return;
  const B = Number(calcBuy.value), r = Number(calcRoi.value)/100, f = Number(calcFee.value);
  const S = Number(((B*(1+r))/(1-f)).toFixed(2));
  await window.api.updateWatch(id, { sellAtOrAbove: S }); toast(`Applied sell≥ ${S}`); renderWatches();
});
refreshCalcOptions();

// ===== Per-watch live logs =====
window.api.onWatchLog(({ id, msg }) => {
  const el = document.getElementById(`log-${id}`);
  if (el) { el.textContent += msg + '\n'; el.scrollTop = el.scrollHeight; }
  logs.textContent += msg + '\n'; logs.scrollTop = logs.scrollHeight; // also mirror to global
});
