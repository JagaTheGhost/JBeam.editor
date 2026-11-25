import assert from 'node:assert';
import * as THREE from 'three';
import {
  buildNodesGroup,
  buildBeamsGroup,
  buildTrianglesGroup,
  BEAM_TYPE_COLORS,
  NODE_DEFAULT_COLOR,
  countVehicleElementTypes,
  resolveNodeType,
  resolveSurfaceType
} from '../src/features/viewport/visualizers.js';
import { processAllParts } from '../src/features/jbeam/tableSchema.js';

export function runElementTypesAndSurfaceClickTests() {
  console.log('--- Running Element Types & Surface 3D Click-to-Code Tests ---');

  const mockNodes = {
    n_fixed: { posX: 0, posY: 0, posZ: 0, fixed: true },
    fw1r: { posX: 0.8, posY: -1.2, posZ: 0.35, nodeWeight: 12 }, // Wheel Hub
    em1r: { posX: 0.3, posY: -0.8, posZ: 0.5, group: ['engine_mounts'] }, // Mount
    ghost1: { posX: 0, posY: 1.0, posZ: 0.8, collision: false }, // Non-collidable
    body1: { posX: 0.5, posY: 0, posZ: 0.5, selfCollision: true }, // Self-colliding
    body2: { posX: -0.5, posY: 0, posZ: 0.5 } // Standard collision
  };

  const mockBeams = {
    b_normal: { 'id1:': 'body1', 'id2:': 'body2', beamType: '|NORMAL' },
    b_support: { 'id1:': 'body1', 'id2:': 'ghost1', beamType: '|SUPPORT' },
    b_bounded: { 'id1:': 'em1r', 'id2:': 'body1', beamType: '|BOUNDED' },
    b_hydro: { 'id1:': 'fw1r', 'id2:': 'body1', beamType: '|HYDRO' }
  };

  const mockTriangles = {
    tri_normal: {
      'id1:': 'body1', 'id2:': 'body2', 'id3:': 'ghost1',
      triangleType: 'NORMALTYPE',
      dragCoef: 10,
      __meta: { range: [100, 101] }
    },
    tri_aero: {
      'id1:': 'body1', 'id2:': 'fw1r', 'id3:': 'em1r',
      triangleType: 'NONCOLLIDABLE',
      dragCoef: 6.45,
      liftCoef: 2.1,
      __meta: { range: [120, 121] }
    },
    tri_pressure: {
      'id1:': 'fw1r', 'id2:': 'body1', 'id3:': 'body2',
      triangleType: 'PRESSURE',
      pressureGroup: 'tank',
      __meta: { range: [140, 141] }
    }
  };

  const mockQuads = {
    quad_aero: {
      'id1:': 'body1', 'id2:': 'body2', 'id3:': 'ghost1', 'id4:': 'fw1r',
      quadType: 'NONCOLLIDABLE',
      dragCoef: 8.0,
      __meta: { range: [200, 201] }
    }
  };

  // -------------------------------------------------------------------------
  // Test 1: Normal View (Creation View) uses Clean Uniform CAD Colors & Translucency
  // -------------------------------------------------------------------------
  {
    const normalNodesGroup = buildNodesGroup(mockNodes, null, 'default');
    assert.ok(normalNodesGroup, 'Normal nodes group created');

    const normalBeamsGroup = buildBeamsGroup(mockBeams, mockNodes, null, 'default');
    assert.ok(normalBeamsGroup, 'Normal beams group created');

    const normalSurfacesGroup = buildTrianglesGroup(mockTriangles, mockNodes, mockQuads, { colorMode: 'default' });
    assert.ok(normalSurfacesGroup, 'Normal surfaces group created');

    const singleMesh = normalSurfacesGroup.children.find(c => c.name === 'triangles_surface');
    assert.ok(singleMesh, 'Single uniform triangles_surface should be created in Normal View');
    assert.strictEqual(singleMesh.material.opacity, 0.32, 'Normal surface must have distinct 0.32 translucency so inner wireframe is visible without drowning out panels');
    assert.strictEqual(singleMesh.material.color.getHex(), 0x2563eb, 'Normal surface should use distinct Royal Sapphire Glass (triadic contrast)');

    const sampleNode = normalNodesGroup.children.find(c => c.name === 'node_body2');
    assert.strictEqual(sampleNode.material.color.getHex(), 0xf8fafc, 'Normal node should be Diamond White / Platinum');

    console.log('✓ Test 1: Normal View distinct triadic colors (White Nodes, Green Beams, Indigo Surfaces) verified.');
  }

  // -------------------------------------------------------------------------
  // Test 2: Type Overlay View Differentiates Nodes by Physical Role (High Contrast)
  // -------------------------------------------------------------------------
  {
    const typeNodesGroup = buildNodesGroup(mockNodes, null, 'type');
    assert.ok(typeNodesGroup, 'Type nodes group created');

    const nodeFixed = typeNodesGroup.children.find(c => c.name === 'node_n_fixed');
    assert.strictEqual(nodeFixed.material.color.getHex(), 0xff0033, 'Fixed node should be Alert Red');

    const nodeHub = typeNodesGroup.children.find(c => c.name === 'node_fw1r');
    assert.strictEqual(nodeHub.material.color.getHex(), 0xeab308, 'Wheel hub node should be Radiant Sun Gold');

    const nodeMount = typeNodesGroup.children.find(c => c.name === 'node_em1r');
    assert.strictEqual(nodeMount.material.color.getHex(), 0xef4444, 'Mount node should be Crimson Red');

    const nodeGhost = typeNodesGroup.children.find(c => c.name === 'node_ghost1');
    assert.strictEqual(nodeGhost.material.color.getHex(), 0x64748b, 'Non-collidable node should be Slate Grey');

    const nodeSelf = typeNodesGroup.children.find(c => c.name === 'node_body1');
    assert.strictEqual(nodeSelf.material.color.getHex(), 0x38bdf8, 'Self-colliding node should be Sky Blue');

    const nodeCollision = typeNodesGroup.children.find(c => c.name === 'node_body2');
    assert.strictEqual(nodeCollision.material.color.getHex(), 0xf8fafc, 'Standard collision node should be Diamond White / Platinum');

    console.log('✓ Test 2: Node Physics Role classification (Hub, Mount, Self-Coll, Ghost, Fixed, Collision) verified.');
  }

  // -------------------------------------------------------------------------
  // Test 3: Type Overlay View Differentiates Surfaces (Collision vs Aero vs Pressure)
  // -------------------------------------------------------------------------
  {
    const typeSurfacesGroup = buildTrianglesGroup(mockTriangles, mockNodes, mockQuads, { colorMode: 'type' });
    assert.ok(typeSurfacesGroup, 'Type surfaces group created');

    const normalMesh = typeSurfacesGroup.children.find(c => c.name === 'triangles_surface_normal');
    assert.ok(normalMesh, 'Collision hull mesh should exist');
    assert.strictEqual(normalMesh.material.color.getHex(), 0x1e3a8a, 'Collision hull should be Deep Sapphire');
    assert.strictEqual(normalMesh.material.opacity, 0.22, 'Collision hull should have 0.22 glass opacity');

    const aeroMesh = typeSurfacesGroup.children.find(c => c.name === 'triangles_surface_aero');
    assert.ok(aeroMesh, 'Aerodynamic non-collidable mesh should exist');
    assert.strictEqual(aeroMesh.material.color.getHex(), 0x065f46, 'Aero only should be Deep Emerald Tint');
    assert.strictEqual(aeroMesh.material.opacity, 0.20, 'Aero only should have 0.20 glass opacity');

    const pressureMesh = typeSurfacesGroup.children.find(c => c.name === 'triangles_surface_pressure');
    assert.ok(pressureMesh, 'Pressure vessel mesh should exist');
    assert.strictEqual(pressureMesh.material.color.getHex(), 0x881337, 'Pressure vessel should be Deep Ruby Tint');
    assert.strictEqual(pressureMesh.material.opacity, 0.22, 'Pressure vessel should have 0.22 glass opacity');

    console.log('✓ Test 3: Surface Physics Classification (Collision Hull, Aero Only, Pressure) verified.');
  }

  // -------------------------------------------------------------------------
  // Test 4: 3D Surface Raycasting Metadata preserves Line Range & Aero Properties
  // -------------------------------------------------------------------------
  {
    const typeSurfacesGroup = buildTrianglesGroup(mockTriangles, mockNodes, mockQuads, { colorMode: 'type' });
    const aeroMesh = typeSurfacesGroup.children.find(c => c.name === 'triangles_surface_aero');
    assert.ok(aeroMesh.userData.surfaceLookup, 'surfaceLookup must exist on aeroMesh');

    const firstAeroFace = aeroMesh.userData.surfaceLookup[0];
    assert.ok(firstAeroFace, 'Raycast surface lookup entry must exist');
    assert.deepStrictEqual(firstAeroFace.range, [120, 121], 'tri.__meta.range must be preserved for 3D click jump');
    assert.strictEqual(firstAeroFace.triangleType, 'NONCOLLIDABLE', 'triangleType must be preserved');
    assert.strictEqual(firstAeroFace.dragCoef, 6.45, 'dragCoef must be preserved');
    assert.strictEqual(firstAeroFace.liftCoef, 2.1, 'liftCoef must be preserved');

    console.log('✓ Test 4: 3D Surface metadata preserves line range, type, and dragCoef for code navigation.');
  }

  // -------------------------------------------------------------------------
  // Test 5: countVehicleElementTypes and Type Resolution
  // -------------------------------------------------------------------------
  {
    const counts = countVehicleElementTypes(mockBeams, mockNodes, mockTriangles, mockQuads);
    assert.strictEqual(counts.beamCounts['|NORMAL'], 1);
    assert.strictEqual(counts.beamCounts['|SUPPORT'], 1);
    assert.strictEqual(counts.beamCounts['|BOUNDED'], 1);
    assert.strictEqual(counts.beamCounts['|HYDRO'], 1);

    assert.strictEqual(counts.nodeCounts.wheelHub, 1);
    assert.strictEqual(counts.nodeCounts.mount, 1);
    assert.strictEqual(counts.nodeCounts.nonCollidable, 1);
    assert.strictEqual(counts.nodeCounts.selfCollision, 1);
    assert.strictEqual(counts.nodeCounts.collisionOnly, 1);
    assert.strictEqual(counts.nodeCounts.fixed, 1);

    assert.strictEqual(counts.surfaceCounts.NORMALTYPE, 1);
    assert.strictEqual(counts.surfaceCounts.NONCOLLIDABLE, 2); // 1 tri + 1 quad
    assert.strictEqual(counts.surfaceCounts.PRESSURE, 1);

    console.log('✓ Test 5: Dynamic Vehicle Type Counting (Beams, Nodes, Surfaces) verified.');
  }

  // -------------------------------------------------------------------------
  // Test 6: Interactive Type Filtering and Soloing
  // -------------------------------------------------------------------------
  {
    // Solo Support Beams: turn off |NORMAL, |BOUNDED, |HYDRO
    const soloSupportFilters = {
      beams: {
        '|NORMAL': false,
        '|SUPPORT': true,
        '|BOUNDED': false,
        '|HYDRO': false,
        '|ANISOTROPIC': false,
        '|PRESSURED': false,
        '|VIRTUAL': false
      }
    };
    const soloSupportBeamsGroup = buildBeamsGroup(mockBeams, mockNodes, null, 'type', {}, 'ghost', null, soloSupportFilters);
    assert.ok(soloSupportBeamsGroup.userData.supportLines, 'Support lines must exist');
    assert.strictEqual(soloSupportBeamsGroup.children.some(c => c.name === 'beams_lines'), false, 'Normal lines must be omitted when filtered out');

    // Solo Mount Nodes: turn off other node types
    const soloMountFilters = {
      nodes: {
        mount: true,
        wheelHub: false,
        collisionOnly: false,
        selfCollision: false,
        nonCollidable: false,
        fixed: false
      }
    };
    const soloMountNodesGroup = buildNodesGroup(mockNodes, null, 'type', null, null, 'ghost', soloMountFilters);
    assert.strictEqual(soloMountNodesGroup.children.length, 1, 'Only mount node should be rendered');
    assert.strictEqual(soloMountNodesGroup.children[0].name, 'node_em1r', 'Rendered node must be em1r');

    // Solo Aero Surfaces: turn off NORMALTYPE and PRESSURE
    const soloAeroFilters = {
      surfaces: {
        NONCOLLIDABLE: true,
        NORMALTYPE: false,
        PRESSURE: false
      }
    };
    const soloAeroSurfacesGroup = buildTrianglesGroup(mockTriangles, mockNodes, mockQuads, { colorMode: 'type', typeFilters: soloAeroFilters });
    assert.ok(soloAeroSurfacesGroup.children.find(c => c.name === 'triangles_surface_aero'), 'Aero surfaces must exist');
    assert.strictEqual(soloAeroSurfacesGroup.children.some(c => c.name === 'triangles_surface_normal'), false, 'Normal surfaces must be filtered out');
    assert.strictEqual(soloAeroSurfacesGroup.children.some(c => c.name === 'triangles_surface_pressure'), false, 'Pressure surfaces must be filtered out');

    console.log('✓ Test 6: Interactive Type Filtering and Soloing verified.');
  }

  // -------------------------------------------------------------------------
  // Test 7: External Connection Beams (|VIRTUAL) & External Reference Nodes
  // -------------------------------------------------------------------------
  {
    const subframeBeams = {
      b_mount1: { 'id1:': 'rx3rr', 'id2:': 'r2rr', beamType: '|BOUNDED' },
      b_mount2: { 'id1:': 'rx3rr', 'id2:': 'r5rr', beamType: '|BOUNDED' },
      b_internal: { 'id1:': 'rx3rr', 'id2:': 'rx3ll', beamType: '|NORMAL' }
    };
    const localNodes = {
      rx3rr: { posX: 0.5, posY: 1.2, posZ: 0.3 },
      rx3ll: { posX: -0.5, posY: 1.2, posZ: 0.3 }
    };
    const externalChassisNodes = {
      r2rr: { posX: 0.6, posY: 1.1, posZ: 0.4 },
      r5rr: { posX: 0.6, posY: 1.3, posZ: 0.4 }
    };

    const counts = countVehicleElementTypes(subframeBeams, localNodes, {}, {}, externalChassisNodes);
    assert.strictEqual(counts.beamCounts['|VIRTUAL'], 2, '2 cross-part beams should be classified as |VIRTUAL');
    assert.strictEqual(counts.beamCounts['|NORMAL'], 1, '1 internal beam should remain |NORMAL');
    assert.strictEqual(counts.nodeCounts.external, 2, '2 external reference nodes (r2rr, r5rr) must be counted');

    console.log('✓ Test 7: External connection beams (|VIRTUAL) and foreign reference nodes accurately detected.');
  }

  // -------------------------------------------------------------------------
  // Test 8: Parallel Staged Beams vs Redundant Duplicate Diagnostics
  // -------------------------------------------------------------------------
  {
    // Case A: Parallel staged bumpstops (different physical parameters - official vehicle pattern)
    const stagedFixture = {
      test_shock: {
        beams: {
          b1: { 'id1:': 'rh1r', 'id2:': 'rsh1r', beamType: '|BOUNDED', beamLimitSpring: 80000, shortBoundRange: 0.02 },
          b2: { 'id1:': 'rh1r', 'id2:': 'rsh1r', beamType: '|BOUNDED', beamLimitSpring: 201000, shortBoundRange: 0.05 }
        }
      }
    };
    const [, stagedDiag] = processAllParts(stagedFixture);
    const stagedDups = stagedDiag.filter(d => d[0] === 'warning' && d[1].includes('Duplicate beam'));
    assert.strictEqual(stagedDups.length, 0, 'Parallel staged bumpstops with differing spring limits must NOT be flagged as duplicates');

    // Case B: Truly identical duplicate beam (exact same physical parameters)
    const duplicateFixture = {
      test_part: {
        beams: {
          b1: { 'id1:': 'n1', 'id2:': 'n2', beamType: '|NORMAL', beamSpring: 1000000, beamDamp: 100 },
          b2: { 'id1:': 'n1', 'id2:': 'n2', beamType: '|NORMAL', beamSpring: 1000000, beamDamp: 100 }
        }
      }
    };
    const [, dupDiag] = processAllParts(duplicateFixture);
    const trueDups = dupDiag.filter(d => d[0] === 'warning' && d[1].includes('Duplicate beam'));
    assert.strictEqual(trueDups.length, 1, 'Physically identical duplicate beam must be flagged with a warning');

    console.log('✓ Test 8: Parallel staged springs allowed; truly redundant duplicate beams flagged.');
  }

  // Test 9: External Nodes & External Beams preserve their real BeamNG physics type in Type mode
  {
    const extTestNodes = {
      a1: { id: 'a1', posX: 0, posY: 0, posZ: 0 },
      ext_self: { id: 'ext_self', posX: 0.5, posY: 0, posZ: 0, selfCollision: true, __isExternal: true }
    };
    const extNodesGroup = buildNodesGroup(extTestNodes, null, 'type');
    const extMesh = extNodesGroup.children.find(c => c.userData?.id === 'ext_self');
    assert.ok(extMesh, 'External node mesh must be built');
    assert.strictEqual(extMesh.userData.baseNodeType, 'selfCollision', 'External node must preserve underlying baseNodeType');
    assert.strictEqual(extMesh.material.color.getHex(), 0x38bdf8, 'External selfCollision node sphere must use sky blue physics type color');
    const extCage = extMesh.children.find(ch => ch.userData?.isExternalHalo === true);
    assert.ok(extCage, 'External node must have violet wireframe diamond cage child');
    assert.strictEqual(extCage.material.color.getHex(), 0xc084fc);

    const extTestBeams = {
      b_ext_sup: { 'id1:': 'a1', 'id2:': 'ext_self', beamType: '|SUPPORT', __partName: 'p1' }
    };
    const extBeamsGroup = buildBeamsGroup(extTestBeams, { a1: extTestNodes.a1 }, null, 'type', { ext_self: extTestNodes.ext_self });
    const virtualLine = extBeamsGroup.children.find(c => c.name === 'virtual_beams_lines');
    assert.ok(virtualLine, 'External dash-dot line must be built');
    const colorAttr = virtualLine.geometry.getAttribute('color');
    const supColor = new THREE.Color(0xfbbf24);
    assert.ok(Math.abs(colorAttr.getX(0) - supColor.r) < 0.02 && Math.abs(colorAttr.getY(0) - supColor.g) < 0.02, 'External |SUPPORT beam in Type mode must use Support gold color while keeping dash-dot pattern');
    console.log('✓ Test 9: External nodes (violet diamond cage + type color) and external beams (dash-dot + type color) verified.');
  }

  console.log('All Element Types & Surface 3D Click-to-Code tests passed!\n');
}
