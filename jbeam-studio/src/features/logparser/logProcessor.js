/**
 * BeamNG.drive In-Game Log Processor & Diagnostic Streamer
 * Adapted and enhanced from official BeamNG VS Code extension (src/logparser/logProcessor.js).
 * Parses beamng.log lines in the format: <timestamp>|<severity>|<origin>|<message>
 */

export const LOG_LEVELS = {
  E: { id: 'error', label: 'Error', severity: 'error', color: '#ff4d4f' },
  W: { id: 'warning', label: 'Warning', severity: 'warning', color: '#faad14' },
  I: { id: 'info', label: 'Info', severity: 'info', color: '#1890ff' },
  D: { id: 'debug', label: 'Debug', severity: 'debug', color: '#8c8c8c' }
};

/**
 * Parses raw text from a BeamNG.drive log file into structured diagnostic entries.
 *
 * @param {string} logText - Raw log file string
 * @param {object} [options]
 * @param {boolean} [options.includeDebug=false]
 * @param {boolean} [options.includeInfo=true]
 * @returns {Array<{lineNum: number, timestamp: number, level: string, severity: string, origin: string, message: string, isVehicleRelated: boolean}>}
 */
export function parseLogContent(logText, options = {}) {
  if (!logText || typeof logText !== 'string') return [];

  const includeDebug = options.includeDebug ?? false;
  const includeInfo = options.includeInfo ?? true;
  const lines = logText.split(/\r?\n/);
  const entries = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine || rawLine.length < 3) continue;

    const parts = rawLine.split('|', 4);
    if (parts.length < 4) {
      // Non-standard line (could be multiline stack trace or header)
      if (entries.length > 0 && (rawLine.startsWith(' ') || rawLine.startsWith('\t'))) {
        entries[entries.length - 1].message += '\n' + rawLine;
      }
      continue;
    }

    const timestampStr = parts[0].trim();
    const levelCode = parts[1].trim().toUpperCase();
    const origin = parts[2].trim();
    const message = (parts[3] || '').trim();

    if (levelCode === 'D' && !includeDebug) continue;
    if (levelCode === 'I' && !includeInfo) continue;

    const levelInfo = LOG_LEVELS[levelCode] || { id: 'info', label: levelCode, severity: 'info' };
    const timestamp = parseFloat(timestampStr) || 0;

    // Check if the log line relates to vehicle physics, JBeam, flexbodies, powertrain, or Lua
    const isVehicleRelated = /jbeam|powertrain|flexmesh|flexbody|suspension|wheel|prop|hydros|differential|engine|transmission|bng_sjson/i.test(origin) ||
      /jbeam|powertrain|flexmesh|flexbody|suspension|wheelAxle|shaft|broken beam|weight|collision|spring|damp/i.test(message);

    entries.push({
      lineNum: i + 1,
      timestamp,
      level: levelInfo.id,
      severity: levelInfo.severity,
      origin,
      message,
      isVehicleRelated,
      raw: rawLine
    });
  }

  return entries;
}

/**
 * Filters parsed log entries by search text, severity levels, and vehicle relevance.
 *
 * @param {Array<object>} entries
 * @param {object} filters
 * @param {string} [filters.search='']
 * @param {string[]} [filters.levels=['error', 'warning', 'info']]
 * @param {boolean} [filters.vehicleOnly=false]
 * @param {string} [filters.origin='']
 * @returns {Array<object>}
 */
export function filterLogEntries(entries, filters = {}) {
  if (!Array.isArray(entries)) return [];

  const search = (filters.search || '').trim().toLowerCase();
  const levels = new Set(filters.levels || ['error', 'warning', 'info']);
  const vehicleOnly = Boolean(filters.vehicleOnly);
  const originFilter = (filters.origin || '').trim().toLowerCase();

  return entries.filter(e => {
    if (!levels.has(e.level)) return false;
    if (vehicleOnly && !e.isVehicleRelated) return false;
    if (originFilter && !e.origin.toLowerCase().includes(originFilter)) return false;
    if (search) {
      const matched = e.message.toLowerCase().includes(search) || e.origin.toLowerCase().includes(search);
      if (!matched) return false;
    }
    return true;
  });
}

/**
 * Analyzes log entries and returns a summary object with error counts and critical vehicle alerts.
 *
 * @param {Array<object>} entries
 * @returns {{total: number, errors: number, warnings: number, info: number, criticalIssues: Array<object>}}
 */
export function getLogSummary(entries) {
  if (!Array.isArray(entries)) {
    return { total: 0, errors: 0, warnings: 0, info: 0, criticalIssues: [] };
  }

  let errors = 0;
  let warnings = 0;
  let info = 0;
  const criticalIssues = [];

  for (const e of entries) {
    if (e.level === 'error') {
      errors++;
      if (e.isVehicleRelated) {
        criticalIssues.push(e);
      }
    } else if (e.level === 'warning') {
      warnings++;
      if (e.isVehicleRelated && /fail|missing|cannot|unable|invalid/i.test(e.message)) {
        criticalIssues.push(e);
      }
    } else if (e.level === 'info') {
      info++;
    }
  }

  return {
    total: entries.length,
    errors,
    warnings,
    info,
    criticalIssues
  };
}

export default {
  LOG_LEVELS,
  parseLogContent,
  filterLogEntries,
  getLogSummary
};

