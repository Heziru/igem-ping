'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');

function officialProjectURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /^20\d{2}\.igem\.(org|wiki)$/.test(url.hostname)
      && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}
function queryTerms(query) {
  if (typeof query !== 'string') throw new TypeError('Enter a keyword.');
  const text = query.normalize('NFKC').trim();
  if (text.length < 2 || text.length > 160) throw new RangeError('Use 2–160 characters.');
  const terms = [...new Set(text.split(/\s+/))];
  if (terms.length > 12) throw new RangeError('Use at most 12 keywords.');
  return terms.map(term => {
    const literal = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match IBD as a word, never the unrelated gene name ribD.
    const boundary = /^[\p{Script=Latin}\p{N}_-]+$/u.test(term);
    return new RegExp(boundary ? `(?<![\\p{L}\\p{N}_])${literal}(?![\\p{L}\\p{N}_])` : literal, 'giu');
  });
}
function createProjectIndex(data) {
  if (data?.schema !== 1 || !Array.isArray(data.records) || !Array.isArray(data.coverage)) throw new Error('Project index is unavailable.');
  const records = data.records.filter(record => typeof record.id === 'string' && typeof record.team === 'string'
    && Number.isInteger(record.year) && typeof record.text === 'string' && record.text.length >= 100
    && officialProjectURL(record.url)).map(record => ({...record, text:record.text.normalize('NFKC')}));
  const byId = new Map(records.map(record => [record.id,record]));
  function info() {
    return { builtAt:data.builtAt, count:records.length, coverage:data.coverage, years:[...new Set(records.map(r => r.year))].sort((a,b) => b-a) };
  }
  function search(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid search.');
    const patterns = queryTerms(input.query);
    const year = input.year ?? null;
    if (year !== null && (!Number.isInteger(year) || year < 2004 || year > 2100)) throw new TypeError('Invalid year.');
    const offset = input.offset ?? 0;
    if (!Number.isInteger(offset) || offset < 0 || offset > records.length) throw new TypeError('Invalid page.');
    const matches = [];
    for (const record of records) {
      if (year !== null && record.year !== year) continue;
      const hits = patterns.map(pattern => { pattern.lastIndex = 0; return pattern.exec(record.text); });
      if (hits.some(hit => !hit)) continue;
      const first = Math.min(...hits.map(hit => hit.index));
      const start = Math.max(0, first - 85);
      const end = Math.min(record.text.length, first + 225);
      const snippet = `${start ? '…' : ''}${record.text.slice(start,end)}${end < record.text.length ? '…' : ''}`;
      const ranges = [];
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        for (const match of snippet.matchAll(pattern)) ranges.push([match.index,match.index + match[0].length]);
      }
      ranges.sort((a,b) => a[0]-b[0]);
      const merged = [];
      for (const range of ranges) {
        const last = merged.at(-1);
        if (last && range[0] <= last[1]) last[1] = Math.max(last[1],range[1]);
        else merged.push([...range]);
      }
      matches.push({id:record.id,team:record.team,year:record.year,title:record.title || '',url:record.url,snippet,ranges:merged,source:record.source || '',fetchedAt:record.fetchedAt});
    }
    matches.sort((a,b) => b.year-a.year || a.team.localeCompare(b.team));
    return { total:matches.length, offset, limit:30, results:matches.slice(offset,offset+30), info:info() };
  }
  return { info, search, projectURL:id => typeof id === 'string' ? officialProjectURL(byId.get(id)?.url) : null };
}
let bundled;
function loadProjectIndex() {
  bundled ||= createProjectIndex(JSON.parse(gunzipSync(fs.readFileSync(path.join(__dirname,'data','projects.json.gz')),{maxOutputLength:160*1024*1024}).toString('utf8')));
  return bundled;
}
module.exports = { createProjectIndex, loadProjectIndex, queryTerms, officialProjectURL };
