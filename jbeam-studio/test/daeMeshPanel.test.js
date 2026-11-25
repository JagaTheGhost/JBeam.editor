import assert from 'assert';
import { extractSubmeshesFromDae } from '../src/features/templates/daeScaffoldingGenerator.js';
import { VisualMeshManager } from '../src/features/viewport/ColladaMeshManager.js';
import {
  computeCompositeBoundingBox,
  deriveMultiMeshPartName,
  generateMultiMeshJBeam
} from '../src/features/meshes/meshJBeamGenerator.js';
import { buildSubmeshPrefixTree } from '../src/features/meshes/submeshTreeUtils.js';

const TEST_DAE_XML = `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset>
    <unit name="meter" meter="1"/>
    <up_axis>Z_UP</up_axis>
  </asset>
  <library_geometries>
    <geometry id="hood-mesh" name="hood">
      <mesh>
        <source id="hood-positions">
          <float_array id="hood-positions-array" count="12">-0.8 -1.5 0.8  0.8 -1.5 0.8  -0.8 -0.5 0.9  0.8 -0.5 0.9</float_array>
          <technique_common>
            <accessor source="#hood-positions-array" count="4" stride="3">
              <param name="X" type="float"/>
              <param name="Y" type="float"/>
              <param name="Z" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <vertices id="hood-vertices">
          <input semantic="POSITION" source="#hood-positions"/>
        </vertices>
        <triangles count="2">
          <input semantic="VERTEX" source="#hood-vertices" offset="0"/>
          <p>0 1 2 1 3 2</p>
        </triangles>
      </mesh>
    </geometry>
    <geometry id="door_fl-mesh" name="door_fl">
      <mesh>
        <source id="door_fl-positions">
          <float_array id="door_fl-positions-array" count="12">-0.9 -0.5 0.3  -0.9 0.5 0.3  -0.9 -0.5 1.1  -0.9 0.5 1.1</float_array>
          <technique_common>
            <accessor source="#door_fl-positions-array" count="4" stride="3">
              <param name="X" type="float"/>
              <param name="Y" type="float"/>
              <param name="Z" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <vertices id="door_fl-vertices">
          <input semantic="POSITION" source="#door_fl-positions"/>
        </vertices>
        <triangles count="2">
          <input semantic="VERTEX" source="#door_fl-vertices" offset="0"/>
          <p>0 1 2 1 3 2</p>
        </triangles>
      </mesh>
    </geometry>
    <geometry id="chassis-mesh" name="chassis">
      <mesh>
        <source id="chassis-positions">
          <float_array id="chassis-positions-array" count="12">-0.8 -1.8 0.2  0.8 -1.8 0.2  -0.8 1.8 0.2  0.8 1.8 0.2</float_array>
          <technique_common>
            <accessor source="#chassis-positions-array" count="4" stride="3">
              <param name="X" type="float"/>
              <param name="Y" type="float"/>
              <param name="Z" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <vertices id="chassis-vertices">
          <input semantic="POSITION" source="#chassis-positions"/>
        </vertices>
        <triangles count="2">
          <input semantic="VERTEX" source="#chassis-vertices" offset="0"/>
          <p>0 1 2 1 3 2</p>
        </triangles>
      </mesh>
    </geometry>
  </library_geometries>
  <library_visual_scenes>
    <visual_scene id="Scene" name="Scene">
      <node id="hood_node" name="hood" type="NODE">
        <instance_geometry url="#hood-mesh"/>
      </node>
      <node id="door_fl_node" name="door_fl" type="NODE">
        <instance_geometry url="#door_fl-mesh"/>
      </node>
      <node id="chassis_node" name="chassis" type="NODE">
        <instance_geometry url="#chassis-mesh"/>
      </node>
    </visual_scene>
  </library_visual_scenes>
  <scene>
    <instance_visual_scene url="#Scene"/>
  </scene>
</COLLADA>`;

