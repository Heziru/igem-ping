'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { gzipSync, gunzipSync } = require('node:zlib');
const cheerio = require('cheerio');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const CACHE = path.join(DATA, '.project-index-cache');
const SOURCE = 'https://teams.igem.org/list?year=all';
const API = 'https://api.igem.org/v1';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let nextRequestAt = 0;

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
function saveJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(data), 'utf8');
  fs.renameSync(`${file}.tmp`, file);
}
function officialURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      && (url.hostname.endsWith('.igem.wiki') || url.hostname.endsWith('.igem.org') || url.hostname === 'igem.org');
  } catch { return false; }
}
async function request(url, json = false) {
  if (!officialURL(url)) throw new Error('URL is not an official iGEM HTTPS address');
  for (let attempt = 0; attempt < 3; attempt++) {
    const start = Math.max(Date.now(), nextRequestAt);
    nextRequestAt = start + 120;
    await sleep(Math.max(0, start - Date.now()));
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(20_000), redirect: 'follow',
        headers: { 'User-Agent': 'iGEM-Ping-Community-Description-Index/0.3 (+https://teams.igem.org/list)', Accept: json ? 'application/json' : 'text/html' },
      });
      if (!officialURL(response.url)) throw new Error('Redirected outside official iGEM infrastructure');
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return json ? await response.json() : { html: await response.text(), url: response.url };
    } catch (error) {
      if (attempt === 2 || (error.status && ![429, 500, 502, 503, 504].includes(error.status))) throw error;
      await sleep(500 * (attempt + 1));
    }
  }
}

