'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright');
const { DEFAULT_SETTINGS, LINKS } = require('../core.cjs');
const root = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'igem-ping-smoke-'));
const profile = path.join(temporary, 'profile');
const entry = path.join(temporary, 'launch.cjs');
fs.mkdirSync(profile);
// Isolate preferences and the single-instance lock from the user's running pet.
fs.writeFileSync(entry, `require('electron').app.setPath('userData', ${JSON.stringify(profile)});\nrequire(${JSON.stringify(path.join(root, 'main.cjs'))});\n`);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let application, pages;
const rendererErrors = [];
const guideLinks = { progress: 'deliverables', judging: 'judging', uploads: 'uploads', projects: 'projects', start: 'resources', submissions: 'submissions' };

async function launch(extraArgs = []) {
  application = await electron.launch({ args: ['--disable-backgrounding-occluded-windows', ...extraArgs, entry], cwd: root, env, timeout: 30_000 });
  await application.evaluate(({ shell }) => {
    globalThis.__smokeOpenedLinks = [];
    globalThis.__smokeFailLinks = false;
    // Exercise the real IPC allowlist without opening browsers or external pages.
    shell.openExternal = async (url) => {
      if (globalThis.__smokeFailLinks) throw new Error('Simulated browser launch failure');
      globalThis.__smokeOpenedLinks.push(url);
    };
  });
  const observed = new Set();
  const observe = (page) => {
    if (observed.has(page)) return;
    observed.add(page);
    page.on('pageerror', (error) => rendererErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') rendererErrors.push(message.text()); });
  };
  application.on('window', observe);
  application.windows().forEach(observe);
  await application.firstWindow();
  await application.evaluate(async ({ BrowserWindow }) => {
    const deadline = Date.now() + 10_000;
    while (BrowserWindow.getAllWindows().length < 2) {
      if (Date.now() > deadline) throw new Error('Pet and overlay did not start');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  });
  while (application.windows().length < 2) await application.waitForEvent('window', { timeout: 10_000 });
  pages = {};
  for (const page of application.windows()) {
    observe(page);
    page.setDefaultTimeout(10_000);
    await page.waitForLoadState('domcontentloaded');
    pages[path.basename(new URL(page.url()).pathname, '.html')] = page;
    await page.waitForFunction(() => window.igem && window.appState);
    await page.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0));
  }
  assert.deepEqual(Object.keys(pages).sort(), ['overlay', 'pet'], 'Only a pet and an overlay are created');
  await pages.overlay.evaluate(() => {
    window.__smokeWheelCount = 0;
    window.__smokeEvents = [];
    window.igem.onWheel((payload) => { window.__smokeWheelCount++; window.__smokeEvents.push(['wheel', payload]); });
    for (const name of ['pointerdown', 'pointerup', 'click']) document.addEventListener(name, (event) => {
      const button = event.target.closest('button');
      window.__smokeEvents.push([name, button?.dataset || null, event.detail, event.isTrusted]);
    }, true);
  });
  assert.equal(await application.evaluate(({ app }) => app.getPath('userData')), profile);
  await waitForWindow('pet', 'isVisible', true);
  await waitForWindow('overlay', 'isVisible', false);
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((win) => win.setPosition(-10_000, -10_000)));
  for (const page of Object.values(pages)) assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
}

async function waitForWindow(role, method, expected) {
  await application.evaluate(async ({ BrowserWindow }, target) => {
    const window = BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().endsWith(`/${target.role}.html`));
    if (!window) throw new Error(`Missing window: ${target.role}`);
    const deadline = Date.now() + 10_000;
    while (window[target.method]() !== target.expected) {
      if (Date.now() >= deadline) throw new Error(`${target.role}.${target.method} did not become ${target.expected}`);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }, { role, method, expected });
}

