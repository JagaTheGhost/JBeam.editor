/**
 * Windows System Integration Engine
 * Handles shortcuts (.lnk), file associations (.jbeam, .pc),
 * Explorer context menus, uninstaller registration, and initial settings pre-population.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function runPowerShell(command) {
  try {
    const escaped = command.replace(/"/g, '\"');
    execSync(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${escaped}"`, {
      stdio: ['ignore', 'ignore', 'ignore']
    });
    return true;
  } catch (err) {
    console.error('PowerShell command failed:', err.message);
    return false;
  }
}

function runRegAdd(key, valueName, type, data) {
  try {
    const nameArg = valueName ? `/v "${valueName}"` : '/ve';
    const cmd = `reg add "${key}" ${nameArg} /t ${type} /d "${data}" /f`;
    execSync(cmd, { stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Creates Windows Shortcut (.lnk)
 */
function createShortcut({ targetPath, shortcutPath, iconLocation, description, workingDir }) {
  const dir = path.dirname(shortcutPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const psScript = `
    $WshShell = New-Object -ComObject WScript.Shell;
    $Shortcut = $WshShell.CreateShortcut('${shortcutPath}');
    $Shortcut.TargetPath = '${targetPath}';
    $Shortcut.WorkingDirectory = '${workingDir || path.dirname(targetPath)}';
    $Shortcut.Description = '${description || 'JBeam Studio'}';
    ${iconLocation ? `$Shortcut.IconLocation = '${iconLocation}';` : ''}
    $Shortcut.Save();
  `.replace(/\r?\n\s*/g, ' ');

  return runPowerShell(psScript);
}

function getAppExePath(installDir) {
  const candidates = [
    path.join(installDir, 'JBeam.editor.exe'),
    path.join(installDir, 'JBeam Studio.exe')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

/**
 * Sets up Desktop and Start Menu shortcuts
 */
function setupShortcuts(installDir, { createDesktop = true, createStartMenu = true } = {}) {
  const exePath = getAppExePath(installDir);
  const iconPath = path.join(installDir, 'assets', 'jbeam.png');

  if (createDesktop) {
    const desktopDir = path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'Desktop');
    const desktopLnk = path.join(desktopDir, 'JBeam.editor.lnk');
    createShortcut({
      targetPath: exePath,
      shortcutPath: desktopLnk,
      iconLocation: iconPath,
      description: 'JBeam.editor - BeamNG.drive Development Environment',
      workingDir: installDir
    });
  }

  if (createStartMenu) {
    const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
    const startMenuDir = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'JBeam.editor');
    const startMenuLnk = path.join(startMenuDir, 'JBeam.editor.lnk');
    createShortcut({
      targetPath: exePath,
      shortcutPath: startMenuLnk,
      iconLocation: iconPath,
      description: 'JBeam.editor - BeamNG.drive Development Environment',
      workingDir: installDir
    });
  }
}

/**
 * Registers .jbeam and .pc file associations in HKCU
 */
function registerFileAssociations(installDir, { associateJbeam = true, associatePc = true, addContextMenu = true } = {}) {
  const exePath = getAppExePath(installDir);
  const iconJbeam = path.join(installDir, 'assets', 'jbeam.png');
  const iconPc = path.join(installDir, 'assets', 'partconfig.png');

  if (associateJbeam) {
    runRegAdd('HKCU\\Software\\Classes\\.jbeam', '', 'REG_SZ', 'JBeam.editor.Document');
    runRegAdd('HKCU\\Software\\Classes\\JBeam.editor.Document', '', 'REG_SZ', 'JBeam Vehicle File');
    runRegAdd('HKCU\\Software\\Classes\\JBeam.editor.Document\\DefaultIcon', '', 'REG_SZ', `"${iconJbeam}",0`);
    runRegAdd('HKCU\\Software\\Classes\\JBeam.editor.Document\\shell\\open\\command', '', 'REG_SZ', `"${exePath}" "%1"`);
  }

  if (associatePc) {
    runRegAdd('HKCU\\Software\\Classes\\.pc', '', 'REG_SZ', 'JBeam.editor.PartConfig');
    runRegAdd('HKCU\\Software\\Classes\\JBeam.editor.PartConfig', '', 'REG_SZ', 'BeamNG Vehicle Part Configuration');
    runRegAdd('HKCU\\Software\\Classes\\JBeam.editor.PartConfig\\DefaultIcon', '', 'REG_SZ', `"${iconPc}",0`);
    runRegAdd('HKCU\\Software\\Classes\\JBeam.editor.PartConfig\\shell\\open\\command', '', 'REG_SZ', `"${exePath}" "%1"`);
  }

  if (addContextMenu) {
    // Right click on any folder -> "Open in JBeam.editor"
    const dirKey = 'HKCU\\Software\\Classes\\Directory\\shell\\JBeamEditor';
    runRegAdd(dirKey, '', 'REG_SZ', 'Open in JBeam.editor');
    runRegAdd(dirKey, 'Icon', 'REG_SZ', `"${iconJbeam}",0`);
    runRegAdd(`${dirKey}\\command`, '', 'REG_SZ', `"${exePath}" "%V"`);

    // Right click on background of any folder
    const bgKey = 'HKCU\\Software\\Classes\\Directory\\Background\\shell\\JBeamEditor';
    runRegAdd(bgKey, '', 'REG_SZ', 'Open in JBeam.editor');
    runRegAdd(bgKey, 'Icon', 'REG_SZ', `"${iconJbeam}",0`);
    runRegAdd(`${bgKey}\\command`, '', 'REG_SZ', `"${exePath}" "%V"`);
  }

  // Notify Windows Explorer of association changes
  runPowerShell('[void][System.Runtime.InteropServices.Marshal]::GetType();');
}

/**
 * Registers Windows "Add or Remove Programs" uninstaller
 */
function registerUninstaller(installDir, version = 'v0.2Beta') {
  const uninstallKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\JBeamEditor';
  const exePath = getAppExePath(installDir);
  const iconPath = path.join(installDir, 'assets', 'jbeam.png');

  // Create an uninstall PowerShell script
  const uninstallScriptPath = path.join(installDir, 'uninstall.bat');
  const uninstallBatch = `@echo off
echo Uninstalling JBeam.editor...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Remove-Item -Path '${installDir}' -Recurse -Force -ErrorAction SilentlyContinue"
reg delete "HKCU\\Software\\Classes\\.jbeam" /f >nul 2>&1
reg delete "HKCU\\Software\\Classes\\JBeam.editor.Document" /f >nul 2>&1
reg delete "HKCU\\Software\\Classes\\.pc" /f >nul 2>&1
reg delete "HKCU\\Software\\Classes\\JBeam.editor.PartConfig" /f >nul 2>&1
reg delete "HKCU\\Software\\Classes\\Directory\\shell\\JBeamEditor" /f >nul 2>&1
reg delete "HKCU\\Software\\Classes\\Directory\\Background\\shell\\JBeamEditor" /f >nul 2>&1
reg delete "${uninstallKey}" /f >nul 2>&1
del "%USERPROFILE%\\Desktop\\JBeam.editor.lnk" >nul 2>&1
rmdir /s /q "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\JBeam.editor" >nul 2>&1
echo Done.
`;
  try {
    fs.writeFileSync(uninstallScriptPath, uninstallBatch, 'utf-8');
  } catch (e) {}

  runRegAdd(uninstallKey, 'DisplayName', 'REG_SZ', 'JBeam.editor');
  runRegAdd(uninstallKey, 'DisplayVersion', 'REG_SZ', version);
  runRegAdd(uninstallKey, 'Publisher', 'REG_SZ', 'JBeam.editor Team');
  runRegAdd(uninstallKey, 'InstallLocation', 'REG_SZ', installDir);
  runRegAdd(uninstallKey, 'DisplayIcon', 'REG_SZ', `"${iconPath}"`);
  runRegAdd(uninstallKey, 'UninstallString', 'REG_SZ', `"${uninstallScriptPath}"`);
  runRegAdd(uninstallKey, 'NoModify', 'REG_DWORD', '1');
  runRegAdd(uninstallKey, 'NoRepair', 'REG_DWORD', '1');
}

/**
 * Pre-populates JBeam Studio initial settings.json with detected BeamNG paths
 */
function saveInitialSettings(beamngPaths) {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
  const settingsDir = path.join(appData, 'jbeam-studio');
  const settingsPath = path.join(settingsDir, 'settings.json');

  if (!fs.existsSync(settingsDir)) {
    fs.mkdirSync(settingsDir, { recursive: true });
  }

  let existing = {};
  if (fs.existsSync(settingsPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch (e) {}
  }

  const updated = {
    ...existing,
    beamng: {
      gamePath: beamngPaths.gamePath || '',
      userPath: beamngPaths.userPath || '',
      vehiclesPath: beamngPaths.vehiclesPath || '',
      autoDetected: true,
      lastDetectedAt: new Date().toISOString()
    }
  };

  try {
    fs.writeFileSync(settingsPath, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to write settings.json:', e);
  }
}

module.exports = {
  setupShortcuts,
  registerFileAssociations,
  registerUninstaller,
  saveInitialSettings
};

