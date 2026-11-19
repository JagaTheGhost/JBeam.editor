import React, { useState, useEffect, useRef, useCallback } from 'react';
import AppBrandName from '../../components/AppBrandName.jsx';
import JBeamViewport from './JBeamViewport.jsx';
import { StructureTree } from '../explorer/StructureTree.jsx';
import { ElementInspector } from '../inspector/ElementInspector.jsx';
import { AssemblyManager } from '../assembly/AssemblyManager.jsx';
import { DaeMeshPanel } from '../meshes/DaeMeshPanel.jsx';
import ErrorBoundary from '../../components/ErrorBoundary.jsx';
import {
  RestoreIcon,
  StructureIcon,
  InspectorIcon,
  AssemblyIcon,
  CubeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DockIcon,
  MinimizeIcon,
  MaximizeIcon
} from '../../components/Icons.jsx';

const SYNC_CHANNEL_NAME = 'jbeam-studio-viewport-sync';

export function DetachedViewportApp() {
  const [jbeamParts, setJbeamParts] = useState(null);
  const [compositeVehicleParts, setCompositeVehicleParts] = useState(null);
  const [activeTabTitle, setActiveTabTitle] = useState('Syncing with JBeam.editor...');
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedBeamInfo, setSelectedBeamInfo] = useState(null);
  const [selectedSurfaceInfo, setSelectedSurfaceInfo] = useState(null);
  const [symmetryEnabled, setSymmetryEnabled] = useState(true);
  const [activeTool, setActiveTool] = useState('select');
  const [liveCoords, setLiveCoords] = useState(null);

  // Visual Mesh Overlay (.dae)
  const [workspacePath, setWorkspacePath] = useState('');
  const [discoveredDaeFiles, setDiscoveredDaeFiles] = useState([]);
  const [selectedDaePath, setSelectedDaePath] = useState('');
  const [spawnedMeshNames, setSpawnedMeshNames] = useState(new Set());
  const [meshOpacity, setMeshOpacity] = useState(0.45);
  const [meshWireframe, setMeshWireframe] = useState(false);
  const [visualMeshDaeText, setVisualMeshDaeText] = useState(null);
  const [visualMeshName, setVisualMeshName] = useState(null);
  const [visualMeshSubnames, setVisualMeshSubnames] = useState([]);
  const [visualMeshSubmeshDetails, setVisualMeshSubmeshDetails] = useState({});
  const [highlightedSubmesh, setHighlightedSubmesh] = useState(null);
  const [isolateMatchingMesh, setIsolateMatchingMesh] = useState(false);
  const [viewportSource, setViewportSource] = useState('activeDocument');

  // Assembly State
  const [partVisibility, setPartVisibility] = useState({});
  const [assemblyTree, setAssemblyTree] = useState([]);
  const [configurations, setConfigurations] = useState([]);
  const [activeConfigName, setActiveConfigName] = useState(null);
  const [rootParts, setRootParts] = useState([]);
  const [activeRootPart, setActiveRootPart] = useState(null);

  // Dual Sidebar Layout (Proper 3D Studio Separation)
  // Left: Scene Hierarchy & Models (Assembly & Meshes)
  // Right: Inspection & Structure Details (Inspector & Structure)
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(360);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [activeLeftTab, setActiveLeftTab] = useState('assembly'); // 'assembly' | 'meshes'

  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(340);
  const [isResizingRight, setIsResizingRight] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState('inspector'); // 'inspector' | 'structure'

  const channelRef = useRef(null);

  const sendMessage = useCallback((msg) => {
    try {
      channelRef.current?.postMessage(msg);
    } catch (e) {}
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ channel: SYNC_CHANNEL_NAME, ...msg }, '*');
      }
    } catch (e) {}
  }, []);

  // Set document title & detached favicon
  useEffect(() => {
    document.title = activeTabTitle ? `3D Viewport — ${activeTabTitle}` : 'JBeam.editor — 3D Viewport';
    try {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.type = 'image/png';
      link.href = './icons/partconfig-dark.png';
    } catch (e) {}
  }, [activeTabTitle]);

  // Setup communication channel
  useEffect(() => {
    let bc = null;
    try {
      bc = new BroadcastChannel(SYNC_CHANNEL_NAME);
      channelRef.current = bc;
    } catch (e) {
      console.warn('BroadcastChannel not supported:', e);
    }

    const handleIncomingMessage = (data) => {
      if (!data || typeof data !== 'object') return;
      switch (data.type) {
        case 'SYNC_ALL':
          if (data.parts !== undefined) setJbeamParts(data.parts);
          if (data.compositeVehicleParts !== undefined) setCompositeVehicleParts(data.compositeVehicleParts);
          if (data.activeTabTitle !== undefined) setActiveTabTitle(data.activeTabTitle || 'untitled.jbeam');
          if (data.selectedNodeId !== undefined) setSelectedNodeId(data.selectedNodeId);
          if (data.selectedBeamInfo !== undefined) setSelectedBeamInfo(data.selectedBeamInfo);
          if (data.selectedSurfaceInfo !== undefined) setSelectedSurfaceInfo(data.selectedSurfaceInfo);
          if (data.symmetryEnabled !== undefined) setSymmetryEnabled(data.symmetryEnabled);
          if (data.activeTool !== undefined) setActiveTool(data.activeTool);
          if (data.partVisibility !== undefined) setPartVisibility(data.partVisibility);
          if (data.assemblyTree !== undefined) setAssemblyTree(data.assemblyTree);
          if (data.configurations !== undefined) setConfigurations(data.configurations);
          if (data.activeConfigName !== undefined) setActiveConfigName(data.activeConfigName);
          if (data.rootParts !== undefined) setRootParts(data.rootParts);
          if (data.activeRootPart !== undefined) setActiveRootPart(data.activeRootPart);
          if (data.visualMeshName !== undefined) setVisualMeshName(data.visualMeshName);
          if (data.visualMeshSubnames !== undefined) setVisualMeshSubnames(data.visualMeshSubnames);
          if (data.visualMeshSubmeshDetails !== undefined) setVisualMeshSubmeshDetails(data.visualMeshSubmeshDetails);
          if (data.visualMeshDaeText !== undefined) setVisualMeshDaeText(data.visualMeshDaeText);
          if (data.isolateMatchingMesh !== undefined) setIsolateMatchingMesh(data.isolateMatchingMesh);
          if (data.highlightedSubmesh !== undefined) setHighlightedSubmesh(data.highlightedSubmesh);
          if (data.viewportSource !== undefined) setViewportSource(data.viewportSource);
          if (data.workspacePath !== undefined) setWorkspacePath(data.workspacePath);
          if (data.discoveredDaeFiles !== undefined) setDiscoveredDaeFiles(data.discoveredDaeFiles);
          if (data.selectedDaePath !== undefined) setSelectedDaePath(data.selectedDaePath);
          if (data.spawnedMeshNames !== undefined) {
            setSpawnedMeshNames(new Set(Array.isArray(data.spawnedMeshNames) ? data.spawnedMeshNames : Array.from(data.spawnedMeshNames || [])));
          }
          if (data.meshOpacity !== undefined) setMeshOpacity(data.meshOpacity);
          if (data.meshWireframe !== undefined) setMeshWireframe(data.meshWireframe);
          break;

        case 'SET_VIEWPORT_SOURCE':
          if (data.viewportSource !== undefined) setViewportSource(data.viewportSource);
          break;

        case 'SYNC_SELECTION':
          if (data.selectedNodeId !== undefined) setSelectedNodeId(data.selectedNodeId);
          if (data.selectedBeamInfo !== undefined) setSelectedBeamInfo(data.selectedBeamInfo);
          if (data.selectedSurfaceInfo !== undefined) setSelectedSurfaceInfo(data.selectedSurfaceInfo);
          break;

        case 'SET_SPAWNED_MESH_NAMES':
          if (data.spawnedMeshNames !== undefined) {
            setSpawnedMeshNames(new Set(Array.isArray(data.spawnedMeshNames) ? data.spawnedMeshNames : Array.from(data.spawnedMeshNames || [])));
          }
          break;

        case 'REATTACH':
          window.close();
          break;

        default:
          break;
      }
    };

    if (bc) {
      bc.onmessage = (e) => handleIncomingMessage(e.data);
    }

    const handleWindowMessage = (e) => {
      if (e.data && e.data.channel === SYNC_CHANNEL_NAME) {
        handleIncomingMessage(e.data);
      }
    };
    window.addEventListener('message', handleWindowMessage);

    // Request initial state from main window immediately and after a short tick
    sendMessage({ type: 'REQUEST_SYNC' });
    const retryTimer = setTimeout(() => {
      sendMessage({ type: 'REQUEST_SYNC' });
    }, 150);

    return () => {
      clearTimeout(retryTimer);
      window.removeEventListener('message', handleWindowMessage);
      try {
        bc?.close();
      } catch (e) {}
    };
  }, [sendMessage]);

  // Viewport Interaction Handlers
  const handleSelectNode = useCallback((nodeId) => {
    setSelectedNodeId(nodeId);
    setSelectedBeamInfo(null);
    setSelectedSurfaceInfo(null);
    sendMessage({ type: 'SELECT_NODE', nodeId });
  }, [sendMessage]);

  const handleSelectBeam = useCallback((partNameOrInfo, maybeBeamKey, maybeBeam) => {
    let beamInfo = null;
    if (partNameOrInfo && typeof partNameOrInfo === 'object') {
      beamInfo = partNameOrInfo;
    } else if (typeof partNameOrInfo === 'string' && maybeBeamKey !== undefined) {
      beamInfo = { partName: partNameOrInfo, beamKey: maybeBeamKey, beam: maybeBeam };
    } else if (typeof partNameOrInfo === 'string') {
      const parts = partNameOrInfo.split('-');
      beamInfo = { beamKey: partNameOrInfo, id1: parts[0], id2: parts[1] };
    }
    setSelectedBeamInfo(beamInfo);
    setSelectedNodeId(null);
    setSelectedSurfaceInfo(null);
    sendMessage({ type: 'SELECT_BEAM', beamInfo });
  }, [sendMessage]);

  const handleSelectSurface = useCallback((surfaceInfo) => {
    setSelectedSurfaceInfo(surfaceInfo);
    setSelectedNodeId(null);
    setSelectedBeamInfo(null);
    sendMessage({ type: 'SELECT_SURFACE', surfaceInfo });
  }, [sendMessage]);

  const handleCommitNodeMove = useCallback((nodeId, newPosition, symmetry) => {
    setLiveCoords(null);
    sendMessage({ type: 'COMMIT_NODE_MOVE', nodeId, newPosition, symmetry });
  }, [sendMessage]);

  const handleLiveNodeMove = useCallback((nodeId, newPosition) => {
    setLiveCoords({ nodeId, ...newPosition });
    sendMessage({ type: 'LIVE_NODE_MOVE', nodeId, newPosition });
  }, [sendMessage]);

  const handleTogglePartVisibility = useCallback((partName) => {
    setPartVisibility(prev => {
      const updated = { ...prev, [partName]: prev[partName] === false ? true : false };
      return updated;
    });
    sendMessage({ type: 'TOGGLE_PART_VISIBILITY', partName });
  }, [sendMessage]);

  const handleToggleAllVisibility = useCallback((visible) => {
    setPartVisibility(prev => {
      const updated = {};
      Object.keys(prev).forEach(k => { updated[k] = visible; });
      return updated;
    });
    sendMessage({ type: 'TOGGLE_ALL_VISIBILITY', visible });
  }, [sendMessage]);

  // Window Controls State (frameless custom header)
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.jbeamAPI?.isWindowMaximized) {
      window.jbeamAPI.isWindowMaximized().then(setIsMaximized).catch(() => {});
    }
    if (typeof window !== 'undefined' && window.jbeamAPI?.onWindowMaximizedChange) {
      return window.jbeamAPI.onWindowMaximizedChange(setIsMaximized);
    }
  }, []);

  const handleMinimize = useCallback(() => {
    if (typeof window !== 'undefined' && window.jbeamAPI?.minimizeWindow) {
      window.jbeamAPI.minimizeWindow();
    }
  }, []);

  const handleMaximize = useCallback(() => {
    if (typeof window !== 'undefined' && window.jbeamAPI?.maximizeWindow) {
      window.jbeamAPI.maximizeWindow();
    }
  }, []);

  const handleDockToMainWindow = useCallback(() => {
    try {
      sendMessage({ type: 'REATTACH_REQUESTED' });
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ channel: SYNC_CHANNEL_NAME, type: 'REATTACH_REQUESTED' }, '*');
      }
    } catch (e) {}
    window.close();
  }, [sendMessage]);

  // Handle keyboard shortcuts (Escape or Ctrl+W to dock back into main window)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' || (e.ctrlKey && e.key.toLowerCase() === 'w')) {
        e.preventDefault();
        handleDockToMainWindow();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDockToMainWindow]);

  // Ensure reattach is signaled if window is closed directly
  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        sendMessage({ type: 'REATTACH_REQUESTED' });
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({ channel: SYNC_CHANNEL_NAME, type: 'REATTACH_REQUESTED' }, '*');
        }
      } catch (e) {}
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [sendMessage]);

  // Left Sidebar Drag Resizing
  const handleStartResizeLeft = useCallback((startEvent) => {
    startEvent.preventDefault();
    setIsResizingLeft(true);
    const startX = startEvent.clientX;
    const startW = leftSidebarWidth;

    const onPointerMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      setLeftSidebarWidth(Math.max(220, Math.min(650, startW + delta)));
    };

    const onPointerUp = () => {
      setIsResizingLeft(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, [leftSidebarWidth]);

  // Right Sidebar Drag Resizing
  const handleStartResizeRight = useCallback((startEvent) => {
    startEvent.preventDefault();
    setIsResizingRight(true);
    const startX = startEvent.clientX;
    const startW = rightSidebarWidth;

    const onPointerMove = (moveEvent) => {
      const delta = startX - moveEvent.clientX;
      setRightSidebarWidth(Math.max(240, Math.min(650, startW + delta)));
    };

    const onPointerUp = () => {
      setIsResizingRight(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, [rightSidebarWidth]);

  // Left Tab Switching with automatic Assembly source switch
  const handleSwitchLeftTab = useCallback((targetTab) => {
    setActiveLeftTab(prevTab => {
      if (prevTab === targetTab) return prevTab;
      return targetTab;
    });
    if (targetTab === 'assembly') {
      setViewportSource('assembly');
      sendMessage({ type: 'SET_VIEWPORT_SOURCE', viewportSource: 'assembly' });
    } else {
      setViewportSource('activeDocument');
      sendMessage({ type: 'SET_VIEWPORT_SOURCE', viewportSource: 'activeDocument' });
    }
  }, [sendMessage]);

  // Flexbody Mesh Isolation Toggle
  const handleToggleIsolateMesh = useCallback(() => {
    setIsolateMatchingMesh(prev => {
      const next = !prev;
      sendMessage({ type: 'TOGGLE_ISOLATE_MESH', isolateMatchingMesh: next });
      return next;
    });
  }, [sendMessage]);

  // Viewport Source Switcher
  const handleChangeViewportSource = useCallback((src) => {
    setViewportSource(src);
    sendMessage({ type: 'SET_VIEWPORT_SOURCE', viewportSource: src });
  }, [sendMessage]);

  // Submesh Highlighting
  const handleHighlightSubmesh = useCallback((submeshName) => {
    setHighlightedSubmesh(submeshName);
    sendMessage({ type: 'HIGHLIGHT_SUBMESH', submeshName });
  }, [sendMessage]);

  // 3D Visual Authoring Tools (add, delete, extrude, connect, subdivide)
  const handleAddNode = useCallback((beamngPos) => {
    sendMessage({ type: 'ADD_NODE', pos: beamngPos });
  }, [sendMessage]);

  const handleAddBeam = useCallback((id1, id2, presetProps, isCrossPart, options) => {
    sendMessage({ type: 'ADD_BEAM', id1, id2, presetProps, isCrossPart, options });
  }, [sendMessage]);

  const handleAddTriangle = useCallback((n1, n2, n3) => {
    sendMessage({ type: 'ADD_TRIANGLE', n1, n2, n3 });
  }, [sendMessage]);

  const handleAddQuad = useCallback((n1, n2, n3, n4) => {
    sendMessage({ type: 'ADD_QUAD', n1, n2, n3, n4 });
  }, [sendMessage]);

  const handleDeleteSelected = useCallback((type, target) => {
    sendMessage({ type: 'DELETE_SELECTED', deleteType: type, target });
  }, [sendMessage]);

  const handleExtrudeNodes = useCallback((nodeIds, offset) => {
    sendMessage({ type: 'EXTRUDE_NODES', nodeIds, offset });
  }, [sendMessage]);

  const handleQuickConnect = useCallback((nodeIds) => {
    sendMessage({ type: 'QUICK_CONNECT', nodeIds });
  }, [sendMessage]);

  const handleSubdivideBeam = useCallback((beamInfo) => {
    sendMessage({ type: 'SUBDIVIDE_BEAM', beamInfo });
  }, [sendMessage]);

  const handleChangeBeamType = useCallback((beamKey, newType) => {
    sendMessage({ type: 'CHANGE_BEAM_TYPE', beamKey, newType });
  }, [sendMessage]);

  const handleRenameNode = useCallback((oldId, newId) => {
    sendMessage({ type: 'RENAME_NODE', oldId, newId });
  }, [sendMessage]);

  const handleBatchRenameNode = useCallback((nodeId, newName) => {
    sendMessage({ type: 'BATCH_RENAME_NODE', nodeId, newName });
  }, [sendMessage]);

  const handleSelectSlotPart = useCallback((slotName, partName) => {
    sendMessage({ type: 'SELECT_SLOT_PART', slotName, partName });
  }, [sendMessage]);

  const handleSelectConfig = useCallback((configName) => {
    setActiveConfigName(configName);
    sendMessage({ type: 'SET_CONFIGURATION', configName });
  }, [sendMessage]);

  const handleSelectRootPart = useCallback((rootPartName) => {
    setActiveRootPart(rootPartName);
    sendMessage({ type: 'SET_ROOT_PART', rootPartName });
  }, [sendMessage]);

  const handleUndo = useCallback(() => {
    sendMessage({ type: 'UNDO' });
  }, [sendMessage]);

  const handleRedo = useCallback(() => {
    sendMessage({ type: 'REDO' });
  }, [sendMessage]);

  // DAE Loader & Mesh Panel Actions
  const handleOpenDaeDialog = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.dae';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const text = event.target.result;
          setVisualMeshDaeText(text);
          setVisualMeshName(file.name);
          setSelectedDaePath(file.name);
          sendMessage({ type: 'LOAD_DAE', daeText: text, fileName: file.name });
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }, [sendMessage]);

  const handleUnloadDae = useCallback(() => {
    setVisualMeshDaeText(null);
    setVisualMeshName(null);
    setVisualMeshSubnames([]);
    setVisualMeshSubmeshDetails({});
    setSpawnedMeshNames(new Set());
    setSelectedDaePath('__none__');
    sendMessage({ type: 'UNLOAD_DAE' });
  }, [sendMessage]);

  const handleLoadDaeContent = useCallback((content, name, fullPath) => {
    setVisualMeshDaeText(content);
    setVisualMeshName(name);
    setSelectedDaePath(fullPath || name);
    sendMessage({ type: 'LOAD_DAE_CONTENT', content, name, fullPath });
  }, [sendMessage]);

  const handleUpdateSubmeshNames = useCallback((names) => {
    setVisualMeshSubnames(names);
    setSpawnedMeshNames(prev => {
      // If no submeshes currently spawned or if count changed, default to spawning all
      if (!prev || prev.size === 0 || (names && names.length > 0 && prev.size !== names.length)) {
        return new Set(names);
      }
      return prev;
    });
  }, []);

  const handleSelectDiscoveredDae = useCallback(async (daePath) => {
    if (!daePath || daePath === '__none__') {
      setSelectedDaePath('__none__');
      handleUnloadDae();
      return;
    }
    setSelectedDaePath(daePath);
    sendMessage({ type: 'SELECT_DISCOVERED_DAE', daePath });

    try {
      const fileName = daePath.split(/[\\/]/).pop();
      const matched = (discoveredDaeFiles || []).find(d => d.path === daePath || d.name === daePath || d.name === fileName);
      if (matched?.content) {
        handleLoadDaeContent(matched.content, fileName, daePath);
        return;
      }
      const targetPath = matched?.path || daePath;
      if (window.jbeamAPI?.readFile) {
        const res = await window.jbeamAPI.readFile(targetPath);
        if (res && res.success && res.content) {
          handleLoadDaeContent(res.content, fileName, targetPath);
        }
      }
    } catch (err) {
      console.error('Failed to load selected DAE in detached window:', err);
    }
  }, [discoveredDaeFiles, handleLoadDaeContent, handleUnloadDae, sendMessage]);

  const handleUploadDaeFile = useCallback((fileObj) => {
    sendMessage({ type: 'UPLOAD_DAE_FILE', fileObj });
  }, [sendMessage]);

  const handleToggleSpawnMesh = useCallback((meshName) => {
    setSpawnedMeshNames(prev => {
      const next = new Set(prev);
      if (next.has(meshName)) next.delete(meshName);
      else next.add(meshName);
      sendMessage({ type: 'TOGGLE_SPAWN_MESH', meshName, spawnedMeshNames: Array.from(next) });
      return next;
    });
  }, [sendMessage]);

  const handleSpawnAllMeshes = useCallback(() => {
    const all = new Set(visualMeshSubnames);
    setSpawnedMeshNames(all);
    sendMessage({ type: 'SPAWN_ALL_MESHES', spawnedMeshNames: Array.from(all) });
  }, [visualMeshSubnames, sendMessage]);

  const handleDespawnAllMeshes = useCallback(() => {
    setSpawnedMeshNames(new Set());
    sendMessage({ type: 'DESPAWN_ALL_MESHES', spawnedMeshNames: [] });
  }, [sendMessage]);

  const handleSetMeshOpacity = useCallback((opacity) => {
    setMeshOpacity(opacity);
    sendMessage({ type: 'SET_MESH_OPACITY', opacity });
  }, [sendMessage]);

  const handleSetMeshWireframe = useCallback((wireframe) => {
    setMeshWireframe(wireframe);
    sendMessage({ type: 'SET_MESH_WIREFRAME', wireframe });
  }, [sendMessage]);

  const handleCreateJBeamForMesh = useCallback(async ({ fileName, content, targetMesh, targetMeshes }) => {
    sendMessage({ type: 'CREATE_JBEAM_FOR_MESH', fileName, content, targetMesh, targetMeshes });
    const meshesToAdd = (targetMeshes && targetMeshes.length > 0)
      ? targetMeshes
      : (targetMesh ? [targetMesh] : []);
    if (meshesToAdd.length > 0) {
      setSpawnedMeshNames(prev => new Set([...prev, ...meshesToAdd]));
    }
  }, [sendMessage]);

  // Calculate stats for assembly / inspector
  const nodeCount = React.useMemo(() => {
    if (!jbeamParts) return 0;
    let count = 0;
    for (const key of Object.keys(jbeamParts)) {
      if (key === '__meta') continue;
      count += Object.keys(jbeamParts[key]?.nodes || {}).filter(k => k !== '__meta').length;
    }
    return count;
  }, [jbeamParts]);

  const beamCount = React.useMemo(() => {
    if (!jbeamParts) return 0;
    let count = 0;
    for (const key of Object.keys(jbeamParts)) {
      if (key === '__meta') continue;
      const b = jbeamParts[key]?.beams;
      if (Array.isArray(b)) {
        count += b.length;
      } else if (b && typeof b === 'object') {
        count += Object.keys(b).filter(k => k !== '__meta').length;
      }
    }
    return count;
  }, [jbeamParts]);

  const hiddenPartNames = React.useMemo(() => {
    const hidden = new Set();
    Object.entries(partVisibility).forEach(([partName, visible]) => {
      if (visible === false) hidden.add(partName);
    });
    return hidden;
  }, [partVisibility]);

  return (
    <div className="detached-window-root">
      {/* Detached Window Titlebar Header (Sleek frameless custom titlebar matching main app) */}
      <header
        className="detached-window-header app-top-header window-titlebar"
        onDoubleClick={handleMaximize}
      >
        <div className="detached-window-title titlebar-left">
          <div className="titlebar-brand" title="JBeam.editor — 3D Viewport">
            <img
              src="./icons/partconfig-dark.png"
              alt="3D Viewport Logo"
              className="detached-window-logo-img"
            />
          </div>
          <span className="detached-window-heading">
            <AppBrandName /> <span className="titlebar-sep">—</span> <span>3D Viewport</span>
          </span>
          {activeTabTitle && (
            <>
              <span className="titlebar-sep">—</span>
              <span className="detached-window-doc-badge">{activeTabTitle}</span>
            </>
          )}
        </div>

        {/* Center Draggable Region */}
        <div className="detached-window-drag-region" />

        {/* Right Section: Window Controls */}
        <div className="detached-window-actions titlebar-right">
          <div className="window-controls-group">
            <button
              type="button"
              onClick={handleMinimize}
              className="window-control-btn minimize"
              title="Minimize"
              aria-label="Minimize"
            >
              <MinimizeIcon size={12} />
            </button>
            <button
              type="button"
              onClick={handleMaximize}
              className="window-control-btn maximize"
              title={isMaximized ? 'Restore' : 'Maximize'}
              aria-label={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? <RestoreIcon size={11} /> : <MaximizeIcon size={11} />}
            </button>
            <button
              type="button"
              onClick={handleDockToMainWindow}
              className="window-control-btn dock-window-btn"
              title="Dock back to Main Window (Esc)"
              aria-label="Dock back to Main Window"
            >
              <DockIcon size={13} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Detached Workspace Body with Dual Sidebar Layout */}
      <div className={`detached-workspace-body ${isResizingLeft || isResizingRight ? 'is-resizing' : ''}`}>
        {/* Left Sidebar: Scene Hierarchy & Visual Models (Assembly & Meshes) */}
        <aside
          className={`left-sidebar ${leftSidebarOpen ? 'is-expanded' : 'is-collapsed'}`}
          style={{ width: leftSidebarOpen ? `${leftSidebarWidth}px` : '46px' }}
        >
          {/* Expanded Pane */}
          <div
            className="sidebar-pane-expanded"
            style={{ width: `${leftSidebarWidth}px` }}
            aria-hidden={!leftSidebarOpen}
          >
            <div className="sidebar-tabs-bar">
              <div className="sidebar-tabs">
                <button
                  type="button"
                  onClick={() => handleSwitchLeftTab('assembly')}
                  className={`sidebar-tab-btn ${activeLeftTab === 'assembly' ? 'active' : ''}`}
                  title="Vehicle Assembly & Slots"
                >
                  <AssemblyIcon size={17} />
                  <span>Assembly</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchLeftTab('meshes')}
                  className={`sidebar-tab-btn ${activeLeftTab === 'meshes' ? 'active' : ''}`}
                  title="3D Models & DAE Submeshes"
                >
                  <CubeIcon size={17} />
                  <span>Meshes</span>
                </button>
              </div>
              <button
                type="button"
                className="sidebar-toggle-close-btn"
                onClick={() => setLeftSidebarOpen(false)}
                title="Collapse Left Sidebar"
              >
                <ChevronLeftIcon size={15} />
              </button>
            </div>

            <div className="sidebar-content">
              {activeLeftTab === 'assembly' && (
                <AssemblyManager
                  configurations={configurations}
                  activeConfigName={activeConfigName}
                  onSelectConfiguration={handleSelectConfig}
                  rootParts={rootParts}
                  activeRootPart={activeRootPart}
                  onRootPartChange={handleSelectRootPart}
                  onSelectPartForSlot={handleSelectSlotPart}
                  assemblyTree={assemblyTree}
                  partVisibility={partVisibility}
                  onTogglePartVisibility={handleTogglePartVisibility}
                  onToggleAllVisibility={handleToggleAllVisibility}
                  totalAssembledStats={{
                    parts: compositeVehicleParts ? Object.keys(compositeVehicleParts).length : (jbeamParts ? Object.keys(jbeamParts).filter(k => k !== '__meta').length : 0),
                    nodes: nodeCount,
                    beams: beamCount
                  }}
                />
              )}
              {activeLeftTab === 'meshes' && (
                <DaeMeshPanel
                  workspacePath={workspacePath}
                  discoveredDaeFiles={discoveredDaeFiles}
                  selectedDaePath={selectedDaePath}
                  onSelectDaePath={handleSelectDiscoveredDae}
                  onLoadDaeContent={handleLoadDaeContent}
                  onUploadDaeFile={handleUploadDaeFile}
                  onOpenDaeDialog={handleOpenDaeDialog}
                  visualMeshName={visualMeshName}
                  visualMeshSubnames={visualMeshSubnames}
                  visualMeshSubmeshDetails={visualMeshSubmeshDetails}
                  spawnedMeshNames={spawnedMeshNames}
                  onToggleSpawnMesh={handleToggleSpawnMesh}
                  onSpawnAll={handleSpawnAllMeshes}
                  onDespawnAll={handleDespawnAllMeshes}
                  meshOpacity={meshOpacity}
                  onMeshOpacityChange={handleSetMeshOpacity}
                  meshWireframe={meshWireframe}
                  onMeshWireframeChange={handleSetMeshWireframe}
                  onCreateJBeamForMesh={handleCreateJBeamForMesh}
                />
              )}
            </div>
          </div>

          {/* Collapsed Activity Strip */}
          <div
            className="collapsed-sidebar-strip left-collapsed-strip"
            title="Left Sidebar"
            aria-hidden={leftSidebarOpen}
          >
            <div className="collapsed-strip-items">
              <button
                type="button"
                className={`collapsed-tab-btn ${activeLeftTab === 'assembly' ? 'active' : ''}`}
                onClick={() => {
                  handleSwitchLeftTab('assembly');
                  setLeftSidebarOpen(true);
                }}
                title="Vehicle Assembly & Slots"
                aria-label="Vehicle Assembly"
              >
                <AssemblyIcon size={18} />
              </button>
              <button
                type="button"
                className={`collapsed-tab-btn ${activeLeftTab === 'meshes' ? 'active' : ''}`}
                onClick={() => {
                  handleSwitchLeftTab('meshes');
                  setLeftSidebarOpen(true);
                }}
                title="3D Models & DAE Submeshes"
                aria-label="3D Meshes"
              >
                <CubeIcon size={18} />
              </button>
            </div>

            <button
              type="button"
              className="collapsed-strip-expand-btn"
              onClick={() => setLeftSidebarOpen(true)}
              title="Expand Left Sidebar"
              aria-label="Expand Left Sidebar"
            >
              <ChevronRightIcon size={14} />
            </button>
          </div>
        </aside>

        {/* Resizer Handle between Left Sidebar and Viewport */}
        {leftSidebarOpen && (
          <div
            className="resizer-col left-resizer is-open"
            onPointerDown={handleStartResizeLeft}
            title="Drag to resize left sidebar"
          />
        )}

        {/* Center 3D Viewport */}
        <main className="center-workspace" style={{ flex: 1, position: 'relative' }}>
          <ErrorBoundary title="3D Viewport Scene Error">
            <JBeamViewport
              jbeamParts={jbeamParts}
              compositeVehicleParts={compositeVehicleParts}
              selectedNodeId={selectedNodeId}
              selectedBeamKey={selectedBeamInfo?.beamKey}
              selectedBeamInfo={selectedBeamInfo}
              selectedSurfaceInfo={selectedSurfaceInfo}
              onSelectNode={handleSelectNode}
              onSelectBeam={handleSelectBeam}
              onSelectSurface={handleSelectSurface}
              onNodeMoved={handleCommitNodeMove}
              onLiveNodeMove={handleLiveNodeMove}
              symmetryEnabled={symmetryEnabled}
              onToggleSymmetry={() => {
                setSymmetryEnabled(prev => {
                  const next = !prev;
                  sendMessage({ type: 'TOGGLE_SYMMETRY', symmetryEnabled: next });
                  return next;
                });
              }}
              activeTool={activeTool}
              onToolChange={(tool) => {
                setActiveTool(tool);
                sendMessage({ type: 'SET_ACTIVE_TOOL', tool });
              }}
              onAddNode={handleAddNode}
              onAddBeam={handleAddBeam}
              onAddTriangle={handleAddTriangle}
              onAddQuad={handleAddQuad}
              onSubdivideBeam={handleSubdivideBeam}
              onQuickConnect={handleQuickConnect}
              onExtrudeNodes={handleExtrudeNodes}
              onDeleteSelected={handleDeleteSelected}
              onChangeBeamType={handleChangeBeamType}
              onBatchRenameNode={handleBatchRenameNode}
              visualMeshDaeText={visualMeshDaeText}
              visualMeshName={visualMeshName}
              onLoadVisualMesh={handleLoadDaeContent}
              onUnloadVisualMesh={handleUnloadDae}
              discoveredDaeFiles={discoveredDaeFiles}
              selectedDaePath={selectedDaePath}
              onSelectProjectDae={handleSelectDiscoveredDae}
              onOpenDaeDialog={handleOpenDaeDialog}
              highlightedSubmesh={highlightedSubmesh}
              onHighlightSubmesh={handleHighlightSubmesh}
              onUpdateSubmeshNames={handleUpdateSubmeshNames}
              onUpdateSubmeshDetails={setVisualMeshSubmeshDetails}
              spawnedMeshNames={spawnedMeshNames}
              isMeshesTabActive={activeLeftTab === 'meshes'}
              meshOpacity={meshOpacity}
              onMeshOpacityChange={handleSetMeshOpacity}
              meshWireframe={meshWireframe}
              onMeshWireframeChange={handleSetMeshWireframe}
              isolateMatchingMesh={isolateMatchingMesh}
              onToggleIsolateMesh={handleToggleIsolateMesh}
              viewportSource={viewportSource}
              onChangeViewportSource={handleChangeViewportSource}
              hasAssembly={Boolean(compositeVehicleParts && Object.keys(compositeVehicleParts).length > 0)}
              hiddenPartNames={hiddenPartNames}
              onTogglePartVisibility={handleTogglePartVisibility}
              onUndo={handleUndo}
              onRedo={handleRedo}
            />
          </ErrorBoundary>
        </main>

        {/* Resizer Handle between Viewport and Right Sidebar */}
        {rightSidebarOpen && (
          <div
            className="resizer-col right-resizer is-open"
            onPointerDown={handleStartResizeRight}
            title="Drag to resize right sidebar"
          />
        )}

        {/* Right Sidebar: Details & Inspection (Inspector & Structure Tree) */}
        <aside
          className={`right-sidebar ${rightSidebarOpen ? 'is-expanded' : 'is-collapsed'}`}
          style={{ width: rightSidebarOpen ? `${rightSidebarWidth}px` : '46px' }}
        >
          {/* Expanded Pane */}
          <div
            className="sidebar-pane-expanded"
            style={{ width: `${rightSidebarWidth}px` }}
            aria-hidden={!rightSidebarOpen}
          >
            <div className="sidebar-tabs-bar">
              <button
                type="button"
                className="sidebar-toggle-close-btn"
                onClick={() => setRightSidebarOpen(false)}
                title="Collapse Right Sidebar"
              >
                <ChevronRightIcon size={15} />
              </button>
              <div className="sidebar-tabs">
                <button
                  type="button"
                  onClick={() => setActiveRightTab('inspector')}
                  className={`sidebar-tab-btn ${activeRightTab === 'inspector' ? 'active' : ''}`}
                  title="Element Inspector"
                >
                  <InspectorIcon size={17} />
                  <span>Inspector</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveRightTab('structure')}
                  className={`sidebar-tab-btn ${activeRightTab === 'structure' ? 'active' : ''}`}
                  title="Structure Tree (Nodes, Beams, Triangles)"
                >
                  <StructureIcon size={17} />
                  <span>Structure</span>
                </button>
              </div>
            </div>

            <div className="sidebar-content">
              {activeRightTab === 'inspector' && (
                <ElementInspector
                  selectedNodeId={selectedNodeId}
                  selectedBeamInfo={selectedBeamInfo}
                  selectedSurfaceInfo={selectedSurfaceInfo}
                  jbeamParts={jbeamParts}
                  onNodeCoordinateChange={handleCommitNodeMove}
                  onRenameNode={handleRenameNode}
                  liveCoords={liveCoords}
                  symmetryEnabled={symmetryEnabled}
                  onToggleSymmetry={() => {
                    setSymmetryEnabled(prev => {
                      const next = !prev;
                      sendMessage({ type: 'TOGGLE_SYMMETRY', symmetryEnabled: next });
                      return next;
                    });
                  }}
                  visualMeshName={visualMeshName}
                  visualMeshSubnames={visualMeshSubnames}
                  visualMeshSubmeshDetails={visualMeshSubmeshDetails}
                  onOpenDaeDialog={handleOpenDaeDialog}
                  onUnloadVisualMesh={handleUnloadDae}
                  highlightedSubmesh={highlightedSubmesh}
                  onHighlightSubmesh={handleHighlightSubmesh}
                  onSelectNode={handleSelectNode}
                  isolateMatchingMesh={isolateMatchingMesh}
                  onToggleIsolateMesh={handleToggleIsolateMesh}
                />
              )}
              {activeRightTab === 'structure' && (
                <StructureTree
                  jbeamParts={jbeamParts}
                  selectedNodeId={selectedNodeId}
                  selectedBeamKey={selectedBeamInfo?.beamKey}
                  onSelectNode={handleSelectNode}
                  onSelectBeam={handleSelectBeam}
                  onRenameNode={handleRenameNode}
                />
              )}
            </div>
          </div>

          {/* Collapsed Activity Strip */}
          <div
            className="collapsed-sidebar-strip right-collapsed-strip"
            title="Right Sidebar"
            aria-hidden={rightSidebarOpen}
          >
            <div className="collapsed-strip-items">
              <button
                type="button"
                className={`collapsed-tab-btn ${activeRightTab === 'inspector' ? 'active' : ''}`}
                onClick={() => {
                  setActiveRightTab('inspector');
                  setRightSidebarOpen(true);
                }}
                title="Element Inspector"
                aria-label="Element Inspector"
              >
                <InspectorIcon size={18} />
              </button>
              <button
                type="button"
                className={`collapsed-tab-btn ${activeRightTab === 'structure' ? 'active' : ''}`}
                onClick={() => {
                  setActiveRightTab('structure');
                  setRightSidebarOpen(true);
                }}
                title="Structure Tree (Nodes, Beams, Triangles)"
                aria-label="Structure Tree"
              >
                <StructureIcon size={18} />
              </button>
            </div>

            <button
              type="button"
              className="collapsed-strip-expand-btn"
              onClick={() => setRightSidebarOpen(true)}
              title="Expand Right Sidebar"
              aria-label="Expand Right Sidebar"
            >
              <ChevronLeftIcon size={14} />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default DetachedViewportApp;
