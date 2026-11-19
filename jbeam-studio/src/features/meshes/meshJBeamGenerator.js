/**
 * Utility functions for computing composite multi-mesh bounds and
 * generating BeamNG JBeam templates for one or more 3D meshes.
 */

/**
 * Computes the union bounding box across multiple submeshes.
 * @param {string[]|Set<string>} meshNames 
 * @param {Object} detailsMap Map of meshName -> submesh details
 * @returns {Object|null}
 */
export function computeCompositeBoundingBox(meshNames, detailsMap = {}) {
  const names = Array.isArray(meshNames) ? meshNames : Array.from(meshNames || []);
  if (!names.length) return null;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let hasValidBox = false;
  let totalTriangles = 0;
  let totalVertices = 0;

  for (const name of names) {
    const d = detailsMap[name];
    if (!d) continue;

    if (d.triangles) totalTriangles += d.triangles;
    if (d.vertices) totalVertices += d.vertices;

    if (d.bbox) {
      minX = Math.min(minX, d.bbox.min.x);
      minY = Math.min(minY, d.bbox.min.y);
      minZ = Math.min(minZ, d.bbox.min.z);
      maxX = Math.max(maxX, d.bbox.max.x);
      maxY = Math.max(maxY, d.bbox.max.y);
      maxZ = Math.max(maxZ, d.bbox.max.z);
      hasValidBox = true;
    }
  }

  if (!hasValidBox) {
    return {
      hasBBox: false,
      totalTriangles,
      totalVertices
    };
  }

  const size = {
    x: +(maxX - minX).toFixed(4),
    y: +(maxY - minY).toFixed(4),
    z: +(maxZ - minZ).toFixed(4)
  };

  const center = {
    x: +((minX + maxX) / 2).toFixed(4),
    y: +((minY + maxY) / 2).toFixed(4),
    z: +((minZ + maxZ) / 2).toFixed(4)
  };

  return {
    hasBBox: true,
    min: { x: +minX.toFixed(4), y: +minY.toFixed(4), z: +minZ.toFixed(4) },
    max: { x: +maxX.toFixed(4), y: +maxY.toFixed(4), z: +maxZ.toFixed(4) },
    size,
    center,
    totalTriangles,
    totalVertices
  };
}

/**
 * Derives a clean part name from selected mesh names and a vehicle prefix.
 * @param {string} vehiclePrefix 
 * @param {string[]|Set<string>} meshNames 
 * @returns {string}
 */
export function deriveMultiMeshPartName(vehiclePrefix = 'custom', meshNames = []) {
  const names = Array.isArray(meshNames) ? meshNames : Array.from(meshNames || []);
  const cleanPrefix = (vehiclePrefix || 'custom').toLowerCase().replace(/[^a-z0-9_]/g, '_');
  if (!names.length) return `${cleanPrefix}_part`;

  if (names.length === 1) {
    let clean = names[0].toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    if (clean.startsWith(cleanPrefix)) {
      clean = clean.slice(cleanPrefix.length).replace(/^_+/, '');
    }
    return clean ? `${cleanPrefix}_${clean}` : `${cleanPrefix}_part`;
  }

  // Find longest common prefix among cleaned mesh names
  const cleanTokensList = names.map(n => 
    n.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').split('_')
  );

  let commonTokens = [];
  const firstTokens = cleanTokensList[0] || [];
  for (let i = 0; i < firstTokens.length; i++) {
    const tok = firstTokens[i];
    const allHaveIt = cleanTokensList.every(list => list[i] === tok);
    if (allHaveIt) {
      commonTokens.push(tok);
    } else {
      break;
    }
  }

  let baseName = commonTokens.join('_');
  if (baseName.startsWith(cleanPrefix)) {
    baseName = baseName.slice(cleanPrefix.length).replace(/^_+/, '');
  }

  if (baseName && baseName.length >= 3) {
    return `${cleanPrefix}_${baseName}`;
  }

  return `${cleanPrefix}_assembly`;
}

/**
 * Generates BeamNG-compliant JBeam text for one or multiple 3D meshes.
 * @param {Object} options
 * @param {string} options.partKey
 * @param {string} options.slotKey
 * @param {string} options.partDesc
 * @param {string[]|Set<string>} options.targetMeshes
 * @param {Object} options.meshDetailsMap
 * @param {'skeleton'|'cage'} options.templateType
 * @returns {string} JBeam JSON content
 */
