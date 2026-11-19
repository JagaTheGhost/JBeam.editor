/*
  Adapted from BeamNG vscode-jbeam-editor
  Original work Copyright (c) BeamNG GmbH under MIT License.
  Decoupled from VS Code dependencies for standalone desktop & browser environments.
*/

import { extractPartVariables, resolvePartNodesAndBeams } from './variables.js';

let ignoreSections = { maxIDs: true, options: true, slotType: true };

const specialVals = {
  FLT_MAX: Infinity,
  MINUS_FLT_MAX: -Infinity
};

const typeIds = {
  NORMAL: 0,
  HYDRO: 6,
  ANISOTROPIC: 1,
  TIRESIDE: 1,
  BOUNDED: 2,
  PRESSURED: 3,
  SUPPORT: 7,
  LBEAM: 4,
  FIXED: 1,
  NONCOLLIDABLE: 2,
  SIGNAL_LEFT: 1,
  SIGNAL_RIGHT: 2,
  HEADLIGHT: 4,
  BRAKELIGHT: 8,
  RUNNINGLIGHT: 16,
  REVERSELIGHT: 32
};

function deepCloneAndRemoveKeys(obj, keysToRemove) {
  if (typeof obj !== 'object' || obj === null) return obj;
  let clone = Array.isArray(obj) ? [] : {};
  Object.keys(obj).forEach(key => {
    if (keysToRemove.includes(key)) return;
    clone[key] = deepCloneAndRemoveKeys(obj[key], keysToRemove);
  });
  return clone;
}

function getStringList(val) {
  if (typeof val === 'string') return val === '' ? [] : [val];
  if (!val || typeof val !== 'object') return [];
  return Object.keys(val)
    .filter(key => key !== '__meta')
    .map(key => val[key])
    .filter(entry => typeof entry === 'string');
}

function replaceSpecialValues(val) {
  return val;
}

function processTableWithSchemaDestructive(jbeamTable, inputOptions, diagnostics) {
  let header = jbeamTable[0];
  if (typeof header === "undefined") {
    return 0;
  }
  if (typeof header !== "object") {
    diagnostics.push(['error', 'Invalid table header', header?.__meta?.range]);
    return -1;
  }

  if (header.__meta && header.__meta.type !== 'array') {
    diagnostics.push(['error', 'Invalid table header. Must be a list, not a dict', header.__meta.range]);
    return -1;
  }

  let headerSize = Object.keys(header).filter(key => key !== '__meta').length;
  let headerSize1 = headerSize;
  let newListSize = 0;
  let newList = {};
  let localOptions = replaceSpecialValues(Object.assign({}, inputOptions)) || {};

  delete jbeamTable[0];

  let newRowId = 0;
  let keys = Object.keys(jbeamTable).filter(key => key !== '__meta');
  for (const rowKey of keys) {
    let rowValue = jbeamTable[rowKey];
    if (typeof rowValue !== "object") {
      diagnostics.push(['error', 'Invalid table row', rowValue?.__meta?.range]);
      return -1;
    }
    if (rowValue.__meta && rowValue.__meta.type !== 'array') {
      Object.assign(localOptions, replaceSpecialValues(rowValue));
      delete localOptions['__meta'];
    } else {
      let newID = newRowId++;

      const rowSize = Object.keys(rowValue).filter(key => key !== '__meta').length;
      if (rowSize === headerSize + 1) {
        if (typeof rowValue[headerSize] !== 'object') {
          diagnostics.push(['error', `Inline option (argument ${headerSize + 1}) need to be a dict, not a ${typeof rowValue[headerSize]}: ${rowValue[headerSize]}`, rowValue.__meta?.range]);
        }
      } else if (rowSize > headerSize + 1) {
        let headerNoMeta = deepCloneAndRemoveKeys(header, ['__meta']);
        let rowValueNoMeta = deepCloneAndRemoveKeys(rowValue, ['__meta']);
        let msg = `Invalid table header, must be as long as all table cells (plus one additional options column):\nTable header: ${JSON.stringify(headerNoMeta)}\nMismatched row: ${JSON.stringify(rowValueNoMeta)}`;
        diagnostics.push(['error', msg, rowValue.__meta?.range]);
        return -1;
      } else if (rowSize < headerSize) {
        for (let i = 0; i < headerSize; i++) {
          if (i < rowSize) continue;
          if (header[i] === 'nonFlexMaterials') continue;
          diagnostics.push(['warning', `Row is missing argument ${i + 1}: ${header[i]}`, rowValue.__meta?.range]);
        }
      }

      let newRow = Object.assign({}, localOptions);
      delete newRow['__meta'];

      const allKeys = Object.keys(rowValue).filter(key => key !== '__meta');
      const relevantKeys = allKeys.slice(headerSize1);

      for (const key of relevantKeys) {
        let value = rowValue[key];
        if (typeof value === 'object' && value.__meta?.type === 'object' && allKeys.length > headerSize1) {
          Object.assign(newRow, replaceSpecialValues(value));
          delete rowValue[key];
          header[key] = "options";
        }
      }

      const allKeys2 = Object.keys(rowValue).filter(key => key !== '__meta');
      for (let rk in allKeys2) {
        if (header[rk] === null) {
          let headerNoMeta = deepCloneAndRemoveKeys(header, ['__meta']);
          let rowValueNoMeta = deepCloneAndRemoveKeys(rowValue, ['__meta']);
          let msg = `Unable to parse row, header for entry is missing: Header ${JSON.stringify(headerNoMeta)} Row ${JSON.stringify(rowValueNoMeta)}`;
          diagnostics.push(['error', msg, rowValue.__meta?.range]);
        } else {
          newRow[header[rk]] = replaceSpecialValues(rowValue[rk]);
        }
      }

      if (rowValue.hasOwnProperty('__meta')) {
        newRow.__meta = rowValue.__meta;
        if (newRow.__meta && newRow.__meta.obj) {
          newRow.__meta.objStructured = newRow;
        }
      }

      if (newRow.disable === true || (newRow.variables && newRow.variables.disable === true)) continue;

      if (newRow.hasOwnProperty('id') && newRow.id !== null) {
        newID = newRow.id;
        newRow.name = newRow.id;
        if (newRow.__meta) newRow.__meta.isNamed = true;
        if (newList.hasOwnProperty(newID)) {
          diagnostics.push(['warning', `Duplicate node ID "${newID}"`, newRow.__meta?.range]);
        }
      }

      newList[newID] = newRow;
      newListSize++;
    }
  }
  newList.__meta = jbeamTable.__meta;
  return newList;
}

