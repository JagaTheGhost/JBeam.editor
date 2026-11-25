/**
 * Suspension 3D Visualizer for JBeam Studio
 * Builds Three.js 3D meshes for:
 * 1. Torsionbars (anti-roll / swaybars): central torsion axis cylinder, torque reaction rings, and lever arms.
 * 2. Rails & Slidenodes: rail guide tubes/polylines, rail end caps, and sliding collar indicators.
 */

import * as THREE from 'three';
import { beamngToThree } from './coordinateUtils.js';

// Color definitions
const TORSIONBAR_AXIS_COLOR = 0x00e676;     // Emerald green
const TORSIONBAR_ARM_COLOR = 0x69f0ae;      // Light emerald green
const TORSIONBAR_SELECTED_COLOR = 0xffea00; // Bright yellow
const RAIL_PATH_COLOR = 0x00e5ff;           // Vivid cyan
const RAIL_CAP_COLOR = 0x00b0ff;            // Electric blue
const SLIDENODE_COLLAR_COLOR = 0xff9100;    // Vivid amber/orange
const SLIDENODE_SELECTED_COLOR = 0xffea00;  // Bright yellow

/**
 * Creates a floating billboard label badge for a suspension element.
 * Headless-safe (Node.js test environments).
 */
export function createSuspensionLabelSprite(text, position, isSelected = false, badgeColor = '#00e676') {
  if (typeof document === 'undefined') {
    const dummy = new THREE.Sprite();
    dummy.position.copy(position);
    return dummy;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = isSelected ? 'rgba(255, 107, 0, 0.92)' : 'rgba(15, 23, 42, 0.85)';
  ctx.strokeStyle = isSelected ? '#ffffff' : badgeColor;
  ctx.lineWidth = 3;

  const r = 14;
  const w = 240;
  const h = 48;
  const x = 8;
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
  ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false
  });

  const sprite = new THREE.Sprite(material);
  sprite.position.copy(position);
  sprite.scale.set(0.35, 0.088, 1);
  sprite.renderOrder = 999;
  return sprite;
}

/**
 * Builds the 3D visual group for all torsion bars (sway bars / anti-roll bars).
 *
 * @param {Array<object>} torsionBars - Array of normalized torsion bar objects
 * @param {Record<string, [number, number, number]|object>} nodesDict - Nodes dictionary
 * @param {object} [options] - Visual options
 * @param {string} [options.selectedTorsionBarName] - Currently selected torsion bar name
 * @param {boolean} [options.showLabels] - Whether to render text labels
 * @returns {THREE.Group} Three.js group
 */
