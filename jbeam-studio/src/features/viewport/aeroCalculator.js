/**
 * Aerodynamics & Center of Pressure (CoP) Analyzer for JBeam Studio
 * Calculates vehicle frontal projected area, surface normals, drag/lift distribution,
 * and aerodynamic Center of Pressure relative to vehicle Center of Gravity.
 */

import * as THREE from 'three';
import { beamngToThree } from './coordinateUtils.js';
import { extractNodeCoords } from './visualizers.js';

/**
 * Calculates comprehensive aerodynamic properties from vehicle surfaces and nodes.
 *
 * BeamNG physics coordinates:
 * X: Lateral (+X = Left, -X = Right)
 * Y: Longitudinal (-Y = Forward / Oncoming flow, +Y = Rearward)
 * Z: Vertical (+Z = Up, -Z = Down)
 *
 * @param {object} surfacesOrParts - Object containing triangles and quads, or parts dictionary
 * @param {Record<string, object|number[]>} nodesDict - Normalized or merged nodes dictionary
 * @param {object} [options] - Options (e.g. cogBeamng for stability margin calculation)
 * @returns {object} Aerodynamics result object
 */
export function calculateAerodynamics(surfacesOrParts, nodesDict, options = {}) {
  if (!surfacesOrParts || !nodesDict) {
    return {
      valid: false,
      totalAreaM2: 0,
      frontalAreaM2: 0,
      lateralAreaM2: 0,
      copBeamng: [0, 0, 0],
      copThree: new THREE.Vector3(0, 0, 0),
      stabilityRating: 'Unknown',
      staticMarginMm: 0,
      frontAeroPercent: 50,
      rearAeroPercent: 50,
      surfaceCount: 0
    };
  }

  // Extract triangles and quads
  const triangles = [];
  const quads = [];

  const inspectPart = (part) => {
    if (!part || typeof part !== 'object') return;
    if (part.triangles) {
      if (Array.isArray(part.triangles)) {
        triangles.push(...part.triangles);
      } else if (typeof part.triangles === 'object') {
        triangles.push(...Object.values(part.triangles).filter(t => t && t.__meta === undefined));
      }
    }
    if (part.quads) {
      if (Array.isArray(part.quads)) {
        quads.push(...part.quads);
      } else if (typeof part.quads === 'object') {
        quads.push(...Object.values(part.quads).filter(q => q && q.__meta === undefined));
      }
    }
  };

  if (surfacesOrParts.triangles || surfacesOrParts.quads) {
    inspectPart(surfacesOrParts);
  } else {
    for (const [k, p] of Object.entries(surfacesOrParts)) {
      if (k === '__meta') continue;
      inspectPart(p);
    }
  }

  let totalArea = 0;
  let totalFrontalArea = 0;
  let totalLateralArea = 0;
  let weightedCopX = 0;
  let weightedCopY = 0;
  let weightedCopZ = 0;
  let weightedFrontalY = 0;

  let minLongY = Infinity;
  let maxLongY = -Infinity;
  const surfaceItems = [];

  const getNodePos = (nid) => {
    if (!nid) return null;
    const n = nodesDict[nid];
    if (!n) return null;
    return extractNodeCoords(n);
  };

  // 1. Process Triangles
  for (const tri of triangles) {
    if (!tri) continue;
    const n1 = tri.id1 || tri['id1:'] || tri[0];
    const n2 = tri.id2 || tri['id2:'] || tri[1];
    const n3 = tri.id3 || tri['id3:'] || tri[2];

    const p1 = getNodePos(n1);
    const p2 = getNodePos(n2);
    const p3 = getNodePos(n3);
    if (!p1 || !p2 || !p3) continue;

    // Vectors e1 = p2 - p1, e2 = p3 - p1
    const e1 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
    const e2 = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]];

    // Cross product: n = e1 x e2
    const nx = e1[1] * e2[2] - e1[2] * e2[1];
    const ny = e1[2] * e2[0] - e1[0] * e2[2];
    const nz = e1[0] * e2[1] - e1[1] * e2[0];
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-6) continue; // degenerate surface

    const area = 0.5 * len;
    const unx = nx / len;
    const uny = ny / len;
    const unz = nz / len;

    const cx = (p1[0] + p2[0] + p3[0]) / 3;
    const cy = (p1[1] + p2[1] + p3[1]) / 3;
    const cz = (p1[2] + p2[2] + p3[2]) / 3;

    // BeamNG flow direction: oncoming wind is from -Y (forward)
    // Surface facing forward has normal pointing in -Y or +Y depending on winding.
    // Frontal projected area = area * |uny|
    const frontalProj = area * Math.abs(uny);
    const lateralProj = area * Math.abs(unx);

    totalArea += area;
    totalFrontalArea += frontalProj;
    totalLateralArea += lateralProj;

    weightedCopX += cx * area;
    weightedCopY += cy * area;
    weightedCopZ += cz * area;
    weightedFrontalY += cy * frontalProj;

    if (cy < minLongY) minLongY = cy;
    if (cy > maxLongY) maxLongY = cy;

    surfaceItems.push({
      centroid: [cx, cy, cz],
      normal: [unx, uny, unz],
      area,
      frontalProj
    });
  }

  // 2. Process Quads (split into 2 triangles)
  for (const quad of quads) {
    if (!quad) continue;
    const n1 = quad.id1 || quad['id1:'] || quad[0];
    const n2 = quad.id2 || quad['id2:'] || quad[1];
    const n3 = quad.id3 || quad['id3:'] || quad[2];
    const n4 = quad.id4 || quad['id4:'] || quad[3];

    const p1 = getNodePos(n1);
    const p2 = getNodePos(n2);
    const p3 = getNodePos(n3);
    const p4 = getNodePos(n4);
    if (!p1 || !p2 || !p3 || !p4) continue;

    // Sub-tri 1: p1, p2, p3
    const e1 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
    const e2 = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]];
    const nx1 = e1[1] * e2[2] - e1[2] * e2[1];
    const ny1 = e1[2] * e2[0] - e1[0] * e2[2];
    const nz1 = e1[0] * e2[1] - e1[1] * e2[0];
    const len1 = Math.hypot(nx1, ny1, nz1);

    // Sub-tri 2: p1, p3, p4
    const e3 = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]];
    const e4 = [p4[0] - p1[0], p4[1] - p1[1], p4[2] - p1[2]];
    const nx2 = e3[1] * e4[2] - e3[2] * e4[1];
    const ny2 = e3[2] * e4[0] - e3[0] * e4[2];
    const nz2 = e3[0] * e4[1] - e3[1] * e4[0];
    const len2 = Math.hypot(nx2, ny2, nz2);

    const area = 0.5 * (len1 + len2);
    if (area < 1e-6) continue;

    const unx = (nx1 + nx2) / (len1 + len2);
    const uny = (ny1 + ny2) / (len1 + len2);
    const unz = (nz1 + nz2) / (len1 + len2);

    const cx = (p1[0] + p2[0] + p3[0] + p4[0]) / 4;
    const cy = (p1[1] + p2[1] + p3[1] + p4[1]) / 4;
    const cz = (p1[2] + p2[2] + p3[2] + p4[2]) / 4;

    const frontalProj = area * Math.abs(uny);
    const lateralProj = area * Math.abs(unx);

    totalArea += area;
    totalFrontalArea += frontalProj;
    totalLateralArea += lateralProj;

    weightedCopX += cx * area;
    weightedCopY += cy * area;
    weightedCopZ += cz * area;
    weightedFrontalY += cy * frontalProj;

    if (cy < minLongY) minLongY = cy;
    if (cy > maxLongY) maxLongY = cy;

    surfaceItems.push({
      centroid: [cx, cy, cz],
      normal: [unx, uny, unz],
      area,
      frontalProj
    });
  }

  if (totalArea <= 0) {
    return {
      valid: false,
      totalAreaM2: 0,
      frontalAreaM2: 0,
      lateralAreaM2: 0,
      copBeamng: [0, 0, 0],
      copThree: new THREE.Vector3(0, 0, 0),
      stabilityRating: 'No Aero Surfaces',
      staticMarginMm: 0,
      frontAeroPercent: 50,
      rearAeroPercent: 50,
      surfaceCount: 0
    };
  }

  const copX = weightedCopX / totalArea;
  const copY = weightedCopY / totalArea;
  const copZ = weightedCopZ / totalArea;
  const copBeamng = [Number(copX.toFixed(3)), Number(copY.toFixed(3)), Number(copZ.toFixed(3))];
  const copThree = beamngToThree(copX, copY, copZ);

  // Front/Rear Aero distribution across longitudinal span
  let frontPct = 50;
  if (maxLongY - minLongY > 0.001) {
    // In BeamNG, -Y is Front, +Y is Rear
    frontPct = Math.round(((maxLongY - copY) / (maxLongY - minLongY)) * 100);
    frontPct = Math.max(0, Math.min(100, frontPct));
  }
  const rearPct = 100 - frontPct;

  // Stability margin relative to CoG
  // If CoP is behind CoG (larger Y in BeamNG coordinate system), positive static margin -> stable
  let staticMarginMm = 0;
  let stabilityRating = 'Neutral';

  const cogBeamng = options.cogBeamng || null;
  if (cogBeamng && Array.isArray(cogBeamng) && cogBeamng.length >= 3) {
    const cogY = cogBeamng[1];
    staticMarginMm = Math.round((copY - cogY) * 1000);

    if (staticMarginMm > 50) {
      stabilityRating = 'Aerodynamically Stable';
    } else if (staticMarginMm < -50) {
      stabilityRating = 'Pitch-Unstable (Front-Biased)';
    } else {
      stabilityRating = 'Neutral Balance';
    }
  }

  return {
    valid: true,
    totalAreaM2: Number(totalArea.toFixed(2)),
    // Frontal projected area: divide by 2 for closed watertight hulls (front and back projection)
    frontalAreaM2: Number((totalFrontalArea * 0.5).toFixed(2)),
    lateralAreaM2: Number((totalLateralArea * 0.5).toFixed(2)),
    copBeamng,
    copThree,
    stabilityRating,
    staticMarginMm,
    frontAeroPercent: frontPct,
    rearAeroPercent: rearPct,
    surfaceCount: surfaceItems.length,
    surfaces: surfaceItems
  };
}

