/*
  3D Visualizers for JBeam Structures (Nodes, Beams, Triangles, Labels)
  Builds Three.js meshes, lines, materials, and billboard text sprites.
*/

import * as THREE from 'three';
import { beamngToThree, getSymmetricNodeId } from './coordinateUtils.js';

/**
 * Safely extracts [x, y, z] coordinates from a node object, handling posX/posY/posZ,
 * pos array, rx/ry/rz, and preventing any undefined property access crashes.
 */
export function extractNodeCoords(node) {
  if (!node || typeof node !== 'object') return [0, 0, 0];
  const x = node.posX !== undefined ? node.posX : (node.pos && node.pos[0] !== undefined ? node.pos[0] : (node.rx !== undefined ? node.rx : 0));
  const y = node.posY !== undefined ? node.posY : (node.pos && node.pos[1] !== undefined ? node.pos[1] : (node.ry !== undefined ? node.ry : 0));
  const z = node.posZ !== undefined ? node.posZ : (node.pos && node.pos[2] !== undefined ? node.pos[2] : (node.rz !== undefined ? node.rz : 0));
  return [Number(x) || 0, Number(y) || 0, Number(z) || 0];
}

export const BEAM_TYPE_COLORS = {
  '|NORMAL': 0x22c55e,      // Vivid Spring Green (structural skeleton / normal beams)
  '|SUPPORT': 0xfbbf24,     // Radiant Sun Gold (anti-inversion support lattice)
  '|HYDRO': 0x00e5ff,       // Electric Sky Cyan (steering & suspension actuators)
  '|BOUNDED': 0xd946ef,     // Electric Magenta / Fuchsia (bumpstops & travel limiters)
  '|ANISOTROPIC': 0xff6b00, // Vibrant Flame Orange (directional stiffness & tire compliance)
  '|PRESSURED': 0x818cf8,   // Radiant Indigo (pneumatic cells & airbags)
  '|LBEAM': 0x94a3b8,       // Slate Gray (limit beams)
  '|TIRESIDE': 0x84cc16,    // Lime (tire carcass sidewalls)
  '|BROKEN': 0xef4444,      // Deep Red
  '|VIRTUAL': 0xc084fc,     // Bright Orchid Purple (cross-part chassis linkages)
  'DEFAULT': 0x22c55e
};

/**
 * Resolves node physics role classification.
 */
export function resolveNodeType(node, nodeId = '') {
  if (node?.__isExternal === true || node?.__isNonActive === true) return 'external';
  if (node?.fixed === true) return 'fixed';
  const idStr = String(nodeId || node?.id || node?.name || '');
  if (/^(fw1|hub_f|fh1|rw1|hub_r|rh1|wheel_|wh_).*$/i.test(idStr)) return 'wheelHub';
  if (/^(em1|tra1|e1|e2|e3|e4|rdiff|fdiff).*$/i.test(idStr) || (node?.group && Array.isArray(node.group) && node.group.some(g => typeof g === 'string' && /engine|mount|trans/i.test(g)))) return 'mount';
  if (node?.collision === false) return 'nonCollidable';
  if (node?.selfCollision === true) return 'selfCollision';
  return 'collisionOnly';
}

/**
 * Resolves surface physics type (NORMALTYPE, NONCOLLIDABLE, PRESSURE).
 */
export function resolveSurfaceType(surface) {
  const t = String(surface?.triangleType || surface?.quadType || surface?.type || 'NORMALTYPE').toUpperCase();
  if (t === 'NONCOLLIDABLE') return 'NONCOLLIDABLE';
  if (t === 'PRESSURE') return 'PRESSURE';
  return 'NORMALTYPE';
}

/**
 * Computes dynamic element counts by physics type for filtering and HUD display.
 * Accurately detects external connection beams (|VIRTUAL) and foreign reference nodes.
 */
export function countVehicleElementTypes(beamsDict = {}, nodesDict = {}, trianglesDict = {}, quadsDict = {}, externalNodesDict = {}) {
  const beamCounts = {
    '|NORMAL': 0,
    '|SUPPORT': 0,
    '|HYDRO': 0,
    '|BOUNDED': 0,
    '|ANISOTROPIC': 0,
    '|PRESSURED': 0,
    '|VIRTUAL': 0
  };
  const nodeCounts = {
    collisionOnly: 0,
    selfCollision: 0,
    nonCollidable: 0,
    wheelHub: 0,
    mount: 0,
    fixed: 0,
    external: 0
  };
  const surfaceCounts = {
    NORMALTYPE: 0,
    NONCOLLIDABLE: 0,
    PRESSURE: 0
  };

  const isLocalNode = (id, partName) => {
    if (!id || !nodesDict) return false;
    if (partName && nodesDict[`${partName}_${id}`]) return true;
    if (nodesDict[id]) {
      return !nodesDict[id].__partName || nodesDict[id].__partName === partName;
    }
    for (const k of Object.keys(nodesDict)) {
      if (k === id || k.endsWith(`_${id}`)) return true;
    }
    return false;
  };

  const referencedExternalNodes = new Set();

  for (const k of Object.keys(beamsDict || {}).filter(k => k !== '__meta')) {
    const b = beamsDict[k];
    if (!b || typeof b !== 'object') continue;
    const id1 = b['id1:'];
    const id2 = b['id2:'];
    const norm = normalizeBeamType(b.beamType);

    const isExternal1 = id1 ? (!isLocalNode(id1, b.__partName) || (externalNodesDict && !!externalNodesDict[id1])) : false;
    const isExternal2 = id2 ? (!isLocalNode(id2, b.__partName) || (externalNodesDict && !!externalNodesDict[id2])) : false;
    const isCrossPart = b.__isCrossPart === true || b.isVirtual === true || (id1 && id2 && (isExternal1 || isExternal2));

    if (id1 && isExternal1) referencedExternalNodes.add(id1);
    if (id2 && isExternal2) referencedExternalNodes.add(id2);

    if (isCrossPart) {
      beamCounts['|VIRTUAL'] = (beamCounts['|VIRTUAL'] || 0) + 1;
    } else if (beamCounts[norm] !== undefined) {
      beamCounts[norm]++;
    } else {
      beamCounts['|NORMAL']++;
    }
  }

  nodeCounts.external = referencedExternalNodes.size;

  for (const k of Object.keys(nodesDict || {}).filter(k => k !== '__meta')) {
    const n = nodesDict[k];
    if (!n || typeof n !== 'object') continue;
    if (n.__isExternal === true || n.__isNonActive === true) {
      nodeCounts.external++;
      continue;
    }
    const nid = n.id || n.name || k;
    const type = resolveNodeType(n, nid);
    if (nodeCounts[type] !== undefined) nodeCounts[type]++;
  }

  const countSurfs = (dict) => {
    for (const k of Object.keys(dict || {}).filter(k => k !== '__meta')) {
      const s = dict[k];
      if (!s || typeof s !== 'object') continue;
      const type = resolveSurfaceType(s);
      if (surfaceCounts[type] !== undefined) surfaceCounts[type]++;
    }
  };
  countSurfs(trianglesDict);
  countSurfs(quadsDict);

  return { beamCounts, nodeCounts, surfaceCounts };
}

/**
 * Normalizes beam type string or integer ID into standard BeamNG type string.
 */
export function normalizeBeamType(type) {
  if (type === undefined || type === null || type === '') return '|NORMAL';
  if (typeof type === 'number') {
    switch (type) {
      case 0: return '|NORMAL';
      case 1: return '|ANISOTROPIC';
      case 2: return '|BOUNDED';
      case 3: return '|PRESSURED';
      case 4: return '|LBEAM';
      case 6: return '|HYDRO';
      case 7: return '|SUPPORT';
      default: return '|NORMAL';
    }
  }
  const s = String(type).trim().toUpperCase();
  if (s.startsWith('|')) {
    const sub = s.slice(1);
    if (sub === 'TIRESIDE') return '|ANISOTROPIC';
    if (BEAM_TYPE_COLORS[`|${sub}`]) return `|${sub}`;
    return '|NORMAL';
  }
  if (s === 'TIRESIDE') return '|ANISOTROPIC';
  if (BEAM_TYPE_COLORS[`|${s}`]) return `|${s}`;
  return '|NORMAL';
}

export const SELECTION_COLOR = 0xffeb3b; // Bright yellow
export const HOVER_COLOR = 0x00e5ff;     // Cyan
export const NODE_DEFAULT_COLOR = 0xf8fafc; // Clean Diamond White / Platinum (distinct from cyan beams & indigo surfaces)
export const NODE_FIXED_COLOR = 0xff5252;   // Red

/**
 * Creates visual representations for nodes.
 */
/**
 * Helper to compute node mass statistics for heatmap visualization and legends.
 */
export function calculateNodeMassStats(nodesDict) {
  let minWeight = Infinity;
  let maxWeight = -Infinity;
  let totalWeight = 0;
  let count = 0;
  const nodeKeys = Object.keys(nodesDict || {}).filter(k => k !== '__meta');
  for (const key of nodeKeys) {
    const node = nodesDict[key];
    const w = Number(node?.nodeWeight) || 5.0;
    if (w < minWeight) minWeight = w;
    if (w > maxWeight) maxWeight = w;
    totalWeight += w;
    count++;
  }
  if (minWeight === Infinity) minWeight = 5.0;
  if (maxWeight === -Infinity) maxWeight = 5.0;
  if (maxWeight <= minWeight) maxWeight = minWeight + 1.0;
  return { minWeight, maxWeight, totalWeight, count };
}

/**
 * Helper to compute beam stiffness (beamSpring) statistics for heatmap visualization.
 */
export function calculateBeamStiffnessStats(beamsDict) {
  let minSpring = Infinity;
  let maxSpring = -Infinity;
  let count = 0;
  const beamKeys = Object.keys(beamsDict || {}).filter(k => k !== '__meta');
  for (const key of beamKeys) {
    const beam = beamsDict[key];
    if (!beam || typeof beam !== 'object') continue;
    let s = Number(beam.beamSpring);
    if (isNaN(s) || s <= 0) s = 1000000;
    if (s < minSpring) minSpring = s;
    if (s > maxSpring) maxSpring = s;
    count++;
  }
  if (minSpring === Infinity) minSpring = 500000;
  if (maxSpring === -Infinity) maxSpring = 20000000;
  if (maxSpring <= minSpring) maxSpring = minSpring + 100000;
  return { minSpring, maxSpring, count };
}

/**
 * Helper to compute beam deform / crash yield threshold statistics for heatmap visualization.
 */
export function calculateBeamDeformStats(beamsDict) {
  let minDeform = Infinity;
  let maxDeform = -Infinity;
  let count = 0;
  const beamKeys = Object.keys(beamsDict || {}).filter(k => k !== '__meta');
  for (const key of beamKeys) {
    const beam = beamsDict[key];
    if (!beam || typeof beam !== 'object') continue;
    let d = Number(beam.beamDeform);
    if (!isNaN(d) && d > 0 && d < 1e9) {
      if (d < minDeform) minDeform = d;
      if (d > maxDeform) maxDeform = d;
      count++;
    }
  }
  if (minDeform === Infinity) minDeform = 10000;
  if (maxDeform === -Infinity) maxDeform = 100000;
  if (maxDeform <= minDeform) maxDeform = minDeform + 5000;
  return { minDeform, maxDeform, count };
}

/**
 * Analyzes connected topology for a set of selected nodes.
 * Identifies directly connected beams and 1-hop neighbor nodes.
 * Supports symmetry (X-Mirror) to symmetrically include mirrored nodes and their connections.
 * 
 * @param {string|string[]|Set<string>} selectedNodeIds - Node ID or list of IDs
 * @param {object} beamsDict - Dictionary of beams (e.g. mergedBeams)
 * @param {boolean} symmetryEnabled - Whether bilateral symmetry is active
 * @returns {object} { enabled, selectedNodeIds, neighborNodeIds, connectedBeamKeys, connectedBeamsCount, neighborNodesCount }
 */
