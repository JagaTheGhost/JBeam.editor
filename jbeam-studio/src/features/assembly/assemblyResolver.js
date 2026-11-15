/*
  JBeam Studio - Assembly Resolver
  Resolves slot hierarchies, manages part selection states, and builds
  composite multi-part vehicle structures with distinct color coding.
*/

import { decodeWithMeta } from '../jbeam/sjsonParser.js';
import { processAllParts } from '../jbeam/tableSchema.js';
import { evaluateJBeamValue } from '../jbeam/expressionParser.js';
import { sanitizeVariables, resolveSlotVariables, resolvePartNodesAndBeams } from '../jbeam/variables.js';

export const PART_PALETTE = [
  '#00e5ff', // Vibrant Cyan
  '#ff9100', // Vibrant Orange
  '#00e676', // Emerald Green
  '#d500f9', // Neon Purple
  '#ffd600', // Bright Yellow
  '#2979ff', // Electric Blue
  '#ff1744', // Crimson Red
  '#76ff03', // Lime Green
  '#b388ff', // Soft Violet
  '#1de9b6', // Bright Teal
  '#ff6d00', // Deep Amber
  '#00b0ff'  // Sky Blue
];

/**
 * Assigns a deterministic palette color based on part name index.
 */
export function getPartColor(partName, index = 0) {
  if (!partName) return PART_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < partName.length; i++) {
    hash = (hash << 5) - hash + partName.charCodeAt(i);
    hash |= 0;
  }
  const colorIndex = Math.abs(hash + index) % PART_PALETTE.length;
  return PART_PALETTE[colorIndex];
}

/**
 * Recursively resolves a nested slot hierarchy tree starting from a root part.
 *
 * @param {string} rootPartName - Name of root vehicle part (slotType: 'main')
 * @param {Object} partsMap - Index of all parts in workspace
 * @param {Object} slotTypeMap - Mapping of slotType to part descriptors
 * @param {Object} activeSelections - Mapping of slotName to selected partName
 * @param {Set} [visited] - Recursion cycle guard
 * @param {number} [depth=0] - Recursion depth
 * @param {Object|null} [accumulatedOptions=null] - Inherited slot options (e.g. nodeOffset, nodeMove)
 * @returns {Object|null} Hierarchical assembly tree node
 */
export function resolveAssemblyTree(
  rootPartName,
  partsMap,
  slotTypeMap,
  activeSelections = {},
  visited = new Set(),
  depth = 0,
  accumulatedOptions = null
) {
  if (!rootPartName || visited.has(rootPartName) || depth > 12) return null;
  visited.add(rootPartName);

  const partInfo = partsMap[rootPartName];
  if (!partInfo) return null;

  const resolvedNode = {
    partName: rootPartName,
    description: partInfo.information?.name?.txt || partInfo.information?.name || rootPartName,
    slotType: partInfo.slotType,
    filePath: partInfo.filePath,
    color: getPartColor(rootPartName, depth),
    nodeCount: partInfo.nodeCount,
    beamCount: partInfo.beamCount,
    triCount: partInfo.triCount,
    slotOptions: accumulatedOptions,
    slots: []
  };

  for (const slot of partInfo.slots || []) {
    // Determine compatible parts for this slot
    const compatibleParts = [];
    for (const allowedType of slot.allowTypes || []) {
      const candidates = slotTypeMap[allowedType] || [];
      for (const cand of candidates) {
        if (!slot.denyTypes || !slot.denyTypes.includes(cand.partName)) {
          if (!compatibleParts.includes(cand.partName)) {
            compatibleParts.push(cand.partName);
          }
        }
      }
    }

    // Determine chosen part
    let chosenPartName = activeSelections[slot.name];
    if (chosenPartName === undefined) {
      chosenPartName = slot.default;
    }

    // If an empty string or "none" was chosen
    const isNone = chosenPartName === '' || chosenPartName === 'none';

    let childSubtree = null;
    if (!isNone && chosenPartName && partsMap[chosenPartName]) {
      // Accumulate slot options (e.g. nodeOffset, nodeMove) down the tree
      const childAccumulated = {
        ...(accumulatedOptions || {}),
        ...(slot.slotOptions || {})
      };

      if (accumulatedOptions?.nodeOffset && slot.slotOptions?.nodeOffset) {
        childAccumulated.nodeOffset = {
          x: (accumulatedOptions.nodeOffset.x || 0) + (slot.slotOptions.nodeOffset.x || 0),
          y: (accumulatedOptions.nodeOffset.y || 0) + (slot.slotOptions.nodeOffset.y || 0),
          z: (accumulatedOptions.nodeOffset.z || 0) + (slot.slotOptions.nodeOffset.z || 0)
        };
      }

      childSubtree = resolveAssemblyTree(
        chosenPartName,
        partsMap,
        slotTypeMap,
        activeSelections,
        new Set(visited),
        depth + 1,
        childAccumulated
      );
    }

    resolvedNode.slots.push({
      slotName: slot.name,
      description: slot.description || slot.name,
      allowTypes: slot.allowTypes,
      coreSlot: slot.coreSlot,
      chosenPart: chosenPartName,
      isNone,
      availableParts: compatibleParts,
      slotOptions: slot.slotOptions,
      child: childSubtree
    });
  }

  return resolvedNode;
}