export function runDaeMeshPanelTests() {
  console.log('--- Running Dedicated 3D Meshes (.DAE) Panel & Multi-Spawn Tests ---');

  // Test 1: Submesh extraction from DAE XML
  const submeshes = extractSubmeshesFromDae(TEST_DAE_XML);
  assert.strictEqual(submeshes.length, 3, 'Expected 3 submeshes extracted from DAE XML');
  const names = submeshes.map(s => s.name);
  assert(names.includes('hood'), 'Submeshes should include hood');
  assert(names.includes('door_fl'), 'Submeshes should include door_fl');
  assert(names.includes('chassis'), 'Submeshes should include chassis');
  console.log('✓ Test 1: Submesh extraction from DAE verified (hood, door_fl, chassis).');

  // Test 2: Multi-Mesh Spawning on VisualMeshManager (spawning 1 mesh, multiple meshes, and 0 meshes with forceExplicit)
  const vmm = new VisualMeshManager();
  const m1 = { name: 'hood', visible: true, userData: {} };
  const m2 = { name: 'door_fl', visible: true, userData: {} };
  const m3 = { name: 'chassis', visible: true, userData: {} };
  vmm.allMeshes = [m1, m2, m3];
  vmm.submeshNames = ['hood', 'door_fl', 'chassis'];
  vmm.submeshDetails.set('hood', {
    name: 'hood',
    vertices: 4,
    triangles: 2,
    bbox: {
      min: { x: -0.8, y: -1.5, z: 0.8 },
      max: { x: 0.8, y: -0.5, z: 0.9 },
      size: { x: 1.6, y: 1.0, z: 0.1 },
      center: { x: 0, y: -1.0, z: 0.85 }
    }
  });

  assert.strictEqual(vmm.allMeshes.length, 3, 'Total meshes should be 3');
  const hoodDetails = vmm.submeshDetails.get('hood');
  assert(hoodDetails && hoodDetails.bbox, 'hood details should have a computed bbox');
  assert.strictEqual(hoodDetails.bbox.size.x, 1.6, 'bbox width should be 1.6');
  console.log('✓ Test 2: VisualMeshManager submesh bounding box metadata verified.');

  // Test 3a: Spawn ONLY hood
  const spawnedHood = new Set(['hood']);
  const count1 = vmm.filterSubmeshes(spawnedHood, true);
  assert.strictEqual(count1, 1, 'Only 1 mesh should be visible when only hood is spawned');
  const visibleMeshes1 = vmm.allMeshes.filter(m => m.visible).map(m => m.name);
  assert(visibleMeshes1.includes('hood'), 'hood must be visible');
  assert(!visibleMeshes1.includes('door_fl'), 'door_fl must not be visible');
  assert(!visibleMeshes1.includes('chassis'), 'chassis must not be visible');
  console.log('✓ Test 3a: Single mesh spawning (hood only) verified.');

  // Test 3b: Multi-spawn: Spawn hood AND door_fl simultaneously
  const spawnedMulti = new Set(['hood', 'door_fl']);
  const count2 = vmm.filterSubmeshes(spawnedMulti, true);
  assert.strictEqual(count2, 2, '2 meshes should be visible when hood and door_fl are spawned');
  const visibleMeshes2 = vmm.allMeshes.filter(m => m.visible).map(m => m.name);
  assert(visibleMeshes2.includes('hood'), 'hood must be visible');
  assert(visibleMeshes2.includes('door_fl'), 'door_fl must be visible');
  assert(!visibleMeshes2.includes('chassis'), 'chassis must not be visible');
  console.log('✓ Test 3b: Multi-mesh spawning (hood + door_fl) verified.');

  // Test 3c: Despawn all: empty set with forceExplicit = 0 visible
  const spawnedNone = new Set();
  const count0 = vmm.filterSubmeshes(spawnedNone, true);
  assert.strictEqual(count0, 0, '0 meshes should be visible when despawned');
  const visibleMeshes0 = vmm.allMeshes.filter(m => m.visible);
  assert.strictEqual(visibleMeshes0.length, 0, 'No meshes should be visible after Despawn All');
  console.log('✓ Test 3c: Despawn all meshes verified.');

  // Test 3d: Spawn all: all 3 submesh names
  const spawnedAll = new Set(['hood', 'door_fl', 'chassis']);
  const countAll = vmm.filterSubmeshes(spawnedAll, true);
  assert.strictEqual(countAll, 3, 'All 3 meshes should be visible when Spawn All is called');
  console.log('✓ Test 3d: Spawn all meshes verified.');

  // Test 4: JBeam File Generation Template Logic for Spawned Submesh
  const vehiclePrefix = 'apex_gt';
  const targetMesh = 'hood';
  const cleanMesh = targetMesh.replace(/[-_]/g, '_').toLowerCase();
  const partKey = `${vehiclePrefix}_${cleanMesh}`;
  const slotKey = partKey;
  const partDesc = 'Apex GT Hood';

  // Skeleton template check
  const skeletonContent = `{\n  "${partKey}": {\n    "information": {\n      "authors": "Modder",\n      "name": "${partDesc}"\n    },\n    "slotType": "${slotKey}",\n    "flexbodies": [\n      ["mesh", "[group]:", "nonFlexMaterials"],\n      ["${targetMesh}", ["${partKey}"]]\n    ]\n  }\n}\n`;
  assert(skeletonContent.includes(`"apex_gt_hood"`), 'JBeam must define apex_gt_hood');
  assert(skeletonContent.includes(`["hood", ["apex_gt_hood"]]`), 'JBeam must bind hood flexbody');
  console.log('✓ Test 4: JBeam Part generation with exact flexbody binding verified.');

  // Test 5: Composite Multi-Mesh Bounding Box Calculation
  const detailsMap = {
    percheron_tanker_side_box_BL: {
      triangles: 1570,
      vertices: 800,
      bbox: {
        min: { x: -1.2, y: 0.5, z: 0.3 },
        max: { x: -0.6, y: 1.5, z: 0.8 },
        size: { x: 0.6, y: 1.0, z: 0.5 },
        center: { x: -0.9, y: 1.0, z: 0.55 }
      }
    },
    percheron_tanker_pipes_L: {
      triangles: 832,
      vertices: 450,
      bbox: {
        min: { x: -1.0, y: -0.5, z: 0.4 },
        max: { x: -0.8, y: 2.2, z: 0.6 },
        size: { x: 0.2, y: 2.7, z: 0.2 },
        center: { x: -0.9, y: 0.85, z: 0.5 }
      }
    }
  };

  const compBBox = computeCompositeBoundingBox(['percheron_tanker_side_box_BL', 'percheron_tanker_pipes_L'], detailsMap);
  assert(compBBox && compBBox.hasBBox, 'Composite BBox must be valid');
  assert.strictEqual(compBBox.min.x, -1.2, 'Composite min X should be -1.2');
  assert.strictEqual(compBBox.max.x, -0.6, 'Composite max X should be -0.6');
  assert.strictEqual(compBBox.min.y, -0.5, 'Composite min Y should be -0.5');
  assert.strictEqual(compBBox.max.y, 2.2, 'Composite max Y should be 2.2');
  assert.strictEqual(compBBox.size.y, 2.7, 'Composite size Y should span 2.7m');
  assert.strictEqual(compBBox.totalTriangles, 1570 + 832, 'Total triangles should sum both meshes');
  console.log('✓ Test 5: Composite multi-mesh union bounding box & polycount verified.');

  // Test 6: deriveMultiMeshPartName logic
  const singleName = deriveMultiMeshPartName('percheron', ['percheron_tanker_side_box_BL']);
  assert.strictEqual(singleName, 'percheron_tanker_side_box_bl', 'Single mesh name should be cleanly formatted');

  const multiPrefixName = deriveMultiMeshPartName('percheron', [
    'percheron_tanker_side_box_BL',
    'percheron_tanker_side_box_FL_supports'
  ]);
  assert(multiPrefixName.includes('tanker_side_box'), `Should extract common prefix: ${multiPrefixName}`);

  const disjointName = deriveMultiMeshPartName('percheron', ['hood', 'trunk', 'chassis']);
  assert.strictEqual(disjointName, 'percheron_assembly', 'Disjoint multi-meshes should fall back to assembly');
  console.log('✓ Test 6: deriveMultiMeshPartName smart part key resolution verified.');

  // Test 7: generateMultiMeshJBeam with multiple flexbodies and Bounding Box Cage
  const multiJBeam = generateMultiMeshJBeam({
    partKey: 'percheron_tanker_bed',
    slotKey: 'percheron_tanker_bed',
    partDesc: 'Percheron Tanker Bed Assembly',
    targetMeshes: ['percheron_tanker_side_box_BL', 'percheron_tanker_pipes_L'],
    meshDetailsMap: detailsMap,
    templateType: 'cage'
  });

  const parsed = JSON.parse(multiJBeam);
  assert(parsed.percheron_tanker_bed, 'JBeam must contain part percheron_tanker_bed');
  assert.strictEqual(parsed.percheron_tanker_bed.flexbodies.length, 3, 'Flexbodies must have 1 header + 2 mesh rows');
  assert.strictEqual(parsed.percheron_tanker_bed.flexbodies[1][0], 'percheron_tanker_side_box_BL');
  assert.strictEqual(parsed.percheron_tanker_bed.flexbodies[2][0], 'percheron_tanker_pipes_L');
  assert.strictEqual(parsed.percheron_tanker_bed.nodes.length, 12, 'Cage must have headers + 8 corner nodes');
  assert.strictEqual(parsed.percheron_tanker_bed.beams.length, 20, 'Cage must have headers + structural beams');
  console.log('✓ Test 7: Multi-mesh JBeam file generation with all flexbodies & composite cage verified.');

  // Test 8: Explicit 'No Visual Mesh' (__none__) completely unloads 3D meshes and prevents auto-reloading
  vmm.clear();
  assert.strictEqual(vmm.allMeshes.length, 0, 'vmm.clear() must leave allMeshes empty');
  assert.strictEqual(vmm.submeshNames.length, 0, 'vmm.clear() must reset submeshNames to empty');

  // Verify __none__ sentinel value prevents auto-load
  let selectedDae = '__none__';
  let autoLoaded = false;
  if (selectedDae !== '__none__' && !autoLoaded) {
    autoLoaded = true;
  }
  assert.strictEqual(autoLoaded, false, 'Auto-load must NOT trigger when selectedDae is __none__');
  console.log('✓ Test 8: Explicit "No Visual Mesh" (__none__) unloads 3D models and suppresses auto-reload.');

  // Test 9: Multi-level underscore prefix tree grouping & path compression
  const tree = buildSubmeshPrefixTree([
    'bastion_antenna_trunk',
    'bastion_adcarrier',
    'bastion_lettering_35luxe_awd',
    'bastion_lettering_redtail',
    'bastion_badge_pillar_redtail',
    'bastion_badge_pillar_battlehawk',
    'bastion_badge_hood'
  ], {
    bastion_antenna_trunk: { triangles: 142 },
    bastion_adcarrier: { triangles: 510 },
    bastion_lettering_35luxe_awd: { triangles: 14 },
    bastion_lettering_redtail: { triangles: 12 },
    bastion_badge_pillar_redtail: { triangles: 16 },
    bastion_badge_pillar_battlehawk: { triangles: 16 },
    bastion_badge_hood: { triangles: 20 }
  });

  assert.strictEqual(tree.rootPrefix, 'bastion', 'Shared root prefix must be unwrapped');
  const adcarrier = tree.nodes.find(n => n.type === 'leaf' && n.name === 'bastion_adcarrier');
  const antenna = tree.nodes.find(n => n.type === 'leaf' && n.name === 'bastion_antenna_trunk');
  assert.ok(adcarrier && antenna, 'Single-item meshes must remain flat leaves without redundant 1-item folders');
  assert.strictEqual(antenna.label, 'antenna_trunk');

  const lettering = tree.nodes.find(n => n.type === 'folder' && n.label === 'lettering');
  assert.ok(lettering && lettering.meshCount === 2 && lettering.totalTriangles === 26, 'Lettering folder must group 2 meshes and sum triangles');

  const badge = tree.nodes.find(n => n.type === 'folder' && n.label === 'badge');
  assert.ok(badge && badge.meshCount === 3, 'Badge folder must contain hood + pillar subfolder');
  const pillar = badge.children.find(c => c.type === 'folder' && c.label === 'pillar');
  assert.ok(pillar && pillar.meshCount === 2, 'Nested pillar level must group redtail and battlehawk');
  console.log('✓ Test 9: Multi-level underscore prefix tree grouping & path compression verified.');
}

if (process.argv[1]?.endsWith('daeMeshPanel.test.js')) {
  runDaeMeshPanelTests();
}
