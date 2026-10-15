// Exercises the real native helper's protocol. Nothing here starts a run, so
// these tests never click.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const readline = require('node:readline');
const test = require('node:test');

const HELPER = path.join(__dirname, '..', 'native', 'build', 'clicker');

function startHelper() {
  const child = spawn(HELPER, [], { stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = readline.createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const next = async () => (await lines.next()).value;
  return { child, next, send: (line) => child.stdin.write(`${line}\n`) };
}

test('announces itself and rejects malformed commands', async (t) => {
  const { child, next, send } = startHelper();
  t.after(() => child.kill());

  assert.equal(await next(), 'ready');
  send('dance');
  assert.equal(await next(), 'error unknown-command');
  for (const bad of [
    'start 1 1000 sideways 1 0 cursor',
    'start 1 1000 left 3 0 cursor',
    'start 1 1000 left 1 0 fixed 10',
    'start 1 1000 left 1 0 nowhere',
  ]) {
    send(bad);
    assert.equal(await next(), 'error bad-command', bad);
  }
});

test('ignores stop and cancel when idle, and exits when stdin closes', async () => {
  const { child, next, send } = startHelper();
  assert.equal(await next(), 'ready');
  send('stop');
  send('cancel-pick');
  send('exclude 0 0 100 100');
  send('exclude none');
  child.stdin.end();
  const [code] = await once(child, 'exit');
  assert.equal(code, 0);
  assert.equal(await next(), undefined); // nothing else was printed
});
