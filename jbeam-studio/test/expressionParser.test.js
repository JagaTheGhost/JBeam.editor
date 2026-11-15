import assert from 'node:assert';
import {
  evaluateExpression,
  parseSafe,
  evaluateJBeamValue,
  isLuaTruthy,
  clamp,
  toLuaString
} from '../src/features/jbeam/expressionParser.js';
import {
  extractPartVariables,
  sanitizeVariables,
  resolveSlotVariables,
  applyVariablesToData,
  resolvePartNodesAndBeams
} from '../src/features/jbeam/variables.js';

export function runExpressionParserTests() {
  console.log('--- Running Lua Expression Parser & Variables Tests (Step 5) ---');

  // Test 1: Arithmetic & Operator Precedence
  {
    const [c1, r1] = parseSafe('$=1 + 5 * 6');
    assert.strictEqual(c1, 0);
    assert.strictEqual(r1, 31, '1 + 5 * 6 should be 31');

    const [c2, r2] = parseSafe('$=1 * 5 + 6');
    assert.strictEqual(c2, 0);
    assert.strictEqual(r2, 11, '1 * 5 + 6 should be 11');

    const [c3, r3] = parseSafe('$=2^5 + 6');
    assert.strictEqual(c3, 0);
    assert.strictEqual(r3, 38, '2^5 + 6 should be 38');

    const [c4, r4] = parseSafe('$=6 * 5^2');
    assert.strictEqual(c4, 0);
    assert.strictEqual(r4, 150, '6 * 5^2 should be 150');

    // Lua Modulo semantics
    const [c5, r5] = parseSafe('$=14 % 5');
    assert.strictEqual(c5, 0);
    assert.strictEqual(r5, 4, '14 % 5 should be 4');

    console.log('✓ Test 1: Arithmetic & operator precedence passed.');
  }

  // Test 2: Lua Truthiness & Logical Operators
  {
    // In Lua, 0 is TRUTHY!
    assert.strictEqual(isLuaTruthy(0), true, '0 must be truthy in Lua');
    assert.strictEqual(isLuaTruthy(''), true, 'Empty string must be truthy in Lua');
    assert.strictEqual(isLuaTruthy(false), false, 'false must be falsy in Lua');
    assert.strictEqual(isLuaTruthy(null), false, 'null (nil) must be falsy in Lua');
    assert.strictEqual(isLuaTruthy(undefined), false, 'undefined (nil) must be falsy in Lua');

    // 3 * 0 is 0 (truthy), so (0 and 0) -> 0 (truthy), (0 or 2) -> 0
    const [c1, r1] = parseSafe('$=3 * 0 and 0 or 2');
    assert.strictEqual(c1, 0);
    assert.strictEqual(r1, 0, '3 * 0 and 0 or 2 should be 0 in Lua');

    const [c2, r2] = parseSafe('$=not false and not false');
    assert.strictEqual(c2, 0);
    assert.strictEqual(r2, true);

    const [c3, r3] = parseSafe('$=not false and false');
    assert.strictEqual(c3, 0);
    assert.strictEqual(r3, false);

    console.log('✓ Test 2: Lua truthiness and logical operators passed.');
  }

  // Test 3: BeamNG Built-in Functions & case()
  {
    const [c1, r1] = parseSafe('$=case(true, 10, 20)');
    assert.strictEqual(c1, 0);
    assert.strictEqual(r1, 10, 'case(true, 10, 20) should return 10');

    const [c2, r2] = parseSafe('$=case(false, 10, 20)');
    assert.strictEqual(c2, 0);
    assert.strictEqual(r2, 20, 'case(false, 10, 20) should return 20');

    const [c3, r3] = parseSafe('$=round(11.6)');
    assert.strictEqual(c3, 0);
    assert.strictEqual(r3, 12, 'round(11.6) should return 12');

    const [c4, r4] = parseSafe('$=round(11.4)');
    assert.strictEqual(c4, 0);
    assert.strictEqual(r4, 11, 'round(11.4) should return 11');

    const [c5, r5] = parseSafe('$=sign(-13)');
    assert.strictEqual(c5, 0);
    assert.strictEqual(r5, -1, 'sign(-13) should return -1');

    const [c6, r6] = parseSafe('$=clamp(15, 0, 10)');
    assert.strictEqual(c6, 0);
    assert.strictEqual(r6, 10, 'clamp(15, 0, 10) should clamp to 10');

    const [c7, r7] = parseSafe('$=smoothstep(0.5)');
    assert.strictEqual(c7, 0);
    assert.strictEqual(r7, 0.5, 'smoothstep(0.5) should return 0.5');

    const [c8, r8] = parseSafe('$=print("hello beamng")');
    assert.strictEqual(c8, 0);
    assert.strictEqual(r8, 'hello beamng', 'print() should return first argument');

    console.log('✓ Test 3: Built-in functions and case() passed.');
  }

  // Test 4: Variable Resolution & Official BeamNG Formulae
  {
    const vars = {
      '$toe_FR': 1.0,
      '$steer_center_F': 0.002,
      '$springheight_F': 0.04
    };

    const [c1, r1] = parseSafe('$=$toe_FR - $steer_center_F', vars);
    assert.strictEqual(c1, 0);
    assert.strictEqual(r1, 0.998, '$toe_FR - $steer_center_F should be 0.998');

    // Test missing variable nil check: case($rideheight_F == nil, fallback, val)
    const [c2, r2] = parseSafe(
      '$=case($rideheight_F == nil, ($springheight_F + 0.09) * 0.7, 999)',
      vars
    );
    assert.strictEqual(c2, 0);
    assert.strictEqual(Math.round(r2 * 1000) / 1000, 0.091, 'Missing var should match nil in case()');

    // When $rideheight_F is defined:
    const varsWithRide = { ...vars, '$rideheight_F': 0.1 };
    const [c3, r3] = parseSafe(
      '$=case($rideheight_F == nil, ($springheight_F + 0.09) * 0.7, 999)',
      varsWithRide
    );
    assert.strictEqual(c3, 0);
    assert.strictEqual(r3, 999, 'Defined var should select false branch');

    // BeamNG brake strength formula with brakebias nil:
    const brakeVars = { '$brakestrength': 0.7 };
    const [c4, r4] = parseSafe(
      '$=$brakebias == nil and $brakestrength*900 or ($brakestrength*3600*(1-$brakebias) + 1)',
      brakeVars
    );
    assert.strictEqual(c4, 0);
    assert.strictEqual(r4, 630, 'Brake strength fallback formula should evaluate to 630');

    // With brakebias defined:
    const brakeVarsDefined = { '$brakebias': 0.5, '$brakestrength': 0.7 };
    const [c5, r5] = parseSafe(
      '$=$brakebias == nil and $brakestrength*900 or ($brakestrength*3600*(1-$brakebias) + 1)',
      brakeVarsDefined
    );
    assert.strictEqual(c5, 0);
    assert.strictEqual(r5, 1261, 'Should evaluate with brakebias 0.5 to 1261');

    // With "not ... == nil":
    const [c6, r6] = parseSafe(
      '$=not $brakebias == nil and $brakestrength*900 or ($brakestrength*3600*(1-$brakebias) + 1)',
      brakeVarsDefined
    );
    assert.strictEqual(c6, 0);
    assert.strictEqual(r6, 630, 'not nil condition should select 630');

    // Modulo with float
    const [c7, r7] = parseSafe('$=100 % $brakestrength', brakeVars);
    assert.strictEqual(c7, 0);
    assert.ok(Math.abs(r7 - 0.6) < 1e-9, '100 % 0.7 should be 0.6 in Lua modulo');

    // Deterministic random
    const [c8, r8] = parseSafe('$=random(20, 20)');
    assert.strictEqual(c8, 0);
    assert.strictEqual(r8, 20, 'random(20, 20) should return 20');

    // String concatenation with ..
    const [c9, r9] = parseSafe('$= "node_" .. 15');
    assert.strictEqual(c9, 0);
    assert.strictEqual(r9, 'node_15', '.. should concatenate strings');

    console.log('✓ Test 4: Variable resolution and official BeamNG formulae passed.');
  }

  // Test 5: Extracting and Sanitizing Part Variables
  {
    const testPart = {
      information: { name: 'Test Suspension' },
      variables: [
        ['name', 'type', 'unit', 'category', 'default', 'min', 'max', 'step'],
        ['$track_F', 'range', 'm', 'wheels', 0.85, 0.75, 0.95, 0.005],
        ['$camber_FR', 'range', '%', 'alignment', 0.995, 0.9, 1.1, 0.001],
        ['$spring_F', 'range', 'N/m', 'suspension', 55000, 20000, 100000, 1000]
      ]
    };

    const declared = extractPartVariables(testPart);
    assert.ok(declared['$track_F'], 'Should extract $track_F');
    assert.strictEqual(declared['$track_F'].default, 0.85);
    assert.strictEqual(declared['$track_F'].min, 0.75);
    assert.strictEqual(declared['$track_F'].max, 0.95);

    // Sanitize with user configuration override (e.g. from .pc)
    const userVars = {
      '$track_F': 0.90,
      '$camber_FR': 1.5 // exceeds max 1.1, should clamp
    };

    const sanitized = sanitizeVariables(declared, userVars);
    assert.strictEqual(sanitized['$track_F'], 0.90, 'User override should be applied');
    assert.strictEqual(sanitized['$camber_FR'], 1.1, 'Over-limit value must be clamped to max');
    assert.strictEqual(sanitized['$spring_F'], 55000, 'Unset var should keep default value');

    console.log('✓ Test 5: Extracting and sanitizing part variables passed.');
  }

  // Test 6: Resolving Interdependent Slot Variables
  {
    const baseVars = { '$track_base': 0.80 };
    const slotVars = {
      '$track_offset': 0.05,
      '$track_F': '$=$track_base + $track_offset', // depends on base and slot var
      '$wheel_pos': '$=$track_F / 2'                // depends on $track_F
    };

    const resolved = resolveSlotVariables(slotVars, baseVars);
    assert.strictEqual(resolved['$track_offset'], 0.05);
    assert.ok(Math.abs(resolved['$track_F'] - 0.85) < 1e-9, '$track_F should resolve to 0.85');
    assert.ok(Math.abs(resolved['$wheel_pos'] - 0.425) < 1e-9, '$wheel_pos should resolve to 0.425');

    console.log('✓ Test 6: Resolving interdependent slot variables passed.');
  }

  // Test 7: Resolving Part Nodes and Beams Coordinates
  {
    const part = {
      nodes: {
        'n1r': { id: 'n1r', posX: '$=$track_width / 2', posY: 1.2, posZ: 0.3 },
        'n1l': { id: 'n1l', posX: '$=-$track_width / 2', posY: 1.2, posZ: 0.3 }
      },
      beams: {
        '0': { 'id1:': 'n1r', 'id2:': 'n1l', beamSpring: '$=$k_spring * 10' }
      }
    };

    const activeVars = {
      '$track_width': 1.6,
      '$k_spring': 5000
    };

    resolvePartNodesAndBeams(part, activeVars);

    // n1r posX should be evaluated to 0.8
    assert.strictEqual(part.nodes['n1r'].posX, 0.8);
    assert.deepStrictEqual(part.nodes['n1r'].pos, [0.8, 1.2, 0.3]);
    // Raw formula preserved for lossless AST saving
    assert.strictEqual(part.nodes['n1r'].__meta.rawPositions.posX, '$=$track_width / 2');

    // n1l posX should be evaluated to -0.8
    assert.strictEqual(part.nodes['n1l'].posX, -0.8);
    assert.deepStrictEqual(part.nodes['n1l'].pos, [-0.8, 1.2, 0.3]);

    // Beam spring should be evaluated to 50000
    assert.strictEqual(part.beams['0'].beamSpring, 50000);
    assert.strictEqual(part.beams['0'].__meta.rawProps.beamSpring, '$=$k_spring * 10');

    console.log('✓ Test 7: Resolving part nodes and beams coordinates passed.');
  }
}