function cleanSearchText(text) {
  return String(text).replace(/\b(?:https?:\/\/|www\.)[^\s<>]+/giu, '')
    .replace(/\b(?:doi\s*:\s*)?10\.\d{4,9}\/[^\s<>"']+/giu, '')
    .split('\n').map((line) => line.replace(/[\t\r\u00a0 ]+/g, ' ').trim()).filter(Boolean).join('\n');
}

function extractDescription(html) {
  const $ = cheerio.load(html);
  const title = $('title').first().text().replace(/\s+/g, ' ').trim();
  $('script,style,noscript,template,svg,canvas,iframe,nav,footer,aside,form,button,input,select,textarea,address,[role="navigation"],[role="banner"],[role="contentinfo"],.navbar,.navigation,.nav-menu,.sidebar,.toc,.table-of-contents,#toc,.site-footer,.footer,.cookie-banner,.social-links,.contact,[class*="footer"],[class*="Footer"],[id*="footer"],[id*="Footer"]').remove();
  $('a[href^="mailto:"],a[href^="tel:"]').remove();
  $('ul,ol').filter((_i, node) => {
    const element = $(node), text = element.text().trim();
    const links = element.find('a');
    return text.length < 3000 && links.length >= 4 && links.toArray().reduce((sum, link) => sum + $(link).text().trim().length, 0) > text.length * 0.65;
  }).remove();
  $('header').filter((_i, node) => $(node).find('a').length > 3).remove();
  const candidates = ['main', 'article', '#main-content', '#content', '.main-content', '#main', 'body'];
  let best = null;
  for (const selector of candidates) {
    const element = $(selector).first();
    if (!element.length) continue;
    const copy = element.clone();
    copy.find('h1,h2,h3,h4,h5,h6,p,li,div,section,tr,br,blockquote').each((_i, node) => $(node).after('\n'));
    const lines = copy.text().split(/\n+/).map((line) => line.replace(/[\t\r\u00a0 ]+/g, ' ').trim())
      .filter((line) => line && !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(line) && !/^(?:phone|telephone|tel|contact us|address)\s*:/i.test(line));
    const text = cleanSearchText(lines.filter((line, i) => i === 0 || line !== lines[i - 1]).join('\n'));
    const headings = element.find('h1,h2,h3').map((_i, node) => $(node).text()).get().join(' ');
    const proseCount = element.find('p,div').filter((_i, node) => {
      const paragraph = $(node);
      return paragraph.text().trim().length >= 70 && !paragraph.children('p,div,section,article,ul,ol,nav').length;
    }).length;
    if (!best || text.length > best.text.length) best = { text, headings, proseCount };
    if (text.length >= 600 && proseCount >= 2) { best = { text, headings, proseCount }; break; }
  }
  if (!best) return { error: 'No document body' };
  const { text, headings, proseCount } = best;
  if (/\b(404|not found|access denied|forbidden)\b/i.test(title) || /^(404|page not found|access denied|forbidden)\b/i.test(text)) return { error: 'Error page, not a project description' };
  if (/describe how and why you chose your igem project|this wiki is currently under construction|you can use this page to describe your project/i.test(text) && text.length < 2000) return { error: 'Unfilled iGEM template' };
  const words = (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
  const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length;
  if (text.length < 500 || (words < 80 && cjk < 180)) return { error: `Insufficient description body (${text.length} characters, ${words} words)` };
  if (proseCount < 2 && !/description|background|introduction|problem|solution|our project|overview|项目|背景/i.test(headings)) return { error: 'No substantive project-description paragraphs or headings' };
  return { text, title, headings, proseCount };
}

async function teamsForYear(year) {
  const file = path.join(CACHE, `teams-${year}.json`);
  const cached = readJSON(file);
  if (cached?.teams?.length) return cached;
  const teams = [];
  let total = Infinity;
  for (let page = 1; teams.length < total; page++) {
    const result = await request(`${API}/teams?year=${year}&page=${page}&pageSize=100`, true);
    if (!Array.isArray(result.data) || !Number.isInteger(result.total)) throw new Error(`Invalid team-list response for ${year}`);
    total = result.total;
    teams.push(...result.data.map(({ id, name, year: teamYear }) => ({ id, name, year: teamYear })));
    if (!result.data.length) break;
  }
  const result = { year, total, teams, fetchedAt: new Date().toISOString() };
  saveJSON(file, result);
  return result;
}

async function descriptionURL(team) {
  const file = path.join(CACHE, 'wikis', `${team.id}.json`);
  let wiki = readJSON(file);
  if (!wiki?.pageURL) { wiki = await request(`${API}/teams/${team.id}/wiki`, true); saveJSON(file, wiki); }
  if (officialURL(wiki.descriptionURL)) return wiki.descriptionURL;
  if (!officialURL(wiki.pageURL)) throw new Error('Team has no official wiki URL');
  const base = new URL(`${wiki.pageURL.replace(/\/+$/, '')}/`);
  if (base.hostname !== `${team.year}.igem.wiki`) throw new Error('Unexpected wiki host for this year');
  return new URL('description', base).href;
}

async function fetchDescriptionPage(team, url) {
  let failure;
  for (const candidate of [...new Set([url, url.endsWith('.html') ? url : `${url}.html`])]) {
    try { return await request(candidate); } catch (error) { failure = error; }
  }
  // The home page is used only to discover an explicit Description link.
  const wiki = readJSON(path.join(CACHE, 'wikis', `${team.id}.json`));
  const base = new URL(`${wiki.pageURL.replace(/\/+$/, '')}/`);
  const home = await request(base.href);
  const $ = cheerio.load(home.html);
  const links = $('a[href]').toArray().map((node) => {
    try {
      const link = new URL($(node).attr('href'), base);
      const label = $(node).text().trim();
      return link.origin === base.origin && link.pathname.startsWith(base.pathname)
        && (/description/i.test(link.pathname) || /^(?:project\s+)?description$/i.test(label)) ? link.href : null;
    } catch { return null; }
  }).filter(Boolean);
  for (const candidate of [...new Set(links)].slice(0, 4)) {
    try { return await request(candidate); } catch (error) { failure = error; }
  }
  throw failure || new Error('No accessible Description page linked from the team wiki');
}

async function renderDescription(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    await context.route('**/*', (route) => {
      const req = route.request();
      return officialURL(req.url()) && !['image', 'media', 'font'].includes(req.resourceType()) ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (response && !response.ok()) throw new Error(`Rendered HTTP ${response.status()}`);
    await page.waitForFunction(() => (document.body?.innerText.length || 0) > 700, undefined, { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(800);
    if (!officialURL(page.url()) || !/\/[^/?#]*description[^/?#]*\/?(?:[?#]|$)/i.test(page.url())) throw new Error('Renderer left the description page');
    return { html: await page.content(), url: page.url() };
  } finally { await context.close(); }
}

function writeIndex() {
  const byTeam = new Map();
  const coverage = new Map();
  const failures = [];
  const history = path.join(DATA, 'historical-projects.json.gz');
  if (fs.existsSync(history)) {
    try {
      const old = JSON.parse(gunzipSync(fs.readFileSync(history)));
      for (const record of old.records || []) byTeam.set(`${record.year}:${record.team.toLowerCase()}`, record);
      for (const row of old.coverage || []) coverage.set(row.year, row);
    } catch (error) { console.warn(`Historical index not yet readable: ${error.message}`); }
  }
  for (const filename of fs.readdirSync(CACHE).filter((name) => /^teams-\d+\.json$/.test(name))) {
    const list = readJSON(path.join(CACHE, filename));
    if (!list) continue;
    let indexed = 0, failed = 0;
    for (const team of list.teams) {
      const cached = readJSON(path.join(CACHE, 'records', `${team.id}.json`));
      if (cached?.status === 'indexed' && cached.record?.text) {
        byTeam.set(`${team.year}:${team.name.toLowerCase()}`, cached.record); indexed++;
      } else if (cached?.status === 'failed') {
        failed++;
        failures.push({ id: String(team.id), team: team.name, year: team.year, url: cached.url || null, reason: cached.error, attemptedAt: cached.attemptedAt });
      }
    }
    coverage.set(list.year, { year: list.year, total: list.total, indexed, failed, pending: Math.max(0, list.total - indexed - failed) });
  }
  const builtAt = new Date().toISOString();
  const records = [...byTeam.values()].map((record) => ({ ...record, text: cleanSearchText(record.text) }))
    .sort((a, b) => b.year - a.year || a.team.localeCompare(b.team));
  const rows = [...coverage.values()].sort((a, b) => b.year - a.year);
  const result = { schema: 1, builtAt, records, coverage: rows, source: SOURCE };
  fs.writeFileSync(path.join(DATA, 'projects.json.gz.tmp'), gzipSync(JSON.stringify(result), { level: 9 }));
  fs.renameSync(path.join(DATA, 'projects.json.gz.tmp'), path.join(DATA, 'projects.json.gz'));
  saveJSON(path.join(DATA, 'coverage.json'), { schema: 1, builtAt, source: SOURCE, coverage: rows, failures });
  return result;
}

async function build(options) {
  fs.mkdirSync(CACHE, { recursive: true });
  if (options.mergeOnly) { const index = writeIndex(); console.log(`Merged ${index.records.length} cached records.`); return; }
  const lists = [];
  for (const year of options.years) {
    const list = await teamsForYear(year); lists.push(list);
    console.log(`${year}: ${list.teams.length} official teams (total ${list.total})`);
  }
  writeIndex();
  let tasks = lists.flatMap((list) => list.teams).filter((team) => {
    const cached = readJSON(path.join(CACHE, 'records', `${team.id}.json`));
    const matchingFailure = cached?.status === 'failed' && (!options.retryReason || cached.error.includes(options.retryReason));
    if (options.renderOnly) return matchingFailure;
    return !cached || (options.retryFailed && matchingFailure);
  });
  if (options.limit) tasks = tasks.slice(0, options.limit);
  const taskCount = tasks.length;
  let browser;
  if (options.render || options.renderOnly) {
    const { chromium } = require('playwright');
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  }
  let done = 0, indexed = 0, failed = 0;
  const started = Date.now();
  const checkpoint = setInterval(() => {
    writeIndex();
    console.log(`Checkpoint ${done}/${taskCount}: +${indexed} indexed, ${failed} failed; ${Math.round((Date.now() - started) / 1000)}s`);
  }, 30_000);
  try {
    await Promise.all(Array.from({ length: options.concurrency }, async () => {
      while (tasks.length) {
        const team = tasks.shift();
        const file = path.join(CACHE, 'records', `${team.id}.json`);
        let url;
        try {
          const previous = readJSON(file);
          url = options.renderOnly && officialURL(previous?.url) ? previous.url : await descriptionURL(team);
          let page, parsed, method = 'http';
          if (!options.renderOnly) { page = await fetchDescriptionPage(team, url); url = page.url; parsed = extractDescription(page.html); }
          if ((!parsed || parsed.error) && browser) { page = await renderDescription(browser, url); parsed = extractDescription(page.html); method = 'browser'; }
          if (parsed.error) throw new Error(parsed.error);
          const wikiFile = path.join(CACHE, 'wikis', `${team.id}.json`);
          saveJSON(wikiFile, { ...readJSON(wikiFile), descriptionURL: page.url });
          const fetchedAt = new Date().toISOString();
          const record = { id: String(team.id), team: team.name, year: team.year, url: page.url, text: parsed.text, title: parsed.title, fetchedAt };
          saveJSON(file, { status: 'indexed', method, record });
          indexed++;
        } catch (error) {
          saveJSON(file, { status: 'failed', url, error: error.message, attemptedAt: new Date().toISOString() });
          failed++;
        }
        done++;
        if (done % 25 === 0) { writeIndex(); console.log(`Processed ${done}: +${indexed} indexed, ${failed} failed`); }
      }
    }));
  } finally {
    clearInterval(checkpoint);
    if (browser) await browser.close();
    const index = writeIndex();
    console.log(JSON.stringify({ done, indexed, failed, totalRecords: index.records.length, coverage: index.coverage }));
  }
}

function parseArgs(args) {
  const options = { years: [2025, 2024, 2023, 2022], concurrency: 4, limit: 0, render: false, renderOnly: false, retryFailed: false, retryReason: '', mergeOnly: false };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--years') options.years = args[++i].split(',').map(Number);
    else if (flag === '--concurrency') options.concurrency = Math.max(1, Math.min(6, Number(args[++i]) || 4));
    else if (flag === '--limit') options.limit = Number(args[++i]) || 0;
    else if (flag === '--render') options.render = true;
    else if (flag === '--render-only') options.renderOnly = true;
    else if (flag === '--retry-failed') options.retryFailed = true;
    else if (flag === '--retry-reason') options.retryReason = args[++i] || '';
    else if (flag === '--merge-only') options.mergeOnly = true;
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (options.years.some((year) => !Number.isInteger(year) || year < 2022 || year > 2025)) throw new Error('Modern description crawl supports years 2022–2025');
  return options;
}

module.exports = { extractDescription, cleanSearchText, officialURL, parseArgs };
if (require.main === module) build(parseArgs(process.argv.slice(2))).catch((error) => { console.error(error); process.exitCode = 1; });
