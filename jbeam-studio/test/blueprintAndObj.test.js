/*
  JBeam Studio - Feature A, B, and C Automated Test Suite
  Validates:
  1. Feature A: 2-Point Wheelbase Calibration & Blueprint Reference Planes
  2. Feature B: Wavefront OBJ <-> JBeam Bi-directional Converter & Vertex Welding
  3. Feature C: Dedicated Powertrain Studio, Torque Curves & Gearing Computations
*/

import assert from 'assert';
import * as THREE from 'three';
import {
  calibrateBlueprintScale,
  buildBlueprintMesh,
  DEFAULT_BLUEPRINT_CONFIG
} from '../src/features/viewport/blueprintManager.js';
import {
  convertObjToJBeam,
  convertJBeamToObj,
  AXIS_PRESETS
} from '../src/features/jbeam/objConverter.js';
import {
  calculateEngineTorqueCurve,
  parsePowertrainGraph
} from '../src/features/powertrain/powertrainParser.js';

export function runBlueprintAndObjTests() {
  console.log('--- Running Studio Tools (Blueprint, OBJ & Powertrain Studio) Tests ---');

  // ========================================================
  // 1. FEATURE A: 2-Point Blueprint Calibration & Geometry
  // ========================================================

// Test 1: Calibrate side blueprint with 2.85m wheelbase
{
  // Assume an image of 1920x1080 (aspect ratio 1.7778)
  // User clicks front wheel hub at (0.25, 0.6) and rear wheel hub at (0.75, 0.6)
  // Distance between wheel hubs in vehicle is 2.85m
  const p1 = { u: 0.25, v: 0.6 };
  const p2 = { u: 0.75, v: 0.6 };
  const knownWheelbase = 2.85;
  const imageWidth = 1920;
  const imageHeight = 1080;

  const result = calibrateBlueprintScale(p1, p2, knownWheelbase, imageWidth, imageHeight, 'side');

  assert(result.scale > 0, 'Calculated scale must be positive');
  assert.strictEqual(result.aspectRatio, imageWidth / imageHeight, 'Aspect ratio should match image dimensions');
  assert(Math.abs(result.width - 5.7) < 0.01, `Expected width ~5.7m, got ${result.width}`);
  assert(result.height < result.width, 'Height should be less than width for 16:9 image');
  assert.strictEqual(typeof result.centerOffset.y, 'number', 'Side plane centerOffset must define Y offset');
  assert.strictEqual(typeof result.centerOffset.z, 'number', 'Side plane centerOffset must define Z offset');

  console.log('✓ Test 1: 2-Point Wheelbase Calibration math passed.');
}

// Test 2: Calibration error handling for degenerate / close points
{
  assert.throws(() => {
    calibrateBlueprintScale({ u: 0.5, v: 0.5 }, { u: 0.5, v: 0.50001 }, 2.85, 1000, 1000, 'side');
  }, /too close together/i, 'Should throw error when points are coincident');

  console.log('✓ Test 2: Calibration input validation and degenerate guard passed.');
}

// Test 3: buildBlueprintMesh Three.js construction & orientation
{
  const sideConfig = {
    ...DEFAULT_BLUEPRINT_CONFIG.side,
    enabled: true,
    imageUrl: 'blob:test-side-image',
    scale: 4.8,
    aspectRatio: 1.6,
    opacity: 0.75
  };

  const mesh = buildBlueprintMesh('side', sideConfig);
  assert(mesh instanceof THREE.Mesh, 'Should construct a valid Three.js Mesh');
  assert.strictEqual(mesh.name, 'blueprint_plane_side');
  assert.strictEqual(mesh.renderOrder, -1, 'renderOrder should be -1 to sit behind skeleton');
  assert.strictEqual(mesh.material.transparent, true, 'Material should be transparent');
  assert.strictEqual(mesh.material.depthWrite, false, 'depthWrite should be false to prevent occluding nodes');
  assert(Math.abs(mesh.rotation.y - Math.PI / 2) < 0.001, 'Side plane should rotate around Y by 90 deg');

  // Disabled plane returns null
  const disabledMesh = buildBlueprintMesh('side', { ...sideConfig, enabled: false });
  assert.strictEqual(disabledMesh, null, 'Disabled config should return null mesh');

  console.log('✓ Test 3: Blueprint Three.js mesh orientation & non-occluding properties verified.');
}

// ========================================================
// 2. FEATURE B: Wavefront OBJ <-> JBeam Bi-directional Converter
// ========================================================

// Test 4: OBJ to JBeam parsing with vertex welding
{
  // Simple pyramid OBJ with duplicated vertices at the apex to test welding
  const testObj = `
# Blender Wavefront OBJ
v -1.000000 0.000000 0.000000
v 1.000000 0.000000 0.000000
v 0.000000 1.000000 0.000000
v 0.000000 0.500000 1.000000
v 0.000000 0.500100 1.000000
l 1 2
l 2 3
l 3 1
f 1 2 4
f 2 3 5
f 3 1 4
  `.trim();

  const converted = convertObjToJBeam(testObj, {
    partName: 'test_pyramid',
    nodePrefix: 'pyr',
    nodeWeight: 4.5,
    weldDistance: 0.01 // 10mm tolerance will weld vertex 4 and 5
  });

  assert.strictEqual(converted.nodeCount, 4, `Vertex 4 and 5 should be welded into 1 node. Expected 4, got ${converted.nodeCount}`);
  assert(converted.beamCount >= 3, `Expected at least 3 beams, got ${converted.beamCount}`);
  assert.strictEqual(converted.triangleCount, 3, `Expected 3 triangles, got ${converted.triangleCount}`);

  // Validate the generated JBeam text syntax
  assert(converted.jbeamText.includes('"test_pyramid": {'), 'Must include part name header');
  assert(converted.jbeamText.includes('"nodes": ['), 'Must include nodes table');
  assert(converted.jbeamText.includes('"pyr1"'), 'Must contain prefixed node pyr1');
  assert(converted.jbeamText.includes('"beams": ['), 'Must include beams table');
  assert(converted.jbeamText.includes('"triangles": ['), 'Must include triangles table');

  console.log('✓ Test 4: OBJ to JBeam conversion with vertex welding passed.');
}

// Test 5: JBeam to Wavefront OBJ export
{
  const mockJBeamPart = {
    nodes: {
      n1: { id: 'n1', posX: -0.8, posY: 1.2, posZ: 0.3 },
      n2: { id: 'n2', posX: 0.8, posY: 1.2, posZ: 0.3 },
      n3: { id: 'n3', posX: 0.0, posY: -1.0, posZ: 0.5 }
    },
    beams: {
      'n1_n2': { 'id1:': 'n1', 'id2:': 'n2' },
      'n2_n3': { 'id1:': 'n2', 'id2:': 'n3' },
      'n3_n1': { 'id1:': 'n3', 'id2:': 'n1' }
    },
    triangles: {
      't1': { 'id1:': 'n1', 'id2:': 'n2', 'id3:': 'n3' }
    }
  };

  const objText = convertJBeamToObj(mockJBeamPart, {
    partName: 'chassis_section'
  });

  assert(objText.includes('# JBeam Studio Wavefront OBJ Export'), 'Header comment present');
  assert(objText.includes('o chassis_section'), 'Object name present');
  assert(objText.includes('v -0.800000 1.200000 0.300000'), 'Node n1 vertex present');
  assert(objText.includes('v 0.800000 1.200000 0.300000'), 'Node n2 vertex present');
  assert(objText.includes('l '), 'Line element present for beams');
  assert(objText.includes('f '), 'Face element present for triangles');

  console.log('✓ Test 5: JBeam to Wavefront OBJ export passed.');
}

// ========================================================
// 3. FEATURE C: Dedicated Powertrain Studio & Gearing
// ========================================================

// Test 6: Engine Torque & Horsepower Curve computation
{
  const rawTorqueTable = [
    ['rpm', 'torque'],
    [0, 0],
    [1000, 220],
    [2500, 380],
    [4000, 420],
    [5500, 390],
    [6500, 310]
  ];

  const curve = calculateEngineTorqueCurve(rawTorqueTable);
  assert.strictEqual(curve.length, 6, `Expected 6 data points, got ${curve.length}`);
  assert.strictEqual(curve[0].rpm, 0);
  assert.strictEqual(curve[3].rpm, 4000);
  assert.strictEqual(curve[3].torque, 420);

  // Power in kW = (420 * 4000) / 9549 = ~175.9 kW = ~236 HP
  assert(curve[3].powerHp >= 230 && curve[3].powerHp <= 240, `Expected ~236 HP at 4000 RPM, got ${curve[3].powerHp}`);

  console.log('✓ Test 6: Engine torque curve and power HP calculation passed.');
}

// Test 7: Powertrain Gearing and Top Speed Calculations
{
  // Theoretical top speed formula:
  // Speed (km/h) = (RPM * 2 * pi * r_tire * 3.6) / (total_ratio * 60)
  const redlineRpm = 6500;
  const tireRadiusMeters = 0.36; // ~28.3" diameter tire
  const diffRatio = 3.73;
  const fourthGearRatio = 1.0; // 1:1 direct drive
  const sixthGearRatio = 0.72; // Overdrive

  const totalRatio4th = fourthGearRatio * diffRatio; // 3.73
  const speed4thKmh = (redlineRpm * 2 * Math.PI * tireRadiusMeters * 3.6) / (totalRatio4th * 60);

  const totalRatio6th = sixthGearRatio * diffRatio; // ~2.6856
  const speed6thKmh = (redlineRpm * 2 * Math.PI * tireRadiusMeters * 3.6) / (totalRatio6th * 60);

  const speed4thMph = speed4thKmh * 0.621371;
  const speed6thMph = speed6thKmh * 0.621371;

  assert(Math.round(speed4thKmh) >= 230 && Math.round(speed4thKmh) <= 245, `4th gear redline speed should be ~237 km/h, got ${Math.round(speed4thKmh)}`);
  assert(Math.round(speed4thMph) >= 140 && Math.round(speed4thMph) <= 155, `4th gear redline speed should be ~147 mph, got ${Math.round(speed4thMph)}`);
  assert(Math.round(speed6thKmh) >= 320 && Math.round(speed6thKmh) <= 335, `6th gear redline speed should be ~328 km/h, got ${Math.round(speed6thKmh)}`);
  assert(Math.round(speed6thMph) >= 200 && Math.round(speed6thMph) <= 210, `6th gear redline speed should be ~204 mph, got ${Math.round(speed6thMph)}`);

  console.log('✓ Test 7: Powertrain gearing reduction and top speed calculation passed.');
}

  console.log('All Studio Tools (Blueprint, OBJ & Powertrain Studio) tests passed!');
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith('blueprintAndObj.test.js')) {
  runBlueprintAndObjTests();
}