async function openWheel(view = 'guide') {
  const previous = await pages.overlay.evaluate(() => window.__smokeWheelCount);
  assert.equal(await pages.pet.evaluate((value) => window.igem.openWheel(value), view), true);
  await pages.overlay.waitForFunction((value) => window.__smokeWheelCount > value, previous);
  // Keep automation away from physical desktop clicks while retaining real windows.
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().endsWith('/overlay.html')).setPosition(-10_000, -10_000));
  await waitForWindow('overlay', 'isVisible', true);
  await pages.overlay.locator('#wheel').waitFor({ state: 'visible' });
  await pages.overlay.waitForFunction((value) => document.querySelector(`#mode-${value}`)?.getAttribute('aria-pressed') === 'true', view);
  await pages.overlay.waitForFunction(() => [...document.querySelectorAll('.wheel-option')].every((el) => el.getAnimations().every((animation) => animation.playState === 'finished')));
}

async function checkWheelLayout(label) {
  const result = await pages.overlay.evaluate(() => {
    const width = document.documentElement.clientWidth, height = document.documentElement.clientHeight;
    const outside = [...document.querySelectorAll('.wheel-option, .wheel-modes, #wheel-cancel, #resource-next')]
      .filter((el) => el.getClientRects().length).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.left < -1 || r.top < -1 || r.right > width + 1 || r.bottom > height + 1;
      }).map((el) => el.id || el.className);
    return { width, height, scrollWidth: document.documentElement.scrollWidth, outside };
  });
  assert.ok(result.scrollWidth <= result.width + 1, `${label} horizontal overflow: ${JSON.stringify(result)}`);
  assert.deepEqual(result.outside, [], `${label} controls stay inside the wheel`);
}

async function testLinks() {
  const expected = [];
  const opened = () => application.evaluate(() => globalThis.__smokeOpenedLinks);
  await openWheel();
  assert.deepEqual(await pages.overlay.locator('[data-guide]').evaluateAll((buttons) => buttons.map((b) => b.dataset.guide)), Object.keys(guideLinks));
  await checkWheelLayout('Guide');
  for (const [id, key] of Object.entries(guideLinks)) {
    await openWheel();
    await pages.overlay.locator(`[data-guide="${id}"]`).click();
    await waitForWindow('overlay', 'isVisible', false);
    expected.push(LINKS[key]);
    assert.deepEqual(await opened(), expected, `${id} opens its official destination`);
  }
  const resourceKeys = [];
  for (let page = 0; page < 2; page++) {
    await openWheel('resources');
    if (page) await pages.overlay.locator('#resource-next').click();
    assert.equal(await pages.overlay.locator('[data-resource]').count(), 6);
    await checkWheelLayout(`Resources page ${page + 1}`);
    const keys = await pages.overlay.locator('[data-resource]').evaluateAll((buttons) => buttons.map((b) => b.dataset.resource));
    resourceKeys.push(...keys);
    for (const key of keys) {
      assert.ok(Object.hasOwn(LINKS, key), `Resource ${key} has a permitted URL`);
      await openWheel('resources');
      if (page) await pages.overlay.locator('#resource-next').click();
      await pages.overlay.locator(`[data-resource="${key}"]`).click();
      await waitForWindow('overlay', 'isVisible', false);
      expected.push(LINKS[key]);
      assert.deepEqual(await opened(), expected, `${key} opens its official destination`);
    }
  }
  assert.equal(new Set(resourceKeys).size, 12, 'Two resource pages expose twelve distinct links');
  await application.evaluate(() => { globalThis.__smokeFailLinks = true; });
  await openWheel();
  await pages.overlay.locator('[data-guide="progress"]').click();
  await pages.overlay.waitForFunction(() => /Could not open|未能打开|无法打开/.test(document.querySelector('#wheel-hint')?.textContent || ''));
  await waitForWindow('overlay', 'isVisible', true);
  assert.deepEqual(await opened(), expected);
  await application.evaluate(() => { globalThis.__smokeFailLinks = false; });
  await pages.overlay.keyboard.press('1');
  await waitForWindow('overlay', 'isVisible', false);
  expected.push(LINKS.deliverables);
  assert.deepEqual(await opened(), expected, 'A failed link can be retried with the keyboard');
}

