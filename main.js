const { app, BrowserWindow, ipcMain, dialog, shell, systemPreferences, globalShortcut, Menu } = require('electron');
const path = require('path');
const { clickMouse } = require('./click');

let mainWindow;
let clickInterval = null;

function createMenu() {
  const template = [
    {
      label: 'AutoClicker',
      submenu: [
        { label: 'About AutoClicker', role: 'about' },
        { type: 'separator' },
        { label: 'Services', role: 'services', submenu: [] },
        { type: 'separator' },
        { label: 'Hide AutoClicker', role: 'hide' },
        { label: 'Hide Others', role: 'hideothers' },
        { label: 'Show All', role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit', role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', role: 'undo' },
        { label: 'Redo', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', role: 'cut' },
        { label: 'Copy', role: 'copy' },
        { label: 'Paste', role: 'paste' },
        { label: 'Select All', role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', role: 'reload' },
        { label: 'Force Reload', role: 'forceReload' },
        { label: 'Toggle Developer Tools', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Actual Size', role: 'resetZoom' },
        { label: 'Zoom In', role: 'zoomIn' },
        { label: 'Zoom Out', role: 'zoomOut' },
        { type: 'separator' },
        { label: 'Toggle Fullscreen', role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { label: 'Minimize', role: 'minimize' },
        { label: 'Close', role: 'close' },
        { type: 'separator' },
        { label: 'Bring All to Front', role: 'front' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Support',
          click: async () => {
            await shell.openExternal('https://coff.ee/devwitherik');
          }
        },
        {
          label: 'Report a Bug',
          click: async () => {
            await shell.openExternal('https://x.com/devwitherik');
          }
        },
        { type: 'separator' },
        {
          label: 'Learn More',
          click: async () => {
            await shell.openExternal('https://electronjs.org');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 800,
    icon: path.join(__dirname, 'logo/128-mac.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'default',
    resizable: true,
    movable: true
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
  createMenu();
  createWindow();
  
  // Register global ESC key shortcut
  globalShortcut.register('Escape', () => {
    console.log('ESC pressed globally - stopping autoclicker');
    if (clickInterval) {
      clearInterval(clickInterval);
      clickInterval = null;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('force-stop');
    }
  });
  
  // Check permissions on macOS
  if (process.platform === 'darwin') {
    checkAndRequestPermissions();
  }

async function checkAndRequestPermissions() {
  const accessibilityGranted = systemPreferences.isTrustedAccessibilityClient(false);
  
  // Check automation permissions by trying to execute a simple AppleScript
  let automationGranted = false;
  try {
    const { exec } = require('child_process');
    await new Promise((resolve, reject) => {
      exec('osascript -e "tell application \\"System Events\\" to get name"', { timeout: 3000 }, (error, stdout, stderr) => {
        if (error || stderr.includes('not allowed')) {
          automationGranted = false;
        } else {
          automationGranted = true;
        }
        resolve();
      });
    });
  } catch (e) {
    automationGranted = false;
  }
  
  console.log(`Permissions status: Accessibility: ${accessibilityGranted}, Automation: ${automationGranted}`);
  
  // Show appropriate permission dialogs
  if (!accessibilityGranted && !automationGranted) {
    // Both permissions needed
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Permissions Required',
      message: 'AutoClicker needs both Accessibility and Automation permissions to function.',
      detail: 'This app requires:\n\n✓ Accessibility Permission - To detect mouse clicks\n✓ Automation Permission - To control System Events\n\nBoth permissions are required for the autoclicker to work properly.',
      buttons: ['Open Accessibility Settings', 'Open Automation Settings', 'Continue Without Permissions'],
      defaultId: 0,
      cancelId: 2
    });
    
    if (result.response === 0) {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
      // Show follow-up dialog for automation
      setTimeout(() => {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Next: Automation Permission',
          message: 'After granting Accessibility permission, you also need Automation permission.',
          detail: 'Please also add AutoClicker to:\nSystem Preferences → Security & Privacy → Privacy → Automation\n\nThen restart the app.',
          buttons: ['Open Automation Settings', 'OK']
        }).then(automationResult => {
          if (automationResult.response === 0) {
            shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Automation');
          }
        });
      }, 2000);
    } else if (result.response === 1) {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Automation');
    }
    
  } else if (!accessibilityGranted) {
    // Only accessibility needed
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Accessibility Permission Required',
      message: 'AutoClicker needs Accessibility permission to function.',
      detail: 'Please add AutoClicker to:\nSystem Preferences → Security & Privacy → Privacy → Accessibility\n\nThen restart the app.',
      buttons: ['Open Accessibility Settings', 'Continue Anyway'],
      defaultId: 0
    });
    
    if (result.response === 0) {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
    }
    
  } else if (!automationGranted) {
    // Only automation needed
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Automation Permission Required',
      message: 'AutoClicker needs Automation permission to control System Events.',
      detail: 'Please add AutoClicker to:\nSystem Preferences → Security & Privacy → Privacy → Automation\n\nThen restart the app.',
      buttons: ['Open Automation Settings', 'Continue Anyway'],
      defaultId: 0
    });
    
    if (result.response === 0) {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Automation');
    }
    
  } else {
    // Both permissions granted
    console.log('✅ All permissions granted - AutoClicker ready to use!');
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Ready to Use!',
      message: 'All permissions granted successfully.',
      detail: '✅ Accessibility Permission: Granted\n✅ Automation Permission: Granted\n\nYour AutoClicker is ready to use!',
      buttons: ['Great!']
    });
  }
}
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  // Unregister all shortcuts when app is about to quit
  globalShortcut.unregisterAll();
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
  
  // Minimum interval enforcement to prevent system overload
  const actualInterval = Math.max(interval, 50); // Enforce minimum 50ms between clicks
  
  clickInterval = setInterval(() => {
    console.log(`=== MAIN PROCESS: Attempting click #${clickCount + 1} ===`);
    
    // Use C program that clicks at current cursor position without moving it
    const cCode = `
#include <ApplicationServices/ApplicationServices.h>
#include <stdio.h>
int main() {
    // Get current cursor position
    CGEventRef event = CGEventCreate(NULL);
    CGPoint currentPos = CGEventGetLocation(event);
    CFRelease(event);
    
    // Create mouse events at current position
    CGEventRef mouseDown = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseDown, currentPos, kCGMouseButtonLeft);
    CGEventRef mouseUp = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseUp, currentPos, kCGMouseButtonLeft);
    
    // Post click events
    CGEventPost(kCGHIDEventTap, mouseDown);
    usleep(1000);
    CGEventPost(kCGHIDEventTap, mouseUp);
    
    CFRelease(mouseDown);
    CFRelease(mouseUp);
    
    printf("%.0f,%.0f", currentPos.x, currentPos.y);
    return 0;
}`;
    
    const { exec } = require('child_process');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const tempCFile = path.join(os.tmpdir(), `click_${Date.now()}.c`);
    const tempExe = path.join(os.tmpdir(), `click_${Date.now()}`);
    
    fs.writeFileSync(tempCFile, cCode);
    exec(`gcc -framework ApplicationServices -o "${tempExe}" "${tempCFile}" && "${tempExe}"`, (error, stdout) => {
      try {
        fs.unlinkSync(tempCFile);
        fs.unlinkSync(tempExe);
      } catch (e) {}
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        const coords = stdout ? stdout.trim() : 'unknown';
        mainWindow.webContents.send('debug-message', { message: error ? `❌ Click failed` : `✅ Click at {${coords}}` });
      }
    });
    
    clickCount++;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('click-performed', { count: clickCount });
    }
  }, actualInterval);
  
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