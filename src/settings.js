const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = Object.freeze({
  intervalValue: 100,
  intervalUnit: 'ms',
  button: 'left',
  clickType: 'single',
  repeatMode: 'forever',
  repeatCount: 100,
  positionMode: 'cursor',
  x: 0,
  y: 0,
  hotkey: 'Alt+Command+K',
});

const UNIT_MS = Object.freeze({ ms: 1, s: 1000, min: 60_000 });
const MIN_INTERVAL_MS = 1;
const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_REPEAT_COUNT = 1_000_000_000;
const MAX_COORDINATE = 100_000;

const ENUMS = Object.freeze({
  button: ['left', 'right', 'middle'],
  clickType: ['single', 'double'],
  repeatMode: ['forever', 'count'],
  positionMode: ['cursor', 'fixed'],
});

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

// Returns `base` with every valid field of `patch` applied. Invalid fields are
// ignored, so a bad value from disk or the UI can never reach the click engine.
function sanitize(patch, base = DEFAULTS) {
  const result = { ...base };
  if (!patch || typeof patch !== 'object') return result;

  for (const [key, allowed] of Object.entries(ENUMS)) {
    if (allowed.includes(patch[key])) result[key] = patch[key];
  }
  // The value and unit only make sense together, so they're accepted as a pair.
  const unit = Object.hasOwn(UNIT_MS, patch.intervalUnit) ? patch.intervalUnit : result.intervalUnit;
  const value = isNumber(patch.intervalValue) ? patch.intervalValue : result.intervalValue;
  const ms = value * UNIT_MS[unit];
  if (ms >= MIN_INTERVAL_MS && ms <= MAX_INTERVAL_MS) {
    result.intervalUnit = unit;
    result.intervalValue = value;
  }
  if (Number.isInteger(patch.repeatCount) && patch.repeatCount >= 1 && patch.repeatCount <= MAX_REPEAT_COUNT) {
    result.repeatCount = patch.repeatCount;
  }
  for (const axis of ['x', 'y']) {
    if (isNumber(patch[axis]) && Math.abs(patch[axis]) <= MAX_COORDINATE) result[axis] = Math.round(patch[axis]);
  }
  if (typeof patch.hotkey === 'string' && patch.hotkey.length <= 64) result.hotkey = patch.hotkey;
  return result;
}

// The interval in milliseconds, clamped to what the click engine supports.
function intervalMs(settings) {
  const ms = settings.intervalValue * UNIT_MS[settings.intervalUnit];
  return Math.min(Math.max(ms, MIN_INTERVAL_MS), MAX_INTERVAL_MS);
}

class SettingsStore {
  #file;
  #saveTimer = null;

  constructor(file) {
    this.#file = file;
    this.values = SettingsStore.#load(file);
  }

  update(patch) {
    this.values = sanitize(patch, this.values);
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => this.flush(), 300);
    return this.values;
  }

  flush() {
    clearTimeout(this.#saveTimer);
    this.#saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(this.#file), { recursive: true });
      const temp = `${this.#file}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(this.values, null, 2));
      fs.renameSync(temp, this.#file);
    } catch (error) {
      console.error(`Could not save settings: ${error.message}`);
    }
  }

  static #load(file) {
    try {
      return sanitize(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch {
      return { ...DEFAULTS };
    }
  }
}

module.exports = { DEFAULTS, MIN_INTERVAL_MS, MAX_INTERVAL_MS, SettingsStore, intervalMs, sanitize };
