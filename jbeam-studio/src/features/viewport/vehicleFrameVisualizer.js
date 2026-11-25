/**
 * 3D Visualizer for Vehicle Reference Frame (refNodes) and Cockpit Cameras (camerasInternal)
 * Generates Three.js 3D arrows, coordinate triads, frustum pyramids, and anchor tether lines.
 */

import * as THREE from 'three';
import { beamngToThree } from './coordinateUtils.js';

/**
 * Creates a text billboard sprite.
 * Headless-safe.
 */
function createTextSprite(text, color = '#ffffff', bgColor = 'rgba(15, 23, 42, 0.85)') {
  if (typeof document === 'undefined') {
    return new THREE.Object3D();
  }
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Object3D();

  ctx.fillStyle = bgColor;
  ctx.roundRect ? ctx.roundRect(4, 4, 248, 56, 8) : ctx.fillRect(4, 4, 248, 56);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = 'bold 22px "JetBrains Mono", Consolas, monospace';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.6, 0.15, 1);
  return sprite;
}

/**
 * Builds Three.js Group representing vehicle reference coordinate frame (refNodes triad).
 *
 * @param {object} refData - Output from extractRefNodes
 * @param {object} [options] - Configuration options
 * @returns {THREE.Group}
 */
export function buildRefNodesGroup(refData, options = {}) {
  const group = new THREE.Group();
  group.name = 'RefNodesGroup';

  if (!refData || !refData.valid) return group;

  const showLabels = options.showLabels !== false;
  const axisLength = options.axisLength || 0.6; // 60cm triad arms

  // 1. Convert Origin from BeamNG to Three.js
  const originThree = beamngToThree(refData.origin);

  // 2. Central Reference Origin Sphere
  const originGeo = new THREE.SphereGeometry(0.045, 16, 16);
  const originMat = new THREE.MeshBasicMaterial({
    color: 0xffd600, // Golden Amber
    wireframe: false,
    depthTest: true
  });
  const originMesh = new THREE.Mesh(originGeo, originMat);
  originMesh.position.copy(originThree);
  group.add(originMesh);

  // Outer halo ring
  const ringGeo = new THREE.RingGeometry(0.06, 0.08, 24);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffd600,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.6
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.position.copy(originThree);
  ringMesh.rotation.x = Math.PI / 2;
  group.add(ringMesh);

  // Helper to build an arrow in Three.js
  const createAxisArrow = (beamngDirUnit, colorHex, labelText) => {
    // End point in BeamNG
    const endBeamng = [
      refData.origin[0] + beamngDirUnit[0] * axisLength,
      refData.origin[1] + beamngDirUnit[1] * axisLength,
      refData.origin[2] + beamngDirUnit[2] * axisLength
    ];
    const endThree = beamngToThree(endBeamng);

    const dirThree = new THREE.Vector3().subVectors(endThree, originThree).normalize();
    const arrow = new THREE.ArrowHelper(dirThree, originThree, axisLength, colorHex, 0.12, 0.06);
    group.add(arrow);

    if (showLabels) {
      const sprite = createTextSprite(labelText, `#${colorHex.toString(16).padStart(6, '0')}`);
      sprite.position.copy(endThree).add(dirThree.clone().multiplyScalar(0.08));
      group.add(sprite);
    }
  };

  // Forward Vector (Emerald Green #00E676)
  createAxisArrow(refData.forwardUnit, 0x00e676, 'FWD (+Y)');

  // Left Vector (Ruby Coral #FF1744)
  createAxisArrow(refData.leftUnit, 0xff1744, 'LEFT (+X)');

  // Up Vector (Sky Cyan #00E5FF)
  createAxisArrow(refData.upUnit, 0x00e5ff, 'UP (+Z)');

  // Reference Origin Label
  if (showLabels) {
    const originLabel = createTextSprite(`REF: ${refData.refNode}`, '#ffd600');
    originLabel.position.copy(originThree).add(new THREE.Vector3(0, 0.14, 0));
    group.add(originLabel);
  }

  return group;
}

/**
 * Builds Three.js Group for cockpit / driver cameras (camerasInternal).
 * Renders 3D eye markers, frustum view pyramids, gaze sightlines, and anchor tether lines.
 *
 * @param {Array<object>} cameras - Output from extractCamerasInternal
 * @param {object} [options] - Options (e.g. showLabels)
 * @returns {THREE.Group}
 */
