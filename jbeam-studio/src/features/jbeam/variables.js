/*
  JBeam Studio - JBeam Variables Manager
  Extracts, sanitizes, and evaluates variables across JBeam parts, slot configurations,
  and vehicle user configurations (.pc).
*/

import { evaluateExpression, parseSafe, evaluateJBeamValue, clamp } from './expressionParser.js';

/**
 * Extracts declared variables from a part's "variables" table.
 *
 * @param {Object} part - JBeam part object
 * @returns {Object} Map of variable definitions keyed by variable name (e.g. "$track")
 */
export function extractPartVariables(part) {
  const result = {};
  if (!part || !part.variables) return result;

  const rawVars = part.variables;
  const rows = [];

  if (Array.isArray(rawVars)) {
    rows.push(...rawVars);
  } else if (typeof rawVars === 'object') {
    const keys = Object.keys(rawVars)
      .filter(k => k !== '__meta' && !isNaN(Number(k)))
      .sort((a, b) => Number(a) - Number(b));
    for (const k of keys) {
      rows.push(rawVars[k]);
    }
  }

  if (rows.length === 0) return result;

  // Check if first row is a table schema header
  let header = null;
  let startIndex = 0;

  const firstRow = rows[0];
  if (Array.isArray(firstRow) || (typeof firstRow === 'object' && firstRow[0] !== undefined)) {
    const headerArr = Array.isArray(firstRow) ? firstRow : Object.values(firstRow).filter((_, i) => typeof i === 'number');
    if (headerArr.includes('name') || headerArr.includes('default')) {
      header = headerArr;
      startIndex = 1;
    }
  }

  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i];
    if (!row || typeof row !== 'object') continue;

    let varDef = {};

    if (header) {
      const rowArr = Array.isArray(row) ? row : Object.values(row);
      for (let h = 0; h < header.length; h++) {
        const col = header[h];
        if (col && rowArr[h] !== undefined) {
          varDef[col] = rowArr[h];
        }
      }
    } else if (Array.isArray(row)) {
      // Standard fallback schema: [name, type, unit, category, default, min, max, step]
      varDef = {
        name: row[0],
        type: row[1] || 'range',
        unit: row[2] || '',
        category: row[3] || 'alignment',
        default: row[4] !== undefined ? row[4] : 0,
        min: row[5],
        max: row[6],
        step: row[7]
      };
    } else {
      varDef = { ...row };
    }

    if (varDef.name && typeof varDef.name === 'string') {
      const name = varDef.name.startsWith('$') ? varDef.name : '$' + varDef.name;
      varDef.name = name;
      varDef.val = varDef.default !== undefined ? varDef.default : 0;
      result[name] = varDef;
    }
  }

  return result;
}

/**
 * Sanitizes variable definitions, bounds checking them against min/max limits
 * and merging user configuration overrides (e.g. from .pc).
 *
 * @param {Object} declaredVariables - Definitions from extractPartVariables
 * @param {Object} [userVars={}] - User configuration values (from .pc or slot options)
 * @returns {Object} Cleaned dictionary of { [varName]: numericValue }
 */
export function sanitizeVariables(declaredVariables = {}, userVars = {}) {
  const result = {};

  // Copy raw user variables first
  for (const [k, v] of Object.entries(userVars)) {
    const normKey = k.startsWith('$') ? k : '$' + k;
    result[normKey] = typeof v === 'object' && v?.val !== undefined ? v.val : v;
  }

  for (const [name, def] of Object.entries(declaredVariables)) {
    let val = def.default;
    if (userVars[name] !== undefined) {
      val = userVars[name];
    } else if (userVars[name.slice(1)] !== undefined) {
      val = userVars[name.slice(1)];
    }

    if (typeof val === 'object' && val?.val !== undefined) {
      val = val.val;
    }

    if (typeof val === 'number') {
      if (typeof def.min === 'number' && typeof def.max === 'number') {
        val = clamp(val, def.min, def.max);
      }
    }

    result[name] = val;
    def.val = val;
  }

  return result;
}

/**
 * Iteratively resolves interdependent slot variables up to a maximum recursion limit.
 *
 * @param {Object} slotVars - Raw slot variable overrides
 * @param {Object} [baseVariables={}] - Base vehicle variables
 * @param {number} [maxIters=50] - Loop limit
 * @returns {Object} Fully resolved slot variables
 */
