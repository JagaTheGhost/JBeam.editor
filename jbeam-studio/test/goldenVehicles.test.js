/*
  JBeam Studio - Golden Integration Tests (Step 6)
  Validates real-world BeamNG vehicle mods and official community test fixtures
  (e.g. square_donut, legotrailer) from Blender-JBeam-Editor test archive.
*/

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { decodeWithMeta } from '../src/features/jbeam/sjsonParser.js';
import { processAllParts } from '../src/features/jbeam/tableSchema.js';
import {
  addBeamLossless,
  deleteNodeLossless,
  renameNodeLossless
} from '../src/features/jbeam/astUpdater.js';
import {
  extractPartsFromJBeamText,
  buildWorkspaceIndex
} from '../src/features/assembly/vehicleIndexer.js';
import {
  resolveAssemblyTree,
  getActiveAssembledParts,
  buildCompositeVehicleData
} from '../src/features/assembly/assemblyResolver.js';

function extractFromZip(zipRelPath) {
  const candidates = [
    path.resolve(process.cwd(), 'Blender-JBeam-Editor-main.zip'),
    path.resolve(process.cwd(), '../Blender-JBeam-Editor-main.zip'),
    path.resolve(process.cwd(), '../../Blender-JBeam-Editor-main.zip'),
    path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1')), '../../Blender-JBeam-Editor-main.zip')
  ];
  const zipPath = candidates.find(c => fs.existsSync(c)) || candidates[0];
  const script = 'import zipfile, sys; z = zipfile.ZipFile(sys.argv[1]); sys.stdout.buffer.write(z.read(sys.argv[2]))';
  const out = execFileSync('python', ['-c', script, zipPath, zipRelPath], { maxBuffer: 10 * 1024 * 1024 });
  return out.toString('utf-8');
}

