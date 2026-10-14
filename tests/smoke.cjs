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
const layoutErrors = new Set();
const guideLinks = { progress: 'deliverables', judging: 'judging', uploads: 'uploads', projects: null, start: 'resources', submissions: 'submissions' };

async function launch(extraArgs = []) {
  application = await electron.launch({ args: ['--disable-backgrounding-occluded-windows', ...extraArgs, entry], cwd: root, env, timeout: 30_000 });
  await application.evaluate(({ shell, ipcMain }) => {
    globalThis.__smokeOpenedLinks = [];
    globalThis.__smokeFailLinks = false;
    globalThis.__smokePetPressed = false;
    ipcMain.on('igem:pet-interactive', (_event, _interactive, pressed) => {
      if (typeof pressed === 'boolean') globalThis.__smokePetPressed = pressed;
    });
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

async function captureOverlay(file) {
  const png = await application.evaluate(async ({ BrowserWindow }) => {
    const overlay = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().endsWith('/overlay.html'));
    return (await overlay.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG().toString('base64');
  });
  fs.writeFileSync(file, Buffer.from(png, 'base64'));
}

async function checkWheelLayout(label) {
  await pages.overlay.waitForFunction(() => [...document.querySelectorAll('.wheel-option')].every((el) => el.getAnimations().every((animation) => animation.playState === 'finished')));
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
  const circles = pages.overlay.locator('.wheel-option, #wheel-cancel, #resource-next:visible');
  for (let i = 0; i < await circles.count(); i++) {
    const circle = circles.nth(i);
    for (const interaction of ['normal', 'hover', 'focus']) {
      if (interaction === 'hover') await circle.hover();
      if (interaction === 'focus') await circle.focus();
      const dimensions = await circle.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return { width: box.width, height: box.height, radius: getComputedStyle(el).borderTopLeftRadius,
          overflows: el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1 };
      });
      assert.ok(Math.abs(dimensions.width - dimensions.height) < 0.5, `${label} ${i} ${interaction}: circle is square`);
      assert.equal(dimensions.radius, '50%', `${label} ${i} ${interaction}: circle stays round`);
      assert.equal(dimensions.overflows, false, `${label} ${i} ${interaction}: content fits`);
    }
    const overlaps = await pages.overlay.evaluate(() => {
      const footer = document.querySelector('.wheel-footer').getBoundingClientRect();
      return [...document.querySelectorAll('.wheel-option, #wheel-cancel, #resource-next')]
        .filter(el => el.getClientRects().length).filter(el => {
          const r = el.getBoundingClientRect();
          return r.left < footer.right && r.right > footer.left && r.top < footer.bottom && r.bottom > footer.top + 1;
        }).map(el => el.id || el.getAttribute('aria-label'));
    });
    if (overlaps.length) layoutErrors.add(`${label}: description overlaps ${overlaps.join(', ')}`);
  }
  await pages.overlay.locator('#wheel-cancel').focus();
  await pages.overlay.mouse.move(5, 5);
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
    if (id === 'projects') {
      await pages.overlay.locator('#project-search').waitFor({ state: 'visible' });
      assert.deepEqual(await opened(), expected, 'Project search opens inside the app');
      await pages.overlay.locator('#search-back').click();
      await pages.overlay.locator('#wheel').waitFor({ state: 'visible' });
      continue;
    }
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

async function enterSearch(query) {
  await pages.overlay.locator('#search-query').fill(query);
  await pages.overlay.locator('#search-submit').click();
  await pages.overlay.waitForFunction((value) => !document.querySelector('#search-submit').disabled
    && document.querySelector('#search-status').textContent.includes(`“${value}”`), query);
}

async function testProjectSearch() {
  await openWheel();
  await pages.overlay.locator('[data-guide="projects"]').click();
  await pages.overlay.locator('#project-search').waitFor({ state: 'visible' });
  const before = await application.evaluate(() => globalThis.__smokeOpenedLinks.length);
  await pages.overlay.locator('#search-query').pressSequentially('12');
  assert.equal(await pages.overlay.locator('#search-query').inputValue(), '12');
  assert.equal(await pages.overlay.locator('#project-search').isVisible(), true);
  assert.equal(await application.evaluate(() => globalThis.__smokeOpenedLinks.length), before, 'Typing 1/2 does not choose wheel links');
  const info = await pages.overlay.evaluate(() => window.igem.searchInfo());
  assert.ok(info.count > 0 && info.years.length > 0, 'The bundled index has actual descriptions');
  const expected = await pages.overlay.evaluate(() => window.igem.searchProjects({ query: 'IBD' }));
  assert.ok(expected.total > 0, 'Real Project Description pages mention IBD');
  await enterSearch('IBD');
  assert.equal(await pages.overlay.locator('.search-result').count(), expected.results.length);
  assert.equal(await pages.overlay.locator('.search-result h2').first().innerText(), expected.results[0].team);
  assert.match(await pages.overlay.locator('.result-snippet').first().innerText(), /\bIBD\b/i);
  assert.ok(await pages.overlay.locator('.result-snippet mark').count() > 0, 'Results highlight matching text');
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  await captureOverlay(path.join(root, 'docs', 'search.png'));
  await pages.overlay.locator('.result-open').first().click();
  assert.equal(await application.evaluate(() => globalThis.__smokeOpenedLinks.at(-1)), expected.results[0].url, 'Read original opens the indexed official source');
  const multiple = await pages.overlay.evaluate(() => window.igem.searchProjects({ query: 'IBD inflammatory' }));
  assert.ok(multiple.total > 0 && multiple.total <= expected.total, 'Multiple keywords match actual descriptions');
  await enterSearch('IBD inflammatory');
  assert.equal(await pages.overlay.locator('.search-result').count(), multiple.results.length);
  await enterSearch('IBD');
  for (const selectedYear of info.years.slice(0, 2)) {
    const filtered = await pages.overlay.evaluate(year => window.igem.searchProjects({ query: 'IBD', year }), selectedYear);
    await pages.overlay.locator('#search-year').selectOption(String(selectedYear));
    await pages.overlay.waitForFunction(() => !document.querySelector('#search-submit').disabled);
    assert.equal(await pages.overlay.locator('.search-result').count(), filtered.results.length);
    assert.ok((await pages.overlay.locator('.result-heading>span').allTextContents()).every(value => Number(value) === selectedYear), 'Year filter applies to every result');
  }
  await enterSearch('no_such_igem_project_9018230476');
  assert.equal(await pages.overlay.locator('.search-result').count(), 0);
  assert.match(await pages.overlay.locator('#search-status').innerText(), /No matches/);
  await pages.overlay.locator('#search-back').click();
  await pages.overlay.locator('#wheel').waitFor({ state: 'visible' });
  assert.equal(await pages.overlay.locator('#project-search').isVisible(), false);
  await pages.overlay.locator('[data-guide="projects"]').click();
  await pages.overlay.keyboard.press('Escape');
  await waitForWindow('overlay', 'isVisible', false);
}

async function testSearchPagination() {
  await openWheel();
  await pages.overlay.locator('[data-guide="projects"]').click();
  await pages.overlay.locator('#project-search').waitFor({ state: 'visible' });
  await pages.overlay.locator('#search-year').selectOption('');
  await enterSearch('protein');
  const second = await pages.overlay.evaluate(() => window.igem.searchProjects({ query: 'protein', offset: 30 }));
  assert.ok(second.results.length > 0, 'The actual protein query has a second page');
  await pages.overlay.locator('#search-query').fill('IBD');
  await pages.overlay.locator('#search-next').click();
  await pages.overlay.waitForFunction(() => !document.querySelector('#search-submit').disabled
    && document.querySelector('#search-page').textContent.startsWith('2 /'));
  assert.match(await pages.overlay.locator('#search-status').innerText(), /“protein”/);
  assert.equal(await pages.overlay.locator('.search-result h2').first().innerText(), second.results[0].team, 'Pagination keeps the submitted query');
  assert.equal(await pages.overlay.locator('#search-query').inputValue(), 'IBD', 'Pagination preserves the unsubmitted draft');
  await enterSearch('IBD');
  assert.match(await pages.overlay.locator('#search-page').innerText(), /^1 \/ /, 'Submitting the draft resets to page one');
  const ibd = await pages.overlay.evaluate(() => window.igem.searchProjects({ query: 'IBD' }));
  assert.equal(await pages.overlay.locator('.search-result').count(), ibd.results.length);
  assert.equal(await pages.overlay.locator('.search-result h2').first().innerText(), ibd.results[0].team);
  await enterSearch('x'.repeat(160));
  assert.equal(await pages.overlay.locator('.search-result').count(), 0);
  const layout = await pages.overlay.evaluate(() => {
    const status = document.querySelector('#search-status');
    const panel = document.querySelector('#project-search');
    return { statusOverflow: status.scrollWidth > status.clientWidth + 1,
      panelOverflow: panel.scrollWidth > panel.clientWidth + 1,
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
  });
  assert.deepEqual(layout, { statusOverflow: false, panelOverflow: false, documentOverflow: false }, 'A 160-character word wraps inside the search panel');
  await pages.overlay.evaluate(() => window.igem.closeWheel());
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
  for (const method of ['searchInfo', 'searchProjects', 'openProject']) {
    assert.equal(await pages.pet.evaluate(async (name) => {
      try { await window.igem[name]({ query: 'IBD' }); return false; } catch { return true; }
    }, method), true, `${method} only accepts the overlay sender`);
  }
  assert.equal(await pages.overlay.evaluate(async () => {
    try { await window.igem.toggleWheel(); return false; } catch { return true; }
  }), true, 'Only Gemy can toggle its wheel');
  for (const id of ['https://example.com/', 'https://2025.igem.wiki/arbitrary', 'unindexed-project-9018230', '__proto__', null]) {
    assert.equal(await pages.overlay.evaluate(value => window.igem.openProject(value), id), false, 'Original project links must refer to an indexed ID');
  }
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
  await pages.pet.evaluate(() => window.igem.updateSettings({ reducedMotion: false }));
  await pages.pet.evaluate(() => window.igem.setPetInteractive(true));
  const before = await application.evaluate(({ BrowserWindow, screen }) => {
    const pet = BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().endsWith('/pet.html'));
    pet.setPosition(-1400, 300);
    const bounds = pet.getBounds();
    globalThis.__smokeOriginalCursor = screen.getCursorScreenPoint;
    globalThis.__smokeOriginalNearest = screen.getDisplayNearestPoint;
    globalThis.__smokeOriginalMatching = screen.getDisplayMatching;
    const display = { ...screen.getPrimaryDisplay(), workArea: { x: -1920, y: 0, width: 1920, height: 1040 } };
    screen.getDisplayNearestPoint = () => display;
    screen.getDisplayMatching = () => display;
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
    async function dropNearEdge(reducedMotion) {
      await pages.pet.evaluate(value => window.igem.updateSettings({ reducedMotion: value }), reducedMotion);
      const box = await pages.pet.locator('#pet').boundingBox();
      await application.evaluate(({ BrowserWindow }) => {
        const pet = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().endsWith('/pet.html'));
        const bounds = pet.getBounds();
        globalThis.__smokeCursor = { x: bounds.x + 80, y: bounds.y + 100 };
      });
      await pages.pet.mouse.move(box.x + 60, box.y + 70);
      await pages.pet.mouse.down();
      await pages.pet.mouse.move(box.x + 70, box.y + 70);
      await pages.pet.waitForFunction(() => document.querySelector('#pet').classList.contains('dragging'));
      await application.evaluate(() => { globalThis.__smokeCursor = { x: -1916 + 80, y: 260 + 100 }; });
      await pages.pet.mouse.move(box.x + 80, box.y + 70);
      await pages.pet.mouse.up();
      await pages.pet.evaluate(() => window.igem.getState());
      return application.evaluate(async ({ BrowserWindow }) => {
        const pet = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().endsWith('/pet.html'));
        const samples = [];
        for (let i = 0; i < 18; i++) {
          samples.push(pet.getBounds());
          await new Promise(resolve => setTimeout(resolve, 16));
        }
        return samples;
      });
    }
    const rebound = await dropNearEdge(false);
    assert.equal(rebound.at(-1).x, -1920, 'Dropping within 8 DIP docks at the negative display edge');
    assert.ok(rebound.some(frame => frame.x > -1920), 'Gentle mode visibly rebounds inward');
    assert.ok(rebound.every(frame => frame.x >= -1920 && frame.x + frame.width <= 0 && frame.y >= 0 && frame.y + frame.height <= 1040), 'Rebound never leaves the work area');
    const reduced = await dropNearEdge(true);
    assert.ok(reduced.every(frame => frame.x === -1920), 'Reduced motion goes directly to the docked position');
  } finally {
    await pages.pet.mouse.up().catch(() => {});
    await application.evaluate(({ screen }) => {
      screen.getCursorScreenPoint = globalThis.__smokeOriginalCursor;
      screen.getDisplayNearestPoint = globalThis.__smokeOriginalNearest;
      screen.getDisplayMatching = globalThis.__smokeOriginalMatching;
    });
  }
}

async function testPetToggle() {
  await pages.overlay.evaluate(() => window.igem.closeWheel());
  await pages.pet.locator('#pet').click();
  await waitForWindow('overlay', 'isVisible', true);
  await pages.pet.locator('#pet').click();
  await waitForWindow('overlay', 'isVisible', false);
  await pages.pet.locator('#pet').click();
  await waitForWindow('overlay', 'isVisible', true);
  const box = await pages.pet.locator('#pet').boundingBox();
  await pages.pet.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await pages.pet.mouse.down();
  await application.evaluate(async ({ BrowserWindow }) => {
    const overlay = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().endsWith('/overlay.html'));
    const pet = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().endsWith('/pet.html'));
    pet.setFocusable(true);
    pet.focus();
    await new Promise(resolve => setTimeout(resolve, 120));
    if (overlay.isFocused()) throw new Error('The native focus transfer did not occur');
    if (!overlay.isVisible()) throw new Error('Blur closed the wheel while Gemy was pressed');
  });
  await pages.pet.mouse.up();
  await waitForWindow('overlay', 'isVisible', false);
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().endsWith('/pet.html')).setFocusable(false));
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
  // On Windows, blur() can immediately refocus the only focusable window.
  // Temporarily use the companion as a deterministic second native focus target.
  await application.evaluate(({ BrowserWindow }) => {
    const pet = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().endsWith('/pet.html'));
    pet.setFocusable(true);
    pet.focus();
  });
  try { await waitForWindow('overlay', 'isVisible', false); }
  finally {
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().endsWith('/pet.html')).setFocusable(false));
  }
}

