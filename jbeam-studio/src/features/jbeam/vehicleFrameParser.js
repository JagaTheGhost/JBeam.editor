/**
 * Vehicle Reference Nodes & Internal Cameras Parser for JBeam Studio
 * Extracts vehicle reference coordinate frame (refNodes) and cockpit camera frustums (camerasInternal).
 */

import { extractNodeCoords } from '../viewport/visualizers.js';

/**
 * Normalizes string keys by stripping trailing colon.
 * @param {string} key
 * @returns {string}
 */
function stripColon(key) {
  if (typeof key !== 'string') return '';
  return key.endsWith(':') ? key.slice(0, -1) : key;
}

/**
 * Extracts and calculates vehicle reference coordinate frame from refNodes section.
 *
 * BeamNG refNodes syntax:
 * [
 *   ["ref:", "back:", "left:", "up:"],
 *   ["fx1r", "fx1l", "fx2r", "fx2l"]
 * ]
 * or object format:
 * { "ref:": "fx1r", "back:": "fx1l", "left:": "fx2r", "up:": "fx2l" }
 *
 * Coordinate convention in BeamNG:
 * - ref: Origin node of the vehicle
 * - back: Node pointing towards rear (+Y in BeamNG)
 * - left: Node pointing towards left (+X in BeamNG)
 * - up: Node pointing upwards (+Z in BeamNG)
 *
 * @param {object} partOrParts - JBeam part or collection of parts
 * @param {Record<string, object|number[]>} nodesDict - Resolved nodes dictionary
 * @returns {object} RefNodes calculation result
 */