export function generateMultiMeshJBeam({
  partKey,
  slotKey,
  partDesc,
  targetMeshes = [],
  meshDetailsMap = {},
  templateType = 'skeleton'
}) {
  const safePartKey = (partKey || 'custom_part').replace(/[^a-zA-Z0-9_]/g, '_');
  const safeSlotKey = (slotKey || safePartKey).replace(/[^a-zA-Z0-9_]/g, '_');
  const safeDesc = (partDesc || safePartKey).replace(/["\\]/g, '');

  const meshes = Array.isArray(targetMeshes) ? targetMeshes : Array.from(targetMeshes || []);
  if (!meshes.length) {
    meshes.push('mesh_part');
  }

  // Build flexbodies array
  const flexbodyLines = [
    '      ["mesh", "[group]:", "nonFlexMaterials"]',
    ...meshes.map(m => `      ["${m}", ["${safePartKey}"]]`)
  ].join(',\n');

  if (templateType === 'cage') {
    const compositeBBox = computeCompositeBoundingBox(meshes, meshDetailsMap);
    if (compositeBBox && compositeBBox.hasBBox) {
      const { min, max } = compositeBBox;
      const x1 = min.x, x2 = max.x;
      const y1 = min.y, y2 = max.y;
      const z1 = min.z, z2 = max.z;

      return `{\n  "${safePartKey}": {\n    "information": {\n      "authors": "BeamModder",\n      "name": "${safeDesc}"\n    },\n    "slotType": "${safeSlotKey}",\n    "flexbodies": [\n${flexbodyLines}\n    ],\n    "nodes": [\n      ["id", "posX", "posY", "posZ"],\n      {"nodeWeight": 4.5},\n      {"frictionCoef": 0.5},\n      {"group": "${safePartKey}"},\n      ["${safePartKey}_fl1", ${x1}, ${y1}, ${z2}],\n      ["${safePartKey}_fr1", ${x2}, ${y1}, ${z2}],\n      ["${safePartKey}_rl1", ${x1}, ${y2}, ${z2}],\n      ["${safePartKey}_rr1", ${x2}, ${y2}, ${z2}],\n      ["${safePartKey}_fl2", ${x1}, ${y1}, ${z1}],\n      ["${safePartKey}_fr2", ${x2}, ${y1}, ${z1}],\n      ["${safePartKey}_rl2", ${x1}, ${y2}, ${z1}],\n      ["${safePartKey}_rr2", ${x2}, ${y2}, ${z1}]\n    ],\n    "beams": [\n      ["id1:", "id2:"],\n      {"beamPrecompression": 1, "beamType": "|NORMAL", "beamLongBound": 1, "beamShortBound": 1},\n      {"beamSpring": 1401000, "beamDamp": 120},\n      {"beamDeform": 32000, "beamStrength": "FLT_MAX"},\n      ["${safePartKey}_fl1", "${safePartKey}_fr1"],\n      ["${safePartKey}_fr1", "${safePartKey}_rr1"],\n      ["${safePartKey}_rr1", "${safePartKey}_rl1"],\n      ["${safePartKey}_rl1", "${safePartKey}_fl1"],\n      ["${safePartKey}_fl2", "${safePartKey}_fr2"],\n      ["${safePartKey}_fr2", "${safePartKey}_rr2"],\n      ["${safePartKey}_rr2", "${safePartKey}_rl2"],\n      ["${safePartKey}_rl2", "${safePartKey}_fl2"],\n      ["${safePartKey}_fl1", "${safePartKey}_fl2"],\n      ["${safePartKey}_fr1", "${safePartKey}_fr2"],\n      ["${safePartKey}_rl1", "${safePartKey}_rl2"],\n      ["${safePartKey}_rr1", "${safePartKey}_rr2"],\n      ["${safePartKey}_fl1", "${safePartKey}_rr1"],\n      ["${safePartKey}_fr1", "${safePartKey}_rl1"],\n      ["${safePartKey}_fl2", "${safePartKey}_rr2"],\n      ["${safePartKey}_fr2", "${safePartKey}_rl2"]\n    ],\n    "triangles": [\n      ["id1:", "id2:", "id3:"],\n      {"groundModel": "metal"},\n      {"group": "${safePartKey}"},\n      ["${safePartKey}_fl1", "${safePartKey}_fr1", "${safePartKey}_rr1"],\n      ["${safePartKey}_rr1", "${safePartKey}_rl1", "${safePartKey}_fl1"]\n    ]\n  }\n}\n`;
    }
  }

  // Clean skeleton template
  return `{\n  "${safePartKey}": {\n    "information": {\n      "authors": "BeamModder",\n      "name": "${safeDesc}"\n    },\n    "slotType": "${safeSlotKey}",\n    "flexbodies": [\n${flexbodyLines}\n    ],\n    "nodes": [\n      ["id", "posX", "posY", "posZ"],\n      {"nodeWeight": 4.5},\n      {"frictionCoef": 0.5},\n      {"group": "${safePartKey}"}\n    ],\n    "beams": [\n      ["id1:", "id2:"],\n      {"beamPrecompression": 1, "beamType": "|NORMAL", "beamLongBound": 1, "beamShortBound": 1},\n      {"beamSpring": 1401000, "beamDamp": 120},\n      {"beamDeform": 32000, "beamStrength": "FLT_MAX"}\n    ]\n  }\n}\n`;
}
