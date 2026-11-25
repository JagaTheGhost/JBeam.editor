/*
  3D PressureWheels & HubWheels Visualizer for JBeam Studio
  Renders interactive soft-body physics skeletons (nodes, beams, and pressure surfaces)
  and dynamically-scaled parametric ghost wheels aligned with actual vehicle spindle axes.
*/

import * as THREE from 'three';
import { beamngToThree } from './coordinateUtils.js';
import { BEAM_TYPE_COLORS } from './visualizers.js';
import { extractPressureWheels, generateWheelSkeleton } from '../jbeam/pressureWheelsParser.js';

// Cached Three.js Geometries & Materials for high-performance rendering
const nodeSphereGeom = new THREE.SphereGeometry(0.014, 8, 8);
const hubNodeMat = new THREE.MeshStandardMaterial({
  color: 0x00e5ff,
  metalness: 0.8,
  roughness: 0.2
});
const tireNodeMat = new THREE.MeshStandardMaterial({
  color: 0x94a3b8,
  metalness: 0.1,
  roughness: 0.9
});
const selectedNodeMat = new THREE.MeshBasicMaterial({
  color: 0xffea00
});

/**
 * Creates an interactive floating 2D billboard sprite badge above a wheel.
 * Displays wheel name, dimensions, and inflation pressure.
 *
 * @param {string} text - Badge text
 * @param {THREE.Vector3} position - World position
 * @param {boolean} isSelected - Whether wheel is selected
 * @returns {THREE.Sprite}
 */
export function createWheelLabelSprite(text, position, isSelected = false) {
  if (typeof document === 'undefined') {
    const dummy = new THREE.Sprite();
    dummy.position.copy(position);
    return dummy;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  // Background pill
  ctx.fillStyle = isSelected ? 'rgba(255, 107, 0, 0.92)' : 'rgba(15, 23, 42, 0.82)';
  ctx.strokeStyle = isSelected ? '#ffffff' : '#38bdf8';
  ctx.lineWidth = 3;

  const r = 16;
  const w = 240;
  const h = 50;
  const x = 8;
  const y = 7;

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Text label
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px "JetBrains Mono", Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false
  });

  const sprite = new THREE.Sprite(spriteMat);
  sprite.position.copy(position);
  sprite.scale.set(0.35, 0.087, 1);
  sprite.renderOrder = 999;
  return sprite;
}

/**
 * Builds a reconstructed parametric 3D Ghost Wheel mesh group (lathed tire carcass +
 * stepped rim barrel + auto-adapting Car 6-spoke or Truck 10-lug deep-dish face),
 * sized from the parsed wheel definition and aligned along the actual spindle axis.
 *
 * @param {Object} skeleton - Output from generateWheelSkeleton
 * @param {boolean} isSelected
 * @returns {THREE.Group}
 */
