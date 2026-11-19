import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  updateBeamTypeLossless,
  updateBeamPropertiesLossless,
  updateNodePropertiesLossless
} from '../src/features/jbeam/astUpdater.js';
import { BEAM_PRESETS, formatNtoMetric } from '../src/features/inspector/inspectorUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function runInspectorEnhancementsTests() {
  console.log('--- Running Inspector Enhancements & Two-Way Physics Synchronization Tests ---');

  // 1. Test formatNtoMetric
  assert.strictEqual(formatNtoMetric(1500000, 'N/m'), '1.5 MN/m');
  assert.strictEqual(formatNtoMetric(35000, 'N'), '35 kN');
  assert.strictEqual(formatNtoMetric(801000, 'N/m'), '801 kN/m');
  assert.strictEqual(formatNtoMetric(500, 'N'), '500 N');
  assert.strictEqual(formatNtoMetric('', 'N'), '');
  console.log('✓ Test 1: formatNtoMetric engineering notation passed.');

  // 2. Test BEAM_PRESETS definitions
  assert.strictEqual(BEAM_PRESETS.length >= 5, true);
  const rigid = BEAM_PRESETS.find(p => p.name.includes('Rigid'));
  assert.strictEqual(rigid.properties.beamSpring, 8001000);
  assert.strictEqual(rigid.properties.beamStrength, 'FLT_MAX');

  const support = BEAM_PRESETS.find(p => p.name.includes('Support'));
  assert.strictEqual(support.beamType, '|SUPPORT');
  assert.strictEqual(support.properties.beamPrecompression, 0.95);
  console.log('✓ Test 2: BEAM_PRESETS definitions verified.');

  // 3. Test updateBeamTypeLossless on vehicle_frame.jbeam
  const fixturePath = path.resolve(__dirname, '../../sample-project/vehicle_frame.jbeam');
  const originalText = fs.readFileSync(fixturePath, 'utf8');

  const typeUpdate = updateBeamTypeLossless(originalText, 'vehicle_frame', 'fr2l', 'cb1l', '|SUPPORT', true);
  assert.strictEqual(Boolean(typeUpdate.error), false);
  assert.strictEqual(typeUpdate.updatedText.includes('["fr2l", "cb1l"') && typeUpdate.updatedText.includes('"beamType":"|SUPPORT"'), true);
  assert.strictEqual(typeUpdate.updatedText.includes('["fr2r", "cb1r"') && typeUpdate.updatedText.includes('"beamType":"|SUPPORT"'), true);
  console.log('✓ Test 3: updateBeamTypeLossless updates both target and mirrored beam in JBeam source.');

  // 4. Test updateBeamPropertiesLossless on vehicle_frame.jbeam
  const propsUpdate = updateBeamPropertiesLossless(
    originalText,
    'vehicle_frame',
    'fr2l',
    'cb1l',
    { beamSpring: 2500000, beamDeform: 45000, beamStrength: 'FLT_MAX', beamPrecompression: 1.02 },
    true
  );
  assert.strictEqual(Boolean(propsUpdate.error), false);
  assert.strictEqual(propsUpdate.updatedText.includes('2500000'), true);
  assert.strictEqual(propsUpdate.updatedText.includes('45000'), true);
  assert.strictEqual(propsUpdate.updatedText.includes('"FLT_MAX"'), true);
  assert.strictEqual(propsUpdate.updatedText.includes('1.02'), true);
  // Mirrored counterpart fr2r <-> cb1r also updated
  const fr2rMatch = propsUpdate.updatedText.split('\n').find(l => l.includes('fr2r') && l.includes('cb1r'));
  assert.strictEqual(fr2rMatch.includes('2500000'), true);
  console.log('✓ Test 4: updateBeamPropertiesLossless updates arbitrary physical properties with symmetry.');

  // 5. Test updateNodePropertiesLossless on vehicle_frame.jbeam
  const nodeUpdate = updateNodePropertiesLossless(
    originalText,
    'vehicle_frame',
    'fr2l',
    { nodeWeight: 6.2, nodeMaterial: '|NM_ALUMINUM', frictionCoef: 0.75 },
    true
  );
  assert.strictEqual(Boolean(nodeUpdate.error), false);
  assert.strictEqual(nodeUpdate.updatedText.includes('6.2'), true);
  assert.strictEqual(nodeUpdate.updatedText.includes('|NM_ALUMINUM'), true);
  assert.strictEqual(nodeUpdate.updatedText.includes('0.75'), true);
  // Mirrored counterpart fr2r also updated
  const fr2rNodeMatch = nodeUpdate.updatedText.split('\n').find(l => l.includes('"fr2r"'));
  assert.strictEqual(Boolean(fr2rNodeMatch), true);
  assert.strictEqual(fr2rNodeMatch.includes('6.2'), true);
  assert.strictEqual(fr2rNodeMatch.includes('|NM_ALUMINUM'), true);
  console.log('✓ Test 5: updateNodePropertiesLossless updates nodeWeight, nodeMaterial, frictionCoef with symmetry.');

  console.log('All Inspector Enhancements tests passed successfully!');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runInspectorEnhancementsTests();
}

