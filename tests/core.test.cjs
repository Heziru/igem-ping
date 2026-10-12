'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_SETTINGS, LINKS, sanitizeSettings, clampPosition, overlayPlacement, createTimer, timerFinished } = require('../core.cjs');

test('preferences accept known values and ignore malformed or unknown input', () => {
  assert.deepEqual(sanitizeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(sanitizeSettings(['en']), DEFAULT_SETTINGS);
  const settings = sanitizeSettings({ language: 'zh', sound: false, petSize: 1.2, focusMinutes: 45, privateData: 'discard' });
  assert.equal(settings.language, 'zh');
  assert.equal(settings.sound, false);
  assert.equal(settings.petSize, 1.2);
  assert.equal(settings.focusMinutes, 45);
  assert.equal('privateData' in settings, false);
  assert.deepEqual(sanitizeSettings({ language: 'fr', sound: 'false', petSize: 4, focusMinutes: -1 }, settings), settings);
  assert.equal(sanitizeSettings({ focusMinutes: '25' }).focusMinutes, 25);
});

test('pet and overlay positions survive edges and a removed negative-coordinate display', () => {
  const area = { x: -1920, y: 0, width: 1920, height: 1040 };
  assert.deepEqual(clampPosition({ x: 3000, y: -200 }, { width: 240, height: 270 }, area), { x: -240, y: 0 });
  assert.deepEqual(clampPosition({ x: NaN, y: Infinity }, { width: 240, height: 270 }, area), { x: -1920, y: 0 });
  assert.deepEqual(overlayPlacement({ x: -1919, y: 5 }, area), { x: -1920, y: 0, anchor: { x: 120, y: 120 } });
  assert.deepEqual(overlayPlacement({ x: -500, y: 400 }, area), { x: -780, y: 120, anchor: { x: 280, y: 280 } });
  assert.deepEqual(clampPosition({ x: 20, y: 20 }, { width: 560, height: 560 }, { x: 0, y: 0, width: 400, height: 400 }), { x: 0, y: 0 });
});

test('focus uses an absolute deadline, so a delayed tick still completes once', () => {
  const timer = createTimer(25, 1000);
  assert.deepEqual(timer, { endsAt: 1_501_000, durationMs: 1_500_000 });
  assert.equal(timerFinished(timer, timer.endsAt - 1), false);
  assert.equal(timerFinished(timer, timer.endsAt), true);
  assert.equal(timerFinished(timer, timer.endsAt + 60_000), true);
  assert.equal(timerFinished({ endsAt: null, durationMs: timer.durationMs }, timer.endsAt), false);
  for (const value of [0, -1, 181, 1.5, NaN, '25', null]) assert.throws(() => createTimer(value), RangeError);
});

test('every external destination is a fixed HTTPS URL on an official iGEM domain', () => {
  for (const link of Object.values(LINKS)) {
    const url = new URL(link);
    assert.equal(url.protocol, 'https:');
    assert.ok(url.hostname === 'igem.org' || url.hostname.endsWith('.igem.org'));
    assert.equal(url.username, '');
    assert.equal(url.password, '');
  }
});
