/*
  JBeam Studio - Flexbody Node Group Association & Utilities
  Provides bi-directional association between:
  1. 3D visual submeshes (.dae Collada models)
  2. JBeam flexbodies definitions (table of mesh names and node groups)
  3. JBeam physical nodes (nodes assigned to groups via inline {"group": ...} options)
*/

/**
 * Normalizes a raw group value (string, array of strings, or undefined)
 * into a clean array of group names.
 * @param {any} groupVal
 * @returns {string[]}
 */
export function normalizeGroups(groupVal) {
  if (!groupVal) return [];
  if (Array.isArray(groupVal)) {
    return groupVal
      .map(g => (g !== null && g !== undefined ? String(g).trim() : ''))
      .filter(g => g.length > 0 && g !== '""');
  }
  if (typeof groupVal === 'string') {
    const trimmed = groupVal.trim();
    if (!trimmed || trimmed === '""') return [];
    return [trimmed];
  }
  if (typeof groupVal === 'object') {
    return Object.keys(groupVal)
      .filter(k => k !== '__meta')
      .map(k => (groupVal[k] !== null && groupVal[k] !== undefined ? String(groupVal[k]).trim() : ''))
      .filter(g => g.length > 0 && g !== '""');
  }
  return [];
}

/**
 * Extracts normalized node groups for a given node object.
 * @param {object} node
 * @returns {string[]}
 */
export function getNodeGroups(node) {
  if (!node || typeof node !== 'object') return [];
  return normalizeGroups(node.group);
}

/**
 * Checks whether a submesh name from a .dae Collada model matches a JBeam flexbody mesh name.
 * Supports exact case-insensitive matching, prefix matching (e.g. "cab_main" matches "cab_main_lod0"),
 * and boundary checks.
 * @param {string} daeSubmeshName
 * @param {string} jbeamMeshName
 * @returns {boolean}
 */
export function matchesSubmeshName(daeSubmeshName, jbeamMeshName) {
  if (!daeSubmeshName || !jbeamMeshName) return false;
  let d = String(daeSubmeshName).trim().toLowerCase();
  let j = String(jbeamMeshName).trim().toLowerCase();

  // Strip enclosing quotes if present
  const quoted = j.match(/^['"]([^'"]+)['"]$/);
  if (quoted) j = quoted[1];

  // Strip Blender duplicate (.001) and LOD (_lod0) suffixes
  const normD = d.replace(/\.\d+$/, '').replace(/_lod\d+$/i, '');
  const normJ = j.replace(/\.\d+$/, '').replace(/_lod\d+$/i, '');

  if (d === j || normD === normJ) return true;
  if (normD.startsWith(normJ + '_') || normD.startsWith(normJ + '.')) return true;

  return false;
}

/**
 * Extracts flexbody definitions from a single part object.
 * @param {object} part
 * @param {string} [partName='']
 * @returns {Array<{partName: string, meshName: string, groups: string[], nonFlexMaterials: string[], range: any, rawRow: any}>}
 */
export function extractPartFlexbodies(part, partName = '') {
  if (!part || typeof part !== 'object' || !part.flexbodies) return [];

  const list = [];
  const fb = part.flexbodies;
  const rowKeys = Object.keys(fb).filter(k => k !== '__meta');

  for (const rk of rowKeys) {
    const row = fb[rk];
    if (!row || typeof row !== 'object') continue;

    // Check for mesh name
    let meshName = row.mesh || row['0'] || (Array.isArray(row) ? row[0] : null);
    if (!meshName || typeof meshName !== 'string') continue;

    // Clean quotes if present
    const quoted = meshName.match(/^['"]([^'"]+)['"]$/);
    if (quoted) meshName = quoted[1];

    // Skip table header row
    if (meshName.toLowerCase() === 'mesh') continue;

    // Extract group(s)
    const rawGroup = row.group || row['[group]:'] || row['1'] || (Array.isArray(row) ? row[1] : []);
    const groups = normalizeGroups(rawGroup);

    // Extract nonFlexMaterials if present
    const rawNonFlex = row.nonFlexMaterials || row['2'] || (Array.isArray(row) ? row[2] : []);
    const nonFlexMaterials = normalizeGroups(rawNonFlex);

    list.push({
      partName,
      meshName,
      groups,
      nonFlexMaterials,
      range: row.__meta?.range || null,
      rawRow: row
    });
  }

  return list;
}

