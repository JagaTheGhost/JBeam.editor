/*
  JBeam Studio - Vehicle Assembly Indexer
  Discovers, indexes, and categorizes JBeam parts, slots, and .pc configurations
  across any BeamNG vehicle mod directory.
*/

import { decodeWithMeta } from '../jbeam/sjsonParser.js';

export function safeStringVal(val, fallback = '') {
  if (val == null) return fallback;
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') {
    if (typeof val.txt === 'string') return val.txt;
    if (typeof val.description === 'string') return val.description;
    if (typeof val.name === 'string') return val.name;
    if (typeof val.title === 'string') return val.title;
    return fallback;
  }
  return fallback;
}

export function toJsArray(obj) {
  if (!obj) return [];
  if (Array.isArray(obj)) return obj;
  if (typeof obj === 'object') {
    const res = [];
    const keys = Object.keys(obj).filter(k => k !== '__meta' && !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b));
    for (const k of keys) {
      res.push(obj[k]);
    }
    return res;
  }
  return [];
}

/**
 * Parses all parts and their slot definitions from a JBeam document text.
 *
 * @param {string} text - JBeam file text content
 * @param {string} filePath - Path or filename of the JBeam file
 * @returns {Array<Object>} List of indexed part descriptors
 */
export function extractPartsFromJBeamText(text, filePath) {
  if (!text || typeof text !== 'string') return [];
  const parts = [];

  try {
    const bundle = decodeWithMeta(text, filePath, false);
    if (!bundle?.data || typeof bundle.data !== 'object') return [];

    const partNames = Object.keys(bundle.data).filter(k => k !== '__meta');
    for (const partName of partNames) {
      const part = bundle.data[partName];
      if (!part || typeof part !== 'object') continue;

      const slotType = part.slotType || (part.options && part.options.slotType) || 'main';
      const slotsRaw = part.slots2 || part.slots;
      const slotsList = [];

      if (slotsRaw && typeof slotsRaw === 'object') {
        const slotRows = toJsArray(slotsRaw);
        if (slotRows.length > 0) {
          const header = toJsArray(slotRows[0]);

          for (let i = 1; i < slotRows.length; i++) {
            const rowArr = toJsArray(slotRows[i]);
            if (rowArr.length === 0) continue;

            const slotObj = {};
            for (let h = 0; h < header.length; h++) {
              slotObj[header[h]] = rowArr[h];
            }

            const rawSlotName = slotObj.name || slotObj.type;
            const slotName = safeStringVal(rawSlotName);
            if (slotName) {
              let allowTypes = toJsArray(slotObj.allowTypes || slotObj.type).map(t => safeStringVal(t)).filter(Boolean);
              if (allowTypes.length === 0 && typeof slotObj.type === 'string') {
                allowTypes = [slotObj.type];
              } else if (allowTypes.length === 0) {
                allowTypes = [slotName];
              }

              const denyTypes = toJsArray(slotObj.denyTypes).map(t => safeStringVal(t)).filter(Boolean);

              // Extract slot options (e.g. nodeOffset, nodeMove) from inline dictionary
              let slotOptions = null;
              for (const item of rowArr) {
                if (item && typeof item === 'object' && !Array.isArray(item)) {
                  if (item.nodeOffset || item.nodeMove || item.variables) {
                    slotOptions = item;
                    break;
                  }
                }
              }

              slotsList.push({
                name: slotName,
                allowTypes,
                denyTypes,
                default: safeStringVal(slotObj.default, ''),
                description: safeStringVal(slotObj.description, slotName),
                coreSlot: Boolean(slotObj.coreSlot),
                slotOptions
              });
            }
          }
        }
      }

      // Count nodes, beams, triangles in this part and collect node IDs
      let nodeCount = 0;
      let beamCount = 0;
      let triCount = 0;
      const nodeIds = [];

      if (part.nodes && (Array.isArray(part.nodes) || typeof part.nodes === 'object')) {
        const nRows = toJsArray(part.nodes);
        if (nRows.length > 0) {
          const header = toJsArray(nRows[0]);
          let idIdx = header.indexOf('id');
          if (idIdx === -1) idIdx = header.indexOf('name');
          if (idIdx === -1) idIdx = 0;

          for (let i = 1; i < nRows.length; i++) {
            const row = toJsArray(nRows[i]);
            if (row.length === 0) continue;
            if (typeof row[0] === 'object' && !Array.isArray(row[0])) continue;
            const nid = row[idIdx];
            if (typeof nid === 'string' && nid.length > 0) {
              nodeIds.push(nid);
            }
          }
        }
        nodeCount = nodeIds.length > 0 ? nodeIds.length : Object.keys(part.nodes).filter(k => k !== '__meta' && k !== '0').length;
      }
      if (part.beams && (Array.isArray(part.beams) || typeof part.beams === 'object')) {
        const bKeys = Object.keys(part.beams).filter(k => k !== '__meta' && k !== '0');
        beamCount = bKeys.length;
      }
      if (part.triangles && (Array.isArray(part.triangles) || typeof part.triangles === 'object')) {
        const tKeys = Object.keys(part.triangles).filter(k => k !== '__meta' && k !== '0');
        triCount = tKeys.length;
      }

      parts.push({
        partName,
        filePath,
        slotType: typeof slotType === 'string' ? slotType : 'main',
        slots: slotsList,
        nodeIds,
        nodeCount,
        beamCount,
        triCount,
        information: part.information || {}
      });
    }
  } catch (err) {
    console.warn(`[VehicleIndexer] Error parsing ${filePath}:`, err.message);
  }

  return parts;
}

