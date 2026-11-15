/*
  JBeam Studio - Automated Test Suite: Batch Node Renamer (from Blender)
  Validates:
  1. Pattern formatting (#fl -> 1fl, 2fl, 3fl; ##fl -> 01fl; node_#_r -> node_1_r)
  2. Pattern validation (only valid JBeam node ID characters permitted)
  3. Preview sequence generation
  4. Sequential lossless AST cascading renaming across nodes, beams, and surfaces
  5. Symmetrical bilateral batch renaming (X-Mirror: 1fl/1fr, fl1/fr1, node_1_l/node_1_r)
*/

import assert from 'node:assert';
import { formatBatchNodeName, validateBatchPattern, previewBatchSequence } from '../src/features/jbeam/batchRenamer.js';
import { renameNodeLossless } from '../src/features/jbeam/astUpdater.js';
import { getSymmetricNodeId } from '../src/features/jbeam/symmetryUtils.js';
import { decodeWithMeta } from '../src/features/jbeam/sjsonParser.js';

export function runBatchRenamerTests() {
  console.log('--- Running Batch Node Renamer Tests (from Blender) ---');

  // Test 1: Pattern Formatting
  {
    assert.strictEqual(formatBatchNodeName('#fl', 1), '1fl');
    assert.strictEqual(formatBatchNodeName('#fl', 2), '2fl');
    assert.strictEqual(formatBatchNodeName('#fl', 10), '10fl');

    assert.strictEqual(formatBatchNodeName('node_#_r', 5), 'node_5_r');
    assert.strictEqual(formatBatchNodeName('f#l', 3), 'f3l');
    assert.strictEqual(formatBatchNodeName('cab_##', 4), 'cab_04');
    assert.strictEqual(formatBatchNodeName('cab_##', 12), 'cab_12');

    // Without '#' placeholder: cleanly append
    assert.strictEqual(formatBatchNodeName('fl', 1), 'fl1');
    assert.strictEqual(formatBatchNodeName('', 7), '7');

    console.log('✓ Test 1: Pattern formatting & numbering passed.');
  }

  // Test 2: Pattern Validation
  {
    assert.strictEqual(validateBatchPattern('#fl').valid, true);
    assert.strictEqual(validateBatchPattern('node_#_l').valid, true);
    assert.strictEqual(validateBatchPattern('cab##').valid, true);

    // Invalid patterns
    assert.strictEqual(validateBatchPattern('').valid, false);
    assert.strictEqual(validateBatchPattern('node #').valid, false, 'Spaces must be rejected');
    assert.strictEqual(validateBatchPattern('node"1"').valid, false, 'Quotes must be rejected');
    assert.strictEqual(validateBatchPattern('a,b').valid, false, 'Commas must be rejected');

    console.log('✓ Test 2: Pattern validation passed.');
  }

  // Test 3: Preview Sequence Generation
  {
    const seq1 = previewBatchSequence('#fl', 1, 3);
    assert.deepStrictEqual(seq1, ['1fl', '2fl', '3fl']);

    const seq2 = previewBatchSequence('chassis_#', 10, 4);
    assert.deepStrictEqual(seq2, ['chassis_10', 'chassis_11', 'chassis_12', 'chassis_13']);

    console.log('✓ Test 3: Preview sequence generation passed.');
  }

  // Test 4: Sequential Cascading AST Renaming on Real JBeam Structure
  {
    let jbeam = `{
      "test_chassis": {
        "nodes": [
          ["id", "posX", "posY", "posZ"],
          ["old_a", 0.5, 1.0, 0.3],
          ["old_b", 0.5, 2.0, 0.3],
          ["old_c", 0.5, 3.0, 0.3]
        ],
        "beams": [
          ["id1:", "id2:"],
          ["old_a", "old_b"],
          ["old_b", "old_c"]
        ],
        "triangles": [
          ["id1:", "id2:", "id3:"],
          ["old_a", "old_b", "old_c"]
        ]
      }
    }`;

    const pattern = '#fl';
    let currentIndex = 1;

    // Simulate clicking old_a -> 1fl
    const target1 = formatBatchNodeName(pattern, currentIndex++);
    assert.strictEqual(target1, '1fl');
    const res1 = renameNodeLossless(jbeam, 'test_chassis', 'old_a', target1, { symmetry: false });
    assert.strictEqual(res1.error, null);
    assert.strictEqual(res1.renamedCount, 3); // 1 node, 1 beam, 1 tri
    jbeam = res1.updatedText;

    // Simulate clicking old_b -> 2fl
    const target2 = formatBatchNodeName(pattern, currentIndex++);
    assert.strictEqual(target2, '2fl');
    const res2 = renameNodeLossless(jbeam, 'test_chassis', 'old_b', target2, { symmetry: false });
    assert.strictEqual(res2.error, null);
    assert.strictEqual(res2.renamedCount, 4); // 1 node, 2 beams, 1 tri
    jbeam = res2.updatedText;

    // Simulate clicking old_c -> 3fl
    const target3 = formatBatchNodeName(pattern, currentIndex++);
    assert.strictEqual(target3, '3fl');
    const res3 = renameNodeLossless(jbeam, 'test_chassis', 'old_c', target3, { symmetry: false });
    assert.strictEqual(res3.error, null);
    assert.strictEqual(res3.renamedCount, 3); // 1 node, 1 beam, 1 tri
    jbeam = res3.updatedText;

    // Verify parsed structure contains exactly 1fl, 2fl, 3fl and no old IDs
    const parsed = decodeWithMeta(jbeam, 'test.jbeam', false).data.test_chassis;
    const nodeIds = Object.keys(parsed.nodes)
      .filter(k => k !== '__meta' && k !== '0')
      .map(k => parsed.nodes[k][0]);
    assert.deepStrictEqual(nodeIds, ['1fl', '2fl', '3fl']);

    const beamRows = Object.keys(parsed.beams)
      .filter(k => k !== '__meta' && k !== '0')
      .map(k => [parsed.beams[k][0], parsed.beams[k][1]]);
    assert.deepStrictEqual(beamRows, [['1fl', '2fl'], ['2fl', '3fl']]);

    const triRows = Object.keys(parsed.triangles)
      .filter(k => k !== '__meta' && k !== '0')
      .map(k => [parsed.triangles[k][0], parsed.triangles[k][1], parsed.triangles[k][2]]);
    assert.deepStrictEqual(triRows, [['1fl', '2fl', '3fl']]);

    console.log('✓ Test 4: Sequential cascading AST batch renaming passed.');
  }

  // Test 5: Symmetrical Bilateral Batch Renaming (X-Mirror)
  {
    const jbeam = `{
      "symmetric_part": {
        "nodes": [
          ["id", "posX", "posY", "posZ"],
          ["old_fl", -0.8, 1.2, 0.4],
          ["old_fr",  0.8, 1.2, 0.4]
        ],
        "beams": [
          ["id1:", "id2:"],
          ["old_fl", "old_fr"]
        ]
      }
    }`;

    // Renaming old_fl -> 1fl with symmetry = true should also rename old_fr -> 1fr
    const target = formatBatchNodeName('#fl', 1); // "1fl"
    const res = renameNodeLossless(jbeam, 'symmetric_part', 'old_fl', target, { symmetry: true });
    assert.strictEqual(res.error, null);

    const parsed = decodeWithMeta(res.updatedText, 'test.jbeam', false).data.symmetric_part;
    const nodeIds = Object.keys(parsed.nodes)
      .filter(k => k !== '__meta' && k !== '0')
      .map(k => parsed.nodes[k][0]);
    assert.ok(nodeIds.includes('1fl'), '1fl must exist');
    assert.ok(nodeIds.includes('1fr'), 'Mirrored counterpart 1fr must exist');

    // Check beam connection
    const beamRow = parsed.beams['1'];
    assert.ok(beamRow && (beamRow[0] === '1fl' || beamRow[1] === '1fl') && (beamRow[0] === '1fr' || beamRow[1] === '1fr'), 'Beam should connect [1fl, 1fr]');

    console.log('✓ Test 5: Symmetrical bilateral batch renaming (X-Mirror) passed.');
  }

  // Test 6: Enhanced Symmetry Resolution for Numbered Suffixes & Infixes
  {
    assert.strictEqual(getSymmetricNodeId('1fl'), '1fr');
    assert.strictEqual(getSymmetricNodeId('1fr'), '1fl');
    assert.strictEqual(getSymmetricNodeId('fl1'), 'fr1');
    assert.strictEqual(getSymmetricNodeId('fr1'), 'fl1');
    assert.strictEqual(getSymmetricNodeId('rl2'), 'rr2');
    assert.strictEqual(getSymmetricNodeId('node_1_l'), 'node_1_r');

    console.log('✓ Test 6: Enhanced symmetry resolution passed.');
  }

  console.log('All Batch Node Renamer tests passed!\n');
}
