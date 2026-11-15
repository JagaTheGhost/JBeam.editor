import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

// Configure Monaco Environment for local web worker support
if (typeof window !== 'undefined') {
  window.MonacoEnvironment = {
    getWorker() {
      // Fallback worker blob to eliminate CSP and worker resolution warnings
      const blob = new Blob([`self.onmessage = function () {};`], { type: 'application/javascript' });
      return new Worker(URL.createObjectURL(blob));
    }
  };
}

loader.config({ monaco });

// JBeam Language & AST
import { registerJBeamLanguage, JBEAM_LANGUAGE_ID } from './features/jbeam/monacoJBeam.js';
import { validateJBeamDocument } from './features/jbeam/jbeamValidator.js';
import {
  updateNodeCoordinatesLossless,
  addNodeLossless,
  addBeamLossless,
  updateBeamTypeLossless,
  addTriangleLossless,
  addQuadLossless,
  deleteNodeLossless,
  deleteBeamLossless,
  deleteTriangleLossless,
  deleteQuadLossless,
  subdivideBeamLossless,
  renameNodeLossless,
  prefixAllNodesInPart,
  getPartPrefix,
  flipSurfaceLossless,
  quickConnectNodesLossless,
  extrudeNodesLossless
} from './features/jbeam/astUpdater.js';
import { decodeWithMeta } from './features/jbeam/sjsonParser.js';
import { extractNodeCoords } from './features/viewport/visualizers.js';
import { getSymmetricNodeId, getSymmetricCoordinates } from './features/jbeam/symmetryUtils.js';
import { formatBatchNodeName } from './features/jbeam/batchRenamer.js';
import { resolveHoveredJBeamElement } from './features/jbeam/hoverProvider.js';

// Live BeamNG Simulation Socket Bridge
import {
  initSimConnection,
  toggleSimConnection,
  reloadActiveVehicle,
  selectNodesInSim,
  subscribeSimStatus
} from './features/sim/simConnection.js';

// Components
import Toolbar from './components/Toolbar.jsx';
import UpdateBanner from './components/UpdateBanner.jsx';
import EditorTabs from './components/EditorTabs.jsx';
import AppBrandName from './components/AppBrandName.jsx';
import StatusBar from './components/StatusBar.jsx';
import ProjectExplorer from './features/explorer/ProjectExplorer.jsx';
import StructureTree from './features/explorer/StructureTree.jsx';
import ElementInspector from './features/inspector/ElementInspector.jsx';
import ProblemsPanel from './features/problems/ProblemsPanel.jsx';
import JBeamViewport from './features/viewport/JBeamViewport.jsx';
import { PowertrainVisualizer } from './features/powertrain/PowertrainVisualizer.jsx';
import {
  FolderIcon,
  FileIcon,
  FilePlusIcon,
  AssemblyIcon,
  CloseIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SidebarLeftIcon,
  SidebarRightIcon,
  CodeIcon,
  InspectorIcon,
  StructureIcon,
  PowertrainIcon,
  UndoIcon,
  RedoIcon
} from './components/Icons.jsx';

// Vehicle Assembly & Slot Management
import { buildWorkspaceIndex } from './features/assembly/vehicleIndexer.js';
import {
  resolveAssemblyTree,
  getActiveAssembledParts,
  buildCompositeVehicleData
} from './features/assembly/assemblyResolver.js';
import AssemblyManager from './features/assembly/AssemblyManager.jsx';
import NewVehicleModal from './features/templates/NewVehicleModal.jsx';

// Studio Tools (Blueprints, OBJ Converter & Dedicated Powertrain Studio)
import { DEFAULT_BLUEPRINT_CONFIG } from './features/viewport/blueprintManager.js';
import { BlueprintOverlayModal } from './features/viewport/BlueprintOverlayModal.jsx';
import { ObjConverterModal } from './features/jbeam/ObjConverterModal.jsx';
import { PowertrainStudio } from './features/powertrain/PowertrainStudio.jsx';
import { DetachedViewportApp } from './features/viewport/DetachedViewportApp.jsx';

const UNTITLED_JBEAM = `{
  "part_name": {
    "information": {
      "authors": "Modder",
      "name": "Untitled Part"
    },
    "slotType": "main",
    "nodes": [
      ["id", "posX", "posY", "posZ"],
      {"nodeWeight": 5.0},
      {"frictionCoef": 0.5},
      {"nodeMaterial": "|NM_METAL"},
      {"group": "main_body"}
    ],
    "beams": [
      ["id1:", "id2:"],
      {"beamPrecompression": 1, "beamType": "|NORMAL", "beamLongBound": 1, "beamShortBound": 1},
      {"beamSpring": 1501000, "beamDamp": 120},
      {"beamDeform": 35000, "beamStrength": "FLT_MAX"}
    ],
    "triangles": [
      ["id1:", "id2:", "id3:"],
      {"groundModel": "metal"},
      {"dragCoef": 1.0}
    ]
  }
}`;

const DEFAULT_SAMPLE_JBEAM = UNTITLED_JBEAM;

function createUntitledTab() {
  return {
    id: 'tab-untitled',
    title: 'untitled.jbeam',
    filePath: null,
    content: UNTITLED_JBEAM,
    isDirty: false
  };
}

