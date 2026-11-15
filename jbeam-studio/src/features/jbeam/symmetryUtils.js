/*
  JBeam Symmetry Utilities
  Handles left/right symmetry detection, mirrored node ID resolution,
  and coordinate reflection for BeamNG.drive vehicles.
*/

/**
 * Resolves the counterpart symmetrical node ID for a given node ID.
 * Follows standard BeamNG naming conventions across official & community vehicle mods:
 * - Suffix 'r' <-> 'l' (e.g. rf1r <-> rf1l, c1r <-> c1l, fx1r <-> fx1l)
 * - Suffix '_r' <-> '_l' (e.g. arm_r <-> arm_l)
 * - Suffix 'R' <-> 'L' (e.g. MIRROR_R <-> MIRROR_L)
 * - Suffix '_R' <-> '_L' (e.g. DOOR_R <-> DOOR_L)
 * - Suffix 'fr' <-> 'fl', 'rr' <-> 'rl' (front right/left, rear right/left)
 * - Substring '_r_' <-> '_l_' or '_R_' <-> '_L_'
 * - Substring 'right' <-> 'left' or 'Right' <-> 'Left'
 *
 * @param {string} nodeId
 * @returns {string|null} Mirrored node ID, or null if no symmetric counterpart
 */
export function getSymmetricNodeId(nodeId) {
  if (!nodeId || typeof nodeId !== 'string') return null;

  // 1. Suffix '_r' / '_l'
  if (nodeId.endsWith('_r')) return nodeId.slice(0, -2) + '_l';
  if (nodeId.endsWith('_l')) return nodeId.slice(0, -2) + '_r';
  if (nodeId.endsWith('_R')) return nodeId.slice(0, -2) + '_L';
  if (nodeId.endsWith('_L')) return nodeId.slice(0, -2) + '_R';

  // 2. Suffix 'fr' / 'fl', 'rr' / 'rl' (front right/left, rear right/left)
  if (nodeId.endsWith('fr')) return nodeId.slice(0, -2) + 'fl';
  if (nodeId.endsWith('fl')) return nodeId.slice(0, -2) + 'fr';
  if (nodeId.endsWith('rr')) return nodeId.slice(0, -2) + 'rl';
  if (nodeId.endsWith('rl')) return nodeId.slice(0, -2) + 'rr';
  if (nodeId.endsWith('FR')) return nodeId.slice(0, -2) + 'FL';
  if (nodeId.endsWith('FL')) return nodeId.slice(0, -2) + 'FR';
  if (nodeId.endsWith('RR')) return nodeId.slice(0, -2) + 'RL';
  if (nodeId.endsWith('RL')) return nodeId.slice(0, -2) + 'RR';

  // 2b. Pattern with trailing digits: 'fl1' <-> 'fr1', 'rl2' <-> 'rr2'
  const trailingDigitsMatch = nodeId.match(/^(.*?)(fr|fl|rr|rl|FR|FL|RR|RL)(\d+)$/);
  if (trailingDigitsMatch) {
    const [, prefix, code, digits] = trailingDigitsMatch;
    const flippedCode = {
      fr: 'fl', fl: 'fr',
      rr: 'rl', rl: 'rr',
      FR: 'FL', FL: 'FR',
      RR: 'RL', RL: 'RR'
    }[code];
    return `${prefix}${flippedCode}${digits}`;
  }

  // 3. Substrings '_r_' / '_l_'
  if (nodeId.includes('_r_')) return nodeId.replace('_r_', '_l_');
  if (nodeId.includes('_l_')) return nodeId.replace('_l_', '_r_');
  if (nodeId.includes('_R_')) return nodeId.replace('_R_', '_L_');
  if (nodeId.includes('_L_')) return nodeId.replace('_L_', '_R_');

  // 4. Substrings 'right' / 'left'
  if (nodeId.includes('right')) return nodeId.replace('right', 'left');
  if (nodeId.includes('left')) return nodeId.replace('left', 'right');
  if (nodeId.includes('Right')) return nodeId.replace('Right', 'Left');
  if (nodeId.includes('Left')) return nodeId.replace('Left', 'Right');

  // 5. Standard single-letter suffix 'r' / 'l'
  if (nodeId.endsWith('r')) return nodeId.slice(0, -1) + 'l';
  if (nodeId.endsWith('l')) return nodeId.slice(0, -1) + 'r';
  if (nodeId.endsWith('R')) return nodeId.slice(0, -1) + 'L';
  if (nodeId.endsWith('L')) return nodeId.slice(0, -1) + 'R';

  return null;
}

