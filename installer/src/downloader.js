/**
 * GitHub Stream Downloader & Extractor
 * Fetches latest release payload from GitHub Releases,
 * streams the archive with real-time speed & progress updates,
 * and extracts it natively into the installation directory.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

const DEFAULT_REPO = 'JagaTheGhost/JBeam.editor';

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

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'JBeamStudio-Installer/1.0',
        'Accept': 'application/vnd.github.v3+json'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJson(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`GitHub API returned status code ${res.statusCode}`));
      }
      let rawData = '';
      res.on('data', chunk => { rawData += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(rawData));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('GitHub API request timed out'));
    });
  });
}

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.get(url, {
      headers: {
        'User-Agent': 'JBeamStudio-Installer/1.0',
        'Accept': 'application/octet-stream'
      }
    }, (res) => {
      // Follow redirects (GitHub Release assets redirect to AWS S3)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, destPath, onProgress).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Download failed with status ${res.statusCode}`));
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

function extractZip(zipPath, targetDir, onStatus) {
  if (onStatus) onStatus('Extracting application files...');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  try {
    // Try native Windows tar.exe first (fastest)
    const cmd = `tar -xf "${zipPath}" -C "${targetDir}"`;
    execSync(cmd, { stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch (err) {
    try {
      // Fallback to PowerShell Expand-Archive
      const psCmd = `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${targetDir}' -Force"`;
      execSync(psCmd, { stdio: ['ignore', 'ignore', 'ignore'] });
      return true;
    } catch (psErr) {
      throw new Error(`Failed to extract files: ${psErr.message}`);
    }
  }
}

async function fetchLatestReleaseAsset(repo = DEFAULT_REPO) {
  let release = null;

  // 1. First fetch all releases (captures both latest and prereleases like v0.1Beta)
  try {
    const listUrl = `https://api.github.com/repos/${repo}/releases`;
    const releases = await fetchJson(listUrl);
    if (Array.isArray(releases) && releases.length > 0) {
      release = releases.find(r => !r.draft) || releases[0];
    }
  } catch (err) {
    console.warn('Could not query releases list, trying /releases/latest:', err.message);
  }

  // 2. Fallback to /releases/latest if release list failed
  if (!release) {
    const latestUrl = `https://api.github.com/repos/${repo}/releases/latest`;
    release = await fetchJson(latestUrl);
  }

  if (!release) {
    throw new Error(`No available releases found on GitHub repository ${repo}`);
  }

  const version = release.tag_name || release.name || 'latest';
  const assets = release.assets || [];

  // Match jbeam-studio-*.zip, jbeam-studio-win-*.zip, or any zip
  const zipAsset = assets.find(a => a.name.toLowerCase().endsWith('.zip') && a.name.toLowerCase().includes('win')) ||
                   assets.find(a => a.name.toLowerCase().endsWith('.zip'));

  if (!zipAsset) {
    throw new Error(`No compatible Windows release zip found in ${repo} (${version})`);
  }

  return {
    version,
    assetName: zipAsset.name,
    downloadUrl: zipAsset.browser_download_url,
    size: zipAsset.size
  };
}

module.exports = {
  fetchLatestReleaseAsset,
  downloadFile,
  extractZip,
  formatBytes,
  formatSpeed,
  formatETA,
  DEFAULT_REPO
};

