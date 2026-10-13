import { GUIDES, RESOURCES, PINGS, icon, t, playSound, applyState, formatTime } from './shared.js';

const api = window.igem;
const wheel = document.querySelector('#wheel');
const options = document.querySelector('#wheel-options');
const cancel = document.querySelector('#wheel-cancel');
const marker = document.querySelector('#ping-marker');
const hint = document.querySelector('#wheel-hint');
const detail = document.querySelector('#wheel-detail');
const next = document.querySelector('#resource-next');
const modes = [...document.querySelectorAll('[data-view]')];
const preferences = [
  {id:'language',en:'Language',zh:'语言',detailEn:'Switch between English and Chinese.',detailZh:'切换英文和中文。'},
  {id:'sound',en:'Sound',zh:'提示音',detailEn:'Turn gentle ping sounds on or off.',detailZh:'开启或关闭轻柔提示音。'},
  {id:'motion',en:'Motion',zh:'动画',detailEn:'Choose gentle animation or reduced motion.',detailZh:'切换轻柔动画或减少动态效果。'},
  {id:'size',en:'Gemy size',zh:'Gemy 大小',detailEn:'Cycle through three companion sizes.',detailZh:'在三种桌宠尺寸之间切换。'},
  {id:'focus',en:'Focus',zh:'专注',detailEn:'Start a 25-minute session, or stop the current one.',detailZh:'开始 25 分钟专注，或结束当前计时。'},
  {id:'quit',en:'Quit',zh:'退出',detailEn:'Close Gemy and iGEM Ping.',detailZh:'关闭 Gemy 和 iGEM Ping。'},
];
let mode = null;
let view = 'guide';
let resourcePage = 0;
let selectedPing = null;
let busy = false;
let linkFailed = false;
let describedEntry = null;

