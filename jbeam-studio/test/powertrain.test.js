/**
 * Automated Test Suite for Powertrain & Drivetrain Architecture Parser
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parsePowertrainGraph,
  getDeviceCategory,
  calculateGearShiftDrops,
  calculateSawtoothCurve,
  updateGearboxRatiosInText
} from '../src/features/powertrain/powertrainParser.js';
import { decodeWithMeta } from '../src/features/jbeam/sjsonParser.js';
import { processAllParts } from '../src/features/jbeam/tableSchema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runPowertrainTests() {
  console.log('--- Running Powertrain & Drivetrain Architecture Tests ---');

  // -------------------------------------------------------------------------
  // Test 1: Device Category Mapping
  // -------------------------------------------------------------------------
  assert.strictEqual(getDeviceCategory('combustionEngine'), 'engine');
  assert.strictEqual(getDeviceCategory('electricMotor'), 'engine');
  assert.strictEqual(getDeviceCategory('frictionClutch'), 'coupling');
  assert.strictEqual(getDeviceCategory('torqueConverter'), 'coupling');
  assert.strictEqual(getDeviceCategory('manualGearbox'), 'gearbox');
  assert.strictEqual(getDeviceCategory('automaticGearbox'), 'gearbox');
  assert.strictEqual(getDeviceCategory('rangeBox'), 'gearbox');
  assert.strictEqual(getDeviceCategory('transfercase'), 'transfercase');
  assert.strictEqual(getDeviceCategory('differential'), 'differential');
  assert.strictEqual(getDeviceCategory('shaft'), 'shaft');
  assert.strictEqual(getDeviceCategory('wheelaxle'), 'shaft');
  assert.strictEqual(getDeviceCategory('hydrodynamicRetarder'), 'accessory');
  console.log('✓ Test 1: Powertrain device category mapping passed.');

  // -------------------------------------------------------------------------
  // Test 2: Single Part Engine Parsing & Dyno Curve Calculation
  // -------------------------------------------------------------------------
  const engineFixture = {
    test_v8_engine: {
      information: { name: "4.5L V8 Engine" },
      powertrain: [
        ["type", "name", "inputName", "inputIndex"],
        ["combustionEngine", "mainEngine", "dummy", 0]
      ],
      mainEngine: {
        idleRPM: 800,
        maxRPM: 6800,
        inertia: 0.18,
        friction: 14,
        torque: [
          ["rpm", "torque"],
          [0, 0],
          [1000, 280],
          [2000, 390],
          [3500, 480],
          [4800, 520],
          [5800, 490],
          [6800, 410]
        ]
      }
    }
  };

  const graph1 = parsePowertrainGraph(engineFixture);
  assert.strictEqual(graph1.totalDevices, 1);
  assert.strictEqual(graph1.roots.length, 1);
  assert.strictEqual(graph1.roots[0], 'mainEngine');
  assert.ok(graph1.engineSpecs, 'Engine specs must be calculated');
  assert.strictEqual(graph1.engineSpecs.idleRpm, 800);
  assert.strictEqual(graph1.engineSpecs.maxRpm, 6800);
  assert.strictEqual(graph1.engineSpecs.peakTorqueNm, 520);
  assert.strictEqual(graph1.engineSpecs.peakTorqueRpm, 4800);
  // Power at 5800 RPM: (490 * 5800) / 9549 = ~297.6 kW = ~399 HP
  assert.ok(graph1.engineSpecs.peakPowerHp > 380, 'Peak HP should be calculated correctly');
  assert.strictEqual(graph1.engineSpecs.torqueCurve.length, 7);
  console.log('✓ Test 2: Engine torque curve & peak power calculation passed.');

  // -------------------------------------------------------------------------
  // Test 3: Complete Drivetrain Assembly & Topological DAG Ordering
  // -------------------------------------------------------------------------
  const fullDrivetrainFixture = {
    engine_part: {
      powertrain: [
        ["type", "name", "inputName", "inputIndex"],
        ["combustionEngine", "mainEngine", "dummy", 0]
      ],
      mainEngine: { idleRPM: 700, maxRPM: 6000 }
    },
    trans_part: {
      powertrain: [
        ["type", "name", "inputName", "inputIndex"],
        ["frictionClutch", "clutch", "mainEngine", 1],
        ["manualGearbox", "gearbox", "clutch", 1, { gearRatios: [-3.8, 0, 3.9, 2.3, 1.5, 1.0, 0.75] }]
      ]
    },
    tcase_part: {
      powertrain: [
        ["type", "name", "inputName", "inputIndex"],
        ["transfercase", "transfercase", "gearbox", 1],
        ["differential", "differential_F", "transfercase", 1, { diffType: ["open", "locked"], gearRatio: 4.10 }],
        ["differential", "differential_R", "transfercase", 2, { diffType: ["lsd", "locked"], gearRatio: 4.10 }]
      ]
    },
    axles_part: {
      powertrain: [
        ["type", "name", "inputName", "inputIndex"],
        ["shaft", "wheelaxle_FL", "differential_F", 1],
        ["shaft", "wheelaxle_FR", "differential_F", 2],
        ["shaft", "wheelaxle_RL", "differential_R", 1],
        ["shaft", "wheelaxle_RR", "differential_R", 2]
      ]
    }
  };

  const graph2 = parsePowertrainGraph(fullDrivetrainFixture);
  assert.strictEqual(graph2.totalDevices, 10, 'Should have 10 total devices (1 engine, 1 clutch, 1 gearbox, 1 tcase, 2 diffs, 4 axles)');
  assert.strictEqual(graph2.edges.length, 9, 'Should have 9 torque-flow edges');
  assert.strictEqual(graph2.roots.length, 1);
  assert.strictEqual(graph2.roots[0], 'mainEngine');
  assert.strictEqual(graph2.drivetrainLayout, '4WD', 'Dual axle driven with transfer case must be 4WD');

  // Verify downstream child branches
  const tc = graph2.devices['transfercase'];
  assert.ok(tc, 'transfercase must exist');
  assert.strictEqual(tc.children.length, 2, 'transfercase must branch to 2 outputs (F and R differentials)');
  assert.strictEqual(tc.children[0].name, 'differential_F');
  assert.strictEqual(tc.children[1].name, 'differential_R');

  // Verify terminal leaf devices
  assert.strictEqual(graph2.terminals.length, 4, 'Must have 4 terminal wheel axles');
  assert.ok(graph2.terminals.includes('wheelaxle_FL'));
  assert.ok(graph2.terminals.includes('wheelaxle_RR'));
  console.log('✓ Test 3: Complete drivetrain DAG & 4WD layout resolution passed.');

  // -------------------------------------------------------------------------
  // Test 4: FWD and RWD Classification
  // -------------------------------------------------------------------------
  const fwdFixture = {
    fwd_car: {
      powertrain: [
        ["type", "name", "inputName", "inputIndex"],
        ["combustionEngine", "mainEngine", "dummy", 0],
        ["manualGearbox", "transaxle", "mainEngine", 1],
        ["differential", "differential_F", "transaxle", 1],
        ["shaft", "wheelaxle_FL", "differential_F", 1],
        ["shaft", "wheelaxle_FR", "differential_F", 2]
      ]
    }
  };
  const fwdGraph = parsePowertrainGraph(fwdFixture);
  assert.strictEqual(fwdGraph.drivetrainLayout, 'FWD', 'Must detect FWD');

  const rwdFixture = {
    rwd_car: {
      powertrain: [
        ["type", "name", "inputName", "inputIndex"],
        ["combustionEngine", "mainEngine", "dummy", 0],
        ["manualGearbox", "gearbox", "mainEngine", 1],
        ["differential", "differential_R", "gearbox", 1],
        ["shaft", "wheelaxle_RL", "differential_R", 1],
        ["shaft", "wheelaxle_RR", "differential_R", 2]
      ]
    }
  };
  const rwdGraph = parsePowertrainGraph(rwdFixture);
  assert.strictEqual(rwdGraph.drivetrainLayout, 'RWD', 'Must detect RWD');
  console.log('✓ Test 4: FWD and RWD classification passed.');

  // -------------------------------------------------------------------------
  // Test 5: Real Cherrier Percheron Mod Engine & Transmission Verification
  // -------------------------------------------------------------------------
  const enginePath = path.resolve(__dirname, '../../percheron/vehicles/percheron/jbeams/mechanical/percheron_engine.jbeam');
  if (fs.existsSync(enginePath)) {
    const rawSjson = fs.readFileSync(enginePath, 'utf-8');
    const bundle = decodeWithMeta(rawSjson, 'percheron_engine.jbeam', false);
    const diagnostics = [];
    const [parts] = processAllParts(bundle.data, diagnostics);

    assert.ok(parts['percheron_engine_I6'], 'Must parse percheron_engine_I6');
    const realGraph = parsePowertrainGraph({ percheron_engine_I6: parts['percheron_engine_I6'] });

    assert.ok(realGraph.engineSpecs, 'Must extract real Cherrier Percheron 12.8L I6 Diesel engine specs');
    assert.strictEqual(realGraph.engineSpecs.idleRpm, 630);
    assert.strictEqual(realGraph.engineSpecs.maxRpm, 3300);
    assert.strictEqual(realGraph.engineSpecs.peakTorqueNm, 854);
    assert.strictEqual(realGraph.engineSpecs.peakTorqueRpm, 1000);
    console.log(`  Parsed Real Truck Engine: ${realGraph.engineSpecs.peakTorqueNm} Nm @ ${realGraph.engineSpecs.peakTorqueRpm} RPM, Peak Power: ${realGraph.engineSpecs.peakPowerHp} HP`);
    console.log('✓ Test 5: Real Cherrier Percheron truck engine verified.');
  }

  // -------------------------------------------------------------------------
  // Test 6: Powertrain Diagnostic Linter (Broken inputs, missing wheel bindings)
  // -------------------------------------------------------------------------
  const brokenFixture = {
    broken_vehicle: {
      powertrain: [
        ["type", "name", "inputName", "inputIndex"],
        ["combustionEngine", "mainEngine", "dummy", 0],
        ["manualGearbox", "gearbox", "unknown_clutch", 1], // error: broken input
        ["shaft", "wheelaxle_RL", "gearbox", 1] // warning: terminal shaft missing connectedWheel
      ]
    }
  };
  const brokenGraph = parsePowertrainGraph(brokenFixture);
  assert.ok(brokenGraph.diagnostics.length >= 2, 'Must detect at least 2 diagnostics');
  const missingInputErr = brokenGraph.diagnostics.find(d => d.type === 'missing_input');
  assert.ok(missingInputErr, 'Must identify broken input error');
  assert.strictEqual(missingInputErr.deviceId, 'gearbox');

  const missingWheelWarn = brokenGraph.diagnostics.find(d => d.type === 'missing_wheel_binding');
  assert.ok(missingWheelWarn, 'Must identify missing wheel binding warning on terminal shaft');
  assert.strictEqual(missingWheelWarn.deviceId, 'wheelaxle_RL');
  console.log('✓ Test 6: Powertrain Diagnostic Linter passed.');

  // -------------------------------------------------------------------------
  // Test 7: Gear Shift Drop and Upshift RPM Calculations
  // -------------------------------------------------------------------------
  const ratios = [-3.4, 0, 3.8, 2.2, 1.5, 1.15, 0.9, 0.75];
  const shiftDrops = calculateGearShiftDrops(ratios, 3.73, 6500, 0.36);
  assert.strictEqual(shiftDrops.length, 6, 'Must calculate for 6 forward gears');
  
  // 1st gear check: ratio 3.8
  assert.strictEqual(shiftDrops[0].gearNum, 1);
  assert.strictEqual(shiftDrops[0].ratio, 3.8);
  assert.strictEqual(shiftDrops[0].topSpeedKmh, 62);
  // Upshift to 2nd (ratio 2.2): 6500 * (2.2 / 3.8) = 3763 RPM
  assert.strictEqual(shiftDrops[0].nextGearRpm, 3763);
  assert.strictEqual(shiftDrops[0].rpmDrop, 2737);
  assert.strictEqual(shiftDrops[0].rpmDropPercent, 42);

  // 2nd gear check: ratio 2.2 -> 3rd (1.5): 6500 * (1.5 / 2.2) = 4432 RPM
  assert.strictEqual(shiftDrops[1].nextGearRpm, 4432);
  assert.strictEqual(shiftDrops[1].rpmDrop, 2068);

  // Top gear check (6th): no next gear
  assert.strictEqual(shiftDrops[5].nextGearRpm, null);
  assert.strictEqual(shiftDrops[5].topSpeedKmh, 315);
  console.log('✓ Test 7: Gear shift drop & RPM calculations verified.');

  // -------------------------------------------------------------------------
  // Test 8: Transmission Sawtooth Shift-Drop Curve Data Generation
  // -------------------------------------------------------------------------
  const sawtooth = calculateSawtoothCurve(ratios, 3.73, 6500, 800, 0.36);
  assert.strictEqual(sawtooth.gearLines.length, 6);
  assert.strictEqual(sawtooth.gearLines[0].entryRpm, 800);
  assert.strictEqual(sawtooth.gearLines[0].exitRpm, 6500);
  assert.strictEqual(sawtooth.gearLines[1].entryRpm, 3763);
  assert.ok(sawtooth.maxSpeedKmh > 300);
  console.log('✓ Test 8: Transmission sawtooth shift-drop curve generation passed.');

  // -------------------------------------------------------------------------
  // Test 9: Lossless JBeam Code Update for Gearbox & Differential Ratios
  // -------------------------------------------------------------------------
  const jbeamOriginal = `{
  "pickup_transmission_5M": {
    "information": { "name": "5-Speed Manual" },
    "gearbox": {
      "gearRatios": [-3.5, 0, 3.9, 2.3, 1.5, 1.0, 0.78],
      "friction": 1.2
    },
    "differential_R": {
      "gearRatio": 4.10
    }
  }
}`;

  const updatedJBeam = updateGearboxRatiosInText(
    jbeamOriginal,
    'gearbox',
    [-3.8, 0, 4.2, 2.5, 1.6, 1.1, 0.85],
    3.73,
    'differential_R'
  );

  assert.ok(updatedJBeam.includes('"gearRatios": [-3.8, 0, 4.2, 2.5, 1.6, 1.1, 0.85]'), 'Must update gearRatios in text');
  assert.ok(updatedJBeam.includes('"gearRatio": 3.73'), 'Must update differential gearRatio in text');
  assert.ok(updatedJBeam.includes('"friction": 1.2'), 'Must preserve existing sibling properties');
  console.log('✓ Test 9: Lossless JBeam code update for gearbox & differential ratios passed.');

  console.log('All Powertrain & Drivetrain Architecture tests passed successfully!\n');
}
