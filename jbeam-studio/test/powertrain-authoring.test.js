/**
 * Test Suite: Powertrain Authoring, Forced Induction, Thermals, Diff Locking, and EV Motors
 */

import assert from 'assert';
import {
  addPowertrainDeviceInText,
  connectPowertrainDeviceInText,
  removePowertrainDeviceInText,
  calculateForcedInductionTorque,
  calculateEngineThermalStatus,
  calculateDiffLockingCharacteristics,
  calculateElectricMotorCurve,
  generateModularPowertrainFiles
} from '../src/features/powertrain/powertrainParser.js';

export async function runPowertrainAuthoringTests() {
  console.log('--- Running Powertrain Authoring & Simulation Tests ---');

// Test 1: Add powertrain device losslessly to JBeam text
const sampleJBeam = `{
    "test_part": {
        "powertrain": [
            ["type", "name", "inputName", "inputIndex"],
            ["combustionEngine", "mainEngine", "dummy", 0]
        ]
    }
}`;

const withClutch = addPowertrainDeviceInText(sampleJBeam, {
  type: 'clutch',
  name: 'clutch',
  inputName: 'mainEngine',
  inputIndex: 1
});

assert(withClutch.includes('["clutch", "clutch", "mainEngine", 1]'), 'Failed to add clutch device');
console.log('✓ Test 1: Add powertrain device to JBeam text passed.');

// Test 2: Re-wire / connect powertrain device to a different input
const rewired = connectPowertrainDeviceInText(withClutch, 'clutch', 'electricMotor', 2);
assert(rewired.includes('["clutch", "clutch", "electricMotor", 2]'), 'Failed to rewire clutch input to electricMotor port 2');
console.log('✓ Test 2: Connect/rewire powertrain device passed.');

// Test 3: Remove powertrain device from table
const removed = removePowertrainDeviceInText(rewired, 'clutch');
assert(!removed.includes('"clutch"'), 'Failed to remove clutch device');
console.log('✓ Test 3: Remove powertrain device passed.');

// Test 4: Forced induction boost & net torque calculation
const naTorque = [
  { rpm: 1000, torque: 200 },
  { rpm: 2500, torque: 300 },
  { rpm: 4000, torque: 350 },
  { rpm: 6000, torque: 320 }
];

const turboResult = calculateForcedInductionTorque(naTorque, {
  wastegatePressure: 14.5, // 1 bar boost
  spoolRpm: 2200,
  maxBoostRpm: 3800,
  intercoolerEfficiency: 0.85,
  turboType: 'turbocharger'
});

assert(turboResult.peakBoostedTorque > turboResult.peakNaTorque, 'Boosted torque should exceed NA torque');
assert(turboResult.deltaHp > 0, 'Turbo should add horsepower');
assert.strictEqual(turboResult.maxBoostPsi, 14.5);
console.log(`✓ Test 4: Forced induction calculation passed (NA: ${turboResult.peakNaTorque} Nm, Boosted: ${turboResult.peakBoostedTorque} Nm, +${turboResult.deltaHp} HP).`);

// Test 5: Engine thermals & cooling equilibrium
const thermalResult = calculateEngineThermalStatus({
  radiatorArea: 0.40,
  coolantVolume: 9.0,
  thermostatOpenTemp: 88,
  fanTemp: 94,
  headGasketFailureTemp: 135,
  oilCooler: true
});

assert(thermalResult.coolingCapacityKw > 50, 'Cooling capacity should account for radiator area and oil cooler');
assert.strictEqual(thermalResult.status, 'optimal');
assert(thermalResult.thermalBufferMinutes > 1.0, 'Thermal buffer should be calculated');
console.log(`✓ Test 5: Engine thermals calculation passed (${thermalResult.coolingCapacityKw} kW cooling, ${thermalResult.status} status).`);

// Test 6: Differential locking characteristics
const lsdResult = calculateDiffLockingCharacteristics({
  diffType: 'lsd',
  gearRatio: 4.10,
  lsdPreload: 75,
  lsdLockCoef: 0.25,
  lsdRevLockCoef: 0.15
});

assert.strictEqual(lsdResult.powerLockPercent, 25);
assert.strictEqual(lsdResult.coastLockPercent, 15);
assert(lsdResult.maxCrossAxleTorque > 100);

const spoolResult = calculateDiffLockingCharacteristics({
  diffType: 'locking',
  lockTorque: 3000
});
assert.strictEqual(spoolResult.powerLockPercent, 100);
assert.strictEqual(spoolResult.maxCrossAxleTorque, 3000);
console.log('✓ Test 6: Differential locking analysis passed.');

// Test 7: Electric EV Motor Curve
const evResult = calculateElectricMotorCurve({
  maxTorque: 420,
  maxPowerKw: 250,
  maxRpm: 16000,
  batteryCapacityKwh: 80
});

assert(evResult.baseRpm > 4000 && evResult.baseRpm < 7000, `Base RPM should be in realistic range, got ${evResult.baseRpm}`);
assert.strictEqual(evResult.curve[0].torque, 420, 'Zero RPM torque should equal maxTorque');
assert(evResult.estRangeKm > 300, 'Estimated EV range should be calculated');
console.log(`✓ Test 7: Electric EV Motor curve passed (Base RPM: ${evResult.baseRpm}, Peak HP: ${evResult.peakHp}, Range: ${evResult.estRangeKm} km).`);

// Test 8: Modular BeamNG Powertrain File Generator
const modularFiles = generateModularPowertrainFiles({
  vehicleName: 'coupe',
  layout: 'RWD',
  engineType: 'I4_2.0L',
  transmissionType: '6M',
  diffType: 'lsd',
  finalDriveRatio: 3.73
});

assert(modularFiles['coupe_engine.jbeam'], 'Must generate coupe_engine.jbeam');
assert(modularFiles['coupe_transmission.jbeam'], 'Must generate coupe_transmission.jbeam');
assert(modularFiles['coupe_differential_R.jbeam'], 'Must generate coupe_differential_R.jbeam');
assert(modularFiles['coupe_driveshaft.jbeam'], 'Must generate coupe_driveshaft.jbeam');
assert(modularFiles['coupe_radiator.jbeam'], 'Must generate coupe_radiator.jbeam');

// Verify that transmission connects to mainEngine by name
assert(modularFiles['coupe_transmission.jbeam'].includes('"mainEngine"'), 'Transmission must link to mainEngine inputName');
console.log('✓ Test 8: Modular BeamNG powertrain file generator passed (5 files generated).');

  console.log('All Powertrain Authoring & Simulation tests passed successfully!\n');
}

if (process.argv[1] && process.argv[1].endsWith('powertrain-authoring.test.js')) {
  runPowertrainAuthoringTests();
}
