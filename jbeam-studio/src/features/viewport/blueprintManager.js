/*
  JBeam Studio - Blueprint & Reference Image Manager
  Inspired by RORMasa/NodeBeamEditor & flux3dp/beam-studio.
  Manages orthographic blueprint planes (Top, Front, Side) with 2-point real-world calibration.
*/

import * as THREE from 'three';
import { beamngToThree } from './coordinateUtils.js';

export const DEFAULT_BLUEPRINT_CONFIG = {
  side: {
    enabled: false,
    imageUrl: null,
    opacity: 0.65,
    scale: 5.0, // Length in meters
    aspectRatio: 1.0,
    offset: { x: -0.05, y: 0, z: 0 }, // X-offset sits just beside chassis center
    flipX: false,
    flipY: false
  },
  front: {
    enabled: false,
    imageUrl: null,
    opacity: 0.65,
    scale: 2.2, // Width in meters
    aspectRatio: 1.0,
    offset: { x: 0, y: -0.05, z: 0 }, // Y-offset sits just in front of origin
    flipX: false,
    flipY: false
  },
  top: {
    enabled: false,
    imageUrl: null,
    opacity: 0.65,
    scale: 5.0, // Length in meters
    aspectRatio: 1.0,
    offset: { x: 0, y: 0, z: -0.05 }, // Z-offset sits just under ground
    flipX: false,
    flipY: false
  }
};

/**
 * Calculates calibrated plane dimensions and center offset from two clicked image points.
 *
 * @param {object} p1 - { u: number, v: number } Normalized UV coords [0..1]
 * @param {object} p2 - { u: number, v: number } Normalized UV coords [0..1]
 * @param {number} realDistanceMeters - Known distance between the two points in meters (e.g. wheelbase 2.85m)
 * @param {number} imageWidth - Image pixel width
 * @param {number} imageHeight - Image pixel height
 * @param {'side'|'front'|'top'} planeType
 * @returns {{ scale: number, width: number, height: number, centerOffset: { x: number, y: number, z: number } }}
 */
export function calibrateBlueprintScale(p1, p2, realDistanceMeters, imageWidth, imageHeight, planeType = 'side') {
  if (!p1 || !p2 || !realDistanceMeters || realDistanceMeters <= 0 || !imageWidth || !imageHeight) {
    throw new Error('Invalid calibration inputs');
  }

  const aspectRatio = imageWidth / imageHeight;

  // Normalized coordinate delta taking aspect ratio into account
  // In UV space, u in [0, 1] spans planeWidth, v in [0, 1] spans planeHeight = planeWidth / aspectRatio
  const du = p2.u - p1.u;
  const dv = (p2.v - p1.v) / aspectRatio;
  const uvDist = Math.sqrt(du * du + dv * dv);

  if (uvDist < 0.001) {
    throw new Error('Calibration points are too close together');
  }

  // Calculate physical plane dimensions in meters
  const planeWidth = realDistanceMeters / uvDist;
  const planeHeight = planeWidth / aspectRatio;

  // Calculate midpoint between calibration points in UV space
  const midU = (p1.u + p2.u) * 0.5;
  const midV = (p1.v + p2.v) * 0.5;

  // Offset from image center (0.5, 0.5) in physical meters
  const deltaFromCenterU = (midU - 0.5) * planeWidth;
  const deltaFromCenterV = (midV - 0.5) * planeHeight;

  // Map to BeamNG 3D coordinate space based on plane orientation:
  // BeamNG: X = Lateral (Right/Left), Y = Longitudinal (-Y Front, +Y Rear), Z = Vertical (+Z Up)
  const centerOffset = { x: 0, y: 0, z: 0 };

  if (planeType === 'side') {
    // Width spans Longitudinal (Y), Height spans Vertical (Z)
    centerOffset.y = -deltaFromCenterU;
    centerOffset.z = -deltaFromCenterV;
  } else if (planeType === 'front') {
    // Width spans Lateral (X), Height spans Vertical (Z)
    centerOffset.x = -deltaFromCenterU;
    centerOffset.z = -deltaFromCenterV;
  } else if (planeType === 'top') {
    // Width spans Lateral (X), Height spans Longitudinal (Y)
    centerOffset.x = -deltaFromCenterU;
    centerOffset.y = -deltaFromCenterV;
  }

  return {
    scale: planeWidth,
    width: planeWidth,
    height: planeHeight,
    aspectRatio,
    centerOffset
  };
}

/**
 * Builds a Three.js 3D Mesh representing a blueprint reference plane.
 *
 * @param {'side'|'front'|'top'} planeType
 * @param {object} config - Configuration object matching DEFAULT_BLUEPRINT_CONFIG
 * @param {THREE.Texture} [loadedTexture=null]
 * @returns {THREE.Mesh|null}
 */
export function buildBlueprintMesh(planeType, config, loadedTexture = null) {
  if (!config || !config.enabled || !config.imageUrl) {
    return null;
  }

  const width = config.scale || 5.0;
  const height = width / (config.aspectRatio || 1.0);

  const geometry = new THREE.PlaneGeometry(width, height);

  // Material setup: double-sided, transparent, high-visibility unlit texture
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: Math.max(0.05, Math.min(1.0, config.opacity ?? 0.65)),
    depthWrite: false
  });

  if (loadedTexture) {
    loadedTexture.colorSpace = THREE.SRGBColorSpace;
    material.map = loadedTexture;
    material.needsUpdate = true;
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `blueprint_plane_${planeType}`;
  mesh.renderOrder = -1; // Render behind vehicle structure

  const off = config.offset || { x: 0, y: 0, z: 0 };

  // Orient plane in BeamNG coordinate space:
  // In our Three.js scene:
  // Three.js X = BeamNG X (Lateral)
  // Three.js Y = BeamNG Z (Vertical Up)
  // Three.js Z = -BeamNG Y (Longitudinal, where -Y is Front -> Three.js +Z)
  if (planeType === 'side') {
    // Plane lies in Y-Z (Three.js Z-Y) plane. Rotate so its normal points along Three.js X.
    mesh.rotation.y = Math.PI / 2;
    const tPos = beamngToThree(off.x, off.y, off.z);
    mesh.position.copy(tPos);
  } else if (planeType === 'front') {
    // Plane lies in X-Z (Three.js X-Y) plane. Faces along Three.js Z.
    mesh.rotation.set(0, 0, 0);
    const tPos = beamngToThree(off.x, off.y, off.z);
    mesh.position.copy(tPos);
  } else if (planeType === 'top') {
    // Plane lies in X-Y (Three.js X-Z) ground plane.
    mesh.rotation.x = -Math.PI / 2;
    const tPos = beamngToThree(off.x, off.y, off.z);
    mesh.position.copy(tPos);
  }

  if (config.flipX) mesh.scale.x = -1;
  if (config.flipY) mesh.scale.y = -1;

  mesh.userData = {
    type: 'blueprint_plane',
    planeType,
    config
  };

  return mesh;
}

export default {
  DEFAULT_BLUEPRINT_CONFIG,
  calibrateBlueprintScale,
  buildBlueprintMesh
};

