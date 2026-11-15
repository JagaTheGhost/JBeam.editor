/**
 * Automated Test Suite for Blender & VS Code Advanced Features Parity
 * Tests:
 * 1. Node & Beam Extrude Tool (Blender 'E' shortcut)
 * 2. Quick Connection Tool (Blender 'F' shortcut: 2 nodes -> beam, 3 -> tri, 4 -> quad)
 * 3. PCA-based Arbitrary Mirror Plane Detection (VS Code PCA eigenvalue algorithm)
 * 4. BeamNG In-Game Log Parser & Diagnostic Streamer (VS Code logProcessor)
 * 5. Collada DAE Magnetic Vertex Snapping (Blender vertex snapping)
 */

import assert from 'assert';
import {
  extrudeNodesLossless,
  quickConnectNodesLossless,
  subdivideBeamLossless
} from '../src/features/jbeam/astUpdater.js';
import {
  detectAllMirrorPlanes,
  findAsymmetricNodes,
  mirrorPointAcrossPlane,
  computeCentroid,
  eigenDecomposition
} from '../src/features/jbeam/symmetryUtils.js';
import {
  parseLogContent,
  filterLogEntries,
  getLogSummary
} from '../src/features/logparser/logProcessor.js';
import { VisualMeshManager } from '../src/features/viewport/ColladaMeshManager.js';