/**
 * Traverses an assembly tree and collects all active chosen part names.
 *
 * @param {Object} treeNode - Root node of assembly tree
 * @param {Object} [partVisibility] - Map of partName -> boolean
 * @returns {Array<{partName: string, filePath: string, color: string, slotOptions: Object|null}>}
 */
export function getActiveAssembledParts(treeNode, partVisibility = {}) {
  const result = [];
  if (!treeNode) return result;

  function traverse(node) {
    if (!node) return;
    const isVisible = partVisibility[node.partName] !== false; // default visible
    if (isVisible) {
      result.push({
        partName: node.partName,
        filePath: node.filePath,
        color: node.color,
        slotOptions: node.slotOptions || null
      });
    }

    for (const s of node.slots || []) {
      if (s.child) {
        traverse(s.child);
      }
    }
  }

  traverse(treeNode);
  return result;
}

/**
 * Applies BeamNG nodeOffset and nodeMove formulas to a node.
 * Uses official bilateral sign reflection across the X centerline: sign(posX) * offset.x
 */
export function applyNodeOffsets(node, slotOptions = null, variables = {}) {
  if (!node) return;
  const px = Number(node.posX !== undefined ? node.posX : (node.pos && node.pos[0] !== undefined ? node.pos[0] : (node.rx !== undefined ? node.rx : 0))) || 0;
  const py = Number(node.posY !== undefined ? node.posY : (node.pos && node.pos[1] !== undefined ? node.pos[1] : (node.ry !== undefined ? node.ry : 0))) || 0;
  const pz = Number(node.posZ !== undefined ? node.posZ : (node.pos && node.pos[2] !== undefined ? node.pos[2] : (node.rz !== undefined ? node.rz : 0))) || 0;

  let totalOffsetX = 0.0;
  let totalOffsetY = 0.0;
  let totalOffsetZ = 0.0;

  const nodeOffset = node.nodeOffset || slotOptions?.nodeOffset;
  if (nodeOffset && typeof nodeOffset === 'object') {
    // Bilateral X sign reflection: sign(px) * offset.x (matching BeamNG engine)
    const signX = px >= 0 ? 1 : -1;
    const offX = evaluateJBeamValue(nodeOffset.x, variables);
    const offY = evaluateJBeamValue(nodeOffset.y, variables);
    const offZ = evaluateJBeamValue(nodeOffset.z, variables);
    totalOffsetX += signX * (Number(offX) || 0);
    totalOffsetY += (Number(offY) || 0);
    totalOffsetZ += (Number(offZ) || 0);
  }

  const nodeMove = node.nodeMove || slotOptions?.nodeMove;
  if (nodeMove && typeof nodeMove === 'object') {
    const movX = evaluateJBeamValue(nodeMove.x, variables);
    const movY = evaluateJBeamValue(nodeMove.y, variables);
    const movZ = evaluateJBeamValue(nodeMove.z, variables);
    totalOffsetX += (Number(movX) || 0);
    totalOffsetY += (Number(movY) || 0);
    totalOffsetZ += (Number(movZ) || 0);
  }

  const finalX = px + totalOffsetX;
  const finalY = py + totalOffsetY;
  const finalZ = pz + totalOffsetZ;

  node.posNoOffset = [px, py, pz];
  node.totalOffset = [totalOffsetX, totalOffsetY, totalOffsetZ];
  node.pos = [finalX, finalY, finalZ];
  node.posX = finalX;
  node.posY = finalY;
  node.posZ = finalZ;
}

