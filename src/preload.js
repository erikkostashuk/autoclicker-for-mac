const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('autoclicker', {
  getState: () => ipcRenderer.invoke('get-state'),
  // `valid` is false while the form shows an error; the shortcut won't start then.
  updateSettings: (patch, valid) => ipcRenderer.invoke('update-settings', patch, valid),
  toggle: () => ipcRenderer.invoke('toggle'),
  pick: () => ipcRenderer.invoke('pick'),
  cancelPick: () => ipcRenderer.invoke('cancel-pick'),
  pauseHotkey: () => ipcRenderer.invoke('pause-hotkey'),
  setHotkey: (accelerator) => ipcRenderer.invoke('set-hotkey', accelerator),
  resumeHotkey: () => ipcRenderer.invoke('resume-hotkey'),
  openAccessibilitySettings: () => ipcRenderer.invoke('open-accessibility-settings'),
  resize: (height) => ipcRenderer.invoke('resize', height),
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('state', listener);
    return () => ipcRenderer.removeListener('state', listener);
  },
});
