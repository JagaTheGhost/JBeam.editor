import assert from 'assert';
import { generateVehicleModFiles, sanitizeVehicleId } from '../src/features/templates/vehicleTemplateGenerator.js';
import { decodeWithMeta } from '../src/features/jbeam/sjsonParser.js';
import { buildWorkspaceIndex } from '../src/features/assembly/vehicleIndexer.js';
import { resolveAssemblyTree, getActiveAssembledParts, buildCompositeVehicleData } from '../src/features/assembly/assemblyResolver.js';
import { validateJBeamDocument } from '../src/features/jbeam/jbeamValidator.js';
import { buildNodesGroup, buildBeamsGroup, buildTrianglesGroup } from '../src/features/viewport/visualizers.js';

export async function runVehicleTemplateAndScopingTests() {
  console.log('--- Running Vehicle Template Generator & Scoping Tests ---');

  // Test 1: Vehicle ID Sanitization
  assert.strictEqual(sanitizeVehicleId('My Cool Car!'), 'my_cool_car');
  assert.strictEqual(sanitizeVehicleId('  APEX-GT 2026_  '), 'apex_gt_2026');
  assert.strictEqual(sanitizeVehicleId(''), 'new_vehicle');
  console.log('✓ Test 1: Vehicle ID Sanitization passed.');

  // Test 2: Standard BeamNG Vehicle Mod Bundle Generation
  const modFiles = generateVehicleModFiles({
    vehicleId: 'thunder_v8',
    vehicleName: 'Thunder V8',
    author: 'TestDriver',
    archetype: 'unibody'
  });

  const expectedFiles = [
    'info.json',
    'main.materials.json',
    'default.pc',
    'thunder_v8.jbeam',
    'thunder_v8_body.jbeam',
    'thunder_v8_engine.jbeam',
    'thunder_v8_suspension_F.jbeam',
    'thunder_v8_suspension_R.jbeam'
  ];

  for (const exp of expectedFiles) {
    assert.ok(modFiles[exp], `Expected bundle to contain file ${exp}`);
  }

  const info = JSON.parse(modFiles['info.json']);
  assert.strictEqual(info.Name, 'Thunder V8');
  assert.strictEqual(info.Author, 'TestDriver');
  assert.strictEqual(info.default_pc, 'default');

  const pc = JSON.parse(modFiles['default.pc']);
  assert.strictEqual(pc.model, 'thunder_v8');
  assert.strictEqual(pc.mainPartName, 'thunder_v8');
  assert.strictEqual(pc.parts['thunder_v8_body'], 'thunder_v8_body');
  assert.strictEqual(pc.parts['thunder_v8_engine'], 'thunder_v8_engine');
  console.log('✓ Test 2: Standard BeamNG Vehicle Mod Bundle Generation passed.');

  // Test 3: Generated JBeam Files Parse Cleanly with SJSON Parser & Validate with 0 Errors
  const jbeamKeys = expectedFiles.filter(f => f.endsWith('.jbeam'));
  const workspacePayload = Object.keys(modFiles).map(name => ({
    path: `vehicles/thunder_v8/${name}`,
    content: modFiles[name]
  }));
  const index = buildWorkspaceIndex(workspacePayload);

  for (const k of jbeamKeys) {
    const parsed = decodeWithMeta(modFiles[k], k, false);
    assert.ok(parsed && parsed.data, `Failed to parse generated JBeam file: ${k}`);
    const partKeys = Object.keys(parsed.data).filter(p => p !== '__meta');
    assert.ok(partKeys.length > 0, `Expected at least one part defined in ${k}`);

    const valResult = validateJBeamDocument(modFiles[k], k, {
      assembledNodes: index.partsMap,
      nodeToPartMap: index.nodeToPartMap
    });
    assert.strictEqual(valResult.isValid, true, `Expected ${k} to be valid without syntax or table errors`);
    const errors = (valResult.problems || []).filter(p => p.severity === 'error');
    assert.strictEqual(errors.length, 0, `Expected 0 errors in ${k}, found: ${JSON.stringify(errors)}`);
  }
  console.log('✓ Test 3: Generated JBeam Files Parse Cleanly & Validate with 0 Errors passed.');

  // Test 4: Workspace Indexing, Assembly Tree Resolution, and 3D Viewport Scene Construction
  assert.strictEqual(index.configurations.length, 1);
  assert.strictEqual(index.configurations[0].fileName, 'default.pc');
  assert.strictEqual(index.rootParts.length, 1);
  assert.strictEqual(index.rootParts[0].partName, 'thunder_v8');

  const tree = resolveAssemblyTree(
    'thunder_v8',
    index.partsMap,
    index.slotTypeMap,
    index.configurations[0].parts
  );

  assert.ok(tree, 'Assembly tree should resolve successfully');
  assert.strictEqual(tree.partName, 'thunder_v8');
  assert.strictEqual(tree.slots.length, 4); // body, engine, suspension_F, suspension_R

  const activeParts = getActiveAssembledParts(tree, {});
  assert.strictEqual(activeParts.length, 5); // root + 4 children

  // Build composite vehicle parts & verify 3D scene groups build without errors
  const composite = await buildCompositeVehicleData(activeParts, async (p) => modFiles[p.split(/[\/\\]/).pop()]);
  const mergedNodes = {};
  const mergedBeams = {};
  const mergedTris = {};
  for (const pKey of Object.keys(composite).filter(k => k !== '__meta')) {
    const p = composite[pKey];
    if (p.nodes) Object.assign(mergedNodes, p.nodes);
    if (p.beams) Object.assign(mergedBeams, p.beams);
    if (p.triangles) Object.assign(mergedTris, p.triangles);
  }

  const cNodesGroup = buildNodesGroup(mergedNodes, null, 'part');
  const cBeamsGroup = buildBeamsGroup(mergedBeams, mergedNodes, null, 'part', {});
  const cTrisGroup = buildTrianglesGroup(mergedTris, mergedNodes, {}, {});
  assert.ok(cNodesGroup, 'Composite nodes group should build cleanly');
  assert.ok(cBeamsGroup, 'Composite beams group should build cleanly');
  assert.ok(cTrisGroup, 'Composite triangles group should build cleanly');
  console.log('✓ Test 4: Workspace Indexing, Assembly Tree Resolution & 3D Viewport Construction passed.');

  // Test 5: Scoping Verification - Empty folder / folder without .pc has configurations = []
  const emptyPayload = [
    { path: 'vehicle_frame.jbeam', content: '{"vehicle_frame": {"slotType": "main", "nodes": [["id", "posX", "posY", "posZ"], ["a", 0, 0, 0]]}}' }
  ];
  const emptyIndex = buildWorkspaceIndex(emptyPayload);
  assert.strictEqual(emptyIndex.configurations.length, 0, 'Configurations list must be strictly empty when no .pc files exist');
  assert.strictEqual(emptyIndex.rootParts.length, 1);
  console.log('✓ Test 5: Scoping Verification (empty folder / 0 .pc files) passed.');

  // Test 6: Legacy rx/ry/rz and posX/posY/posZ node coordinate robustness
  const legacyContent = `{
    "legacy_chassis": {
      "slotType": "main",
      "nodes": [
        ["id", "rx", "ry", "rz"],
        ["f1r", -0.85, 1.70, 0.28],
        ["f1l", 0.85, 1.70, 0.28]
      ],
      "beams": [
        ["id1:", "id2:"],
        ["f1r", "f1l"]
      ]
    }
  }`;
  const legacyPayload = [{ path: 'legacy_chassis.jbeam', content: legacyContent }];
  const legacyIndex = buildWorkspaceIndex(legacyPayload);
  const legacyTree = resolveAssemblyTree('legacy_chassis', legacyIndex.partsMap, legacyIndex.slotTypeMap, {});
  const legacyActive = getActiveAssembledParts(legacyTree, {});
  const legacyComp = await buildCompositeVehicleData(legacyActive, async () => legacyContent);
  const legacyPart = legacyComp.legacy_chassis;
  assert.ok(legacyPart, 'Legacy part should parse into composite vehicle');
  assert.strictEqual(legacyPart.nodes.f1r.posX, -0.85);
  assert.strictEqual(legacyPart.nodes.f1r.posY, 1.70);
  assert.strictEqual(legacyPart.nodes.f1r.posZ, 0.28);
  assert.deepStrictEqual(legacyPart.nodes.f1r.pos, [-0.85, 1.70, 0.28]);
  console.log('✓ Test 6: Legacy rx/ry/rz coordinate robustness passed.');

  console.log('All Vehicle Template Generator & Scoping tests passed successfully!');
}
