'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProjectIndex, officialProjectURL } = require('../project-search.cjs');
const record = (id,year,text) => ({id,year,team:id,url:`https://${year}.igem.wiki/${id}/description`,text:text + ' Background for this project and its experimental design. '.repeat(4)});
const index = createProjectIndex({schema:1,builtAt:'2026-10-14',coverage:[],records:[
 record('alpha',2024,'Our project tackles IBD with engineered bacteria.'),
 record('beta',2025,'The ribD gene regulates riboflavin. IBD-related research is discussed.'),
 record('gamma',2023,'The ribD gene regulates riboflavin.'),
 record('delta',2022,'Our inflammatory bowel disease treatment uses bacteria.'),
 record('epsilon',2021,'A literal a+b design uses <script> as example text.'),
]});
test('Search uses Description text, word boundaries, all keywords and newest-first ordering',()=>{
 assert.deepEqual(index.search({query:'IBD'}).results.map(r=>r.id),['beta','alpha']);
 assert.deepEqual(index.search({query:'ibd',year:2024}).results.map(r=>r.id),['alpha']);
 assert.deepEqual(index.search({query:'inflammatory bowel'}).results.map(r=>r.id),['delta']);
 assert.equal(index.search({query:'IBD nonexistent'}).total,0);
 assert.deepEqual(index.search({query:'a+b'}).results.map(r=>r.id),['epsilon']);
 const hit=index.search({query:'IBD'}).results[0];
 assert.equal(hit.snippet.slice(...hit.ranges[0]),'IBD');
});
test('Search validates input and exposes only indexed official project destinations',()=>{
 for(const input of [{query:'a'},{query:'.'.repeat(161)},{query:'IBD',year:'2024'},{query:'IBD',offset:-1},null]) assert.throws(()=>index.search(input));
 assert.equal(index.projectURL('missing'),null);
 assert.equal(index.projectURL('__proto__'),null);
 assert.equal(index.projectURL('alpha'),'https://2024.igem.wiki/alpha/description');
 for(const url of ['javascript:alert(1)','https://2024.igem.wiki.evil.test/','https://user@2024.igem.wiki/','https://2024.igem.wiki:444/'])assert.equal(officialProjectURL(url),null);
});
