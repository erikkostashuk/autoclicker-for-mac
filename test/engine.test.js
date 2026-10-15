const assert = require('node:assert/strict');
const { once } = require('node:events');
const path = require('node:path');
const test = require('node:test');
const { ClickEngine } = require('../src/engine');

const FAKE_HELPER = path.join(__dirname, 'fixtures', 'fake-helper.js');
const RUN = { intervalMs: 100, button: 'left', double: false, limit: 0, point: null };

test('reports progress and the end of a run', async (t) => {
  const engine = new ClickEngine(FAKE_HELPER);
  t.after(() => engine.dispose());

  engine.start(RUN);
  assert.equal((await once(engine, 'count'))[0], 1);
  engine.stop();
  assert.deepEqual((await once(engine, 'stopped'))[0], { clicks: 1, reason: 'stopped' });
});

test('ignores events from a run that was replaced', async (t) => {
  const engine = new ClickEngine(FAKE_HELPER);
  t.after(() => engine.dispose());
  const stopped = [];
  engine.on('stopped', (result) => stopped.push(result));

  engine.start(RUN);
  engine.start({ ...RUN, point: { x: 10, y: 20 } });
  await once(engine, 'count');
  engine.stop();
  await once(engine, 'stopped');
  assert.equal(stopped.length, 1);
});

test('ends the run with an error if the helper dies', async (t) => {
  process.env.FAKE_HELPER_CRASH = '1';
  t.after(() => delete process.env.FAKE_HELPER_CRASH);
  const engine = new ClickEngine(FAKE_HELPER);

  engine.start(RUN);
  assert.equal((await once(engine, 'stopped'))[0].reason, 'error');
});

test('fails a run cleanly when the helper is missing', async () => {
  const engine = new ClickEngine(path.join(__dirname, 'does-not-exist'));
  engine.start(RUN);
  assert.equal((await once(engine, 'stopped'))[0].reason, 'error');
});

test('relays a picked position', async (t) => {
  const engine = new ClickEngine(FAKE_HELPER);
  t.after(() => engine.dispose());

  engine.pick();
  assert.deepEqual((await once(engine, 'picked'))[0], { x: 12, y: -34 });
});
