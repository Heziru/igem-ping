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
// Set the test profile before the real app reads preferences or takes its lock.
fs.writeFileSync(entry, `require('electron').app.setPath('userData', ${JSON.stringify(profile)});\nrequire(${JSON.stringify(path.join(root, 'main.cjs'))});\n`);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let application;
const rendererErrors = [];

async function launch() {
  application = await electron.launch({ args: [entry], cwd: root, env, timeout: 30_000 });
  await application.evaluate(({ shell }) => {
    globalThis.__smokeOpenedLinks = [];
    globalThis.__smokeFailLinks = false;
    // Exercise the real allowlist and IPC without launching any browser windows.
    shell.openExternal = async (url) => {
      if (globalThis.__smokeFailLinks) throw new Error('Simulated browser launch failure');
      globalThis.__smokeOpenedLinks.push(url);
    };
  });
  const observe = (page) => {
    page.on('pageerror', (error) => rendererErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') rendererErrors.push(message.text());
    });
  };
  application.on('window', observe);
  application.windows().forEach(observe);
  await application.firstWindow();
  while (application.windows().length < 3) {
    await application.waitForEvent('window', { timeout: 10_000 });
  }
  const pages = {};
  for (const page of application.windows()) {
    page.setDefaultTimeout(10_000);
    await page.waitForLoadState('domcontentloaded');
    const role = path.basename(new URL(page.url()).pathname, '.html');
    pages[role] = page;
    await page.waitForFunction(() => window.igem && window.appState);
    await page.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0));
  }
  assert.deepEqual(Object.keys(pages).sort(), ['overlay', 'pet', 'settings']);
  assert.equal(await application.evaluate(({ app }) => app.getPath('userData')), profile);
  return pages;
}

async function noHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(dimensions.scroll <= dimensions.width + 1, `${label} has horizontal overflow: ${JSON.stringify(dimensions)}`);
}