async function testPreferences() {
  await openWheel('preferences');
  assert.deepEqual(await pages.overlay.locator('[data-preference]').evaluateAll((buttons) => buttons.map((b) => b.dataset.preference)), ['language', 'sound', 'motion', 'size', 'focus', 'quit']);
  await checkWheelLayout('Preferences');
  await pages.overlay.locator('[data-preference="language"]').click();
  await pages.overlay.waitForFunction(() => document.documentElement.lang === 'zh-CN');
  await pages.pet.waitForFunction(() => document.documentElement.lang === 'zh-CN');
  await pages.overlay.locator('[data-preference="sound"]').click();
  await pages.overlay.waitForFunction(() => window.appState.settings.sound === false);
  await pages.overlay.locator('[data-preference="motion"]').click();
  await pages.overlay.waitForFunction(() => window.appState.settings.reducedMotion === true);
  await pages.overlay.locator('[data-preference="size"]').click();
  await pages.overlay.waitForFunction(() => window.appState.settings.petSize !== 1);
  await waitForWindow('overlay', 'isVisible', true);
  assert.equal(await pages.overlay.locator('#mode-preferences').getAttribute('aria-pressed'), 'true');
  await checkWheelLayout('Chinese preferences');
  await pages.overlay.locator('[data-preference="focus"]').click();
  await pages.overlay.waitForFunction(() => Boolean(window.appState.timer.endsAt));
  const timer = (await pages.overlay.evaluate(() => window.igem.getState())).timer;
  assert.equal(timer.durationMs, 25 * 60_000);
  assert.ok(timer.endsAt > Date.now() && timer.endsAt <= Date.now() + 25 * 60_000);
  await pages.overlay.locator('[data-preference="focus"]').click();
  await pages.overlay.waitForFunction(() => window.appState.timer.endsAt === null);
  assert.equal((await pages.overlay.evaluate(() => window.igem.getState())).timer.durationMs, 0);
  const saved = (await pages.overlay.evaluate(() => window.igem.getState())).settings;
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(profile, 'preferences.json'), 'utf8')).settings, saved);
  await application.close();
  application = null;
  // The restart also exercises actual Chromium device-scale-factor handling.
  await launch(['--force-device-scale-factor=2']);
  assert.deepEqual((await pages.pet.evaluate(() => window.igem.getState())).settings, saved, 'Preferences survive a full app restart');
  assert.ok(await pages.pet.evaluate(() => window.devicePixelRatio >= 1.9), 'Restart runs at 2x device scale');
  await openWheel('preferences');
  await pages.overlay.locator('[data-preference="language"]').click();
  await pages.overlay.waitForFunction(() => document.documentElement.lang === 'en');
}

async function testSecurityBoundaries() {
  for (const [key, value] of Object.entries(LINKS)) {
    const url = new URL(value);
    assert.equal(url.protocol, 'https:', `${key} uses HTTPS`);
    assert.ok(url.hostname === 'igem.org' || url.hostname.endsWith('.igem.org'), `${key} is official`);
    assert.equal(url.username + url.password, '', `${key} has no credentials`);
  }
  for (const value of ['unknown', '__proto__', 'constructor', 'https://example.com', null]) assert.equal(await pages.overlay.evaluate((v) => window.igem.openLink(v), value), false);
  for (const value of ['settings', '__proto__', null, 1]) assert.equal(await pages.pet.evaluate((v) => window.igem.openWheel(v), value), false);
  assert.equal(await pages.overlay.evaluate(() => window.igem.ping('unknown')), false);
  for (const minutes of [0, 181, 1.5, '25', null]) {
    assert.equal(await pages.overlay.evaluate(async (value) => {
      try { await window.igem.startTimer(value); return false; } catch { return true; }
    }, minutes), true, `Invalid timer duration ${JSON.stringify(minutes)} rejects`);
  }
  assert.equal(await pages.pet.evaluate(async () => {
    try { await window.igem.closeWheel(); return false; } catch { return true; }
  }), true, 'The pet cannot invoke an overlay-only action');
  const before = (await pages.overlay.evaluate(() => window.igem.getState())).settings;
  const after = await pages.overlay.evaluate(() => window.igem.updateSettings({ language: 'fr', sound: 'false', petSize: 999, focusMinutes: 0, extra: true }));
  assert.deepEqual(after.settings, before, 'Invalid preferences are ignored at the main-process boundary');
  assert.deepEqual(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((win) => {
    const p = win.webContents.getLastWebPreferences();
    return [p.nodeIntegration, p.contextIsolation, p.sandbox, p.webSecurity, p.webviewTag];
  })), [[false, true, true, true, false], [false, true, true, true, false]]);
}

