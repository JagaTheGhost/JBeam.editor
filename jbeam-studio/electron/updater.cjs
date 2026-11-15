/**
 * JBeam.editor - GitHub In-App Auto-Update Checker
 * Silently polls GitHub Releases API and delivers update notifications
 */
const https = require('https');
const { shell } = require('electron');

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

function fetchLatestRelease(repo = DEFAULT_REPO) {
  return new Promise((resolve, reject) => {
    const url = `https://api.github.com/repos/${repo}/releases/latest`;
    const req = https.get(url, {
      headers: {
        'User-Agent': 'JBeam.editor-App',
        'Accept': 'application/vnd.github.v3+json'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return https.get(res.headers.location, {
          headers: { 'User-Agent': 'JBeam.editor-App' }
        }, (redirectRes) => {
          let data = '';
          redirectRes.on('data', chunk => { data += chunk; });
          redirectRes.on('end', () => {
            try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
          });
        }).on('error', reject);
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
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error('Update check timeout'));
    });
  });
}

function registerUpdaterIpc(ipcMain, getMainWindow) {
  let pkgVersion = '0.1.0';
  try {
    const pkg = require('../package.json');
    pkgVersion = pkg.version || '0.1.0';
  } catch (e) {}

  ipcMain.handle('app-check-for-updates', async (_event, customRepo) => {
    try {
      const repo = customRepo || DEFAULT_REPO;
      const release = await fetchLatestRelease(repo);
      const latestTag = release.tag_name || release.name || '';
      const updateAvailable = isNewer(latestTag, pkgVersion);

      return {
        success: true,
        updateAvailable,
        currentVersion: pkgVersion,
        latestVersion: latestTag.replace(/^v/i, ''),
        tag: latestTag,
        name: release.name || latestTag,
        notes: release.body || '',
        htmlUrl: release.html_url,
        publishedAt: release.published_at
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

  // Schedule auto-check 3.5s after window is ready
  setTimeout(async () => {
    try {
      const win = getMainWindow();
      if (!win || win.isDestroyed()) return;

      const release = await fetchLatestRelease(DEFAULT_REPO);
      const latestTag = release.tag_name || release.name || '';
      if (isNewer(latestTag, pkgVersion)) {
        win.webContents.send('app-update-available', {
          currentVersion: pkgVersion,
          latestVersion: latestTag.replace(/^v/i, ''),
          tag: latestTag,
          name: release.name || latestTag,
          notes: release.body || '',
          htmlUrl: release.html_url
        });
      }
    } catch (e) {
      // Silent in background
    }
  }, 3500);
}

module.exports = {
  registerUpdaterIpc,
  isNewer,
  fetchLatestRelease
};

