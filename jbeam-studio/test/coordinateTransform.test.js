import assert from 'node:assert';
import { beamngToThree, threeToBeamng, beamngArrayToThree } from '../src/features/viewport/coordinateUtils.js';

export function runCoordinateTransformTests() {
  console.log('--- Running Coordinate Transformation Tests ---');

  // Test 1: Fundamental Axis Alignment
  // BeamNG: Lateral X (+X=Left, -X=Right), Longitudinal Y (-Y=Front, +Y=Rear), Vertical Z (+Z=Up, -Z=Down)
  // Three.js: Lateral X (+X=Right, -X=Left), Vertical Y (+Y=Up, -Y=Down), Depth Z (-Z=Forward, +Z=Rear)
  // Determinant = +1 (pure right-handed rotation without negative reflections)
  const bPos = [0.75, -2.50, 0.45];
  const tVec = beamngToThree(bPos[0], bPos[1], bPos[2]);

  assert.strictEqual(tVec.x, -0.75, 'Three.js X must be -BeamNG X (lateral: BeamNG +X is Left, Three.js -X is Left)');
  assert.strictEqual(tVec.y, 0.45, 'Three.js Y must match BeamNG Z (vertical up)');
  assert.strictEqual(tVec.z, -2.50, 'Three.js Z must match BeamNG Y (longitudinal: BeamNG -Y is Front, Three.js -Z is Front)');

  // Test 2: Reverse transformation (Three.js -> BeamNG)
  const convertedBack = threeToBeamng(tVec.x, tVec.y, tVec.z);
  assert.strictEqual(convertedBack[0], bPos[0], 'X coordinate must roundtrip exactly');
  assert.strictEqual(convertedBack[1], bPos[1], 'Y coordinate must roundtrip exactly');
  assert.strictEqual(convertedBack[2], bPos[2], 'Z coordinate must roundtrip exactly');

  // Test 3: Array conversion helper
  const vecFromArr = beamngArrayToThree([-1.2, -3.4, 0.9]);
  assert.strictEqual(vecFromArr.x, 1.2, 'Negative BeamNG X (Right) becomes positive Three.js X (Right)');
  assert.strictEqual(vecFromArr.y, 0.9, 'BeamNG Z (Up) becomes Three.js Y (Up)');
  assert.strictEqual(vecFromArr.z, -3.4, 'Negative BeamNG Y (Front) becomes negative Three.js Z (Front)');

  // Test 4: Extreme and negative coordinates
  const testCases = [
    [0, 0, 0],
    [-2.15, -4.8, -0.3],
    [1.85, 5.2, 2.1],
    [-0.001, 0.001, -0.001]
  ];

  for (const tc of testCases) {
    const three = beamngToThree(tc[0], tc[1], tc[2]);
    const back = threeToBeamng(three.x, three.y, three.z);
    assert.strictEqual(Math.abs(back[0] - tc[0]) < 1e-6, true, `X failed for ${tc}`);
    assert.strictEqual(Math.abs(back[1] - tc[1]) < 1e-6, true, `Y failed for ${tc}`);
    assert.strictEqual(Math.abs(back[2] - tc[2]) < 1e-6, true, `Z failed for ${tc}`);
  }

  console.log('✓ Coordinate Transformation tests passed!');
}