export function computeConnectedTopology(selectedNodeIds, beamsDict, symmetryEnabled = false) {
  if (!selectedNodeIds || !beamsDict) {
    return {
      enabled: false,
      selectedNodeIds: new Set(),
      neighborNodeIds: new Set(),
      connectedBeamKeys: new Set(),
      connectedBeamsCount: 0,
      neighborNodesCount: 0
    };
  }

  const rawList = selectedNodeIds instanceof Set
    ? Array.from(selectedNodeIds)
    : (Array.isArray(selectedNodeIds) ? selectedNodeIds : [selectedNodeIds]);

  const validRawList = rawList.filter(id => id && typeof id === 'string' && id.trim().length > 0);
  if (validRawList.length === 0) {
    return {
      enabled: false,
      selectedNodeIds: new Set(),
      neighborNodeIds: new Set(),
      connectedBeamKeys: new Set(),
      connectedBeamsCount: 0,
      neighborNodesCount: 0
    };
  }

  const selectedSet = new Set();
  for (const raw of validRawList) {
    selectedSet.add(raw);
    const parts = raw.split('_');
    if (parts.length > 1) {
      selectedSet.add(parts.slice(1).join('_'));
    }
    if (symmetryEnabled) {
      const baseId = parts.length > 1 ? parts.slice(1).join('_') : raw;
      const mirrorId = getSymmetricNodeId(baseId);
      if (mirrorId && mirrorId !== baseId) {
        selectedSet.add(mirrorId);
        if (parts.length > 1) {
          selectedSet.add(`${parts[0]}_${mirrorId}`);
        }
      }
    }
  }

  const neighborSet = new Set();
  const connectedBeamKeys = new Set();
  let uniqueBeamCount = 0;

  const isMatchingNode = (id, partName) => {
    if (!id) return false;
    if (selectedSet.has(id)) return true;
    if (partName && selectedSet.has(`${partName}_${id}`)) return true;
    for (const s of selectedSet) {
      if (s === id || s.endsWith(`_${id}`) || id.endsWith(`_${s}`)) return true;
    }
    return false;
  };

  const beamKeys = Object.keys(beamsDict).filter(k => k !== '__meta');
  for (const bKey of beamKeys) {
    const beam = beamsDict[bKey];
    if (!beam || typeof beam !== 'object') continue;
    const id1 = beam['id1:'];
    const id2 = beam['id2:'];
    if (!id1 || !id2) continue;

    const match1 = isMatchingNode(id1, beam.__partName);
    const match2 = isMatchingNode(id2, beam.__partName);

    if (match1 || match2) {
      uniqueBeamCount++;
      connectedBeamKeys.add(bKey);
      if (beam.__beamKey) connectedBeamKeys.add(beam.__beamKey);
      if (beam.__partName && beam.__beamKey) {
        connectedBeamKeys.add(`${beam.__partName}_${beam.__beamKey}`);
      }
      connectedBeamKeys.add(`${id1}_${id2}`);
      connectedBeamKeys.add(`${id2}_${id1}`);

      if (match1 && !match2) {
        neighborSet.add(id2);
        if (beam.__partName) neighborSet.add(`${beam.__partName}_${id2}`);
      } else if (match2 && !match1) {
        neighborSet.add(id1);
        if (beam.__partName) neighborSet.add(`${beam.__partName}_${id1}`);
      }
    }
  }

  return {
    enabled: true,
    selectedNodeIds: selectedSet,
    neighborNodeIds: neighborSet,
    connectedBeamKeys,
    connectedBeamsCount: uniqueBeamCount,
    neighborNodesCount: neighborSet.size
  };
}

export function buildNodesGroup(
  nodesDict,
  selectedNodeId = null,
  colorMode = 'type',
  highlightedNodeIds = null,
  multiSelectedNodeIds = null,
  nonActiveStyle = 'ghost',
  typeFilters = null,
  options = {}
) {
  const group = new THREE.Group();
  group.name = 'jbeam_nodes_group';

  if (!nodesDict || typeof nodesDict !== 'object') return group;

  const focusConnected = options?.focusConnected;
  const isFocusActive = Boolean(focusConnected?.enabled);

  const sphereGeometry = new THREE.SphereGeometry(0.033, 16, 16);
  const defaultMaterial = new THREE.MeshStandardMaterial({
    color: NODE_DEFAULT_COLOR,
    roughness: 0.15,
    metalness: 0.25,
    emissive: 0x222222,
    emissiveIntensity: 0.35
  });
  const selectedMaterial = new THREE.MeshStandardMaterial({
    color: SELECTION_COLOR,
    emissive: 0xffa000,
    emissiveIntensity: 0.4,
    roughness: 0.2,
    metalness: 0.1
  });
  const neighborMaterial = new THREE.MeshStandardMaterial({
    color: 0x38bdf8, // Electric Sky Blue for connected 1-hop neighbor nodes
    emissive: 0x0284c7,
    emissiveIntensity: 0.55,
    roughness: 0.25,
    metalness: 0.3
  });
  const dimmedNodeMaterial = new THREE.MeshStandardMaterial({
    color: 0x475569, // Slate gray
    roughness: 0.8,
    metalness: 0.1,
    transparent: true,
    opacity: 0.22,
    depthWrite: false
  });
  const highlightedMaterial = new THREE.MeshStandardMaterial({
    color: 0x00e5ff, // Bright radiant cyan for active flexbody driver nodes
    emissive: 0x00b4d8,
    emissiveIntensity: 0.6,
    roughness: 0.2,
    metalness: 0.2
  });
  const fixedMaterial = new THREE.MeshStandardMaterial({
    color: 0xff0033, // High-contrast Alert Red for fixed nodes
    roughness: 0.3,
    metalness: 0.2
  });

  const partMaterials = {};
  const massMaterials = new Map();
  const typeMaterials = new Map();

  // If mass heatmap mode is active, precompute min/max node weights
  let minWeight = Infinity;
  let maxWeight = -Infinity;
  const isMassMode = colorMode === 'mass' || colorMode === 'massHeatmap';
  const isTypeMode = colorMode === 'type';

  if (isMassMode) {
    const nodeKeys = Object.keys(nodesDict).filter(k => k !== '__meta');
    for (const key of nodeKeys) {
      const node = nodesDict[key];
      const w = Number(node?.nodeWeight) || 5.0;
      if (w < minWeight) minWeight = w;
      if (w > maxWeight) maxWeight = w;
    }
    if (minWeight === Infinity) minWeight = 5.0;
    if (maxWeight === -Infinity) maxWeight = 5.0;
    if (maxWeight <= minWeight) maxWeight = minWeight + 1.0;
  }

  // Thermal Turbo/Jet Color Gradient Helper: t in [0, 1]
  const getMassHeatmapColor = (weight) => {
    const t = Math.max(0, Math.min(1, (weight - minWeight) / (maxWeight - minWeight)));
    const color = new THREE.Color();
    if (t < 0.25) {
      // Blue -> Cyan
      const factor = t / 0.25;
      color.setRGB(0, 0.5 * factor, 1);
    } else if (t < 0.5) {
      // Cyan -> Green
      const factor = (t - 0.25) / 0.25;
      color.setRGB(0, 0.5 + 0.5 * factor, 1 - factor);
    } else if (t < 0.75) {
      // Green -> Yellow
      const factor = (t - 0.5) / 0.25;
      color.setRGB(factor, 1, 0);
    } else {
      // Yellow -> Red
      const factor = (t - 0.75) / 0.25;
      color.setRGB(1, 1 - factor, 0);
    }
    return color;
  };

  const multiSet = multiSelectedNodeIds instanceof Set
    ? multiSelectedNodeIds
    : new Set(Array.isArray(multiSelectedNodeIds) ? multiSelectedNodeIds : (Array.isArray(selectedNodeId) ? selectedNodeId : []));

  const nodeKeys = Object.keys(nodesDict).filter(k => k !== '__meta');
  for (const key of nodeKeys) {
    const node = nodesDict[key];
    if (!node || typeof node !== 'object') continue;

    const nodeId = node.id || node.name || key;
    const [px, py, pz] = extractNodeCoords(node);
    const worldPos = beamngToThree(px, py, pz);
    const isPrimarySelected = typeof selectedNodeId === 'string' && (
      selectedNodeId === nodeId ||
      selectedNodeId === key ||
      selectedNodeId === `${node.__partName}_${nodeId}` ||
      (node.__partName && selectedNodeId.replace(`${node.__partName}_`, '') === nodeId)
    );
    const isMultiSelected = multiSet.has(nodeId) || multiSet.has(key) ||
      (node.__partName && (
        multiSet.has(`${node.__partName}_${nodeId}`) ||
        Array.from(multiSet).some(id => id.replace(`${node.__partName}_`, '') === nodeId)
      ));
    const isSelected = isPrimarySelected || isMultiSelected;
    const isHighlighted = highlightedNodeIds && (
      highlightedNodeIds instanceof Set
        ? highlightedNodeIds.has(nodeId)
        : (Array.isArray(highlightedNodeIds) ? highlightedNodeIds.includes(nodeId) : false)
    );
    const isFixed = node.fixed === true;
    const isNonActive = node.__isNonActive === true;

    const isNeighbor = isFocusActive && (
      focusConnected.neighborNodeIds.has(nodeId) ||
      focusConnected.neighborNodeIds.has(key) ||
      (node.__partName && (
        focusConnected.neighborNodeIds.has(`${node.__partName}_${nodeId}`) ||
        Array.from(focusConnected.neighborNodeIds).some(id => id.replace(`${node.__partName}_`, '') === nodeId)
      ))
    );

    const resolvedNodeType = resolveNodeType(node, nodeId);
    if (typeFilters?.nodes && typeFilters.nodes[resolvedNodeType] === false) {
      continue;
    }

    let nodeMaterial = defaultMaterial;
    if (isSelected) {
      nodeMaterial = selectedMaterial;
    } else if (isNeighbor) {
      nodeMaterial = neighborMaterial;
    } else if (isFocusActive) {
      nodeMaterial = dimmedNodeMaterial;
    } else if (isHighlighted) {
      nodeMaterial = highlightedMaterial;
    } else if (isNonActive) {
      if (node.__componentColor && (nonActiveStyle === 'cadWire' || nonActiveStyle === 'mountPoints' || nonActiveStyle === 'crossBeams')) {
        const compHex = parseInt(node.__componentColor.replace('#', '0x'), 16);
        if (!partMaterials[compHex]) {
          partMaterials[compHex] = new THREE.MeshStandardMaterial({
            color: compHex,
            roughness: 0.35,
            metalness: 0.2
          });
        }
        nodeMaterial = partMaterials[compHex];
      } else if (nonActiveStyle === 'wireframe') {
        nodeMaterial = new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.65 });
      } else if (nonActiveStyle === 'dimmed') {
        nodeMaterial = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.6, transparent: true, opacity: 0.6 });
      } else {
        nodeMaterial = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.4, transparent: true, opacity: 0.55 });
      }
    } else if (isFixed) {
      nodeMaterial = fixedMaterial;
    } else if (isMassMode) {
      const weight = Number(node.nodeWeight) || 5.0;
      const weightBucket = Math.round(weight * 10) / 10;
      if (!massMaterials.has(weightBucket)) {
        massMaterials.set(weightBucket, new THREE.MeshStandardMaterial({
          color: getMassHeatmapColor(weightBucket),
          roughness: 0.35,
          metalness: 0.2
        }));
      }
      nodeMaterial = massMaterials.get(weightBucket);
    } else if (colorMode === 'part' && node.__partColor) {
      if (!partMaterials[node.__partColor]) {
        partMaterials[node.__partColor] = new THREE.MeshStandardMaterial({
          color: parseInt(node.__partColor.replace('#', '0x'), 16),
          roughness: 0.3,
          metalness: 0.2
        });
      }
      nodeMaterial = partMaterials[node.__partColor];
    } else if (colorMode === 'type') {
      // Differentiate Node Physics Types with distinct non-overlapping colors
      if (resolvedNodeType === 'wheelHub') {
        if (!typeMaterials.has('wheelHub')) {
          typeMaterials.set('wheelHub', new THREE.MeshStandardMaterial({
            color: 0xeab308, // Radiant Sun Gold for Wheel Hubs & Spindles
            roughness: 0.25,
            metalness: 0.4
          }));
        }
        nodeMaterial = typeMaterials.get('wheelHub');
      } else if (resolvedNodeType === 'mount') {
        if (!typeMaterials.has('mount')) {
          typeMaterials.set('mount', new THREE.MeshStandardMaterial({
            color: 0xef4444, // Vivid Crimson Red for Drivetrain & Engine Mounts
            roughness: 0.25,
            metalness: 0.3
          }));
        }
        nodeMaterial = typeMaterials.get('mount');
      } else if (resolvedNodeType === 'nonCollidable') {
        if (!typeMaterials.has('nonCollidable')) {
          typeMaterials.set('nonCollidable', new THREE.MeshStandardMaterial({
            color: 0x64748b, // Graphite / Slate Grey for Non-Collidable nodes
            roughness: 0.6,
            transparent: true,
            opacity: 0.45
          }));
        }
        nodeMaterial = typeMaterials.get('nonCollidable');
      } else if (resolvedNodeType === 'external') {
        if (!typeMaterials.has('external')) {
          typeMaterials.set('external', new THREE.MeshStandardMaterial({
            color: 0xc084fc, // Electric Orchid Purple for External anchor reference nodes
            roughness: 0.25,
            metalness: 0.3
          }));
        }
        nodeMaterial = typeMaterials.get('external');
      } else if (resolvedNodeType === 'selfCollision') {
        if (!typeMaterials.has('selfCollision')) {
          typeMaterials.set('selfCollision', new THREE.MeshStandardMaterial({
            color: 0x38bdf8, // Electric Sky Blue for Self-Colliding body nodes
            roughness: 0.25,
            metalness: 0.2
          }));
        }
        nodeMaterial = typeMaterials.get('selfCollision');
      } else {
        if (!typeMaterials.has('collisionOnly')) {
          typeMaterials.set('collisionOnly', new THREE.MeshStandardMaterial({
            color: 0xf8fafc, // Diamond White / Platinum for Standard Collision (pops on colored beams)
            roughness: 0.3,
            metalness: 0.3
          }));
        }
        nodeMaterial = typeMaterials.get('collisionOnly');
      }
    }

    const mesh = new THREE.Mesh(sphereGeometry, nodeMaterial);
    mesh.position.copy(worldPos);
    mesh.name = `node_${nodeId}`;
    mesh.userData = {
      type: 'node',
      id: nodeId,
      nodeData: node,
      initialBeamngPos: [px, py, pz],
      isHighlighted: Boolean(isHighlighted),
      isNonActive: Boolean(isNonActive),
      isNeighborNode: Boolean(isNeighbor),
      isDimmedByFocus: Boolean(isFocusActive && !isSelected && !isNeighbor),
      partName: node.__partName,
      tabTitle: node.__tabTitle || node.__partName,
      uniqueKey: `${node.__partName || (node.__isNonActive ? 'bg' : 'active')}_${nodeId}`,
      componentColor: node.__componentColor,
      componentIndex: node.__componentIndex
    };

    let massScale = 1.0;
    if (isMassMode) {
      const weight = Number(node.nodeWeight) || 5.0;
      const t = Math.max(0, Math.min(1, (weight - minWeight) / (maxWeight - minWeight)));
      massScale = 0.75 + 1.25 * t; // Dynamic radius: 0.75x for light up to 2.0x for heavy nodes
    }

    if (isSelected) {
      mesh.scale.set(massScale * 1.5, massScale * 1.5, massScale * 1.5);
    } else if (isNeighbor) {
      mesh.scale.set(massScale * 1.25, massScale * 1.25, massScale * 1.25);
    } else if (isFocusActive) {
      mesh.scale.set(massScale * 0.65, massScale * 0.65, massScale * 0.65);
    } else if (isHighlighted) {
      mesh.scale.set(massScale * 1.35, massScale * 1.35, massScale * 1.35);
    } else if (isMassMode) {
      mesh.scale.set(massScale, massScale, massScale);
    }

    group.add(mesh);
  }

  return group;
}

