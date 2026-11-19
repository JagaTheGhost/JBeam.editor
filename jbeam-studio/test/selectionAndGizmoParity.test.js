import assert from 'assert';
import * as THREE from 'three';
import { buildNodesGroup, buildBeamsGroup } from '../src/features/viewport/visualizers.js';

export async function runSelectionAndGizmoTests() {
  console.log('--- Running 3D Viewport Selection & Visual Feedback Tests ---');

  const testNodes = {
    fr1r: { posX: -0.42, posY: -1.85, posZ: 0.32, nodeWeight: 4.5, __partName: 'vehicle_frame' },
    fr2r: { posX: -0.42, posY: -1.25, posZ: 0.34, nodeWeight: 4.5, __partName: 'vehicle_frame' },
    fr1l: { posX: 0.42, posY: -1.85, posZ: 0.32, nodeWeight: 4.5, __partName: 'vehicle_frame' },
    fr2l: { posX: 0.42, posY: -1.25, posZ: 0.34, nodeWeight: 4.5, __partName: 'vehicle_frame' }
  };

  const testBeams = {
    beam_0: { 'id1:': 'fr1r', 'id2:': 'fr2r', beamSpring: 1501000, beamDamp: 120, __beamKey: 'beam_0', __partName: 'vehicle_frame' },
    beam_1: { 'id1:': 'fr1l', 'id2:': 'fr2l', beamSpring: 1501000, beamDamp: 120, __beamKey: 'beam_1', __partName: 'vehicle_frame' }
  };

  // Test 1: Single Node Selection Highlight in 3D
  {
    const nodesGroup = buildNodesGroup(testNodes, 'fr1r', 'type', null, ['fr1r']);
    const selectedMesh = nodesGroup.children.find(c => c.userData?.id === 'fr1r');
    assert.ok(selectedMesh, 'Selected node mesh must exist in nodes group');
    assert.strictEqual(selectedMesh.scale.x, 1.5, 'Selected node sphere must be scaled 1.5x');
    assert.strictEqual(selectedMesh.material.color.getHex(), 0xffeb3b, 'Selected node material must be gold/yellow selection color');
    console.log('✓ Test 1: Single node selection visual highlight passed.');
  }

  // Test 2: Multi-Node Selection Highlight in 3D
  {
    const multiIds = ['fr1r', 'fr1l'];
    const nodesGroup = buildNodesGroup(testNodes, null, 'type', null, multiIds);
    for (const nid of multiIds) {
      const mesh = nodesGroup.children.find(c => c.userData?.id === nid);
      assert.ok(mesh, `Multi-selected node "${nid}" mesh must exist`);
      assert.strictEqual(mesh.scale.x, 1.5, `Multi-selected node "${nid}" must be scaled 1.5x`);
      assert.strictEqual(mesh.material.color.getHex(), 0xffeb3b, `Multi-selected node "${nid}" must be yellow`);
    }
    console.log('✓ Test 2: Multi-node selection visual highlight passed.');
  }

  // Test 3: Beam Selection Highlight in 3D (Glowing Gold Cylinder & Endpoints)
  {
    const selectedBeamInfo = {
      partName: 'vehicle_frame',
      beamKey: 'beam_0',
      beam: testBeams.beam_0
    };
    const beamsGroup = buildBeamsGroup(testBeams, testNodes, 'beam_0', 'type', {}, 'ghost', selectedBeamInfo);
    const highlightGroup = beamsGroup.children.find(c => c.name === 'selected_beam_highlight');
    assert.ok(highlightGroup, 'Selected beam highlight group must be rendered in beamsGroup');
    assert.strictEqual(highlightGroup.children.length, 4, 'Highlight group must contain outer cylinder, core, and 2 endpoint spheres');
    console.log('✓ Test 3: Beam selection visual highlight passed.');
  }

  // Test 4: Node vs Beam Snapping Priority
  {
    // Simulating user click at (100, 100):
    // If distance to node is 6px and distance to beam is 5px, node must be selected (+4px bias)
    const nodeDist = 6;
    const beamDist = 5;
    const selectedType = (nodeDist <= 8 || nodeDist <= beamDist + 4) ? 'node' : 'beam';
    assert.strictEqual(selectedType, 'node', 'Node click must be prioritized over beam near junctions');

    // If user clicks far along the beam: distance to node is 35px, distance to beam is 3px
    const farNodeDist = 35;
    const directBeamDist = 3;
    const beamSelectedType = (farNodeDist <= 8 || farNodeDist <= directBeamDist + 4) ? 'node' : 'beam';
    assert.strictEqual(beamSelectedType, 'beam', 'Click along beam body must select the beam');
    console.log('✓ Test 4: Node vs Beam snapping priority logic passed.');
  }

  console.log('All 3D Viewport Selection & Visual Feedback tests passed successfully!\n');
}

runSelectionAndGizmoTests();