/**
 * Parses a BeamNG .pc vehicle configuration file.
 *
 * @param {string} text - .pc JSON text
 * @param {string} filePath - Path or filename
 * @returns {Object|null} Configuration descriptor
 */
export function parseVehicleConfiguration(text, filePath) {
  if (!text || typeof text !== 'string') return null;
  try {
    const pc = JSON.parse(text);
    return {
      fileName: filePath.split(/[\\/]/).pop(),
      filePath,
      configurationName: pc.Configuration || filePath.split(/[\\/]/).pop().replace('.pc', ''),
      model: pc.model || '',
      mainPartName: pc.mainPartName || pc.model || '',
      parts: pc.parts || {},
      vars: pc.vars || {}
    };
  } catch (err) {
    console.warn(`[VehicleIndexer] Error parsing PC file ${filePath}:`, err.message);
    return null;
  }
}

/**
 * Indexes an entire collection of workspace files.
 *
 * @param {Array<{path: string, content: string}>} files - Array of path and text pairs
 * @returns {Object} Complete index of parts, slot types, configurations, and root parts
 */
export function buildWorkspaceIndex(files) {
  const partsMap = {};
  const slotTypeMap = {};
  const configurations = [];
  const rootParts = [];
  const nodeToPartMap = {}; // Maps nodeId -> defining partName

  for (const file of files) {
    if (file.path.endsWith('.jbeam')) {
      const extracted = extractPartsFromJBeamText(file.content, file.path);
      for (const p of extracted) {
        partsMap[p.partName] = p;

        if (p.nodeIds) {
          for (const nid of p.nodeIds) {
            if (!nodeToPartMap[nid]) {
              nodeToPartMap[nid] = p.partName;
            }
          }
        }

        if (!slotTypeMap[p.slotType]) slotTypeMap[p.slotType] = [];
        slotTypeMap[p.slotType].push(p);

        if (p.slotType === 'main') {
          rootParts.push(p);
        }
      }
    } else if (file.path.endsWith('.pc')) {
      const config = parseVehicleConfiguration(file.content, file.path);
      if (config) {
        configurations.push(config);
      }
    }
  }

  // Sort configurations alphabetically by name
  configurations.sort((a, b) => a.configurationName.localeCompare(b.configurationName));

  return {
    partsMap,
    slotTypeMap,
    configurations,
    rootParts,
    nodeToPartMap
  };
}

export default {
  extractPartsFromJBeamText,
  parseVehicleConfiguration,
  buildWorkspaceIndex
};
