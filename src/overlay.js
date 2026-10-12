import { PINGS, icon, t, playSound, applyState } from './shared.js';

const api = window.igem;
const wheel = document.querySelector('#wheel');
const options = document.querySelector('#wheel-options');
const cancel = document.querySelector('#wheel-cancel');
const marker = document.querySelector('#ping-marker');
const pingSymbol = document.querySelector('#ping-symbol');
const pingLabel = document.querySelector('#ping-label');
let mode = null;
let selectedPing = null;

function choose(id) {
  if (mode !== 'wheel') return;
  api?.ping(id);
}

PINGS.forEach((ping, index) => {
  const angle = (-90 + index * 60) * Math.PI / 180;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'wheel-option';
  button.dataset.ping = ping.id;
  button.style.left = `${280 + Math.cos(angle) * 160}px`;
  button.style.top = `${280 + Math.sin(angle) * 160}px`;
  button.style.setProperty('--tile-color', ping.color);
  const visual = document.createElement('span');
  visual.className = 'wheel-icon';
  visual.setAttribute('aria-hidden', 'true');
  visual.innerHTML = icon(ping.id, 28);
  const label = document.createElement('span');
  label.className = 'wheel-option-label';
  const number = document.createElement('span');
  number.className = 'wheel-key';
  number.setAttribute('aria-hidden', 'true');
  number.textContent = String(index + 1);
  button.append(visual, label, number);
  button.addEventListener('click', () => choose(ping.id));
  options.append(button);
});

function updateText() {
  wheel.setAttribute('aria-label', t('Choose a ping', '选择一个 Ping'));
  document.querySelector('#wheel-heading').textContent = t('PICK A PING', '发出你的 PING');
  document.querySelector('#wheel-hint').textContent = t('Choose a signal · 1–6 · Esc to close', '选择一个信号 · 1–6 · Esc 关闭');
  cancel.title = t('Close ping wheel', '关闭 Ping 轮盘');
  cancel.setAttribute('aria-label', cancel.title);
  for (const ping of PINGS) {
    const button = options.querySelector(`[data-ping="${ping.id}"]`);
    button.querySelector('.wheel-option-label').textContent = t(ping.en, ping.zh);
    button.title = t(ping.detailEn, ping.detailZh);
    button.setAttribute('aria-label', `${t(ping.en, ping.zh)} · ${t(ping.detailEn, ping.detailZh)}`);
  }
  if (selectedPing) pingLabel.textContent = t(selectedPing.en, selectedPing.zh);
}

function receiveState(state) {
  applyState(state);
  updateText();
}

function receiveWheel(payload) {
  mode = payload.mode;
  wheel.hidden = mode !== 'wheel';
  marker.hidden = mode !== 'ping';
  document.body.classList.toggle('show-wheel', mode === 'wheel');
  if (mode === 'wheel') {
    selectedPing = null;
    updateText();
    cancel.focus({ preventScroll: true });
    return;
  }
  selectedPing = PINGS.find((ping) => ping.id === payload.id);
  if (!selectedPing) { marker.hidden = true; return; }
  marker.style.left = `${Number.isFinite(payload.x) ? payload.x : 280}px`;
  marker.style.top = `${Number.isFinite(payload.y) ? payload.y : 280}px`;
  marker.style.setProperty('--ping-color', selectedPing.color);
  pingSymbol.innerHTML = icon(selectedPing.id, 42);
  pingLabel.textContent = t(selectedPing.en, selectedPing.zh);
  marker.classList.remove('ping-animate');
  void marker.offsetWidth;
  marker.classList.add('ping-animate');
  playSound(selectedPing.id);
}

cancel.addEventListener('click', () => api?.closeWheel());
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    api?.closeWheel();
  } else if (mode === 'wheel' && /^[1-6]$/.test(event.key) && !event.repeat) {
    event.preventDefault();
    choose(PINGS[Number(event.key) - 1].id);
  }
});
document.addEventListener('contextmenu', (event) => event.preventDefault());

if (api) {
  api.onState(receiveState);
  api.onWheel(receiveWheel);
  api.getState().then(receiveState);
}
