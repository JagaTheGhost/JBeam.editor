/**
 * JBeam Studio Installer - UI Controller & Animations
 */

const TIPS = [
  "Press <strong>Alt+G</strong> in the 3D viewport to reset node gizmo offsets.",
  "JBeam.editor automatically validates syntax and catches bracket errors in real-time.",
  "Use the <strong>Live Sim Connection</strong> to mirror vehicle node deformation directly from BeamNG.",
  "Right-click any vehicle folder in Windows Explorer to open it as a full workspace project.",
  "Hold <strong>Shift</strong> while selecting multiple nodes to inspect spring & damping values.",
  "Custom vehicle part configurations (.pc) can be loaded and tested instantly."
];

let currentTipIndex = 0;
let tipTimer = null;
let detectedBeamNG = null;
let installedPath = '';

document.addEventListener('DOMContentLoaded', async () => {
  const btnMinimize = document.getElementById('btn-minimize');
  const btnClose = document.getElementById('btn-close');
  const btnBrowseDir = document.getElementById('btn-browse-dir');
  const btnBrowseBeamng = document.getElementById('btn-browse-beamng');
  const btnStartInstall = document.getElementById('btn-start-install');
  const btnFinish = document.getElementById('btn-finish');

  const inputInstallDir = document.getElementById('input-install-dir');
  const beamngStatusDot = document.getElementById('beamng-status-dot');
  const beamngStatusLabel = document.getElementById('beamng-status-label');
  const beamngPathText = document.getElementById('beamng-path-text');

  const stepConfig = document.getElementById('step-config');
  const stepInstalling = document.getElementById('step-installing');
  const stepFinish = document.getElementById('step-finish');

  const progressFill = document.getElementById('progress-fill');
  const statDownloaded = document.getElementById('stat-downloaded');
  const statSpeed = document.getElementById('stat-speed');
  const statEta = document.getElementById('stat-eta');
  const installSubstatus = document.getElementById('install-substatus');
  const tipText = document.getElementById('tip-text');

  const summaryInstallDir = document.getElementById('summary-install-dir');
  const summaryBeamngDir = document.getElementById('summary-beamng-dir');
  const optLaunchNow = document.getElementById('opt-launch-now');

  // 1. Window Controls
  btnMinimize.addEventListener('click', () => {
    if (window.installerAPI) window.installerAPI.minimize();
  });

  btnClose.addEventListener('click', () => {
    if (window.installerAPI) window.installerAPI.close();
  });

  // 2. Initialize Default Paths
  if (window.installerAPI) {
    const defaultDir = await window.installerAPI.getDefaultInstallDir();
    inputInstallDir.value = defaultDir;

    // Detect BeamNG Installation
    try {
      const detectResult = await window.installerAPI.detectBeamNG();
      detectedBeamNG = detectResult;
      if (detectResult.found) {
        beamngStatusDot.className = 'status-dot green';
        beamngStatusLabel.textContent = '✓ BeamNG.drive Auto-Detected';
        beamngPathText.textContent = detectResult.gamePath;
        beamngPathText.title = detectResult.gamePath;
      } else {
        beamngStatusDot.className = 'status-dot amber';
        beamngStatusLabel.textContent = 'BeamNG.drive Not Detected in Default Libraries';
        beamngPathText.textContent = 'Click "Change" to select your game folder';
      }
    } catch (e) {
      beamngStatusDot.className = 'status-dot amber';
      beamngStatusLabel.textContent = 'Detection Error';
      beamngPathText.textContent = e.message;
    }
  }

  // 3. Browse Folder Handlers
  btnBrowseDir.addEventListener('click', async () => {
    if (!window.installerAPI) return;
    const selected = await window.installerAPI.selectDirectory(inputInstallDir.value);
    if (selected) {
      inputInstallDir.value = selected;
    }
  });

  btnBrowseBeamng.addEventListener('click', async () => {
    if (!window.installerAPI) return;
    const current = detectedBeamNG && detectedBeamNG.gamePath ? detectedBeamNG.gamePath : 'C:\\';
    const selected = await window.installerAPI.selectDirectory(current);
    if (selected) {
      if (!detectedBeamNG) detectedBeamNG = {};
      detectedBeamNG.gamePath = selected;
      detectedBeamNG.found = true;
      beamngStatusDot.className = 'status-dot green';
      beamngStatusLabel.textContent = '✓ Custom BeamNG Path Selected';
      beamngPathText.textContent = selected;
    }
  });

  // 4. Tip Carousel Rotation
  function startTipRotation() {
    tipTimer = setInterval(() => {
      tipText.style.opacity = '0';
      setTimeout(() => {
        currentTipIndex = (currentTipIndex + 1) % TIPS.length;
        tipText.innerHTML = TIPS[currentTipIndex];
        tipText.style.opacity = '1';
      }, 300);
    }, 4500);
  }

  function stopTipRotation() {
    if (tipTimer) {
      clearInterval(tipTimer);
      tipTimer = null;
    }
  }

  // 5. Start Installation
  btnStartInstall.addEventListener('click', async () => {
    const installDir = inputInstallDir.value.trim();
    if (!installDir) {
      alert('Please specify a valid installation destination.');
      return;
    }

    const config = {
      installDir,
      createDesktop: document.getElementById('opt-shortcuts').checked,
      createStartMenu: document.getElementById('opt-shortcuts').checked,
      associateJbeam: document.getElementById('opt-jbeam').checked,
      associatePc: document.getElementById('opt-pc').checked,
      addContextMenu: document.getElementById('opt-context').checked,
      beamngPaths: detectedBeamNG || {}
    };

    // Switch view to Step 2
    stepConfig.classList.remove('active');
    stepInstalling.classList.add('active');
    startTipRotation();

    // Listen to real-time progress events
    window.installerAPI.onProgress((data) => {
      const p = Math.max(0, Math.min(100, data.percent || 0));
      progressFill.style.width = `${p}%`;
      statDownloaded.textContent = `${data.received} / ${data.total} (${p}%)`;
      statSpeed.textContent = data.speed;
      statEta.textContent = `ETA: ${data.eta}`;
    });

    window.installerAPI.onStatus((statusText) => {
      installSubstatus.textContent = statusText;
    });

    window.installerAPI.onError((errText) => {
      alert(`Installation Error: ${errText}`);
      stepInstalling.classList.remove('active');
      stepConfig.classList.add('active');
      stopTipRotation();
    });

    try {
      const result = await window.installerAPI.startInstall(config);
      stopTipRotation();

      if (result.success) {
        installedPath = result.installDir;
        summaryInstallDir.textContent = result.installDir;
        summaryBeamngDir.textContent = (detectedBeamNG && detectedBeamNG.gamePath) ? detectedBeamNG.gamePath : 'Not configured';

        stepInstalling.classList.remove('active');
        stepFinish.classList.add('active');
      }
    } catch (err) {
      stopTipRotation();
      alert('An unexpected error occurred: ' + err.message);
    }
  });

  // 6. Finish Button Handler
  btnFinish.addEventListener('click', () => {
    if (!window.installerAPI) return;
    if (optLaunchNow.checked && installedPath) {
      window.installerAPI.launchApp(installedPath);
    } else {
      window.installerAPI.close();
    }
  });
});