export function extractRefNodes(partOrParts, nodesDict = {}) {
  const result = {
    valid: false,
    refNode: null,
    backNode: null,
    leftNode: null,
    upNode: null,
    origin: [0, 0, 0],
    forwardVec: [0, -1, 0],
    leftVec: [1, 0, 0],
    upVec: [0, 0, 1],
    forwardUnit: [0, -1, 0],
    leftUnit: [1, 0, 0],
    upUnit: [0, 0, 1],
    distances: { forward: 0, left: 0, up: 0 },
    orthogonalityError: 0,
    partName: null
  };

  if (!partOrParts || typeof partOrParts !== 'object') return result;

  let rawRefNodes = null;
  let ownerPart = null;

  if (partOrParts.refNodes) {
    rawRefNodes = partOrParts.refNodes;
    ownerPart = partOrParts.__partName || 'activePart';
  } else {
    for (const [pk, p] of Object.entries(partOrParts)) {
      if (pk === '__meta' || !p || typeof p !== 'object') continue;
      if (p.refNodes) {
        rawRefNodes = p.refNodes;
        ownerPart = pk;
        break;
      }
    }
  }

  if (!rawRefNodes) return result;
  result.partName = ownerPart;

  let ref = null;
  let back = null;
  let left = null;
  let up = null;

  // Case 1: Array of table rows or objects
  if (Array.isArray(rawRefNodes)) {
    let header = null;
    for (const item of rawRefNodes) {
      if (!item) continue;
      if (Array.isArray(item)) {
        if (!header && item.some(c => typeof c === 'string' && /^(ref|back|left|up)/i.test(stripColon(c)))) {
          header = item.map(c => stripColon(String(c).toLowerCase().trim()));
        } else if (header) {
          const rowObj = {};
          header.forEach((h, idx) => {
            if (item[idx] !== undefined) rowObj[h] = item[idx];
          });
          ref = rowObj.ref || ref;
          back = rowObj.back || back;
          left = rowObj.left || left;
          up = rowObj.up || up;
        } else if (item.length >= 4) {
          ref = item[0];
          back = item[1];
          left = item[2];
          up = item[3];
        }
      } else if (typeof item === 'object') {
        for (const [k, v] of Object.entries(item)) {
          const sk = stripColon(k).toLowerCase().trim();
          if (sk === 'ref') ref = v;
          else if (sk === 'back') back = v;
          else if (sk === 'left') left = v;
          else if (sk === 'up') up = v;
        }
      }
    }
  } else if (typeof rawRefNodes === 'object') {
    // Case 2: Object representation
    for (const [k, v] of Object.entries(rawRefNodes)) {
      if (k === '__meta') continue;
      const sk = stripColon(k).toLowerCase().trim();
      if (sk === 'ref') ref = v;
      else if (sk === 'back') back = v;
      else if (sk === 'left') left = v;
      else if (sk === 'up') up = v;
      else if (typeof v === 'object' && v !== null) {
        for (const [subK, subV] of Object.entries(v)) {
          const ssk = stripColon(subK).toLowerCase().trim();
          if (ssk === 'ref') ref = subV;
          else if (ssk === 'back') back = subV;
          else if (ssk === 'left') left = subV;
          else if (ssk === 'up') up = subV;
        }
      }
    }
  }

  if (typeof ref !== 'string' || typeof back !== 'string' || typeof left !== 'string' || typeof up !== 'string') {
    return result;
  }

  result.refNode = ref;
  result.backNode = back;
  result.leftNode = left;
  result.upNode = up;

  const refPos = nodesDict[ref] ? extractNodeCoords(nodesDict[ref]) : null;
  const backPos = nodesDict[back] ? extractNodeCoords(nodesDict[back]) : null;
  const leftPos = nodesDict[left] ? extractNodeCoords(nodesDict[left]) : null;
  const upPos = nodesDict[up] ? extractNodeCoords(nodesDict[up]) : null;

  if (!refPos || !backPos || !leftPos || !upPos) {
    // Node references exist in syntax, but coordinates could not all be resolved in nodesDict
    return result;
  }

  result.origin = [refPos[0], refPos[1], refPos[2]];

  // In BeamNG, back is rearward (+Y). Vehicle forward is from back to ref, or ref - back:
  // F = ref - back (points forward in -Y direction)
  const fx = refPos[0] - backPos[0];
  const fy = refPos[1] - backPos[1];
  const fz = refPos[2] - backPos[2];
  const fLen = Math.hypot(fx, fy, fz);

  // Left = left - ref (+X in BeamNG)
  const lx = leftPos[0] - refPos[0];
  const ly = leftPos[1] - refPos[1];
  const lz = leftPos[2] - refPos[2];
  const lLen = Math.hypot(lx, ly, lz);

  // Up = up - ref (+Z in BeamNG)
  const ux = upPos[0] - refPos[0];
  const uy = upPos[1] - refPos[1];
  const uz = upPos[2] - refPos[2];
  const uLen = Math.hypot(ux, uy, uz);

  result.distances = {
    forward: fLen,
    left: lLen,
    up: uLen
  };

  if (fLen < 1e-4 || lLen < 1e-4 || uLen < 1e-4) {
    // Degenerate reference nodes
    return result;
  }

  result.forwardVec = [fx, fy, fz];
  result.leftVec = [lx, ly, lz];
  result.upVec = [ux, uy, uz];

  const fu = [fx / fLen, fy / fLen, fz / fLen];
  const lu = [lx / lLen, ly / lLen, lz / lLen];
  const uu = [ux / uLen, uy / uLen, uz / uLen];

  result.forwardUnit = fu;
  result.leftUnit = lu;
  result.upUnit = uu;

  // Calculate dot products to check orthogonality (cosine of angles)
  const dotFL = Math.abs(fu[0] * lu[0] + fu[1] * lu[1] + fu[2] * lu[2]);
  const dotFU = Math.abs(fu[0] * uu[0] + fu[1] * uu[1] + fu[2] * uu[2]);
  const dotLU = Math.abs(lu[0] * uu[0] + lu[1] * uu[1] + lu[2] * uu[2]);
  result.orthogonalityError = Math.max(dotFL, dotFU, dotLU);

  result.valid = true;
  return result;
}

/**
 * Extracts cockpit driver / internal cameras from camerasInternal section.
 *
 * BeamNG camerasInternal syntax:
 * [
 *   ["type", "x", "y", "z", "fov", "id1:", "id2:", "id3:", "id4:", "id5:", "id6:"],
 *   {"type": "dash", "x": 0.38, "y": 0.42, "z": 1.15, "fov": 65, "id1:": "b1l", ...}
 * ]
 *
 * @param {object} partOrParts - JBeam part or collection of parts
 * @param {Record<string, object|number[]>} nodesDict - Resolved nodes dictionary
 * @returns {Array<object>} Array of parsed camera definitions
 */