export function resolveSlotVariables(slotVars = {}, baseVariables = {}, maxIters = 50) {
  const working = { ...baseVariables };
  const unresolved = { ...slotVars };
  const resolved = {};

  for (let iter = 0; iter < maxIters; iter++) {
    let progress = false;

    for (const [key, rawVal] of Object.entries(unresolved)) {
      if (typeof rawVal === 'string' && rawVal.startsWith('$=')) {
        const [code, val] = parseSafe(rawVal, working);
        if (code === 0 && val !== undefined) {
          progress = true;
          resolved[key] = val;
          working[key] = val;
          delete unresolved[key];
        }
      } else if (typeof rawVal === 'string' && rawVal.startsWith('$')) {
        const direct = working[rawVal] !== undefined ? working[rawVal] : working[rawVal.slice(1)];
        if (direct !== undefined) {
          progress = true;
          const val = typeof direct === 'object' && direct?.val !== undefined ? direct.val : direct;
          resolved[key] = val;
          working[key] = val;
          delete unresolved[key];
        }
      } else {
        progress = true;
        resolved[key] = rawVal;
        working[key] = rawVal;
        delete unresolved[key];
      }
    }

    if (!progress || Object.keys(unresolved).length === 0) break;
  }

  // Any remaining expressions evaluated with whatever variables are available
  for (const [key, rawVal] of Object.entries(unresolved)) {
    if (typeof rawVal === 'string' && rawVal.startsWith('$=')) {
      const [code, val] = parseSafe(rawVal, working);
      if (code === 0 && val !== undefined) {
        resolved[key] = val;
      }
    } else {
      resolved[key] = rawVal;
    }
  }

  return resolved;
}

/**
 * Deep walks a data structure and resolves all "$=" expressions and simple "$var" substitutions.
 * Preserves the original formula in __meta.unresolved where appropriate.
 *
 * @param {any} data - JBeam table or object
 * @param {Object} variables - Combined resolved variables dictionary
 * @returns {any} Evaluated data structure
 */
export function applyVariablesToData(data, variables = {}) {
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    return evaluateJBeamValue(data, variables);
  }

  if (Array.isArray(data)) {
    return data.map(item => applyVariablesToData(item, variables));
  }

  if (typeof data === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(data)) {
      if (k === 'variables') {
        // Do not alter the declared variables table schema
        result[k] = v;
      } else {
        result[k] = applyVariablesToData(v, variables);
      }
    }
    return result;
  }

  return data;
}

/**
 * Resolves node 3D coordinates and beam parameters for a part using provided variables.
 * Ensures node.pos = [Number(node.posX), Number(node.posY), Number(node.posZ)] is valid.
 *
 * @param {Object} part - Processed JBeam part
 * @param {Object} variables - Combined variable values
 */
export function resolvePartNodesAndBeams(part, variables = {}) {
  if (!part || typeof part !== 'object') return;

  // Resolve nodes
  if (part.nodes) {
    const nodeKeys = Object.keys(part.nodes).filter(k => k !== '__meta');
    for (const k of nodeKeys) {
      const node = part.nodes[k];
      if (!node || typeof node !== 'object') continue;

      // Resolve all expression and variable properties on node
      for (const [prop, val] of Object.entries(node)) {
        if (typeof val === 'string' && (val.startsWith('$=') || (val.length >= 2 && val[0] === '$'))) {
          if (!node.__meta) node.__meta = {};
          const isCoord = prop === 'posX' || prop === 'posY' || prop === 'posZ' || prop === 'rx' || prop === 'ry' || prop === 'rz';
          if (isCoord) {
            if (!node.__meta.rawPositions) node.__meta.rawPositions = {};
            node.__meta.rawPositions[prop] = val;
          } else {
            if (!node.__meta.rawProps) node.__meta.rawProps = {};
            node.__meta.rawProps[prop] = val;
          }

          const evaluated = evaluateJBeamValue(val, variables);
          if (isCoord) {
            node[prop] = typeof evaluated === 'number' ? evaluated : (!isNaN(Number(evaluated)) ? Number(evaluated) : val);
          } else {
            node[prop] = evaluated;
          }
        }
      }

      const toNumOrOriginal = (v) => {
        if (typeof v === 'number') return v;
        const n = Number(v);
        return isNaN(n) ? v : n;
      };
      const x = node.posX !== undefined ? node.posX : (node.rx !== undefined ? node.rx : (node.pos ? node.pos[0] : 0));
      const y = node.posY !== undefined ? node.posY : (node.ry !== undefined ? node.ry : (node.pos ? node.pos[1] : 0));
      const z = node.posZ !== undefined ? node.posZ : (node.rz !== undefined ? node.rz : (node.pos ? node.pos[2] : 0));
      node.posX = toNumOrOriginal(x);
      node.posY = toNumOrOriginal(y);
      node.posZ = toNumOrOriginal(z);
      node.pos = [toNumOrOriginal(node.posX), toNumOrOriginal(node.posY), toNumOrOriginal(node.posZ)];
    }
  }

  // Resolve beams inline options (e.g. beamSpring, beamDamp)
  if (part.beams) {
    const beamKeys = Object.keys(part.beams).filter(k => k !== '__meta');
    for (const k of beamKeys) {
      const beam = part.beams[k];
      if (!beam || typeof beam !== 'object') continue;

      for (const [prop, val] of Object.entries(beam)) {
        if (typeof val === 'string' && (val.startsWith('$=') || val.startsWith('$'))) {
          if (!beam.__meta) beam.__meta = {};
          if (!beam.__meta.rawProps) beam.__meta.rawProps = {};
          beam.__meta.rawProps[prop] = val;

          const evaluated = evaluateJBeamValue(val, variables);
          beam[prop] = evaluated;
        }
      }
    }
  }
}

export default {
  extractPartVariables,
  sanitizeVariables,
  resolveSlotVariables,
  applyVariablesToData,
  resolvePartNodesAndBeams
};
