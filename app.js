/**
 * HashVerify — app.js
 * Features:
 *   - Hash File/Teks: MD5, SHA-1, SHA-256, SHA-512
 *   - HMAC: HMAC-SHA1/256/512 dengan secret key
 *   - Avalanche Effect Visualizer
 *   - Hash Benchmark & bar chart
 *   - History (localStorage)
 *   - Compare hash, copy, export
 */

'use strict';

// ============================================================
// UTILITIES
// ============================================================

/** Convert ArrayBuffer to hex string */
function bufToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Read File as ArrayBuffer */
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsArrayBuffer(file);
  });
}

/** Hash ArrayBuffer with Web Crypto API */
async function hashBuffer(algo, buffer) {
  if (algo === 'MD5') {
    // SparkMD5 expects ArrayBuffer
    return SparkMD5.ArrayBuffer.hash(buffer);
  }
  const hashBuffer = await crypto.subtle.digest(algo, buffer);
  return bufToHex(hashBuffer);
}

/** Hash a UTF-8 string */
async function hashString(algo, str) {
  const enc = new TextEncoder();
  const buf = enc.encode(str);
  if (algo === 'MD5') return SparkMD5.hash(str);
  const hashBuf = await crypto.subtle.digest(algo, buf);
  return bufToHex(hashBuf);
}

/** Format bytes to human-readable */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

/** Format current datetime */
function nowString() {
  return new Date().toLocaleString('id-ID', { hour12: false });
}

/** Copy to clipboard */
async function copyText(text, btn) {
  await navigator.clipboard.writeText(text);
  btn.textContent = '✓ Copied';
  btn.classList.add('copied');
  setTimeout(() => {
    btn.textContent = 'Copy';
    btn.classList.remove('copied');
  }, 2000);
}

// ============================================================
// TAB NAVIGATION
// ============================================================

const tabBtns    = document.querySelectorAll('.tab-btn');
const tabPanels  = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    tabPanels.forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ============================================================
// DROPZONE HELPER
// ============================================================

/**
 * Setup a dropzone element.
 * @param {string} dropzoneId
 * @param {string} fileInputId
 * @param {string} fileInfoId
 * @param {string} fileNameId
 * @param {string|null} fileSizeId
 * @param {function} onFile - callback(file)
 */
function setupDropzone(dropzoneId, fileInputId, fileInfoId, fileNameId, fileSizeId, onFile) {
  const dz        = document.getElementById(dropzoneId);
  const input     = document.getElementById(fileInputId);
  const infoWrap  = document.getElementById(fileInfoId);
  const nameEl    = document.getElementById(fileNameId);
  const sizeEl    = fileSizeId ? document.getElementById(fileSizeId) : null;

  dz.addEventListener('click', () => input.click());

  dz.addEventListener('dragover', e => {
    e.preventDefault();
    dz.classList.add('dragover');
  });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  input.addEventListener('change', () => {
    if (input.files[0]) handleFile(input.files[0]);
  });

  function handleFile(file) {
    nameEl.textContent = file.name;
    if (sizeEl) sizeEl.textContent = formatBytes(file.size);
    infoWrap.hidden = false;
    onFile(file);
  }
}

// ============================================================
// TAB 1 — HASH FILE / TEXT
// ============================================================

let hashCurrentFile = null;
let hashCurrentMode = 'file'; // 'file' | 'text'
let hashLastResults = {}; // { algo: hexString }

const modeFilBtn  = document.getElementById('btn-mode-file');
const modeTxtBtn  = document.getElementById('btn-mode-text');
const dropzoneEl  = document.getElementById('dropzone');
const txtWrapper  = document.getElementById('text-input-wrapper');
const txtInput    = document.getElementById('text-input');
const progressWrap= document.getElementById('progress-wrap');
const progressBar = document.getElementById('progress-bar');
const progressLbl = document.getElementById('progress-label');
const hashResults = document.getElementById('hash-results');
const hashTable   = document.getElementById('hash-table');

// Mode toggle
modeFilBtn.addEventListener('click', () => {
  hashCurrentMode = 'file';
  modeFilBtn.classList.add('active');
  modeTxtBtn.classList.remove('active');
  dropzoneEl.hidden = false;
  txtWrapper.hidden = true;
});
modeTxtBtn.addEventListener('click', () => {
  hashCurrentMode = 'text';
  modeTxtBtn.classList.add('active');
  modeFilBtn.classList.remove('active');
  dropzoneEl.hidden = true;
  txtWrapper.hidden = false;
});

// Dropzone
setupDropzone('dropzone', 'file-input', 'file-info', 'file-name-display', 'file-size-display', file => {
  hashCurrentFile = file;
});

