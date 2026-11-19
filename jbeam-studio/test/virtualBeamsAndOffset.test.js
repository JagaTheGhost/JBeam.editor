/*
  JBeam Studio - Virtual Cross-Part Beams & Assembly Offset Tests
  Verifies:
  1. Expression offset translation updates (addOffsetToExpr).
  2. Lossless AST coordinate updating un-applies assembly totalOffset.
  3. 3D Viewport builds cross-part virtual connectors to external nodes.
*/

import assert from 'node:assert';
import { decodeWithMeta } from '../src/features/jbeam/sjsonParser.js';
import { processAllParts } from '../src/features/jbeam/tableSchema.js';
import {
  addOffsetToExpr,
  updateNodeCoordinatesLossless
} from '../src/features/jbeam/astUpdater.js';
import {
  buildBeamsGroup,
  normalizeBeamType,
  BEAM_TYPE_COLORS
} from '../src/features/viewport/visualizers.js';

export function runVirtualBeamsAndOffsetTests() {
  console.log('--- Running Virtual Cross-Part Beams & Offset Inversion Tests ---');

  // Test 1: Expression Offset Translation (addOffsetToExpr)
  {
    const e1 = addOffsetToExpr('$=$track_width / 2', 0.05);
    assert.strictEqual(e1, '$=($track_width / 2) + 0.05', 'Should wrap body in parens and append positive delta');

    const e2 = addOffsetToExpr('$=$toe_FR', -0.002);
    assert.strictEqual(e2, '$=($toe_FR) - 0.002', 'Should append negative delta');

    const e3 = addOffsetToExpr('$=($a + $b)', 0.1);
    assert.strictEqual(e3, '$=($a + $b) + 0.1', 'Should preserve existing outer parens');

    const e4 = addOffsetToExpr('"$=$rideheight"', 0.02);
    assert.strictEqual(e4, '"$=($rideheight) + 0.02"', 'Should preserve quotes if original was quoted');

    console.log('✓ Test 1: Expression offset translation (addOffsetToExpr) passed.');
  }

  // Test 2: Assembly totalOffset Un-applying during Lossless Coordinate Save
  {
    const jbeamSource = `{
  "bumper_front": {
    "nodes": [
      ["id", "posX", "posY", "posZ"],
      // Front bumper corner
      ["bmp1r", -0.85, 2.10, 0.35],
      ["bmp1l",  0.85, 2.10, 0.35]
    ]
  }
}`;

    // In Assembly mode, suppose the bumper inherited a nodeOffset of +0.10m in Z and +0.05m in Y
    // When the user drags bmp1r in 3D world space from Z=0.45 to Z=0.50 (world pos: [-0.85, 2.15, 0.50])
    const bundle = decodeWithMeta(jbeamSource, 'test.jbeam', true);
    const [parts] = processAllParts(bundle.data);
    const bmp1r = parts.bumper_front.nodes.bmp1r;

    const updatedNodes = [
      {
        ...bmp1r,
        pos: [-0.85, 2.15, 0.50], // World coordinates from 3D gizmo
        totalOffset: [0.0, 0.05, 0.10] // Inherited assembly offset
      }
    ];

    const res = updateNodeCoordinatesLossless(jbeamSource, updatedNodes);
    assert.strictEqual(res.error, null);
    assert.strictEqual(res.modifiedCount, 1);

    // The written text in the file must have totalOffset subtracted:
    // Y: 2.15 - 0.05 = 2.10
    // Z: 0.50 - 0.10 = 0.40
    assert.ok(
      res.updatedText.includes('["bmp1r", -0.85, 2.1, 0.4]') ||
      res.updatedText.includes('["bmp1r", -0.85, 2.10, 0.4]'),
      `File text must save un-offset local coordinate (0.40m), got:\n${res.updatedText}`
    );

    // Comments must be intact
    assert.ok(res.updatedText.includes('// Front bumper corner'));

    console.log('✓ Test 2: Assembly totalOffset un-applying during coordinate save passed.');
  }

  // Test 3: Cross-Part Virtual Beams (Connectors to External Chassis Nodes)
  {
    // Part has local nodes b1 and b2, but beam 'mount_1' connects local b1 to external chassis node 'frame_f1r'
    const localNodes = {
      'b1': { id: 'b1', posX: -0.8, posY: 2.0, posZ: 0.3 },
      'b2': { id: 'b2', posX:  0.8, posY: 2.0, posZ: 0.3 }
    };

    const externalNodes = {
      'frame_f1r': { id: 'frame_f1r', posX: -0.8, posY: 1.8, posZ: 0.4 }
    };

    const beams = {
      'internal_b': { 'id1:': 'b1', 'id2:': 'b2', beamType: '|NORMAL' },
      'mount_chassis': { 'id1:': 'b1', 'id2:': 'frame_f1r', beamType: '|NORMAL' }
    };

    const group = buildBeamsGroup(beams, localNodes, null, 'type', externalNodes);
    assert.ok(group, 'Group should be created');

    // Should create virtual lines mesh for mount_chassis with distinct technical Dash-Dot chain line
    const virtualLine = group.children.find(c => c.name === 'virtual_beams_lines');
    assert.ok(virtualLine, 'virtual_beams_lines should be generated for cross-part connection');
    assert.strictEqual(virtualLine.material.type, 'LineBasicMaterial', 'External connection must use Dash-Dot segments (LineBasicMaterial), distinct from LineDashedMaterial used by support beams');

    // Should create external mount anchor rings for foreign attachment nodes
    const anchorGroup = group.children.find(c => c.name === 'virtual_mount_anchors');
    assert.ok(anchorGroup, 'virtual_mount_anchors should exist to visually mark foreign node attachment points');
    assert.ok(anchorGroup.children.length > 0, 'Anchor group should contain torus ring for foreign attachment node');

    // Segments metadata
    const virtualSeg = group.userData.beamSegments.find(s => s.isVirtual);
    assert.ok(virtualSeg, 'Virtual segment metadata present');
    assert.strictEqual(virtualSeg.id1, 'b1');
    assert.strictEqual(virtualSeg.id2, 'frame_f1r');
    assert.strictEqual(virtualSeg.externalNodeId, 'frame_f1r');
    assert.strictEqual(virtualSeg.beamType, '|VIRTUAL');

    console.log('✓ Test 3: Cross-part virtual beams with Dash-Dot lines and external mount anchors passed.');
  }
}