/**
 * Computes mirrored BeamNG coordinates for a given [x, y, z] position.
 * Lateral axis (X) is inverted: -X <-> +X.
 * Longitudinal (Y) and Vertical (Z) axes remain identical.
 *
 * @param {number[]} pos - [x, y, z] in BeamNG space
 * @returns {number[]} Mirrored [x, y, z]
 */
export function getSymmetricCoordinates(pos) {
  if (!Array.isArray(pos) || pos.length < 3) return [0, 0, 0];
  return [-pos[0], pos[1], pos[2]];
}

/**
 * Checks whether a node is likely on the central vehicle axis (X ≈ 0).
 *
 * @param {string} nodeId
 * @param {number[]} [pos]
 * @returns {boolean}
 */
export function isCentralNode(nodeId, pos) {
  if (Array.isArray(pos) && Math.abs(pos[0]) < 0.005) {
    return true;
  }
  return getSymmetricNodeId(nodeId) === null;
}

// ============================================================================
// PCA-BASED ARBITRARY MIRROR PLANE DETECTION
// Ported & Enhanced from BeamNG VS Code Extension (webview/nodeMirrorPlanes.js)
// Calculates mirror planes from 3D nodes using Principal Component Analysis
// ============================================================================

/**
 * Computes the 3D centroid of a set of node objects.
 * @param {Array<{pos: number[]}>} nodes
 * @returns {{x: number, y: number, z: number}}
 */
export function computeCentroid(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  const centroid = { x: 0, y: 0, z: 0 };
  let count = 0;
  for (const n of nodes) {
    const pos = n.pos || (Array.isArray(n) ? n : null);
    if (pos && pos.length >= 3) {
      centroid.x += Number(pos[0]) || 0;
      centroid.y += Number(pos[1]) || 0;
      centroid.z += Number(pos[2]) || 0;
      count++;
    }
  }
  if (count === 0) return { x: 0, y: 0, z: 0 };
  centroid.x /= count;
  centroid.y /= count;
  centroid.z /= count;
  return centroid;
}

/**
 * Computes the 3x3 covariance matrix for a set of centered points.
 * @param {number[][]} centeredPositions - Array of [x, y, z] arrays
 * @returns {number[][]} 3x3 covariance matrix
 */
export function computeCovarianceMatrix(centeredPositions) {
  const C = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  const N = centeredPositions.length;
  if (N === 0) return C;

  for (const pos of centeredPositions) {
    const x = pos[0], y = pos[1], z = pos[2];
    C[0][0] += x * x;
    C[0][1] += x * y;
    C[0][2] += x * z;

    C[1][0] += y * x;
    C[1][1] += y * y;
    C[1][2] += y * z;

    C[2][0] += z * x;
    C[2][1] += z * y;
    C[2][2] += z * z;
  }

  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      C[i][j] /= N;
    }
  }
  return C;
}

/**
 * Performs eigenvalue decomposition on a symmetric 3x3 matrix using the Jacobi algorithm.
 * @param {number[][]} matrix - 3x3 symmetric matrix
 * @returns {{eigenvalues: number[], eigenvectors: number[][]}}
 */
