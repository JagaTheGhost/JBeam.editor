/*
  JBeam Studio - Wavefront OBJ <-> JBeam Skeleton Converter
  Inspired by RORMasa/NodeBeamEditor.
  Bi-directional converter between 3D Wavefront .obj files and BeamNG JBeam tables.
*/

import { extractNodeCoords } from '../viewport/visualizers.js';

export const AXIS_PRESETS = {
  direct: { id: 'direct', label: 'Direct / BeamNG (X Right, Y Rear, Z Up)' },
  blender_zup: { id: 'blender_zup', label: 'Blender Standard (X Right, Y Forward, Z Up)' },
  standard_yup: { id: 'standard_yup', label: 'Standard CAD (X Right, Y Up, Z Backward)' }
};

/**
 * Parses Wavefront OBJ text into nodes, beams, and surface triangles/quads.
 *
 * @param {string} objText
 * @param {object} [options={}]
 * @param {string} [options.partName='imported_obj']
 * @param {string} [options.nodePrefix='n']
 * @param {number} [options.nodeWeight=5.0]
 * @param {string} [options.axisPreset='direct']
 * @param {number} [options.scale=1.0]
 * @param {number} [options.weldDistance=0.002] // 2mm tolerance to merge duplicate vertices
 * @param {object} [options.beamProperties]
 * @returns {{ jbeamText: string, nodeCount: number, beamCount: number, triangleCount: number, quadCount: number }}
 */
