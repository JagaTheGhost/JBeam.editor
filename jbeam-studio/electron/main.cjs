/**
 * JBeam Studio - Main Process
 * Electron lifecycle, native window management, and secure filesystem IPC handlers
 */
const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const ipcMain = electron.ipcMain;
const dialog = electron.dialog;
const shell = electron.shell;
const Menu = electron.Menu;

const path = require('path');
const fs = require('fs');
const { registerSimIpc } = require('./simConnectionMain.cjs');
const { registerUpdaterIpc } = require('./updater.cjs');

if (!app) {
  console.error('[JBeam Studio] Main process must be executed within Electron.');
  process.exit(1);
}

try {
  app.setName('JBeam.editor');
} catch (e) {}

// Hardware GPU Acceleration & Discrete GPU Priority for CAD / 3D Performance
try {
  app.commandLine.appendSwitch('gpu-preference', '2');
  app.commandLine.appendSwitch('force_high_performance_gpu');
  app.commandLine.appendSwitch('force-high-performance-gpu');
  app.commandLine.appendSwitch('force-discrete-gpu');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
} catch (e) {
  console.warn('[JBeam Studio] Failed to set GPU command-line switches:', e);
}

let mainWindow = null;
const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';
if (isDev) {
  process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
}

function resolveIcon(filename) {
  const candidates = [
    path.join(__dirname, '..', 'public', 'icons', filename),
    path.join(__dirname, '..', 'icons', filename),
    path.join(__dirname, '..', 'dist', 'icons', filename),
    path.join(__dirname, '..', filename)
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

function resolveWorkspacePath(p) {
  if (!p) return null;
  if (path.isAbsolute(p)) return p;
  // Check relative to cwd
  const cwdCandidate = path.resolve(process.cwd(), p);
  if (fs.existsSync(cwdCandidate)) return cwdCandidate;
  // Check relative to parent directory (useful when cwd is jbeam-studio)
  const parentCandidate = path.resolve(process.cwd(), '..', p);
  if (fs.existsSync(parentCandidate)) return parentCandidate;
  return cwdCandidate;
}

function scanDirectoryTree(dirPath, maxDepth = 10, currentDepth = 0) {
  const resolvedDir = resolveWorkspacePath(dirPath);
  if (currentDepth > maxDepth || !resolvedDir || !fs.existsSync(resolvedDir)) return [];
  try {
    const entries = fs.readdirSync(resolvedDir, { withFileTypes: true });
    const items = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;

      const fullPath = path.join(resolvedDir, entry.name);
      if (entry.isDirectory()) {
        items.push({
          name: entry.name,
          path: fullPath,
          isDirectory: true,
          children: scanDirectoryTree(fullPath, maxDepth, currentDepth + 1)
        });
      } else {
        const isJBeam = entry.name.endsWith('.jbeam');
        const isJson = entry.name.endsWith('.json') || entry.name.endsWith('.materials.json');
        const isPc = entry.name.endsWith('.pc');
        const isDae = entry.name.endsWith('.dae');
        const isImage = /\.(png|jpg|jpeg|svg|dds)$/i.test(entry.name);

        items.push({
          name: entry.name,
          path: fullPath,
          isDirectory: false,
          isJBeam,
          isJson,
          isPc,
          isDae,
          isImage
        });
      }
    }

    // Sort folders first, then JBeam files, then other files
    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      if (a.isJBeam && !b.isJBeam) return -1;
      if (!a.isJBeam && b.isJBeam) return 1;
      return a.name.localeCompare(b.name);
    });

    return items;
  } catch (err) {
    console.error(`Error scanning directory ${dirPath}:`, err);
    return [];
  }
}

