/**
 * Ghost Wheel & Tire Fitment Visualizer for JBeam Studio
 * Renders parametric 3D translucent ghost wheels, rims, and tires at vehicle hub nodes.
 */
import * as THREE from 'three';
import { beamngToThree } from './coordinateUtils.js';

// Default wheel fitment specs
export const DEFAULT_WHEEL_CONFIG = {
  rimDiameterInch: 17,    // Rim diameter in inches (e.g. 15", 17", 19")
  tireWidthMm: 245,        // Tire section width in mm (e.g. 205, 245, 285)
  aspectRatio: 45,        // Tire aspect ratio (e.g. 40, 45, 55)
  camberDeg: 0,           // Visual camber angle
  visible: false          // Viewport toggle state
};

/**
 * Calculates outer tire radius and rim radius in meters.
 * @param {object} config
 * @returns {{ outerRadius: number, innerRadius: number, tireWidth: number }}
 */
export function calculateWheelDimensions(config = DEFAULT_WHEEL_CONFIG) {
  const rimDiameterM = (config.rimDiameterInch || 17) * 0.0254;
  const innerRadius = rimDiameterM / 2;
  const tireWidth = (config.tireWidthMm || 245) / 1000;
  const sidewallHeight = tireWidth * ((config.aspectRatio || 45) / 100);
  const outerRadius = innerRadius + sidewallHeight;

  return { outerRadius, innerRadius, tireWidth };
}

/**
 * Discovers wheel hub locations from JBeam nodes dictionary.
 * Looks for standard official BeamNG and community hub node naming conventions:
 * - Front: fw1r/fw1l, fw2r/fw2l, hub_fr/hub_fl, fh1r/fh1l, wh_fl/wh_fr
 * - Rear:  rw1r/rw1l, rw2r/rw2l, hub_rr/hub_rl, rh1r/rh1l, wh_rl/wh_rr
 * 
 * @param {object} nodesDict - Map of nodeId -> node data with posX/posY/posZ or pos
 * @returns {Array<{ id: string, side: 'left'|'right', position: THREE.Vector3, axle: 'front'|'rear' }>}
 */
export function detectWheelHubs(nodesDict) {
  if (!nodesDict || typeof nodesDict !== 'object') return [];

  const hubs = [];
  const processedSides = new Set();

  const patterns = [
    // Front Hub patterns
    { regex: /^(fw1|hub_f|fh1|wheel_f|wh_f).*l$/i, axle: 'front', side: 'left' },
    { regex: /^(fw1|hub_f|fh1|wheel_f|wh_f).*r$/i, axle: 'front', side: 'right' },
    { regex: /^f_wheel_l$/i, axle: 'front', side: 'left' },
    { regex: /^f_wheel_r$/i, axle: 'front', side: 'right' },
    // Rear Hub patterns
    { regex: /^(rw1|hub_r|rh1|wheel_r|wh_r).*l$/i, axle: 'rear', side: 'left' },
    { regex: /^(rw1|hub_r|rh1|wheel_r|wh_r).*r$/i, axle: 'rear', side: 'right' },
    { regex: /^r_wheel_l$/i, axle: 'rear', side: 'left' },
    { regex: /^r_wheel_r$/i, axle: 'rear', side: 'right' },
  ];

  for (const nodeId of Object.keys(nodesDict)) {
    if (nodeId === '__meta') continue;
    const node = nodesDict[nodeId];
    if (!node || typeof node !== 'object') continue;

    for (const pat of patterns) {
      const key = `${pat.axle}_${pat.side}`;
      if (!processedSides.has(key) && pat.regex.test(nodeId)) {
        const px = Number(node.posX ?? node.pos?.[0] ?? node.x ?? 0);
        const py = Number(node.posY ?? node.pos?.[1] ?? node.y ?? 0);
        const pz = Number(node.posZ ?? node.pos?.[2] ?? node.z ?? 0);

        hubs.push({
          id: nodeId,
          axle: pat.axle,
          side: pat.side,
          position: beamngToThree(px, py, pz)
        });
        processedSides.add(key);
        break;
      }
    }
  }

  return hubs;
}

/**
 * Builds a single 3D ghost wheel (tire + rim + spokes) mesh hierarchy.
 * @param {object} dimensions - { outerRadius, innerRadius, tireWidth }
 * @param {'left'|'right'} side
 * @returns {THREE.Group}
 */
