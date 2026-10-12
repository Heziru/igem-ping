import { GUIDES, PINGS, icon, t, playSound, applyState, applyImageSkins } from './shared.js';

const api = window.igem;
const wheel = document.querySelector('#wheel');
const options = document.querySelector('#wheel-options');
const cancel = document.querySelector('#wheel-cancel');
const marker = document.querySelector('#ping-marker');
const pingSymbol = document.querySelector('#ping-symbol');
const pingLabel = document.querySelector('#ping-label');
const guideMode = document.querySelector('#mode-guide');
const signalsMode = document.querySelector('#mode-signals');
const hint = document.querySelector('#wheel-hint');
let mode = null;
let selectedPing = null;
let wheelMode = 'guide';
let openingLink = false;
let linkFailed = false;

function entries() {
  return wheelMode === 'guide' ? GUIDES : PINGS;
}

async function choose(id) {
  if (mode !== 'wheel' || openingLink) return;
  if (wheelMode === 'signals') { api?.ping(id); return; }
  const guide = GUIDES.find((entry) => entry.id === id);
  if (!guide) return;
  openingLink = true;
  let opened = false;
  try { opened = await api?.openLink(guide.linkKey); } catch { /* Show the localized retry hint below. */ }
  openingLink = false;
  if (opened) {
    if (mode === 'wheel') api?.closeWheel();
  } else {
    linkFailed = true;
    updateText();
  }
}

function setWheelMode(value) {
  wheelMode = value;
  linkFailed = false;
  options.replaceChildren();
  entries().forEach((entry, index) => {
    const angle = (-90 + index * 60) * Math.PI / 180;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'wheel-option';
    button.dataset[wheelMode === 'guide' ? 'guide' : 'ping'] = entry.id;
    button.style.left = `${280 + Math.cos(angle) * 160}px`;
    button.style.top = `${280 + Math.sin(angle) * 160}px`;
    const visual = document.createElement('span');
    visual.className = 'wheel-icon';
    visual.setAttribute('aria-hidden', 'true');
    visual.innerHTML = icon(wheelMode === 'guide' ? entry.icon : entry.id, 44);
    const label = document.createElement('span');
    label.className = 'wheel-option-label';
    const number = document.createElement('span');
    number.className = 'wheel-key';
    number.setAttribute('aria-hidden', 'true');
    number.textContent = String(index + 1);
    button.append(visual, label, number);
    button.addEventListener('click', () => choose(entry.id));
    options.append(button);
  });
  updateText();
}

function updateText() {
  const isGuide = wheelMode === 'guide';
  wheel.setAttribute('aria-label', isGuide ? t('Official iGEM guide', 'iGEM 官方新手导航') : t('Choose a ping', '选择一个 Ping'));
  document.querySelector('.wheel-modes').setAttribute('aria-label', t('Wheel mode', '轮盘模式'));
  guideMode.textContent = t('iGEM Guide', 'iGEM 新手导航');
  signalsMode.textContent = t('Signals', '协作信号');
  guideMode.classList.toggle('active', isGuide);
  signalsMode.classList.toggle('active', !isGuide);
  guideMode.setAttribute('aria-pressed', String(isGuide));
  signalsMode.setAttribute('aria-pressed', String(!isGuide));
  hint.textContent = linkFailed
    ? t('Could not open link. Please try again.', '链接未能打开，请重试。')
    : isGuide
      ? t('Official iGEM links · 1–6 · Esc to close', 'iGEM 官方入口 · 1–6 · Esc 关闭')
      : t('Choose a signal · 1–6 · Esc to close', '选择一个信号 · 1–6 · Esc 关闭');
  cancel.title = t('Close ping wheel', '关闭 Ping 轮盘');
  cancel.setAttribute('aria-label', cancel.title);
  document.querySelector('#wheel-cancel-label').textContent = t('Close', '关闭');
  for (const [index, entry] of entries().entries()) {
    const button = options.children[index];
    button.querySelector('.wheel-option-label').textContent = t(entry.en, entry.zh);
    button.title = t(entry.detailEn, entry.detailZh);
    button.setAttribute('aria-label', `${t(entry.en, entry.zh)} · ${t(entry.detailEn, entry.detailZh)}`);
  }
  if (selectedPing) pingLabel.textContent = t(selectedPing.en, selectedPing.zh);
  applyImageSkins();
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
    setWheelMode('guide');
    cancel.focus({ preventScroll: true });
    return;
  }
  selectedPing = PINGS.find((ping) => ping.id === payload.id);
  if (!selectedPing) { marker.hidden = true; return; }
  marker.style.left = `${Number.isFinite(payload.x) ? payload.x : 280}px`;
  marker.style.top = `${Number.isFinite(payload.y) ? payload.y : 280}px`;
  pingSymbol.innerHTML = icon(selectedPing.id, 60);
  pingLabel.textContent = t(selectedPing.en, selectedPing.zh);
  applyImageSkins();
  marker.classList.remove('ping-animate');
  void marker.offsetWidth;
  marker.classList.add('ping-animate');
  playSound(selectedPing.id);
}

cancel.addEventListener('click', () => api?.closeWheel());
guideMode.addEventListener('click', () => setWheelMode('guide'));
signalsMode.addEventListener('click', () => setWheelMode('signals'));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    api?.closeWheel();
  } else if (mode === 'wheel' && /^[1-6]$/.test(event.key) && !event.repeat) {
    event.preventDefault();
    choose(entries()[Number(event.key) - 1].id);
  }
});
document.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  api?.closeWheel();
});

setWheelMode('guide');
if (api) {
  api.onState(receiveState);
  api.onWheel(receiveWheel);
  api.getState().then(receiveState);
}
