import assert from 'assert';
import {
  extractSubmeshesFromDae,
  categorizeSubmesh,
  generateScaffoldingFromDae
} from '../src/features/templates/daeScaffoldingGenerator.js';
import { decodeWithMeta } from '../src/features/jbeam/sjsonParser.js';
import { processAllParts } from '../src/features/jbeam/tableSchema.js';

const SAMPLE_COLLADA_DAE = `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset>
    <unit name="meter" meter="1"/>
    <up_axis>Z_UP</up_axis>
  </asset>
  <library_geometries>
    <geometry id="chassis_frame-mesh" name="chassis_frame">
      <mesh>
        <source id="chassis-positions">
          <float_array id="chassis-positions-array" count="12">-1 -2 0  1 -2 0  -1 2 0  1 2 0</float_array>
        </source>
      </mesh>
    </geometry>
    <geometry id="hood-mesh" name="hood">
      <mesh>
        <source id="hood-positions">
          <float_array id="hood-positions-array" count="12">-0.8 -1.5 0.8  0.8 -1.5 0.8  -0.8 -0.5 0.9  0.8 -0.5 0.9</float_array>
        </source>
      </mesh>
    </geometry>
    <geometry id="door_FL-mesh" name="door_FL">
      <mesh>
        <source id="door_fl-positions">
          <float_array id="door_fl-positions-array" count="12">-0.9 -0.5 0.4  -0.9 0.5 0.4  -0.9 -0.5 1.1  -0.9 0.5 1.1</float_array>
        </source>
      </mesh>
    </geometry>
    <geometry id="door_FR-mesh" name="door_FR">
      <mesh>
        <source id="door_fr-positions">
          <float_array id="door_fr-positions-array" count="12">0.9 -0.5 0.4  0.9 0.5 0.4  0.9 -0.5 1.1  0.9 0.5 1.1</float_array>
        </source>
      </mesh>
    </geometry>
    <geometry id="bumper_F-mesh" name="bumper_F">
      <mesh>
        <source id="bumper_f-positions">
          <float_array id="bumper_f-positions-array" count="12">-0.9 -2.2 0.3  0.9 -2.2 0.3  -0.9 -2.2 0.6  0.9 -2.2 0.6</float_array>
        </source>
      </mesh>
    </geometry>
    <geometry id="windshield_glass-mesh" name="windshield_glass">
      <mesh>
        <source id="glass-positions">
          <float_array id="glass-positions-array" count="12">-0.7 -0.5 0.9  0.7 -0.5 0.9  -0.6 0.2 1.3  0.6 0.2 1.3</float_array>
        </source>
      </mesh>
    </geometry>
  </library_geometries>
</COLLADA>`;