async function testDrag() {
  await pages.overlay.evaluate(() => window.igem.closeWheel());
  await pages.pet.evaluate(() => window.igem.setPetInteractive(true));
  const before = await application.evaluate(({ BrowserWindow, screen }) => {
    const pet = BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().endsWith('/pet.html'));
    const bounds = pet.getBounds();
    globalThis.__smokeOriginalCursor = screen.getCursorScreenPoint;
    globalThis.__smokeCursor = { x: bounds.x + 100, y: bounds.y + 150 };
    screen.getCursorScreenPoint = () => ({ ...globalThis.__smokeCursor });
    return bounds;
  });
  try {
    const box = await pages.pet.locator('#pet').boundingBox();
    assert.ok(box, 'Gemy is a visible drag target');
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await pages.pet.mouse.move(x, y);
    await pages.pet.mouse.down();
    await pages.pet.mouse.move(x + 10, y);
    await pages.pet.waitForFunction(() => document.querySelector('#pet').classList.contains('dragging'));
    await application.evaluate(() => { globalThis.__smokeCursor.x -= 45; globalThis.__smokeCursor.y -= 30; });
    await pages.pet.mouse.move(x + 20, y - 10);
    await application.evaluate(async ({ BrowserWindow }, bounds) => {
      const pet = BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().endsWith('/pet.html'));
      const deadline = Date.now() + 5000;
      while (pet.getBounds().x === bounds.x && pet.getBounds().y === bounds.y) {
        if (Date.now() > deadline) throw new Error('Dragging did not move Gemy');
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }, before);
    await pages.pet.mouse.up();
    await pages.pet.waitForFunction(() => !document.querySelector('#pet').classList.contains('dragging'));
    await waitForWindow('overlay', 'isVisible', false);
    const after = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().endsWith('/pet.html')).getBounds());
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(profile, 'preferences.json'), 'utf8')).petPosition, { x: after.x, y: after.y }, 'Drag saves the final position');
    // A second renderer has the same preload but must not be able to drag Gemy.
    await pages.overlay.evaluate(() => window.igem.dragStart());
    await application.evaluate(() => { globalThis.__smokeCursor.x -= 30; });
    await pages.overlay.evaluate(async () => { window.igem.dragMove(); window.igem.dragEnd(); await window.igem.getState(); });
    const rejected = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().endsWith('/pet.html')).getBounds());
    assert.deepEqual(rejected, after, 'Drag IPC ignores a non-pet sender');
  } finally {
    await pages.pet.mouse.up().catch(() => {});
    await application.evaluate(({ screen }) => { screen.getCursorScreenPoint = globalThis.__smokeOriginalCursor; });
  }
}

async function testSmallHighDpiDisplay() {
  await pages.overlay.evaluate(() => window.igem.closeWheel());
  await application.evaluate(({ screen }) => {
    globalThis.__smokeOriginalDisplay = screen.getDisplayNearestPoint;
    globalThis.__smokeOriginalCursor = screen.getCursorScreenPoint;
    const display = screen.getPrimaryDisplay();
    const workArea = { ...display.workArea, width: Math.min(960, display.workArea.width), height: 420 };
    screen.getDisplayNearestPoint = () => ({ ...display, workArea, scaleFactor: 2 });
    screen.getCursorScreenPoint = () => ({ x: workArea.x + 200, y: workArea.y + 200 });
  });
  try {
    await openWheel();
    const sizes = await application.evaluate(({ BrowserWindow }) => Object.fromEntries(BrowserWindow.getAllWindows().map((win) => [win.webContents.getURL().endsWith('/pet.html') ? 'pet' : 'overlay', { bounds: win.getBounds(), zoom: win.webContents.getZoomFactor() }])));
    assert.equal(sizes.overlay.bounds.width, 420);
    assert.equal(sizes.overlay.bounds.height, 420);
    assert.equal(sizes.overlay.zoom, 0.75);
    assert.equal(sizes.pet.zoom, 1, 'Overlay resizing must not change the companion zoom');
    await checkWheelLayout('Guide on a small high-DPI work area');
    for (const view of ['resources', 'signals', 'preferences']) {
      await pages.overlay.locator(`#mode-${view}`).click();
      await checkWheelLayout(`${view} on a small high-DPI work area`);
    }
    await pages.overlay.keyboard.press('Escape');
    await waitForWindow('overlay', 'isVisible', false);
  } finally {
    await application.evaluate(({ screen }) => {
      screen.getDisplayNearestPoint = globalThis.__smokeOriginalDisplay;
      screen.getCursorScreenPoint = globalThis.__smokeOriginalCursor;
    });
  }
}

