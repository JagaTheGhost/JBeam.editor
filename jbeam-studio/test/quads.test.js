import assert from 'node:assert';
import { decodeWithMeta } from '../src/features/jbeam/sjsonParser.js';
import { processAllParts } from '../src/features/jbeam/tableSchema.js';
import {
  addQuadLossless,
  deleteQuadLossless,
  deleteNodeLossless
} from '../src/features/jbeam/astUpdater.js';

export function runQuadsTests() {
  console.log('--- Running Quads Table & Surface Tests ---');

  const sampleJBeamWithQuads = `{
  "hood_part": {
    "information": { "name": "Vehicle Hood with Quads" },
    "nodes": [
      ["id", "posX", "posY", "posZ"],
      ["hd1r", -0.5, -1.8, 0.7],
      ["hd1l",  0.5, -1.8, 0.7],
      ["hd2r", -0.5, -1.2, 0.8],
      ["hd2l",  0.5, -1.2, 0.8],
      ["hd3r", -0.4, -0.6, 0.9],
      ["hd3l",  0.4, -0.6, 0.9]
    ],
    "beams": [
      ["id1:", "id2:"],
      ["hd1r", "hd1l"],
      ["hd2r", "hd2l"]
    ],
    "quads": [
      ["id1:", "id2:", "id3:", "id4:"],
      {"groundModel": "metal"},
      {"dragCoef": 1.2},
      ["hd1r", "hd2r", "hd2l", "hd1l"],
      ["hd2r", "hd3r", "hd3l", "hd2l"]
    ]
  }
}`;

  // 1. Test parsing & table schema expansion
  const bundle = decodeWithMeta(sampleJBeamWithQuads, 'test_hood.jbeam', true);
  const [parts, diagnostics] = processAllParts(bundle.data);

  assert.ok(parts.hood_part, 'Part hood_part must be parsed');
  assert.ok(parts.hood_part.quads, 'Part must contain quads table');

  const quadKeys = Object.keys(parts.hood_part.quads).filter(k => k !== '__meta');
  assert.strictEqual(quadKeys.length, 2, 'Must have exactly 2 parsed quads');

  const q1 = parts.hood_part.quads[quadKeys[0]];
  assert.strictEqual(q1['id1:'], 'hd1r');
  assert.strictEqual(q1['id2:'], 'hd2r');
  assert.strictEqual(q1['id3:'], 'hd2l');
  assert.strictEqual(q1['id4:'], 'hd1l');
  assert.strictEqual(q1.groundModel, 'metal');
  assert.strictEqual(q1.dragCoef, 1.2);

  // 2. Test degenerate quad detection
  const degenerateJBeam = `{
  "bad_part": {
    "nodes": [
      ["id", "posX", "posY", "posZ"],
      ["n1", 0, 0, 0],
      ["n2", 1, 0, 0]
    ],
    "quads": [
      ["id1:", "id2:", "id3:", "id4:"],
      ["n1", "n2", "n1", "n2"]
    ]
  }
}`;
  const badBundle = decodeWithMeta(degenerateJBeam, 'bad.jbeam', true);
  const [, badDiag] = processAllParts(badBundle.data);
  const hasDegenerateError = badDiag.some(d => d[0] === 'error' && d[1].includes('Degenerate quad'));
  assert.ok(hasDegenerateError, 'Validator must detect degenerate quad with duplicate nodes');

  // 3. Test lossless quad addition with bilateral symmetry (winding order reversal)
  const addQuadRes = addQuadLossless(
    sampleJBeamWithQuads,
    'hood_part',
    { id1: 'hd1r', id2: 'hd2r', id3: 'hd2l', id4: 'hd1l' },
    true
  );
  assert.strictEqual(addQuadRes.error, null);
  assert.ok(addQuadRes.updatedText.includes('["hd1r", "hd2r", "hd2l", "hd1l"]'));

  // 4. Test lossless quad deletion
  const delQuadRes = deleteQuadLossless(sampleJBeamWithQuads, 'hood_part', 'hd1r', 'hd2r', 'hd2l', 'hd1l');
  assert.strictEqual(delQuadRes.error, null);
  assert.strictEqual(delQuadRes.deletedCount, 1, 'Must delete 1 quad row');
  assert.ok(!delQuadRes.updatedText.includes('["hd1r", "hd2r", "hd2l", "hd1l"]'), 'Deleted quad must not be in text');

  // 5. Test cascading node deletion (deleting a node deletes quad containing it)
  const cascadeRes = deleteNodeLossless(sampleJBeamWithQuads, 'hood_part', 'hd1r', true);
  assert.strictEqual(cascadeRes.error, null);
  assert.ok(!cascadeRes.updatedText.includes('["hd1r", -0.5, -1.8, 0.7]'), 'Node must be deleted');
  assert.ok(!cascadeRes.updatedText.includes('["hd1r", "hd1l"]'), 'Attached beam must be cascade deleted');
  assert.ok(!cascadeRes.updatedText.includes('["hd1r", "hd2r", "hd2l", "hd1l"]'), 'Attached quad must be cascade deleted');
  assert.ok(cascadeRes.updatedText.includes('["hd2r", "hd3r", "hd3l", "hd2l"]'), 'Unaffected quad must survive intact');

  console.log('✓ Quads Table & Surface tests passed!');
}

