/**
 * BeamNG.drive & Steam Auto-Discovery Module
 * Automatically scans Windows Registry and Steam library configurations
 * to detect BeamNG.drive installation directory and userfolder.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function queryRegistry(key, valueName) {
  try {
    const cmd = `reg query "${key}" /v "${valueName}"`;
    const output = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf-8' });
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes(valueName)) {
        const parts = line.trim().split(/\s{2,}/);
        if (parts.length >= 3) {
          return parts[2];
        }
      }
    }
  } catch (err) {
    // Registry key or value not found
  }
  return null;
}

function parseLibraryFolders(vdfPath) {
  const libraries = [];
  try {
    if (!fs.existsSync(vdfPath)) return libraries;
    const content = fs.readFileSync(vdfPath, 'utf-8');
    const pathRegex = /"path"\s+"([^"]+)"/g;
    let match;
    while ((match = pathRegex.exec(content)) !== null) {
      let libPath = match[1].replace(/\\\\/g, '\\');
      if (fs.existsSync(libPath)) {
        libraries.push(libPath);
      }
    }
  } catch (e) {
    // Ignore parse error
  }
  return libraries;
}

function detectBeamNG() {
  const result = {
    found: false,
    gamePath: '',
    userPath: '',
    vehiclesPath: '',
    steamFound: false,
    steamPath: ''
  };

  const candidateSteamPaths = [];

  // 1. Query Registry for Steam
  const regSteam32 = queryRegistry('HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath');
  if (regSteam32) candidateSteamPaths.push(regSteam32);

  const regSteamCU = queryRegistry('HKCU\\Software\\Valve\\Steam', 'SteamPath');
  if (regSteamCU) candidateSteamPaths.push(regSteamCU);

  // Common default Steam locations
  const defaultSteam = [
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
    'D:\\Steam',
    'E:\\Steam'
  ];
  for (const s of defaultSteam) {
    if (!candidateSteamPaths.includes(s) && fs.existsSync(s)) {
      candidateSteamPaths.push(s);
    }
  }

  // 2. Discover all Steam libraries via libraryfolders.vdf
  const allLibraryPaths = [];
  for (const steamDir of candidateSteamPaths) {
    if (fs.existsSync(steamDir)) {
      result.steamFound = true;
      result.steamPath = steamDir;
      allLibraryPaths.push(steamDir);
      const vdf = path.join(steamDir, 'steamapps', 'libraryfolders.vdf');
      const discovered = parseLibraryFolders(vdf);
      for (const d of discovered) {
        if (!allLibraryPaths.includes(d)) {
          allLibraryPaths.push(d);
        }
      }
    }
  }

  // 3. Search for BeamNG.drive in all library paths
  const candidateGamePaths = [];
  for (const lib of allLibraryPaths) {
    candidateGamePaths.push(path.join(lib, 'steamapps', 'common', 'BeamNG.drive'));
  }

  // Also common custom drive locations
  const driveLetters = ['C', 'D', 'E', 'F', 'G'];
  for (const dl of driveLetters) {
    candidateGamePaths.push(`${dl}:\\SteamLibrary\\steamapps\\common\\BeamNG.drive`);
    candidateGamePaths.push(`${dl}:\\Games\\BeamNG.drive`);
    candidateGamePaths.push(`${dl}:\\BeamNG.drive`);
  }

  for (const p of candidateGamePaths) {
    try {
      if (fs.existsSync(p)) {
        const exe64 = path.join(p, 'Bin64', 'BeamNG.drive.x64.exe');
        const rootExe = path.join(p, 'BeamNG.drive.exe');
        if (fs.existsSync(exe64) || fs.existsSync(rootExe) || fs.existsSync(path.join(p, 'gameengine.dll')) || fs.existsSync(path.join(p, 'content'))) {
          result.found = true;
          result.gamePath = p;
          break;
        }
      }
    } catch (e) {}
  }

  // 4. Locate userfolder (AppData/Local/BeamNG.drive/<version>)
  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Local');
  const beamngUserRoot = path.join(localAppData, 'BeamNG.drive');

  if (fs.existsSync(beamngUserRoot)) {
    try {
      const entries = fs.readdirSync(beamngUserRoot);
      // Sort to get newest version e.g. '0.34', '0.33', 'latest'
      const versionFolders = entries.filter(e => /^0\.\d+/.test(e)).sort().reverse();
      if (versionFolders.length > 0) {
        result.userPath = path.join(beamngUserRoot, versionFolders[0]);
      } else if (fs.existsSync(path.join(beamngUserRoot, 'latest'))) {
        result.userPath = path.join(beamngUserRoot, 'latest');
      } else {
        result.userPath = beamngUserRoot;
      }
    } catch (e) {
      result.userPath = beamngUserRoot;
    }
  } else {
    // Check Documents folder (older BeamNG versions)
    const docs = path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'Documents', 'BeamNG.drive');
    if (fs.existsSync(docs)) {
      result.userPath = docs;
    }
  }

  // 5. Locate vehicles content
  if (result.gamePath) {
    const contentVehicles = path.join(result.gamePath, 'content', 'vehicles');
    if (fs.existsSync(contentVehicles)) {
      result.vehiclesPath = contentVehicles;
    }
  }

  return result;
}

module.exports = {
  detectBeamNG
};

