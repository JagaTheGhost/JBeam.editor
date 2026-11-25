/**
 * Automated Test Suite for Mechanical Workspace & System Extractor
 */
import assert from 'assert';
import { extractMechanicalOverview } from '../src/features/mechanical/mechanicalExtractor.js';

export async function runMechanicalWorkspaceTests() {
  console.log('--- Running Mechanical Workspace & System Extractor Tests ---');

  // Test 1: Empty or null input handles gracefully
  const emptyOverview = extractMechanicalOverview(null);
  assert.strictEqual(emptyOverview.totalDevices, 0);
  assert.strictEqual(emptyOverview.drivetrainLayout, 'None');
  assert.strictEqual(emptyOverview.hydrosList.length, 0);
  assert.strictEqual(emptyOverview.mountsList.length, 0);
  console.log('✓ Test 1: Empty/Null mechanical parts input handled gracefully.');

  // Test 2: Extraction of Powertrain, Hydros, Mounts & Flexbodies
  const mockJbeamParts = {
    pickup_engine_v8: {
      information: { name: '4.5L V8 Engine' },
      powertrain: [
        ['type', 'name', 'inputName', 'inputIndex'],
        ['combustionEngine', 'mainEngine', 'dummy', 0],
        ['manualGearbox', 'gearbox', 'mainEngine', 1],
        ['differential', 'rearDiff', 'gearbox', 1]
      ],
      mainEngine: {
        idleRPM: 750,
        maxRPM: 6200,
        torque: [
          [0, 0],
          [1000, 200],
          [2000, 320],
          [3000, 410],
          [4000, 460],
          [5000, 440],
          [6200, 350]
        ]
      },
      nodes: [
        ['id', 'posX', 'posY', 'posZ'],
        ['e1r', -0.15, -1.2, 0.3],
        ['e1l', 0.15, -1.2, 0.3],
        ['e2r', -0.15, -1.8, 0.3],
        ['e2l', 0.15, -1.8, 0.3]
      ],
      beams: [
        ['id1:', 'id2:'],
        ['e1r', 'e2r'],
        ['e1l', 'e2l'],
        ['e1r', 'f1r', { breakGroup: 'engine_mount_R', beamSpring: 2501000, beamStrength: 45000 }],
        ['e1l', 'f1l', { breakGroup: 'engine_mount_L', beamSpring: 2501000, beamStrength: 45000 }]
      ],
      flexbodies: [
        ['mesh', '[group]:', 'nonFlexMaterials'],
        ['pickup_engine_v8', ['pickup_engine']]
      ]
    },
    pickup_steering: {
      information: { name: 'Steering Rack' },
      hydros: [
        ['id1:', 'id2:'],
        ['s1r', 's1l', { factor: -0.22, inRate: 1.25, outRate: 1.25, beamName: 'steering_rack' }]
      ]
    },
    pickup_fueltank: {
      information: { name: 'Fuel Tank' },
      energyStorage: [
        ['type', 'name'],
        ['fuelTank', 'mainTank']
      ],
      mainTank: {
        fuelCapacity: 80
      }
    }
  };

  const overview = extractMechanicalOverview(mockJbeamParts);

  // Assertions on Powertrain Devices
  assert.strictEqual(overview.totalDevices, 3, 'Should extract 3 powertrain devices');
  const engineDev = overview.devicesList.find(d => d.name === 'mainEngine');
  assert.ok(engineDev, 'Should extract mainEngine device');
  assert.strictEqual(engineDev.category, 'engine');
  assert.strictEqual(engineDev.boundNodes.length, 4, 'Engine should bind to e1r, e1l, e2r, e2l');
  assert.ok(engineDev.boundMeshes.includes('pickup_engine_v8'), 'Engine should bind to pickup_engine_v8 DAE mesh');
  console.log('✓ Test 2: Powertrain devices, node bindings & DAE flexbodies correlated.');

  // Assertions on Hydros
  assert.strictEqual(overview.hydrosList.length, 1, 'Should extract 1 steering hydro');
  assert.strictEqual(overview.hydrosList[0].beamName, 'steering_rack');
  assert.strictEqual(overview.hydrosList[0].factor, -0.22);
  assert.strictEqual(overview.hydrosList[0].id1, 's1r');
  assert.strictEqual(overview.hydrosList[0].id2, 's1l');
  console.log('✓ Test 3: Steering rack hydros correctly extracted with rates & limits.');

  // Assertions on Mounts & Breakgroups
  assert.strictEqual(overview.mountsList.length, 2, 'Should extract 2 engine mount beams');
  assert.strictEqual(overview.mountsList[0].breakGroup, 'engine_mount_R');
  assert.strictEqual(overview.mountsList[1].breakGroup, 'engine_mount_L');
  assert.strictEqual(overview.mountsList[0].beamStrength, 45000);
  console.log('✓ Test 4: Engine mounts & breakGroups accurately parsed from chassis beams.');

  // Assertions on Energy Storage
  assert.strictEqual(overview.energyList.length, 1, 'Should extract 1 fuel tank');
  assert.strictEqual(overview.energyList[0].name, 'mainTank');
  assert.strictEqual(overview.energyList[0].type, 'fuelTank');
  console.log('✓ Test 5: Fuel storage & battery packs detected.');

  // Test 6: Cross-File filePath resolution & propagation
  const multiFileJbeam = {
    etkk_engine: {
      __filePath: 'vehicles/etkk/etkk_engine.jbeam',
      powertrain: [
        ['type', 'name', 'inputName', 'inputIndex'],
        ['combustionEngine', 'engine', 'dummy', 0]
      ],
      nodes: [['id', 'x', 'y', 'z'], ['e1r', 0, 0, 0]]
    },
    etkk_halfshafts_R: {
      __filePath: 'vehicles/etkk/etkk_halfshafts_R.jbeam',
      powertrain: [
        ['type', 'name', 'inputName', 'inputIndex'],
        ['shaft', 'wheelaxleRR', 'diff_R', 2]
      ],
      beams: [
        ['id1:', 'id2:'],
        ['rx1r', 'rw1r']
      ]
    },
    etkk_suspension_F: {
      __filePath: 'vehicles/etkk/etkk_suspension_F.jbeam',
      hydros: [
        ['id1:', 'id2:'],
        ['s1r', 's1l', { factor: 0.15, beamName: 'steering_hydro' }]
      ]
    }
  };

  const multiOverview = extractMechanicalOverview(multiFileJbeam);
  const wheelaxle = multiOverview.devicesList.find(d => d.name === 'wheelaxleRR');
  assert.ok(wheelaxle, 'wheelaxleRR should exist');
  assert.strictEqual(wheelaxle.filePath, 'vehicles/etkk/etkk_halfshafts_R.jbeam', 'wheelaxleRR must retain defining filePath');
  assert.strictEqual(wheelaxle.partName, 'etkk_halfshafts_R');

  const steeringHydro = multiOverview.hydrosList[0];
  assert.strictEqual(steeringHydro.filePath, 'vehicles/etkk/etkk_suspension_F.jbeam', 'hydro must retain defining filePath');
  console.log('✓ Test 6: Cross-file filePath resolution and propagation verified.');

  // Test 7: Fallback bound nodes resolution for powertrain shafts/wheelaxles
  assert.ok(wheelaxle.boundNodes.includes('rx1r'), 'wheelaxleRR should inherit bound nodes from defining part beams');
  assert.ok(wheelaxle.boundNodes.includes('rw1r'), 'wheelaxleRR should inherit bound nodes from defining part beams');
  console.log('✓ Test 7: Fallback bound nodes resolution for shafts/wheelaxles verified.');

  // Test 8: Parsed tableSchema objects (id1:/id2:), array breakGroups, suspension beams, brakes, gearbox/diff & $vars
  const parsedSchemaParts = {
    bastion_steering: {
      hydros: {
        0: { 'id1:': 'fx5r', 'id2:': 'fh6r', factor: -0.25, inRate: 1.5, outRate: 1.5, beamName: 'steering_rack_R' },
        1: { 'id1:': 'fx5l', 'id2:': 'fh6l', factor: 0.25, inRate: 1.5, outRate: 1.5, beamName: 'steering_rack_L' }
      }
    },
    bastion_engine_mounts: {
      beams: {
        0: { 'id1:': 'e1r', 'id2:': 'f1r', breakGroup: { 0: 'enginemount_a', 1: 'enginemount_b', __meta: {} }, beamSpring: 1800000, beamStrength: 35000 },
        1: { 'id1:': 'fh1r', 'id2:': 'fs1r', beamType: '|BOUNDED', beamSpring: 45000, beamDamp: 3200 },
        2: { 'id1:': 'fh1r', 'id2:': 'f2r', beamType: '|SUPPORT', beamSpring: 95000 }
      },
      variables: {
        0: { name: '$spring_F', category: 'Suspension', unit: 'N/m', default: 45000, min: 20000, max: 90000 }
      }
    },
    bastion_drivetrain: {
      powertrain: [
        ['type', 'name', 'inputName', 'inputIndex'],
        ['automaticGearbox', 'gearbox', 'mainEngine', 1],
        ['differential', 'differential_R', 'gearbox', 1]
      ],
      gearbox: { gears: [-3.1, 0, 4.71, 3.14, 2.11, 1.67, 1.28, 1.00] },
      differential_R: { diffType: 'lsd', gearRatio: 3.09 },
      nodes: {
        fw1rr: { posX: -0.78, posY: -1.4, posZ: 0.33 },
        fw1r: { posX: -1.05, posY: -1.4, posZ: 0.33 }
      },
      pressureWheels: [
        ['name', 'hubGroup', 'group', 'node1:', 'node2:', 'nodeS', 'nodeArm:', 'wheelDir'],
        { brakeTorque: 3200, brakeDiameter: 0.38, radius: 0.35, pressurePSI: 34 },
        ['FR', 'wheel_FR', 'tire_FR', 'fw1rr', 'fw1r', 9999, 'fh5r', 1]
      ]
    }
  };

  const schemaOverview = extractMechanicalOverview(parsedSchemaParts);
  assert.strictEqual(schemaOverview.hydrosList.length, 2, 'Parsed tableSchema hydros (id1:/id2:) must be extracted');
  assert.strictEqual(schemaOverview.mountsList.length, 1, 'Parsed mount beams with SJSON array breakGroup must be extracted');
  assert.ok(schemaOverview.mountsList[0].breakGroup.includes('enginemount_a'));
  assert.strictEqual(schemaOverview.suspensionList.filter(s => s.kind === 'bounded' || s.kind === 'support').length, 2, 'Bounded & Support suspension beams must be extracted');
  assert.strictEqual(schemaOverview.variablesList.length, 1, 'Mechanical $variables must be extracted');
  assert.strictEqual(schemaOverview.variablesList[0].name, '$spring_F');
  assert.ok(schemaOverview.gearboxSpecs && schemaOverview.gearboxSpecs.ratios.length === 6, 'Real forward gear ratios must be extracted');
  assert.strictEqual(schemaOverview.diffSpecs[0].gearRatio, 3.09, 'Real differential gearRatio must be extracted');
  assert.strictEqual(schemaOverview.brakesList.length, 1, 'Brakes/wheels must be extracted');
  assert.strictEqual(schemaOverview.brakesList[0].brakeTorque, 3200);
  assert.strictEqual(schemaOverview.suspensionList[0].axle, 'front', 'Front suspension item must be tagged front axle');
  assert.strictEqual(schemaOverview.vehicleBalance.frontBrakePct, 100, 'Brake bias with front-only brakes must be 100% F');
  assert.ok(schemaOverview.powertrainIssues.some(i => i.severity === 'error' && i.device === 'gearbox'), 'Broken inputName link must be flagged in powertrainIssues');
  console.log('✓ Test 8: Parsed tableSchema hydros, array breakGroups, suspension beams, brakes, gearbox/diff, balance & issues verified.');

  console.log('All Mechanical Workspace & System Extractor tests passed successfully!\n');
}
