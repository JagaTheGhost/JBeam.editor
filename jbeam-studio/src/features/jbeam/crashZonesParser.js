/**
 * Crash Zones (BreakGroup & DeformGroup) Parser for JBeam Studio
 * Analyzes beam detachment triggers (breakGroup) and visual mesh crumple/shatter triggers (deformGroup).
 */

// Visually distinct high-contrast palette for crash zone visualization
const CRASH_PALETTE = [
  '#f59e0b', // Amber
  '#00e5ff', // Cyan
  '#ec4899', // Pink
  '#10b981', // Emerald
  '#8b5cf6', // Purple
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#eab308', // Yellow
  '#14b8a6', // Teal
  '#f97316', // Orange
  '#a855f7', // Violet
  '#06b6d4', // Sky
  '#84cc16', // Lime
  '#d946ef', // Fuchsia
  '#6366f1'  // Indigo
];

/**
 * Deterministically generates a vibrant hex color from a group name.
 * @param {string} name
 * @returns {string} Hex color code (e.g. '#f59e0b')
 */
export function getCrashGroupColor(name) {
  if (!name || typeof name !== 'string') return '#64748b'; // Slate gray
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % CRASH_PALETTE.length;
  return CRASH_PALETTE[index];
}

/**
 * Normalizes a group declaration (can be string, array of strings, or undefined).
 * @param {any} val
 * @returns {string[]}
 */
export function normalizeGroupList(val) {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.map(v => (typeof v === 'string' ? v.trim() : '')).filter(Boolean);
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    return trimmed ? [trimmed] : [];
  }
  return [];
}

/**
 * Extracts and correlates all breakGroups and deformGroups across loaded JBeam parts and flexbodies.
 *
 * @param {object} jbeamParts - Object containing parsed parts
 * @param {object} [options] - Options (e.g. daeSubmeshNames)
 * @returns {object} Crash zones analysis result
 */
export function extractCrashZones(jbeamParts, options = {}) {
  const result = {
    breakGroups: {},   // groupName -> { name, color, beams: [], parts: Set }
    deformGroups: {},  // groupName -> { name, color, beams: [], flexbodies: [], parts: Set }
    totalBeamsWithBreakGroup: 0,
    totalBeamsWithDeformGroup: 0,
    totalUnguardedBeams: 0,
    allBreakGroupNames: [],
    allDeformGroupNames: []
  };

  if (!jbeamParts || typeof jbeamParts !== 'object') return result;

  const partKeys = Object.keys(jbeamParts).filter(k => k !== '__meta');

  // 1. Process Beams
  for (const pKey of partKeys) {
    const part = jbeamParts[pKey];
    if (!part || !part.beams) continue;

    const beamsDict = part.beams;
    const beamKeys = Object.keys(beamsDict).filter(k => k !== '__meta');

    for (const bKey of beamKeys) {
      const beam = beamsDict[bKey];
      if (!beam || typeof beam !== 'object') continue;

      const id1 = beam.id1 || beam['id1:'] || beam[0];
      const id2 = beam.id2 || beam['id2:'] || beam[1];
      if (!id1 || !id2) continue;

      const rawBreak = beam.breakGroup || beam['breakGroup:'];
      const rawDeform = beam.deformGroup || beam['deformGroup:'];

      const breakList = normalizeGroupList(rawBreak);
      const deformList = normalizeGroupList(rawDeform);

      const beamInfo = {
        key: bKey,
        id1: String(id1),
        id2: String(id2),
        partName: pKey,
        beamStrength: beam.beamStrength,
        beamDeform: beam.beamDeform,
        deformationTriggerRatio: beam.deformationTriggerRatio,
        breakGroupType: beam.breakGroupType,
        breakGroups: breakList,
        deformGroups: deformList,
        lineRange: beam.__meta?.range || null
      };

      if (breakList.length > 0) {
        result.totalBeamsWithBreakGroup++;
        for (const bg of breakList) {
          if (!result.breakGroups[bg]) {
            result.breakGroups[bg] = {
              name: bg,
              color: getCrashGroupColor(bg),
              beams: [],
              parts: new Set()
            };
          }
          result.breakGroups[bg].beams.push(beamInfo);
          result.breakGroups[bg].parts.add(pKey);
        }
      }

      if (deformList.length > 0) {
        result.totalBeamsWithDeformGroup++;
        for (const dg of deformList) {
          if (!result.deformGroups[dg]) {
            result.deformGroups[dg] = {
              name: dg,
              color: getCrashGroupColor(dg),
              beams: [],
              flexbodies: [],
              parts: new Set()
            };
          }
          result.deformGroups[dg].beams.push(beamInfo);
          result.deformGroups[dg].parts.add(pKey);
        }
      }

      if (breakList.length === 0 && deformList.length === 0) {
        result.totalUnguardedBeams++;
      }
    }
  }

  // 2. Correlate Flexbodies with DeformGroups
  for (const pKey of partKeys) {
    const part = jbeamParts[pKey];
    if (!part) continue;

    const rawFlex = part.flexbodies;
    if (!rawFlex) continue;

    const flexList = Array.isArray(rawFlex) ? rawFlex : Object.values(rawFlex);

    for (const fb of flexList) {
      if (!fb) continue;
      let meshName = null;
      let rawDeform = null;

      if (Array.isArray(fb)) {
        meshName = fb[0];
        // BeamNG flexbody table syntax: ["mesh", ["group"], nonFlex, ignoreCol, "deformGroup"]
        rawDeform = fb[4] || fb.deformGroup;
      } else if (typeof fb === 'object') {
        meshName = fb.mesh || fb.meshName || fb[0];
        rawDeform = fb.deformGroup || fb['deformGroup:'];
      }

      if (meshName && rawDeform) {
        const deformList = normalizeGroupList(rawDeform);
        for (const dg of deformList) {
          if (!result.deformGroups[dg]) {
            result.deformGroups[dg] = {
              name: dg,
              color: getCrashGroupColor(dg),
              beams: [],
              flexbodies: [],
              parts: new Set()
            };
          }
          result.deformGroups[dg].flexbodies.push({
            meshName: String(meshName),
            partName: pKey
          });
          result.deformGroups[dg].parts.add(pKey);
        }
      }
    }
  }

  result.allBreakGroupNames = Object.keys(result.breakGroups).sort();
  result.allDeformGroupNames = Object.keys(result.deformGroups).sort();

  return result;
}
