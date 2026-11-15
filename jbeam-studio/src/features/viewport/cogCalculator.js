/**
 * Center of Gravity (CoG) & Curb Weight Calculator for JBeam Studio
 * Calculates vehicle mass properties, weight distribution, and builds the 3D CoG marker.
 */
import * as THREE from 'three';
import { beamngToThree } from './coordinateUtils.js';
import { extractNodeCoords } from './visualizers.js';

/**
 * Calculates the total weight, Center of Gravity, and axle balance for a set of nodes.
 * @param {object} nodesDict - Merged nodes dictionary
 * @returns {{
 *   totalMassKg: number,
 *   totalMassLbs: number,
 *   nodeCount: number,
 *   cogBeamng: [number, number, number],
 *   cogThree: THREE.Vector3,
 *   frontWeightPercent: number,
 *   rearWeightPercent: number,
 *   leftWeightPercent: number,
 *   rightWeightPercent: number
 * }}
 */
export function calculateMassProperties(nodesDict) {
  if (!nodesDict || typeof nodesDict !== 'object') {
    return {
      totalMassKg: 0,
      totalMassLbs: 0,
      nodeCount: 0,
      cogBeamng: [0, 0, 0],
      cogThree: new THREE.Vector3(0, 0, 0),
      frontWeightPercent: 50,
      rearWeightPercent: 50,
      leftWeightPercent: 50,
      rightWeightPercent: 50
    };
  }

  let totalWeight = 0;
  let weightedX = 0;
  let weightedY = 0;
  let weightedZ = 0;
  let nodeCount = 0;

  const validNodes = [];

  for (const nodeId of Object.keys(nodesDict)) {
    if (nodeId === '__meta') continue;
    const node = nodesDict[nodeId];
    if (!node || typeof node !== 'object') continue;

    const [bx, by, bz] = extractNodeCoords(node);
    const weight = Number(node.nodeWeight ?? node.weight ?? 5.0) || 5.0;

    totalWeight += weight;
    weightedX += bx * weight;
    weightedY += by * weight;
    weightedZ += bz * weight;
    nodeCount++;

    validNodes.push({ id: nodeId, bx, by, bz, weight });
  }

  if (totalWeight <= 0 || nodeCount === 0) {
    return {
      totalMassKg: 0,
      totalMassLbs: 0,
      nodeCount: 0,
      cogBeamng: [0, 0, 0],
      cogThree: new THREE.Vector3(0, 0, 0),
      frontWeightPercent: 50,
      rearWeightPercent: 50,
      leftWeightPercent: 50,
      rightWeightPercent: 50
    };
  }

  const cogX = weightedX / totalWeight;
  const cogY = weightedY / totalWeight;
  const cogZ = weightedZ / totalWeight;

  // Calculate longitudinal & lateral bounds to compute statics weight distribution
  let minY = Infinity, maxY = -Infinity;
  let minX = Infinity, maxX = -Infinity;

  for (const n of validNodes) {
    if (n.by < minY) minY = n.by;
    if (n.by > maxY) maxY = n.by;
    if (n.bx < minX) minX = n.bx;
    if (n.bx > maxX) maxX = n.bx;
  }

  // BeamNG coordinates: -Y is Front, +Y is Rear
  // Moment balance around rear axis (maxY): Front % = (maxY - cogY) / (maxY - minY)
  let frontPct = 50;
  if (maxY - minY > 0.001) {
    frontPct = Math.round(((maxY - cogY) / (maxY - minY)) * 100);
    frontPct = Math.max(0, Math.min(100, frontPct));
  }
  const rearPct = 100 - frontPct;

  // BeamNG coordinates: +X is Left, -X is Right
  // Moment balance around right axis (minX): Left % = (cogX - minX) / (maxX - minX)
  let leftPct = 50;
  if (maxX - minX > 0.001) {
    leftPct = Math.round(((cogX - minX) / (maxX - minX)) * 100);
    leftPct = Math.max(0, Math.min(100, leftPct));
  }
  const rightPct = 100 - leftPct;

  return {
    totalMassKg: Math.round(totalWeight * 10) / 10,
    totalMassLbs: Math.round(totalWeight * 2.20462 * 10) / 10,
    nodeCount,
    cogBeamng: [
      Math.round(cogX * 1000) / 1000,
      Math.round(cogY * 1000) / 1000,
      Math.round(cogZ * 1000) / 1000
    ],
    cogThree: beamngToThree(cogX, cogY, cogZ),
    frontWeightPercent: frontPct,
    rearWeightPercent: rearPct,
    leftWeightPercent: leftPct,
    rightWeightPercent: rightPct
  };
}