function entries() {
  return view === 'guide' ? GUIDES : view === 'resources' ? RESOURCES.slice(resourcePage * 6, resourcePage * 6 + 6) : view === 'signals' ? PINGS : preferences;
}
function preferenceValue(id) {
  const settings = window.appState?.settings;
  if (!settings) return '';
  switch (id) {
    case 'language': return settings.language === 'zh' ? '中文' : 'English';
    case 'sound': return settings.sound ? t('On', '开启') : t('Off', '关闭');
    case 'motion': return settings.reducedMotion ? t('Reduced', '减少动态') : t('Gentle', '轻柔动画');
    case 'size': return `${Math.round(settings.petSize * 100)}%`;
    case 'focus': return window.appState.timer.endsAt ? `${formatTime(window.appState.timer.endsAt - Date.now())} · ${t('Stop', '停止')}` : t('Start · 25 min', '开始 · 25 分钟');
    default: return t('See you soon', '下次见');
  }
}
async function choose(entry) {
  if (mode !== 'wheel' || busy || !entry) return;
  if (view === 'signals') { await api?.ping(entry.id); return; }
  busy = true;
  try {
    if (view === 'preferences') {
      const settings = window.appState.settings;
      let state;
      switch (entry.id) {
        case 'language': state = await api.updateSettings({language:settings.language === 'en' ? 'zh' : 'en'}); break;
        case 'sound': state = await api.updateSettings({sound:!settings.sound}); break;
        case 'motion': state = await api.updateSettings({reducedMotion:!settings.reducedMotion}); break;
        case 'size': state = await api.updateSettings({petSize:[0.8,1,1.2][([0.8,1,1.2].indexOf(settings.petSize) + 1) % 3]}); break;
        case 'focus': state = await (window.appState.timer.endsAt ? api.stopTimer() : api.startTimer(25)); break;
        case 'quit': await api.quit(); break;
      }
      if (state) receiveState(state);
    } else {
      const opened = await api?.openLink(view === 'guide' ? entry.linkKey : entry.id);
      if (opened) { if (mode === 'wheel') await api.closeWheel(); }
      else { linkFailed = true; updateText(); }
    }
  } catch {
    hint.textContent = t('Could not open or apply this action. Please try again.', '无法打开或应用此操作，请重试。');
  } finally { busy = false; }
}
function setView(value) {
  view = ['guide','resources','signals','preferences'].includes(value) ? value : 'guide';
  linkFailed = false;
  describedEntry = null;
  options.replaceChildren();
  entries().forEach((entry, index) => {
    const angle = (-90 + index * 60) * Math.PI / 180;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `wheel-option${entry.id === 'quit' ? ' danger' : ''}`;
    button.dataset[{guide:'guide',resources:'resource',signals:'ping',preferences:'preference'}[view]] = entry.id;
    button.style.left = `${280 + Math.cos(angle) * 168}px`;
    button.style.top = `${285 + Math.sin(angle) * 168}px`;
    button.style.setProperty('--entry-delay', `${index * 12}ms`);
    const visual = document.createElement('span');
    visual.className = 'wheel-icon';
    visual.innerHTML = icon(entry.icon || entry.id, 28);
    const label = document.createElement('span');
    label.className = 'wheel-option-label';
    const number = document.createElement('span');
    number.className = 'wheel-key';
    number.setAttribute('aria-hidden','true');
    number.textContent = String(index + 1);
    button.append(visual, label, number);
    if (view === 'preferences') {
      const value = document.createElement('span');
      value.className = 'wheel-value';
      button.append(value);
    }
    button.addEventListener('click', () => choose(entry));
    const describe = () => { describedEntry = entry; updateDetail(); };
    button.addEventListener('pointerenter', describe);
    button.addEventListener('focus', describe);
    button.addEventListener('pointerleave', () => { if (document.activeElement !== button) { describedEntry = null; updateDetail(); } });
    button.addEventListener('blur', () => { describedEntry = null; updateDetail(); });
    options.append(button);
  });
  updateText();
}
function updateDetail() {
  detail.textContent = describedEntry ? t(describedEntry.detailEn, describedEntry.detailZh) : view === 'signals' ? t('A small signal, visible on your screen.', '发出一个小信号，在你的屏幕上显示。') : view === 'preferences' ? t('Make Gemy feel at home on your desktop.', '按你的习惯，调整 Gemy。') : t('Find your way around the official iGEM world.', '从这里，熟悉 iGEM 官网。');
}
function updateText() {
  wheel.setAttribute('aria-label', t('iGEM wheel', 'iGEM 轮盘'));
  document.querySelector('.wheel-modes').setAttribute('aria-label', t('Wheel mode', '轮盘模式'));
  const labels = {guide:['iGEM','导航'],resources:['Explore','资源'],signals:['Signals','信号'],preferences:['Settings','设置']};
  for (const button of modes) {
    button.textContent = t(...labels[button.dataset.view]);
    button.classList.toggle('active', button.dataset.view === view);
    button.setAttribute('aria-pressed', String(button.dataset.view === view));
  }
  hint.textContent = linkFailed ? t('Could not open link. Please try again.', '链接未能打开，请重试。') : t('1–6 to choose · Esc to close', '1–6 选择 · Esc 关闭');
  cancel.setAttribute('aria-label', t('Close wheel', '关闭轮盘'));
  document.querySelector('#center-note').textContent = t('Close', '关闭');
  next.hidden = view !== 'resources';
  next.textContent = `${t('More resources','更多资源')} · ${resourcePage + 1} / 2`;
  for (const [index, entry] of entries().entries()) {
    const button = options.children[index];
    button.querySelector('.wheel-option-label').textContent = t(entry.en, entry.zh);
    const value = button.querySelector('.wheel-value');
    if (value) value.textContent = preferenceValue(entry.id);
    button.setAttribute('aria-label', `${t(entry.en,entry.zh)}${value ? ` · ${value.textContent}` : ''} · ${t(entry.detailEn,entry.detailZh)}`);
  }
  if (selectedPing) document.querySelector('#ping-label').textContent = t(selectedPing.en,selectedPing.zh);
  updateDetail();
}
function receiveState(state) { applyState(state); updateText(); }
function receiveWheel(payload) {
  mode = payload.mode;
  wheel.hidden = mode !== 'wheel';
  marker.hidden = mode !== 'ping';
  document.body.classList.toggle('show-wheel', mode === 'wheel');
  if (mode === 'wheel') {
    selectedPing = null;
    resourcePage = 0;
    setView(payload.view);
    cancel.focus({preventScroll:true});
    return;
  }
  selectedPing = PINGS.find((entry) => entry.id === payload.id);
  if (!selectedPing) { marker.hidden = true; return; }
  marker.style.left = `${Number.isFinite(payload.x) ? payload.x : 280}px`;
  marker.style.top = `${Number.isFinite(payload.y) ? payload.y : 280}px`;
  document.querySelector('#ping-symbol').innerHTML = icon(selectedPing.id,36);
  document.querySelector('#ping-label').textContent = t(selectedPing.en,selectedPing.zh);
  marker.classList.remove('ping-animate');
  void marker.offsetWidth;
  marker.classList.add('ping-animate');
  playSound(selectedPing.id);
}
cancel.addEventListener('click', () => api?.closeWheel());
for (const button of modes) button.addEventListener('click', () => setView(button.dataset.view));
next.addEventListener('click', () => { resourcePage = 1 - resourcePage; setView('resources'); });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { event.preventDefault(); api?.closeWheel(); }
  else if (mode === 'wheel' && /^[1-6]$/.test(event.key) && !event.repeat) { event.preventDefault(); choose(entries()[Number(event.key) - 1]); }
});
document.addEventListener('contextmenu', (event) => { event.preventDefault(); api?.closeWheel(); });
wheel.addEventListener('click', (event) => { if (event.target === wheel) api?.closeWheel(); });
setView('guide');
setInterval(() => {
  if (mode === 'wheel' && view === 'preferences' && window.appState?.timer.endsAt) updateText();
}, 1000);
if (api) { api.onState(receiveState); api.onWheel(receiveWheel); api.getState().then(receiveState); }
