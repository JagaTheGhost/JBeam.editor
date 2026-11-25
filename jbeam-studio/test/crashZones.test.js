import assert from 'assert';
import { extractCrashZones, getCrashGroupColor, normalizeGroupList } from '../src/features/jbeam/crashZonesParser.js';
import { buildBeamsGroup } from '../src/features/viewport/visualizers.js';
import { validateJBeamDocument } from '../src/features/jbeam/jbeamValidator.js';

export function runCrashZonesTests() {
  console.log('=== Testing Crash Zones (BreakGroups & DeformGroups) ===');

  // Test 1: normalizeGroupList
  {
    assert.deepStrictEqual(normalizeGroupList('door_latch'), ['door_latch']);
    assert.deepStrictEqual(normalizeGroupList(['latch_a', 'latch_b']), ['latch_a', 'latch_b']);
    assert.deepStrictEqual(normalizeGroupList(''), []);
    assert.deepStrictEqual(normalizeGroupList(['']), []);
    assert.deepStrictEqual(normalizeGroupList(null), []);
    assert.deepStrictEqual(normalizeGroupList(undefined), []);
    assert.deepStrictEqual(normalizeGroupList(['  hood_latch  ']), ['hood_latch']);
    console.log('  ✓ normalizeGroupList handles single strings, arrays, and empty resets');
  }

  // Test 2: getCrashGroupColor
  {
    const color1 = getCrashGroupColor('hood_latch');
    const color2 = getCrashGroupColor('hood_latch');
    const color3 = getCrashGroupColor('door_hinge_FL');

    assert.strictEqual(color1, color2, 'Color generation must be deterministic');
    assert.match(color1, /^#[0-9a-f]{6}$/i, 'Must return valid 6-char hex color');
    assert.notStrictEqual(color1, color3, 'Different names should produce distinct colors');
    console.log('  ✓ getCrashGroupColor generates deterministic, vibrant hex colors');
  }

  // Test 3: extractCrashZones from JBeam Parts
  {
    const testParts = {
      hood: {
        beams: {
          b1: { 'id1:': 'h1', 'id2:': 'h2', breakGroup: 'hood_latch', deformGroup: 'hood_deform' },
          b2: { 'id1:': 'h2', 'id2:': 'h3', breakGroup: 'hood_latch', deformGroup: 'hood_deform' },
          b3: { 'id1:': 'h3', 'id2:': 'h4', breakGroup: ['hood_hinge_L', 'hood_hinge_R'] },
          b4: { 'id1:': 'h4', 'id2:': 'h5' } // Ungrouped standard beam
        },
        flexbodies: [
          ['hood_mesh', ['hood_nodes'], [], [], 'hood_deform']
        ]
      }
    };

    const zones = extractCrashZones(testParts);

    assert(zones.breakGroups['hood_latch'], 'hood_latch breakGroup exists');
    assert.strictEqual(zones.breakGroups['hood_latch'].beams.length, 2);
    assert(zones.breakGroups['hood_hinge_L'], 'Multi-group array hood_hinge_L parsed');
    assert(zones.breakGroups['hood_hinge_R'], 'Multi-group array hood_hinge_R parsed');

    assert(zones.deformGroups['hood_deform'], 'hood_deform deformGroup exists');
    assert.strictEqual(zones.deformGroups['hood_deform'].beams.length, 2);
    assert.deepStrictEqual(zones.deformGroups['hood_deform'].flexbodies, [{ meshName: 'hood_mesh', partName: 'hood' }]);

    assert(zones.allBreakGroupNames.includes('hood_latch'));
    assert(zones.allBreakGroupNames.includes('hood_hinge_L'));
    assert(zones.allBreakGroupNames.includes('hood_hinge_R'));
    assert(zones.allDeformGroupNames.includes('hood_deform'));
    assert.strictEqual(zones.totalUnguardedBeams, 1);

    console.log('  ✓ extractCrashZones accurately catalogs breakGroups, deformGroups, and flexbody correlations');
  }

  // Test 4: 3D Scene Group Construction in Crash Zones Mode
  {
    const beamsDict = {
      b1: { 'id1:': 'n1', 'id2:': 'n2', breakGroup: 'latch', __beamKey: 'b1', __partName: 'testPart' },
      b2: { 'id1:': 'n2', 'id2:': 'n3', deformGroup: 'glass_crack', __beamKey: 'b2', __partName: 'testPart' },
      b3: { 'id1:': 'n3', 'id2:': 'n4', __beamKey: 'b3', __partName: 'testPart' }
    };
    const nodesDict = {
      testPart_n1: { id: 'n1', x: 0, y: 0, z: 0, __partName: 'testPart' },
      testPart_n2: { id: 'n2', x: 1, y: 0, z: 0, __partName: 'testPart' },
      testPart_n3: { id: 'n3', x: 2, y: 0, z: 0, __partName: 'testPart' },
      testPart_n4: { id: 'n4', x: 3, y: 0, z: 0, __partName: 'testPart' }
    };

    // 4a. Crash Zones mode with all groups visible
    const groupAll = buildBeamsGroup(beamsDict, nodesDict, null, 'crashZones', {}, 'ghost', null, null, {
      crashGroupType: 'all'
    });
    assert(groupAll, 'buildBeamsGroup succeeds in crashZones mode');
    assert(groupAll.children.length > 0, 'buildBeamsGroup generates mesh / line segments');

    // 4b. Solo mode: activeCrashGroup = 'latch'
    const groupSolo = buildBeamsGroup(beamsDict, nodesDict, null, 'crashZones', {}, 'ghost', null, null, {
      activeCrashGroup: 'latch',
      crashGroupType: 'all'
    });
    assert(groupSolo, 'buildBeamsGroup solo activeCrashGroup succeeds');

    console.log('  ✓ buildBeamsGroup renders crashZones color mode with active group soloing');
  }

  // Test 5: JBeam Structural Diagnostics for Crash Zones
  {
    // Part with single-beam breakgroup (should warn/info about easy premature road detachment)
    // and flexbody referencing non-existent deformGroup (missing beams warning)
    const jbeamText = `
    {
      "test_crash_diagnostics": {
        "information": { "name": "Test Diagnostics" },
        "nodes": [
          ["id", "posX", "posY", "posZ"],
          ["n1", 0, 0, 0],
          ["n2", 1, 0, 0],
          ["n3", 2, 0, 0]
        ],
        "beams": [
          ["id1:", "id2:"],
          {"breakGroup": "fragile_single_latch"},
          ["n1", "n2"],
          {"breakGroup": ""},
          ["n2", "n3"]
        ],
        "flexbodies": [
          ["mesh", "[group]:", "nonFlexMaterials"],
          {"deformGroup": "missing_glass_deform"},
          ["windshield", ["n1", "n2"], []],
          {"deformGroup": ""}
        ]
      }
    }
    `;

    const result = validateJBeamDocument(jbeamText, 'test_crash.jbeam');

    const singleBeamProblem = result.problems.find(p => p.source === 'CrashZones' && p.message.includes('fragile_single_latch'));
    assert(singleBeamProblem, 'Validator flags single-beam breakgroup prone to premature road detachment');
    assert.strictEqual(singleBeamProblem.severity, 'info');

    const missingDeformProblem = result.problems.find(p => p.source === 'CrashZones' && p.message.includes('missing_glass_deform'));
    assert(missingDeformProblem, 'Validator flags flexbody referencing missing deformgroup');
    assert.strictEqual(missingDeformProblem.severity, 'warning');

    console.log('  ✓ jbeamValidator reliably detects single-beam breakgroups and unassigned flexbody deformgroups');
  }

  console.log('All Crash Zones tests passed successfully!\n');
}