async function run() {
  await launch();
  if (process.argv.includes('--search-pagination')) {
    await testSearchPagination();
    assert.deepEqual(rendererErrors, [], 'No renderer errors in the targeted regression');
    console.log('Targeted regression passed: pagination keeps the submitted query; IBD submission resets the page; 160-character status wraps without overflow.');
    return;
  }
  assert.deepEqual((await pages.pet.evaluate(() => window.igem.getState())).settings, DEFAULT_SETTINGS);
  await testLinks();
  console.log('Passed official guide/resource links and retry.');
  await testProjectSearch();
  await testSearchPagination();
  console.log('Passed actual IBD search, multiple keywords, year filter, source links and search navigation.');
  await testPreferences();
  console.log('Passed preferences, timer and persisted restart.');
  await testSecurityBoundaries();
  console.log('Passed IPC boundaries.');
  await testPetToggle();
  console.log('Passed Gemy toggle and pressed-blur race.');
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
  await captureOverlay(path.join(visuals, 'resources-zh.png'));
  await pages.overlay.locator('#resource-next').click();
  await captureOverlay(path.join(visuals, 'resources-zh-2.png'));
  await openWheel('preferences');
  await checkWheelLayout('Chinese preferences with all descriptions');
  await captureOverlay(path.join(visuals, 'preferences-zh.png'));
  await openWheel();
  await pages.overlay.locator('[data-guide="projects"]').focus();
  await captureOverlay(path.join(visuals, 'long-description-zh.png'));
  await pages.overlay.evaluate((defaults) => window.igem.updateSettings(defaults), DEFAULT_SETTINGS);
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  await openWheel();
  await captureOverlay(path.join(root, 'docs', 'wheel.png'));
  await pages.overlay.evaluate(() => window.igem.closeWheel());
  assert.deepEqual([...layoutErrors], [], 'Descriptions never overlap wheel controls');
  console.log('Smoke passed: two windows, four views, official links, real indexed search, IPC boundaries, preferences, persistence, timer, Gemy toggle and edge rebound, circular controls, 2x DPI, signals and dismissal.');
  console.log(`Captured docs/wheel.png and docs/search.png; Chinese and long-description previews: ${visuals}`);
}

run().catch(async (error) => {
  console.error(error);
  if (application) console.error('Window state:', await application.evaluate(({ BrowserWindow }) => ({
    pressed: globalThis.__smokePetPressed,
    windows: BrowserWindow.getAllWindows().map(win => ({ url: win.webContents.getURL(), visible: win.isVisible(), focused: win.isFocused() })),
  })).catch(() => null));
  if (pages?.overlay && !pages.overlay.isClosed()) {
    const failure = path.join(os.tmpdir(), 'igem-ping-smoke-failure.png');
    await captureOverlay(failure).catch(() => {});
    console.error('Failure screenshot:', failure);
  }
  if (pages?.overlay && !pages.overlay.isClosed()) console.error('Recent wheel events:', await pages.overlay.evaluate(() => window.__smokeEvents?.slice(-20)).catch(() => []));
  process.exitCode = 1;
}).finally(async () => {
  if (application) await application.close().catch(() => {});
  const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(temporary));
  if (relative.startsWith('igem-ping-smoke-') && !relative.includes(path.sep)) fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 3 });
});