export function buildCameraFrustumGroup(cameras, options = {}) {
  const group = new THREE.Group();
  group.name = 'CamerasInternalGroup';

  if (!Array.isArray(cameras) || cameras.length === 0) return group;

  const showLabels = options.showLabels !== false;

  for (const cam of cameras) {
    const camThreePos = beamngToThree(cam.worldPos);

    // 1. Camera Eye Marker (Stylized cockpit camera diamond)
    const eyeGeo = new THREE.OctahedronGeometry(0.05, 0);
    const eyeMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff, // Cyan
      wireframe: false
    });
    const eyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
    eyeMesh.position.copy(camThreePos);
    group.add(eyeMesh);

    // 2. Frustum Pyramid
    // In BeamNG, forward is -Y. In Three.js, beamngToThree maps BeamNG -Y to Three.js -Z!
    const frustumDepth = 0.75; // 75cm cone depth
    const fovVal = (cam.fov && cam.fov > 0 && cam.fov < 175) ? cam.fov : 65;
    const fovRad = (fovVal * Math.PI) / 180;
    const halfHeight = frustumDepth * Math.tan(fovRad / 2);
    const halfWidth = halfHeight * (16 / 9); // standard 16:9 aspect ratio

    // Corner points of far plane in local camera coordinates:
    // Forward is along -Z in Three.js
    const corners = [
      new THREE.Vector3(-halfWidth, halfHeight, -frustumDepth), // top-left
      new THREE.Vector3(halfWidth, halfHeight, -frustumDepth),  // top-right
      new THREE.Vector3(halfWidth, -halfHeight, -frustumDepth), // bottom-right
      new THREE.Vector3(-halfWidth, -halfHeight, -frustumDepth) // bottom-left
    ];

    // Wireframe lines: 4 corner rays + 4 rectangle border edges
    const frustumLineMat = new THREE.LineBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.8
    });

    const linePoints = [];
    // 4 rays from eye to corners
    for (const c of corners) {
      linePoints.push(new THREE.Vector3(0, 0, 0));
      linePoints.push(c);
    }
    // Far plane loop: TL -> TR -> BR -> BL -> TL
    linePoints.push(corners[0], corners[1]);
    linePoints.push(corners[1], corners[2]);
    linePoints.push(corners[2], corners[3]);
    linePoints.push(corners[3], corners[0]);

    // Center crosshair in far plane
    linePoints.push(new THREE.Vector3(-0.04, 0, -frustumDepth), new THREE.Vector3(0.04, 0, -frustumDepth));
    linePoints.push(new THREE.Vector3(0, -0.04, -frustumDepth), new THREE.Vector3(0, 0.04, -frustumDepth));

    const frustumGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
    const frustumLines = new THREE.LineSegments(frustumGeo, frustumLineMat);
    frustumLines.position.copy(camThreePos);
    group.add(frustumLines);

    // 3. Tether lines to mounting anchor nodes
    if (cam.anchorCoords && cam.anchorCoords.length > 0) {
      const tetherPoints = [];
      for (const anc of cam.anchorCoords) {
        const ancThree = beamngToThree(anc.coords);
        tetherPoints.push(camThreePos, ancThree);
      }
      const tetherGeo = new THREE.BufferGeometry().setFromPoints(tetherPoints);
      const tetherMat = new THREE.LineDashedMaterial({
        color: 0x94a3b8, // Slate gray
        dashSize: 0.04,
        gapSize: 0.02,
        transparent: true,
        opacity: 0.5
      });
      const tetherLines = new THREE.LineSegments(tetherGeo, tetherMat);
      tetherLines.computeLineDistances();
      group.add(tetherLines);
    }

    // 4. Billboard Tag
    if (showLabels) {
      const tagText = `${cam.type.toUpperCase()} (${Math.round(cam.fov)}°)`;
      const camLabel = createTextSprite(tagText, '#00e5ff');
      camLabel.position.copy(camThreePos).add(new THREE.Vector3(0, 0.12, 0));
      group.add(camLabel);
    }
  }

  return group;
}
