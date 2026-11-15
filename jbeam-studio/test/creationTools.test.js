import assert from 'node:assert';
import { decodeWithMeta } from '../src/features/jbeam/sjsonParser.js';
import { processAllParts } from '../src/features/jbeam/tableSchema.js';
import {
  addNodeLossless,
  addBeamLossless,
  addTriangleLossless,
  addQuadLossless,
  deleteNodeLossless,
  deleteBeamLossless,
  deleteTriangleLossless,
  subdivideBeamLossless,
  updateNodeCoordinatesLossless
} from '../src/features/jbeam/astUpdater.js';

export function runCreationToolsTests() {
  console.log('--- Running Visual Structure Creation Tools Tests ---');

  const baseJBeam = `{
  "suspension_arm": {
    "information": { "name": "Front Suspension" },
    "nodes": [
      ["id", "posX", "posY", "posZ"],
      ["mount_r", 0.35, 1.20, 0.40],
      ["mount_l", -0.35, 1.20, 0.40]
    ],
    "beams": [
      ["id1:", "id2:"],
      {"beamSpring": 5001000, "beamDamp": 500},
      ["mount_r", "mount_l"]
    ]
  }
}`;

  // 1. Add symmetric node pair (e.g. hub_r at [0.75, 1.20, 0.35])
  const step1 = addNodeLossless(
    baseJBeam,
    'suspension_arm',
    { id: 'hub_r', pos: [0.75, 1.20, 0.35] },
    true // symmetry ON
  );
  assert.strictEqual(step1.error, null, 'Adding symmetric nodes must succeed');
  assert.ok(step1.updatedText.includes('["hub_r", 0.75, 1.2, 0.35]'), 'Primary hub_r must be added');
  assert.ok(step1.updatedText.includes('["hub_l", -0.75, 1.2, 0.35]'), 'Mirrored hub_l must have -X coordinate');

  // Verify parseable
  let bundle = decodeWithMeta(step1.updatedText, 'test.jbeam', true);
  let [parts] = processAllParts(bundle.data);
  assert.ok(parts.suspension_arm.nodes.hub_r, 'hub_r exists in parsed structure');
  assert.ok(parts.suspension_arm.nodes.hub_l, 'hub_l exists in parsed structure');
  assert.deepStrictEqual(parts.suspension_arm.nodes.hub_r.pos, [0.75, 1.20, 0.35]);
  assert.deepStrictEqual(parts.suspension_arm.nodes.hub_l.pos, [-0.75, 1.20, 0.35]);

  // 2. Connect beam with symmetry ON (connect mount_r to hub_r)
  const step2 = addBeamLossless(
    step1.updatedText,
    'suspension_arm',
    { id1: 'mount_r', id2: 'hub_r', properties: { beamSpring: 6000000, beamDamp: 600 } },
    true
  );
  assert.strictEqual(step2.error, null, 'Adding symmetric beams must succeed');
  assert.ok(step2.updatedText.includes('["mount_r", "hub_r"]'), 'Primary beam added');
  assert.ok(step2.updatedText.includes('["mount_l", "hub_l"]'), 'Mirrored beam added');

  // 2b. Connect beam without properties (clean default beam)
  const step2b = addBeamLossless(
    step2.updatedText,
    'suspension_arm',
    { id1: 'mount_r', id2: 'mount_l', properties: {} },
    false
  );
  assert.strictEqual(step2b.error, null);
  assert.ok(step2b.updatedText.includes('["mount_r", "mount_l"]'), 'Clean beam added without property clutter');

  bundle = decodeWithMeta(step2.updatedText, 'test.jbeam', true);
  [parts] = processAllParts(bundle.data);
  const beamKeys = Object.keys(parts.suspension_arm.beams).filter(k => k !== '__meta');
  assert.strictEqual(beamKeys.length, 3, 'Must now have 3 beams (original + 2 symmetric)');

  // 3. Add aerodynamic/collision triangle with symmetry ON (verify reversed winding order)
  const step3 = addTriangleLossless(
    step2.updatedText,
    'suspension_arm',
    { id1: 'mount_r', id2: 'hub_r', id3: 'mount_l' },
    true
  );
  assert.strictEqual(step3.error, null, 'Adding symmetric triangle must succeed');
  assert.ok(step3.updatedText.includes('"triangles": ['), 'Triangles section created');
  assert.ok(step3.updatedText.includes('["mount_r", "hub_r", "mount_l"]'), 'Primary triangle added');
  // Mirrored side: mount_r -> mount_l, hub_r -> hub_l, mount_l -> mount_r
  // With winding order reversed (vertex 2 and 3 swapped): [mount_l, mount_r, hub_l]
  assert.ok(step3.updatedText.includes('["mount_l", "mount_r", "hub_l"]'), 'Mirrored triangle must invert winding order');

  // 4. Delete single beam
  const step4 = deleteBeamLossless(step3.updatedText, 'suspension_arm', 'mount_r', 'hub_r');
  assert.strictEqual(step4.error, null);
  assert.strictEqual(step4.deletedCount, 1, 'Exactly 1 beam deleted');
  assert.ok(!step4.updatedText.includes('["mount_r", "hub_r"]'), 'Target beam removed');
  assert.ok(step4.updatedText.includes('["mount_l", "hub_l"]'), 'Other beam retained');

  // 5. Delete node with cascade
  const step5 = deleteNodeLossless(step4.updatedText, 'suspension_arm', 'hub_l', true);
  assert.strictEqual(step5.error, null);
  assert.ok(!step5.updatedText.includes('hub_l'), 'hub_l removed completely from nodes, beams and triangles');

  // 6. Subdivide beam (e.g. between mount_r and mount_l)
  const step6 = subdivideBeamLossless(
    baseJBeam,
    'suspension_arm',
    { id1: 'mount_r', id2: 'mount_l', newNodeId: 'mount_mid', newPos: [0.0, 1.20, 0.40] },
    false
  );
  assert.strictEqual(step6.error, null);
  assert.ok(!step6.updatedText.includes('["mount_r", "mount_l"]'), 'Original beam split');
  assert.ok(step6.updatedText.includes('["mount_mid", 0, 1.2, 0.4]'), 'Intermediate node inserted');
  assert.ok(step6.updatedText.includes('["mount_r", "mount_mid"]'), 'First split segment added');
  assert.ok(step6.updatedText.includes('["mount_mid", "mount_l"]'), 'Second split segment added');

  // 7. Place new node and move it: verify coordinate update does not reset
  const placeRes = addNodeLossless(
    baseJBeam,
    'suspension_arm',
    { id: 'custom_n1', pos: [1.0, 2.0, 0.5] },
    false
  );
  assert.strictEqual(placeRes.error, null);
  assert.ok(placeRes.updatedText.includes('["custom_n1", 1, 2, 0.5]'));

  // Move the newly placed node to a new location [1.45, 2.30, 0.85]
  const moveRes = updateNodeCoordinatesLossless(
    placeRes.updatedText,
    [{ id: 'custom_n1', pos: [1.45, 2.30, 0.85] }]
  );
  assert.strictEqual(moveRes.error, null);
  assert.strictEqual(moveRes.modifiedCount, 1, 'Exactly 1 node coordinate updated');
  assert.ok(moveRes.updatedText.includes('["custom_n1", 1.45, 2.3, 0.85]'), 'New node coordinates updated without resetting');
  assert.ok(!moveRes.updatedText.includes('["custom_n1", 1, 2, 0.5]'), 'Old placed coordinates replaced');

  // 8. Add quad surface with symmetry
  const quadRes = addQuadLossless(
    baseJBeam,
    'suspension_arm',
    { id1: 'mount_r', id2: 'mount_l', id3: 'hub_l', id4: 'hub_r' },
    false
  );
  assert.strictEqual(quadRes.error, null);
  assert.ok(quadRes.updatedText.includes('"quads": ['));
  assert.ok(quadRes.updatedText.includes('["mount_r", "mount_l", "hub_l", "hub_r"]'));

  console.log('✓ Visual Structure Creation Tools tests passed!');
}