export function runDaeScaffoldingTests() {
  console.log('--- Running DAE Scaffolding Generator Tests ---');

  // Test 1: Submesh Extraction from Collada XML
  const submeshes = extractSubmeshesFromDae(SAMPLE_COLLADA_DAE);
  assert.strictEqual(submeshes.length, 6, `Expected 6 submeshes, got ${submeshes.length}`);
  
  const names = submeshes.map(s => s.name);
  assert.ok(names.includes('chassis_frame'), 'Should extract chassis_frame');
  assert.ok(names.includes('hood'), 'Should extract hood');
  assert.ok(names.includes('door_FL'), 'Should extract door_FL');
  assert.ok(names.includes('door_FR'), 'Should extract door_FR');
  assert.ok(names.includes('bumper_F'), 'Should extract bumper_F');
  assert.ok(names.includes('windshield_glass'), 'Should extract windshield_glass');
  console.log('✓ Test 1: Submesh extraction from Collada XML passed.');

  // Test 2: Category and Root Recognition
  const chassisCat = categorizeSubmesh('chassis_frame');
  assert.strictEqual(chassisCat.category, 'frame');
  assert.strictEqual(chassisCat.isRootCandidate, true);
  assert.strictEqual(chassisCat.isDetachable, false);

  const hoodCat = categorizeSubmesh('hood');
  assert.strictEqual(hoodCat.category, 'hood');
  assert.strictEqual(hoodCat.isDetachable, true);

  const doorFlCat = categorizeSubmesh('door_FL');
  assert.strictEqual(doorFlCat.category, 'door_fl');
  assert.strictEqual(doorFlCat.isDetachable, true);

  const bumperCat = categorizeSubmesh('bumper_F');
  assert.strictEqual(bumperCat.category, 'bumper_f');
  assert.strictEqual(bumperCat.isDetachable, true);
  console.log('✓ Test 2: Submesh categorization and automotive metadata passed.');

  // Test 3: Full Scaffolding Generation
  const result = generateScaffoldingFromDae({
    daeContent: SAMPLE_COLLADA_DAE,
    daeFileName: 'hyperion.dae',
    vehicleId: 'hyperion',
    vehicleName: 'Hyperion GT',
    author: 'BeamMaster',
    rootMeshName: 'chassis_frame'
  });

  assert.ok(result.files, 'Should return generated files map');
  assert.strictEqual(result.submeshCount, 6);
  assert.strictEqual(result.slotsCount, 5); // 6 minus root

  // Verify core files exist
  assert.ok(result.files['hyperion.jbeam'], 'Must generate main chassis slot jbeam');
  assert.ok(result.files['hyperion_body.jbeam'], 'Must generate body shell with child slots');
  assert.ok(result.files['default.pc'], 'Must generate default.pc configuration');
  assert.ok(result.files['info.json'], 'Must generate info.json');

  // Verify child part files (neatly placed in parts/ subfolder)
  assert.ok(result.files['parts/hyperion_hood.jbeam'], 'Must generate parts/hyperion_hood.jbeam');
  assert.ok(result.files['parts/hyperion_door_FL.jbeam'], 'Must generate parts/hyperion_door_FL.jbeam');
  assert.ok(result.files['parts/hyperion_door_FR.jbeam'], 'Must generate parts/hyperion_door_FR.jbeam');
  assert.ok(result.files['parts/hyperion_bumper_F.jbeam'], 'Must generate parts/hyperion_bumper_F.jbeam');
  assert.ok(result.files['parts/hyperion_windshield_glass.jbeam'], 'Must generate parts/hyperion_windshield_glass.jbeam');
  console.log('✓ Test 3: Full modular scaffolding file tree generation passed.');

  // Test 4: Flexbody Bindings & Parse Cleanliness
  // Verify hood file flexbody binding
  const hoodJBeam = result.files['parts/hyperion_hood.jbeam'];
  assert.ok(hoodJBeam.includes('["hood", ["hyperion_hood"]]'), 'Hood file must bind exact submesh name "hood"');
  
  // Parse with official parser
  const rawDecoded = decodeWithMeta(hoodJBeam).data;
  const rawHood = rawDecoded['hyperion_hood'];
  assert.ok(rawHood, 'Hood jbeam must parse into valid AST');
  assert.strictEqual(rawHood.slotType, 'hyperion_hood');
  assert.strictEqual(rawHood.flexbodies[1][0], 'hood');
  assert.strictEqual(rawHood.flexbodies[1][1][0], 'hyperion_hood');

  const [parsedData, diag] = processAllParts(rawDecoded);
  const parsedHood = parsedData['hyperion_hood'];
  assert.ok(parsedHood, 'Hood jbeam must process cleanly through tableSchema');
  assert.strictEqual(parsedHood.options.slotType, 'hyperion_hood');
  assert.strictEqual(diag.length, 0, 'Must have 0 schema errors');

  // Verify root body file flexbody binding & slots table
  const bodyJBeam = result.files['hyperion_body.jbeam'];
  assert.ok(bodyJBeam.includes('"slots": ['), 'Must use valid "slots" table (not "slots2")');
  assert.ok(!bodyJBeam.includes('"slots2":'), 'Must NOT contain invalid "slots2"');
  assert.ok(bodyJBeam.includes('["chassis_frame", ["hyperion_body"]]'), 'Body file must bind root submesh');
  const [parsedBodyData, bodyDiag] = processAllParts(decodeWithMeta(bodyJBeam).data);
  assert.ok(parsedBodyData['hyperion_body'], 'Body jbeam must parse into valid AST');
  assert.strictEqual(bodyDiag.length, 0, 'Body JBeam must have 0 TableSchema validation errors');
  console.log('✓ Test 4: Exact flexbody bindings and JBeam syntax cleanliness passed.');

  // Test 5: default.pc slot assignments
  const pc = JSON.parse(result.files['default.pc']);
  assert.strictEqual(pc.model, 'hyperion');
  assert.strictEqual(pc.parts['hyperion_body'], 'hyperion_body');
  assert.strictEqual(pc.parts['hyperion_hood'], 'hyperion_hood');
  assert.strictEqual(pc.parts['hyperion_door_FL'], 'hyperion_door_FL');
  assert.strictEqual(pc.parts['hyperion_bumper_F'], 'hyperion_bumper_F');
  assert.ok(Array.isArray(pc.paints) && pc.paints.length > 0, 'Must include default paint setup');
  console.log('✓ Test 5: default.pc configuration integrity passed.');

  // Test 6: Percheron-style High-Submesh (700 meshes) Clustering & Consolidation
  const syntheticPercheronDae = `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <library_geometries>
    <geometry id="percheron_midlift_steering-mesh" name="percheron_midlift_steering"><mesh/></geometry>
    <geometry id="Mesh-mesh" name="Mesh"><mesh/></geometry>
    ${Array.from({ length: 50 }, (_, i) => `<geometry id="Mesh_${i}-mesh" name="Mesh_${i}"><mesh/></geometry>`).join('\n    ')}
    ${Array.from({ length: 20 }, (_, i) => `<geometry id="Cylinder_${i}-mesh" name="Cylinder_${i}"><mesh/></geometry>`).join('\n    ')}
  </library_geometries>
</COLLADA>`;

  const percheronResult = generateScaffoldingFromDae({
    daeContent: syntheticPercheronDae,
    daeFileName: 'percheron.dae',
    vehicleId: 'percheron',
    vehicleName: 'Percheron',
    author: 'JagaTheGhost',
    rootMeshName: 'Mesh'
  });

  // Should NOT generate 72 separate .jbeam files!
  // It must consolidate the 70 generic fragments into percheron_body flexbodies
  // and only generate: percheron.jbeam, percheron_body.jbeam, parts/percheron_midlift_steering.jbeam, default.pc, info.json
  const fileKeys = Object.keys(percheronResult.files);
  assert.ok(fileKeys.includes('percheron.jbeam'));
  assert.ok(fileKeys.includes('percheron_body.jbeam'));
  assert.ok(fileKeys.includes('parts/percheron_percheron_midlift_steering.jbeam') || fileKeys.includes('parts/percheron_midlift_steering.jbeam'));
  assert.ok(fileKeys.length <= 6, `Expected ~5 clean files, got ${fileKeys.length}`);

  // Verify all 71 body-bound meshes are listed in percheron_body.jbeam
  const bodyText = percheronResult.files['percheron_body.jbeam'];
  assert.ok(bodyText.includes('"Mesh_0"'));
  assert.ok(bodyText.includes('"Cylinder_0"'));
  assert.ok(!bodyText.includes('"slots2":'));
  const [perchBodyData, perchDiag] = processAllParts(decodeWithMeta(bodyText).data);
  assert.strictEqual(perchDiag.length, 0, 'Percheron body must have 0 TableSchema validation errors');
  console.log('✓ Test 6: High-submesh generic fragment consolidation passed (72 meshes consolidated into 1 clean body).');

  // Test 7: Categorized Folder Layout & Variant Disambiguation (Pickup test case)
  const syntheticComprehensiveDae = `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <library_geometries>
    <geometry id="chassis_frame-mesh" name="chassis_frame"><mesh/></geometry>
    <geometry id="pickup_bumper_F-mesh" name="pickup_bumper_F"><mesh/></geometry>
    <geometry id="pickup_bumper_F_tube-mesh" name="pickup_bumper_F_tube"><mesh/></geometry>
    <geometry id="pickup_bumper_F_offroad-mesh" name="pickup_bumper_F_offroad"><mesh/></geometry>
    <geometry id="pickup_plate_bumper_F_shackle_L-mesh" name="pickup_plate_bumper_F_shackle_L"><mesh/></geometry>
    <geometry id="pickup_bumper_R-mesh" name="pickup_bumper_R"><mesh/></geometry>
    <geometry id="pickup_bumper_R_heavy_addon_facelift-mesh" name="pickup_bumper_R_heavy_addon_facelift"><mesh/></geometry>
    <geometry id="pickup_door_FL-mesh" name="pickup_door_FL"><mesh/></geometry>
    <geometry id="pickup_door_FR-mesh" name="pickup_door_FR"><mesh/></geometry>
    <geometry id="pickup_fender_FL-mesh" name="pickup_fender_FL"><mesh/></geometry>
    <geometry id="pickup_fender_FR-mesh" name="pickup_fender_FR"><mesh/></geometry>
    <geometry id="pickup_hood-mesh" name="pickup_hood"><mesh/></geometry>
    <geometry id="pickup_tailgate-mesh" name="pickup_tailgate"><mesh/></geometry>
    <geometry id="pickup_headlights-mesh" name="pickup_headlights"><mesh/></geometry>
    <geometry id="pickup_taillights-mesh" name="pickup_taillights"><mesh/></geometry>
    <geometry id="pickup_mirror_L-mesh" name="pickup_mirror_L"><mesh/></geometry>
    <geometry id="pickup_mirror_R-mesh" name="pickup_mirror_R"><mesh/></geometry>
    <geometry id="pickup_suspension_F-mesh" name="pickup_suspension_F"><mesh/></geometry>
    <geometry id="pickup_suspension_R-mesh" name="pickup_suspension_R"><mesh/></geometry>
    <geometry id="pickup_exhaust-mesh" name="pickup_exhaust"><mesh/></geometry>
    <geometry id="pickup_bed-mesh" name="pickup_bed"><mesh/></geometry>
  </library_geometries>
</COLLADA>`;

  const catResult = generateScaffoldingFromDae({
    daeContent: syntheticComprehensiveDae,
    daeFileName: 'pickup.dae',
    vehicleId: 'pickup',
    vehicleName: 'Gavril D-Series',
    author: 'BeamMaster',
    rootMeshName: 'chassis_frame',
    folderStructure: 'categorized'
  });

  const catFiles = Object.keys(catResult.files);

  // 1. Verify Clean Categorized Subfolders
  assert.ok(catFiles.includes('bumpers/front/pickup_bumper_F.jbeam'), 'Must create bumpers/front/pickup_bumper_F.jbeam');
  assert.ok(catFiles.includes('bumpers/front/pickup_bumper_F_tube.jbeam'), 'Must create bumpers/front/pickup_bumper_F_tube.jbeam');
  assert.ok(catFiles.includes('bumpers/front/pickup_bumper_F_offroad.jbeam'), 'Must create bumpers/front/pickup_bumper_F_offroad.jbeam');
  assert.ok(catFiles.includes('bumpers/rear/pickup_bumper_R.jbeam'), 'Must create bumpers/rear/pickup_bumper_R.jbeam');
  assert.ok(catFiles.includes('bumpers/rear/pickup_bumper_R_facelift_heavy.jbeam'), 'Rear bumper heavy facelift MUST be in bumpers/rear, NEVER bumpers/front');
  assert.ok(catFiles.includes('doors/pickup_door_FL.jbeam'), 'Must create doors/pickup_door_FL.jbeam');
  assert.ok(catFiles.includes('doors/pickup_door_FR.jbeam'), 'Must create doors/pickup_door_FR.jbeam');
  assert.ok(catFiles.includes('fenders/pickup_fender_FL.jbeam'), 'Must create fenders/pickup_fender_FL.jbeam');
  assert.ok(catFiles.includes('fenders/pickup_fender_FR.jbeam'), 'Must create fenders/pickup_fender_FR.jbeam');
  assert.ok(catFiles.includes('hood/pickup_hood.jbeam'), 'Must create hood/pickup_hood.jbeam');
  assert.ok(catFiles.includes('tailgate/pickup_tailgate.jbeam'), 'Must create tailgate/pickup_tailgate.jbeam');
  assert.ok(catFiles.includes('lighting/pickup_headlights.jbeam'), 'Must create lighting/pickup_headlights.jbeam');
  assert.ok(catFiles.includes('lighting/pickup_taillights.jbeam'), 'Must create lighting/pickup_taillights.jbeam');
  assert.ok(catFiles.includes('mirrors/pickup_mirror_L.jbeam'), 'Must create mirrors/pickup_mirror_L.jbeam');
  assert.ok(catFiles.includes('mirrors/pickup_mirror_R.jbeam'), 'Must create mirrors/pickup_mirror_R.jbeam');
  assert.ok(catFiles.includes('suspension/pickup_suspension_F.jbeam'), 'Must create suspension/pickup_suspension_F.jbeam');
  assert.ok(catFiles.includes('suspension/pickup_suspension_R.jbeam'), 'Must create suspension/pickup_suspension_R.jbeam');
  assert.ok(catFiles.includes('exhaust/pickup_exhaust.jbeam'), 'Must create exhaust/pickup_exhaust.jbeam');
  assert.ok(catFiles.includes('bed/pickup_bed.jbeam'), 'Must create bed/pickup_bed.jbeam');

  // 2. Verify Shared slotType for Front Bumpers
  const fbTube = catResult.files['bumpers/front/pickup_bumper_F_tube.jbeam'];
  assert.ok(fbTube.includes('"slotType": "pickup_bumper_F"'), 'Tube bumper must share slotType pickup_bumper_F');
  const fbOffroad = catResult.files['bumpers/front/pickup_bumper_F_offroad.jbeam'];
  assert.ok(fbOffroad.includes('"slotType": "pickup_bumper_F"'), 'Offroad bumper must share slotType pickup_bumper_F');
  assert.ok(fbOffroad.includes('"pickup_plate_bumper_F_shackle_L"'), 'Offroad bumper must include shackle attachment');

  // 3. Verify Body Slots Consolidation (Only 1 slot for Front Bumper, not 3!)
  const catBodyJBeam = catResult.files['pickup_body.jbeam'];
  const bumperSlotsCount = (catBodyJBeam.match(/"pickup_bumper_F"/g) || []).length;
  assert.strictEqual(bumperSlotsCount, 2, 'Body slots must declare pickup_bumper_F once (type and default)');

  // 4. Verify Bilateral Symmetrical Nodes for Doors
  const doorFL = catResult.files['doors/pickup_door_FL.jbeam'];
  const doorFR = catResult.files['doors/pickup_door_FR.jbeam'];
  assert.ok(doorFL.includes('["d1l", 0.82') || doorFL.includes('["d1l",  0.82'), 'Left door must have positive posX');
  assert.ok(doorFR.includes('["d1r", -0.82'), 'Right door must have mirrored negative posX');

  // 5. Verify All Generated Files Parse Cleanly with 0 Schema Errors
  for (const [fName, content] of Object.entries(catResult.files)) {
    if (fName.endsWith('.jbeam')) {
      const [parsed, diag] = processAllParts(decodeWithMeta(content).data);
      assert.strictEqual(diag.length, 0, `File ${fName} must have 0 validation errors: ${JSON.stringify(diag)}`);
    }
  }
  console.log('✓ Test 7: Categorized Folder Layout, Variant Disambiguation & Bilateral Symmetry passed.');

  console.log('All DAE Scaffolding Generator tests passed successfully!\n');
}

export default runDaeScaffoldingTests;
