import assert from 'assert';
import { normalizeBeamType, buildBeamsGroup, BEAM_TYPE_COLORS } from '../src/features/viewport/visualizers.js';

export function runSpecializedBeamsTests() {
  console.log('--- Running Specialized Beam Types Visualization Tests (Step 4) ---');

  // Test 1: Beam Type Normalization
  assert.strictEqual(normalizeBeamType('|SUPPORT'), '|SUPPORT');
  assert.strictEqual(normalizeBeamType('SUPPORT'), '|SUPPORT');
  assert.strictEqual(normalizeBeamType(7), '|SUPPORT');

  assert.strictEqual(normalizeBeamType('|HYDRO'), '|HYDRO');
  assert.strictEqual(normalizeBeamType('HYDRO'), '|HYDRO');
  assert.strictEqual(normalizeBeamType(6), '|HYDRO');

  assert.strictEqual(normalizeBeamType('|BOUNDED'), '|BOUNDED');
  assert.strictEqual(normalizeBeamType('BOUNDED'), '|BOUNDED');
  assert.strictEqual(normalizeBeamType(2), '|BOUNDED');

  assert.strictEqual(normalizeBeamType('|ANISOTROPIC'), '|ANISOTROPIC');
  assert.strictEqual(normalizeBeamType('ANISOTROPIC'), '|ANISOTROPIC');
  assert.strictEqual(normalizeBeamType('TIRESIDE'), '|ANISOTROPIC');
  assert.strictEqual(normalizeBeamType(1), '|ANISOTROPIC');

  assert.strictEqual(normalizeBeamType('|NORMAL'), '|NORMAL');
  assert.strictEqual(normalizeBeamType('NORMAL'), '|NORMAL');
  assert.strictEqual(normalizeBeamType(0), '|NORMAL');
  assert.strictEqual(normalizeBeamType(null), '|NORMAL');
  assert.strictEqual(normalizeBeamType(undefined), '|NORMAL');
  console.log('✓ Test 1: Beam type normalization across strings and numeric IDs passed.');

  // Test 2: Color definitions exist for all official BeamNG types
  const expectedTypes = ['|NORMAL', '|SUPPORT', '|HYDRO', '|BOUNDED', '|ANISOTROPIC', '|PRESSURED', '|LBEAM'];
  for (const t of expectedTypes) {
    assert.ok(BEAM_TYPE_COLORS[t] !== undefined, `Color mapping must exist for ${t}`);
  }
  console.log('✓ Test 2: Color mapping for all BeamNG physics beam types verified.');

  // Test 3: 3D Scene Group creation with Support & Hydro beams
  const mockNodes = {
    n1: { posX: 0, posY: 0, posZ: 0 },
    n2: { posX: 1, posY: 0, posZ: 0 },
    n3: { posX: 0, posY: 1, posZ: 0 },
    n4: { posX: 1, posY: 1, posZ: 0 }
  };

  const mockBeams = {
    b_chassis: { 'id1:': 'n1', 'id2:': 'n2', beamType: '|NORMAL' },
    b_support: { 'id1:': 'n2', 'id2:': 'n3', beamType: '|SUPPORT' },
    b_hydro:   { 'id1:': 'n3', 'id2:': 'n4', beamType: '|HYDRO' }
  };

  const group = buildBeamsGroup(mockBeams, mockNodes, null, 'type');
  assert.ok(group, 'Group should be created');

  // Verify regular lines exist
  const regularLines = group.children.find(c => c.name === 'beams_lines');
  assert.ok(regularLines, 'Solid beams_lines should exist for normal and hydro beams');

  // Verify dashed lines exist for support beams
  const supportLines = group.children.find(c => c.name === 'support_beams_lines');
  assert.ok(supportLines, 'Dashed support_beams_lines should exist for support beams');

  // Verify hydro actuator group exists
  const hydroGroup = group.children.find(c => c.name === 'hydro_actuators_group');
  assert.ok(hydroGroup, 'hydro_actuators_group should exist for hydraulic actuators');
  assert.strictEqual(hydroGroup.children.length, 1, 'Should have 1 actuator cylinder mesh');

  // Verify beamSegments userData
  const segments = group.userData.beamSegments;
  assert.strictEqual(segments.length, 3, 'All 3 beam segments should be registered');

  const supportSeg = segments.find(s => s.id1 === 'n2' && s.id2 === 'n3');
  assert.ok(supportSeg, 'Support segment found');
  assert.strictEqual(supportSeg.isSupport, true, 'Support segment isSupport should be true');
  assert.strictEqual(supportSeg.beamType, '|SUPPORT');

  const hydroSeg = segments.find(s => s.id1 === 'n3' && s.id2 === 'n4');
  assert.ok(hydroSeg, 'Hydro segment found');
  assert.strictEqual(hydroSeg.beamType, '|HYDRO');
  console.log('✓ Test 3: 3D scene group construction with dashed lines and actuator sleeves passed.');
}

if (process.argv[1]?.endsWith('specializedBeams.test.js')) {
  runSpecializedBeamsTests();
}