const slotHeaders = {
  slots: ['type', 'default', 'description'],
  slots2: ['name', 'allowTypes', 'denyTypes', 'default', 'description'],
};

function sectionHasEntries(section) {
  return section && typeof section === 'object' && Object.keys(section).some(key => key !== '__meta');
}

function slotHeaderHint(sectionName) {
  return `["${slotHeaders[sectionName].join('", "')}"]`;
}

function checkSlotHeaders(part, diagnostics) {
  for (const sectionName in slotHeaders) {
    const section = part[sectionName];
    if (!sectionHasEntries(section) || section.__meta?.type !== 'array') continue;
    const header = section[0];
    if (header && typeof header === 'object' && header[0] === slotHeaders[sectionName][0]) continue;
    diagnostics.push([
      sectionName === 'slots' ? 'warning' : 'error',
      `The "${sectionName}" section is missing its table header. It must be ${slotHeaderHint(sectionName)}`,
      (header?.__meta ?? section.__meta)?.range
    ]);
  }
}

function checkSlots(part, diagnostics) {
  const hasSlots = sectionHasEntries(part.slots);
  const hasSlots2 = sectionHasEntries(part.slots2);
  if (hasSlots && hasSlots2) {
    diagnostics.push(['warning', 'Part has "slots" and "slots2". The game only uses "slots2" and drops "slots"', part.slots.__meta?.range]);
  }

  const sectionName = hasSlots2 ? 'slots2' : (hasSlots ? 'slots' : null);
  if (!sectionName) return;

  const nameKey = sectionName === 'slots2' ? 'name' : 'type';
  const seenNames = {};

  for (const rowKey in part[sectionName]) {
    if (rowKey === '__meta') continue;
    const slot = part[sectionName][rowKey];
    if (!slot || typeof slot !== 'object') continue;
    const range = slot.__meta?.range;

    const slotName = slot[nameKey];
    if (typeof slotName !== 'string' || slotName === '') {
      diagnostics.push(['error', `Slot is missing "${nameKey}". The section header must be ${slotHeaderHint(sectionName)}`, range]);
      continue;
    }
    const slotId = (typeof slot.name === 'string' && slot.name !== '') ? slot.name : slotName;
    if (seenNames[slotId]) {
      diagnostics.push(['warning', `Slot "${slotId}" exists more than once in this part`, range]);
    }
    seenNames[slotId] = true;

    if (sectionName !== 'slots2') continue;

    for (const key of ['allowTypes', 'denyTypes']) {
      if (slot[key] === undefined) continue;
      if (typeof slot[key] !== 'object' || slot[key].__meta?.type !== 'array') {
        diagnostics.push(['error', `Slot "${key}" must be a list of slot types, for example ["${slotName}"]`, range]);
      }
    }
    if (getStringList(slot.allowTypes).length === 0) {
      diagnostics.push(['warning', `Slot "${slotName}" has no "allowTypes", so no part fits into it`, range]);
    }
  }
}

