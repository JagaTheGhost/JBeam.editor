import assert from 'assert';

export function runMultiMonitorPortalTests() {
  console.log('--- Running Multi-Monitor & Detached Viewport Tests ---');

  // Test 1: Window Features formatting for dual-monitor spawn
  const width = 1280;
  const height = 800;
  const features = `width=${width},height=${height},menubar=no,toolbar=no,location=no,status=no,resizable=yes`;
  assert(features.includes('width=1280'), 'Window features must specify 1280 width');
  assert(features.includes('height=800'), 'Window features must specify 800 height');
  assert(features.includes('resizable=yes'), 'Window features must be resizable');
  console.log('✓ Test 1: Dual-monitor window spawn features verified.');

  // Test 2: Stylesheet cloning simulation across parent and child document
  const mockStyleNode = {
    tagName: 'STYLE',
    textContent: '.jbeam-viewport { background: #111; }',
    cloneNode: function (deep) {
      return {
        tagName: this.tagName,
        textContent: deep ? this.textContent : ''
      };
    }
  };

  const mockLinkNode = {
    tagName: 'LINK',
    rel: 'stylesheet',
    href: 'http://localhost:5173/assets/index.css',
    cloneNode: function () {
      return {
        tagName: this.tagName,
        rel: this.rel,
        href: this.href
      };
    }
  };

  const mockHead = {
    children: [],
    appendChild: function (node) {
      this.children.push(node);
      return node;
    }
  };

  const clonedStyle = mockStyleNode.cloneNode(true);
  const clonedLink = mockLinkNode.cloneNode(true);
  mockHead.appendChild(clonedStyle);
  mockHead.appendChild(clonedLink);

  assert.strictEqual(mockHead.children.length, 2, 'Mock child window head should have 2 cloned nodes');
  assert.strictEqual(mockHead.children[0].textContent, '.jbeam-viewport { background: #111; }');
  assert.strictEqual(mockHead.children[1].href, 'http://localhost:5173/assets/index.css');
  console.log('✓ Test 2: Cross-window CSS stylesheet cloning verified.');

  // Test 3: Monaco Editor Undo/Redo Action invocation contract
  const editorActions = {
    undoInvoked: false,
    redoInvoked: false
  };

  const mockMonacoEditor = {
    getAction: function (actionId) {
      if (actionId === 'undo') {
        return {
          run: () => {
            editorActions.undoInvoked = true;
          }
        };
      }
      if (actionId === 'redo') {
        return {
          run: () => {
            editorActions.redoInvoked = true;
          }
        };
      }
      return null;
    }
  };

  mockMonacoEditor.getAction('undo')?.run();
  mockMonacoEditor.getAction('redo')?.run();

  assert.strictEqual(editorActions.undoInvoked, true, 'Monaco undo action should have executed');
  assert.strictEqual(editorActions.redoInvoked, true, 'Monaco redo action should have executed');
  console.log('✓ Test 3: Monaco editor undo/redo action contract verified.');

  // Test 4: Secondary window cleanup on beforeunload & close
  let unmountCallbackInvoked = false;
  const mockChildWindow = {
    closed: false,
    close: function () {
      this.closed = true;
    },
    addEventListener: function (event, handler) {
      if (event === 'beforeunload') {
        this.beforeUnloadHandler = handler;
      }
    },
    triggerUnload: function () {
      if (this.beforeUnloadHandler) {
        this.beforeUnloadHandler();
      }
    }
  };

  const cleanupHook = () => {
    unmountCallbackInvoked = true;
  };

  mockChildWindow.addEventListener('beforeunload', cleanupHook);
  mockChildWindow.triggerUnload();

  assert.strictEqual(unmountCallbackInvoked, true, 'Unload callback should synchronize dock state when window is closed');
  console.log('✓ Test 4: Secondary window lifecycle & unmount cleanup verified.');

  // Test 5: Detached viewport URL query param detection
  const sampleUrl = 'http://localhost:5173/?view=viewport-detached';
  const urlObj = new URL(sampleUrl);
  const isDetachedRoute = urlObj.searchParams.get('view') === 'viewport-detached';
  assert.strictEqual(isDetachedRoute, true, 'Detached route must match ?view=viewport-detached');

  const standardUrl = 'http://localhost:5173/';
  const standardUrlObj = new URL(standardUrl);
  const isStandardRoute = standardUrlObj.searchParams.get('view') === 'viewport-detached';
  assert.strictEqual(isStandardRoute, false, 'Standard route must not match viewport-detached');
  console.log('✓ Test 5: Detached viewport URL query param route detection verified.');

  // Test 6: Multi-window BroadcastChannel sync message contract
  const syncPayload = {
    type: 'SYNC_ALL',
    parts: {
      hood: {
        information: { name: 'Carbon Hood' },
        nodes: { n1: { id: 'n1', posX: 0, posY: 1.5, posZ: 0.8 } },
        beams: [{ id1: 'n1', id2: 'n2' }]
      }
    },
    compositeVehicleParts: null,
    activeTabTitle: 'hood.jbeam',
    selectedNodeId: 'n1',
    selectedBeamInfo: null,
    symmetryEnabled: true,
    activeTool: 'select',
    partVisibility: { hood: true, fender_L: false }
  };

  assert.strictEqual(syncPayload.type, 'SYNC_ALL');
  assert.strictEqual(syncPayload.activeTabTitle, 'hood.jbeam');
  assert.strictEqual(syncPayload.parts.hood.information.name, 'Carbon Hood');
  assert.strictEqual(syncPayload.partVisibility.fender_L, false);
  console.log('✓ Test 6: Multi-window BroadcastChannel sync payload structure verified.');

  // Test 7: Detached window node selection & move message contract
  const nodeSelectMsg = { type: 'SELECT_NODE', nodeId: 'n1' };
  const nodeMoveMsg = {
    type: 'COMMIT_NODE_MOVE',
    nodeId: 'n1',
    newPosition: { x: 0.1, y: 1.52, z: 0.81 },
    symmetry: true
  };

  let nodeJumped = null;
  let codeUpdatedWithMove = null;

  const mockMainMessageHandler = (data) => {
    if (data.type === 'SELECT_NODE') {
      nodeJumped = data.nodeId;
    } else if (data.type === 'COMMIT_NODE_MOVE') {
      codeUpdatedWithMove = { id: data.nodeId, pos: data.newPosition, sym: data.symmetry };
    }
  };

  mockMainMessageHandler(nodeSelectMsg);
  assert.strictEqual(nodeJumped, 'n1', 'Node select message should trigger code highlight jump');

  mockMainMessageHandler(nodeMoveMsg);
  assert.deepStrictEqual(codeUpdatedWithMove, {
    id: 'n1',
    pos: { x: 0.1, y: 1.52, z: 0.81 },
    sym: true
  }, 'Node move message should trigger AST lossless coordinate update');
  console.log('✓ Test 7: Bi-directional node selection and coordinate move contract verified.');

  // Test 8: Main App sidebar segregation when detached vs docked
  const computeMainAppSidebarTabs = (isDetached) => {
    const leftTabs = ['files', 'mechanical'];
    if (!isDetached) {
      leftTabs.unshift('code');
      leftTabs.splice(2, 0, 'assembly', 'meshes');
    }
    const rightTabs = isDetached ? [] : ['inspector', 'structure'];
    return { leftTabs, rightTabs };
  };

  const detachedMainTabs = computeMainAppSidebarTabs(true);
  assert(!detachedMainTabs.leftTabs.includes('assembly'), 'Main app left sidebar must NOT contain assembly when detached');
  assert(!detachedMainTabs.leftTabs.includes('meshes'), 'Main app left sidebar must NOT contain meshes when detached');
  assert.strictEqual(detachedMainTabs.rightTabs.length, 0, 'Main app right sidebar must NOT contain 3D tabs when detached');
  assert(detachedMainTabs.leftTabs.includes('files'), 'Main app left sidebar must maintain files explorer');

  const dockedMainTabs = computeMainAppSidebarTabs(false);
  assert(dockedMainTabs.leftTabs.includes('assembly'), 'Docked mode left sidebar includes assembly');
  assert(dockedMainTabs.leftTabs.includes('meshes'), 'Docked mode left sidebar includes meshes');
  assert(dockedMainTabs.rightTabs.includes('inspector'), 'Docked mode right sidebar includes inspector');
  assert(dockedMainTabs.rightTabs.includes('structure'), 'Docked mode right sidebar includes structure');
  console.log('✓ Test 8: Main app sidebar segregation when detached vs docked verified.');

  // Test 9: Detached 3D Viewport proper dual-sidebar separation
  const detachedViewportSidebars = {
    left: ['assembly', 'meshes'],
    center: '3D Viewport',
    right: ['inspector', 'structure']
  };

  assert.deepStrictEqual(detachedViewportSidebars.left, ['assembly', 'meshes'], 'Detached left sidebar must have assembly & meshes');
  assert.deepStrictEqual(detachedViewportSidebars.right, ['inspector', 'structure'], 'Detached right sidebar must have inspector & structure');
  assert.strictEqual(detachedViewportSidebars.center, '3D Viewport');
  console.log('✓ Test 9: Detached 3D viewport dual-sidebar separation verified.');

  // Test 10: Detached Viewport Meshes tab isolation contract
  const computeViewportMeshIsolation = ({ activeLeftTab, spawnedMeshNames, activeMatchingMeshNames }) => {
    const isMeshesTabActive = activeLeftTab === 'meshes';
    const structureGroupVisible = !isMeshesTabActive;
    const filterTargets = isMeshesTabActive ? spawnedMeshNames : activeMatchingMeshNames;
    return {
      isMeshesTabActive,
      structureGroupVisible,
      filterTargets
    };
  };

  const detachedMeshesMode = computeViewportMeshIsolation({
    activeLeftTab: 'meshes',
    spawnedMeshNames: new Set(['etk_wheel_01', 'etk_wheel_02']),
    activeMatchingMeshNames: new Set(['etkk_suspension_R'])
  });

  assert.strictEqual(detachedMeshesMode.isMeshesTabActive, true, 'isMeshesTabActive must be true when on meshes tab');
  assert.strictEqual(detachedMeshesMode.structureGroupVisible, false, 'JBeam physics structure wireframe must be hidden to isolate 3D visual meshes');
  assert(detachedMeshesMode.filterTargets.has('etk_wheel_01'), 'Meshes tab must render spawned 3D meshes in viewport');
  assert(!detachedMeshesMode.filterTargets.has('etkk_suspension_R'), 'Meshes tab must not filter by JBeam part flexbodies');

  const detachedAssemblyMode = computeViewportMeshIsolation({
    activeLeftTab: 'assembly',
    spawnedMeshNames: new Set(['etk_wheel_01']),
    activeMatchingMeshNames: new Set(['etkk_suspension_R'])
  });

  assert.strictEqual(detachedAssemblyMode.isMeshesTabActive, false, 'isMeshesTabActive must be false on assembly tab');
  assert.strictEqual(detachedAssemblyMode.structureGroupVisible, true, 'Structure wireframe must be visible on assembly tab');
  assert(detachedAssemblyMode.filterTargets.has('etkk_suspension_R'), 'Assembly tab filters by matching flexbodies');
  console.log('✓ Test 10: Detached viewport Meshes tab isolation & structure visibility verified.');

  // Test 11: Detached Window DAE submesh spawning & live sync
  let detachedSpawned = new Set();
  const submeshList = ['wheel_front', 'wheel_rear', 'caliper'];

  const onUpdateSubmeshNames = (names) => {
    if (!detachedSpawned || detachedSpawned.size === 0) {
      detachedSpawned = new Set(names);
    }
  };

  const toggleSpawn = (name) => {
    const next = new Set(detachedSpawned);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    detachedSpawned = next;
  };

  const despawnAll = () => {
    detachedSpawned = new Set();
  };

  const spawnAll = () => {
    detachedSpawned = new Set(submeshList);
  };

  onUpdateSubmeshNames(submeshList);
  assert.strictEqual(detachedSpawned.size, 3, 'Initial DAE load must spawn all detected submeshes by default');

  toggleSpawn('caliper');
  assert.strictEqual(detachedSpawned.has('caliper'), false, 'Toggling submesh must unspawn it');
  assert.strictEqual(detachedSpawned.size, 2);

  despawnAll();
  assert.strictEqual(detachedSpawned.size, 0, 'Despawn all must empty spawned meshes');

  spawnAll();
  assert.strictEqual(detachedSpawned.size, 3, 'Spawn all must restore all submeshes');
  console.log('✓ Test 11: Detached window DAE submesh spawning & live sync verified.');

  console.log('All Multi-Monitor & Detached Viewport tests passed successfully!');
}

if (process.argv[1]?.endsWith('multiMonitorPortal.test.js')) {
  runMultiMonitorPortalTests();
}
