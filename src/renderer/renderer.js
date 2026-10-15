const api = window.autoclicker;

// Mirrors src/settings.js, which re-validates everything in the main process.
const UNIT_MS = { ms: 1, s: 1000, min: 60_000 };
const MIN_INTERVAL_MS = 1;
const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_REPEAT_COUNT = 1_000_000_000;
const MAX_COORDINATE = 100_000;
const RADIO_GROUPS = ['button', 'clickType', 'repeatMode', 'positionMode'];
// Measured: above this many presses per second macOS queues clicks, so they
// lag behind and keep landing briefly after Stop.
const FAST_PRESSES_PER_SECOND = 200;

const $ = (id) => document.getElementById(id);
const form = $('settingsForm');

let state = null;
let recordingHotkey = false;
let hotkeyMessage = null;
let wasPicking = false;
const errors = { interval: null, repeat: null, position: null };

// --- Formatting ------------------------------------------------------------

const formatNumber = (value) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });
const plural = (count, word) => `${formatNumber(count)} ${word}${count === 1 ? '' : 's'}`;

function describeRate(ms, double) {
  const what = double ? 'double-click' : 'click';
  const every = (count, unit) => (count === 1 ? unit : plural(count, unit));
  if (ms <= 1000) return `${plural(1000 / ms, what)} per second`;
  if (ms < 60_000) return `One ${what} every ${every(ms / 1000, 'second')}`;
  if (ms < 3_600_000) return `One ${what} every ${every(ms / 60_000, 'minute')}`;
  return `One ${what} every ${every(ms / 3_600_000, 'hour')}`;
}

const MODIFIER_SYMBOLS = { Control: '⌃', Alt: '⌥', Shift: '⇧', Command: '⌘' };
const KEY_SYMBOLS = { Up: '↑', Down: '↓', Left: '←', Right: '→', Return: '↩', Tab: '⇥', Space: 'Space' };

function formatAccelerator(accelerator) {
  if (!accelerator) return '';
  const parts = accelerator.split('+');
  const key = parts.pop();
  const modifiers = Object.keys(MODIFIER_SYMBOLS)
    .filter((name) => parts.includes(name))
    .map((name) => MODIFIER_SYMBOLS[name])
    .join('');
  return modifiers + (KEY_SYMBOLS[key] ?? key);
}

// Electron accelerator key names for KeyboardEvent.code values. Physical keys
// are used so Option combos (which type symbols like ˚) still map to a letter.
const CODE_KEYS = {
  Space: 'Space',
  Enter: 'Return',
  Tab: 'Tab',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
};

function acceleratorFromEvent(event) {
  let key = CODE_KEYS[event.code];
  if (/^Key[A-Z]$/.test(event.code)) key = event.code.slice(3);
  if (/^Digit\d$/.test(event.code)) key = event.code.slice(5);
  if (/^F([1-9]|1\d|2[0-4])$/.test(event.code)) key = event.code;
  if (!key) return null;
  // Without ⌃, ⌥ or ⌘ the shortcut would swallow normal typing in every app.
  if (!/^F\d+$/.test(key) && !(event.ctrlKey || event.altKey || event.metaKey)) return null;

  const modifiers = [];
  if (event.ctrlKey) modifiers.push('Control');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  if (event.metaKey) modifiers.push('Command');
  return [...modifiers, key].join('+');
}

// --- Form ------------------------------------------------------------------

function radioValue(name) {
  return form.elements[name].value;
}

function fillForm(settings) {
  $('intervalValue').value = settings.intervalValue;
  $('intervalUnit').value = settings.intervalUnit;
  for (const name of RADIO_GROUPS) form.elements[name].value = settings[name];
  $('repeatCount').value = settings.repeatCount;
  fillPosition(settings);
  validateAll();
}

function fillPosition(settings) {
  form.elements.positionMode.value = settings.positionMode;
  $('x').value = settings.x ?? '';
  $('y').value = settings.y ?? '';
}

function validateInterval() {
  const value = $('intervalValue').valueAsNumber;
  const ms = value * UNIT_MS[$('intervalUnit').value];
  if (!Number.isFinite(value) || value <= 0) errors.interval = 'Enter how often to click';
  else if (ms < MIN_INTERVAL_MS) errors.interval = 'The shortest interval is 1 millisecond';
  else if (ms > MAX_INTERVAL_MS) errors.interval = 'The longest interval is 24 hours';
  else errors.interval = null;
  return { intervalValue: value, intervalUnit: $('intervalUnit').value };
}

