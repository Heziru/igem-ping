'use strict';

const { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, screen, shell, nativeImage, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { DEFAULT_SETTINGS, PING_IDS, WHEEL_VIEWS, LINKS, sanitizeSettings, clampPosition, petDropPlacement, overlayPlacement, createTimer, timerFinished } = require('./core.cjs');
const { loadProjectIndex } = require('./project-search.cjs');
const PET_SIZE = Object.freeze({ width: 160, height: 190 });

app.setName('iGEM Ping');
if (process.platform === 'win32') app.setAppUserModelId('org.igem.community.ping');

let settings = { ...DEFAULT_SETTINGS };
let petPosition = null;
let timer = { endsAt: null, durationMs: 0 };
const shortcuts = { wheel: false, pet: false };
const windows = {};
let tray;
let quitting = false;
let overlayMode = null;
let overlayAnchor = { x: 280, y: 280 };
let overlayTimeout;
let overlayBlurTimeout;
let timerInterval;
let petBounceInterval;
let petPressed = false;
let drag = null;
let preferencesPath;

function state() {
  return { settings: { ...settings }, timer: { ...timer }, shortcuts: { ...shortcuts } };
}

function send(window, channel, payload) {
  if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
}

function broadcast() {
  for (const window of Object.values(windows)) send(window, 'igem:state', state());
}

function loadPreferences() {
  preferencesPath = path.join(app.getPath('userData'), 'preferences.json');
  try {
    const saved = JSON.parse(fs.readFileSync(preferencesPath, 'utf8'));
    settings = sanitizeSettings(saved.settings);
    if (Number.isFinite(saved.petPosition?.x) && Number.isFinite(saved.petPosition?.y)) {
      petPosition = { x: saved.petPosition.x, y: saved.petPosition.y };
    }
  } catch {
    // Missing or damaged local preferences fall back to usable defaults.
  }
}

function savePreferences() {
  try {
    fs.mkdirSync(path.dirname(preferencesPath), { recursive: true });
    const temporary = `${preferencesPath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ settings, petPosition }, null, 2), 'utf8');
    fs.renameSync(temporary, preferencesPath);
  } catch {
    console.warn('iGEM Ping could not save preferences. Changes will last for this session.');
  }
}

function createWindow(role, options) {
  const window = new BrowserWindow({
    show: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    ...options,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      zoomMode: role === 'overlay' ? 'isolated' : 'default',
      backgroundThrottling: false,
    },
  });
  windows[role] = window;
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.on('did-finish-load', () => send(window, 'igem:state', state()));
  window.loadFile(path.join(__dirname, 'src', `${role}.html`)).catch(() => {
    console.error(`iGEM Ping could not load its ${role} window.`);
  });
  return window;
}

function updateTray() {
  if (!tray) return;
  const zh = settings.language === 'zh';
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: zh ? '打开 iGEM 导航' : 'Open iGEM guide', accelerator: 'Control+Alt+G', click: () => openWheel() },
    { label: zh ? '设置' : 'Preferences', click: () => openWheel('preferences') },
    { label: zh ? '显示桌宠' : 'Show companion', type: 'checkbox', checked: settings.petVisible,
      click: () => applySettings({ petVisible: !settings.petVisible }) },
    { type: 'separator' },
    { label: zh ? '退出' : 'Quit', click: () => app.quit() },
  ]));
}

function applySettings(patch) {
  settings = sanitizeSettings(patch, settings);
  // Without a tray, Gemy is the persistent entry point back into the wheel.
  if (!tray) settings.petVisible = true;
  if (settings.petVisible) windows.pet.showInactive();
  else {
    endDrag(false);
    stopPetBounce();
    petPressed = false;
    windows.pet.hide();
  }
  if (settings.reducedMotion) stopPetBounce();
  savePreferences();
  updateTray();
  broadcast();
  return state();
}

function closeOverlay() {
  clearTimeout(overlayTimeout);
  clearTimeout(overlayBlurTimeout);
  overlayMode = null;
  windows.overlay.hide();
}

function placeOverlay(cursor, avoidPet = false) {
  const petBounds = avoidPet && windows.pet.isVisible() ? windows.pet.getBounds() : undefined;
  const placement = overlayPlacement(cursor, screen.getDisplayNearestPoint(cursor).workArea, petBounds);
  windows.overlay.setBounds({ x: placement.x, y: placement.y, width: placement.width, height: placement.height });
  windows.overlay.webContents.setZoomFactor(placement.scale);
  overlayAnchor = placement.anchor;
}

function openWheel(view = 'guide') {
  if (!WHEEL_VIEWS.includes(view)) return false;
  if (quitting || !windows.overlay || windows.overlay.isDestroyed()) return false;
  if (windows.overlay.webContents.isLoading()) {
    windows.overlay.webContents.once('did-finish-load', () => openWheel(view));
    return true;
  }
  clearTimeout(overlayTimeout);
  clearTimeout(overlayBlurTimeout);
  if (overlayMode !== 'wheel' || !windows.overlay.isVisible()) {
    placeOverlay(screen.getCursorScreenPoint(), true);
    overlayMode = 'wheel';
    windows.overlay.setFocusable(true);
    windows.overlay.setIgnoreMouseEvents(false);
  }
  send(windows.overlay, 'igem:wheel', { mode: 'wheel', view, x: 280, y: 280 });
  windows.overlay.show();
  windows.overlay.focus();
  // Keep the launcher clickable even when a small display cannot fit both windows side by side.
  if (windows.pet.isVisible()) windows.pet.moveTop();
  return true;
}

function toggleWheel() {
  if (overlayMode === 'wheel' && windows.overlay.isVisible()) {
    closeOverlay();
    return true;
  }
  return openWheel();
}

function closeUnfocusedWheel() {
  clearTimeout(overlayBlurTimeout);
  // A pet pointerdown can arrive just after the OS blur event. Its pointerup owns the toggle.
  overlayBlurTimeout = setTimeout(() => {
    if (!quitting && !petPressed && overlayMode === 'wheel'
      && !windows.overlay.isDestroyed() && !windows.overlay.isFocused()) closeOverlay();
  }, 60);
}

function ping(id) {
  if (!PING_IDS.includes(id)) return false;
  clearTimeout(overlayTimeout);
  // A wheel selection stays anchored to the original cursor position.
  if (overlayMode !== 'wheel') placeOverlay(screen.getCursorScreenPoint());
  overlayMode = 'ping';
  windows.overlay.setIgnoreMouseEvents(true, { forward: true });
  windows.overlay.setFocusable(false);
  send(windows.overlay, 'igem:wheel', { mode: 'ping', id, ...overlayAnchor });
  send(windows.pet, 'igem:pet', { id });
  windows.overlay.showInactive();
  overlayTimeout = setTimeout(closeOverlay, 2400);
  return true;
}

async function openLink(key) {
  if (typeof key !== 'string' || !Object.hasOwn(LINKS, key)) return false;
  try {
    await shell.openExternal(LINKS[key]);
    return true;
  } catch {
    return false;
  }
}

function checkTimer() {
  if (timerFinished(timer)) {
    timer = { endsAt: null, durationMs: timer.durationMs };
    ping('break');
    broadcast();
  }
}

function trustedSender(event, roles) {
  return roles.some((role) => {
    const window = windows[role];
    return window && !window.isDestroyed()
      && event.sender === window.webContents
      && event.senderFrame === window.webContents.mainFrame
      && event.senderFrame.url === pathToFileURL(path.join(__dirname, 'src', `${role}.html`)).href;
  });
}

function handle(channel, roles, handler) {
  ipcMain.handle(`igem:${channel}`, (event, ...args) => {
    if (!trustedSender(event, roles)) throw new Error('This window cannot perform that action.');
    return handler(...args);
  });
}

function stopPetBounce() {
  if (!petBounceInterval) return;
  clearInterval(petBounceInterval);
  petBounceInterval = null;
  if (!windows.pet.isDestroyed()) windows.pet.setPosition(petPosition.x, petPosition.y);
}

function endDrag(animate = true) {
  if (!drag) return;
  drag = null;
  const bounds = windows.pet.getBounds();
  const { position, rebound } = petDropPlacement(bounds, PET_SIZE, screen.getDisplayMatching(bounds).workArea);
  petPosition = position;
  windows.pet.setPosition(position.x, position.y);
  savePreferences();
  if (!animate || settings.reducedMotion || (position.x === rebound.x && position.y === rebound.y)) return;
  const startedAt = Date.now();
  petBounceInterval = setInterval(() => {
    const progress = Math.min(1, (Date.now() - startedAt) / 220);
    if (progress === 1 || quitting || windows.pet.isDestroyed()) {
      stopPetBounce();
      return;
    }
    const amount = Math.sin(progress * Math.PI);
    windows.pet.setPosition(Math.round(position.x + (rebound.x - position.x) * amount),
      Math.round(position.y + (rebound.y - position.y) * amount));
  }, 16);
}

function registerIPC() {
  const all = ['pet', 'overlay'];
  handle('get-state', all, state);
  handle('search-info', ['overlay'], () => loadProjectIndex().info());
  handle('search-projects', ['overlay'], (input) => loadProjectIndex().search(input));
  handle('open-project', ['overlay'], async (id) => {
    const url = loadProjectIndex().projectURL(id);
    if (!url) return false;
    try { await shell.openExternal(url); return true; } catch { return false; }
  });
  handle('update-settings', all, applySettings);
  handle('open-wheel', all, openWheel);
  handle('toggle-wheel', ['pet'], toggleWheel);
  handle('ping', all, ping);
  handle('close-wheel', ['overlay'], closeOverlay);
  handle('open-link', all, openLink);
  handle('start-timer', all, (minutes) => {
    timer = createTimer(minutes);
    broadcast();
    send(windows.pet, 'igem:pet', { id: 'focus' });
    return state();
  });
  handle('stop-timer', all, () => {
    timer = { endsAt: null, durationMs: 0 };
    broadcast();
    return state();
  });
  handle('quit', all, () => app.quit());

  ipcMain.on('igem:drag-start', (event) => {
    if (!trustedSender(event, ['pet'])) return;
    stopPetBounce();
    closeOverlay();
    const [x, y] = windows.pet.getPosition();
    drag = { cursor: screen.getCursorScreenPoint(), x, y };
    windows.pet.setIgnoreMouseEvents(false);
  });
  ipcMain.on('igem:drag-move', (event) => {
    if (!trustedSender(event, ['pet']) || !drag) return;
    const cursor = screen.getCursorScreenPoint();
    const position = clampPosition({ x: drag.x + cursor.x - drag.cursor.x, y: drag.y + cursor.y - drag.cursor.y },
      PET_SIZE, screen.getDisplayNearestPoint(cursor).workArea);
    windows.pet.setPosition(position.x, position.y);
  });
  ipcMain.on('igem:drag-end', (event) => {
    if (trustedSender(event, ['pet'])) endDrag();
  });
  ipcMain.on('igem:pet-interactive', (event, interactive, pressed) => {
    if (!trustedSender(event, ['pet']) || typeof interactive !== 'boolean') return;
    if (typeof pressed === 'boolean') {
      petPressed = pressed;
      if (!pressed && overlayMode === 'wheel' && !windows.overlay.isFocused()) closeUnfocusedWheel();
    }
    if (!drag) windows.pet.setIgnoreMouseEvents(!interactive, { forward: true });
  });
}

function recoverWindows() {
  endDrag(false);
  stopPetBounce();
  petPressed = false;
  const bounds = windows.pet.getBounds();
  petPosition = clampPosition(bounds, PET_SIZE, screen.getDisplayMatching(bounds).workArea);
  windows.pet.setPosition(petPosition.x, petPosition.y);
  closeOverlay();
  savePreferences();
}

async function start() {
  await app.whenReady();
  loadPreferences();
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  Menu.setApplicationMenu(null);

  const workArea = petPosition
    ? screen.getDisplayNearestPoint(petPosition).workArea
    : screen.getPrimaryDisplay().workArea;
  petPosition = clampPosition(petPosition || {
    x: workArea.x + workArea.width - PET_SIZE.width - 24,
    y: workArea.y + workArea.height - PET_SIZE.height - 24,
  }, PET_SIZE, workArea);
  createWindow('pet', {
    title: 'iGEM Ping Companion', ...PET_SIZE, ...petPosition,
    transparent: true, frame: false, resizable: false, maximizable: false,
    skipTaskbar: true, alwaysOnTop: true, focusable: false, hasShadow: false,
  });
  windows.pet.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  windows.pet.setIgnoreMouseEvents(true, { forward: true });
  windows.pet.once('ready-to-show', () => { if (settings.petVisible) windows.pet.showInactive(); });
  windows.pet.on('close', (event) => {
    if (!quitting) { event.preventDefault(); applySettings({ petVisible: false }); }
  });

  createWindow('overlay', {
    title: 'iGEM Ping Wheel', width: 560, height: 560,
    transparent: true, frame: false, resizable: false, maximizable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false,
  });
  windows.overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  windows.overlay.on('close', (event) => {
    if (!quitting) { event.preventDefault(); closeOverlay(); }
  });
  windows.overlay.on('blur', closeUnfocusedWheel);
  windows.overlay.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape') { event.preventDefault(); closeOverlay(); }
  });

  registerIPC();
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
  if (!icon.isEmpty()) {
    try {
      tray = new Tray(icon.resize({ width: 20, height: 20 }));
      tray.setToolTip('iGEM Ping');
      tray.on('double-click', () => openWheel());
      updateTray();
    } catch {
      tray = null;
      console.warn('The system tray is unavailable. Gemy will remain visible.');
    }
  }
  if (!tray && !settings.petVisible) applySettings({ petVisible: true });
  shortcuts.wheel = globalShortcut.register('Control+Alt+G', () => openWheel());
  shortcuts.pet = globalShortcut.register('Control+Alt+P', () => applySettings({ petVisible: !settings.petVisible }));
  broadcast();
  timerInterval = setInterval(checkTimer, 1000);
  screen.on('display-added', recoverWindows);
  screen.on('display-removed', recoverWindows);
  screen.on('display-metrics-changed', recoverWindows);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => openWheel());
  app.on('activate', () => openWheel());
  app.on('window-all-closed', () => { if (!tray) app.quit(); });
  app.on('before-quit', () => {
    quitting = true;
    clearTimeout(overlayTimeout);
    clearTimeout(overlayBlurTimeout);
    stopPetBounce();
    clearInterval(timerInterval);
    globalShortcut.unregisterAll();
  });
  start().catch(() => {
    console.error('iGEM Ping could not start. Please restart the app.');
    app.quit();
  });
}