export function buildTorsionBarsGroup(torsionBars, nodesDict, options = {}) {
  const group = new THREE.Group();
  group.name = 'TorsionBars_Visual_Group';

  if (!Array.isArray(torsionBars) || !nodesDict) return group;

  const selectedName = options.selectedTorsionBarName || null;
  const showLabels = options.showLabels !== false;

  for (const tb of torsionBars) {
    if (!tb || !tb.id1 || !tb.id2 || !tb.id3 || !tb.id4) continue;

    const n1 = nodesDict[tb.id1];
    const n2 = nodesDict[tb.id2];
    const n3 = nodesDict[tb.id3];
    const n4 = nodesDict[tb.id4];

    if (!n1 || !n2 || !n3 || !n4) continue;

    // Node coordinates in Three.js world
    const p1 = getNodeThreePos(n1);
    const p2 = getNodeThreePos(n2);
    const p3 = getNodeThreePos(n3);
    const p4 = getNodeThreePos(n4);

    if (!p1 || !p2 || !p3 || !p4) continue;

    const isSelected = selectedName && (tb.name === selectedName || tb.rawKey === selectedName);
    const axisColor = isSelected ? TORSIONBAR_SELECTED_COLOR : TORSIONBAR_AXIS_COLOR;
    const armColor = isSelected ? TORSIONBAR_SELECTED_COLOR : TORSIONBAR_ARM_COLOR;

    // 1. Central Torsion Axis (between id2 and id3)
    const axisDir = new THREE.Vector3().subVectors(p3, p2);
    const axisLength = axisDir.length();

    if (axisLength > 0.001) {
      const axisGeom = new THREE.CylinderGeometry(0.016, 0.016, axisLength, 12);
      // Align cylinder (Three.js cylinder defaults along Y-axis)
      const midPoint = new THREE.Vector3().addVectors(p2, p3).multiplyScalar(0.5);
      axisGeom.translate(0, axisLength / 2, 0);

      const axisMat = new THREE.MeshStandardMaterial({
        color: axisColor,
        roughness: 0.35,
        metalness: 0.75,
        emissive: isSelected ? 0x665500 : 0x002b11,
        emissiveIntensity: 0.5
      });

      const axisMesh = new THREE.Mesh(axisGeom, axisMat);
      axisMesh.position.copy(p2);
      axisMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axisDir.clone().normalize());
      axisMesh.castShadow = true;
      axisMesh.receiveShadow = true;

      axisMesh.userData = {
        type: 'torsionbar',
        torsionBar: tb,
        name: tb.name,
        selectable: true
      };
      group.add(axisMesh);

      // Torque reaction ring / spiral indicator at midpoint
      const ringGeom = new THREE.TorusGeometry(0.038, 0.008, 8, 24, Math.PI * 1.5);
      const ringMat = new THREE.MeshBasicMaterial({ color: axisColor });
      const ringMesh = new THREE.Mesh(ringGeom, ringMat);
      ringMesh.position.copy(midPoint);
      ringMesh.quaternion.copy(axisMesh.quaternion);
      ringMesh.rotateX(Math.PI / 2);
      ringMesh.userData = axisMesh.userData;
      group.add(ringMesh);

      // Billboard badge
      if (showLabels) {
        const springStr = tb.spring >= 1000 ? `${(tb.spring / 1000).toFixed(1)}k N/m` : `${tb.spring} N/m`;
        const labelPos = midPoint.clone().add(new THREE.Vector3(0, 0.08, 0));
        const badge = createSuspensionLabelSprite(`ARB: ${springStr}`, labelPos, isSelected, '#00e676');
        group.add(badge);
      }
    }

    // 2. Lever Arm 1 (id2 to id1)
    const arm1Geom = new THREE.BufferGeometry().setFromPoints([p2, p1]);
    const arm1Mat = new THREE.LineBasicMaterial({
      color: armColor,
      linewidth: 3
    });
    const arm1Line = new THREE.Line(arm1Geom, arm1Mat);
    arm1Line.userData = {
      type: 'torsionbar',
      torsionBar: tb,
      selectable: true
    };
    group.add(arm1Line);

    // 3. Lever Arm 2 (id3 to id4)
    const arm2Geom = new THREE.BufferGeometry().setFromPoints([p3, p4]);
    const arm2Mat = new THREE.LineBasicMaterial({
      color: armColor,
      linewidth: 3
    });
    const arm2Line = new THREE.Line(arm2Geom, arm2Mat);
    arm2Line.userData = {
      type: 'torsionbar',
      torsionBar: tb,
      selectable: true
    };
    group.add(arm2Line);

    // Pivot Bushing spheres at id2 and id3
    const bushingGeom = new THREE.SphereGeometry(0.024, 12, 12);
    const bushingMat = new THREE.MeshStandardMaterial({
      color: 0x334155, // Dark rubber bushing
      roughness: 0.8
    });

    const b1 = new THREE.Mesh(bushingGeom, bushingMat);
    b1.position.copy(p2);
    group.add(b1);

    const b2 = new THREE.Mesh(bushingGeom, bushingMat);
    b2.position.copy(p3);
    group.add(b2);
  }

  return group;
}

/**
 * Builds the 3D visual group for all rails and slidenodes.
 *
 * @param {Record<string, object>} rails - Rails map
 * @param {Array<object>} slideNodes - SlideNodes array
 * @param {Record<string, [number, number, number]|object>} nodesDict - Nodes dictionary
 * @param {object} [options] - Visual options
 * @param {string} [options.selectedRailOrNode] - Currently selected rail or slidenode
 * @returns {THREE.Group} Three.js group
 */