export function buildParametricWheelMesh(skeleton, isSelected = false) {
  const group = new THREE.Group();
  group.name = `parametric_wheel_${skeleton.wheelDef.name}`;

  const { radius, hubRadius, tireWidth, hubWidth } = skeleton.stats;
  const { hubCenter, axis, wheelDef } = skeleton;

  const centerThree = beamngToThree(hubCenter[0], hubCenter[1], hubCenter[2]);
  const axisThree = new THREE.Vector3(-axis[0], axis[2], axis[1]).normalize();

  // Orientation quaternion aligning default lathe/cylinder (along Y) with spindle axis
  const defaultUp = new THREE.Vector3(0, 1, 0);
  const orientQuat = new THREE.Quaternion().setFromUnitVectors(defaultUp, axisThree);

  // Determine which direction along `axisThree` points OUTWARD away from vehicle centerline (X = 0)
  let outwardSign = 1;
  if (Math.abs(hubCenter[0]) > 1e-3) {
    const outBeamngX = Math.sign(hubCenter[0]);
    outwardSign = axis[0] * outBeamngX >= 0 ? 1 : -1;
  } else {
    outwardSign = wheelDef.side === 'left' ? 1 : -1;
  }

  const isTruckWheel = radius >= 0.43 || hubRadius >= 0.25 || tireWidth >= 0.27;
  const halfT = tireWidth * 0.5;
  const halfH = hubWidth * 0.5;
  const accentColor = isSelected ? 0xffaa00 : 0x38bdf8;
  const rimColor = isSelected ? 0xffea00 : 0x00e5ff;

  // 1. Lathed Tire Carcass (Rounded Shoulder + Bulged Sidewall + Bead Lip)
  if (wheelDef.hasTire) {
    const sidewallBulge = Math.min(tireWidth * 0.08, (radius - hubRadius) * 0.18);
    const shoulderInset = Math.min(tireWidth * 0.14, (radius - hubRadius) * 0.25);
    const tireProfile = [
      new THREE.Vector2(hubRadius * 0.99, -halfH),
      new THREE.Vector2(hubRadius + (radius - hubRadius) * 0.45, -halfT - sidewallBulge),
      new THREE.Vector2(radius * 0.965, -halfT + shoulderInset * 0.2),
      new THREE.Vector2(radius, -halfT + shoulderInset),
      new THREE.Vector2(radius, halfT - shoulderInset),
      new THREE.Vector2(radius * 0.965, halfT - shoulderInset * 0.2),
      new THREE.Vector2(hubRadius + (radius - hubRadius) * 0.45, halfT + sidewallBulge),
      new THREE.Vector2(hubRadius * 0.99, halfH)
    ];
    const tireGeom = new THREE.LatheGeometry(tireProfile, 36);
    const tireMat = new THREE.MeshStandardMaterial({
      color: isSelected ? 0x9a3412 : 0x111827,
      roughness: 0.88,
      metalness: 0.12,
      transparent: true,
      opacity: isSelected ? 0.62 : 0.48,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const tireMesh = new THREE.Mesh(tireGeom, tireMat);
    tireMesh.quaternion.copy(orientQuat);
    tireMesh.position.copy(centerThree);
    tireMesh.renderOrder = 2;
    group.add(tireMesh);

    // Circumferential tread guide rings (outer shoulders + centerline)
    const ringMat = new THREE.LineBasicMaterial({
      color: isSelected ? 0xffb703 : 0x64748b,
      transparent: true,
      opacity: isSelected ? 0.85 : 0.55
    });
    const ringOffsets = [-halfT + shoulderInset, 0, halfT - shoulderInset];
    for (const yOff of ringOffsets) {
      const pts = [];
      const segs = 40;
      for (let i = 0; i < segs; i++) {
        const th = (i / segs) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(th) * radius, yOff, Math.sin(th) * radius));
      }
      const rGeom = new THREE.BufferGeometry().setFromPoints(pts);
      const rLine = new THREE.LineLoop(rGeom, ringMat);
      rLine.quaternion.copy(orientQuat);
      rLine.position.copy(centerThree);
      group.add(rLine);
    }
  }

  // 2. Stepped Rim Barrel + Outer Lip Flange
  const lipRadius = hubRadius * 1.03;
  const rimProfile = [
    new THREE.Vector2(hubRadius * 0.96, -halfH),
    new THREE.Vector2(hubRadius * 0.92, -halfH * 0.45),
    new THREE.Vector2(hubRadius * 0.92, halfH * 0.45),
    new THREE.Vector2(hubRadius * 0.96, halfH),
    new THREE.Vector2(lipRadius, halfH * outwardSign)
  ];
  // Ensure monotonic lip on outward side
  const rimBarrelProfile = [
    new THREE.Vector2(lipRadius, -halfH),
    new THREE.Vector2(hubRadius * 0.94, -halfH * 0.72),
    new THREE.Vector2(hubRadius * 0.91, 0),
    new THREE.Vector2(hubRadius * 0.94, halfH * 0.72),
    new THREE.Vector2(lipRadius, halfH)
  ];
  const rimGeom = new THREE.LatheGeometry(rimBarrelProfile, 32);
  const rimMat = new THREE.MeshStandardMaterial({
    color: rimColor,
    roughness: 0.25,
    metalness: 0.78,
    transparent: true,
    opacity: isSelected ? 0.55 : 0.34,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const rimMesh = new THREE.Mesh(rimGeom, rimMat);
  rimMesh.quaternion.copy(orientQuat);
  rimMesh.position.copy(centerThree);
  rimMesh.renderOrder = 3;
  group.add(rimMesh);

  // Outer rim edge highlight ring
  const rimEdgePts = [];
  for (let i = 0; i < 36; i++) {
    const th = (i / 36) * Math.PI * 2;
    rimEdgePts.push(new THREE.Vector3(Math.cos(th) * lipRadius, halfH * outwardSign, Math.sin(th) * lipRadius));
  }
  const rimEdgeLine = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(rimEdgePts),
    new THREE.LineBasicMaterial({ color: rimColor, transparent: true, opacity: 0.72 })
  );
  rimEdgeLine.quaternion.copy(orientQuat);
  rimEdgeLine.position.copy(centerThree);
  group.add(rimEdgeLine);

  // 3. Auto-adapting Wheel Face (Truck Deep-Dish 10-Lug vs. Car 6-Spoke + Brake Rotor)
  const faceMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    metalness: 0.72,
    roughness: 0.3,
    transparent: true,
    opacity: isSelected ? 0.7 : 0.44,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  if (isTruckWheel) {
    // Deep-dish heavy-duty steel/alloy wheel face
    const dishOuterY = halfH * 0.85 * outwardSign;
    const dishInnerY = halfH * 0.12 * outwardSign;
    const dishProfile = [
      new THREE.Vector2(hubRadius * 0.26, dishInnerY),
      new THREE.Vector2(hubRadius * 0.56, dishInnerY),
      new THREE.Vector2(hubRadius * 0.93, dishOuterY)
    ];
    const dishMesh = new THREE.Mesh(new THREE.LatheGeometry(dishProfile, 28), faceMat);
    dishMesh.quaternion.copy(orientQuat);
    dishMesh.position.copy(centerThree);
    dishMesh.renderOrder = 3;
    group.add(dishMesh);

    // Heavy-duty planetary/axle hub dome
    const hubCapGeom = new THREE.CylinderGeometry(hubRadius * 0.24, hubRadius * 0.28, halfH * 0.42, 16);
    const hubCap = new THREE.Mesh(hubCapGeom, faceMat);
    hubCap.quaternion.copy(orientQuat);
    hubCap.position.copy(centerThree).add(axisThree.clone().multiplyScalar(dishInnerY + halfH * 0.18 * outwardSign));
    hubCap.renderOrder = 3;
    group.add(hubCap);

    // 10-Lug nut ring
    const lugGeom = new THREE.CylinderGeometry(hubRadius * 0.032, hubRadius * 0.032, halfH * 0.16, 8);
    const lugMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.75 });
    const lugRingR = hubRadius * 0.43;
    for (let i = 0; i < 10; i++) {
      const th = (i / 10) * Math.PI * 2;
      const lug = new THREE.Mesh(lugGeom, lugMat);
      const localOff = new THREE.Vector3(Math.cos(th) * lugRingR, dishInnerY + halfH * 0.06 * outwardSign, Math.sin(th) * lugRingR);
      localOff.applyQuaternion(orientQuat);
      lug.quaternion.copy(orientQuat);
      lug.position.copy(centerThree).add(localOff);
      group.add(lug);
    }
  } else {
    // Passenger / Sport Car: 6-spoke outer face + inner brake rotor
    const spokeCount = 6;
    const spokeY = halfH * 0.68 * outwardSign;
    const spokeLen = hubRadius * 0.72;
    const spokeGeom = new THREE.BoxGeometry(spokeLen, hubWidth * 0.09, hubRadius * 0.11);
    for (let i = 0; i < spokeCount; i++) {
      const th = (i * Math.PI * 2) / spokeCount;
      const spoke = new THREE.Mesh(spokeGeom, faceMat);
      const radialOff = new THREE.Vector3(Math.cos(th) * (hubRadius * 0.54), spokeY, Math.sin(th) * (hubRadius * 0.54));
      radialOff.applyQuaternion(orientQuat);
      spoke.quaternion.copy(orientQuat);
      spoke.rotateY(-th);
      spoke.position.copy(centerThree).add(radialOff);
      spoke.renderOrder = 3;
      group.add(spoke);
    }

    // Center hub cap + 5 lug dots
    const capMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(hubRadius * 0.22, hubRadius * 0.24, hubWidth * 0.12, 16),
      faceMat
    );
    capMesh.quaternion.copy(orientQuat);
    capMesh.position.copy(centerThree).add(axisThree.clone().multiplyScalar(spokeY));
    group.add(capMesh);

    // Subtle inner brake rotor disc
    const rotorRadius = wheelDef.brakeDiameter > 0 ? Math.min(hubRadius * 0.88, wheelDef.brakeDiameter * 0.5) : hubRadius * 0.72;
    const rotorGeom = new THREE.RingGeometry(hubRadius * 0.28, rotorRadius, 24);
    const rotorMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.85,
      roughness: 0.35,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const rotor = new THREE.Mesh(rotorGeom, rotorMat);
    rotor.quaternion.copy(orientQuat);
    rotor.rotateX(Math.PI / 2);
    rotor.position.copy(centerThree).add(axisThree.clone().multiplyScalar(halfH * 0.15 * outwardSign));
    rotor.renderOrder = 2;
    group.add(rotor);
  }

  return group;
}