export function createGhostWheelMesh(dimensions, side = 'left') {
  const wheelGroup = new THREE.Group();
  wheelGroup.name = `ghost_wheel_${side}`;

  const { outerRadius, innerRadius, tireWidth } = dimensions;

  // 1. Tire Tread Outer Cylinder
  const treadGeom = new THREE.CylinderGeometry(outerRadius, outerRadius, tireWidth, 28, 1, true);
  const treadMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b, // Dark charcoal rubber
    roughness: 0.9,
    metalness: 0.1,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide
  });
  const treadMesh = new THREE.Mesh(treadGeom, treadMat);
  treadMesh.rotation.z = Math.PI / 2; // Axis points along lateral X
  wheelGroup.add(treadMesh);

  // 2. Tire Sidewall Rings (Outer & Inner)
  const sidewallGeom = new THREE.RingGeometry(innerRadius, outerRadius, 28);
  const sidewallMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.85,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide
  });

  const outerSidewall = new THREE.Mesh(sidewallGeom, sidewallMat);
  outerSidewall.position.x = side === 'left' ? -tireWidth / 2 : tireWidth / 2;
  outerSidewall.rotation.y = Math.PI / 2;
  wheelGroup.add(outerSidewall);

  const innerSidewall = new THREE.Mesh(sidewallGeom, sidewallMat);
  innerSidewall.position.x = side === 'left' ? tireWidth / 2 : -tireWidth / 2;
  innerSidewall.rotation.y = Math.PI / 2;
  wheelGroup.add(innerSidewall);

  // 3. Rim Barrel
  const rimGeom = new THREE.CylinderGeometry(innerRadius, innerRadius, tireWidth * 0.92, 24, 1, true);
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x00e5ff, // Vibrant Cyan rim glow
    roughness: 0.2,
    metalness: 0.8,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide
  });
  const rimMesh = new THREE.Mesh(rimGeom, rimMat);
  rimMesh.rotation.z = Math.PI / 2;
  wheelGroup.add(rimMesh);

  // 4. Rim Spokes (6-spoke sports pattern)
  const spokeGeom = new THREE.BoxGeometry(innerRadius * 0.92, innerRadius * 0.12, tireWidth * 0.1);
  const spokeMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    roughness: 0.3,
    metalness: 0.7,
    transparent: true,
    opacity: 0.55
  });

  const spokeFaceX = side === 'left' ? -tireWidth * 0.38 : tireWidth * 0.38;
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const spoke = new THREE.Mesh(spokeGeom, spokeMat);
    spoke.position.set(spokeFaceX, 0, 0);
    spoke.rotation.x = angle;
    wheelGroup.add(spoke);
  }

  // 5. Center Hub Cap Dot
  const hubCapGeom = new THREE.CylinderGeometry(innerRadius * 0.25, innerRadius * 0.25, tireWidth * 0.15, 16);
  const hubCapMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.8
  });
  const hubCap = new THREE.Mesh(hubCapGeom, hubCapMat);
  hubCap.rotation.z = Math.PI / 2;
  hubCap.position.x = spokeFaceX;
  wheelGroup.add(hubCap);

  // 6. Rolling Circumference Guide Wireframe Ring
  const circleGeom = new THREE.BufferGeometry();
  const circlePts = [];
  for (let i = 0; i <= 36; i++) {
    const theta = (i / 36) * Math.PI * 2;
    circlePts.push(
      0,
      Math.sin(theta) * outerRadius,
      Math.cos(theta) * outerRadius
    );
  }
  circleGeom.setAttribute('position', new THREE.Float32BufferAttribute(circlePts, 3));
  const circleMat = new THREE.LineBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.75
  });
  const guideLine = new THREE.Line(circleGeom, circleMat);
  guideLine.position.x = side === 'left' ? -tireWidth / 2 - 0.005 : tireWidth / 2 + 0.005;
  wheelGroup.add(guideLine);

  return wheelGroup;
}

/**
 * Builds the complete 3D scene group containing ghost wheels at all discovered hub positions.
 * @param {object} nodesDict - Active parts merged nodes
 * @param {object} [config] - Wheel fitment options
 * @returns {THREE.Group}
 */
export function buildGhostWheelsGroup(nodesDict, config = DEFAULT_WHEEL_CONFIG) {
  const group = new THREE.Group();
  group.name = 'ghost_wheels_overlay_group';

  if (!config.visible) return group;

  const hubs = detectWheelHubs(nodesDict);
  if (hubs.length === 0) return group;

  const dimensions = calculateWheelDimensions(config);

  for (const hub of hubs) {
    const wheel = createGhostWheelMesh(dimensions, hub.side);
    wheel.position.copy(hub.position);
    group.add(wheel);
  }

  return group;
}

export default {
  DEFAULT_WHEEL_CONFIG,
  calculateWheelDimensions,
  detectWheelHubs,
  createGhostWheelMesh,
  buildGhostWheelsGroup
};

