import React, { useState, useMemo, useRef } from 'react';
import { ErrorIcon, WarningIcon, InfoIcon, CheckIcon, ReloadIcon, CloseIcon } from '../../components/Icons.jsx';
import { parseLogContent, filterLogEntries, getLogSummary } from '../logparser/logProcessor.js';

export function ProblemsPanel({
  problems = [],
  onNavigateToProblem,
  logEntries = [],
  onLoadLogContent = null
}) {
  const [activeTab, setActiveTab] = useState('problems');
  const [problemSearch, setProblemSearch] = useState('');
  const [selectedProblemSeverities, setSelectedProblemSeverities] = useState(['error', 'warning', 'info']);
  const [logSearch, setLogSearch] = useState('');
  const [selectedLevels, setSelectedLevels] = useState(['error', 'warning', 'info']);
  const [vehicleOnly, setVehicleOnly] = useState(false);
  const [internalLogEntries, setInternalLogEntries] = useState([]);
  const fileInputRef = useRef(null);

  const handleToggleProblemSeverity = (sev) => {
    setSelectedProblemSeverities(prev => {
      if (prev.includes(sev)) {
        if (prev.length === 1) return prev; // Keep at least one severity visible
        return prev.filter(s => s !== sev);
      }
      return [...prev, sev];
    });
  };

  const filteredProblems = useMemo(() => {
    const q = problemSearch.trim().toLowerCase();
    return problems.filter(p => {
      const sev = p.severity || 'warning';
      if (!selectedProblemSeverities.includes(sev)) return false;
      if (!q) return true;
      return (
        (p.message && p.message.toLowerCase().includes(q)) ||
        (p.source && p.source.toLowerCase().includes(q))
      );
    });
  }, [problems, selectedProblemSeverities, problemSearch]);

  // Combine external log entries (e.g. from sim socket or disk) with internal ones
  const effectiveLogEntries = useMemo(() => {
    return logEntries.length > 0 ? logEntries : internalLogEntries;
  }, [logEntries, internalLogEntries]);

  // Log Filtering
  const filteredLogs = useMemo(() => {
    return filterLogEntries(effectiveLogEntries, {
      search: logSearch,
      levels: selectedLevels,
      vehicleOnly
    });
  }, [effectiveLogEntries, logSearch, selectedLevels, vehicleOnly]);

  const logSummary = useMemo(() => {
    return getLogSummary(effectiveLogEntries);
  }, [effectiveLogEntries]);

  const handleToggleLevel = (levelId) => {
    setSelectedLevels(prev => {
      if (prev.includes(levelId)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter(l => l !== levelId);
      }
      return [...prev, levelId];
    });
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        const parsed = parseLogContent(text);
        setInternalLogEntries(parsed);
        if (onLoadLogContent) onLoadLogContent(parsed);
        setActiveTab('log');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const errorCount = problems.filter(p => p.severity === 'error').length;
  const warningCount = problems.filter(p => p.severity === 'warning').length;
  const infoCount = problems.filter(p => p.severity === 'info').length;

  return (
    <div className="problems-panel-container">
      {/* Tab Switcher Header */}
      <div className="bottom-panel-subtabs">
        <button
          onClick={() => setActiveTab('problems')}
          className={`subtab-btn ${activeTab === 'problems' ? 'active' : ''}`}
        >
          <span>JBeam Diagnostics</span>
          <span className="subtab-badge problems-badge">{problems.length}</span>
        </button>
        <button
          onClick={() => setActiveTab('log')}
          className={`subtab-btn ${activeTab === 'log' ? 'active' : ''}`}
        >
          <span>BeamNG Game Log</span>
          <span className={`subtab-badge log-badge ${logSummary.errors > 0 ? 'has-errors' : ''}`}>
            {effectiveLogEntries.length > 0 ? `${logSummary.errors}E / ${logSummary.warnings}W` : '0'}
          </span>
        </button>
      </div>

      {activeTab === 'problems' ? (
        /* ================= PROBLEMS TAB ================= */
        problems.length === 0 ? (
          <div className="problems-empty">
            <CheckIcon size={18} className="check-icon" />
            <span>No problems detected in current JBeam structure.</span>
          </div>
        ) : (
          <div className="problems-panel">
            <div className="problems-summary">
              <div className="problems-filter-pills">
                {errorCount > 0 && (
                  <button
                    type="button"
                    onClick={() => handleToggleProblemSeverity('error')}
                    className={`summary-filter-btn error-text ${selectedProblemSeverities.includes('error') ? 'active' : 'inactive'}`}
                    title={selectedProblemSeverities.includes('error') ? 'Hide Errors' : 'Show Errors'}
                  >
                    <ErrorIcon size={13} className="summary-icon" />
                    <span>{errorCount} {errorCount === 1 ? 'Error' : 'Errors'}</span>
                  </button>
                )}
                {warningCount > 0 && (
                  <button
                    type="button"
                    onClick={() => handleToggleProblemSeverity('warning')}
                    className={`summary-filter-btn warning-text ${selectedProblemSeverities.includes('warning') ? 'active' : 'inactive'}`}
                    title={selectedProblemSeverities.includes('warning') ? 'Hide Warnings' : 'Show Warnings'}
                  >
                    <WarningIcon size={13} className="summary-icon" />
                    <span>{warningCount} {warningCount === 1 ? 'Warning' : 'Warnings'}</span>
                  </button>
                )}
                {infoCount > 0 && (
                  <button
                    type="button"
                    onClick={() => handleToggleProblemSeverity('info')}
                    className={`summary-filter-btn info-text ${selectedProblemSeverities.includes('info') ? 'active' : 'inactive'}`}
                    title={selectedProblemSeverities.includes('info') ? 'Hide Notices' : 'Show Notices'}
                  >
                    <InfoIcon size={13} className="summary-icon" />
                    <span>{infoCount} {infoCount === 1 ? 'Notice' : 'Notices'}</span>
                  </button>
                )}
                {(selectedProblemSeverities.length < 3 || problemSearch.trim()) && (
                  <button
                    type="button"
                    className="summary-reset-btn"
                    onClick={() => {
                      setSelectedProblemSeverities(['error', 'warning', 'info']);
                      setProblemSearch('');
                    }}
                    title="Show all Errors, Warnings & Notices"
                  >
                    Show All
                  </button>
                )}
              </div>

              <div className="problems-search-wrap">
                <input
                  type="text"
                  value={problemSearch}
                  onChange={(e) => setProblemSearch(e.target.value)}
                  placeholder="Filter diagnostics..."
                  className="problems-search-input"
                />
                {problemSearch && (
                  <button
                    type="button"
                    className="problems-search-clear"
                    onClick={() => setProblemSearch('')}
                    title="Clear filter"
                  >
                    <CloseIcon size={10} />
                  </button>
                )}
              </div>
            </div>

            <div className="problems-list">
              {filteredProblems.length === 0 ? (
                <div className="problems-empty" style={{ padding: '14px 8px' }}>
                  <span>No diagnostics match the active filter.</span>
                </div>
              ) : (
                filteredProblems.map((problem, idx) => {
                  const isError = problem.severity === 'error';
                  const isInfo = problem.severity === 'info';
                  const rowClass = isError ? 'problem-error' : (isInfo ? 'problem-info' : 'problem-warning');

                  return (
                    <div
                      key={idx}
                      className={`problem-row ${rowClass}`}
                      onClick={() => onNavigateToProblem && onNavigateToProblem(problem)}
                      title="Click to jump to source code location"
                    >
                      <span className="problem-icon">
                        {isError ? (
                          <ErrorIcon size={13} />
                        ) : isInfo ? (
                          <InfoIcon size={13} />
                        ) : (
                          <WarningIcon size={13} />
                        )}
                      </span>
                      <span className="problem-source">[{problem.source || 'Validator'}]</span>
                      <span className="problem-message">{problem.message}</span>
                      <span className="problem-loc">
                        Ln {problem.line}, Col {problem.column}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )
      ) : (
        /* ================= BEAMNG GAME LOG TAB ================= */
        <div className="game-log-panel">
          {/* Controls Bar */}
          <div className="game-log-toolbar">
            <div className="log-toolbar-left">
              <input
                type="text"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Search log messages, origin (e.g. powertrain, flexmesh)..."
                className="log-search-input"
              />
              <button
                onClick={() => handleToggleLevel('error')}
                className={`log-filter-btn filter-error ${selectedLevels.includes('error') ? 'active' : ''}`}
                title="Toggle Error log lines"
              >
                Errors ({logSummary.errors})
              </button>
              <button
                onClick={() => handleToggleLevel('warning')}
                className={`log-filter-btn filter-warning ${selectedLevels.includes('warning') ? 'active' : ''}`}
                title="Toggle Warning log lines"
              >
                Warnings ({logSummary.warnings})
              </button>
              <button
                onClick={() => handleToggleLevel('info')}
                className={`log-filter-btn filter-info ${selectedLevels.includes('info') ? 'active' : ''}`}
                title="Toggle Info log lines"
              >
                Info ({logSummary.info})
              </button>
              <button
                onClick={() => setVehicleOnly(v => !v)}
                className={`log-filter-btn filter-vehicle ${vehicleOnly ? 'active' : ''}`}
                title="Filter only vehicle physics, powertrain, and flexmesh entries"
              >
                Vehicle Physics Only
              </button>
            </div>

            <div className="log-toolbar-right">
              <input
                ref={fileInputRef}
                type="file"
                accept=".log,.txt"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="log-action-btn load-log-btn"
                title="Load BeamNG.drive beamng.log file from disk"
              >
                Load beamng.log
              </button>
              {effectiveLogEntries.length > 0 && (
                <button
                  onClick={() => setInternalLogEntries([])}
                  className="log-action-btn clear-log-btn"
                  title="Clear loaded logs"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Log Stream Body */}
          {filteredLogs.length === 0 ? (
            <div className="game-log-empty">
              {effectiveLogEntries.length === 0 ? (
                <>
                  <InfoIcon size={18} className="info-icon" />
                  <span>No log file loaded. Click <b>"Load beamng.log"</b> to inspect in-game engine and Lua exceptions live.</span>
                </>
              ) : (
                <span>No log entries match the current filter criteria.</span>
              )}
            </div>
          ) : (
            <div className="game-log-stream">
              {filteredLogs.map((entry, idx) => {
                const isErr = entry.level === 'error';
                const isWarn = entry.level === 'warning';
                const rowClass = isErr ? 'log-row-error' : (isWarn ? 'log-row-warning' : 'log-row-info');

                return (
                  <div key={idx} className={`game-log-row ${rowClass}`}>
                    <span className="log-time">{entry.timestamp.toFixed(3)}s</span>
                    <span className={`log-badge log-badge-${entry.level}`}>{entry.level.toUpperCase()}</span>
                    <span className="log-origin">[{entry.origin}]</span>
                    <span className="log-msg">{entry.message}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ProblemsPanel;
