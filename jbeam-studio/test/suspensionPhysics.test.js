/**
 * Automated Test Suite: Suspension Physics (TorsionBars, Rails, SlideNodes, Kinematics)
 */

import assert from 'assert';
import * as THREE from 'three';
import {
  extractTorsionBars,
  extractRailsAndSlideNodes
} from '../src/features/jbeam/suspensionPhysicsParser.js';
import {
  buildTorsionBarsGroup,
  buildSlideNodesGroup
} from '../src/features/viewport/suspensionVisualizer.js';
import { validateJBeamDocument } from '../src/features/jbeam/jbeamValidator.js';

export function runSuspensionPhysicsTests() {
  console.log('\n--- Running Suspension Physics Tests (TorsionBars, Rails, SlideNodes, Kinematics) ---');

  // --------------------------------------------------------------------------
  // Test 1: TorsionBars Table Extraction (Array & Object formats)
  // --------------------------------------------------------------------------
  {
    const partWithArrayTb = {
      name: 'suspension_R',
      torsionbars: [
        ['id1:', 'id2:', 'id3:', 'id4:'],
        { spring: 250000, damp: 25, deform: 8000, strength: 40000 },
        ['arbr2r', 'arbr1r', 'arbr1l', 'arbr2l', { name: 'rear_swaybar', breakGroup: 'swaybar_R' }]
      ]
    };

    const extracted = extractTorsionBars(partWithArrayTb);
    assert.strictEqual(extracted.length, 1, 'Should extract 1 torsionbar from array table');
    const tb = extracted[0];
    assert.strictEqual(tb.id1, 'arbr2r', 'Arm 1 tip should be arbr2r');
    assert.strictEqual(tb.id2, 'arbr1r', 'Pivot 1 should be arbr1r');
    assert.strictEqual(tb.id3, 'arbr1l', 'Pivot 2 should be arbr1l');
    assert.strictEqual(tb.id4, 'arbr2l', 'Arm 2 tip should be arbr2l');
    assert.strictEqual(tb.spring, 250000, 'Spring rate should inherit from active options');
    assert.strictEqual(tb.damp, 25, 'Damping should inherit from active options');
    assert.strictEqual(tb.name, 'rear_swaybar', 'Inline name should be respected');
    assert.strictEqual(tb.breakGroup, 'swaybar_R', 'Inline breakGroup should be captured');

    console.log('✓ Test 1: TorsionBars table extraction passed.');
  }

  // --------------------------------------------------------------------------
  // Test 2: Rails and SlideNodes Parsing
  // --------------------------------------------------------------------------
  {
    const partWithRails = {
      name: 'steering_assembly',
      rails: {
        steeringrack: {
          'links:': ['fh6r', 'fh6l'],
          looped: false,
          capped: true
        }
      },
      slidenodes: [
        ['id:', 'railName', 'attached', 'fixToRail', 'tolerance', 'spring', 'strength'],
        ['fx5r', 'steeringrack', true, true, 0.002, 14000000, 'FLT_MAX'],
        ['fx5l', 'steeringrack', true, true, 0.002, 14000000, 'FLT_MAX']
      ]
    };

    const { rails, slideNodes } = extractRailsAndSlideNodes(partWithRails);
    assert.ok(rails.steeringrack, 'Should parse steeringrack rail');
    assert.strictEqual(rails.steeringrack.links.length, 2, 'Rail should have 2 links');
    assert.strictEqual(rails.steeringrack.capped, true, 'Rail should be capped');

    assert.strictEqual(slideNodes.length, 2, 'Should extract 2 slidenodes');
    assert.strictEqual(slideNodes[0].id, 'fx5r', 'First slidenode ID should be fx5r');
    assert.strictEqual(slideNodes[0].railName, 'steeringrack', 'First slidenode railName should match');
    assert.strictEqual(slideNodes[0].spring, 14000000, 'Spring stiffness should be 14,000,000');
    assert.strictEqual(slideNodes[0].tolerance, 0.002, 'Tolerance should be 0.002');

    console.log('✓ Test 2: Rails and SlideNodes extraction passed.');
  }

  // --------------------------------------------------------------------------
  // Test 3: Three.js 3D Scene Group Construction
  // --------------------------------------------------------------------------
  {
    const nodes = {
      arbr2r: [-0.65, 1.5, 0.45],
      arbr1r: [-0.40, 1.4, 0.45],
      arbr1l: [0.40, 1.4, 0.45],
      arbr2l: [0.65, 1.5, 0.45],
      r1: [-0.3, 0.5, 0.4],
      r2: [0.3, 0.5, 0.4],
      sn1: [0.0, 0.5, 0.4]
    };

    const tbars = [
      {
        id1: 'arbr2r',
        id2: 'arbr1r',
        id3: 'arbr1l',
        id4: 'arbr2l',
        spring: 350000,
        name: 'test_swaybar'
      }
    ];

    const tbGroup = buildTorsionBarsGroup(tbars, nodes, { showLabels: false });
    assert.ok(tbGroup instanceof THREE.Group, 'Should construct Three.js group for torsionbars');
    assert.ok(tbGroup.children.length >= 4, 'Should contain cylinder axis, reaction ring, lever arms and bushings');

    const cylinder = tbGroup.children.find(c => c.geometry instanceof THREE.CylinderGeometry);
    assert.ok(cylinder, 'Group must include central cylinder axis');
    assert.strictEqual(cylinder.userData.type, 'torsionbar', 'Mesh userData should identify as torsionbar');

    const rails = {
      test_rail: { links: ['r1', 'r2'], looped: false, capped: true }
    };
    const slideNodes = [
      { id: 'sn1', railName: 'test_rail', tolerance: 0.01, spring: 500000 }
    ];

    const snGroup = buildSlideNodesGroup(rails, slideNodes, nodes);
    assert.ok(snGroup instanceof THREE.Group, 'Should construct Three.js group for rails & slidenodes');
    const tubeMesh = snGroup.children.find(c => c.geometry instanceof THREE.TubeGeometry);
    assert.ok(tubeMesh, 'Group must include guide rail tube');
    assert.strictEqual(tubeMesh.userData.type, 'rail', 'UserData must tag as rail');

    const collarMesh = snGroup.children.find(c => c.userData?.type === 'slidenode');
    assert.ok(collarMesh, 'Group must include slidenode collar');

    console.log('✓ Test 4: Three.js 3D scene construction passed.');
  }

  // --------------------------------------------------------------------------
  // Test 4: Structural Diagnostics Detection
  // --------------------------------------------------------------------------
  {
    const jbeamText = `
    {
      "bad_suspension": {
        "nodes": [
          ["id", "posX", "posY", "posZ"],
          ["a1", 0.5, 1.0, 0.3],
          ["a2", 0.2, 1.0, 0.3]
        ],
        "torsionbars": [
          ["id1:", "id2:", "id3:", "id4:"],
          ["a1", "a2", "a2", "missing_node", {"spring": -500}]
        ],
        "rails": {
          "broken_rail": {"links:": ["a1"]}
        },
        "slidenodes": [
          ["id:", "railName"],
          ["a1", "non_existent_rail"]
        ]
      }
    }
    `;

    const result = validateJBeamDocument(jbeamText, 'bad_suspension.jbeam', { strictReferences: true });
    assert.ok(result.problems.length >= 3, `Should catch multiple suspension diagnostics, found: ${result.problems.length}`);

    const zeroLengthErr = result.problems.find(p => p.message.includes('coincident torsionbar pivots') || p.message.includes('zero length'));
    assert.ok(zeroLengthErr, 'Must flag zero-length torsionbar axis (id2 == id3)');

    const railLinksErr = result.problems.find(p => p.message.includes('fewer than 2 linked nodes'));
    assert.ok(railLinksErr, 'Must flag rail with fewer than 2 link nodes');

    const undefinedRailErr = result.problems.find(p => p.message.includes('references undefined rail'));
    assert.ok(undefinedRailErr, 'Must flag slidenode referencing undefined rail');

    console.log('✓ Test 4: Structural diagnostics detection passed.');
  }

  console.log('All Suspension Physics tests passed successfully!\n');
}

// Run immediately if invoked as main script
if (process.argv[1]?.endsWith('suspensionPhysics.test.js')) {
  runSuspensionPhysicsTests();
}
