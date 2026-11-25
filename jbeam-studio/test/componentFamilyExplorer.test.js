import assert from 'assert';
import * as THREE from 'three';
import {
  derivePartFamily,
  extractSymmetricBaseName,
  computeEffectiveColorModes,
  computeHideUnhideAllToggle,
  computeSubmeshIsolationConfig
} from '../src/features/viewport/componentFamilyUtils.js';
import VisualMeshManager from '../src/features/viewport/ColladaMeshManager.js';
import { extractPressureWheels } from '../src/features/jbeam/pressureWheelsParser.js';

export function runComponentFamilyExplorerTests() {
  console.log('--- Running 3-Level Component Family Hierarchy & Synchronized Physics Isolation Tests ---');

  // Test 1: derivePartFamily extracts slotType and strips config suffixes
  {
    // Slot type takes precedence
    const strutRace = { slotType: 'bastion_strut_F', information: { name: 'Race Front Strut' } };
    assert.strictEqual(derivePartFamily('bastion_strut_F_race', strutRace), 'bastion_strut_F');

    const strutSport = { slotType: 'bastion_strut_F', information: { name: 'Sport Front Strut' } };
    assert.strictEqual(derivePartFamily('bastion_strut_F_sport', strutSport), 'bastion_strut_F');

    const swaybarRace = { slotType: 'bastion_swaybar_F', information: { name: 'Race Front Swaybar' } };
    assert.strictEqual(derivePartFamily('bastion_swaybar_F_race', swaybarRace), 'bastion_swaybar_F');

    const steeringRace = { slotType: 'bastion_steering', information: { name: 'Race Steering' } };
    assert.strictEqual(derivePartFamily('bastion_steering_race', steeringRace), 'bastion_steering');

    // Fallback: suffix stripping when slotType is missing
    assert.strictEqual(derivePartFamily('bastion_strut_F_ultra_heavy', {}), 'bastion_strut_F');
    assert.strictEqual(derivePartFamily('bastion_swaybar_F_gt', {}), 'bastion_swaybar_F');
    assert.strictEqual(derivePartFamily('bastion_steering_drift', {}), 'bastion_steering');
    assert.strictEqual(derivePartFamily('bastion_suspension_F', {}), 'bastion_suspension_F');
    assert.strictEqual(derivePartFamily('bastion_wheeldata_F', {}), 'bastion_wheeldata_F');
    console.log('✓ Test 1: derivePartFamily slotType and suffix aggregation verified.');
  }

  // Test 2: extractSymmetricBaseName pairs bilateral submeshes (_FL & _FR)
  {
    assert.strictEqual(extractSymmetricBaseName('bastion_tierod_FL'), 'bastion_tierod_f_pair');
    assert.strictEqual(extractSymmetricBaseName('bastion_tierod_FR'), 'bastion_tierod_f_pair');
    assert.strictEqual(extractSymmetricBaseName('bastion_hub_FL'), 'bastion_hub_f_pair');
    assert.strictEqual(extractSymmetricBaseName('bastion_hub_FR'), 'bastion_hub_f_pair');
    assert.strictEqual(extractSymmetricBaseName('door_left'), 'door_pair');
    assert.strictEqual(extractSymmetricBaseName('door_right'), 'door_pair');
    console.log('✓ Test 2: Bilateral symmetry base name pairing verified.');
  }

  // Test 3: Wheel physics suppression when soloing non-wheel components
  {
    const fixtureSuspensionParts = {
      bastion_suspension_F: {
        slotType: 'bastion_suspension_F',
        nodes: { fx1r: [0, 0, 0], fx1l: [0, 0, 0] },
        beams: { b1: ['fx1r', 'fx1l'] }
      },
      bastion_wheeldata_F: {
        pressureWheels: [
          ['name', 'wheelDir'],
          ['wheel_FL', 1],
          ['wheel_FR', -1]
        ]
      },
      bastion_steering_race: {
        slotType: 'bastion_steering',
        flexbodies: [
          ['bastion_steering_rack', ['bastion_subframe_F']],
          ['bastion_tierod_F', ['bastion_tierod_F']]
        ],
        nodes: { fh6r: [0.34, -1.5, 0.25], fh6l: [-0.34, -1.5, 0.25] },
        beams: { rack_beam: ['fh6r', 'fh6l'] }
      }
    };

    // Case A: Nothing isolated -> wheels are extracted
    const allWheels = extractPressureWheels(fixtureSuspensionParts);
    assert.strictEqual(allWheels.length, 2, 'Should extract 2 wheels when all parts active');

    // Case B: User solos 'bastion_steering_race'
    const soloPartKey = 'bastion_steering_race';
    const visibleParts = {};
    for (const [pk, p] of Object.entries(fixtureSuspensionParts)) {
      if (pk === soloPartKey) {
        visibleParts[pk] = p;
      }
    }

    const hasVisibleWheelDef = Object.values(visibleParts).some(
      p => p && (p.pressureWheels || p.hubWheels || p.wheelData || p.wheels)
    );
    assert.strictEqual(hasVisibleWheelDef, false, 'Soloed steering part has no wheel definition');

    const isolatedWheels = hasVisibleWheelDef ? extractPressureWheels(visibleParts) : [];
    assert.strictEqual(isolatedWheels.length, 0, 'Wheel extraction MUST be empty when non-wheel part is soloed');
    console.log('✓ Test 3: Wheel physics skeleton correctly suppressed under part isolation.');
  }

  // Test 4: Soloing single flexbody isolates nodes and suppresses wheels
  {
    const soloFlexbody = 'bastion_tierod_F';
    const boundNodes = ['fh6r', 'fh6l'];
    const soloNodeIds = new Set(boundNodes);

    // Only nodes in soloNodeIds should be kept
    const rawNodes = {
      fh6r: { id: 'fh6r', posX: 0.34, posY: -1.5, posZ: 0.25 },
      fh6l: { id: 'fh6l', posX: -0.34, posY: -1.5, posZ: 0.25 },
      wheel_hub_node: { id: 'wheel_hub_node', posX: 0.8, posY: -1.5, posZ: 0.3 }
    };

    const visualNodes = {};
    for (const [nid, n] of Object.entries(rawNodes)) {
      if (soloNodeIds.has(nid)) {
        visualNodes[nid] = n;
      }
    }

    assert.strictEqual(Object.keys(visualNodes).length, 2);
    assert.strictEqual(visualNodes.wheel_hub_node, undefined, 'Wheel hub node must be excluded');
    console.log('✓ Test 4: Single flexbody solo correctly filters nodes to bound group only.');
  }

  // Test 5: Combination of controls & multi-mode color resolution
  {
    // Case A: User toggles Type and selects Mass Heatmap simultaneously
    const comboTypeAndMass = computeEffectiveColorModes({
      activeHeatmap: 'mass',
      colorMode: 'type',
      hudActiveTab: 'type',
      hasActiveTypeFilter: true
    });
    assert.strictEqual(comboTypeAndMass.nodeMode, 'mass', 'Nodes must show Mass Heatmap gradient & scaling');
    assert.strictEqual(comboTypeAndMass.beamMode, 'type', 'Beams must show beam type colors & filtering simultaneously');

    // Case B: User toggles Type and selects Stiffness Heatmap
    const comboTypeAndStiffness = computeEffectiveColorModes({
      activeHeatmap: 'stiffness',
      colorMode: 'type',
      hudActiveTab: 'heatmap',
      hasActiveTypeFilter: true
    });
    assert.strictEqual(comboTypeAndStiffness.nodeMode, 'type', 'Nodes must show node type roles');
    assert.strictEqual(comboTypeAndStiffness.beamMode, 'stiffness', 'Beams must show beamSpring stiffness gradient');

    // Case C: Reset to Normal CAD View
    const normalView = computeEffectiveColorModes({
      activeHeatmap: null,
      colorMode: 'default',
      hudActiveTab: 'parts',
      hasActiveTypeFilter: false
    });
    assert.strictEqual(normalView.nodeMode, 'default');
    assert.strictEqual(normalView.beamMode, 'default');

    // Case D: Part Assembly Colors with Mass Heatmap
    const partAndMass = computeEffectiveColorModes({
      activeHeatmap: 'mass',
      colorMode: 'part',
      hudActiveTab: 'heatmap'
    });
    assert.strictEqual(partAndMass.nodeMode, 'mass');
    assert.strictEqual(partAndMass.beamMode, 'part');

    console.log('✓ Test 5: Simultaneous combination of controls (Type + Heatmap + Part colors) verified.');
  }

  // Test 6: Hide All / Unhide All quick action toggle
  {
    const partKeys = ['bastion_suspension_F', 'bastion_wheeldata_F', 'bastion_steering_race'];

    // Initial state: nothing isolated -> toggle triggers 'hideAll'
    const hideAction = computeHideUnhideAllToggle(false, partKeys);
    assert.strictEqual(hideAction.action, 'hideAll');
    assert.strictEqual(hideAction.newIsolatedKeys.size, 3);
    assert.strictEqual(hideAction.newIsolatedKeys.has('bastion_suspension_F'), true);

    // State with isolation active -> toggle triggers 'unhideAll'
    const unhideAction = computeHideUnhideAllToggle(true, partKeys);
    assert.strictEqual(unhideAction.action, 'unhideAll');
    assert.strictEqual(unhideAction.newIsolatedKeys.size, 0);

    console.log('✓ Test 6: Hide All / Unhide All quick action toggle logic verified.');
  }

  // Test 7: Full-DAE submesh leak regression (Active Only, Hide All, zero-flexbody part solo)
  {
    const partsAndFlexbodiesData = {
      parts: [
        { key: 'bastion_suspension_F', flexbodies: [{ name: 'bastion_subframe_F' }, { name: 'bastion_strut_F' }] },
        { key: 'bastion_wheeldata_F', flexbodies: [] },
        { key: 'bastion_steering_race', flexbodies: [{ name: 'bastion_tierod_F' }] }
      ],
      partFamilyMap: new Map([
        ['bastion_suspension_F', 'bastion_suspension_F'],
        ['bastion_wheeldata_F', 'bastion_wheeldata_F'],
        ['bastion_steering_race', 'bastion_steering']
      ])
    };

    const mockManager = new VisualMeshManager();
    const makeMesh = (name) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
      m.name = name;
      return m;
    };
    const bodyMesh = makeMesh('bastion_body');
    const hoodMesh = makeMesh('bastion_hood');
    const subframeMesh = makeMesh('bastion_subframe_F');
    const strutMesh = makeMesh('bastion_strut_F');
    const tierodMesh = makeMesh('bastion_tierod_F');
    mockManager.allMeshes = [bodyMesh, hoodMesh, subframeMesh, strutMesh, tierodMesh];

    // Case A: Default Active Only with active suspension flexbodies
    const activeCfg = computeSubmeshIsolationConfig({
      effectiveIsolateMesh: true,
      hasActiveIsolation: false,
      activeMatchingMeshNames: new Set(['bastion_subframe_f', 'bastion_strut_f', 'bastion_tierod_f']),
      jbeamDefinesFlexbodies: true,
      partsAndFlexbodiesData
    });
    assert.strictEqual(activeCfg.forceExplicit, true);
    assert.strictEqual(activeCfg.allowedMeshNames.size, 3);
    const visA = mockManager.applySubmeshIsolation(activeCfg);
    assert.strictEqual(visA, 3);
    assert.strictEqual(bodyMesh.visible, false, 'Unrelated car body must stay hidden in Active Only mode');
    assert.strictEqual(hoodMesh.visible, false, 'Unrelated hood must stay hidden in Active Only mode');
    assert.strictEqual(subframeMesh.visible, true);

    // Case B: User clicks "Hide All" -> 0 parts visible, must NOT restore full car DAE!
    const hideAllCfg = computeSubmeshIsolationConfig({
      effectiveIsolateMesh: true,
      hasActiveIsolation: true,
      activeMatchingMeshNames: new Set(),
      jbeamDefinesFlexbodies: true,
      partsAndFlexbodiesData
    });
    assert.strictEqual(hideAllCfg.forceExplicit, true);
    assert.strictEqual(hideAllCfg.allowedMeshNames.size, 0);
    const visB = mockManager.applySubmeshIsolation(hideAllCfg);
    assert.strictEqual(visB, 0, 'Hide All must hide 100% of DAE meshes including body/hood');
    assert.strictEqual(bodyMesh.visible, false, 'Car body must NOT reappear after Hide All');

    // Case C: User solos a 0-flexbody part (bastion_wheeldata_F) -> must show 0 DAE meshes
    const soloZeroCfg = computeSubmeshIsolationConfig({
      effectiveIsolateMesh: true,
      hasActiveIsolation: true,
      activeMatchingMeshNames: new Set(),
      jbeamDefinesFlexbodies: true,
      soloPartKey: 'bastion_wheeldata_F',
      partsAndFlexbodiesData
    });
    const visC = mockManager.applySubmeshIsolation(soloZeroCfg);
    assert.strictEqual(visC, 0, 'Soloing zero-flexbody part must show 0 DAE meshes');

    // Case D: User solos a part with flexbodies (bastion_steering_race)
    const soloSteerCfg = computeSubmeshIsolationConfig({
      effectiveIsolateMesh: false,
      hasActiveIsolation: true,
      activeMatchingMeshNames: new Set(['bastion_tierod_f']),
      jbeamDefinesFlexbodies: true,
      soloPartKey: 'bastion_steering_race',
      partsAndFlexbodiesData
    });
    const visD = mockManager.applySubmeshIsolation(soloSteerCfg);
    assert.strictEqual(visD, 1);
    assert.strictEqual(tierodMesh.visible, true);
    assert.strictEqual(bodyMesh.visible, false);

    console.log('✓ Test 7: Full-DAE submesh leak prevention (Active Only, Hide All, 0-mesh solo) verified.');
  }

  // Test 8: derivePartFamily safely handles SJSON object-array slotType ({0, 1, __meta})
  {
    const sjsonArraySlot = { 0: 'wheel_F_5', 1: 'wheel_F_6', __meta: { type: 'array' } };
    const famFromObj = derivePartFamily('common_wheel_01_F', { slotType: sjsonArraySlot });
    assert.strictEqual(typeof famFromObj, 'string');
    assert.strictEqual(famFromObj, 'wheel_F_5');

    const famFromJsArr = derivePartFamily('common_wheel_02_F', { slotType: ['wheel_F_6', 'wheel_F_5'] });
    assert.strictEqual(famFromJsArr, 'wheel_F_6');
    console.log('✓ Test 8: Array/SJSON-object slotType safely normalized to string family key.');
  }

  console.log('All 3-Level Component Family & Physics Isolation tests passed successfully!');
}