export function extractCamerasInternal(partOrParts, nodesDict = {}) {
  const cameras = [];
  if (!partOrParts || typeof partOrParts !== 'object') return cameras;

  const inspectPart = (part, partName) => {
    if (!part || typeof part !== 'object') return;
    const rawCams = part.camerasInternal || part.cameraInternal;
    if (!rawCams) return;

    let header = null;

    const processItem = (item, idx) => {
      if (!item) return;

      if (Array.isArray(item)) {
        if (!header && item.some(c => typeof c === 'string' && /^(type|fov|id1)/i.test(stripColon(c)))) {
          header = item.map(c => stripColon(String(c).toLowerCase().trim()));
          return;
        }
        if (header) {
          const rowObj = {};
          header.forEach((h, hIdx) => {
            if (item[hIdx] !== undefined) rowObj[h] = item[hIdx];
          });
          parseCamObject(rowObj, idx, partName);
        } else if (item.length >= 4) {
          // Fallback array: [type, x, y, z, fov, id1, id2, ...]
          const rowObj = {
            type: item[0],
            x: Number(item[1]) || 0,
            y: Number(item[2]) || 0,
            z: Number(item[3]) || 0,
            fov: Number(item[4]) || 65,
            id1: item[5],
            id2: item[6],
            id3: item[7],
            id4: item[8],
            id5: item[9],
            id6: item[10]
          };
          parseCamObject(rowObj, idx, partName);
        }
      } else if (typeof item === 'object') {
        const cleanObj = {};
        for (const [k, v] of Object.entries(item)) {
          cleanObj[stripColon(k).toLowerCase().trim()] = v;
        }
        parseCamObject(cleanObj, idx, partName);
      }
    };

    const parseCamObject = (obj, idx, pName) => {
      const type = String(obj.type || `cam_${idx}`);
      const x = Number(obj.x) || 0;
      const y = Number(obj.y) || 0;
      const z = Number(obj.z) || 0;
      let fov = Number(obj.fov);
      if (isNaN(fov)) fov = 65;

      const anchorIds = [obj.id1, obj.id2, obj.id3, obj.id4, obj.id5, obj.id6].filter(id => typeof id === 'string' && id.trim().length > 0);

      // Compute anchor centroids
      let avgX = 0, avgY = 0, avgZ = 0;
      let resolvedCount = 0;
      const anchorCoords = [];

      for (const aid of anchorIds) {
        if (nodesDict[aid]) {
          const c = extractNodeCoords(nodesDict[aid]);
          avgX += c[0];
          avgY += c[1];
          avgZ += c[2];
          resolvedCount++;
          anchorCoords.push({ id: aid, coords: c });
        }
      }

      let worldPos;
      if (resolvedCount > 0) {
        worldPos = [
          avgX / resolvedCount + x,
          avgY / resolvedCount + y,
          avgZ / resolvedCount + z
        ];
      } else {
        worldPos = [x, y, z];
      }

      // Default gaze direction: forward in BeamNG is -Y
      const forwardDir = [0, -1, 0];

      cameras.push({
        index: idx,
        type,
        partName: pName,
        offset: [x, y, z],
        fov,
        anchorIds,
        anchorCoords,
        hasResolvedAnchors: resolvedCount > 0,
        worldPos,
        forwardDir
      });
    };

    if (Array.isArray(rawCams)) {
      rawCams.forEach((item, idx) => processItem(item, idx));
    } else if (typeof rawCams === 'object') {
      Object.entries(rawCams).forEach(([k, v], idx) => {
        if (k === '__meta') return;
        processItem(v, idx);
      });
    }
  };

  if (partOrParts.camerasInternal || partOrParts.cameraInternal) {
    inspectPart(partOrParts, partOrParts.__partName || 'activePart');
  } else {
    for (const [pk, p] of Object.entries(partOrParts)) {
      if (pk === '__meta') continue;
      inspectPart(p, pk);
    }
  }

  return cameras;
}