/**
 * Creates billboard text sprites for node names.
 */
export function buildNodeLabelsGroup(nodesDict, selectedNodeId = null, highlightedNodeIds = null, options = {}) {
  const group = new THREE.Group();
  group.name = 'jbeam_node_labels_group';

  if (!nodesDict || typeof nodesDict !== 'object') return group;
  if (typeof document === 'undefined') return group;

  const focusConnected = options?.focusConnected;
  const isFocusActive = Boolean(focusConnected?.enabled);

  const nodeKeys = Object.keys(nodesDict).filter(k => k !== '__meta');
  
  // Prioritize selected and highlighted nodes
  const priorityKeys = [];
  const normalKeys = [];
  for (const k of nodeKeys) {
    const node = nodesDict[k];
    const nId = node?.id || node?.name || k;
    const isPri = selectedNodeId === nId || (highlightedNodeIds && (
      highlightedNodeIds instanceof Set ? highlightedNodeIds.has(nId) : highlightedNodeIds.includes(nId)
    )) || (isFocusActive && (focusConnected.selectedNodeIds.has(nId) || focusConnected.neighborNodeIds.has(nId)));
    if (isPri) priorityKeys.push(k);
    else if (!isFocusActive) normalKeys.push(k);
  }
  const keysToRender = isFocusActive ? priorityKeys : [...priorityKeys, ...normalKeys].slice(0, 300);

  for (const key of keysToRender) {
    const node = nodesDict[key];
    if (!node || typeof node !== 'object') continue;

    const nodeId = node.id || node.name || key;
    const [px, py, pz] = extractNodeCoords(node);
    const worldPos = beamngToThree(px, py, pz);
    const isSelected = selectedNodeId === nodeId;
    const isHighlighted = highlightedNodeIds && (
      highlightedNodeIds instanceof Set
        ? highlightedNodeIds.has(nodeId)
        : (Array.isArray(highlightedNodeIds) ? highlightedNodeIds.includes(nodeId) : false)
    );

    // Create canvas texture for label
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 36;
    const ctx = canvas.getContext('2d');

    if (isSelected) {
      ctx.fillStyle = 'rgba(255, 235, 59, 0.95)';
    } else if (isHighlighted) {
      ctx.fillStyle = 'rgba(0, 229, 255, 0.92)';
    } else {
      ctx.fillStyle = 'rgba(30, 30, 36, 0.82)';
    }
    ctx.roundRect(2, 2, 124, 32, 6);
    ctx.fill();

    if (isSelected) {
      ctx.strokeStyle = '#ff6f00';
    } else if (isHighlighted) {
      ctx.strokeStyle = '#0097a7';
    } else {
      ctx.strokeStyle = '#555';
    }
    ctx.lineWidth = 2;
    ctx.roundRect(2, 2, 124, 32, 6);
    ctx.stroke();

    ctx.fillStyle = (isSelected || isHighlighted) ? '#000000' : '#ffffff';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(nodeId, 64, 18);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      transparent: true
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.position.copy(worldPos);
    sprite.position.y += 0.055; // Offset slightly above node sphere
    sprite.scale.set(0.18, 0.05, 1);
    group.add(sprite);
  }

  return group;
}

/**
 * Generates vertex coordinate pairs for technical CAD Dash-Dot chain lines (— · — · —).
 * Explicitly differentiates external inter-part linkages from standard dashed support beams (- - -).
 */
export function generateDashDotPositions(pos1, pos2, dashLen = 0.045, gapLen = 0.016, dotLen = 0.010) {
  const dir = new THREE.Vector3().subVectors(pos2, pos1);
  const totalLen = dir.length();
  if (totalLen <= 0.001) {
    return [pos1.x, pos1.y, pos1.z, pos2.x, pos2.y, pos2.z];
  }
  dir.normalize();

  const coords = [];
  if (totalLen < 0.04) {
    const mid = pos1.clone().lerp(pos2, 0.65);
    coords.push(pos1.x, pos1.y, pos1.z, mid.x, mid.y, mid.z);
    coords.push(mid.x, mid.y, mid.z, pos2.x, pos2.y, pos2.z);
    return coords;
  }

  let current = 0;
  while (current < totalLen) {
    // 1. Dash
    const dashEnd = Math.min(current + dashLen, totalLen);
    const p1 = pos1.clone().addScaledVector(dir, current);
    const p2 = pos1.clone().addScaledVector(dir, dashEnd);
    coords.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);

    current += dashLen + gapLen;
    if (current >= totalLen) break;

    // 2. Dot
    const dotEnd = Math.min(current + dotLen, totalLen);
    const p3 = pos1.clone().addScaledVector(dir, current);
    const p4 = pos1.clone().addScaledVector(dir, dotEnd);
    coords.push(p3.x, p3.y, p3.z, p4.x, p4.y, p4.z);

    current += dotLen + gapLen;
  }
  return coords;
}

/**
 * Creates line segments for beams, color-coded by type or assembly part.
 * Supports specialized BeamNG physics beam types:
 *  - |SUPPORT: Rendered as dashed Amber line segments (LineDashedMaterial)
 *  - |HYDRO: Rendered as Electric Blue lines with 3D actuator sleeve meshes
 *  - |BOUNDED: Vivid Purple limit beams
 *  - |ANISOTROPIC / |TIRESIDE: Coral Red directional stiffness
 *  - |NORMAL: Standard chassis & structural members (Emerald Green)
 *  - |VIRTUAL: External inter-part mount linkages rendered as technical Dash-Dot chain lines
 */
