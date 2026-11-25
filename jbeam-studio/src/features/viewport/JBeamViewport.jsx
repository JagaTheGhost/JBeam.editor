import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { beamngToThree, threeToBeamng, getSymmetricNodeId } from './coordinateUtils.js';
import {
  buildNodesGroup,
  buildNodeLabelsGroup,
  buildBeamsGroup,
  buildTrianglesGroup,
  computeConnectedTopology,
  buildMountingJointsGroup,
  buildCodeHoverGroup,
  buildEnvironmentGroup,
  buildFrontIndicatorGroup,
  extractNodeCoords,
  calculateNodeMassStats,
  calculateBeamStiffnessStats,
  calculateBeamDeformStats,
  calculateBeamStrengthStats,
  countVehicleElementTypes,
  BEAM_TYPE_COLORS
} from './visualizers.js';
import { resolveFlexbodyAssociations } from '../jbeam/flexbodyUtils.js';
import {
  SelectIcon,
  BoxSelectIcon,
  NodeIcon,
  BeamIcon,
  TriangleIcon,
  QuadIcon,
  TrashIcon,
  SnapIcon,
  SymmetryIcon,
  PaletteIcon,
  FocusIcon,
  MeshIcon,
  SubdivideIcon,
  GhostIcon,
  WireframeIcon,
  WarningIcon,
  InfoIcon,
  CloseIcon,
  FileIcon,
  AssemblyIcon,
  TagIcon,
  CompassIcon,
  WheelIcon,
  CenterOfGravityIcon,
  ExtrudeIcon,
  LayersIcon,
  EyeIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FilterIcon,
  CheckIcon,
  BlueprintIcon,
  ObjModelIcon,
  PowertrainIcon,
  MechanicalIcon,
  UndoIcon,
  RedoIcon,
  LinkIcon,
  JointIcon,
  PopoutIcon,
  CubeIcon,
  SlidersIcon
} from '../../components/Icons.jsx';
import CustomSelect from '../../components/CustomSelect.jsx';
import NumberStepper from '../../components/NumberStepper.jsx';
import { detectAllMirrorPlanes } from '../jbeam/symmetryUtils.js';
import { formatBatchNodeName } from '../jbeam/batchRenamer.js';
import VisualMeshManager from './ColladaMeshManager.js';
import { buildBlueprintMesh } from './blueprintManager.js';
import { buildGhostWheelsGroup, DEFAULT_WHEEL_CONFIG } from './wheelVisualizer.js';
import { buildPressureWheelsGroup } from './pressureWheelVisualizer.js';
import { extractPressureWheels } from '../jbeam/pressureWheelsParser.js';
import { buildTorsionBarsGroup, buildSlideNodesGroup } from './suspensionVisualizer.js';
import { extractTorsionBars, extractRailsAndSlideNodes } from '../jbeam/suspensionPhysicsParser.js';
import { calculateMassProperties, buildCogMarkerGroup } from './cogCalculator.js';
import { calculateAerodynamics, buildAeroVisualizerGroup } from './aeroCalculator.js';
import { extractRefNodes, extractCamerasInternal } from '../jbeam/vehicleFrameParser.js';
import { buildRefNodesGroup, buildCameraFrustumGroup } from './vehicleFrameVisualizer.js';
import { extractCrashZones, getCrashGroupColor } from '../jbeam/crashZonesParser.js';
import BlenderOrientationGizmo from './BlenderOrientationGizmo.jsx';
import {
  extractSymmetricBaseName,
  derivePartFamily,
  computeEffectiveColorModes,
  computeHideUnhideAllToggle,
  computeSubmeshIsolationConfig
} from './componentFamilyUtils.js';

export const BEAM_PRESETS = {
  standard: {
    id: 'standard',
    label: 'Standard Chassis (2MN/m)',
    properties: { beamSpring: 2001000, beamDamp: 200, beamDeform: 35000, beamStrength: 150000 }
  },
  rigid: {
    id: 'rigid',
    label: 'Rigid Structural (8MN/m)',
    properties: { beamSpring: 8001000, beamDamp: 800, beamDeform: 80000, beamStrength: 'FLT_MAX' }
  },
  support: {
    id: 'support',
    label: 'Support Anti-Inversion',
    properties: { beamPrecompression: 0.95, beamType: '|SUPPORT', beamLongBound: 1 }
  },
  light: {
    id: 'light',
    label: 'Light Body Panel (800kN/m)',
    properties: { beamSpring: 801000, beamDamp: 80, beamDeform: 15000, beamStrength: 80000 }
  },
  mount_hinge: {
    id: 'mount_hinge',
    label: 'Mount: Hinge / Pivot (1.5MN)',
    properties: { beamSpring: 1501000, beamDamp: 150, beamDeform: 28000, beamStrength: 65000, optional: true }
  },
  mount_bolt: {
    id: 'mount_bolt',
    label: 'Mount: Rigid Bolt (3.5MN)',
    properties: { beamSpring: 3501000, beamDamp: 250, beamDeform: 45000, beamStrength: 95000, optional: true }
  },
  mount_latch: {
    id: 'mount_latch',
    label: 'Mount: Breakable Latch (0.8MN)',
    properties: { beamSpring: 801000, beamDamp: 100, beamDeform: 12000, beamStrength: 25000, optional: true }
  },
  inherit: {
    id: 'inherit',
    label: 'Default (Inherit)',
    properties: {}
  }
};

export const VIEWPORT_BG_PRESETS = {
  editorGray: {
    id: 'editorGray',
    label: 'Editor Gray',
    hex: '#1e2127',
    threeColor: 0x1e2127,
    description: 'Matches the main editor dark gray theme (Default)'
  },
  themeCharcoal: {
    id: 'themeCharcoal',
    label: 'Charcoal',
    hex: '#1a1a1a',
    threeColor: 0x1a1a1a,
    description: 'Matches the main UI panels and sidebar background'
  },
  blenderSlate: {
    id: 'blenderSlate',
    label: 'CAD Slate',
    hex: '#282c34',
    threeColor: 0x282c34,
    description: 'Blender & CAD style neutral gray'
  },
  deepBlack: {
    id: 'deepBlack',
    label: 'Pitch Black',
    hex: '#0d0e11',
    threeColor: 0x0d0e11,
    description: 'High-contrast OLED pitch black'
  }
};

const GRID_SNAP_STEPS = [0.05, 0.1, 0.25, 0.5, 0];

