// renderer/renderer.js — full replacement

const $ = (s) => document.querySelector(s);

// UI refs
const logs = $('#logs');
const statusTxt = $('#statusTxt');
const toggleBtn = $('#toggleRun');
const cards = $('#cards');

// ---------- helpers ----------
function toast(t) {
  logs.textContent += `[info] ${t}\n`;
  logs.scrollTop = logs.scrollHeight;
}

function currencySymbol(code) {
  return ({ 1: '$', 2: '£', 3: '€' }[Number(code)] || '');
}
function money(v, code) {
  if (v == null || Number.isNaN(Number(v))) return 'n/a';
  return currencySymbol(code) + Number(v).toFixed(2);
}

// ---------- settings ----------
async function renderSettings() {
  const s = await window.api.getSettings();
  $('#currency').value = s.currency ?? 2;
  $('#interval').value = s.checkEverySeconds ?? 60;
  $('#cooldown').value = s.alertCooldownMinutes ?? 20;
  $('#feeRate').value = s.feeRate ?? 0.15;
  $('#webhook').value = s.discordWebhook ?? '';
  // mirror fee into calculator
  $('#calcFee').value = s.feeRate ?? 0.15;
}

async function saveSettings() {
  const s = {
    currency: Number($('#currency').value),
    checkEverySeconds: Number($('#interval').value),
    alertCooldownMinutes: Number($('#cooldown').value),
    feeRate: Number($('#feeRate').value),
    discordWebhook: $('#webhook').value.trim(),
  };
  await window.api.saveSettings(s);
  $('#calcFee').value = s.feeRate;
  toast('Saved settings');
  calc(); // refresh calculator numbers
}

// ---------- watches: add / render ----------
async function addWatch() {
  const w = {
    appid: Number($('#appid').value || 730),
    market_hash_name: $('#name').value.trim(),
    buyBelowOrEqual: Number($('#buy').value),
    sellAtOrAbove: Number($('#sell').value),
    imageUrl: '',
  };
  if (!w.market_hash_name || !isFinite(w.buyBelowOrEqual) || !isFinite(w.sellAtOrAbove)) {
    toast('Please fill all fields');
    return;
  }
  await window.api.addWatch(w);
  // clear form
  $('#name').value = '';
  $('#buy').value = '';
  $('#sell').value = '';
  await renderWatches();
  await refreshCalcOptions();
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
      <div class="nums">
        Buy ≤ <b>${money(w.buyBelowOrEqual, currency)}</b> •
        Profit ≥ <b>${money(w.sellAtOrAbove, currency)}</b>
      </div>
      <div class="actions">
        <a class="steam" href="https://steamcommunity.com/market/listings/${w.appid}/${encodeURIComponent(w.market_hash_name)}" target="_blank">Open on Steam</a>
        <button class="remove">Remove</button>
      </div>
    </div>
    <pre class="mini-log" id="log-${w.id}"></pre>
  `;

  wrap.querySelector('.remove').addEventListener('click', async () => {
    await window.api.removeWatch(w.id);
    await renderWatches();
    await refreshCalcOptions();
  });

  return wrap;
}

async function renderWatches() {
  const s = await window.api.getSettings();
  const list = await window.api.getWatches();
  const cur = s.currency ?? 2;

  cards.innerHTML = '';
  list.forEach((w) => cards.appendChild(cardEl(w, cur)));
}

// ---------- status / tray ----------
async function refreshStatus() {
  const s = await window.api.getStatus();
  statusTxt.textContent = s.running
    ? `Running • next check in ~${s.nextCheckInSec}s`
    : `Paused`;
  toggleBtn.textContent = s.running ? 'Pause' : 'Resume';
}

// ---------- init listeners ----------
$('#saveSettings').addEventListener('click', saveSettings);
$('#addWatch').addEventListener('click', addWatch);
toggleBtn.addEventListener('click', async () => {
  const running = await window.api.toggleRunning();
  toggleBtn.textContent = running ? 'Pause' : 'Resume';
  refreshStatus();
});

// First render
renderSettings();
renderWatches();
refreshStatus();
setInterval(refreshStatus, 2000);

// ---------- Profit Calculator ----------
const calcSel = $('#calcWatch');
const calcBuy = $('#calcBuy');
const calcRoi = $('#calcRoi');
const calcFee = $('#calcFee');
const calcOut = $('#calcOut');
const applyBtn = $('#applyToWatch');

async function refreshCalcOptions() {
  const watches = await window.api.getWatches();
  calcSel.innerHTML = '';
  watches.forEach((w) => {
    const opt = document.createElement('option');
    opt.value = w.id;
    opt.textContent = `${w.market_hash_name} (buy≤ ${w.buyBelowOrEqual})`;
    calcSel.appendChild(opt);
  });
  if (watches.length) {
    calcSel.value = watches[0].id;
    calcBuy.value = watches[0].buyBelowOrEqual;
  }
  calc();
}

function calc() {
  const B = Number(calcBuy.value);
  const r = Number(calcRoi.value) / 100;
  const f = Number(calcFee.value);
  const cur = Number($('#currency').value) || 2;

  if (!isFinite(B) || !isFinite(r) || !isFinite(f)) {
    calcOut.textContent = 'Enter buy, ROI%, fee';
    return;
  }
  const S = (B * (1 + r)) / (1 - f);      // gross sell target
  const net = S * (1 - f);                 // net after fees
  const profit = net - B;
  const roiPct = (profit / B) * 100;

  calcOut.innerHTML = `
    Sell target (gross): <b>${money(S, cur)}</b> •
    Net after fees: <b>${money(net, cur)}</b> •
    Profit: <b>${money(profit, cur)}</b> (${roiPct.toFixed(1)}%)
  `;
}

document.querySelectorAll('.roiQuick').forEach((btn) =>
  btn.addEventListener('click', () => {
    calcRoi.value = btn.dataset.r;
    calc();
  })
);
[calcBuy, calcRoi].forEach((el) => el.addEventListener('input', calc));

applyBtn.addEventListener('click', async () => {
  const id = calcSel.value;
  if (!id) return;
  const B = Number(calcBuy.value);
  const r = Number(calcRoi.value) / 100;
  const f = Number(calcFee.value);
  const S = Number(((B * (1 + r)) / (1 - f)).toFixed(2));
  await window.api.updateWatch(id, { sellAtOrAbove: S });
  toast(`Applied sell≥ ${S}`);
  await renderWatches();
});

// load calculator options on boot
refreshCalcOptions();

// ---------- Per-watch live logs ----------
window.api.onWatchLog(({ id, msg }) => {
  // mirror to global log
  logs.textContent += msg + '\n';
  logs.scrollTop = logs.scrollHeight;

  // append to that card's mini-log
  const el = document.getElementById(`log-${id}`);
  if (el) {
    el.textContent += msg + '\n';
    el.scrollTop = el.scrollHeight;
  }
});

// When main prefetches thumbnails, it pings this → re-render cards
window.api.onWatchesChanged(() => {
  renderWatches();
});