export function buildBeamsGroup(
  beamsDict,
  nodesDict,
  selectedBeamKey = null,
  colorMode = 'type',
  externalNodesDict = {},
  nonActiveStyle = 'ghost',
  selectedBeamInfo = null,
  typeFilters = null,
  options = {}
) {
  const group = new THREE.Group();
  group.name = 'jbeam_beams_group';

  if (!beamsDict || !nodesDict) return group;

  const focusConnected = options?.focusConnected;
  const isFocusActive = Boolean(focusConnected?.enabled);

  // Solid line segments (Normal, Hydro, Bounded, Anisotropic, etc.)
  const positions = [];
  const colors = [];
  let solidVertexIndex = 0;

  // Dashed line segments (Support anti-inversion beams)
  const supportPositions = [];
  const supportColors = [];
  let supportVertexIndex = 0;

  // Technical CAD Dash-Dot chain line segments (External Chassis Mount Linkages)
  const virtualPositions = [];
  const virtualColors = [];
  let virtualVertexIndex = 0;
  const externalAnchorPositions = [];

  // Non-active opened files ghost lines
  const nonActivePositions = [];

  const isStiffnessMode = colorMode === 'stiffness' || colorMode === 'stiffnessHeatmap';
  const isDeformMode = colorMode === 'deform' || colorMode === 'deformHeatmap';
  const isTypeMode = colorMode === 'type';

  let minSpring = Infinity;
  let maxSpring = -Infinity;
  let minDeform = Infinity;
  let maxDeform = -Infinity;

  if (isStiffnessMode || isDeformMode) {
    const bKeys = Object.keys(beamsDict).filter(k => k !== '__meta');
    for (const bk of bKeys) {
      const b = beamsDict[bk];
      if (!b || typeof b !== 'object') continue;
      if (isStiffnessMode) {
        let s = Number(b.beamSpring);
        if (isNaN(s) || s <= 0) s = 1000000;
        if (s < minSpring) minSpring = s;
        if (s > maxSpring) maxSpring = s;
      }
      if (isDeformMode) {
        let d = Number(b.beamDeform);
        if (!isNaN(d) && d > 0 && d < 1e9) {
          if (d < minDeform) minDeform = d;
          if (d > maxDeform) maxDeform = d;
        }
      }
    }
    if (minSpring === Infinity) minSpring = 500000;
    if (maxSpring === -Infinity) maxSpring = 20000000;
    if (maxSpring <= minSpring) maxSpring = minSpring + 100000;

    if (minDeform === Infinity) minDeform = 10000;
    if (maxDeform === -Infinity) maxDeform = 100000;
    if (maxDeform <= minDeform) maxDeform = minDeform + 5000;
  }

  const logMinSpring = Math.log10(Math.max(1000, minSpring));
  const logMaxSpring = Math.log10(Math.max(logMinSpring + 0.1, maxSpring));

  const getStiffnessHeatmapColor = (spring) => {
    const s = Math.max(1000, Number(spring) || 1000000);
    const logS = Math.log10(s);
    const t = Math.max(0, Math.min(1, (logS - logMinSpring) / (logMaxSpring - logMinSpring)));
    const c = new THREE.Color();
    if (t < 0.25) {
      // Soft compliance: Blue -> Cyan
      const factor = t / 0.25;
      c.setRGB(0, 0.4 + 0.6 * factor, 1);
    } else if (t < 0.5) {
      // Light structural: Cyan -> Green
      const factor = (t - 0.25) / 0.25;
      c.setRGB(0, 1, 1 - factor);
    } else if (t < 0.75) {
      // Medium structural: Green -> Yellow
      const factor = (t - 0.5) / 0.25;
      c.setRGB(factor, 1, 0);
    } else {
      // Rigid chassis & hubs: Yellow -> Crimson Red
      const factor = (t - 0.75) / 0.25;
      c.setRGB(1, 1 - factor * 0.85, 0.1 * (1 - factor));
    }
    return c;
  };

  const getDeformHeatmapColor = (deform, strength) => {
    // Unbreakable or very high strength (FLT_MAX)
    const isUnbreakable = deform === 'FLT_MAX' || strength === 'FLT_MAX' || Number(deform) >= 1e9 || Number(strength) >= 1e9;
    if (isUnbreakable) {
      return new THREE.Color(0x00e5ff); // Electric Cyan for unbreakable safety cell
    }
    const d = Number(deform) || 25000;
    const t = Math.max(0, Math.min(1, (d - minDeform) / (maxDeform - minDeform)));
    const c = new THREE.Color();
    if (t < 0.33) {
      // Sacrificial crumple zone: Red -> Orange
      const factor = t / 0.33;
      c.setRGB(1, 0.3 * factor, 0);
    } else if (t < 0.66) {
      // Moderate deform: Orange -> Amber/Yellow
      const factor = (t - 0.33) / 0.33;
      c.setRGB(1, 0.3 + 0.7 * factor, 0);
    } else {
      // High resistance: Yellow -> Lime Green
      const factor = (t - 0.66) / 0.34;
      c.setRGB(1 - factor * 0.8, 1, 0.2 * factor);
    }
    return c;
  };

  const hydroSegments = [];
  const beamSegments = [];
  const colorHelper = new THREE.Color();
  let selectedEndpoints = null;

  const resolvePartNode = (partName, id) => {
    if (!id || !nodesDict) return null;
    if (partName && nodesDict[`${partName}_${id}`]) {
      return { node: nodesDict[`${partName}_${id}`], isLocal: true };
    }
    if (nodesDict[id]) {
      const isLocal = !nodesDict[id].__partName || nodesDict[id].__partName === partName;
      return { node: nodesDict[id], isLocal };
    }
    for (const k of Object.keys(nodesDict)) {
      if (k.endsWith(`_${id}`) || k === id) {
        return { node: nodesDict[k], isLocal: false };
      }
    }
    if (externalNodesDict && externalNodesDict[id]) {
      return { node: externalNodesDict[id], isLocal: false };
    }
    return null;
  };

  const beamKeys = Object.keys(beamsDict).filter(k => k !== '__meta');
  for (const key of beamKeys) {
    const beam = beamsDict[key];
    if (!beam || typeof beam !== 'object') continue;

    const id1 = beam['id1:'];
    const id2 = beam['id2:'];
    if (!id1 || !id2) continue;

    const res1 = resolvePartNode(beam.__partName, id1);
    const res2 = resolvePartNode(beam.__partName, id2);
    if (!res1 || !res2) continue;

    const node1 = res1.node;
    const node2 = res2.node;
    const isCrossPart = !res1.isLocal || !res2.isLocal;

    const [x1, y1, z1] = extractNodeCoords(node1);
    const [x2, y2, z2] = extractNodeCoords(node2);
    const pos1 = beamngToThree(x1, y1, z1);
    const pos2 = beamngToThree(x2, y2, z2);

    const isSelected = (selectedBeamKey && (
      selectedBeamKey === key ||
      selectedBeamKey === beam.__beamKey ||
      String(selectedBeamKey) === String(beam.__beamKey) ||
      (beam.__partName && selectedBeamKey === `${beam.__partName}_${beam.__beamKey}`) ||
      (beam.__partName && key === `${beam.__partName}_${selectedBeamKey}`) ||
      selectedBeamKey === `${id1}_${id2}` ||
      selectedBeamKey === `${id2}_${id1}`
    )) || (selectedBeamInfo && (
      (selectedBeamInfo.beamKey && (
        selectedBeamInfo.beamKey === key ||
        selectedBeamInfo.beamKey === beam.__beamKey ||
        String(selectedBeamInfo.beamKey) === String(beam.__beamKey) ||
        (beam.__partName && selectedBeamInfo.beamKey === `${beam.__partName}_${beam.__beamKey}`) ||
        (beam.__partName && key === `${beam.__partName}_${selectedBeamInfo.beamKey}`) ||
        selectedBeamInfo.beamKey === `${id1}_${id2}` ||
        selectedBeamInfo.beamKey === `${id2}_${id1}`
      )) ||
      (selectedBeamInfo.partName && beam.__partName && selectedBeamInfo.partName === beam.__partName && (
        selectedBeamInfo.beamKey === key ||
        selectedBeamInfo.beamKey === beam.__beamKey ||
        String(selectedBeamInfo.beamKey) === String(beam.__beamKey)
      )) ||
      (selectedBeamInfo.id1 && selectedBeamInfo.id2 && (
        (selectedBeamInfo.id1 === id1 && selectedBeamInfo.id2 === id2) ||
        (selectedBeamInfo.id1 === id2 && selectedBeamInfo.id2 === id1)
      )) ||
      (selectedBeamInfo.beam && (
        (selectedBeamInfo.beam['id1:'] === id1 && selectedBeamInfo.beam['id2:'] === id2) ||
        (selectedBeamInfo.beam['id1:'] === id2 && selectedBeamInfo.beam['id2:'] === id1)
      ))
    ));

    if (isSelected) {
      selectedEndpoints = { pos1, pos2 };
    }

    const isConnectedBeam = isFocusActive && (
      focusConnected.connectedBeamKeys.has(key) ||
      (beam.__beamKey && focusConnected.connectedBeamKeys.has(beam.__beamKey)) ||
      (beam.__partName && beam.__beamKey && focusConnected.connectedBeamKeys.has(`${beam.__partName}_${beam.__beamKey}`)) ||
      focusConnected.connectedBeamKeys.has(`${id1}_${id2}`) ||
      focusConnected.connectedBeamKeys.has(`${id2}_${id1}`) ||
      focusConnected.selectedNodeIds.has(id1) ||
      focusConnected.selectedNodeIds.has(id2)
    );

    const normType = isCrossPart ? '|VIRTUAL' : normalizeBeamType(beam.beamType);
    if (typeFilters?.beams && typeFilters.beams[normType] === false) {
      continue;
    }

    const isSupport = normType === '|SUPPORT';
    const isHydro = normType === '|HYDRO';
    const isNonActive = beam.__isNonActive === true;

    // Cross-part beams connecting to external parts ALWAYS render with technical Dash-Dot chain lines (— · — · —)!
    if (isCrossPart) {
      const dashDotCoords = generateDashDotPositions(pos1, pos2);
      let crossColor;
      if (isSelected) {
        crossColor = new THREE.Color(SELECTION_COLOR);
      } else if (colorMode === 'type') {
        crossColor = new THREE.Color(BEAM_TYPE_COLORS['|VIRTUAL'] || 0xc084fc);
      } else if (colorMode === 'default') {
        // Distinct Electric Orchid Purple in Normal View so external linkages NEVER clash with Cyan normal or Amber support beams
        crossColor = new THREE.Color(0xc084fc);
      } else {
        crossColor = nonActiveStyle === 'crossBeams'
          ? new THREE.Color(0xffd600)
          : (isNonActive ? new THREE.Color(0xd97706) : new THREE.Color(0xc084fc));
      }

      if (isFocusActive && !isConnectedBeam && !isSelected) {
        crossColor.multiplyScalar(0.14);
      }

      const numPoints = dashDotCoords.length / 3;
      for (let ci = 0; ci < dashDotCoords.length; ci += 3) {
        virtualPositions.push(dashDotCoords[ci], dashDotCoords[ci + 1], dashDotCoords[ci + 2]);
        virtualColors.push(crossColor.r, crossColor.g, crossColor.b);
      }

      const extPos = !res1.isLocal ? pos1 : pos2;
      externalAnchorPositions.push({ pos: extPos, color: crossColor });

      beamSegments.push({
        key,
        id1,
        id2,
        partName: beam.__partName,
        beamKey: beam.__beamKey || key,
        beamType: '|VIRTUAL',
        isSupport: false,
        isVirtual: true,
        isNonActive,
        isConnectedByFocus: Boolean(isConnectedBeam),
        externalNodeId: !res1.isLocal ? id1 : id2,
        beamData: beam,
        pos1,
        pos2,
        vertexIdx1: virtualVertexIndex,
        vertexIdx2: virtualVertexIndex + numPoints
      });
      virtualVertexIndex += numPoints;
      continue;
    }

    if (isNonActive) {
      if (nonActiveStyle === 'cadWire' || nonActiveStyle === 'mountPoints' || nonActiveStyle === 'crossBeams') {
        if (isSelected) {
          colorHelper.setHex(SELECTION_COLOR);
        } else {
          const compHex = parseInt((beam.__componentColor || '#f59e0b').replace('#', '0x'), 16);
          colorHelper.setHex(compHex);
          if (nonActiveStyle === 'mountPoints') {
            colorHelper.multiplyScalar(0.35); // Dim non-active parts so mounting joints stand out vividly
          } else if (nonActiveStyle === 'crossBeams') {
            colorHelper.multiplyScalar(0.40); // Dim non-active parts so cross-part beams stand out
          }
          if (isFocusActive && !isConnectedBeam && !isSelected) {
            colorHelper.multiplyScalar(0.14);
          }
        }

        positions.push(pos1.x, pos1.y, pos1.z);
        positions.push(pos2.x, pos2.y, pos2.z);
        colors.push(colorHelper.r, colorHelper.g, colorHelper.b);
        colors.push(colorHelper.r, colorHelper.g, colorHelper.b);

        beamSegments.push({
          key,
          id1,
          id2,
          partName: beam.__partName,
          beamKey: beam.__beamKey || key,
          beamType: normType,
          isSupport: false,
          isVirtual: false,
          isNonActive: true,
          isConnectedByFocus: Boolean(isConnectedBeam),
          componentColor: beam.__componentColor,
          beamData: beam,
          pos1,
          pos2,
          vertexIdx1: solidVertexIndex,
          vertexIdx2: solidVertexIndex + 1
        });
        solidVertexIndex += 2;
        continue;
      }

      // Legacy fallback (ghost / wireframe / dimmed) for backwards compatibility
      nonActivePositions.push(pos1.x, pos1.y, pos1.z, pos2.x, pos2.y, pos2.z);
      beamSegments.push({
        key,
        id1,
        id2,
        partName: beam.__partName,
        beamKey: beam.__beamKey || key,
        beamType: normType,
        isSupport,
        isVirtual: false,
        isNonActive: true,
        beamData: beam,
        pos1,
        pos2
      });
      continue;
    }

    let hexColor = 0x38bdf8;
    if (isSelected) {
      hexColor = SELECTION_COLOR;
      colorHelper.setHex(hexColor);
    } else if (colorMode === 'part' && beam.__partColor) {
      hexColor = parseInt(beam.__partColor.replace('#', '0x'), 16);
      colorHelper.setHex(hexColor);
    } else if (isStiffnessMode) {
      colorHelper.copy(getStiffnessHeatmapColor(beam.beamSpring));
    } else if (isDeformMode) {
      colorHelper.copy(getDeformHeatmapColor(beam.beamDeform, beam.beamStrength));
    } else if (isTypeMode) {
      if (BEAM_TYPE_COLORS[normType]) {
        hexColor = BEAM_TYPE_COLORS[normType];
      } else {
        hexColor = BEAM_TYPE_COLORS['|NORMAL'];
      }
      colorHelper.setHex(hexColor);
    } else {
      // Normal / Default creation view: clear vivid green wireframe (distinct from White nodes and Blue surfaces)
      // Support beams receive dashed warm amber tone for visual differentiation
      hexColor = isSupport ? 0xf59e0b : 0x22c55e;
      colorHelper.setHex(hexColor);
    }

    if (isFocusActive && !isConnectedBeam && !isSelected) {
      colorHelper.multiplyScalar(0.14);
    }

    if (isCrossPart) {
      virtualPositions.push(pos1.x, pos1.y, pos1.z);
      virtualPositions.push(pos2.x, pos2.y, pos2.z);
      virtualColors.push(colorHelper.r, colorHelper.g, colorHelper.b);
      virtualColors.push(colorHelper.r, colorHelper.g, colorHelper.b);

      beamSegments.push({
        key,
        id1,
        id2,
        partName: beam.__partName,
        beamKey: beam.__beamKey || key,
        beamType: '|VIRTUAL',
        isSupport: false,
        isVirtual: true,
        externalNodeId: !isLocal1 ? id1 : id2,
        beamData: beam,
        pos1,
        pos2,
        vertexIdx1: virtualVertexIndex,
        vertexIdx2: virtualVertexIndex + 1
      });
      virtualVertexIndex += 2;
    } else if (isSupport) {
      supportPositions.push(pos1.x, pos1.y, pos1.z);
      supportPositions.push(pos2.x, pos2.y, pos2.z);
      supportColors.push(colorHelper.r, colorHelper.g, colorHelper.b);
      supportColors.push(colorHelper.r, colorHelper.g, colorHelper.b);

      beamSegments.push({
        key,
        id1,
        id2,
        partName: beam.__partName,
        beamKey: beam.__beamKey || key,
        beamType: normType,
        isSupport: true,
        isVirtual: false,
        isConnectedByFocus: Boolean(isConnectedBeam),
        beamData: beam,
        pos1,
        pos2,
        vertexIdx1: supportVertexIndex,
        vertexIdx2: supportVertexIndex + 1
      });
      supportVertexIndex += 2;
    } else {
      positions.push(pos1.x, pos1.y, pos1.z);
      positions.push(pos2.x, pos2.y, pos2.z);
      colors.push(colorHelper.r, colorHelper.g, colorHelper.b);
      colors.push(colorHelper.r, colorHelper.g, colorHelper.b);

      const segment = {
        key,
        id1,
        id2,
        partName: beam.__partName,
        beamKey: beam.__beamKey || key,
        beamType: normType,
        isSupport: false,
        isVirtual: false,
        isConnectedByFocus: Boolean(isConnectedBeam),
        beamData: beam,
        pos1,
        pos2,
        vertexIdx1: solidVertexIndex,
        vertexIdx2: solidVertexIndex + 1
      };
      beamSegments.push(segment);
      if (isHydro) {
        hydroSegments.push(segment);
      }
      solidVertexIndex += 2;
    }
  }

  // 1. Regular solid line segments
  if (positions.length > 0) {
    const geometry = new THREE.BufferGeometry();
    const posAttr = new THREE.Float32BufferAttribute(positions, 3);
    geometry.setAttribute('position', posAttr);
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      linewidth: 1.5,
      transparent: true,
      opacity: isTypeMode ? 0.92 : 0.52
    });

    const lines = new THREE.LineSegments(geometry, material);
    lines.name = 'beams_lines';
    group.add(lines);

    group.userData.positionAttr = posAttr;
  }

  // 2. Dashed Support Beams (Anti-Inversion)
  if (supportPositions.length > 0) {
    const supportGeometry = new THREE.BufferGeometry();
    const supportPosAttr = new THREE.Float32BufferAttribute(supportPositions, 3);
    supportGeometry.setAttribute('position', supportPosAttr);
    supportGeometry.setAttribute('color', new THREE.Float32BufferAttribute(supportColors, 3));

    const dashedMat = new THREE.LineDashedMaterial({
      vertexColors: true,
      dashSize: 0.04,
      gapSize: 0.025,
      linewidth: 1.5,
      transparent: true,
      opacity: isTypeMode ? 0.92 : 0.50
    });

    const supportLines = new THREE.LineSegments(supportGeometry, dashedMat);
    supportLines.computeLineDistances();
    supportLines.name = 'support_beams_lines';
    group.add(supportLines);

    group.userData.supportPosAttr = supportPosAttr;
    group.userData.supportLines = supportLines;
  }

  // 3. Technical CAD Dash-Dot Chain Lines (External Chassis Mount Linkages: — · — · —)
  if (virtualPositions.length > 0) {
    const virtualGeometry = new THREE.BufferGeometry();
    const virtualPosAttr = new THREE.Float32BufferAttribute(virtualPositions, 3);
    virtualGeometry.setAttribute('position', virtualPosAttr);
    virtualGeometry.setAttribute('color', new THREE.Float32BufferAttribute(virtualColors, 3));

    const virtualMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      linewidth: 2,
      transparent: true,
      opacity: isTypeMode ? 0.95 : 0.70
    });

    const virtualLines = new THREE.LineSegments(virtualGeometry, virtualMat);
    virtualLines.name = 'virtual_beams_lines';
    group.add(virtualLines);

    group.userData.virtualPosAttr = virtualPosAttr;
    group.userData.virtualLines = virtualLines;
  }

  // 4. External Mount Anchor Rings (Distinct Visual Indicators on Foreign Nodes)
  if (externalAnchorPositions.length > 0) {
    const anchorGroup = new THREE.Group();
    anchorGroup.name = 'virtual_mount_anchors';

    const uniqueAnchors = new Map();
    for (const item of externalAnchorPositions) {
      const aKey = `${item.pos.x.toFixed(3)}_${item.pos.y.toFixed(3)}_${item.pos.z.toFixed(3)}`;
      if (!uniqueAnchors.has(aKey)) {
        uniqueAnchors.set(aKey, item);
      }
    }

    const torusGeom = new THREE.TorusGeometry(0.018, 0.003, 8, 16);
    for (const [, item] of uniqueAnchors) {
      const ringMat = new THREE.MeshBasicMaterial({
        color: item.color.getHex(),
        transparent: true,
        opacity: isTypeMode ? 0.95 : 0.80
      });
      const ringMesh = new THREE.Mesh(torusGeom, ringMat);
      ringMesh.position.copy(item.pos);
      ringMesh.rotation.x = Math.PI / 2; // Flat horizontal ring around external node
      anchorGroup.add(ringMesh);
    }
    group.add(anchorGroup);
  }

  // 4. Non-Active Opened Files Ghost / Wireframe Beams
  if (nonActivePositions.length > 0) {
    const naGeom = new THREE.BufferGeometry();
    naGeom.setAttribute('position', new THREE.Float32BufferAttribute(nonActivePositions, 3));
    let naMat;
    if (nonActiveStyle === 'wireframe') {
      naMat = new THREE.LineBasicMaterial({
        color: 0x94a3b8,
        linewidth: 1.5,
        transparent: true,
        opacity: 0.65
      });
    } else if (nonActiveStyle === 'dimmed') {
      naMat = new THREE.LineBasicMaterial({
        color: 0x64748b,
        linewidth: 1,
        transparent: true,
        opacity: 0.55
      });
    } else {
      // Default: Ghost mode (holographic sky blue tint)
      naMat = new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        linewidth: 1.5,
        transparent: true,
        opacity: 0.5
      });
    }
    const naLines = new THREE.LineSegments(naGeom, naMat);
    naLines.name = 'non_active_ghost_beams';
    group.add(naLines);
  }

  // 5. Hydro Actuators (Steering & Suspension Cylinders)
  if (hydroSegments.length > 0) {
    const hydroGroup = new THREE.Group();
    hydroGroup.name = 'hydro_actuators_group';
    const upVec = new THREE.Vector3(0, 1, 0);

    for (const h of hydroSegments) {
      const dist = h.pos1.distanceTo(h.pos2);
      const sleeveLen = Math.min(0.12, Math.max(0.035, dist * 0.3));
      const sleeveRadius = 0.014;
      const cylGeom = new THREE.CylinderGeometry(sleeveRadius, sleeveRadius, sleeveLen, 8);
      const cylMat = new THREE.MeshStandardMaterial({
        color: 0x00e5ff,
        metalness: 0.8,
        roughness: 0.25,
        emissive: 0x003355,
        emissiveIntensity: 0.35,
        transparent: Boolean(isFocusActive && !h.isConnectedByFocus),
        opacity: isFocusActive && !h.isConnectedByFocus ? 0.25 : 1.0
      });
      const cylMesh = new THREE.Mesh(cylGeom, cylMat);
      const mid = new THREE.Vector3().addVectors(h.pos1, h.pos2).multiplyScalar(0.5);
      cylMesh.position.copy(mid);
      cylMesh.quaternion.setFromUnitVectors(upVec, new THREE.Vector3().subVectors(h.pos2, h.pos1).normalize());
      hydroGroup.add(cylMesh);
    }
    group.add(hydroGroup);
  }

  group.userData.beamSegments = beamSegments;

  // 4. High-visibility glowing beam cylinder and endpoint spheres for selected beam
  if (selectedEndpoints) {
    const { pos1, pos2 } = selectedEndpoints;
    const distance = pos1.distanceTo(pos2);
    const cylGroup = new THREE.Group();
    cylGroup.name = 'selected_beam_highlight';

    // 4a. Outer Vibrant Gold Cylinder (DepthTest false to always stay visible on top)
    const cylGeom = new THREE.CylinderGeometry(0.024, 0.024, distance, 12);
    const cylMat = new THREE.MeshBasicMaterial({
      color: SELECTION_COLOR,
      depthTest: false,
      transparent: true,
      opacity: 0.95
    });
    const cylMesh = new THREE.Mesh(cylGeom, cylMat);
    cylMesh.renderOrder = 998;

    // 4b. Inner Crisp White Core Line for intense contrast
    const coreGeom = new THREE.CylinderGeometry(0.009, 0.009, distance, 8);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      depthTest: false,
      transparent: true,
      opacity: 0.95
    });
    const coreMesh = new THREE.Mesh(coreGeom, coreMat);
    coreMesh.renderOrder = 999;

    const midpoint = new THREE.Vector3().addVectors(pos1, pos2).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(pos2, pos1).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

    cylMesh.position.copy(midpoint);
    cylMesh.quaternion.copy(quat);
    coreMesh.position.copy(midpoint);
    coreMesh.quaternion.copy(quat);

    cylGroup.add(cylMesh);
    cylGroup.add(coreMesh);

    // 4c. Highlight spheres at both endpoint nodes so the connected nodes are immediately recognizable
    const endGeom = new THREE.SphereGeometry(0.034, 12, 12);
    const endMat = new THREE.MeshBasicMaterial({
      color: SELECTION_COLOR,
      depthTest: false,
      transparent: true,
      opacity: 0.95
    });
    const end1 = new THREE.Mesh(endGeom, endMat);
    end1.position.copy(pos1);
    end1.renderOrder = 1000;
    const end2 = new THREE.Mesh(endGeom, endMat);
    end2.position.copy(pos2);
    end2.renderOrder = 1000;

    cylGroup.add(end1);
    cylGroup.add(end2);

    group.add(cylGroup);
  }

  return group;
}