export function convertObjToJBeam(objText, options = {}) {
  if (!objText || typeof objText !== 'string') {
    throw new Error('Invalid OBJ text input');
  }

  const partName = (options.partName || 'imported_obj').replace(/[^a-zA-Z0-9_]/g, '_');
  const nodePrefix = options.nodePrefix || 'n';
  const nodeWeight = Number(options.nodeWeight) || 5.0;
  const axisPreset = options.axisPreset || 'direct';
  const scale = Number(options.scale) || 1.0;
  const weldDistanceSq = Math.pow(Number(options.weldDistance) || 0.002, 2);

  const rawVertices = [];
  const lines = objText.split(/\r?\n/);
  const edgesSet = new Set();
  const triangles = [];
  const quads = [];

  // Parse lines of OBJ
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0];

    if (cmd === 'v') {
      let x = parseFloat(parts[1]) * scale;
      let y = parseFloat(parts[2]) * scale;
      let z = parseFloat(parts[3]) * scale;

      // Coordinate transform based on preset
      if (axisPreset === 'standard_yup') {
        // Y is up in OBJ -> Z in BeamNG, Z is backward -> Y in BeamNG
        const tempY = y;
        y = z;
        z = tempY;
      } else if (axisPreset === 'blender_zup') {
        // In Blender, -Y is often front, +Y rear; identical or inverted
        // direct mapping
      }

      rawVertices.push({ x, y, z });
    } else if (cmd === 'l') {
      // Line elements: l v1 v2 v3...
      const indices = parts.slice(1).map(p => {
        const vIdx = parseInt(p.split('/')[0], 10);
        return vIdx < 0 ? rawVertices.length + vIdx : vIdx - 1;
      });
      for (let i = 0; i < indices.length - 1; i++) {
        const idx1 = indices[i];
        const idx2 = indices[i + 1];
        if (idx1 >= 0 && idx2 >= 0 && idx1 !== idx2) {
          const edgeKey = idx1 < idx2 ? `${idx1}_${idx2}` : `${idx2}_${idx1}`;
          edgesSet.add(edgeKey);
        }
      }
    } else if (cmd === 'f') {
      // Face elements: f v1 v2 v3 [v4]
      const indices = parts.slice(1).map(p => {
        const vIdx = parseInt(p.split('/')[0], 10);
        return vIdx < 0 ? rawVertices.length + vIdx : vIdx - 1;
      });

      if (indices.length === 3) {
        triangles.push(indices);
        // Add polygon boundary edges as beams
        edgesSet.add(indices[0] < indices[1] ? `${indices[0]}_${indices[1]}` : `${indices[1]}_${indices[0]}`);
        edgesSet.add(indices[1] < indices[2] ? `${indices[1]}_${indices[2]}` : `${indices[2]}_${indices[1]}`);
        edgesSet.add(indices[2] < indices[0] ? `${indices[2]}_${indices[0]}` : `${indices[0]}_${indices[2]}`);
      } else if (indices.length === 4) {
        quads.push(indices);
        // Add quad perimeter edges as beams
        edgesSet.add(indices[0] < indices[1] ? `${indices[0]}_${indices[1]}` : `${indices[1]}_${indices[0]}`);
        edgesSet.add(indices[1] < indices[2] ? `${indices[1]}_${indices[2]}` : `${indices[2]}_${indices[1]}`);
        edgesSet.add(indices[2] < indices[3] ? `${indices[2]}_${indices[3]}` : `${indices[3]}_${indices[2]}`);
        edgesSet.add(indices[3] < indices[0] ? `${indices[3]}_${indices[0]}` : `${indices[0]}_${indices[3]}`);
      }
    }
  }

  if (rawVertices.length === 0) {
    throw new Error('No vertices found in OBJ file');
  }

  // Vertex welding: Map close vertices to a single canonical vertex index
  const vertexRemap = new Array(rawVertices.length);
  const weldedVertices = [];

  for (let i = 0; i < rawVertices.length; i++) {
    const v = rawVertices[i];
    let matchedIdx = -1;

    for (let w = 0; w < weldedVertices.length; w++) {
      const wv = weldedVertices[w];
      const dx = v.x - wv.x;
      const dy = v.y - wv.y;
      const dz = v.z - wv.z;
      if (dx * dx + dy * dy + dz * dz <= weldDistanceSq) {
        matchedIdx = w;
        break;
      }
    }

    if (matchedIdx !== -1) {
      vertexRemap[i] = matchedIdx;
    } else {
      const newW = weldedVertices.length;
      weldedVertices.push(v);
      vertexRemap[i] = newW;
    }
  }

  // Generate node list with clean IDs
  const nodes = [];
  const nodeNameMap = new Map();

  for (let i = 0; i < weldedVertices.length; i++) {
    const v = weldedVertices[i];
    const nodeId = `${nodePrefix}${i + 1}`;
    nodeNameMap.set(i, nodeId);
    nodes.push([nodeId, Number(v.x.toFixed(4)), Number(v.y.toFixed(4)), Number(v.z.toFixed(4))]);
  }

  // Generate unique beams from remapped edges
  const beamPairs = new Set();
  for (const edgeKey of edgesSet) {
    const [rawA, rawB] = edgeKey.split('_').map(Number);
    const a = vertexRemap[rawA];
    const b = vertexRemap[rawB];
    if (a !== undefined && b !== undefined && a !== b) {
      const id1 = nodeNameMap.get(a);
      const id2 = nodeNameMap.get(b);
      const pairKey = id1 < id2 ? `["${id1}", "${id2}"]` : `["${id2}", "${id1}"]`;
      beamPairs.add(pairKey);
    }
  }

  // Generate triangles
  const jbeamTriangles = [];
  for (const tri of triangles) {
    const a = vertexRemap[tri[0]];
    const b = vertexRemap[tri[1]];
    const c = vertexRemap[tri[2]];
    if (a !== b && b !== c && c !== a) {
      jbeamTriangles.push([nodeNameMap.get(a), nodeNameMap.get(b), nodeNameMap.get(c)]);
    }
  }

  // Generate quads
  const jbeamQuads = [];
  for (const q of quads) {
    const a = vertexRemap[q[0]];
    const b = vertexRemap[q[1]];
    const c = vertexRemap[q[2]];
    const d = vertexRemap[q[3]];
    if (a !== b && b !== c && c !== d && d !== a) {
      jbeamQuads.push([nodeNameMap.get(a), nodeNameMap.get(b), nodeNameMap.get(c), nodeNameMap.get(d)]);
    }
  }

  const beamProps = options.beamProperties || {
    beamSpring: 2001000,
    beamDamp: 200,
    beamDeform: 35000,
    beamStrength: 150000
  };

  // Build clean JBeam formatted string
  const jbeamObj = {
    [partName]: {
      information: {
        authors: "JBeam Editor",
        name: options.partTitle || "Imported OBJ Skeleton"
      },
      slotType: options.slotType || "main",
      nodes: [
        ["id", "posX", "posY", "posZ"],
        { nodeWeight: nodeWeight },
        ...nodes
      ],
      beams: [
        ["id1:", "id2:"],
        beamProps,
        ...Array.from(beamPairs).map(p => JSON.parse(p))
      ],
      ...(jbeamTriangles.length > 0 ? {
        triangles: [
          ["id1:", "id2:", "id3:"],
          ...jbeamTriangles
        ]
      } : {}),
      ...(jbeamQuads.length > 0 ? {
        quads: [
          ["id1:", "id2:", "id3:", "id4:"],
          ...jbeamQuads
        ]
      } : {})
    }
  };

  const jbeamText = JSON.stringify(jbeamObj, null, 2);

  return {
    jbeamText,
    nodeCount: nodes.length,
    beamCount: beamPairs.size,
    triangleCount: jbeamTriangles.length,
    quadCount: jbeamQuads.length
  };
}