export function eigenDecomposition(matrix) {
  const MAX_ITER = 100;
  const EPSILON = 1e-10;

  let eigenvectors = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
  ];

  let A = [
    [matrix[0][0], matrix[0][1], matrix[0][2]],
    [matrix[1][0], matrix[1][1], matrix[1][2]],
    [matrix[2][0], matrix[2][1], matrix[2][2]]
  ];

  for (let iter = 0; iter < MAX_ITER; iter++) {
    let max = Math.abs(A[0][1]);
    let p = 0, q = 1;

    if (Math.abs(A[0][2]) > max) {
      max = Math.abs(A[0][2]);
      p = 0; q = 2;
    }
    if (Math.abs(A[1][2]) > max) {
      max = Math.abs(A[1][2]);
      p = 1; q = 2;
    }

    if (max < EPSILON) break;

    const app = A[p][p];
    const aqq = A[q][q];
    const apq = A[p][q];

    const phi = 0.5 * Math.atan2(2 * apq, aqq - app);
    const c = Math.cos(phi);
    const s = Math.sin(phi);

    const a_pp = c * c * app - 2 * s * c * apq + s * s * aqq;
    const a_qq = s * s * app + 2 * s * c * apq + c * c * aqq;

    A[p][p] = a_pp;
    A[q][q] = a_qq;
    A[p][q] = 0;
    A[q][p] = 0;

    for (let r = 0; r < 3; r++) {
      if (r !== p && r !== q) {
        const a_pr = A[p][r];
        const a_qr = A[q][r];
        A[p][r] = c * a_pr - s * a_qr;
        A[r][p] = A[p][r];
        A[q][r] = s * a_pr + c * a_qr;
        A[r][q] = A[q][r];
      }
    }

    for (let r = 0; r < 3; r++) {
      const v_pr = eigenvectors[r][p];
      const v_qr = eigenvectors[r][q];
      eigenvectors[r][p] = c * v_pr - s * v_qr;
      eigenvectors[r][q] = s * v_pr + c * v_qr;
    }
  }

  let eigenvalues = [A[0][0], A[1][1], A[2][2]];

  for (let i = 0; i < 3; i++) {
    const norm = Math.hypot(eigenvectors[0][i], eigenvectors[1][i], eigenvectors[2][i]);
    if (norm > 0) {
      eigenvectors[0][i] /= norm;
      eigenvectors[1][i] /= norm;
      eigenvectors[2][i] /= norm;
    }
  }

  const sortedIndices = [0, 1, 2].sort((a, b) => eigenvalues[b] - eigenvalues[a]);
  eigenvalues = sortedIndices.map(idx => eigenvalues[idx]);
  eigenvectors = [
    [eigenvectors[0][sortedIndices[0]], eigenvectors[0][sortedIndices[1]], eigenvectors[0][sortedIndices[2]]],
    [eigenvectors[1][sortedIndices[0]], eigenvectors[1][sortedIndices[1]], eigenvectors[1][sortedIndices[2]]],
    [eigenvectors[2][sortedIndices[0]], eigenvectors[2][sortedIndices[1]], eigenvectors[2][sortedIndices[2]]]
  ];

  return { eigenvalues, eigenvectors };
}

/**
 * Mirrors a 3D point across an arbitrary plane defined by a normal vector and a center point.
 * @param {number[]} point - [x, y, z]
 * @param {{x: number, y: number, z: number}} normal
 * @param {{x: number, y: number, z: number}} planePoint
 * @returns {number[]} Mirrored [x, y, z]
 */
export function mirrorPointAcrossPlane(point, normal, planePoint) {
  const nx = normal.x, ny = normal.y, nz = normal.z;
  const nLen = Math.hypot(nx, ny, nz) || 1;
  const unx = nx / nLen, uny = ny / nLen, unz = nz / nLen;

  const vx = point[0] - planePoint.x;
  const vy = point[1] - planePoint.y;
  const vz = point[2] - planePoint.z;

  const dist = vx * unx + vy * uny + vz * unz;

  return [
    point[0] - 2 * dist * unx,
    point[1] - 2 * dist * uny,
    point[2] - 2 * dist * unz
  ];
}

/**
 * Calculates Euclidean distance between two 3D positions.
 */