async function waitForWindow(title, method, expected) {
  await application.evaluate(async ({ BrowserWindow }, target) => {
    const window = BrowserWindow.getAllWindows().find((win) => win.getTitle() === target.title);
    if (!window) throw new Error(`Missing window: ${target.title}`);
    const deadline = Date.now() + 10_000;
    while (window[target.method]() !== target.expected) {
      if (Date.now() >= deadline) throw new Error(`${target.title}.${target.method} did not become ${target.expected}`);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }, { title, method, expected });
}

async function run() {
  let { settings, pet, overlay } = await launch();
  assert.equal(await settings.locator('html').getAttribute('lang'), 'en');
  assert.match(await settings.locator('#home h1').innerText(), /Your shortcut to\s+the iGEM world/);
  assert.deepEqual((await settings.evaluate(() => window.igem.getState())).settings, DEFAULT_SETTINGS);
  assert.ok(await pet.locator('#pet img').evaluate((img) => img.naturalWidth > 0));
  await noHorizontalOverflow(settings, 'English home');

  await settings.locator('#minimize').click();
  await waitForWindow('iGEM Ping', 'isMinimized', true);
  await pet.evaluate(() => window.igem.showSettings());
  await waitForWindow('iGEM Ping', 'isMinimized', false);
  await waitForWindow('iGEM Ping', 'isVisible', true);
  await settings.locator('#hide').click();
  await waitForWindow('iGEM Ping', 'isVisible', false);
  await pet.evaluate(() => window.igem.showSettings());
  await waitForWindow('iGEM Ping', 'isVisible', true);
  for (const method of ['minimizeSettings', 'hideSettings']) {
    assert.equal(await pet.evaluate(async (name) => {
      try { await window.igem[name](); return false; } catch { return true; }
    }, method), true, `${method} must reject a non-settings sender`);
  }

  await settings.locator('#language').click();
  await settings.waitForFunction(() => document.documentElement.lang === 'zh-CN');
  assert.match(await settings.locator('#home h1').innerText(), /通往 iGEM 世界/);
  await settings.locator('[data-panel="preferences"]').click();
  await settings.locator('#sound').uncheck();
  await settings.locator('#reducedMotion').check();
  await settings.locator('[data-size="1.2"]').click();
  await settings.locator('#petVisible').uncheck();
  await settings.waitForFunction(() => window.appState.settings.petVisible === false);
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((win) => win.getTitle() === 'iGEM Ping Companion').isVisible()), false);
  await settings.locator('#petVisible').check();
  await settings.waitForFunction(() => window.appState.settings.petVisible === true);
  const savedSettings = (await settings.evaluate(() => window.igem.getState())).settings;
  assert.equal(savedSettings.sound, false);
  assert.equal(savedSettings.reducedMotion, true);
  assert.equal(savedSettings.petSize, 1.2);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(profile, 'preferences.json'), 'utf8')).settings, savedSettings);
  await noHorizontalOverflow(settings, 'Chinese preferences');

  await application.close();
  application = null;
  ({ settings, pet, overlay } = await launch());
  assert.deepEqual((await settings.evaluate(() => window.igem.getState())).settings, savedSettings, 'Preferences survive a full app restart');
  await settings.locator('#language').click();
  await settings.waitForFunction(() => document.documentElement.lang === 'en');

  await settings.locator('#minutes').fill('1');
  await settings.locator('#timer-toggle').click();
  await settings.waitForFunction(() => Boolean(window.appState.timer.endsAt));
  const timer = (await settings.evaluate(() => window.igem.getState())).timer;
  assert.equal(timer.durationMs, 60_000);
  assert.ok(timer.endsAt > Date.now() && timer.endsAt <= Date.now() + 60_000);
  assert.equal(await settings.locator('#minutes').isDisabled(), true);
  assert.equal(await settings.locator('#timer-toggle').innerText(), 'End session');
  await settings.locator('#timer-toggle').click();
  await settings.waitForFunction(() => window.appState.timer.endsAt === null);
  assert.equal((await settings.evaluate(() => window.igem.getState())).timer.durationMs, 0);
  for (const minutes of [0, 181, 1.5, '25', null]) {
    const rejected = await settings.evaluate(async (value) => {
      try { await window.igem.startTimer(value); return false; } catch { return true; }
    }, minutes);
    assert.equal(rejected, true, `Invalid timer duration ${JSON.stringify(minutes)} must reject`);
  }
  assert.equal(await settings.evaluate(() => window.igem.ping('unknown')), false);
  for (const invalidLink of ['unknown', '__proto__', 'https://example.com', null]) {
    assert.equal(await settings.evaluate((value) => window.igem.openLink(value), invalidLink), false);
  }
  for (const [key, value] of Object.entries(LINKS)) {
    const url = new URL(value);
    assert.equal(url.protocol, 'https:', `${key} must use HTTPS`);
    assert.ok(url.hostname === 'igem.org' || url.hostname.endsWith('.igem.org'), `${key} must be official`);
    assert.equal(url.username + url.password, '', `${key} must not contain credentials`);
  }
  await settings.locator('[data-panel="resources"]').click();
  for (const key of await settings.locator('[data-link]').evaluateAll((buttons) => buttons.map((button) => button.dataset.link))) {
    assert.ok(Object.hasOwn(LINKS, key), `Resource ${key} must have a permitted URL`);
  }
  await noHorizontalOverflow(settings, 'English resources');
  await settings.locator('[data-panel="home"]').click();
  await settings.evaluate((defaults) => window.igem.updateSettings(defaults), DEFAULT_SETTINGS);
  await settings.waitForFunction(() => document.querySelector('#minutes').value === '25');
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  await settings.screenshot({ path: path.join(root, 'docs', 'preview.png'), fullPage: true, animations: 'disabled' });

  await settings.locator('#open-wheel').click();
  await overlay.locator('#wheel').waitFor({ state: 'visible' });
  assert.equal(await overlay.locator('.wheel-option').count(), 6);
  assert.equal(await overlay.locator('#mode-guide').getAttribute('aria-pressed'), 'true');
  const guideLinks = {
    progress: 'deliverables', judging: 'judging', uploads: 'uploads',
    projects: 'projects', start: 'resources', submissions: 'submissions',
  };
  assert.deepEqual(await overlay.locator('[data-guide]').evaluateAll((buttons) => buttons.map((button) => button.dataset.guide)), Object.keys(guideLinks));
  assert.deepEqual(await overlay.evaluate(async () => {
    const { GUIDES } = await import('./shared.js');
    return Object.fromEntries(GUIDES.map((guide) => [guide.id, guide.linkKey]));
  }), guideLinks);
  await noHorizontalOverflow(overlay, 'Official guide wheel');
  await overlay.screenshot({ path: path.join(root, 'docs', 'wheel.png'), omitBackground: true, animations: 'disabled' });

  const expectedLinks = [];
  for (const [id, key] of Object.entries(guideLinks)) {
    assert.ok(Object.hasOwn(LINKS, key), `${id} must have an allowlisted destination`);
    await settings.evaluate(() => window.igem.openWheel());
    await waitForWindow('iGEM Ping Wheel', 'isVisible', true);
    await overlay.locator(`[data-guide="${id}"]`).click();
    await waitForWindow('iGEM Ping Wheel', 'isVisible', false);
    expectedLinks.push(LINKS[key]);
    assert.deepEqual(await application.evaluate(() => globalThis.__smokeOpenedLinks), expectedLinks,
      `${id} must open its official URL through the allowlist`);
  }

  // A failed browser launch leaves the guide available and reports a real error.
  await application.evaluate(() => { globalThis.__smokeFailLinks = true; });
  await settings.evaluate(() => window.igem.openWheel());
  await waitForWindow('iGEM Ping Wheel', 'isVisible', true);
  await overlay.locator('[data-guide="progress"]').click();
  await overlay.waitForFunction(() => document.querySelector('#wheel-hint').textContent.includes('Could not open link'));
  await waitForWindow('iGEM Ping Wheel', 'isVisible', true);
  assert.deepEqual(await application.evaluate(() => globalThis.__smokeOpenedLinks), expectedLinks);
  await application.evaluate(() => { globalThis.__smokeFailLinks = false; });
  await overlay.keyboard.press('1');
  await waitForWindow('iGEM Ping Wheel', 'isVisible', false);
  expectedLinks.push(LINKS.deliverables);
  assert.deepEqual(await application.evaluate(() => globalThis.__smokeOpenedLinks), expectedLinks);

  await settings.evaluate(() => window.igem.openWheel());
  await waitForWindow('iGEM Ping Wheel', 'isVisible', true);
  await overlay.locator('#mode-signals').click();
  assert.equal(await overlay.locator('#mode-signals').getAttribute('aria-pressed'), 'true');
  assert.equal(await overlay.locator('[data-ping]').count(), 6);
  await noHorizontalOverflow(overlay, 'Signals wheel');
  await overlay.locator('[data-ping="idea"]').click();
  await overlay.locator('#ping-marker').waitFor({ state: 'visible' });
  assert.equal(await overlay.locator('#wheel').isVisible(), false);
  assert.equal(await overlay.locator('#ping-label').innerText(), 'New idea');
  await pet.waitForFunction(() => document.querySelector('#pet').dataset.reaction === 'idea');
  await overlay.evaluate(() => window.igem.closeWheel());

  // Reopen after the ping and verify the keyboard cancellation route.
  await settings.evaluate(() => window.igem.openWheel());
  await overlay.locator('#wheel').waitFor({ state: 'visible' });
  assert.equal(await overlay.locator('#mode-guide').getAttribute('aria-pressed'), 'true', 'Reopening restores the default guide');
  assert.equal(await overlay.locator('[data-guide]').count(), 6);
  await overlay.keyboard.press('Escape');
  await waitForWindow('iGEM Ping Wheel', 'isVisible', false);
  assert.deepEqual(rendererErrors, [], 'No renderer exceptions or console errors');
  console.log('Smoke passed: 3 windows, artwork, languages, persisted preferences, frameless controls, timer validation, six official guide links, link failures, signals/ping, cancellation, and layout.');
  console.log('Captured docs/preview.png and docs/wheel.png from app windows only.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (application) await application.close().catch(() => {});
  const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(temporary));
  if (relative.startsWith('igem-ping-smoke-') && !relative.includes(path.sep)) {
    fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 3 });
  }
});