/**
 * Loads, parses, and merges full structural data for all active assembled parts.
 *
 * @param {Array<{partName: string, filePath: string, color: string}>} activeParts
 * @param {Function} readFileFn - Async or sync function reading file text given filePath
 * @param {Object} [configVars={}] - User vehicle configuration variables (from .pc)
 * @returns {Promise<Object>} Merged composite parts object ready for JBeamViewport
 */
export async function buildCompositeVehicleData(activeParts, readFileFn, configVars = {}) {
  const compositeParts = {};

  for (const item of activeParts) {
    try {
      const text = await readFileFn(item.filePath);
      if (!text) continue;

      const bundle = decodeWithMeta(text, item.filePath, true);
      if (!bundle?.data) continue;

      const [parsedParts] = processAllParts(bundle.data);
      if (parsedParts && parsedParts[item.partName]) {
        const partData = parsedParts[item.partName];
        partData.__color = item.color;
        partData.__filePath = item.filePath;
        partData.__partName = item.partName;

        // Resolve variables combining part defaults, slot options, and vehicle config (.pc)
        const slotVars = item.slotOptions?.variables || {};
        const combinedVars = {
          ...(configVars || {}),
          ...resolveSlotVariables(slotVars, configVars || {})
        };
        const activeVars = sanitizeVariables(partData.variablesMap || {}, combinedVars);
        resolvePartNodesAndBeams(partData, activeVars);

        // Tag all nodes with owning part info & color, and apply BeamNG node offsets
        if (partData.nodes) {
          for (const nKey of Object.keys(partData.nodes)) {
            if (nKey === '__meta') continue;
            const node = partData.nodes[nKey];
            node.__partName = item.partName;
            node.__partColor = item.color;
            node.__filePath = item.filePath;
            applyNodeOffsets(node, item.slotOptions, activeVars);
          }
        }

        // Tag all beams with owning part info & color
        if (partData.beams) {
          for (const bKey of Object.keys(partData.beams)) {
            if (bKey === '__meta') continue;
            partData.beams[bKey].__partName = item.partName;
            partData.beams[bKey].__partColor = item.color;
            partData.beams[bKey].__filePath = item.filePath;
          }
        }

        // Tag all triangles with owning part info & color
        if (partData.triangles) {
          for (const tKey of Object.keys(partData.triangles)) {
            if (tKey === '__meta') continue;
            partData.triangles[tKey].__partName = item.partName;
            partData.triangles[tKey].__partColor = item.color;
            partData.triangles[tKey].__filePath = item.filePath;
          }
        }

        // Tag all quads with owning part info & color
        if (partData.quads) {
          for (const qKey of Object.keys(partData.quads)) {
            if (qKey === '__meta') continue;
            partData.quads[qKey].__partName = item.partName;
            partData.quads[qKey].__partColor = item.color;
            partData.quads[qKey].__filePath = item.filePath;
          }
        }

        compositeParts[item.partName] = partData;
      }
    } catch (err) {
      console.warn(`[AssemblyResolver] Error loading part ${item.partName}:`, err);
    }
  }

  return compositeParts;
}

export default {
  PART_PALETTE,
  getPartColor,
  resolveAssemblyTree,
  getActiveAssembledParts,
  buildCompositeVehicleData,
  applyNodeOffsets
};

