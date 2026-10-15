const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DEFAULTS, SettingsStore, intervalMs, sanitize } = require('../src/settings');

test('returns defaults for missing or non-object input', () => {
  assert.deepEqual(sanitize(undefined), DEFAULTS);
  assert.deepEqual(sanitize('nope'), DEFAULTS);
});

test('ignores unknown and invalid values', () => {
  const result = sanitize({ button: 'thumb', clickType: 'triple', repeatMode: 'count', extra: true });
  assert.equal(result.button, 'left');
  assert.equal(result.clickType, 'single');
  assert.equal(result.repeatMode, 'count');
  assert.equal('extra' in result, false);
});

test('accepts the interval value and unit only as a valid pair', () => {
  assert.equal(intervalMs(sanitize({ intervalValue: 2.5, intervalUnit: 's' })), 2500);
  // 100,000 minutes is longer than 24 hours, so neither half is applied.
  const tooLong = sanitize({ intervalValue: 100_000, intervalUnit: 'min' });
  assert.equal(tooLong.intervalValue, DEFAULTS.intervalValue);
  assert.equal(tooLong.intervalUnit, DEFAULTS.intervalUnit);
  assert.equal(sanitize({ intervalValue: 0.5 }).intervalValue, DEFAULTS.intervalValue);
  assert.equal(sanitize({ intervalValue: Number.NaN }).intervalValue, DEFAULTS.intervalValue);
  assert.equal(sanitize({ intervalValue: '50' }).intervalValue, DEFAULTS.intervalValue);
});

test('clamps the interval the engine receives', () => {
  assert.equal(intervalMs({ intervalValue: 0.1, intervalUnit: 'ms' }), 1);
  assert.equal(intervalMs({ intervalValue: 10_000, intervalUnit: 'min' }), 24 * 60 * 60 * 1000);
});

test('validates repeat count and coordinates', () => {
  assert.equal(sanitize({ repeatCount: 2.5 }).repeatCount, DEFAULTS.repeatCount);
  assert.equal(sanitize({ repeatCount: 0 }).repeatCount, DEFAULTS.repeatCount);
  assert.equal(sanitize({ repeatCount: 500 }).repeatCount, 500);
  assert.deepEqual(
    (({ x, y }) => ({ x, y }))(sanitize({ x: -120.6, y: 1e9 })),
    { x: -121, y: DEFAULTS.y },
  );
});

test('store falls back to defaults for a corrupt file and saves updates', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autoclicker-test-'));
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, '{ not json');

  const store = new SettingsStore(file);
  assert.deepEqual(store.values, DEFAULTS);

  store.update({ button: 'right', hotkey: 'F6' });
  store.flush();
  assert.equal(new SettingsStore(file).values.button, 'right');
  assert.equal(new SettingsStore(file).values.hotkey, 'F6');
  fs.rmSync(dir, { recursive: true });
});
