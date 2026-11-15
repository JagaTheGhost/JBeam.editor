import assert from 'node:assert';
import {
  extractPartsFromJBeamText,
  parseVehicleConfiguration,
  buildWorkspaceIndex
} from '../src/features/assembly/vehicleIndexer.js';
import {
  resolveAssemblyTree,
  getActiveAssembledParts,
  buildCompositeVehicleData,
  applyNodeOffsets,
  PART_PALETTE
} from '../src/features/assembly/assemblyResolver.js';

export function runAssemblyTests() {
  console.log('--- Running Multi-Part Vehicle Assembly & Slot Manager Tests ---');

  // Test 1: Extract Parts and Slots from JBeam text
  const rootJBeam = `{
    "truck_root": {
      "information": { "name": "Heavy Truck" },
      "slotType": "main",
      "slots2": [
        ["name", "allowTypes", "denyTypes", "default", "description"],
        ["truck_frame", ["truck_frame"], [], "frame_long", "Chassis Frame", {"coreSlot": true}],
        ["truck_mod", ["truck_mod"], [], "", "Additional Modification"]
      ]
    }
  }`;

  const frameJBeam = `{
    "frame_long": {
      "information": { "name": "Long Heavy Frame" },
      "slotType": "truck_frame",
      "slots2": [
        ["name", "allowTypes", "denyTypes", "default", "description"],
        ["truck_cab", ["truck_cab"], [], "cab_sleeper", "Cabin"],
        ["truck_susp_F", ["truck_susp_F"], [], "susp_front", "Front Suspension"]
      ],
      "nodes": [
        ["id", "posX", "posY", "posZ"],
        ["fr1r", -0.4, 1.0, 0.4],
        ["fr1l",  0.4, 1.0, 0.4]
      ],
      "beams": [
        ["id1:", "id2:"],
        ["fr1r", "fr1l"]
      ]
    },
    "frame_short": {
      "information": { "name": "Short Agility Frame" },
      "slotType": "truck_frame",
      "slots2": [
        ["name", "allowTypes", "denyTypes", "default", "description"],
        ["truck_cab", ["truck_cab"], [], "cab_day", "Cabin"]
      ]
    }
  }`;

  const cabJBeam = `{
    "cab_sleeper": {
      "information": { "name": "Sleeper Cab" },
      "slotType": "truck_cab",
      "nodes": [
        ["id", "posX", "posY", "posZ"],
        ["cb1r", -0.8, 0.5, 1.2],
        ["cb1l",  0.8, 0.5, 1.2]
      ],
      "beams": [
        ["id1:", "id2:"],
        ["cb1r", "cb1l"]
      ]
    },
    "cab_day": {
      "information": { "name": "Day Cab" },
      "slotType": "truck_cab",
      "nodes": [
        ["id", "posX", "posY", "posZ"],
        ["cb1r", -0.7, 0.2, 1.1],
        ["cb1l",  0.7, 0.2, 1.1]
      ]
    }
  }`;

  const pcConfigText = `{
    "Configuration": "Long Hauler Edition",
    "model": "truck_root",
    "mainPartName": "truck_root",
    "parts": {
      "truck_frame": "frame_long",
      "truck_cab": "cab_sleeper"
    }
  }`;

  const workspaceFiles = [
    { path: 'vehicles/truck/truck.jbeam', content: rootJBeam },
    { path: 'vehicles/truck/frame.jbeam', content: frameJBeam },
    { path: 'vehicles/truck/cab.jbeam', content: cabJBeam },
    { path: 'vehicles/truck/long_hauler.pc', content: pcConfigText }
  ];

  // Test 2: Build Workspace Index
  const index = buildWorkspaceIndex(workspaceFiles);
  assert.strictEqual(Object.keys(index.partsMap).length, 5, 'Should index 5 parts');
  assert.ok(index.partsMap.truck_root, 'Root part indexed');
  assert.ok(index.partsMap.frame_long, 'Long frame indexed');
  assert.ok(index.partsMap.frame_short, 'Short frame indexed');
  assert.ok(index.partsMap.cab_sleeper, 'Sleeper cab indexed');
  assert.ok(index.partsMap.cab_day, 'Day cab indexed');

  assert.strictEqual(index.rootParts.length, 1, 'Should find 1 root part');
  assert.strictEqual(index.rootParts[0].partName, 'truck_root');

  assert.strictEqual(index.configurations.length, 1, 'Should find 1 .pc config');
  assert.strictEqual(index.configurations[0].configurationName, 'Long Hauler Edition');

  // Test 3: Resolve Hierarchical Assembly Tree
  const assemblyTree = resolveAssemblyTree(
    'truck_root',
    index.partsMap,
    index.slotTypeMap,
    index.configurations[0].parts
  );

  assert.ok(assemblyTree, 'Assembly tree resolved');
  assert.strictEqual(assemblyTree.partName, 'truck_root');
  assert.strictEqual(assemblyTree.slots.length, 2, 'truck_root should have 2 slots');

  const frameSlot = assemblyTree.slots.find(s => s.slotName === 'truck_frame');
  assert.ok(frameSlot, 'truck_frame slot present');
  assert.strictEqual(frameSlot.chosenPart, 'frame_long');
  assert.strictEqual(frameSlot.availableParts.length, 2, '2 frame parts compatible (frame_long & frame_short)');

  assert.ok(frameSlot.child, 'frame_long child resolved');
  const cabSlot = frameSlot.child.slots.find(s => s.slotName === 'truck_cab');
  assert.ok(cabSlot, 'truck_cab slot present under frame_long');
  assert.strictEqual(cabSlot.chosenPart, 'cab_sleeper');

  // Test 4: Active Assembled Parts List
  const activeParts = getActiveAssembledParts(assemblyTree, {});
  assert.strictEqual(activeParts.length, 3, 'Active parts should be truck_root, frame_long, cab_sleeper');
  assert.deepStrictEqual(
    activeParts.map(p => p.partName),
    ['truck_root', 'frame_long', 'cab_sleeper']
  );

  // Test 5: Part Visibility Overrides (Independent per-part visibility for isolation)
  const activeWithHidden = getActiveAssembledParts(assemblyTree, { frame_long: false });
  assert.strictEqual(activeWithHidden.length, 2, 'Frame is hidden, while root and cab remain independently visible');
  assert.deepStrictEqual(
    activeWithHidden.map(p => p.partName),
    ['truck_root', 'cab_sleeper']
  );

  // Test 6: Build Composite Vehicle Data (Async)
  const mockFileContents = {
    'vehicles/truck/truck.jbeam': rootJBeam,
    'vehicles/truck/frame.jbeam': frameJBeam,
    'vehicles/truck/cab.jbeam': cabJBeam
  };
  const mockReader = async (p) => mockFileContents[p];

  return buildCompositeVehicleData(activeParts, mockReader).then(composite => {
    assert.ok(composite.frame_long, 'frame_long present in composite');
    assert.ok(composite.cab_sleeper, 'cab_sleeper present in composite');

    // Verify tagging of parts
    assert.strictEqual(composite.frame_long.nodes.fr1r.__partName, 'frame_long');
    assert.strictEqual(composite.cab_sleeper.nodes.cb1r.__partName, 'cab_sleeper');
    assert.ok(composite.frame_long.nodes.fr1r.__partColor, 'Part color must be assigned');
    assert.ok(composite.cab_sleeper.nodes.cb1r.__partColor, 'Part color must be assigned');

    // Test 7: BeamNG nodeOffset & nodeMove bilateral sign reflection
    const rightNode = { id: 'test_r', pos: [-0.6, 1.2, 0.4] };
    const leftNode = { id: 'test_l', pos: [0.6, 1.2, 0.4] };
    const slotOptions = {
      nodeOffset: { x: 0.15, y: 0.5, z: -0.1 },
      nodeMove: { x: 0.05, y: 0.0, z: 0.02 }
    };

    applyNodeOffsets(rightNode, slotOptions);
    applyNodeOffsets(leftNode, slotOptions);

    // Right node: posX = -0.6 < 0 => signX = -1
    // totalOffsetX = -1 * 0.15 + 0.05 = -0.10 => new posX = -0.6 + (-0.10) = -0.70
    // totalOffsetY = 0.50 => new posY = 1.2 + 0.5 = 1.70
    // totalOffsetZ = -0.10 + 0.02 = -0.08 => new posZ = 0.4 + (-0.08) = 0.32
    assert.strictEqual(Math.round(rightNode.pos[0] * 100) / 100, -0.70);
    assert.strictEqual(Math.round(rightNode.pos[1] * 100) / 100, 1.70);
    assert.strictEqual(Math.round(rightNode.pos[2] * 100) / 100, 0.32);

    // Left node: posX = 0.6 >= 0 => signX = +1
    // totalOffsetX = +1 * 0.15 + 0.05 = +0.20 => new posX = 0.6 + 0.20 = 0.80
    assert.strictEqual(Math.round(leftNode.pos[0] * 100) / 100, 0.80);
    assert.strictEqual(Math.round(leftNode.pos[1] * 100) / 100, 1.70);
    assert.strictEqual(Math.round(leftNode.pos[2] * 100) / 100, 0.32);

    // Test 8: Assembly .pc Configuration Flexbody Mesh Filtering in 3D
    const mockMeshManager = {
      submeshMap: new Map([
        ['frame_long_mesh', { visible: true }],
        ['cab_sleeper_mesh', { visible: true }],
        ['cab_sleeper_mesh.001', { visible: true }],
        ['cab_day_mesh', { visible: true }],
        ['cab_day_mesh.001', { visible: true }],
        ['frame_short_mesh', { visible: true }]
      ]),
      filterSubmeshes(allowedNames) {
        const normalizedTargets = new Set();
        for (const n of allowedNames || []) {
          const clean = String(n).trim().toLowerCase().replace(/^['"]|['"]$/g, '').replace(/\.\d+$/, '').replace(/_lod\d+$/i, '');
          if (clean) normalizedTargets.add(clean);
        }
        let matchCount = 0;
        for (const [name, mesh] of this.submeshMap.entries()) {
          const lowerName = name.trim().toLowerCase();
          const normName = lowerName.replace(/\.\d+$/, '').replace(/_lod\d+$/i, '');
          let isMatch = normalizedTargets.has(lowerName) || normalizedTargets.has(normName);
          if (!isMatch) {
            for (const target of normalizedTargets) {
              if (normName.startsWith(target + '_') || normName.startsWith(target + '.')) {
                isMatch = true;
                break;
              }
            }
          }
          mesh.visible = isMatch;
          if (isMatch) matchCount++;
        }
        return matchCount;
      }
    };

    // Filter using sleeper cab configuration active parts
    const declaredConfigMeshes = new Set(['frame_long_mesh', 'cab_sleeper_mesh']);
    const visibleCount = mockMeshManager.filterSubmeshes(declaredConfigMeshes);

    assert.strictEqual(visibleCount, 3, 'Should match frame_long_mesh, cab_sleeper_mesh, cab_sleeper_mesh.001');
    assert.strictEqual(mockMeshManager.submeshMap.get('cab_sleeper_mesh').visible, true);
    assert.strictEqual(mockMeshManager.submeshMap.get('cab_sleeper_mesh.001').visible, true);
    assert.strictEqual(mockMeshManager.submeshMap.get('cab_day_mesh').visible, false, 'Alternative day cab must be hidden');
    assert.strictEqual(mockMeshManager.submeshMap.get('frame_short_mesh').visible, false, 'Alternative short frame must be hidden');

    console.log('✓ Multi-Part Vehicle Assembly & Slot Manager tests passed!');
  });
}