/**
 * Extracts all flexbody definitions across all parts in a parsed JBeam dataset.
 * @param {object} jbeamParts - Map of partName -> part
 * @returns {Array<object>}
 */
export function extractAllFlexbodies(jbeamParts) {
  if (!jbeamParts || typeof jbeamParts !== 'object') return [];
  const list = [];
  const partKeys = Object.keys(jbeamParts).filter(k => k !== '__meta');
  for (const pKey of partKeys) {
    const part = jbeamParts[pKey];
    const partFlexbodies = extractPartFlexbodies(part, pKey);
    list.push(...partFlexbodies);
  }
  return list;
}

/**
 * Builds an index of node IDs to groups and group names to node IDs.
 * @param {object} nodesDict - Nodes dictionary from part.nodes or assembledNodes
 * @returns {{
 *   nodeToGroups: Record<string, string[]>,
 *   groupToNodes: Record<string, string[]>,
 *   allGroups: string[],
 *   ungroupedNodes: string[]
 * }}
 */
export function buildNodeGroupIndex(nodesDict) {
  const nodeToGroups = {};
  const groupToNodes = {};
  const ungroupedNodes = [];

  if (!nodesDict || typeof nodesDict !== 'object') {
    return { nodeToGroups, groupToNodes, allGroups: [], ungroupedNodes };
  }

  const nodeKeys = Object.keys(nodesDict).filter(k => k !== '__meta');
  for (const nKey of nodeKeys) {
    const node = nodesDict[nKey];
    if (!node || typeof node !== 'object') continue;

    const nodeId = node.id || node.name || nKey;
    const groups = getNodeGroups(node);

    nodeToGroups[nodeId] = groups;

    if (groups.length === 0) {
      ungroupedNodes.push(nodeId);
    } else {
      for (const grp of groups) {
        if (!groupToNodes[grp]) {
          groupToNodes[grp] = [];
        }
        groupToNodes[grp].push(nodeId);
      }
    }
  }

  const allGroups = Object.keys(groupToNodes);
  return { nodeToGroups, groupToNodes, allGroups, ungroupedNodes };
}

/**
 * Deeply resolves bi-directional association between flexbodies, node groups, and physical nodes.
 * @param {object} partOrParts - Either a single part object or multiple parts map
 * @param {object} [options={}]
 * @param {string[]|Set<string>} [options.daeSubmeshNames] - Submesh names in loaded .dae model
 * @param {Record<string, {vertices: number, triangles: number}>} [options.submeshDetails] - Submesh geometry metrics
 * @param {object} [options.assembledNodes] - Optional external nodes from composite vehicle assembly
 * @returns {{
 *   flexbodies: Array<{
 *     partName: string,
 *     meshName: string,
 *     groups: string[],
 *     boundNodeIds: string[],
 *     nodeCount: number,
 *     isMatchedInDae: boolean,
 *     daeMeshName: string|null,
 *     daeStats: {vertices: number, triangles: number}|null,
 *     range: any,
 *     hasZeroNodes: boolean
 *   }>,
 *   nodeToFlexbodies: Record<string, Array<object>>,
 *   nodeToGroups: Record<string, string[]>,
 *   groupToNodes: Record<string, string[]>,
 *   getBoundNodesForMesh: (meshName: string) => string[],
 *   getFlexbodiesForNode: (nodeId: string) => Array<object>
 * }}
 */