function validateRepeat() {
  const count = $('repeatCount').valueAsNumber;
  const valid = Number.isInteger(count) && count >= 1 && count <= MAX_REPEAT_COUNT;
  errors.repeat = radioValue('repeatMode') === 'count' && !valid ? 'Enter a whole number of clicks' : null;
  return valid ? { repeatCount: count } : {};
}

function validatePosition() {
  const x = $('x').valueAsNumber;
  const y = $('y').valueAsNumber;
  const valid = [x, y].every((n) => Number.isInteger(n) && Math.abs(n) <= MAX_COORDINATE);
  errors.position = radioValue('positionMode') === 'fixed' && !valid ? 'Pick a spot, or type its X and Y' : null;
  return valid ? { x, y } : {};
}

function validateAll() {
  validateInterval();
  validateRepeat();
  validatePosition();
}

const hasErrors = () => Object.values(errors).some(Boolean);
// Empty coordinates just need a pick, so they're a hint rather than an error.
const noSpotYet = () => !$('x').value && !$('y').value;

// Saves whatever is valid; invalid fields stay on screen with an error and keep
// Start disabled until they're fixed.
function saveForm() {
  const patch = Object.fromEntries(RADIO_GROUPS.map((name) => [name, radioValue(name)]));
  const interval = validateInterval();
  if (!errors.interval) Object.assign(patch, interval);
  Object.assign(patch, validateRepeat(), validatePosition());
  api.updateSettings(patch, !hasErrors());
  render();
}

form.addEventListener('input', saveForm);
form.addEventListener('submit', (event) => event.preventDefault());

// --- Rendering -------------------------------------------------------------

function statusFor({ running, picking, trusted, lastRun }) {
  if (picking) return { tone: 'warning', text: 'Click anywhere to choose the spot', note: 'Press Esc to cancel.' };
  if (running) return { tone: 'active', text: 'Clicking', note: 'Clicks pause while the cursor is over this window.' };
  if (!trusted || lastRun?.reason === 'permission') return { tone: 'error', text: 'Needs Accessibility access' };
  if (lastRun?.reason === 'error') return { tone: 'error', text: 'The click engine stopped unexpectedly' };
  if (lastRun?.reason === 'invalid' || lastRun?.reason === 'no-position') {
    const onlyNeedsSpot = !errors.interval && !errors.repeat && (lastRun.reason === 'no-position' || noSpotYet());
    if (onlyNeedsSpot) return { tone: 'warning', text: 'Pick a spot to click first' };
    return { tone: 'error', text: 'Fix the setting marked in red to start' };
  }
  if (lastRun?.reason === 'done') return { tone: 'idle', text: 'Finished' };
  if (lastRun?.reason === 'stopped') return { tone: 'idle', text: 'Stopped' };
  return { tone: 'idle', text: 'Ready' };
}

function setNote(element, message, fallback = '') {
  element.textContent = message ?? fallback;
  element.classList.toggle('error', Boolean(message));
  element.hidden = !element.textContent;
}