function processPart(partName, part, diagnostics) {
  if (!part || typeof part !== 'object') {
    return false;
  }

  part.maxIDs = {};
  part.validTables = {};
  part.beams = part.beams || {};
  checkSlotHeaders(part, diagnostics);

  part.options = part.options || {};
  for (let keyEntry in part) {
    if (!part.hasOwnProperty(keyEntry)) continue;
    let entry = part[keyEntry];
    if (typeof entry !== "object") {
      part.options[keyEntry] = entry;
      delete part[keyEntry];
    }
  }

  let sectionNames = Object.keys(part).filter(key => key !== '__meta');
  for (let sectionName of sectionNames) {
    if (!part.hasOwnProperty(sectionName)) continue;
    let section = part[sectionName];

    if (!/^[a-zA-Z_]+[a-zA-Z0-9_]*$/.test(sectionName)) {
      diagnostics.push(['error', `Invalid attribute name '${sectionName}'`, section.__meta?.range]);
      return false;
    }

    part.maxIDs[sectionName] = 0;

    if (typeof section === "object" && !ignoreSections[sectionName] && Object.keys(section).length > 0) {
      if (section.__meta && section.__meta.type === 'array') {
        if (!part.validTables[sectionName]) {
          let newList = processTableWithSchemaDestructive(section, part.options, diagnostics);
          if (newList !== undefined) {
            part.validTables[sectionName] = true;
          }
          part[sectionName] = newList;
        }
      }
    }
  }

  // Extract declared part variables and resolve inline Lua expressions
  const declaredVars = extractPartVariables(part);
  part.variablesMap = declaredVars;
  const flatVars = {};
  for (const [k, v] of Object.entries(declaredVars)) {
    flatVars[k] = v.val !== undefined ? v.val : v.default;
  }
  resolvePartNodesAndBeams(part, flatVars);

  // Process nodes positions (handling posX/posY/posZ, rx/ry/rz, and x/y/z)
  if (part.hasOwnProperty('nodes') && part.nodes) {
    let nodeNames = Object.keys(part.nodes).filter(k => k !== '__meta');
    for (let nodeId of nodeNames) {
      let node = part.nodes[nodeId];
      if (node && typeof node === 'object') {
        const x = node.posX !== undefined ? node.posX : (node.rx !== undefined ? node.rx : (node.x !== undefined ? node.x : (node.pos ? node.pos[0] : 0)));
        const y = node.posY !== undefined ? node.posY : (node.ry !== undefined ? node.ry : (node.y !== undefined ? node.y : (node.pos ? node.pos[1] : 0)));
        const z = node.posZ !== undefined ? node.posZ : (node.rz !== undefined ? node.rz : (node.z !== undefined ? node.z : (node.pos ? node.pos[2] : 0)));

        const toNumOrOriginal = (v) => {
          if (typeof v === 'number') return v;
          const n = Number(v);
          return isNaN(n) ? v : n;
        };

        // Standardize properties on the node object so all modules find them consistently
        if (node.posX === undefined) node.posX = toNumOrOriginal(x);
        if (node.posY === undefined) node.posY = toNumOrOriginal(y);
        if (node.posZ === undefined) node.posZ = toNumOrOriginal(z);

        try {
          node.pos = [Number(node.posX), Number(node.posY), Number(node.posZ)];
        } catch (e) {
          diagnostics.push(['error', e.message, node.__meta?.range]);
        }
      }
    }
  }

// Helper to check whether two beams between the same node pair are physically identical duplicates.
// In BeamNG physics, parallel beams connecting the same two nodes are officially used for:
// 1. Multi-stage progressive bumpstops (soft initial + hard bottom-out springs)
// 2. Dual-rate / helper springs
// 3. Staged damping velocity splits (low-speed vs high-speed)
// 4. Staged breakgroups (sacrificial latch + secondary safety link)
function areBeamsPhysicallyIdentical(b1, b2) {
  if (!b1 || !b2) return false;
  const t1 = b1.beamType || '|NORMAL';
  const t2 = b2.beamType || '|NORMAL';
  if (t1 !== t2) return false;
  if ((b1.name || b2.name) && b1.name !== b2.name) return false;
  if ((b1.breakGroup || b2.breakGroup) && b1.breakGroup !== b2.breakGroup) return false;

  const physicalProps = [
    'beamSpring', 'beamDamp', 'beamLimitSpring', 'beamLimitDamp', 'beamLimitDampRebound',
    'beamDampVelocitySplit', 'beamDampFast', 'beamDampRebound', 'beamDampReboundFast',
    'shortBoundRange', 'longBoundRange', 'boundZone', 'beamDeform', 'beamStrength',
    'dampCutoffHz', 'beamPrecompression', 'beamLongBound', 'beamShortBound'
  ];

  for (const prop of physicalProps) {
    const v1 = b1[prop];
    const v2 = b2[prop];
    if (v1 !== undefined && v2 !== undefined && v1 !== v2) {
      const n1 = typeof v1 === 'number' ? v1 : parseFloat(v1);
      const n2 = typeof v2 === 'number' ? v2 : parseFloat(v2);
      if (!isNaN(n1) && !isNaN(n2)) {
        if (Math.abs(n1 - n2) > 1e-5) return false;
      } else {
        return false;
      }
    } else if ((v1 !== undefined && v1 !== '') !== (v2 !== undefined && v2 !== '')) {
      return false;
    }
  }
  return true;
}

  // Check duplicate beams
  if (part?.beams) {
    const seenBeams = {};
    for (const beamKey in part.beams) {
      if (beamKey !== '__meta') {
        const beam = part.beams[beamKey];
        if (beam && beam['id1:'] && beam['id2:']) {
          const [sortedId1, sortedId2] = [beam['id1:'], beam['id2:']].sort();
          const pairKey = `${sortedId1}_${sortedId2}`;

          if (!seenBeams[pairKey]) {
            seenBeams[pairKey] = [beam];
          } else {
            // Only flag if physical parameters are completely identical (true redundant duplicate)
            const isDuplicate = seenBeams[pairKey].some(prevBeam => areBeamsPhysicallyIdentical(prevBeam, beam));
            if (isDuplicate) {
              diagnostics.push(['warning', `Duplicate beam: ${sortedId1}, ${sortedId2}`, beam.__meta?.range]);
            } else {
              seenBeams[pairKey].push(beam);
            }
          }
        }
      }
    }
  }

  // Check degenerate triangles
  if (part?.triangles) {
    for (const triangleName in part.triangles) {
      if (triangleName !== '__meta') {
        const triangle = part.triangles[triangleName];
        if (typeof triangle === 'object' && triangle['id1:'] && triangle['id2:'] && triangle['id3:']) {
          const id1 = triangle['id1:'];
          const id2 = triangle['id2:'];
          const id3 = triangle['id3:'];
          if (id1 === id2 || id2 === id3 || id1 === id3) {
            diagnostics.push(['error', `Degenerate triangle: ${id1}, ${id2}, ${id3}`, triangle.__meta?.range]);
          }
        }
      }
    }
  }

  // Check degenerate quads
  if (part?.quads) {
    for (const quadName in part.quads) {
      if (quadName !== '__meta') {
        const quad = part.quads[quadName];
        if (typeof quad === 'object' && quad['id1:'] && quad['id2:'] && quad['id3:'] && quad['id4:']) {
          const id1 = quad['id1:'];
          const id2 = quad['id2:'];
          const id3 = quad['id3:'];
          const id4 = quad['id4:'];
          const uniqueNodes = new Set([id1, id2, id3, id4]);
          if (uniqueNodes.size < 4) {
            diagnostics.push(['error', `Degenerate quad with duplicate nodes: ${id1}, ${id2}, ${id3}, ${id4}`, quad.__meta?.range]);
          }
        }
      }
    }
  }

  checkSlots(part, diagnostics);
  return true;
}

function processAllParts(parsedData) {
  let tableInterpretedData = {};
  let diagnostics = [];

  if (!parsedData || typeof parsedData !== 'object') {
    diagnostics.push(['error', 'Unable to process parts', parsedData?.__meta?.range]);
  } else {
    const keys = Object.keys(parsedData).filter(key => key !== '__meta');
    for (let partName of keys) {
      if (!parsedData.hasOwnProperty(partName)) continue;
      let part = parsedData[partName];
      if (processPart(partName, part, diagnostics) !== true) {
        diagnostics.push(['error', `Unable to process part '${partName}'`, part?.__meta?.range]);
      }
      tableInterpretedData[partName] = part;
    }
    tableInterpretedData.__meta = parsedData.__meta;
  }
  return [tableInterpretedData, diagnostics];
}

export {
  processAllParts,
  processPart,
  deepCloneAndRemoveKeys,
  getStringList,
  typeIds,
  specialVals
};

export default {
  processAllParts,
  processPart,
  deepCloneAndRemoveKeys,
  getStringList,
  typeIds,
  specialVals
};