export async function runBlenderVsCodeParityTests() {
  console.log('\n--- Running Advanced Blender & VS Code Parity Tests ---');

// ----------------------------------------------------------------------------
// Test 1: Node & Beam Extrude Tool (Blender 'E' key)
// ----------------------------------------------------------------------------
{
  const fixture = `{
  "test_chassis": {
    "nodes": [
      ["id", "posX", "posY", "posZ"],
      ["f1r", -0.4, -1.0, 0.3],
      ["f1l",  0.4, -1.0, 0.3]
    ],
    "beams": [
      ["id1:", "id2:"],
      ["f1r", "f1l"]
    ]
  }
}`;

  const nodesData = [
    { id: 'f1r', pos: [-0.4, -1.0, 0.3] },
    { id: 'f1l', pos: [0.4, -1.0, 0.3] }
  ];

  const res = extrudeNodesLossless(
    fixture,
    'test_chassis',
    {
      nodeIds: ['f1r', 'f1l'],
      nodesData,
      delta: [0, -0.5, 0.1], // Extrude 0.5m forward and 0.1m up
      properties: { beamSpring: 2001000, beamDamp: 200 },
      crossBracing: true
    },
    false
  );

  assert(!res.error, `Extrude error: ${res.error}`);
  assert.strictEqual(res.newNodes.length, 2, 'Should create 2 new extruded nodes');
  assert(res.createdBeams >= 4, `Should create longitudinal, parallel and cross-bracing beams (got ${res.createdBeams})`);

  // Verify the updated text includes the newly extruded nodes and beams
  assert(res.updatedText.includes('f2r') || res.updatedText.includes('f1r_e1'), 'New node f2r/f1r_e1 should be in AST');
  assert(res.updatedText.includes('f2l') || res.updatedText.includes('f1l_e1'), 'New node f2l/f1l_e1 should be in AST');

  console.log('✓ Test 1: Node & Beam Extrude Tool (Blender "E" key) passed.');
}

// ----------------------------------------------------------------------------
// Test 2: Quick Connection Tool (Blender 'F' key)
// ----------------------------------------------------------------------------
{
  const fixture = `{
  "test_part": {
    "nodes": [
      ["id", "posX", "posY", "posZ"],
      ["n1r", -0.5, -0.5, 0.2],
      ["n2r", -0.5,  0.5, 0.2],
      ["n3r", -0.2,  0.0, 0.6],
      ["n4r", -0.8,  0.0, 0.6]
    ],
    "beams": [
      ["id1:", "id2:"]
    ],
    "triangles": [
      ["id1:", "id2:", "id3:"]
    ],
    "quads": [
      ["id1:", "id2:", "id3:", "id4:"]
    ]
  }
}`;

  // A. Connect 2 nodes -> Beam
  const beamRes = quickConnectNodesLossless(fixture, 'test_part', ['n1r', 'n2r'], { symmetry: true });
  assert.strictEqual(beamRes.createdType, 'beam', '2 nodes must create a beam');
  assert(beamRes.updatedText.includes('["n1r", "n2r"]'), 'Should include ["n1r", "n2r"]');
  assert(beamRes.updatedText.includes('["n1l", "n2l"]'), 'Should include mirrored beam ["n1l", "n2l"]');

  // B. Connect 3 nodes -> Triangle
  const triRes = quickConnectNodesLossless(fixture, 'test_part', ['n1r', 'n2r', 'n3r'], { symmetry: true });
  assert.strictEqual(triRes.createdType, 'triangle', '3 nodes must create a triangle');
  assert(triRes.updatedText.includes('["n1r", "n2r", "n3r"]'), 'Should include ["n1r", "n2r", "n3r"]');
  // Mirrored triangle has inverted winding order
  assert(triRes.updatedText.includes('["n1l", "n3l", "n2l"]'), 'Should include inverted normal mirrored triangle ["n1l", "n3l", "n2l"]');

  // C. Connect 4 nodes -> Quad
  const quadRes = quickConnectNodesLossless(fixture, 'test_part', ['n1r', 'n2r', 'n3r', 'n4r'], { symmetry: true });
  assert.strictEqual(quadRes.createdType, 'quad', '4 nodes must create a quad');
  assert(quadRes.updatedText.includes('["n1r", "n2r", "n3r", "n4r"]'), 'Should include quad row');

  console.log('✓ Test 2: Quick Connection Tool (Blender "F" key) passed.');
}

// ----------------------------------------------------------------------------
// Test 3: PCA-based Arbitrary Mirror Plane Detection
// ----------------------------------------------------------------------------
{
  // Symmetrical box of 8 nodes with left/right symmetry across X=0
  const symmetricalNodes = [
    { id: 'f1r', pos: [-0.5, -1.0, 0.3] },
    { id: 'f1l', pos: [ 0.5, -1.0, 0.3] },
    { id: 'f2r', pos: [-0.5,  1.0, 0.3] },
    { id: 'f2l', pos: [ 0.5,  1.0, 0.3] },
    { id: 't1r', pos: [-0.4, -0.5, 0.9] },
    { id: 't1l', pos: [ 0.4, -0.5, 0.9] },
    { id: 't2r', pos: [-0.4,  0.5, 0.9] },
    { id: 't2l', pos: [ 0.4,  0.5, 0.9] }
  ];

  const planes = detectAllMirrorPlanes(symmetricalNodes, 0.01);
  assert(planes.length > 0, 'Should detect candidate mirror planes');

  // Top candidate plane should be Lateral Centerline (X=0) with 100% symmetry
  const topPlane = planes[0];
  assert.strictEqual(topPlane.symmetryPercentage, 100, `Top plane should be 100% symmetrical (got ${topPlane.symmetryPercentage}%)`);
  assert.strictEqual(topPlane.normal.x, 1, 'Top plane normal should be along X');

  // Introduce an asymmetric outlier node
  const asymmetricalNodes = [
    ...symmetricalNodes,
    { id: 'asym_node', pos: [-0.75, 0.2, 0.4] } // No counterpart on +X
  ];

  const planesWithAsym = detectAllMirrorPlanes(asymmetricalNodes, 0.01);
  const outliers = findAsymmetricNodes(asymmetricalNodes, planesWithAsym[0], 0.01);
  assert.strictEqual(outliers.length, 1, 'Should identify exactly 1 asymmetric outlier');
  assert.strictEqual(outliers[0], 'asym_node', 'Outlier should be asym_node');

  console.log('✓ Test 3: PCA-based Arbitrary Mirror Plane Detection passed.');
}

// ----------------------------------------------------------------------------
// Test 4: BeamNG In-Game Log Parser & Streamer
// ----------------------------------------------------------------------------
{
  const mockLog = `
24.573|E|GELua.core_vehiclePaints.vehicles|paint "Jet black" not found in default paint list
24.655|W|GELua.core_vehiclePaints.vehicles|paint collection "ccf_custom" not found for model "ccf"
151.493|E|GELua.jbeam.pushToPhysics|unable to create flexmesh: gara_body
151.620|E|libbeamng.powertrain.init:32543|Found unknown powertrain device type: wheelAxle
151.624|E|libbeamng.powertrain.init:32543|Powertrain will not work!
152.001|I|GELua.core_vehicles.init|Vehicle spawned successfully
153.110|D|sound.fmod|Voice playback started
`;

  const parsed = parseLogContent(mockLog);
  assert.strictEqual(parsed.length, 6, 'Should parse 6 non-debug log lines');

  const summary = getLogSummary(parsed);
  assert.strictEqual(summary.errors, 4, 'Should count 4 errors');
  assert.strictEqual(summary.warnings, 1, 'Should count 1 warning');
  assert.strictEqual(summary.info, 1, 'Should count 1 info');

  // Verify critical vehicle issue detection
  assert(summary.criticalIssues.length >= 3, 'Should flag flexmesh and powertrain as critical vehicle issues');
  assert(summary.criticalIssues.some(e => e.message.includes('wheelAxle')), 'Should detect wheelAxle powertrain error');
  assert(summary.criticalIssues.some(e => e.message.includes('gara_body')), 'Should detect flexmesh gara_body error');

  // Filter vehicle physics only
  const vehicleOnly = filterLogEntries(parsed, { vehicleOnly: true });
  assert(vehicleOnly.every(e => e.isVehicleRelated), 'All filtered entries should be vehicle related');

  console.log('✓ Test 4: BeamNG In-Game Log Parser & Streamer passed.');
}

// ----------------------------------------------------------------------------
// Test 5: Collada DAE Magnetic Vertex Snapping
// ----------------------------------------------------------------------------
{
  const THREE = await import('three');
  const manager = new VisualMeshManager();

  // Create synthetic visual mesh (e.g. vehicle hood panel)
  const geom = new THREE.BufferGeometry();
  const vertices = new Float32Array([
    -0.5, -1.2, 0.35,
     0.5, -1.2, 0.35,
     0.0,  1.0, 0.85
  ]);
  geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.name = 'hood_panel';
  mesh.position.set(0, 0, 0);

  manager.meshGroup.add(mesh);
  manager.allMeshes.push(mesh);
  manager.submeshMap.set('hood_panel', mesh);

  mesh.updateWorldMatrix(true, false);
  const v0World = new THREE.Vector3(vertices[0], vertices[1], vertices[2]).applyMatrix4(mesh.matrixWorld);

  // 1. Query point very close to vertex 0 in world space
  const queryPt = v0World.clone().add(new THREE.Vector3(0.02, -0.01, 0.01));
  const snap = manager.findClosestVertex(queryPt, 0.25);

  assert(snap.found, 'Should find closest vertex within 0.25m search radius');
  assert.strictEqual(snap.submesh, 'hood_panel', 'Should identify hood_panel as submesh');
  assert(snap.distance < 0.05, `Distance to snapped vertex should be under 0.05m (got ${snap.distance})`);
  assert(Math.abs(snap.point.x - v0World.x) < 0.0001, 'Snapped X must match vertex');
  assert(Math.abs(snap.point.y - v0World.y) < 0.0001, 'Snapped Y must match vertex');
  assert(Math.abs(snap.point.z - v0World.z) < 0.0001, 'Snapped Z must match vertex');

  // 2. Query point far away beyond maxDistance
  const farPt = new THREE.Vector3(5.0, 5.0, 5.0);
  const farSnap = manager.findClosestVertex(farPt, 0.25);
  assert(!farSnap.found, 'Should not snap when distance exceeds maxDistance');

  console.log('✓ Test 5: Collada DAE Magnetic Vertex Snapping passed.');
}

// ----------------------------------------------------------------------------
// Test 6: Direct Ray-to-Mesh 3D Snapping (snapRayToMesh)
// ----------------------------------------------------------------------------
{
  const THREE = await import('three');
  const manager = new VisualMeshManager();

  const geom = new THREE.BufferGeometry();
  // Single triangle at Z = 0
  const vertices = new Float32Array([
    -1.0, -1.0, 0.0,
     1.0, -1.0, 0.0,
     0.0,  1.0, 0.0
  ]);
  geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geom.computeVertexNormals();

  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.name = 'percheron_door';
  manager.allMeshes.push(mesh);
  manager.meshGroup.add(mesh);
  mesh.updateWorldMatrix(true, false);

  // Ray aimed directly near vertex 2 (0, 1, 0)
  const raycaster = new THREE.Raycaster();
  raycaster.set(new THREE.Vector3(0.01, 0.90, 2.0), new THREE.Vector3(0, 0, -1));

  const result = manager.snapRayToMesh(raycaster, 0.35);
  assert(result.found, 'Raycaster must hit mesh surface');
  assert(result.isVertex, 'Should magnetically lock to nearest vertex (0, 1, 0)');
  assert.strictEqual(result.submesh, 'percheron_door');
  assert(Math.abs(result.point.x - 0.0) < 0.001, 'Snapped X must lock to vertex X=0.0');
  assert(Math.abs(result.point.y - 1.0) < 0.001, 'Snapped Y must lock to vertex Y=1.0');
  assert(Math.abs(result.point.z - 0.0) < 0.001, 'Snapped Z must lock to vertex Z=0.0');

  console.log('✓ Test 6: Direct Ray-to-Mesh 3D Snapping (snapRayToMesh) passed.');
}

// ----------------------------------------------------------------------------
// Test 7: Submesh Filtering & Isolation Without Prefix Interference
// ----------------------------------------------------------------------------
{
  const THREE = await import('three');
  const manager = new VisualMeshManager();

  // Root vehicle group named 'percheron'
  const rootGroup = new THREE.Group();
  rootGroup.name = 'percheron';

  const doorMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  doorMesh.name = 'percheron_door_fl';
  rootGroup.add(doorMesh);

  const steeringMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  steeringMesh.name = 'percheron_midlift_steering';
  rootGroup.add(steeringMesh);

  const cabMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  cabMesh.name = 'percheron_cab';
  rootGroup.add(cabMesh);

  manager.meshGroup.add(rootGroup);
  manager.allMeshes.push(doorMesh, steeringMesh, cabMesh);

  // Filter ONLY steering part
  const visibleCount = manager.filterSubmeshes(['percheron_midlift_steering']);
  assert.strictEqual(visibleCount, 1, 'Only steering submesh should be visible');
  assert.strictEqual(steeringMesh.visible, true, 'Steering mesh must be visible');
  assert.strictEqual(doorMesh.visible, false, 'Door mesh must NOT be visible');
  assert.strictEqual(cabMesh.visible, false, 'Cab mesh must NOT be visible');

  // Filter null/empty restores all meshes
  const resetCount = manager.filterSubmeshes(null);
  assert.strictEqual(resetCount, 3, 'All submeshes should be visible when unfiltered');

  console.log('✓ Test 7: Submesh Filtering & Isolation Without Prefix Interference passed.');
}

  console.log('All Advanced Blender & VS Code Parity Tests passed successfully!\n');
}
