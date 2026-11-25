import assert from 'assert';
import { calculateAerodynamics } from '../src/features/viewport/aeroCalculator.js';
import { calculateBeamStrengthStats } from '../src/features/viewport/visualizers.js';
import { extractRefNodes, extractCamerasInternal } from '../src/features/jbeam/vehicleFrameParser.js';
import { buildRefNodesGroup, buildCameraFrustumGroup } from '../src/features/viewport/vehicleFrameVisualizer.js';
import { validateJBeamDocument } from '../src/features/jbeam/jbeamValidator.js';

export function runAeroAndFrameAnalyticsTests() {
  console.log('\n=== Testing Aerodynamics & Structural Analytics (Domain 2) ===');

  // Test 1: calculateBeamStrengthStats
  {
    const beamsDict = {
      b1: { id1: 'n1', id2: 'n2', beamStrength: 150000 },
      b2: { id1: 'n2', id3: 'n3', beamStrength: 25000 },
      b3: { id1: 'n3', id4: 'n4', beamStrength: 'FLT_MAX' }, // infinite strength
      b4: { id1: 'n4', id5: 'n5', beamStrength: 80000 }
    };
    const stats = calculateBeamStrengthStats(beamsDict);
    assert.strictEqual(stats.count, 3, 'Should count 3 finite numeric strength beams');
    assert.strictEqual(stats.minStrength, 25000, 'minStrength should be 25,000 N');
    assert.strictEqual(stats.maxStrength, 150000, 'maxStrength should be 150,000 N');
    console.log('  ✓ calculateBeamStrengthStats accurately parses min/max break strength');
  }

  // Test 2: calculateAerodynamics
  {
    const nodes = {
      // Front bumper / splitter facing forward (negative Y in BeamNG)
      f1l: { posX: 0.8, posY: -2.0, posZ: 0.3 },
      f1r: { posX: -0.8, posY: -2.0, posZ: 0.3 },
      f2: { posX: 0.0, posY: -1.0, posZ: 0.8 },
      // Rear spoiler / wing
      r1l: { posX: 0.8, posY: 1.8, posZ: 1.1 },
      r1r: { posX: -0.8, posY: 1.8, posZ: 1.1 },
      r2: { posX: 0.0, posY: 2.2, posZ: 1.1 }
    };

    const part = {
      triangles: [
        { id1: 'f1l', id2: 'f1r', id3: 'f2' },
        { id1: 'r1l', id2: 'r1r', id3: 'r2' }
      ]
    };

    const aero = calculateAerodynamics(part, nodes, { cogBeamng: [0, 0.2, 0.5] });
    assert.strictEqual(aero.valid, true, 'Aero calculation should be valid');
    assert.strictEqual(aero.surfaceCount, 2, 'Should process 2 aerodynamic surfaces');
    assert(aero.totalAreaM2 > 0, 'Total surface area should be positive');
    assert(aero.frontalAreaM2 > 0, 'Frontal area should be positive');
    assert(aero.copBeamng !== null, 'Should compute 3D Center of Pressure (CoP)');
    assert(typeof aero.stabilityRating === 'string', 'Should assign stability rating');
    console.log(`  ✓ calculateAerodynamics computes frontal area (${aero.frontalAreaM2.toFixed(3)} m²) & CoP [${aero.copBeamng.map(v => v.toFixed(2)).join(', ')}]`);
  }

  console.log('\n=== Testing Vehicle Frame & Interior Cameras (Domain 3) ===');

  // Test 3: extractRefNodes from array table syntax
  {
    const nodes = {
      fx1r: { posX: 0.5, posY: -0.2, posZ: 0.4 },
      fx1l: { posX: 0.5, posY: 0.8, posZ: 0.4 },
      fx2r: { posX: 0.9, posY: -0.2, posZ: 0.4 },
      fx2l: { posX: 0.5, posY: -0.2, posZ: 0.9 }
    };

    const part = {
      refNodes: [
        ['ref:', 'back:', 'left:', 'up:'],
        ['fx1r', 'fx1l', 'fx2r', 'fx2l']
      ]
    };

    const ref = extractRefNodes(part, nodes);
    assert.strictEqual(ref.valid, true, 'extractRefNodes should succeed');
    assert.strictEqual(ref.refNode, 'fx1r');
    assert.strictEqual(ref.backNode, 'fx1l');
    assert.strictEqual(ref.leftNode, 'fx2r');
    assert.strictEqual(ref.upNode, 'fx2l');

    // In BeamNG, back is +Y relative to ref (-0.2 to +0.8 is +1.0m back).
    // Forward vector is ref - back = -1.0 in Y.
    assert.strictEqual(ref.forwardVec[1], -1.0, 'Forward vector Y should point -1.0m forward');
    assert.strictEqual(ref.leftVec[0], 0.4, 'Left vector X should be 0.4m');
    assert.strictEqual(ref.upVec[2], 0.5, 'Up vector Z should be 0.5m');
    assert(ref.orthogonalityError < 0.01, 'Reference axes should be orthogonal');
    console.log('  ✓ extractRefNodes parses array table format and builds orthogonal basis');
  }

  // Test 4: extractRefNodes from object syntax
  {
    const nodes = {
      o1: { posX: 0, posY: 0, posZ: 0 },
      b1: { posX: 0, posY: 1, posZ: 0 },
      l1: { posX: 1, posY: 0, posZ: 0 },
      u1: { posX: 0, posY: 0, posZ: 1 }
    };
    const part = {
      refNodes: {
        ref: 'o1',
        back: 'b1',
        left: 'l1',
        up: 'u1'
      }
    };
    const ref = extractRefNodes(part, nodes);
    assert.strictEqual(ref.valid, true);
    assert.strictEqual(ref.distances.forward, 1);
    assert.strictEqual(ref.distances.left, 1);
    assert.strictEqual(ref.distances.up, 1);
    console.log('  ✓ extractRefNodes parses dictionary/object format');
  }

  // Test 5: extractCamerasInternal
  {
    const nodes = {
      seat_fl: { posX: 0.35, posY: 0.2, posZ: 0.6 },
      seat_fr: { posX: -0.35, posY: 0.2, posZ: 0.6 }
    };

    const part = {
      camerasInternal: [
        ['type', 'x', 'y', 'z', 'fov', 'id1:', 'id2:'],
        ['dash', 0.38, 0.42, 0.55, 65, 'seat_fl', 'seat_fr']
      ]
    };

    const cams = extractCamerasInternal(part, nodes);
    assert.strictEqual(cams.length, 1, 'Should parse 1 internal camera');
    assert.strictEqual(cams[0].type, 'dash');
    assert.strictEqual(cams[0].fov, 65);
    assert.strictEqual(cams[0].anchorIds.length, 2);
    assert.strictEqual(cams[0].hasResolvedAnchors, true);
    // Average anchor pos is [0, 0.2, 0.6]. Offset is [0.38, 0.42, 0.55].
    // World pos = [0.38, 0.62, 1.15]
    assert.strictEqual(cams[0].worldPos[0], 0.38);
    assert.strictEqual(Math.round(cams[0].worldPos[1] * 100) / 100, 0.62);
    assert.strictEqual(Math.round(cams[0].worldPos[2] * 100) / 100, 1.15);
    console.log('  ✓ extractCamerasInternal calculates anchored driver eye world coordinates');
  }

  // Test 6: 3D Visualizer groups construction (headless safe)
  {
    const refData = {
      valid: true,
      refNode: 'fx1r',
      origin: [0, 0, 0],
      forwardUnit: [0, -1, 0],
      leftUnit: [1, 0, 0],
      upUnit: [0, 0, 1]
    };
    const refGroup = buildRefNodesGroup(refData, { showLabels: false });
    assert(refGroup && refGroup.isGroup, 'Should construct Three.js group for refNodes');
    assert(refGroup.children.length >= 4, 'Should contain origin mesh and 3 axis arrows');

    const camData = [{
      type: 'dash',
      fov: 65,
      worldPos: [0.38, 0.62, 1.15],
      anchorCoords: [{ id: 'seat_fl', coords: [0.35, 0.2, 0.6] }]
    }];
    const camGroup = buildCameraFrustumGroup(camData, { showLabels: false });
    assert(camGroup && camGroup.isGroup, 'Should construct Three.js group for camerasInternal');
    assert(camGroup.children.length >= 2, 'Should contain camera eye mesh and frustum wireframe');
    console.log('  ✓ buildRefNodesGroup and buildCameraFrustumGroup render headless-safe 3D entities');
  }

  // Test 7: jbeamValidator catches invalid refNodes & cameras
  {
    const brokenJBeam = `{
      "test_chassis": {
        "nodes": [
          ["id", "posX", "posY", "posZ"],
          ["fx1r", 0, 0, 0],
          ["fx1l", 0, 1, 0]
        ],
        "refNodes": [
          ["ref:", "back:", "left:", "up:"],
          ["fx1r", "fx1r", "fx2r", "missing_node"]
        ],
        "camerasInternal": [
          ["type", "x", "y", "z", "fov", "id1:"],
          ["dash", 0.38, 0.42, 1.15, -10, "nonexistent_anchor"]
        ]
      }
    }`;

    const report = validateJBeamDocument(brokenJBeam, 'test_chassis.jbeam', { strictReferences: true });
    assert.strictEqual(report.isValid, false, 'Validation should fail on broken refNodes');

    const duplicateRefError = report.problems.find(p => p.source === 'RefNodes' && p.message.includes('Duplicate or coincident nodes'));
    assert(duplicateRefError, 'Should catch duplicate ref node (fx1r == fx1r)');

    const missingRefWarning = report.problems.find(p => p.source === 'RefNodes' && p.message.includes('missing_node'));
    assert(missingRefWarning, 'Should catch non-existent reference node');

    const fovWarning = report.problems.find(p => p.source === 'CamerasInternal' && p.message.includes('unusual FOV'));
    assert(fovWarning, 'Should catch negative FOV');

    const anchorError = report.problems.find(p => p.source === 'CamerasInternal' && p.message.includes('nonexistent_anchor'));
    assert(anchorError, 'Should catch missing camera anchor');

    console.log('  ✓ jbeamValidator reliably diagnoses duplicate refNodes, non-existent anchors, and invalid FOV');
  }
}
