/*
  JBeam Studio - Automated Test Suite: Flexbody Node Group Association (Step 7)
  Validates:
  1. Node group extraction from inline modifiers ({"group": ...})
  2. Flexbody table schema extraction & normalization
  3. Bi-directional association (Flexbody -> Groups -> Nodes & Node -> Groups -> Flexbodies)
  4. 3D Viewport driver node highlighting (radiant cyan material & scale)
  5. Validator diagnostics: empty group detection & missing .dae submesh notice
  6. Real-world fixture verification from Blender-JBeam-Editor (square_donut)
*/

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decodeWithMeta } from '../src/features/jbeam/sjsonParser.js';
import { processAllParts } from '../src/features/jbeam/tableSchema.js';
import {
  normalizeGroups,
  getNodeGroups,
  matchesSubmeshName,
  extractPartFlexbodies,
  extractAllFlexbodies,
  buildNodeGroupIndex,
  resolveFlexbodyAssociations
} from '../src/features/jbeam/flexbodyUtils.js';
import { validateJBeamDocument } from '../src/features/jbeam/jbeamValidator.js';
import { buildNodesGroup } from '../src/features/viewport/visualizers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function extractFromZip(zipRelPath) {
  const zipPath = path.resolve(process.cwd(), '../Blender-JBeam-Editor-main.zip');
  if (!fs.existsSync(zipPath)) return null;
  const script = 'import zipfile, sys; z = zipfile.ZipFile(sys.argv[1]); sys.stdout.buffer.write(z.read(sys.argv[2]))';
  const out = execFileSync('python', ['-c', script, zipPath, zipRelPath], { maxBuffer: 10 * 1024 * 1024 });
  return out.toString('utf-8');
}

