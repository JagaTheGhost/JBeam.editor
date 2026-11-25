/*
  Component Family & Bilateral Symmetry Utilities for JBeam Studio
  Groups BeamNG parts into logical component families (e.g. front struts, swaybars, steering)
  and normalizes submesh names for bilateral symmetric color pairing.
*/

/**
 * Normalizes a flexbody submesh name to its bilateral symmetric base name.
 * Pairs matching bilateral sides (e.g., _FL and _FR, _L and _R) so they share colors.
 *
 * @param {string} rawName
 * @returns {string}
 */
export function extractSymmetricBaseName(rawName) {
  if (!rawName || typeof rawName !== 'string') return '';
  let name = String(rawName).trim().toLowerCase()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\.\d+$/, '')
    .replace(/_lod\d+$/i, '');

  name = name
    .replace(/_fl\b|_fr\b/gi, '_f_pair')
    .replace(/_rl\b|_rr\b/gi, '_r_pair')
    .replace(/_ml\b|_mr\b/gi, '_m_pair')
    .replace(/_left\b|_right\b/gi, '_pair')
    .replace(/_lhs\b|_rhs\b/gi, '_pair')
    .replace(/_l\b|_r\b/gi, '_pair')
    .replace(/\.l\b|\.r\b/gi, '.pair');

  return name;
}

/**
 * Derives the component family / slot group for a JBeam part.
 * Checks slotType first, then strips common variant/tuning suffixes from the part key.
 *
 * @param {string} partKey
 * @param {Object} [part]
 * @returns {string}
 */
export function derivePartFamily(partKey, part = {}) {
  const rawSlot = part?.slotType ?? part?.options?.slotType ?? '';
  let slot = '';
  if (typeof rawSlot === 'string') {
    slot = rawSlot.trim();
  } else if (Array.isArray(rawSlot)) {
    const first = rawSlot.find(v => typeof v === 'string' && v.trim());
    slot = first ? first.trim() : '';
  } else if (rawSlot && typeof rawSlot === 'object') {
    const firstKey = Object.keys(rawSlot).find(k => k !== '__meta' && typeof rawSlot[k] === 'string' && rawSlot[k].trim());
    slot = firstKey ? rawSlot[firstKey].trim() : '';
  }

  const baseFromKey = String(partKey)
    .replace(/_(heavy|ultra_heavy|sport|gt|race|rally|drift|drag|offroad|v8|v6|i4|awd|rwd|fwd|adaptive|plus|tuned|stage\d|alt\d?)$/i, '')
    .trim();

  return String(slot || baseFromKey || partKey);
}

/**
 * Computes effective color modes for nodes and beams to support simultaneous combination of controls.
 * For example, if Type is toggled and under heatmap Mass is active, nodes receive mass heatmap coloring
 * while beams receive type classification coloring.
 *
 * @param {Object} params
 * @param {string|null} [params.activeHeatmap] - 'mass' | 'stiffness' | 'deform' | 'strength' | null
 * @param {string} [params.colorMode] - 'default' | 'type' | 'part' | 'crashZones' | ...
 * @param {string} [params.hudActiveTab] - 'parts' | 'type' | 'crash' | 'heatmap'
 * @param {boolean} [params.hasActiveTypeFilter] - whether any type filter is disabled
 * @returns {{ nodeMode: string, beamMode: string }}
 */
export function computeEffectiveColorModes({
  activeHeatmap = null,
  colorMode = 'default',
  hudActiveTab = 'parts',
  hasActiveTypeFilter = false
} = {}) {
  let nodeMode = 'default';
  if (activeHeatmap === 'mass') {
    nodeMode = 'mass';
  } else if (colorMode === 'part' || (hudActiveTab === 'parts' && colorMode === 'part')) {
    nodeMode = 'part';
  } else if (colorMode === 'type' || hudActiveTab === 'type' || hasActiveTypeFilter) {
    nodeMode = 'type';
  }

  let beamMode = 'default';
  if (activeHeatmap === 'stiffness' || activeHeatmap === 'deform' || activeHeatmap === 'strength') {
    beamMode = activeHeatmap;
  } else if (colorMode === 'crashZones' || hudActiveTab === 'crash') {
    beamMode = 'crashZones';
  } else if (colorMode === 'part' || (hudActiveTab === 'parts' && colorMode === 'part')) {
    beamMode = 'part';
  } else if (colorMode === 'type' || hudActiveTab === 'type' || hasActiveTypeFilter) {
    beamMode = 'type';
  }

  return { nodeMode, beamMode };
}

