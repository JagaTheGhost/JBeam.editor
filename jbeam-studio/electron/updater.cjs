/**
 * JBeam.editor - Universal In-App Auto-Updater & In-Place Self-Patcher
 * Silently polls GitHub Releases, streams update packages with live metrics,
 * stages files in background, and performs seamless in-place updates upon restart.
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');
const { app, shell } = require('electron');

const DEFAULT_REPO = 'JagaTheGhost/JBeam.editor';

function parseVersion(vStr) {
  if (!vStr) return [0, 0, 0];
  const cleaned = vStr.replace(/^v/i, '').split('-')[0];
  return cleaned.split('.').map(n => parseInt(n, 10) || 0);
}

function isNewer(remoteStr, localStr) {
  const r = parseVersion(remoteStr);
  const l = parseVersion(localStr);
  for (let i = 0; i < 3; i++) {
    const remotePart = r[i] || 0;
    const localPart = l[i] || 0;
    if (remotePart > localPart) return true;
    if (remotePart < localPart) return false;
  }
  return false;
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return mb.toFixed(1) + ' MB';
}

function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec === 0) return '0.0 MB/s';
  const mbps = bytesPerSec / (1024 * 1024);
  return mbps.toFixed(1) + ' MB/s';
}

function formatETA(seconds) {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return '--';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  return `${mins}m ${secs}s`;
}

function fetchJsonUrl(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'JBeam.editor-App',
        'Accept': 'application/vnd.github.v3+json'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJsonUrl(res.headers.location).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`GitHub API returned status ${res.statusCode}`));
      }

      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(12000, () => {
      req.destroy();
      reject(new Error('Update check timeout'));
    });
  });
}

function findReleaseAssets(assets = []) {
  if (!Array.isArray(assets) || assets.length === 0) {
    return { setupAsset: null, zipAsset: null };
  }

  // 1. Standalone Portable Zip (.zip) - preferred for seamless in-place self-update
  const zipAsset = assets.find(a => {
    const name = (a.name || '').toLowerCase();
    return name.endsWith('.zip') && (name.includes('win') || name.includes('portable') || name.includes('standalone') || name.includes('studio'));
  }) || assets.find(a => (a.name || '').toLowerCase().endsWith('.zip'));

  // 2. Setup / Installer Executable (.exe)
  const setupAsset = assets.find(a => {
    const name = (a.name || '').toLowerCase();
    return name.endsWith('.exe') && (name.includes('setup') || name.includes('installer'));
  }) || assets.find(a => (a.name || '').toLowerCase().endsWith('.exe'));

  return {
    setupAsset: setupAsset ? {
      name: setupAsset.name,
      size: setupAsset.size,
      downloadUrl: setupAsset.browser_download_url
    } : null,
    zipAsset: zipAsset ? {
      name: zipAsset.name,
      size: zipAsset.size,
      downloadUrl: zipAsset.browser_download_url
    } : null
  };
}

async function fetchLatestRelease(repo = DEFAULT_REPO) {
  try {
    const releases = await fetchJsonUrl(`https://api.github.com/repos/${repo}/releases`);
    if (Array.isArray(releases) && releases.length > 0) {
      const release = releases.find(r => !r.draft) || releases[0];
      if (release) return release;
    }
  } catch (err) {
    console.warn('Could not query releases list for update check, trying latest endpoint:', err.message);
  }

  return await fetchJsonUrl(`https://api.github.com/repos/${repo}/releases/latest`);
}

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.get(url, {
      headers: {
        'User-Agent': 'JBeam.editor-App',
        'Accept': 'application/octet-stream'
      }
    }, (res) => {
      // Follow redirects (GitHub Release assets redirect to AWS S3)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, destPath, onProgress).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Download failed with HTTP ${res.statusCode}`));
      }

      const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
      let receivedBytes = 0;
      let startTime = Date.now();
      let lastReportTime = startTime;
      let lastReceived = 0;

      const fileStream = fs.createWriteStream(destPath);

      res.on('data', (chunk) => {
        receivedBytes += chunk.length;
        fileStream.write(chunk);

        const now = Date.now();
        if (now - lastReportTime >= 150) {
          const deltaBytes = receivedBytes - lastReceived;
          const deltaTime = (now - lastReportTime) / 1000;
          const speed = deltaTime > 0 ? (deltaBytes / deltaTime) : 0;
          const percent = totalBytes > 0 ? Math.min(100, (receivedBytes / totalBytes) * 100) : 0;
          const remainingBytes = Math.max(0, totalBytes - receivedBytes);
          const eta = speed > 0 ? (remainingBytes / speed) : 0;

          if (onProgress) {
            onProgress({
              percent: Math.round(percent),
              speed: formatSpeed(speed),
              received: formatBytes(receivedBytes),
              total: formatBytes(totalBytes),
              eta: formatETA(eta),
              bytesReceived: receivedBytes,
              bytesTotal: totalBytes
            });
          }

          lastReportTime = now;
          lastReceived = receivedBytes;
        }
      });

      res.on('end', () => {
        fileStream.end(() => {
          if (onProgress) {
            onProgress({
              percent: 100,
              speed: '0.0 MB/s',
              received: formatBytes(receivedBytes),
              total: formatBytes(totalBytes || receivedBytes),
              eta: '0s',
              bytesReceived: receivedBytes,
              bytesTotal: totalBytes || receivedBytes
            });
          }
          resolve(destPath);
        });
      });

      res.on('error', (err) => {
        fileStream.close();
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });

    req.on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });

    req.setTimeout(60000, () => {
      req.destroy();
      fs.unlink(destPath, () => {});
      reject(new Error('Download connection timed out'));
    });
  });
}

function extractZip(zipPath, targetDir) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  try {
    // Windows 10/11 native tar.exe (fastest extraction)
    const cmd = `tar -xf "${zipPath}" -C "${targetDir}"`;
    execSync(cmd, { stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch (err) {
    try {
      // Fallback: PowerShell Expand-Archive
      const psCmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${targetDir}' -Force"`;
      execSync(psCmd, { stdio: ['ignore', 'ignore', 'ignore'] });
      return true;
    } catch (psErr) {
      throw new Error(`Failed to extract update package: ${psErr.message}`);
    }
  }
}

function findAppRootInStaging(stagingDir) {
  if (!fs.existsSync(stagingDir)) return stagingDir;

  const directCandidates = ['JBeam.editor.exe', 'jbeam-studio.exe', 'resources'];
  for (const c of directCandidates) {
    if (fs.existsSync(path.join(stagingDir, c))) {
      return stagingDir;
    }
  }

  // Check immediate subdirectories (e.g. win-unpacked, jbeam-studio-win-x64)
  try {
    const entries = fs.readdirSync(stagingDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sub = path.join(stagingDir, entry.name);
        for (const c of directCandidates) {
          if (fs.existsSync(path.join(sub, c))) {
            return sub;
          }
        }
      }
    }
  } catch (e) {}

  return stagingDir;
}

function applyInPlaceUpdate({ stagingDir, targetDir, targetExe, oldPid }) {
  const sourceDir = findAppRootInStaging(stagingDir);
  const scriptPath = path.join(os.tmpdir(), `jbeam_swap_updater_${Date.now()}.bat`);

  // Detached Windows batch script: waits for old PID to exit, overwrites app files, and relaunches
  const scriptContent = `@echo off
setlocal enabledelayedexpansion

set "OLD_PID=${oldPid}"
set "TARGET_DIR=${targetDir}"
set "SOURCE_DIR=${sourceDir}"
set "TARGET_EXE=${targetExe}"
set "STAGING_ROOT=${stagingDir}"

:: 1. Wait for old PID to exit
:WAIT_PID
timeout /t 1 /nobreak >nul
tasklist /FI "PID eq %OLD_PID%" 2>nul | findstr /i "%OLD_PID%" >nul
if not errorlevel 1 goto WAIT_PID

timeout /t 1 /nobreak >nul

:: 2. Check if we have write access to TARGET_DIR
echo. > "%TARGET_DIR%\\.update_perm_test" 2>nul
if not exist "%TARGET_DIR%\\.update_perm_test" (
    :: Protected directory (e.g. C:\\Program Files) - Elevate via PowerShell
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c timeout /t 1 /nobreak >nul & robocopy \"\"%SOURCE_DIR%\"\" \"\"%TARGET_DIR%\"\" /E /R:3 /W:1 /NP /NFL /NDL /NJH /NJS & if errorlevel 8 ( xcopy \"\"%SOURCE_DIR%\\*\"\" \"\"%TARGET_DIR%\\\"\" /E /Y /Q /H /R ) & rmdir /s /q \"\"%STAGING_ROOT%\"\" & start \"\" \"\"%TARGET_EXE%\"\"' -Verb RunAs -WindowStyle Hidden"
    del "%~f0" >nul 2>&1
    exit /b
)
del "%TARGET_DIR%\\.update_perm_test" >nul 2>&1

:: 3. Perform swap using robocopy (retries on transient file locks), fallback to xcopy
robocopy "%SOURCE_DIR%" "%TARGET_DIR%" /E /R:3 /W:1 /NP /NFL /NDL /NJH /NJS >nul 2>&1
if errorlevel 8 (
    xcopy "%SOURCE_DIR%\\*" "%TARGET_DIR%\\" /E /Y /Q /H /R >nul 2>&1
)

:: 4. Clean up staging folder
rmdir /s /q "%STAGING_ROOT%" >nul 2>&1

:: 5. Launch updated executable
start "" "%TARGET_EXE%"

:: 6. Self-delete batch file
del "%~f0" >nul 2>&1
`;

  fs.writeFileSync(scriptPath, scriptContent, 'utf8');

  // Spawn detached process
  const child = spawn('cmd.exe', ['/c', scriptPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();

  // Shut down current application instance cleanly
  setTimeout(() => {
    app.quit();
  }, 400);

  return true;
}

function registerUpdaterIpc(ipcMain, getMainWindow) {
  let pkgVersion = '0.2.0';
  try {
    const pkg = require('../package.json');
    pkgVersion = pkg.version || '0.2.0';
  } catch (e) {}

  ipcMain.handle('app-check-for-updates', async (_event, customRepo) => {
    try {
      const repo = customRepo || DEFAULT_REPO;
      const release = await fetchLatestRelease(repo);
      const latestTag = release.tag_name || release.name || '';
      const updateAvailable = isNewer(latestTag, pkgVersion);
      const { setupAsset, zipAsset } = findReleaseAssets(release.assets);

      return {
        success: true,
        updateAvailable,
        currentVersion: pkgVersion,
        latestVersion: latestTag.replace(/^v/i, ''),
        tag: latestTag,
        name: release.name || latestTag,
        notes: release.body || '',
        htmlUrl: release.html_url,
        publishedAt: release.published_at,
        setupAsset,
        zipAsset,
        hasSetup: !!setupAsset,
        hasZip: !!zipAsset,
        preferredMode: zipAsset ? 'in-place' : (setupAsset ? 'setup' : 'web')
      };
    } catch (err) {
      return {
        success: false,
        updateAvailable: false,
        currentVersion: pkgVersion,
        error: err.message
      };
    }
  });

  ipcMain.handle('app-open-external', async (_event, url) => {
    if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });

  // Download & Stage Update (Handles both In-Place .zip and Setup .exe)
  ipcMain.handle('app-download-update', async (_event, { mode = 'in-place', downloadUrl, assetName }) => {
    const win = getMainWindow();
    try {
      if (!downloadUrl) throw new Error('No download URL provided');

      const isZip = downloadUrl.toLowerCase().endsWith('.zip') || (assetName && assetName.toLowerCase().endsWith('.zip'));

      if (isZip && mode === 'in-place') {
        // 1. In-Place Update: Download to temp zip, then extract into staging folder
        const tempZip = path.join(os.tmpdir(), `jbeam-update-${Date.now()}.zip`);
        const stagingDir = path.join(os.tmpdir(), `jbeam-staging-${Date.now()}`);

        await downloadFile(downloadUrl, tempZip, (prog) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('app-update-progress', prog);
          }
        });

        // Extract to staging
        extractZip(tempZip, stagingDir);

        // Remove temporary zip file
        try { fs.unlinkSync(tempZip); } catch (e) {}

        return {
          success: true,
          mode: 'in-place',
          stagingDir,
          isReadyToApply: true
        };
      } else if (isZip && mode === 'zip-download') {
        // 2. Direct download to Downloads folder for portable users who want the raw zip
        let targetDir = path.join(os.homedir(), 'Downloads');
        try { targetDir = app.getPath('downloads') || targetDir; } catch (e) {}

        const fileName = assetName || 'JBeam.editor-portable.zip';
        const destPath = path.join(targetDir, fileName);

        await downloadFile(downloadUrl, destPath, (prog) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('app-update-progress', prog);
          }
        });

        return {
          success: true,
          mode: 'zip-download',
          filePath: destPath,
          fileName,
          isReadyToApply: false
        };
      } else {
        // 3. Setup Installer (.exe)
        const targetDir = os.tmpdir();
        const fileName = assetName || 'JBeam.editor-Setup.exe';
        const destPath = path.join(targetDir, fileName);

        await downloadFile(downloadUrl, destPath, (prog) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('app-update-progress', prog);
          }
        });

        return {
          success: true,
          mode: 'setup',
          filePath: destPath,
          fileName,
          isReadyToApply: true
        };
      }
    } catch (err) {
      console.error('[JBeam Updater] Download/Staging failed:', err);
      return {
        success: false,
        error: err.message
      };
    }
  });

  // Apply update: Universal in-place swap & restart
  ipcMain.handle('app-install-update', async (_event, payload = {}) => {
    const { mode, stagingDir, filePath } = payload;

    if (mode === 'in-place' && stagingDir) {
      const targetExe = process.execPath;
      const targetDir = path.dirname(targetExe);
      const oldPid = process.pid;

      if (!app.isPackaged) {
        // In dev mode, show notification that staging succeeded
        return {
          success: true,
          devNotice: 'In-place update verified! (Skipped overwriting node_modules/electron/dist because app is in dev mode).'
        };
      }

      applyInPlaceUpdate({
        stagingDir,
        targetDir,
        targetExe,
        oldPid
      });

      return { success: true };
    } else if (mode === 'setup' && filePath) {
      try {
        const child = spawn(filePath, [], {
          detached: true,
          stdio: 'ignore'
        });
        child.unref();

        setTimeout(() => {
          app.quit();
        }, 500);
        return { success: true };
      } catch (err) {
        return { success: false, error: `Failed to launch installer: ${err.message}` };
      }
    } else if (mode === 'zip-download' && filePath) {
      shell.showItemInFolder(filePath);
      return { success: true };
    }

    return { success: false, error: 'Unknown update mode' };
  });

  // Auto-check on launch
  setTimeout(async () => {
    try {
      const win = getMainWindow();
      if (!win || win.isDestroyed()) return;

      const release = await fetchLatestRelease(DEFAULT_REPO);
      const latestTag = release.tag_name || release.name || '';
      if (isNewer(latestTag, pkgVersion)) {
        const { setupAsset, zipAsset } = findReleaseAssets(release.assets);
        win.webContents.send('app-update-available', {
          currentVersion: pkgVersion,
          latestVersion: latestTag.replace(/^v/i, ''),
          tag: latestTag,
          name: release.name || latestTag,
          notes: release.body || '',
          htmlUrl: release.html_url,
          setupAsset,
          zipAsset,
          hasSetup: !!setupAsset,
          hasZip: !!zipAsset,
          preferredMode: zipAsset ? 'in-place' : (setupAsset ? 'setup' : 'web')
        });
      }
    } catch (e) {}
  }, 3500);
}

module.exports = {
  registerUpdaterIpc,
  isNewer,
  fetchLatestRelease,
  findReleaseAssets,
  findAppRootInStaging,
  formatBytes,
  formatSpeed,
  formatETA
};