/**
 * Builds the 3D Center of Gravity (CoG) symbol, crosshairs, ground shadow line, and badge.
 * @param {object} massProps - Output from calculateMassProperties
 * @param {boolean} visible - Whether the marker is toggled on
 * @returns {THREE.Group}
 */
/**
 * Generates the authentic international standard ISO/SAE quartered CoG sphere texture
 * styled to match the dark BeamNG theme (dark charcoal / BeamNG warm accent).
 */
function createCogQuadrantTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Background: Warm Automotive Accent (BeamNG Theme)
  ctx.fillStyle = '#ea580c';
  ctx.fillRect(0, 0, 256, 256);

  // Alternating Quadrants: Dark Automotive Charcoal
  ctx.fillStyle = '#1e2430';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillRect(128, 128, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * Builds a dynamic 3D Center of Gravity (CoG) visual marker with ground projection reticle and high-res HUD telemetry card.
 *
 * @param {object} massProps - Output from calculateMassProperties
 * @param {boolean} visible - Whether the marker is toggled on
 * @returns {THREE.Group}
 */
export function buildCogMarkerGroup(massProps, visible = false) {
  const group = new THREE.Group();
  group.name = 'center_of_gravity_marker_group';

  if (!visible || !massProps || massProps.nodeCount === 0) {
    return group;
  }

  const cogPos = massProps.cogThree;

  // 1. Sleek Quartered CoG Sphere (Theme-matched dark charcoal & BeamNG accent)
  const sphereGeom = new THREE.SphereGeometry(0.08, 32, 32);
  const quadTexture = createCogQuadrantTexture();
  const sphereMat = quadTexture
    ? new THREE.MeshBasicMaterial({ map: quadTexture })
    : new THREE.MeshBasicMaterial({ color: 0xea580c });
  const sphere = new THREE.Mesh(sphereGeom, sphereMat);
  sphere.position.copy(cogPos);
  group.add(sphere);

  // 2. Gimbal Equatorial & Meridian Reticle Rings (Dark slate + subtle accent)
  const equatorGeom = new THREE.TorusGeometry(0.088, 0.004, 12, 48);
  const equatorMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
  const equatorRing = new THREE.Mesh(equatorGeom, equatorMat);
  equatorRing.position.copy(cogPos);
  equatorRing.rotation.x = Math.PI / 2;
  group.add(equatorRing);

  const meridianGeom = new THREE.TorusGeometry(0.088, 0.004, 12, 48);
  const meridianMat = new THREE.MeshBasicMaterial({ color: 0x334155 });
  const meridianRing = new THREE.Mesh(meridianGeom, meridianMat);
  meridianRing.position.copy(cogPos);
  group.add(meridianRing);

  // 3. Subtle Vertical Drop-Line to Ground Plane (y = 0)
  const dropLineGeom = new THREE.BufferGeometry();
  const dropPositions = new Float32Array([
    cogPos.x, cogPos.y, cogPos.z,
    cogPos.x, 0.005, cogPos.z
  ]);
  dropLineGeom.setAttribute('position', new THREE.BufferAttribute(dropPositions, 3));
  const dropLineMat = new THREE.LineDashedMaterial({
    color: 0xff6600,
    dashSize: 0.05,
    gapSize: 0.03,
    linewidth: 1.5,
    transparent: true,
    opacity: 0.65
  });
  const dropLine = new THREE.Line(dropLineGeom, dropLineMat);
  dropLine.computeLineDistances();
  group.add(dropLine);

  // 4. Ground Target Reticle: Subtle rings & crosshair ticks
  const groundGroup = new THREE.Group();
  groundGroup.position.set(cogPos.x, 0.006, cogPos.z);

  // Outer target ring
  const outerRingGeom = new THREE.RingGeometry(0.12, 0.14, 36);
  const reticleMat = new THREE.MeshBasicMaterial({
    color: 0xff6600,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.5,
    depthWrite: false
  });
  const outerRing = new THREE.Mesh(outerRingGeom, reticleMat);
  outerRing.rotation.x = -Math.PI / 2;
  groundGroup.add(outerRing);

  // Inner bullseye ring
  const innerRingGeom = new THREE.RingGeometry(0.035, 0.05, 24);
  const innerRing = new THREE.Mesh(innerRingGeom, reticleMat);
  innerRing.rotation.x = -Math.PI / 2;
  groundGroup.add(innerRing);

  // Target Crosshair Axis Lines (+)
  const chGeom = new THREE.BufferGeometry();
  const chPositions = new Float32Array([
    -0.20, 0, 0,    0.20, 0, 0,
    0, 0, -0.20,    0, 0, 0.20
  ]);
  chGeom.setAttribute('position', new THREE.BufferAttribute(chPositions, 3));
  const chMat = new THREE.LineBasicMaterial({
    color: 0xff6600,
    transparent: true,
    opacity: 0.55
  });
  const crosshairs = new THREE.LineSegments(chGeom, chMat);
  groundGroup.add(crosshairs);
  group.add(groundGroup);

  // 5. High-Precision Glassmorphic CoG Telemetry Badge in 3D Space
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Card Background - Dark Theme Glassmorphism
      ctx.beginPath();
      ctx.fillStyle = 'rgba(18, 20, 26, 0.94)';
      ctx.roundRect(6, 6, 588, 168, 16);
      ctx.fill();
      ctx.closePath();

      // Card Subtle Accent Border
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 102, 0, 0.55)';
      ctx.lineWidth = 2;
      ctx.roundRect(6, 6, 588, 168, 16);
      ctx.stroke();
      ctx.closePath();

      // Mini CoG ISO Reticle Emblem (Top-Left)
      const symX = 36;
      const symY = 38;
      const symR = 14;

      ctx.beginPath();
      ctx.moveTo(symX, symY);
      ctx.arc(symX, symY, symR, Math.PI, 1.5 * Math.PI);
      ctx.closePath();
      ctx.fillStyle = '#ff6600';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(symX, symY);
      ctx.arc(symX, symY, symR, 0, 0.5 * Math.PI);
      ctx.closePath();
      ctx.fillStyle = '#ff6600';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(symX, symY);
      ctx.arc(symX, symY, symR, 1.5 * Math.PI, 2 * Math.PI);
      ctx.closePath();
      ctx.fillStyle = '#334155';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(symX, symY);
      ctx.arc(symX, symY, symR, 0.5 * Math.PI, Math.PI);
      ctx.closePath();
      ctx.fillStyle = '#334155';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(symX, symY, symR, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.closePath();

      // Line 1: Header & Mass Telemetry
      ctx.fillStyle = '#ff8533';
      ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('CENTER OF GRAVITY', 62, 32);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 23px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(`${massProps.totalMassKg.toLocaleString()} kg`, 62, 56);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '500 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${massProps.totalMassLbs.toLocaleString()} lbs`, 566, 56);

      // Divider Line
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.moveTo(24, 70);
      ctx.lineTo(576, 70);
      ctx.stroke();
      ctx.closePath();

      // Line 2: Weight Distribution Meter
      const barX = 24;
      const barY = 84;
      const barW = 552;
      const barH = 10;
      const fPct = Math.max(5, Math.min(95, massProps.frontWeightPercent || 50));
      const frontW = (barW * fPct) / 100;

      ctx.beginPath();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.roundRect(barX, barY, barW, barH, 5);
      ctx.fill();
      ctx.closePath();

      ctx.beginPath();
      ctx.fillStyle = '#00e5ff';
      ctx.roundRect(barX, barY, frontW, barH, [5, 0, 0, 5]);
      ctx.fill();
      ctx.closePath();

      ctx.beginPath();
      ctx.fillStyle = '#ff6600';
      ctx.roundRect(barX + frontW, barY, barW - frontW, barH, [0, 5, 5, 0]);
      ctx.fill();
      ctx.closePath();

      ctx.beginPath();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(barX + barW / 2 - 1, barY - 2, 2, barH + 4);
      ctx.closePath();

      // Line 3: Distribution Percentages
      ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`▲ FRONT: ${massProps.frontWeightPercent}%`, 24, 118);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(`Lateral: ${massProps.leftWeightPercent}% L / ${100 - massProps.leftWeightPercent}% R`, 300, 118);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#fb923c';
      ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(`▼ REAR: ${massProps.rearWeightPercent}%`, 576, 118);

      // Line 4: Coordinates & Clearance
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748b';
      const beamngX = -cogPos.x;
      const beamngY = -cogPos.z;
      const beamngZ = cogPos.y;
      ctx.fillText(`CoG Pos: [X: ${beamngX.toFixed(2)}m, Y: ${beamngY.toFixed(2)}m, Z: ${beamngZ.toFixed(2)}m]`, 24, 148);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#ff8533';
      ctx.fillText(`Height (Z): ${beamngZ.toFixed(2)}m`, 576, 148);

      const texture = new THREE.CanvasTexture(canvas);
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        depthTest: false,
        transparent: true
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(cogPos.x, cogPos.y + 0.32, cogPos.z);
      sprite.scale.set(0.62, 0.185, 1);
      group.add(sprite);
    }
  }

  return group;
}

export default {
  calculateMassProperties,
  buildCogMarkerGroup
};
