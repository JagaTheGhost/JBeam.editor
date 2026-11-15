import React, { useState, useEffect, useRef, useCallback } from 'react';
import AppBrandName from '../../components/AppBrandName.jsx';
import JBeamViewport from './JBeamViewport.jsx';
import { StructureTree } from '../explorer/StructureTree.jsx';
import { ElementInspector } from '../inspector/ElementInspector.jsx';
import { AssemblyManager } from '../assembly/AssemblyManager.jsx';
import {
  RestoreIcon,
  StructureIcon,
  InspectorIcon,
  AssemblyIcon,
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

  // Sidebar Layout
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(360);
  const [isResizing, setIsResizing] = useState(false);
  const [activeSidebarTab, setActiveSidebarTab] = useState('structure'); // 'structure' | 'inspector' | 'assembly'

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

  // Set document title & detached favicon (distinguishing from main window)
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
      link.href = '/icons/partconfig-dark.png';
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
          break;

        case 'SET_VIEWPORT_SOURCE':
          if (data.viewportSource !== undefined) setViewportSource(data.viewportSource);
          break;

        case 'SYNC_SELECTION':
          if (data.selectedNodeId !== undefined) setSelectedNodeId(data.selectedNodeId);
          if (data.selectedBeamInfo !== undefined) setSelectedBeamInfo(data.selectedBeamInfo);
          if (data.selectedSurfaceInfo !== undefined) setSelectedSurfaceInfo(data.selectedSurfaceInfo);
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

  // Sidebar Drag Resizing
  const handleStartResize = useCallback((startEvent) => {
    startEvent.preventDefault();
    setIsResizing(true);
    const startX = startEvent.clientX;
    const startW = sidebarWidth;

    const onPointerMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      setSidebarWidth(Math.max(200, Math.min(800, startW + delta)));
    };

    const onPointerUp = () => {
      setIsResizing(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, [sidebarWidth]);

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

  // DAE loader inside detached inspector
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
    sendMessage({ type: 'UNLOAD_DAE' });
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
              src="/icons/partconfig-dark.png"
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

      {/* Main Detached Workspace Body */}
      <div className="detached-workspace-body">
        {/* Left Sidebar: Structure, Inspector, Assembly with Smooth Ease-Out Transition */}
        <aside
          className={`left-sidebar detached-3d-sidebar ${sidebarOpen ? 'is-expanded' : 'is-collapsed'} ${isResizing ? 'is-resizing' : ''}`}
          style={{ width: sidebarOpen ? `${sidebarWidth}px` : '46px' }}
        >
          {/* Full Expanded Sidebar Content */}
          <div
            className="sidebar-pane-expanded"
            style={{ width: `${sidebarWidth}px` }}
            aria-hidden={!sidebarOpen}
          >
            <div className="sidebar-tabs-bar">
              <div className="sidebar-tabs">
                <button
                  type="button"
                  onClick={() => setActiveSidebarTab('structure')}
                  className={`sidebar-tab-btn ${activeSidebarTab === 'structure' ? 'active' : ''}`}
                  title="Structure Tree (Nodes, Beams, Triangles)"
                >
                  <StructureIcon size={17} />
                  <span>Structure</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSidebarTab('inspector')}
                  className={`sidebar-tab-btn ${activeSidebarTab === 'inspector' ? 'active' : ''}`}
                  title="Element Inspector & DAE Mesh"
                >
                  <InspectorIcon size={17} />
                  <span>Inspector</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSidebarTab('assembly')}
                  className={`sidebar-tab-btn ${activeSidebarTab === 'assembly' ? 'active' : ''}`}
                  title="Vehicle Assembly & Part Visibility"
                >
                  <AssemblyIcon size={17} />
                  <span>Assembly</span>
                </button>
              </div>
              <button
                type="button"
                className="sidebar-toggle-close-btn"
                onClick={() => setSidebarOpen(false)}
                title="Collapse Left Sidebar"
              >
                <ChevronLeftIcon size={15} />
              </button>
            </div>

            <div className="sidebar-content">
              {activeSidebarTab === 'structure' && (
                <StructureTree
                  jbeamParts={jbeamParts}
                  selectedNodeId={selectedNodeId}
                  selectedBeamKey={selectedBeamInfo?.beamKey}
                  onSelectNode={handleSelectNode}
                  onSelectBeam={handleSelectBeam}
                  onRenameNode={handleRenameNode}
                />
              )}
              {activeSidebarTab === 'inspector' && (
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
              {activeSidebarTab === 'assembly' && (
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
            </div>
          </div>

          {/* Collapsed Activity Strip */}
          <div
            className="collapsed-sidebar-strip left-collapsed-strip"
            title="Sidebar Sections"
            aria-hidden={sidebarOpen}
          >
            <div className="collapsed-strip-items">
              <button
                type="button"
                className={`collapsed-tab-btn ${activeSidebarTab === 'structure' ? 'active' : ''}`}
                onClick={() => {
                  setActiveSidebarTab('structure');
                  setSidebarOpen(true);
                }}
                title="Structure Tree (Nodes, Beams, Triangles)"
                aria-label="Structure Tree"
              >
                <StructureIcon size={18} />
              </button>
              <button
                type="button"
                className={`collapsed-tab-btn ${activeSidebarTab === 'inspector' ? 'active' : ''}`}
                onClick={() => {
                  setActiveSidebarTab('inspector');
                  setSidebarOpen(true);
                }}
                title="Element Inspector"
                aria-label="Element Inspector"
              >
                <InspectorIcon size={18} />
              </button>
              <button
                type="button"
                className={`collapsed-tab-btn ${activeSidebarTab === 'assembly' ? 'active' : ''}`}
                onClick={() => {
                  setActiveSidebarTab('assembly');
                  setSidebarOpen(true);
                }}
                title="Vehicle Assembly & Slots"
                aria-label="Vehicle Assembly"
              >
                <AssemblyIcon size={18} />
              </button>
            </div>

            <button
              type="button"
              className="collapsed-strip-expand-btn"
              onClick={() => setSidebarOpen(true)}
              title="Expand Left Sidebar"
              aria-label="Expand Left Sidebar"
            >
              <ChevronRightIcon size={14} />
            </button>
          </div>
        </aside>

        {/* Resizer Handle between Detached Sidebar and Viewport */}
        {sidebarOpen && (
          <div
            className="resizer-col left-resizer is-open"
            onPointerDown={handleStartResize}
            title="Drag to resize sidebar"
          />
        )}

        {/* 100% 3D Viewport Center */}
        <main className="center-workspace" style={{ flex: 1, position: 'relative' }}>
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
            visualMeshSubnames={visualMeshSubnames}
            visualMeshSubmeshDetails={visualMeshSubmeshDetails}
            highlightedSubmesh={highlightedSubmesh}
            onHighlightSubmesh={handleHighlightSubmesh}
            onOpenDaeDialog={handleOpenDaeDialog}
            onUnloadVisualMesh={handleUnloadDae}
            isolateMatchingMesh={isolateMatchingMesh}
            onToggleIsolateMesh={handleToggleIsolateMesh}
            viewportSource={viewportSource}
            onChangeViewportSource={handleChangeViewportSource}
            hiddenPartNames={hiddenPartNames}
            onTogglePartVisibility={handleTogglePartVisibility}
            onUndo={handleUndo}
            onRedo={handleRedo}
          />
        </main>
      </div>
    </div>
  );
}

export default DetachedViewportApp;

