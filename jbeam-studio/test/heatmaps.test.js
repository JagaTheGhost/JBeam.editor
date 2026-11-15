/**
 * Automated Test Suite for 3D Viewport Heatmaps (Node Mass, Beam Stiffness, Deform Yield)
 */
import assert from 'assert';
import * as THREE from 'three';
import {
  calculateNodeMassStats,
  calculateBeamStiffnessStats,
  calculateBeamDeformStats,
  buildNodesGroup,
  buildBeamsGroup
} from '../src/features/viewport/visualizers.js';

export function runHeatmapTests() {
  console.log('--- Running 3D Viewport Heatmaps Tests (Mass, Stiffness, Deform) ---');

  // -------------------------------------------------------------------------
  // Test 1: Node Mass Statistics Calculation
  // -------------------------------------------------------------------------
  const nodesFixture = {
    n_light: { posX: 0, posY: 0, posZ: 0, nodeWeight: 1.5 },
    n_mid:   { posX: 0, posY: 1, posZ: 0, nodeWeight: 12.0 },
    n_heavy: { posX: 0, posY: 2, posZ: 0, nodeWeight: 85.0 }
  };

  const massStats = calculateNodeMassStats(nodesFixture);
  assert.strictEqual(massStats.count, 3);
  assert.strictEqual(massStats.minWeight, 1.5);
  assert.strictEqual(massStats.maxWeight, 85.0);
  assert.strictEqual(massStats.totalWeight, 98.5);
  console.log('✓ Test 1: Node mass statistics calculation passed.');

  // -------------------------------------------------------------------------
  // Test 2: Beam Stiffness Statistics Calculation
  // -------------------------------------------------------------------------
  const beamsFixture = {
    b_soft:   { 'id1:': 'n_light', 'id2:': 'n_mid', beamSpring: 250000 },
    b_medium: { 'id1:': 'n_mid', 'id2:': 'n_heavy', beamSpring: 2000000 },
    b_stiff:  { 'id1:': 'n_light', 'id2:': 'n_heavy', beamSpring: 35000000 }
  };

  const stiffStats = calculateBeamStiffnessStats(beamsFixture);
  assert.strictEqual(stiffStats.count, 3);
  assert.strictEqual(stiffStats.minSpring, 250000);
  assert.strictEqual(stiffStats.maxSpring, 35000000);
  console.log('✓ Test 2: Beam stiffness statistics calculation passed.');

  // -------------------------------------------------------------------------
  // Test 3: Beam Deform Statistics Calculation
  // -------------------------------------------------------------------------
  const deformFixture = {
    b_crush: { 'id1:': 'n_light', 'id2:': 'n_mid', beamDeform: 12000 },
    b_body:  { 'id1:': 'n_mid', 'id2:': 'n_heavy', beamDeform: 45000 },
    b_rigid: { 'id1:': 'n_light', 'id2:': 'n_heavy', beamDeform: 'FLT_MAX', beamStrength: 'FLT_MAX' }
  };

  const deformStats = calculateBeamDeformStats(deformFixture);
  assert.strictEqual(deformStats.count, 2, 'FLT_MAX should be handled as unbreakable rigid reference');
  assert.strictEqual(deformStats.minDeform, 12000);
  assert.strictEqual(deformStats.maxDeform, 45000);
  console.log('✓ Test 3: Beam deform yield statistics calculation passed.');

  // -------------------------------------------------------------------------
  // Test 4: 3D Node Group Construction in Mass Heatmap Mode
  // -------------------------------------------------------------------------
  const nodesGroup = buildNodesGroup(nodesFixture, null, 'mass');
  assert.strictEqual(nodesGroup.children.length, 3, 'Must render 3 node spheres');

  // Verify dynamic sphere scaling proportional to mass
  const lightMesh = nodesGroup.children.find(c => c.name === 'node_n_light');
  const heavyMesh = nodesGroup.children.find(c => c.name === 'node_n_heavy');
  assert.ok(lightMesh, 'Light node mesh must exist');
  assert.ok(heavyMesh, 'Heavy node mesh must exist');

  assert.ok(heavyMesh.scale.x > lightMesh.scale.x, `Heavy node (${heavyMesh.scale.x}) must have larger radius than light node (${lightMesh.scale.x})`);
  assert.ok(heavyMesh.scale.x >= 1.8, 'Heavy anchor node should be scaled up significantly for visual contrast');
  console.log(`  Dynamic Mass Scaling: Light Node Scale = ${lightMesh.scale.x.toFixed(2)}x, Heavy Node Scale = ${heavyMesh.scale.x.toFixed(2)}x`);
  console.log('✓ Test 4: 3D Node mass heatmap construction & dynamic scaling verified.');

  // -------------------------------------------------------------------------
  // Test 5: 3D Beam Group Construction in Stiffness Heatmap Mode
  // -------------------------------------------------------------------------
  const beamsGroupStiff = buildBeamsGroup(beamsFixture, nodesFixture, null, 'stiffness');
  assert.ok(beamsGroupStiff.children.length > 0, 'Must construct beam line segments');

  const lineMesh = beamsGroupStiff.children.find(c => c.isLineSegments);
  assert.ok(lineMesh, 'LineSegments object must exist');
  const colorsAttr = lineMesh.geometry.getAttribute('color');
  assert.ok(colorsAttr, 'Line segments must have vertex color attributes');
  assert.strictEqual(colorsAttr.count, 6, '3 beams = 6 vertices');
  console.log('✓ Test 5: 3D Beam stiffness heatmap construction verified.');

  // -------------------------------------------------------------------------
  // Test 6: 3D Beam Group Construction in Deform Heatmap Mode
  // -------------------------------------------------------------------------
  const beamsGroupDeform = buildBeamsGroup(deformFixture, nodesFixture, null, 'deform');
  assert.ok(beamsGroupDeform.children.length > 0, 'Must construct deform line segments');

  const deformLineMesh = beamsGroupDeform.children.find(c => c.isLineSegments);
  assert.ok(deformLineMesh, 'Deform LineSegments object must exist');
  const deformColorsAttr = deformLineMesh.geometry.getAttribute('color');
  assert.ok(deformColorsAttr, 'Deform line segments must have vertex color attributes');
  console.log('✓ Test 6: 3D Beam deform crumple zone heatmap verified.');

  console.log('All 3D Viewport Heatmaps tests passed successfully!\n');
}

