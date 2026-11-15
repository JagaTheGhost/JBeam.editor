/**
 * JBeam Studio - Preload Bridge
 * Secure IPC context bridge exposing native filesystem and window management to React UI
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jbeamAPI', {
  isElectron: true,
  platform: process.platform,

  // Window Controls
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  isWindowMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onWindowMaximizedChange: (callback) => {
    const sub = (event, isMax) => callback(isMax);
    ipcRenderer.on('window-maximized-change', sub);
    return () => ipcRenderer.removeListener('window-maximized-change', sub);
  },

  // Native File Operations
  openFileDialog: () => ipcRenderer.invoke('dialog-open-file'),
  openDaeDialog: () => ipcRenderer.invoke('dialog-open-dae'),
  openFolderDialog: () => ipcRenderer.invoke('dialog-open-folder'),
  saveFileDialog: (content, defaultPath) => ipcRenderer.invoke('dialog-save-file', { content, defaultPath }),
  saveDirectFile: (filePath, content) => ipcRenderer.invoke('file-save-direct', { filePath, content }),
  createDirectFolder: (folderPath) => ipcRenderer.invoke('folder-create-direct', { folderPath }),
  readFile: (filePath) => ipcRenderer.invoke('file-read', filePath),
  readWorkspaceTree: (folderPath) => ipcRenderer.invoke('workspace-read-tree', folderPath),
  readDirectory: (folderPath) => ipcRenderer.invoke('workspace-read-tree', folderPath),
  scanVehicle: (folderPath) => ipcRenderer.invoke('workspace-scan-vehicle', folderPath),
  createVehicleProject: (payload) => ipcRenderer.invoke('workspace-create-vehicle', payload),

  // BeamNG Live Simulation Socket Bridge
  simConnect: () => ipcRenderer.invoke('sim-connect'),
  simDisconnect: () => ipcRenderer.invoke('sim-disconnect'),
  simReloadVehicle: () => ipcRenderer.invoke('sim-reload-vehicle'),
  simSelectNodes: (nodes) => ipcRenderer.invoke('sim-select-nodes', nodes),
  simGetStatus: () => ipcRenderer.invoke('sim-get-status'),
  simSync: () => ipcRenderer.invoke('sim-sync'),
  onSimStatusChange: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('sim-status-change', subscription);
    return () => ipcRenderer.removeListener('sim-status-change', subscription);
  },

  // In-App Auto-Update Bridge
  checkForUpdates: (repo) => ipcRenderer.invoke('app-check-for-updates', repo),
  openExternalUrl: (url) => ipcRenderer.invoke('app-open-external', url),
  openDocs: () => ipcRenderer.invoke('app-open-docs'),
  onUpdateAvailable: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('app-update-available', subscription);
    return () => ipcRenderer.removeListener('app-update-available', subscription);
  },

  // Native Menu Event Handlers
  onMenuAction: (channel, callback) => {
    const validChannels = [
      'menu-new-file',
      'menu-new-vehicle',
      'menu-open-file',
      'menu-open-folder',
      'menu-close-folder',
      'menu-load-dae',
      'menu-unload-dae',
      'menu-save',
      'menu-save-as',
      'menu-load-sample',
      'menu-toggle-left-sidebar',
      'menu-toggle-right-sidebar',
      'menu-toggle-bottom-panel',
      'menu-set-layout',
      'detached-viewport-closed'
    ];
    if (validChannels.includes(channel)) {
      const subscription = (event, ...args) => callback(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    }
  }
});

