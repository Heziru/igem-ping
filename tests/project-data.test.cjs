const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {gunzipSync}=require('node:zlib');
const {createProjectIndex}=require('../project-search.cjs');

test('Bundled snapshot has unique, attributable descriptions and exact coverage counts',()=>{
  const data=JSON.parse(gunzipSync(fs.readFileSync(path.join(__dirname,'../data/projects.json.gz'))));
  const index=createProjectIndex(data);
  assert.equal(index.info().count,data.records.length,'No records are silently discarded by the runtime');
  assert.equal(new Set(data.records.map(r=>r.id)).size,data.records.length,'IDs must be unique across sources');
  assert.equal(new Set(data.records.map(r=>`${r.year}:${r.team.toLowerCase()}`)).size,data.records.length,'One description per team/year');
  assert.ok(Number.isFinite(Date.parse(data.builtAt)));
  for(const record of data.records){
    assert.equal(new URL(record.url).hostname.split('.')[0],String(record.year));
    assert.ok(record.text.length>=500,`${record.year} ${record.team} has substantive text`);
  }
  for(const row of data.coverage){
    assert.equal(row.indexed,data.records.filter(r=>r.year===row.year).length);
    assert.equal(row.pending,0,'A release snapshot must finish its collection pass');
    assert.ok(row.total>=row.indexed);
  }
  assert.equal(data.coverage.reduce((n,r)=>n+r.indexed,0),data.records.length);
});
