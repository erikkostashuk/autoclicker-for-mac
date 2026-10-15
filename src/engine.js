const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const readline = require('node:readline');

// Drives the native click helper (native/clicker.m) over its line protocol.
//
// Events:
//   'count'   (clicks)                 progress of the current run
//   'stopped' ({ clicks, reason })     the current run ended
//   'picked'  ({ x, y })               a pick finished
//   'pick-cancelled'
//   'pick-failed' (reason)
class ClickEngine extends EventEmitter {
  #helperPath;
  #child = null;
  #excludeCommand = 'exclude none';
  #nextRunId = 1;
  #runId = 0; // 0 when no run is in progress
  #clicks = 0;
  #picking = false;

  constructor(helperPath) {
    super();
    this.#helperPath = helperPath;
  }

  start({ intervalMs, button, double, limit, point }) {
    const id = this.#nextRunId++;
    this.#runId = id;
    this.#clicks = 0;
    const intervalUs = Math.round(intervalMs * 1000);
    const where = point ? `fixed ${Math.round(point.x)} ${Math.round(point.y)}` : 'cursor';
    this.#send(`start ${id} ${intervalUs} ${button} ${double ? 2 : 1} ${limit} ${where}`);
  }

  stop() {
    if (this.#runId) this.#send('stop');
  }

  pick() {
    this.#picking = true;
    this.#send('pick');
  }

  cancelPick() {
    if (this.#picking) this.#send('cancel-pick');
  }

  // Clicks and picks inside `rect` are skipped; pass null to clear it.
  setExcludeRect(rect) {
    const command = rect ? `exclude ${rect.x} ${rect.y} ${rect.width} ${rect.height}` : 'exclude none';
    if (command === this.#excludeCommand) return;
    this.#excludeCommand = command;
    if (this.#child) this.#send(command);
  }

  // Replaces the helper with a fresh process, e.g. after macOS permissions change.
  restart() {
    this.dispose();
    this.#ensureChild();
  }

  dispose() {
    const child = this.#child;
    if (!child) return;
    this.#detach(child, 'stopped');
    // Closing stdin lets the helper finish any in-flight click before it exits.
    child.stdin.end();
  }

  #send(line) {
    const child = this.#ensureChild();
    if (child) child.stdin.write(`${line}\n`);
  }

  #ensureChild() {
    if (this.#child) return this.#child;

    const child = spawn(this.#helperPath, [], { stdio: ['pipe', 'pipe', 'inherit'] });
    this.#child = child;
    child.stdin.on('error', () => {}); // the exit handler deals with a dead helper
    child.on('error', (error) => {
      console.error(`Click engine failed to start: ${error.message}`);
      this.#detach(child, 'error');
    });
    child.on('exit', (code, signal) => {
      if (this.#child === child) console.error(`Click engine exited (code ${code}, signal ${signal})`);
      this.#detach(child, 'error');
    });
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      if (this.#child === child) this.#handleLine(line);
    });

    child.stdin.write(`${this.#excludeCommand}\n`);
    return child;
  }

  // Forgets `child`, ending whatever it was doing with `reason`.
  #detach(child, reason) {
    if (this.#child !== child) return;
    this.#child = null;
    if (this.#runId) this.#finishRun(this.#clicks, reason);
    if (this.#picking) {
      this.#picking = false;
      this.emit('pick-cancelled');
    }
  }

  #finishRun(clicks, reason) {
    this.#runId = 0;
    this.#clicks = clicks;
    this.emit('stopped', { clicks, reason });
  }

  #handleLine(line) {
    const [event, ...args] = line.split(' ');
    switch (event) {
      case 'count': {
        if (Number(args[0]) !== this.#runId) return;
        this.#clicks = Number(args[1]);
        this.emit('count', this.#clicks);
        break;
      }
      case 'stopped': {
        if (Number(args[0]) !== this.#runId) return; // a run we already replaced
        this.#finishRun(Number(args[1]), args[2]);
        break;
      }
      case 'picked':
        this.#picking = false;
        this.emit('picked', { x: Number(args[0]), y: Number(args[1]) });
        break;
      case 'pick-cancelled':
        this.#picking = false;
        this.emit('pick-cancelled');
        break;
      case 'pick-failed':
        this.#picking = false;
        this.emit('pick-failed', args[0]);
        break;
      case 'error':
        console.error(`Click engine: ${args.join(' ')}`);
        break;
    }
  }
}

module.exports = { ClickEngine };