/**
 * Builds the 3D visual group for the Center of Pressure (CoP) marker and aero vectors.
 *
 * @param {object} aeroResult - Output from calculateAerodynamics
 * @param {object} [options] - Visual options
 * @returns {THREE.Group} Three.js group
 */
export function buildAeroVisualizerGroup(aeroResult, options = {}) {
  const group = new THREE.Group();
  group.name = 'Aerodynamics_Visual_Group';

  if (!aeroResult || !aeroResult.valid) return group;

  const copPos = aeroResult.copThree;
  const isSelected = options.isSelected || false;

  // 1. Center of Pressure (CoP) 3D Marker
  // Cobalt blue central sphere with aerodynamic swept delta wings
  const sphereGeom = new THREE.SphereGeometry(0.05, 16, 16);
  const sphereMat = new THREE.MeshStandardMaterial({
    color: 0x00d2ff,
    emissive: 0x004488,
    metalness: 0.8,
    roughness: 0.2
  });
  const sphereMesh = new THREE.Mesh(sphereGeom, sphereMat);
  sphereMesh.position.copy(copPos);
  group.add(sphereMesh);

  // Swept aerodynamic delta wing indicator
  const wingGeom = new THREE.BufferGeometry();
  // Delta wing points around CoP: nose in -Z (Three.js forward), tips in +X and -X, trailing edge in +Z
  const vertices = new Float32Array([
    // Top delta triangle
    0, 0, -0.16,
    0.18, 0, 0.12,
    -0.18, 0, 0.12,
    // Downward stabilizer fin
    0, 0, 0.12,
    0, -0.12, 0.12,
    0, 0, -0.10
  ]);
  wingGeom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  wingGeom.computeVertexNormals();

  const wingMat = new THREE.MeshStandardMaterial({
    color: 0x00b0ff,
    side: THREE.DoubleSide,
    metalness: 0.7,
    roughness: 0.3
  });
  const wingMesh = new THREE.Mesh(wingGeom, wingMat);
  wingMesh.position.copy(copPos);
  group.add(wingMesh);

  // Downforce vertical vector arrow pointing down (-Y in Three.js)
  const arrowDir = new THREE.Vector3(0, -1, 0);
  const arrowHelper = new THREE.ArrowHelper(arrowDir, copPos, 0.25, 0x00e5ff, 0.08, 0.05);
  group.add(arrowHelper);

  // Billboard HUD Badge for Center of Pressure
  if (options.showLabels !== false) {
    const badgeText = `CoP: ${aeroResult.frontalAreaM2} m² (${aeroResult.frontAeroPercent}%F / ${aeroResult.rearAeroPercent}%R)`;
    const labelPos = copPos.clone().add(new THREE.Vector3(0, 0.18, 0));
    const badge = createAeroLabelSprite(badgeText, labelPos, isSelected);
    group.add(badge);
  }

  // 2. Surface Flow & Normal Vector Arrows (if enabled)
  if (options.showAeroVectors && Array.isArray(aeroResult.surfaces)) {
    const vectorGroup = new THREE.Group();
    // Sample every Nth surface to maintain 60 FPS
    const stride = Math.max(1, Math.floor(aeroResult.surfaces.length / 40));

    for (let i = 0; i < aeroResult.surfaces.length; i += stride) {
      const s = aeroResult.surfaces[i];
      const origin = beamngToThree(s.centroid[0], s.centroid[1], s.centroid[2]);
      const dirThree = beamngToThree(s.normal[0], s.normal[1], s.normal[2]).normalize();

      // Normal arrow color: downforce (blue/cyan) vs drag/lift (orange/yellow)
      const arrowColor = s.normal[2] < 0 ? 0x00e5ff : 0xff9100;
      const arrow = new THREE.ArrowHelper(dirThree, origin, 0.12, arrowColor, 0.03, 0.02);
      vectorGroup.add(arrow);
    }
    group.add(vectorGroup);
  }

  return group;
}

/**
 * Creates a floating billboard label badge for the CoP marker.
 * Headless-safe.
 */
function createAeroLabelSprite(text, position, isSelected = false) {
  if (typeof document === 'undefined') {
    const dummy = new THREE.Sprite();
    dummy.position.copy(position);
    return dummy;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = isSelected ? 'rgba(255, 107, 0, 0.92)' : 'rgba(12, 74, 110, 0.88)';
  ctx.strokeStyle = isSelected ? '#ffffff' : '#38bdf8';
  ctx.lineWidth = 3;

  const r = 14;
  const w = 300;
  const h = 48;
  const x = 10;
  const y = 8;

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 160, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false
  });

  const sprite = new THREE.Sprite(material);
  sprite.position.copy(position);
  sprite.scale.set(0.45, 0.09, 1);
  sprite.renderOrder = 999;
  return sprite;
}