function render() {
  if (!state) return;
  const { running, picking, trusted, clicks, settings, hotkeyAvailable } = state;
  const busy = running || picking;

  for (const element of form.elements) element.disabled = busy;
  $('pickBtn').disabled = running;
  $('pickBtn').textContent = picking ? 'Cancel' : 'Pick…';
  $('repeatCountRow').hidden = radioValue('repeatMode') !== 'count';
  $('fixedRow').hidden = radioValue('positionMode') !== 'fixed';

  const intervalMs = $('intervalValue').valueAsNumber * UNIT_MS[$('intervalUnit').value];
  const double = radioValue('clickType') === 'double';
  const tooFast = !errors.interval && (1000 / intervalMs) * (double ? 2 : 1) > FAST_PRESSES_PER_SECOND;
  let rate = errors.interval ? '' : describeRate(intervalMs, double);
  if (tooFast) rate += ' — faster than macOS can keep up, so clicks may lag';
  setNote($('intervalNote'), errors.interval, rate);
  $('intervalNote').classList.toggle('warning', tooFast);
  $('intervalValue').setAttribute('aria-invalid', String(Boolean(errors.interval)));
  setNote($('repeatNote'), errors.repeat);
  $('repeatCount').setAttribute('aria-invalid', String(Boolean(errors.repeat)));
  const hintOnly = noSpotYet();
  setNote($('positionNote'), hintOnly ? null : errors.position, hintOnly ? errors.position : '');
  for (const id of ['x', 'y']) $(id).setAttribute('aria-invalid', String(Boolean(errors.position) && !hintOnly));

  $('permissionBanner').hidden = trusted;

  const toggle = $('toggleBtn');
  toggle.classList.toggle('stop', running);
  toggle.disabled = !running && (picking || hasErrors());
  $('toggleLabel').textContent = running ? 'Stop' : 'Start';
  const shortcut = hotkeyAvailable ? formatAccelerator(settings.hotkey) : '';
  $('toggleShortcut').textContent = shortcut;
  $('toggleShortcut').hidden = !shortcut;

  const status = statusFor(state);
  $('statusDot').dataset.tone = status.tone;
  $('statusText').textContent = status.text;
  $('clickCount').textContent =
    running && state.limit ? `${formatNumber(clicks)} of ${plural(state.limit, 'click')}` : plural(clicks, 'click');
  setNote($('statusNote'), null, status.note);

  const hotkeyBtn = $('hotkeyBtn');
  hotkeyBtn.disabled = busy;
  hotkeyBtn.classList.toggle('recording', recordingHotkey);
  hotkeyBtn.textContent = recordingHotkey ? 'Type shortcut…' : formatAccelerator(settings.hotkey) || 'None';
  let hotkeyNote = 'Press Esc at any time to stop.';
  if (recordingHotkey) hotkeyNote = 'Press the new shortcut. Esc cancels, Delete removes it.';
  else if (hotkeyMessage) hotkeyNote = hotkeyMessage;
  else if (!hotkeyAvailable) hotkeyNote = `${formatAccelerator(settings.hotkey)} is used by another app. Click to pick another.`;
  setNote($('hotkeyNote'), null, hotkeyNote);
  $('hotkeyNote').classList.toggle('error', Boolean(hotkeyMessage) || (!hotkeyAvailable && !recordingHotkey));
}

function applyState(next) {
  state = next;
  // A finished pick changes the coordinates, so copy them into the form and
  // save, which also tells the main process the form is valid again.
  const pickEnded = wasPicking && !state.picking;
  wasPicking = state.picking;
  if (pickEnded) {
    fillPosition(state.settings);
    saveForm();
  } else {
    render();
  }
}

// --- Actions ---------------------------------------------------------------

$('toggleBtn').addEventListener('click', () => api.toggle());
$('openSettingsBtn').addEventListener('click', () => api.openAccessibilitySettings());
$('pickBtn').addEventListener('click', () => (state?.picking ? api.cancelPick() : api.pick()));

async function finishRecording(accelerator) {
  if (!recordingHotkey) return;
  recordingHotkey = false;
  if (accelerator === undefined) {
    await api.resumeHotkey();
  } else {
    const { ok } = await api.setHotkey(accelerator);
    hotkeyMessage = ok ? null : `${formatAccelerator(accelerator)} is used by another app. Try another.`;
  }
  render();
}

$('hotkeyBtn').addEventListener('click', async () => {
  if (recordingHotkey) return;
  recordingHotkey = true;
  hotkeyMessage = null;
  $('hotkeyBtn').focus();
  render();
  await api.pauseHotkey();
});

$('hotkeyBtn').addEventListener('blur', () => finishRecording(undefined));

$('hotkeyBtn').addEventListener('keydown', (event) => {
  if (!recordingHotkey) return;
  event.preventDefault();
  if (event.key === 'Escape') return finishRecording(undefined);
  if (event.key === 'Backspace' || event.key === 'Delete') return finishRecording('');
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) return;

  const accelerator = acceleratorFromEvent(event);
  if (accelerator) return finishRecording(accelerator);
  hotkeyMessage = 'Hold ⌘, ⌥ or ⌃ while pressing a key, or use an F-key.';
  render();
  hotkeyMessage = null;
});

// --- Startup ---------------------------------------------------------------

// Keep the window exactly as tall as its content.
new ResizeObserver(() => api.resize(document.body.getBoundingClientRect().height)).observe(document.body);

let initialized = false;
api.onState((next) => initialized && applyState(next));
api.getState().then((initial) => {
  fillForm(initial.settings);
  wasPicking = initial.picking;
  initialized = true;
  applyState(initial);
});