export function App() {
  const isDetachedWindowRoute = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('view') === 'viewport-detached';

  if (isDetachedWindowRoute) {
    return <DetachedViewportApp />;
  }

  // Auto-Update Notification State
  const [updateInfo, setUpdateInfo] = useState(null);

  useEffect(() => {
    if (!window.jbeamAPI?.onUpdateAvailable) return;
    const unsub = window.jbeamAPI.onUpdateAvailable((info) => {
      setUpdateInfo(info);
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  // Tabs State (with session persistence)
  const [tabs, setTabs] = useState(() => {
    try {
      const saved = localStorage.getItem('jbeam_studio_open_tabs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((t, idx) => ({
            id: t.id || `tab-saved-${idx}`,
            title: t.title || (t.filePath ? t.filePath.split(/[\\/]/).pop() : 'untitled.jbeam'),
            filePath: t.filePath || null,
            content: t.content || UNTITLED_JBEAM,
            isDirty: false
          }));
        }
      }
    } catch (e) {
      console.warn('Failed to parse saved tabs from localStorage', e);
    }
    return [];
  });

  const [activeTabId, setActiveTabId] = useState(() => {
    try {
      const savedActive = localStorage.getItem('jbeam_studio_active_tab_id');
      if (savedActive) return savedActive;
    } catch (e) {}
    return null;
  });

  // Workspace / Filesystem State (with session persistence)
  const [workspacePath, setWorkspacePath] = useState(() => {
    try {
      return localStorage.getItem('jbeam_studio_workspace_path') || null;
    } catch (e) {
      return null;
    }
  });
  const [workspaceFiles, setWorkspaceFiles] = useState([]);

  // Left Sidebar Tab State
  const [leftTab, setLeftTab] = useState('code'); // 'code', 'files', or 'assembly'

  // Vehicle Assembly State
  const [workspaceIndex, setWorkspaceIndex] = useState({ partsMap: {}, slotTypeMap: {}, configurations: [], rootParts: [] });
  const [activeConfigName, setActiveConfigName] = useState('');
  const [activeRootPart, setActiveRootPart] = useState('');
  const [activeSlotSelections, setActiveSlotSelections] = useState({});
  const [partVisibility, setPartVisibility] = useState({});
  const [compositeVehicleParts, setCompositeVehicleParts] = useState(null);
  const [viewportSource, setViewportSource] = useState('activeDocument'); // 'activeDocument', 'openTabs' (Multi-Part Linkage), or 'assembly'
  const [nonActiveViewType, setNonActiveViewType] = useState('cadWire'); // 'cadWire', 'mountPoints', 'crossBeams', 'ghost', 'wireframe', 'dimmed'
  const [codeHoveredElement, setCodeHoveredElement] = useState(null);
  const [multiSelectedNodes, setMultiSelectedNodes] = useState([]);
  const [isAssembling, setIsAssembling] = useState(false);
  const [isNewVehicleModalOpen, setIsNewVehicleModalOpen] = useState(false);

  // UI Layout State
  const [layoutMode, setLayoutMode] = useState('hybrid'); // 'hybrid', 'code', 'viewport'
  const [splitRatio, setSplitRatio] = useState(50); // percentage for code editor width
  const [rightTab, setRightTab] = useState('inspector'); // 'structure', 'inspector'
  const [bottomPanelOpen, setBottomPanelOpen] = useState(true);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(440);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(340);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(170);
  const [isolateMatchingMesh, setIsolateMatchingMesh] = useState(false);
  const [isViewportDetached, setIsViewportDetached] = useState(false);
  const [detachedWindow, setDetachedWindow] = useState(null);
  const [detachedRightTab, setDetachedRightTab] = useState('files'); // 'files', 'assembly'
  const [isResizing, setIsResizing] = useState(false);

  // Smooth Section Resizing Handler (Left Sidebar, Right Sidebar, Bottom Panel, Split Pane)
  const handleStartResize = useCallback((type, startEvent) => {
    startEvent.preventDefault();
    setIsResizing(true);
    const startX = startEvent.clientX;
    const startY = startEvent.clientY;
    const startLeftW = leftSidebarWidth;
    const startRightW = rightSidebarWidth;
    const startBottomH = bottomPanelHeight;
    const startRatio = splitRatio;

    const onPointerMove = (moveEvent) => {
      if (type === 'left-sidebar') {
        const delta = moveEvent.clientX - startX;
        setLeftSidebarWidth(Math.max(180, Math.min(900, startLeftW + delta)));
      } else if (type === 'right-sidebar') {
        const delta = startX - moveEvent.clientX;
        setRightSidebarWidth(Math.max(200, Math.min(520, startRightW + delta)));
      } else if (type === 'bottom-panel') {
        const delta = startY - moveEvent.clientY;
        setBottomPanelHeight(Math.max(80, Math.min(450, startBottomH + delta)));
      } else if (type === 'split-pane') {
        const deltaX = moveEvent.clientX - startX;
        const availableW = window.innerWidth - (leftSidebarOpen ? leftSidebarWidth : 0) - (rightSidebarOpen ? rightSidebarWidth : 0);
        if (availableW > 100) {
          const newRatio = Math.max(15, Math.min(85, startRatio + (deltaX / availableW) * 100));
          setSplitRatio(newRatio);
        }
      }
    };

    const onPointerUp = () => {
      setIsResizing(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, [leftSidebarWidth, rightSidebarWidth, bottomPanelHeight, splitRatio, leftSidebarOpen, rightSidebarOpen]);

  // Selection & Diagnostics State
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedBeamInfo, setSelectedBeamInfo] = useState(null);
  const [selectedSurfaceInfo, setSelectedSurfaceInfo] = useState(null);
  const [symmetryEnabled, setSymmetryEnabled] = useState(true);
  const [activeTool, setActiveTool] = useState('select'); // 'select', 'addNode', 'addBeam', 'addTri', 'batchRename'
  const [gridSnap, setGridSnap] = useState(0.1);
  const [batchRenamePattern, setBatchRenamePattern] = useState('#fl');
  const [batchRenameIndex, setBatchRenameIndex] = useState(1);
  const [lastRenamedFeedback, setLastRenamedFeedback] = useState(null);
  const [liveCoords, setLiveCoords] = useState(null);
  const [cursorPos, setCursorPos] = useState({ line: 1, column: 1 });
  const [validationResult, setValidationResult] = useState({ isValid: true, problems: [], parts: {} });
  const [gameLogEntries, setGameLogEntries] = useState([]);

  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const debounceTimerRef = useRef(null);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const activeTabRef = useRef(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  const validationResultRef = useRef(validationResult);
  useEffect(() => { validationResultRef.current = validationResult; }, [validationResult]);

  const symmetryEnabledRef = useRef(symmetryEnabled);
  useEffect(() => { symmetryEnabledRef.current = symmetryEnabled; }, [symmetryEnabled]);

  // Auto-clear batch rename feedback toast after 3 seconds
  useEffect(() => {
    if (!lastRenamedFeedback) return;
    const timer = setTimeout(() => {
      setLastRenamedFeedback(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [lastRenamedFeedback]);

  // Live BeamNG Simulation Socket State
  const [simStatus, setSimStatus] = useState('disconnected');
  const [simInfo, setSimInfo] = useState(null);
  const [playerVehicle, setPlayerVehicle] = useState(null);

  useEffect(() => {
    initSimConnection();
    const unsub = subscribeSimStatus((data) => {
      setSimStatus(data.status);
      setSimInfo(data.simInfo);
      setPlayerVehicle(data.playerVehicle);
    });
    return unsub;
  }, []);

  const handleReloadActiveVehicle = useCallback(async () => {
    const res = await reloadActiveVehicle();
    setLastRenamedFeedback({
      oldId: 'BeamNG',
      newId: res.message || 'Reloaded vehicle',
      timestamp: Date.now()
    });
  }, []);

  // Option 3: Visual Mesh Overlay (.dae Collada) State & Auto-Discovery
  const [visualMeshDaeText, setVisualMeshDaeText] = useState(null);
  const [visualMeshName, setVisualMeshName] = useState(null);
  const [highlightedSubmesh, setHighlightedSubmesh] = useState(null);
  const [visualMeshSubnames, setVisualMeshSubnames] = useState([]);
  const [visualMeshSubmeshDetails, setVisualMeshSubmeshDetails] = useState({});

  const handleLoadDaeContent = useCallback((daeText, fileName = 'vehicle.dae') => {
    setVisualMeshDaeText(daeText);
    setVisualMeshName(fileName);
    if (layoutMode === 'code') {
      setLayoutMode('hybrid');
    }
  }, [layoutMode]);

  const handleUnloadDae = useCallback(() => {
    setVisualMeshDaeText(null);
    setVisualMeshName(null);
    setHighlightedSubmesh(null);
    setVisualMeshSubnames([]);
    setVisualMeshSubmeshDetails({});
  }, []);

  const handleHighlightSubmesh = useCallback((meshName) => {
    setHighlightedSubmesh(prev => prev === meshName ? null : meshName);
    if (meshName) {
      setRightTab('inspector');
    }
  }, []);

  const handleOpenDaeDialog = useCallback(async () => {
    try {
      if (window.jbeamAPI?.openDaeDialog) {
        const res = await window.jbeamAPI.openDaeDialog();
        if (!res.canceled && res.content) {
          handleLoadDaeContent(res.content, res.fileName || 'model.dae');
        }
      }
    } catch (err) {
      console.error('Error opening DAE dialog:', err);
    }
  }, [handleLoadDaeContent]);

  // Studio Tools State (Blueprints & Wavefront OBJ Converter)
  const [blueprintConfig, setBlueprintConfig] = useState(DEFAULT_BLUEPRINT_CONFIG);
  const [blueprintModalOpen, setBlueprintModalOpen] = useState(false);
  const [objModalOpen, setObjModalOpen] = useState(false);

  // Recursively extract all .dae Collada files discovered in the active workspace
  const discoveredDaeFiles = useMemo(() => {
    function extractDae(nodes, acc = []) {
      if (!nodes || !Array.isArray(nodes)) return acc;
      for (const n of nodes) {
        if (n.isDirectory && n.children) {
          extractDae(n.children, acc);
        } else if (n.name && n.name.toLowerCase().endsWith('.dae')) {
          acc.push({ name: n.name, path: n.path });
        }
      }
      return acc;
    }
    return extractDae(workspaceFiles);
  }, [workspaceFiles]);

  const handleSelectAllDiscoveredDae = useCallback(async () => {
    if (!discoveredDaeFiles || discoveredDaeFiles.length === 0) return;
    try {
      if (window.jbeamAPI?.readFile) {
        const results = await Promise.all(
          discoveredDaeFiles.map(async (d) => {
            try {
              const res = await window.jbeamAPI.readFile(d.path);
              if (res && res.success && res.content) {
                return { fileName: d.name, path: d.path, content: res.content };
              }
            } catch (err) {
              console.warn(`Could not read DAE file ${d.name}:`, err);
            }
            return null;
          })
        );
        const validModels = results.filter(Boolean);
        if (validModels.length > 0) {
          setVisualMeshDaeText(validModels);
          setVisualMeshName(`All Project Models (${validModels.length} files)`);
          if (layoutMode === 'code') {
            setLayoutMode('hybrid');
          }
        }
      }
    } catch (err) {
      console.error('Error loading all discovered DAE files:', err);
    }
  }, [discoveredDaeFiles, layoutMode]);

  const handleSelectDiscoveredDae = useCallback(async (daePath) => {
    if (!daePath) {
      handleUnloadDae();
      return;
    }
    if (daePath === '__all__') {
      await handleSelectAllDiscoveredDae();
      return;
    }
    try {
      if (window.jbeamAPI?.readFile) {
        const res = await window.jbeamAPI.readFile(daePath);
        if (res.success) {
          const fileName = daePath.split(/[\\/]/).pop();
          handleLoadDaeContent(res.content, fileName);
        }
      }
    } catch (err) {
      console.error('Error loading discovered DAE file:', err);
    }
  }, [handleLoadDaeContent, handleUnloadDae, handleSelectAllDiscoveredDae]);

  // Validate JBeam Document on Content Change (Debounced)
  const runValidation = useCallback((content, filePath = 'document.jbeam') => {
    // Collect nodes declared in any background open tabs so inter-part links are recognized
    const openTabsNodes = {};
    if (tabs && tabs.length > 1) {
      const curId = activeTabRef.current?.id || activeTabId;
      for (const t of tabs) {
        if (t.id === curId || !t.content || typeof t.content !== 'string') continue;
        try {
          const parsed = decodeWithMeta(t.content, t.filePath || t.title, false);
          if (parsed?.data) {
            for (const pKey of Object.keys(parsed.data).filter(k => k !== '__meta')) {
              const p = parsed.data[pKey];
              if (p?.nodes) {
                const nRows = Array.isArray(p.nodes) ? p.nodes : Object.values(p.nodes);
                for (const r of nRows) {
                  if (!r || typeof r !== 'object') continue;
                  const nid = r.id || r['0'] || (Array.isArray(r) ? r[0] : null);
                  if (nid && typeof nid === 'string' && nid.toLowerCase() !== 'id') {
                    openTabsNodes[nid] = {
                      partName: pKey,
                      tabTitle: t.title,
                      nodeId: nid
                    };
                  }
                }
              }
            }
          }
        } catch (_) {}
      }
    }

    const res = validateJBeamDocument(content, filePath, {
      workspaceIndex,
      assembledNodes: compositeVehicleParts?.nodes,
      daeSubmeshNames: visualMeshSubnames,
      daeFileName: visualMeshName,
      openTabsNodes
    });
    validationResultRef.current = res;
    setValidationResult(res);

    // Update Monaco Markers if editor is mounted
    if (monacoRef.current && editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        const markers = (res.problems || []).map(p => {
          let severity = monacoRef.current.MarkerSeverity.Warning;
          if (p.severity === 'error') severity = monacoRef.current.MarkerSeverity.Error;
          else if (p.severity === 'info') severity = monacoRef.current.MarkerSeverity.Info;

          return {
            severity,
            message: p.message,
            startLineNumber: p.line || 1,
            startColumn: p.column || 1,
            endLineNumber: p.endLine || p.line || 1,
            endColumn: p.endColumn || p.column + 5 || 5
          };
        });
        monacoRef.current.editor.setModelMarkers(model, 'jbeam-validator', markers);
      }
    }
  }, [workspaceIndex, compositeVehicleParts, visualMeshSubnames, visualMeshName]);

  // Run validation whenever active tab content changes, or clear if no active tab
  useEffect(() => {
    if (activeTab) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        runValidation(activeTab.content, activeTab.filePath || activeTab.title);
      }, 200);
    } else {
      setValidationResult({ isValid: true, problems: [], parts: {} });
    }
  }, [activeTab?.content, activeTab?.filePath, runValidation]);

  // Warn user before closing window/tab if any open file has unsaved changes
  useEffect(() => {
    const handleWindowBeforeUnload = (e) => {
      if (tabs.some(t => t.isDirty)) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes in JBeam.editor. Are you sure you want to exit?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleWindowBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleWindowBeforeUnload);
  }, [tabs]);

  // Handle Monaco Editor Mount
  const handleEditorWillMount = (monaco) => {
    registerJBeamLanguage(monaco);
  };

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Synchronize selection: single cursor click or multi-line range selection selects elements in 3D & Inspector
    editor.onDidChangeCursorSelection((e) => {
      const selection = e.selection;
      const model = editor.getModel();
      if (!model) return;

      if (selection.isEmpty()) {
        const line = selection.positionLineNumber;
        const col = selection.positionColumn;
        setCursorPos({ line, column: col });

        const el = resolveHoveredJBeamElement(model, line, col, validationResultRef.current);
        if (el) {
          if (el.type === 'node' && el.id) {
            setSelectedNodeId(el.id);
            setMultiSelectedNodes([el.id]);
            setSelectedBeamInfo(null);
            setSelectedSurfaceInfo(null);
            setRightSidebarOpen(true);
            setRightTab('inspector');
          } else if (el.type === 'beam') {
            const pName = el.partName || Object.keys(validationResultRef.current?.parts || {})[0] || 'main';
            setSelectedBeamInfo({
              partName: pName,
              beamKey: el.beamKey || `${el.id1}_${el.id2}`,
              beam: el.beamData || { 'id1:': el.id1, 'id2:': el.id2 }
            });
            setSelectedNodeId(null);
            setMultiSelectedNodes([]);
            setSelectedSurfaceInfo(null);
            setRightSidebarOpen(true);
            setRightTab('inspector');
          } else if (el.type === 'tri' || el.type === 'quad') {
            const pName = el.partName || Object.keys(validationResultRef.current?.parts || {})[0] || 'main';
            setSelectedSurfaceInfo({ ...el.surfaceData, type: el.type, partName: pName });
            setSelectedNodeId(null);
            setMultiSelectedNodes([]);
            setSelectedBeamInfo(null);
            setRightSidebarOpen(true);
            setRightTab('inspector');
          }
        }
        return;
      }

      // Multi-line selection in Monaco: extract all node IDs within selection range!
      const startLine = selection.startLineNumber;
      const endLine = selection.endLineNumber;
      const foundNodeIds = [];
      let foundBeam = null;
      let foundSurface = null;

      for (let ln = startLine; ln <= endLine; ln++) {
        const lineContent = model.getLineContent(ln);
        const firstNonSpace = lineContent.search(/\S/);
        const col = firstNonSpace >= 0 ? firstNonSpace + 2 : 1;
        const el = resolveHoveredJBeamElement(model, ln, col, validationResultRef.current);
        if (el) {
          if (el.type === 'node' && el.id && !foundNodeIds.includes(el.id)) {
            foundNodeIds.push(el.id);
          } else if (el.type === 'beam' && !foundBeam) {
            const pName = el.partName || Object.keys(validationResultRef.current?.parts || {})[0] || 'main';
            foundBeam = {
              partName: pName,
              beamKey: el.beamKey || `${el.id1}_${el.id2}`,
              beam: el.beamData || { 'id1:': el.id1, 'id2:': el.id2 }
            };
          } else if ((el.type === 'tri' || el.type === 'quad') && !foundSurface) {
            const pName = el.partName || Object.keys(validationResultRef.current?.parts || {})[0] || 'main';
            foundSurface = { ...el.surfaceData, type: el.type, partName: pName };
          }
        }
      }

      if (foundNodeIds.length > 0) {
        setSelectedNodeId(foundNodeIds[0]);
        setMultiSelectedNodes(foundNodeIds);
        setSelectedBeamInfo(null);
        setSelectedSurfaceInfo(null);
      } else if (foundBeam) {
        setSelectedBeamInfo(foundBeam);
        setSelectedNodeId(null);
        setMultiSelectedNodes([]);
        setSelectedSurfaceInfo(null);
      } else if (foundSurface) {
        setSelectedSurfaceInfo(foundSurface);
        setSelectedNodeId(null);
        setMultiSelectedNodes([]);
        setSelectedBeamInfo(null);
      }
    });

    // Live Code-Hover Focus (hovering node, beam, tri, quad in Monaco focuses in 3D viewport)
    editor.onMouseMove((e) => {
      if (!e.target || !e.target.position) {
        setCodeHoveredElement(null);
        return;
      }
      const pos = e.target.position;
      const model = editor.getModel();
      if (!model) return;

      const element = resolveHoveredJBeamElement(model, pos.lineNumber, pos.column, validationResultRef.current);
      setCodeHoveredElement(element);
    });

    editor.onMouseLeave(() => {
      setCodeHoveredElement(null);
    });

    if (activeTab) {
      runValidation(activeTab.content, activeTab.filePath || activeTab.title);
    }
  };

  // Editor Content Change Handler (Code -> Viewport sync)
  const handleEditorChange = (newContent) => {
    if (newContent === undefined) return;
    setTabs(prev =>
      prev.map(tab =>
        tab.id === activeTabId
          ? { ...tab, content: newContent, isDirty: true }
          : tab
      )
    );
  };

  // Central helper to apply lossless edits to activeTab with full Monaco undo/redo support
  const applyDocumentEdit = useCallback((newText, source = 'viewport-action') => {
    const curTab = activeTabRef.current || activeTab;
    if (!curTab || !newText) return;
    if (editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        editorRef.current.executeEdits(source, [
          {
            range: model.getFullModelRange(),
            text: newText
          }
        ]);
        editorRef.current.pushUndoStop();
      }
    }
    if (activeTabRef.current) {
      activeTabRef.current = { ...activeTabRef.current, content: newText, isDirty: true };
    }
    setTabs(prev =>
      prev.map(t =>
        t.id === activeTabId
          ? { ...t, content: newText, isDirty: true }
          : t
      )
    );
  }, [activeTab, activeTabId]);

  // Viewport/Inspector -> Code Sync (Lossless Two-Way Sync with Batch & Symmetry Support)
  const handleCommitNodeMove = useCallback((nodeIdOrBatch, newBeamngPos) => {
    const curTab = activeTabRef.current || activeTab;
    if (!curTab) return;

    const parts = (validationResultRef.current || validationResult).parts || {};
    const nodesToUpdate = [];

    if (Array.isArray(nodeIdOrBatch)) {
      // Batch multi-node commit
      const batchIds = new Set(nodeIdOrBatch.map(x => x?.id).filter(Boolean));

      for (const item of nodeIdOrBatch) {
        if (!item || !item.id || !Array.isArray(item.pos)) continue;
        const nid = item.id;
        const pos = item.pos;

        let matchedAny = false;
        for (const pKey of Object.keys(parts).filter(k => k !== '__meta')) {
          const part = parts[pKey];
          if (part?.nodes && part.nodes[nid]) {
            nodesToUpdate.push({
              ...part.nodes[nid],
              partName: pKey,
              id: nid,
              pos
            });
            matchedAny = true;
          }
        }
        if (!matchedAny) {
          nodesToUpdate.push({ id: nid, pos });
        }

        // If symmetry is enabled and mirror node was not in the batch, mirror it
        if (symmetryEnabled) {
          const mirrorId = getSymmetricNodeId(nid);
          if (mirrorId && mirrorId !== nid && !batchIds.has(mirrorId)) {
            let matchedMirror = false;
            for (const pKey of Object.keys(parts).filter(k => k !== '__meta')) {
              const part = parts[pKey];
              if (part?.nodes && part.nodes[mirrorId]) {
                nodesToUpdate.push({
                  ...part.nodes[mirrorId],
                  partName: pKey,
                  id: mirrorId,
                  pos: getSymmetricCoordinates(pos)
                });
                matchedMirror = true;
              }
            }
            if (!matchedMirror) {
              nodesToUpdate.push({
                id: mirrorId,
                pos: getSymmetricCoordinates(pos)
              });
            }
          }
        }
      }
    } else {
      // Single node commit
      const nodeId = nodeIdOrBatch;
      if (!nodeId || !Array.isArray(newBeamngPos)) return;

      let matchedAny = false;
      for (const pKey of Object.keys(parts).filter(k => k !== '__meta')) {
        const part = parts[pKey];
        if (part?.nodes && part.nodes[nodeId]) {
          nodesToUpdate.push({
            ...part.nodes[nodeId],
            partName: pKey,
            id: nodeId,
            pos: newBeamngPos
          });
          matchedAny = true;
        }
      }
      if (!matchedAny) {
        nodesToUpdate.push({ id: nodeId, pos: newBeamngPos });
      }

      // Left/Right Symmetry Support
      if (symmetryEnabled) {
        const mirrorId = getSymmetricNodeId(nodeId);
        if (mirrorId && mirrorId !== nodeId) {
          let matchedMirror = false;
          for (const pKey of Object.keys(parts).filter(k => k !== '__meta')) {
            const part = parts[pKey];
            if (part?.nodes && part.nodes[mirrorId]) {
              nodesToUpdate.push({
                ...part.nodes[mirrorId],
                partName: pKey,
                id: mirrorId,
                pos: getSymmetricCoordinates(newBeamngPos)
              });
              matchedMirror = true;
            }
          }
          if (!matchedMirror) {
            nodesToUpdate.push({
              id: mirrorId,
              pos: getSymmetricCoordinates(newBeamngPos)
            });
          }
        }
      }
    }

    if (nodesToUpdate.length === 0) return;

    const updateRes = updateNodeCoordinatesLossless(curTab.content, nodesToUpdate);
    if (updateRes.error) {
      console.error('Failed to update node coordinates:', updateRes.error);
      return;
    }

    if (updateRes.modifiedCount > 0) {
      applyDocumentEdit(updateRes.updatedText, '3d-gizmo');
      setLiveCoords(null);
      runValidation(updateRes.updatedText, curTab.filePath || curTab.title);
    }
  }, [activeTab, activeTabId, validationResult, symmetryEnabled, applyDocumentEdit, runValidation]);

  // Option 2: Add Node visually
  const handleAddNode = useCallback((beamngPos) => {
    const curTab = activeTabRef.current || activeTab;
    if (!curTab || !Array.isArray(beamngPos)) return;
    const parts = (validationResultRef.current || validationResult).parts || {};
    const partKeys = Object.keys(parts).filter(k => k !== '__meta');
    const targetPartName = partKeys.length > 0 ? partKeys[0] : 'main';

    // Auto-name: increment from highest existing nX
    const existingNodeIds = new Set();
    for (const pKey of partKeys) {
      const p = parts[pKey];
      if (p?.nodes) {
        for (const nid of Object.keys(p.nodes).filter(k => k !== '__meta')) {
          existingNodeIds.add(nid);
        }
      }
    }

    let maxNum = 0;
    for (const nid of existingNodeIds) {
      const m = nid.match(/^(?:n|node_?)(\d+)/i);
      if (m) {
        const num = parseInt(m[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    const nextNum = maxNum + 1;
    const isSymmetric = symmetryEnabled && Math.abs(beamngPos[0]) > 0.005;
    // In BeamNG coordinate system: X < 0 is Right (r), X > 0 is Left (l)
    let newNodeId;
    if (isSymmetric) {
      newNodeId = beamngPos[0] < 0 ? `n${nextNum}r` : `n${nextNum}l`;
    } else {
      newNodeId = `n${nextNum}`;
    }

    const res = addNodeLossless(
      curTab.content,
      targetPartName,
      { id: newNodeId, pos: beamngPos },
      symmetryEnabled
    );

    if (res.error) {
      console.error('Failed to add node:', res.error);
      return;
    }

    applyDocumentEdit(res.updatedText, 'add-node');
    setSelectedNodeId(newNodeId);
    runValidation(res.updatedText, curTab.filePath || curTab.title);
  }, [activeTab, validationResult, symmetryEnabled, applyDocumentEdit, runValidation]);

  // Option 2: Add Beam visually (Intra-Part or Cross-Part Mounting)
  const handleAddBeam = useCallback((id1, id2, properties = {}, isCrossPart = false, options = {}) => {
    const curTab = activeTabRef.current || activeTab;
    if (!curTab || !id1 || !id2) return;
    const parts = (validationResultRef.current || validationResult).parts || {};
    const partKeys = Object.keys(parts).filter(k => k !== '__meta');
    let targetPartName = partKeys.length > 0 ? partKeys[0] : 'main';

    let workingContent = curTab.content;
    let actualId1 = id1;
    let actualId2 = id2;

    if (isCrossPart) {
      const startData = options.startData;
      const endData = options.endData;

      const isStartActive = startData ? !startData.isNonActive : Boolean(parts[targetPartName]?.nodes?.[id1]);
      let activeNodeId = isStartActive ? id1 : id2;
      let counterpartNodeId = isStartActive ? id2 : id1;
      let counterpartTab = isStartActive ? (endData?.tabTitle || 'counterpart') : (startData?.tabTitle || 'counterpart');

      // Check for node ID collision between the two parts (e.g. both parts have 'n1r')
      if (options.hasCollision || activeNodeId === counterpartNodeId) {
        const prefix = getPartPrefix(targetPartName, curTab.title);
        const newActiveId = `${prefix}${activeNodeId}`;

        const renameRes = renameNodeLossless(workingContent, targetPartName, activeNodeId, newActiveId, { symmetry: false });
        if (!renameRes.error && renameRes.updatedText) {
          workingContent = renameRes.updatedText;
          actualId1 = newActiveId;
          actualId2 = counterpartNodeId;
          setLastRenamedFeedback({
            oldId: activeNodeId,
            newId: newActiveId,
            timestamp: Date.now()
          });
        } else {
          actualId1 = activeNodeId;
          actualId2 = counterpartNodeId;
        }
      } else {
        actualId1 = activeNodeId;
        actualId2 = counterpartNodeId;
      }

      // Configure BeamNG mounting properties: optional: true and breakGroup
      const mountProps = { ...properties, optional: true };
      const breakGroup = options.breakGroup || `${targetPartName}_mount`;
      mountProps.breakGroup = breakGroup;

      const res = addBeamLossless(
        workingContent,
        targetPartName,
        { id1: actualId1, id2: actualId2, properties: mountProps, isCrossPart: true, breakGroup },
        symmetryEnabled
      );

      if (res.error) {
        console.error('Failed to add cross-part beam:', res.error);
        return;
      }

      applyDocumentEdit(res.updatedText, 'add-cross-beam');
      runValidation(res.updatedText, curTab.filePath || curTab.title);
      return;
    }

    // Standard Intra-Part Beam
    if (id1 === id2) return;
    for (const pKey of partKeys) {
      const p = parts[pKey];
      if (p?.nodes && (p.nodes[id1] || p.nodes[id2])) {
        targetPartName = pKey;
        break;
      }
    }

    const res = addBeamLossless(
      curTab.content,
      targetPartName,
      { id1, id2, properties },
      symmetryEnabled
    );

    if (res.error) {
      console.error('Failed to add beam:', res.error);
      return;
    }

    applyDocumentEdit(res.updatedText, 'add-beam');
    runValidation(res.updatedText, curTab.filePath || curTab.title);
  }, [activeTab, validationResult, symmetryEnabled, applyDocumentEdit, runValidation]);

  // Option 2b: Prefix All Active Part Nodes (Resolving Cross-Part Collisions)
  const handlePrefixAllActiveNodes = useCallback(() => {
    const curTab = activeTabRef.current || activeTab;
    if (!curTab) return;
    const parts = (validationResultRef.current || validationResult).parts || {};
    const partKeys = Object.keys(parts).filter(k => k !== '__meta');
    const targetPartName = partKeys.length > 0 ? partKeys[0] : 'main';

    const prefix = getPartPrefix(targetPartName, curTab.title);
    const res = prefixAllNodesInPart(curTab.content, targetPartName, prefix);
    if (res.error) {
      console.error('Failed to prefix nodes:', res.error);
      return;
    }
    if (res.renamedCount > 0) {
      applyDocumentEdit(res.updatedText, 'prefix-nodes');
      runValidation(res.updatedText, curTab.filePath || curTab.title);
      setLastRenamedFeedback({
        oldId: 'Collision Fixed',
        newId: `Prefixed ${res.renamedCount} nodes with "${prefix}"`,
        timestamp: Date.now()
      });
    }
  }, [activeTab, validationResult, applyDocumentEdit, runValidation]);

  // Option 2c: Auto-Link Closest Mounting Points Between Open Components
  const handleAutoLinkClosestMounts = useCallback(() => {
    const curTab = activeTabRef.current || activeTab;
    if (!curTab) return;
    const parts = (validationResultRef.current || validationResult).parts || {};
    const partKeys = Object.keys(parts).filter(k => k !== '__meta');
    const targetPartName = partKeys.length > 0 ? partKeys[0] : 'main';
    const curPart = parts[targetPartName];
    if (!curPart?.nodes) return;

    // Collect counterpart nodes from background tabs
    const counterpartNodes = [];
    if (tabs && tabs.length > 1) {
      const curId = curTab.id;
      for (const t of tabs) {
        if (t.id === curId || !t.content) continue;
        try {
          const parsed = decodeWithMeta(t.content, t.title, false);
          for (const pk of Object.keys(parsed.data || {}).filter(k => k !== '__meta')) {
            const p = parsed.data[pk];
            if (p?.nodes) {
              const rows = Array.isArray(p.nodes) ? p.nodes : Object.values(p.nodes);
              for (const r of rows) {
                if (!r || typeof r !== 'object') continue;
                const nid = r.id || r['0'] || (Array.isArray(r) ? r[0] : null);
                if (nid && typeof nid === 'string' && nid.toLowerCase() !== 'id') {
                  const px = Number(r.posX ?? r['1'] ?? (r.pos ? r.pos[0] : 0));
                  const py = Number(r.posY ?? r['2'] ?? (r.pos ? r.pos[1] : 0));
                  const pz = Number(r.posZ ?? r['3'] ?? (r.pos ? r.pos[2] : 0));
                  counterpartNodes.push({ id: nid, x: px, y: py, z: pz, tabTitle: t.title });
                }
              }
            }
          }
        } catch (_) {}
      }
    }

    if (counterpartNodes.length === 0) return;

    const activeRows = Array.isArray(curPart.nodes) ? curPart.nodes : Object.values(curPart.nodes);
    let workingContent = curTab.content;
    let linkedCount = 0;

    for (const r of activeRows) {
      if (!r || typeof r !== 'object') continue;
      const nid = r.id || r['0'] || (Array.isArray(r) ? r[0] : null);
      if (!nid || typeof nid !== 'string' || nid.toLowerCase() === 'id') continue;
      const px = Number(r.posX ?? r['1'] ?? (r.pos ? r.pos[0] : 0));
      const py = Number(r.posY ?? r['2'] ?? (r.pos ? r.pos[1] : 0));
      const pz = Number(r.posZ ?? r['3'] ?? (r.pos ? r.pos[2] : 0));

      let closest = null;
      let minDistSq = 0.15 * 0.15; // 15cm threshold
      for (const cnp of counterpartNodes) {
        const dx = px - cnp.x;
        const dy = py - cnp.y;
        const dz = pz - cnp.z;
        const dSq = dx * dx + dy * dy + dz * dz;
        if (dSq <= minDistSq) {
          minDistSq = dSq;
          closest = cnp;
        }
      }

      if (closest) {
        let actId = nid;
        if (actId === closest.id) {
          const prefix = getPartPrefix(targetPartName, curTab.title);
          const newActId = `${prefix}${actId}`;
          const ren = renameNodeLossless(workingContent, targetPartName, actId, newActId, { symmetry: false });
          if (!ren.error && ren.updatedText) {
            workingContent = ren.updatedText;
            actId = newActId;
          }
        }
        const breakGroup = `${targetPartName}_mount`;
        const res = addBeamLossless(
          workingContent,
          targetPartName,
          {
            id1: actId,
            id2: closest.id,
            properties: { beamSpring: 2500000, beamDeform: 45000, beamStrength: 95000, optional: true, breakGroup },
            isCrossPart: true,
            breakGroup
          },
          false
        );
        if (!res.error && res.updatedText) {
          workingContent = res.updatedText;
          linkedCount++;
        }
      }
    }

    if (linkedCount > 0) {
      applyDocumentEdit(workingContent, 'auto-mount');
      runValidation(workingContent, curTab.filePath || curTab.title);
      setLastRenamedFeedback({
        oldId: 'Auto-Mount',
        newId: `Generated ${linkedCount} mounting beams (optional: true)`,
        timestamp: Date.now()
      });
    }
  }, [activeTab, tabs, validationResult, applyDocumentEdit, runValidation]);

  // Option 2: Add Triangle visually
  const handleAddTriangle = useCallback((id1, id2, id3, properties = {}) => {
    const curTab = activeTabRef.current || activeTab;
    if (!curTab || !id1 || !id2 || !id3) return;
    const parts = (validationResultRef.current || validationResult).parts || {};
    const partKeys = Object.keys(parts).filter(k => k !== '__meta');
    
    // Find target part containing vertices
    let targetPartName = partKeys.length > 0 ? partKeys[0] : 'main';
    for (const pKey of partKeys) {
      const p = parts[pKey];
      if (p?.nodes && (p.nodes[id1] || p.nodes[id2] || p.nodes[id3])) {
        targetPartName = pKey;
        break;
      }
    }

    const res = addTriangleLossless(
      curTab.content,
      targetPartName,
      { id1, id2, id3, properties },
      symmetryEnabled
    );

    if (res.error) {
      console.error('Failed to add triangle:', res.error);
      return;
    }

    applyDocumentEdit(res.updatedText, 'add-triangle');
    runValidation(res.updatedText, curTab.filePath || curTab.title);
  }, [activeTab, validationResult, symmetryEnabled, applyDocumentEdit, runValidation]);

  // Option 2: Add Quad visually
  const handleAddQuad = useCallback((id1, id2, id3, id4, properties = {}) => {
    const curTab = activeTabRef.current || activeTab;
    if (!curTab || !id1 || !id2 || !id3 || !id4) return;
    const parts = (validationResultRef.current || validationResult).parts || {};
    const partKeys = Object.keys(parts).filter(k => k !== '__meta');

    // Find target part containing vertices
    let targetPartName = partKeys.length > 0 ? partKeys[0] : 'main';
    for (const pKey of partKeys) {
      const p = parts[pKey];
      if (p?.nodes && (p.nodes[id1] || p.nodes[id2] || p.nodes[id3] || p.nodes[id4])) {
        targetPartName = pKey;
        break;
      }
    }

    const res = addQuadLossless(
      curTab.content,
      targetPartName,
      { id1, id2, id3, id4, properties },
      symmetryEnabled
    );

    if (res.error) {
      console.error('Failed to add quad:', res.error);
      return;
    }

    applyDocumentEdit(res.updatedText, 'add-quad');
    runValidation(res.updatedText, curTab.filePath || curTab.title);
  }, [activeTab, validationResult, symmetryEnabled, applyDocumentEdit, runValidation]);

  // Option 2: Subdivide Beam (Add node in between beam like Blender)
  const handleSubdivideBeam = useCallback((partNameOrOpts, id1Arg, id2Arg, splitPosArg, customNodeIdArg = null) => {
    let partName = partNameOrOpts;
    let id1 = id1Arg;
    let id2 = id2Arg;
    let splitPos = splitPosArg;
    let customNodeId = customNodeIdArg;

    if (typeof partNameOrOpts === 'object' && partNameOrOpts !== null) {
      partName = partNameOrOpts.partName;
      id1 = partNameOrOpts.id1;
      id2 = partNameOrOpts.id2;
      splitPos = partNameOrOpts.splitPos || partNameOrOpts.point;
      customNodeId = partNameOrOpts.customNodeId || null;
    }

    const curTab = activeTabRef.current || activeTab;
    if (!curTab || !id1 || !id2 || !Array.isArray(splitPos)) return;

    const parts = (validationResultRef.current || validationResult).parts || {};
    const partKeys = Object.keys(parts).filter(k => k !== '__meta');
    let targetPartName = partName || (partKeys.length > 0 ? partKeys[0] : 'main');

    // Auto-name intermediate node if not given
    let newNodeId = customNodeId;
    if (!newNodeId) {
      const existingNodeIds = new Set();
      for (const pKey of partKeys) {
        const p = parts[pKey];
        if (p?.nodes) {
          for (const nid of Object.keys(p.nodes).filter(k => k !== '__meta')) {
            existingNodeIds.add(nid);
          }
        }
      }
      let maxNum = 0;
      for (const nid of existingNodeIds) {
        const m = nid.match(/^(?:n|node_?)(\d+)/i);
        if (m) {
          const num = parseInt(m[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
      const nextNum = maxNum + 1;
      const isSymmetric = symmetryEnabled && Math.abs(splitPos[0]) > 0.005;
      if (isSymmetric) {
        newNodeId = splitPos[0] < 0 ? `n${nextNum}r` : `n${nextNum}l`;
      } else {
        newNodeId = `n${nextNum}`;
      }
    }

    const res = subdivideBeamLossless(
      curTab.content,
      targetPartName,
      { id1, id2, newNodeId, newPos: splitPos },
      symmetryEnabled
    );

    if (res.error) {
      console.error('Failed to subdivide beam:', res.error);
      return;
    }

    applyDocumentEdit(res.updatedText, 'subdivide-beam');
    setSelectedNodeId(newNodeId);
    runValidation(res.updatedText, curTab.filePath || curTab.title);
  }, [activeTab, validationResult, symmetryEnabled, applyDocumentEdit, runValidation]);

  // Quick-connect 2, 3, or 4 nodes into Beam, Triangle, or Quad (Blender "F" key)
  const handleQuickConnect = useCallback((nodeIds) => {
    const curTab = activeTabRef.current || activeTab;
    if (!curTab || !Array.isArray(nodeIds) || nodeIds.length < 2) return;

    const parts = (validationResultRef.current || validationResult).parts || {};
    const partKeys = Object.keys(parts).filter(k => k !== '__meta');
    let targetPartName = partKeys.length > 0 ? partKeys[0] : 'main';

    for (const pKey of partKeys) {
      if (parts[pKey]?.nodes && nodeIds.some(nid => parts[pKey].nodes[nid])) {
        targetPartName = pKey;
        break;
      }
    }

    const res = quickConnectNodesLossless(
      curTab.content,
      targetPartName,
      nodeIds,
      {
        beamProperties: { beamSpring: 2001000, beamDamp: 200, beamDeform: 35000, beamStrength: 150000 },
        symmetry: symmetryEnabled
      }
    );

    if (res.error) {
      console.error('Failed to quick-connect nodes:', res.error);
      return;
    }

    applyDocumentEdit(res.updatedText, `quick-connect-${res.createdType}`);
    runValidation(res.updatedText, curTab.filePath || curTab.title);
  }, [activeTab, validationResult, symmetryEnabled, applyDocumentEdit, runValidation]);

  // Extrude selected nodes with connecting beams and cross-bracing (Blender "E" key)
  const handleExtrudeNodes = useCallback(({ nodeIds, delta, properties }) => {
    const curTab = activeTabRef.current || activeTab;
    if (!curTab || !Array.isArray(nodeIds) || nodeIds.length === 0) return;

    const parts = (validationResultRef.current || validationResult).parts || {};
    const partKeys = Object.keys(parts).filter(k => k !== '__meta');
    let targetPartName = partKeys.length > 0 ? partKeys[0] : 'main';

    const nodesData = [];
    for (const pKey of partKeys) {
      const p = parts[pKey];
      if (p?.nodes) {
        for (const [nid, nObj] of Object.entries(p.nodes)) {
          if (nodeIds.includes(nid)) {
            targetPartName = pKey;
            nodesData.push({ id: nid, pos: extractNodeCoords(nObj) });
          }
        }
      }
    }

    const res = extrudeNodesLossless(
      curTab.content,
      targetPartName,
      {
        nodeIds,
        nodesData,
        delta: delta || [0, -0.3, 0],
        properties: properties || { beamSpring: 2001000, beamDamp: 200, beamDeform: 35000, beamStrength: 150000 },
        crossBracing: true
      },
      symmetryEnabled
    );

    if (res.error) {
      console.error('Failed to extrude nodes:', res.error);
      return;
    }

    applyDocumentEdit(res.updatedText, 'extrude-nodes');
    if (res.newNodes && res.newNodes.length > 0) {
      setSelectedNodeId(res.newNodes[0].id);
    }
    runValidation(res.updatedText, curTab.filePath || curTab.title);
  }, [activeTab, validationResult, symmetryEnabled, applyDocumentEdit, runValidation]);

  // Option 2: Delete Selected Element (Node, Beam, Surface) with Full Bilateral Symmetry & Multi-Select Support
  const handleDeleteSelected = useCallback((type, target) => {
    const curTab = activeTabRef.current || activeTab;
    if (!curTab) return;
    const parts = (validationResultRef.current || validationResult).parts || {};
    const partKeys = Object.keys(parts).filter(k => k !== '__meta');
    let targetPartName = partKeys.length > 0 ? partKeys[0] : 'main';

    let currentText = curTab.content;
    let editType = 'delete-element';

    if (type === 'node' || type === 'nodes') {
      const rawNodes = Array.isArray(target) ? target : [target];
      if (rawNodes.length === 0) return;

      const nodesToDelete = new Set(rawNodes);
      if (symmetryEnabled) {
        for (const nid of rawNodes) {
          const symId = getSymmetricNodeId(nid);
          if (symId) nodesToDelete.add(symId);
        }
      }

      for (const nid of nodesToDelete) {
        let pName = targetPartName;
        for (const pKey of partKeys) {
          if (parts[pKey]?.nodes && parts[pKey].nodes[nid]) {
            pName = pKey;
            break;
          }
        }
        const res = deleteNodeLossless(currentText, pName, nid, true);
        if (!res.error) {
          currentText = res.updatedText;
        }
      }

      setSelectedNodeId(null);
      setMultiSelectedNodes([]);
      editType = 'delete-node';
    } else if (type === 'beam' && target) {
      const id1 = target.id1 || (target.beam?.['id1:']) || (typeof target === 'string' ? target.split('_')[0] : null);
      const id2 = target.id2 || (target.beam?.['id2:']) || (typeof target === 'string' ? target.split('_')[1] : null);
      if (id1 && id2) {
        let pName = targetPartName;
        for (const pKey of partKeys) {
          if (parts[pKey]?.beams) {
            const hasBeam = Object.keys(parts[pKey].beams).some(k => {
              const b = parts[pKey].beams[k];
              return (b['id1:'] === id1 && b['id2:'] === id2) || (b['id1:'] === id2 && b['id2:'] === id1);
            });
            if (hasBeam) {
              pName = pKey;
              break;
            }
          }
        }

        const res = deleteBeamLossless(currentText, pName, id1, id2);
        if (!res.error) {
          currentText = res.updatedText;
        }

        if (symmetryEnabled) {
          const sym1 = getSymmetricNodeId(id1);
          const sym2 = getSymmetricNodeId(id2);
          if (sym1 && sym2 && (sym1 !== id1 || sym2 !== id2)) {
            const resSym = deleteBeamLossless(currentText, pName, sym1, sym2);
            if (!resSym.error) {
              currentText = resSym.updatedText;
            }
          }
        }

        setSelectedBeamInfo(null);
        editType = 'delete-beam';
      }
    } else if ((type === 'surface' || type === 'triangle' || type === 'quad') && target) {
      const surfaceType = target.type || (target.nodes?.length === 4 ? 'quad' : 'triangle');
      const nodes = target.nodes || [target.id1, target.id2, target.id3, target.id4].filter(Boolean);
      const pName = target.partName || targetPartName;

      if (surfaceType === 'quad' && nodes.length === 4) {
        const res = deleteQuadLossless(currentText, pName, nodes[0], nodes[1], nodes[2], nodes[3]);
        if (!res.error) currentText = res.updatedText;

        if (symmetryEnabled) {
          const sym1 = getSymmetricNodeId(nodes[0]);
          const sym2 = getSymmetricNodeId(nodes[1]);
          const sym3 = getSymmetricNodeId(nodes[2]);
          const sym4 = getSymmetricNodeId(nodes[3]);
          if (sym1 && sym2 && sym3 && sym4) {
            const resSym = deleteQuadLossless(currentText, pName, sym1, sym4, sym3, sym2);
            if (!resSym.error) currentText = resSym.updatedText;
          }
        }
      } else if (nodes.length >= 3) {
        const res = deleteTriangleLossless(currentText, pName, nodes[0], nodes[1], nodes[2]);
        if (!res.error) currentText = res.updatedText;

        if (symmetryEnabled) {
          const sym1 = getSymmetricNodeId(nodes[0]);
          const sym2 = getSymmetricNodeId(nodes[1]);
          const sym3 = getSymmetricNodeId(nodes[2]);
          if (sym1 && sym2 && sym3) {
            const resSym = deleteTriangleLossless(currentText, pName, sym1, sym3, sym2);
            if (!resSym.error) currentText = resSym.updatedText;
          }
        }
      }

      setSelectedSurfaceInfo(null);
      editType = 'delete-surface';
    }

    if (currentText !== curTab.content) {
      applyDocumentEdit(currentText, editType);
      runValidation(currentText, curTab.filePath || curTab.title);
    }
  }, [activeTab, validationResult, symmetryEnabled, applyDocumentEdit, runValidation]);

  // Option 2 & 3: Cascading Node Renaming across all tables
  const handleRenameNode = useCallback((partName, oldNodeId, newNodeId, options = {}) => {
    const curTab = activeTabRef.current || activeTab;
    if (!curTab || !oldNodeId || !newNodeId || oldNodeId === newNodeId) return;

    const res = renameNodeLossless(curTab.content, partName, oldNodeId, newNodeId, {
      symmetry: options.symmetry !== undefined ? options.symmetry : symmetryEnabled,
      allParts: false
    });

    if (res.error) {
      console.error('Rename node error:', res.error);
      return;
    }

    if (res.renamedCount > 0) {
      applyDocumentEdit(res.updatedText, 'rename-node');
      setSelectedNodeId(newNodeId);
      runValidation(res.updatedText, curTab.filePath || curTab.title);
    }
  }, [activeTab, symmetryEnabled, applyDocumentEdit, runValidation]);

  // Batch Node Renamer (from Blender): click in 3D sequentially renames nodes based on pattern
  const handleBatchRenameNode = useCallback((clickedNodeId) => {
    if (!clickedNodeId) return;
    const curTab = activeTabRef.current || activeTab;
    if (!curTab) return;

    const targetId = formatBatchNodeName(batchRenamePattern, batchRenameIndex);
    if (!targetId || targetId === clickedNodeId) {
      setBatchRenameIndex(prev => prev + 1);
      return;
    }

    let partName = null;
    const valResult = validationResultRef.current || validationResult;
    if (valResult.parts) {
      for (const pKey of Object.keys(valResult.parts).filter(k => k !== '__meta')) {
        const p = valResult.parts[pKey];
        if (p?.nodes && p.nodes[clickedNodeId]) {
          partName = pKey;
          break;
        }
      }
    }
    if (!partName && valResult.parts) {
      const firstPart = Object.keys(valResult.parts).find(k => k !== '__meta');
      if (firstPart) partName = firstPart;
    }
    if (!partName) return;

    const res = renameNodeLossless(curTab.content, partName, clickedNodeId, targetId, {
      symmetry: symmetryEnabledRef.current !== undefined ? symmetryEnabledRef.current : symmetryEnabled,
      allParts: false
    });

    if (res.error) {
      console.error('Batch rename error:', res.error);
      return;
    }

    if (res.renamedCount > 0) {
      applyDocumentEdit(res.updatedText, 'batch-rename-node');
      setSelectedNodeId(targetId);
      setLastRenamedFeedback({
        oldId: clickedNodeId,
        newId: targetId,
        timestamp: Date.now()
      });
      setBatchRenameIndex(prev => prev + 1);
      runValidation(res.updatedText, curTab.filePath || curTab.title);
    }
  }, [activeTab, batchRenamePattern, batchRenameIndex, validationResult, symmetryEnabled, applyDocumentEdit, runValidation]);

  // Live node movement during 3D gizmo drag (updates inspector without committing AST every frame)
  const handleLiveNodeMove = (nodeId, livePos) => {
    setLiveCoords({ id: nodeId, pos: livePos });
  };

  // Select Node (From Viewport or Structure Tree)
  const handleSelectNode = (nodeId) => {
    setSelectedNodeId(nodeId);
    setSelectedBeamInfo(null);
    setSelectedSurfaceInfo(null);
    setLiveCoords(null);

    // If node selected, reveal in editor
    if (nodeId && editorRef.current && validationResult.parts) {
      for (const pKey of Object.keys(validationResult.parts).filter(k => k !== '__meta')) {
        const p = validationResult.parts[pKey];
        if (p?.nodes && p.nodes[nodeId] && p.nodes[nodeId].__meta?.range) {
          const targetLine = p.nodes[nodeId].__meta.range[0] + 1;
          editorRef.current.revealLineInCenter(targetLine);
          editorRef.current.setPosition({ lineNumber: targetLine, column: 1 });
          break;
        }
      }
    }
  };

  // Select Beam (From Structure Tree, Viewport, or IPC)
  const handleSelectBeam = (partNameOrInfo, maybeBeamKey, maybeBeam) => {
    let partName, beamKey, beam;
    if (partNameOrInfo && typeof partNameOrInfo === 'object') {
      partName = partNameOrInfo.partName;
      beamKey = partNameOrInfo.beamKey;
      beam = partNameOrInfo.beam || partNameOrInfo.beamData;
    } else {
      partName = partNameOrInfo;
      beamKey = maybeBeamKey;
      beam = maybeBeam;
    }

    if (!beam && partName && beamKey && validationResultRef.current?.parts?.[partName]?.beams) {
      beam = validationResultRef.current.parts[partName].beams[beamKey];
    }

    setSelectedNodeId(null);
    setSelectedSurfaceInfo(null);
    setSelectedBeamInfo((partName || beamKey || beam) ? { partName, beamKey, beam } : null);

    if (beam?.__meta?.range && editorRef.current) {
      const targetLine = beam.__meta.range[0] + 1;
      editorRef.current.revealLineInCenter(targetLine);
      editorRef.current.setPosition({ lineNumber: targetLine, column: 1 });
    }
  };

  // Select Surface (Triangle or Quad from 3D Viewport)
  const handleSelectSurface = (surfaceInfo) => {
    setSelectedNodeId(null);
    setSelectedBeamInfo(null);
    setSelectedSurfaceInfo(surfaceInfo);
  };

  // Change Beam Physics Type Losslessly (Normal, Support, Hydro, Bounded, Anisotropic, Pressured, LBeam)
  const handleChangeBeamType = useCallback((partName, id1, id2, newBeamType) => {
    const curTab = activeTabRef.current || activeTab;
    if (!curTab?.content) return;

    let targetPart = partName;
    const valResult = validationResultRef.current || validationResult;
    if (!targetPart && valResult.parts) {
      for (const pKey of Object.keys(valResult.parts).filter(k => k !== '__meta')) {
        const p = valResult.parts[pKey];
        if (p?.beams) {
          for (const b of Object.values(p.beams)) {
            if ((b['id1:'] === id1 && b['id2:'] === id2) || (b['id1:'] === id2 && b['id2:'] === id1)) {
              targetPart = pKey;
              break;
            }
          }
        }
        if (targetPart) break;
      }
    }
    if (!targetPart) {
      targetPart = Object.keys(valResult?.parts || {})[0] || 'main';
    }

    const res = updateBeamTypeLossless(curTab.content, targetPart, id1, id2, newBeamType, symmetryEnabled);
    if (res.error) {
      console.error('Failed to update beam type:', res.error);
      return;
    }

    if (res.updatedText) {
      applyDocumentEdit(res.updatedText, 'change-beam-type');
      setSelectedBeamInfo(prev => prev ? {
        ...prev,
        beam: { ...prev.beam, beamType: newBeamType }
      } : null);
      runValidation(res.updatedText, curTab.filePath || curTab.title);
    }
  }, [activeTab, validationResult, symmetryEnabled, applyDocumentEdit, runValidation]);

  // Flip Surface Normal / Invert Winding Order
  const handleFlipSurfaceNormal = useCallback((surfaceInfo) => {
    if (!surfaceInfo || !surfaceInfo.nodes || !editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;

    const currentText = model.getValue();
    const sectionName = surfaceInfo.type === 'quad' ? 'quads' : 'triangles';
    const res = flipSurfaceLossless(currentText, surfaceInfo.partName, sectionName, surfaceInfo.nodes, {
      symmetry: symmetryEnabled
    });

    if (res.error) {
      console.warn('[JBeamStudio] Flip surface error:', res.error);
      return;
    }

    editorRef.current.executeEdits('flip-surface-normal', [{
      range: model.getFullModelRange(),
      text: res.updatedText
    }]);

    const flippedNodes = [...surfaceInfo.nodes].reverse();
    setSelectedSurfaceInfo(prev => prev ? {
      ...prev,
      nodes: flippedNodes,
      id1: flippedNodes[0],
      id2: flippedNodes[1],
      id3: flippedNodes[2],
      id4: flippedNodes[3],
      normal: prev.normal ? [-prev.normal[0], -prev.normal[1], -prev.normal[2]] : [0, 1, 0]
    } : null);
  }, [symmetryEnabled]);

  // Jump to line in editor
  const handleJumpToCode = (lineNumber) => {
    if (editorRef.current && lineNumber) {
      editorRef.current.revealLineInCenter(lineNumber);
      editorRef.current.setPosition({ lineNumber, column: 1 });
      editorRef.current.focus();
    }
  };

  // Undo & Redo Action Triggers for Monaco Editor and 3D edits
  const handleUndo = useCallback(() => {
    if (editorRef.current) {
      const undoAction = editorRef.current.getAction('undo');
      if (undoAction) {
        undoAction.run();
      } else {
        editorRef.current.trigger('toolbar', 'undo', null);
      }
    }
  }, []);

  const handleRedo = useCallback(() => {
    if (editorRef.current) {
      const redoAction = editorRef.current.getAction('redo');
      if (redoAction) {
        redoAction.run();
      } else {
        editorRef.current.trigger('toolbar', 'redo', null);
      }
    }
  }, []);

  // Global Undo / Redo Shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;

        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
        } else if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          e.stopPropagation();
          handleRedo();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [handleUndo, handleRedo]);

  // Jump to declared powertrain device in active editor
  const handleJumpToPowertrainDevice = (deviceName) => {
    if (!deviceName) return;
    setLeftSidebarOpen(true);
    setLeftTab('code');

    const curTab = activeTabRef?.current || activeTab;
    if (curTab?.content && editorRef.current) {
      const lines = curTab.content.split('\n');
      const escaped = deviceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`["']?${escaped}["']?`);
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          handleJumpToCode(i + 1);
          return;
        }
      }
    }
  };

  // Navigate to problem in editor when clicked in Problems panel
  const handleNavigateToProblem = (problem) => {
    if (editorRef.current && problem.line) {
      editorRef.current.revealLineInCenter(problem.line);
      editorRef.current.setPosition({
        lineNumber: problem.line,
        column: problem.column || 1
      });
      editorRef.current.focus();
    }
  };

  // Helper to open content in a tab
  const openContentAsTab = useCallback((title, filePath, content) => {
    setTabs(prev => {
      // Remove unmodified untitled tab placeholder if opening a real file
      const filtered = prev.filter(t => !(t.id === 'tab-untitled' && !t.isDirty && !t.filePath));
      const existingTab = filtered.find(t => (filePath && t.filePath === filePath) || t.title === title);
      if (existingTab) {
        setActiveTabId(existingTab.id);
        return filtered;
      }
      const newTab = {
        id: `tab-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title,
        filePath: filePath || null,
        content,
        isDirty: false
      };
      setActiveTabId(newTab.id);
      return [...filtered, newTab];
    });
    setLeftTab('code');
    setLeftSidebarOpen(true);
  }, []);

  // Helper to build explorer tree from browser file list
  const buildTreeFromBrowserFiles = (fileList) => {
    const root = [];
    for (const file of fileList) {
      const relPath = file.webkitRelativePath || file.name;
      const parts = relPath.split('/');
      let currentLevel = root;
      let curPath = '';

      for (let i = 0; i < parts.length; i++) {
        const partName = parts[i];
        curPath = curPath ? `${curPath}/${partName}` : partName;
        const isFile = i === parts.length - 1;

        if (isFile) {
          const isJBeam = partName.endsWith('.jbeam');
          const isJson = partName.endsWith('.json') || partName.endsWith('.pc');
          currentLevel.push({
            name: partName,
            path: curPath,
            isDirectory: false,
            isJBeam,
            isJson,
            browserFile: file
          });
        } else {
          let folder = currentLevel.find(item => item.isDirectory && item.name === partName);
          if (!folder) {
            folder = {
              name: partName,
              path: curPath,
              isDirectory: true,
              children: []
            };
            currentLevel.push(folder);
          }
          currentLevel = folder.children;
        }
      }
    }
    return root;
  };

  // Find file in workspace tree by path
  const findFileInTree = (items, targetPath) => {
    for (const item of items) {
      if (item.path === targetPath) return item;
      if (item.children) {
        const found = findFileInTree(item.children, targetPath);
        if (found) return found;
      }
    }
    return null;
  };

  // File Operations (Works in Electron and Browser)
  const handleOpenFile = async (filePath) => {
    try {
      const fileName = filePath.split(/[\\/]/).pop();

      // Intercept .dae files -> load directly as 3D Visual Mesh Overlay
      if (fileName && fileName.toLowerCase().endsWith('.dae')) {
        await handleSelectDiscoveredDae(filePath);
        return;
      }

      if (window.jbeamAPI?.readFile) {
        const res = await window.jbeamAPI.readFile(filePath);
        if (res.success) {
          openContentAsTab(fileName, res.filePath || filePath, res.content);
        }
      } else {
        // Browser fallback: lookup file in workspaceFiles
        const node = findFileInTree(workspaceFiles, filePath);
        if (node && node.browserFile) {
          if (node.name.toLowerCase().endsWith('.dae')) {
            const text = await node.browserFile.text();
            handleLoadDaeContent(text, node.name);
          } else {
            const text = await node.browserFile.text();
            openContentAsTab(node.name, node.path, text);
          }
        } else if (node && node.virtualContent !== undefined) {
          openContentAsTab(node.name, node.path, node.virtualContent);
        }
      }
    } catch (err) {
      console.error('Error opening file:', err);
    }
  };

  const handleOpenFileDialog = async () => {
    try {
      if (window.jbeamAPI?.openFileDialog) {
        const res = await window.jbeamAPI.openFileDialog();
        if (!res.canceled && res.filePath) {
          openContentAsTab(res.fileName, res.filePath, res.content);
        }
      } else if (window.showOpenFilePicker) {
        // Modern Browser File System Access API
        const [handle] = await window.showOpenFilePicker({
          types: [{
            description: 'BeamNG JBeam & Vehicle Files',
            accept: { 'text/plain': ['.jbeam', '.json', '.pc'] }
          }]
        });
        const file = await handle.getFile();
        const content = await file.text();
        openContentAsTab(file.name, file.name, content);
      } else {
        // Standard HTML5 File Input Fallback
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.jbeam,.json,.pc';
        input.onchange = async (e) => {
          const file = e.target.files?.[0];
          if (file) {
            const content = await file.text();
            openContentAsTab(file.name, file.name, content);
          }
        };
        input.click();
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Error in open file dialog:', err);
      }
    }
  };

  // Read part file content from open tab, native IPC, or browser workspace
  const readPartFileContent = useCallback(async (filePath) => {
    const openTab = tabs.find(t => t.filePath === filePath);
    if (openTab) return openTab.content;

    if (window.jbeamAPI?.readFile) {
      const res = await window.jbeamAPI.readFile(filePath);
      if (res.success) return res.content;
    }

    const treeNode = findFileInTree(workspaceFiles, filePath);
    if (treeNode?.browserFile) {
      return await treeNode.browserFile.text();
    }
    if (treeNode?.virtualContent !== undefined) {
      return treeNode.virtualContent;
    }
    return null;
  }, [tabs, workspaceFiles]);

  // Scan and Index vehicle mod directory for parts, slots, and .pc configs
  const scanAndIndexWorkspace = useCallback(async (folderPath) => {
    if (!folderPath) {
      setWorkspaceIndex({ partsMap: {}, slotTypeMap: {}, configurations: [], rootParts: [], nodeToPartMap: {} });
      setActiveConfigName('');
      setActiveRootPart('');
      setActiveSlotSelections({});
      setCompositeVehicleParts(null);
      return;
    }
    try {
      let files = [];
      if (window.jbeamAPI?.scanVehicle) {
        files = await window.jbeamAPI.scanVehicle(folderPath);
      }
      if (files && files.length > 0) {
        const index = buildWorkspaceIndex(files);
        setWorkspaceIndex(index);
        if (index.rootParts.length > 0) {
          setActiveRootPart(index.rootParts[0].partName);
        } else {
          setActiveRootPart('');
        }
        if (index.configurations.length > 0) {
          const firstCfg = index.configurations[0];
          setActiveConfigName(firstCfg.fileName);
          if (firstCfg.mainPartName && index.partsMap[firstCfg.mainPartName]) {
            setActiveRootPart(firstCfg.mainPartName);
          }
          setActiveSlotSelections(firstCfg.parts || {});
        } else {
          // Folder has no .pc presets - clear any previous configuration selections
          setActiveConfigName('');
          setActiveSlotSelections({});
          setCompositeVehicleParts(null);
        }
      } else {
        // No vehicle files found in this directory
        setWorkspaceIndex({ partsMap: {}, slotTypeMap: {}, configurations: [], rootParts: [], nodeToPartMap: {} });
        setActiveConfigName('');
        setActiveRootPart('');
        setActiveSlotSelections({});
        setCompositeVehicleParts(null);
      }
    } catch (err) {
      console.error('Error scanning workspace vehicle:', err);
      setWorkspaceIndex({ partsMap: {}, slotTypeMap: {}, configurations: [], rootParts: [], nodeToPartMap: {} });
      setActiveConfigName('');
      setActiveRootPart('');
      setActiveSlotSelections({});
      setCompositeVehicleParts(null);
    }
  }, []);

  // Restore saved workspace & open file contents from disk on launch
  useEffect(() => {
    let isCancelled = false;

    const restoreSession = async () => {
      const savedWorkspace = localStorage.getItem('jbeam_studio_workspace_path');
      if (savedWorkspace) {
        try {
          const readTreeFn = window.jbeamAPI?.readWorkspaceTree || window.jbeamAPI?.readDirectory;
          if (readTreeFn) {
            const tree = await readTreeFn(savedWorkspace);
            if (!isCancelled && tree && tree.length > 0) {
              setWorkspacePath(savedWorkspace);
              setWorkspaceFiles(tree);
              if (window.jbeamAPI?.scanVehicle) {
                await scanAndIndexWorkspace(savedWorkspace);
              }
            } else if (!isCancelled) {
              // Path is invalid, doesn't exist on disk, or is empty
              setWorkspacePath(null);
              setWorkspaceFiles([]);
              localStorage.removeItem('jbeam_studio_workspace_path');
              await scanAndIndexWorkspace(null);
            }
          } else {
            setWorkspacePath(savedWorkspace);
            if (window.jbeamAPI?.scanVehicle) {
              await scanAndIndexWorkspace(savedWorkspace);
            }
          }
        } catch (err) {
          console.warn('Could not restore previous workspace:', err);
          setWorkspacePath(null);
          setWorkspaceFiles([]);
          localStorage.removeItem('jbeam_studio_workspace_path');
          await scanAndIndexWorkspace(null);
        }
      }

      // Restore open tabs from disk if file paths exist
      const savedTabsRaw = localStorage.getItem('jbeam_studio_open_tabs');
      if (savedTabsRaw) {
        try {
          const parsed = JSON.parse(savedTabsRaw);
          if (Array.isArray(parsed) && parsed.length > 0 && window.jbeamAPI?.readFile) {
            const loadedTabs = [];
            for (const t of parsed) {
              if (t.filePath) {
                const res = await window.jbeamAPI.readFile(t.filePath);
                if (res?.success) {
                  loadedTabs.push({
                    id: t.id || `tab-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                    title: t.title || t.filePath.split(/[\\/]/).pop(),
                    filePath: t.filePath,
                    content: res.content,
                    isDirty: false
                  });
                }
              }
            }
            if (!isCancelled && loadedTabs.length > 0) {
              setTabs(loadedTabs);
              const savedActiveId = localStorage.getItem('jbeam_studio_active_tab_id');
              const activeExists = loadedTabs.find(t => t.id === savedActiveId);
              setActiveTabId(activeExists ? activeExists.id : loadedTabs[0].id);
            }
          }
        } catch (err) {
          console.warn('Could not restore tabs from localStorage:', err);
        }
      }
    };

    restoreSession();
    return () => { isCancelled = true; };
  }, [scanAndIndexWorkspace]);

  // Persist open tabs & active tab to localStorage
  useEffect(() => {
    try {
      const serializableTabs = tabs
        .filter(t => t.filePath)
        .map(t => ({
          id: t.id,
          title: t.title,
          filePath: t.filePath
        }));
      if (serializableTabs.length > 0) {
        localStorage.setItem('jbeam_studio_open_tabs', JSON.stringify(serializableTabs));
        localStorage.setItem('jbeam_studio_active_tab_id', activeTabId);
      } else {
        localStorage.removeItem('jbeam_studio_open_tabs');
        localStorage.removeItem('jbeam_studio_active_tab_id');
      }
    } catch (e) {
      console.warn('Failed to save tabs to localStorage', e);
    }
  }, [tabs, activeTabId]);

  // Persist active workspace folder path to localStorage
  useEffect(() => {
    try {
      if (workspacePath) {
        localStorage.setItem('jbeam_studio_workspace_path', workspacePath);
      } else {
        localStorage.removeItem('jbeam_studio_workspace_path');
      }
    } catch (e) {
      console.warn('Failed to save workspace path to localStorage', e);
    }
  }, [workspacePath]);

  // Compute hierarchical assembly slot tree
  const assemblyTree = React.useMemo(() => {
    if (!activeRootPart || !workspaceIndex.partsMap[activeRootPart]) return null;
    return resolveAssemblyTree(
      activeRootPart,
      workspaceIndex.partsMap,
      workspaceIndex.slotTypeMap,
      activeSlotSelections
    );
  }, [activeRootPart, workspaceIndex, activeSlotSelections]);

  // Asynchronously build composite vehicle parts data for 3D viewport
  useEffect(() => {
    if (!assemblyTree) {
      setCompositeVehicleParts(null);
      return;
    }

    let isMounted = true;
    const buildComposite = async () => {
      setIsAssembling(true);
      try {
        const activeParts = getActiveAssembledParts(assemblyTree, partVisibility);
        const composite = await buildCompositeVehicleData(activeParts, readPartFileContent);
        if (isMounted) {
          setCompositeVehicleParts(composite);
        }
      } catch (err) {
        console.error('Error building composite vehicle:', err);
      } finally {
        if (isMounted) setIsAssembling(false);
      }
    };

    buildComposite();
    return () => { isMounted = false; };
  }, [assemblyTree, partVisibility, readPartFileContent]);

  // Assembly Manager Action Handlers
  const handleSelectConfiguration = (cfgFileName) => {
    setActiveConfigName(cfgFileName);
    const cfg = workspaceIndex.configurations.find(c => c.fileName === cfgFileName);
    if (cfg) {
      if (cfg.mainPartName && workspaceIndex.partsMap[cfg.mainPartName]) {
        setActiveRootPart(cfg.mainPartName);
      }
      setActiveSlotSelections(cfg.parts || {});
      setViewportSource('assembly'); // Auto-switch to composite assembly in 3D
      setIsolateMatchingMesh(true); // Automatically isolate submeshes matching active assembled vehicle parts

      // Automatically load and composite all discovered project .dae models so flexbodies across all modules are visible
      if (discoveredDaeFiles && discoveredDaeFiles.length > 1) {
        if (!visualMeshName || !visualMeshName.startsWith('All Project Models')) {
          handleSelectAllDiscoveredDae();
        }
      } else if (discoveredDaeFiles && discoveredDaeFiles.length === 1 && !visualMeshDaeText) {
        handleSelectDiscoveredDae(discoveredDaeFiles[0].path);
      }
    }
  };

  const handleSelectRootPart = (rootName) => {
    setActiveRootPart(rootName);
    setActiveConfigName('');
    setActiveSlotSelections({});
  };

  const handleSelectPartForSlot = (slotName, chosenPart) => {
    setActiveSlotSelections(prev => ({
      ...prev,
      [slotName]: chosenPart === 'none' ? '' : chosenPart
    }));
    setActiveConfigName('');
  };

  const handleTogglePartVisibility = (partName) => {
    setPartVisibility(prev => ({
      ...prev,
      [partName]: prev[partName] === false ? true : false
    }));
  };

  const handleToggleAllVisibility = (visible) => {
    if (!assemblyTree) return;
    const all = getActiveAssembledParts(assemblyTree, {});
    const updated = {};
    for (const p of all) {
      updated[p.partName] = visible;
    }
    setPartVisibility(updated);
  };

  const handleOpenPartInEditor = (filePath) => {
    if (filePath) {
      handleOpenFile(filePath);
    }
  };

  const handleOpenFolderDialog = async () => {
    try {
      if (window.jbeamAPI?.openFolderDialog) {
        const res = await window.jbeamAPI.openFolderDialog();
        if (!res.canceled && res.folderPath) {
          setWorkspacePath(res.folderPath);
          setWorkspaceFiles(res.files || []);
          scanAndIndexWorkspace(res.folderPath);
          setTabs(prev => {
            const realTabs = prev.filter(t => !(t.id === 'tab-untitled' && !t.isDirty && !t.filePath));
            return realTabs.length > 0 ? realTabs : prev;
          });
        }
      } else {
        // Browser WebkitDirectory input fallback
        const input = document.createElement('input');
        input.type = 'file';
        input.webkitdirectory = true;
        input.directory = true;
        input.multiple = true;
        input.onchange = async (e) => {
          const files = Array.from(e.target.files || []);
          if (files.length > 0) {
            const tree = buildTreeFromBrowserFiles(files);
            const folderName = files[0].webkitRelativePath?.split('/')[0] || 'Mod Workspace';
            setWorkspacePath(folderName);
            setWorkspaceFiles(tree);

            // Read .jbeam & .pc files for browser indexing
            const jbeamAndPc = files.filter(f => f.name.endsWith('.jbeam') || f.name.endsWith('.pc'));
            const payload = [];
            for (const f of jbeamAndPc) {
              const content = await f.text();
              payload.push({ path: f.webkitRelativePath || f.name, content });
            }
            if (payload.length > 0) {
              const index = buildWorkspaceIndex(payload);
              setWorkspaceIndex(index);
              if (index.rootParts.length > 0) setActiveRootPart(index.rootParts[0].partName);
              if (index.configurations.length > 0) {
                setActiveConfigName(index.configurations[0].fileName);
                setActiveSlotSelections(index.configurations[0].parts || {});
              }
            }
          }
        };
        input.click();
      }
    } catch (err) {
      console.error('Error in open folder dialog:', err);
    }
  };

  const handleCloseWorkspaceFolder = useCallback(() => {
    // If any open tab has unsaved modifications, prompt user before closing workspace
    const dirtyTab = tabs.find(t => t.isDirty);
    if (dirtyTab) {
      setUnsavedModalTab(dirtyTab);
      return;
    }
    setWorkspacePath(null);
    setWorkspaceFiles([]);
    localStorage.removeItem('jbeam_studio_workspace_path');
    localStorage.removeItem('jbeam_studio_open_tabs');
    localStorage.removeItem('jbeam_studio_active_tab_id');
    setTabs([]);
    setActiveTabId(null);
    handleUnloadDae();
    scanAndIndexWorkspace(null);
    setWorkspaceIndex({ partsMap: {}, slotTypeMap: {}, configurations: [], rootParts: [], nodeToPartMap: {} });
    setCompositeVehicleParts(null);
    setActiveConfigName('');
    setActiveRootPart('');
    setPartVisibility({});
    setAssemblyTree(null);
    setValidationResult({ isValid: true, problems: [], parts: {} });
    setSelectedNodeId(null);
    setSelectedBeamInfo(null);
    setSelectedSurfaceInfo(null);
  }, [tabs, scanAndIndexWorkspace, handleUnloadDae]);

  const handleVehicleProjectCreated = useCallback(({ folderPath, files, vehicleId, mainJBeamContent, mainJBeamPath, daeContent, daeFileName }) => {
    setWorkspacePath(folderPath);
    setWorkspaceFiles(files || []);
    scanAndIndexWorkspace(folderPath);
    if (daeContent && daeFileName) {
      handleLoadDaeContent(daeContent, daeFileName);
    }
    if (mainJBeamContent) {
      openContentAsTab(`${vehicleId}.jbeam`, mainJBeamPath, mainJBeamContent);
    }
    setLeftTab('assembly');
    setViewportSource('assembly');
  }, [scanAndIndexWorkspace, openContentAsTab, handleLoadDaeContent]);

  const handleSave = async () => {
    if (!activeTab) return;
    try {
      if (activeTab.filePath && window.jbeamAPI?.saveDirectFile) {
        const res = await window.jbeamAPI.saveDirectFile(activeTab.filePath, activeTab.content);
        if (res.success) {
          setTabs(prev =>
            prev.map(t => t.id === activeTab.id ? { ...t, isDirty: false } : t)
          );
        }
      } else if (window.jbeamAPI?.saveFileDialog) {
        handleSaveAs();
      } else {
        // Browser fallback: download file blob
        const blob = new Blob([activeTab.content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = activeTab.title || 'vehicle_part.jbeam';
        a.click();
        URL.revokeObjectURL(url);
        setTabs(prev =>
          prev.map(t => t.id === activeTab.id ? { ...t, isDirty: false } : t)
        );
      }
    } catch (err) {
      console.error('Error saving file:', err);
    }
  };

  const handleSaveAs = async () => {
    if (!activeTab) return;
    try {
      if (window.jbeamAPI?.saveFileDialog) {
        const res = await window.jbeamAPI.saveFileDialog(activeTab.content, activeTab.filePath || activeTab.title);
        if (!res.canceled && res.filePath) {
          setTabs(prev =>
            prev.map(t =>
              t.id === activeTab.id
                ? { ...t, filePath: res.filePath, title: res.fileName, isDirty: false }
                : t
            )
          );
        }
      } else {
        // Browser download fallback
        const blob = new Blob([activeTab.content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = activeTab.title || 'vehicle_part.jbeam';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Error in save as dialog:', err);
    }
  };

  const [unsavedModalTab, setUnsavedModalTab] = useState(null);

  const doCloseTab = useCallback((tabId) => {
    setTabs(prev => {
      const remaining = prev.filter(t => t.id !== tabId);
      if (remaining.length === 0) {
        setActiveTabId(null);
        return [];
      }
      if (activeTabId === tabId) {
        setActiveTabId(remaining[remaining.length - 1].id);
      }
      return remaining;
    });
    setUnsavedModalTab(null);
  }, [activeTabId]);

  const handleCloseTab = useCallback((tabId) => {
    const tabToClose = tabs.find(t => t.id === tabId);
    if (tabToClose && tabToClose.isDirty) {
      setUnsavedModalTab(tabToClose);
      return;
    }
    doCloseTab(tabId);
  }, [tabs, doCloseTab]);

  const handleCloseOtherTabs = useCallback((tabId) => {
    tabs.forEach(t => {
      if (t.id !== tabId) handleCloseTab(t.id);
    });
  }, [tabs, handleCloseTab]);

  const handleCloseAllTabs = useCallback(() => {
    tabs.forEach(t => handleCloseTab(t.id));
  }, [tabs, handleCloseTab]);

  const handleConfirmSaveAndClose = useCallback(async () => {
    if (!unsavedModalTab) return;
    const tab = unsavedModalTab;
    try {
      if (tab.filePath && window.jbeamAPI?.saveDirectFile) {
        await window.jbeamAPI.saveDirectFile(tab.filePath, tab.content);
      } else if (window.jbeamAPI?.saveFileDialog) {
        const res = await window.jbeamAPI.saveFileDialog(tab.content, tab.filePath || tab.title);
        if (res.canceled) return;
      } else {
        const blob = new Blob([tab.content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = tab.title || 'vehicle_part.jbeam';
        a.click();
        URL.revokeObjectURL(url);
      }
      doCloseTab(tab.id);
    } catch (e) {
      console.error('Failed to save file before closing:', e);
    }
  }, [unsavedModalTab, doCloseTab]);

  const handleDiscardAndClose = useCallback(() => {
    if (!unsavedModalTab) return;
    doCloseTab(unsavedModalTab.id);
  }, [unsavedModalTab, doCloseTab]);

  const handleCancelClose = useCallback(() => {
    setUnsavedModalTab(null);
  }, []);

  const handleCreateWorkspaceFile = useCallback(async (fileName) => {
    if (!fileName || !fileName.trim()) return;
    let cleanName = fileName.trim();
    if (!cleanName.includes('.')) {
      cleanName += '.jbeam';
    }

    let defaultContent = '';
    if (cleanName.endsWith('.jbeam')) {
      const partKey = cleanName.replace(/\.jbeam$/, '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
      defaultContent = `{\n  "${partKey}": {\n    "information": {\n      "authors": "Modder",\n      "name": "${cleanName.replace(/\.jbeam$/, '')}"\n    },\n    "slotType": "${partKey}",\n    "nodes": [\n      ["id", "posX", "posY", "posZ"],\n      {"nodeWeight": 5.0},\n      {"frictionCoef": 0.5},\n      {"group": "${partKey}"}\n    ],\n    "beams": [\n      ["id1:", "id2:"],\n      {"beamSpring": 1501000, "beamDamp": 120}\n    ]\n  }\n}\n`;
    }

    let fullPath = null;
    if (workspacePath && window.jbeamAPI?.saveDirectFile) {
      fullPath = `${workspacePath}\\${cleanName}`;
      await window.jbeamAPI.saveDirectFile(fullPath, defaultContent);
      if (window.jbeamAPI?.readWorkspaceTree) {
        const tree = await window.jbeamAPI.readWorkspaceTree(workspacePath);
        if (tree) setWorkspaceFiles(tree);
      }
      await scanAndIndexWorkspace(workspacePath);
    } else {
      fullPath = workspacePath ? `${workspacePath}/${cleanName}` : cleanName;
      setWorkspaceFiles(prev => [
        ...(prev || []),
        {
          name: cleanName,
          path: fullPath,
          isDirectory: false,
          isJBeam: cleanName.endsWith('.jbeam'),
          virtualContent: defaultContent
        }
      ]);
    }

    openContentAsTab(cleanName, fullPath, defaultContent);
  }, [workspacePath, scanAndIndexWorkspace, openContentAsTab]);

  const handleCreateWorkspaceFolder = useCallback(async (folderName) => {
    if (!folderName || !folderName.trim()) return;
    const cleanName = folderName.trim().replace(/[^a-zA-Z0-9_\-\s]/g, '');
    if (!cleanName) return;

    if (workspacePath && window.jbeamAPI?.createDirectFolder) {
      const fullPath = `${workspacePath}\\${cleanName}`;
      await window.jbeamAPI.createDirectFolder(fullPath);
      if (window.jbeamAPI?.readWorkspaceTree) {
        const tree = await window.jbeamAPI.readWorkspaceTree(workspacePath);
        if (tree) setWorkspaceFiles(tree);
      }
    } else if (workspacePath && window.jbeamAPI?.saveDirectFile) {
      const placeholderPath = `${workspacePath}\\${cleanName}\\.gitkeep`;
      await window.jbeamAPI.saveDirectFile(placeholderPath, '');
      if (window.jbeamAPI?.readWorkspaceTree) {
        const tree = await window.jbeamAPI.readWorkspaceTree(workspacePath);
        if (tree) setWorkspaceFiles(tree);
      }
    } else {
      setWorkspaceFiles(prev => [
        ...(prev || []),
        {
          name: cleanName,
          path: workspacePath ? `${workspacePath}/${cleanName}` : cleanName,
          isDirectory: true,
          children: []
        }
      ]);
    }
  }, [workspacePath]);

  const handleNewFile = () => {
    const newTab = {
      id: `tab-${Date.now()}`,
      title: `untitled_${Date.now().toString().slice(-4)}.jbeam`,
      filePath: null,
      content: UNTITLED_JBEAM,
      isDirty: false
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  // Keyboard Shortcuts (Ctrl+S, Ctrl+O, Ctrl+B, Ctrl+J, Ctrl+`)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        handleNewFile();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        handleOpenFileDialog();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setLeftSidebarOpen(prev => !prev);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault();
        setRightSidebarOpen(prev => !prev);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        handleReloadActiveVehicle();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        setBottomPanelOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, handleSave, handleOpenFileDialog]);

  // Native Electron Menu Actions Listener
  useEffect(() => {
    if (!window.jbeamAPI?.onMenuAction) return;

    const unsubs = [
      window.jbeamAPI.onMenuAction('menu-new-file', () => handleNewFile()),
      window.jbeamAPI.onMenuAction('menu-open-file', () => handleOpenFileDialog()),
      window.jbeamAPI.onMenuAction('menu-open-folder', () => handleOpenFolderDialog()),
      window.jbeamAPI.onMenuAction('menu-close-folder', () => handleCloseWorkspaceFolder()),
      window.jbeamAPI.onMenuAction('menu-new-vehicle', () => setIsNewVehicleModalOpen(true)),
      window.jbeamAPI.onMenuAction('menu-load-dae', () => handleOpenDaeDialog()),
      window.jbeamAPI.onMenuAction('menu-unload-dae', () => handleUnloadDae()),
      window.jbeamAPI.onMenuAction('menu-save', () => handleSave()),
      window.jbeamAPI.onMenuAction('menu-save-as', () => handleSaveAs()),
      window.jbeamAPI.onMenuAction('menu-toggle-left-sidebar', () => setLeftSidebarOpen(prev => !prev)),
      window.jbeamAPI.onMenuAction('menu-toggle-right-sidebar', () => setRightSidebarOpen(prev => !prev)),
      window.jbeamAPI.onMenuAction('menu-toggle-bottom-panel', () => setBottomPanelOpen(prev => !prev)),
      window.jbeamAPI.onMenuAction('menu-set-layout', (layout) => setLayoutMode(layout)),
      window.jbeamAPI.onMenuAction('menu-set-viewport-source', (source) => {
        if (source) setViewportSource(source);
      }),
      window.jbeamAPI.onMenuAction('detached-viewport-closed', () => {
        setIsViewportDetached(false);
        setDetachedWindow(null);
        setLeftSidebarOpen(true);
      })
    ];

    return () => {
      unsubs.forEach(unsub => {
        if (typeof unsub === 'function') unsub();
      });
    };
  }, [handleSave, handleSaveAs, handleOpenFileDialog, handleOpenFolderDialog, handleCloseWorkspaceFolder, handleOpenDaeDialog, handleUnloadDae]);

  // Determine active parts for 3D Viewport & Inspector (Single Document vs Open Tabs vs Assembled Vehicle)
  const activeViewportParts = useMemo(() => {
    if (viewportSource === 'assembly' && compositeVehicleParts && Object.keys(compositeVehicleParts).length > 0) {
      return compositeVehicleParts;
    }

    if (viewportSource === 'openTabs' && tabs.length > 0) {
      const mergedParts = {};

      // Vibrant CAD Multi-Component Palette (Active Part + Background Components)
      const CAD_PALETTES = [
        '#40c4ff', // Active tab: Electric Cyan
        '#f59e0b', // Component 1: Vibrant Amber
        '#10b981', // Component 2: Emerald Green
        '#a855f7', // Component 3: Vivid Purple
        '#f43f5e', // Component 4: Coral Red
        '#06b6d4', // Component 5: Electric Teal
        '#eab308', // Component 6: Gold
        '#ec4899'  // Component 7: Pink
      ];

      // 1. Process active tab (primary document, full opacity)
      const curParts = validationResult.parts || {};
      for (const pKey of Object.keys(curParts).filter(k => k !== '__meta')) {
        mergedParts[pKey] = {
          ...curParts[pKey],
          __isNonActive: false,
          __tabTitle: activeTab?.title || 'active',
          __componentIndex: 0,
          __componentColor: CAD_PALETTES[0]
        };
      }

      // 2. Process background open tabs with distinct CAD component colors
      let bgIndex = 1;
      for (const tab of tabs) {
        if (tab.id === activeTabId) continue;
        if (!tab.content || typeof tab.content !== 'string') continue;

        const compColor = CAD_PALETTES[bgIndex % CAD_PALETTES.length];
        const compIdx = bgIndex;
        bgIndex++;

        try {
          const val = validateJBeamDocument(tab.content, tab.filePath || tab.title);
          if (val && val.parts) {
            for (const pKey of Object.keys(val.parts).filter(k => k !== '__meta')) {
              const srcPart = val.parts[pKey];
              if (!srcPart || typeof srcPart !== 'object') continue;

              // Ensure each open tab gets rendered, even if part names are identical (e.g. "part_name")
              const partKeyToUse = mergedParts[pKey] ? `${pKey}__tab_${tab.id || tab.title}` : pKey;

              // Annotate nodes with __isNonActive, component color and index
              const scopedNodes = {};
              if (srcPart.nodes) {
                for (const [nid, nData] of Object.entries(srcPart.nodes)) {
                  if (nid === '__meta') continue;
                  scopedNodes[nid] = {
                    ...nData,
                    __isNonActive: true,
                    __tabTitle: tab.title,
                    __partName: partKeyToUse,
                    __componentIndex: compIdx,
                    __componentColor: compColor
                  };
                }
              }

              // Annotate beams with __isNonActive, component color and index
              const scopedBeams = {};
              if (srcPart.beams) {
                for (const [bid, bData] of Object.entries(srcPart.beams)) {
                  if (bid === '__meta') continue;
                  scopedBeams[bid] = {
                    ...bData,
                    __isNonActive: true,
                    __tabTitle: tab.title,
                    __partName: partKeyToUse,
                    __componentIndex: compIdx,
                    __componentColor: compColor
                  };
                }
              }

              // Annotate triangles with __isNonActive, component color and index
              const scopedTris = {};
              if (srcPart.triangles) {
                for (const [tid, tData] of Object.entries(srcPart.triangles)) {
                  if (tid === '__meta') continue;
                  scopedTris[tid] = {
                    ...tData,
                    __isNonActive: true,
                    __tabTitle: tab.title,
                    __partName: partKeyToUse,
                    __componentIndex: compIdx,
                    __componentColor: compColor
                  };
                }
              }

              mergedParts[partKeyToUse] = {
                ...srcPart,
                nodes: scopedNodes,
                beams: scopedBeams,
                triangles: scopedTris,
                __isNonActive: true,
                __tabTitle: tab.title,
                __componentIndex: compIdx,
                __componentColor: compColor
              };
            }
          }
        } catch (e) {
          console.warn('[App] Multi-part validation error for background tab:', tab.title, e);
        }
      }

      return mergedParts;
    }

    if (!activeTab) return null;
    return validationResult.parts;
  }, [viewportSource, compositeVehicleParts, validationResult, tabs, activeTabId, activeTab]);

  // Compute element counts for status bar
  let nodeCount = 0;
  let beamCount = 0;
  let triangleCount = 0;
  let quadCount = 0;
  if (activeViewportParts) {
    for (const pKey of Object.keys(activeViewportParts).filter(k => k !== '__meta')) {
      const p = activeViewportParts[pKey];
      if (p?.nodes) nodeCount += Object.keys(p.nodes).filter(k => k !== '__meta').length;
      if (p?.beams) beamCount += Object.keys(p.beams).filter(k => k !== '__meta').length;
      if (p?.triangles) triangleCount += Object.keys(p.triangles).filter(k => k !== '__meta').length;
      if (p?.quads) quadCount += Object.keys(p.quads).filter(k => k !== '__meta').length;
    }
  }

  const { nodeCollisionCount, suggestedPrefix } = useMemo(() => {
    if (!tabs || tabs.length < 2) return { nodeCollisionCount: 0, suggestedPrefix: '' };
    const curParts = validationResult.parts || {};
    const curPart = Object.values(curParts)[0];
    if (!curPart?.nodes) return { nodeCollisionCount: 0, suggestedPrefix: '' };

    const activeNodeIds = new Set();
    const rows = Array.isArray(curPart.nodes) ? curPart.nodes : Object.values(curPart.nodes);
    for (const r of rows) {
      if (!r || typeof r !== 'object') continue;
      const nid = r.id || r['0'] || (Array.isArray(r) ? r[0] : null);
      if (nid && typeof nid === 'string' && nid.toLowerCase() !== 'id') {
        activeNodeIds.add(nid);
      }
    }

    let collisionCount = 0;
    const curId = activeTab?.id;
    for (const t of tabs) {
      if (t.id === curId || !t.content) continue;
      for (const nid of activeNodeIds) {
        if (t.content.includes(`"${nid}"`)) {
          collisionCount++;
        }
      }
    }

    const curPartKey = Object.keys(curParts).filter(k => k !== '__meta')[0] || 'part';
    const prefix = getPartPrefix(curPartKey, activeTab?.title);

    return { nodeCollisionCount: collisionCount, suggestedPrefix: prefix };
  }, [tabs, activeTab, validationResult]);

  // Saves generated modular files to disk and opens them in the workspace
  const handleCreateFiles = useCallback(async (files) => {
    if (!files || typeof files !== 'object') return false;
    let targetDir = workspacePath;
    if (!targetDir && activeTab?.filePath) {
      const lastSlash = Math.max(activeTab.filePath.lastIndexOf('/'), activeTab.filePath.lastIndexOf('\\'));
      if (lastSlash > 0) {
        targetDir = activeTab.filePath.substring(0, lastSlash);
      }
    }

    const createdEntries = [];
    for (const [fileName, content] of Object.entries(files)) {
      if (targetDir && window.jbeamAPI?.saveDirectFile) {
        const fullPath = `${targetDir}\\${fileName}`;
        await window.jbeamAPI.saveDirectFile(fullPath, content);
        createdEntries.push({ name: fileName, filePath: fullPath, content });
      } else {
        createdEntries.push({ name: fileName, filePath: null, content });
      }
    }

    // In browser mode: trigger downloads so user actually has the files on disk
    if (!window.jbeamAPI?.saveDirectFile) {
      for (const [fileName, content] of Object.entries(files)) {
        try {
          const blob = new Blob([content], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (e) {
          console.warn('Browser download error:', e);
        }
      }
    }

    // Refresh workspace file tree in Electron and in-memory React state
    let refreshed = false;
    if (targetDir && window.jbeamAPI?.readWorkspaceTree) {
      const tree = await window.jbeamAPI.readWorkspaceTree(targetDir);
      if (tree && Array.isArray(tree) && tree.length > 0) {
        setWorkspaceFiles(tree);
        refreshed = true;
      }
    }

    if (!refreshed) {
      // In-memory update for browser mode or when tree read is not ready
      setWorkspaceFiles(prev => {
        const updated = JSON.parse(JSON.stringify(prev || []));
        let targetFolder = updated.find(item => item.isDirectory && (item.name === targetDir || item.path === targetDir));
        if (!targetFolder && updated.length === 1 && updated[0].isDirectory) {
          targetFolder = updated[0];
        }
        for (const [fileName, content] of Object.entries(files)) {
          const item = {
            name: fileName,
            path: targetFolder ? `${targetFolder.path}/${fileName}` : (targetDir ? `${targetDir}/${fileName}` : fileName),
            isDirectory: false,
            isJBeam: fileName.endsWith('.jbeam'),
            isJson: fileName.endsWith('.pc') || fileName.endsWith('.json'),
            virtualContent: content
          };
          if (targetFolder) {
            if (!targetFolder.children) targetFolder.children = [];
            const idx = targetFolder.children.findIndex(c => c.name === fileName);
            if (idx !== -1) targetFolder.children[idx] = item;
            else targetFolder.children.push(item);
          } else {
            const idx = updated.findIndex(c => c.name === fileName);
            if (idx !== -1) updated[idx] = item;
            else updated.push(item);
          }
        }
        return updated;
      });
    }

    // Re-index workspace for multi-part assembly
    if (targetDir && window.jbeamAPI?.scanVehicle) {
      await scanAndIndexWorkspace(targetDir);
    } else {
      setWorkspaceIndex(prevIndex => {
        const payload = Object.entries(files).map(([fileName, content]) => ({
          path: targetDir ? `${targetDir}/${fileName}` : fileName,
          content
        }));
        const newIndex = buildWorkspaceIndex(payload);
        if (!prevIndex) return newIndex;
        return {
          ...prevIndex,
          parts: { ...(prevIndex.parts || {}), ...(newIndex.parts || {}) },
          slots: { ...(prevIndex.slots || {}), ...(newIndex.slots || {}) },
          rootParts: [
            ...(prevIndex.rootParts || []),
            ...(newIndex.rootParts || []).filter(np => !prevIndex.rootParts?.some(op => op.partName === np.partName))
          ]
        };
      });
    }

    // Open the primary engine file as a tab so user immediately sees code
    if (createdEntries.length > 0) {
      const first = createdEntries[0];
      setTabs(prev => {
        const existing = prev.find(t => t.fileName === first.name || (first.filePath && t.filePath === first.filePath));
        if (existing) {
          setActiveTabId(existing.id);
          return prev;
        }
        const newTab = {
          id: `tab-${Date.now()}-gen`,
          fileName: first.name,
          filePath: first.filePath,
          content: first.content,
          isModified: false
        };
        setActiveTabId(newTab.id);
        return [...prev, newTab];
      });
    }

    return true;
  }, [workspacePath, activeTab, scanAndIndexWorkspace]);

  const renderViewportContent = () => {
    if (viewportSource === 'powertrain') {
      const activePartKey = Object.keys(activeViewportParts || {}).filter(k => k !== '__meta')[0] || 'main';
      return (
        <PowertrainStudio
          jbeamParts={activeViewportParts}
          compositeVehicleParts={compositeVehicleParts}
          onApplyEdit={(newContent) => handleEditorChange(newContent)}
          activeDocumentText={activeTab?.content || ''}
          activePartName={activePartKey}
          onReturnToViewport={() => setViewportSource('activeDocument')}
          workspacePath={workspacePath}
          onCreateFiles={handleCreateFiles}
        />
      );
    }

    return (
      <JBeamViewport
        jbeamParts={activeViewportParts}
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
        onToggleSymmetry={() => setSymmetryEnabled(prev => !prev)}
        activeTool={activeTool}
        onToolChange={setActiveTool}
        gridSnap={gridSnap}
        onGridSnapChange={setGridSnap}
        onAddNode={handleAddNode}
        onAddBeam={handleAddBeam}
        onAddTriangle={handleAddTriangle}
        onAddQuad={handleAddQuad}
        onSubdivideBeam={handleSubdivideBeam}
        onQuickConnect={handleQuickConnect}
        onExtrudeNodes={handleExtrudeNodes}
        onDeleteSelected={handleDeleteSelected}
        codeHoveredElement={codeHoveredElement}
        nonActiveViewType={nonActiveViewType}
        onChangeNonActiveViewType={setNonActiveViewType}
        multiSelectedNodes={multiSelectedNodes}
        onMultiSelectChange={setMultiSelectedNodes}
        visualMeshDaeText={visualMeshDaeText}
        visualMeshName={visualMeshName}
        onLoadVisualMesh={handleLoadDaeContent}
        onUnloadVisualMesh={handleUnloadDae}
        discoveredDaeFiles={discoveredDaeFiles}
        onSelectProjectDae={handleSelectDiscoveredDae}
        onOpenDaeDialog={handleOpenDaeDialog}
        highlightedSubmesh={highlightedSubmesh}
        onHighlightSubmesh={handleHighlightSubmesh}
        onUpdateSubmeshNames={setVisualMeshSubnames}
        onUpdateSubmeshDetails={setVisualMeshSubmeshDetails}
        isolateMatchingMesh={isolateMatchingMesh}
        onToggleIsolateMesh={() => setIsolateMatchingMesh(prev => !prev)}
        viewportSource={viewportSource}
        hasAssembly={Boolean(compositeVehicleParts && Object.keys(compositeVehicleParts).length > 0)}
        compositeVehicleParts={compositeVehicleParts}
        onChangeViewportSource={(src) => {
          setViewportSource(src);
          setIsolateMatchingMesh(true);
        }}
        batchRenamePattern={batchRenamePattern}
        batchRenameIndex={batchRenameIndex}
        onBatchRenameNode={handleBatchRenameNode}
        onUpdateBatchRenamePattern={setBatchRenamePattern}
        onUpdateBatchRenameIndex={setBatchRenameIndex}
        lastRenamedFeedback={lastRenamedFeedback}
        onChangeBeamType={handleChangeBeamType}
        blueprintConfig={blueprintConfig}
        onOpenBlueprintModal={() => setBlueprintModalOpen(true)}
        onOpenObjModal={() => setObjModalOpen(true)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onAutoLinkMounts={handleAutoLinkClosestMounts}
        nodeCollisionCount={nodeCollisionCount}
        suggestedPrefix={suggestedPrefix}
        onPrefixActiveNodes={handlePrefixAllActiveNodes}
      />
    );
  };

  const viewportChannelRef = useRef(null);
  const syncStateRef = useRef({});
  const actionHandlersRef = useRef({});

  // Keep references updated on every render so stable channel handlers always have fresh state
  syncStateRef.current = {
    parts: activeViewportParts,
    compositeVehicleParts,
    activeTabTitle: activeTab?.title || (workspacePath ? workspacePath.split(/[\\/]/).filter(Boolean).pop() : 'untitled.jbeam'),
    selectedNodeId,
    selectedBeamInfo,
    selectedSurfaceInfo,
    symmetryEnabled,
    activeTool,
    partVisibility,
    assemblyTree,
    configurations: workspaceIndex.configurations,
    activeConfigName,
    rootParts: workspaceIndex.rootParts,
    activeRootPart,
    visualMeshName,
    visualMeshSubnames,
    visualMeshSubmeshDetails,
    visualMeshDaeText,
    isolateMatchingMesh,
    highlightedSubmesh,
    viewportSource
  };

  actionHandlersRef.current = {
    handleSelectNode,
    handleSelectBeam,
    handleSelectSurface,
    handleCommitNodeMove,
    handleLiveNodeMove,
    handleTogglePartVisibility,
    handleToggleAllVisibility,
    handleAddNode,
    handleAddBeam,
    handleAddTriangle,
    handleAddQuad,
    handleSubdivideBeam,
    handleQuickConnect,
    handleExtrudeNodes,
    handleDeleteSelected,
    handleChangeBeamType,
    handleRenameNode,
    handleBatchRenameNode,
    handleSelectConfiguration,
    handleSelectPartForSlot,
    handleSelectRootPart: (pName) => {
      setActiveRootPart(pName);
      rebuildAssemblyWithRoot(pName, activeConfigName);
    },
    handleHighlightSubmesh,
    handleUndo,
    handleRedo,
    handleUnloadDae,
    setIsolateMatchingMesh,
    setActiveTool,
    setSymmetryEnabled,
    setVisualMeshDaeText,
    setVisualMeshName,
    setIsViewportDetached,
    setDetachedWindow,
    setLeftSidebarOpen,
    setViewportSource
  };

  // Setup BroadcastChannel in Main Window for Multi-Window Real-Time Live Sync (Mount Once)
  useEffect(() => {
    let bc = null;
    try {
      bc = new BroadcastChannel('jbeam-studio-viewport-sync');
      viewportChannelRef.current = bc;
    } catch (e) {
      console.warn('[App] BroadcastChannel error:', e);
    }

    const sendSyncAll = () => {
      try {
        bc?.postMessage({
          type: 'SYNC_ALL',
          ...syncStateRef.current
        });
      } catch (e) {}
    };

    const handleChannelMessage = (data) => {
      if (!data || typeof data !== 'object') return;
      const h = actionHandlersRef.current;
      switch (data.type) {
        case 'REQUEST_SYNC':
          h.setIsViewportDetached?.(true);
          sendSyncAll();
          break;
        case 'TOGGLE_ISOLATE_MESH':
          h.setIsolateMatchingMesh?.(data.isolateMatchingMesh);
          break;
        case 'SET_VIEWPORT_SOURCE':
          h.setViewportSource?.(data.viewportSource);
          break;
        case 'SET_ACTIVE_TOOL':
          h.setActiveTool?.(data.tool);
          break;
        case 'TOGGLE_SYMMETRY':
          h.setSymmetryEnabled?.(data.symmetryEnabled);
          break;
        case 'ADD_NODE':
          h.handleAddNode?.(data.pos);
          break;
        case 'ADD_BEAM':
          h.handleAddBeam?.(data.id1, data.id2, data.presetProps, data.isCrossPart, data.options);
          break;
        case 'ADD_TRIANGLE':
          h.handleAddTriangle?.(data.n1, data.n2, data.n3);
          break;
        case 'ADD_QUAD':
          h.handleAddQuad?.(data.n1, data.n2, data.n3, data.n4);
          break;
        case 'DELETE_SELECTED':
          h.handleDeleteSelected?.(data.deleteType, data.target);
          break;
        case 'EXTRUDE_NODES':
          h.handleExtrudeNodes?.(data.nodeIds, data.offset);
          break;
        case 'QUICK_CONNECT':
          h.handleQuickConnect?.(data.nodeIds);
          break;
        case 'SUBDIVIDE_BEAM':
          h.handleSubdivideBeam?.(data.beamInfo);
          break;
        case 'CHANGE_BEAM_TYPE':
          h.handleChangeBeamType?.(data.beamKey, data.newType);
          break;
        case 'RENAME_NODE':
          h.handleRenameNode?.(data.oldId, data.newId);
          break;
        case 'BATCH_RENAME_NODE':
          h.handleBatchRenameNode?.(data.nodeId, data.newName);
          break;
        case 'HIGHLIGHT_SUBMESH':
          h.handleHighlightSubmesh?.(data.submeshName);
          break;
        case 'SELECT_SLOT_PART':
          h.handleSelectPartForSlot?.(data.slotName, data.partName);
          break;
        case 'SET_CONFIGURATION':
          h.handleSelectConfiguration?.(data.configName);
          break;
        case 'SET_ROOT_PART':
          h.handleSelectRootPart?.(data.rootPartName);
          break;
        case 'UNDO':
          h.handleUndo?.();
          break;
        case 'REDO':
          h.handleRedo?.();
          break;
        case 'SELECT_NODE':
          h.handleSelectNode?.(data.nodeId);
          break;
        case 'SELECT_BEAM':
          h.handleSelectBeam?.(data.beamInfo);
          break;
        case 'SELECT_SURFACE':
          h.handleSelectSurface?.(data.surfaceInfo);
          break;
        case 'COMMIT_NODE_MOVE':
          h.handleCommitNodeMove?.(data.nodeId, data.newPosition, data.symmetry);
          break;
        case 'LIVE_NODE_MOVE':
          h.handleLiveNodeMove?.(data.nodeId, data.newPosition);
          break;
        case 'TOGGLE_PART_VISIBILITY':
          h.handleTogglePartVisibility?.(data.partName);
          break;
        case 'TOGGLE_ALL_VISIBILITY':
          h.handleToggleAllVisibility?.(data.visible);
          break;
        case 'LOAD_DAE':
          if (data.daeText) {
            h.setVisualMeshDaeText?.(data.daeText);
            h.setVisualMeshName?.(data.fileName);
          }
          break;
        case 'UNLOAD_DAE':
          h.handleUnloadDae?.();
          break;
        case 'REATTACH_REQUESTED':
          h.setIsViewportDetached?.(false);
          h.setDetachedWindow?.(null);
          h.setLeftSidebarOpen?.(true);
          break;
        default:
          break;
      }
    };

    if (bc) {
      bc.onmessage = (e) => handleChannelMessage(e.data);
    }

    const handleWindowMsg = (e) => {
      if (e.data && e.data.channel === 'jbeam-studio-viewport-sync') {
        handleChannelMessage(e.data);
      }
    };
    window.addEventListener('message', handleWindowMsg);

    return () => {
      window.removeEventListener('message', handleWindowMsg);
      try {
        bc?.close();
      } catch (e) {}
    };
  }, []); // Run ONCE on mount! Stable lifecycle.

  // Live broadcast updates to detached window
  useEffect(() => {
    if (!isViewportDetached || !viewportChannelRef.current) return;
    try {
      viewportChannelRef.current.postMessage({
        type: 'SYNC_ALL',
        parts: activeViewportParts,
        compositeVehicleParts,
        activeTabTitle: activeTab?.title || (workspacePath ? workspacePath.split(/[\\/]/).filter(Boolean).pop() : 'untitled.jbeam'),
        selectedNodeId,
        selectedBeamInfo,
        selectedSurfaceInfo,
        symmetryEnabled,
        activeTool,
        partVisibility,
        assemblyTree,
        configurations: workspaceIndex.configurations,
        activeConfigName,
        rootParts: workspaceIndex.rootParts,
        activeRootPart,
        visualMeshName,
        visualMeshSubnames,
        visualMeshSubmeshDetails,
        visualMeshDaeText,
        isolateMatchingMesh,
        highlightedSubmesh,
        viewportSource
      });
    } catch (e) {}
  }, [
    isViewportDetached,
    viewportSource,
    activeViewportParts,
    compositeVehicleParts,
    activeTab,
    workspacePath,
    selectedNodeId,
    selectedBeamInfo,
    selectedSurfaceInfo,
    symmetryEnabled,
    activeTool,
    partVisibility,
    assemblyTree,
    workspaceIndex,
    activeConfigName,
    activeRootPart,
    visualMeshName,
    visualMeshSubnames,
    visualMeshSubmeshDetails,
    visualMeshDaeText,
    isolateMatchingMesh,
    highlightedSubmesh
  ]);

  // Live broadcast cursor / selection changes to detached window
  useEffect(() => {
    if (!isViewportDetached || !viewportChannelRef.current) return;
    try {
      viewportChannelRef.current.postMessage({
        type: 'SYNC_SELECTION',
        selectedNodeId,
        selectedBeamInfo,
        selectedSurfaceInfo
      });
    } catch (e) {}
  }, [isViewportDetached, selectedNodeId, selectedBeamInfo, selectedSurfaceInfo]);

  // Viewport Detach / Reattach Handlers
  const handleReattachViewport = useCallback(() => {
    try {
      viewportChannelRef.current?.postMessage({ type: 'REATTACH' });
    } catch (e) {}
    if (detachedWindow && !detachedWindow.closed) {
      try {
        detachedWindow.close();
      } catch (e) {}
    }
    setDetachedWindow(null);
    setIsViewportDetached(false);
    setLeftSidebarOpen(true);
  }, [detachedWindow]);

  const handleToggleDetachViewport = useCallback(() => {
    if (isViewportDetached) {
      handleReattachViewport();
      return;
    }

    try {
      const detachedUrl = `${window.location.origin}${window.location.pathname}?view=viewport-detached`;
      const newWin = window.open(
        detachedUrl,
        'JBeamStudio_3D_Viewport',
        'width=1280,height=850,left=120,top=60,resizable=yes,scrollbars=no'
      );
      if (newWin) {
        setDetachedWindow(newWin);
        setIsViewportDetached(true);
        // Code is the main center area; right sidebar has files and assembly
        setLeftSidebarOpen(false);
        setRightSidebarOpen(true);
        setDetachedRightTab('files');

        // Check window.closed to detect when detached window is closed by browser or OS
        const winTimer = setInterval(() => {
          try {
            if (newWin.closed) {
              clearInterval(winTimer);
              handleReattachViewport();
            }
          } catch (e) {
            clearInterval(winTimer);
            handleReattachViewport();
          }
        }, 350);
      } else {
        alert('Could not open secondary window. Please check if popups are blocked by your browser.');
      }
    } catch (err) {
      console.error('[App] Failed to open detached viewport window:', err);
      alert('Failed to open detached window: ' + err.message);
    }
  }, [isViewportDetached, handleReattachViewport]);

  // Render Helpers for Modular Layout Panels (Docked & Detached Support)
  const renderCodeEditorPanel = (isCenter = false) => (
    <div className={isCenter ? 'main-code-panel' : 'sidebar-code-container'}>
      {isCenter && (
        <div className="detached-banner">
          <span className="detached-banner-text">
            <img
              src="/icons/partconfig-dark.png"
              alt="3D Viewport Detached"
              className="detached-banner-logo-img"
            />
            <span>3D Viewport is detached to secondary window</span>
          </span>
          <button
            type="button"
            className="detached-banner-btn"
            onClick={handleReattachViewport}
            title="Dock 3D Viewport back into main window"
          >
            Reattach Viewport
          </button>
        </div>
      )}
      <EditorTabs
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={setActiveTabId}
        onCloseTab={handleCloseTab}
        onCloseOtherTabs={handleCloseOtherTabs}
        onCloseAllTabs={handleCloseAllTabs}
      />
      <div className={isCenter ? 'main-code-editor' : 'sidebar-code-editor'}>
        {activeTab ? (
          <Editor
            height="100%"
            language={JBEAM_LANGUAGE_ID}
            theme="jbeam-dark"
            value={activeTab.content}
            beforeMount={handleEditorWillMount}
            onMount={handleEditorDidMount}
            onChange={handleEditorChange}
            options={{
              automaticLayout: true,
              fontSize: isCenter ? 13 : 12,
              lineNumbers: 'on',
              minimap: { enabled: isCenter },
              bracketPairColorization: { enabled: true },
              scrollBeyondLastLine: false,
              tabSize: 2,
              wordWrap: 'off',
              scrollbar: {
                vertical: 'auto',
                horizontal: 'auto',
                verticalScrollbarSize: 7,
                horizontalScrollbarSize: 7,
                verticalHasArrows: false,
                horizontalHasArrows: false,
                useShadows: false
              }
            }}
          />
        ) : (
          <div className="editor-empty-state">
            <div className="empty-state-card">
              <div className="empty-state-brand">
                <img
                  src="/icons/jbeam-dark.png"
                  alt="JBeam.editor Logo"
                  className="empty-state-logo-img"
                />
                <AppBrandName fontSize={15} />
              </div>
              <h4 className="empty-state-heading">No JBeam File Open</h4>
              <p className="empty-state-text">
                Select a file from the Project Explorer, open a mod directory, or create a new JBeam file.
              </p>
              <div className="empty-state-actions">
                <button
                  type="button"
                  className="bng-btn primary"
                  onClick={handleNewFile}
                  title="Create a new untitled JBeam file"
                >
                  <FilePlusIcon size={14} />
                  <span>+ New JBeam File</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderProjectFiles = () => (
    <ProjectExplorer
      workspacePath={workspacePath}
      files={workspaceFiles}
      activeFilePath={activeTab?.filePath}
      onOpenFile={handleOpenFile}
      onOpenFolderDialog={handleOpenFolderDialog}
      onOpenFileDialog={handleOpenFileDialog}
      onCloseFolder={handleCloseWorkspaceFolder}
      onNewVehicle={() => setIsNewVehicleModalOpen(true)}
      onCreateFile={handleCreateWorkspaceFile}
      onCreateFolder={handleCreateWorkspaceFolder}
    />
  );

  const renderAssemblyManager = () => (
    <AssemblyManager
      configurations={workspaceIndex.configurations}
      activeConfigName={activeConfigName}
      onSelectConfiguration={handleSelectConfiguration}
      rootParts={workspaceIndex.rootParts}
      activeRootPart={activeRootPart}
      onSelectRootPart={handleSelectRootPart}
      assemblyTree={assemblyTree}
      partVisibility={partVisibility}
      onTogglePartVisibility={handleTogglePartVisibility}
      onToggleAllVisibility={handleToggleAllVisibility}
      onSelectPartForSlot={handleSelectPartForSlot}
      onOpenPartInEditor={handleOpenPartInEditor}
      isAssembling={isAssembling}
      totalAssembledStats={{
        parts: compositeVehicleParts ? Object.keys(compositeVehicleParts).length : 0,
        nodes: nodeCount,
        beams: beamCount
      }}
    />
  );

  const renderInspector = () => (
    <ElementInspector
      selectedNodeId={selectedNodeId}
      selectedBeamInfo={selectedBeamInfo}
      selectedSurfaceInfo={selectedSurfaceInfo}
      jbeamParts={activeViewportParts}
      onNodeCoordinateChange={handleCommitNodeMove}
      onRenameNode={handleRenameNode}
      onJumpToCode={handleJumpToCode}
      liveCoords={liveCoords}
      symmetryEnabled={symmetryEnabled}
      onToggleSymmetry={() => setSymmetryEnabled(prev => !prev)}
      onSubdivideBeam={handleSubdivideBeam}
      onFlipSurfaceNormal={handleFlipSurfaceNormal}
      visualMeshName={visualMeshName}
      visualMeshSubnames={visualMeshSubnames}
      visualMeshSubmeshDetails={visualMeshSubmeshDetails}
      discoveredDaeFiles={discoveredDaeFiles}
      onSelectProjectDae={handleSelectDiscoveredDae}
      onOpenDaeDialog={handleOpenDaeDialog}
      onUnloadVisualMesh={handleUnloadDae}
      highlightedSubmesh={highlightedSubmesh}
      onHighlightSubmesh={handleHighlightSubmesh}
      onSelectNode={handleSelectNode}
      isolateMatchingMesh={isolateMatchingMesh}
      onToggleIsolateMesh={() => setIsolateMatchingMesh(prev => !prev)}
      batchRenamePattern={batchRenamePattern}
      batchRenameIndex={batchRenameIndex}
      onUpdateBatchRenamePattern={setBatchRenamePattern}
      onUpdateBatchRenameIndex={setBatchRenameIndex}
      onResetBatchRenameIndex={() => setBatchRenameIndex(1)}
      batchRenameActive={activeTool === 'batchRename'}
      onToggleBatchRename={() => setActiveTool(prev => prev === 'batchRename' ? 'select' : 'batchRename')}
      onChangeBeamType={handleChangeBeamType}
    />
  );

  const renderStructureTree = () => (
    <StructureTree
      jbeamParts={activeViewportParts}
      selectedNodeId={selectedNodeId}
      selectedBeamKey={selectedBeamInfo?.beamKey}
      onSelectNode={handleSelectNode}
      onSelectBeam={handleSelectBeam}
    />
  );

  return (
    <div className="app-container">
      {/* Top Application Header Bar: Unified VS Code Titlebar (Image 2 Alignment) */}
      <Toolbar
        leftSidebarOpen={isViewportDetached ? false : leftSidebarOpen}
        onToggleLeftSidebar={() => {
          if (!isViewportDetached) {
            setLeftSidebarOpen(prev => !prev);
          }
        }}
        bottomPanelOpen={bottomPanelOpen}
        onToggleBottomPanel={() => setBottomPanelOpen(prev => !prev)}
        problemCount={validationResult.problems.length}
        rightSidebarOpen={rightSidebarOpen}
        onToggleRightSidebar={() => setRightSidebarOpen(prev => !prev)}
        activeTabTitle={activeTab?.title || ''}
        workspacePath={workspacePath}
        onNewFile={handleNewFile}
        onOpenFile={handleOpenFileDialog}
        onOpenFolder={handleOpenFolderDialog}
        onCloseFolder={handleCloseWorkspaceFolder}
        onSaveFile={handleSave}
        onSaveFileAs={handleSaveAs}
        onNewVehicle={() => setIsNewVehicleModalOpen(true)}
        onOpenBlueprintModal={() => setBlueprintModalOpen(true)}
        onOpenObjModal={() => setObjModalOpen(true)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onReloadVehicleInSim={handleReloadActiveVehicle}
        onToggleSimConnection={toggleSimConnection}
        simStatus={simStatus}
        viewportSource={viewportSource}
        onChangeViewportSource={(src) => {
          setViewportSource(src);
          setIsolateMatchingMesh(true);
        }}
        isViewportDetached={isViewportDetached}
        onDetachViewport={handleToggleDetachViewport}
        onCheckForUpdates={async () => {
          if (window.jbeamAPI?.checkForUpdates) {
            const res = await window.jbeamAPI.checkForUpdates();
            if (res.updateAvailable) {
              setUpdateInfo(res);
            } else if (res.success) {
              alert(`You are up to date! JBeam.editor v${res.currentVersion} is the latest version.`);
            } else {
              alert(`Update check failed: ${res.error || 'Could not connect to GitHub'}`);
            }
          }
        }}
      />

      {/* BeamNG-Themed In-App Update Notification Banner */}
      <UpdateBanner
        updateInfo={updateInfo}
        onDismiss={() => setUpdateInfo(null)}
      />

      {/* Main Workspace */}
      <div
        className={`workspace-main ${isResizing ? 'is-resizing' : ''}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={async (e) => {
          e.preventDefault();
          if (e.dataTransfer?.files?.length > 0) {
            for (const file of e.dataTransfer.files) {
              if (file.name.endsWith('.jbeam') || file.name.endsWith('.json') || file.name.endsWith('.pc')) {
                const text = await file.text();
                openContentAsTab(file.name, file.path || file.name, text);
              }
            }
          }
        }}
      >
        {/* Left Sidebar (Only in Docked Mode: Code, Files & Assembly) with Smooth Ease-Out Transition */}
        {!isViewportDetached && (
          <aside
            className={`left-sidebar ${leftSidebarOpen ? 'is-expanded' : 'is-collapsed'}`}
            style={{ width: leftSidebarOpen ? `${leftSidebarWidth}px` : '46px' }}
          >
            {/* Full Expanded Sidebar Content */}
            <div
              className="sidebar-pane-expanded"
              style={{ width: `${leftSidebarWidth}px` }}
              aria-hidden={!leftSidebarOpen}
            >
              <div className="sidebar-tabs-bar">
                <div className="sidebar-tabs">
                  <button
                    onClick={() => setLeftTab('code')}
                    className={`sidebar-tab-btn ${leftTab === 'code' ? 'active' : ''}`}
                    title="JBeam Code Editor"
                  >
                    <CodeIcon size={17} />
                    <span>Code</span>
                  </button>
                  <button
                    onClick={() => setLeftTab('files')}
                    className={`sidebar-tab-btn ${leftTab === 'files' ? 'active' : ''}`}
                    title="Project File Explorer"
                  >
                    <FolderIcon size={17} />
                    <span>Files</span>
                  </button>
                  <button
                    onClick={() => setLeftTab('assembly')}
                    className={`sidebar-tab-btn ${leftTab === 'assembly' ? 'active' : ''}`}
                    title="Vehicle Assembly & Slots"
                  >
                    <AssemblyIcon size={17} />
                    <span>Assembly {workspaceIndex.configurations.length > 0 ? `(${workspaceIndex.configurations.length})` : ''}</span>
                  </button>
                </div>
                <button
                  onClick={() => setLeftSidebarOpen(false)}
                  className="sidebar-toggle-close-btn"
                  title="Collapse Left Sidebar (Ctrl+B)"
                >
                  <ChevronLeftIcon size={15} />
                </button>
              </div>

              <div className="sidebar-content">
                {leftTab === 'code'
                  ? renderCodeEditorPanel(false)
                  : leftTab === 'files'
                  ? renderProjectFiles()
                  : renderAssemblyManager()}
              </div>
            </div>

            {/* Collapsed Activity Strip */}
            <div
              className="collapsed-sidebar-strip left-collapsed-strip"
              title="Primary Sidebar"
              aria-hidden={leftSidebarOpen}
            >
              <div className="collapsed-strip-items">
                <button
                  className={`collapsed-tab-btn ${leftTab === 'code' ? 'active' : ''}`}
                  onClick={() => {
                    setLeftTab('code');
                    setLeftSidebarOpen(true);
                  }}
                  title="JBeam Code Editor (Ctrl+B)"
                  aria-label="Code Editor"
                >
                  <CodeIcon size={18} />
                </button>
                <button
                  className={`collapsed-tab-btn ${leftTab === 'files' ? 'active' : ''}`}
                  onClick={() => {
                    setLeftTab('files');
                    setLeftSidebarOpen(true);
                  }}
                  title="Project File Explorer"
                  aria-label="Files Explorer"
                >
                  <FolderIcon size={18} />
                </button>
                <button
                  className={`collapsed-tab-btn ${leftTab === 'assembly' ? 'active' : ''}`}
                  onClick={() => {
                    setLeftTab('assembly');
                    setLeftSidebarOpen(true);
                  }}
                  title={`Vehicle Assembly & Slots ${workspaceIndex.configurations.length > 0 ? `(${workspaceIndex.configurations.length})` : ''}`}
                  aria-label="Vehicle Assembly"
                >
                  <AssemblyIcon size={18} />
                  {workspaceIndex.configurations.length > 0 && (
                    <span className="collapsed-badge-dot" />
                  )}
                </button>
              </div>

              <button
                type="button"
                className="collapsed-strip-expand-btn"
                onClick={() => setLeftSidebarOpen(true)}
                title="Expand Primary Sidebar (Ctrl+B)"
                aria-label="Expand Primary Sidebar"
              >
                <ChevronRightIcon size={14} />
              </button>
            </div>
          </aside>
        )}

        {/* Resizer Handle between Left Sidebar and Center */}
        {!isViewportDetached && (
          <div
            className={`resizer-col left-resizer ${leftSidebarOpen ? 'is-open' : 'is-collapsed'}`}
            onPointerDown={leftSidebarOpen ? (e) => handleStartResize('left-sidebar', e) : undefined}
            title={leftSidebarOpen ? "Drag to resize left sidebar" : undefined}
          />
        )}

        {/* Center Main Workspace - Code Editor when Detached, 3D Viewport when Docked */}
        <div className="center-workspace">
          <div className="workspace-surface" style={{ flex: 1, height: '100%', minHeight: 0, minWidth: 0, position: 'relative' }}>
            {isViewportDetached ? (
              renderCodeEditorPanel(true)
            ) : (
              <div className="viewport-container" style={{ width: '100%', height: '100%' }}>
                {renderViewportContent()}
              </div>
            )}
          </div>

          {/* Bottom Panel Resizer Handle */}
          {bottomPanelOpen && (
            <div
              className="resizer-row bottom-resizer"
              onPointerDown={(e) => handleStartResize('bottom-panel', e)}
              title="Drag to resize problems panel"
            />
          )}

          {/* Bottom Panel: Problems & Validation */}
          {bottomPanelOpen && (
            <div className="bottom-panel" style={{ height: `${bottomPanelHeight}px` }}>
              <div className="bottom-panel-header">
                <span className="panel-tab">Problems ({validationResult.problems.length})</span>
                <button
                  onClick={() => setBottomPanelOpen(false)}
                  className="close-panel-btn"
                  title="Close Problems Panel (Ctrl+`)"
                >
                  <CloseIcon size={13} />
                </button>
              </div>
              <div className="bottom-panel-body">
                <ProblemsPanel
                  problems={validationResult.problems}
                  onNavigateToProblem={handleNavigateToProblem}
                  logEntries={gameLogEntries}
                  onLoadLogContent={setGameLogEntries}
                />
              </div>
            </div>
          )}
        </div>

        {/* Resizer Handle between Center and Right Sidebar */}
        <div
          className={`resizer-col right-resizer ${rightSidebarOpen ? 'is-open' : 'is-collapsed'}`}
          onPointerDown={rightSidebarOpen ? (e) => handleStartResize('right-sidebar', e) : undefined}
          title={rightSidebarOpen ? "Drag to resize right sidebar" : undefined}
        />

        {/* Right Sidebar: Files & Assembly when Detached, Inspector & Structure when Docked with Smooth Ease-Out Transition */}
        <aside
          className={`right-sidebar ${rightSidebarOpen ? 'is-expanded' : 'is-collapsed'}`}
          style={{ width: rightSidebarOpen ? `${rightSidebarWidth}px` : '46px' }}
        >
          {/* Full Expanded Sidebar Content */}
          <div
            className="sidebar-pane-expanded"
            style={{ width: `${rightSidebarWidth}px` }}
            aria-hidden={!rightSidebarOpen}
          >
            <div className="sidebar-tabs-bar">
              <button
                onClick={() => setRightSidebarOpen(false)}
                className="sidebar-toggle-close-btn"
                title="Collapse Right Sidebar (Ctrl+J)"
              >
                <ChevronRightIcon size={15} />
              </button>
              <div className="sidebar-tabs">
                {isViewportDetached ? (
                  <>
                    <button
                      onClick={() => setDetachedRightTab('files')}
                      className={`sidebar-tab-btn ${detachedRightTab === 'files' ? 'active' : ''}`}
                      title="Project File Explorer"
                    >
                      <FolderIcon size={17} />
                      <span>Files</span>
                    </button>
                    <button
                      onClick={() => setDetachedRightTab('assembly')}
                      className={`sidebar-tab-btn ${detachedRightTab === 'assembly' ? 'active' : ''}`}
                      title="Vehicle Assembly & Slots"
                    >
                      <AssemblyIcon size={17} />
                      <span>Assembly {workspaceIndex.configurations.length > 0 ? `(${workspaceIndex.configurations.length})` : ''}</span>
                    </button>
                    <button
                      onClick={() => setDetachedRightTab('inspector')}
                      className={`sidebar-tab-btn ${detachedRightTab === 'inspector' ? 'active' : ''}`}
                      title="Element Inspector"
                    >
                      <InspectorIcon size={17} />
                      <span>Inspector</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setRightTab('inspector')}
                      className={`sidebar-tab-btn ${rightTab === 'inspector' ? 'active' : ''}`}
                      title="Element Inspector"
                    >
                      <InspectorIcon size={17} />
                      <span>Inspector</span>
                    </button>
                    <button
                      onClick={() => setRightTab('structure')}
                      className={`sidebar-tab-btn ${rightTab === 'structure' ? 'active' : ''}`}
                      title="Structure Tree"
                    >
                      <StructureIcon size={17} />
                      <span>Structure ({nodeCount})</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="sidebar-content">
              {isViewportDetached ? (
                detachedRightTab === 'files'
                  ? renderProjectFiles()
                  : detachedRightTab === 'assembly'
                  ? renderAssemblyManager()
                  : detachedRightTab === 'inspector'
                  ? renderInspector()
                  : renderStructureTree()
              ) : (
                rightTab === 'inspector'
                  ? renderInspector()
                  : renderStructureTree()
              )}
            </div>
          </div>

          {/* Collapsed Activity Strip */}
          <div
            className="collapsed-sidebar-strip right-collapsed-strip"
            title="Secondary Sidebar"
            aria-hidden={rightSidebarOpen}
          >
            <div className="collapsed-strip-items">
              {isViewportDetached ? (
                <>
                  <button
                    className={`collapsed-tab-btn ${detachedRightTab === 'files' ? 'active' : ''}`}
                    onClick={() => {
                      setDetachedRightTab('files');
                      setRightSidebarOpen(true);
                    }}
                    title="Project Files Explorer"
                    aria-label="Project Files"
                  >
                    <FolderIcon size={18} />
                  </button>
                  <button
                    className={`collapsed-tab-btn ${detachedRightTab === 'assembly' ? 'active' : ''}`}
                    onClick={() => {
                      setDetachedRightTab('assembly');
                      setRightSidebarOpen(true);
                    }}
                    title="Vehicle Assembly & Slots"
                    aria-label="Vehicle Assembly"
                  >
                    <AssemblyIcon size={18} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    className={`collapsed-tab-btn ${rightTab === 'inspector' ? 'active' : ''}`}
                    onClick={() => {
                      setRightTab('inspector');
                      setRightSidebarOpen(true);
                    }}
                    title="Element Inspector"
                    aria-label="Element Inspector"
                  >
                    <InspectorIcon size={18} />
                  </button>
                  <button
                    className={`collapsed-tab-btn ${rightTab === 'structure' ? 'active' : ''}`}
                    onClick={() => {
                      setRightTab('structure');
                      setRightSidebarOpen(true);
                    }}
                    title={`Structure Tree (${nodeCount} nodes)`}
                    aria-label="Structure Tree"
                  >
                    <StructureIcon size={18} />
                  </button>
                </>
              )}
            </div>

            <button
              type="button"
              className="collapsed-strip-expand-btn"
              onClick={() => setRightSidebarOpen(true)}
              title="Expand Secondary Sidebar (Ctrl+J)"
              aria-label="Expand Secondary Sidebar"
            >
              <ChevronLeftIcon size={14} />
            </button>
          </div>
        </aside>
      </div>

      {/* Bottom Status Bar */}
      <StatusBar
        activeFile={activeTab}
        problems={validationResult.problems}
        nodeCount={nodeCount}
        beamCount={beamCount}
        triangleCount={triangleCount}
        quadCount={quadCount}
        cursorPos={cursorPos}
        bottomPanelOpen={bottomPanelOpen}
        onToggleBottomPanel={() => setBottomPanelOpen(prev => !prev)}
        simStatus={simStatus}
        onToggleSimConnection={toggleSimConnection}
        onReloadVehicleInSim={handleReloadActiveVehicle}
      />

      {/* New Vehicle Mod Project Wizard Modal */}
      <NewVehicleModal
        isOpen={isNewVehicleModalOpen}
        onClose={() => setIsNewVehicleModalOpen(false)}
        currentWorkspacePath={workspacePath}
        discoveredDaeFiles={discoveredDaeFiles}
        onVehicleCreated={handleVehicleProjectCreated}
      />

      {/* Blueprint Reference Image Calibration Modal */}
      <BlueprintOverlayModal
        isOpen={blueprintModalOpen}
        onClose={() => setBlueprintModalOpen(false)}
        blueprintConfig={blueprintConfig}
        onChangeBlueprintConfig={setBlueprintConfig}
      />

      {/* Wavefront OBJ <-> JBeam Converter Modal */}
      <ObjConverterModal
        isOpen={objModalOpen}
        onClose={() => setObjModalOpen(false)}
        activePartData={activeViewportParts ? Object.values(activeViewportParts).filter(p => p && typeof p === 'object')[0] : null}
        onImportJBeamText={(importedText, pName) => openContentAsTab(`${pName || 'imported'}.jbeam`, `${pName || 'imported'}.jbeam`, importedText)}
      />

      {/* Unsaved Changes Confirmation Dialog */}
      {unsavedModalTab && (
        <div className="blueprint-modal-backdrop" onClick={handleCancelClose}>
          <div className="bng-dialog-card" onClick={(e) => e.stopPropagation()}>
            <div className="bng-dialog-header">
              <span className="bng-dialog-title">Unsaved Changes</span>
              <button
                type="button"
                onClick={handleCancelClose}
                className="bng-dialog-close-btn"
                title="Cancel (Esc)"
              >
                <CloseIcon size={12} />
              </button>
            </div>
            <div className="bng-dialog-body">
              <p className="bng-dialog-message">
                Do you want to save the changes you made to <strong>{unsavedModalTab.title}</strong>?
              </p>
              <p className="bng-dialog-subtext">
                Your changes will be lost if you close this file without saving.
              </p>
            </div>
            <div className="bng-dialog-actions">
              <button
                type="button"
                className="bng-btn danger"
                onClick={handleDiscardAndClose}
              >
                Don't Save
              </button>
              <button
                type="button"
                className="bng-btn secondary"
                onClick={handleCancelClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="bng-btn primary"
                onClick={handleConfirmSaveAndClose}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
