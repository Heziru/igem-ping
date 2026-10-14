'use strict';

const DEFAULT_SETTINGS = Object.freeze({
  language: 'en',
  sound: true,
  petVisible: true,
  reducedMotion: false,
  petSize: 1,
  focusMinutes: 25,
});

const PING_IDS = Object.freeze(['help', 'idea', 'caution', 'success', 'focus', 'break']);
const WHEEL_VIEWS = Object.freeze(['guide', 'resources', 'signals', 'preferences']);
const LINKS = Object.freeze({
  competition: 'https://competition.igem.org/',
  registry: 'https://registry.igem.org/',
  safety: 'https://responsibility.igem.org/safety-policies',
  community: 'https://community.igem.org/',
  resources: 'https://competition.igem.org/about/starting-a-team',
  deliverables: 'https://competition.igem.org/deliverables/',
  judging: 'https://competition.igem.org/judging/handbook',
  uploads: 'https://competition.igem.org/deliverables/guides',
  projects: 'https://teams.igem.org/list?year=all',
  submissions: 'https://teams.igem.org/go/deliverables',
  wikiGettingStarted: 'https://teams.igem.org/go/deliverables/wiki/getting-started',
  wikiUploads: 'https://teams.igem.org/go/deliverables/wiki/uploads',
  video: 'https://video.igem.org/',
  phoenix: 'https://community.igem.org/projects/phoenix-project',
  previousYears: 'https://competition.igem.org/about/previous-years',
  competitionCycle: 'https://competition.igem.org/about/navigating-igem',
  medals: 'https://competition.igem.org/judging/awards/medals',
  specialAwards: 'https://competition.igem.org/judging/awards/special',
  rules: 'https://competition.igem.org/about/rules-and-policies',
  engineering: 'https://technology.igem.org/engineering',
  jamboree: 'https://jamboree.igem.org/',
});

function validMinutes(value) {
  return Number.isInteger(value) && value >= 1 && value <= 180;
}

function sanitizeSettings(patch, previous = DEFAULT_SETTINGS) {
  const result = { ...DEFAULT_SETTINGS };
  for (const source of [previous, patch]) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
    if (['en', 'zh'].includes(source.language)) result.language = source.language;
    for (const key of ['sound', 'petVisible', 'reducedMotion']) {
      if (typeof source[key] === 'boolean') result[key] = source[key];
    }
    if ([0.8, 1, 1.2].includes(source.petSize)) result.petSize = source.petSize;
    if (validMinutes(source.focusMinutes)) result.focusMinutes = source.focusMinutes;
  }
  return result;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(value, Math.max(minimum, maximum)));
}

function clampPosition(position, size, workArea) {
  return {
    x: Math.round(clamp(Number.isFinite(position?.x) ? position.x : workArea.x,
      workArea.x, workArea.x + workArea.width - size.width)),
    y: Math.round(clamp(Number.isFinite(position?.y) ? position.y : workArea.y,
      workArea.y, workArea.y + workArea.height - size.height)),
  };
}

function petDropPlacement(position, size, workArea) {
  const settled = clampPosition(position, size, workArea);
  const offset = { x: 0, y: 0 };
  for (const [axis, dimension] of [['x', 'width'], ['y', 'height']]) {
    const minimum = workArea[axis];
    const maximum = Math.max(minimum, minimum + workArea[dimension] - size[dimension]);
    if (settled[axis] - minimum <= 8) {
      settled[axis] = minimum;
      offset[axis] = 6;
    } else if (maximum - settled[axis] <= 8) {
      settled[axis] = maximum;
      offset[axis] = -6;
    }
  }
  return {
    position: settled,
    // The brief rebound always moves inward; neither frame may leave the display.
    rebound: clampPosition({ x: settled.x + offset.x, y: settled.y + offset.y }, size, workArea),
  };
}

function overlayPlacement(cursor, workArea, avoidBounds) {
  const side = Math.max(1, Math.floor(Math.min(560, workArea.width, workArea.height)));
  const scale = side / 560;
  let position = clampPosition({ x: cursor.x - side / 2, y: cursor.y - side / 2 },
    { width: side, height: side }, workArea);
  if (avoidBounds) {
    const preferred = position;
    const candidates = [preferred,
      { x: avoidBounds.x - side - 12, y: preferred.y },
      { x: avoidBounds.x + avoidBounds.width + 12, y: preferred.y },
      { x: preferred.x, y: avoidBounds.y - side - 12 },
      { x: preferred.x, y: avoidBounds.y + avoidBounds.height + 12 },
    ].map((point) => clampPosition(point, { width: side, height: side }, workArea));
    const overlap = (point) => Math.max(0, Math.min(point.x + side, avoidBounds.x + avoidBounds.width) - Math.max(point.x, avoidBounds.x))
      * Math.max(0, Math.min(point.y + side, avoidBounds.y + avoidBounds.height) - Math.max(point.y, avoidBounds.y));
    candidates.sort((a, b) => overlap(a) - overlap(b)
      || Math.hypot(a.x - preferred.x, a.y - preferred.y) - Math.hypot(b.x - preferred.x, b.y - preferred.y));
    [position] = candidates;
  }
  return {
    ...position,
    width: side, height: side, scale,
    // Renderer coordinates stay in the 560 px design space at every display scale.
    anchor: {
      x: clamp((cursor.x - position.x) / scale, 120, 440),
      y: clamp((cursor.y - position.y) / scale, 120, 440),
    },
  };
}

function createTimer(minutes, now = Date.now()) {
  if (!validMinutes(minutes)) throw new RangeError('Focus duration must be 1–180 whole minutes.');
  const durationMs = minutes * 60_000;
  return { endsAt: now + durationMs, durationMs };
}

function timerFinished(timer, now = Date.now()) {
  return Number.isFinite(timer.endsAt) && timer.endsAt <= now;
}

module.exports = {
  DEFAULT_SETTINGS, PING_IDS, WHEEL_VIEWS, LINKS, validMinutes, sanitizeSettings,
  clampPosition, petDropPlacement, overlayPlacement, createTimer, timerFinished,
};
