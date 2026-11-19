import assert from 'assert';
import * as THREE from 'three';
import {
  computeConnectedTopology,
  buildNodesGroup,
  buildBeamsGroup,
  buildNodeLabelsGroup
} from '../src/features/viewport/visualizers.js';

export function runConnectedTopologyFocusTests() {
  console.log('--- Running Connected Topology Focus (Neighborhood X-Ray) Tests ---');

  const mockNodes = {
    fe1l: { id: 'fe1l', posX: 0.8, posY: -1.2, posZ: 0.6, nodeWeight: 5 },
    fe2l: { id: 'fe2l', posX: 0.8, posY: -1.6, posZ: 0.6, nodeWeight: 5 },
    fe3l: { id: 'fe3l', posX: 0.8, posY: -1.4, posZ: 0.8, nodeWeight: 5 },
    fe1r: { id: 'fe1r', posX: -0.8, posY: -1.2, posZ: 0.6, nodeWeight: 5 },
    fe2r: { id: 'fe2r', posX: -0.8, posY: -1.6, posZ: 0.6, nodeWeight: 5 },
    fe3r: { id: 'fe3r', posX: -0.8, posY: -1.4, posZ: 0.8, nodeWeight: 5 },
    rear_bumper_1: { id: 'rear_bumper_1', posX: 0.0, posY: 2.1, posZ: 0.5, nodeWeight: 8 },
    rear_bumper_2: { id: 'rear_bumper_2', posX: 0.5, posY: 2.1, posZ: 0.5, nodeWeight: 8 }
  };

  const mockBeams = {
    b1: { 'id1:': 'fe1l', 'id2:': 'fe2l', beamType: '|NORMAL', __beamKey: 'b1' },
    b2: { 'id1:': 'fe1l', 'id2:': 'fe3l', beamType: '|NORMAL', __beamKey: 'b2' },
    b3: { 'id1:': 'fe2l', 'id2:': 'fe3l', beamType: '|NORMAL', __beamKey: 'b3' },
    b4_r: { 'id1:': 'fe1r', 'id2:': 'fe2r', beamType: '|NORMAL', __beamKey: 'b4_r' },
    b5_r: { 'id1:': 'fe1r', 'id2:': 'fe3r', beamType: '|NORMAL', __beamKey: 'b5_r' },
    b_rear: { 'id1:': 'rear_bumper_1', 'id2:': 'rear_bumper_2', beamType: '|NORMAL', __beamKey: 'b_rear' }
  };

  // Test 1: Single Node Topology Analysis
  const singleFocus = computeConnectedTopology('fe1l', mockBeams, false);
  assert.strictEqual(singleFocus.enabled, true, 'Topology focus must be enabled for selected node');
  assert.ok(singleFocus.selectedNodeIds.has('fe1l'), 'selectedNodeIds should include fe1l');
  assert.ok(singleFocus.neighborNodeIds.has('fe2l'), 'fe2l must be identified as neighbor');
  assert.ok(singleFocus.neighborNodeIds.has('fe3l'), 'fe3l must be identified as neighbor');
  assert.strictEqual(singleFocus.neighborNodeIds.has('rear_bumper_1'), false, 'Unconnected node must not be in neighbors');
  assert.strictEqual(singleFocus.connectedBeamsCount, 2, 'fe1l connects directly to 2 beams (b1, b2)');
  console.log('✓ Test 1: Single node connected topology analysis passed.');

  // Test 2: Bilateral Symmetry (X-Mirror) Connected Topology
  const mirrorFocus = computeConnectedTopology('fe1l', mockBeams, true);
  assert.strictEqual(mirrorFocus.enabled, true);
  assert.ok(mirrorFocus.selectedNodeIds.has('fe1l'), 'Should include left node fe1l');
  assert.ok(mirrorFocus.selectedNodeIds.has('fe1r'), 'Should automatically include mirrored right node fe1r');
  assert.ok(mirrorFocus.neighborNodeIds.has('fe2l') && mirrorFocus.neighborNodeIds.has('fe2r'), 'Neighbors must include left and right counterparts');
  assert.strictEqual(mirrorFocus.connectedBeamsCount, 4, 'Should include both left (b1, b2) and right (b4_r, b5_r) beams');
  console.log('✓ Test 2: Bilateral symmetry (X-Mirror) connected topology passed.');

  // Test 3: Multi-node Selection Topology
  const multiFocus = computeConnectedTopology(['fe1l', 'fe2l'], mockBeams, false);
  assert.strictEqual(multiFocus.enabled, true);
  assert.ok(multiFocus.selectedNodeIds.has('fe1l') && multiFocus.selectedNodeIds.has('fe2l'));
  assert.ok(multiFocus.neighborNodeIds.has('fe3l'), 'fe3l must be neighbor to the selection');
  assert.strictEqual(multiFocus.connectedBeamsCount, 3, 'Selection fe1l + fe2l connects to b1, b2, b3');
  console.log('✓ Test 3: Multi-node selection connected topology passed.');

  // Test 4: Empty / Null Selection
  const emptyFocus = computeConnectedTopology(null, mockBeams);
  assert.strictEqual(emptyFocus.enabled, false);
  assert.strictEqual(emptyFocus.connectedBeamsCount, 0);
  console.log('✓ Test 4: Empty selection returns disabled focus state.');

  // Test 5: 3D Node Group Construction with Focus Neighborhood
  const nodesGroup = buildNodesGroup(
    mockNodes,
    'fe1l',
    'type',
    null,
    null,
    'ghost',
    null,
    { focusConnected: singleFocus }
  );

  const selNodeMesh = nodesGroup.children.find(c => c.userData?.id === 'fe1l');
  const neighborNodeMesh = nodesGroup.children.find(c => c.userData?.id === 'fe2l');
  const backgroundNodeMesh = nodesGroup.children.find(c => c.userData?.id === 'rear_bumper_1');

  assert.ok(selNodeMesh, 'Selected node mesh must exist');
  assert.ok(neighborNodeMesh, 'Neighbor node mesh must exist');
  assert.ok(backgroundNodeMesh, 'Background node mesh must exist');

  assert.strictEqual(neighborNodeMesh.userData.isNeighborNode, true, 'Neighbor node must have isNeighborNode flag');
  assert.strictEqual(backgroundNodeMesh.userData.isDimmedByFocus, true, 'Background node must have isDimmedByFocus flag');
  assert.ok(neighborNodeMesh.scale.x > backgroundNodeMesh.scale.x, 'Neighbor node must be visually larger than dimmed background nodes');
  console.log('✓ Test 5: 3D node group construction with prominent neighbors and dimmed background passed.');

  // Test 6: 3D Beams Group Construction with Dimmed Background Beams
  const beamsGroup = buildBeamsGroup(
    mockBeams,
    mockNodes,
    null,
    'type',
    {},
    'ghost',
    null,
    null,
    { focusConnected: singleFocus }
  );

  const segments = beamsGroup.userData.beamSegments;
  assert.ok(segments && segments.length > 0, 'Beam segments must be populated');

  const b1Segment = segments.find(s => s.key === 'b1');
  const rearSegment = segments.find(s => s.key === 'b_rear');

  assert.ok(b1Segment, 'Connected beam b1 segment must exist');
  assert.ok(rearSegment, 'Unconnected rear bumper beam segment must exist');

  assert.strictEqual(b1Segment.isConnectedByFocus, true, 'Beam b1 must be marked as isConnectedByFocus');
  assert.strictEqual(rearSegment.isConnectedByFocus, false, 'Rear bumper beam must not be marked isConnectedByFocus');
  console.log('✓ Test 6: 3D beams group construction with focused connections and dimmed background beams passed.');

  // Test 7: Node Billboard Labels Focus Filter
  const origDoc = global.document;
  global.document = {
    createElement: (tag) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            roundRect: () => {},
            fill: () => {},
            stroke: () => {},
            fillText: () => {}
          })
        };
      }
      return {};
    }
  };

  try {
    const labelsGroup = buildNodeLabelsGroup(
      mockNodes,
      'fe1l',
      null,
      { focusConnected: singleFocus }
    );
    // When focus is active, labels should only be created for fe1l and its neighbors (fe2l, fe3l), NOT the rear bumper!
    assert.ok(labelsGroup.children.length > 0, 'Labels group should contain sprites');
    assert.strictEqual(labelsGroup.children.length, 3, 'Should only create 3 labels for selected node + 2 neighbors');
    console.log('✓ Test 7: Node labels decluttering verified (only selected & neighbor nodes labeled).');
  } finally {
    global.document = origDoc;
  }

  console.log('All Connected Topology Focus tests passed successfully!\n');
}