/**
 * Calculates normal vector and surface area for 3 points in 3D space.
 */
function calcTriNormalAndArea(p1, p2, p3) {
  const v1 = new THREE.Vector3().subVectors(p2, p1);
  const v2 = new THREE.Vector3().subVectors(p3, p1);
  const cross = new THREE.Vector3().crossVectors(v1, v2);
  const len = cross.length();
  const area = len * 0.5;
  const normal = len > 1e-6 ? cross.multiplyScalar(1 / len) : new THREE.Vector3(0, 1, 0);
  return { normal, area };
}

/**
 * Creates translucent meshes for aerodynamic / collision triangles and quads.
 * Supports Blender-style Face Orientation (Blue = Outward/Front, Red = Inward/Back),
 * normal vector arrows, and selected surface highlighting.
 */
export function buildTrianglesGroup(trianglesDict, nodesDict, quadsDict = null, options = {}) {
  const group = new THREE.Group();
  group.name = 'jbeam_surfaces_group';

  if (!nodesDict) return group;

  const {
    faceOrientation = false,
    showNormals = false,
    selectedSurface = null, // { type: 'triangle' | 'quad', nodes: string[] }
    nonActiveViewType = 'ghost',
    colorMode = 'default',
    typeFilters = null,
    focusConnected = null
  } = options;

  const isFocusActive = Boolean(focusConnected?.enabled);

  const isTypeMode = colorMode === 'type';
  const normalPositions = [];
  const normalEdgePositions = [];
  const normalSurfaceLookup = [];

  const aeroPositions = [];
  const aeroEdgePositions = [];
  const aeroSurfaceLookup = [];

  const pressurePositions = [];
  const pressureEdgePositions = [];
  const pressureSurfaceLookup = [];

  const positions = [];
  const edgePositions = [];
  const surfaceLookup = [];
  const normalArrowPositions = [];

  const nonActivePositions = [];
  const nonActiveEdgePositions = [];

  const selectedPositions = [];
  const selectedEdgePositions = [];

  const isSurfaceSelected = (type, nodes) => {
    if (!selectedSurface || selectedSurface.type !== type) return false;
    const selSet = new Set(selectedSurface.nodes);
    return nodes.length === selSet.size && nodes.every(n => selSet.has(n));
  };

  const resolvePartNode = (partName, id) => {
    if (!id || !nodesDict) return null;
    if (partName && nodesDict[`${partName}_${id}`]) {
      return nodesDict[`${partName}_${id}`];
    }
    if (nodesDict[id]) {
      return nodesDict[id];
    }
    for (const k of Object.keys(nodesDict)) {
      if (k.endsWith(`_${id}`) || k === id) {
        return nodesDict[k];
      }
    }
    return null;
  };

  // 1. Process Triangles
  if (trianglesDict) {
    const triKeys = Object.keys(trianglesDict).filter(k => k !== '__meta');
    for (const key of triKeys) {
      const tri = trianglesDict[key];
      if (!tri || typeof tri !== 'object') continue;

      const id1 = tri['id1:'] || tri.id1;
      const id2 = tri['id2:'] || tri.id2;
      const id3 = tri['id3:'] || tri.id3;
      if (!id1 || !id2 || !id3) continue;

      const n1 = resolvePartNode(tri.__partName, id1);
      const n2 = resolvePartNode(tri.__partName, id2);
      const n3 = resolvePartNode(tri.__partName, id3);
      if (!n1 || !n2 || !n3) continue;

      const p1 = beamngToThree(...extractNodeCoords(n1));
      const p2 = beamngToThree(...extractNodeCoords(n2));
      const p3 = beamngToThree(...extractNodeCoords(n3));

      const { normal, area } = calcTriNormalAndArea(p1, p2, p3);
      const isSel = isSurfaceSelected('triangle', [id1, id2, id3]);
      const isNonActive = tri.__isNonActive === true;

      const triType = resolveSurfaceType(tri);
      if (typeFilters?.surfaces && typeFilters.surfaces[triType] === false) {
        continue;
      }
      const isAeroOnly = triType === 'NONCOLLIDABLE';
      const isPressure = triType === 'PRESSURE';

      const triMeta = {
        type: 'triangle',
        key,
        id1, id2, id3,
        nodes: [id1, id2, id3],
        normal: [normal.x, normal.y, normal.z],
        area,
        partName: tri.__partName,
        isNonActive,
        range: tri.__meta?.range,
        triangleType: triType,
        dragCoef: tri.dragCoef !== undefined ? tri.dragCoef : null,
        liftCoef: tri.liftCoef !== undefined ? tri.liftCoef : null,
        groundModel: tri.groundModel || null,
        pressureGroup: tri.pressureGroup || null
      };

      if (isNonActive) {
        nonActivePositions.push(p1.x, p1.y, p1.z);
        nonActivePositions.push(p2.x, p2.y, p2.z);
        nonActivePositions.push(p3.x, p3.y, p3.z);

        nonActiveEdgePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
        nonActiveEdgePositions.push(p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
        nonActiveEdgePositions.push(p3.x, p3.y, p3.z, p1.x, p1.y, p1.z);
        surfaceLookup.push(triMeta);
        continue;
      }

      if (isTypeMode) {
        if (isAeroOnly) {
          aeroPositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
          aeroEdgePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
          aeroEdgePositions.push(p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
          aeroEdgePositions.push(p3.x, p3.y, p3.z, p1.x, p1.y, p1.z);
          aeroSurfaceLookup.push(triMeta);
        } else if (isPressure) {
          pressurePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
          pressureEdgePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
          pressureEdgePositions.push(p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
          pressureEdgePositions.push(p3.x, p3.y, p3.z, p1.x, p1.y, p1.z);
          pressureSurfaceLookup.push(triMeta);
        } else {
          normalPositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
          normalEdgePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
          normalEdgePositions.push(p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
          normalEdgePositions.push(p3.x, p3.y, p3.z, p1.x, p1.y, p1.z);
          normalSurfaceLookup.push(triMeta);
        }
      } else {
        positions.push(p1.x, p1.y, p1.z);
        positions.push(p2.x, p2.y, p2.z);
        positions.push(p3.x, p3.y, p3.z);

        // Track surface metadata for raycasting faceIndex
        surfaceLookup.push(triMeta);

        // Triangle wireframe perimeter
        edgePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
        edgePositions.push(p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
        edgePositions.push(p3.x, p3.y, p3.z, p1.x, p1.y, p1.z);
      }

      // If selected in 3D/inspector
      if (isSel) {
        selectedPositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
        selectedEdgePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
        selectedEdgePositions.push(p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
        selectedEdgePositions.push(p3.x, p3.y, p3.z, p1.x, p1.y, p1.z);
      }

      // Normal vector arrows
      if (showNormals) {
        const cx = (p1.x + p2.x + p3.x) / 3;
        const cy = (p1.y + p2.y + p3.y) / 3;
        const cz = (p1.z + p2.z + p3.z) / 3;
        const arrowLen = 0.12;

        const tipX = cx + normal.x * arrowLen;
        const tipY = cy + normal.y * arrowLen;
        const tipZ = cz + normal.z * arrowLen;

        normalArrowPositions.push(cx, cy, cz, tipX, tipY, tipZ);
      }
    }
  }

  // 2. Process Quads (split each quad into 2 coplanar triangles for surface render)
  if (quadsDict) {
    const quadKeys = Object.keys(quadsDict).filter(k => k !== '__meta');
    for (const key of quadKeys) {
      const quad = quadsDict[key];
      if (!quad || typeof quad !== 'object') continue;

      const id1 = quad['id1:'] || quad.id1;
      const id2 = quad['id2:'] || quad.id2;
      const id3 = quad['id3:'] || quad.id3;
      const id4 = quad['id4:'] || quad.id4;
      if (!id1 || !id2 || !id3 || !id4) continue;

      const n1 = resolvePartNode(quad.__partName, id1);
      const n2 = resolvePartNode(quad.__partName, id2);
      const n3 = resolvePartNode(quad.__partName, id3);
      const n4 = resolvePartNode(quad.__partName, id4);
      if (!n1 || !n2 || !n3 || !n4) continue;

      const p1 = beamngToThree(...extractNodeCoords(n1));
      const p2 = beamngToThree(...extractNodeCoords(n2));
      const p3 = beamngToThree(...extractNodeCoords(n3));
      const p4 = beamngToThree(...extractNodeCoords(n4));

      const t1 = calcTriNormalAndArea(p1, p2, p3);
      const t2 = calcTriNormalAndArea(p1, p3, p4);
      const quadArea = t1.area + t2.area;
      const avgNormal = new THREE.Vector3().addVectors(t1.normal, t2.normal).normalize();
      const isSel = isSurfaceSelected('quad', [id1, id2, id3, id4]);
      const isNonActive = quad.__isNonActive === true;

      const quadType = resolveSurfaceType(quad);
      if (typeFilters?.surfaces && typeFilters.surfaces[quadType] === false) {
        continue;
      }
      const isAeroOnly = quadType === 'NONCOLLIDABLE';
      const isPressure = quadType === 'PRESSURE';

      const quadMeta = {
        type: 'quad',
        key,
        id1, id2, id3, id4,
        nodes: [id1, id2, id3, id4],
        normal: [avgNormal.x, avgNormal.y, avgNormal.z],
        area: quadArea,
        partName: quad.__partName,
        isNonActive,
        range: quad.__meta?.range,
        quadType,
        dragCoef: quad.dragCoef !== undefined ? quad.dragCoef : null,
        liftCoef: quad.liftCoef !== undefined ? quad.liftCoef : null,
        groundModel: quad.groundModel || null,
        pressureGroup: quad.pressureGroup || null
      };

      if (isNonActive) {
        nonActivePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
        nonActivePositions.push(p1.x, p1.y, p1.z, p3.x, p3.y, p3.z, p4.x, p4.y, p4.z);

        nonActiveEdgePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
        nonActiveEdgePositions.push(p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
        nonActiveEdgePositions.push(p3.x, p3.y, p3.z, p4.x, p4.y, p4.z);
        nonActiveEdgePositions.push(p4.x, p4.y, p4.z, p1.x, p1.y, p1.z);
        surfaceLookup.push(quadMeta);
        surfaceLookup.push(quadMeta);
        continue;
      }

      if (isTypeMode) {
        if (isAeroOnly) {
          aeroPositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
          aeroPositions.push(p1.x, p1.y, p1.z, p3.x, p3.y, p3.z, p4.x, p4.y, p4.z);
          aeroEdgePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
          aeroEdgePositions.push(p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
          aeroEdgePositions.push(p3.x, p3.y, p3.z, p4.x, p4.y, p4.z);
          aeroEdgePositions.push(p4.x, p4.y, p4.z, p1.x, p1.y, p1.z);
          aeroSurfaceLookup.push(quadMeta);
          aeroSurfaceLookup.push(quadMeta);
        } else if (isPressure) {
          pressurePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
          pressurePositions.push(p1.x, p1.y, p1.z, p3.x, p3.y, p3.z, p4.x, p4.y, p4.z);
          pressureEdgePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
          pressureEdgePositions.push(p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
          pressureEdgePositions.push(p3.x, p3.y, p3.z, p4.x, p4.y, p4.z);
          pressureEdgePositions.push(p4.x, p4.y, p4.z, p1.x, p1.y, p1.z);
          pressureSurfaceLookup.push(quadMeta);
          pressureSurfaceLookup.push(quadMeta);
        } else {
          normalPositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
          normalPositions.push(p1.x, p1.y, p1.z, p3.x, p3.y, p3.z, p4.x, p4.y, p4.z);
          normalEdgePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
          normalEdgePositions.push(p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
          normalEdgePositions.push(p3.x, p3.y, p3.z, p4.x, p4.y, p4.z);
          normalEdgePositions.push(p4.x, p4.y, p4.z, p1.x, p1.y, p1.z);
          normalSurfaceLookup.push(quadMeta);
          normalSurfaceLookup.push(quadMeta);
        }
      } else {
        // Tri 1: (p1, p2, p3)
        positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
        // Tri 2: (p1, p3, p4)
        positions.push(p1.x, p1.y, p1.z, p3.x, p3.y, p3.z, p4.x, p4.y, p4.z);

        surfaceLookup.push(quadMeta);
        surfaceLookup.push(quadMeta);

        // Quad wireframe perimeter (p1->p2, p2->p3, p3->p4, p4->p1)
        edgePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
        edgePositions.push(p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
        edgePositions.push(p3.x, p3.y, p3.z, p4.x, p4.y, p4.z);
        edgePositions.push(p4.x, p4.y, p4.z, p1.x, p1.y, p1.z);
      }

      if (isSel) {
        selectedPositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
        selectedPositions.push(p1.x, p1.y, p1.z, p3.x, p3.y, p3.z, p4.x, p4.y, p4.z);
        selectedEdgePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
        selectedEdgePositions.push(p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
        selectedEdgePositions.push(p3.x, p3.y, p3.z, p4.x, p4.y, p4.z);
        selectedEdgePositions.push(p4.x, p4.y, p4.z, p1.x, p1.y, p1.z);
      }

      if (showNormals) {
        const cx = (p1.x + p2.x + p3.x + p4.x) / 4;
        const cy = (p1.y + p2.y + p3.y + p4.y) / 4;
        const cz = (p1.z + p2.z + p3.z + p4.z) / 4;
        const arrowLen = 0.12;

        const tipX = cx + avgNormal.x * arrowLen;
        const tipY = cy + avgNormal.y * arrowLen;
        const tipZ = cz + avgNormal.z * arrowLen;

        normalArrowPositions.push(cx, cy, cz, tipX, tipY, tipZ);
      }
    }
  }

  // Non-Active Opened Files Ghost / Wireframe Surfaces
  if (nonActivePositions.length > 0) {
    const naGeom = new THREE.BufferGeometry();
    naGeom.setAttribute('position', new THREE.Float32BufferAttribute(nonActivePositions, 3));
    naGeom.computeVertexNormals();
    naGeom.computeBoundingSphere();

    let surfColor = 0x0284c7;
    let surfOpacity = 0.25;
    let isWire = false;

    if (nonActiveViewType === 'wireframe') {
      surfColor = 0x64748b;
      surfOpacity = 0.18;
      isWire = true;
    } else if (nonActiveViewType === 'dimmed') {
      surfColor = 0x475569;
      surfOpacity = 0.28;
      isWire = false;
    } else {
      // Ghost: clear holographic translucent sky blue
      surfColor = 0x0284c7;
      surfOpacity = 0.25;
      isWire = false;
    }

    const naMat = new THREE.MeshBasicMaterial({
      color: surfColor,
      wireframe: isWire,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: surfOpacity,
      depthWrite: false
    });
    const naMesh = new THREE.Mesh(naGeom, naMat);
    naMesh.name = 'non_active_surfaces';
    naMesh.userData = { surfaceLookup, type: 'surface_mesh' };
    group.add(naMesh);

    if (nonActiveEdgePositions.length > 0) {
      const naEdgeGeom = new THREE.BufferGeometry();
      naEdgeGeom.setAttribute('position', new THREE.Float32BufferAttribute(nonActiveEdgePositions, 3));
      const naEdgeMat = new THREE.LineBasicMaterial({
        color: nonActiveViewType === 'ghost' ? 0x38bdf8 : 0x94a3b8,
        transparent: true,
        opacity: nonActiveViewType === 'ghost' ? 0.5 : 0.4
      });
      const naEdgeLines = new THREE.LineSegments(naEdgeGeom, naEdgeMat);
      naEdgeLines.name = 'non_active_surfaces_edges';
      group.add(naEdgeLines);
    }
  }

  if (isTypeMode) {
    // 1. NORMAL Collision Hull (Deep Sapphire Glass)
    if (normalPositions.length > 0) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(normalPositions, 3));
      geom.computeVertexNormals();
      geom.computeBoundingSphere();
      const mat = new THREE.MeshStandardMaterial({
        color: 0x1e3a8a, // Deep Sapphire for Physical Collision Hull
        roughness: 0.35,
        metalness: 0.1,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.22, // Translucent glass tint so internal beams remain fully visible
        depthWrite: false
      });
      const m = new THREE.Mesh(geom, mat);
      m.name = 'triangles_surface_normal';
      m.userData = { surfaceLookup: normalSurfaceLookup, type: 'surface_mesh' };
      group.add(m);

      if (normalEdgePositions.length > 0) {
        const eGeom = new THREE.BufferGeometry();
        eGeom.setAttribute('position', new THREE.Float32BufferAttribute(normalEdgePositions, 3));
        const eMat = new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.55 });
        const eLines = new THREE.LineSegments(eGeom, eMat);
        eLines.name = 'surfaces_wireframe_normal';
        group.add(eLines);
      }
    }

    // 2. NONCOLLIDABLE Aerodynamics (Deep Emerald Tint)
    if (aeroPositions.length > 0) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(aeroPositions, 3));
      geom.computeVertexNormals();
      geom.computeBoundingSphere();
      const mat = new THREE.MeshStandardMaterial({
        color: 0x065f46, // Deep Emerald Tint for Aerodynamic Only
        roughness: 0.35,
        metalness: 0.1,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.20,
        depthWrite: false
      });
      const m = new THREE.Mesh(geom, mat);
      m.name = 'triangles_surface_aero';
      m.userData = { surfaceLookup: aeroSurfaceLookup, type: 'surface_mesh' };
      group.add(m);

      if (aeroEdgePositions.length > 0) {
        const eGeom = new THREE.BufferGeometry();
        eGeom.setAttribute('position', new THREE.Float32BufferAttribute(aeroEdgePositions, 3));
        const eMat = new THREE.LineBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.65 });
        const eLines = new THREE.LineSegments(eGeom, eMat);
        eLines.name = 'surfaces_wireframe_aero';
        group.add(eLines);
      }
    }

    // 3. PRESSURE Pneumatic Vessel (Deep Ruby Tint)
    if (pressurePositions.length > 0) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(pressurePositions, 3));
      geom.computeVertexNormals();
      geom.computeBoundingSphere();
      const mat = new THREE.MeshStandardMaterial({
        color: 0x881337, // Deep Ruby Tint for Pressurized Volume
        roughness: 0.35,
        metalness: 0.1,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.22,
        depthWrite: false
      });
      const m = new THREE.Mesh(geom, mat);
      m.name = 'triangles_surface_pressure';
      m.userData = { surfaceLookup: pressureSurfaceLookup, type: 'surface_mesh' };
      group.add(m);

      if (pressureEdgePositions.length > 0) {
        const eGeom = new THREE.BufferGeometry();
        eGeom.setAttribute('position', new THREE.Float32BufferAttribute(pressureEdgePositions, 3));
        const eMat = new THREE.LineBasicMaterial({ color: 0xf43f5e, transparent: true, opacity: 0.65 });
        const eLines = new THREE.LineSegments(eGeom, eMat);
        eLines.name = 'surfaces_wireframe_pressure';
        group.add(eLines);
      }
    }

    // Normal Vector Arrows overlay
    if (showNormals && normalArrowPositions.length > 0) {
      const normGeom = new THREE.BufferGeometry();
      normGeom.setAttribute('position', new THREE.Float32BufferAttribute(normalArrowPositions, 3));
      const normMat = new THREE.LineBasicMaterial({
        color: 0x00e5ff,
        transparent: true,
        opacity: 0.95
      });
      const normLines = new THREE.LineSegments(normGeom, normMat);
      normLines.name = 'surface_normal_arrows';
      group.add(normLines);
    }
  } else if (positions.length > 0) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    if (faceOrientation) {
      // Blender-style Face Orientation: Blue = FrontSide (Outward), Red = BackSide (Inward)
      const frontMaterial = new THREE.MeshStandardMaterial({
        color: 0x1d4ed8, // Vibrant Blue
        roughness: 0.35,
        metalness: 0.1,
        side: THREE.FrontSide,
        transparent: true,
        opacity: 0.65,
        depthWrite: false
      });
      const frontMesh = new THREE.Mesh(geometry, frontMaterial);
      frontMesh.name = 'triangles_surface_front';
      frontMesh.userData = { surfaceLookup, type: 'surface_mesh' };
      group.add(frontMesh);

      const backMaterial = new THREE.MeshStandardMaterial({
        color: 0xdc2626, // Alert Red
        roughness: 0.35,
        metalness: 0.1,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.65,
        depthWrite: false
      });
      const backMesh = new THREE.Mesh(geometry, backMaterial);
      backMesh.name = 'triangles_surface_back';
      backMesh.userData = { surfaceLookup, type: 'surface_mesh' };
      group.add(backMesh);
    } else {
      // Normal View: Translucent Deep Royal Sapphire Glass (triadic contrast with steel beams & white nodes)
      const material = new THREE.MeshStandardMaterial({
        color: 0x2563eb,
        roughness: 0.28,
        metalness: 0.18,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: isFocusActive ? 0.08 : 0.32,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'triangles_surface';
      mesh.userData = { surfaceLookup, type: 'surface_mesh' };
      group.add(mesh);
    }

    // Standard surface wireframe perimeter
    if (edgePositions.length > 0) {
      const edgeGeom = new THREE.BufferGeometry();
      edgeGeom.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
      const wireframeMaterial = new THREE.LineBasicMaterial({
        color: faceOrientation ? 0xffffff : 0x818cf8,
        transparent: true,
        opacity: isFocusActive ? 0.15 : (faceOrientation ? 0.6 : 0.55)
      });
      const wireframeLines = new THREE.LineSegments(edgeGeom, wireframeMaterial);
      wireframeLines.name = 'surfaces_wireframe';
      group.add(wireframeLines);
    }

    // Normal Vector Arrows overlay
    if (showNormals && normalArrowPositions.length > 0) {
      const normGeom = new THREE.BufferGeometry();
      normGeom.setAttribute('position', new THREE.Float32BufferAttribute(normalArrowPositions, 3));
      const normMat = new THREE.LineBasicMaterial({
        color: 0x00e5ff,
        transparent: true,
        opacity: 0.95
      });
      const normLines = new THREE.LineSegments(normGeom, normMat);
      normLines.name = 'surfaces_normals';
      group.add(normLines);
    }

    // Selected surface golden highlight overlay
    if (selectedPositions.length > 0) {
      const selGeom = new THREE.BufferGeometry();
      selGeom.setAttribute('position', new THREE.Float32BufferAttribute(selectedPositions, 3));
      selGeom.computeVertexNormals();
      selGeom.computeBoundingSphere();

      const selMat = new THREE.MeshStandardMaterial({
        color: 0xffd54f,
        emissive: 0xffa000,
        emissiveIntensity: 0.5,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
        depthWrite: false
      });
      const selMesh = new THREE.Mesh(selGeom, selMat);
      selMesh.name = 'selected_surface_mesh';
      selMesh.userData = { surfaceLookup, type: 'surface_mesh' };
      group.add(selMesh);

      if (selectedEdgePositions.length > 0) {
        const selEdgeGeom = new THREE.BufferGeometry();
        selEdgeGeom.setAttribute('position', new THREE.Float32BufferAttribute(selectedEdgePositions, 3));
        const selEdgeMat = new THREE.LineBasicMaterial({
          color: 0xffeb3b,
          transparent: true,
          opacity: 0.95
        });
        const selEdgeLines = new THREE.LineSegments(selEdgeGeom, selEdgeMat);
        selEdgeLines.name = 'selected_surface_edge';
        group.add(selEdgeLines);
      }
    }
  }

  // Non-Active Opened Files Ghost / Wireframe Surfaces
  if (nonActivePositions.length > 0) {
    const naGeom = new THREE.BufferGeometry();
    naGeom.setAttribute('position', new THREE.Float32BufferAttribute(nonActivePositions, 3));
    naGeom.computeVertexNormals();
    const naMat = new THREE.MeshBasicMaterial({
      color: 0x64748b,
      wireframe: nonActiveViewType === 'wireframe',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: nonActiveViewType === 'dimmed' ? 0.25 : 0.12,
      depthWrite: false
    });
    const naMesh = new THREE.Mesh(naGeom, naMat);
    naMesh.name = 'non_active_surfaces';
    group.add(naMesh);

    if (nonActiveEdgePositions.length > 0) {
      const naEdgeGeom = new THREE.BufferGeometry();
      naEdgeGeom.setAttribute('position', new THREE.Float32BufferAttribute(nonActiveEdgePositions, 3));
      const naEdgeMat = new THREE.LineBasicMaterial({
        color: 0x94a3b8,
        transparent: true,
        opacity: 0.2
      });
      const naEdgeLines = new THREE.LineSegments(naEdgeGeom, naEdgeMat);
      naEdgeLines.name = 'non_active_surfaces_edges';
      group.add(naEdgeLines);
    }
  }

  return group;
}

/**
 * Creates ground grid and coordinate axes.
 */
export function buildEnvironmentGroup() {
  const group = new THREE.Group();
  group.name = 'environment_group';

  // Harmonized neutral ground grid for dark/gray editor theme
  const gridHelper = new THREE.GridHelper(16, 32, 0x5e6878, 0x2e3440);
  gridHelper.position.y = 0;
  gridHelper.name = 'ground_grid';
  if (gridHelper.material) {
    if (Array.isArray(gridHelper.material)) {
      gridHelper.material.forEach(m => { m.transparent = true; m.opacity = 0.75; });
    } else {
      gridHelper.material.transparent = true;
      gridHelper.material.opacity = 0.75;
    }
  }
  group.add(gridHelper);

  const axesHelper = new THREE.AxesHelper(1.2);
  axesHelper.name = 'origin_axes';
  group.add(axesHelper);

  return group;
}

/**
 * Creates visual indicators marking the forward (-Y in BeamNG) direction of the vehicle.
 * BeamNG forward is -Y, which maps to -Z in Three.js coordinates.
 */
export function buildFrontIndicatorGroup() {
  const group = new THREE.Group();
  group.name = 'front_direction_indicator_group';

  // 1. Sleek Central Ground Longitudinal Axis Strip (-Z direction in Three.js = -Y Front in BeamNG)
  const shaftShape = new THREE.Shape();
  const halfW = 0.02; // 4cm wide ground strip
  shaftShape.moveTo(-halfW, 0.6);
  shaftShape.lineTo(halfW, 0.6);
  shaftShape.lineTo(halfW, -2.15);
  shaftShape.lineTo(-halfW, -2.15);
  shaftShape.closePath();

  const shaftGeom = new THREE.ShapeGeometry(shaftShape);
  const cyanFillMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff, // Vibrant BeamNG / Cyber Cyan
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const shaftMesh = new THREE.Mesh(shaftGeom, cyanFillMat);
  shaftMesh.rotation.x = Math.PI / 2;
  shaftMesh.position.y = 0.006;
  group.add(shaftMesh);

  // 2. Primary Aerodynamic Arrowhead (Planar Swept Chevron pointing forward to -Z)
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, -2.85);        // Sharp front apex pointing along -Z (Front)
  arrowShape.lineTo(-0.35, -2.35);    // Left swept wingtip
  arrowShape.lineTo(-0.16, -2.42);    // Left inner wing base
  arrowShape.lineTo(0, -2.55);        // Center inner notch
  arrowShape.lineTo(0.16, -2.42);     // Right inner wing base
  arrowShape.lineTo(0.35, -2.35);     // Right swept wingtip
  arrowShape.closePath();

  const arrowGeom = new THREE.ShapeGeometry(arrowShape);
  const arrowMesh = new THREE.Mesh(arrowGeom, cyanFillMat);
  arrowMesh.rotation.x = Math.PI / 2;
  arrowMesh.position.y = 0.007;
  group.add(arrowMesh);

  // Crisp White-Cyan Outline around primary arrowhead
  const outlineMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95
  });
  const arrowBorderGeom = new THREE.BufferGeometry().setFromPoints(arrowShape.getPoints());
  const arrowBorder = new THREE.LineLoop(arrowBorderGeom, outlineMat);
  arrowBorder.rotation.x = Math.PI / 2;
  arrowBorder.position.y = 0.008;
  group.add(arrowBorder);

  // 3. Secondary Trailing Chevron (Automotive Velocity/Navigation HUD Pulse)
  const chevronShape = new THREE.Shape();
  chevronShape.moveTo(0, -2.32);
  chevronShape.lineTo(-0.25, -1.95);
  chevronShape.lineTo(-0.12, -2.01);
  chevronShape.lineTo(0, -2.12);
  chevronShape.lineTo(0.12, -2.01);
  chevronShape.lineTo(0.25, -1.95);
  chevronShape.closePath();

  const chevronGeom = new THREE.ShapeGeometry(chevronShape);
  const chevronMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const chevronMesh = new THREE.Mesh(chevronGeom, chevronMat);
  chevronMesh.rotation.x = Math.PI / 2;
  chevronMesh.position.y = 0.007;
  group.add(chevronMesh);

  const chevronBorderGeom = new THREE.BufferGeometry().setFromPoints(chevronShape.getPoints());
  const chevronBorder = new THREE.LineLoop(chevronBorderGeom, outlineMat);
  chevronBorder.rotation.x = Math.PI / 2;
  chevronBorder.position.y = 0.008;
  group.add(chevronBorder);

  // 4. Subtle Micro Trailing Chevron
  const microShape = new THREE.Shape();
  microShape.moveTo(0, -1.92);
  microShape.lineTo(-0.16, -1.65);
  microShape.lineTo(-0.08, -1.70);
  microShape.lineTo(0, -1.78);
  microShape.lineTo(0.08, -1.70);
  microShape.lineTo(0.16, -1.65);
  microShape.closePath();

  const microGeom = new THREE.ShapeGeometry(microShape);
  const microMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.40,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const microMesh = new THREE.Mesh(microGeom, microMat);
  microMesh.rotation.x = Math.PI / 2;
  microMesh.position.y = 0.007;
  group.add(microMesh);

  // 5. Floating Billboard Badges (Retina 512x128 Canvas for crisp rendering)
  if (typeof document !== 'undefined') {
    // FRONT (-Y) Badge
    const frontCanvas = document.createElement('canvas');
    frontCanvas.width = 512;
    frontCanvas.height = 128;
    const fctx = frontCanvas.getContext('2d');
    if (fctx) {
      // Dark pill backdrop
      fctx.fillStyle = 'rgba(10, 16, 26, 0.92)';
      fctx.roundRect(8, 8, 496, 112, 28);
      fctx.fill();

      // Glowing cyan border
      fctx.strokeStyle = '#00e5ff';
      fctx.lineWidth = 6;
      fctx.shadowColor = '#00e5ff';
      fctx.shadowBlur = 12;
      fctx.roundRect(8, 8, 496, 112, 28);
      fctx.stroke();

      // Sharp text & indicator
      fctx.shadowBlur = 0;
      fctx.fillStyle = '#00e5ff';
      fctx.font = 'bold 44px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      fctx.textAlign = 'center';
      fctx.textBaseline = 'middle';
      fctx.fillText('▲ FRONT (-Y)', 256, 64);

      const frontTexture = new THREE.CanvasTexture(frontCanvas);
      const frontSpriteMat = new THREE.SpriteMaterial({
        map: frontTexture,
        depthTest: false,
        transparent: true
      });
      const frontSprite = new THREE.Sprite(frontSpriteMat);
      frontSprite.position.set(0, 0.32, -3.20);
      frontSprite.scale.set(0.72, 0.18, 1);
      group.add(frontSprite);
    }

    // REAR (+Y) Badge
    const rearCanvas = document.createElement('canvas');
    rearCanvas.width = 512;
    rearCanvas.height = 128;
    const rctx = rearCanvas.getContext('2d');
    if (rctx) {
      // Dark pill backdrop
      rctx.fillStyle = 'rgba(10, 16, 26, 0.88)';
      rctx.roundRect(8, 8, 496, 112, 28);
      rctx.fill();

      // Amber border
      rctx.strokeStyle = '#f59e0b';
      rctx.lineWidth = 5;
      rctx.shadowColor = '#f59e0b';
      rctx.shadowBlur = 10;
      rctx.roundRect(8, 8, 496, 112, 28);
      rctx.stroke();

      // Amber text
      rctx.shadowBlur = 0;
      rctx.fillStyle = '#fbbf24';
      rctx.font = 'bold 42px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      rctx.textAlign = 'center';
      rctx.textBaseline = 'middle';
      rctx.fillText('▼ REAR (+Y)', 256, 64);

      const rearTexture = new THREE.CanvasTexture(rearCanvas);
      const rearSpriteMat = new THREE.SpriteMaterial({
        map: rearTexture,
        depthTest: false,
        transparent: true
      });
      const rearSprite = new THREE.Sprite(rearSpriteMat);
      rearSprite.position.set(0, 0.28, 2.30);
      rearSprite.scale.set(0.62, 0.155, 1);
      group.add(rearSprite);
    }
  }

  return group;
}

