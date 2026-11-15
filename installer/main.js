/**
 * JBeam Studio Custom Web Bootstrapper - Main Process
 * Manages the frameless application window and installation lifecycle.
 */
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const { detectBeamNG } = require('./src/detector');
const { fetchLatestReleaseAsset, downloadFile, extractZip, DEFAULT_REPO } = require('./src/downloader');
const {
  setupShortcuts,
  registerFileAssociations,
  registerUninstaller,
  saveInitialSettings
} = require('./src/system');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 660,
    height: 480,
    frame: false,
    resizable: false,
    transparent: false,
    backgroundColor: '#1A1A1A',
    icon: path.join(__dirname, 'assets', 'bng-logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC: Window Controls
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-close', () => {
  app.quit();
});

// IPC: Directory Selection
ipcMain.handle('get-default-install-dir', () => {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(localAppData, 'Programs', 'JBeam.editor');
});

ipcMain.handle('select-directory', async (event, defaultPath) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: defaultPath || undefined,
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select JBeam.editor Installation Directory'
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// IPC: BeamNG Detection
ipcMain.handle('detect-beamng', async () => {
  try {
    return detectBeamNG();
  } catch (err) {
    return { found: false, error: err.message };
  }
});

// IPC: Installation Pipeline
ipcMain.handle('start-install', async (event, config) => {
  const {
    installDir,
    repo = DEFAULT_REPO,
    createDesktop = true,
    createStartMenu = true,
    associateJbeam = true,
    associatePc = true,
    addContextMenu = true,
    beamngPaths = {},
    simulatedMode = false
  } = config;

  const sendStatus = (msg) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('install-status', msg);
    }
  };

  const sendProgress = (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('install-progress', progress);
    }
  };

  try {
    sendStatus('Preparing installation directory...');
    if (!fs.existsSync(installDir)) {
      fs.mkdirSync(installDir, { recursive: true });
    }

    // Copy assets into install directory for icons
    const assetsDir = path.join(installDir, 'assets');
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
    const localAssets = path.join(__dirname, 'assets');
    if (fs.existsSync(localAssets)) {
      const files = fs.readdirSync(localAssets);
      for (const f of files) {
        fs.copyFileSync(path.join(localAssets, f), path.join(assetsDir, f));
      }
    }

    if (!simulatedMode) {
      sendStatus(`Connecting to GitHub (${repo})...`);
      const releaseAsset = await fetchLatestReleaseAsset(repo);
      
      sendStatus(`Downloading JBeam.editor ${releaseAsset.version}...`);
      const tempZip = path.join(os.tmpdir(), `jbeam-editor-setup-${Date.now()}.zip`);

      await downloadFile(releaseAsset.downloadUrl, tempZip, sendProgress);

      sendStatus('Extracting application files...');
      extractZip(tempZip, installDir, sendStatus);

      // Clean up temp zip
      try { fs.unlinkSync(tempZip); } catch (e) {}

      // Verify executable was properly installed
      const targetExe = path.join(installDir, 'JBeam.editor.exe');
      if (!fs.existsSync(targetExe)) {
        throw new Error(`Installation verification failed: JBeam.editor.exe was not found in ${installDir}`);
      }
    } else {
      // Simulated dev mode
      sendStatus('Preparing JBeam.editor application package (simulated)...');
      for (let p = 10; p <= 100; p += 15) {
        await new Promise(r => setTimeout(r, 120));
        sendProgress({
          percent: p,
          speed: '34.5 MB/s',
          received: `${(p * 0.95).toFixed(1)} MB`,
          total: '95.0 MB',
          eta: `${Math.max(0, Math.ceil((100 - p) / 25))}s`
        });
      }
    }

    sendStatus('Creating desktop and Start Menu shortcuts...');
    setupShortcuts(installDir, { createDesktop, createStartMenu });

    sendStatus('Registering .jbeam and .pc file associations...');
    registerFileAssociations(installDir, { associateJbeam, associatePc, addContextMenu });

    sendStatus('Configuring initial BeamNG modding settings...');
    saveInitialSettings(beamngPaths);

    sendStatus('Registering Windows uninstaller...');
    registerUninstaller(installDir, 'v0.1Beta');

    sendStatus('Setup complete!');
    return { success: true, installDir };
  } catch (err) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('install-error', err.message);
    }
    return { success: false, error: err.message };
  }
});

// IPC: Launch Installed App
ipcMain.handle('launch-app', (event, installDir) => {
  const candidates = [
    path.join(installDir, 'JBeam.editor.exe'),
    path.join(installDir, 'JBeam Studio.exe')
  ];

  const target = candidates.find(c => fs.existsSync(c));
  if (target) {
    spawn(target, [], { detached: true, stdio: 'ignore', shell: true }).unref();
  }
  app.quit();
});

