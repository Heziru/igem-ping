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

function overlayPlacement(cursor, workArea) {
  const side = Math.max(1, Math.floor(Math.min(560, workArea.width, workArea.height)));
  const scale = side / 560;
  const position = clampPosition({ x: cursor.x - side / 2, y: cursor.y - side / 2 },
    { width: side, height: side }, workArea);
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
  clampPosition, overlayPlacement, createTimer, timerFinished,
};
