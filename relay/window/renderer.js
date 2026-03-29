const dotSpinstatus = document.getElementById('dot-spinstatus');
const dotSpindata   = document.getElementById('dot-spindata');
const valSpinstatus = document.getElementById('val-spinstatus');
const valSpindata   = document.getElementById('val-spindata');
const lastResult    = document.getElementById('last-result');
const inputUrl      = document.getElementById('input-url');
const inputToken    = document.getElementById('input-token');
const errorMsg      = document.getElementById('error-msg');
const btnConnect    = document.getElementById('btn-connect');
const btnDisconnect = document.getElementById('btn-disconnect');

// ── load saved config ──

window.api.getConfig().then((cfg) => {
  if (cfg.url)   inputUrl.value   = cfg.url;
  if (cfg.token) inputToken.value = cfg.token;
});

// ── status updates ──

window.api.onStatus((s) => {
  setDot(dotSpinstatus, valSpinstatus, s.spinstatus);
  setDot(dotSpindata,   valSpindata,   s.spindata);
  if (s.lastResult) showResult(s.lastResult);
  const connected = s.spindata === 'connected' || s.spinstatus === 'connected' || s.spindata === 'connecting';
  btnConnect.disabled = connected;
});

window.api.onChartEnd((r) => showResult(r));

// ── connect ──

btnConnect.addEventListener('click', async () => {
  errorMsg.textContent = '';
  inputUrl.classList.remove('error');
  inputToken.classList.remove('error');

  const url   = inputUrl.value.trim();
  const token = inputToken.value.trim();

  if (!url) { inputUrl.classList.add('error'); errorMsg.textContent = 'Server URL is required.'; return; }
  if (!token) { inputToken.classList.add('error'); errorMsg.textContent = 'Token is required.'; return; }

  await window.api.saveConfig({ url, token });
  const res = await window.api.connect();
  if (res?.error) errorMsg.textContent = res.error;
});

// ── disconnect ──

btnDisconnect.addEventListener('click', async () => {
  await window.api.disconnect();
  errorMsg.textContent = '';
  btnConnect.disabled = false;
});

// ── save on input change ──

let saveTimer;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    window.api.saveConfig({ url: inputUrl.value.trim(), token: inputToken.value.trim() });
  }, 800);
}
inputUrl.addEventListener('input', scheduleSave);
inputToken.addEventListener('input', scheduleSave);

// ── helpers ──

function setDot(dot, label, state) {
  dot.className = `dot ${state}`;
  label.textContent = state;
}

function showResult(r) {
  let html = r.score !== null && r.score !== undefined ? r.score.toLocaleString() : '—';
  if (r.pfc) html += '<span class="badge pfc">PFC</span>';
  else if (r.fc) html += '<span class="badge fc">FC</span>';
  lastResult.innerHTML = html;
}
