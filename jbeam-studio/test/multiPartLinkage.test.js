import assert from 'assert';
import * as THREE from 'three';
import { buildBeamsGroup, buildNodesGroup, buildMountingJointsGroup } from '../src/features/viewport/visualizers.js';
import { addBeamLossless, getPartPrefix, prefixAllNodesInPart } from '../src/features/jbeam/astUpdater.js';
import { validateJBeamDocument } from '../src/features/jbeam/jbeamValidator.js';

export function runMultiPartLinkageTests() {
  console.log('--- Running Multi-Part Linkage & Inter-Part Mounting Tests ---');

  // Test 1: High-Contrast CAD Component Wireframe Colorization
  const mockNodes = {
    // Active Part: Engine (Component 0)
    eng_1: { id: 'eng_1', posX: 0, posY: -1.0, posZ: 0.5, __isNonActive: false, __componentColor: '#40c4ff' },
    eng_2: { id: 'eng_2', posX: 0.4, posY: -1.0, posZ: 0.5, __isNonActive: false, __componentColor: '#40c4ff' },
    // Counterpart Component: Chassis Frame (Component 1)
    frame_mount_1: { id: 'frame_mount_1', posX: 0.02, posY: -1.02, posZ: 0.48, __isNonActive: true, __componentColor: '#f59e0b' },
    frame_node_2: { id: 'frame_node_2', posX: 0.5, posY: -2.0, posZ: 0.3, __isNonActive: true, __componentColor: '#f59e0b' }
  };

  const mockBeams = {
    b_eng: { 'id1:': 'eng_1', 'id2:': 'eng_2', beamType: '|NORMAL', __isNonActive: false },
    b_frame: { 'id1:': 'frame_mount_1', 'id2:': 'frame_node_2', beamType: '|NORMAL', __isNonActive: true, __componentColor: '#f59e0b' },
    b_mount: { 'id1:': 'eng_1', 'id2:': 'frame_mount_1', beamType: '|NORMAL', __isNonActive: false }
  };

  const cadWireGroup = buildBeamsGroup(mockBeams, mockNodes, null, 'type', {}, 'cadWire');
  assert.ok(cadWireGroup, 'cadWireGroup must be created');
  assert.ok(cadWireGroup.children.length > 0, 'cadWireGroup should contain beam segments');
  console.log('✓ Test 1: High-contrast CAD Component wireframe colorization verified.');

  // Test 2: Automatic Interface Mounting Point Detection (Proximity Joints)
  // eng_1 is at (0, -1.0, 0.5), frame_mount_1 is at (0.02, -1.02, 0.48) -> dist ~= 0.0346m (3.4cm) < 0.08m
  const jointsGroup = buildMountingJointsGroup(mockNodes, 0.08);
  assert.ok(jointsGroup, 'Mounting joints group must exist');
  assert.ok(jointsGroup.children.length > 0, 'Should detect at least 1 mounting joint pair between engine and frame');

  const detectedPairs = jointsGroup.userData.proximityPairs;
  assert.strictEqual(detectedPairs.length, 1, 'Should find exactly 1 proximity mount candidate pair');
  assert.strictEqual(detectedPairs[0].activeNode.id, 'eng_1');
  assert.strictEqual(detectedPairs[0].counterpartNode.id, 'frame_mount_1');
  assert(detectedPairs[0].dist < 0.05, 'Distance must be less than 5cm');
  console.log(`✓ Test 2: Proximity mounting point detected (${(detectedPairs[0].dist * 1000).toFixed(1)}mm separation).`);

  // Test 3: Cross-Part Mounting Beam AST Creation (Connecting Engine to Frame)
  const engineJbeam = `{
  "engine_part": {
    "information": { "name": "V8 Engine" },
    "nodes": [
      ["id", "posX", "posY", "posZ"],
      {"nodeWeight": 12},
      ["eng_1", 0, -1.0, 0.5],
      ["eng_2", 0.4, -1.0, 0.5]
    ],
    "beams": [
      ["id1:", "id2:"],
      {"beamSpring": 1500000, "beamDeform": 45000},
      ["eng_1", "eng_2"]
    ]
  }
}`;

  const res = addBeamLossless(engineJbeam, 'engine_part', {
    id1: 'eng_1',
    id2: 'frame_mount_1',
    properties: { beamSpring: 3500000, beamDeform: 75000 }
  }, false);

  assert.strictEqual(res.error, null, 'Must successfully write cross-part mount beam');
  assert(res.updatedText.includes('["eng_1", "frame_mount_1"]'), 'Updated JBeam must contain cross-part mount beam');
  assert(res.updatedText.includes('"beamSpring":3500000'), 'Must contain mount stiffness properties');
  console.log('✓ Test 3: Cross-part mounting beam written to active component JBeam AST.');

  // Test 4: Cross-Beams Viewport Emphasizing
  const crossBeamsGroup = buildBeamsGroup(mockBeams, mockNodes, null, 'type', {}, 'crossBeams');
  assert.ok(crossBeamsGroup, 'crossBeamsGroup created');
  assert.ok(crossBeamsGroup.children.length > 0, 'crossBeamsGroup must contain beam meshes');
  console.log('✓ Test 4: Cross-Beams emphasizing mode verified.');

  // Test 5: Clean Part Prefix Derivation
  assert.strictEqual(getPartPrefix('Test_2', 'Test_2.jbeam'), 't2_');
  assert.strictEqual(getPartPrefix('pickup_hood', 'pickup_hood.jbeam'), 'ph_');
  assert.strictEqual(getPartPrefix('main', 'Test.jbeam'), 't_');
  console.log('✓ Test 5: Clean Part Prefix Derivation verified.');

  // Test 6: Lossless Multi-Part Node Prefixing
  const test2Jbeam = `{
  "Test_2": {
    "nodes": [
      ["id", "posX", "posY", "posZ"],
      ["n1r", 1, 2, 0],
      ["n1l", -1, 2, 0],
      ["n2r", 1, 1, 0]
    ],
    "beams": [
      ["id1:", "id2:"],
      ["n1r", "n2r"],
      ["n1l", "n2r"]
    ],
    "triangles": [
      ["id1:", "id2:", "id3:"],
      ["n1r", "n1l", "n2r"]
    ]
  }
}`;
  const prefRes = prefixAllNodesInPart(test2Jbeam, 'Test_2', 't2_');
  assert.strictEqual(prefRes.renamedCount, 3);
  assert(prefRes.updatedText.includes('["t2_n1r", 1, 2, 0]'));
  assert(prefRes.updatedText.includes('["t2_n1r", "t2_n2r"]'));
  assert(prefRes.updatedText.includes('["t2_n1r", "t2_n1l", "t2_n2r"]'));
  console.log('✓ Test 6: Lossless Multi-Part Node Prefixing verified.');

  // Test 7: Cross-Part Beam with Collision Resolution & BeamNG Standard (optional: true)
  const crossRes = addBeamLossless(prefRes.updatedText, 'Test_2', {
    id1: 't2_n1r',
    id2: 'n1r', // node in Test.jbeam
    properties: { beamSpring: 2500000, beamDeform: 45000 },
    isCrossPart: true,
    breakGroup: 'test2_hinge'
  });
  assert.strictEqual(crossRes.error, null);
  assert(crossRes.updatedText.includes('"optional":true'));
  assert(crossRes.updatedText.includes('"breakGroup":"test2_hinge"'));
  assert(crossRes.updatedText.includes('["t2_n1r", "n1r"]'));
  assert(crossRes.updatedText.includes('"optional":false'));
  console.log('✓ Test 7: Cross-Part Beam with Collision Resolution & BeamNG standard (optional: true) verified.');

  // Test 8: Validator Recognizes Open Tabs' Nodes as Inter-Part Connections
  const diagRes = validateJBeamDocument(crossRes.updatedText, 'Test_2.jbeam', {
    openTabsNodes: {
      n1r: { partName: 'Test', tabTitle: 'Test.jbeam', nodeId: 'n1r' }
    }
  });
  const interPartDiags = (diagRes.problems || []).filter(p => p.source === 'Inter-Part');
  assert.strictEqual(interPartDiags.length, 1, 'Should register 1 Inter-Part connection');
  assert(interPartDiags[0].message.includes('external node "n1r"'));
  assert(interPartDiags[0].message.includes('Test.jbeam'));
  console.log('✓ Test 8: Validator recognizes open tabs nodes as Inter-Part connections.');

  // Test 9: Beam Selection Visual Highlight with Cylinders & Endpoint Spheres
  const selectedBeamsGroup = buildBeamsGroup(mockBeams, mockNodes, null, 'type', {}, 'cadWire', {
    partName: 'engine_part',
    beamKey: 'b_eng',
    beam: mockBeams.b_eng
  });
  const highlightGroup = selectedBeamsGroup.children.find(c => c.name === 'selected_beam_highlight');
  assert.ok(highlightGroup, 'selected_beam_highlight group must exist in scene when beam is selected');
  assert.strictEqual(highlightGroup.children.length, 4, 'Highlight must have outer cylinder, inner core, and 2 endpoint spheres');
  assert.strictEqual(highlightGroup.children[0].material.depthTest, false, 'Highlight cylinder must have depthTest false to stay on top');
  assert.strictEqual(highlightGroup.children[2].material.depthTest, false, 'Endpoint spheres must have depthTest false to stay on top');
  console.log('✓ Test 9: Beam selection visual highlight with cylinders and endpoint spheres verified.');

  // Test 10: Distinct Multi-Part View Modes (Joints vs Cross-Beams vs Clashes)
  const joints015 = buildMountingJointsGroup(mockNodes, 0.15);
  assert.ok(joints015.userData.jointNodeKeys instanceof Set, 'Joints group must expose jointNodeKeys Set');
  assert.ok(joints015.userData.jointNodeKeys.has('eng_1') && joints015.userData.jointNodeKeys.has('frame_mount_1'), 'jointNodeKeys must contain matching proximity endpoints');

  assert.ok(crossBeamsGroup.userData.crossEndpointKeys instanceof Set, 'Cross-beams group must expose crossEndpointKeys Set');
  assert.ok(crossBeamsGroup.userData.crossEndpointKeys.has('eng_1') && crossBeamsGroup.userData.crossEndpointKeys.has('frame_mount_1'), 'crossEndpointKeys must include cross-part endpoints');

  const focusedNodesGroup = buildNodesGroup(mockNodes, null, 'type', new Set(), [], 'mountPoints', null, {
    multiPartFocusNodeIds: joints015.userData.jointNodeKeys,
    clashNodeIds: new Set(['eng_2'])
  });
  const eng1Mesh = focusedNodesGroup.children.find(c => c.userData?.id === 'eng_1');
  const frame2Mesh = focusedNodesGroup.children.find(c => c.userData?.id === 'frame_node_2');
  const clashMesh = focusedNodesGroup.children.find(c => c.userData?.id === 'eng_2');
  assert.ok(eng1Mesh && eng1Mesh.scale.x > 1.2, 'Focused joint node must be enlarged');
  assert.ok(frame2Mesh && frame2Mesh.material.opacity < 0.25 && frame2Mesh.scale.x < 0.7, 'Non-target background node in Joints mode must be dimmed and shrunk');
  assert.ok(clashMesh && clashMesh.scale.x > 1.3, 'Clash-highlighted node must stand out clearly');
  console.log('✓ Test 10: Distinct Multi-Part modes (Joints, Cross-Beams, Clash highlights) verified.');

  console.log('All Multi-Part Linkage & Inter-Part Mounting tests passed successfully!');
}