/**
 * Builds a dynamic 3D focus/highlight overlay group for code-hovered elements (node, beam, triangle, quad).
 * Fully decoupled from user selection states and compatible with 3D multi-select.
 *
 * @param {object|Array} input - Hovered element, multi-element range, array, or { hovered, selected }
 * @param {object} nodesDict
 * @returns {THREE.Group}
 */
export function buildCodeHoverGroup(input, nodesDict) {
  const group = new THREE.Group();
  group.name = 'code_hover_overlay_group';
  group.renderOrder = 999;
  if (!input || !nodesDict) return group;

  const nodesToRender = [];
  const beamsToRender = [];
  const trianglesToRender = [];
  const quadsToRender = [];

  const seenNodeIds = new Set();
  const seenBeamKeys = new Set();
  const seenTriKeys = new Set();
  const seenQuadKeys = new Set();

  function ingestElement(el, isHovered = false) {
    if (!el || !el.type) return;
    if (el.type === 'node' && el.id) {
      if (!seenNodeIds.has(el.id)) {
        seenNodeIds.add(el.id);
        nodesToRender.push({ ...el, isHovered });
      }
    } else if (el.type === 'beam') {
      const bKey = el.beamKey || `${el.id1}_${el.id2}`;
      if (!seenBeamKeys.has(bKey)) {
        seenBeamKeys.add(bKey);
        beamsToRender.push({ ...el, isHovered });
      }
    } else if (el.type === 'triangle' && el.nodes?.length >= 3) {
      const tKey = el.key || el.nodes.join('_');
      if (!seenTriKeys.has(tKey)) {
        seenTriKeys.add(tKey);
        trianglesToRender.push({ ...el, isHovered });
      }
    } else if (el.type === 'quad' && el.nodes?.length >= 4) {
      const qKey = el.key || el.nodes.join('_');
      if (!seenQuadKeys.has(qKey)) {
        seenQuadKeys.add(qKey);
        quadsToRender.push({ ...el, isHovered });
      }
    }
  }

  function ingestCollection(col, isHovered = false) {
    if (!col) return;
    if (Array.isArray(col)) {
      col.forEach(item => ingestElement(item, isHovered));
    } else if (col.type) {
      ingestElement(col, isHovered);
    } else if (col.nodes || col.beams || col.triangles || col.quads || col.all) {
      if (Array.isArray(col.nodes)) col.nodes.forEach(item => ingestElement(item, isHovered));
      if (Array.isArray(col.beams)) col.beams.forEach(item => ingestElement(item, isHovered));
      if (Array.isArray(col.triangles)) col.triangles.forEach(item => ingestElement(item, isHovered));
      if (Array.isArray(col.quads)) col.quads.forEach(item => ingestElement(item, isHovered));
    }
  }

  if (input.hovered !== undefined || input.selected !== undefined) {
    if (input.selected) ingestCollection(input.selected, false);
    if (input.hovered) ingestElement(input.hovered, true);
  } else {
    ingestCollection(input, false);
  }

  // 1. Render Triangles and Quads (Faces + Wireframe Boundary Edges + Corner Vertex Spheres)
  const surfacePositions = [];
  const edgePositions = [];
  const cornerVertexNodeIds = new Set();

  for (const tri of trianglesToRender) {
    const nodeIds = tri.nodes || [];
    const validPoints = nodeIds
      .filter(nid => nodesDict[nid])
      .map(nid => beamngToThree(...extractNodeCoords(nodesDict[nid])));

    if (validPoints.length >= 3) {
      const [p0, p1, p2] = validPoints;
      surfacePositions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);

      edgePositions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
      edgePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      edgePositions.push(p2.x, p2.y, p2.z, p0.x, p0.y, p0.z);
    }
  }

  for (const quad of quadsToRender) {
    const nodeIds = quad.nodes || [];
    const validPoints = nodeIds
      .filter(nid => nodesDict[nid])
      .map(nid => beamngToThree(...extractNodeCoords(nodesDict[nid])));

    if (validPoints.length >= 4) {
      const [p0, p1, p2, p3] = validPoints;
      // Tri 1
      surfacePositions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      // Tri 2
      surfacePositions.push(p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);

      edgePositions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
      edgePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      edgePositions.push(p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
      edgePositions.push(p3.x, p3.y, p3.z, p0.x, p0.y, p0.z);
    }
  }

  if (surfacePositions.length > 0) {
    const surfaceGeom = new THREE.BufferGeometry();
    surfaceGeom.setAttribute('position', new THREE.Float32BufferAttribute(surfacePositions, 3));
    surfaceGeom.computeVertexNormals();
    const surfaceMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.50,
      depthTest: false,
      depthWrite: false
    });
    const surfaceMesh = new THREE.Mesh(surfaceGeom, surfaceMat);
    surfaceMesh.renderOrder = 999;
    group.add(surfaceMesh);

    const edgeGeom = new THREE.BufferGeometry();
    edgeGeom.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x00e5ff,
      linewidth: 2,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false
    });
    const edgeLines = new THREE.LineSegments(edgeGeom, edgeMat);
    edgeLines.renderOrder = 999;
    group.add(edgeLines);
  }

  // 2. Render Beams (Axial LineSegments + Volume Cylinders)
  const beamLinePositions = [];

  for (const b of beamsToRender) {
    const { id1, id2 } = b;
    if (id1 && id2 && nodesDict[id1] && nodesDict[id2]) {
      const p1 = beamngToThree(...extractNodeCoords(nodesDict[id1]));
      const p2 = beamngToThree(...extractNodeCoords(nodesDict[id2]));

      beamLinePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);

      // Volume cylinder
      const distance = p1.distanceTo(p2);
      if (distance > 0.001) {
        const cylGeom = new THREE.CylinderGeometry(0.022, 0.022, distance, 8);
        const cylMat = new THREE.MeshBasicMaterial({
          color: 0x00e5ff,
          transparent: true,
          opacity: 0.70,
          depthTest: false,
          depthWrite: false
        });
        const cylMesh = new THREE.Mesh(cylGeom, cylMat);
        const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        cylMesh.position.copy(mid);
        cylMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().subVectors(p2, p1).normalize());
        cylMesh.renderOrder = 999;
        group.add(cylMesh);
      }
    }
  }

  if (beamLinePositions.length > 0) {
    const bGeom = new THREE.BufferGeometry();
    bGeom.setAttribute('position', new THREE.Float32BufferAttribute(beamLinePositions, 3));
    const bMat = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      linewidth: 3,
      transparent: true,
      opacity: 0.98,
      depthTest: false,
      depthWrite: false
    });
    const bLine = new THREE.LineSegments(bGeom, bMat);
    bLine.renderOrder = 999;
    group.add(bLine);
  }

  // 3. Render Nodes (Glowing Spheres + Cyan Rings)
  for (const n of nodesToRender) {
    if (n.id && nodesDict[n.id]) {
      const [px, py, pz] = extractNodeCoords(nodesDict[n.id]);
      const pos = beamngToThree(px, py, pz);

      const sphereGeom = new THREE.SphereGeometry(0.048, 16, 16);
      const sphereMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.80,
        depthTest: false,
        depthWrite: false
      });
      const sphereMesh = new THREE.Mesh(sphereGeom, sphereMat);
      sphereMesh.position.copy(pos);
      sphereMesh.renderOrder = 999;
      group.add(sphereMesh);

      const ringGeom = new THREE.RingGeometry(0.065, 0.090, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x00e5ff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        depthWrite: false
      });
      const ringMesh = new THREE.Mesh(ringGeom, ringMat);
      ringMesh.position.copy(pos);
      ringMesh.rotation.x = Math.PI / 2;
      ringMesh.renderOrder = 999;
      group.add(ringMesh);
    }
  }

  return group;
}

