/*
  PressureWheels & HubWheels Parser & Physics Skeleton Generator for JBeam Studio
  Decodes BeamNG pressureWheels and legacy hubWheels tables, resolves multi-part
  property inheritance (spindle + wheel + tire), and generates soft-body 3D node-beam
  skeletons and pressure collision surfaces.
*/

import { extractNodeCoords } from '../viewport/visualizers.js';
import { evaluateJBeamValue, isLuaTruthy } from './expressionParser.js';
import { extractPartVariables } from './variables.js';

// Vector Math Helpers (in BeamNG coordinate space: X lateral, Y longitudinal, Z vertical)
function vSub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vAdd(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vScale(v, s) {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function vLen(v) {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function vNorm(v) {
  const l = vLen(v);
  return l > 1e-6 ? [v[0] / l, v[1] / l, v[2] / l] : [1, 0, 0];
}

function vCross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

/**
 * Extracts all pressureWheels and hubWheels definitions from a single part or parts dictionary.
 * Merges multi-part property cascades (e.g. suspension wheeldata + wheel rim + tire part),
 * supports optional external/cross-tab context parts, and synthesizes wheel entries for
 * standalone wheel/tire files opened outside a full vehicle assembly folder.
 *
 * @param {Object} partsDictOrPart - Single JBeam part object or map of partName -> partData
 * @param {Object|null} [extraContextParts] - Optional background tabs / assembly parts providing wheel/tire options
 * @returns {Array<Object>} List of normalized wheel definitions
 */
export function extractPressureWheels(partsDictOrPart, extraContextParts = null) {
  if (!partsDictOrPart || typeof partsDictOrPart !== 'object') return [];

  const toPartsList = (input) => {
    const list = [];
    if (!input || typeof input !== 'object') return list;
    if (input.pressureWheels || input.hubWheels) {
      const pName = input.__partName || Object.keys(input.information || {})[0] || 'active_part';
      list.push([pName, input]);
    } else {
      for (const pKey of Object.keys(input)) {
        if (pKey === '__meta') continue;
        const part = input[pKey];
        if (part && typeof part === 'object') {
          list.push([pKey, part]);
        }
      }
    }
    return list;
  };

  const partsList = toPartsList(partsDictOrPart);
  const contextPartsList = extraContextParts ? toPartsList(extraContextParts) : [];

  // Build shared evaluation environment ($variables & $components) across context + active parts
  const evalVars = { $components: {} };
  for (const [, p] of [...contextPartsList, ...partsList]) {
    const pVars = extractPartVariables(p);
    for (const [vk, vv] of Object.entries(pVars)) {
      evalVars[vk] = vv.default;
    }
    if (p.components && typeof p.components === 'object') {
      for (const [ck, cv] of Object.entries(p.components)) {
        if (ck !== '__meta') evalVars.$components[ck] = cv;
      }
    }
  }

  const resolveWheelVal = (val) => {
    if (val === undefined || val === null || val === '') return val;
    if (typeof val === 'string' && val.trim().startsWith('$')) {
      return evaluateJBeamValue(val, evalVars);
    }
    return val;
  };

  // Helper: inspect a pressureWheels / hubWheels section sequentially, tracking rowState & disable
  const parseWheelSection = (section) => {
    let header = null;
    const rowsToProcess = [];
    let rowState = {};

    const applyStateObj = (obj) => {
      for (const [k, v] of Object.entries(obj)) {
        if (k === '__meta') continue;
        if (v === '') {
          delete rowState[k];
        } else {
          rowState[k] = v;
        }
      }
    };

    if (Array.isArray(section)) {
      for (const item of section) {
        if (!item) continue;
        if (Array.isArray(item)) {
          const isHeader = item.some(cell => typeof cell === 'string' && (cell.startsWith('node1') || cell === 'name' || cell === 'hubGroup'));
          if (isHeader) {
            header = item;
          } else if (header) {
            const disabled = rowState.disable !== undefined && isLuaTruthy(resolveWheelVal(rowState.disable));
            if (disabled) continue;

            const rowObj = { __rowState: { ...rowState } };
            for (let i = 0; i < header.length; i++) {
              if (item[i] !== undefined) {
                rowObj[header[i]] = item[i];
              }
            }
            if (item.length > header.length && typeof item[item.length - 1] === 'object' && !Array.isArray(item[item.length - 1])) {
              Object.assign(rowObj, item[item.length - 1]);
            }
            rowsToProcess.push(rowObj);
          }
        } else if (typeof item === 'object') {
          applyStateObj(item);
          rowsToProcess.push(item);
        }
      }
    } else if (typeof section === 'object') {
      const keys = Object.keys(section).filter(k => k !== '__meta');
      for (const k of keys) {
        const item = section[k];
        if (item && typeof item === 'object') {
          rowsToProcess.push(item);
        }
      }
    }
    return rowsToProcess;
  };

  const isWheelOptionKey = (item) => (
    item.radius !== undefined ||
    item.hubRadius !== undefined ||
    item.tireWidth !== undefined ||
    item.hubWidth !== undefined ||
    item.numRays !== undefined ||
    item.pressurePSI !== undefined ||
    item.hasTire !== undefined ||
    item.wheelOffset !== undefined ||
    item.brakeDiameter !== undefined ||
    item.brakeTorque !== undefined ||
    item.parkingTorque !== undefined ||
    item.nodeWeight !== undefined ||
    item.hubNodeWeight !== undefined ||
    item.frictionCoef !== undefined ||
    item.slidingFrictionCoef !== undefined ||
    item.treadCoef !== undefined ||
    item.softnessCoef !== undefined
  );

  const detectAxleHint = (name) => {
    const s = String(name || '').toLowerCase();
    if (/pusher/i.test(s)) return 'pusher';
    if (/(^|_)tag($|_)/i.test(s)) return 'tag';
    if (/(_f_2\b|f2\b|^2sw|fr_2|fl_2)/i.test(s)) return 'front_2';
    if (/(_r_1\b|r1\b|dw1|r1rr|r1ll|r1r|r1l)/i.test(s)) return 'rear_1';
    if (/(_r_2\b|r2\b|dw2|r2rr|r2ll|r2r|r2l)/i.test(s)) return 'rear_2';
    if (/(^|_)f($|_|\d)|front|_fl\b|_fr\b|^f[lrwh]|^sw1/i.test(s)) return 'front';
    if (/(^|_)r($|_|\d)|rear|_rl\b|_rr\b|^r[lrwh]|^dw\d/i.test(s)) return 'rear';
    return 'global';
  };

  const extractPartGroupHints = (part) => {
    const groups = new Set();
    if (Array.isArray(part.flexbodies)) {
      for (const fb of part.flexbodies) {
        if (!Array.isArray(fb)) continue;
        const gCol = fb[1];
        if (Array.isArray(gCol)) {
          for (const g of gCol) {
            if (typeof g === 'string' && g.trim()) groups.add(g.trim());
          }
        } else if (typeof gCol === 'string' && gCol.trim()) {
          groups.add(gCol.trim());
        }
      }
    }
    if (part.nodes && typeof part.nodes === 'object') {
      for (const n of Object.values(part.nodes)) {
        if (!n || typeof n !== 'object') continue;
        if (typeof n.group === 'string' && n.group.trim()) groups.add(n.group.trim());
        else if (Array.isArray(n.group)) {
          for (const g of n.group) {
            if (typeof g === 'string' && g.trim()) groups.add(g.trim());
          }
        }
      }
    }
    return [...groups];
  };

  // 1. Collect wheel and tire option settings scoped by group, axle, & part
  const sharedWheelProps = { global: {}, front: {}, rear: {}, front_2: {}, rear_1: {}, rear_2: {}, pusher: {}, tag: {} };
  const slotWheelOffsets = {}; // axleKey -> { x, y, z } from slots/slots2 nodeOffset
  const groupWheelProps = new Map();
  const partWheelProps = new Map();
  const wheelRows = [];

  const absorbSlotOffsets = (partName, part) => {
    const slotTables = [part.slots, part.slots2].filter(t => t && typeof t === 'object');
    for (const tbl of slotTables) {
      const entries = Array.isArray(tbl)
        ? tbl.map(row => (Array.isArray(row) && row.length >= 2 && typeof row[row.length - 1] === 'object' && !Array.isArray(row[row.length - 1])
            ? { slotId: String(row[0] || ''), slotDesc: typeof row[4] === 'string' ? row[4] : '', meta: row[row.length - 1] }
            : null))
        : Object.entries(tbl)
            .filter(([k, v]) => k !== '__meta' && v && typeof v === 'object')
            .map(([k, v]) => ({ slotId: String(v.name || v.type || k), slotDesc: typeof v.description === 'string' ? v.description : '', meta: v }));

      for (const entry of entries) {
        if (!entry || !entry.meta) continue;
        const noff = entry.meta.nodeOffset || entry.meta.nodeMove;
        if (!noff || typeof noff !== 'object') continue;
        if (!/wheel/i.test(entry.slotId) && !/wheel/i.test(entry.slotDesc)) continue;

        const axleKey = detectAxleHint(`${entry.slotId}_${partName}`);
        const ox = Number(resolveWheelVal(noff.x));
        const oy = Number(resolveWheelVal(noff.y));
        const oz = Number(resolveWheelVal(noff.z));
        if (Number.isFinite(oy) && Number.isFinite(oz)) {
          slotWheelOffsets[axleKey] = {
            x: Number.isFinite(ox) ? ox : 0,
            y: oy,
            z: oz
          };
        }
      }
    }
  };

  const mergeOptionMap = (target, cleanOpt, isBareHubPart) => {
    for (const [ok, ov] of Object.entries(cleanOpt)) {
      if (ov === '' || ov === undefined) continue;
      if (ov === false && ok !== 'hasTire') continue;
      // Do not let a bare hub part's `hasTire: false` override an active tire's `hasTire: true`
      if (isBareHubPart && ok === 'hasTire' && ov === false && target.hasTire === true) continue;
      if (isBareHubPart && (ok === 'hubRadius' || ok === 'hubWidth') && target[ok] !== undefined) continue;
      target[ok] = ov;
    }
  };

  const absorbOptionsFromPart = (partName, part, collectRows) => {
    const wheelSections = [part.pressureWheels, part.hubWheels].filter(Boolean);
    const axle = detectAxleHint(partName);
    const pProps = partWheelProps.get(partName) || {};
    const groupHints = extractPartGroupHints(part);
    const isBareHubPart = /hub/i.test(partName) && !/wheel|tire/i.test(partName);

    for (const section of wheelSections) {
      if (!section || typeof section !== 'object') continue;
      const rowsToProcess = parseWheelSection(section);

      for (const item of rowsToProcess) {
        const hasNodeFields = item.hasOwnProperty('node1:') || item.hasOwnProperty('node1') || item.hasOwnProperty('node2:') || item.hasOwnProperty('node2');
        if (!hasNodeFields && isWheelOptionKey(item)) {
          const cleanOpt = { ...item };
          delete cleanOpt.__meta;
          delete cleanOpt.__rowState;

          mergeOptionMap(pProps, cleanOpt, isBareHubPart);
          if (!sharedWheelProps[axle]) sharedWheelProps[axle] = {};
          mergeOptionMap(sharedWheelProps[axle], cleanOpt, isBareHubPart);
          if (axle === 'global') {
            mergeOptionMap(sharedWheelProps.global, cleanOpt, isBareHubPart);
          }
          for (const grp of groupHints) {
            if (!groupWheelProps.has(grp)) groupWheelProps.set(grp, {});
            mergeOptionMap(groupWheelProps.get(grp), cleanOpt, isBareHubPart);
          }
          continue;
        }

        if (collectRows && (hasNodeFields || item.name || item.wheelDir !== undefined)) {
          wheelRows.push({
            partName,
            row: item,
            range: item.__meta?.range || [0, 0, 0, 0]
          });
        }
      }
    }
    partWheelProps.set(partName, pProps);
  };

  // Absorb background/context parts first so active parts override them cleanly
  for (const [ctxPartName, ctxPart] of contextPartsList) {
    absorbSlotOffsets(ctxPartName, ctxPart);
    absorbOptionsFromPart(ctxPartName, ctxPart, false);
  }
  for (const [partName, part] of partsList) {
    absorbSlotOffsets(partName, part);
    absorbOptionsFromPart(partName, part, true);
  }

  // Fallback for standalone wheel / tire files (e.g. from common/wheels or standalone .jbeam without spindle table row):
  // Synthesize wheel entries from declared spindle/hub nodes when wheel options exist
  if (wheelRows.length === 0) {
    for (const [partName, part] of partsList) {
      const hasOpts = Object.keys(partWheelProps.get(partName) || {}).length > 0;
      if (!hasOpts && !part.pressureWheels && !part.hubWheels) continue;

      const pNodes = part.nodes || {};
      const findMatchingPair = (idA, idB) => (pNodes[idA] || pNodes[idB]) ? [pNodes[idA] ? idA : idB, pNodes[idB] ? idB : idA] : null;
      const candidates = [
        { name: 'FR', dir: 1, pair: findMatchingPair('fw1rr', 'fw1r') || findMatchingPair('fh1r', 'fh5r') },
        { name: 'FL', dir: -1, pair: findMatchingPair('fw1ll', 'fw1l') || findMatchingPair('fh1l', 'fh5l') },
        { name: 'RR', dir: 1, pair: findMatchingPair('rw1rr', 'rw1r') || findMatchingPair('rh1r', 'rh6r') },
        { name: 'RL', dir: -1, pair: findMatchingPair('rw1ll', 'rw1l') || findMatchingPair('rh1l', 'rh6l') }
      ];
      let addedAny = false;
      for (const c of candidates) {
        if (c.pair) {
          wheelRows.push({
            partName,
            row: {
              name: c.name,
              'node1:': c.pair[0],
              'node2:': c.pair[1],
              wheelDir: c.dir
            },
            range: [0, 0, 0, 0]
          });
          addedAny = true;
        }
      }
      if (!addedAny && hasOpts) {
        const axle = detectAxleHint(partName);
        const defName = axle === 'rear' ? 'RR' : 'FR';
        wheelRows.push({
          partName,
          row: { name: defName, wheelDir: 1 },
          range: [0, 0, 0, 0]
        });
      }
    }
  }

  // 2. Normalize and merge wheel definitions
  const normalizedWheels = [];
  const seenWheelKeys = new Set();

  for (let idx = 0; idx < wheelRows.length; idx++) {
    const { partName, row, range } = wheelRows[idx];

    const wheelName = String(row.name || `wheel_${idx + 1}`).trim();
    const node1 = String(row['node1:'] || row.node1 || '').trim();
    const node2 = String(row['node2:'] || row.node2 || '').trim();

    // Avoid duplicate entries with identical name and spindle nodes across parts
    const dedupeKey = `${wheelName}_${node1}_${node2}`;
    if (seenWheelKeys.has(dedupeKey)) continue;
    seenWheelKeys.add(dedupeKey);

    const rowAxle = detectAxleHint(`${wheelName}_${partName}_${node1}`);
    const broadAxle = rowAxle.startsWith('front') ? 'front' : rowAxle.startsWith('rear') ? 'rear' : 'global';
    const broadAxleProps = broadAxle !== 'global' ? (sharedWheelProps[broadAxle] || {}) : {};
    const axleProps = rowAxle !== 'global' ? (sharedWheelProps[rowAxle] || {}) : {};
    const pProps = partWheelProps.get(partName) || {};
    const hubGroupKey = row.hubGroup || `wheel_${wheelName}`;
    const tireGroupKey = row.group || `tire_${wheelName}`;
    const hubGroupProps = groupWheelProps.get(hubGroupKey) || {};
    const tireGroupProps = groupWheelProps.get(tireGroupKey) || {};
    const rowStateProps = row.__rowState || {};

    // Merge global -> broad axle -> specific axle -> part -> exact hub/tire group -> sequential rowState -> explicit row
    const merged = {
      ...sharedWheelProps.global,
      ...broadAxleProps,
      ...axleProps,
      ...pProps,
      ...hubGroupProps,
      ...tireGroupProps,
      ...rowStateProps,
      ...row
    };
    delete merged.__rowState;

    // Numerical dimensions with expression evaluation & official BeamNG vehicle fallbacks
    const numVal = (v, fallback) => {
      const resolved = resolveWheelVal(v);
      const n = Number(resolved);
      return Number.isFinite(n) && n !== 0 ? n : (resolved === 0 ? 0 : fallback);
    };

    const radius = numVal(merged.radius, 0.33);
    const hubRadius = numVal(merged.hubRadius, radius * 0.65);
    const tireWidth = numVal(merged.tireWidth, 0.22);
    const hubWidth = numVal(merged.hubWidth, tireWidth * 0.95);
    const wheelOffset = (() => {
      const resolved = resolveWheelVal(merged.wheelOffset);
      const n = Number(resolved);
      return Number.isFinite(n) ? n : 0.0;
    })();
    let numRays = Math.round(numVal(merged.numRays, 16));
    if (numRays % 2 !== 0) numRays += 1; // Must be even
    numRays = Math.max(8, Math.min(64, numRays));

    // Direction and side: wheelDir 1 is typically right, -1 is left
    let wheelDir = Number(resolveWheelVal(merged.wheelDir));
    if (isNaN(wheelDir) || wheelDir === 0) {
      wheelDir = /l$/i.test(wheelName) ? -1 : 1;
    }
    const side = wheelDir === -1 || /l$/i.test(wheelName) ? 'left' : 'right';

    // Parse inflation pressure
    let pressurePSI = 30;
    const resolvedPsi = resolveWheelVal(merged.pressurePSI);
    if (typeof resolvedPsi === 'number' && Number.isFinite(resolvedPsi)) {
      pressurePSI = resolvedPsi;
    } else if (typeof resolvedPsi === 'string') {
      const parsedPsi = parseFloat(resolvedPsi.replace(/[^0-9.]/g, ''));
      if (!isNaN(parsedPsi)) pressurePSI = parsedPsi;
    }

    normalizedWheels.push({
      id: `${partName}_${wheelName}_${idx}`,
      name: wheelName,
      partName,
      hubGroup: merged.hubGroup || `wheel_${wheelName}`,
      group: merged.group || `tire_${wheelName}`,
      node1,
      node2,
      nodeS: merged.nodeS || 9999,
      nodeArm: merged['nodeArm:'] || merged.nodeArm || null,
      wheelDir,
      side,
      radius,
      hubRadius,
      tireWidth,
      hubWidth,
      wheelOffset,
      numRays,
      hasTire: merged.hasTire !== false,
      pressurePSI,
      brakeTorque: Number(merged.brakeTorque) || 0,
      parkingTorque: Number(merged.parkingTorque) || 0,
      brakeDiameter: Number(merged.brakeDiameter) || 0,
      nodeWeight: Number(merged.nodeWeight) || 1.0,
      hubNodeWeight: Number(merged.hubNodeWeight) || 2.0,
      frictionCoef: Number(merged.frictionCoef) || 1.0,
      slidingFrictionCoef: Number(merged.slidingFrictionCoef) || 1.0,
      treadCoef: Number(merged.treadCoef) || 0.5,
      softnessCoef: Number(merged.softnessCoef) || 0.5,
      slotNodeOffset: slotWheelOffsets[rowAxle] || slotWheelOffsets[broadAxle] || null,
      range
    });
  }

  return normalizedWheels;
}

/**
 * Generates the full soft-body physical skeleton (nodes, beams, and surface faces)
 * for a pressure wheel given the vehicle's active nodes dictionary.
 *
 * @param {Object} wheelDef - Normalized wheel definition from extractPressureWheels
 * @param {Object} nodesDict - Active parts merged nodes dictionary
 * @returns {Object} Generated skeleton containing nodes, beams, surfaces, and geometry stats
 */
export function generateWheelSkeleton(wheelDef, nodesDict = {}) {
  const {
    name,
    node1: n1Id,
    node2: n2Id,
    wheelDir = 1,
    side = 'right',
    radius = 0.33,
    hubRadius = 0.21,
    tireWidth = 0.22,
    hubWidth = 0.20,
    wheelOffset = 0,
    numRays = 16,
    hasTire = true,
    pressurePSI = 30
  } = wheelDef;

  // 1. Locate spindle nodes in nodesDict (handling raw ID, scoped ID, and alias matching)
  function findNode(id) {
    if (!id || typeof nodesDict !== 'object') return null;
    if (nodesDict[id]) return nodesDict[id];
    // Check scoped key e.g. "partName_id"
    for (const k of Object.keys(nodesDict)) {
      if (k === id || k.endsWith(`_${id}`)) {
        return nodesDict[k];
      }
    }
    return null;
  }

  const node1Obj = findNode(n1Id);
  const node2Obj = findNode(n2Id);
  const hasSpindleNodes = Boolean(node1Obj && node2Obj);
  const isFront = /f/i.test(name) || /^f/i.test(n1Id || '') || /^f/i.test(n2Id || '') || /^f/i.test(wheelDef.nodeArm || '');

  // Helper: find nearby suspension hub / nodeArm anchor when external wheel rim nodes (fw1rr/fw1r) live in an unloaded common folder
  const findSuspensionHubAnchor = () => {
    const candidateIds = [];
    if (wheelDef.nodeArm) candidateIds.push(wheelDef.nodeArm);
    const sfx = side === 'left' ? 'l' : 'r';
    const prefix = isFront ? 'f' : 'r';
    candidateIds.push(`${prefix}w2${sfx}`, `${prefix}h1${sfx}`, `${prefix}h3${sfx}`, `${prefix}h4${sfx}`, `${prefix}h5${sfx}`);

    for (const cid of candidateIds) {
      const found = findNode(cid);
      if (found) return extractNodeCoords(found);
    }

    // Fallback: inspect hub group tag matching hubGroup (e.g. hub_FR)
    if (nodesDict && typeof nodesDict === 'object') {
      const sideTag = `${isFront ? 'f' : 'r'}${side === 'left' ? 'l' : 'r'}`;
      for (const k of Object.keys(nodesDict)) {
        if (k === '__meta') continue;
        const n = nodesDict[k];
        if (!n || typeof n !== 'object') continue;
        const grp = (Array.isArray(n.group)
          ? n.group.filter(g => typeof g === 'string').join(' ')
          : (typeof n.group === 'string' ? n.group : '')
        ).toLowerCase();
        const vtag = String(n.vkTag || '').toLowerCase();
        if (grp.includes(`hub_${sideTag}`) || vtag === `hub_${sideTag}`) {
          return extractNodeCoords(n);
        }
      }
    }
    return null;
  };

  let p1, p2;
  let missingAnchor = false;
  if (node1Obj && node2Obj) {
    p1 = extractNodeCoords(node1Obj);
    p2 = extractNodeCoords(node2Obj);
  } else if (node1Obj) {
    p1 = extractNodeCoords(node1Obj);
    p2 = vAdd(p1, side === 'left' ? [0.2, 0, 0] : [-0.2, 0, 0]);
  } else if (node2Obj) {
    p2 = extractNodeCoords(node2Obj);
    p1 = vSub(p2, side === 'left' ? [0.2, 0, 0] : [-0.2, 0, 0]);
  } else {
    const slotOff = wheelDef.slotNodeOffset;
    const hubAnchor = findSuspensionHubAnchor();
    if (!slotOff && !hubAnchor && nodesDict && Object.keys(nodesDict).length > 0) {
      missingAnchor = true;
    }
    const signX = side === 'left' ? 1 : -1;
    let defaultCenter;
    if (slotOff) {
      const centerX = hubAnchor
        ? hubAnchor[0] + signX * 0.04
        : signX * (0.5 + Math.abs(slotOff.x || 0.315));
      defaultCenter = [centerX, slotOff.y, slotOff.z];
    } else if (hubAnchor) {
      defaultCenter = [hubAnchor[0] + signX * 0.04, hubAnchor[1], hubAnchor[2] + 0.05];
    } else {
      defaultCenter = [signX * 0.9, isFront ? -1.4 : 1.4, 0.35];
    }
    p1 = vSub(defaultCenter, [signX * 0.1, 0, 0]);
    p2 = vAdd(defaultCenter, [signX * 0.1, 0, 0]);
  }

  // 2. Axle Axis & Center Point Calculation
  // Axis points from inner node1 towards outer node2
  const rawAxis = vSub(p2, p1);
  let axis = vNorm(rawAxis);
  if (vLen(rawAxis) < 1e-4) {
    axis = side === 'left' ? [1, 0, 0] : [-1, 0, 0];
  }

  // Midpoint of spindle nodes plus wheelOffset
  const midpoint = vScale(vAdd(p1, p2), 0.5);
  const hubCenter = vAdd(midpoint, vScale(axis, wheelOffset));

  // 3. Orthogonal Disc Basis (Two perpendicular vectors u, v in the wheel plane)
  // BeamNG Coordinate System: Z is vertical (+Z up), Y is longitudinal (+Y rear, -Y front)
  let up = [0, 0, 1];
  let u = vCross(up, axis);
  if (vLen(u) < 1e-4) {
    // Axis is vertical, fallback to Y
    u = vCross([0, 1, 0], axis);
  }
  u = vNorm(u);
  const v = vNorm(vCross(axis, u));

  // 4. Generate Node Ring Coordinates along numRays
  const generatedNodes = {};
  const hubInIds = [];
  const hubOutIds = [];
  const tireInIds = [];
  const tireOutIds = [];

  const halfHubW = hubWidth * 0.5;
  const halfTireW = tireWidth * 0.5;

  for (let k = 0; k < numRays; k++) {
    const theta = (2 * Math.PI * k) / numRays;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    // Radial ray vector in wheel disc plane
    const ray = vAdd(vScale(u, cosT), vScale(v, sinT));

    // A. Inner Hub Node (hin_k)
    const hinId = `${name}_hin_${k}`;
    const hinPos = vAdd(vSub(hubCenter, vScale(axis, halfHubW)), vScale(ray, hubRadius));
    generatedNodes[hinId] = {
      id: hinId,
      name: hinId,
      posX: hinPos[0],
      posY: hinPos[1],
      posZ: hinPos[2],
      pos: hinPos,
      nodeWeight: wheelDef.hubNodeWeight || 2.0,
      nodeMaterial: '|NM_METAL',
      group: wheelDef.hubGroup,
      isHubNode: true,
      wheelName: name
    };
    hubInIds.push(hinId);

    // B. Outer Hub Node (hout_k)
    const houtId = `${name}_hout_${k}`;
    const houtPos = vAdd(vAdd(hubCenter, vScale(axis, halfHubW)), vScale(ray, hubRadius));
    generatedNodes[houtId] = {
      id: houtId,
      name: houtId,
      posX: houtPos[0],
      posY: houtPos[1],
      posZ: houtPos[2],
      pos: houtPos,
      nodeWeight: wheelDef.hubNodeWeight || 2.0,
      nodeMaterial: '|NM_METAL',
      group: wheelDef.hubGroup,
      isHubNode: true,
      wheelName: name
    };
    hubOutIds.push(houtId);

    // C. Tire Nodes (if hasTire is enabled)
    if (hasTire) {
      // Inner Tire Node (tin_k)
      const tinId = `${name}_tin_${k}`;
      const tinPos = vAdd(vSub(hubCenter, vScale(axis, halfTireW)), vScale(ray, radius));
      generatedNodes[tinId] = {
        id: tinId,
        name: tinId,
        posX: tinPos[0],
        posY: tinPos[1],
        posZ: tinPos[2],
        pos: tinPos,
        nodeWeight: wheelDef.nodeWeight || 1.0,
        nodeMaterial: '|NM_RUBBER',
        group: wheelDef.group,
        isTireNode: true,
        wheelName: name
      };
      tireInIds.push(tinId);

      // Outer Tire Node (tout_k)
      const toutId = `${name}_tout_${k}`;
      const toutPos = vAdd(vAdd(hubCenter, vScale(axis, halfTireW)), vScale(ray, radius));
      generatedNodes[toutId] = {
        id: toutId,
        name: toutId,
        posX: toutPos[0],
        posY: toutPos[1],
        posZ: toutPos[2],
        pos: toutPos,
        nodeWeight: wheelDef.nodeWeight || 1.0,
        nodeMaterial: '|NM_RUBBER',
        group: wheelDef.group,
        isTireNode: true,
        wheelName: name
      };
      tireOutIds.push(toutId);
    }
  }

  // 5. Generate Physical Beams Structure
  const generatedBeams = [];

  for (let k = 0; k < numRays; k++) {
    const nextK = (k + 1) % numRays;

    const hin = hubInIds[k];
    const hout = hubOutIds[k];
    const nextHin = hubInIds[nextK];
    const nextHout = hubOutIds[nextK];

    // Spoke Beams connecting Spindle Nodes to Rim Nodes
    if (n1Id) {
      generatedBeams.push({
        'id1:': n1Id,
        'id2:': hin,
        beamType: '|NORMAL',
        wheelCategory: 'spoke',
        wheelName: name
      });
    }
    if (n2Id) {
      generatedBeams.push({
        'id1:': n2Id,
        'id2:': hout,
        beamType: '|NORMAL',
        wheelCategory: 'spoke',
        wheelName: name
      });
    }

    // Rim Perimeter Rings (Circumferential stiffness)
    generatedBeams.push({
      'id1:': hin,
      'id2:': nextHin,
      beamType: '|NORMAL',
      wheelCategory: 'rim_ring',
      wheelName: name
    });
    generatedBeams.push({
      'id1:': hout,
      'id2:': nextHout,
      beamType: '|NORMAL',
      wheelCategory: 'rim_ring',
      wheelName: name
    });

    // Rim Barrel Cross Beams (Lateral & Torsional barrel rigidity)
    generatedBeams.push({
      'id1:': hin,
      'id2:': hout,
      beamType: '|NORMAL',
      wheelCategory: 'rim_cross',
      wheelName: name
    });
    generatedBeams.push({
      'id1:': hin,
      'id2:': nextHout,
      beamType: '|NORMAL',
      wheelCategory: 'rim_cross',
      wheelName: name
    });

    // Soft-Body Tire Beams (Sidewalls, Tread, & Diagonals)
    if (hasTire) {
      const tin = tireInIds[k];
      const tout = tireOutIds[k];
      const nextTin = tireInIds[nextK];
      const nextTout = tireOutIds[nextK];

      // Sidewall Beams connecting Rim to Tire Carcass (|TIRESIDE)
      generatedBeams.push({
        'id1:': hin,
        'id2:': tin,
        beamType: '|TIRESIDE',
        wheelCategory: 'sidewall',
        wheelName: name
      });
      generatedBeams.push({
        'id1:': hout,
        'id2:': tout,
        beamType: '|TIRESIDE',
        wheelCategory: 'sidewall',
        wheelName: name
      });

      // Tread Perimeter Rings (Circumferential tread rolling resistance & tension)
      generatedBeams.push({
        'id1:': tin,
        'id2:': nextTin,
        beamType: '|PRESSURED',
        wheelCategory: 'tread_ring',
        wheelName: name
      });
      generatedBeams.push({
        'id1:': tout,
        'id2:': nextTout,
        beamType: '|PRESSURED',
        wheelCategory: 'tread_ring',
        wheelName: name
      });

      // Tread Cross Beams (Across tire footprint width)
      generatedBeams.push({
        'id1:': tin,
        'id2:': tout,
        beamType: '|ANISOTROPIC',
        wheelCategory: 'tread_cross',
        wheelName: name
      });
      // Tread Diagonal Shear Beams
      generatedBeams.push({
        'id1:': tin,
        'id2:': nextTout,
        beamType: '|ANISOTROPIC',
        wheelCategory: 'tread_diagonal',
        wheelName: name
      });
    }
  }

  // 6. Generate Pressure Collision Surfaces (Quads / Triangles)
  const generatedSurfaces = [];

  if (hasTire) {
    for (let k = 0; k < numRays; k++) {
      const nextK = (k + 1) % numRays;

      const hin = hubInIds[k];
      const hout = hubOutIds[k];
      const nextHin = hubInIds[nextK];
      const nextHout = hubOutIds[nextK];

      const tin = tireInIds[k];
      const tout = tireOutIds[k];
      const nextTin = tireInIds[nextK];
      const nextTout = tireOutIds[nextK];

      // Tread Surface Face (Pneumatic footprint collision quad)
      generatedSurfaces.push({
        type: 'quad',
        nodes: [tin, tout, nextTout, nextTin],
        quadType: 'PRESSURE',
        surfaceCategory: 'tread',
        wheelName: name,
        pressurePSI
      });

      // Outer Sidewall Face
      generatedSurfaces.push({
        type: 'quad',
        nodes: [hout, tout, nextTout, nextHout],
        quadType: 'NORMALTYPE',
        surfaceCategory: 'sidewall_outer',
        wheelName: name
      });

      // Inner Sidewall Face
      generatedSurfaces.push({
        type: 'quad',
        nodes: [hin, nextHin, nextTin, tin],
        quadType: 'NORMALTYPE',
        surfaceCategory: 'sidewall_inner',
        wheelName: name
      });
    }
  }

  return {
    wheelDef,
    hasSpindleNodes,
    missingAnchor,
    hubCenter,
    axis,
    p1,
    p2,
    nodes: generatedNodes,
    beams: generatedBeams,
    surfaces: generatedSurfaces,
    stats: {
      nodeCount: Object.keys(generatedNodes).length,
      beamCount: generatedBeams.length,
      surfaceCount: generatedSurfaces.length,
      radius,
      hubRadius,
      tireWidth,
      hubWidth,
      numRays,
      pressurePSI
    }
  };
}

export default {
  extractPressureWheels,
  generateWheelSkeleton
};