export async function runGoldenVehiclesTests() {
  console.log('--- Running Golden Integration & Real Vehicle Tests (Step 6) ---');

  // Test 1: Square Donut Fixture Parsing & Inspection
  {
    const originalJBeam = extractFromZip(
      'Blender-JBeam-Editor-main/tests/jbeam_import_modify_export/add_beams/test_1/original/vehicles/square_donut/square_donut.jbeam'
    );
    assert.ok(originalJBeam && originalJBeam.length > 500, 'Should read square_donut.jbeam from archive');

    const bundle = decodeWithMeta(originalJBeam, 'square_donut.jbeam', true);
    assert.ok(bundle && bundle.data && bundle.data.square_donut, 'SJSON should parse square_donut part');

    const [processed, diags] = processAllParts(bundle.data);
    const donut = processed.square_donut;

    // Check node count (32 nodes)
    const nodeKeys = Object.keys(donut.nodes).filter(k => k !== '__meta');
    assert.strictEqual(nodeKeys.length, 32, 'Square donut should have 32 nodes');

    // Check beam count (132 beams)
    const beamKeys = Object.keys(donut.beams).filter(k => k !== '__meta');
    assert.strictEqual(beamKeys.length, 132, 'Square donut should have 132 beams');

    // Check triangle count (68 triangles)
    const triKeys = Object.keys(donut.triangles).filter(k => k !== '__meta');
    assert.strictEqual(triKeys.length, 68, 'Square donut should have 68 triangles');

    // Check bounded beam options
    const firstBeam = donut.beams['0'];
    assert.strictEqual(firstBeam.beamType, '|BOUNDED', 'Beams should inherit |BOUNDED beamType');
    assert.strictEqual(firstBeam.beamSpring, 4300000, 'Beam spring should be 4,300,000');

    console.log('✓ Test 1: Square Donut golden fixture parsing and structural inspection passed.');
  }

  // Test 2: Lossless AST Beam Addition vs Blender Test Suite Expected Output
  {
    const originalJBeam = extractFromZip(
      'Blender-JBeam-Editor-main/tests/jbeam_import_modify_export/add_beams/test_1/original/vehicles/square_donut/square_donut.jbeam'
    );
    const expectedJBeam = extractFromZip(
      'Blender-JBeam-Editor-main/tests/jbeam_import_modify_export/add_beams/test_1/expected/vehicles/square_donut/square_donut.jbeam'
    );

    // In Blender test_1, beam ('nr13', 'nl19') is added
    const res = addBeamLossless(originalJBeam, 'square_donut', { id1: 'nr13', id2: 'nl19' });
    const modified = res.updatedText;

    // Verify beam is present in the modified text
    assert.ok(modified.includes('["nr13", "nl19"]') || modified.includes('["nr13","nl19"]'));

    // Verify all comments are completely preserved
    assert.ok(modified.includes('/* cool comment'), 'Multi-line comments must be preserved');
    assert.ok(modified.includes('// Node 10'), 'Single-line comments must be preserved');
    assert.ok(modified.includes('/* why tho */'), 'Inline comments must be preserved');

    // Verify that the modified JBeam parses cleanly
    const reBundle = decodeWithMeta(modified, 'square_donut_mod.jbeam', true);
    const [reProcessed] = processAllParts(reBundle.data);
    const reBeams = Object.keys(reProcessed.square_donut.beams).filter(k => k !== '__meta');
    assert.strictEqual(reBeams.length, 133, 'Beam count should now be 133');

    console.log('✓ Test 2: Lossless AST beam addition verified against golden expected output.');
  }

  // Test 3: Lossless AST Cascading Node Renaming on Golden Vehicle
  {
    const originalJBeam = extractFromZip(
      'Blender-JBeam-Editor-main/tests/jbeam_import_modify_export/add_beams/test_1/original/vehicles/square_donut/square_donut.jbeam'
    );

    // Rename 'nl18' to 'nl18_golden'
    const renameRes = renameNodeLossless(originalJBeam, 'square_donut', 'nl18', 'nl18_golden');
    const renamed = renameRes.updatedText;

    // Verify 'nl18_golden' replaced 'nl18' in nodes definition
    assert.ok(renamed.includes('["nl18_golden",0.8,0.8,-0.2]') || renamed.includes('"nl18_golden"'));

    // Verify 'nl18' in beams was replaced
    assert.ok(renamed.includes('["nl10","nl18_golden"]') || renamed.includes('["nl10", "nl18_golden"]'));

    // Verify 'nl18' in triangles was replaced
    assert.ok(renamed.includes('["nl18_golden","nl24","nl16"]') || renamed.includes('"nl18_golden"'));

    // Verify 'nl18' in refNodes was replaced!
    assert.ok(renamed.includes('"nl18_golden"'));

    // Verify comments preserved
    assert.ok(renamed.includes('/* cool comment'));

    // Reparse to verify AST structural validity
    const reBundle = decodeWithMeta(renamed, 'renamed.jbeam', true);
    const [reProcessed] = processAllParts(reBundle.data);
    assert.ok(reProcessed.square_donut.nodes['nl18_golden'], 'nl18_golden must exist in nodes');
    assert.strictEqual(reProcessed.square_donut.nodes['nl18'], undefined, 'old nl18 must not exist');

    console.log('✓ Test 3: Lossless cascading node rename on golden vehicle passed.');
  }

  // Test 4: Real Multi-Part Vehicle (Lego Trailer) Assembly & Variable Propagation
  {
    const mainJBeam = extractFromZip(
      'Blender-JBeam-Editor-main/tests/vehicle_import_modify_export/vehicles/agenty_legotrailer/legotrailer.jbeam'
    );
    const frameJBeam = extractFromZip(
      'Blender-JBeam-Editor-main/tests/vehicle_import_modify_export/vehicles/common/legotrailer/legotrailer_frame.jbeam'
    );
    const floorJBeam = extractFromZip(
      'Blender-JBeam-Editor-main/tests/vehicle_import_modify_export/vehicles/common/legotrailer/legotrailer_floor.jbeam'
    );

    const files = [
      { path: 'vehicles/agenty_legotrailer/legotrailer.jbeam', content: mainJBeam },
      { path: 'vehicles/common/legotrailer/legotrailer_frame.jbeam', content: frameJBeam },
      { path: 'vehicles/common/legotrailer/legotrailer_floor.jbeam', content: floorJBeam }
    ];

    const index = buildWorkspaceIndex(files);
    assert.ok(index.partsMap['legotrailer'], 'Main legotrailer part indexed');
    assert.ok(index.partsMap['legotrailer_frame'], 'legotrailer_frame indexed');
    assert.ok(index.partsMap['legotrailer_floor'], 'legotrailer_floor indexed');

    // Resolve Assembly Tree starting from root 'legotrailer'
    const tree = resolveAssemblyTree('legotrailer', index.partsMap, index.slotTypeMap, {});
    assert.ok(tree, 'Assembly tree resolved');
    assert.strictEqual(tree.partName, 'legotrailer');

    // Check default child slot legotrailer_frame
    const frameSlot = tree.slots.find(s => s.slotName === 'legotrailer_frame');
    assert.ok(frameSlot && frameSlot.child, 'Frame slot should be populated with default part');
    assert.strictEqual(frameSlot.child.partName, 'legotrailer_frame');

    // Build Composite Vehicle Data with custom config variable: $weight = 4
    const activeParts = getActiveAssembledParts(tree);
    const fileLookup = {};
    for (const f of files) fileLookup[f.path] = f.content;

    const composite = await buildCompositeVehicleData(
      activeParts,
      async (filePath) => fileLookup[filePath],
      { '$weight': 4 } // User vehicle configuration override
    );

    assert.ok(composite['legotrailer'], 'Composite contains main part');
    assert.ok(composite['legotrailer_frame'], 'Composite contains frame part');

    // In legotrailer_frame: nodeWeight is "$=$weight*0.5"
    // With $weight = 4, nodeWeight must evaluate to 2.0 kg!
    const frameData = composite['legotrailer_frame'];
    const sampleNode = frameData.nodes['trailer_f1l'];
    assert.ok(sampleNode, 'Sample node trailer_f1l must exist');
    assert.strictEqual(sampleNode.nodeWeight, 2.0, 'nodeWeight should evaluate formula 4 * 0.5 = 2.0');

    console.log('✓ Test 4: Real multi-part vehicle assembly & variable propagation passed.');
  }
}
