const { app, BrowserWindow, ipcMain, dialog, shell, systemPreferences } = require('electron');
const path = require('path');
const { clickMouse } = require('./click');

let mainWindow;
let clickInterval = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    resizable: false
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (clickInterval) {
      clearInterval(clickInterval);
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  
  // Check accessibility permissions on macOS
  if (process.platform === 'darwin') {
    const trusted = systemPreferences.isTrustedAccessibilityClient(false);
    if (!trusted) {
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Permissions Required',
        message: 'AutoClicker needs accessibility and automation permissions to click the mouse.',
        detail: 'You need to grant permissions in:\n1. System Preferences → Security & Privacy → Accessibility\n2. System Preferences → Security & Privacy → Automation\n\nAdd this app to both sections and restart.',
        buttons: ['Open Accessibility Settings', 'Continue Anyway'],
        defaultId: 0
      }).then(result => {
        if (result.response === 0) {
          // Open System Preferences to the correct pane
          shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
        }
      });
    } else {
      console.log('Accessibility permissions granted');
    }
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

ipcMain.handle('start-clicking', (event, interval) => {
  console.log(`Starting autoclicker with interval: ${interval}ms`);
  
  // Check permissions again when starting
  if (process.platform === 'darwin') {
    const trusted = systemPreferences.isTrustedAccessibilityClient(false);
    if (!trusted) {
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Permission Required',
        message: 'AutoClicker cannot start without accessibility permissions.',
        detail: 'Please grant accessibility permission in System Preferences and restart the app.',
        buttons: ['Open System Preferences', 'OK'],
        defaultId: 0
      }).then(result => {
        if (result.response === 0) {
          shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
        }
      });
      return false;
    }
  }
  
  if (clickInterval) {
    clearInterval(clickInterval);
  }
  
  let clickCount = 0;
  clickInterval = setInterval(() => {
    console.log(`=== MAIN PROCESS: Attempting click #${clickCount + 1} ===`);
    clickMouse((debugMessage) => {
      // Send debug messages to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('debug-message', { message: debugMessage });
      }
    });
    clickCount++;
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('click-performed', { count: clickCount });
    }
  }, interval);
  
  return true;
});

ipcMain.handle('stop-clicking', () => {
  console.log('Stopping autoclicker');
  
  if (clickInterval) {
    clearInterval(clickInterval);
    clickInterval = null;
  }
  
  return true;
});

ipcMain.handle('check-permissions', () => {
  if (process.platform === 'darwin') {
    return systemPreferences.isTrustedAccessibilityClient(false);
  }
  return true;
});