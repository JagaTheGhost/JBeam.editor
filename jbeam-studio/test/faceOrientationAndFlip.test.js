/*
  JBeam Studio - Automated Test Suite: Face Orientation & Flip Normal Tool
  Validates:
  1. Lossless AST surface normal inversion for triangles ([A, B, C] -> [C, B, A])
  2. Lossless AST surface normal inversion for quads ([A, B, C, D] -> [D, C, B, A])
  3. Preservation of inline options ({"dragCoef": ...}) and surrounding comments
  4. Symmetrical bilateral surface normal inversion (X-Mirror)
  5. 3D Face Orientation rendering (Front blue / Back red) & normal vector arrows
*/

import assert from 'node:assert';
import { flipSurfaceLossless } from '../src/features/jbeam/astUpdater.js';
import { decodeWithMeta } from '../src/features/jbeam/sjsonParser.js';
import { processAllParts } from '../src/features/jbeam/tableSchema.js';
import { buildTrianglesGroup } from '../src/features/viewport/visualizers.js';

export function runFaceOrientationAndFlipTests() {
  console.log('--- Running Face Orientation & Flip Normal Tool Tests ---');

  // Test 1: Basic Triangle Normal Inversion ([A, B, C] -> [C, B, A])
  {
    const jbeam = `{
      "body_part": {
        "triangles": [
          ["id1:", "id2:", "id3:"],
          ["fl1", "fl2", "fl3"],
          ["rl1", "rl2", "rl3", {"dragCoef": 120}] // aerodynamic wing
        ]
      }
    }`;

    // Flip first triangle [fl1, fl2, fl3]
    const res1 = flipSurfaceLossless(jbeam, 'body_part', 'triangles', ['fl1', 'fl2', 'fl3']);
    assert.strictEqual(res1.error, null);
    assert.strictEqual(res1.flippedCount, 1);
    assert.ok(res1.updatedText.includes('["fl3", "fl2", "fl1"]'), 'Winding order must be reversed to [fl3, fl2, fl1]');
    assert.ok(!res1.updatedText.includes('["fl1", "fl2", "fl3"]'));

    // Flip triangle with inline options [rl1, rl2, rl3]
    const res2 = flipSurfaceLossless(res1.updatedText, 'body_part', 'triangles', ['rl1', 'rl2', 'rl3']);
    assert.strictEqual(res2.error, null);
    assert.strictEqual(res2.flippedCount, 1);
    assert.ok(res2.updatedText.includes('["rl3", "rl2", "rl1", {"dragCoef":120}]'));
    assert.ok(res2.updatedText.includes('// aerodynamic wing'), 'Trailing line comments must be 100% preserved');

    console.log('✓ Test 1: Basic triangle normal inversion with inline options & comments passed.');
  }

  // Test 2: Quad Normal Inversion ([A, B, C, D] -> [D, C, B, A])
  {
    const jbeam = `{
      "hood_part": {
        "quads": [
          ["id1:", "id2:", "id3:", "id4:"],
          ["h1", "h2", "h3", "h4"],
          ["roof1", "roof2", "roof3", "roof4", {"pressureGroup": "cabin"}]
        ]
      }
    }`;

    // Flip quad [h1, h2, h3, h4]
    const res = flipSurfaceLossless(jbeam, 'hood_part', 'quads', ['h1', 'h2', 'h3', 'h4']);
    assert.strictEqual(res.error, null);
    assert.strictEqual(res.flippedCount, 1);
    assert.ok(res.updatedText.includes('["h4", "h3", "h2", "h1"]'), 'Quad winding order reversed to [h4, h3, h2, h1]');

    // Flip quad with options
    const res2 = flipSurfaceLossless(res.updatedText, 'hood_part', 'quads', ['roof1', 'roof2', 'roof3', 'roof4']);
    assert.strictEqual(res2.error, null);
    assert.strictEqual(res2.flippedCount, 1);
    assert.ok(res2.updatedText.includes('["roof4", "roof3", "roof2", "roof1", {"pressureGroup":"cabin"}]'));

    console.log('✓ Test 2: Quad normal inversion passed.');
  }

  // Test 3: Symmetrical Bilateral Surface Normal Inversion (X-Mirror)
  {
    const jbeam = `{
      "door_part": {
        "triangles": [
          ["id1:", "id2:", "id3:"],
          ["door_1r", "door_2r", "door_3r"],
          ["door_1l", "door_2l", "door_3l"]
        ]
      }
    }`;

    // Flip right door triangle with symmetry: true
    const res = flipSurfaceLossless(jbeam, 'door_part', 'triangles', ['door_1r', 'door_2r', 'door_3r'], {
      symmetry: true
    });

    assert.strictEqual(res.error, null);
    assert.strictEqual(res.flippedCount, 2, 'Both mirrored triangles must be flipped in tandem');
    assert.ok(res.updatedText.includes('["door_3r", "door_2r", "door_1r"]'), 'Right door flipped');
    assert.ok(res.updatedText.includes('["door_3l", "door_2l", "door_1l"]'), 'Left door mirrored flipped');

    console.log('✓ Test 3: Symmetrical bilateral surface normal inversion passed.');
  }

  // Test 4: 3D Face Orientation & Normal Vector Arrows in Three.js Viewport
  {
    const nodes = {
      n1: { id: 'n1', pos: [0, 0, 0] },
      n2: { id: 'n2', pos: [1, 0, 0] },
      n3: { id: 'n3', pos: [0, 1, 0] },
      q1: { id: 'q1', pos: [1, 1, 0] },
      q2: { id: 'q2', pos: [2, 1, 0] },
      q3: { id: 'q3', pos: [2, 2, 0] },
      q4: { id: 'q4', pos: [1, 2, 0] }
    };

    const triangles = {
      tri1: { 'id1:': 'n1', 'id2:': 'n2', 'id3:': 'n3' }
    };

    const quads = {
      quad1: { 'id1:': 'q1', 'id2:': 'q2', 'id3:': 'q3', 'id4:': 'q4' }
    };

    // Build with Face Orientation: ON and Normals: ON
    const group = buildTrianglesGroup(triangles, nodes, quads, {
      faceOrientation: true,
      showNormals: true,
      selectedSurface: { type: 'triangle', nodes: ['n1', 'n2', 'n3'] }
    });

    // Check Blender Face Orientation meshes (front blue, back red)
    const frontMesh = group.children.find(c => c.name === 'triangles_surface_front');
    const backMesh = group.children.find(c => c.name === 'triangles_surface_back');
    assert.ok(frontMesh, 'Must have frontSide mesh for face orientation');
    assert.ok(backMesh, 'Must have backSide mesh for face orientation');
    assert.strictEqual(frontMesh.material.color.getHex(), 0x1d4ed8, 'Front side must be vibrant royal blue');
    assert.strictEqual(backMesh.material.color.getHex(), 0xdc2626, 'Back side must be alert red');

    // Check normal vector arrows
    const normalsMesh = group.children.find(c => c.name === 'surfaces_normals');
    assert.ok(normalsMesh, 'Must render surfaces_normals line segments');
    assert.strictEqual(normalsMesh.material.color.getHex(), 0x00e5ff, 'Normal arrows must be cyan');

    // Check selected surface golden highlight
    const selMesh = group.children.find(c => c.name === 'selected_surface_mesh');
    assert.ok(selMesh, 'Selected surface must have golden highlight mesh');
    assert.strictEqual(selMesh.material.color.getHex(), 0xffd54f, 'Golden highlight surface');

    // Verify surfaceLookup metadata attached to frontMesh for raycasting
    const lookup = frontMesh.userData.surfaceLookup;
    assert.ok(lookup && lookup.length === 3, '1 tri + 2 quad half-tris = 3 entries in surface lookup');
    assert.strictEqual(lookup[0].type, 'triangle');
    assert.strictEqual(lookup[1].type, 'quad');
    assert.strictEqual(lookup[2].type, 'quad');

    console.log('✓ Test 4: 3D face orientation & normal vector arrows in Three.js verified.');
  }

  console.log('✓ All Face Orientation & Flip Normal Tool tests passed!\n');
}

