'use strict';

const { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, screen, shell, nativeImage, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { DEFAULT_SETTINGS, PING_IDS, LINKS, sanitizeSettings, clampPosition, overlayPlacement, createTimer, timerFinished } = require('./core.cjs');

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
let timerInterval;
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
      backgroundThrottling: role === 'settings',
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

function showSettings() {
  if (windows.settings.isMinimized()) windows.settings.restore();
  windows.settings.show();
  windows.settings.focus();
}

function hideSettings() {
  if (tray) windows.settings.hide();
  else app.quit();
}

function updateTray() {
  if (!tray) return;
  const zh = settings.language === 'zh';
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: zh ? '打开 iGEM Ping' : 'Open iGEM Ping', click: showSettings },
    { label: zh ? '打开 iGEM 导航' : 'Open iGEM guide', accelerator: 'Control+Alt+G', click: openWheel },
    { label: zh ? '显示桌宠' : 'Show companion', type: 'checkbox', checked: settings.petVisible,
      click: () => applySettings({ petVisible: !settings.petVisible }) },
    { type: 'separator' },
    { label: zh ? 'iGEM 官方网站' : 'iGEM official website', click: () => openLink('community') },
    { type: 'separator' },
    { label: zh ? '退出' : 'Quit', click: () => app.quit() },
  ]));
}

function applySettings(patch) {
  settings = sanitizeSettings(patch, settings);
  if (settings.petVisible) windows.pet.showInactive();
  else windows.pet.hide();
  savePreferences();
  updateTray();
  broadcast();
  return state();
}

function closeOverlay() {
  clearTimeout(overlayTimeout);
  overlayMode = null;
  windows.overlay.hide();
}

function placeOverlay(cursor) {
  const placement = overlayPlacement(cursor, screen.getDisplayNearestPoint(cursor).workArea);
  windows.overlay.setBounds({ x: placement.x, y: placement.y, width: placement.width, height: placement.height });
  windows.overlay.webContents.setZoomFactor(placement.scale);
  overlayAnchor = placement.anchor;
}