/**
 * Detects coincident and proximity interface mounting points between the active component
 * and open counterpart components in Multi-Part Linkage mode.
 * 
 * Renders glowing neon green joint indicators with connecting lines, allowing modders
 * to instantly identify and connect inter-component mounting points.
 */
export function buildMountingJointsGroup(mergedNodes, maxDistanceMeters = 0.08) {
  const group = new THREE.Group();
  group.name = 'jbeam_mounting_joints_group';

  if (!mergedNodes || typeof mergedNodes !== 'object') return group;

  const nodeKeys = Object.keys(mergedNodes).filter(k => k !== '__meta');
  const activeNodes = [];
  const counterpartNodes = [];

  for (const k of nodeKeys) {
    const n = mergedNodes[k];
    if (!n || typeof n !== 'object') continue;
    const [x, y, z] = extractNodeCoords(n);
    const pos = beamngToThree(x, y, z);
    const nId = n.id || n.name || k;
    const entry = { key: k, id: nId, node: n, pos, partName: n.__partName || '' };
    if (n.__isNonActive) {
      counterpartNodes.push(entry);
    } else {
      activeNodes.push(entry);
    }
  }

  if (activeNodes.length === 0 || counterpartNodes.length === 0) {
    return group;
  }

  // Find candidate proximity pairs (within maxDistanceMeters)
  const proximityPairs = [];
  const maxDistSq = maxDistanceMeters * maxDistanceMeters;

  for (const act of activeNodes) {
    for (const cnp of counterpartNodes) {
      const distSq = act.pos.distanceToSquared(cnp.pos);
      if (distSq <= maxDistSq) {
        const dist = Math.sqrt(distSq);
        proximityPairs.push({
          activeNode: act,
          counterpartNode: cnp,
          dist,
          midPoint: act.pos.clone().add(cnp.pos).multiplyScalar(0.5)
        });
      }
    }
  }

  if (proximityPairs.length === 0) {
    return group;
  }

  // Visual geometries and materials
  const ringGeom = new THREE.TorusGeometry(0.024, 0.004, 8, 16);
  const jointMaterial = new THREE.MeshBasicMaterial({
    color: 0x00e676, // Neon Emerald Green
    transparent: true,
    opacity: 0.95
  });

  const linePositions = [];
  const lineColors = [];

  for (const pair of proximityPairs) {
    // 1. Torus ring at midpoint
    const ring = new THREE.Mesh(ringGeom, jointMaterial);
    ring.position.copy(pair.midPoint);
    ring.rotation.x = Math.PI / 2;
    ring.name = `joint_ring_${pair.activeNode.id}_${pair.counterpartNode.id}`;
    ring.userData = {
      type: 'mounting_joint',
      activeId: pair.activeNode.id,
      counterpartId: pair.counterpartNode.id,
      distance: pair.dist
    };
    group.add(ring);

    // 2. Dashed or solid connecting line between the two nodes
    linePositions.push(pair.activeNode.pos.x, pair.activeNode.pos.y, pair.activeNode.pos.z);
    linePositions.push(pair.counterpartNode.pos.x, pair.counterpartNode.pos.y, pair.counterpartNode.pos.z);
    lineColors.push(0, 0.9, 0.46, 0, 0.9, 0.46);
  }

  if (linePositions.length > 0) {
    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    lineGeom.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      linewidth: 2,
      transparent: true,
      opacity: 0.85
    });
    const lines = new THREE.LineSegments(lineGeom, lineMat);
    group.add(lines);
  }

  group.userData = { proximityPairs };
  return group;
}

export default {
  BEAM_TYPE_COLORS,
  normalizeBeamType,
  SELECTION_COLOR,
  HOVER_COLOR,
  NODE_DEFAULT_COLOR,
  NODE_FIXED_COLOR,
  buildNodesGroup,
  buildNodeLabelsGroup,
  buildBeamsGroup,
  buildTrianglesGroup,
  computeConnectedTopology,
  buildMountingJointsGroup,
  buildCodeHoverGroup,
  buildEnvironmentGroup,
  buildFrontIndicatorGroup
};
