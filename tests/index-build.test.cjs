'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractDescription, cleanSearchText, officialURL } = require('../scripts/build-project-index.cjs');

test('Description extraction preserves project prose and excludes navigation, scripts and contact details', () => {
  const paragraph = 'Our project investigates inflammatory bowel disease (IBD) and proposes a living diagnostic system. We designed a biosensor that responds to inflammatory signals in the intestinal environment, and documented the biological rationale, design constraints, and intended application. This description also explains the experimental workflow and the limitations of our initial engineering design. ';
  const html = `<title>Project Description | Example</title><nav>Medals Contact Team</nav><main><h1>Project Description</h1><p>${paragraph}</p><p>${paragraph.replace('diagnostic', 'therapeutic')}</p><p>Contact example@example.org</p></main><footer>Footer team email</footer><script>secret navigation</script>`;
  const result = extractDescription(html);
  assert.equal(result.error, undefined);
  assert.match(result.text, /inflammatory bowel disease \(IBD\)/);
  assert.doesNotMatch(result.text, /example@example|secret navigation|Medals Contact|Footer team/);
  assert.equal(extractDescription(`<main><div>${paragraph}</div><div>${paragraph.replace('diagnostic', 'therapeutic')}</div></main>`).error, undefined);
});
test('Empty SPA shells, missing pages and short project summaries are not counted as indexed descriptions', () => {
  for (const html of ['<main id="root"></main><script src="app.js"></script>', '<title>404 Not Found</title><p>Sorry</p>', '<h1>Project Description</h1><p>A brief project abstract, without the full description.</p>']) assert.ok(extractDescription(html).error);
  assert.equal(officialURL('https://2025.igem.wiki/aachen/description'), true);
  assert.equal(officialURL('https://igem.org.example.com/description'), false);
  assert.equal(officialURL('https://user:secret@api.igem.org/v1/teams'), false);
});
test('Citation URLs and DOI paths cannot create project keyword matches', () => {
  const result = cleanSearchText('An unrelated project. https://example.org/ibd/reference doi:10.1097/IBD.12345\nA real IBD treatment for inflammatory bowel disease. www.example.org/IBD\n10.1038/s41586-example');
  assert.equal((result.match(/\bibd\b/gi) || []).length, 1);
  assert.match(result, /A real IBD treatment for inflammatory bowel disease\./);
  assert.doesNotMatch(result, /https:|www\.|10\.1097|10\.1038/);
});