function openWheel() {
  if (windows.overlay.webContents.isLoading()) return;
  clearTimeout(overlayTimeout);
  placeOverlay(screen.getCursorScreenPoint());
  overlayMode = 'wheel';
  windows.overlay.setFocusable(true);
  windows.overlay.setIgnoreMouseEvents(false);
  send(windows.overlay, 'igem:wheel', { mode: 'wheel', x: 280, y: 280 });
  windows.overlay.show();
  windows.overlay.focus();
  overlayTimeout = setTimeout(closeOverlay, 20_000);
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

function endDrag() {
  if (!drag) return;
  drag = null;
  const [x, y] = windows.pet.getPosition();
  petPosition = { x, y };
  savePreferences();
}

function registerIPC() {
  const all = ['settings', 'pet', 'overlay'];
  handle('get-state', all, state);
  handle('update-settings', ['settings', 'pet'], applySettings);
  handle('open-wheel', all, openWheel);
  handle('ping', all, ping);
  handle('close-wheel', ['overlay'], closeOverlay);
  handle('show-settings', all, showSettings);
  handle('minimize-settings', ['settings'], () => windows.settings.minimize());
  handle('hide-settings', ['settings'], hideSettings);
  handle('open-link', all, openLink);
  handle('start-timer', ['settings', 'pet'], (minutes) => {
    timer = createTimer(minutes);
    broadcast();
    send(windows.pet, 'igem:pet', { id: 'focus' });
    return state();
  });
  handle('stop-timer', ['settings', 'pet'], () => {
    timer = { endsAt: null, durationMs: 0 };
    broadcast();
    return state();
  });
  handle('quit', ['settings', 'pet'], () => app.quit());

  ipcMain.on('igem:drag-start', (event) => {
    if (!trustedSender(event, ['pet'])) return;
    const [x, y] = windows.pet.getPosition();
    drag = { cursor: screen.getCursorScreenPoint(), x, y };
    windows.pet.setIgnoreMouseEvents(false);
  });
  ipcMain.on('igem:drag-move', (event) => {
    if (!trustedSender(event, ['pet']) || !drag) return;
    const cursor = screen.getCursorScreenPoint();
    const position = clampPosition({ x: drag.x + cursor.x - drag.cursor.x, y: drag.y + cursor.y - drag.cursor.y },
      { width: 240, height: 270 }, screen.getDisplayNearestPoint(cursor).workArea);
    windows.pet.setPosition(position.x, position.y);
  });
  ipcMain.on('igem:drag-end', (event) => {
    if (trustedSender(event, ['pet'])) endDrag();
  });
  ipcMain.on('igem:pet-interactive', (event, interactive) => {
    if (!trustedSender(event, ['pet']) || typeof interactive !== 'boolean' || drag) return;
    windows.pet.setIgnoreMouseEvents(!interactive, { forward: true });
  });
}

function recoverWindows() {
  endDrag();
  for (const role of ['pet', 'settings']) {
    const window = windows[role];
    const bounds = window.getBounds();
    const workArea = screen.getDisplayMatching(bounds).workArea;
    if (role === 'settings') {
      window.setMinimumSize(Math.min(900, workArea.width), Math.min(680, workArea.height));
      bounds.width = Math.min(Math.max(bounds.width, 900), workArea.width);
      bounds.height = Math.min(Math.max(bounds.height, 680), workArea.height);
    }
    const position = clampPosition(bounds, bounds, workArea);
    if (role === 'settings') window.setBounds({ ...bounds, ...position });
    else window.setPosition(position.x, position.y);
    if (role === 'pet') petPosition = position;
  }
  closeOverlay();
  savePreferences();
}

async function start() {
  await app.whenReady();
  loadPreferences();
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  Menu.setApplicationMenu(null);

  const primaryArea = screen.getPrimaryDisplay().workArea;
  createWindow('settings', {
    title: 'iGEM Ping',
    width: Math.min(1120, primaryArea.width), height: Math.min(800, primaryArea.height),
    minWidth: Math.min(900, primaryArea.width), minHeight: Math.min(680, primaryArea.height),
    frame: false, hasShadow: false,
  });
  windows.settings.once('ready-to-show', showSettings);
  windows.settings.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      hideSettings();
    }
  });

  const workArea = petPosition
    ? screen.getDisplayNearestPoint(petPosition).workArea
    : screen.getPrimaryDisplay().workArea;
  petPosition = clampPosition(petPosition || {
    x: workArea.x + workArea.width - 264,
    y: workArea.y + workArea.height - 294,
  }, { width: 240, height: 270 }, workArea);
  createWindow('pet', {
    title: 'iGEM Ping Companion', width: 240, height: 270, ...petPosition,
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
  windows.overlay.on('blur', () => { if (overlayMode === 'wheel') closeOverlay(); });
  windows.overlay.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape') { event.preventDefault(); closeOverlay(); }
  });

  registerIPC();
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
  if (!icon.isEmpty()) {
    tray = new Tray(icon.resize({ width: 20, height: 20 }));
    tray.setToolTip('iGEM Ping');
    tray.on('double-click', showSettings);
    updateTray();
  }
  shortcuts.wheel = globalShortcut.register('Control+Alt+G', openWheel);
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
  app.on('second-instance', () => { if (windows.settings) showSettings(); });
  app.on('activate', () => { if (windows.settings) showSettings(); });
  app.on('window-all-closed', () => { if (!tray) app.quit(); });
  app.on('before-quit', () => {
    quitting = true;
    clearTimeout(overlayTimeout);
    clearInterval(timerInterval);
    globalShortcut.unregisterAll();
  });
  start().catch(() => {
    console.error('iGEM Ping could not start. Please restart the app.');
    app.quit();
  });
}
