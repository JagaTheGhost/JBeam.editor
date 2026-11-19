import assert from 'assert';
import { renameNodeLossless } from '../src/features/jbeam/astUpdater.js';
import { decodeWithMeta } from '../src/features/jbeam/sjsonParser.js';

export function runRenameTests() {
  console.log('--- Running Cascading Node Renaming Tests (Step 3) ---');

  // Test 1: Basic cascading node rename across nodes, beams, triangles, and quads
  const fixture1 = `{
  "pickup_frame": {
    "information": {
      "name": "Pickup Frame"
    },
    "nodes": [
      ["id", "posX", "posY", "posZ"],
      // Chassis front nodes
      ["fr1r", 0.45, -1.8, 0.4],
      ["fr1l", -0.45, -1.8, 0.4],
      ["fr2r", 0.45, -1.2, 0.4]
    ],
    "beams": [
      ["id1:", "id2:"],
      {"beamSpring": 2000000},
      ["fr1r", "fr1l"], // Cross member
      ["fr1r", "fr2r"]  // Longitudinal rail
    ],
    "triangles": [
      ["id1:", "id2:", "id3:"],
      ["fr1r", "fr1l", "fr2r"]
    ],
    "quads": [
      ["id1:", "id2:", "id3:", "id4:"],
      ["fr1r", "fr2r", "fr1l", "fr2r"]
    ]
  }
}`;

  const res1 = renameNodeLossless(fixture1, 'pickup_frame', 'fr1r', 'frame_front_r', { symmetry: false });
  assert.strictEqual(res1.error, null, 'Rename should succeed with no error');
  assert.strictEqual(res1.renamedCount, 5, 'Should have renamed exactly 5 occurrences (1 node, 2 beams, 1 tri, 1 quad)');

  // Verify updated text can be parsed and has the new ID
  const bundle1 = decodeWithMeta(res1.updatedText, 'test.jbeam', false);
  const part1 = bundle1.data.pickup_frame;

  // Nodes: fr1r should become frame_front_r
  const nodeRow = Object.values(part1.nodes).find(r => r[0] === 'frame_front_r');
  assert.ok(nodeRow, 'Node definition should be frame_front_r');
  const oldNodeRow = Object.values(part1.nodes).find(r => r[0] === 'fr1r');
  assert.strictEqual(oldNodeRow, undefined, 'Old node fr1r should no longer exist');

  // Beams
  const beam1 = Object.values(part1.beams).find(r => r && r[0] === 'frame_front_r' && r[1] === 'fr1l');
  assert.ok(beam1, 'Beam 1 should reference frame_front_r');
  const beam2 = Object.values(part1.beams).find(r => r && r[0] === 'frame_front_r' && r[1] === 'fr2r');
  assert.ok(beam2, 'Beam 2 should reference frame_front_r');

  // Triangles
  const tri1 = Object.values(part1.triangles).find(r => r && r[0] === 'frame_front_r');
  assert.ok(tri1, 'Triangle should reference frame_front_r');

  // Quads
  const quad1 = Object.values(part1.quads).find(r => r && r[0] === 'frame_front_r');
  assert.ok(quad1, 'Quad should reference frame_front_r');

  // Verify comments are preserved
  assert.ok(res1.updatedText.includes('// Chassis front nodes'), 'Comments in nodes should be preserved');
  assert.ok(res1.updatedText.includes('// Cross member'), 'Inline comment in beams should be preserved');
  assert.ok(res1.updatedText.includes('// Longitudinal rail'), 'Inline comment in beams should be preserved');
  console.log('✓ Test 1: Basic cascading node rename across all tables passed.');

  // Test 2: Bilateral symmetry mirroring rename (e.g. fr1r -> frame_1r also renames fr1l -> frame_1l)
  const res2 = renameNodeLossless(fixture1, 'pickup_frame', 'fr1r', 'frame_1r', { symmetry: true });
  assert.strictEqual(res2.error, null);

  const bundle2 = decodeWithMeta(res2.updatedText, 'test.jbeam', false);
  const part2 = bundle2.data.pickup_frame;

  // Both fr1r -> frame_1r and fr1l -> frame_1l should have been renamed!
  const nodeR = Object.values(part2.nodes).find(r => r[0] === 'frame_1r');
  const nodeL = Object.values(part2.nodes).find(r => r[0] === 'frame_1l');
  assert.ok(nodeR, 'Mirrored rename should have created frame_1r');
  assert.ok(nodeL, 'Mirrored rename should have created frame_1l');

  const symBeam = Object.values(part2.beams).find(r => r && r[0] === 'frame_1r' && r[1] === 'frame_1l');
  assert.ok(symBeam, 'Beam between mirrored pair should be ["frame_1r", "frame_1l"]');
  console.log('✓ Test 2: Symmetrical bilateral node renaming (X-Mirror) passed.');

  // Test 3: No-op when old ID equals new ID
  const res3 = renameNodeLossless(fixture1, 'pickup_frame', 'fr1r', 'fr1r');
  assert.strictEqual(res3.renamedCount, 0);
  assert.strictEqual(res3.updatedText, fixture1);
  console.log('✓ Test 3: No-op rename handled cleanly.');

  // Test 4: Renaming node not found in part
  const res4 = renameNodeLossless(fixture1, 'pickup_frame', 'non_existent_node', 'new_name');
  assert.strictEqual(res4.renamedCount, 0);
  assert.strictEqual(res4.updatedText, fixture1);
  console.log('✓ Test 4: Non-existent node handled gracefully.');

  // Test 5: Replacements array output for Monaco Editor F2 Rename Symbol
  const res5 = renameNodeLossless(fixture1, 'pickup_frame', 'fr1r', 'front_rail_r', { symmetry: true });
  assert.ok(Array.isArray(res5.replacements), 'res5.replacements must be an array');
  assert.ok(res5.replacements.length > 0, 'Should return replacement range entries for Monaco');
  for (const rep of res5.replacements) {
    assert.ok(Array.isArray(rep.range), 'Range must be an array');
    assert.strictEqual(rep.range.length, 4, 'Range must have [startLine, startCol, endLine, endCol]');
    assert.ok(rep.value.includes('front_rail_'), 'Replacement value must contain new ID');
  }
  console.log('✓ Test 5: Monaco Rename Provider edits & replacements verified.');
}

if (process.argv[1]?.endsWith('rename.test.js')) {
  runRenameTests();
}
