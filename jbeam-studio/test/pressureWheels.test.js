import assert from 'assert';
import { extractPressureWheels, generateWheelSkeleton } from '../src/features/jbeam/pressureWheelsParser.js';
import { buildPressureWheelsGroup } from '../src/features/viewport/pressureWheelVisualizer.js';
import { validateJBeamDocument } from '../src/features/jbeam/jbeamValidator.js';
import { decodeWithMeta } from '../src/features/jbeam/sjsonParser.js';
import { processAllParts } from '../src/features/jbeam/tableSchema.js';

export function runPressureWheelsTests() {
  console.log('--- Running PressureWheels & HubWheels 3D Parser & Skeleton Tests ---');

  // Test 1: Extract PressureWheels from Synthetic Part
  const syntheticJBeam = `{
    "test_spindles": {
      "information": { "name": "Test Spindles" },
      "slotType": "test_spindles",
      "nodes": [
        ["id", "posX", "posY", "posZ"],
        ["fw1rr", -0.75, -1.4, 0.33],
        ["fw1r",  -1.15, -1.4, 0.33],
        ["fw1ll",  0.75, -1.4, 0.33],
        ["fw1l",   1.15, -1.4, 0.33]
      ],
      "pressureWheels": [
        ["name", "hubGroup", "group", "node1:", "node2:", "nodeS", "nodeArm:", "wheelDir"],
        {"radius": 0.35},
        {"hubRadius": 0.20},
        {"tireWidth": 0.22},
        {"hubWidth": 0.20},
        {"numRays": 16},
        {"pressurePSI": 32},
        ["FR", "wheel_FR", "tire_FR", "fw1rr", "fw1r", 9999, "fh5r", 1],
        ["FL", "wheel_FL", "tire_FL", "fw1ll", "fw1l", 9999, "fh5l", -1]
      ]
    }
  }`;

  const bundle = decodeWithMeta(syntheticJBeam, 'test_spindles.jbeam', true);
  const [parsedParts] = processAllParts(bundle.data);
  const part = parsedParts.test_spindles;

  const wheels = extractPressureWheels(part);
  assert.strictEqual(wheels.length, 2, 'Should extract exactly 2 pressure wheels');

  const frWheel = wheels.find(w => w.name === 'FR');
  const flWheel = wheels.find(w => w.name === 'FL');

  assert.ok(frWheel, 'FR wheel must be found');
  assert.strictEqual(frWheel.node1, 'fw1rr');
  assert.strictEqual(frWheel.node2, 'fw1r');
  assert.strictEqual(frWheel.wheelDir, 1);
  assert.strictEqual(frWheel.side, 'right');
  assert.strictEqual(frWheel.radius, 0.35);
  assert.strictEqual(frWheel.hubRadius, 0.20);
  assert.strictEqual(frWheel.tireWidth, 0.22);
  assert.strictEqual(frWheel.numRays, 16);
  assert.strictEqual(frWheel.pressurePSI, 32);

  assert.ok(flWheel, 'FL wheel must be found');
  assert.strictEqual(flWheel.node1, 'fw1ll');
  assert.strictEqual(flWheel.node2, 'fw1l');
  assert.strictEqual(flWheel.wheelDir, -1);
  assert.strictEqual(flWheel.side, 'left');
  console.log('✓ Test 1: PressureWheels table extraction & property normalization passed.');

  // Test 2: Soft-Body Wheel Skeleton Generation (Nodes, Beams & Surfaces)
  const nodesDict = part.nodes;
  const skeletonFR = generateWheelSkeleton(frWheel, nodesDict);

  assert.strictEqual(skeletonFR.hasSpindleNodes, true, 'Must find valid spindle nodes for FR');
  assert.strictEqual(skeletonFR.stats.numRays, 16);

  // 16 rays * 2 hub nodes (in/out) + 16 rays * 2 tire nodes (in/out) = 64 nodes
  const nodeCount = Object.keys(skeletonFR.nodes).length;
  assert.strictEqual(nodeCount, 64, `Expected 64 generated soft-body nodes, got ${nodeCount}`);

  // Check generated node naming
  assert.ok(skeletonFR.nodes['FR_hin_0'], 'Inner hub node must exist');
  assert.ok(skeletonFR.nodes['FR_hout_0'], 'Outer hub node must exist');
  assert.ok(skeletonFR.nodes['FR_tin_0'], 'Inner tire node must exist');
  assert.ok(skeletonFR.nodes['FR_tout_0'], 'Outer tire node must exist');

  // Verify Axis Orthogonality: Axle points outward along negative X for right side
  assert.ok(skeletonFR.axis[0] < -0.9, 'Right wheel axle axis must point lateral negative X');
  assert.strictEqual(skeletonFR.beams.length > 100, true, 'Should generate rich soft-body beam network');
  assert.strictEqual(skeletonFR.surfaces.length, 48, 'Should generate 48 collision quads (tread + 2 sidewalls)');

  // Tread collision quads should have PRESSURE surface type
  const treadQuad = skeletonFR.surfaces.find(s => s.surfaceCategory === 'tread');
  assert.ok(treadQuad, 'Tread surface quad must be generated');
  assert.strictEqual(treadQuad.quadType, 'PRESSURE');
  assert.strictEqual(treadQuad.pressurePSI, 32);
  console.log('✓ Test 2: Soft-body wheel skeleton (nodes, beams, surfaces) math passed.');

  // Test 3: Multi-Part Wheel & Tire Property Inheritance
  // Realistic BeamNG vehicle structure: Suspension defines spindle nodes, Wheel part defines rim, Tire part defines tread
  const multiPartAssembly = {
    suspension_part: {
      slotType: 'suspension',
      nodes: {
        sw1r: { posX: -0.8, posY: 1.2, posZ: 0.35 },
        sw1rr: { posX: -1.2, posY: 1.2, posZ: 0.35 }
      },
      pressureWheels: [
        ["name", "hubGroup", "group", "node1:", "node2:", "nodeS", "nodeArm:", "wheelDir"],
        ["RR", "wheel_RR", "tire_RR", "sw1r", "sw1rr", 9999, "none", 1]
      ]
    },
    rim_part: {
      slotType: 'wheel_RR',
      pressureWheels: [
        {"hubRadius": 0.23},
        {"hubWidth": 0.24},
        {"numRays": 18}
      ]
    },
    tire_part: {
      slotType: 'tire_RR',
      pressureWheels: [
        {"radius": 0.45},
        {"tireWidth": 0.26},
        {"pressurePSI": 40}
      ]
    }
  };

  const inheritedWheels = extractPressureWheels(multiPartAssembly);
  assert.strictEqual(inheritedWheels.length, 1);
  const rr = inheritedWheels[0];
  assert.strictEqual(rr.name, 'RR');
  assert.strictEqual(rr.hubRadius, 0.23, 'Must inherit hubRadius from rim part');
  assert.strictEqual(rr.radius, 0.45, 'Must inherit radius from tire part');
  assert.strictEqual(rr.numRays, 18, 'Must inherit numRays from rim part');
  assert.strictEqual(rr.pressurePSI, 40, 'Must inherit pressurePSI from tire part');
  console.log('✓ Test 3: Multi-part wheel & tire property inheritance passed.');

  // Test 4: Three.js 3D Visualizer Scene Construction
  const threeWheelGroup = buildPressureWheelsGroup([frWheel, flWheel], nodesDict, {
    renderMode: 'both',
    visible: true,
    showLabels: true,
    showSurfaces: true
  });

  assert.strictEqual(threeWheelGroup.name, 'pressure_wheels_root_group');
  assert.strictEqual(threeWheelGroup.children.length, 2, 'Root group should contain 2 wheel groups');

  const frGroup = threeWheelGroup.children.find(c => c.name === 'wheel_FR');
  assert.ok(frGroup, 'wheel_FR group must exist');
  assert.strictEqual(frGroup.userData.type, 'pressureWheel');
  assert.strictEqual(frGroup.userData.wheelName, 'FR');

  // Verify skeleton child elements (nodes group, lines, surfaces, sprite label)
  const nodeSubgroup = frGroup.children.find(c => c.name === 'nodes_FR');
  assert.ok(nodeSubgroup, 'nodes_FR group must exist');
  assert.strictEqual(nodeSubgroup.children.length, 64, 'Must contain 64 node spheres');

  const surfaceMesh = frGroup.children.find(c => c.name === 'surfaces_FR');
  assert.ok(surfaceMesh, 'surfaces_FR mesh must exist');

  const labelSprite = frGroup.children.find(c => c.isSprite);
  assert.ok(labelSprite, 'Billboard HUD label sprite must exist');
  console.log('✓ Test 4: Three.js 3D pressure wheels scene construction passed.');

  // Test 5: JBeam Structural Diagnostics & Problem Detection
  const malformedWheelJBeam = `{
    "bad_wheels": {
      "information": { "name": "Bad Wheels" },
      "slotType": "bad_wheels",
      "nodes": [
        ["id", "posX", "posY", "posZ"],
        ["real_n1", 0, 0, 0]
      ],
      "pressureWheels": [
        ["name", "hubGroup", "group", "node1:", "node2:", "nodeS", "nodeArm:", "wheelDir"],
        {"radius": 0.20},
        {"hubRadius": 0.25}, // Error: hubRadius >= radius
        {"numRays": 15},     // Error: odd numRays
        {"wheelDir": 3},     // Error: invalid wheelDir
        ["FR", "wheel_FR", "tire_FR", "missing_spindle_1", "missing_spindle_2", 9999, "none", 3]
      ]
    }
  }`;

  const diagResult = validateJBeamDocument(malformedWheelJBeam, 'bad_wheels.jbeam', { strictReferences: true });
  assert.strictEqual(diagResult.isValid, false, 'Malformed wheel document must fail validation');

  const msgs = diagResult.problems.map(p => p.message);
  assert.ok(msgs.some(m => m.includes('missing_spindle_1')), 'Must identify missing node1 reference');
  assert.ok(msgs.some(m => m.includes('missing_spindle_2')), 'Must identify missing node2 reference');
  assert.ok(msgs.some(m => m.includes('invalid wheelDir')), 'Must identify invalid wheelDir');
  assert.ok(msgs.some(m => m.includes('invalid numRays')), 'Must identify odd numRays');
  assert.ok(msgs.some(m => m.includes('must be strictly smaller than tire radius')), 'Must identify inverted hubRadius/radius');
  console.log('✓ Test 5: JBeam structural diagnostics & problem detection passed.');

  // Test 6: Cross-Tab / External Folder Context Inheritance (extraContextParts)
  const standaloneSuspJBeam = `{
    "susp_front": {
      "slotType": "susp_front",
      "nodes": [
        ["id", "posX", "posY", "posZ"],
        ["fw1rr", -0.78, -1.42, 0.34],
        ["fw1r",  -1.12, -1.42, 0.34]
      ],
      "pressureWheels": [
        ["name", "hubGroup", "group", "node1:", "node2:", "nodeS", "nodeArm:", "wheelDir"],
        ["FR", "wheel_F_common", "tire_F_common", "fw1rr", "fw1r", 9999, "fh5r", 1]
      ]
    }
  }`;
  const externalCommonWheelJBeam = `{
    "common_wheel_F": {
      "slotType": "wheel_F_common",
      "pressureWheels": [
        {"radius": 0.38},
        {"hubRadius": 0.24},
        {"tireWidth": 0.255},
        {"hubWidth": 0.22},
        {"numRays": 16}
      ]
    }
  }`;
  const suspBundle = decodeWithMeta(standaloneSuspJBeam, 'susp_front.jbeam', true);
  const [suspParts] = processAllParts(suspBundle.data);
  const extWheelBundle = decodeWithMeta(externalCommonWheelJBeam, '../common/wheels/common_wheel.jbeam', true);
  const [extWheelParts] = processAllParts(extWheelBundle.data);

  const crossFolderWheels = extractPressureWheels(suspParts, extWheelParts);
  assert.strictEqual(crossFolderWheels.length, 1, 'Should resolve front wheel using external context part');
  assert.strictEqual(crossFolderWheels[0].radius, 0.38, 'Must inherit tire radius from sibling common/external tab');
  assert.strictEqual(crossFolderWheels[0].hubRadius, 0.24, 'Must inherit hubRadius from sibling common/external tab');
  assert.strictEqual(crossFolderWheels[0].tireWidth, 0.255, 'Must inherit tireWidth from sibling common/external tab');
  console.log('✓ Test 6: Cross-folder / open-tab external PressureWheels context inheritance passed.');

  // Test 7: Standalone Wheel File Synthesis & Hub Anchor Fallback
  const standaloneWheelOnlyJBeam = `{
    "custom_wheel_F": {
      "slotType": "wheel_F_5",
      "nodes": [
        ["id", "posX", "posY", "posZ"],
        ["fw1rr", -0.80, -1.40, 0.34],
        ["fw1r",  -1.08, -1.40, 0.34]
      ],
      "pressureWheels": [
        {"radius": 0.36},
        {"hubRadius": 0.21},
        {"tireWidth": 0.24},
        {"hubWidth": 0.20},
        {"numRays": 16}
      ]
    }
  }`;
  const swBundle = decodeWithMeta(standaloneWheelOnlyJBeam, 'custom_wheel_F.jbeam', true);
  const [swParts] = processAllParts(swBundle.data);
  const synthWheels = extractPressureWheels(swParts);
  assert.ok(synthWheels.length >= 1, 'Standalone wheel file with options + fw1 nodes should synthesize preview wheel');
  const synthFR = synthWheels.find(w => w.name === 'FR');
  assert.ok(synthFR, 'Synthesized standalone wheel should identify FR from fw1rr/fw1r');
  assert.strictEqual(synthFR.radius, 0.36);

  // Hub anchor fallback when spindle fw1rr/fw1r nodes are absent and only nodeArm / hub node exists
  const hubFallbackSkel = generateWheelSkeleton(
    { name: 'FR', side: 'right', node1: 'fw1rr', node2: 'fw1r', nodeArm: 'fh5r', radius: 0.34, hubRadius: 0.20, tireWidth: 0.22, hubWidth: 0.20, numRays: 16 },
    { fh5r: { posX: -0.72, posY: -1.33, posZ: 0.36 } }
  );
  assert.strictEqual(hubFallbackSkel.hasSpindleNodes, false, 'Fallback should report spindle nodes missing');
  assert.ok(Math.abs(hubFallbackSkel.hubCenter[1] - (-1.33)) < 0.05, 'Fallback wheel center should anchor near nodeArm fh5r Y coordinate');
  console.log('✓ Test 7: Standalone wheel file synthesis & hub anchor fallback passed.');

  // Test 8: Truck Multi-Axle, Dually Sequential wheelOffset, disable Expressions & Missing Anchor Guard
  const truckDuallyAssembly = {
    percheron_hubs_R_1: {
      slotType: 'percheron_hubs_R_1',
      nodes: {
        dw1r: { posX: -0.53, posY: 2.077, posZ: 0.539 },
        dw1rr: { posX: -1.12, posY: 2.077, posZ: 0.539 }
      },
      pressureWheels: [
        { hubRadius: 0.22 },
        { hubWidth: 0.1 },
        { hasTire: false }
      ]
    },
    steelwheel_R_1_eu10: {
      slotType: 'wheel_R_1_eu10',
      flexbodies: [
        ['steelwheel_19_22.5x9', ['wheel_R1RR', 'wheelhub_R1RR'], []],
        ['steelwheel_19_22.5x9', ['wheel_R1R', 'wheelhub_R1RR'], []]
      ],
      pressureWheels: [
        { hubRadius: 0.289 },
        { hubWidth: '$=$components.simplifiedDuallies==true and 0.59 or 0.25' },
        { numRays: '$=$components.simplifiedDuallies==true and 16 or 12' }
      ]
    },
    percheron_tire_R_1: {
      slotType: 'percheron_tire_R_1',
      flexbodies: [
        ['tire_02a_315_22.5', ['wheel_R1RR', 'tire_R1RR'], []],
        ['tire_02a_315_22.5', ['wheel_R1R', 'tire_R1R'], []]
      ],
      pressureWheels: [
        { radius: 0.505 },
        { tireWidth: '$=$components.simplifiedDuallies==true and 0.59 or 0.265' },
        { hasTire: true }
      ]
    },
    percheron_wheeldata_R_1: {
      slotType: 'percheron_wheeldata_R_1',
      pressureWheels: [
        ['name', 'hubGroup', 'group', 'node1:', 'node2:', 'nodeS', 'nodeArm:', 'wheelDir'],
        { disable: '$=$components.simplifiedDuallies~=true' },
        { wheelOffset: -0.08 },
        ['R1RR', 'wheel_R1RR', 'tire_R1RR', 'dw1rr', 'dw1r', 9999, '1ax1r', 1],
        { disable: '$=$components.simplifiedDuallies==true' },
        { wheelOffset: -0.255 },
        ['R1RR', 'wheel_R1RR', 'tire_R1RR', 'dw1rr', 'dw1r', 9999, '1ax1r', 1],
        { wheelOffset: 0.09 },
        ['R1R', 'wheel_R1R', 'tire_R1R', 'dw1rr', 'dw1r', 9999, '1ax1r', 1],
        { disable: false }
      ]
    }
  };

  const truckWheels = extractPressureWheels(truckDuallyAssembly);
  assert.strictEqual(truckWheels.length, 2, 'Should extract both outer (R1RR) and inner (R1R) dually wheels');
  const r1rr = truckWheels.find(w => w.name === 'R1RR');
  const r1r = truckWheels.find(w => w.name === 'R1R');
  assert.ok(r1rr && r1r, 'Both R1RR and R1R must be extracted');
  assert.strictEqual(r1rr.wheelOffset, -0.255, 'Outer dually must preserve sequential wheelOffset -0.255');
  assert.strictEqual(r1r.wheelOffset, 0.09, 'Inner dually must preserve sequential wheelOffset 0.09');
  assert.strictEqual(r1rr.radius, 0.505, 'Truck tire radius 0.505 must be preserved');
  assert.strictEqual(r1rr.hubRadius, 0.289, 'Truck rim hubRadius 0.289 must not be overwritten by bare hub 0.22');
  assert.strictEqual(r1rr.tireWidth, 0.265, 'Lua expression tireWidth must evaluate to 0.265');
  assert.strictEqual(r1rr.hasTire, true, 'Bare hub hasTire:false must not override tire hasTire:true');

  const r1rrSkel = generateWheelSkeleton(r1rr, truckDuallyAssembly.percheron_hubs_R_1.nodes);
  const r1rSkel = generateWheelSkeleton(r1r, truckDuallyAssembly.percheron_hubs_R_1.nodes);
  assert.ok(Math.abs(r1rrSkel.hubCenter[0] - (-1.08)) < 0.01, `Expected outer dually X ~ -1.08, got ${r1rrSkel.hubCenter[0]}`);
  assert.ok(Math.abs(r1rSkel.hubCenter[0] - (-0.735)) < 0.01, `Expected inner dually X ~ -0.735, got ${r1rSkel.hubCenter[0]}`);

  const orphanSkel = generateWheelSkeleton(
    { name: 'ORPHAN', side: 'right', node1: 'missing1', node2: 'missing2', radius: 0.33, hubRadius: 0.2, tireWidth: 0.22, hubWidth: 0.2, numRays: 12 },
    truckDuallyAssembly.percheron_hubs_R_1.nodes
  );
  assert.strictEqual(orphanSkel.missingAnchor, true, 'Orphan wheel with missing spindle/hub nodes in populated vehicle must flag missingAnchor');

  // Test 9: Processed slots2 nodeOffset alignment (Bastion-style external common/wheels)
  const bastionStyleJBeam = `{
    "bastion_suspension_F": {
      "slotType": "bastion_suspension_F",
      "slots2": [
        ["name", "allowTypes", "denyTypes", "default", "description"],
        ["wheel_F_5", ["wheel_F_5"], [], "bruckell_wheel_03a_20x8_F", "Front Wheels", {"nodeOffset":{"x":"$=$trackoffset_F+0.315", "y":-1.526, "z":0.365}}]
      ],
      "variables": [
        ["name", "type", "unit", "category", "default", "min", "max", "title", "description"],
        ["$trackoffset_F", "range", "+m", "Wheels", 0.0, -0.02, 0.05, "Wheel Offset", "Spacing"]
      ],
      "nodes": [
        ["id", "posX", "posY", "posZ"],
        ["fh5r", -0.81, -1.401, 0.36]
      ]
    },
    "bastion_wheeldata_F": {
      "slotType": "bastion_wheeldata_F",
      "pressureWheels": [
        ["name", "hubGroup", "group", "node1:", "node2:", "nodeS", "nodeArm:", "wheelDir"],
        ["FR", "wheel_FR", "tire_FR", "fw1rr", "fw1r", 9999, "fh5r", 1]
      ]
    }
  }`;
  const bastionBundle = decodeWithMeta(bastionStyleJBeam, 'bastion_suspension_F.jbeam', true);
  const [bastionParts] = processAllParts(bastionBundle.data);
  const bastionWheels = extractPressureWheels(bastionParts);
  assert.strictEqual(bastionWheels.length, 1);
  assert.ok(bastionWheels[0].slotNodeOffset, 'Processed slots2 nodeOffset must be extracted');
  assert.strictEqual(bastionWheels[0].slotNodeOffset.y, -1.526);
  const bastionSkel = generateWheelSkeleton(bastionWheels[0], bastionParts.bastion_suspension_F.nodes);
  assert.ok(Math.abs(bastionSkel.hubCenter[1] - (-1.526)) < 1e-4, `Expected Y=-1.526 from slots2 nodeOffset, got ${bastionSkel.hubCenter[1]}`);
  console.log('✓ Test 8 & 9: Truck multi-axle dually + processed slots2 nodeOffset alignment passed.');

  console.log('All PressureWheels & HubWheels tests passed successfully!');
}

if (process.argv[1] && process.argv[1].endsWith('pressureWheels.test.js')) {
  runPressureWheelsTests();
}
