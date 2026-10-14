'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_SETTINGS, LINKS, sanitizeSettings, clampPosition, petDropPlacement, overlayPlacement, createTimer, timerFinished } = require('../core.cjs');

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
  assert.deepEqual(overlayPlacement({ x: -1919, y: 5 }, area), { x: -1920, y: 0, width: 560, height: 560, scale: 1, anchor: { x: 120, y: 120 } });
  assert.deepEqual(overlayPlacement({ x: -500, y: 400 }, area), { x: -780, y: 120, width: 560, height: 560, scale: 1, anchor: { x: 280, y: 280 } });
  assert.deepEqual(clampPosition({ x: 20, y: 20 }, { width: 560, height: 560 }, { x: 0, y: 0, width: 400, height: 400 }), { x: 0, y: 0 });
});

test('a high-DPI 911×480 work area fits the entire wheel without changing logical ping coordinates', () => {
  const area = { x: 100, y: 50, width: 911, height: 480 };
  const cursor = { x: 620, y: 290 };
  const placement = overlayPlacement(cursor, area);
  assert.equal(placement.width, 480);
  assert.equal(placement.height, 480);
  assert.equal(placement.scale, 480 / 560);
  assert.deepEqual(placement.anchor, { x: 280, y: 280 });
  assert.equal(placement.x + placement.anchor.x * placement.scale, cursor.x);
  assert.equal(placement.y + placement.anchor.y * placement.scale, cursor.y);
  for (const point of [{ x: 100, y: 50 }, { x: 1010, y: 529 }, cursor]) {
    const located = overlayPlacement(point, area);
    assert.ok(located.x >= area.x && located.x + located.width <= area.x + area.width);
    assert.ok(located.y >= area.y && located.y + located.height <= area.y + area.height);
    assert.ok(located.anchor.x >= 120 && located.anchor.x <= 440);
    assert.ok(located.anchor.y >= 120 && located.anchor.y <= 440);
  }
  assert.deepEqual(overlayPlacement({ x: 1010, y: 529 }, area).anchor, { x: 440, y: 440 });
});

test('dropping near a display edge docks gently while interior positions stay where dropped', () => {
  const area = { x: -1920, y: -200, width: 1920, height: 1040 };
  const size = { width: 160, height: 190 };
  assert.deepEqual(petDropPlacement({ x: -1000, y: 300 }, size, area), {
    position: { x: -1000, y: 300 }, rebound: { x: -1000, y: 300 },
  });
  assert.deepEqual(petDropPlacement({ x: -1915, y: 300 }, size, area), {
    position: { x: -1920, y: 300 }, rebound: { x: -1914, y: 300 },
  });
  assert.deepEqual(petDropPlacement({ x: -1911, y: 300 }, size, area), {
    position: { x: -1911, y: 300 }, rebound: { x: -1911, y: 300 },
  });
  assert.deepEqual(petDropPlacement({ x: 50, y: 1000 }, size, area), {
    position: { x: -160, y: 650 }, rebound: { x: -166, y: 644 },
  });
  for (const point of [{ x: -3000, y: -500 }, { x: 50, y: 1000 }, { x: -1000, y: 300 }]) {
    const { position, rebound } = petDropPlacement(point, size, area);
    for (let amount = 0; amount <= 1; amount += 0.1) {
      const frame = { x: position.x + (rebound.x - position.x) * amount,
        y: position.y + (rebound.y - position.y) * amount };
      assert.ok(frame.x >= area.x && frame.x + size.width <= area.x + area.width);
      assert.ok(frame.y >= area.y && frame.y + size.height <= area.y + area.height);
    }
  }
});

test('the wheel avoids Gemy on either side, on negative displays and in a short work area', () => {
  for (const area of [
    { x: 0, y: 0, width: 1920, height: 1040 },
    { x: -1920, y: -200, width: 1920, height: 1040 },
    { x: 0, y: 0, width: 911, height: 480 },
  ]) {
    for (const x of [area.x, area.x + area.width - 160]) {
      const pet = { x, y: area.y + 100, width: 160, height: 190 };
      const wheel = overlayPlacement({ x: x + 80, y: pet.y + 95 }, area, pet);
      assert.ok(wheel.x >= area.x && wheel.x + wheel.width <= area.x + area.width);
      assert.ok(wheel.y >= area.y && wheel.y + wheel.height <= area.y + area.height);
      assert.ok(wheel.x + wheel.width <= pet.x || wheel.x >= pet.x + pet.width
        || wheel.y + wheel.height <= pet.y || wheel.y >= pet.y + pet.height);
      assert.ok(wheel.anchor.x >= 120 && wheel.anchor.x <= 440);
      assert.ok(wheel.anchor.y >= 120 && wheel.anchor.y <= 440);
    }
  }
  const area = { x: 0, y: 0, width: 400, height: 400 };
  const wheel = overlayPlacement({ x: 200, y: 200 }, area, { x: 120, y: 100, width: 160, height: 190 });
  assert.equal(wheel.x, 0);
  assert.equal(wheel.y, 0);
  assert.equal(wheel.width, 400);
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