function buildApplicationMenu(win) {
  try {
    const template = [
      {
        label: 'File',
        submenu: [
          {
            label: 'New JBeam File',
            accelerator: 'CmdOrCtrl+N',
            click: () => {
              if (win) win.webContents.send('menu-new-file');
            }
          },
          {
            label: 'New Vehicle Project...',
            accelerator: 'CmdOrCtrl+Shift+N',
            click: () => {
              if (win) win.webContents.send('menu-new-vehicle');
            }
          },
          {
            label: 'Open File...',
            accelerator: 'CmdOrCtrl+O',
            click: () => {
              if (win) win.webContents.send('menu-open-file');
            }
          },
          {
            label: 'Open Folder...',
            accelerator: 'CmdOrCtrl+Shift+O',
            click: () => {
              if (win) win.webContents.send('menu-open-folder');
            }
          },
          {
            label: 'Close Folder',
            click: () => {
              if (win) win.webContents.send('menu-close-folder');
            }
          },
          { type: 'separator' },
          {
            label: 'Load Visual Mesh (.dae)...',
            accelerator: 'CmdOrCtrl+M',
            click: () => {
              if (win) win.webContents.send('menu-load-dae');
            }
          },
          {
            label: 'Unload Visual Mesh',
            click: () => {
              if (win) win.webContents.send('menu-unload-dae');
            }
          },
          { type: 'separator' },
          {
            label: 'Save',
            accelerator: 'CmdOrCtrl+S',
            click: () => {
              if (win) win.webContents.send('menu-save');
            }
          },
          {
            label: 'Save As...',
            accelerator: 'CmdOrCtrl+Shift+S',
            click: () => {
              if (win) win.webContents.send('menu-save-as');
            }
          },
          { type: 'separator' },
          {
            label: 'Exit',
            accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
            role: 'quit'
          }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' }
        ]
      },
      {
        label: 'View',
        submenu: [
          {
            label: 'Toggle Code & Files (Left Sidebar)',
            accelerator: 'CmdOrCtrl+B',
            click: () => {
              if (win) win.webContents.send('menu-toggle-left-sidebar');
            }
          },
          {
            label: 'Toggle Problems Panel',
            accelerator: 'CmdOrCtrl+`',
            click: () => {
              if (win) win.webContents.send('menu-toggle-bottom-panel');
            }
          },
          {
            label: 'Toggle Inspector (Right Sidebar)',
            accelerator: 'CmdOrCtrl+J',
            click: () => {
              if (win) win.webContents.send('menu-toggle-right-sidebar');
            }
          },
          { type: 'separator' },
          {
            label: '3D View: Part Only',
            click: () => {
              if (win) win.webContents.send('menu-set-viewport-source', 'activeDocument');
            }
          },
          {
            label: '3D View: Full Assembly',
            click: () => {
              if (win) win.webContents.send('menu-set-viewport-source', 'assembly');
            }
          },
          { type: 'separator' },
          { role: 'reload', accelerator: 'F5' },
          ...(!app.isPackaged ? [{ role: 'toggleDevTools', accelerator: 'F12' }] : [])
        ]
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'BeamNG Modding Documentation',
            click: () => {
              shell.openExternal('https://documentation.beamng.com/modding/vehicle/sections/');
            }
          },
          {
            label: 'About JBeam.editor',
            click: () => {
              dialog.showMessageBox(win, {
                type: 'info',
                title: 'About JBeam.editor',
                message: 'JBeam.editor — Modding Edition',
                detail: 'Professional hybrid code editor & 3D development environment for BeamNG.drive vehicle physics.',
                icon: resolveIcon('logo.ico') || resolveIcon('logo.png')
              });
            }
          }
        ]
      }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  } catch (err) {
    console.error('[JBeam.editor] Failed to build application menu:', err);
  }
}

