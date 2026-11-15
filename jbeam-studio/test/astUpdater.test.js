import assert from 'node:assert';
import { decodeWithMeta } from '../src/features/jbeam/sjsonParser.js';
import { processAllParts } from '../src/features/jbeam/tableSchema.js';
import {
  updateNodeCoordinatesLossless,
  addNodeLossless,
  addBeamLossless,
  addTriangleLossless,
  deleteNodeLossless,
  deleteBeamLossless,
  deleteTriangleLossless
} from '../src/features/jbeam/astUpdater.js';

export function runAstUpdaterTests() {
  console.log('--- Running AST Lossless Updater Tests ---');

  const originalJBeam = `{
  "sample_chassis": {
    "information": { "name": "Preserve Formatting" },
    "nodes": [
      ["id", "posX", "posY", "posZ"],
      // Keep this front comment intact!
      ["front_node", 0.1234, 1.5678, 0.4321],
      /* Block comment here */
      ["rear_node", -0.9876, 2.3456, 0.8765]
    ]
  }
}`;

  // 1. Parse initial
  const bundle = decodeWithMeta(originalJBeam, 'test.jbeam', true);
  const [parts] = processAllParts(bundle.data);
  const frontNode = parts.sample_chassis.nodes.front_node;
  assert.ok(frontNode, 'front_node must exist');

  // 2. Modify front_node coordinates
  const updatedNodes = [
    {
      ...frontNode,
      pos: [0.5555, 1.8888, 0.9999]
    }
  ];

  const result = updateNodeCoordinatesLossless(originalJBeam, updatedNodes);
  assert.strictEqual(result.error, null, 'Update must succeed without error');
  assert.strictEqual(result.modifiedCount, 1, 'Exactly 1 node must be modified');

  // 3. Verify comments and formatting survived
  assert.ok(result.updatedText.includes('// Keep this front comment intact!'), 'Single-line comment must be preserved');
  assert.ok(result.updatedText.includes('/* Block comment here */'), 'Multi-line comment must be preserved');
  assert.ok(result.updatedText.includes('["rear_node", -0.9876, 2.3456, 0.8765]'), 'Unaffected rear_node must be untouched');

  // 4. Verify new numbers exist in text
  assert.ok(result.updatedText.includes('0.5555'), 'Updated X coordinate must be present');
  assert.ok(result.updatedText.includes('1.8888'), 'Updated Y coordinate must be present');
  assert.ok(result.updatedText.includes('0.9999'), 'Updated Z coordinate must be present');

  // 5. Re-parse updated text to verify it is valid JBeam
  const reBundle = decodeWithMeta(result.updatedText, 'reparsed.jbeam', true);
  const [reParts] = processAllParts(reBundle.data);
  const reFront = reParts.sample_chassis.nodes.front_node;
  assert.deepStrictEqual(reFront.pos, [0.5555, 1.8888, 0.9999], 'Re-parsed coordinates must match committed values');

  // 6. Test visual addition of symmetric nodes
  const addNodeRes = addNodeLossless(
    result.updatedText,
    'sample_chassis',
    { id: 'f_strut_r', pos: [0.65, 1.25, 0.85] },
    true
  );
  assert.strictEqual(addNodeRes.error, null);
  assert.ok(addNodeRes.updatedText.includes('["f_strut_r", 0.65, 1.25, 0.85]'), 'Primary node added');
  assert.ok(addNodeRes.updatedText.includes('["f_strut_l", -0.65, 1.25, 0.85]'), 'Mirrored node added with -X');

  // 7. Test visual addition of symmetric beams
  const addBeamRes = addBeamLossless(
    addNodeRes.updatedText,
    'sample_chassis',
    { id1: 'f_strut_r', id2: 'front_node' },
    true
  );
  assert.strictEqual(addBeamRes.error, null);
  assert.ok(addBeamRes.updatedText.includes('"beams": ['), 'Beams section automatically created');
  assert.ok(addBeamRes.updatedText.includes('["f_strut_r", "front_node"]'), 'Primary beam added');

  // 8. Test visual addition of symmetric triangles (winding inversion)
  const addTriRes = addTriangleLossless(
    addBeamRes.updatedText,
    'sample_chassis',
    { id1: 'f_strut_r', id2: 'front_node', id3: 'rear_node' },
    true
  );
  assert.strictEqual(addTriRes.error, null);
  assert.ok(addTriRes.updatedText.includes('"triangles": ['), 'Triangles section created');
  assert.ok(addTriRes.updatedText.includes('["f_strut_r", "front_node", "rear_node"]'), 'Primary triangle added');

  // 9. Test element deletion (node with cascade)
  const delNodeRes = deleteNodeLossless(addTriRes.updatedText, 'sample_chassis', 'rear_node', true);
  assert.strictEqual(delNodeRes.error, null);
  assert.ok(!delNodeRes.updatedText.includes('rear_node'), 'rear_node and attached triangles removed');

  console.log('✓ AST Lossless Updater tests passed!');
}