export function buildSlideNodesGroup(rails, slideNodes, nodesDict, options = {}) {
  const group = new THREE.Group();
  group.name = 'SlideNodes_Visual_Group';

  if (!nodesDict) return group;

  const selectedTarget = options.selectedRailOrNode || null;

  // --- 1. Render Rails ---
  if (rails && typeof rails === 'object') {
    for (const [railName, rail] of Object.entries(rails)) {
      if (!rail || !Array.isArray(rail.links) || rail.links.length < 2) continue;

      const railPoints = [];
      for (const linkNodeId of rail.links) {
        const node = nodesDict[linkNodeId];
        if (node) {
          const pt = getNodeThreePos(node);
          if (pt) railPoints.push(pt);
        }
      }

      if (railPoints.length < 2) continue;

      const isSelected = selectedTarget && (railName === selectedTarget);
      const railColor = isSelected ? SLIDENODE_SELECTED_COLOR : RAIL_PATH_COLOR;

      // Draw polyline through rail links
      const curve = new THREE.CatmullRomCurve3(railPoints, Boolean(rail.looped), 'centripetal');
      const tubeGeom = new THREE.TubeGeometry(curve, railPoints.length * 8, 0.012, 8, Boolean(rail.looped));
      const tubeMat = new THREE.MeshStandardMaterial({
        color: railColor,
        roughness: 0.3,
        metalness: 0.8,
        emissive: isSelected ? 0x665500 : 0x002244,
        emissiveIntensity: 0.4
      });

      const tubeMesh = new THREE.Mesh(tubeGeom, tubeMat);
      tubeMesh.userData = {
        type: 'rail',
        rail,
        railName,
        selectable: true
      };
      group.add(tubeMesh);

      // Rail End Caps (if capped)
      if (rail.capped !== false && !rail.looped) {
        const capGeom = new THREE.SphereGeometry(0.018, 10, 10);
        const capMat = new THREE.MeshStandardMaterial({ color: RAIL_CAP_COLOR, metalness: 0.9, roughness: 0.2 });

        const startCap = new THREE.Mesh(capGeom, capMat);
        startCap.position.copy(railPoints[0]);
        group.add(startCap);

        const endCap = new THREE.Mesh(capGeom, capMat);
        endCap.position.copy(railPoints[railPoints.length - 1]);
        group.add(endCap);
      }
    }
  }

  // --- 2. Render SlideNodes ---
  if (Array.isArray(slideNodes)) {
    for (const sn of slideNodes) {
      if (!sn || !sn.id) continue;

      const node = nodesDict[sn.id];
      if (!node) continue;

      const pos = getNodeThreePos(node);
      if (!pos) continue;

      const isSelected = selectedTarget && (sn.id === selectedTarget || sn.railName === selectedTarget);
      const collarColor = isSelected ? SLIDENODE_SELECTED_COLOR : SLIDENODE_COLLAR_COLOR;

      // Sliding collar represented as a metallic diamond / torus sleeve
      const collarGeom = new THREE.TorusGeometry(0.024, 0.009, 10, 16);
      const collarMat = new THREE.MeshStandardMaterial({
        color: collarColor,
        roughness: 0.2,
        metalness: 0.9,
        emissive: isSelected ? 0x665500 : 0x442200,
        emissiveIntensity: 0.5
      });

      const collarMesh = new THREE.Mesh(collarGeom, collarMat);
      collarMesh.position.copy(pos);
      collarMesh.userData = {
        type: 'slidenode',
        slideNode: sn,
        selectable: true
      };
      group.add(collarMesh);

      // Tolerance sphere if tolerance > 0
      if (sn.tolerance && sn.tolerance > 0.001) {
        const tolGeom = new THREE.SphereGeometry(sn.tolerance, 12, 12);
        const tolMat = new THREE.MeshBasicMaterial({
          color: collarColor,
          wireframe: true,
          transparent: true,
          opacity: 0.35
        });
        const tolMesh = new THREE.Mesh(tolGeom, tolMat);
        tolMesh.position.copy(pos);
        group.add(tolMesh);
      }
    }
  }

  return group;
}

/**
 * Extracts Three.js Vector3 from a node definition.
 */
function getNodeThreePos(node) {
  if (Array.isArray(node)) {
    return beamngToThree(node[0], node[1], node[2]);
  }
  if (node && typeof node === 'object') {
    const x = node.x ?? node.posX ?? 0;
    const y = node.y ?? node.posY ?? 0;
    const z = node.z ?? node.posZ ?? 0;
    return beamngToThree(x, y, z);
  }
  return null;
}
