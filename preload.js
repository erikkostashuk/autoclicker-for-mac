const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    startClicking: (interval) => ipcRenderer.invoke('start-clicking', interval),
    stopClicking: () => ipcRenderer.invoke('stop-clicking'),
    onClickPerformed: (callback) => ipcRenderer.on('click-performed', callback),
    checkPermissions: () => ipcRenderer.invoke('check-permissions'),
    onPermissionStatus: (callback) => ipcRenderer.on('permission-status', callback),
    onDebugMessage: (callback) => ipcRenderer.on('debug-message', callback)
});