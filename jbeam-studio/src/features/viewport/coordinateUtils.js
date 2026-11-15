/*
  BeamNG <-> Three.js Coordinate Conversion Utilities
  BeamNG Official Physics Coordinate System:
    X: Lateral (+X = Vehicle Left / Driver's side, -X = Vehicle Right / Passenger side)
    Y: Longitudinal (-Y = Vehicle Front / Forward, +Y = Vehicle Rear / Backward)
    Z: Vertical (+Z = Up, -Z = Down)

  Three.js World:
    X: Screen Lateral (+X = Right, -X = Left when looking forward along -Z)
    Y: Vertical (+Y = Up, -Y = Down)
    Z: Depth (-Z = Forward / Into screen, +Z = Rear / Toward viewer)

  Right-handed mapping (Determinant = +1, pure rotation without reflection):
    Three.js Position = (-beamng.X, beamng.Z, beamng.Y)
    BeamNG Position   = (-three.X, three.Z, three.Y)
*/

import * as THREE from 'three';
import { getSymmetricNodeId, getSymmetricCoordinates, isCentralNode } from '../jbeam/symmetryUtils.js';

export function beamngToThree(bx, by, bz) {
  return new THREE.Vector3(
    -(Number(bx) || 0),
    Number(bz) || 0,
    Number(by) || 0
  );
}

export function threeToBeamng(tx, ty, tz) {
  return [
    -(Number(tx) || 0),
    Number(tz) || 0,
    Number(ty) || 0
  ];
}

export function beamngArrayToThree(pos) {
  if (!Array.isArray(pos) || pos.length < 3) return new THREE.Vector3(0, 0, 0);
  return beamngToThree(pos[0], pos[1], pos[2]);
}

export { getSymmetricNodeId, getSymmetricCoordinates, isCentralNode };

export default {
  beamngToThree,
  threeToBeamng,
  beamngArrayToThree,
  getSymmetricNodeId,
  getSymmetricCoordinates,
  isCentralNode
};