/**
 * Builds the complete 3D scene group containing all pressure wheels.
 *
 * @param {Array<Object>|Object} wheelsOrParts - Parsed wheel definitions or JBeam parts dict
 * @param {Object} nodesDict - Active parts merged nodes dictionary
 * @param {Object} [options] - Viewport rendering toggles
 * @returns {THREE.Group} Three.js group containing all wheels
 */
export function buildPressureWheelsGroup(wheelsOrParts, nodesDict = {}, options = {}) {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'pressure_wheels_root_group';

  const {
    renderMode = 'skeleton', // 'skeleton' | 'ghost' | 'both'
    visible = true,
    showLabels = true,
    showSurfaces = true,
    selectedWheelName = null
  } = options;

  if (!visible) return rootGroup;

  // Extract wheel definitions if given a parts dictionary
  let wheelDefs = [];
  if (Array.isArray(wheelsOrParts)) {
    wheelDefs = wheelsOrParts;
  } else if (wheelsOrParts && typeof wheelsOrParts === 'object') {
    wheelDefs = extractPressureWheels(wheelsOrParts);
  }

  if (wheelDefs.length === 0) return rootGroup;

  for (const wheelDef of wheelDefs) {
    const isSelected = Boolean(selectedWheelName && wheelDef.name === selectedWheelName);
    const skeleton = generateWheelSkeleton(wheelDef, nodesDict);
    if (skeleton.missingAnchor) continue;

    const wheelGroup = new THREE.Group();
    wheelGroup.name = `wheel_${wheelDef.name}`;
    wheelGroup.userData = {
      type: 'pressureWheel',
      wheelName: wheelDef.name,
      wheelDef,
      stats: skeleton.stats,
      partName: wheelDef.partName,
      range: wheelDef.range
    };

    // 1. Parametric Visual Mesh (Ghost Mode)
    if (renderMode === 'ghost' || renderMode === 'both') {
      const paramMesh = buildParametricWheelMesh(skeleton, isSelected);
      wheelGroup.add(paramMesh);
    }

    // 2. Soft-Body Physical Skeleton (Skeleton Mode)
    if (renderMode === 'skeleton' || renderMode === 'both') {
      const { nodes, beams, surfaces, hubCenter, p1, p2 } = skeleton;

      // A. Node Spheres
      const nodeMeshesGroup = new THREE.Group();
      nodeMeshesGroup.name = `nodes_${wheelDef.name}`;

      for (const nId of Object.keys(nodes)) {
        const n = nodes[nId];
        const nPos = beamngToThree(n.posX, n.posY, n.posZ);
        const mat = isSelected ? selectedNodeMat : (n.isHubNode ? hubNodeMat : tireNodeMat);
        const sphere = new THREE.Mesh(nodeSphereGeom, mat);
        sphere.position.copy(nPos);
        sphere.userData = {
          type: 'wheel_node',
          id: nId,
          wheelName: wheelDef.name,
          isHubNode: n.isHubNode,
          isTireNode: n.isTireNode
        };
        nodeMeshesGroup.add(sphere);
      }
      wheelGroup.add(nodeMeshesGroup);

      // B. Physical Beams (LineSegments)
      const spokePts = [];
      const rimRingPts = [];
      const sidewallPts = [];
      const treadPts = [];

      for (const b of beams) {
        // Resolve node positions
        const id1 = b['id1:'];
        const id2 = b['id2:'];

        const n1 = nodes[id1] || nodesDict[id1];
        const n2 = nodes[id2] || nodesDict[id2];

        if (!n1 || !n2) continue;

        const v1 = beamngToThree(n1.posX ?? n1.pos?.[0], n1.posY ?? n1.pos?.[1], n1.posZ ?? n1.pos?.[2]);
        const v2 = beamngToThree(n2.posX ?? n2.pos?.[0], n2.posY ?? n2.pos?.[1], n2.posZ ?? n2.pos?.[2]);

        if (b.wheelCategory === 'spoke') {
          spokePts.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
        } else if (b.wheelCategory === 'rim_ring' || b.wheelCategory === 'rim_cross') {
          rimRingPts.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
        } else if (b.wheelCategory === 'sidewall') {
          sidewallPts.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
        } else {
          treadPts.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
        }
      }

      function createLines(pts, color, opacity = 0.8) {
        if (pts.length === 0) return null;
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        const mat = new THREE.LineBasicMaterial({
          color: isSelected ? 0xffea00 : color,
          transparent: true,
          opacity: isSelected ? 1.0 : opacity
        });
        return new THREE.LineSegments(geom, mat);
      }

      const spokeLines = createLines(spokePts, 0x00e5ff, 0.7); // Cyan spokes
      if (spokeLines) wheelGroup.add(spokeLines);

      const rimLines = createLines(rimRingPts, 0x38bdf8, 0.75); // Light Blue rim
      if (rimLines) wheelGroup.add(rimLines);

      const sidewallLines = createLines(sidewallPts, BEAM_TYPE_COLORS['|TIRESIDE'] || 0x84cc16, 0.85); // Lime sidewalls
      if (sidewallLines) wheelGroup.add(sidewallLines);

      const treadLines = createLines(treadPts, BEAM_TYPE_COLORS['|PRESSURED'] || 0x818cf8, 0.9); // Indigo tread
      if (treadLines) wheelGroup.add(treadLines);

      // C. Spindle Axis Rotation Guide Line
      const p1Three = beamngToThree(p1[0], p1[1], p1[2]);
      const p2Three = beamngToThree(p2[0], p2[1], p2[2]);
      const axisGeom = new THREE.BufferGeometry().setFromPoints([p1Three, p2Three]);
      const axisMat = new THREE.LineDashedMaterial({
        color: 0xff6b00,
        dashSize: 0.04,
        gapSize: 0.02,
        linewidth: 2
      });
      const axisLine = new THREE.Line(axisGeom, axisMat);
      axisLine.computeLineDistances();
      wheelGroup.add(axisLine);

      // D. Pneumatic Collision Surfaces Mesh
      if (showSurfaces && surfaces.length > 0) {
        const surfacePts = [];

        for (const surf of surfaces) {
          const nList = (surf.nodes || []).map(nid => nodes[nid]).filter(Boolean);
          if (nList.length < 3) continue;

          const pts3 = nList.map(n => beamngToThree(n.posX, n.posY, n.posZ));

          // Triangulate Quad into 2 Triangles (0-1-2 and 0-2-3)
          if (pts3.length >= 4) {
            surfacePts.push(
              pts3[0].x, pts3[0].y, pts3[0].z,
              pts3[1].x, pts3[1].y, pts3[1].z,
              pts3[2].x, pts3[2].y, pts3[2].z,

              pts3[0].x, pts3[0].y, pts3[0].z,
              pts3[2].x, pts3[2].y, pts3[2].z,
              pts3[3].x, pts3[3].y, pts3[3].z
            );
          } else if (pts3.length === 3) {
            surfacePts.push(
              pts3[0].x, pts3[0].y, pts3[0].z,
              pts3[1].x, pts3[1].y, pts3[1].z,
              pts3[2].x, pts3[2].y, pts3[2].z
            );
          }
        }

        if (surfacePts.length > 0) {
          const surfGeom = new THREE.BufferGeometry();
          surfGeom.setAttribute('position', new THREE.Float32BufferAttribute(surfacePts, 3));
          surfGeom.computeVertexNormals();

          const surfMat = new THREE.MeshBasicMaterial({
            color: isSelected ? 0xff8c00 : 0x00e5ff,
            transparent: true,
            opacity: isSelected ? 0.35 : 0.18,
            side: THREE.DoubleSide,
            depthWrite: false
          });

          const surfMesh = new THREE.Mesh(surfGeom, surfMat);
          surfMesh.name = `surfaces_${wheelDef.name}`;
          wheelGroup.add(surfMesh);
        }
      }

      // E. Interactive Floating Billboard HUD Label
      if (showLabels) {
        const topOfTireZ = hubCenter[2] + (wheelDef.radius || 0.33) + 0.08;
        const labelPos = beamngToThree(hubCenter[0], hubCenter[1], topOfTireZ);

        const psiStr = wheelDef.pressurePSI ? `${wheelDef.pressurePSI} PSI` : 'Solid Hub';
        const labelText = `[${wheelDef.name}] ${psiStr}`;
        const labelSprite = createWheelLabelSprite(labelText, labelPos, isSelected);
        wheelGroup.add(labelSprite);
      }
    }

    rootGroup.add(wheelGroup);
  }

  return rootGroup;
}

export default {
  createWheelLabelSprite,
  buildParametricWheelMesh,
  buildPressureWheelsGroup
};