/**
 * Computes the toggle action for Hide All / Unhide All quick action button.
 * If isolation is active, unhides all parts. Otherwise, isolates/hides all part keys.
 *
 * @param {boolean} hasActiveIsolation
 * @param {string[]} allPartKeys
 * @returns {{ newIsolatedKeys: Set<string>, action: 'hideAll' | 'unhideAll' }}
 */
export function computeHideUnhideAllToggle(hasActiveIsolation, allPartKeys = []) {
  if (hasActiveIsolation) {
    return {
      newIsolatedKeys: new Set(),
      action: 'unhideAll'
    };
  }
  return {
    newIsolatedKeys: new Set(allPartKeys),
    action: 'hideAll'
  };
}

/**
 * Resolves exact submesh visibility parameters for ColladaMeshManager.
 * Prevents falling back to full-vehicle DAE visibility when parts are explicitly hidden
 * (e.g. "Hide All"), when a zero-flexbody part is soloed, or when Active Only isolation is enabled.
 *
 * @param {Object} params
 * @param {boolean} params.effectiveIsolateMesh
 * @param {boolean} params.hasActiveIsolation
 * @param {Set<string>|string[]|null} params.activeMatchingMeshNames
 * @param {boolean} params.jbeamDefinesFlexbodies - true if any part in current jbeamParts declares flexbodies/props
 * @param {string|null} [params.soloPartKey]
 * @param {string|null} [params.soloFamilyKey]
 * @param {string|null} [params.soloFlexbodyName]
 * @param {Object|null} [params.partsAndFlexbodiesData]
 * @returns {{ allowedMeshNames: Set<string>|null, forceExplicit: boolean }}
 */
export function computeSubmeshIsolationConfig({
  effectiveIsolateMesh = true,
  hasActiveIsolation = false,
  activeMatchingMeshNames = null,
  jbeamDefinesFlexbodies = false,
  soloPartKey = null,
  soloFamilyKey = null,
  soloFlexbodyName = null,
  partsAndFlexbodiesData = null
} = {}) {
  const toLowerSet = (items) => {
    const s = new Set();
    if (!items) return s;
    const arr = items instanceof Set ? items : Array.from(items);
    for (const item of arr) {
      const name = typeof item === 'string' ? item : item?.name;
      if (name) s.add(String(name).trim().toLowerCase());
    }
    return s;
  };

  if (soloFlexbodyName) {
    return {
      allowedMeshNames: toLowerSet([soloFlexbodyName]),
      forceExplicit: true
    };
  }

  if (soloPartKey) {
    const pData = partsAndFlexbodiesData?.parts?.find(p => p.key === soloPartKey);
    return {
      allowedMeshNames: toLowerSet(pData?.flexbodies || []),
      forceExplicit: true
    };
  }

  if (soloFamilyKey) {
    const famParts = (partsAndFlexbodiesData?.parts || []).filter(
      p => partsAndFlexbodiesData?.partFamilyMap?.get(p.key) === soloFamilyKey
    );
    const famMeshes = new Set();
    for (const p of famParts) {
      for (const fb of (p.flexbodies || [])) {
        const fbName = typeof fb === 'string' ? fb : fb?.name;
        if (fbName) famMeshes.add(String(fbName).trim().toLowerCase());
      }
    }
    return {
      allowedMeshNames: famMeshes,
      forceExplicit: true
    };
  }

  // If user has explicit part/flexbody isolation active (e.g. Hide All or hiding specific parts),
  // strictly scope visible DAE meshes to remaining visible parts (even if 0 meshes remain).
  if (hasActiveIsolation) {
    return {
      allowedMeshNames: toLowerSet(activeMatchingMeshNames),
      forceExplicit: true
    };
  }

  // In "Active Only" mode: if the loaded JBeam defines flexbodies/props (or resolved matches),
  // restrict the DAE viewport strictly to those matching submeshes.
  const activeSet = toLowerSet(activeMatchingMeshNames);
  if (effectiveIsolateMesh && (jbeamDefinesFlexbodies || activeSet.size > 0)) {
    return {
      allowedMeshNames: activeSet,
      forceExplicit: true
    };
  }

  return {
    allowedMeshNames: null,
    forceExplicit: false
  };
}