export function runFlexbodyAssociationTests() {
  console.log('--- Running Flexbody Association & Bi-directional Highlighting Tests ---');

  // Test 1: Group Normalization
  {
    assert.deepStrictEqual(normalizeGroups('cab_main'), ['cab_main']);
    assert.deepStrictEqual(normalizeGroups(['cab_main', 'cab_roof']), ['cab_main', 'cab_roof']);
    assert.deepStrictEqual(normalizeGroups(''), []);
    assert.deepStrictEqual(normalizeGroups([]), []);
    assert.deepStrictEqual(normalizeGroups(null), []);
    assert.deepStrictEqual(normalizeGroups(['  trimmed  ', '']), ['trimmed']);
    console.log('✓ Test 1: Group normalization passed.');
  }

  // Test 2: Submesh Name Matching
  {
    assert.strictEqual(matchesSubmeshName('percheron_cab', 'percheron_cab'), true, 'Exact match');
    assert.strictEqual(matchesSubmeshName('percheron_cab_lod0', 'percheron_cab'), true, 'LOD prefix match');
    assert.strictEqual(matchesSubmeshName('percheron_cab.001', 'percheron_cab'), true, 'Blender duplicate suffix match');
    assert.strictEqual(matchesSubmeshName('square_donut', '"square_donut"'), true, 'Quoted match');
    assert.strictEqual(matchesSubmeshName('other_mesh', 'percheron_cab'), false, 'Non-matching mesh');
    console.log('✓ Test 2: Submesh name matching passed.');
  }

  // Test 3: Synthetic Part Flexbody & Node Group Association
  {
    const jbeamText = `{
      "test_vehicle": {
        "nodes": [
          ["id", "posX", "posY", "posZ"],
          {"group": "body_shell"},
          ["b1", 0.5, 1.0, 0.5],
          ["b2", -0.5, 1.0, 0.5],
          {"group": ["body_shell", "roof_group"]},
          ["r1", 0.0, 1.0, 1.2],
          {"group": "chassis_group"},
          ["c1", 0.5, 0.0, 0.2],
          ["c2", -0.5, 0.0, 0.2],
          {"group": ""},
          ["orphan_node", 0.0, 0.0, 0.0]
        ],
        "flexbodies": [
          ["mesh", "[group]:", "nonFlexMaterials"],
          ["body_mesh", ["body_shell"]],
          ["roof_mesh", ["roof_group"]],
          ["chassis_mesh", ["chassis_group"]],
          ["ghost_mesh", ["non_existent_group"]]
        ]
      }
    }`;

    const bundle = decodeWithMeta(jbeamText, 'test.jbeam', true);
    assert.strictEqual(bundle.errors.length, 0);
    const [parts] = processAllParts(bundle.data);
    const part = parts.test_vehicle;

    // Node group extraction
    assert.deepStrictEqual(getNodeGroups(part.nodes.b1), ['body_shell']);
    assert.deepStrictEqual(getNodeGroups(part.nodes.r1), ['body_shell', 'roof_group']);
    assert.deepStrictEqual(getNodeGroups(part.nodes.c1), ['chassis_group']);
    assert.deepStrictEqual(getNodeGroups(part.nodes.orphan_node), []);

    // Resolve associations
    const resolved = resolveFlexbodyAssociations(parts, {
      daeSubmeshNames: ['body_mesh_lod0', 'roof_mesh', 'chassis_mesh']
    });

    assert.strictEqual(resolved.flexbodies.length, 4);

    // Body mesh should be bound to b1, b2, and r1 (3 nodes)
    const bodyFb = resolved.flexbodies.find(f => f.meshName === 'body_mesh');
    assert.ok(bodyFb);
    assert.strictEqual(bodyFb.nodeCount, 3);
    assert.ok(bodyFb.boundNodeIds.includes('b1'));
    assert.ok(bodyFb.boundNodeIds.includes('b2'));
    assert.ok(bodyFb.boundNodeIds.includes('r1'));
    assert.strictEqual(bodyFb.isMatchedInDae, true, 'Matches body_mesh_lod0');

    // Roof mesh should be bound to r1 (1 node)
    const roofFb = resolved.flexbodies.find(f => f.meshName === 'roof_mesh');
    assert.ok(roofFb);
    assert.strictEqual(roofFb.nodeCount, 1);
    assert.deepStrictEqual(roofFb.boundNodeIds, ['r1']);

    // Chassis mesh should be bound to c1, c2 (2 nodes)
    const chassisFb = resolved.flexbodies.find(f => f.meshName === 'chassis_mesh');
    assert.ok(chassisFb);
    assert.strictEqual(chassisFb.nodeCount, 2);

    // Ghost mesh has 0 nodes
    const ghostFb = resolved.flexbodies.find(f => f.meshName === 'ghost_mesh');
    assert.ok(ghostFb);
    assert.strictEqual(ghostFb.nodeCount, 0);
    assert.strictEqual(ghostFb.hasZeroNodes, true);
    assert.strictEqual(ghostFb.isMatchedInDae, false);

    // Reverse lookup: r1 should drive both body_mesh and roof_mesh
    const r1Flexbodies = resolved.getFlexbodiesForNode('r1');
    assert.strictEqual(r1Flexbodies.length, 2);
    const r1MeshNames = r1Flexbodies.map(f => f.meshName).sort();
    assert.deepStrictEqual(r1MeshNames, ['body_mesh', 'roof_mesh']);

    // Helper getBoundNodesForMesh
    const boundForRoof = resolved.getBoundNodesForMesh('roof_mesh');
    assert.deepStrictEqual(boundForRoof, ['r1']);

    console.log('✓ Test 3: Synthetic part flexbody & node group association passed.');
  }

  // Test 4: 3D Node Highlighting in Three.js Scene Construction
  {
    const nodes = {
      n1: { id: 'n1', pos: [0, 0, 0] },
      n2: { id: 'n2', pos: [1, 0, 0] },
      n3: { id: 'n3', pos: [2, 0, 0] }
    };

    // Highlight n2 only
    const highlightedSet = new Set(['n2']);
    const group = buildNodesGroup(nodes, null, 'type', highlightedSet);

    const meshN1 = group.children.find(c => c.userData.id === 'n1');
    const meshN2 = group.children.find(c => c.userData.id === 'n2');
    const meshN3 = group.children.find(c => c.userData.id === 'n3');

    assert.ok(meshN1 && meshN2 && meshN3);
    assert.strictEqual(meshN1.userData.isHighlighted, false);
    assert.strictEqual(meshN2.userData.isHighlighted, true);
    assert.strictEqual(meshN3.userData.isHighlighted, false);

    // Highlighted node should have cyan color (0x00e5ff) and scaled up (1.35)
    assert.strictEqual(meshN2.material.color.getHex(), 0x00e5ff);
    assert.strictEqual(Number(meshN2.scale.x.toFixed(2)), 1.35);

    // Selected node takes priority over highlighted
    const groupWithSelect = buildNodesGroup(nodes, 'n2', 'type', highlightedSet);
    const meshN2Selected = groupWithSelect.children.find(c => c.userData.id === 'n2');
    assert.strictEqual(meshN2Selected.material.color.getHex(), 0xffeb3b, 'Selection gold takes priority');
    assert.strictEqual(Number(meshN2Selected.scale.x.toFixed(2)), 1.5);

    console.log('✓ Test 4: 3D node highlighting in visualizers passed.');
  }

  // Test 5: Validator Diagnostics for Flexbodies
  {
    const brokenJBeam = `{
      "invalid_flexbody_part": {
        "nodes": [
          ["id", "posX", "posY", "posZ"],
          {"group": "valid_group"},
          ["v1", 0, 0, 0],
          ["v2", 1, 0, 0]
        ],
        "flexbodies": [
          ["mesh", "[group]:", "nonFlexMaterials"],
          ["good_panel", ["valid_group"]],
          ["broken_panel", ["typoed_group_does_not_exist"]],
          ["missing_3d_panel", ["valid_group"]]
        ]
      }
    }`;

    // Pass daeSubmeshNames containing only good_panel and broken_panel
    const valResult = validateJBeamDocument(brokenJBeam, 'test_flexbody.jbeam', {
      daeSubmeshNames: ['good_panel', 'broken_panel'],
      daeFileName: 'truck.dae'
    });

    const messages = valResult.problems.map(p => p.message);

    // Check empty group warning
    const emptyGrpWarning = messages.find(m => m.includes('typoed_group_does_not_exist') && m.includes('0 defined nodes'));
    assert.ok(emptyGrpWarning, 'Must identify 0 defined nodes for broken_panel flexbody');

    // Check missing mesh info
    const missingMeshInfo = messages.find(m => m.includes('missing_3d_panel') && m.includes('not found in loaded 3D visual model'));
    assert.ok(missingMeshInfo, 'Must identify missing_3d_panel in .dae');

    // good_panel should not have warnings or errors
    assert.ok(!messages.some(m => m.includes('good_panel')), 'good_panel must not produce problems');

    console.log('✓ Test 5: Flexbody validator diagnostics passed.');
  }

  // Test 6: Real-World Vehicle Mod Fixture (Square Donut from Blender-JBeam-Editor)
  {
    const squareDonutJBeam = extractFromZip(
      'Blender-JBeam-Editor-main/tests/jbeam_import_modify_export/vehicles/square_donut/square_donut.jbeam'
    );
    const meshesJBeam = extractFromZip(
      'Blender-JBeam-Editor-main/tests/jbeam_import_modify_export/vehicles/square_donut/square_donut_meshes.jbeam'
    );

    if (squareDonutJBeam && meshesJBeam) {
      const parsedDonut = decodeWithMeta(squareDonutJBeam, 'square_donut.jbeam', true);
      const parsedMeshes = decodeWithMeta(meshesJBeam, 'square_donut_meshes.jbeam', true);

      const [donutParts] = processAllParts(parsedDonut.data);
      const [meshParts] = processAllParts(parsedMeshes.data);

      const combinedParts = {
        square_donut: donutParts.square_donut,
        square_donut_mesh: meshParts.square_donut_mesh
      };

      const resolved = resolveFlexbodyAssociations(combinedParts, {
        daeSubmeshNames: ['square_donut']
      });

      const donutFb = resolved.flexbodies.find(f => f.meshName === 'square_donut');
      assert.ok(donutFb, 'Flexbody square_donut must be found');
      assert.strictEqual(donutFb.isMatchedInDae, true, 'Matches .dae square_donut');
      assert.strictEqual(donutFb.nodeCount, 32, 'Square donut mesh should be bound to all 32 donut nodes');

      // Check reverse binding on nl0
      const nl0Fbs = resolved.getFlexbodiesForNode('nl0');
      assert.strictEqual(nl0Fbs.length, 1);
      assert.strictEqual(nl0Fbs[0].meshName, 'square_donut');

      console.log('✓ Test 6: Square Donut golden vehicle flexbody association verified (32/32 nodes bound).');
    } else {
      console.log('  (Skipping archive fixture - zip not found at path)');
    }
  }

  // Test 7: Real Vehicle Mod Percheron Cab (if present)
  {
    const percheronCabPath = path.resolve(__dirname, '../../percheron/vehicles/percheron/jbeams/body/percheron_cab_L.jbeam');
    if (fs.existsSync(percheronCabPath)) {
      const cabContent = fs.readFileSync(percheronCabPath, 'utf-8');
      const cabBundle = decodeWithMeta(cabContent, 'percheron_cab_L.jbeam', true);
      const [cabParts] = processAllParts(cabBundle.data);

      const resolved = resolveFlexbodyAssociations(cabParts, {
        daeSubmeshNames: ['percheron_cab', 'percheron_cab_glass']
      });

      assert.ok(resolved.flexbodies.length >= 1, 'Percheron cab should have flexbodies');
      const mainCabFb = resolved.flexbodies.find(f => f.meshName === 'percheron_cab');
      if (mainCabFb) {
        assert.ok(mainCabFb.nodeCount >= 70, `Percheron cab should have ~89 bound nodes (got ${mainCabFb.nodeCount})`);
        assert.strictEqual(mainCabFb.isMatchedInDae, true);
        console.log(`  Parsed Percheron Cab flexbody: ${mainCabFb.nodeCount} bound nodes.`);
      }
      console.log('✓ Test 7: Percheron Cab real vehicle flexbody association verified.');
    }
  }

  console.log('✓ All Flexbody Association & Bi-directional Highlighting tests passed!\n');
}
