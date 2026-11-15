const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('installerAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  close: () => ipcRenderer.send('window-close'),
  selectDirectory: (defaultPath) => ipcRenderer.invoke('select-directory', defaultPath),
  detectBeamNG: () => ipcRenderer.invoke('detect-beamng'),
  startInstall: (config) => ipcRenderer.invoke('start-install', config),
  launchApp: (installDir) => ipcRenderer.invoke('launch-app', installDir),
  getDefaultInstallDir: () => ipcRenderer.invoke('get-default-install-dir'),
  
  onProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('install-progress', handler);
    return () => ipcRenderer.removeListener('install-progress', handler);
  },
  onStatus: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('install-status', handler);
    return () => ipcRenderer.removeListener('install-status', handler);
  },
  onError: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('install-error', handler);
    return () => ipcRenderer.removeListener('install-error', handler);
  }
});