// Hash button
document.getElementById('btn-hash').addEventListener('click', async () => {
  const selectedAlgos = [...document.querySelectorAll('.algo-checkboxes input:checked')]
    .map(cb => cb.value);

  if (selectedAlgos.length === 0) {
    alert('Pilih minimal satu algoritma.');
    return;
  }

  if (hashCurrentMode === 'file' && !hashCurrentFile) {
    alert('Pilih file terlebih dahulu.');
    return;
  }
  if (hashCurrentMode === 'text' && !txtInput.value.trim()) {
    alert('Masukkan teks terlebih dahulu.');
    return;
  }

  progressWrap.hidden = false;
  progressBar.style.width = '0%';
  progressLbl.textContent = 'Memproses...';
  hashResults.hidden = true;
  hashLastResults = {};

  try {
    let buf;
    let sourceName;

    if (hashCurrentMode === 'file') {
      progressLbl.textContent = 'Membaca file...';
      progressBar.style.width = '30%';
      buf = await readFileAsArrayBuffer(hashCurrentFile);
      sourceName = hashCurrentFile.name;
    } else {
      sourceName = '(teks)';
    }

    hashTable.innerHTML = '';
    const results = {};

    for (let i = 0; i < selectedAlgos.length; i++) {
      const algo = selectedAlgos[i];
      progressLbl.textContent = `Menghitung ${algo}...`;
      progressBar.style.width = `${30 + ((i + 1) / selectedAlgos.length) * 65}%`;

      let hex;
      if (hashCurrentMode === 'file') {
        hex = await hashBuffer(algo, buf);
      } else {
        hex = await hashString(algo, txtInput.value);
      }
      results[algo] = hex;
      renderHashRow(hashTable, algo, hex);
    }

    hashLastResults = results;
    progressBar.style.width = '100%';
    progressLbl.textContent = 'Selesai!';
    setTimeout(() => { progressWrap.hidden = true; }, 800);

    hashResults.hidden = false;

    // Save to history
    saveHistory(sourceName, results);
    renderHistory();

  } catch (err) {
    progressWrap.hidden = true;
    alert('Error: ' + err.message);
  }
});

document.getElementById('btn-clear-hash').addEventListener('click', () => {
  hashCurrentFile = null;
  hashLastResults = {};
  document.getElementById('file-info').hidden = true;
  document.getElementById('file-input').value = '';
  txtInput.value = '';
  hashResults.hidden = true;
  progressWrap.hidden = true;
  document.getElementById('compare-result').hidden = true;
});

// Compare
document.getElementById('btn-compare').addEventListener('click', () => {
  const input = document.getElementById('compare-input').value.trim().toLowerCase();
  const resultEl = document.getElementById('compare-result');
  if (!input) { alert('Masukkan hash yang ingin dibandingkan.'); return; }
  if (Object.keys(hashLastResults).length === 0) { alert('Hash dulu filenya.'); return; }

  const match = Object.values(hashLastResults).some(h => h.toLowerCase() === input);
  resultEl.hidden = false;
  if (match) {
    const algo = Object.entries(hashLastResults).find(([, v]) => v.toLowerCase() === input)?.[0];
    resultEl.className = 'compare-result match';
    resultEl.textContent = `✅ MATCH — Cocok dengan ${algo}. File tidak berubah (integritas terjaga).`;
  } else {
    resultEl.className = 'compare-result no-match';
    resultEl.textContent = `❌ NO MATCH — Hash tidak cocok dengan algoritma mana pun. File mungkin telah dimodifikasi.`;
  }
});

// Export
document.getElementById('btn-export').addEventListener('click', () => {
  if (Object.keys(hashLastResults).length === 0) return;
  const source = hashCurrentMode === 'file' ? hashCurrentFile?.name : '(teks input)';
  let txt = `HashVerify Export\n${nowString()}\nSource: ${source}\n\n`;
  for (const [algo, hex] of Object.entries(hashLastResults)) {
    txt += `${algo.padEnd(10)} ${hex}\n`;
  }
  downloadText(txt, `hash_${Date.now()}.txt`);
});

// ============================================================
// RENDER HELPER
// ============================================================

function renderHashRow(container, algo, hex) {
  const row = document.createElement('div');
  row.className = 'hash-row';
  row.innerHTML = `
    <span class="hash-algo">${algo}</span>
    <span class="hash-value">${hex}</span>
    <button class="btn-copy">Copy</button>
  `;
  row.querySelector('.btn-copy').addEventListener('click', e => copyText(hex, e.target));
  container.appendChild(row);
}