async function testSignalsAndDismissal() {
  await openWheel('signals');
  assert.equal(await pages.overlay.locator('[data-ping]').count(), 6);
  await pages.overlay.locator('[data-ping="idea"]').click();
  await pages.overlay.locator('#ping-marker').waitFor({ state: 'visible' });
  assert.equal(await pages.overlay.locator('#wheel').isVisible(), false);
  assert.equal(await pages.overlay.locator('#ping-label').innerText(), 'New idea');
  await pages.pet.waitForFunction(() => document.querySelector('#pet').dataset.reaction === 'idea');
  await openWheel();
  assert.equal(await pages.overlay.locator('#mode-guide').getAttribute('aria-pressed'), 'true', 'Opening with no view resets to the guide');
  await pages.overlay.keyboard.press('Escape');
  await waitForWindow('overlay', 'isVisible', false);
  await openWheel();
  await pages.overlay.locator('#wheel-cancel').click();
  await waitForWindow('overlay', 'isVisible', false);
  await openWheel();
  await waitForWindow('overlay', 'isFocused', true);
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().endsWith('/overlay.html')).blur());
  await waitForWindow('overlay', 'isVisible', false);
}

async function run() {
  await launch();
  assert.deepEqual((await pages.pet.evaluate(() => window.igem.getState())).settings, DEFAULT_SETTINGS);
  await testLinks();
  console.log('Passed official guide/resource links and retry.');
  await testPreferences();
  console.log('Passed preferences, timer and persisted restart.');
  await testSecurityBoundaries();
  console.log('Passed IPC boundaries.');
  await testDrag();
  console.log('Passed drag and sender permissions.');
  await testSmallHighDpiDisplay();
  console.log('Passed high-DPI layout.');
  await testSignalsAndDismissal();
  assert.deepEqual(rendererErrors, [], 'No renderer exceptions or console errors');
  const visuals = path.join(os.tmpdir(), 'igem-ping-wheel-review');
  fs.mkdirSync(visuals, { recursive: true });
  await pages.overlay.evaluate(() => window.igem.updateSettings({ language: 'zh' }));
  await openWheel('resources');
  await pages.overlay.screenshot({ path: path.join(visuals, 'resources-zh.png'), omitBackground: true, animations: 'disabled' });
  await pages.overlay.locator('#resource-next').click();
  await pages.overlay.screenshot({ path: path.join(visuals, 'resources-zh-2.png'), omitBackground: true, animations: 'disabled' });
  await openWheel('preferences');
  await pages.overlay.screenshot({ path: path.join(visuals, 'preferences-zh.png'), omitBackground: true, animations: 'disabled' });
  await pages.overlay.evaluate((defaults) => window.igem.updateSettings(defaults), DEFAULT_SETTINGS);
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  await openWheel();
  await pages.overlay.screenshot({ path: path.join(root, 'docs', 'wheel.png'), omitBackground: true, animations: 'disabled' });
  await pages.overlay.evaluate(() => window.igem.closeWheel());
  console.log('Smoke passed: two windows, four views, 18 official links, in-wheel preferences, persistence, timer validation, drag permissions, 2x DPI, signals, Escape, center close and blur.');
  console.log(`Captured docs/wheel.png; Chinese resource and preference previews: ${visuals}`);
}

run().catch(async (error) => {
  console.error(error);
  if (pages?.overlay && !pages.overlay.isClosed()) console.error('Recent wheel events:', await pages.overlay.evaluate(() => window.__smokeEvents?.slice(-20)).catch(() => []));
  process.exitCode = 1;
}).finally(async () => {
  if (application) await application.close().catch(() => {});
  const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(temporary));
  if (relative.startsWith('igem-ping-smoke-') && !relative.includes(path.sep)) fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 3 });
});