/**
 * Converts a JBeam part structure (nodes, beams, triangles, quads) into Wavefront OBJ format.
 *
 * @param {object} partData - Part dictionary with nodes, beams, triangles, quads
 * @param {object} [options={}]
 * @returns {string} Wavefront OBJ formatted text
 */
export function convertJBeamToObj(partData, options = {}) {
  if (!partData || typeof partData !== 'object') {
    throw new Error('Invalid JBeam part data');
  }

  const nodesDict = partData.nodes || {};
  const beamsDict = partData.beams || {};
  const trianglesDict = partData.triangles || {};
  const quadsDict = partData.quads || {};

  const lines = [
    '# JBeam Studio Wavefront OBJ Export',
    `# Exported nodes: ${Object.keys(nodesDict).length}`,
    `o ${options.partName || 'JBeam_Skeleton'}`
  ];

  const nodeIndexMap = new Map();
  let vIndex = 1;

  // 1. Write vertices
  const nodeKeys = Object.keys(nodesDict).filter(k => k !== '__meta');
  for (const k of nodeKeys) {
    const node = nodesDict[k];
    if (!node || typeof node !== 'object') continue;
    const [px, py, pz] = extractNodeCoords(node);
    const nId = node.id || node.name || k;
    nodeIndexMap.set(nId, vIndex);
    lines.push(`v ${px.toFixed(6)} ${py.toFixed(6)} ${pz.toFixed(6)}`);
    vIndex++;
  }

  // 2. Write beams as lines ('l v1 v2')
  const beamKeys = Object.keys(beamsDict).filter(k => k !== '__meta');
  if (beamKeys.length > 0) {
    lines.push('g Beams');
    for (const bk of beamKeys) {
      const b = beamsDict[bk];
      if (!b || typeof b !== 'object') continue;
      const id1 = b['id1:'] || b.id1;
      const id2 = b['id2:'] || b.id2;
      const idx1 = nodeIndexMap.get(id1);
      const idx2 = nodeIndexMap.get(id2);
      if (idx1 !== undefined && idx2 !== undefined) {
        lines.push(`l ${idx1} ${idx2}`);
      }
    }
  }

  // 3. Write triangles as faces ('f v1 v2 v3')
  const triKeys = Object.keys(trianglesDict).filter(k => k !== '__meta');
  if (triKeys.length > 0) {
    lines.push('g Triangles');
    for (const tk of triKeys) {
      const t = trianglesDict[tk];
      if (!t || typeof t !== 'object') continue;
      const id1 = t['id1:'] || t.id1;
      const id2 = t['id2:'] || t.id2;
      const id3 = t['id3:'] || t.id3;
      const idx1 = nodeIndexMap.get(id1);
      const idx2 = nodeIndexMap.get(id2);
      const idx3 = nodeIndexMap.get(id3);
      if (idx1 !== undefined && idx2 !== undefined && idx3 !== undefined) {
        lines.push(`f ${idx1} ${idx2} ${idx3}`);
      }
    }
  }

  // 4. Write quads as faces ('f v1 v2 v3 v4')
  const quadKeys = Object.keys(quadsDict).filter(k => k !== '__meta');
  if (quadKeys.length > 0) {
    lines.push('g Quads');
    for (const qk of quadKeys) {
      const q = quadsDict[qk];
      if (!q || typeof q !== 'object') continue;
      const id1 = q['id1:'] || q.id1;
      const id2 = q['id2:'] || q.id2;
      const id3 = q['id3:'] || q.id3;
      const id4 = q['id4:'] || q.id4;
      const idx1 = nodeIndexMap.get(id1);
      const idx2 = nodeIndexMap.get(id2);
      const idx3 = nodeIndexMap.get(id3);
      const idx4 = nodeIndexMap.get(id4);
      if (idx1 !== undefined && idx2 !== undefined && idx3 !== undefined && idx4 !== undefined) {
        lines.push(`f ${idx1} ${idx2} ${idx3} ${idx4}`);
      }
    }
  }

  return lines.join('\n');
}

export default {
  AXIS_PRESETS,
  convertObjToJBeam,
  convertJBeamToObj
};

