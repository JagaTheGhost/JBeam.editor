import assert from 'assert';
import { calculateWheelDimensions, detectWheelHubs, buildGhostWheelsGroup } from '../src/features/viewport/wheelVisualizer.js';
import { calculateMassProperties, buildCogMarkerGroup } from '../src/features/viewport/cogCalculator.js';
import { getSymmetricNodeId } from '../src/features/jbeam/symmetryUtils.js';
import { buildCodeHoverGroup, buildTrianglesGroup, buildNodesGroup } from '../src/features/viewport/visualizers.js';

export async function runAdvancedViewportAndPhysicsTests() {
  console.log('--- Running Ghost Wheels, CoG Calculator, and Assembly Surface Tests ---');

  // Test 1: Wheel & Tire Dimensions
  const dims = calculateWheelDimensions({
    rimDiameterInch: 18,
    tireWidthMm: 255,
    aspectRatio: 40
  });

  const expectedRimM = 18 * 0.0254 / 2;
  assert.strictEqual(dims.innerRadius, expectedRimM, 'Inner rim radius calculation mismatch');
  assert.strictEqual(dims.tireWidth, 0.255, 'Tire width mismatch');
  assert.strictEqual(dims.outerRadius, expectedRimM + 0.255 * 0.4, 'Outer tire radius mismatch');
  console.log('✓ Test 1: Wheel & Tire Dimensions calculation passed.');

  // Test 2: Hub Node Discovery
  const mockNodes = {
    fw1l: { posX: 0.85, posY: -1.4, posZ: 0.32, nodeWeight: 12 },
    fw1r: { posX: -0.85, posY: -1.4, posZ: 0.32, nodeWeight: 12 },
    rw1l: { posX: 0.85, posY: 1.4, posZ: 0.32, nodeWeight: 12 },
    rw1r: { posX: -0.85, posY: 1.4, posZ: 0.32, nodeWeight: 12 },
    chassis_1: { posX: 0, posY: 0, posZ: 0.5, nodeWeight: 200 }
  };

  const hubs = detectWheelHubs(mockNodes);
  assert.strictEqual(hubs.length, 4, `Expected 4 wheel hubs detected, got ${hubs.length}`);
  const axles = hubs.map(h => `${h.axle}_${h.side}`);
  assert.ok(axles.includes('front_left'), 'Must detect front left hub');
  assert.ok(axles.includes('front_right'), 'Must detect front right hub');
  assert.ok(axles.includes('rear_left'), 'Must detect rear left hub');
  assert.ok(axles.includes('rear_right'), 'Must detect rear right hub');
  console.log('✓ Test 2: Hub Node Discovery passed.');

  // Test 3: Ghost Wheels 3D Group Construction
  const wheelGroup = buildGhostWheelsGroup(mockNodes, {
    rimDiameterInch: 17,
    tireWidthMm: 245,
    aspectRatio: 45,
    visible: true
  });
  assert.strictEqual(wheelGroup.children.length, 4, 'Wheel group must contain 4 ghost wheel meshes');
  console.log('✓ Test 3: Ghost Wheels 3D Group Construction passed.');

  // Test 4: Center of Gravity & Mass Properties Calculator
  const massProps = calculateMassProperties(mockNodes);
  assert.strictEqual(massProps.nodeCount, 5, 'Should count 5 valid nodes');
  assert.strictEqual(massProps.totalMassKg, 248, 'Total mass should sum to 248 kg');
  assert.ok(massProps.totalMassLbs > 540, 'Total mass lbs should convert correctly');

  // Since chassis is at Y=0 and hubs are symmetric at Y=-1.4 and Y=+1.4, CoG Y should be 0
  assert.strictEqual(massProps.cogBeamng[1], 0, 'CoG longitudinal position should be 0');
  assert.strictEqual(massProps.frontWeightPercent, 50, 'Front weight should be 50%');
  assert.strictEqual(massProps.rearWeightPercent, 50, 'Rear weight should be 50%');
  assert.strictEqual(massProps.leftWeightPercent, 50, 'Left weight should be 50%');
  assert.strictEqual(massProps.rightWeightPercent, 50, 'Right weight should be 50%');

  // Test with front-heavy vehicle
  const frontHeavyNodes = {
    engine_heavy: { posX: 0, posY: -1.5, posZ: 0.4, nodeWeight: 300 },
    cabin: { posX: 0, posY: 0, posZ: 0.6, nodeWeight: 100 },
    trunk: { posX: 0, posY: 1.5, posZ: 0.4, nodeWeight: 50 }
  };
  const frontHeavyProps = calculateMassProperties(frontHeavyNodes);
  assert.ok(frontHeavyProps.frontWeightPercent > 60, `Front weight should be > 60%, got ${frontHeavyProps.frontWeightPercent}%`);
  console.log('✓ Test 4: Center of Gravity & Mass Properties Calculator passed.');

  // Test 5: CoG 3D Marker Group Construction
  const cogMarker = buildCogMarkerGroup(frontHeavyProps, true);
  assert.ok(cogMarker.children.length >= 4, 'CoG marker group should contain sphere, rings, drop-line, and shadow target');
  console.log('✓ Test 5: CoG 3D Marker Group Construction passed.');

  // Test 6: Symmetrical Counterpart Resolution for Live Dragging
  assert.strictEqual(getSymmetricNodeId('f1l'), 'f1r', 'f1l must mirror to f1r');
  assert.strictEqual(getSymmetricNodeId('f1r'), 'f1l', 'f1r must mirror to f1l');
  assert.strictEqual(getSymmetricNodeId('cowl_l'), 'cowl_r', 'cowl_l must mirror to cowl_r');
  console.log('✓ Test 6: Symmetrical Counterpart Resolution for Live Dragging passed.');

  // Test 7: Code Hover 3D Focus Visualizer (Nodes, Beams, Triangles, Quads)
  {
    const testNodes = {
      n1: { posX: 0, posY: 0, posZ: 0 },
      n2: { posX: 1, posY: 0, posZ: 0 },
      n3: { posX: 1, posY: 1, posZ: 0 },
      n4: { posX: 0, posY: 1, posZ: 0 }
    };

    // 7a. Hover Node
    const nodeHoverGroup = buildCodeHoverGroup({ type: 'node', id: 'n1' }, testNodes);
    assert.strictEqual(nodeHoverGroup.children.length, 2, 'Node hover should render sphere and targeting ring');

    // 7b. Hover Beam
    const beamHoverGroup = buildCodeHoverGroup({ type: 'beam', id1: 'n1', id2: 'n2' }, testNodes);
    assert.strictEqual(beamHoverGroup.children.length, 2, 'Beam hover should render line and volume cylinder');

    // 7c. Hover Triangle
    const triHoverGroup = buildCodeHoverGroup({ type: 'triangle', nodes: ['n1', 'n2', 'n3'] }, testNodes);
    assert.strictEqual(triHoverGroup.children.length, 2, 'Triangle hover should render translucent surface and outline');

    // 7d. Hover Quad
    const quadHoverGroup = buildCodeHoverGroup({ type: 'quad', nodes: ['n1', 'n2', 'n3', 'n4'] }, testNodes);
    assert.strictEqual(quadHoverGroup.children.length, 2, 'Quad hover should render translucent surface and outline');

    // 7e. Empty / Missing elements
    const emptyGroup = buildCodeHoverGroup(null, testNodes);
    assert.strictEqual(emptyGroup.children.length, 0, 'Null hover element should yield empty group');

    console.log('✓ Test 7: Code Hover 3D Focus Visualizer Group construction passed.');
  }

  // Test 8: Non-Active Open Files Ghost & Multi-Tab Surfaces
  {
    const mockNodes = {
      n1: { posX: 0, posY: 0, posZ: 0, __isNonActive: true },
      n2: { posX: 1, posY: 0, posZ: 0, __isNonActive: true },
      n3: { posX: 0, posY: 1, posZ: 0, __isNonActive: true }
    };
    const mockTris = {
      t1: { 'id1:': 'n1', 'id2:': 'n2', 'id3:': 'n3', __isNonActive: true }
    };

    const ghostSurfacesGroup = buildTrianglesGroup(mockTris, mockNodes, null, {
      nonActiveViewType: 'ghost'
    });

    assert.ok(ghostSurfacesGroup.children.length > 0, 'Ghost surfaces group should contain meshes for non-active files');
    const ghostMesh = ghostSurfacesGroup.children.find(c => c.name === 'non_active_surfaces');
    assert.ok(ghostMesh, 'Must contain non_active_surfaces mesh');
    assert.strictEqual(ghostMesh.material.transparent, true, 'Ghost surface must be transparent');

    console.log('✓ Test 8: Non-Active Open Files Ghost & Multi-Tab Surfaces passed.');
  }

  console.log('All Ghost Wheels, CoG Calculator, and Assembly Surface tests passed!');
}
