const path = require('node:path');
const { app, BrowserWindow, globalShortcut, ipcMain, nativeTheme, shell, systemPreferences } = require('electron');
const { ClickEngine } = require('./engine');
const { REPO_URL, setUpMenu } = require('./menu');
const { SettingsStore, intervalMs } = require('./settings');

const ACCESSIBILITY_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility';
const WINDOW_WIDTH = 380;
const PERMISSION_POLL_MS = 2000;

let mainWindow = null;
let windowShown = false;
let engine;
let store;
let registeredHotkey = null;
let hotkeyPaused = false; // while the user records a new shortcut

const state = {
  running: false,
  picking: false,
  clicks: 0,
  lastRun: null, // { reason } of the most recent run, for the status line
  trusted: false,
  hotkeyAvailable: true,
};

function snapshot() {
  return { ...state, settings: store.values };
}

function pushState() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('state', snapshot());
}

function helperPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'clicker')
    : path.join(__dirname, '..', 'native', 'build', 'clicker');
}

// --- Permissions -----------------------------------------------------------

function checkPermission() {
  const trusted = systemPreferences.isTrustedAccessibilityClient(false);
  if (trusted !== state.trusted) {
    state.trusted = trusted;
    if (trusted) {
      // A helper that started before access was granted can stay blocked, so
      // switch to a fresh one.
      engine.restart();
      if (state.lastRun?.reason === 'permission') state.lastRun = null;
    }
    pushState();
  }
  return trusted;
}

function openAccessibilitySettings() {
  // Asking puts the app back in the list if the user removed a stale entry.
  systemPreferences.isTrustedAccessibilityClient(true);
  shell.openExternal(ACCESSIBILITY_SETTINGS_URL);
}

function blockedByPermission() {
  state.lastRun = { reason: 'permission' };
  showWindow();
  openAccessibilitySettings();
  pushState();
}

// --- Shortcuts -------------------------------------------------------------

function tryRegister(accelerator, callback) {
  try {
    return globalShortcut.register(accelerator, callback);
  } catch {
    return false; // not a valid accelerator
  }
}

function registerHotkey() {
  if (registeredHotkey) globalShortcut.unregister(registeredHotkey);
  registeredHotkey = null;
  state.hotkeyAvailable = true;

  const accelerator = store.values.hotkey;
  if (!accelerator || hotkeyPaused) return;
  if (tryRegister(accelerator, toggleClicking)) registeredHotkey = accelerator;
  else state.hotkeyAvailable = false;
}

// Esc is only taken from other apps while there is something to stop.
function updateEscapeShortcut() {
  const wanted = state.running || state.picking;
  const registered = globalShortcut.isRegistered('Escape');
  if (wanted && !registered) tryRegister('Escape', onEscape);
  if (!wanted && registered) globalShortcut.unregister('Escape');
}

function onEscape() {
  if (state.picking) cancelPick();
  else stopClicking();
}

// --- Clicking --------------------------------------------------------------

function startClicking() {
  if (state.running || state.picking) return;
  if (!checkPermission()) {
    blockedByPermission();
    return;
  }
  const settings = store.values;
  engine.start({
    intervalMs: intervalMs(settings),
    button: settings.button,
    double: settings.clickType === 'double',
    limit: settings.repeatMode === 'count' ? settings.repeatCount : 0,
    point: settings.positionMode === 'fixed' ? { x: settings.x, y: settings.y } : null,
  });
  Object.assign(state, { running: true, clicks: 0, lastRun: null });
  updateEscapeShortcut();
  pushState();
}

function stopClicking() {
  if (!state.running) return;
  engine.stop();
  Object.assign(state, { running: false, lastRun: { reason: 'stopped' } });
  updateEscapeShortcut();
  pushState();
}

function toggleClicking() {
  if (state.running) stopClicking();
  else startClicking();
}

function startPick() {
  if (state.running || state.picking) return;
  if (!checkPermission()) {
    blockedByPermission();
    return;
  }
  state.picking = true;
  engine.pick();
  updateEscapeShortcut();
  pushState();
}

function cancelPick() {
  if (state.picking) engine.cancelPick();
}