function dist3D(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Checks if two planes are practically identical based on their normal vectors and point.
 */
function arePlanesSimilar(planeA, planeB, tol = 0.05) {
  const na = planeA.normal, nb = planeB.normal;
  const dot = Math.abs(na.x * nb.x + na.y * nb.y + na.z * nb.z);
  return Math.abs(dot - 1.0) < tol;
}

/**
 * Detects all potential symmetry planes across a collection of nodes using PCA and axis alignments.
 * Returns candidate planes scored by the percentage of nodes that have a symmetric partner.
 *
 * @param {Array<{id: string, pos: number[]}>} nodesList
 * @param {number} tolerance - Max distance (in meters) to consider two nodes as mirrored (default: 0.02m / 20mm)
 * @returns {Array<{label: string, normal: {x: number, y: number, z: number}, point: {x: number, y: number, z: number}, symmetricCount: number, symmetryPercentage: number, isAxisAligned: boolean}>}
 */
export function detectAllMirrorPlanes(nodesList, tolerance = 0.02) {
  if (!Array.isArray(nodesList) || nodesList.length < 3) {
    return [];
  }

  const validNodes = nodesList.filter(n => n && Array.isArray(n.pos) && n.pos.length >= 3);
  if (validNodes.length < 3) return [];

  const centroid = computeCentroid(validNodes);

  // 1. Standard candidate planes:
  // - YZ plane (Normal X=1, Y=0, Z=0) -> Lateral symmetry (BeamNG Default)
  // - XZ plane (Normal Y=1) -> Fore/Aft symmetry
  // - XY plane (Normal Z=1) -> Top/Bottom symmetry
  const candidatePlanes = [
    { label: 'Lateral Centerline (X=0)', normal: { x: 1, y: 0, z: 0 }, point: { x: 0, y: centroid.y, z: centroid.z }, isAxisAligned: true },
    { label: 'Fore/Aft Transverse (Y=Centroid)', normal: { x: 0, y: 1, z: 0 }, point: centroid, isAxisAligned: true },
    { label: 'Vertical Horizontal (Z=Centroid)', normal: { x: 0, y: 0, z: 1 }, point: centroid, isAxisAligned: true }
  ];

  // 2. PCA Eigenvector planes
  const centered = validNodes.map(n => [n.pos[0] - centroid.x, n.pos[1] - centroid.y, n.pos[2] - centroid.z]);
  const cov = computeCovarianceMatrix(centered);
  const { eigenvectors } = eigenDecomposition(cov);

  for (let i = 0; i < 3; i++) {
    const pcaNormal = { x: eigenvectors[0][i], y: eigenvectors[1][i], eigenvectors: eigenvectors[2][i], z: eigenvectors[2][i] };
    const plane = {
      label: `PCA Eigen-Plane #${i + 1}`,
      normal: pcaNormal,
      point: centroid,
      isAxisAligned: false
    };

    if (!candidatePlanes.some(existing => arePlanesSimilar(existing, plane, 0.08))) {
      candidatePlanes.push(plane);
    }
  }

  // 3. Score each candidate plane by counting mirrored pairs
  const scoredPlanes = candidatePlanes.map(plane => {
    let symmetricCount = 0;
    const matchedNodes = new Set();

    for (const node of validNodes) {
      if (matchedNodes.has(node.id)) {
        symmetricCount++;
        continue;
      }

      // Check if node lies directly on the mirror plane
      const p = node.pos;
      const vx = p[0] - plane.point.x, vy = p[1] - plane.point.y, vz = p[2] - plane.point.z;
      const distToPlane = Math.abs(vx * plane.normal.x + vy * plane.normal.y + vz * plane.normal.z);
      if (distToPlane < tolerance) {
        symmetricCount++;
        matchedNodes.add(node.id);
        continue;
      }

      // Mirror position across plane
      const mirroredPos = mirrorPointAcrossPlane(p, plane.normal, plane.point);

      // Check if there is a matching counterpart in validNodes
      const pair = validNodes.find(other => other.id !== node.id && dist3D(other.pos, mirroredPos) < tolerance);
      if (pair) {
        symmetricCount++;
        matchedNodes.add(node.id);
        matchedNodes.add(pair.id);
      }
    }

    const symmetryPercentage = Math.round((symmetricCount / validNodes.length) * 100);
    return {
      ...plane,
      symmetricCount,
      totalNodes: validNodes.length,
      symmetryPercentage
    };
  });

  // Sort by highest symmetry percentage
  return scoredPlanes.sort((a, b) => b.symmetryPercentage - a.symmetryPercentage);
}

/**
 * Identifies asymmetric outlier nodes that do not have a counterpart across the specified mirror plane.
 * @param {Array<{id: string, pos: number[]}>} nodesList
 * @param {{normal: {x: number, y: number, z: number}, point: {x: number, y: number, z: number}}} plane
 * @param {number} tolerance
 * @returns {Array<string>} List of node IDs lacking symmetry
 */
export function findAsymmetricNodes(nodesList, plane, tolerance = 0.02) {
  if (!Array.isArray(nodesList) || !plane) return [];
  const validNodes = nodesList.filter(n => n && Array.isArray(n.pos) && n.pos.length >= 3);
  const asymmetricNodeIds = [];

  for (const node of validNodes) {
    const p = node.pos;
    const vx = p[0] - plane.point.x, vy = p[1] - plane.point.y, vz = p[2] - plane.point.z;
    const distToPlane = Math.abs(vx * plane.normal.x + vy * plane.normal.y + vz * plane.normal.z);
    if (distToPlane < tolerance) continue; // On the plane

    const mirroredPos = mirrorPointAcrossPlane(p, plane.normal, plane.point);
    const hasPair = validNodes.some(other => other.id !== node.id && dist3D(other.pos, mirroredPos) < tolerance);
    if (!hasPair) {
      asymmetricNodeIds.push(node.id);
    }
  }

  return asymmetricNodeIds;
}

export default {
  getSymmetricNodeId,
  getSymmetricCoordinates,
  isCentralNode,
  computeCentroid,
  computeCovarianceMatrix,
  eigenDecomposition,
  mirrorPointAcrossPlane,
  detectAllMirrorPlanes,
  findAsymmetricNodes
};

