import React from 'react';
import { WarningIcon, ErrorIcon, CheckIcon, FileIcon, ReloadIcon } from './Icons.jsx';

export function StatusBar({
  activeFile,
  problems = [],
  nodeCount = 0,
  beamCount = 0,
  triangleCount = 0,
  quadCount = 0,
  cursorPos = { line: 1, column: 1 },
  bottomPanelOpen,
  onToggleBottomPanel,
  simStatus = 'disconnected',
  onToggleSimConnection = null,
  onReloadVehicleInSim = null
}) {
  const errorCount = problems.filter(p => p.severity === 'error').length;
  const warningCount = problems.filter(p => p.severity === 'warning').length;
  const infoCount = problems.filter(p => p.severity === 'info').length;

  return (
    <footer className="status-bar">
      <div className="status-section left">
        <button
          className={`status-btn problem-btn ${errorCount > 0 ? 'has-errors' : ''}`}
          onClick={onToggleBottomPanel}
          title="Toggle Problems / Validation Panel"
        >
          {errorCount > 0 ? (
            <ErrorIcon size={14} className="stat-icon error" />
          ) : warningCount > 0 ? (
            <WarningIcon size={14} className="stat-icon warning" />
          ) : (
            <CheckIcon size={14} className="stat-icon check" />
          )}
          <span>
            {errorCount} Errors, {warningCount} Warnings{infoCount > 0 ? `, ${infoCount} Notices` : ''}
          </span>
        </button>

        {activeFile && (
          <span className="status-item file-item">
            <FileIcon size={13} className="file-icon" />
            <span>{activeFile.title} {activeFile.isDirty ? '(Modified)' : ''}</span>
          </span>
        )}
      </div>

      <div className="status-section right">
        <span className="status-item stat-item" title="Parsed Nodes">
          Nodes: <b>{nodeCount}</b>
        </span>
        <span className="status-item stat-item" title="Parsed Beams">
          Beams: <b>{beamCount}</b>
        </span>
        <span className="status-item stat-item" title="Parsed Triangles">
          Triangles: <b>{triangleCount}</b>
        </span>
        {quadCount > 0 && (
          <span className="status-item stat-item" title="Parsed Quads">
            Quads: <b>{quadCount}</b>
          </span>
        )}
        <span className="status-item cursor-item">
          Ln {cursorPos.line}, Col {cursorPos.column}
        </span>
        <span className="status-item enc-item">
          UTF-8
        </span>
        <span className="status-item lang-item">
          JBeam
        </span>
        <button
          className={`status-item status-sim-btn ${simStatus}`}
          onClick={onToggleSimConnection}
          title={`BeamNG Live Socket: ${simStatus === 'connected' ? 'Connected' : (simStatus === 'connecting' ? 'Connecting to port 7000...' : 'Disconnected. Click to connect')}`}
        >
          <span className={`sim-dot ${simStatus}`} />
          <span>BeamNG: {simStatus}</span>
        </button>
        {onReloadVehicleInSim && (
          <button
            className="status-item status-reload-btn"
            onClick={onReloadVehicleInSim}
            title="Reload active vehicle in BeamNG.drive without restarting the game (Ctrl+R)"
          >
            <ReloadIcon size={11} />
            <span>Reload</span>
          </button>
        )}
      </div>
    </footer>
  );
}

export default StatusBar;