export function JBeamViewport({
  jbeamParts,
  selectedNodeId,
  selectedBeamKey,
  selectedBeamInfo,
  selectedSurfaceInfo = null,
  selectedWheelInfo = null,
  selectedTorsionBarInfo = null,
  selectedSlideNodeInfo = null,
  onSelectNode,
  onSelectBeam,
  onSelectSurface = null,
  onSelectWheel = null,
  onSelectTorsionBar = null,
  onSelectSlideNode = null,
  onNodeMoved,
  onLiveNodeMove,
  symmetryEnabled = true,
  onToggleSymmetry,
  activeTool = 'select',
  onToolChange,
  gridSnap = 0.1,
  onGridSnapChange,
  onAddNode,
  onAddBeam,
  onAddTriangle,
  onAddQuad = null,
  onSubdivideBeam,
  onQuickConnect = null,
  onExtrudeNodes = null,
  onDetectMirrorPlanes = null,
  onDeleteSelected,
  codeHoveredElement = null,
  codeSelectedElements = null,
  nonActiveViewType = 'ghost',
  onChangeNonActiveViewType = null,
  multiSelectedNodes: propMultiSelectedNodes = null,
  onMultiSelectChange = null,
  visualMeshDaeText = null,
  visualMeshName = null,
  onLoadVisualMesh = null,
  onUnloadVisualMesh = null,
  discoveredDaeFiles = [],
  selectedDaePath = '',
  onSelectProjectDae = null,
  onOpenDaeDialog = null,
  highlightedSubmesh = null,
  onHighlightSubmesh = null,
  onUpdateSubmeshNames = null,
  onUpdateSubmeshDetails = null,
  spawnedMeshNames = null,
  isMeshesTabActive = false,
  isMechanicalTabActive = false,
  focusCameraTrigger = null,
  onOpenMechanicalWorkspace = null,
  meshOpacity: propMeshOpacity = null,
  onMeshOpacityChange = null,
  meshWireframe: propMeshWireframe = null,
  onMeshWireframeChange = null,
  isolateMatchingMesh = true,
  onToggleIsolateMesh = null,
  viewportSource = 'activeDocument',
  hasAssembly = false,
  compositeVehicleParts = null,
  onChangeViewportSource = null,
  batchRenamePattern = '#fl',
  batchRenameIndex = 1,
  onBatchRenameNode = null,
  onUpdateBatchRenamePattern = null,
  onUpdateBatchRenameIndex = null,
  lastRenamedFeedback = null,
  onChangeBeamType = null,
  blueprintConfig = null,
  onOpenBlueprintModal = null,
  onOpenObjModal = null,
  onUndo = null,
  onRedo = null,
  onAutoLinkMounts = null,
  nodeCollisionCount = 0,
  collidingNodes = [],
  suggestedPrefix = '',
  onPrefixActiveNodes = null,
  openTabsBackgroundParts = null,
  multiPartFeedback = null,
  onDismissMultiPartFeedback = null,
  hoverFocusDimming = true,
  mechanicalKinematicsPreview = null,
  onDetachViewport = null
}) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const orbitControlsRef = useRef(null);
  const transformControlsRef = useRef(null);
  const multiSelectPivotRef = useRef(new THREE.Object3D());
  const multiDragStateRef = useRef({ pivotStart: null, nodeStarts: new Map(), mirrorStarts: new Map() });
  const isTransformInteractingRef = useRef(false);
  const blueprintGroupRef = useRef(null);
  const blueprintTexturesRef = useRef({});
  const isTransformDraggingRef = useRef(false);
  const justFinishedTransformDragRef = useRef(0);
  const structureGroupRef = useRef(null);
  const nodesGroupRef = useRef(null);
  const beamsGroupRef = useRef(null);
  const surfacesGroupRef = useRef(null);
  const frontIndicatorGroupRef = useRef(null);
  const mountingJointsGroupRef = useRef(null);
  const nodePosMapRef = useRef(new Map());

  // Callback Refs to prevent stale closures during pointer event handling
  const jbeamPartsRef = useRef(jbeamParts);
  useEffect(() => { jbeamPartsRef.current = jbeamParts; }, [jbeamParts]);

  const onChangeBeamTypeRef = useRef(onChangeBeamType);
  useEffect(() => { onChangeBeamTypeRef.current = onChangeBeamType; }, [onChangeBeamType]);

  const onNodeMovedRef = useRef(onNodeMoved);
  useEffect(() => { onNodeMovedRef.current = onNodeMoved; }, [onNodeMoved]);

  const onLiveNodeMoveRef = useRef(onLiveNodeMove);
  useEffect(() => { onLiveNodeMoveRef.current = onLiveNodeMove; }, [onLiveNodeMove]);

  const onAddNodeRef = useRef(onAddNode);
  useEffect(() => { onAddNodeRef.current = onAddNode; }, [onAddNode]);

  const onAddBeamRef = useRef(onAddBeam);
  useEffect(() => { onAddBeamRef.current = onAddBeam; }, [onAddBeam]);

  const onAddTriangleRef = useRef(onAddTriangle);
  useEffect(() => { onAddTriangleRef.current = onAddTriangle; }, [onAddTriangle]);

  const onAddQuadRef = useRef(onAddQuad);
  useEffect(() => { onAddQuadRef.current = onAddQuad; }, [onAddQuad]);

  const onSubdivideBeamRef = useRef(onSubdivideBeam);
  useEffect(() => { onSubdivideBeamRef.current = onSubdivideBeam; }, [onSubdivideBeam]);

  const onQuickConnectRef = useRef(onQuickConnect);
  useEffect(() => { onQuickConnectRef.current = onQuickConnect; }, [onQuickConnect]);

  const onExtrudeNodesRef = useRef(onExtrudeNodes);
  useEffect(() => { onExtrudeNodesRef.current = onExtrudeNodes; }, [onExtrudeNodes]);

  const onSelectNodeRef = useRef(onSelectNode);
  useEffect(() => { onSelectNodeRef.current = onSelectNode; }, [onSelectNode]);

  const onSelectBeamRef = useRef(onSelectBeam);
  useEffect(() => { onSelectBeamRef.current = onSelectBeam; }, [onSelectBeam]);

  const onSelectSurfaceRef = useRef(onSelectSurface);
  useEffect(() => { onSelectSurfaceRef.current = onSelectSurface; }, [onSelectSurface]);

  const onSelectWheelRef = useRef(onSelectWheel);
  useEffect(() => { onSelectWheelRef.current = onSelectWheel; }, [onSelectWheel]);

  const onSelectTorsionBarRef = useRef(onSelectTorsionBar);
  useEffect(() => { onSelectTorsionBarRef.current = onSelectTorsionBar; }, [onSelectTorsionBar]);

  const onSelectSlideNodeRef = useRef(onSelectSlideNode);
  useEffect(() => { onSelectSlideNodeRef.current = onSelectSlideNode; }, [onSelectSlideNode]);

  const onDeleteSelectedRef = useRef(onDeleteSelected);
  useEffect(() => { onDeleteSelectedRef.current = onDeleteSelected; }, [onDeleteSelected]);

  const selectedNodeIdRef = useRef(selectedNodeId);
  useEffect(() => { selectedNodeIdRef.current = selectedNodeId; }, [selectedNodeId]);

  const selectedBeamInfoRef = useRef(selectedBeamInfo);
  useEffect(() => { selectedBeamInfoRef.current = selectedBeamInfo; }, [selectedBeamInfo]);

  const selectedBeamKeyRef = useRef(selectedBeamKey);
  useEffect(() => { selectedBeamKeyRef.current = selectedBeamKey; }, [selectedBeamKey]);

  const selectedSurfaceInfoRef = useRef(selectedSurfaceInfo);
  useEffect(() => { selectedSurfaceInfoRef.current = selectedSurfaceInfo; }, [selectedSurfaceInfo]);

  const onBatchRenameNodeRef = useRef(onBatchRenameNode);
  useEffect(() => { onBatchRenameNodeRef.current = onBatchRenameNode; }, [onBatchRenameNode]);

  const batchRenamePatternRef = useRef(batchRenamePattern);
  useEffect(() => { batchRenamePatternRef.current = batchRenamePattern; }, [batchRenamePattern]);

  const batchRenameIndexRef = useRef(batchRenameIndex);
  useEffect(() => { batchRenameIndexRef.current = batchRenameIndex; }, [batchRenameIndex]);

  const onHighlightSubmeshRef = useRef(onHighlightSubmesh);
  useEffect(() => { onHighlightSubmeshRef.current = onHighlightSubmesh; }, [onHighlightSubmesh]);

  // Face Orientation (Blender Style Blue/Red) and Normal Vectors
  const [faceOrientation, setFaceOrientation] = useState(false);
  const [showNormals, setShowNormals] = useState(false);

  // Interactive Tools State
  const activeToolRef = useRef(activeTool);
  const symmetryEnabledRef = useRef(symmetryEnabled);
  const gridSnapRef = useRef(gridSnap);
  const [internalTool, setInternalTool] = useState(activeTool);
  const [internalGridSnap, setInternalGridSnap] = useState(gridSnap);
  const [beamPreset, setBeamPreset] = useState('standard');
  const beamPresetRef = useRef('standard');

  const [pendingBeamStart, setPendingBeamStart] = useState(null);
  const pendingBeamStartRef = useRef(null);
  const [pendingTriNodes, setPendingTriNodes] = useState([]);
  const pendingTriNodesRef = useRef([]);
  const [pendingQuadNodes, setPendingQuadNodes] = useState([]);
  const pendingQuadNodesRef = useRef([]);

  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const hoveredNodeIdRef = useRef(null);
  const [hoveredNodeInfo, setHoveredNodeInfo] = useState(null);
  const hoveredNodeInfoRef = useRef(null);
  const hoveredBeamRef = useRef(null);
  const [hoveredBeamInfo, setHoveredBeamInfo] = useState(null);
  const pointerDownPosRef = useRef({ x: 0, y: 0 });
  const [cursorCoords, setCursorCoords] = useState(null);
  const [beamLength, setBeamLength] = useState(null);
  const viewPresetRef = useRef('iso');
  const daeInputRef = useRef(null);

  // Option 3: Visual Mesh (.dae) Overlay Manager & State
  const visualMeshManagerRef = useRef(null);
  if (!visualMeshManagerRef.current) {
    visualMeshManagerRef.current = new VisualMeshManager();
  }
  const [meshVisible, setMeshVisible] = useState(true);
  const [internalMeshWireframe, setInternalMeshWireframe] = useState(false);
  const meshWireframe = propMeshWireframe !== null ? propMeshWireframe : internalMeshWireframe;
  const setMeshWireframe = onMeshWireframeChange || setInternalMeshWireframe;

  const [internalMeshOpacity, setInternalMeshOpacity] = useState(0.45);
  const meshOpacity = propMeshOpacity !== null ? propMeshOpacity : internalMeshOpacity;
  const setMeshOpacity = onMeshOpacityChange || setInternalMeshOpacity;
  const [meshStats, setMeshStats] = useState(null);
  const [internalIsolateMesh, setInternalIsolateMesh] = useState(true);

  // DAE Magnetic Vertex Snapping State (Mutually exclusive with Grid Snap)
  const [snapToMeshVertex, setSnapToMeshVertex] = useState(false);
  const snapToMeshVertexRef = useRef(false);
  useEffect(() => { snapToMeshVertexRef.current = snapToMeshVertex; }, [snapToMeshVertex]);

  // Combined Snap Mode: 'grid' or 'dae'
  const [snapMode, setSnapMode] = useState('grid');
  const snapModeRef = useRef('grid');
  useEffect(() => { snapModeRef.current = snapMode; }, [snapMode]);

  const handleToggleSnapMode = useCallback(() => {
    setSnapMode(prev => {
      const next = prev === 'grid' ? 'dae' : 'grid';
      snapModeRef.current = next;
      if (next === 'dae') {
        // Activate DAE snap and disable grid snap
        setSnapToMeshVertex(true);
        snapToMeshVertexRef.current = true;
        setInternalGridSnap(0);
        gridSnapRef.current = 0;
        if (onGridSnapChange) onGridSnapChange(0);
      } else {
        // Activate Grid snap (restore 0.1m) and disable DAE snap
        setSnapToMeshVertex(false);
        snapToMeshVertexRef.current = false;
        const restored = 0.1;
        setInternalGridSnap(restored);
        gridSnapRef.current = restored;
        if (onGridSnapChange) onGridSnapChange(restored);
      }
      return next;
    });
  }, [onGridSnapChange]);

  const handleToggleDaeSnapValue = useCallback(() => {
    setSnapToMeshVertex(prev => {
      const next = !prev;
      snapToMeshVertexRef.current = next;
      if (next) {
        setInternalGridSnap(0);
        gridSnapRef.current = 0;
        if (onGridSnapChange) onGridSnapChange(0);
      }
      return next;
    });
  }, [onGridSnapChange]);

  const handleToggleDaeSnap = handleToggleDaeSnapValue;

  // Multi-Node Selection State (Blender Shift-Click & Box Marquee support)
  const [internalMultiSelectedNodes, setInternalMultiSelectedNodes] = useState([]);
  const multiSelectedNodes = propMultiSelectedNodes !== null ? propMultiSelectedNodes : internalMultiSelectedNodes;
  const setMultiSelectedNodes = useCallback((valOrFn) => {
    if (onMultiSelectChange) {
      if (typeof valOrFn === 'function') {
        onMultiSelectChange(valOrFn(multiSelectedNodesRef.current));
      } else {
        onMultiSelectChange(valOrFn);
      }
    }
    setInternalMultiSelectedNodes(valOrFn);
  }, [onMultiSelectChange]);

  const multiSelectedNodesRef = useRef([]);
  useEffect(() => { multiSelectedNodesRef.current = multiSelectedNodes; }, [multiSelectedNodes]);

  // Marquee Box Selection & Code Hover Overlay
  const [marqueeBox, setMarqueeBox] = useState(null);
  const isBoxSelectingRef = useRef(false);
  const codeHoverGroupRef = useRef(null);

  // PCA Symmetry Plane Detection Feedback
  const [mirrorPlaneFeedback, setMirrorPlaneFeedback] = useState(null);

  // Ghost Wheels, PressureWheels & Center of Gravity (CoG) Fitment State
  const [showPressureWheels, setShowPressureWheels] = useState(true);
  const [showGhostWheels, setShowGhostWheels] = useState(false);
  const [showCogMarker, setShowCogMarker] = useState(false);
  const [showTorsionBars, setShowTorsionBars] = useState(true);
  const [showSlideNodes, setShowSlideNodes] = useState(true);
  const [showAeroCoP, setShowAeroCoP] = useState(false);
  const [showAeroVectors, setShowAeroVectors] = useState(false);
  const [aeroStats, setAeroStats] = useState(null);
  const [showRefNodes, setShowRefNodes] = useState(false);
  const [showCamerasInternal, setShowCamerasInternal] = useState(false);
  const [refNodesData, setRefNodesData] = useState(null);
  const [camerasData, setCamerasData] = useState([]);
  const [viewportNodes, setViewportNodes] = useState({});
  const pressureWheelsGroupRef = useRef(null);
  const torsionBarsGroupRef = useRef(null);
  const slideNodesGroupRef = useRef(null);
  const aeroGroupRef = useRef(null);
  const refNodesGroupRef = useRef(null);
  const camerasGroupRef = useRef(null);
  const [showHeatmapsDropdown, setShowHeatmapsDropdown] = useState(false);
  const heatmapsMenuRef = useRef(null);
  const [showPhysicsMenu, setShowPhysicsMenu] = useState(false);
  const physicsMenuRef = useRef(null);
  const [showViewMenu, setShowViewMenu] = useState(false);
  const viewMenuRef = useRef(null);

  // Connected Topology Focus (Neighborhood X-Ray)
  const [focusConnectedTopology, setFocusConnectedTopology] = useState(true);
  const focusConnectedTopologyRef = useRef(focusConnectedTopology);
  useEffect(() => { focusConnectedTopologyRef.current = focusConnectedTopology; }, [focusConnectedTopology]);
  const focusStatsRef = useRef(null);

  // 3D View Mode Dropdown State
  const [showViewModeDropdown, setShowViewModeDropdown] = useState(false);
  const viewModeMenuRef = useRef(null);

  // Multi-Part Clash Inspector Popover & 3D Highlight Toggle
  const [showClashPopover, setShowClashPopover] = useState(false);
  const [highlightClashesIn3D, setHighlightClashesIn3D] = useState(false);
  const clashMenuRef = useRef(null);

  // DAE Visual Mesh Dropdown State
  const [showDaeDropdown, setShowDaeDropdown] = useState(false);
  const daeMenuRef = useRef(null);

  // Viewport Canvas Background Tone (defaults to theme-matching 'editorGray')
  const [viewportBg, setViewportBg] = useState(() => {
    try {
      return localStorage.getItem('jbeam_viewport_bg') || 'editorGray';
    } catch {
      return 'editorGray';
    }
  });

  // Synchronize Scene Background with Selected Preset
  useEffect(() => {
    const preset = VIEWPORT_BG_PRESETS[viewportBg] || VIEWPORT_BG_PRESETS.editorGray;
    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(preset.threeColor);
    }
    if (rendererRef.current) {
      rendererRef.current.setClearColor(preset.threeColor, 1);
    }
    if (containerRef.current) {
      containerRef.current.style.backgroundColor = preset.hex;
    }
    try {
      localStorage.setItem('jbeam_viewport_bg', viewportBg);
    } catch {
      // ignore
    }
  }, [viewportBg]);

  // Synchronize across detached & main windows
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'jbeam_viewport_bg' && e.newValue && VIEWPORT_BG_PRESETS[e.newValue]) {
        setViewportBg(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (heatmapsMenuRef.current && !heatmapsMenuRef.current.contains(e.target)) {
        setShowHeatmapsDropdown(false);
      }
      if (physicsMenuRef.current && !physicsMenuRef.current.contains(e.target)) {
        setShowPhysicsMenu(false);
      }
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target)) {
        setShowViewMenu(false);
      }
      if (viewModeMenuRef.current && !viewModeMenuRef.current.contains(e.target)) {
        setShowViewModeDropdown(false);
      }
      if (daeMenuRef.current && !daeMenuRef.current.contains(e.target)) {
        setShowDaeDropdown(false);
      }
      if (clashMenuRef.current && !clashMenuRef.current.contains(e.target)) {
        setShowClashPopover(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowHeatmapsDropdown(false);
        setShowPhysicsMenu(false);
        setShowViewMenu(false);
        setShowViewModeDropdown(false);
        setShowDaeDropdown(false);
        setShowClashPopover(false);
      }
    };
    if (showHeatmapsDropdown || showPhysicsMenu || showViewMenu || showViewModeDropdown || showDaeDropdown || showClashPopover) {
      document.addEventListener('pointerdown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('pointerdown', handleOutsideClick);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [showHeatmapsDropdown, showPhysicsMenu, showViewMenu, showViewModeDropdown, showDaeDropdown, showClashPopover]);

  const [massStats, setMassStats] = useState({
    totalMassKg: 0,
    totalMassLbs: 0,
    frontWeightPercent: 50,
    rearWeightPercent: 50,
    leftWeightPercent: 50,
    rightWeightPercent: 50
  });

  const effectiveIsolateMesh = isolateMatchingMesh !== undefined ? isolateMatchingMesh : internalIsolateMesh;
  const handleToggleIsolate = onToggleIsolateMesh || (() => setInternalIsolateMesh(v => !v));

  // Resolve which nodes belong to the currently highlighted flexbody submesh
  const highlightedFlexbodyNodeIds = useMemo(() => {
    if (!highlightedSubmesh || !jbeamParts) return new Set();
    const resolved = resolveFlexbodyAssociations(jbeamParts);
    const boundNodes = resolved.getBoundNodesForMesh(highlightedSubmesh);
    return new Set(boundNodes);
  }, [highlightedSubmesh, jbeamParts]);

  // Merge external context parts from workspace assembly + other open tabs (excluding currently active/shown parts)
  // Used both for PressureWheels inheritance across folders/standalone tabs and cross-part virtual beams
  const externalWheelContextParts = useMemo(() => {
    const merged = {};
    const addSource = (src) => {
      if (!src || typeof src !== 'object') return;
      for (const pKey of Object.keys(src)) {
        if (pKey === '__meta' || (jbeamParts && jbeamParts[pKey])) continue;
        merged[pKey] = src[pKey];
      }
    };
    addSource(compositeVehicleParts);
    addSource(openTabsBackgroundParts);
    return merged;
  }, [compositeVehicleParts, openTabsBackgroundParts, jbeamParts]);

  // Extract external nodes from external context parts for cross-part virtual beams & wheel spindle lookup
  const externalNodes = useMemo(() => {
    const map = {};
    for (const pKey of Object.keys(externalWheelContextParts)) {
      const part = externalWheelContextParts[pKey];
      if (part?.nodes) {
        for (const nKey of Object.keys(part.nodes).filter(k => k !== '__meta')) {
          map[nKey] = part.nodes[nKey];
        }
      }
    }
    return map;
  }, [externalWheelContextParts]);

  // Statistics for floating 3D Heatmap Legend HUD
  const heatmapStats = useMemo(() => {
    const partKeys = jbeamParts ? Object.keys(jbeamParts).filter(k => k !== '__meta') : [];
    if (partKeys.length === 0) {
      return {
        mass: { min: '0.0 kg', mid: '0.0 kg', max: '0.0 kg' },
        stiffness: { min: '0 N/m', mid: '0 N/m', max: '0 N/m' },
        deform: { min: '0N', mid: '0N', max: '0N' },
        strength: { min: '0N', mid: '0N', max: '0N' }
      };
    }
    const allNodes = {};
    const allBeams = {};
    for (const pKey of partKeys) {
      const p = jbeamParts[pKey];
      if (p?.nodes) Object.assign(allNodes, p.nodes);
      if (p?.beams) Object.assign(allBeams, p.beams);
    }
    if (Object.keys(allNodes).length === 0 && Object.keys(allBeams).length === 0) {
      return {
        mass: { min: '0.0 kg', mid: '0.0 kg', max: '0.0 kg' },
        stiffness: { min: '0 N/m', mid: '0 N/m', max: '0 N/m' },
        deform: { min: '0N', mid: '0N', max: '0N' },
        strength: { min: '0N', mid: '0N', max: '0N' }
      };
    }
    const m = calculateNodeMassStats(allNodes);
    const s = calculateBeamStiffnessStats(allBeams);
    const d = calculateBeamDeformStats(allBeams);
    const str = calculateBeamStrengthStats(allBeams);

    const formatSpring = (val) => {
      if (val >= 1e6) return `${(val / 1e6).toFixed(1)}M N/m`;
      if (val >= 1e3) return `${Math.round(val / 1e3)}k N/m`;
      return `${Math.round(val)} N/m`;
    };

    const formatDeform = (val) => {
      if (val >= 1e6) return `${(val / 1e6).toFixed(1)}MN`;
      if (val >= 1e3) return `${Math.round(val / 1e3)}kN`;
      return `${Math.round(val)}N`;
    };

    return {
      mass: {
        min: `${m.minWeight.toFixed(1)} kg`,
        mid: `${((m.minWeight + m.maxWeight) / 2).toFixed(1)} kg`,
        max: `${m.maxWeight.toFixed(1)} kg`
      },
      stiffness: {
        min: formatSpring(s.minSpring),
        mid: formatSpring(Math.pow(10, (Math.log10(s.minSpring) + Math.log10(s.maxSpring)) / 2)),
        max: formatSpring(s.maxSpring)
      },
      deform: {
        min: formatDeform(d.minDeform),
        mid: formatDeform((d.minDeform + d.maxDeform) / 2),
        max: formatDeform(d.maxDeform)
      },
      strength: {
        min: formatDeform(str.minStrength),
        mid: formatDeform((str.minStrength + str.maxStrength) / 2),
        max: formatDeform(str.maxStrength)
      }
    };
  }, [jbeamParts]);

  // Overlay preview meshes
  const ghostMeshRef = useRef(null);
  const mirrorGhostMeshRef = useRef(null);
  const snapRingRef = useRef(null);
  const rubberBandLineRef = useRef(null);
  const triPreviewMeshRef = useRef(null);
  const normalArrowRef = useRef(null);

  useEffect(() => {
    activeToolRef.current = activeTool || internalTool;
    setInternalTool(activeTool || internalTool);
  }, [activeTool, internalTool]);

  useEffect(() => {
    symmetryEnabledRef.current = symmetryEnabled;
  }, [symmetryEnabled]);

  useEffect(() => {
    if (gridSnap !== undefined) {
      gridSnapRef.current = gridSnap;
      setInternalGridSnap(gridSnap);
    }
  }, [gridSnap]);

  useEffect(() => {
    if (transformControlsRef.current) {
      const snapVal = !snapToMeshVertex && internalGridSnap > 0 ? internalGridSnap : null;
      transformControlsRef.current.setTranslationSnap(snapVal);
    }
  }, [internalGridSnap, snapToMeshVertex]);

  useEffect(() => {
    beamPresetRef.current = beamPreset;
  }, [beamPreset]);

  useEffect(() => {
    pendingBeamStartRef.current = pendingBeamStart;
  }, [pendingBeamStart]);

  useEffect(() => {
    pendingTriNodesRef.current = pendingTriNodes;
  }, [pendingTriNodes]);

  const [visibility, setVisibility] = useState({
    nodes: true,
    beams: true,
    triangles: true,
    labels: false,
    grid: true
  });
  const [viewPreset, setViewPreset] = useState('iso');
  const [isPanMode, setIsPanMode] = useState(false);
  const isPanModeRef = useRef(false);

  useEffect(() => {
    isPanModeRef.current = isPanMode;
    const orbitControls = orbitControlsRef.current;
    if (orbitControls) {
      orbitControls.mouseButtons.LEFT = isPanMode ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    }
  }, [isPanMode]);
  const [colorMode, setColorMode] = useState('default'); // 'default' (Normal creation view) or 'type' (physics classification)
  const [activeCrashGroup, setActiveCrashGroup] = useState(null);
  const [crashGroupType, setCrashGroupType] = useState('all'); // 'all', 'breakGroup', 'deformGroup'
  const crashZones = useMemo(() => extractCrashZones(jbeamParts), [jbeamParts]);

  // Smart Context-Aware Physics Detection across loaded parts
  const detectedPhysics = useMemo(() => {
    if (!jbeamParts || typeof jbeamParts !== 'object') {
      return {
        wheelCount: 0,
        torsionBarCount: 0,
        hasRailsOrSlideNodes: false,
        hasRefNodes: false,
        cameraCount: 0,
        hasAero: false
      };
    }
    let wheelCount = 0;
    let torsionBarCount = 0;
    let hasRailsOrSlideNodes = false;
    try {
      const wheels = extractPressureWheels(jbeamParts, externalWheelContextParts);
      wheelCount = wheels ? wheels.length : 0;
    } catch {}
    try {
      const tbars = extractTorsionBars(jbeamParts);
      torsionBarCount = tbars ? tbars.length : 0;
    } catch {}
    try {
      const { rails, slideNodes } = extractRailsAndSlideNodes(jbeamParts);
      hasRailsOrSlideNodes = Boolean((rails && Object.keys(rails).length > 0) || (slideNodes && slideNodes.length > 0));
    } catch {}
    const hasRefNodes = Boolean(refNodesData?.valid);
    const cameraCount = camerasData ? camerasData.length : 0;
    const hasAero = Boolean(aeroStats?.valid);

    return {
      wheelCount,
      torsionBarCount,
      hasRailsOrSlideNodes,
      hasRefNodes,
      cameraCount,
      hasAero
    };
  }, [jbeamParts, externalWheelContextParts, refNodesData, camerasData, aeroStats]);

  // Helper to extract symmetric bilateral base name so matching bilateral sides (_FL & _FR, _L & _R) share colors
  const getSymmetricBaseName = (rawName) => {
    return extractSymmetricBaseName(rawName);
  };

  // Distinct vibrant palette for Parts & Flexbodies coloring
  const PART_FLEXBODY_PALETTE = useMemo(() => [
    '#0099ff', // Azure Blue
    '#ff9900', // Azure Orange
    '#22c55e', // Emerald Green
    '#c084fc', // Lilac Purple
    '#eab308', // Amber Gold
    '#f43f5e', // Rose Coral
    '#00e5ff', // Vivid Cyan
    '#a855f7', // Violet
    '#10b981', // Mint
    '#f97316', // Tangerine
    '#ec4899', // Hot Pink
    '#38bdf8', // Sky Blue
    '#84cc16', // Lime
    '#e11d48'  // Crimson
  ], []);

  // Flexbody Associations & Group Bindings
  const flexbodyAssociations = useMemo(() => {
    try {
      return resolveFlexbodyAssociations(jbeamParts, {
        daeSubmeshNames: visualMeshManagerRef.current?.submeshNames,
        submeshDetails: visualMeshManagerRef.current?.submeshDetails
      });
    } catch {
      return null;
    }
  }, [jbeamParts, meshStats]);

  // Scan parts and flexbody submeshes for 3D multi-color visualization & 3/4-level component hierarchy
  const partsAndFlexbodiesData = useMemo(() => {
    if (!jbeamParts || typeof jbeamParts !== 'object') {
      return { parts: [], families: [], fileGroups: [], meshColorMap: {}, partFamilyMap: new Map(), partFileGroupMap: new Map() };
    }
    const partKeys = Object.keys(jbeamParts).filter(k => k !== '__meta');
    const distinctFiles = new Set(
      partKeys.map(pk => {
        const t = jbeamParts[pk]?.__tabTitle;
        return t ? String(t).replace(/\.jbeam$/i, '') : 'Active File';
      })
    );
    const hasMultipleFiles = distinctFiles.size > 1;

    const parts = [];
    const meshColorMap = {};
    const symBaseColorMap = new Map();
    const familyColorMap = new Map();
    const familyMap = new Map();
    const fileGroupMap = new Map();
    const partFamilyMap = new Map();
    const partFileGroupMap = new Map();

    partKeys.forEach((pKey) => {
      const part = jbeamParts[pKey] || {};
      const rawTabTitle = part.__tabTitle ? String(part.__tabTitle) : 'Active File';
      const fileGroupKey = rawTabTitle.replace(/\.jbeam$/i, '');
      partFileGroupMap.set(pKey, fileGroupKey);

      const rawFamilyKey = derivePartFamily(pKey, part);
      const scopedFamilyKey = hasMultipleFiles ? `${fileGroupKey}::${rawFamilyKey}` : rawFamilyKey;
      if (!familyColorMap.has(scopedFamilyKey)) {
        familyColorMap.set(scopedFamilyKey, PART_FLEXBODY_PALETTE[familyColorMap.size % PART_FLEXBODY_PALETTE.length]);
      }
      const partColor = familyColorMap.get(scopedFamilyKey);
      partFamilyMap.set(pKey, scopedFamilyKey);

      const flexbodies = [];
      const seenMeshes = new Set();

      // Extract flexbodies from part.flexbodies
      if (part.flexbodies) {
        const rows = Array.isArray(part.flexbodies) ? part.flexbodies : Object.values(part.flexbodies);
        for (const row of rows) {
          if (!row || typeof row !== 'object') continue;
          const rawMesh = row.mesh || row['0'] || (Array.isArray(row) ? row[0] : null);
          if (rawMesh && typeof rawMesh === 'string' && rawMesh.toLowerCase() !== 'mesh') {
            const cleanMesh = rawMesh.replace(/^['"]|['"]$/g, '').trim();
            if (cleanMesh && !seenMeshes.has(cleanMesh)) {
              seenMeshes.add(cleanMesh);

              // Symmetric base name pairing: _FL and _FR map to the exact same base, receiving matching color
              const symBase = getSymmetricBaseName(cleanMesh);
              if (!symBaseColorMap.has(symBase)) {
                const colorIdx = symBaseColorMap.size % PART_FLEXBODY_PALETTE.length;
                symBaseColorMap.set(symBase, PART_FLEXBODY_PALETTE[colorIdx]);
              }
              const flexColor = symBaseColorMap.get(symBase);
              meshColorMap[cleanMesh] = flexColor;

              // Extract submesh stats from Collada manager if available
              const daeStats = visualMeshManagerRef.current?.submeshDetails?.get(cleanMesh);
              const boundNodes = flexbodyAssociations?.getBoundNodesForMesh
                ? flexbodyAssociations.getBoundNodesForMesh(cleanMesh)
                : [];

              flexbodies.push({
                name: cleanMesh,
                color: flexColor,
                symBase,
                triangles: daeStats?.triangles || 0,
                vertices: daeStats?.vertices || 0,
                nodeCount: boundNodes.length
              });
            }
          }
        }
      }

      // If no explicit flexbodies found, also map part key
      if (flexbodies.length === 0) {
        meshColorMap[pKey] = partColor;
      }

      const nodeCount = part.nodes ? (Array.isArray(part.nodes) ? part.nodes.length : Object.keys(part.nodes).length) : 0;
      const beamCount = part.beams ? (Array.isArray(part.beams) ? part.beams.length : Object.keys(part.beams).length) : 0;

      const partObj = {
        key: pKey,
        name: part.information?.name || pKey,
        color: partColor,
        familyKey: scopedFamilyKey,
        familyName: rawFamilyKey,
        fileGroupKey,
        flexbodies,
        nodeCount,
        beamCount
      };
      parts.push(partObj);

      // Level 1 Family Aggregation (scoped by file when in Multi-Part mode)
      if (!familyMap.has(scopedFamilyKey)) {
        familyMap.set(scopedFamilyKey, {
          key: scopedFamilyKey,
          name: rawFamilyKey,
          fileGroupKey,
          color: partColor,
          variants: [],
          totalFlexbodies: 0,
          totalNodes: 0,
          totalBeams: 0
        });
      }
      const fam = familyMap.get(scopedFamilyKey);
      fam.variants.push(partObj);
      fam.totalFlexbodies += flexbodies.length;
      fam.totalNodes += nodeCount;
      fam.totalBeams += beamCount;

      // Level 0 File / Folder Aggregation (for Multi-Part view)
      if (!fileGroupMap.has(fileGroupKey)) {
        fileGroupMap.set(fileGroupKey, {
          key: fileGroupKey,
          title: rawTabTitle,
          color: part.__componentColor || partColor,
          isNonActive: Boolean(part.__isNonActive),
          familyKeys: new Set(),
          families: [],
          partKeys: [],
          totalFlexbodies: 0,
          totalNodes: 0,
          totalBeams: 0
        });
      }
      const fg = fileGroupMap.get(fileGroupKey);
      fg.partKeys.push(pKey);
      fg.totalFlexbodies += flexbodies.length;
      fg.totalNodes += nodeCount;
      fg.totalBeams += beamCount;
      if (!fg.familyKeys.has(scopedFamilyKey)) {
        fg.familyKeys.add(scopedFamilyKey);
        fg.families.push(fam);
      }
    });

    const families = Array.from(familyMap.values());
    const fileGroups = Array.from(fileGroupMap.values());
    return { parts, families, fileGroups, meshColorMap, partFamilyMap, partFileGroupMap };
  }, [jbeamParts, PART_FLEXBODY_PALETTE, flexbodyAssociations, meshStats]);

  // Synchronized Part & Flexbody Isolation State (cross-mode persistent)
  const [isolatedPartKeys, setIsolatedPartKeys] = useState(new Set());
  const [soloFileGroupKey, setSoloFileGroupKey] = useState(null);
  const [soloFamilyKey, setSoloFamilyKey] = useState(null);
  const [soloPartKey, setSoloPartKey] = useState(null);
  const [hiddenFlexbodyNames, setHiddenFlexbodyNames] = useState(new Set());
  const [soloFlexbodyName, setSoloFlexbodyName] = useState(null);
  const [expandedFileGroupKeys, setExpandedFileGroupKeys] = useState(new Set());
  const [expandedFamilyKeys, setExpandedFamilyKeys] = useState(new Set());
  const [expandedPartKeys, setExpandedPartKeys] = useState(new Set());
  const [explorerSearchQuery, setExplorerSearchQuery] = useState('');

  // Parts that contain the currently soloed flexbody
  const soloFlexbodyPartKeys = useMemo(() => {
    if (!soloFlexbodyName || !jbeamParts) return null;
    const matchingParts = new Set();
    const soloLower = soloFlexbodyName.toLowerCase();
    for (const [pk, part] of Object.entries(jbeamParts)) {
      if (pk === '__meta' || !part?.flexbodies) continue;
      const rows = Array.isArray(part.flexbodies) ? part.flexbodies : Object.values(part.flexbodies);
      for (const row of rows) {
        const rawMesh = row?.mesh || row?.['0'] || (Array.isArray(row) ? row[0] : null);
        if (typeof rawMesh === 'string') {
          const cleanMesh = rawMesh.replace(/^['"]|['"]$/g, '').trim().toLowerCase();
          if (cleanMesh === soloLower) {
            matchingParts.add(pk);
            break;
          }
        }
      }
    }
    return matchingParts;
  }, [soloFlexbodyName, jbeamParts]);

  const hasActiveIsolation = useMemo(() => {
    return soloFileGroupKey !== null ||
           soloFamilyKey !== null ||
           soloPartKey !== null ||
           soloFlexbodyName !== null ||
           isolatedPartKeys.size > 0 ||
           hiddenFlexbodyNames.size > 0;
  }, [soloFileGroupKey, soloFamilyKey, soloPartKey, soloFlexbodyName, isolatedPartKeys, hiddenFlexbodyNames]);

  const clearAllIsolation = useCallback(() => {
    setIsolatedPartKeys(new Set());
    setSoloFileGroupKey(null);
    setSoloFamilyKey(null);
    setSoloPartKey(null);
    setHiddenFlexbodyNames(new Set());
    setSoloFlexbodyName(null);
  }, []);

  const toggleHideUnhideAll = useCallback(() => {
    const allKeys = (partsAndFlexbodiesData?.parts || []).map(p => p.key);
    const { newIsolatedKeys } = computeHideUnhideAllToggle(hasActiveIsolation, allKeys);
    setIsolatedPartKeys(newIsolatedKeys);
    setSoloFileGroupKey(null);
    setSoloFamilyKey(null);
    setSoloPartKey(null);
    setSoloFlexbodyName(null);
    setHiddenFlexbodyNames(new Set());
  }, [hasActiveIsolation, partsAndFlexbodiesData]);

  // Check if a part is visible under active file, family, part, or flexbody isolation
  const isPartVisible = useCallback((pk) => {
    if (soloPartKey) return pk === soloPartKey;
    if (soloFileGroupKey) {
      const fgKey = partsAndFlexbodiesData?.partFileGroupMap?.get(pk);
      if (fgKey !== soloFileGroupKey) return false;
    }
    if (soloFamilyKey) {
      const famKey = partsAndFlexbodiesData?.partFamilyMap?.get(pk);
      if (famKey !== soloFamilyKey) return false;
    }
    if (soloFlexbodyName && soloFlexbodyPartKeys) {
      if (!soloFlexbodyPartKeys.has(pk)) return false;
    }
    return !isolatedPartKeys.has(pk);
  }, [soloPartKey, soloFileGroupKey, soloFamilyKey, soloFlexbodyName, soloFlexbodyPartKeys, partsAndFlexbodiesData, isolatedPartKeys]);

  const toggleFileGroupVisibility = useCallback((fileGroupKey) => {
    const fg = partsAndFlexbodiesData?.fileGroups?.find(g => g.key === fileGroupKey);
    if (!fg) return;
    setIsolatedPartKeys(prev => {
      const next = new Set(prev);
      const allHidden = fg.partKeys.every(k => next.has(k));
      if (allHidden) {
        fg.partKeys.forEach(k => next.delete(k));
      } else {
        fg.partKeys.forEach(k => next.add(k));
      }
      return next;
    });
    setSoloFileGroupKey(prev => (prev === fileGroupKey ? null : prev));
  }, [partsAndFlexbodiesData]);

  const toggleSoloFileGroup = useCallback((fileGroupKey) => {
    setSoloFileGroupKey(prev => (prev === fileGroupKey ? null : fileGroupKey));
    setSoloFamilyKey(null);
    setSoloPartKey(null);
    setSoloFlexbodyName(null);
  }, []);

  const toggleExpandFileGroup = useCallback((fileGroupKey) => {
    setExpandedFileGroupKeys(prev => {
      const next = new Set(prev);
      if (next.has(fileGroupKey)) next.delete(fileGroupKey);
      else next.add(fileGroupKey);
      return next;
    });
  }, []);

  const toggleFamilyVisibility = useCallback((familyKey) => {
    const fam = partsAndFlexbodiesData?.families?.find(f => f.key === familyKey);
    if (!fam) return;
    const variantKeys = fam.variants.map(v => v.key);
    setIsolatedPartKeys(prev => {
      const next = new Set(prev);
      const allHidden = variantKeys.every(k => next.has(k));
      if (allHidden) {
        variantKeys.forEach(k => next.delete(k));
      } else {
        variantKeys.forEach(k => next.add(k));
      }
      return next;
    });
    setSoloFamilyKey(prev => (prev === familyKey ? null : prev));
  }, [partsAndFlexbodiesData]);

  const toggleSoloFamily = useCallback((familyKey) => {
    setSoloFamilyKey(prev => (prev === familyKey ? null : familyKey));
    setSoloFileGroupKey(null);
    setSoloPartKey(null);
    setSoloFlexbodyName(null);
  }, []);

  const toggleExpandFamily = useCallback((familyKey) => {
    setExpandedFamilyKeys(prev => {
      const next = new Set(prev);
      if (next.has(familyKey)) next.delete(familyKey);
      else next.add(familyKey);
      return next;
    });
  }, []);

  const togglePartVisibility = useCallback((partKey) => {
    setIsolatedPartKeys(prev => {
      const next = new Set(prev);
      if (next.has(partKey)) next.delete(partKey);
      else next.add(partKey);
      return next;
    });
    setSoloPartKey(prev => (prev === partKey ? null : prev));
  }, []);

  const toggleSoloPart = useCallback((partKey) => {
    setSoloPartKey(prev => (prev === partKey ? null : partKey));
    setSoloFamilyKey(null);
    setSoloFlexbodyName(null);
  }, []);

  const toggleFlexbodyVisibility = useCallback((meshName) => {
    setHiddenFlexbodyNames(prev => {
      const next = new Set(prev);
      if (next.has(meshName)) next.delete(meshName);
      else next.add(meshName);
      return next;
    });
    setSoloFlexbodyName(prev => (prev === meshName ? null : prev));
  }, []);

  const toggleSoloFlexbody = useCallback((meshName) => {
    setSoloFlexbodyName(prev => (prev === meshName ? null : meshName));
    setSoloFamilyKey(null);
    setSoloPartKey(null);
  }, []);

  const toggleExpandPart = useCallback((partKey) => {
    setExpandedPartKeys(prev => {
      const next = new Set(prev);
      if (next.has(partKey)) next.delete(partKey);
      else next.add(partKey);
      return next;
    });
  }, []);

  // Filtered file groups & families for the Multi-Part / Single-Part Explorer
  const filteredFileGroups = useMemo(() => {
    const groups = partsAndFlexbodiesData?.fileGroups || [];
    const q = explorerSearchQuery.trim().toLowerCase();
    if (!q) return groups;

    return groups.map(fg => {
      const fgMatches = fg.key.toLowerCase().includes(q) || (fg.title && fg.title.toLowerCase().includes(q));
      if (fgMatches) return fg;
      const matchedFams = fg.families.map(fam => {
        const famMatches = fam.name.toLowerCase().includes(q) || fam.key.toLowerCase().includes(q);
        if (famMatches) return fam;
        const matchedVariants = fam.variants.map(variant => {
          const variantMatches = variant.key.toLowerCase().includes(q) || (variant.name && variant.name.toLowerCase().includes(q));
          const matchedFbs = (variant.flexbodies || []).filter(fb => {
            const fbName = typeof fb === 'string' ? fb : fb.name;
            return fbName.toLowerCase().includes(q);
          });
          if (variantMatches) return variant;
          if (matchedFbs.length > 0) return { ...variant, flexbodies: matchedFbs };
          return null;
        }).filter(Boolean);
        if (matchedVariants.length > 0) return { ...fam, variants: matchedVariants };
        return null;
      }).filter(Boolean);
      if (matchedFams.length > 0) return { ...fg, families: matchedFams };
      return null;
    }).filter(Boolean);
  }, [partsAndFlexbodiesData, explorerSearchQuery]);

  // Filtered families, parts, and flexbodies for the 3-level Explorer search
  const filteredFamilies = useMemo(() => {
    return filteredFileGroups.flatMap(fg => fg.families || []);
  }, [filteredFileGroups]);

  const totalFilteredVariants = useMemo(() => {
    return filteredFamilies.reduce((sum, f) => sum + (f.variants?.length || 0), 0);
  }, [filteredFamilies]);

  const totalFilteredFlexbodies = useMemo(() => {
    return filteredFamilies.reduce((sum, f) => {
      return sum + (f.variants || []).reduce((vSum, v) => vSum + (v.flexbodies?.length || 0), 0);
    }, 0);
  }, [filteredFamilies]);

  // Extract submesh candidate names from active JBeam part(s), flexbodies, and props (filtered by isolation)
  const activeMatchingMeshNames = useMemo(() => {
    const names = new Set();
    if (!jbeamParts) return names;
    const partKeys = Object.keys(jbeamParts).filter(k => k !== '__meta');

    for (const pKey of partKeys) {
      if (hasActiveIsolation && !isPartVisible(pKey)) continue;

      const part = jbeamParts[pKey];
      if (!part) continue;

      let declaredExplicitMesh = false;

      // 1. Extract from flexbodies table
      if (part.flexbodies) {
        const rows = Array.isArray(part.flexbodies) ? part.flexbodies : Object.values(part.flexbodies);
        for (const row of rows) {
          if (!row || typeof row !== 'object') continue;
          const rawMesh = row.mesh || row['0'] || (Array.isArray(row) ? row[0] : null);
          if (rawMesh && typeof rawMesh === 'string' && rawMesh.toLowerCase() !== 'mesh') {
            const clean = rawMesh.replace(/^['"]|['"]$/g, '').trim();
            if (clean) {
              names.add(clean.toLowerCase());
              declaredExplicitMesh = true;
            }
          }
        }
      }

      // 2. Extract from props table (steering wheel, lights, gauges, mirrors)
      if (part.props) {
        const rows = Array.isArray(part.props) ? part.props : Object.values(part.props);
        for (const row of rows) {
          if (!row || typeof row !== 'object') continue;
          const rawMesh = row.mesh || row['0'] || (Array.isArray(row) ? row[0] : null);
          if (rawMesh && typeof rawMesh === 'string' && rawMesh.toLowerCase() !== 'mesh') {
            const clean = rawMesh.replace(/^['"]|['"]$/g, '').trim();
            if (clean) {
              names.add(clean.toLowerCase());
              declaredExplicitMesh = true;
            }
          }
        }
      }

      // 3. Fallback: only if part has NO flexbodies and NO props declared, allow partName
      // (Never allow generic root chassis/model names like 'percheron', 'untitled', 'document')
      if (!declaredExplicitMesh && pKey && pKey.length >= 3) {
        const lowerKey = pKey.toLowerCase();
        if (
          lowerKey !== 'main' &&
          lowerKey !== 'vehicle' &&
          lowerKey !== 'percheron' &&
          lowerKey !== 'untitled' &&
          lowerKey !== 'document'
        ) {
          if (visualMeshManagerRef.current?.hasSubmesh(lowerKey)) {
            names.add(lowerKey);
          }
        }
      }
    }
    return names;
  }, [jbeamParts, hasActiveIsolation, isPartVisible, meshStats]);

  // Tracks whether the loaded JBeam parts declare any flexbody or prop meshes at all (even if currently hidden)
  const jbeamDefinesFlexbodies = useMemo(() => {
    if (!jbeamParts) return false;
    for (const pKey of Object.keys(jbeamParts).filter(k => k !== '__meta')) {
      const part = jbeamParts[pKey];
      if (!part) continue;
      for (const table of [part.flexbodies, part.props]) {
        if (!table) continue;
        const rows = Array.isArray(table) ? table : Object.values(table);
        for (const row of rows) {
          if (!row || typeof row !== 'object') continue;
          const rawMesh = row.mesh || row['0'] || (Array.isArray(row) ? row[0] : null);
          if (rawMesh && typeof rawMesh === 'string' && rawMesh.toLowerCase() !== 'mesh' && rawMesh.replace(/^['"]|['"]$/g, '').trim()) {
            return true;
          }
        }
      }
    }
    return false;
  }, [jbeamParts]);

  const [isHudOpen, setIsHudOpen] = useState(false);
  const [hudActiveTab, setHudActiveTab] = useState('parts'); // 'parts' | 'type' | 'crash' | 'heatmap'
  const [activeHeatmap, setActiveHeatmap] = useState(null); // null | 'mass' | 'stiffness' | 'deform' | 'strength'
  const [isColorHudCollapsed, setIsColorHudCollapsed] = useState(false);
  const [typeFilters, setTypeFilters] = useState({
    beams: {
      '|NORMAL': true,
      '|SUPPORT': true,
      '|HYDRO': true,
      '|BOUNDED': true,
      '|ANISOTROPIC': true,
      '|PRESSURED': true,
      '|VIRTUAL': true
    },
    nodes: {
      collisionOnly: true,
      selfCollision: true,
      nonCollidable: true,
      wheelHub: true,
      mount: true,
      fixed: true,
      external: true
    },
    surfaces: {
      NORMALTYPE: true,
      NONCOLLIDABLE: true,
      PRESSURE: true
    }
  });

  const toggleTypeFilter = useCallback((category, typeKey) => {
    setTypeFilters(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [typeKey]: !prev[category]?.[typeKey]
      }
    }));
  }, []);

  const soloTypeFilter = useCallback((category, typeKey) => {
    setTypeFilters(prev => {
      const current = prev[category] || {};
      const nextGroup = {};
      for (const k of Object.keys(current)) {
        nextGroup[k] = (k === typeKey);
      }
      return {
        ...prev,
        [category]: nextGroup
      };
    });
  }, []);

  const resetTypeFilterGroup = useCallback((category) => {
    setTypeFilters(prev => {
      const current = prev[category] || {};
      const nextGroup = {};
      for (const k of Object.keys(current)) {
        nextGroup[k] = true;
      }
      return {
        ...prev,
        [category]: nextGroup
      };
    });
  }, []);

  const showAllTypes = useCallback(() => {
    setTypeFilters({
      beams: {
        '|NORMAL': true,
        '|SUPPORT': true,
        '|HYDRO': true,
        '|BOUNDED': true,
        '|ANISOTROPIC': true,
        '|PRESSURED': true,
        '|VIRTUAL': true
      },
      nodes: {
        collisionOnly: true,
        selfCollision: true,
        nonCollidable: true,
        wheelHub: true,
        mount: true,
        fixed: true,
        external: true
      },
      surfaces: {
        NORMALTYPE: true,
        NONCOLLIDABLE: true,
        PRESSURE: true
      }
    });
  }, []);

  const hasActiveTypeFilter = useMemo(() => {
    if (!typeFilters) return false;
    const b = typeFilters.beams || {};
    const n = typeFilters.nodes || {};
    const s = typeFilters.surfaces || {};
    return Object.values(b).some(v => v === false) ||
           Object.values(n).some(v => v === false) ||
           Object.values(s).some(v => v === false);
  }, [typeFilters]);

  const isNormalClean = colorMode === 'default' &&
    !activeHeatmap &&
    !hasActiveIsolation &&
    !hasActiveTypeFilter &&
    !activeCrashGroup;

  const handleResetToNormal = useCallback(() => {
    setColorMode('default');
    setActiveHeatmap(null);
    showAllTypes();
    setActiveCrashGroup(null);
    clearAllIsolation();
    setHudActiveTab('parts');
    setIsColorHudCollapsed(false);
  }, [showAllTypes, clearAllIsolation]);

  const { nodeMode: effectiveNodeColorMode, beamMode: effectiveBeamColorMode } = useMemo(() => {
    return computeEffectiveColorModes({
      activeHeatmap,
      colorMode,
      hudActiveTab,
      hasActiveTypeFilter
    });
  }, [activeHeatmap, colorMode, hudActiveTab, hasActiveTypeFilter]);

  const vehicleCounts = useMemo(() => {
    if (!jbeamParts) return { beamCounts: {}, nodeCounts: {}, surfaceCounts: {}, totalBeams: 0, totalNodes: 0, totalSurfaces: 0, localNodeCount: 0, externalNodeCount: 0 };
    const partKeys = Object.keys(jbeamParts).filter(k => k !== '__meta');
    const beams = {};
    const nodes = {};
    const tris = {};
    const quads = {};
    for (const pk of partKeys) {
      const p = jbeamParts[pk];
      if (!p) continue;
      if (p.beams) Object.assign(beams, p.beams);
      if (p.hydros) Object.assign(beams, p.hydros);
      if (p.nodes) Object.assign(nodes, p.nodes);
      if (p.triangles) Object.assign(tris, p.triangles);
      if (p.quads) Object.assign(quads, p.quads);
    }
    const counts = countVehicleElementTypes(beams, nodes, tris, quads, externalNodes);
    const localNodeCount = Object.keys(nodes).filter(k => k !== '__meta').length;
    const totalExternalNodes = counts.nodeCounts?.external || 0;
    return {
      ...counts,
      localNodeCount,
      externalNodeCount: totalExternalNodes,
      totalBeams: Object.keys(beams).filter(k => k !== '__meta').length,
      totalNodes: localNodeCount + totalExternalNodes,
      totalSurfaces: Object.keys(tris).filter(k => k !== '__meta').length + Object.keys(quads).filter(k => k !== '__meta').length
    };
  }, [jbeamParts, externalNodes]);

  const [showFrontIndicator, setShowFrontIndicator] = useState(true);

  const updateTransformGizmoAttachmentRef = useRef(null);

  // Helper to match node meshes by ID (supports scoped and unscoped IDs)
  const matchesNode = (c, id) => {
    if (!c || !id) return false;
    const cid = c.userData?.id;
    const cName = c.name;
    return cid === id ||
           cName === `node_${id}` ||
           (cid && String(id).endsWith(`_${cid}`)) ||
           (cid && String(cid).endsWith(`_${id}`)) ||
           (c.userData?.partName && (cid === `${c.userData.partName}_${id}` || id === `${c.userData.partName}_${cid}`));
  };

  // Helper to attach/detach TransformControls gizmo to selected nodes
  // Supports both 'select' and 'boxSelect' modes
  const updateTransformGizmoAttachment = useCallback((customMulti = null, customSingleId = null) => {
    if (!transformControlsRef.current || !nodesGroupRef.current) return;
    const curTool = activeToolRef.current;
    if (curTool !== 'select' && curTool !== 'boxSelect') {
      transformControlsRef.current.detach();
      return;
    }

    const multi = customMulti !== null ? customMulti : (multiSelectedNodesRef.current || []);
    if (multi.length > 1) {
      const center = new THREE.Vector3();
      let count = 0;
      for (const nid of multi) {
        const m = nodesGroupRef.current.children.find(c => matchesNode(c, nid));
        if (m) { center.add(m.position); count++; }
      }
      if (count > 0) {
        center.multiplyScalar(1 / count);
        multiSelectPivotRef.current.position.copy(center);
        transformControlsRef.current.attach(multiSelectPivotRef.current);
      } else {
        transformControlsRef.current.detach();
      }
    } else {
      const activeNodeId = (typeof customSingleId === 'string' && customSingleId)
        ? customSingleId
        : ((typeof selectedNodeId === 'string' && selectedNodeId)
            ? selectedNodeId
            : (multi.length === 1 ? multi[0] : null));
      if (activeNodeId) {
        const targetMesh = nodesGroupRef.current.children.find(c => matchesNode(c, activeNodeId));
        if (targetMesh) {
          transformControlsRef.current.attach(targetMesh);
        } else {
          transformControlsRef.current.detach();
        }
      } else {
        transformControlsRef.current.detach();
      }
    }
  }, [selectedNodeId, multiSelectedNodes]);

  useEffect(() => {
    updateTransformGizmoAttachmentRef.current = updateTransformGizmoAttachment;
    updateTransformGizmoAttachment();
  }, [updateTransformGizmoAttachment, selectedNodeId, multiSelectedNodes, internalTool]);

  // Switch tools helper
  const handleSetTool = (newTool) => {
    setInternalTool(newTool);
    activeToolRef.current = newTool;
    if (onToolChange) onToolChange(newTool);

    // Reset pending creation states
    setPendingBeamStart(null);
    pendingBeamStartRef.current = null;
    setPendingTriNodes([]);
    pendingTriNodesRef.current = [];

    // Hide previews
    if (ghostMeshRef.current) ghostMeshRef.current.visible = false;
    if (mirrorGhostMeshRef.current) mirrorGhostMeshRef.current.visible = false;
    if (snapRingRef.current) snapRingRef.current.visible = false;
    if (rubberBandLineRef.current) rubberBandLineRef.current.visible = false;
    if (triPreviewMeshRef.current) triPreviewMeshRef.current.visible = false;
    if (normalArrowRef.current) normalArrowRef.current.visible = false;

    // Enable/disable transform gizmo depending on mode (supports both 'select' and 'boxSelect')
    if (transformControlsRef.current) {
      if ((newTool === 'select' || newTool === 'boxSelect') && nodesGroupRef.current) {
        updateTransformGizmoAttachment();
      } else {
        transformControlsRef.current.detach();
      }
    }
  };

  // Cycle Grid Snap Step (Mutually exclusive with DAE Snap)
  const cycleGridSnap = () => {
    const curIdx = GRID_SNAP_STEPS.indexOf(internalGridSnap);
    const nextIdx = (curIdx + 1) % GRID_SNAP_STEPS.length;
    const nextSnap = GRID_SNAP_STEPS[nextIdx];
    setInternalGridSnap(nextSnap);
    gridSnapRef.current = nextSnap;
    if (onGridSnapChange) onGridSnapChange(nextSnap);

    // If enabling a grid snap step, deactivate DAE vertex snap so they don't interfere
    if (nextSnap > 0) {
      setSnapToMeshVertex(false);
      snapToMeshVertexRef.current = false;
    }
  };

  // Cancel Tool Creation
  const handleCancelTool = () => {
    if (pendingBeamStartRef.current) {
      setPendingBeamStart(null);
      pendingBeamStartRef.current = null;
      if (rubberBandLineRef.current) rubberBandLineRef.current.visible = false;
    } else if (pendingTriNodesRef.current.length > 0) {
      setPendingTriNodes([]);
      pendingTriNodesRef.current = [];
      if (rubberBandLineRef.current) rubberBandLineRef.current.visible = false;
      if (triPreviewMeshRef.current) triPreviewMeshRef.current.visible = false;
      if (normalArrowRef.current) normalArrowRef.current.visible = false;
    } else if (pendingQuadNodesRef.current.length > 0) {
      setPendingQuadNodes([]);
      pendingQuadNodesRef.current = [];
      if (rubberBandLineRef.current) rubberBandLineRef.current.visible = false;
      if (triPreviewMeshRef.current) triPreviewMeshRef.current.visible = false;
      if (normalArrowRef.current) normalArrowRef.current.visible = false;
    } else {
      handleSetTool('select');
    }
  };

  // Quick-Connect Selected Nodes into Beam, Triangle, or Quad (Blender "F" key)
  const handleQuickConnect = () => {
    const nodes = multiSelectedNodesRef.current.length >= 2
      ? multiSelectedNodesRef.current
      : (selectedNodeId ? [selectedNodeId] : []);
    if (nodes.length >= 2 && onQuickConnectRef.current) {
      onQuickConnectRef.current(nodes);
    }
  };

  // Extrude Selected Nodes with Beams and Cross-Bracing (Blender "E" key)
  const handleExtrude = (delta = [0, -0.3, 0]) => {
    const nodes = multiSelectedNodesRef.current.length > 0
      ? multiSelectedNodesRef.current
      : (selectedNodeId ? [selectedNodeId] : []);
    if (nodes.length > 0 && onExtrudeNodesRef.current) {
      onExtrudeNodesRef.current({
        nodeIds: nodes,
        delta,
        properties: BEAM_PRESETS[beamPresetRef.current]?.properties || {}
      });
    }
  };

  // Subdivide Selected Beam into Two Segments (Blender "W" key)
  const handleSubdivideSelectedBeam = () => {
    if (selectedBeamInfo && onSubdivideBeamRef.current) {
      onSubdivideBeamRef.current(selectedBeamInfo);
    }
  };

  // Analyze Model Symmetry via Principal Component Analysis (PCA)
  const handleDetectPlanes = () => {
    if (!jbeamParts) return;
    const nodesList = [];
    const partKeys = Object.keys(jbeamParts).filter(k => k !== '__meta');
    for (const pk of partKeys) {
      const p = jbeamParts[pk];
      if (p?.nodes) {
        for (const [nid, nObj] of Object.entries(p.nodes)) {
          if (nid === '__meta') continue;
          nodesList.push({ id: nid, pos: extractNodeCoords(nObj) });
        }
      }
    }
    const planes = detectAllMirrorPlanes(nodesList);
    if (planes.length > 0) {
      const top = planes[0];
      setMirrorPlaneFeedback(`Top Symmetry: ${top.label} (${top.symmetryPercentage}% across ${top.totalNodes} nodes)`);
      setTimeout(() => setMirrorPlaneFeedback(null), 5000);
      if (onDetectMirrorPlanes) onDetectMirrorPlanes(planes);
    }
  };

  // Delete Click Helper (Handles multi-selected nodes, single nodes, beams, and surfaces)
  const handleDeleteClick = () => {
    const fn = onDeleteSelectedRef.current || onDeleteSelected;
    if (!fn) return;
    const curMulti = multiSelectedNodesRef.current;
    const curNid = selectedNodeIdRef.current || selectedNodeId;
    const curBeam = selectedBeamInfoRef.current || selectedBeamInfo || selectedBeamKeyRef.current || selectedBeamKey;
    const curSurf = selectedSurfaceInfoRef.current || selectedSurfaceInfo;

    if (curMulti && curMulti.length > 1) {
      fn('nodes', curMulti);
    } else if (curNid) {
      fn('node', curNid);
    } else if (curBeam) {
      fn('beam', curBeam);
    } else if (curSurf) {
      fn('surface', curSurf);
    }
  };

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // Scene
    const scene = new THREE.Scene();
    const bgPreset = VIEWPORT_BG_PRESETS[viewportBg] || VIEWPORT_BG_PRESETS.editorGray;
    scene.background = new THREE.Color(bgPreset.threeColor);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.05, 500);
    camera.position.set(-2.5, 2.0, -3.5);
    cameraRef.current = camera;

    // Renderer (High-Performance Discrete GPU Priority: NVIDIA / AMD over Integrated)
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      precision: 'highp',
      failIfMajorPerformanceCaveat: false
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = false;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // WebGL Context Loss Recovery
    const handleContextLost = (e) => {
      e.preventDefault();
      console.warn('[JBeam Viewport] WebGL Context Lost. Attempting GPU recovery...');
    };
    const handleContextRestored = () => {
      console.log('[JBeam Viewport] WebGL Context Restored.');
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost, false);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored, false);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(5, 10, 7);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x90caf9, 0.4);
    dirLight2.position.set(-5, -5, -5);
    scene.add(dirLight2);

    // Environment (Ground grid & Origin axes)
    const envGroup = buildEnvironmentGroup();
    scene.add(envGroup);

    // Front Vehicle Direction Indicator (+Y Forward in BeamNG)
    const frontIndicatorGroup = buildFrontIndicatorGroup();
    scene.add(frontIndicatorGroup);
    frontIndicatorGroupRef.current = frontIndicatorGroup;

    // Structure root group
    const structureGroup = new THREE.Group();
    structureGroup.name = 'structure_root';
    scene.add(structureGroup);
    structureGroupRef.current = structureGroup;

    // Visual Mesh Overlay (.dae Collada) Root Group
    scene.add(visualMeshManagerRef.current.meshGroup);

    // Blueprint Reference Planes Root Group
    const blueprintGroup = new THREE.Group();
    blueprintGroup.name = 'blueprint_root';
    scene.add(blueprintGroup);
    blueprintGroupRef.current = blueprintGroup;

    // Code-Hover Overlay Group (Dynamic 3D Focus for Monaco Hover)
    const codeHoverGroup = new THREE.Group();
    codeHoverGroup.name = 'code_hover_overlay';
    scene.add(codeHoverGroup);
    codeHoverGroupRef.current = codeHoverGroup;

    // Creation Tools Overlay Group
    const toolOverlayGroup = new THREE.Group();
    toolOverlayGroup.name = 'tool_overlay';
    scene.add(toolOverlayGroup);

    // 1. Ghost placement sphere for +Node
    const ghostGeom = new THREE.SphereGeometry(0.038, 16, 16);
    const ghostMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x0088cc,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.8
    });
    const ghostMesh = new THREE.Mesh(ghostGeom, ghostMat);
    ghostMesh.visible = false;
    toolOverlayGroup.add(ghostMesh);
    ghostMeshRef.current = ghostMesh;

    // 2. Mirror ghost placement sphere
    const mirrorGhostMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      wireframe: true,
      transparent: true,
      opacity: 0.5
    });
    const mirrorGhostMesh = new THREE.Mesh(ghostGeom, mirrorGhostMat);
    mirrorGhostMesh.visible = false;
    toolOverlayGroup.add(mirrorGhostMesh);
    mirrorGhostMeshRef.current = mirrorGhostMesh;

    // 3. Snap Ring for node hover in +Beam and +Tri
    const snapGeom = new THREE.RingGeometry(0.048, 0.065, 32);
    const snapMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      side: THREE.DoubleSide,
      depthTest: false
    });
    const snapRing = new THREE.Mesh(snapGeom, snapMat);
    snapRing.visible = false;
    snapRing.renderOrder = 999;
    toolOverlayGroup.add(snapRing);
    snapRingRef.current = snapRing;

    // 4. Rubber-band line for +Beam and +Tri
    const lineGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 3,
      depthTest: false
    });
    const rubberBandLine = new THREE.Line(lineGeom, lineMat);
    rubberBandLine.visible = false;
    rubberBandLine.renderOrder = 998;
    toolOverlayGroup.add(rubberBandLine);
    rubberBandLineRef.current = rubberBandLine;

    // 5. Triangle Preview Mesh
    const triGeom = new THREE.BufferGeometry();
    const triMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthTest: false
    });
    const triMesh = new THREE.Mesh(triGeom, triMat);
    triMesh.visible = false;
    triMesh.renderOrder = 997;
    toolOverlayGroup.add(triMesh);
    triPreviewMeshRef.current = triMesh;

    // 6. Normal Arrow Helper for +Tri
    const normalArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(),
      0.3,
      0xffd600,
      0.08,
      0.04
    );
    normalArrow.visible = false;
    toolOverlayGroup.add(normalArrow);
    normalArrowRef.current = normalArrow;

    // Controls
    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.08;
    orbitControls.target.set(0, 0.5, 0);
    orbitControls.mouseButtons.LEFT = isPanModeRef.current ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    orbitControlsRef.current = orbitControls;

    // Detect when user rotates away from a snapped view (side/front/top) and automatically switch to iso mode
    const handleOrbitChange = () => {
      const currentPreset = viewPresetRef.current;
      if (!currentPreset || currentPreset === 'iso') return;

      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);

      let isAligned = false;
      if (currentPreset === 'side' || currentPreset === 'side-left') {
        isAligned = dir.x > 0.996;
      } else if (currentPreset === 'side-right') {
        isAligned = dir.x < -0.996;
      } else if (currentPreset === 'front') {
        isAligned = dir.z > 0.996;
      } else if (currentPreset === 'rear') {
        isAligned = dir.z < -0.996;
      } else if (currentPreset === 'top') {
        isAligned = dir.y < -0.996;
      } else if (currentPreset === 'bottom') {
        isAligned = dir.y > 0.996;
      }

      if (!isAligned) {
        viewPresetRef.current = 'iso';
        setViewPreset('iso');
      }
    };
    orbitControls.addEventListener('change', handleOrbitChange);

    // TransformControls for node manipulation
    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.size = 0.85;
    transformControls.setTranslationSnap(0.001); // 1mm snapping
    transformControlsRef.current = transformControls;
    scene.add(transformControls);
    scene.add(multiSelectPivotRef.current);

    // Helper to live update beam line vertices for moved nodes during gizmo drag
    const updateBeamsForMovedNodes = (movedNodeIdSet) => {
      const beamsGroup = beamsGroupRef.current;
      if (!beamsGroup || !beamsGroup.userData?.beamSegments || !nodesGroupRef.current) return;
      const segments = beamsGroup.userData.beamSegments;
      const posAttr = beamsGroup.userData.positionAttr;
      const supportPosAttr = beamsGroup.userData.supportPosAttr;
      const virtualPosAttr = beamsGroup.userData.virtualPosAttr;
      let beamModified = false;
      let supportModified = false;
      let virtualModified = false;

      const nodeMeshMap = new Map();
      for (const child of nodesGroupRef.current.children) {
        if (child.userData?.id && movedNodeIdSet.has(child.userData.id)) {
          nodeMeshMap.set(child.userData.id, child.position);
        }
      }

      for (const seg of segments) {
        const targetAttr = seg.isVirtual ? virtualPosAttr : (seg.isSupport ? supportPosAttr : posAttr);
        if (!targetAttr) continue;

        if (nodeMeshMap.has(seg.id1)) {
          const p = nodeMeshMap.get(seg.id1);
          targetAttr.setXYZ(seg.vertexIdx1, p.x, p.y, p.z);
          if (seg.isVirtual) virtualModified = true; else if (seg.isSupport) supportModified = true; else beamModified = true;
        }
        if (nodeMeshMap.has(seg.id2)) {
          const p = nodeMeshMap.get(seg.id2);
          targetAttr.setXYZ(seg.vertexIdx2, p.x, p.y, p.z);
          if (seg.isVirtual) virtualModified = true; else if (seg.isSupport) supportModified = true; else beamModified = true;
        }
      }
      if (beamModified && posAttr) posAttr.needsUpdate = true;
      if (supportModified && supportPosAttr) {
        supportPosAttr.needsUpdate = true;
        beamsGroup.userData.supportLines?.computeLineDistances();
      }
      if (virtualModified && virtualPosAttr) {
        virtualPosAttr.needsUpdate = true;
        beamsGroup.userData.virtualLines?.computeLineDistances();
      }
    };

    transformControls.addEventListener('dragging-changed', (event) => {
      orbitControls.enabled = !event.value;
      isTransformDraggingRef.current = Boolean(event.value);
      isTransformInteractingRef.current = Boolean(event.value);

      if (event.value) {
        // Drag started -> snapshot positions if multi-select pivot
        const attachedMesh = transformControls.object;
        if (attachedMesh === multiSelectPivotRef.current) {
          const nodeStarts = new Map();
          const mirrorStarts = new Map();
          const curMulti = multiSelectedNodesRef.current || [];
          for (const nid of curMulti) {
            const m = nodesGroupRef.current?.children.find(c => matchesNode(c, nid) && !c.userData?.isNonActive);
            if (m) {
              nodeStarts.set(nid, m.position.clone());
              if (symmetryEnabledRef.current) {
                const mirrorId = getSymmetricNodeId(nid);
                if (mirrorId && mirrorId !== nid) {
                  const mMesh = nodesGroupRef.current?.children.find(c => matchesNode(c, mirrorId) && !c.userData?.isNonActive);
                  if (mMesh) mirrorStarts.set(mirrorId, mMesh.position.clone());
                }
              }
            }
          }
          multiDragStateRef.current = {
            pivotStart: multiSelectPivotRef.current.position.clone(),
            nodeStarts,
            mirrorStarts
          };
        }
      } else {
        justFinishedTransformDragRef.current = Date.now();
        // Drag finished -> commit new coordinates in a single batch
        const attachedMesh = transformControls.object;
        if (attachedMesh === multiSelectPivotRef.current) {
          const { nodeStarts, mirrorStarts } = multiDragStateRef.current;
          if ((nodeStarts.size > 0 || mirrorStarts.size > 0) && onNodeMovedRef.current) {
            const batch = [];
            const processedIds = new Set();
            for (const nid of nodeStarts.keys()) {
              const mesh = nodesGroupRef.current?.children.find(c => matchesNode(c, nid) && !c.userData?.isNonActive);
              if (mesh) {
                const newPos = threeToBeamng(mesh.position.x, mesh.position.y, mesh.position.z);
                batch.push({ id: nid, pos: newPos });
                processedIds.add(nid);
              }
            }
            if (symmetryEnabledRef.current) {
              for (const mid of mirrorStarts.keys()) {
                if (processedIds.has(mid)) continue;
                const mesh = nodesGroupRef.current?.children.find(c => matchesNode(c, mid) && !c.userData?.isNonActive);
                if (mesh) {
                  const newPos = threeToBeamng(mesh.position.x, mesh.position.y, mesh.position.z);
                  batch.push({ id: mid, pos: newPos });
                  processedIds.add(mid);
                }
              }
            }
            if (batch.length > 0) {
              onNodeMovedRef.current(batch);
            }
          }
          multiDragStateRef.current = { pivotStart: null, nodeStarts: new Map(), mirrorStarts: new Map() };
        } else if (attachedMesh && attachedMesh.userData?.id) {
          const newPos = threeToBeamng(
            attachedMesh.position.x,
            attachedMesh.position.y,
            attachedMesh.position.z
          );
          if (onNodeMovedRef.current) {
            onNodeMovedRef.current(attachedMesh.userData.id, newPos);
            // Symmetrical Live Node Editing: commit counterpart node in JBeam
            if (symmetryEnabledRef.current) {
              const mirrorId = getSymmetricNodeId(attachedMesh.userData.id);
              if (mirrorId) {
                const mirrorPos = [-newPos[0], newPos[1], newPos[2]];
                onNodeMovedRef.current(mirrorId, mirrorPos);
              }
            }
          }
        }
      }
    });

    transformControls.addEventListener('objectChange', () => {
      const attachedMesh = transformControls.object;
      if (!attachedMesh) return;

      // Case A: Multi-node transformation via selection centroid pivot
      if (attachedMesh === multiSelectPivotRef.current && multiDragStateRef.current.pivotStart) {
        const delta = multiSelectPivotRef.current.position.clone().sub(multiDragStateRef.current.pivotStart);
        const { nodeStarts, mirrorStarts } = multiDragStateRef.current;
        const movedIds = new Set();

        for (const [nid, sPos] of nodeStarts.entries()) {
          const mesh = nodesGroupRef.current?.children.find(c => matchesNode(c, nid) && !c.userData?.isNonActive);
          if (mesh) {
            mesh.position.copy(sPos.clone().add(delta));
            mesh.updateMatrix();
            movedIds.add(nid);
          }
        }

        if (symmetryEnabledRef.current) {
          const mirrorDelta = new THREE.Vector3(-delta.x, delta.y, delta.z);
          for (const [mirrorId, sPos] of mirrorStarts.entries()) {
            const mesh = nodesGroupRef.current?.children.find(c => matchesNode(c, mirrorId) && !c.userData?.isNonActive);
            if (mesh) {
              mesh.position.copy(sPos.clone().add(mirrorDelta));
              mesh.updateMatrix();
              movedIds.add(mirrorId);
            }
          }
        }

        updateBeamsForMovedNodes(movedIds);
        return;
      }

      // Case B: Single node transformation
      if (attachedMesh.userData?.id) {
        // Direct DAE Mesh Magnetic Vertex Snapping
        if (snapToMeshVertexRef.current && visualMeshManagerRef.current) {
          const meshSnap = visualMeshManagerRef.current.findClosestVertex(attachedMesh.position, 0.35);
          if (meshSnap.found && meshSnap.point) {
            attachedMesh.position.copy(meshSnap.point);
          }
        }

        const livePos = threeToBeamng(
          attachedMesh.position.x,
          attachedMesh.position.y,
          attachedMesh.position.z
        );

        let mirrorId = null;
        if (symmetryEnabledRef.current) {
          mirrorId = getSymmetricNodeId(attachedMesh.userData.id);
          if (mirrorId && nodesGroupRef.current) {
            const mirroredMesh = nodesGroupRef.current.children.find(c => c.userData?.id === mirrorId && !c.userData?.isNonActive);
            if (mirroredMesh) {
              mirroredMesh.position.set(-attachedMesh.position.x, attachedMesh.position.y, attachedMesh.position.z);
              mirroredMesh.updateMatrix();
            }
          }
        }

        const movedIds = new Set([attachedMesh.userData.id]);
        if (mirrorId) movedIds.add(mirrorId);
        updateBeamsForMovedNodes(movedIds);

        if (onLiveNodeMoveRef.current) {
          onLiveNodeMoveRef.current(attachedMesh.userData.id, livePos);
        }
      }
    });

    // Raycaster for interaction & visual creation
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // High-precision node snapping helper (direct raycast + screen proximity fallback)
    const findHoveredOrNearNode = (clientX, clientY, maxScreenDistance = 18) => {
      if (!nodesGroupRef.current || !nodesGroupRef.current.parent || !camera) return null;
      if (!jbeamPartsRef.current || Object.keys(jbeamPartsRef.current).filter(k => k !== '__meta').length === 0) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // 1. Direct mesh intersection (skip hidden/un-isolated nodes)
      const hits = raycaster.intersectObjects(nodesGroupRef.current.children, false);
      const visibleHit = hits.find(h => h.object.visible && h.object.userData?.id);
      if (visibleHit) {
        return visibleHit.object;
      }

      // 2. Proximity check with screen-space distance threshold (18px radius)
      let bestNode = null;
      let minDistanceSq = maxScreenDistance * maxScreenDistance;

      for (const child of nodesGroupRef.current.children) {
        if (!child.visible || !child.userData?.id) continue;
        const screenPos = child.position.clone().project(camera);
        if (screenPos.z > 1) continue; // Behind camera
        const sx = ((screenPos.x + 1) / 2) * rect.width;
        const sy = ((-screenPos.y + 1) / 2) * rect.height;
        const distSq = (clientX - rect.left - sx) ** 2 + (clientY - rect.top - sy) ** 2;
        if (distSq < minDistanceSq) {
          minDistanceSq = distSq;
          bestNode = child;
        }
      }
      return bestNode;
    };

    // Helper: 2D segment distance squared from (px, py) to (x1, y1)-(x2, y2)
    const distToSegmentSq2D = (px, py, x1, y1, x2, y2) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) return { distSq: (px - x1) * (px - x1) + (py - y1) * (py - y1), t: 0.5 };
      let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const nx = x1 + t * dx;
      const ny = y1 + t * dy;
      return { distSq: (px - nx) * (px - nx) + (py - ny) * (py - ny), t };
    };

    // Find nearest beam segment under mouse pointer (using screen-space projection for effortless clicking at any zoom distance)
    const findHoveredBeamSegment = (clientX, clientY, maxScreenDistance = 20) => {
      const beamsGroup = beamsGroupRef.current;
      if (!beamsGroup || !beamsGroup.parent || !beamsGroup.userData?.beamSegments || !camera) return null;
      if (!jbeamPartsRef.current || Object.keys(jbeamPartsRef.current).filter(k => k !== '__meta').length === 0) return null;
      const segments = beamsGroup.userData.beamSegments;
      const rect = renderer.domElement.getBoundingClientRect();
      const mx = clientX - rect.left;
      const my = clientY - rect.top;

      let bestSeg = null;
      let minScreenDistSq = maxScreenDistance * maxScreenDistance;
      let closestCamDist = Infinity;

      for (const seg of segments) {
        if (!seg.pos1 || !seg.pos2) continue;
        const p1Proj = seg.pos1.clone().project(camera);
        const p2Proj = seg.pos2.clone().project(camera);

        // Skip if both points are behind the camera (z > 1 or z < -1 in NDC)
        if (p1Proj.z > 1 && p2Proj.z > 1) continue;
        if (p1Proj.z < -1 && p2Proj.z < -1) continue;

        const x1 = ((p1Proj.x + 1) / 2) * rect.width;
        const y1 = ((-p1Proj.y + 1) / 2) * rect.height;
        const x2 = ((p2Proj.x + 1) / 2) * rect.width;
        const y2 = ((-p2Proj.y + 1) / 2) * rect.height;

        const { distSq, t } = distToSegmentSq2D(mx, my, x1, y1, x2, y2);
        if (distSq < minScreenDistSq) {
          const ptOnBeam = new THREE.Vector3().lerpVectors(seg.pos1, seg.pos2, t);
          const camDist = camera.position.distanceTo(ptOnBeam);

          const isSignificantlyCloserOnScreen = distSq < minScreenDistSq - 16;
          const isComparableScreenDist = Math.abs(distSq - minScreenDistSq) <= 16;
          const isCloserInDepth = isComparableScreenDist && (camDist < closestCamDist);

          if (isSignificantlyCloserOnScreen || isCloserInDepth || !bestSeg) {
            minScreenDistSq = distSq;
            closestCamDist = camDist;
            bestSeg = {
              ...seg,
              pointOnBeam: ptOnBeam,
              screenDist: Math.sqrt(distSq),
              t
            };
          }
        }
      }
      return bestSeg;
    };

    // Adaptive 3D Construction Plane for Node Placement
    // Calculates view-aligned / dominant axis planes through the target reference point
    const getConstructionPlaneIntersection = (clientX, clientY) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // Height/depth reference: selected node, orbit target, or default vehicle center
      let refPt = (orbitControls && orbitControls.target) ? orbitControls.target.clone() : new THREE.Vector3(0, 0.5, 0);
      if (selectedNodeId && nodePosMapRef.current && nodePosMapRef.current.has(selectedNodeId)) {
        refPt = nodePosMapRef.current.get(selectedNodeId).clone();
      }

      const intersect = new THREE.Vector3();
      const curView = viewPresetRef.current;

      // 1. View-aligned construction planes for Top, Front, Side orthographic presets
      if (curView === 'top') {
        const topPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -refPt.y);
        if (raycaster.ray.intersectPlane(topPlane, intersect)) return intersect;
      } else if (curView === 'front') {
        const frontPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -refPt.z);
        if (raycaster.ray.intersectPlane(frontPlane, intersect)) return intersect;
      } else if (curView === 'side') {
        const sidePlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -refPt.x);
        if (raycaster.ray.intersectPlane(sidePlane, intersect)) return intersect;
      }

      // 2. Perspective / 3D Orbit: dynamically pick the dominant camera viewing axis plane
      const camDir = camera.getWorldDirection(new THREE.Vector3());
      const absX = Math.abs(camDir.x);
      const absY = Math.abs(camDir.y);
      const absZ = Math.abs(camDir.z);

      if (absY >= absX && absY >= absZ) {
        // Camera looking primarily up/down -> horizontal plane (normal 0, 1, 0)
        const hPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -refPt.y);
        if (raycaster.ray.intersectPlane(hPlane, intersect)) return intersect;
      } else if (absZ >= absX && absZ >= absY) {
        // Camera looking primarily front/back -> coronal plane (normal 0, 0, 1)
        const cPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -refPt.z);
        if (raycaster.ray.intersectPlane(cPlane, intersect)) return intersect;
      } else {
        // Camera looking primarily left/right -> sagittal side plane (normal 1, 0, 0)
        const sPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -refPt.x);
        if (raycaster.ray.intersectPlane(sPlane, intersect)) return intersect;
      }

      // 3. Fallback: Plane facing camera through reference point
      const camNormal = camDir.clone().negate();
      const camPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(camNormal, refPt);
      if (raycaster.ray.intersectPlane(camPlane, intersect)) {
        return intersect;
      }

      return null;
    };

    // Unified 3D Space Node Placement Resolver
    // Resolves screen coordinates into precise 3D points via direct DAE mesh raycasting or adaptive planes
    const resolveNodePlacementPoint = (clientX, clientY) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // 1. Direct DAE 3D Mesh Magnetic Vertex / Surface Snapping
      if (snapToMeshVertexRef.current && visualMeshManagerRef.current) {
        const meshSnap = visualMeshManagerRef.current.snapRayToMesh(raycaster, 0.35);
        if (meshSnap.found && meshSnap.point) {
          const threePt = meshSnap.point.clone();
          const bPos = threeToBeamng(threePt.x, threePt.y, threePt.z);
          // Centerline snap: if lateral position within 3cm of center, snap to 0
          if (Math.abs(bPos[0]) < 0.03) {
            bPos[0] = 0;
            const reThree = beamngToThree(bPos[0], bPos[1], bPos[2]);
            threePt.x = reThree.x;
          }
          return {
            threePoint: threePt,
            beamngPos: bPos,
            isMeshSnap: true,
            isVertex: meshSnap.isVertex,
            submesh: meshSnap.submesh
          };
        }
      }

      // 2. Adaptive Construction Plane
      const planeIntersect = getConstructionPlaneIntersection(clientX, clientY);
      if (!planeIntersect) return null;

      let bPos = threeToBeamng(planeIntersect.x, planeIntersect.y, planeIntersect.z);
      const snapStep = gridSnapRef.current;

      // Only apply grid snap rounding when Grid Snap is active and DAE Snap is OFF
      if (!snapToMeshVertexRef.current && snapStep > 0) {
        bPos[0] = Math.round(bPos[0] / snapStep) * snapStep;
        bPos[1] = Math.round(bPos[1] / snapStep) * snapStep;
        bPos[2] = Math.round(bPos[2] / snapStep) * snapStep;
      }

      // Centerline snap
      if (Math.abs(bPos[0]) < 0.03) {
        bPos[0] = 0;
      }

      const snappedThree = beamngToThree(bPos[0], bPos[1], bPos[2]);
      return {
        threePoint: snappedThree,
        beamngPos: bPos,
        isMeshSnap: false,
        isVertex: false,
        submesh: null
      };
    };

    // Pointer Move Handler for live hover cues & creation previews
    const handlePointerMove = (e) => {
      // If user is dragging or interacting with the transform gizmo, skip hover updates
      if (isTransformDraggingRef.current || isTransformInteractingRef.current || (transformControlsRef.current && transformControlsRef.current.dragging)) {
        return;
      }

      // 0. Marquee Box Dragging
      if (isBoxSelectingRef.current) {
        const minX = Math.min(pointerDownPosRef.current.x, e.clientX);
        const maxX = Math.max(pointerDownPosRef.current.x, e.clientX);
        const minY = Math.min(pointerDownPosRef.current.y, e.clientY);
        const maxY = Math.max(pointerDownPosRef.current.y, e.clientY);
        setMarqueeBox({ x: minX, y: minY, w: maxX - minX, h: maxY - minY });
        return;
      }

      const curTool = activeToolRef.current;

      if (!jbeamPartsRef.current || Object.keys(jbeamPartsRef.current).filter(k => k !== '__meta').length === 0) {
        hoveredNodeIdRef.current = null;
        setHoveredNodeId(null);
        hoveredNodeInfoRef.current = null;
        setHoveredNodeInfo(null);
        hoveredBeamRef.current = null;
        setHoveredBeamInfo(null);
        if (ghostMeshRef.current) { ghostMeshRef.current.position.set(0, -9999, 0); ghostMeshRef.current.visible = false; }
        if (mirrorGhostMeshRef.current) { mirrorGhostMeshRef.current.position.set(0, -9999, 0); mirrorGhostMeshRef.current.visible = false; }
        if (snapRingRef.current) { snapRingRef.current.position.set(0, -9999, 0); snapRingRef.current.visible = false; }
        if (rubberBandLineRef.current) rubberBandLineRef.current.visible = false;
        if (triPreviewMeshRef.current) triPreviewMeshRef.current.visible = false;
        if (normalArrowRef.current) normalArrowRef.current.visible = false;
        setCursorCoords(null);
        setBeamLength(null);
        return;
      }

      const hitNode = findHoveredOrNearNode(e.clientX, e.clientY);

      if (hitNode) {
        const nid = hitNode.userData.id;
        const nPart = hitNode.userData.partName;
        const nTab = hitNode.userData.tabTitle || nPart || '';
        const isNonActive = Boolean(hitNode.userData.isNonActive);
        hoveredNodeIdRef.current = nid;
        setHoveredNodeId(nid);
        const hInfo = {
          id: nid,
          partName: nPart,
          tabTitle: nTab,
          isNonActive,
          mesh: hitNode
        };
        hoveredNodeInfoRef.current = hInfo;
        setHoveredNodeInfo(hInfo);
      } else {
        hoveredNodeIdRef.current = null;
        setHoveredNodeId(null);
        hoveredNodeInfoRef.current = null;
        setHoveredNodeInfo(null);
      }

      // 2. Mode-Specific Visual Feedback
      if (!jbeamPartsRef.current || Object.keys(jbeamPartsRef.current).filter(k => k !== '__meta').length === 0) {
        hoveredBeamRef.current = null;
        setHoveredBeamInfo(null);
        ghostMesh.position.set(0, -9999, 0);
        ghostMesh.visible = false;
        mirrorGhostMesh.position.set(0, -9999, 0);
        mirrorGhostMesh.visible = false;
        snapRing.position.set(0, -9999, 0);
        snapRing.visible = false;
        rubberBandLine.visible = false;
        triMesh.visible = false;
        normalArrow.visible = false;
        setCursorCoords(null);
        setBeamLength(null);
        return;
      }

      if (curTool === 'addNode') {
        // Check if hovering near an existing beam to offer Subdivide Node insertion
        const hitBeam = findHoveredBeamSegment(e.clientX, e.clientY);
        if (hitBeam) {
          hoveredBeamRef.current = hitBeam;
          setHoveredBeamInfo(hitBeam);
          ghostMesh.position.copy(hitBeam.pointOnBeam);
          ghostMesh.visible = true;

          const bPos = threeToBeamng(hitBeam.pointOnBeam.x, hitBeam.pointOnBeam.y, hitBeam.pointOnBeam.z);
          if (symmetryEnabledRef.current && Math.abs(bPos[0]) > 0.005) {
            mirrorGhostMesh.position.set(-hitBeam.pointOnBeam.x, hitBeam.pointOnBeam.y, hitBeam.pointOnBeam.z);
            mirrorGhostMesh.visible = true;
          } else {
            mirrorGhostMesh.visible = false;
          }

          snapRing.position.copy(hitBeam.pointOnBeam);
          snapRing.visible = true;
          setCursorCoords(bPos);
          return;
        }

        hoveredBeamRef.current = null;
        setHoveredBeamInfo(null);

        const placement = resolveNodePlacementPoint(e.clientX, e.clientY);
        if (placement) {
          ghostMesh.position.copy(placement.threePoint);
          ghostMesh.visible = true;

          if (placement.isMeshSnap) {
            snapRing.position.copy(placement.threePoint);
            snapRing.visible = true;
          } else {
            snapRing.visible = false;
          }

          if (symmetryEnabledRef.current && Math.abs(placement.beamngPos[0]) > 0.005) {
            mirrorGhostMesh.position.set(-placement.threePoint.x, placement.threePoint.y, placement.threePoint.z);
            mirrorGhostMesh.visible = true;
          } else {
            mirrorGhostMesh.visible = false;
          }

          setCursorCoords(placement.beamngPos);
        }
      } else if (curTool === 'addBeam') {
        ghostMesh.visible = false;
        mirrorGhostMesh.visible = false;

        let targetPos = null;
        if (hitNode) {
          targetPos = hitNode.position.clone();
          snapRing.position.copy(targetPos);
          snapRing.lookAt(camera.position);
          snapRing.visible = true;
        } else {
          snapRing.visible = false;
          const planeIntersect = getConstructionPlaneIntersection(e.clientX, e.clientY);
          if (planeIntersect) {
            targetPos = planeIntersect;
          }
        }

        if (pendingBeamStartRef.current && targetPos) {
          const startData = pendingBeamStartRef.current;
          const startPos = startData.pos || (typeof startData === 'string' && nodePosMapRef.current ? nodePosMapRef.current.get(startData) : null);
          if (startPos) {
            rubberBandLine.geometry.setFromPoints([startPos, targetPos]);
            rubberBandLine.visible = true;
            const dist = startPos.distanceTo(targetPos);
            setBeamLength(dist);

            const isCrossPart = hitNode && (
              hitNode.userData.partName !== startData.partName ||
              Boolean(hitNode.userData.isNonActive) !== Boolean(startData.isNonActive)
            );
            if (isCrossPart) {
              rubberBandLine.material.color.setHex(0xf59e0b); // Bright Amber / Gold for cross-part mount preview!
            } else {
              rubberBandLine.material.color.setHex(0x38bdf8); // Sky blue
            }
          }
        } else {
          rubberBandLine.visible = false;
          setBeamLength(null);
        }
      } else if (curTool === 'addTri') {
        ghostMesh.visible = false;
        mirrorGhostMesh.visible = false;

        let targetPos = null;
        if (hitNode) {
          targetPos = hitNode.position.clone();
          snapRing.position.copy(targetPos);
          snapRing.lookAt(camera.position);
          snapRing.visible = true;
        } else {
          snapRing.visible = false;
          const planeIntersect = getConstructionPlaneIntersection(e.clientX, e.clientY);
          if (planeIntersect) {
            targetPos = planeIntersect;
          }
        }

        const triNodes = pendingTriNodesRef.current;
        if (triNodes.length === 1 && targetPos && nodePosMapRef.current) {
          const p0 = nodePosMapRef.current.get(triNodes[0]);
          if (p0) {
            rubberBandLine.geometry.setFromPoints([p0, targetPos]);
            rubberBandLine.visible = true;
            triMesh.visible = false;
            normalArrow.visible = false;
          }
        } else if (triNodes.length === 2 && targetPos && nodePosMapRef.current) {
          const p0 = nodePosMapRef.current.get(triNodes[0]);
          const p1 = nodePosMapRef.current.get(triNodes[1]);
          if (p0 && p1) {
            rubberBandLine.visible = false;
            triMesh.geometry.setFromPoints([p0, p1, targetPos]);
            triMesh.geometry.computeVertexNormals();
            triMesh.visible = true;

            // Compute outward normal
            const vA = new THREE.Vector3().subVectors(p1, p0);
            const vB = new THREE.Vector3().subVectors(targetPos, p0);
            const normal = new THREE.Vector3().crossVectors(vA, vB).normalize();
            const center = new THREE.Vector3().add(p0).add(p1).add(targetPos).divideScalar(3);

            normalArrow.position.copy(center);
            normalArrow.setDirection(normal);
            normalArrow.visible = true;
          }
        } else {
          rubberBandLine.visible = false;
          triMesh.visible = false;
          normalArrow.visible = false;
        }
      } else if (curTool === 'addQuad') {
        ghostMesh.visible = false;
        mirrorGhostMesh.visible = false;

        let targetPos = null;
        if (hitNode) {
          targetPos = hitNode.position.clone();
          snapRing.position.copy(targetPos);
          snapRing.lookAt(camera.position);
          snapRing.visible = true;
        } else {
          snapRing.visible = false;
          const planeIntersect = getConstructionPlaneIntersection(e.clientX, e.clientY);
          if (planeIntersect) {
            targetPos = planeIntersect;
          }
        }

        const quadNodes = pendingQuadNodesRef.current;
        if (quadNodes.length === 1 && targetPos && nodePosMapRef.current) {
          const p0 = nodePosMapRef.current.get(quadNodes[0]);
          if (p0) {
            rubberBandLine.geometry.setFromPoints([p0, targetPos]);
            rubberBandLine.visible = true;
            triMesh.visible = false;
            normalArrow.visible = false;
          }
        } else if (quadNodes.length === 2 && targetPos && nodePosMapRef.current) {
          const p0 = nodePosMapRef.current.get(quadNodes[0]);
          const p1 = nodePosMapRef.current.get(quadNodes[1]);
          if (p0 && p1) {
            rubberBandLine.visible = false;
            triMesh.geometry.setFromPoints([p0, p1, targetPos]);
            triMesh.geometry.computeVertexNormals();
            triMesh.visible = true;
            normalArrow.visible = false;
          }
        } else if (quadNodes.length === 3 && targetPos && nodePosMapRef.current) {
          const p0 = nodePosMapRef.current.get(quadNodes[0]);
          const p1 = nodePosMapRef.current.get(quadNodes[1]);
          const p2 = nodePosMapRef.current.get(quadNodes[2]);
          if (p0 && p1 && p2) {
            rubberBandLine.visible = false;
            triMesh.geometry.setFromPoints([p0, p1, p2, p0, p2, targetPos]);
            triMesh.geometry.computeVertexNormals();
            triMesh.visible = true;

            const vA = new THREE.Vector3().subVectors(p1, p0);
            const vB = new THREE.Vector3().subVectors(p2, p0);
            const normal = new THREE.Vector3().crossVectors(vA, vB).normalize();
            const center = new THREE.Vector3().add(p0).add(p1).add(p2).add(targetPos).divideScalar(4);

            normalArrow.position.copy(center);
            normalArrow.setDirection(normal);
            normalArrow.visible = true;
          }
        } else {
          rubberBandLine.visible = false;
          triMesh.visible = false;
          normalArrow.visible = false;
        }
      } else {
        // Select tool
        ghostMesh.visible = false;
        mirrorGhostMesh.visible = false;
        snapRing.visible = false;
        rubberBandLine.visible = false;
        triMesh.visible = false;
        normalArrow.visible = false;
      }
    };

    // Track click vs drag for OrbitControls & Marquee Box Selection
    const handlePointerDown = (e) => {
      pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
      const curTool = activeToolRef.current;

      // If user presses pointer on the TransformControls gizmo axis, disable OrbitControls so dragging doesn't rotate camera
      if (transformControlsRef.current && (transformControlsRef.current.dragging || transformControlsRef.current.axis !== null)) {
        if (orbitControls) orbitControls.enabled = false;
      }

      // In box select or creation modes, keep OrbitControls from hijacking Left-Click
      if (e.button === 0 && orbitControls) {
        if (curTool === 'boxSelect' || (curTool === 'select' && e.shiftKey)) {
          isBoxSelectingRef.current = true;
          orbitControls.enabled = false;
        } else if (curTool !== 'select') {
          orbitControls.enabled = false;
        }
      }
    };

    // Pointer Click Handler (fires on release)
    const handlePointerUp = (e) => {
      if (e.button !== 0) return; // Only process left click

      // If user was actively dragging the transform gizmo, do NOT process click raycast or deselect
      const justDraggedTransform = (Date.now() - (justFinishedTransformDragRef.current || 0)) < 250;
      const wasTransformDragging = isTransformDraggingRef.current || justDraggedTransform;

      isTransformInteractingRef.current = false;
      isTransformDraggingRef.current = false;

      // Restore orbit controls
      if (orbitControls) {
        orbitControls.enabled = true;
      }

      if (wasTransformDragging) {
        justFinishedTransformDragRef.current = 0;
        return;
      }

      const distMoved = Math.hypot(
        e.clientX - pointerDownPosRef.current.x,
        e.clientY - pointerDownPosRef.current.y
      );

      const curTool = activeToolRef.current;

      if (!jbeamPartsRef.current || Object.keys(jbeamPartsRef.current).filter(k => k !== '__meta').length === 0) {
        hoveredNodeIdRef.current = null;
        setHoveredNodeId(null);
        hoveredNodeInfoRef.current = null;
        setHoveredNodeInfo(null);
        hoveredBeamRef.current = null;
        setHoveredBeamInfo(null);
        if (ghostMeshRef.current) { ghostMeshRef.current.position.set(0, -9999, 0); ghostMeshRef.current.visible = false; }
        if (mirrorGhostMeshRef.current) { mirrorGhostMeshRef.current.position.set(0, -9999, 0); mirrorGhostMeshRef.current.visible = false; }
        if (snapRingRef.current) { snapRingRef.current.position.set(0, -9999, 0); snapRingRef.current.visible = false; }
        if (rubberBandLineRef.current) rubberBandLineRef.current.visible = false;
        if (triPreviewMeshRef.current) triPreviewMeshRef.current.visible = false;
        if (normalArrowRef.current) normalArrowRef.current.visible = false;
        setCursorCoords(null);
        setBeamLength(null);
        return;
      }

      const hitNode = findHoveredOrNearNode(e.clientX, e.clientY);

      if (curTool === 'addNode') {
        if (distMoved <= 16) {
          // If hovering over an existing beam, subdivide it by inserting a node in between!
          if (hoveredBeamRef.current) {
            const hitBeam = hoveredBeamRef.current;
            const bPos = threeToBeamng(hitBeam.pointOnBeam.x, hitBeam.pointOnBeam.y, hitBeam.pointOnBeam.z);
            if (onSubdivideBeamRef.current) {
              onSubdivideBeamRef.current({
                partName: hitBeam.partName,
                id1: hitBeam.id1,
                id2: hitBeam.id2,
                point: bPos
              });
            }
            return;
          }

          const placement = resolveNodePlacementPoint(e.clientX, e.clientY);
          if (placement && onAddNodeRef.current) {
            onAddNodeRef.current(placement.beamngPos);
          }
        }
        return;
      }

      if (curTool === 'addBeam') {
        if (hitNode) {
          const nid = hitNode.userData.id;
          const nPart = hitNode.userData.partName;
          const nTab = hitNode.userData.tabTitle || nPart || 'component';
          const isNonActive = Boolean(hitNode.userData.isNonActive);
          const isExternal = Boolean(hitNode.userData.isExternal);

          if (!pendingBeamStartRef.current) {
            const startData = {
              id: nid,
              partName: nPart,
              tabTitle: nTab,
              isNonActive,
              isExternal,
              pos: hitNode.position.clone(),
              mesh: hitNode
            };
            setPendingBeamStart(startData);
            pendingBeamStartRef.current = startData;
          } else {
            const startData = pendingBeamStartRef.current;
            // If user clicked the exact same mesh object, cancel pending start
            if (startData.mesh === hitNode) {
              setPendingBeamStart(null);
              pendingBeamStartRef.current = null;
              if (rubberBandLineRef.current) rubberBandLineRef.current.visible = false;
              return;
            }

            const isCrossPart = startData.partName !== nPart || startData.isNonActive !== isNonActive || startData.isExternal !== isExternal;
            const hasCollision = isCrossPart && (startData.id === nid);
            const presetProps = BEAM_PRESETS[beamPresetRef.current]?.properties || {};

            if (onAddBeamRef.current) {
              onAddBeamRef.current(startData.id, nid, presetProps, isCrossPart, {
                startData,
                endData: { id: nid, partName: nPart, tabTitle: nTab, isNonActive, isExternal, pos: hitNode.position.clone(), mesh: hitNode },
                hasCollision
              });
            }

            if (isCrossPart) {
              // End chain after cross-part link to allow clean next selection
              setPendingBeamStart(null);
              pendingBeamStartRef.current = null;
              if (rubberBandLineRef.current) rubberBandLineRef.current.visible = false;
            } else {
              // Continuous chaining within the same component
              const nextStart = {
                id: nid,
                partName: nPart,
                tabTitle: nTab,
                isNonActive,
                pos: hitNode.position.clone(),
                mesh: hitNode
              };
              setPendingBeamStart(nextStart);
              pendingBeamStartRef.current = nextStart;
            }
          }
        } else if (distMoved <= 8) {
          // Clicked empty space: end chain
          setPendingBeamStart(null);
          pendingBeamStartRef.current = null;
          if (rubberBandLineRef.current) rubberBandLineRef.current.visible = false;
        }
        return;
      }

      if (curTool === 'addTri') {
        if (hitNode) {
          const nid = hitNode.userData.id;
          const currentList = pendingTriNodesRef.current;
          if (currentList.length === 0) {
            setPendingTriNodes([nid]);
            pendingTriNodesRef.current = [nid];
          } else if (currentList.length === 1 && currentList[0] !== nid) {
            setPendingTriNodes([currentList[0], nid]);
            pendingTriNodesRef.current = [currentList[0], nid];
          } else if (currentList.length === 2 && !currentList.includes(nid)) {
            if (onAddTriangleRef.current) {
              onAddTriangleRef.current(currentList[0], currentList[1], nid);
            }
            setPendingTriNodes([]);
            pendingTriNodesRef.current = [];
            if (rubberBandLineRef.current) rubberBandLineRef.current.visible = false;
            if (triPreviewMeshRef.current) triPreviewMeshRef.current.visible = false;
            if (normalArrowRef.current) normalArrowRef.current.visible = false;
          }
        }
        return;
      }

      if (curTool === 'addQuad') {
        if (hitNode) {
          const nid = hitNode.userData.id;
          const currentList = pendingQuadNodesRef.current;
          if (currentList.length === 0) {
            setPendingQuadNodes([nid]);
            pendingQuadNodesRef.current = [nid];
          } else if (currentList.length === 1 && currentList[0] !== nid) {
            setPendingQuadNodes([currentList[0], nid]);
            pendingQuadNodesRef.current = [currentList[0], nid];
          } else if (currentList.length === 2 && !currentList.includes(nid)) {
            setPendingQuadNodes([currentList[0], currentList[1], nid]);
            pendingQuadNodesRef.current = [currentList[0], currentList[1], nid];
          } else if (currentList.length === 3 && !currentList.includes(nid)) {
            if (onAddQuadRef.current) {
              onAddQuadRef.current(currentList[0], currentList[1], currentList[2], nid);
            }
            setPendingQuadNodes([]);
            pendingQuadNodesRef.current = [];
            if (rubberBandLineRef.current) rubberBandLineRef.current.visible = false;
            if (triPreviewMeshRef.current) triPreviewMeshRef.current.visible = false;
            if (normalArrowRef.current) normalArrowRef.current.visible = false;
          }
        }
        return;
      }

      if (curTool === 'batchRename') {
        if (hitNode && distMoved <= 16) {
          const clickedId = hitNode.userData.id;
          if (onBatchRenameNodeRef.current) {
            onBatchRenameNodeRef.current(clickedId);
          }
        }
        return;
      }

      if (curTool === 'extrude') {
        if (distMoved <= 16) {
          const placement = resolveNodePlacementPoint(e.clientX, e.clientY);
          if (placement) {
            const bPos = placement.beamngPos;
            const refNodeId = selectedNodeId || (multiSelectedNodesRef.current[0]);
            let delta = [0, -0.3, 0];
            if (refNodeId && nodePosMapRef.current && nodePosMapRef.current.has(refNodeId)) {
              const refThree = nodePosMapRef.current.get(refNodeId);
              const refB = threeToBeamng(refThree.x, refThree.y, refThree.z);
              delta = [bPos[0] - refB[0], bPos[1] - refB[1], bPos[2] - refB[2]];
            }
            handleExtrude(delta);
          }
        }
        return;
      }

      // 0. Handle Box Marquee Drag Release
      if (isBoxSelectingRef.current) {
        isBoxSelectingRef.current = false;
        setMarqueeBox(null);
        if (orbitControls) orbitControls.enabled = true;

        if (distMoved > 8) {
          const minX = Math.min(pointerDownPosRef.current.x, e.clientX);
          const maxX = Math.max(pointerDownPosRef.current.x, e.clientX);
          const minY = Math.min(pointerDownPosRef.current.y, e.clientY);
          const maxY = Math.max(pointerDownPosRef.current.y, e.clientY);

          const rect = renderer.domElement.getBoundingClientRect();
          const newlySelected = [];
          if (nodesGroupRef.current) {
            for (const child of nodesGroupRef.current.children) {
              if (!child.userData?.id) continue;
              const screenPos = child.position.clone().project(camera);
              if (screenPos.z > 1) continue; // Behind camera
              const sx = ((screenPos.x + 1) / 2) * rect.width + rect.left;
              const sy = ((-screenPos.y + 1) / 2) * rect.height + rect.top;
              if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
                newlySelected.push(child.userData.id);
              }
            }
          }

          if (newlySelected.length > 0) {
            const merged = e.shiftKey
              ? Array.from(new Set([...(multiSelectedNodesRef.current || []), ...newlySelected]))
              : newlySelected;
            setMultiSelectedNodes(merged);
            multiSelectedNodesRef.current = merged;
            if (merged.length === 1) {
              if (onSelectNodeRef.current) onSelectNodeRef.current(merged[0]);
            } else {
              if (onMultiSelectChange) onMultiSelectChange(merged);
              if (onSelectNodeRef.current) onSelectNodeRef.current(merged[0], true);
            }
            updateTransformGizmoAttachmentRef.current?.(merged, merged[0]);
            return;
          }
        }
      }

      if (distMoved > 10) {
        // User dragged camera to orbit in select mode
        return;
      }

      // Default: Select Tool (Single Click)
      // 1. Direct Node Mesh Intersection & Screen-Space Proximity Snapping
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      let nearestNode = null;
      let minNodeDist = 18; // 18px snapping radius for nodes

      if (nodesGroupRef.current && camera) {
        // Direct raycast hit takes absolute precedence (screenDist = 0)
        const directNodeHits = raycaster.intersectObjects(nodesGroupRef.current.children || [], false);
        if (directNodeHits.length > 0 && directNodeHits[0].object.userData?.id) {
          nearestNode = { mesh: directNodeHits[0].object, screenDist: 0 };
        } else {
          // Screen proximity to node centers
          for (const child of nodesGroupRef.current.children) {
            if (!child.userData?.id) continue;
            const screenPos = child.position.clone().project(camera);
            if (screenPos.z > 1 || screenPos.z < -1) continue;
            const sx = ((screenPos.x + 1) / 2) * rect.width + rect.left;
            const sy = ((-screenPos.y + 1) / 2) * rect.height + rect.top;
            const dist = Math.hypot(e.clientX - sx, e.clientY - sy);
            if (dist < minNodeDist) {
              minNodeDist = dist;
              nearestNode = { mesh: child, screenDist: dist };
            }
          }
        }
      }

      // 2. Screen-Space Beam Proximity (16px tolerance)
      const hitBeam = findHoveredBeamSegment(e.clientX, e.clientY, 16);

      // 3. 3D Surface Face Raycasting (Triangles & Quads)
      const surfacesGroup = surfacesGroupRef.current;
      let surfaceHitMeta = null;
      if (surfacesGroup && surfacesGroup.children.length > 0) {
        const surfaceMeshes = surfacesGroup.children.filter(c => c.userData?.type === 'surface_mesh');
        if (surfaceMeshes.length > 0) {
          const sHits = raycaster.intersectObjects(surfaceMeshes, false);
          if (sHits.length > 0) {
            const hit = sHits[0];
            if (hit.faceIndex !== undefined && hit.object.userData?.surfaceLookup) {
              surfaceHitMeta = hit.object.userData.surfaceLookup[hit.faceIndex];
            }
          }
        }
      }

      // Determine what was clicked with smart prioritization
      let selectedType = null;
      if (nearestNode && hitBeam) {
        // When clicking near a node junction, favor the node unless mouse is significantly closer to beam line
        if (nearestNode.screenDist <= 8 || nearestNode.screenDist <= hitBeam.screenDist + 4) {
          selectedType = 'node';
        } else {
          selectedType = 'beam';
        }
      } else if (nearestNode) {
        selectedType = 'node';
      } else if (hitBeam && (!surfaceHitMeta || hitBeam.screenDist <= 14)) {
        selectedType = 'beam';
      } else if (surfaceHitMeta) {
        selectedType = 'surface';
      } else if (hitBeam) {
        selectedType = 'beam';
      }

      if (selectedType === 'node') {
        const targetNode = nearestNode.mesh;
        const nid = targetNode.userData.id;
        if (e.shiftKey || e.ctrlKey) {
          const prev = multiSelectedNodesRef.current || [];
          const next = prev.includes(nid) ? prev.filter(x => x !== nid) : [...prev, nid];
          setMultiSelectedNodes(next);
          multiSelectedNodesRef.current = next;
          updateTransformGizmoAttachmentRef.current?.(next, next[next.length - 1]);
          if (next.length > 1) {
            if (onMultiSelectChange) onMultiSelectChange(next);
            if (onSelectNodeRef.current) onSelectNodeRef.current(next[next.length - 1], true);
          } else if (next.length === 1) {
            if (onSelectNodeRef.current) onSelectNodeRef.current(next[0]);
          } else {
            if (onSelectNodeRef.current) onSelectNodeRef.current(null);
          }
        } else {
          setMultiSelectedNodes([nid]);
          multiSelectedNodesRef.current = [nid];
          if (transformControlsRef.current && (activeToolRef.current === 'select' || activeToolRef.current === 'boxSelect')) {
            transformControlsRef.current.attach(targetNode);
          }
          if (onSelectNodeRef.current) onSelectNodeRef.current(nid);
        }
        return;
      }

      if (selectedType === 'beam') {
        if (transformControlsRef.current) transformControlsRef.current.detach();
        setMultiSelectedNodes([]);
        multiSelectedNodesRef.current = [];
        if (onSelectBeamRef.current) {
          onSelectBeamRef.current(hitBeam.partName, hitBeam.beamKey, hitBeam.beamData || {
            'id1:': hitBeam.id1,
            'id2:': hitBeam.id2,
            beamType: hitBeam.beamType,
            partName: hitBeam.partName,
            beamKey: hitBeam.beamKey
          });
        }
        return;
      }

      if (selectedType === 'surface') {
        if (transformControlsRef.current) transformControlsRef.current.detach();
        setMultiSelectedNodes([]);
        multiSelectedNodesRef.current = [];
        const pName = surfaceHitMeta.partName || Object.keys(jbeamParts || {})[0] || 'default_part';
        if (onSelectSurfaceRef.current) {
          onSelectSurfaceRef.current({ ...surfaceHitMeta, partName: pName });
        }
        return;
      }

      // Check Pressure Wheels 3D raycasting
      let hitWheel = null;
      if (pressureWheelsGroupRef.current && pressureWheelsGroupRef.current.children.length > 0) {
        const wheelHits = raycaster.intersectObjects(pressureWheelsGroupRef.current.children, true);
        if (wheelHits.length > 0) {
          let curr = wheelHits[0].object;
          while (curr && curr !== pressureWheelsGroupRef.current) {
            if (curr.userData?.type === 'pressureWheel' && curr.userData.wheelDef) {
              hitWheel = curr.userData;
              break;
            }
            curr = curr.parent;
          }
        }
      }

      if (hitWheel && !selectedType) {
        if (transformControlsRef.current) transformControlsRef.current.detach();
        setMultiSelectedNodes([]);
        multiSelectedNodesRef.current = [];
        if (onSelectWheelRef.current) {
          onSelectWheelRef.current(hitWheel);
        }
        return;
      }

      // Check Torsion Bars 3D raycasting
      let hitTorsionBar = null;
      if (torsionBarsGroupRef.current && torsionBarsGroupRef.current.children.length > 0) {
        const tbHits = raycaster.intersectObjects(torsionBarsGroupRef.current.children, true);
        if (tbHits.length > 0) {
          let curr = tbHits[0].object;
          while (curr && curr !== torsionBarsGroupRef.current) {
            if (curr.userData?.type === 'torsionbar' && curr.userData.torsionBar) {
              hitTorsionBar = curr.userData;
              break;
            }
            curr = curr.parent;
          }
        }
      }

      if (hitTorsionBar && !selectedType) {
        if (transformControlsRef.current) transformControlsRef.current.detach();
        setMultiSelectedNodes([]);
        multiSelectedNodesRef.current = [];
        if (onSelectTorsionBarRef.current) {
          onSelectTorsionBarRef.current(hitTorsionBar.torsionBar);
        }
        return;
      }

      // Check SlideNodes & Rails 3D raycasting
      let hitSlideNodeOrRail = null;
      if (slideNodesGroupRef.current && slideNodesGroupRef.current.children.length > 0) {
        const snHits = raycaster.intersectObjects(slideNodesGroupRef.current.children, true);
        if (snHits.length > 0) {
          let curr = snHits[0].object;
          while (curr && curr !== slideNodesGroupRef.current) {
            if (curr.userData?.type === 'slidenode' || curr.userData?.type === 'rail') {
              hitSlideNodeOrRail = curr.userData;
              break;
            }
            curr = curr.parent;
          }
        }
      }

      if (hitSlideNodeOrRail && !selectedType) {
        if (transformControlsRef.current) transformControlsRef.current.detach();
        setMultiSelectedNodes([]);
        multiSelectedNodesRef.current = [];
        if (onSelectSlideNodeRef.current) {
          onSelectSlideNodeRef.current(hitSlideNodeOrRail);
        }
        return;
      }

      // Direct 3D Submesh Raycasting (Collada .dae Visual Mesh Panel)
      const visualMeshManager = visualMeshManagerRef.current;
      if (visualMeshManager && visualMeshManager.meshGroup && visualMeshManager.meshGroup.visible && visualMeshManager.meshGroup.children.length > 0) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        const submeshHits = raycaster.intersectObjects(visualMeshManager.meshGroup.children, true);
        if (submeshHits.length > 0) {
          const hitObj = submeshHits[0].object;
          const submeshName = hitObj.name;
          if (submeshName && onHighlightSubmeshRef.current) {
            if (transformControlsRef.current) transformControlsRef.current.detach();
            setMultiSelectedNodes([]);
            multiSelectedNodesRef.current = [];
            onHighlightSubmeshRef.current(submeshName);
            if (onSelectNodeRef.current) onSelectNodeRef.current(null);
            if (onSelectBeamRef.current) onSelectBeamRef.current(null, null, null);
            if (onSelectSurfaceRef.current) onSelectSurfaceRef.current(null);
            if (onSelectWheelRef.current) onSelectWheelRef.current(null);
            if (onSelectTorsionBarRef.current) onSelectTorsionBarRef.current(null);
            if (onSelectSlideNodeRef.current) onSelectSlideNodeRef.current(null);
            return;
          }
        }
      }

      // Clicked empty space
      if (transformControlsRef.current) transformControlsRef.current.detach();
      setMultiSelectedNodes([]);
      multiSelectedNodesRef.current = [];
      if (onSelectNodeRef.current) onSelectNodeRef.current(null);
      if (onSelectBeamRef.current) onSelectBeamRef.current(null, null, null);
      if (onSelectSurfaceRef.current) onSelectSurfaceRef.current(null);
      if (onSelectWheelRef.current) onSelectWheelRef.current(null);
      if (onSelectTorsionBarRef.current) onSelectTorsionBarRef.current(null);
      if (onSelectSlideNodeRef.current) onSelectSlideNodeRef.current(null);
      if (onHighlightSubmeshRef.current) onHighlightSubmeshRef.current(null);
    };

    const handleContextMenu = (e) => {
      e.preventDefault();
      handleCancelTool();
    };

    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.closest('.monaco-editor')) {
        return;
      }

      if (e.altKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setFocusConnectedTopology(prev => !prev);
        return;
      }

      if (e.key === 'w' || e.key === 'W' || e.key === 'v' || e.key === 'V') {
        handleSetTool('select');
      } else if (e.key === 'b' || e.key === 'B') {
        handleSetTool(activeToolRef.current === 'boxSelect' ? 'select' : 'boxSelect');
      } else if (e.key === 'n' || e.key === 'N') {
        handleSetTool(activeToolRef.current === 'addNode' ? 'select' : 'addNode');
      } else if (e.key === 'c' || e.key === 'C') {
        handleSetTool(activeToolRef.current === 'addBeam' ? 'select' : 'addBeam');
      } else if (e.key === 't' || e.key === 'T') {
        handleSetTool(activeToolRef.current === 'addTri' ? 'select' : 'addTri');
      } else if (e.key === 'q' || e.key === 'Q') {
        handleSetTool(activeToolRef.current === 'addQuad' ? 'select' : 'addQuad');
      } else if (e.key === 'e' || e.key === 'E') {
        if (selectedNodeId || multiSelectedNodesRef.current.length > 0) {
          handleExtrude([0, -0.3, 0]);
        } else {
          handleSetTool(activeToolRef.current === 'extrude' ? 'select' : 'extrude');
        }
      } else if (e.key === 'f' || e.key === 'F') {
        handleQuickConnect();
      } else if (e.key === 'r' || e.key === 'R') {
        handleSetTool(activeToolRef.current === 'batchRename' ? 'select' : 'batchRename');
      } else if (e.key === 'g' || e.key === 'G') {
        if (snapModeRef.current === 'grid') {
          cycleGridSnap();
        } else {
          handleToggleDaeSnapValue();
        }
      } else if (e.key === 'Escape') {
        handleCancelTool();
        if (isPanModeRef.current) {
          setIsPanMode(false);
        }
      } else if (e.key === 'Delete') {
        const targetTag = e.target?.tagName?.toLowerCase();
        if (targetTag !== 'input' && targetTag !== 'textarea') {
          e.preventDefault();
          handleDeleteClick();
        }
      } else if (e.key === '.' || e.key === 'Home') {
        fitToStructureRef.current?.();
      }
    };

    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('contextmenu', handleContextMenu);

    const currentWindow = container.ownerDocument?.defaultView || window;
    currentWindow.addEventListener('keydown', handleKeyDown);

    // Animation Loop with disposal guard
    let animationFrameId;
    let isDisposed = false;
    const animate = () => {
      if (isDisposed) return;
      animationFrameId = requestAnimationFrame(animate);
      orbitControls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize Observer to keep Three.js drawing buffer and aspect ratio in sync
    let resizeTimer = null;
    let resizeRafId = null;
    let lastW = 0;
    let lastH = 0;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: newW, height: newH } = entry.contentRect;
        if (newW > 0 && newH > 0 && (Math.abs(newW - lastW) > 1 || Math.abs(newH - lastH) > 1)) {
          lastW = newW;
          lastH = newH;
          // Immediately update camera aspect per frame without clearing the GPU buffer
          camera.aspect = newW / newH;
          camera.updateProjectionMatrix();

          // Debounce heavy WebGL buffer reallocations during CSS transitions to prevent flickering
          if (resizeTimer) clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            if (isDisposed || !containerRef.current) return;
            if (resizeRafId) cancelAnimationFrame(resizeRafId);
            resizeRafId = requestAnimationFrame(() => {
              if (isDisposed || !containerRef.current) return;
              renderer.setSize(newW, newH, false);
              renderer.domElement.style.width = '100%';
              renderer.domElement.style.height = '100%';
              renderer.render(scene, camera);
            });
          }, 100);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(animationFrameId);
      if (resizeTimer) clearTimeout(resizeTimer);
      if (resizeRafId) cancelAnimationFrame(resizeRafId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('contextmenu', handleContextMenu);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      currentWindow.removeEventListener('keydown', handleKeyDown);
      transformControls.dispose();
      orbitControls.removeEventListener('change', handleOrbitChange);
      orbitControls.dispose();
      if (typeof renderer.forceContextLoss === 'function') {
        renderer.forceContextLoss();
      }
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update Blueprint 3D reference planes
  useEffect(() => {
    const group = blueprintGroupRef.current;
    if (!group) return;

    // Clear existing planes
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    }

    if (!blueprintConfig) return;

    const planes = ['side', 'front', 'top'];
    const textureLoader = new THREE.TextureLoader();

    planes.forEach(planeType => {
      const cfg = blueprintConfig[planeType];
      if (!cfg || !cfg.enabled || !cfg.imageUrl) return;

      const existingTex = blueprintTexturesRef.current[cfg.imageUrl];
      if (existingTex) {
        const mesh = buildBlueprintMesh(planeType, cfg, existingTex);
        if (mesh) group.add(mesh);
      } else {
        textureLoader.load(
          cfg.imageUrl,
          (tex) => {
            blueprintTexturesRef.current[cfg.imageUrl] = tex;
            if (blueprintGroupRef.current) {
              const mesh = buildBlueprintMesh(planeType, cfg, tex);
              if (mesh) blueprintGroupRef.current.add(mesh);
            }
          },
          undefined,
          (err) => {
            console.warn('[JBeamViewport] Failed to load blueprint texture:', cfg.imageUrl, err);
          }
        );
      }
    });
  }, [blueprintConfig]);

  // Update 3D Geometry when jbeamParts or selection changes
  useEffect(() => {
    const structureGroup = structureGroupRef.current;
    if (!structureGroup) return;

    // Clear previous dynamic meshes
    while (structureGroup.children.length > 0) {
      const child = structureGroup.children[0];
      structureGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    }

    // Always clear dynamic scene element refs when geometry updates so stale elements are never accessed
    beamsGroupRef.current = null;
    nodesGroupRef.current = null;
    surfacesGroupRef.current = null;
    nodePosMapRef.current = new Map();
    hoveredBeamRef.current = null;
    hoveredNodeIdRef.current = null;
    hoveredNodeInfoRef.current = null;

    if (transformControlsRef.current) transformControlsRef.current.detach();
    if (snapRingRef.current) snapRingRef.current.visible = false;
    if (ghostMeshRef.current) ghostMeshRef.current.visible = false;
    if (mirrorGhostMeshRef.current) mirrorGhostMeshRef.current.visible = false;
    if (rubberBandLineRef.current) rubberBandLineRef.current.visible = false;
    if (triPreviewMeshRef.current) triPreviewMeshRef.current.visible = false;
    if (normalArrowRef.current) normalArrowRef.current.visible = false;

    if (!jbeamParts || typeof jbeamParts !== 'object') return;

    const partKeys = Object.keys(jbeamParts).filter(k => k !== '__meta');
    if (partKeys.length === 0) return;
    let mergedNodes = {};
    let mergedBeams = {};
    let mergedTriangles = {};
    let mergedQuads = {};
    const nodePosMap = new Map();

    // Check if part is visible under active file, family, part, or flexbody isolation
    const isPartVisible = (pk) => {
      if (soloPartKey) return pk === soloPartKey;
      if (soloFileGroupKey) {
        const fgKey = partsAndFlexbodiesData?.partFileGroupMap?.get(pk);
        if (fgKey !== soloFileGroupKey) return false;
      }
      if (soloFamilyKey) {
        const famKey = partsAndFlexbodiesData?.partFamilyMap?.get(pk);
        if (famKey !== soloFamilyKey) return false;
      }
      if (soloFlexbodyName && soloFlexbodyPartKeys) {
        if (!soloFlexbodyPartKeys.has(pk)) return false;
      }
      return !isolatedPartKeys.has(pk);
    };

    // If soloFlexbodyName is active, resolve its bound node IDs
    const soloNodeIds = (soloFlexbodyName && flexbodyAssociations)
      ? new Set(flexbodyAssociations.getBoundNodesForMesh(soloFlexbodyName) || [])
      : null;

    for (const partKey of partKeys) {
      if (!isPartVisible(partKey)) continue;
      const part = jbeamParts[partKey];
      if (!part || typeof part !== 'object') continue;
      const partColor = part.__componentColor || partsAndFlexbodiesData.meshColorMap[partKey] || PART_FLEXBODY_PALETTE[partKeys.indexOf(partKey) % PART_FLEXBODY_PALETTE.length];

      if (part.nodes) {
        for (const nKey of Object.keys(part.nodes).filter(k => k !== '__meta')) {
          if (soloNodeIds && soloNodeIds.size > 0 && !soloNodeIds.has(nKey) && !soloNodeIds.has(`${partKey}_${nKey}`)) {
            continue;
          }
          const n = { ...part.nodes[nKey] };
          n.__partName = partKey;
          n.__partColor = partColor;
          n.__originalId = nKey;
          if (part.__isNonActive) {
            n.__isNonActive = true;
          }
          if (part.__tabTitle) {
            n.__tabTitle = part.__tabTitle;
          }
          const scopedKey = `${partKey}_${nKey}`;
          mergedNodes[scopedKey] = n;
          if (!mergedNodes[nKey] || (mergedNodes[nKey].__isNonActive && !n.__isNonActive)) {
            mergedNodes[nKey] = n;
          }
          const [px, py, pz] = extractNodeCoords(n);
          nodePosMap.set(scopedKey, beamngToThree(px, py, pz));
          if (!nodePosMap.has(nKey) || !n.__isNonActive) {
            nodePosMap.set(nKey, beamngToThree(px, py, pz));
          }
        }
      }

      if (part.beams) {
        for (const bKey of Object.keys(part.beams).filter(k => k !== '__meta')) {
          const b = { ...part.beams[bKey] };
          if (soloNodeIds && soloNodeIds.size > 0) {
            const id1 = b['id1:'] || b[0];
            const id2 = b['id2:'] || b[1];
            if (!soloNodeIds.has(id1) || !soloNodeIds.has(id2)) continue;
          }
          b.__partName = partKey;
          b.__partColor = partColor;
          b.__beamKey = bKey;
          if (part.__isNonActive) b.__isNonActive = true;
          mergedBeams[`${partKey}_${bKey}`] = b;
        }
      }
      if (part.hydros) {
        for (const hKey of Object.keys(part.hydros).filter(k => k !== '__meta')) {
          const h = { ...part.hydros[hKey] };
          if (soloNodeIds && soloNodeIds.size > 0) {
            const id1 = h['id1:'] || h[0];
            const id2 = h['id2:'] || h[1];
            if (!soloNodeIds.has(id1) || !soloNodeIds.has(id2)) continue;
          }
          h.__partName = partKey;
          h.__partColor = partColor;
          h.__beamKey = `hydro_${hKey}`;
          h.beamType = h.beamType || '|HYDRO';
          if (part.__isNonActive) h.__isNonActive = true;
          mergedBeams[`${partKey}_hydro_${hKey}`] = h;
        }
      }
      if (part.triangles) {
        for (const tKey of Object.keys(part.triangles).filter(k => k !== '__meta')) {
          const tri = { ...part.triangles[tKey] };
          if (!tri || typeof tri !== 'object') continue;
          if (soloNodeIds && soloNodeIds.size > 0) {
            const id1 = tri['id1:'] || tri[0];
            const id2 = tri['id2:'] || tri[1];
            const id3 = tri['id3:'] || tri[2];
            if (!soloNodeIds.has(id1) || !soloNodeIds.has(id2) || !soloNodeIds.has(id3)) continue;
          }
          tri.__partName = partKey;
          tri.__partColor = partColor;
          tri.__triKey = tKey;
          if (part.__isNonActive) tri.__isNonActive = true;
          mergedTriangles[`${partKey}_${tKey}`] = tri;
        }
      }
      if (part.quads) {
        for (const qKey of Object.keys(part.quads).filter(k => k !== '__meta')) {
          const quad = { ...part.quads[qKey] };
          if (!quad || typeof quad !== 'object') continue;
          if (soloNodeIds && soloNodeIds.size > 0) {
            const id1 = quad['id1:'] || quad[0];
            const id2 = quad['id2:'] || quad[1];
            const id3 = quad['id3:'] || quad[2];
            const id4 = quad['id4:'] || quad[3];
            if (!soloNodeIds.has(id1) || !soloNodeIds.has(id2) || !soloNodeIds.has(id3) || !soloNodeIds.has(id4)) continue;
          }
          quad.__partName = partKey;
          quad.__partColor = partColor;
          quad.__quadKey = qKey;
          if (part.__isNonActive) quad.__isNonActive = true;
          mergedQuads[`${partKey}_${qKey}`] = quad;
        }
      }
    }

    nodePosMapRef.current = nodePosMap;

    // Compute Connected Topology Focus (Neighborhood X-Ray)
    const rawSelectedNodeList = [];
    if (typeof selectedNodeId === 'string' && selectedNodeId) {
      rawSelectedNodeList.push(selectedNodeId);
    } else if (Array.isArray(selectedNodeId)) {
      rawSelectedNodeList.push(...selectedNodeId);
    }
    if (Array.isArray(multiSelectedNodes)) {
      rawSelectedNodeList.push(...multiSelectedNodes);
    }

    const focusConnected = (focusConnectedTopology && rawSelectedNodeList.length > 0)
      ? computeConnectedTopology(rawSelectedNodeList, mergedBeams, symmetryEnabled)
      : null;

    focusStatsRef.current = focusConnected?.enabled ? {
      beams: focusConnected.connectedBeamsCount,
      neighbors: focusConnected.neighborNodesCount
    } : null;

    // Build Triangles and Quads (Aerodynamic & Collision Surfaces)
    const hasSurfaces = Object.keys(mergedTriangles).length > 0 || Object.keys(mergedQuads).length > 0;
    if (visibility.triangles && hasSurfaces) {
      const surfacesGroup = buildTrianglesGroup(mergedTriangles, mergedNodes, mergedQuads, {
        faceOrientation,
        showNormals,
        selectedSurface: selectedSurfaceInfo,
        nonActiveViewType,
        colorMode: (colorMode === 'type' || hudActiveTab === 'type' || hasActiveTypeFilter) ? 'type' : 'default',
        typeFilters,
        focusConnected
      });
      structureGroup.add(surfacesGroup);
      surfacesGroupRef.current = surfacesGroup;
    } else {
      surfacesGroupRef.current = null;
    }

    // Multi-Part Linkage: Detect mounting joints between open components before building nodes/beams
    // so node highlighting & beam focus stay synchronized with the selected multi-part mode.
    let mountingJointsGroup = null;
    if (viewportSource === 'openTabs' && nonActiveViewType === 'mountPoints') {
      mountingJointsGroup = buildMountingJointsGroup(mergedNodes, 0.15);
      if (mountingJointsGroup && mountingJointsGroup.children.length > 0) {
        structureGroup.add(mountingJointsGroup);
        mountingJointsGroupRef.current = mountingJointsGroup;
      } else {
        mountingJointsGroupRef.current = null;
      }
    } else {
      mountingJointsGroupRef.current = null;
    }

    // Build Beams (including cross-part virtual connectors)
    let beamsGroup = null;
    if (visibility.beams && Object.keys(mergedBeams).length > 0) {
      beamsGroup = buildBeamsGroup(
        mergedBeams,
        mergedNodes,
        selectedBeamKey,
        effectiveBeamColorMode,
        externalNodes,
        nonActiveViewType,
        selectedBeamInfo,
        typeFilters,
        {
          focusConnected,
          activeCrashGroup,
          crashGroupType
        }
      );
      structureGroup.add(beamsGroup);
      beamsGroupRef.current = beamsGroup;
    } else {
      beamsGroupRef.current = null;
    }

    // Build Nodes: pass scoped dictionary so only visible parts render their nodes
    const visualNodesDict = {};
    for (const partKey of partKeys) {
      if (!isPartVisible(partKey)) continue;
      const part = jbeamParts[partKey];
      if (!part?.nodes) continue;
      for (const nKey of Object.keys(part.nodes).filter(k => k !== '__meta')) {
        const scopedKey = `${partKey}_${nKey}`;
        if (mergedNodes[scopedKey]) {
          visualNodesDict[scopedKey] = mergedNodes[scopedKey];
        }
      }
    }

    // Also include external reference nodes connected by current visible beams so they render and can be inspected
    if (externalNodes && typeof externalNodes === 'object') {
      const referencedExternalIds = new Set();
      for (const bKey of Object.keys(mergedBeams).filter(k => k !== '__meta')) {
        const b = mergedBeams[bKey];
        if (!b) continue;
        const id1 = b['id1:'];
        const id2 = b['id2:'];
        if (id1 && !visualNodesDict[id1] && !visualNodesDict[`${b.__partName}_${id1}`] && externalNodes[id1]) {
          referencedExternalIds.add(id1);
        }
        if (id2 && !visualNodesDict[id2] && !visualNodesDict[`${b.__partName}_${id2}`] && externalNodes[id2]) {
          referencedExternalIds.add(id2);
        }
      }
      for (const extId of referencedExternalIds) {
        const extNode = externalNodes[extId];
        if (extNode) {
          visualNodesDict[`ext_${extId}`] = {
            ...extNode,
            id: extId,
            name: extId,
            __isExternal: true,
            __partName: extNode.__partName || 'external'
          };
        }
      }
    }

    if (visibility.nodes && Object.keys(visualNodesDict).length > 0) {
      const multiPartFocusNodeIds = viewportSource === 'openTabs'
        ? (nonActiveViewType === 'mountPoints'
            ? mountingJointsGroup?.userData?.jointNodeKeys
            : nonActiveViewType === 'crossBeams'
              ? beamsGroup?.userData?.crossEndpointKeys
              : null)
        : null;
      const clashNodeIds = (
        viewportSource === 'openTabs' &&
        highlightClashesIn3D &&
        Array.isArray(collidingNodes) &&
        collidingNodes.length > 0
      )
        ? new Set(collidingNodes.map(c => c.id))
        : null;

      const nodesGroup = buildNodesGroup(
        visualNodesDict,
        selectedNodeId,
        effectiveNodeColorMode,
        highlightedFlexbodyNodeIds,
        multiSelectedNodes,
        nonActiveViewType,
        typeFilters,
        {
          focusConnected,
          activeCrashGroup,
          crashGroupType,
          multiPartFocusNodeIds,
          clashNodeIds
        }
      );
      structureGroup.add(nodesGroup);
      nodesGroupRef.current = nodesGroup;

      // Build Node Labels (if toggled on)
      if (visibility.labels) {
        const labelsGroup = buildNodeLabelsGroup(visualNodesDict, selectedNodeId, highlightedFlexbodyNodeIds, { focusConnected });
        structureGroup.add(labelsGroup);
      }

      // Attach TransformControls if node(s) selected and in 'select' or 'boxSelect' mode
      const activeNodeId = (typeof selectedNodeId === 'string' && selectedNodeId)
        ? selectedNodeId
        : (Array.isArray(selectedNodeId) && selectedNodeId.length === 1 ? selectedNodeId[0] : (multiSelectedNodes.length === 1 ? multiSelectedNodes[0] : null));

      if ((activeToolRef.current === 'select' || activeToolRef.current === 'boxSelect') && transformControlsRef.current) {
        if (multiSelectedNodes.length > 1) {
          const center = new THREE.Vector3();
          let count = 0;
          for (const nid of multiSelectedNodes) {
            const m = nodesGroup.children.find(c => matchesNode(c, nid));
            if (m) {
              center.add(m.position);
              count++;
            }
          }
          if (count > 0) {
            center.multiplyScalar(1 / count);
            multiSelectPivotRef.current.position.copy(center);
            transformControlsRef.current.attach(multiSelectPivotRef.current);
          } else {
            transformControlsRef.current.detach();
          }
        } else if (activeNodeId) {
          const targetMesh = nodesGroup.children.find(c => matchesNode(c, activeNodeId));
          if (targetMesh) {
            transformControlsRef.current.attach(targetMesh);
          } else {
            transformControlsRef.current.detach();
          }
        } else {
          transformControlsRef.current.detach();
        }
      } else if (transformControlsRef.current) {
        transformControlsRef.current.detach();
      }

      // Calculate Mass Properties & Center of Gravity
      const calculatedMass = calculateMassProperties(mergedNodes);
      setMassStats(calculatedMass);
      setViewportNodes(mergedNodes);

      // Center of Gravity 3D Symbol (if toggled on)
      if (showCogMarker) {
        const cogGroup = buildCogMarkerGroup(calculatedMass, true);
        structureGroup.add(cogGroup);
      }

      // Visible JBeam Parts (filtered by active family, part, and flexbody isolation)
      const visibleJbeamParts = {};
      for (const pk of partKeys) {
        if (isPartVisible(pk)) {
          visibleJbeamParts[pk] = jbeamParts[pk];
        }
      }

      // PressureWheels Physics Skeleton & Parametric Wheels
      // If a single flexbody or non-wheel part is soloed, strictly suppress wheel physics
      const hasVisibleWheelDef = Object.values(visibleJbeamParts).some(
        p => p && (p.pressureWheels || p.hubWheels || p.wheelData || p.wheels)
      );
      const shouldRenderWheels = showPressureWheels && !soloFlexbodyName && hasVisibleWheelDef;
      const extractedWheels = shouldRenderWheels
        ? extractPressureWheels(visibleJbeamParts, externalWheelContextParts)
        : [];
      if (shouldRenderWheels && extractedWheels.length > 0) {
        const combinedWheelNodes = { ...externalNodes, ...mergedNodes };
        const pressureWheelsGroup = buildPressureWheelsGroup(extractedWheels, combinedWheelNodes, {
          renderMode: showGhostWheels ? 'both' : 'skeleton',
          visible: true,
          showLabels: visibility.labels !== false,
          showSurfaces: visibility.triangles !== false,
          selectedWheelName: selectedWheelInfo?.wheelName || selectedWheelInfo?.name
        });
        structureGroup.add(pressureWheelsGroup);
        pressureWheelsGroupRef.current = pressureWheelsGroup;
      } else {
        pressureWheelsGroupRef.current = null;
      }

      // Suspension Physics: Torsion Bars (Anti-roll / Swaybars)
      if (showTorsionBars && !soloFlexbodyName) {
        const tbars = extractTorsionBars(visibleJbeamParts);
        if (tbars.length > 0) {
          const tbarsGroup = buildTorsionBarsGroup(tbars, mergedNodes, {
            selectedTorsionBarName: selectedTorsionBarInfo?.name,
            showLabels: visibility.labels !== false
          });
          structureGroup.add(tbarsGroup);
          torsionBarsGroupRef.current = tbarsGroup;
        } else {
          torsionBarsGroupRef.current = null;
        }
      } else {
        torsionBarsGroupRef.current = null;
      }

      // Suspension Physics: Rails & SlideNodes
      if (showSlideNodes && !soloFlexbodyName) {
        const { rails, slideNodes } = extractRailsAndSlideNodes(visibleJbeamParts);
        if (Object.keys(rails).length > 0 || slideNodes.length > 0) {
          const snGroup = buildSlideNodesGroup(rails, slideNodes, mergedNodes, {
            selectedRailOrNode: selectedSlideNodeInfo?.id || selectedSlideNodeInfo?.railName
          });
          structureGroup.add(snGroup);
          slideNodesGroupRef.current = snGroup;
        } else {
          slideNodesGroupRef.current = null;
        }
      } else {
        slideNodesGroupRef.current = null;
      }

      // Aerodynamics & Center of Pressure (CoP)
      if (!soloFlexbodyName) {
        const aeroData = calculateAerodynamics(visibleJbeamParts, mergedNodes, {
          cogBeamng: calculatedMass?.cogBeamng
        });
        setAeroStats(aeroData);

        if (showAeroCoP && aeroData.valid) {
          const aeroGroup = buildAeroVisualizerGroup(aeroData, {
            showAeroVectors,
            showLabels: visibility.labels !== false
          });
          structureGroup.add(aeroGroup);
          aeroGroupRef.current = aeroGroup;
        } else {
          aeroGroupRef.current = null;
        }
      } else {
        aeroGroupRef.current = null;
      }

      // Vehicle Reference Coordinate Triad (refNodes)
      const refData = extractRefNodes(visibleJbeamParts, mergedNodes);
      setRefNodesData(refData);
      if (showRefNodes && refData.valid) {
        const refGroup = buildRefNodesGroup(refData, {
          showLabels: visibility.labels !== false
        });
        structureGroup.add(refGroup);
        refNodesGroupRef.current = refGroup;
      } else {
        refNodesGroupRef.current = null;
      }

      // Cockpit & Driver Cameras (camerasInternal)
      const camData = extractCamerasInternal(visibleJbeamParts, mergedNodes);
      setCamerasData(camData);
      if (showCamerasInternal && camData.length > 0) {
        const camGroup = buildCameraFrustumGroup(camData, {
          showLabels: visibility.labels !== false
        });
        structureGroup.add(camGroup);
        camerasGroupRef.current = camGroup;
      } else {
        camerasGroupRef.current = null;
      }
    } else {
      nodesGroupRef.current = null;
      if (transformControlsRef.current) transformControlsRef.current.detach();
    }

    // Inside Meshes tab: Hide JBeam wireframe to isolate 3D visual meshes being inspected
    structureGroup.visible = !isMeshesTabActive;
  }, [jbeamParts, selectedNodeId, multiSelectedNodes, selectedBeamKey, selectedBeamInfo, selectedSurfaceInfo, selectedWheelInfo, selectedTorsionBarInfo, selectedSlideNodeInfo, visibility, colorMode, typeFilters, externalNodes, externalWheelContextParts, highlightedFlexbodyNodeIds, faceOrientation, showNormals, showPressureWheels, showGhostWheels, showCogMarker, showTorsionBars, showSlideNodes, showAeroCoP, showAeroVectors, showRefNodes, showCamerasInternal, nonActiveViewType, activeTool, viewportSource, isMeshesTabActive, focusConnectedTopology, symmetryEnabled, activeCrashGroup, crashGroupType, partsAndFlexbodiesData, isolatedPartKeys, soloFileGroupKey, soloFamilyKey, soloPartKey, hiddenFlexbodyNames, soloFlexbodyName, soloFlexbodyPartKeys, flexbodyAssociations, activeHeatmap, hudActiveTab, hasActiveTypeFilter, effectiveNodeColorMode, effectiveBeamColorMode, collidingNodes, highlightClashesIn3D]);

  // Live 3D Focus Highlight & Non-Hovered Dimming for Code/Structure Hover & Multi-line Selection
  useEffect(() => {
    const group = codeHoverGroupRef.current;
    if (!group) return;

    while (group.children.length > 0) {
      const child = group.children.pop();
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    }

    const setGroupHoverDimming = (targetGroup, shouldDim) => {
      if (!targetGroup) return;
      targetGroup.traverse((obj) => {
        if (!obj.material) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (shouldDim) {
            if (mat.userData.__hoverOrigOpacity === undefined) {
              mat.userData.__hoverOrigOpacity = mat.opacity !== undefined ? mat.opacity : 1;
              mat.userData.__hoverOrigTransparent = Boolean(mat.transparent);
            }
            mat.transparent = true;
            mat.opacity = Math.min(mat.userData.__hoverOrigOpacity, 0.14);
          } else if (mat.userData.__hoverOrigOpacity !== undefined) {
            mat.opacity = mat.userData.__hoverOrigOpacity;
            mat.transparent = mat.userData.__hoverOrigTransparent;
            delete mat.userData.__hoverOrigOpacity;
            delete mat.userData.__hoverOrigTransparent;
          }
        }
      });
    };

    const hasFocusTargets = Boolean((codeHoveredElement || codeSelectedElements) && jbeamParts);
    const shouldDimOthers = Boolean(hoverFocusDimming && hasFocusTargets);

    setGroupHoverDimming(nodesGroupRef.current, shouldDimOthers);
    setGroupHoverDimming(beamsGroupRef.current, shouldDimOthers);
    setGroupHoverDimming(surfacesGroupRef.current, shouldDimOthers);
    setGroupHoverDimming(mountingJointsGroupRef.current, shouldDimOthers);
    setGroupHoverDimming(pressureWheelsGroupRef.current, shouldDimOthers);

    if (!hasFocusTargets) return;

    const mergedNodes = { ...(externalNodes || {}) };
    for (const pKey of Object.keys(jbeamParts).filter(k => k !== '__meta')) {
      const p = jbeamParts[pKey];
      if (p?.nodes) {
        for (const nKey of Object.keys(p.nodes).filter(k => k !== '__meta')) {
          mergedNodes[nKey] = p.nodes[nKey];
        }
      }
    }

    const hoverOverlay = buildCodeHoverGroup({
      hovered: codeHoveredElement,
      selected: codeSelectedElements
    }, mergedNodes);
    while (hoverOverlay.children.length > 0) {
      group.add(hoverOverlay.children.pop());
    }
  }, [codeHoveredElement, codeSelectedElements, jbeamParts, externalNodes, hoverFocusDimming]);

  // Option 3: Visual Mesh (.dae) Loading & Opacity synchronization
  const applyCurrentSubmeshIsolation = useCallback(() => {
    if (!visualMeshManagerRef.current) return;

    const hiddenMeshes = new Set(hiddenFlexbodyNames);
    const partKeys = jbeamParts ? Object.keys(jbeamParts).filter(k => k !== '__meta') : [];
    for (const pk of partKeys) {
      const isPartVis = soloPartKey
        ? (pk === soloPartKey)
        : soloFileGroupKey
        ? (partsAndFlexbodiesData?.partFileGroupMap?.get(pk) === soloFileGroupKey)
        : soloFamilyKey
        ? (partsAndFlexbodiesData?.partFamilyMap?.get(pk) === soloFamilyKey)
        : !isolatedPartKeys.has(pk);
      if (!isPartVis) {
        const pData = partsAndFlexbodiesData?.parts?.find(p => p.key === pk);
        if (pData?.flexbodies) {
          for (const fb of pData.flexbodies) {
            const fbName = typeof fb === 'string' ? fb : fb.name;
            if (fbName) hiddenMeshes.add(fbName);
          }
        }
      }
    }

    let { allowedMeshNames, forceExplicit } = computeSubmeshIsolationConfig({
      effectiveIsolateMesh,
      hasActiveIsolation,
      activeMatchingMeshNames,
      jbeamDefinesFlexbodies,
      soloPartKey,
      soloFamilyKey,
      soloFlexbodyName,
      partsAndFlexbodiesData
    });

    // Mechanical X-Ray Auto-Isolation: when Mechanical tab is active without manual isolation,
    // hide body shells/doors/glass/interior so only mechanical hardware DAE submeshes render.
    if (isMechanicalTabActive && !hasActiveIsolation && !effectiveIsolateMesh) {
      const allDaeNames = visualMeshManagerRef.current.submeshNames || [];
      const mechRegex = /engine|trans|gearbox|diff|shaft|exhaust|suspension|brake|radiator|intake|turbo|header|steering|strut|spring|shock|swaybar|subframe|wheel|tire|hub|arm|knuckle|caliper|rotor|rack|coilover|axle|oilpan|intercooler|driveshaft|halfshaft/i;
      const mechMatched = allDaeNames.filter(n => mechRegex.test(n));
      if (mechMatched.length > 0) {
        allowedMeshNames = new Set(mechMatched);
        forceExplicit = true;
      }
    }

    visualMeshManagerRef.current.applySubmeshIsolation({
      hiddenMeshNames: hiddenMeshes,
      soloMeshName: soloFlexbodyName,
      allowedMeshNames,
      forceExplicit
    });
  }, [
    effectiveIsolateMesh,
    hasActiveIsolation,
    activeMatchingMeshNames,
    jbeamDefinesFlexbodies,
    jbeamParts,
    isolatedPartKeys,
    soloFileGroupKey,
    soloFamilyKey,
    soloPartKey,
    hiddenFlexbodyNames,
    soloFlexbodyName,
    partsAndFlexbodiesData,
    isMechanicalTabActive
  ]);

  const applySubmeshIsolationRef = useRef(applyCurrentSubmeshIsolation);
  applySubmeshIsolationRef.current = applyCurrentSubmeshIsolation;

  useEffect(() => {
    if (visualMeshManagerRef.current && visualMeshDaeText) {
      let res;
      if (Array.isArray(visualMeshDaeText)) {
        res = visualMeshManagerRef.current.loadMultipleFromText(visualMeshDaeText, '', {
          opacity: meshOpacity,
          wireframe: meshWireframe
        });
      } else {
        res = visualMeshManagerRef.current.loadFromText(visualMeshDaeText, '', {
          opacity: meshOpacity,
          wireframe: meshWireframe,
          fileName: visualMeshName || 'model.dae'
        });
      }
      if (res && res.success) {
        setMeshStats({
          meshCount: res.meshCount,
          submeshNames: res.submeshNames,
          vertices: res.totalVertices,
          triangles: res.totalTriangles,
          loadedFilesCount: res.loadedFilesCount
        });
        if (onUpdateSubmeshNames) {
          onUpdateSubmeshNames(res.submeshNames || []);
        }
        if (onUpdateSubmeshDetails) {
          onUpdateSubmeshDetails(res.submeshDetails || {});
        }
        if (isMeshesTabActive) {
          const effectiveSpawned = (spawnedMeshNames && (spawnedMeshNames.size > 0 || (Array.isArray(spawnedMeshNames) && spawnedMeshNames.length > 0)))
            ? spawnedMeshNames
            : new Set(res.submeshNames || []);
          visualMeshManagerRef.current.filterSubmeshes(effectiveSpawned, true);
        } else {
          applySubmeshIsolationRef.current();
        }
        if (shouldColorSubmeshesRef.current) {
          visualMeshManagerRef.current.applyPartFlexbodyColors(partsAndFlexbodiesData.meshColorMap);
        }
      }
    } else if (visualMeshManagerRef.current && !visualMeshDaeText) {
      visualMeshManagerRef.current.clear();
      setMeshStats(null);
      if (onUpdateSubmeshDetails) {
        onUpdateSubmeshDetails({});
      }
      if (onUpdateSubmeshNames) {
        onUpdateSubmeshNames([]);
      }
    }
  }, [visualMeshDaeText]);

  useEffect(() => {
    if (frontIndicatorGroupRef.current) {
      frontIndicatorGroupRef.current.visible = showFrontIndicator;
    }
  }, [showFrontIndicator]);

  useEffect(() => {
    if (visualMeshManagerRef.current) {
      visualMeshManagerRef.current.setOpacity(meshOpacity);
    }
  }, [meshOpacity]);

  useEffect(() => {
    if (visualMeshManagerRef.current) {
      if (typeof visualMeshManagerRef.current.setVisible === 'function') {
        visualMeshManagerRef.current.setVisible(meshVisible);
      } else if (typeof visualMeshManagerRef.current.toggleVisibility === 'function') {
        visualMeshManagerRef.current.toggleVisibility(meshVisible);
      }
    }
  }, [meshVisible]);

  useEffect(() => {
    if (visualMeshManagerRef.current) {
      visualMeshManagerRef.current.setWireframe(meshWireframe);
    }
  }, [meshWireframe]);

  // Live 3D Steering & Suspension Kinematics Preview (non-destructive visual transform)
  useEffect(() => {
    const steer = isMechanicalTabActive ? (Number(mechanicalKinematicsPreview?.steering) || 0) : 0;
    const comp = isMechanicalTabActive ? (Number(mechanicalKinematicsPreview?.compression) || 0) : 0;
    const isActive = Math.abs(steer) > 1e-4 || Math.abs(comp) > 1e-4;

    if (pressureWheelsGroupRef.current) {
      for (const wheelGroup of pressureWheelsGroupRef.current.children) {
        if (!wheelGroup) continue;
        if (wheelGroup.userData.__mechOrigPos === undefined) {
          wheelGroup.userData.__mechOrigPos = wheelGroup.position.clone();
          wheelGroup.userData.__mechOrigRotY = wheelGroup.rotation.y;
        }
        if (isActive) {
          const isFrontWheel = /_F[LR]?$/i.test(wheelGroup.name || '') || /front/i.test(wheelGroup.name || '');
          wheelGroup.position.copy(wheelGroup.userData.__mechOrigPos);
          wheelGroup.position.y += comp;
          if (isFrontWheel && Math.abs(steer) > 1e-4) {
            // Pivot front wheel assembly around its world center
            wheelGroup.rotation.y = wheelGroup.userData.__mechOrigRotY - steer * 0.52;
          } else {
            wheelGroup.rotation.y = wheelGroup.userData.__mechOrigRotY;
          }
        } else {
          wheelGroup.position.copy(wheelGroup.userData.__mechOrigPos);
          wheelGroup.rotation.y = wheelGroup.userData.__mechOrigRotY;
        }
      }
    }

    if (nodesGroupRef.current) {
      for (const mesh of nodesGroupRef.current.children) {
        if (!mesh || mesh.userData?.type !== 'node') continue;
        if (mesh.userData.__mechOrigPos === undefined) {
          mesh.userData.__mechOrigPos = mesh.position.clone();
        }
        if (isActive) {
          const nid = String(mesh.userData.id || '').toLowerCase();
          mesh.position.copy(mesh.userData.__mechOrigPos);
          if (/^(fw|fh|rw|rh)/.test(nid)) {
            mesh.position.y += comp;
          }
          if (/^(s\d|fh6|fx5|rack|tierod)/.test(nid)) {
            mesh.position.x += steer * 0.08;
          }
        } else {
          mesh.position.copy(mesh.userData.__mechOrigPos);
        }
      }
    }
  }, [mechanicalKinematicsPreview, isMechanicalTabActive]);

  useEffect(() => {
    if (visualMeshManagerRef.current) {
      visualMeshManagerRef.current.highlightSubmesh(highlightedSubmesh);
    }
  }, [highlightedSubmesh]);

  const shouldColorSubmeshes = colorMode === 'part' || (isHudOpen && hudActiveTab === 'parts') || hasActiveIsolation;
  const shouldColorSubmeshesRef = useRef(shouldColorSubmeshes);
  shouldColorSubmeshesRef.current = shouldColorSubmeshes;

  // Synchronize 3D Visual Mesh Submesh Materials with Parts & Flexbodies Multi-Color Palette
  useEffect(() => {
    if (visualMeshManagerRef.current) {
      if (shouldColorSubmeshes) {
        visualMeshManagerRef.current.applyPartFlexbodyColors(partsAndFlexbodiesData.meshColorMap);
      } else {
        visualMeshManagerRef.current.resetMeshColors();
      }
    }
  }, [shouldColorSubmeshes, partsAndFlexbodiesData, meshStats]);

  useEffect(() => {
    // Isolate viewport when Meshes tab is active: hide JBeam physics wireframe to focus on 3D models
    if (structureGroupRef.current) {
      structureGroupRef.current.visible = !isMeshesTabActive;
    }
    if (applySubmeshIsolationRef.current) {
      applySubmeshIsolationRef.current();
    }

    if (visualMeshManagerRef.current && (visualMeshManagerRef.current.currentMesh || visualMeshManagerRef.current.allMeshes?.length > 0)) {
      if (isMeshesTabActive) {
        // Inside Meshes tab: Show ONLY the user-spawned submeshes from the Meshes panel
        const effectiveSpawned = (spawnedMeshNames && (spawnedMeshNames.size > 0 || (Array.isArray(spawnedMeshNames) && spawnedMeshNames.length > 0)))
          ? spawnedMeshNames
          : (spawnedMeshNames instanceof Set ? spawnedMeshNames : new Set(meshStats?.submeshNames || []));
        visualMeshManagerRef.current.filterSubmeshes(effectiveSpawned, true);
      } else {
        applyCurrentSubmeshIsolation();
      }
    }
  }, [
    applyCurrentSubmeshIsolation,
    visualMeshDaeText,
    spawnedMeshNames,
    isMeshesTabActive,
    meshStats
  ]);

  const handleDaeFileChosen = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target.result;
      if (onLoadVisualMesh) {
        onLoadVisualMesh(content, file.name);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Fit View / Frame Structure (Frames JBeam nodes, beams, and loaded visual 3D model)
  const fitToStructure = useCallback(() => {
    const camera = cameraRef.current;
    const orbitControls = orbitControlsRef.current;
    if (!camera || !orbitControls) return;

    const box = new THREE.Box3();

    // 1. Include JBeam physics structure (nodes, beams, triangles) when not isolated to Meshes tab
    const structureGroup = structureGroupRef.current;
    if (!isMeshesTabActive && structureGroup && structureGroup.children.length > 0) {
      structureGroup.updateMatrixWorld(true);
      const sBox = new THREE.Box3().setFromObject(structureGroup);
      if (!sBox.isEmpty()) {
        box.union(sBox);
      }
    }

    // 2. Include visible 3D visual DAE meshes
    if (visualMeshManagerRef.current && visualMeshManagerRef.current.meshGroup) {
      const vGroup = visualMeshManagerRef.current.meshGroup;
      if (vGroup.visible) {
        vGroup.updateMatrixWorld(true);
        vGroup.traverse((child) => {
          if ((child.isMesh || child.isLine || child.isLineSegments) && child.visible && child.geometry) {
            if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
            if (child.geometry.boundingBox) {
              const geomBox = child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld);
              box.union(geomBox);
            }
          }
        });
      }
    }

    // 3. Fallback to sensible vehicle bounds if both are empty or non-finite
    if (box.isEmpty() || !isFinite(box.min.x) || !isFinite(box.max.x)) {
      box.set(new THREE.Vector3(-1.2, -2.5, -0.4), new THREE.Vector3(1.2, 2.5, 1.6));
    }

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.5);

    const fov = camera.fov * (Math.PI / 180);
    const cameraDistance = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.35;

    // Position camera along current viewing angle or standard isometric
    const dir = new THREE.Vector3().subVectors(camera.position, orbitControls.target);
    if (dir.lengthSq() < 0.01) {
      dir.set(0.7, 0.5, 0.8);
    }
    dir.normalize();

    camera.position.copy(center).addScaledVector(dir, cameraDistance);
    orbitControls.target.copy(center);
    camera.near = Math.max(0.01, cameraDistance / 100);
    camera.far = Math.max(1000, cameraDistance * 10);
    camera.updateProjectionMatrix();
    camera.lookAt(center);
    orbitControls.update();
  }, [isMeshesTabActive]);

  const fitToStructureRef = useRef(fitToStructure);
  useEffect(() => {
    fitToStructureRef.current = fitToStructure;
  }, [fitToStructure]);

  // Auto-fit camera framing when switching between Part and Assembly view
  const prevViewportSourceRef = useRef(viewportSource);
  useEffect(() => {
    if (prevViewportSourceRef.current !== viewportSource) {
      prevViewportSourceRef.current = viewportSource;
      const timer = setTimeout(() => {
        fitToStructure();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [viewportSource, fitToStructure]);

  // Auto-fit camera framing when switching to/from Meshes tab
  const prevIsMeshesTabActiveRef = useRef(isMeshesTabActive);
  useEffect(() => {
    if (prevIsMeshesTabActiveRef.current !== isMeshesTabActive) {
      prevIsMeshesTabActiveRef.current = isMeshesTabActive;
      const timer = setTimeout(() => {
        fitToStructureRef.current?.();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isMeshesTabActive]);

  // Camera focus on a specific 3D target position (Node, Beam, or Submesh)
  const focusOnTarget = useCallback((targetPos, radius = 0.8) => {
    const camera = cameraRef.current;
    const orbitControls = orbitControlsRef.current;
    if (!camera || !orbitControls || !targetPos) return;

    const fov = camera.fov * (Math.PI / 180);
    const cameraDistance = Math.max(1.2, Math.min(6.0, Math.abs(radius / Math.tan(fov / 2)) * 1.5));

    const dir = new THREE.Vector3().subVectors(camera.position, orbitControls.target);
    if (dir.lengthSq() < 0.01) {
      dir.set(0.7, 0.5, 0.8);
    }
    dir.normalize();

    camera.position.copy(targetPos).addScaledVector(dir, cameraDistance);
    orbitControls.target.copy(targetPos);
    camera.lookAt(targetPos);
    orbitControls.update();
  }, []);

  // React to programmatic 3D focus triggers (e.g. from Mechanical Workspace or Inspector)
  useEffect(() => {
    if (!focusCameraTrigger) return;
    const { targetNodeId, targetPos, targetSubmesh, targetBeam } = focusCameraTrigger;

    // 1. Direct 3D Vector
    if (targetPos) {
      const vec = Array.isArray(targetPos)
        ? new THREE.Vector3(targetPos[0], targetPos[1], targetPos[2])
        : targetPos;
      focusOnTarget(vec, 0.6);
      return;
    }

    // 2. Target Node ID
    if (targetNodeId) {
      let foundPos = null;
      if (nodePosMapRef.current) {
        for (const [key, pos] of nodePosMapRef.current.entries()) {
          if (key === targetNodeId || key.endsWith(`_${targetNodeId}`) || targetNodeId.endsWith(`_${key}`)) {
            foundPos = new THREE.Vector3(pos[0], pos[1], pos[2]);
            break;
          }
        }
      }
      if (!foundPos && nodesGroupRef.current) {
        const mesh = nodesGroupRef.current.children.find(c => {
          const id = c.userData?.id;
          return id === targetNodeId || id?.endsWith(`_${targetNodeId}`) || targetNodeId.endsWith(`_${id}`);
        });
        if (mesh) {
          foundPos = mesh.position.clone();
        }
      }
      if (foundPos) {
        focusOnTarget(foundPos, 0.7);
        return;
      }
    }

    // 3. Target Beam (id1 <-> id2 midpoint)
    if (targetBeam?.id1 && targetBeam?.id2 && nodePosMapRef.current) {
      let p1 = null, p2 = null;
      for (const [key, pos] of nodePosMapRef.current.entries()) {
        if (!p1 && (key === targetBeam.id1 || key.endsWith(`_${targetBeam.id1}`))) {
          p1 = new THREE.Vector3(pos[0], pos[1], pos[2]);
        }
        if (!p2 && (key === targetBeam.id2 || key.endsWith(`_${targetBeam.id2}`))) {
          p2 = new THREE.Vector3(pos[0], pos[1], pos[2]);
        }
        if (p1 && p2) break;
      }
      if (p1 && p2) {
        const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        const dist = p1.distanceTo(p2);
        focusOnTarget(mid, Math.max(0.6, dist * 0.8));
        return;
      }
    }

    // 4. Target Submesh
    if (targetSubmesh && visualMeshManagerRef.current) {
      const bBox = visualMeshManagerRef.current.getSubmeshBoundingBox(targetSubmesh);
      if (bBox && !bBox.isEmpty()) {
        const center = bBox.getCenter(new THREE.Vector3());
        const size = bBox.getSize(new THREE.Vector3());
        focusOnTarget(center, Math.max(size.x, size.y, size.z, 0.5));
      }
    }
  }, [focusCameraTrigger, focusOnTarget]);

  // Preset Views (Iso, Top, Bottom, Front, Rear, Side Left/Right)
  const setCameraPreset = (preset) => {
    const camera = cameraRef.current;
    const orbitControls = orbitControlsRef.current;
    if (!camera || !orbitControls) return;

    viewPresetRef.current = preset;
    setViewPreset(preset);

    const target = orbitControls.target.clone();
    const currentDist = camera.position.distanceTo(target);
    const distance = currentDist > 0.5 ? currentDist : 3.5;

    if (preset === 'top') {
      camera.position.set(target.x, target.y + distance, target.z - 0.0001);
    } else if (preset === 'bottom') {
      camera.position.set(target.x, target.y - distance, target.z - 0.0001);
    } else if (preset === 'front') {
      camera.position.set(target.x, target.y, target.z - distance);
    } else if (preset === 'rear') {
      camera.position.set(target.x, target.y, target.z + distance);
    } else if (preset === 'side' || preset === 'side-left') {
      camera.position.set(target.x - distance, target.y, target.z);
    } else if (preset === 'side-right') {
      camera.position.set(target.x + distance, target.y, target.z);
    } else if (preset === 'iso') {
      camera.position.set(target.x - distance * 0.7, target.y + distance * 0.5, target.z - distance * 0.8);
    }
    camera.lookAt(target);
    orbitControls.update();
  };

  const currentTool = activeTool || internalTool;

  return (
    <div
      className={`blender-viewport-container ${isPanMode ? 'pan-mode-active' : ''}`}
      style={{ backgroundColor: (VIEWPORT_BG_PRESETS[viewportBg] || VIEWPORT_BG_PRESETS.editorGray).hex }}
    >
      {/* 3D WebGL Canvas */}
      <div ref={containerRef} className="blender-viewport-canvas" />

      {/* Blender 3D Orientation & Spatial Navigation Gizmo */}
      <BlenderOrientationGizmo
        cameraRef={cameraRef}
        orbitControlsRef={orbitControlsRef}
        onSetPreset={setCameraPreset}
        onFit={fitToStructure}
        viewPreset={viewPreset}
        isPanMode={isPanMode}
        onTogglePan={() => setIsPanMode(prev => !prev)}
      />

      {/* 2D Marquee Box Selection Overlay */}
      {marqueeBox && (
        <div
          className="viewport-marquee-overlay"
          style={{
            position: 'fixed',
            left: marqueeBox.x,
            top: marqueeBox.y,
            width: marqueeBox.w,
            height: marqueeBox.h,
            border: '1.5px dashed #38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.15)',
            pointerEvents: 'none',
            zIndex: 9999
          }}
        />
      )}

      {/* Top Blender Viewport Header Bar */}
      <div className="blender-viewport-header">
        {/* Header Left: Tool Settings & Controls */}
        <div className="header-left">
          {/* 3D View Mode Dropdown Button */}
          {onChangeViewportSource && (
            <div className="viewport-dropdown-container view-mode-dropdown-container" ref={viewModeMenuRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowViewModeDropdown(prev => !prev);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className={`header-pill-btn view-mode-trigger-btn ${showViewModeDropdown ? 'active' : ''}`}
                title="Switch 3D Viewport Mode: Single Part or Multi-Part Linkage"
              >
                {isMeshesTabActive ? (
                  <CubeIcon size={13} style={{ color: '#38bdf8' }} />
                ) : viewportSource === 'assembly' ? (
                  <AssemblyIcon size={13} />
                ) : viewportSource === 'openTabs' ? (
                  <LinkIcon size={13} />
                ) : isMechanicalTabActive ? (
                  <MechanicalIcon size={13} />
                ) : (
                  <FileIcon size={13} />
                )}
                <span className="view-mode-active-pill" style={isMeshesTabActive ? { color: '#38bdf8', fontWeight: 600 } : undefined}>
                  {isMeshesTabActive
                    ? '3D Meshes'
                    : viewportSource === 'assembly'
                    ? 'Assembly'
                    : viewportSource === 'openTabs'
                    ? 'Multi-Part'
                    : isMechanicalTabActive
                    ? 'Mechanical'
                    : 'Part'}
                </span>
                <ChevronDownIcon size={10} className={`dropdown-chevron ${showViewModeDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showViewModeDropdown && (
                <div
                  className="viewport-dropdown-menu view-mode-menu"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="dropdown-section-title">Viewport View Mode</div>

                  <div
                    className={`dropdown-menu-action-item view-mode-option ${viewportSource === 'activeDocument' || (!viewportSource || viewportSource === 'default') ? 'active' : ''}`}
                    onClick={() => {
                      onChangeViewportSource('activeDocument');
                      setShowViewModeDropdown(false);
                    }}
                  >
                    <div className="view-mode-option-icon">
                      <FileIcon size={14} />
                    </div>
                    <div className="view-mode-option-text">
                      <div className="view-mode-option-title">Part (Single Component)</div>
                      <div className="view-mode-option-desc">Focused editing of active JBeam document</div>
                    </div>
                    {(viewportSource === 'activeDocument' || !viewportSource || viewportSource === 'default') && (
                      <span className="view-mode-option-check"><CheckIcon size={12} /></span>
                    )}
                  </div>

                  <div
                    className={`dropdown-menu-action-item view-mode-option ${viewportSource === 'openTabs' ? 'active' : ''}`}
                    onClick={() => {
                      onChangeViewportSource('openTabs');
                      setShowViewModeDropdown(false);
                    }}
                  >
                    <div className="view-mode-option-icon">
                      <LinkIcon size={14} />
                    </div>
                    <div className="view-mode-option-text">
                      <div className="view-mode-option-title">Multi-Part Linkage</div>
                      <div className="view-mode-option-desc">Multi-tab CAD wireframe, mount nodes & links</div>
                    </div>
                    {viewportSource === 'openTabs' && <span className="view-mode-option-check"><CheckIcon size={12} /></span>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Multi-Part Display Layer Modes vs Mutating Actions */}
          {viewportSource === 'openTabs' && (
            <>
              <div className="header-pill-group non-active-style-selector multipart-view-pills">
                <button
                  type="button"
                  onClick={() => onChangeNonActiveViewType && onChangeNonActiveViewType('cadWire')}
                  className={`header-pill-btn ${nonActiveViewType === 'cadWire' || nonActiveViewType === 'wireframe' ? 'active' : ''}`}
                  title="CAD Wire View: Color-code each open component with clean CAD wireframe"
                >
                  <span>CAD Wire</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeNonActiveViewType && onChangeNonActiveViewType('mountPoints')}
                  className={`header-pill-btn ${nonActiveViewType === 'mountPoints' ? 'active' : ''}`}
                  title="Joints View: Isolate & highlight nearby interface nodes (≤0.15m) ready for mounting"
                >
                  <JointIcon size={11} />
                  <span>Joints</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeNonActiveViewType && onChangeNonActiveViewType('crossBeams')}
                  className={`header-pill-btn ${nonActiveViewType === 'crossBeams' ? 'active' : ''}`}
                  title="Cross-Beams View: Isolate inter-component mounting & virtual connector beams"
                >
                  <BeamIcon size={11} />
                  <span>Cross</span>
                </button>
              </div>

              {(onAutoLinkMounts || (nodeCollisionCount > 0 && onPrefixActiveNodes)) && (
                <>
                  <div className="header-divider multipart-actions-divider" />
                  <div className="header-pill-group multipart-actions-group">
                    {onAutoLinkMounts && (
                      <button
                        type="button"
                        onClick={onAutoLinkMounts}
                        className="header-pill-btn auto-mount-btn"
                        title="Action: Auto-Mount creates optional mounting beams (optional: true) between closest nearby component nodes (≤0.15m)"
                      >
                        <LinkIcon size={11} />
                        <span>Auto-Mount</span>
                      </button>
                    )}
                    {nodeCollisionCount > 0 && onPrefixActiveNodes && (
                      <div className="multipart-clash-anchor" ref={clashMenuRef}>
                        <button
                          type="button"
                          onClick={() => setShowClashPopover(prev => !prev)}
                          className={`header-pill-btn prefix-nodes-btn ${showClashPopover ? 'active' : ''}`}
                          title={`Inspect ${nodeCollisionCount} colliding node ID${nodeCollisionCount === 1 ? '' : 's'} shared with other open tabs & fix with '${suggestedPrefix}*'`}
                        >
                          <WarningIcon size={11} />
                          <span>Clashes ({nodeCollisionCount})</span>
                        </button>

                        {showClashPopover && (
                          <div
                            className="multipart-clash-popover"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="clash-popover-header">
                              <div className="clash-popover-title">
                                <WarningIcon size={13} />
                                <span>{nodeCollisionCount} Node ID Clash{nodeCollisionCount === 1 ? '' : 'es'}</span>
                              </div>
                              <button
                                type="button"
                                className="clash-popover-close"
                                onClick={() => setShowClashPopover(false)}
                                title="Close"
                              >
                                <CloseIcon size={11} />
                              </button>
                            </div>
                            <div className="clash-popover-desc">
                              Duplicate node IDs across open tabs overwrite or merge in BeamNG.
                            </div>
                            {Array.isArray(collidingNodes) && collidingNodes.length > 0 && (
                              <div className="clash-popover-list">
                                {collidingNodes.slice(0, 24).map(c => (
                                  <div key={c.id} className="clash-popover-row">
                                    <code className="clash-node-id">{c.id}</code>
                                    <span className="clash-tab-list" title={c.tabs.join(', ')}>
                                      {c.tabs.join(', ')}
                                    </span>
                                  </div>
                                ))}
                                {collidingNodes.length > 24 && (
                                  <div className="clash-popover-more">
                                    +{collidingNodes.length - 24} more colliding nodes
                                  </div>
                                )}
                              </div>
                            )}
                            <div className="clash-popover-actions">
                              <button
                                type="button"
                                className={`clash-highlight-btn ${highlightClashesIn3D ? 'active' : ''}`}
                                onClick={() => setHighlightClashesIn3D(prev => !prev)}
                                title="Highlight colliding nodes in bright crimson inside 3D viewport"
                              >
                                <EyeIcon size={11} />
                                <span>{highlightClashesIn3D ? 'Hide 3D Clashes' : 'Highlight in 3D'}</span>
                              </button>
                              <button
                                type="button"
                                className="clash-fix-btn"
                                onClick={() => {
                                  setShowClashPopover(false);
                                  onPrefixActiveNodes();
                                }}
                                title={`Rename active colliding nodes & references with '${suggestedPrefix}' prefix`}
                              >
                                <CheckIcon size={11} />
                                <span>Prefix Active ({suggestedPrefix}*)</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {/* Undo & Redo Controls */}
          {(onUndo || onRedo) && (
            <div className="header-pill-group undo-redo-group">
              <button
                type="button"
                onClick={onUndo}
                className="header-icon-action-btn"
                title="Undo last change in 3D or Code Editor (Ctrl+Z)"
              >
                <UndoIcon size={13} />
              </button>
              <button
                type="button"
                onClick={onRedo}
                className="header-icon-action-btn"
                title="Redo change in 3D or Code Editor (Ctrl+Y)"
              >
                <RedoIcon size={13} />
              </button>
            </div>
          )}

          <div className="header-divider" />

          {/* Combined Snap Mode & Value Pill Group */}
          <div className="header-pill-group snap-pill-group">
            <button
              type="button"
              onClick={handleToggleSnapMode}
              className="header-pill-btn snap-mode-btn"
              title={`Snap Mode: ${snapMode === 'grid' ? 'Grid Snap' : 'DAE Mesh Snap'}. Click to switch to ${snapMode === 'grid' ? 'DAE Snap' : 'Grid Snap'}.`}
            >
              <SnapIcon
                size={12}
                active={
                  (snapMode === 'grid' && internalGridSnap > 0) ||
                  (snapMode === 'dae' && snapToMeshVertex)
                }
              />
              <span className="snap-mode-label">{snapMode === 'grid' ? 'Grid' : 'DAE'}</span>
            </button>

            <button
              type="button"
              onClick={snapMode === 'grid' ? cycleGridSnap : handleToggleDaeSnapValue}
              className={`header-pill-btn snap-value-pill ${
                (snapMode === 'grid' && internalGridSnap > 0) || (snapMode === 'dae' && snapToMeshVertex)
                  ? 'active'
                  : ''
              }`}
              title={
                snapMode === 'grid'
                  ? 'Grid Snap: Free, 0.05m, 0.1m, 0.25m, 0.5m. Click to cycle. [G]'
                  : `DAE Mesh Snapping: ${snapToMeshVertex ? 'ON' : 'OFF'}. Click to toggle.`
              }
            >
              <span>
                {snapMode === 'grid'
                  ? (internalGridSnap > 0 ? `${internalGridSnap}m` : 'Free')
                  : (snapToMeshVertex ? 'ON' : 'OFF')}
              </span>
            </button>
          </div>

          {/* Bilateral Symmetry (X-Mirror) */}
          <div className="header-pill-group symmetry-pill-group">
            <button
              type="button"
              onClick={() => onToggleSymmetry && onToggleSymmetry()}
              className={`header-pill-btn ${symmetryEnabled ? 'active' : ''}`}
              title={`Bilateral Left/Right Symmetry Mirroring (X-Axis): ${symmetryEnabled ? 'ON' : 'OFF'}`}
            >
              <SymmetryIcon size={13} active={Boolean(symmetryEnabled)} />
              <span className="symmetry-label">X-Mirror</span>
            </button>
          </div>

          {/* Connected Topology Focus Pill */}
          {(selectedNodeId || multiSelectedNodes.length > 0) && (
            <div className="header-pill-group focus-pill-group">
              <button
                type="button"
                onClick={() => setFocusConnectedTopology(prev => !prev)}
                className={`header-pill-btn ${focusConnectedTopology ? 'active' : ''}`}
                style={focusConnectedTopology ? { borderColor: 'rgba(56, 189, 248, 0.4)', background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8' } : {}}
                title={`Connected Topology Focus (Neighborhood X-Ray): ${focusConnectedTopology ? 'ON (Highlighting connections, dimming background geometry)' : 'OFF'}. Click or press Alt+F to toggle.`}
              >
                <FocusIcon size={12} active={Boolean(focusConnectedTopology)} />
                <span>
                  {focusConnectedTopology
                    ? (focusStatsRef.current ? `Focus: ${focusStatsRef.current.beams} Beams, ${focusStatsRef.current.neighbors} Nodes` : 'Focus Connected')
                    : 'Focus: OFF'}
                </span>
              </button>
            </div>
          )}

          {/* Quick Action Pills for Selection (Extrude E, Connect F, Subdivide W) */}
          {(selectedNodeId || multiSelectedNodes.length > 0) && (
            <div className="header-pill-group selection-actions-group">
              <button
                type="button"
                onClick={() => handleExtrude([0, -0.3, 0])}
                className="header-pill-btn"
                title="Extrude Selected Node(s) with connecting beams and cross-bracing (E)"
              >
                <ExtrudeIcon size={12} />
                <span>Extrude</span>
              </button>
              {multiSelectedNodes.length >= 2 && (
                <button
                  type="button"
                  onClick={handleQuickConnect}
                  className="header-pill-btn"
                  title="Quick-Connect Selected Nodes into Beam, Triangle, or Quad (F)"
                >
                  <LinkIcon size={12} />
                  <span>Connect</span>
                </button>
              )}
            </div>
          )}

          {selectedBeamKey && (
            <div className="header-pill-group selection-actions-group">
              <button
                type="button"
                onClick={handleSubdivideSelectedBeam}
                className="header-pill-btn"
                title="Subdivide Selected Beam into Two Segments (W)"
              >
                <SubdivideIcon size={12} />
                <span>Subdivide</span>
              </button>
            </div>
          )}

          {/* Mirror Plane Detection Feedback Toast */}
          {mirrorPlaneFeedback && (
            <div className="header-pill-group">
              <span className="header-pill-btn active" style={{ color: '#38bdf8' }}>
                {mirrorPlaneFeedback}
              </span>
            </div>
          )}

          {/* Beam Physics Preset Dropdown (when adding beams) */}
          {currentTool === 'addBeam' && (
            <div className="header-preset-group">
              <span className="header-label">Preset:</span>
              <CustomSelect
                value={beamPreset}
                options={[
                  { value: 'standard', label: 'Standard (2MN/m)' },
                  { value: 'rigid', label: 'Rigid (8MN/m)' },
                  { value: 'support', label: 'Support' },
                  { value: 'light', label: 'Light (800kN/m)' },
                  { value: 'inherit', label: 'Inherit' }
                ]}
                onChange={(val) => setBeamPreset(val)}
                compact={true}
                searchable={false}
                className="header-custom-select"
                title="Beam Physics Preset"
              />
            </div>
          )}
        </div>

        {/* Header Center: Single Unified View Modes Button */}
        <div className="header-center">
          <button
            type="button"
            className={`header-pill-btn unified-hud-launcher-btn ${isHudOpen ? 'open' : ''} ${!isNormalClean ? 'has-active-modes' : ''}`}
            onClick={() => {
              if (!isHudOpen) {
                setIsHudOpen(true);
                setIsColorHudCollapsed(false);
              } else if (isColorHudCollapsed) {
                setIsColorHudCollapsed(false);
              } else {
                setIsHudOpen(false);
              }
            }}
            title="Toggle View Modes Panel (Parts & Flexbodies, Type Filters, Crash Zones, Heatmaps)"
          >
            <SlidersIcon size={13} />
            <span>View Modes</span>
            {(() => {
              const activeBadges = [];
              if (hasActiveIsolation) activeBadges.push('Isolated');
              if (hasActiveTypeFilter || colorMode === 'type') activeBadges.push('Type');
              if (activeCrashGroup || colorMode === 'crashZones') activeBadges.push('Crash');
              if (activeHeatmap) activeBadges.push(activeHeatmap[0].toUpperCase() + activeHeatmap.slice(1));
              if (activeBadges.length > 0) {
                return (
                  <span className="hud-launcher-active-summary">
                    {activeBadges.join(' + ')}
                  </span>
                );
              }
              return (
                <span className="segmented-mode-badge">
                  {partsAndFlexbodiesData.parts.length || 0}
                </span>
              );
            })()}
            <ChevronDownIcon size={10} className={`dropdown-chevron ${isHudOpen && !isColorHudCollapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Header Right: Primary Geometry, Physics & Viewport Menus */}
        <div className="header-right">
          {/* Primary Geometry Visibility */}
          <div className="header-pill-group">
            <button
              type="button"
              onClick={() => setVisibility(v => ({ ...v, nodes: !v.nodes }))}
              className={`header-pill-btn ${visibility.nodes ? 'active' : ''}`}
              title="Toggle Nodes Visibility"
            >
              Nodes
            </button>
            <button
              type="button"
              onClick={() => setVisibility(v => ({ ...v, beams: !v.beams }))}
              className={`header-pill-btn ${visibility.beams ? 'active' : ''}`}
              title="Toggle Beams Visibility"
            >
              Beams
            </button>
            <button
              type="button"
              onClick={() => setVisibility(v => ({ ...v, triangles: !v.triangles }))}
              className={`header-pill-btn ${visibility.triangles ? 'active' : ''}`}
              title="Toggle Triangles Visibility"
            >
              Tris
            </button>
          </div>

          {/* Focused Physics Diagnostics Popover */}
          <div className="viewport-dropdown-container" ref={physicsMenuRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowPhysicsMenu(prev => !prev);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className={`header-pill-btn overlays-dropdown-trigger ${showPhysicsMenu ? 'active' : ''}`}
              title="Physics & Kinematics Diagnostics (Wheels, Swaybars, SlideNodes, CoG, Aerodynamics, RefNodes, Cameras)"
            >
              <MechanicalIcon size={12} />
              <span>Physics</span>
              <ChevronDownIcon size={11} className={`dropdown-chevron ${showPhysicsMenu ? 'rotate-180' : ''}`} />
            </button>

            {showPhysicsMenu && (
              <div
                className="viewport-dropdown-menu"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                style={{ minWidth: 260 }}
              >
                <div className="dropdown-section-title">Physics Diagnostics</div>

                <label className="dropdown-menu-item" title="Render soft-body tire carcass, rim spokes, and pressure surfaces">
                  <input
                    type="checkbox"
                    checked={showPressureWheels}
                    onChange={() => setShowPressureWheels(w => !w)}
                  />
                  <span className="dropdown-item-label">PressureWheels Skeleton</span>
                  {detectedPhysics.wheelCount > 0 && (
                    <span className="dropdown-item-badge">{detectedPhysics.wheelCount}</span>
                  )}
                </label>

                {showPressureWheels && (
                  <label className="dropdown-menu-item" style={{ paddingLeft: 28 }} title="Render parametric 3D tire and rim geometry overlay">
                    <input
                      type="checkbox"
                      checked={showGhostWheels}
                      onChange={() => setShowGhostWheels(w => !w)}
                    />
                    <span className="dropdown-item-label">Ghost Wheels & Tires</span>
                  </label>
                )}

                <label className="dropdown-menu-item" title="Render anti-roll / swaybar torsion axis cylinders and lever arms">
                  <input
                    type="checkbox"
                    checked={showTorsionBars}
                    onChange={() => setShowTorsionBars(t => !t)}
                  />
                  <span className="dropdown-item-label">Torsion Bars / Swaybars</span>
                  {detectedPhysics.torsionBarCount > 0 && (
                    <span className="dropdown-item-badge">{detectedPhysics.torsionBarCount}</span>
                  )}
                </label>

                <label className="dropdown-menu-item" title="Render guide rails, end caps, and sliding collar nodes">
                  <input
                    type="checkbox"
                    checked={showSlideNodes}
                    onChange={() => setShowSlideNodes(s => !s)}
                  />
                  <span className="dropdown-item-label">Rails & SlideNodes</span>
                  {detectedPhysics.hasRailsOrSlideNodes && (
                    <span className="dropdown-item-badge">Active</span>
                  )}
                </label>

                <label className="dropdown-menu-item" title="Display total center of mass marker in 3D space">
                  <input
                    type="checkbox"
                    checked={showCogMarker}
                    onChange={() => setShowCogMarker(c => !c)}
                  />
                  <span className="dropdown-item-label">Center of Gravity</span>
                  <span className="dropdown-item-badge">{massStats.totalMassKg} kg</span>
                </label>

                <label className="dropdown-menu-item" title="Visualize aerodynamic surface Center of Pressure (CoP) & frontal projected area">
                  <input
                    type="checkbox"
                    checked={showAeroCoP}
                    onChange={() => setShowAeroCoP(a => !a)}
                  />
                  <span className="dropdown-item-label">Aerodynamics & CoP</span>
                  {aeroStats?.valid && (
                    <span className="dropdown-item-badge">{aeroStats.frontalAreaM2.toFixed(2)} m²</span>
                  )}
                </label>

                {showAeroCoP && (
                  <label className="dropdown-menu-item" style={{ paddingLeft: 28 }} title="Show 3D aerodynamic airflow normal vectors on surfaces">
                    <input
                      type="checkbox"
                      checked={showAeroVectors}
                      onChange={() => setShowAeroVectors(v => !v)}
                    />
                    <span className="dropdown-item-label">Surface Flow Vectors</span>
                  </label>
                )}

                <label className="dropdown-menu-item" title="Vehicle coordinate reference frame triad (refNodes: ref, back, left, up)">
                  <input
                    type="checkbox"
                    checked={showRefNodes}
                    onChange={() => setShowRefNodes(r => !r)}
                  />
                  <span className="dropdown-item-label">Frame Triad (refNodes)</span>
                  {refNodesData?.valid && (
                    <span className="dropdown-item-badge">[{refNodesData.refNode}]</span>
                  )}
                </label>

                <label className="dropdown-menu-item" title="Driver / cockpit internal camera view frustums (camerasInternal)">
                  <input
                    type="checkbox"
                    checked={showCamerasInternal}
                    onChange={() => setShowCamerasInternal(c => !c)}
                  />
                  <span className="dropdown-item-label">Cockpit Cameras</span>
                  {camerasData?.length > 0 && (
                    <span className="dropdown-item-badge">{camerasData.length}</span>
                  )}
                </label>

                <div className="dropdown-menu-divider" />
                <div
                  className="dropdown-menu-action-item"
                  onClick={() => {
                    handleDetectPlanes();
                    setShowPhysicsMenu(false);
                  }}
                  title="Detect model symmetry plane via Principal Component Analysis (PCA)"
                >
                  <SymmetryIcon size={12} />
                  <span>Analyze PCA Symmetry Planes</span>
                </div>
              </div>
            )}
          </div>

          {/* Focused View Overlays & Background Popover */}
          <div className="viewport-dropdown-container" ref={viewMenuRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowViewMenu(prev => !prev);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className={`header-pill-btn overlays-dropdown-trigger ${showViewMenu ? 'active' : ''}`}
              title="Display Overlays, Shading & Viewport Background"
            >
              <EyeIcon size={12} />
              <span>View</span>
              <ChevronDownIcon size={11} className={`dropdown-chevron ${showViewMenu ? 'rotate-180' : ''}`} />
            </button>

            {showViewMenu && (
              <div
                className="viewport-dropdown-menu"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                style={{ minWidth: 240 }}
              >
                <div className="dropdown-section-title">Display Overlays</div>

                <label className="dropdown-menu-item">
                  <input
                    type="checkbox"
                    checked={visibility.labels}
                    onChange={() => setVisibility(v => ({ ...v, labels: !v.labels }))}
                  />
                  <span className="dropdown-item-label">Node Name Labels</span>
                </label>

                <label className="dropdown-menu-item">
                  <input
                    type="checkbox"
                    checked={showFrontIndicator}
                    onChange={() => setShowFrontIndicator(v => !v)}
                  />
                  <span className="dropdown-item-label">Forward Direction (-Y)</span>
                </label>

                <label className="dropdown-menu-item">
                  <input
                    type="checkbox"
                    checked={showNormals}
                    onChange={() => setShowNormals(v => !v)}
                  />
                  <span className="dropdown-item-label">Surface Normal Vectors</span>
                </label>

                <label className="dropdown-menu-item">
                  <input
                    type="checkbox"
                    checked={faceOrientation}
                    onChange={() => setFaceOrientation(v => !v)}
                  />
                  <span className="dropdown-item-label">Face Orientation (Blue/Red)</span>
                </label>

                <label className="dropdown-menu-item" title="Highlight directly connected beams & neighbor nodes, dimming unconnected vehicle geometry (Alt+F)">
                  <input
                    type="checkbox"
                    checked={focusConnectedTopology}
                    onChange={() => setFocusConnectedTopology(v => !v)}
                  />
                  <span className="dropdown-item-label">Focus Connected Topology (Alt+F)</span>
                </label>

                <div className="dropdown-menu-divider" />
                <div className="dropdown-section-title">Viewport Background</div>
                <div className="dropdown-bg-theme-pills">
                  {Object.values(VIEWPORT_BG_PRESETS).map(preset => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`bg-theme-pill ${viewportBg === preset.id ? 'active' : ''}`}
                      onClick={() => setViewportBg(preset.id)}
                      title={preset.description}
                    >
                      <span className="bg-theme-color-dot" style={{ backgroundColor: preset.hex }} />
                      <span className="bg-theme-label">{preset.label}</span>
                      {viewportBg === preset.id && (
                        <CheckIcon size={12} className="bg-theme-check-icon" />
                      )}
                    </button>
                  ))}
                </div>

                {(onOpenBlueprintModal || onOpenObjModal) && (
                  <>
                    <div className="dropdown-menu-divider" />
                    <div className="dropdown-section-title">Tools</div>
                    {onOpenBlueprintModal && (
                      <div
                        className="dropdown-menu-action-item"
                        onClick={() => {
                          onOpenBlueprintModal();
                          setShowViewMenu(false);
                        }}
                        title="Open Blueprint & Reference Tracing Studio (2-Point Scale Calibration)"
                      >
                        <BlueprintIcon size={12} />
                        <span>Blueprint & Reference Tracing</span>
                      </div>
                    )}
                    {onOpenObjModal && (
                      <div
                        className="dropdown-menu-action-item"
                        onClick={() => {
                          onOpenObjModal();
                          setShowViewMenu(false);
                        }}
                        title="Open Wavefront OBJ Converter"
                      >
                        <ObjModelIcon size={12} />
                        <span>Wavefront OBJ Converter</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="header-divider" />

          {/* Option 3: Collada Visual Mesh (.dae) Ghost Overlay */}
          <div className="header-pill-group dae-pill-group">
            <input
              type="file"
              ref={daeInputRef}
              accept=".dae"
              style={{ display: 'none' }}
              onChange={handleDaeFileChosen}
            />

            {(discoveredDaeFiles && discoveredDaeFiles.length > 0) || visualMeshDaeText ? (
              <div className="viewport-dropdown-container dae-dropdown-container" ref={daeMenuRef}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDaeDropdown(prev => !prev);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className={`header-pill-btn dae-dropdown-trigger ${showDaeDropdown ? 'active' : ''} ${visualMeshDaeText && meshVisible ? 'has-mesh' : ''}`}
                  title={visualMeshDaeText ? `Visual Mesh: ${visualMeshName || 'Loaded'} (${meshVisible ? `${Math.round(meshOpacity * 100)}% Ghost` : 'Hidden'})` : "Visual Mesh Overlay: Select a 3D model (.dae) to overlay or adjust shading"}
                >
                  <MeshIcon size={12} />
                  <span className="dae-trigger-label" style={{ opacity: visualMeshDaeText && !meshVisible ? 0.6 : 1 }}>
                    {selectedDaePath === '__none__' || !visualMeshName
                      ? 'No Visual Mesh'
                      : (visualMeshName && (visualMeshName === '__all__' || visualMeshName.startsWith('All Project Models'))
                        ? `All Models (${discoveredDaeFiles?.length || 0})`
                        : visualMeshName)}
                  </span>
                  <ChevronDownIcon size={10} className={`dropdown-chevron ${showDaeDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showDaeDropdown && (
                  <div
                    className="viewport-dropdown-menu dae-mesh-menu"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Active Mesh Shading & Display Controls */}
                    {visualMeshDaeText && (
                      <div className="dae-menu-shading-section">
                        <div className="dropdown-section-title">Mesh Shading & Display</div>
                        <div className="dae-shading-pills">
                          <button
                            type="button"
                            onClick={handleToggleIsolate}
                            className={`header-pill-btn dae-pill-action ${effectiveIsolateMesh ? 'active' : ''}`}
                            title={effectiveIsolateMesh
                              ? "Currently showing ONLY 3D submeshes matching active .jbeam file. Click to show full vehicle."
                              : "Currently showing entire 3D model. Click to isolate ONLY 3D submeshes matching active .jbeam file."
                            }
                          >
                            <FocusIcon size={12} />
                            <span>{effectiveIsolateMesh ? 'Active Only' : 'All Meshes'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setMeshWireframe(w => !w)}
                            className={`header-pill-btn dae-pill-action ${meshWireframe ? 'active' : ''}`}
                            title="Toggle Solid Surface vs Wireframe Cage"
                          >
                            <WireframeIcon size={12} />
                            <span>{meshWireframe ? 'Wireframe' : 'Solid'}</span>
                          </button>
                        </div>

                        <div className="dae-slider-row">
                          <div className="dae-slider-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <button
                              type="button"
                              onClick={() => setMeshVisible(v => !v)}
                              className={`header-pill-btn dae-pill-action ${meshVisible ? 'active' : ''}`}
                              style={{ padding: '2px 8px', fontSize: 11, height: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                              title={meshVisible ? 'Visual Mesh Ghost Visible (Click to Hide)' : 'Visual Mesh Ghost Hidden (Click to Show)'}
                            >
                              <GhostIcon size={12} />
                              <span>{meshVisible ? 'Ghost Mesh' : 'Mesh Hidden'}</span>
                            </button>
                            <span className="dae-slider-value" style={{ opacity: meshVisible ? 1 : 0.4 }}>
                              {meshVisible ? `${Math.round(meshOpacity * 100)}%` : 'Hidden'}
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0.05"
                            max="1"
                            step="0.05"
                            disabled={!meshVisible}
                            value={meshOpacity}
                            onChange={(e) => {
                              setMeshOpacity(parseFloat(e.target.value));
                              if (!meshVisible) setMeshVisible(true);
                            }}
                            className="dae-menu-opacity-slider"
                            style={{ opacity: meshVisible ? 1 : 0.35, cursor: meshVisible ? 'pointer' : 'not-allowed' }}
                            title={meshVisible ? `Adjust Ghost Opacity (${Math.round(meshOpacity * 100)}%)` : 'Click Ghost Mesh to enable and adjust opacity'}
                          />
                        </div>

                        <div className="dropdown-menu-divider" />
                      </div>
                    )}

                    <div className="dropdown-section-title">Select 3D Mesh (.dae)</div>

                    {/* No Visual Mesh */}
                    <div
                      className={`dropdown-menu-action-item dae-menu-option ${selectedDaePath === '__none__' || !visualMeshName ? 'active' : ''}`}
                      onClick={() => {
                        if (visualMeshManagerRef.current) {
                          visualMeshManagerRef.current.clear();
                        }
                        if (onUnloadVisualMesh) {
                          onUnloadVisualMesh();
                        }
                        if (onSelectProjectDae) {
                          onSelectProjectDae('__none__');
                        }
                        setShowDaeDropdown(false);
                      }}
                    >
                      <div className="dae-option-icon">
                        <CloseIcon size={12} />
                      </div>
                      <div className="dae-option-text">
                        <div className="dae-option-title">No Visual Mesh</div>
                        <div className="dae-option-desc">Hide all visual Collada meshes</div>
                      </div>
                      {(selectedDaePath === '__none__' || !visualMeshName) && <span className="view-mode-option-check"><CheckIcon size={12} /></span>}
                    </div>

                    {/* All Project Models */}
                    {discoveredDaeFiles && discoveredDaeFiles.length > 1 && (
                      <div
                        className={`dropdown-menu-action-item dae-menu-option ${
                          visualMeshName && (visualMeshName === '__all__' || visualMeshName.startsWith('All Project Models'))
                            ? 'active'
                            : ''
                        }`}
                        onClick={() => {
                          if (onSelectProjectDae) onSelectProjectDae('__all__');
                          setShowDaeDropdown(false);
                        }}
                      >
                        <div className="dae-option-icon">
                          <LayersIcon size={13} />
                        </div>
                        <div className="dae-option-text">
                          <div className="dae-option-title">All Project Models ({discoveredDaeFiles.length} files)</div>
                          <div className="dae-option-desc">Composite all discovered project .dae meshes</div>
                        </div>
                        {visualMeshName && (visualMeshName === '__all__' || visualMeshName.startsWith('All Project Models')) && (
                          <span className="view-mode-option-check"><CheckIcon size={12} /></span>
                        )}
                      </div>
                    )}

                    {discoveredDaeFiles && discoveredDaeFiles.length > 0 && <div className="dropdown-menu-divider" />}
                    {discoveredDaeFiles && discoveredDaeFiles.length > 0 && <div className="dropdown-section-title">Project DAE Files</div>}

                    {discoveredDaeFiles && discoveredDaeFiles.map(d => {
                      const isSelected = selectedDaePath !== '__none__' && (selectedDaePath === d.path || (!selectedDaePath && visualMeshName === d.name));
                      return (
                        <div
                          key={d.path}
                          className={`dropdown-menu-action-item dae-menu-option ${isSelected ? 'active' : ''}`}
                          onClick={() => {
                            if (onSelectProjectDae) onSelectProjectDae(d.path);
                            setShowDaeDropdown(false);
                          }}
                        >
                          <div className="dae-option-icon">
                            <MeshIcon size={13} />
                          </div>
                          <div className="dae-option-text">
                            <div className="dae-option-title">{d.name}</div>
                            <div className="dae-option-desc">{d.path}</div>
                          </div>
                          {isSelected && <span className="view-mode-option-check"><CheckIcon size={12} /></span>}
                        </div>
                      );
                    })}

                    <div className="dropdown-menu-divider" />

                    {/* Browse Other .dae */}
                    <div
                      className="dropdown-menu-action-item dae-menu-option browse-option"
                      onClick={() => {
                        setShowDaeDropdown(false);
                        if (onOpenDaeDialog) onOpenDaeDialog();
                        else daeInputRef.current?.click();
                      }}
                    >
                      <div className="dae-option-icon">
                        <FileIcon size={13} />
                      </div>
                      <div className="dae-option-text">
                        <div className="dae-option-title">+ Browse other .dae...</div>
                        <div className="dae-option-desc">Select a .dae file from local disk</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (onOpenDaeDialog) onOpenDaeDialog();
                  else daeInputRef.current?.click();
                }}
                className={`header-pill-btn ${visualMeshDaeText ? 'active' : ''}`}
                title="Load Collada (.dae) 3D Model Visual Overlay"
              >
                <MeshIcon size={12} />
                <span>+ .dae</span>
              </button>
            )}
          </div>

          {/* Detach 3D Viewport Action */}
          {onDetachViewport && (
            <div className="header-pill-group">
              <button
                type="button"
                onClick={onDetachViewport}
                className="header-pill-btn detach-viewport-pill-btn"
                title="Detach 3D Viewport to Separate Window"
              >
                <PopoutIcon size={12} />
                <span>Detach</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Left Vertical Blender Tool Shelf (T-Panel) */}
      <div className="blender-tool-shelf">
        <button
          onClick={() => handleSetTool('select')}
          className={`blender-tool-btn ${currentTool === 'select' ? 'active' : ''}`}
          title="Select & Move (W or V)"
        >
          <SelectIcon size={17} />
          <span className="tool-tooltip">Select (W)</span>
        </button>

        <button
          onClick={() => handleSetTool(currentTool === 'boxSelect' ? 'select' : 'boxSelect')}
          className={`blender-tool-btn ${currentTool === 'boxSelect' ? 'active' : ''}`}
          title="Box / Marquee Multi-Select (B or Shift+Drag)"
        >
          <BoxSelectIcon size={17} />
          <span className="tool-tooltip">Box Select (B)</span>
        </button>

        <button
          onClick={() => handleSetTool('addNode')}
          className={`blender-tool-btn ${currentTool === 'addNode' ? 'active' : ''}`}
          title="Add Node (N)"
        >
          <NodeIcon size={17} />
          <span className="tool-tooltip">Add Node (N)</span>
        </button>

        <button
          onClick={() => handleSetTool('addBeam')}
          className={`blender-tool-btn ${currentTool === 'addBeam' ? 'active' : ''}`}
          title="Connect Beam Between Nodes (C)"
        >
          <BeamIcon size={17} />
          <span className="tool-tooltip">Connect Beam (C)</span>
        </button>

        <button
          onClick={() => handleSetTool('addTri')}
          className={`blender-tool-btn ${currentTool === 'addTri' ? 'active' : ''}`}
          title="Build Triangle Surface (T)"
        >
          <TriangleIcon size={17} />
          <span className="tool-tooltip">Add Triangle (T)</span>
        </button>

        <button
          onClick={() => handleSetTool('addQuad')}
          className={`blender-tool-btn ${currentTool === 'addQuad' ? 'active' : ''}`}
          title="Build Quad Surface (Q)"
        >
          <QuadIcon size={17} />
          <span className="tool-tooltip">Add Quad (Q)</span>
        </button>

        <button
          onClick={() => handleSetTool(currentTool === 'batchRename' ? 'select' : 'batchRename')}
          className={`blender-tool-btn ${currentTool === 'batchRename' ? 'active' : ''}`}
          title="Batch Node Renamer (R) - Click nodes in 3D to rename sequentially"
        >
          <TagIcon size={17} />
          <span className="tool-tooltip">Batch Renamer (R)</span>
        </button>

        <div className="blender-tool-divider" />

        <button
          onClick={handleDeleteClick}
          disabled={!selectedNodeId && !selectedBeamKey && !selectedSurfaceInfo && multiSelectedNodes.length === 0}
          className={`blender-tool-btn delete-tool-btn ${selectedNodeId || selectedBeamKey || selectedSurfaceInfo || multiSelectedNodes.length > 0 ? 'can-delete' : ''}`}
          title={multiSelectedNodes.length > 1 ? `Delete ${multiSelectedNodes.length} Selected Nodes ${symmetryEnabled ? '(+Mirror)' : ''} (Delete)` : (selectedSurfaceInfo ? `Delete Surface ${symmetryEnabled ? '(+Mirror)' : ''} (Delete)` : `Delete Selected Element ${symmetryEnabled ? '(+Mirror)' : ''} (Delete)`)}
        >
          <TrashIcon size={17} />
          <span className="tool-tooltip">Delete (Del)</span>
        </button>
      </div>

      {/* Dynamic Creation Prompt Banner (Modern Dark Theme Matching Rest of Studio) */}
      {currentTool !== 'select' && (
        <div className="blender-action-prompt">
          {(!jbeamParts || Object.keys(jbeamParts).filter(k => k !== '__meta').length === 0) ? (
            <div className="prompt-content-row">
              <span className="prompt-tool-badge" style={{ borderColor: 'rgba(245, 158, 11, 0.4)', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
                <NodeIcon size={12} />
                <span>Notice</span>
              </span>
              <span className="prompt-instruction-text" style={{ color: '#fbbf24' }}>
                No active JBeam file open. Open a file to start editing.
              </span>
              <button
                type="button"
                onClick={() => handleSetTool('select')}
                className="prompt-cancel-btn"
                title="Cancel (Esc)"
              >
                <CloseIcon size={10} />
                <span>Esc</span>
              </button>
            </div>
          ) : (
            <>
              {currentTool === 'addNode' && (
            <div className="prompt-content-row">
              <span className="prompt-tool-badge">
                <NodeIcon size={12} />
                <span>Add Node</span>
              </span>
              <span className="prompt-instruction-text">
                Click in viewport to place node
                {cursorCoords && (
                  <span className="prompt-data-badge">
                    [{cursorCoords.map(c => c.toFixed(2)).join(', ')}]
                  </span>
                )}
                {symmetryEnabled && (
                  <span className="prompt-subtle-tag">+ Mirror Pair</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => handleSetTool('select')}
                className="prompt-cancel-btn"
                title="Cancel (Esc or Right-Click)"
              >
                <CloseIcon size={10} />
                <span>Esc</span>
              </button>
            </div>
          )}

          {currentTool === 'addBeam' && (
            <div className="prompt-content-row">
              <span className="prompt-tool-badge">
                <BeamIcon size={12} />
                <span>Connect Beam</span>
              </span>
              <span className="prompt-instruction-text">
                {!pendingBeamStart ? (
                  'Click 1st node to start'
                ) : (
                  <>
                    Connect from <b>"{pendingBeamStart.id || pendingBeamStart}"</b>
                    {pendingBeamStart.tabTitle && (
                      <span className="prompt-comp-tag" style={{ marginLeft: 4, opacity: 0.8, fontSize: 11 }}>({pendingBeamStart.tabTitle})</span>
                    )}
                    {hoveredNodeInfo && (
                      <>
                        <span style={{ margin: '0 4px', opacity: 0.6 }}>→</span>
                        to <b>"{hoveredNodeInfo.id}"</b>
                        {hoveredNodeInfo.tabTitle && (
                          <span className="prompt-comp-tag" style={{ marginLeft: 4, opacity: 0.8, fontSize: 11 }}>({hoveredNodeInfo.tabTitle})</span>
                        )}
                        {(hoveredNodeInfo.partName !== pendingBeamStart.partName || hoveredNodeInfo.isNonActive !== pendingBeamStart.isNonActive) && (
                          <span className="prompt-crosspart-badge" style={{ marginLeft: 6, color: '#f59e0b', fontWeight: 600, fontSize: 11 }}>
                            Cross-Part {hoveredNodeInfo.id === (pendingBeamStart.id || pendingBeamStart) ? '(Auto-Prefix Clash)' : '(optional: true)'}
                          </span>
                        )}
                      </>
                    )}
                    {beamLength && (
                      <span className="prompt-data-badge" style={{ marginLeft: 6 }}>{beamLength.toFixed(3)} m</span>
                    )}
                  </>
                )}
              </span>
              <button
                type="button"
                onClick={() => {
                  setPendingBeamStart(null);
                  handleSetTool('select');
                }}
                className="prompt-cancel-btn"
                title="Cancel (Esc or Right-Click)"
              >
                <CloseIcon size={10} />
                <span>Esc</span>
              </button>
            </div>
          )}

          {currentTool === 'addTri' && (
            <div className="prompt-content-row">
              <span className="prompt-tool-badge">
                <TriangleIcon size={12} />
                <span>Build Triangle</span>
              </span>
              <span className="prompt-instruction-text">
                Step {pendingTriNodes.length + 1} of 3:
                <span className="prompt-data-badge">
                  {pendingTriNodes.length === 0 ? 'Click 1st vertex' : pendingTriNodes.join(' → ')}
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setPendingTriNodes([]);
                  handleSetTool('select');
                }}
                className="prompt-cancel-btn"
                title="Cancel (Esc or Right-Click)"
              >
                <CloseIcon size={10} />
                <span>Esc</span>
              </button>
            </div>
          )}

          {currentTool === 'addQuad' && (
            <div className="prompt-content-row">
              <span className="prompt-tool-badge">
                <QuadIcon size={12} />
                <span>Build Quad</span>
              </span>
              <span className="prompt-instruction-text">
                Step {pendingQuadNodes.length + 1} of 4:
                <span className="prompt-data-badge">
                  {pendingQuadNodes.length === 0 ? 'Click 1st vertex' : pendingQuadNodes.join(' → ')}
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setPendingQuadNodes([]);
                  handleSetTool('select');
                }}
                className="prompt-cancel-btn"
                title="Cancel (Esc or Right-Click)"
              >
                <CloseIcon size={10} />
                <span>Esc</span>
              </button>
            </div>
          )}

          {currentTool === 'extrude' && (
            <div className="prompt-content-row">
              <span className="prompt-tool-badge">
                <ExtrudeIcon size={12} />
                <span>Extrude</span>
              </span>
              <span className="prompt-instruction-text">
                Click destination in 3D viewport or press <kbd>E</kbd> to extend selected node(s).
              </span>
              <button
                type="button"
                onClick={() => handleSetTool('select')}
                className="prompt-cancel-btn"
                title="Cancel (Esc or Right-Click)"
              >
                <CloseIcon size={10} />
                <span>Esc</span>
              </button>
            </div>
          )}

          {currentTool === 'batchRename' && (
            <div className="prompt-content-row">
              <span className="prompt-tool-badge">
                <TagIcon size={12} />
                <span>Batch Renamer</span>
              </span>
              <div className="prompt-inline-group">
                <label>Pattern:</label>
                <input
                  type="text"
                  value={batchRenamePattern}
                  onChange={(e) => onUpdateBatchRenamePattern && onUpdateBatchRenamePattern(e.target.value)}
                  className="prompt-inline-input"
                  title="Naming scheme with '#' placeholder (e.g. #fl, node_#_r, cab##)"
                  placeholder="#fl"
                />
              </div>
              <div className="prompt-inline-group">
                <label>Index:</label>
                <NumberStepper
                  min={1}
                  value={batchRenameIndex}
                  onChange={(val) => onUpdateBatchRenameIndex && onUpdateBatchRenameIndex(val)}
                  title="Next sequential index number"
                  width={54}
                />
              </div>
              <span className="prompt-data-badge" title="Next node clicked will be renamed to this">
                Next: <b>{formatBatchNodeName(batchRenamePattern, batchRenameIndex)}</b>
              </span>
              <span className="prompt-instruction-text">
                {hoveredNodeId ? (
                  <span>Rename <b>{hoveredNodeId}</b> → <b>{formatBatchNodeName(batchRenamePattern, batchRenameIndex)}</b></span>
                ) : (
                  <span>Click node in 3D to rename</span>
                )}
              </span>
              {lastRenamedFeedback && (
                <span className="prompt-toast-success">
                  {lastRenamedFeedback.oldId} → {lastRenamedFeedback.newId}
                </span>
              )}
              <button
                type="button"
                onClick={() => handleSetTool('select')}
                className="prompt-cancel-btn"
                title="Exit Batch Renamer (Esc)"
              >
                <CloseIcon size={10} />
                <span>Done</span>
              </button>
            </div>
          )}
            </>
          )}
        </div>
      )}

      {/* Multi-Part Action Result Banner (Auto-Mount / Clash Fix Feedback) */}
      {viewportSource === 'openTabs' && multiPartFeedback && (
        <div
          className={`multipart-feedback-banner type-${multiPartFeedback.type || 'info'}`}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="multipart-feedback-main">
            <span className="multipart-feedback-icon">
              {multiPartFeedback.type === 'mount' ? (
                <LinkIcon size={13} />
              ) : multiPartFeedback.type === 'clash' ? (
                <CheckIcon size={13} />
              ) : (
                <InfoIcon size={13} />
              )}
            </span>
            <div className="multipart-feedback-text">
              <span className="multipart-feedback-title">{multiPartFeedback.title}</span>
              {multiPartFeedback.summary && (
                <span className="multipart-feedback-summary">{multiPartFeedback.summary}</span>
              )}
            </div>
          </div>

          {Array.isArray(multiPartFeedback.items) && multiPartFeedback.items.length > 0 && (
            <div className="multipart-feedback-chips">
              {multiPartFeedback.items.map((item, idx) => (
                <span key={idx} className="multipart-feedback-chip">{item}</span>
              ))}
            </div>
          )}

          <div className="multipart-feedback-actions">
            {multiPartFeedback.type === 'mount' && nonActiveViewType !== 'crossBeams' && onChangeNonActiveViewType && (
              <button
                type="button"
                className="multipart-feedback-btn primary"
                onClick={() => onChangeNonActiveViewType('crossBeams')}
              >
                <BeamIcon size={11} />
                <span>View Cross-Beams</span>
              </button>
            )}
            {multiPartFeedback.undoable && onUndo && (
              <button
                type="button"
                className="multipart-feedback-btn"
                onClick={() => {
                  onUndo();
                  if (onDismissMultiPartFeedback) onDismissMultiPartFeedback();
                }}
              >
                <UndoIcon size={11} />
                <span>Undo</span>
              </button>
            )}
            {onDismissMultiPartFeedback && (
              <button
                type="button"
                className="multipart-feedback-close"
                onClick={onDismissMultiPartFeedback}
                title="Dismiss"
              >
                <CloseIcon size={11} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3D Unified Viewport Controls HUD */}
      {!isMeshesTabActive && isHudOpen &&
        jbeamParts && Object.keys(jbeamParts).filter(k => k !== '__meta').length > 0 && (
        isColorHudCollapsed ? (
          <div
            className="heatmap-legend-hud collapsed"
            onClick={() => setIsColorHudCollapsed(false)}
            title="Click bar or Expand to open full HUD"
          >
            <div className="hud-collapsed-bar">
              <div className="hud-collapsed-tabs">
                {[
                  { id: 'parts', label: 'Parts', icon: <MeshIcon size={11} />, dot: hasActiveIsolation },
                  { id: 'type', label: 'Type', icon: '⚡', dot: hasActiveTypeFilter || colorMode === 'type' },
                  { id: 'crash', label: 'Crash', icon: '💥', dot: Boolean(activeCrashGroup) || colorMode === 'crashZones' },
                  { id: 'heatmap', label: activeHeatmap ? activeHeatmap[0].toUpperCase() + activeHeatmap.slice(1) : 'Heat', icon: '🌡️', dot: Boolean(activeHeatmap) }
                ].map(t => (
                  <button
                    key={t.id}
                    type="button"
                    className={`hud-collapsed-mini-tab ${hudActiveTab === t.id ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setHudActiveTab(t.id);
                      if (t.id === 'parts' && colorMode === 'default') setColorMode('part');
                      if (t.id === 'type' && colorMode === 'default') setColorMode('type');
                      if (t.id === 'crash') setColorMode('crashZones');
                      if (t.id === 'heatmap' && !activeHeatmap) setActiveHeatmap('mass');
                      setIsColorHudCollapsed(false);
                    }}
                    title={`Switch to ${t.label} and expand HUD`}
                  >
                    <span className="mini-tab-icon">{t.icon}</span>
                    <span>{t.label}</span>
                    {t.dot && <span className="tab-indicator-dot">•</span>}
                  </button>
                ))}
              </div>
              <div className="hud-collapsed-divider" />
              <div className="hud-collapsed-quick-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className={`hud-collapsed-action-btn ${hasActiveIsolation ? 'unhide-all' : 'hide-all'}`}
                  onClick={toggleHideUnhideAll}
                  title={hasActiveIsolation ? 'Unhide all parts & flexbodies' : 'Hide all parts to isolate components'}
                >
                  {hasActiveIsolation ? 'Unhide' : 'Hide All'}
                </button>
                {!isNormalClean && (
                  <button
                    type="button"
                    className="hud-collapsed-action-btn reset-btn"
                    onClick={handleResetToNormal}
                    title="Reset all filters, heatmaps, and isolations to Normal"
                  >
                    ↺ Normal
                  </button>
                )}
                <button
                  type="button"
                  className="hud-header-btn"
                  onClick={() => setIsColorHudCollapsed(false)}
                  title="Expand HUD"
                >
                  <ChevronDownIcon size={11} />
                </button>
                <button
                  type="button"
                  className="hud-header-btn close"
                  onClick={() => setIsHudOpen(false)}
                  title="Close HUD"
                >
                  <CloseIcon size={10} />
                </button>
              </div>
            </div>
          </div>
        ) : (
        <div className={`heatmap-legend-hud ${hudActiveTab === 'parts' ? 'explorer-hud' : ''}`} title="Viewport Controls HUD">
          {/* Unique Toggle Tab Bar across all modes inside HUD */}
          <div className="unified-hud-tab-bar">
            <div className="unified-hud-tabs-group">
              <button
                type="button"
                className={`unified-hud-tab-btn ${hudActiveTab === 'parts' ? 'active' : ''}`}
                onClick={() => {
                  setHudActiveTab('parts');
                  if (colorMode === 'default') setColorMode('part');
                }}
                title="Parts & Flexbodies Explorer"
              >
                <MeshIcon size={11} />
                <span>Parts</span>
                {hasActiveIsolation && <span className="tab-indicator-dot">•</span>}
              </button>
              <button
                type="button"
                className={`unified-hud-tab-btn ${hudActiveTab === 'type' ? 'active' : ''}`}
                onClick={() => {
                  setHudActiveTab('type');
                  if (colorMode === 'default') setColorMode('type');
                }}
                title="Physics Classification & Filters"
              >
                <span>⚡ Type</span>
                {hasActiveTypeFilter && <span className="tab-indicator-dot">•</span>}
              </button>
              <button
                type="button"
                className={`unified-hud-tab-btn ${hudActiveTab === 'crash' ? 'active' : ''}`}
                onClick={() => {
                  setHudActiveTab('crash');
                  setColorMode('crashZones');
                }}
                title="Crash & Detachment Zones"
              >
                <span>💥 Crash</span>
                {activeCrashGroup && <span className="tab-indicator-dot">•</span>}
              </button>
              <button
                type="button"
                className={`unified-hud-tab-btn ${hudActiveTab === 'heatmap' ? 'active' : ''}`}
                onClick={() => {
                  setHudActiveTab('heatmap');
                  if (!activeHeatmap) setActiveHeatmap('mass');
                }}
                title="Physical Property Heatmaps"
              >
                <span>🌡️ Heat</span>
                {activeHeatmap && <span className="tab-indicator-dot">•</span>}
              </button>
            </div>

            <div className="unified-hud-header-actions">
              <button
                type="button"
                className={`hud-reset-normal-btn ${isNormalClean ? 'is-normal' : ''}`}
                onClick={handleResetToNormal}
                title="Reset all filters, isolations, and heatmaps to Normal CAD creation view"
              >
                ↺ Normal
              </button>
              <button
                type="button"
                className="hud-header-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsColorHudCollapsed(true);
                }}
                title="Collapse HUD to compact quick-action bar"
              >
                —
              </button>
              <button
                type="button"
                className="hud-header-btn close"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsHudOpen(false);
                }}
                title="Close View Modes (keeps active filters/modes)"
              >
                <CloseIcon size={10} />
              </button>
            </div>
          </div>

          {/* Active Isolation Filter Strip (shown across non-parts modes if isolation is active) */}
          {hasActiveIsolation && hudActiveTab !== 'parts' && (
            <div className="hud-isolation-active-strip">
              <span className="isolation-strip-text">
                👁 Scoped to Isolated Component(s)
              </span>
              <button
                type="button"
                className="isolation-strip-btn"
                onClick={clearAllIsolation}
                title="Clear isolation and view full vehicle"
              >
                Unhide All
              </button>
            </div>
          )}

          {/* Type Classification & Interactive Filter Legend */}
          {hudActiveTab === 'type' && (
            <div className="type-legend-container">
              {/* Quick Reset All Action */}
              <div className="type-filter-global-bar">
                <span className="text-muted" style={{ fontSize: 9 }}>Click chip to toggle, click [S] to solo:</span>
                <button
                  type="button"
                  className="type-btn-all"
                  onClick={showAllTypes}
                  title="Restore all beam, node, and surface types"
                >
                  Show All Types
                </button>
              </div>

              {/* BEAMS Section */}
              <div className="type-legend-group">
                <div className="type-legend-title-row">
                  <span className="type-legend-title">BEAMS</span>
                  <div className="type-legend-actions">
                    <button type="button" className="type-action-btn" onClick={() => resetTypeFilterGroup('beams')}>All</button>
                    <button type="button" className="type-action-btn" onClick={() => soloTypeFilter('beams', '|SUPPORT')} title="View only support beams">Solo Support</button>
                    <button type="button" className="type-action-btn" onClick={() => soloTypeFilter('beams', '|VIRTUAL')} title="View only external mount connections">Solo External</button>
                    <button type="button" className="type-action-btn" onClick={() => soloTypeFilter('beams', '|HYDRO')} title="View only hydro actuators">Solo Hydro</button>
                  </div>
                </div>
                <div className="type-legend-grid">
                  {[
                    { id: '|NORMAL', label: 'Normal', color: '#22c55e' },
                    { id: '|SUPPORT', label: 'Support', color: '#fbbf24' },
                    { id: '|HYDRO', label: 'Hydro', color: '#00e5ff' },
                    { id: '|BOUNDED', label: 'Bounded', color: '#d946ef' },
                    { id: '|ANISOTROPIC', label: 'Aniso', color: '#ff6b00' },
                    { id: '|PRESSURED', label: 'Pressure', color: '#818cf8' },
                    { id: '|VIRTUAL', label: 'External (-·-)', color: '#c084fc', hint: 'External dash-dot (-·-·-) beams colored by actual beam type' }
                  ].map(b => {
                    const isActive = typeFilters.beams?.[b.id] !== false;
                    const count = vehicleCounts.beamCounts?.[b.id] || 0;
                    return (
                      <div
                        key={b.id}
                        className={`type-interactive-chip ${isActive ? 'active' : 'inactive'}`}
                        onClick={() => toggleTypeFilter('beams', b.id)}
                        title={b.hint || `Toggle ${b.label} Beams (${count} in vehicle)`}
                      >
                        <span className="color-dot" style={{ backgroundColor: b.color, opacity: isActive ? 1 : 0.3 }} />
                        <span className="type-chip-label">{b.label}</span>
                        <span className="type-chip-count">{count}</span>
                        <button
                          type="button"
                          className="type-chip-solo-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            soloTypeFilter('beams', b.id);
                          }}
                          title={`Solo ${b.label} beams only`}
                        >
                          S
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* NODES Section */}
              <div className="type-legend-group">
                <div className="type-legend-title-row">
                  <span className="type-legend-title">NODES</span>
                  <div className="type-legend-actions">
                    <button type="button" className="type-action-btn" onClick={() => resetTypeFilterGroup('nodes')}>All</button>
                    <button type="button" className="type-action-btn" onClick={() => soloTypeFilter('nodes', 'mount')} title="View only engine/drivetrain mounts">Solo Mounts</button>
                    <button type="button" className="type-action-btn" onClick={() => soloTypeFilter('nodes', 'wheelHub')} title="View only wheel hubs">Solo Hubs</button>
                    <button type="button" className="type-action-btn" onClick={() => soloTypeFilter('nodes', 'external')} title="View only external anchor reference nodes">Solo External</button>
                  </div>
                </div>
                <div className="type-legend-grid">
                  {[
                    { id: 'collisionOnly', label: 'Collision', color: '#f8fafc' },
                    { id: 'selfCollision', label: 'Self-Coll', color: '#38bdf8' },
                    { id: 'nonCollidable', label: 'Non-Coll', color: '#64748b' },
                    { id: 'wheelHub', label: 'Wheel Hub', color: '#eab308' },
                    { id: 'mount', label: 'Mount', color: '#ef4444' },
                    { id: 'fixed', label: 'Fixed', color: '#ff0033' },
                    { id: 'external', label: 'External (◇)', color: '#c084fc', hint: 'External nodes (violet diamond cage ◇) colored by actual node type' }
                  ].map(n => {
                    const isActive = typeFilters.nodes?.[n.id] !== false;
                    const count = vehicleCounts.nodeCounts?.[n.id] || 0;
                    return (
                      <div
                        key={n.id}
                        className={`type-interactive-chip ${isActive ? 'active' : 'inactive'}`}
                        onClick={() => toggleTypeFilter('nodes', n.id)}
                        title={n.hint || `Toggle ${n.label} Nodes (${count} in vehicle)`}
                      >
                        <span className="color-dot" style={{ backgroundColor: n.color, opacity: isActive ? 1 : 0.3 }} />
                        <span className="type-chip-label">{n.label}</span>
                        <span className="type-chip-count">{count}</span>
                        <button
                          type="button"
                          className="type-chip-solo-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            soloTypeFilter('nodes', n.id);
                          }}
                          title={`Solo ${n.label} nodes only`}
                        >
                          S
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SURFACES Section */}
              <div className="type-legend-group">
                <div className="type-legend-title-row">
                  <span className="type-legend-title">SURFACES (Tris & Quads)</span>
                  <div className="type-legend-actions">
                    <button type="button" className="type-action-btn" onClick={() => resetTypeFilterGroup('surfaces')}>All</button>
                    <button type="button" className="type-action-btn" onClick={() => soloTypeFilter('surfaces', 'NONCOLLIDABLE')} title="View only aerodynamic surfaces">Solo Aero</button>
                    <button type="button" className="type-action-btn" onClick={() => soloTypeFilter('surfaces', 'NORMALTYPE')} title="View only collision hull surfaces">Solo Hull</button>
                  </div>
                </div>
                <div className="type-legend-grid">
                  {[
                    { id: 'NORMALTYPE', label: 'Collision Hull', color: '#1e3a8a' },
                    { id: 'NONCOLLIDABLE', label: 'Aero Only', color: '#065f46' },
                    { id: 'PRESSURE', label: 'Pressure', color: '#881337' }
                  ].map(s => {
                    const isActive = typeFilters.surfaces?.[s.id] !== false;
                    const count = vehicleCounts.surfaceCounts?.[s.id] || 0;
                    return (
                      <div
                        key={s.id}
                        className={`type-interactive-chip ${isActive ? 'active' : 'inactive'}`}
                        onClick={() => toggleTypeFilter('surfaces', s.id)}
                        title={`Toggle ${s.label} Surfaces (${count} in vehicle)`}
                      >
                        <span className="color-dot" style={{ backgroundColor: s.color, opacity: isActive ? 1 : 0.3 }} />
                        <span className="type-chip-label">{s.label}</span>
                        <span className="type-chip-count">{count}</span>
                        <button
                          type="button"
                          className="type-chip-solo-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            soloTypeFilter('surfaces', s.id);
                          }}
                          title={`Solo ${s.label} surfaces only`}
                        >
                          S
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Physical Property Heatmaps Content */}
          {hudActiveTab === 'heatmap' && (
            <div className="heatmap-hud-container">
              {/* Heatmap Type Sub-Selector Chips */}
              <div className="heatmap-selector-chips">
                {[
                  { id: 'mass', label: 'Mass', color: '#ff9800' },
                  { id: 'stiffness', label: 'Stiffness', color: '#22c55e' },
                  { id: 'deform', label: 'Deform', color: '#eab308' },
                  { id: 'strength', label: 'Strength', color: '#ef4444' }
                ].map(hm => (
                  <button
                    key={hm.id}
                    type="button"
                    className={`heatmap-chip-btn ${activeHeatmap === hm.id ? 'active' : ''}`}
                    onClick={() => setActiveHeatmap(hm.id)}
                  >
                    <span className="color-dot" style={{ backgroundColor: hm.color }} />
                    <span>{hm.label}</span>
                  </button>
                ))}
                {activeHeatmap && (
                  <button
                    type="button"
                    className="heatmap-chip-btn off-btn"
                    onClick={() => setActiveHeatmap(null)}
                    title="Turn off heatmap"
                  >
                    Off
                  </button>
                )}
              </div>

              {activeHeatmap ? (
                <>
                  <div className={`heatmap-hud-bar ${activeHeatmap}`} />
                  <div className="heatmap-hud-labels">
                    {activeHeatmap === 'mass' && (
                      <>
                        <span>{heatmapStats.mass.min}</span>
                        <span>{heatmapStats.mass.mid}</span>
                        <span>{heatmapStats.mass.max}</span>
                      </>
                    )}
                    {activeHeatmap === 'stiffness' && (
                      <>
                        <span>{heatmapStats.stiffness.min}</span>
                        <span>{heatmapStats.stiffness.mid}</span>
                        <span>{heatmapStats.stiffness.max}</span>
                      </>
                    )}
                    {activeHeatmap === 'deform' && (
                      <>
                        <span style={{ color: '#ff5252' }}>{heatmapStats.deform.min} (Crush)</span>
                        <span style={{ color: '#ffd600' }}>{heatmapStats.deform.mid}</span>
                        <span style={{ color: '#00e5ff' }}>{heatmapStats.deform.max} (Rigid)</span>
                      </>
                    )}
                    {activeHeatmap === 'strength' && (
                      <>
                        <span style={{ color: '#ff1744' }}>{heatmapStats.strength.min} (Weak/Clip)</span>
                        <span style={{ color: '#ffd600' }}>{heatmapStats.strength.mid}</span>
                        <span style={{ color: '#00e5ff' }}>{heatmapStats.strength.max} (High/Infinite)</span>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="heatmap-empty-prompt">
                  Select a physical property above to visualize weight or structural gradients on 3D elements.
                </div>
              )}
            </div>
          )}

          {hudActiveTab === 'crash' && (
            <div className="crash-zones-hud-container" style={{ maxHeight: 340, overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span className="text-muted" style={{ fontSize: 9 }}>
                  {crashZones.allBreakGroupNames.length} Break / {crashZones.allDeformGroupNames.length} Deform Groups
                </span>
                {activeCrashGroup && (
                  <button
                    type="button"
                    className="type-btn-all"
                    onClick={() => setActiveCrashGroup(null)}
                    title="Clear solo filter"
                    style={{ fontSize: 9, padding: '2px 6px', background: 'rgba(255,255,255,0.08)', borderRadius: 3 }}
                  >
                    Show All
                  </button>
                )}
              </div>

              {/* Sub-filter tabs: All, Break Only, Deform Only */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                {[
                  { id: 'all', label: 'All Zones' },
                  { id: 'breakGroup', label: `Break (${crashZones.allBreakGroupNames.length})` },
                  { id: 'deformGroup', label: `Deform (${crashZones.allDeformGroupNames.length})` }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`color-chip-btn ${crashGroupType === tab.id ? 'active' : ''}`}
                    style={{ fontSize: 9, padding: '2px 6px' }}
                    onClick={() => {
                      setCrashGroupType(tab.id);
                      if (activeCrashGroup) {
                        const inBreak = crashZones.allBreakGroupNames.includes(activeCrashGroup);
                        const inDeform = crashZones.allDeformGroupNames.includes(activeCrashGroup);
                        if (tab.id === 'breakGroup' && !inBreak) setActiveCrashGroup(null);
                        if (tab.id === 'deformGroup' && !inDeform) setActiveCrashGroup(null);
                      }
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Group list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(() => {
                  const items = [];
                  if (crashGroupType === 'all' || crashGroupType === 'breakGroup') {
                    for (const bgName of crashZones.allBreakGroupNames) {
                      const bgData = crashZones.breakGroups[bgName];
                      items.push({
                        name: bgName,
                        type: 'breakGroup',
                        color: getCrashGroupColor(bgName),
                        beamCount: bgData.beams.length,
                        flexbodies: []
                      });
                    }
                  }
                  if (crashGroupType === 'all' || crashGroupType === 'deformGroup') {
                    for (const dgName of crashZones.allDeformGroupNames) {
                      const dgData = crashZones.deformGroups[dgName];
                      items.push({
                        name: dgName,
                        type: 'deformGroup',
                        color: getCrashGroupColor(dgName),
                        beamCount: dgData.beams.length,
                        flexbodies: dgData.flexbodies || []
                      });
                    }
                  }

                  if (items.length === 0) {
                    return (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic', padding: 4 }}>
                        No {crashGroupType !== 'all' ? crashGroupType : 'crash'} groups defined in current part(s).
                      </div>
                    );
                  }

                  return items.map(item => {
                    const isSolo = activeCrashGroup === item.name;
                    return (
                      <div
                        key={`${item.type}_${item.name}`}
                        onClick={() => setActiveCrashGroup(isSolo ? null : item.name)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '4px 6px',
                          borderRadius: 4,
                          cursor: 'pointer',
                          background: isSolo ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.03)',
                          border: isSolo ? `1px solid ${item.color}` : '1px solid transparent'
                        }}
                        title={`Click to ${isSolo ? 'unsolo' : 'solo'} ${item.name}`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              backgroundColor: item.color,
                              flexShrink: 0
                            }}
                          />
                          <span style={{ fontSize: 10, fontWeight: 600, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.name}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          <span
                            style={{
                              fontSize: 8.5,
                              padding: '1px 4px',
                              borderRadius: 3,
                              backgroundColor: item.type === 'breakGroup' ? 'rgba(244,63,94,0.2)' : 'rgba(14,165,233,0.2)',
                              color: item.type === 'breakGroup' ? '#fda4af' : '#7dd3fc',
                              fontWeight: 600
                            }}
                          >
                            {item.type === 'breakGroup' ? 'BREAK' : 'DEFORM'}
                          </span>
                          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                            {item.beamCount}b
                          </span>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {hudActiveTab === 'parts' && (
            <div className="explorer-hud-container">
              {/* Search & Global Actions Bar */}
              <div className="explorer-search-bar">
                <input
                  type="text"
                  className="explorer-search-input"
                  placeholder="Filter parts or submeshes..."
                  value={explorerSearchQuery}
                  onChange={(e) => setExplorerSearchQuery(e.target.value)}
                />
                {explorerSearchQuery && (
                  <button
                    type="button"
                    className="explorer-search-clear"
                    onClick={() => setExplorerSearchQuery('')}
                    title="Clear filter"
                  >
                    <CloseIcon size={10} />
                  </button>
                )}
              </div>

              {/* Status and Action Buttons */}
              <div className="explorer-quick-actions-bar">
                <span className="explorer-summary-text">
                  {filteredFileGroups.length > 1 ? `${filteredFileGroups.length} Files • ` : ''}
                  {filteredFamilies.length} Families • {totalFilteredVariants} Configs • {totalFilteredFlexbodies} Meshes
                  {hasActiveIsolation && (
                    <span className="explorer-isolation-tag">Isolated</span>
                  )}
                </span>
                <div className="explorer-action-buttons">
                  <button
                    type="button"
                    className={`explorer-action-btn ${hasActiveIsolation ? 'unhide-all' : 'hide-all'}`}
                    onClick={toggleHideUnhideAll}
                    title={hasActiveIsolation ? "Unhide all parts and flexbodies" : "Hide all parts to isolate specific components"}
                  >
                    {hasActiveIsolation ? 'Unhide All' : 'Hide All'}
                  </button>
                  <button
                    type="button"
                    className="explorer-action-btn"
                    onClick={() => {
                      const allExp = expandedFamilyKeys.size >= (partsAndFlexbodiesData.families?.length || 0);
                      if (allExp) {
                        setExpandedFileGroupKeys(new Set());
                        setExpandedFamilyKeys(new Set());
                        setExpandedPartKeys(new Set());
                      } else {
                        setExpandedFileGroupKeys(new Set((partsAndFlexbodiesData.fileGroups || []).map(fg => fg.key)));
                        setExpandedFamilyKeys(new Set((partsAndFlexbodiesData.families || []).map(f => f.key)));
                        setExpandedPartKeys(new Set((partsAndFlexbodiesData.parts || []).map(p => p.key)));
                      }
                    }}
                    title={expandedFamilyKeys.size >= (partsAndFlexbodiesData.families?.length || 0) ? "Collapse all groups" : "Expand all groups"}
                  >
                    {expandedFamilyKeys.size >= (partsAndFlexbodiesData.families?.length || 0) ? 'Collapse' : 'Expand'}
                  </button>
                </div>
              </div>

              {/* 3/4-Level Explorer Tree: [File/Tab in Multi-Part] -> Family -> Variant Config -> Flexbody Submesh */}
              <div className="explorer-tree-scrollable">
                {filteredFamilies.length === 0 ? (
                  <div className="explorer-empty-filter">
                    No parts or submeshes matching "{explorerSearchQuery}"
                  </div>
                ) : (() => {
                  const hasMultiFileGroups = (partsAndFlexbodiesData?.fileGroups?.length || 0) > 1;
                  const renderFamilyGroup = (family) => {
                    const isFamilyExpanded = expandedFamilyKeys.has(family.key) || Boolean(explorerSearchQuery);
                    const isFamilySolo = soloFamilyKey === family.key;
                    const isFamilyHidden = family.variants.every(v => isolatedPartKeys.has(v.key));
                    const displayFamName = family.name || family.key;

                    return (
                      <div key={family.key} className={`explorer-family-group ${isFamilyHidden ? 'is-hidden' : ''} ${isFamilySolo ? 'is-solo' : ''}`}>
                        {/* Level 1: Component Family Row */}
                        <div
                          className="explorer-family-row"
                          onClick={() => toggleExpandFamily(family.key)}
                          title={`Family: ${displayFamName} (${family.variants.length} config${family.variants.length > 1 ? 's' : ''}, ${family.totalNodes} nodes, ${family.totalBeams} beams)`}
                        >
                          <span className={`explorer-caret ${isFamilyExpanded ? 'expanded' : ''}`}>
                            <ChevronDownIcon size={11} />
                          </span>
                          <span className="explorer-family-swatch" style={{ backgroundColor: family.color }} />
                          <span className="explorer-family-name">{displayFamName}</span>
                          <span className="explorer-family-configs-badge">
                            {family.variants.length} config{family.variants.length > 1 ? 's' : ''}
                          </span>
                          <div className="explorer-part-badges">
                            <span className="explorer-mini-badge nodes-badge">{family.totalNodes}n</span>
                            <span className="explorer-mini-badge beams-badge">{family.totalBeams}b</span>
                            {family.totalFlexbodies > 0 && (
                              <span className="explorer-mini-badge meshes-badge">{family.totalFlexbodies}m</span>
                            )}
                          </div>
                          <div className="explorer-row-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className={`explorer-icon-btn eye-btn ${isFamilyHidden ? 'hidden' : 'visible'}`}
                              onClick={() => toggleFamilyVisibility(family.key)}
                              title={isFamilyHidden ? `Show all in ${family.key}` : `Hide all in ${family.key}`}
                            >
                              <EyeIcon size={11} />
                            </button>
                            <button
                              type="button"
                              className={`explorer-icon-btn solo-btn ${isFamilySolo ? 'active' : ''}`}
                              onClick={() => toggleSoloFamily(family.key)}
                              title={isFamilySolo ? `Unsolo ${family.key}` : `Solo family ${family.key}`}
                            >
                              S
                            </button>
                          </div>
                        </div>

                        {/* Level 2: Part Config Variants */}
                        {isFamilyExpanded && (
                          <div className="explorer-family-children">
                            {family.variants.map((part) => {
                              const isPartExpanded = expandedPartKeys.has(part.key) || Boolean(explorerSearchQuery);
                              const isPartHidden = isFamilyHidden || isolatedPartKeys.has(part.key);
                              const isPartSolo = soloPartKey === part.key;
                              const flexbodies = part.flexbodies || [];

                              return (
                                <div key={part.key} className={`explorer-part-group ${isPartHidden ? 'is-hidden' : ''} ${isPartSolo ? 'is-solo' : ''}`}>
                                  {/* Level 2: Config Variant Row */}
                                  <div
                                    className="explorer-part-row"
                                    onClick={() => flexbodies.length > 0 && toggleExpandPart(part.key)}
                                    title={`${part.key} (${part.nodeCount} nodes, ${part.beamCount} beams, ${flexbodies.length} submeshes)`}
                                  >
                                    {flexbodies.length > 0 ? (
                                      <span className={`explorer-caret ${isPartExpanded ? 'expanded' : ''}`}>
                                        <ChevronDownIcon size={10} />
                                      </span>
                                    ) : (
                                      <span className="explorer-tree-bullet">•</span>
                                    )}
                                    <span className="explorer-part-swatch" style={{ backgroundColor: part.color }} />
                                    <span className="explorer-part-name">{part.key}</span>
                                    <div className="explorer-part-badges">
                                      <span className="explorer-mini-badge nodes-badge">{part.nodeCount}n</span>
                                      <span className="explorer-mini-badge beams-badge">{part.beamCount}b</span>
                                      {flexbodies.length > 0 && (
                                        <span className="explorer-mini-badge meshes-badge">{flexbodies.length}m</span>
                                      )}
                                    </div>
                                    <div className="explorer-row-actions" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        type="button"
                                        className={`explorer-icon-btn eye-btn ${isPartHidden ? 'hidden' : 'visible'}`}
                                        onClick={() => togglePartVisibility(part.key)}
                                        title={isPartHidden ? `Show ${part.key}` : `Hide ${part.key}`}
                                      >
                                        <EyeIcon size={10} />
                                      </button>
                                      <button
                                        type="button"
                                        className={`explorer-icon-btn solo-btn ${isPartSolo ? 'active' : ''}`}
                                        onClick={() => toggleSoloPart(part.key)}
                                        title={isPartSolo ? `Unsolo ${part.key}` : `Solo ${part.key}`}
                                      >
                                        S
                                      </button>
                                    </div>
                                  </div>

                                  {/* Level 3: Bound Flexbody Submeshes */}
                                  {isPartExpanded && flexbodies.length > 0 && (
                                    <div className="explorer-flexbody-children">
                                      {flexbodies.map((fb) => {
                                        const fbName = typeof fb === 'string' ? fb : fb.name;
                                        const fbColor = (typeof fb === 'object' && fb.color) || part.color;
                                        const isFbHidden = isPartHidden || hiddenFlexbodyNames.has(fbName);
                                        const isFbSolo = soloFlexbodyName === fbName;

                                        return (
                                          <div
                                            key={fbName}
                                            className={`explorer-flexbody-row ${isFbHidden ? 'is-hidden' : ''} ${isFbSolo ? 'is-solo' : ''}`}
                                            onMouseEnter={() => {
                                              if (visualMeshManagerRef.current) {
                                                visualMeshManagerRef.current.highlightSubmesh(fbName);
                                              }
                                            }}
                                            onMouseLeave={() => {
                                              if (visualMeshManagerRef.current) {
                                                visualMeshManagerRef.current.highlightSubmesh(null);
                                              }
                                            }}
                                            title={`Flexbody Mesh: ${fbName}${fb.triangles ? ` (${fb.triangles.toLocaleString()} triangles)` : ''}`}
                                          >
                                            <span className="explorer-tree-line" />
                                            <span className="explorer-flexbody-dot" style={{ backgroundColor: fbColor }} />
                                            <span className="explorer-flexbody-name">{fbName}</span>
                                            {fb.triangles > 0 && (
                                              <span className="explorer-mini-badge tris-badge">
                                                {fb.triangles > 999 ? `${(fb.triangles / 1000).toFixed(1)}k` : fb.triangles} △
                                              </span>
                                            )}
                                            <div className="explorer-row-actions">
                                              <button
                                                type="button"
                                                className={`explorer-icon-btn eye-btn ${isFbHidden ? 'hidden' : 'visible'}`}
                                                onClick={() => toggleFlexbodyVisibility(fbName)}
                                                title={isFbHidden ? `Show ${fbName}` : `Hide ${fbName}`}
                                              >
                                                <EyeIcon size={9} />
                                              </button>
                                              <button
                                                type="button"
                                                className={`explorer-icon-btn solo-btn ${isFbSolo ? 'active' : ''}`}
                                                onClick={() => toggleSoloFlexbody(fbName)}
                                                title={isFbSolo ? `Unsolo ${fbName}` : `Solo ${fbName}`}
                                              >
                                                S
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  };

                  if (!hasMultiFileGroups) {
                    return filteredFamilies.map(renderFamilyGroup);
                  }

                  return filteredFileGroups.map((fg) => {
                    const isFileExpanded = expandedFileGroupKeys.has(fg.key) || Boolean(explorerSearchQuery);
                    const isFileSolo = soloFileGroupKey === fg.key;
                    const isFileHidden = fg.partKeys.every(pk => isolatedPartKeys.has(pk));

                    return (
                      <div key={fg.key} className={`explorer-file-group ${isFileHidden ? 'is-hidden' : ''} ${isFileSolo ? 'is-solo' : ''}`}>
                        {/* Level 0: File / Tab Group Row (Multi-Part View) */}
                        <div
                          className="explorer-file-row"
                          onClick={() => toggleExpandFileGroup(fg.key)}
                          title={`File: ${fg.title} (${fg.families.length} families, ${fg.totalNodes} nodes, ${fg.totalBeams} beams)`}
                        >
                          <span className={`explorer-caret ${isFileExpanded ? 'expanded' : ''}`}>
                            <ChevronDownIcon size={11} />
                          </span>
                          <span className="explorer-file-icon" style={{ color: fg.color }}>
                            <FileIcon size={12} />
                          </span>
                          <span className="explorer-file-name">{fg.key}</span>
                          <span className="explorer-family-configs-badge">
                            {fg.families.length} {fg.families.length === 1 ? 'part' : 'parts'}
                          </span>
                          <div className="explorer-part-badges">
                            <span className="explorer-mini-badge nodes-badge">{fg.totalNodes}n</span>
                            <span className="explorer-mini-badge beams-badge">{fg.totalBeams}b</span>
                          </div>
                          <div className="explorer-row-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className={`explorer-icon-btn eye-btn ${isFileHidden ? 'hidden' : 'visible'}`}
                              onClick={() => toggleFileGroupVisibility(fg.key)}
                              title={isFileHidden ? `Show all parts in ${fg.key}` : `Hide all parts in ${fg.key}`}
                            >
                              <EyeIcon size={11} />
                            </button>
                            <button
                              type="button"
                              className={`explorer-icon-btn solo-btn ${isFileSolo ? 'active' : ''}`}
                              onClick={() => toggleSoloFileGroup(fg.key)}
                              title={isFileSolo ? `Unsolo ${fg.key}` : `Solo file ${fg.key}`}
                            >
                              S
                            </button>
                          </div>
                        </div>

                        {isFileExpanded && (
                          <div className="explorer-file-children">
                            {fg.families.map(renderFamilyGroup)}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </div>
        )
      )}


    </div>
  );
}

export default JBeamViewport;
