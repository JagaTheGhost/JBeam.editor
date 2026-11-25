import React, { useState, useEffect } from 'react';
import AppBrandName from './AppBrandName.jsx';
import { CloseIcon } from './Icons.jsx';

/**
 * Universal BeamNG In-App Self-Updater
 * Works identically whether installed or standalone:
 * Downloads in-app, stages update, and seamlessly swaps files on restart.
 */
export function UpdateBanner({ updateInfo, onDismiss }) {
  if (!updateInfo || !updateInfo.latestVersion) return null;

  const hasZip = !!updateInfo.zipAsset?.downloadUrl;
  const hasSetup = !!updateInfo.setupAsset?.downloadUrl;
  const canDirectUpdate = hasZip || hasSetup;

  // Modes: 'in-place' (default universal self-update), 'setup' (run installer), 'zip-download' (save zip to Downloads)
  const defaultMode = updateInfo.preferredMode || (hasZip ? 'in-place' : (hasSetup ? 'setup' : 'web'));
  const [selectedMode, setSelectedMode] = useState(defaultMode);
  const [downloadState, setDownloadState] = useState('idle'); // 'idle' | 'downloading' | 'extracting' | 'ready' | 'error'
  const [progress, setProgress] = useState({ percent: 0, speed: '0 MB/s', received: '0 MB', total: '0 MB', eta: '--' });
  const [stageResult, setStageResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [devNotice, setDevNotice] = useState('');

  useEffect(() => {
    setSelectedMode(defaultMode);
    setDownloadState('idle');
    setStageResult(null);
    setErrorMsg('');
    setDevNotice('');
  }, [updateInfo?.latestVersion, defaultMode]);

  useEffect(() => {
    if (!window.jbeamAPI?.onUpdateProgress) return;
    const unsub = window.jbeamAPI.onUpdateProgress((prog) => {
      setProgress(prog);
      if (prog.percent >= 100) {
        setDownloadState('extracting');
      }
    });
    return unsub;
  }, []);

  const handleStartUpdate = async () => {
    if (!canDirectUpdate || !window.jbeamAPI?.downloadUpdate) {
      handleOpenExternal();
      return;
    }

    // Determine target asset
    let asset = null;
    if (selectedMode === 'in-place' || selectedMode === 'zip-download') {
      asset = updateInfo.zipAsset || updateInfo.setupAsset;
    } else {
      asset = updateInfo.setupAsset || updateInfo.zipAsset;
    }

    if (!asset || !asset.downloadUrl) {
      handleOpenExternal();
      return;
    }

    setDownloadState('downloading');
    setErrorMsg('');
    setDevNotice('');
    setProgress({ percent: 0, speed: '0 MB/s', received: '0 MB', total: '0 MB', eta: '--' });

    try {
      const res = await window.jbeamAPI.downloadUpdate({
        mode: selectedMode,
        downloadUrl: asset.downloadUrl,
        assetName: asset.name
      });

      if (res && res.success) {
        setStageResult(res);
        setDownloadState('ready');
      } else {
        setDownloadState('error');
        setErrorMsg(res?.error || 'Update staging failed');
      }
    } catch (err) {
      setDownloadState('error');
      setErrorMsg(err.message || 'Update error');
    }
  };

  const handleApplyRestart = async () => {
    if (!stageResult || !window.jbeamAPI?.installUpdate) return;
    const res = await window.jbeamAPI.installUpdate({
      mode: stageResult.mode,
      stagingDir: stageResult.stagingDir,
      filePath: stageResult.filePath
    });

    if (res?.devNotice) {
      setDevNotice(res.devNotice);
    }
  };

  const handleOpenExternal = () => {
    if (updateInfo.htmlUrl) {
      if (window.jbeamAPI && window.jbeamAPI.openExternalUrl) {
        window.jbeamAPI.openExternalUrl(updateInfo.htmlUrl);
      } else {
        window.open(updateInfo.htmlUrl, '_blank');
      }
    }
  };

  return (
    <div className={`bng-update-banner ${downloadState !== 'idle' ? 'has-progress' : ''}`} role="alert">
      <div className="bng-update-left">
        <span className={`bng-update-pulse ${downloadState === 'ready' ? 'green' : ''}`}></span>
        <div className="bng-update-text">
          <span className="bng-update-title">
            <AppBrandName /> Update Available
          </span>
          <span className="bng-update-badge">v{updateInfo.latestVersion}</span>

          {downloadState === 'idle' && (
            <span className="bng-update-desc">
              {updateInfo.name ? updateInfo.name : 'A new version has been released!'}
            </span>
          )}

          {downloadState === 'downloading' && (
            <div className="bng-update-progress-container">
              <div className="bng-update-progress-info">
                <span>Downloading update... {progress.percent}%</span>
                <span className="bng-update-progress-details">
                  {progress.speed} • {progress.received} / {progress.total} • ETA {progress.eta}
                </span>
              </div>
              <div className="bng-update-progress-track">
                <div
                  className="bng-update-progress-bar"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}

          {downloadState === 'extracting' && (
            <span className="bng-update-desc">
              Extracting update payload & verifying files...
            </span>
          )}

          {downloadState === 'ready' && (
            <span className="bng-update-desc completed">
              ✓ {stageResult?.mode === 'in-place'
                ? 'Update staged! Click restart to apply in-place.'
                : (stageResult?.mode === 'setup'
                  ? 'Setup downloaded and ready to install!'
                  : `Standalone zip saved to Downloads (${stageResult?.fileName || 'archive'})`)}
            </span>
          )}

          {devNotice && (
            <span className="bng-update-desc" style={{ color: '#FFB74D', fontSize: '11px' }}>
              ℹ {devNotice}
            </span>
          )}

          {downloadState === 'error' && (
            <span className="bng-update-desc error">
              ⚠ {errorMsg || 'Update failed.'}
            </span>
          )}
        </div>
      </div>

      <div className="bng-update-actions">
        {downloadState === 'idle' && (
          <>
            {hasZip && hasSetup && (
              <select
                className="bng-update-format-select"
                value={selectedMode}
                onChange={(e) => setSelectedMode(e.target.value)}
                title="Select update delivery mode"
              >
                <option value="in-place">Self-Update & Restart (Universal)</option>
                <option value="setup">Setup Installer (.exe)</option>
                <option value="zip-download">Download Zip to Downloads</option>
              </select>
            )}

            <button
              type="button"
              className="bng-btn primary bng-update-btn"
              onClick={handleStartUpdate}
              title={selectedMode === 'zip-download' ? 'Download standalone zip package' : 'Download and apply update'}
            >
              {canDirectUpdate
                ? (selectedMode === 'zip-download' ? 'DOWNLOAD ZIP' : 'UPDATE NOW')
                : 'VIEW ON GITHUB'}
            </button>
          </>
        )}

        {downloadState === 'downloading' && (
          <span className="bng-update-status-pill">
            Downloading...
          </span>
        )}

        {downloadState === 'extracting' && (
          <span className="bng-update-status-pill">
            Extracting...
          </span>
        )}

        {downloadState === 'ready' && (
          <button
            type="button"
            className="bng-btn primary bng-update-btn success-btn"
            onClick={handleApplyRestart}
            title={stageResult?.mode === 'zip-download' ? 'Open in Downloads folder' : 'Restart application now to apply update'}
          >
            {stageResult?.mode === 'zip-download' ? 'OPEN IN EXPLORER' : 'RESTART TO APPLY'}
          </button>
        )}

        {downloadState === 'error' && (
          <>
            <button
              type="button"
              className="bng-btn secondary bng-update-btn"
              onClick={handleStartUpdate}
              title="Retry update"
            >
              RETRY
            </button>
            <button
              type="button"
              className="bng-btn primary bng-update-btn"
              onClick={handleOpenExternal}
              title="Open GitHub Releases page"
            >
              GITHUB
            </button>
          </>
        )}

        {updateInfo.htmlUrl && downloadState === 'idle' && (
          <button
            type="button"
            className="bng-update-notes-link"
            onClick={handleOpenExternal}
            title="View Release Notes on GitHub"
          >
            Notes
          </button>
        )}

        <button
          type="button"
          className="bng-update-close"
          onClick={onDismiss}
          title="Dismiss notification"
          aria-label="Dismiss notification"
        >
          <CloseIcon size={13} />
        </button>
      </div>
    </div>
  );
}

export default UpdateBanner;
