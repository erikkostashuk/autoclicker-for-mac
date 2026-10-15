#!/usr/bin/env node
// Stands in for native/build/clicker in tests: same protocol, no clicking.
const readline = require('node:readline');

const send = (line) => process.stdout.write(`${line}\n`);
let runId = null;

send('ready');
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const [command, ...args] = line.split(' ');
  if (command === 'start') {
    if (runId) send(`stopped ${runId} 1 stopped`); // the replaced run still reports
    runId = args[0];
    send(`count ${runId} 1`);
    if (process.env.FAKE_HELPER_CRASH) process.exit(1);
  } else if (command === 'stop' && runId) {
    send(`stopped ${runId} 1 stopped`);
    runId = null;
  } else if (command === 'pick') {
    send('picked 12 -34');
  }
});
