import { PINGS, t, applyState } from './shared.js';

const api = window.igem;
const pet = document.querySelector('#pet');
const speech = document.querySelector('#pet-speech');
const focusBadge = document.querySelector('#focus-badge');
let pointer = null;
let activePing = null;
let reactionTimeout;

function updateText() {
  pet.title = t('Click to open or close the iGEM guide · drag to move · right-click for settings', '点击开关 iGEM 导航 · 拖动移动 · 右键打开设置');
  pet.setAttribute('aria-label', t('Toggle iGEM guide', '开关 iGEM 导航'));
  pet.querySelector('img').alt = t('iGEM Ping companion', 'iGEM Ping 桌宠');
  speech.textContent = activePing ? t(activePing.en, activePing.zh) : t('Your iGEM guide', '点我玩转 iGEM');
  updateCountdown();
}

function updateCountdown() {
  const endsAt = window.appState?.timer?.endsAt;
  const hasTimer = Number.isFinite(endsAt);
  speech.hidden = !activePing;
  focusBadge.hidden = !hasTimer || Boolean(activePing);
  if (focusBadge.hidden) return;
  const seconds = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  focusBadge.textContent = `${t('FOCUS', '专注')} ${time}`;
  focusBadge.setAttribute('aria-label', `${t('Focus time remaining', '专注剩余时间')} ${time}`);
}

function receiveState(state) {
  applyState(state);
  updateText();
}

function react({ id }) {
  const ping = PINGS.find((entry) => entry.id === id);
  if (!ping) return;
  activePing = ping;
  clearTimeout(reactionTimeout);
  pet.dataset.reaction = '';
  // Restart the brief reaction if the same ping is selected twice.
  void pet.offsetWidth;
  pet.dataset.reaction = id;
  speech.classList.add('active');
  updateText();
  reactionTimeout = setTimeout(() => {
    activePing = null;
    delete pet.dataset.reaction;
    speech.classList.remove('active');
    updateText();
  }, 2600);
}

pet.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  pointer = { id: event.pointerId, x: event.screenX, y: event.screenY, dragged: false };
  pet.setPointerCapture(event.pointerId);
  api?.setPetInteractive(true, true);
});

pet.addEventListener('pointermove', (event) => {
  if (!pointer || event.pointerId !== pointer.id) return;
  if (!pointer.dragged && Math.hypot(event.screenX - pointer.x, event.screenY - pointer.y) > 5) {
    pointer.dragged = true;
    pet.classList.add('dragging');
    api?.dragStart();
  }
  if (pointer.dragged) api?.dragMove();
});

function finishPointer(event, cancelled = false) {
  if (!pointer || event.pointerId !== pointer.id) return;
  const dragged = pointer.dragged;
  pointer = null;
  pet.classList.remove('dragging');
  if (pet.hasPointerCapture(event.pointerId)) pet.releasePointerCapture(event.pointerId);
  if (dragged) api?.dragEnd();
  if (!cancelled && !dragged && api) {
    api.toggleWheel().finally(() => api.setPetInteractive(pet.matches(':hover'), false));
  } else api?.setPetInteractive(pet.matches(':hover'), false);
}

pet.addEventListener('pointerup', (event) => finishPointer(event));
pet.addEventListener('pointercancel', (event) => finishPointer(event, true));
pet.addEventListener('lostpointercapture', (event) => finishPointer(event, true));
pet.addEventListener('click', (event) => {
  // Native keyboard activation has no pointerup event.
  if (event.detail === 0) api?.toggleWheel();
});
pet.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  api?.openWheel('preferences');
});
document.addEventListener('pointermove', (event) => {
  if (!pointer) api?.setPetInteractive(Boolean(event.target.closest('#pet')));
});
document.addEventListener('pointerleave', () => {
  if (!pointer) api?.setPetInteractive(false);
});

if (api) {
  api.onState(receiveState);
  api.onPet(react);
  api.getState().then(receiveState);
}
setInterval(updateCountdown, 1000);
