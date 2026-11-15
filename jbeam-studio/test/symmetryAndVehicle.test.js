import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeWithMeta } from '../src/features/jbeam/sjsonParser.js';
import { processAllParts } from '../src/features/jbeam/tableSchema.js';
import { updateNodeCoordinatesLossless } from '../src/features/jbeam/astUpdater.js';
import { getSymmetricNodeId, getSymmetricCoordinates } from '../src/features/jbeam/symmetryUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function runSymmetryAndVehicleTests() {
  console.log('--- Running Symmetry & Real Vehicle Mod Tests ---');

  // Test 1: Symmetrical Node ID Resolution
  assert.strictEqual(getSymmetricNodeId('rf1r'), 'rf1l', 'rf1r -> rf1l');
  assert.strictEqual(getSymmetricNodeId('rf1l'), 'rf1r', 'rf1l -> rf1r');
  assert.strictEqual(getSymmetricNodeId('c1r'), 'c1l', 'c1r -> c1l');
  assert.strictEqual(getSymmetricNodeId('arm_r'), 'arm_l', 'arm_r -> arm_l');
  assert.strictEqual(getSymmetricNodeId('arm_l'), 'arm_r', 'arm_l -> arm_r');
  assert.strictEqual(getSymmetricNodeId('wheel_fr'), 'wheel_fl', 'wheel_fr -> wheel_fl');
  assert.strictEqual(getSymmetricNodeId('wheel_fl'), 'wheel_fr', 'wheel_fl -> wheel_fr');
  assert.strictEqual(getSymmetricNodeId('susp_rr'), 'susp_rl', 'susp_rr -> susp_rl');
  assert.strictEqual(getSymmetricNodeId('MIRROR_R'), 'MIRROR_L', 'MIRROR_R -> MIRROR_L');
  assert.strictEqual(getSymmetricNodeId('door_r_handle'), 'door_l_handle', 'door_r_handle -> door_l_handle');
  assert.strictEqual(getSymmetricNodeId('headlight_right'), 'headlight_left', 'headlight_right -> headlight_left');
  assert.strictEqual(getSymmetricNodeId('center_chassis'), null, 'Central nodes have no counterpart');

  // Test 2: Symmetrical Coordinate Reflection
  const origPos = [0.420, -1.850, 0.320];
  const symPos = getSymmetricCoordinates(origPos);
  assert.deepStrictEqual(symPos, [-0.420, -1.850, 0.320], 'Lateral X inverted, Y and Z preserved');

  // Test 3: Left/Right Symmetry Lossless AST Update
  const symmetryJBeam = `{
  "symmetric_part": {
    "nodes": [
      ["id", "posX", "posY", "posZ"],
      ["rail_1r", 0.450, 1.200, 0.350],
      ["rail_1l", -0.450, 1.200, 0.350]
    ]
  }
}`;

  const bundle = decodeWithMeta(symmetryJBeam, 'sym.jbeam', true);
  const [parts] = processAllParts(bundle.data);
  const nodeR = parts.symmetric_part.nodes.rail_1r;
  const nodeL = parts.symmetric_part.nodes.rail_1l;

  // Move right node to X=0.520, Y=1.350, Z=0.400
  const newPosR = [0.520, 1.350, 0.400];
  const mirroredPosL = [-0.520, 1.350, 0.400];

  const nodesToUpdate = [
    { ...nodeR, id: 'rail_1r', pos: newPosR },
    { ...nodeL, id: 'rail_1l', pos: mirroredPosL }
  ];

  const updateRes = updateNodeCoordinatesLossless(symmetryJBeam, nodesToUpdate);
  assert.strictEqual(updateRes.error, null);
  assert.strictEqual(updateRes.modifiedCount, 2, 'Both mirrored nodes must be updated');
  assert.ok(updateRes.updatedText.includes('0.52'), 'Right node X updated');
  assert.ok(updateRes.updatedText.includes('-0.52'), 'Left node mirrored X updated');

  // Test 4: Beam Length Euclidean Calculation
  const n1Pos = [-0.420, -1.850, 0.320];
  const n2Pos = [0.420, -1.850, 0.320];
  const beamDist = Math.hypot(n1Pos[0] - n2Pos[0], n1Pos[1] - n2Pos[1], n1Pos[2] - n2Pos[2]);
  assert.strictEqual(Number(beamDist.toFixed(4)), 0.8400, 'Beam length between -0.42 and 0.42 must be 0.84m');

  // Test 5: Real BeamNG Game Mod Parsing (Percheron Cab as real-world mod reference)
  const percheronCabPath = path.resolve(__dirname, '../../percheron/vehicles/percheron/jbeams/body/percheron_cab_L.jbeam');
  if (fs.existsSync(percheronCabPath)) {
    const cabContent = fs.readFileSync(percheronCabPath, 'utf-8');
    const cabBundle = decodeWithMeta(cabContent, 'percheron_cab_L.jbeam', true);
    assert.ok(cabBundle.data, 'Percheron cab SJSON must be parsed');
    assert.strictEqual(cabBundle.errors.length, 0, 'Percheron cab SJSON syntax must be error-free');

    const [cabParts] = processAllParts(cabBundle.data);
    assert.ok(cabParts.percheron_cab_L, 'percheron_cab_L part must be extracted');
    const nodeCount = Object.keys(cabParts.percheron_cab_L.nodes || {}).filter(k => k !== '__meta').length;
    const beamCount = Object.keys(cabParts.percheron_cab_L.beams || {}).filter(k => k !== '__meta').length;
    const triCount = Object.keys(cabParts.percheron_cab_L.triangles || {}).filter(k => k !== '__meta').length;

    assert.ok(nodeCount >= 80, `Percheron cab should have ~90 nodes (got ${nodeCount})`);
    assert.ok(beamCount >= 400, `Percheron cab should have ~470 beams (got ${beamCount})`);
    assert.ok(triCount >= 100, `Percheron cab should have ~130 triangles (got ${triCount})`);
    console.log(`  Parsed Percheron Cab: ${nodeCount} nodes, ${beamCount} beams, ${triCount} triangles.`);
  }

  console.log('✓ Symmetry & Real Vehicle Mod tests passed!');
}
