import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateJBeamDocument } from '../src/features/jbeam/jbeamValidator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function runValidatorTests() {
  console.log('--- Running Validator Tests ---');

  // Test 1: Valid sample project
  const validPath = path.resolve(__dirname, '../sample-project/vehicle_frame.jbeam');
  const validContent = fs.readFileSync(validPath, 'utf-8');
  const validResult = validateJBeamDocument(validContent, 'vehicle_frame.jbeam');

  assert.strictEqual(validResult.isValid, true, 'vehicle_frame.jbeam should be valid');
  const errorProblems = validResult.problems.filter(p => p.severity === 'error');
  assert.strictEqual(errorProblems.length, 0, 'vehicle_frame.jbeam should have zero errors');
  assert.ok(validResult.parts.vehicle_frame, 'vehicle_frame part must be parsed');
  assert.ok(validResult.parts.vehicle_frame.nodes, 'nodes must exist');
  assert.ok(validResult.parts.vehicle_frame.beams, 'beams must exist');
  assert.ok(validResult.parts.vehicle_frame.triangles, 'triangles must exist');

  // Test 2: Malformed sample project
  const malformedPath = path.resolve(__dirname, '../sample-project/malformed_test.jbeam');
  const malformedContent = fs.readFileSync(malformedPath, 'utf-8');
  const malformedResult = validateJBeamDocument(malformedContent, 'malformed_test.jbeam');

  assert.strictEqual(malformedResult.isValid, false, 'malformed_test.jbeam should fail validation');
  assert.ok(malformedResult.problems.length >= 4, 'Should identify multiple problems');

  const messages = malformedResult.problems.map(p => p.message);

  // Check duplicate node ID warning
  assert.ok(
    messages.some(m => m.includes('Duplicate node ID "node_a"')),
    'Must identify duplicate node ID'
  );

  // Check invalid non-numeric coordinate
  assert.ok(
    messages.some(m => m.includes('invalid non-numeric coordinates')),
    'Must identify non-numeric coordinate'
  );

  // Check missing beam node reference
  assert.ok(
    messages.some(m => m.includes('references non-existent node "ghost_node_1"')),
    'Must identify beam reference to missing node'
  );

  // Check degenerate triangle
  assert.ok(
    messages.some(m => m.includes('Degenerate triangle')),
    'Must identify degenerate triangle'
  );

  // Check cross-part inter-part reference resolution
  const testPartJBeam = `{
    "sub_part": {
      "nodes": [
        ["id", "posX", "posY", "posZ"],
        ["sub_n1", 0, 1, 0]
      ],
      "beams": [
        ["id1:", "id2:"],
        ["sub_n1", "chassis_n1"]
      ]
    }
  }`;

  // 1. Without workspace index: flags as reference warning (inter-part candidate)
  const unindexedRes = validateJBeamDocument(testPartJBeam, 'sub_part.jbeam');
  assert.strictEqual(unindexedRes.problems.filter(p => p.severity === 'error').length, 0);
  assert.ok(unindexedRes.problems.some(p => p.message.includes('chassis_n1') && p.severity === 'warning'));

  // 2. With workspace index: resolves chassis_n1 to its owner part as an info notice
  const indexedRes = validateJBeamDocument(testPartJBeam, 'sub_part.jbeam', {
    workspaceIndex: {
      nodeToPartMap: { chassis_n1: 'main_chassis' }
    }
  });
  assert.strictEqual(indexedRes.problems.filter(p => p.severity === 'error').length, 0);
  assert.strictEqual(indexedRes.problems.filter(p => p.severity === 'warning').length, 0);
  assert.ok(indexedRes.problems.some(p => p.source === 'Inter-Part' && p.message.includes('main_chassis')));

  console.log('✓ Validation diagnostics tests passed!');
}

