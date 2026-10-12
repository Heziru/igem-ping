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

async function run() {
  let { settings, pet, overlay } = await launch();
  assert.equal(await settings.locator('html').getAttribute('lang'), 'en');
  assert.match(await settings.locator('#home h1').innerText(), /next big idea/);
  assert.deepEqual((await settings.evaluate(() => window.igem.getState())).settings, DEFAULT_SETTINGS);
  assert.ok(await pet.locator('#pet img').evaluate((img) => img.naturalWidth > 0));
  await noHorizontalOverflow(settings, 'English home');

  await settings.locator('#language').selectOption('zh');
  await settings.waitForFunction(() => document.documentElement.lang === 'zh-CN');
  assert.match(await settings.locator('#home h1').innerText(), /好想法/);
  await settings.locator('[data-panel="preferences"]').click();
  await settings.locator('#sound').uncheck();
  await settings.locator('#reducedMotion').check();
  await settings.locator('#petSize').selectOption('1.2');
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
  await settings.locator('#language').selectOption('en');
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
  await noHorizontalOverflow(overlay, 'Ping wheel');
  await overlay.screenshot({ path: path.join(root, 'docs', 'wheel.png'), omitBackground: true, animations: 'disabled' });
  await overlay.locator('[data-ping="idea"]').click();
  await overlay.locator('#ping-marker').waitFor({ state: 'visible' });
  assert.equal(await overlay.locator('#wheel').isVisible(), false);
  assert.equal(await overlay.locator('#ping-label').innerText(), 'New idea');
  await pet.waitForFunction(() => document.querySelector('#pet').dataset.reaction === 'idea');
  await overlay.evaluate(() => window.igem.closeWheel());

  // Reopen after the ping and verify the keyboard cancellation route.
  await settings.evaluate(() => window.igem.openWheel());
  await overlay.locator('#wheel').waitFor({ state: 'visible' });
  await overlay.keyboard.press('Escape');
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((win) => win.getTitle() === 'iGEM Ping Wheel').isVisible()), false);
  assert.deepEqual(rendererErrors, [], 'No renderer exceptions or console errors');
  console.log('Smoke passed: 3 windows, artwork, languages, persisted preferences, timer validation, official links, wheel/ping, cancellation, and layout.');
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