function downloadText(content, filename) {
  const blob = new Blob([content], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// ============================================================
// TAB 2 — HMAC
// ============================================================

let hmacFile = null;
let hmacLastDigest = '';

setupDropzone('hmac-dropzone', 'hmac-file-input', 'hmac-file-info', 'hmac-file-name', null, file => {
  hmacFile = file;
});

// Toggle key visibility
const keyInput = document.getElementById('hmac-key');
document.getElementById('btn-toggle-key').addEventListener('click', () => {
  keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
});

// Generate random key
document.getElementById('btn-gen-key').addEventListener('click', () => {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  keyInput.type = 'text';
  keyInput.value = bufToHex(arr);
});

document.getElementById('btn-hmac').addEventListener('click', async () => {
  if (!hmacFile) { alert('Pilih file terlebih dahulu.'); return; }
  const key = keyInput.value.trim();
  if (!key) { alert('Masukkan secret key.'); return; }
  const algo = document.getElementById('hmac-algo').value;

  try {
    const enc   = new TextEncoder();
    const keyBuf = enc.encode(key);
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyBuf,
      { name: 'HMAC', hash: algo },
      false,
      ['sign']
    );

    const fileBuf  = await readFileAsArrayBuffer(hmacFile);
    const sigBuf   = await crypto.subtle.sign('HMAC', cryptoKey, fileBuf);
    const hex      = bufToHex(sigBuf);
    hmacLastDigest = hex;

    const hmacTable = document.getElementById('hmac-table');
    hmacTable.innerHTML = '';
    renderHashRow(hmacTable, `HMAC-${algo}`, hex);

    document.getElementById('hmac-results').hidden = false;
    document.getElementById('hmac-compare-result').hidden = true;
  } catch (err) {
    alert('Error HMAC: ' + err.message);
  }
});

document.getElementById('btn-clear-hmac').addEventListener('click', () => {
  hmacFile = null;
  hmacLastDigest = '';
  document.getElementById('hmac-file-info').hidden = true;
  document.getElementById('hmac-file-input').value = '';
  keyInput.value = '';
  document.getElementById('hmac-results').hidden = true;
});

document.getElementById('btn-hmac-compare').addEventListener('click', () => {
  const input = document.getElementById('hmac-compare-input').value.trim().toLowerCase();
  const el    = document.getElementById('hmac-compare-result');
  if (!input || !hmacLastDigest) { alert('Generate HMAC dan masukkan nilai pembanding.'); return; }
  el.hidden = false;
  if (input === hmacLastDigest.toLowerCase()) {
    el.className = 'compare-result match';
    el.textContent = '✅ VALID — HMAC cocok. File autentik dan tidak dimodifikasi.';
  } else {
    el.className = 'compare-result no-match';
    el.textContent = '❌ INVALID — HMAC tidak cocok. File mungkin dimodifikasi atau key berbeda.';
  }
});

// ============================================================
// TAB 3 — AVALANCHE EFFECT
// ============================================================

document.getElementById('btn-avalanche').addEventListener('click', async () => {
  const textA = document.getElementById('av-text-a').value;
  const textB = document.getElementById('av-text-b').value;
  const algo  = document.getElementById('av-algo').value;

  if (!textA || !textB) { alert('Isi kedua teks.'); return; }

  const [hexA, hexB] = await Promise.all([
    hashString(algo, textA),
    hashString(algo, textB)
  ]);

  // Convert hex to binary string
  const toBin = hex => hex.split('').map(c => parseInt(c, 16).toString(2).padStart(4, '0')).join('');
  const binA = toBin(hexA);
  const binB = toBin(hexB);

  let diff = 0;
  for (let i = 0; i < binA.length; i++) {
    if (binA[i] !== binB[i]) diff++;
  }
  const pct = ((diff / binA.length) * 100).toFixed(1);

  // Render grid
  const grid = document.getElementById('avalanche-grid');
  grid.innerHTML = `
    <div class="av-card">
      <div class="av-card__label">Teks A — Hash</div>
      <div class="av-card__hash">${hexA}</div>
    </div>
    <div class="av-card">
      <div class="av-card__label">Teks B — Hash</div>
      <div class="av-card__hash">${hexB}</div>
    </div>
    <div class="av-stat">
      <div class="av-stat__number">${pct}%</div>
      <div class="av-stat__label">bit berubah (${diff} dari ${binA.length} bit)</div>
    </div>
  `;

  // Bit visualization
  const bitVisual = document.getElementById('bit-visual');
  bitVisual.innerHTML = '';
  for (let i = 0; i < binA.length; i++) {
    const bit = document.createElement('div');
    bit.className = 'bit ' + (binA[i] !== binB[i] ? 'changed' : 'same');
    bitVisual.appendChild(bit);
  }

  document.getElementById('avalanche-results').hidden = false;
});

// ============================================================
// TAB 4 — BENCHMARK
// ============================================================

let benchFile = null;

setupDropzone('bench-dropzone', 'bench-file-input', 'bench-file-info', 'bench-file-name', null, file => {
  benchFile = file;
});

const BENCH_ALGOS = [
  { name: 'MD5',     bits: 128, security: 'weak' },
  { name: 'SHA-1',   bits: 160, security: 'deprecated' },
  { name: 'SHA-256', bits: 256, security: 'strong' },
  { name: 'SHA-512', bits: 512, security: 'strong' },
];
const SECURITY_LABEL = { weak: '⚠️ Lemah', deprecated: '⚡ Deprecated', strong: '✅ Aman' };

document.getElementById('btn-benchmark').addEventListener('click', async () => {
  if (!benchFile) { alert('Pilih file terlebih dahulu.'); return; }
  const iters = parseInt(document.getElementById('bench-iter').value);
  const buf = await readFileAsArrayBuffer(benchFile);
  const times = {};

  for (const { name } of BENCH_ALGOS) {
    let total = 0;
    for (let i = 0; i < iters; i++) {
      const t0 = performance.now();
      await hashBuffer(name, buf.slice(0)); // slice to avoid detached buffer issues
      total += performance.now() - t0;
    }
    times[name] = (total / iters).toFixed(2);
  }

  // Table
  const wrap = document.getElementById('bench-table-wrap');
  let html = `<table class="bench-table">
    <thead><tr>
      <th>Algoritma</th><th>Output (bit)</th><th>Waktu Rata-rata</th><th>Keamanan</th>
    </tr></thead><tbody>`;
  for (const { name, bits, security } of BENCH_ALGOS) {
    html += `<tr>
      <td><strong>${name}</strong></td>
      <td>${bits} bit</td>
      <td><strong>${times[name]} ms</strong></td>
      <td><span class="security-badge ${security}">${SECURITY_LABEL[security]}</span></td>
    </tr>`;
  }
  html += '</tbody></table>';
  wrap.innerHTML = html;

  // Bar chart
  const maxTime = Math.max(...Object.values(times).map(Number));
  const chart = document.getElementById('bar-chart');
  chart.innerHTML = BENCH_ALGOS.map(({ name }) => `
    <div class="bar-row">
      <div class="bar-label">${name}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width: ${((times[name] / maxTime) * 100).toFixed(1)}%"></div>
      </div>
      <div class="bar-value">${times[name]} ms</div>
    </div>
  `).join('');

  document.getElementById('bench-results').hidden = false;
});

// ============================================================
// HISTORY (localStorage)
// ============================================================

const HISTORY_KEY = 'hashverify_history';

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}

