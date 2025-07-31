const $ = (s) => document.querySelector(s);
const tbody = $('#watchTable tbody');
const logs = $('#logs');
const statusTxt = $('#statusTxt');
const toggleBtn = $('#toggleRun');

function row(w) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${w.appid}</td>
    <td>${w.market_hash_name}</td>
    <td>${w.buyBelowOrEqual}</td>
    <td>${w.sellAtOrAbove}</td>
    <td><button data-id="${w.id}">Remove</button></td>
  `;
  tr.querySelector('button').addEventListener('click', async (e) => {
    await window.api.removeWatch(e.target.getAttribute('data-id'));
    renderWatches();
    refreshCalcOptions();
  });
  return tr;
}

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
  toast('Saved settings');
  calc();
}

async function renderWatches() {
  const list = await window.api.getWatches();
  tbody.innerHTML = '';
  list.forEach(w => tbody.appendChild(row(w)));
}

function toast(t) {
  logs.textContent += `[info] ${t}\n";
  logs.scrollTop = logs.scrollHeight;
}

async function addWatch() {
  const w = {
    appid: Number($('#appid').value || 730),
    market_hash_name: $('#name').value.trim(),
    buyBelowOrEqual: Number($('#buy').value),
    sellAtOrAbove: Number($('#sell').value)
  };
  if (!w.market_hash_name || !isFinite(w.buyBelowOrEqual) || !isFinite(w.sellAtOrAbove)) {
    toast('Please fill all fields');
    return;
  }
  await window.api.addWatch(w);
  $('#name').value = ''; $('#buy').value = ''; $('#sell').value = '';
  renderWatches();
  refreshCalcOptions();
}

async function refreshStatus() {
  const s = await window.api.getStatus();
  statusTxt.textContent = s.running
    ? `Running • next check in ~${s.nextCheckInSec}s`
    : `Paused`;
  toggleBtn.textContent = s.running ? 'Pause' : 'Resume';
}

window.api.onLog((msg) => {
  logs.textContent += msg + '\n';
  logs.scrollTop = logs.scrollHeight;
});

$('#saveSettings').addEventListener('click', saveSettings);
$('#addWatch').addEventListener('click', addWatch);
toggleBtn.addEventListener('click', async () => {
  const running = await window.api.toggleRunning();
  toggleBtn.textContent = running ? 'Pause' : 'Resume';
  refreshStatus();
});

renderSettings();
renderWatches();
refreshStatus();
setInterval(refreshStatus, 2000);

// ===== Profit Calculator =====
const calcSel = $('#calcWatch');
const calcBuy = $('#calcBuy');
const calcRoi = $('#calcRoi');
const calcFee = $('#calcFee');
const calcOut = $('#calcOut');
const applyBtn = $('#applyToWatch');

function money(v) {
  const map = {1:'$',2:'£',3:'€'};
  const cur = Number($('#currency').value) || 2;
  const sym = map[cur] || '';
  if (v == null || Number.isNaN(v)) return 'n/a';
  return sym + Number(v).toFixed(2);
}

async function refreshCalcOptions() {
  const watches = await window.api.getWatches();
  calcSel.innerHTML = '';
  watches.forEach((w) => {
    const opt = document.createElement('option');
    opt.value = w.id || `${w.appid}-${w.market_hash_name}`;
    opt.textContent = `${w.market_hash_name} (buy≤ ${w.buyBelowOrEqual})`;
    opt.dataset.buy = w.buyBelowOrEqual;
    calcSel.appendChild(opt);
  });
  if (watches.length) {
    const first = watches[0];
    calcSel.value = first.id || `${first.appid}-${first.market_hash_name}`;
    calcBuy.value = first.buyBelowOrEqual;
  }
  calc();
}

function calc() {
  const B = Number(calcBuy.value);
  const r = Number(calcRoi.value) / 100;
  const f = Number(calcFee.value);
  if (!isFinite(B) || !isFinite(r) || !isFinite(f)) {
    calcOut.textContent = 'Enter buy, ROI%, fee';
    return;
  }
  const S = (B * (1 + r)) / (1 - f);
  const netAfterFees = S * (1 - f);
  const netProfit = netAfterFees - B;
  const impliedROI = (netProfit / B) * 100;
  calcOut.innerHTML = `
    <div>Sell target (gross): <b>${money(S)}</b></div>
    <div>Est. net after fees: <b>${money(netAfterFees)}</b></div>
    <div>Net profit: <b>${money(netProfit)}</b> (${impliedROI.toFixed(1)}%)</div>
  `;
}

document.querySelectorAll('.roiQuick').forEach(btn => {
  btn.addEventListener('click', () => {
    calcRoi.value = btn.dataset.r;
    calc();
  });
});

[calcBuy, calcRoi].forEach(el => el.addEventListener('input', calc));

applyBtn.addEventListener('click', async () => {
  const id = calcSel.value;
  if (!id) return;
  const B = Number(calcBuy.value);
  const r = Number(calcRoi.value) / 100;
  const f = Number(calcFee.value);
  const S = (B * (1 + r)) / (1 - f);

  const watches = await window.api.getWatches();
  const target = watches.find(w => (w.id || `${w.appid}-${w.market_hash_name}`) === id);
  if (!target) return;
  target.sellAtOrAbove = Number(S.toFixed(2));

  if (target.id) {
    await window.api.removeWatch(target.id);
  }
  await window.api.addWatch(target);

  logs.textContent += `[info] Applied sell≥ ${target.sellAtOrAbove} to ${target.market_hash_name}\n`;
  logs.scrollTop = logs.scrollHeight;
  renderWatches();
  refreshCalcOptions();
});

refreshCalcOptions();