export function resolveFlexbodyAssociations(partOrParts, options = {}) {
  const { daeSubmeshNames, submeshDetails, assembledNodes } = options;

  let partsMap = {};
  if (partOrParts && typeof partOrParts === 'object') {
    // If it's a single part with "nodes" or "flexbodies" property
    if (partOrParts.nodes || partOrParts.flexbodies || partOrParts.beams) {
      partsMap = { default_part: partOrParts };
    } else {
      partsMap = partOrParts;
    }
  }

  // 1. Gather all nodes across all parts + assembledNodes
  const combinedNodes = {};
  if (assembledNodes && typeof assembledNodes === 'object') {
    Object.assign(combinedNodes, assembledNodes);
  }

  const partKeys = Object.keys(partsMap).filter(k => k !== '__meta');
  for (const pKey of partKeys) {
    const part = partsMap[pKey];
    if (part?.nodes) {
      const nKeys = Object.keys(part.nodes).filter(k => k !== '__meta');
      for (const nk of nKeys) {
        combinedNodes[nk] = part.nodes[nk];
      }
    }
  }

  // 2. Build node group indices
  const { nodeToGroups, groupToNodes } = buildNodeGroupIndex(combinedNodes);

  // 3. Extract all flexbodies
  const rawFlexbodies = extractAllFlexbodies(partsMap);

  // Normalize dae submesh names
  const daeList = daeSubmeshNames ? (Array.isArray(daeSubmeshNames) ? daeSubmeshNames : Array.from(daeSubmeshNames)) : [];

  // 4. Resolve each flexbody
  const flexbodies = [];
  const meshToBoundNodes = new Map();

  for (const fb of rawFlexbodies) {
    // Find all nodes belonging to any group of this flexbody
    const boundSet = new Set();
    for (const grp of fb.groups) {
      const nodesInGrp = groupToNodes[grp];
      if (nodesInGrp && Array.isArray(nodesInGrp)) {
        for (const nid of nodesInGrp) {
          boundSet.add(nid);
        }
      }
    }

    const boundNodeIds = Array.from(boundSet);
    meshToBoundNodes.set(fb.meshName.toLowerCase(), boundNodeIds);

    // Check .dae match
    let isMatchedInDae = false;
    let matchedDaeName = null;
    let stats = null;

    if (daeList.length > 0) {
      const match = daeList.find(dName => matchesSubmeshName(dName, fb.meshName));
      if (match) {
        isMatchedInDae = true;
        matchedDaeName = match;
        if (submeshDetails && submeshDetails[match]) {
          stats = submeshDetails[match];
        }
      }
    }

    flexbodies.push({
      partName: fb.partName,
      meshName: fb.meshName,
      groups: fb.groups,
      nonFlexMaterials: fb.nonFlexMaterials,
      boundNodeIds,
      nodeCount: boundNodeIds.length,
      isMatchedInDae,
      daeMeshName: matchedDaeName,
      daeStats: stats,
      range: fb.range,
      hasZeroNodes: fb.groups.length > 0 && boundNodeIds.length === 0
    });
  }

  // 5. Build reverse lookup: node -> flexbodies
  const nodeToFlexbodies = {};
  for (const fb of flexbodies) {
    for (const nid of fb.boundNodeIds) {
      if (!nodeToFlexbodies[nid]) {
        nodeToFlexbodies[nid] = [];
      }
      nodeToFlexbodies[nid].push(fb);
    }
  }

  // 6. Accessor helpers
  const getBoundNodesForMesh = (meshName) => {
    if (!meshName) return [];
    const lower = String(meshName).trim().toLowerCase();
    // Direct match
    if (meshToBoundNodes.has(lower)) {
      return meshToBoundNodes.get(lower);
    }
    // Matching match
    for (const [mName, nodes] of meshToBoundNodes.entries()) {
      if (matchesSubmeshName(lower, mName)) {
        return nodes;
      }
    }
    return [];
  };

  const getFlexbodiesForNode = (nodeId) => {
    return nodeToFlexbodies[nodeId] || [];
  };

  return {
    flexbodies,
    nodeToFlexbodies,
    nodeToGroups,
    groupToNodes,
    getBoundNodesForMesh,
    getFlexbodiesForNode
  };
}

export default {
  normalizeGroups,
  getNodeGroups,
  matchesSubmeshName,
  extractPartFlexbodies,
  extractAllFlexbodies,
  buildNodeGroupIndex,
  resolveFlexbodyAssociations
};