function saveHistory(sourceName, results) {
  const history = loadHistory();
  history.unshift({ source: sourceName, results, time: nowString() });
  // Keep last 50
  if (history.length > 50) history.pop();
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function renderHistory() {
  const list    = document.getElementById('history-list');
  const history = loadHistory();
  if (history.length === 0) {
    list.innerHTML = '<div class="empty-state">Belum ada riwayat. Hash sebuah file dulu!</div>';
    return;
  }
  list.innerHTML = history.map(item => `
    <div class="history-item">
      <div class="history-item-meta">
        <span class="history-item-filename">${item.source}</span>
        <span class="history-item-time">${item.time}</span>
      </div>
      <div class="history-item-hashes">
        ${Object.entries(item.results).map(([algo, hex]) => `
          <div class="history-hash-row">
            <span class="history-algo">${algo}</span>
            <span class="history-val">${hex}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

document.getElementById('btn-clear-history').addEventListener('click', () => {
  if (confirm('Hapus semua riwayat?')) {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
  }
});

document.getElementById('btn-export-history').addEventListener('click', () => {
  const history = loadHistory();
  if (history.length === 0) { alert('Tidak ada riwayat.'); return; }
  let txt = `HashVerify — History Export\n${nowString()}\n${'='.repeat(60)}\n\n`;
  history.forEach((item, i) => {
    txt += `[${i + 1}] ${item.source}  |  ${item.time}\n`;
    Object.entries(item.results).forEach(([algo, hex]) => {
      txt += `  ${algo.padEnd(10)} ${hex}\n`;
    });
    txt += '\n';
  });
  downloadText(txt, `hashverify_history_${Date.now()}.txt`);
});

// Init
renderHistory();