function createWindow() {
  const mainIcon = resolveIcon('logo.ico') || resolveIcon('logo.png');
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    title: 'JBeam.editor',
    icon: mainIcon,
    backgroundColor: '#1e2127',
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
      devTools: !app.isPackaged
    }
  });

  try {
    mainWindow.setIcon(mainIcon);
  } catch (e) {}

  buildApplicationMenu(mainWindow);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setAutoHideMenuBar(true);

  mainWindow.on('maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-maximized-change', true);
    }
  });

  mainWindow.on('unmaximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-maximized-change', false);
    }
  });

  // Support Detached / Pop-out Windows and External Documentation Windows
  const detachedIcon = resolveIcon('detached-logo.ico') || resolveIcon('detached-logo.png') || resolveIcon('detached logo.ico');
  const docIcon = resolveIcon('logo.ico') || resolveIcon('logo.png') || detachedIcon;

  mainWindow.webContents.setWindowOpenHandler(({ url, frameName }) => {
    // 1. Detached 3D Viewport Popout (Internal React window with custom dark titlebar)
    const isDetachedViewport = url.includes('viewport-detached') || (frameName && frameName.includes('Viewport'));
    if (isDetachedViewport) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1280,
          height: 850,
          minWidth: 500,
          minHeight: 400,
          backgroundColor: '#1e2127',
          frame: false,
          titleBarStyle: 'hidden',
          autoHideMenuBar: true,
          title: 'JBeam.editor — 3D Viewport',
          icon: detachedIcon,
          webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            webSecurity: true,
            devTools: !app.isPackaged
          }
        }
      };
    }

    // 2. External Documentation & Web Windows: Native header controls (Minimize, Maximize, Close)
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 1200,
        height: 850,
        minWidth: 600,
        minHeight: 450,
        frame: true, // Native Windows header with minimize, maximize, and close controls
        titleBarStyle: 'default',
        autoHideMenuBar: true,
        backgroundColor: '#FFFFFF',
        title: 'BeamNG Modding Documentation — JBeam.editor',
        icon: docIcon,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          devTools: !app.isPackaged
        }
      }
    };
  });

  // Guarantee child window icon, lifecycle, and title configuration
  mainWindow.webContents.on('did-create-window', (childWindow, details) => {
    try {
      const frameName = details?.frameName || '';
      const isDetachedViewport = frameName.includes('Viewport');

      if (isDetachedViewport) {
        childWindow.setIcon(detachedIcon);
        childWindow.setTitle('JBeam.editor — 3D Viewport');

        // When detached window closes, immediately reattach in main window
        childWindow.on('close', () => {
          try {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('detached-viewport-closed');
            }
          } catch (e) {}
        });

        // Enable F12 and F5 inside detached window
        childWindow.webContents.on('before-input-event', (event, input) => {
          if (input.type === 'keyDown') {
            if (!app.isPackaged && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
              childWindow.webContents.toggleDevTools();
              event.preventDefault();
            }
            if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
              childWindow.reload();
              event.preventDefault();
            }
          }
        });
      } else {
        // Documentation / External Windows
        childWindow.setIcon(docIcon);
        // Let the page title appear naturally alongside JBeam.editor
        childWindow.on('page-title-updated', (event, title) => {
          if (title && !title.includes('JBeam.editor')) {
            childWindow.setTitle(`${title} — JBeam.editor`);
            event.preventDefault();
          }
        });
      }
    } catch (err) {
      console.warn('[JBeam.editor] Failed to configure child window:', err);
    }
  });

  // Enable F12/Ctrl+Shift+I to toggle DevTools (in dev only), and F5 to reload
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      if (!app.isPackaged && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
        mainWindow.webContents.toggleDevTools();
        event.preventDefault();
      }
      if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
        mainWindow.reload();
        event.preventDefault();
      }
    }
  });

  // Window Controls (supporting both main and detached/child windows)
  ipcMain.on('window-minimize', (event) => {
    const targetWin = (event?.sender ? BrowserWindow.fromWebContents(event.sender) : null) || mainWindow;
    if (targetWin && !targetWin.isDestroyed()) targetWin.minimize();
  });
  ipcMain.on('window-maximize', (event) => {
    const targetWin = (event?.sender ? BrowserWindow.fromWebContents(event.sender) : null) || mainWindow;
    if (targetWin && !targetWin.isDestroyed()) {
      if (targetWin.isMaximized()) targetWin.unmaximize();
      else targetWin.maximize();
    }
  });
  ipcMain.on('window-close', (event) => {
    const targetWin = (event?.sender ? BrowserWindow.fromWebContents(event.sender) : null) || mainWindow;
    if (targetWin && !targetWin.isDestroyed()) targetWin.close();
  });
  ipcMain.handle('window-is-maximized', (event) => {
    const targetWin = (event?.sender ? BrowserWindow.fromWebContents(event.sender) : null) || mainWindow;
    return targetWin && !targetWin.isDestroyed() ? targetWin.isMaximized() : false;
  });

  // Native File Dialogs
  ipcMain.handle('dialog-open-file', async () => {
    if (!mainWindow) return { canceled: true };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open JBeam File',
      filters: [
        { name: 'BeamNG JBeam Files', extensions: ['jbeam'] },
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = result.filePaths[0];
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return {
        canceled: false,
        filePath,
        fileName: path.basename(filePath),
        content
      };
    } catch (err) {
      return { canceled: true, error: err.message };
    }
  });

  ipcMain.handle('dialog-open-dae', async () => {
    if (!mainWindow) return { canceled: true };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Load Visual Mesh Overlay (.dae)',
      filters: [
        { name: 'Collada 3D Digital Asset Exchange', extensions: ['dae'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = result.filePaths[0];
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return {
        canceled: false,
        filePath,
        fileName: path.basename(filePath),
        content
      };
    } catch (err) {
      return { canceled: true, error: err.message };
    }
  });

  ipcMain.handle('dialog-open-folder', async () => {
    if (!mainWindow) return { canceled: true };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Vehicle / Mod Project Folder',
      properties: ['openDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const folderPath = result.filePaths[0];
    const tree = scanDirectoryTree(folderPath);
    return {
      canceled: false,
      folderPath,
      folderName: path.basename(folderPath),
      files: tree
    };
  });

  ipcMain.handle('workspace-read-tree', async (_event, folderPath) => {
    const resolved = resolveWorkspacePath(folderPath);
    if (!resolved || !fs.existsSync(resolved)) return [];
    return scanDirectoryTree(resolved);
  });

  ipcMain.handle('file-read', async (_event, filePath) => {
    try {
      const resolved = resolveWorkspacePath(filePath);
      if (!resolved || !fs.existsSync(resolved)) {
        return { success: false, error: `File not found: ${filePath}` };
      }
      const content = await fs.promises.readFile(resolved, 'utf-8');
      return { success: true, content, fileName: path.basename(resolved), filePath: resolved };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('file-save-direct', async (_event, { filePath, content }) => {
    try {
      const resolved = resolveWorkspacePath(filePath) || filePath;
      const dir = path.dirname(resolved);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      await fs.promises.writeFile(resolved, content, 'utf-8');
      return { success: true, filePath: resolved, fileName: path.basename(resolved) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('folder-create-direct', async (_event, { folderPath }) => {
    try {
      const resolved = resolveWorkspacePath(folderPath) || folderPath;
      if (!fs.existsSync(resolved)) {
        fs.mkdirSync(resolved, { recursive: true });
      }
      return { success: true, folderPath: resolved };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('workspace-scan-vehicle', async (_event, folderPath) => {
    const resolved = resolveWorkspacePath(folderPath);
    if (!resolved || !fs.existsSync(resolved)) return [];

    try {
      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      const hasTopLevelJBeam = entries.some(e => !e.isDirectory() && e.name.endsWith('.jbeam'));
      const hasVehiclesFolder = entries.some(e => e.isDirectory() && e.name.toLowerCase() === 'vehicles');

      let searchRoots = [];
      if (hasTopLevelJBeam) {
        // The opened folder itself is the vehicle mod directory
        searchRoots.push(resolved);
      } else if (hasVehiclesFolder) {
        // Standard BeamNG mod structure with vehicles/<vehicle_name>/
        const vehiclesDir = path.join(resolved, 'vehicles');
        const vEntries = fs.readdirSync(vehiclesDir, { withFileTypes: true });
        for (const ve of vEntries) {
          if (ve.isDirectory()) {
            searchRoots.push(path.join(vehiclesDir, ve.name));
          }
        }
        if (searchRoots.length === 0) searchRoots.push(vehiclesDir);
      } else {
        // Generic directory: only scan direct files or immediate subfolders (depth <= 2)
        searchRoots.push(resolved);
      }

      function findVehicleFiles(dir, depth = 0, maxDepth = 4) {
        if (depth > maxDepth || !fs.existsSync(dir)) return [];
        let results = [];
        const dirEntries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of dirEntries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'docs' || entry.name === 'jbeam-studio') continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            // If we are at the root of a generic non-vehicle directory (e.g. root repo workspace),
            // don't scan deep into sibling sub-repositories
            if (!hasTopLevelJBeam && !hasVehiclesFolder && depth >= 1) {
              continue;
            }
            results = results.concat(findVehicleFiles(full, depth + 1, maxDepth));
          } else if (entry.name.endsWith('.jbeam') || entry.name.endsWith('.pc')) {
            results.push(full);
          }
        }
        return results;
      }

      let files = [];
      for (const root of searchRoots) {
        files = files.concat(findVehicleFiles(root, 0, hasVehiclesFolder ? 4 : 3));
      }

      // Deduplicate file paths
      const seen = new Set();
      const uniqueFiles = [];
      for (const f of files) {
        if (!seen.has(f)) {
          seen.add(f);
          uniqueFiles.push(f);
        }
      }

      const filePayloads = [];
      for (const f of uniqueFiles) {
        try {
          const content = fs.readFileSync(f, 'utf-8');
          filePayloads.push({ path: f, content });
        } catch (e) {
          // ignore unreadable
        }
      }

      return filePayloads;
    } catch (err) {
      console.error('Error scanning vehicle files:', err);
      return [];
    }
  });

  ipcMain.handle('workspace-create-vehicle', async (_event, { targetDir, files }) => {
    try {
      if (!targetDir || !files || typeof files !== 'object') {
        return { success: false, error: 'Invalid vehicle creation payload' };
      }
      const resolvedDir = resolveWorkspacePath(targetDir) || targetDir;
      if (!fs.existsSync(resolvedDir)) {
        fs.mkdirSync(resolvedDir, { recursive: true });
      }

      for (const [relPath, content] of Object.entries(files)) {
        const fullPath = path.join(resolvedDir, relPath);
        const parentDir = path.dirname(fullPath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
        await fs.promises.writeFile(fullPath, content, 'utf-8');
      }

      const tree = scanDirectoryTree(resolvedDir);
      return {
        success: true,
        folderPath: resolvedDir,
        folderName: path.basename(resolvedDir),
        files: tree
      };
    } catch (err) {
      console.error('Error creating vehicle project files:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('dialog-save-file', async (_event, { content, defaultPath }) => {
    if (!mainWindow) return { canceled: true };
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save JBeam File',
      defaultPath: defaultPath || 'part.jbeam',
      filters: [
        { name: 'BeamNG JBeam Files', extensions: ['jbeam'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    try {
      await fs.promises.writeFile(result.filePath, content, 'utf-8');
      return {
        canceled: false,
        filePath: result.filePath,
        fileName: path.basename(result.filePath)
      };
    } catch (err) {
      return { canceled: true, error: err.message };
    }
  });

  // Register BeamNG.drive Live Simulation Socket Connection IPC
  registerSimIpc(ipcMain, () => mainWindow);

  // Register In-App Auto-Update Checker IPC
  registerUpdaterIpc(ipcMain, () => mainWindow);

  // In-App Themed Documentation Viewer
  ipcMain.handle('app-open-docs', () => {
    const candidates = [
      path.join(__dirname, '../public/docs/index.html'),
      path.join(__dirname, '../dist/docs/index.html'),
      path.resolve(__dirname, '../../docs/index.html')
    ];
    const target = candidates.find(c => fs.existsSync(c));
    if (target) {
      const docsWin = new BrowserWindow({
        width: 1280,
        height: 850,
        minWidth: 700,
        minHeight: 500,
        frame: true,
        titleBarStyle: 'default',
        autoHideMenuBar: true,
        title: 'JBeam.editor Documentation & Reference Manual',
        icon: resolveIcon('logo.ico') || resolveIcon('logo.png'),
        backgroundColor: '#1A1A1A'
      });
      docsWin.loadFile(target);
      return true;
    }
    return false;
  });

  // Forward renderer console messages to terminal for instant debugging
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levelStr = level === 3 ? 'ERROR' : (level === 2 ? 'WARN' : 'INFO');
    if (level >= 1) {
      console.log(`[Renderer ${levelStr}] ${message}`);
    }
  });

  const indexPath = path.join(__dirname, '../dist/index.html');
  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

  // Fallback to local built dist if navigation to dev server fails
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.warn(`[JBeam Studio] Failed to load ${validatedURL} (${errorDescription}). Loading local production dist...`);
    if (fs.existsSync(indexPath) && (!validatedURL || validatedURL.includes('5173') || validatedURL.startsWith('chrome-error'))) {
      mainWindow.loadFile(indexPath);
    }
  });

  // Fast probe to detect if Vite dev server is currently running
  const http = require('http');
  const probeDevServer = () => {
    return new Promise((resolve) => {
      const req = http.get(devServerUrl, (res) => {
        resolve(true);
      });
      req.on('error', () => {
        resolve(false);
      });
      req.setTimeout(250, () => {
        req.destroy();
        resolve(false);
      });
    });
  };

  (async () => {
    if (process.env.ELECTRON_LOAD_DIST) {
      mainWindow.loadFile(indexPath);
      return;
    }

    const isDevServerAlive = await probeDevServer();
    if (isDevServerAlive) {
      console.log('[JBeam Studio] Connected to live Vite dev server at ' + devServerUrl);
      mainWindow.loadURL(devServerUrl);
    } else {
      console.log('[JBeam Studio] Vite dev server not detected. Loading local production bundle (dist/index.html)...');
      if (fs.existsSync(indexPath)) {
        mainWindow.loadFile(indexPath);
      } else {
        mainWindow.loadURL(devServerUrl).catch(() => {});
      }
    }
  })();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(createWindow);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}