function endPick() {
  state.picking = false;
  updateEscapeShortcut();
  pushState();
}

function setUpEngine() {
  engine = new ClickEngine(helperPath());
  engine.on('count', (clicks) => {
    state.clicks = clicks;
    pushState();
  });
  engine.on('stopped', ({ clicks, reason }) => {
    Object.assign(state, { running: false, clicks, lastRun: { reason } });
    // Access may have been revoked mid-run; the next check restarts the helper
    // if it comes back.
    if (reason === 'permission') state.trusted = false;
    updateEscapeShortcut();
    pushState();
  });
  engine.on('picked', ({ x, y }) => {
    store.update({ x, y, positionMode: 'fixed' });
    endPick();
  });
  engine.on('pick-cancelled', endPick);
  engine.on('pick-failed', (reason) => {
    if (reason === 'permission') {
      state.trusted = false;
      state.lastRun = { reason: 'permission' };
    }
    endPick();
  });
}

// --- Window ----------------------------------------------------------------

// Clicks are skipped while the pointer is over this window and it's focused,
// so clicking Start doesn't make the app click its own Stop button.
function updateExcludeRect() {
  const active =
    mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized() && mainWindow.isFocused();
  engine.setExcludeRect(active ? mainWindow.getBounds() : null);
}

function revealWindow() {
  if (windowShown || !mainWindow) return;
  windowShown = true;
  mainWindow.show();
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: 560,
    useContentSize: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: 'AutoClicker',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#f2f2f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  for (const event of ['focus', 'blur', 'show', 'hide', 'minimize', 'restore', 'move', 'resize']) {
    mainWindow.on(event, updateExcludeRect);
  }
  mainWindow.on('focus', checkPermission);
  // The renderer sizes the window to its content, then it's shown; this is
  // only a fallback.
  mainWindow.once('ready-to-show', () => setTimeout(revealWindow, 500));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// --- IPC -------------------------------------------------------------------

function handle(channel, listener) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Unexpected sender');
    return listener(...args);
  });
}

function setUpIpc() {
  handle('get-state', snapshot);
  handle('update-settings', (patch) => {
    store.update(patch);
    pushState();
  });
  handle('toggle', toggleClicking);
  handle('pick', startPick);
  handle('cancel-pick', cancelPick);
  handle('open-accessibility-settings', openAccessibilitySettings);

  handle('pause-hotkey', () => {
    hotkeyPaused = true;
    registerHotkey();
  });
  handle('resume-hotkey', () => {
    hotkeyPaused = false;
    registerHotkey();
    pushState();
  });
  // An empty accelerator turns the shortcut off.
  handle('set-hotkey', (accelerator) => {
    hotkeyPaused = false;
    if (typeof accelerator !== 'string') accelerator = store.values.hotkey;
    // Make sure the new shortcut is free before saving it.
    const available = !accelerator || tryRegister(accelerator, toggleClicking);
    if (available && accelerator) globalShortcut.unregister(accelerator);
    if (available) store.update({ hotkey: accelerator });
    registerHotkey();
    pushState();
    return { ok: available };
  });

  handle('resize', (height) => {
    if (!Number.isFinite(height)) return;
    const contentHeight = Math.min(Math.max(Math.ceil(height), 200), 1000);
    if (mainWindow.getContentSize()[1] !== contentHeight) {
      mainWindow.setContentSize(WINDOW_WIDTH, contentHeight, windowShown);
    }
    revealWindow();
  });
}

// --- App lifecycle ---------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(() => {
    store = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'));
    setUpEngine();
    setUpIpc();
    setUpMenu();
    app.setAboutPanelOptions({ credits: `Free and open source under the MIT License.\n${REPO_URL}` });
    registerHotkey();
    createWindow();

    // Asking once lists the app under Privacy & Security → Accessibility and
    // shows the macOS prompt; the window explains the rest.
    if (!checkPermission()) systemPreferences.isTrustedAccessibilityClient(true);
    setInterval(checkPermission, PERMISSION_POLL_MS);
  });

  // A single-window utility: closing the window quits, like Calculator.
  app.on('window-all-closed', () => app.quit());

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    engine?.dispose();
    store?.flush();
  });
}
