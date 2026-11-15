import assert from 'node:assert';
import { decodeWithMeta, decodeWithMetaWithDiagnostics } from '../src/features/jbeam/sjsonParser.js';
import { processAllParts } from '../src/features/jbeam/tableSchema.js';

export function runParserTests() {
  console.log('--- Running Parser Tests ---');

  // Test 1: SJSON with comments and trailing commas
  const testSjson = `
    // Vehicle header comment
    {
      "test_part": {
        /* Multi-line
           comment block */
        "information": { "name": "Test Frame", },
        "nodes": [
          ["id", "posX", "posY", "posZ"],
          ["node1", 0.5, 1.25, 0.75],
          ["node2", -0.5, 1.25, 0.75],
        ],
        "beams": [
          ["id1:", "id2:"],
          ["node1", "node2"],
        ],
      }
    }
  `;

  const bundle = decodeWithMetaWithDiagnostics(testSjson, 'test.jbeam');
  assert.ok(bundle.data, 'SJSON data must be parsed');
  assert.strictEqual(bundle.errorsExist, false, 'Should have no syntax errors');
  assert.ok(bundle.data.test_part, 'test_part must exist');

  // Test 2: TableSchema normalization
  const [parts, diagnostics] = processAllParts(bundle.data);
  assert.ok(parts.test_part, 'Processed parts must include test_part');
  assert.ok(parts.test_part.nodes, 'test_part must have nodes table');
  assert.ok(parts.test_part.nodes.node1, 'node1 must be extracted by ID');
  assert.deepStrictEqual(parts.test_part.nodes.node1.pos, [0.5, 1.25, 0.75], 'node1 position must be [0.5, 1.25, 0.75]');
  assert.ok(parts.test_part.nodes.node2, 'node2 must be extracted by ID');
  assert.deepStrictEqual(parts.test_part.nodes.node2.pos, [-0.5, 1.25, 0.75], 'node2 position must be [-0.5, 1.25, 0.75]');

  assert.ok(parts.test_part.beams, 'test_part must have beams table');
  const beamKeys = Object.keys(parts.test_part.beams).filter(k => k !== '__meta');
  assert.strictEqual(beamKeys.length, 1, 'Must have exactly 1 beam');
  assert.strictEqual(parts.test_part.beams[beamKeys[0]]['id1:'], 'node1');
  assert.strictEqual(parts.test_part.beams[beamKeys[0]]['id2:'], 'node2');

  console.log('✓ Parser & TableSchema tests passed!');
}

