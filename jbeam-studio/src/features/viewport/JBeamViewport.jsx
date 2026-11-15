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
  buildMountingJointsGroup,
  buildCodeHoverGroup,
  buildEnvironmentGroup,
  buildFrontIndicatorGroup,
  extractNodeCoords,
  calculateNodeMassStats,
  calculateBeamStiffnessStats,
  calculateBeamDeformStats
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
  CloseIcon,
  FileIcon,
  AssemblyIcon,
  TagIcon,
  CompassIcon,
  WheelIcon,
  CenterOfGravityIcon,
  ExtrudeIcon,
  LayersIcon,
  ChevronDownIcon,
  BlueprintIcon,
  ObjModelIcon,
  PowertrainIcon,
  UndoIcon,
  RedoIcon,
  LinkIcon,
  JointIcon,
  PopoutIcon
} from '../../components/Icons.jsx';
import CustomSelect from '../../components/CustomSelect.jsx';
import { detectAllMirrorPlanes } from '../jbeam/symmetryUtils.js';
import { formatBatchNodeName } from '../jbeam/batchRenamer.js';
import VisualMeshManager from './ColladaMeshManager.js';
import { buildBlueprintMesh } from './blueprintManager.js';
import { buildGhostWheelsGroup, DEFAULT_WHEEL_CONFIG } from './wheelVisualizer.js';
import { calculateMassProperties, buildCogMarkerGroup } from './cogCalculator.js';
import BlenderOrientationGizmo from './BlenderOrientationGizmo.jsx';

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

const GRID_SNAP_STEPS = [0.05, 0.1, 0.25, 0.5, 0];

export function JBeamViewport({
  jbeamParts,
  selectedNodeId,
  selectedBeamKey,
  selectedBeamInfo,
  selectedSurfaceInfo = null,
  onSelectNode,
  onSelectBeam,
  onSelectSurface = null,
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
  nonActiveViewType = 'ghost',
  onChangeNonActiveViewType = null,
  multiSelectedNodes: propMultiSelectedNodes = null,
  onMultiSelectChange = null,
  visualMeshDaeText = null,
  visualMeshName = null,
  onLoadVisualMesh = null,
  onUnloadVisualMesh = null,
  discoveredDaeFiles = [],
  onSelectProjectDae = null,
  onOpenDaeDialog = null,
  highlightedSubmesh = null,
  onHighlightSubmesh = null,
  onUpdateSubmeshNames = null,
  onUpdateSubmeshDetails = null,
  isolateMatchingMesh = false,
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
  suggestedPrefix = '',
  onPrefixActiveNodes = null,
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

  const onDeleteSelectedRef = useRef(onDeleteSelected);
  useEffect(() => { onDeleteSelectedRef.current = onDeleteSelected; }, [onDeleteSelected]);

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
  const [meshWireframe, setMeshWireframe] = useState(false);
  const [meshOpacity, setMeshOpacity] = useState(0.45);
  const [meshStats, setMeshStats] = useState(null);
  const [internalIsolateMesh, setInternalIsolateMesh] = useState(false);

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

  // Ghost Wheels & Center of Gravity (CoG) Fitment State
  const [showGhostWheels, setShowGhostWheels] = useState(false);
  const [showCogMarker, setShowCogMarker] = useState(false);
  const [showOverlaysDropdown, setShowOverlaysDropdown] = useState(false);
  const overlaysMenuRef = useRef(null);

  // 3D View Mode Dropdown State
  const [showViewModeDropdown, setShowViewModeDropdown] = useState(false);
  const viewModeMenuRef = useRef(null);

  // DAE Visual Mesh Dropdown State
  const [showDaeDropdown, setShowDaeDropdown] = useState(false);
  const daeMenuRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (overlaysMenuRef.current && !overlaysMenuRef.current.contains(e.target)) {
        setShowOverlaysDropdown(false);
      }
      if (viewModeMenuRef.current && !viewModeMenuRef.current.contains(e.target)) {
        setShowViewModeDropdown(false);
      }
      if (daeMenuRef.current && !daeMenuRef.current.contains(e.target)) {
        setShowDaeDropdown(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowOverlaysDropdown(false);
        setShowViewModeDropdown(false);
        setShowDaeDropdown(false);
      }
    };
    if (showOverlaysDropdown || showViewModeDropdown || showDaeDropdown) {
      document.addEventListener('pointerdown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('pointerdown', handleOutsideClick);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [showOverlaysDropdown, showViewModeDropdown, showDaeDropdown]);

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

  // Extract all submesh candidate names from active JBeam part(s), flexbodies, and props
  const activeMatchingMeshNames = useMemo(() => {
    const names = new Set();
    if (!jbeamParts) return names;
    const partKeys = Object.keys(jbeamParts).filter(k => k !== '__meta');

    for (const pKey of partKeys) {
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
  }, [jbeamParts]);

  // Resolve which nodes belong to the currently highlighted flexbody submesh
  const highlightedFlexbodyNodeIds = useMemo(() => {
    if (!highlightedSubmesh || !jbeamParts) return new Set();
    const resolved = resolveFlexbodyAssociations(jbeamParts);
    const boundNodes = resolved.getBoundNodesForMesh(highlightedSubmesh);
    return new Set(boundNodes);
  }, [highlightedSubmesh, jbeamParts]);

  // Extract external nodes from composite parts when in single-part mode for cross-part virtual beams
  const externalNodes = useMemo(() => {
    const map = {};
    if (compositeVehicleParts && typeof compositeVehicleParts === 'object') {
      const partKeys = Object.keys(compositeVehicleParts).filter(k => k !== '__meta');
      for (const pKey of partKeys) {
        if (jbeamParts && jbeamParts[pKey]) continue; // exclude current part
        const part = compositeVehicleParts[pKey];
        if (part?.nodes) {
          for (const nKey of Object.keys(part.nodes).filter(k => k !== '__meta')) {
            map[nKey] = part.nodes[nKey];
          }
        }
      }
    }
    return map;
  }, [compositeVehicleParts, jbeamParts]);

  // Statistics for floating 3D Heatmap Legend HUD
  const heatmapStats = useMemo(() => {
    if (!jbeamParts) {
      return {
        mass: { min: '1.0 kg', mid: '5.0 kg', max: '20.0 kg' },
        stiffness: { min: '500k N/m', mid: '2.5M N/m', max: '20M N/m' },
        deform: { min: '10kN', mid: '35kN', max: '100kN' }
      };
    }
    const allNodes = {};
    const allBeams = {};
    for (const pKey of Object.keys(jbeamParts).filter(k => k !== '__meta')) {
      const p = jbeamParts[pKey];
      if (p?.nodes) Object.assign(allNodes, p.nodes);
      if (p?.beams) Object.assign(allBeams, p.beams);
    }
    const m = calculateNodeMassStats(allNodes);
    const s = calculateBeamStiffnessStats(allBeams);
    const d = calculateBeamDeformStats(allBeams);

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
  const [colorMode, setColorMode] = useState('type'); // 'type' (physics) or 'part' (assembly)
  const [showFrontIndicator, setShowFrontIndicator] = useState(true);

  const updateTransformGizmoAttachmentRef = useRef(null);

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
        const m = nodesGroupRef.current.children.find(c => c.userData?.id === nid && !c.userData?.isNonActive);
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
        const targetMesh = nodesGroupRef.current.children.find(c => c.userData?.id === activeNodeId && !c.userData?.isNonActive);
        if (targetMesh) {
          transformControlsRef.current.attach(targetMesh);
        } else {
          transformControlsRef.current.detach();
        }
      } else {
        transformControlsRef.current.detach();
      }
    }
  }, [selectedNodeId]);

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
    if (!onDeleteSelected) return;
    if (multiSelectedNodesRef.current.length > 1) {
      onDeleteSelected('nodes', multiSelectedNodesRef.current);
    } else if (selectedNodeId) {
      onDeleteSelected('node', selectedNodeId);
    } else if (selectedBeamKey) {
      onDeleteSelected('beam', selectedBeamInfo || selectedBeamKey);
    } else if (selectedSurfaceInfo) {
      onDeleteSelected('surface', selectedSurfaceInfo);
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
    scene.background = new THREE.Color(0x18181c);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.05, 500);
    camera.position.set(-2.5, 2.0, -3.5);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = false;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

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
            const m = nodesGroupRef.current?.children.find(c => c.userData?.id === nid && !c.userData?.isNonActive);
            if (m) {
              nodeStarts.set(nid, m.position.clone());
              if (symmetryEnabledRef.current) {
                const mirrorId = getSymmetricNodeId(nid);
                if (mirrorId && mirrorId !== nid) {
                  const mMesh = nodesGroupRef.current?.children.find(c => c.userData?.id === mirrorId && !c.userData?.isNonActive);
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
              const mesh = nodesGroupRef.current?.children.find(c => c.userData?.id === nid && !c.userData?.isNonActive);
              if (mesh) {
                const newPos = threeToBeamng(mesh.position.x, mesh.position.y, mesh.position.z);
                batch.push({ id: nid, pos: newPos });
                processedIds.add(nid);
              }
            }
            if (symmetryEnabledRef.current) {
              for (const mid of mirrorStarts.keys()) {
                if (processedIds.has(mid)) continue;
                const mesh = nodesGroupRef.current?.children.find(c => c.userData?.id === mid && !c.userData?.isNonActive);
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
          const mesh = nodesGroupRef.current?.children.find(c => c.userData?.id === nid && !c.userData?.isNonActive);
          if (mesh) {
            mesh.position.copy(sPos.clone().add(delta));
            mesh.updateMatrix();
            movedIds.add(nid);
          }
        }

        if (symmetryEnabledRef.current) {
          const mirrorDelta = new THREE.Vector3(-delta.x, delta.y, delta.z);
          for (const [mirrorId, sPos] of mirrorStarts.entries()) {
            const mesh = nodesGroupRef.current?.children.find(c => c.userData?.id === mirrorId && !c.userData?.isNonActive);
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

    // High-precision node snapping helper (direct raycast + 24px screen proximity fallback)
    const findHoveredOrNearNode = (clientX, clientY) => {
      if (!nodesGroupRef.current || !camera) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // 1. Direct mesh intersection
      const hits = raycaster.intersectObjects(nodesGroupRef.current.children, false);
      if (hits.length > 0 && hits[0].object.userData?.id) {
        return hits[0].object;
      }

      // 2. Proximity check with screen-space distance threshold (12px radius)
      let bestNode = null;
      let minDistanceSq = 12 * 12;

      for (const child of nodesGroupRef.current.children) {
        if (!child.userData?.id) continue;
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
    const findHoveredBeamSegment = (clientX, clientY, maxScreenDistance = 18) => {
      const beamsGroup = beamsGroupRef.current;
      if (!beamsGroup || !beamsGroup.userData?.beamSegments || !camera) return null;
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

          const isSignificantlyCloserOnScreen = distSq < minScreenDistSq - 9;
          const isCloserInDepth = (distSq <= minScreenDistSq + 9) && (camDist < closestCamDist);

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

          if (!pendingBeamStartRef.current) {
            const startData = {
              id: nid,
              partName: nPart,
              tabTitle: nTab,
              isNonActive,
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

            const isCrossPart = startData.partName !== nPart || startData.isNonActive !== isNonActive;
            const hasCollision = isCrossPart && (startData.id === nid);
            const presetProps = BEAM_PRESETS[beamPresetRef.current]?.properties || {};

            if (onAddBeamRef.current) {
              onAddBeamRef.current(startData.id, nid, presetProps, isCrossPart, {
                startData,
                endData: { id: nid, partName: nPart, tabTitle: nTab, isNonActive, pos: hitNode.position.clone(), mesh: hitNode },
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
              ? Array.from(new Set([...multiSelectedNodesRef.current, ...newlySelected]))
              : newlySelected;
            setMultiSelectedNodes(merged);
            multiSelectedNodesRef.current = merged;
            if (onSelectNodeRef.current) onSelectNodeRef.current(merged[0]);
            if (onSelectBeamRef.current) onSelectBeamRef.current(null, null, null);
            if (onSelectSurfaceRef.current) onSelectSurfaceRef.current(null);
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
      // 1. Direct Node Mesh Intersection (exact hit on node sphere)
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const directNodeHits = raycaster.intersectObjects(nodesGroupRef.current?.children || [], false);
      const directNode = (directNodeHits.length > 0 && directNodeHits[0].object.userData?.id) ? directNodeHits[0].object : null;

      if (directNode) {
        const nid = directNode.userData.id;
        if (e.shiftKey || e.ctrlKey) {
          setMultiSelectedNodes(prev => {
            const next = prev.includes(nid) ? prev.filter(x => x !== nid) : [...prev, nid];
            multiSelectedNodesRef.current = next;
            // Update transform attachment
            if (transformControlsRef.current && activeToolRef.current === 'select') {
              if (next.length > 1) {
                const center = new THREE.Vector3();
                let count = 0;
                for (const id of next) {
                  const m = nodesGroupRef.current?.children.find(c => c.userData?.id === id && !c.userData?.isNonActive);
                  if (m) { center.add(m.position); count++; }
                }
                if (count > 0) {
                  center.multiplyScalar(1 / count);
                  multiSelectPivotRef.current.position.copy(center);
                  transformControlsRef.current.attach(multiSelectPivotRef.current);
                }
              } else if (next.length === 1) {
                const singleM = nodesGroupRef.current?.children.find(c => c.userData?.id === next[0] && !c.userData?.isNonActive);
                if (singleM) transformControlsRef.current.attach(singleM);
              } else {
                transformControlsRef.current.detach();
              }
            }
            return next;
          });
        } else {
          setMultiSelectedNodes([nid]);
          multiSelectedNodesRef.current = [nid];
          if (transformControlsRef.current && activeToolRef.current === 'select') {
            transformControlsRef.current.attach(directNode);
          }
        }
        if (onSelectNodeRef.current) onSelectNodeRef.current(nid);
        if (onSelectBeamRef.current) onSelectBeamRef.current(null, null, null);
        if (onSelectSurfaceRef.current) onSelectSurfaceRef.current(null);
        return;
      }

      // 2. Screen-Space Beam Proximity (18px tolerance)
      const hitBeam = findHoveredBeamSegment(e.clientX, e.clientY, 18);

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

      // Precedence: If clicked on or directly along a beam (<= 10px), prioritize beam
      if (hitBeam && (!surfaceHitMeta || hitBeam.screenDist <= 10)) {
        if (transformControlsRef.current) transformControlsRef.current.detach();
        if (onSelectBeamRef.current) {
          onSelectBeamRef.current(hitBeam.partName, hitBeam.beamKey, hitBeam.beamData);
        }
        if (onSelectNodeRef.current) onSelectNodeRef.current(null);
        if (onSelectSurfaceRef.current) onSelectSurfaceRef.current(null);
        setMultiSelectedNodes([]);
        multiSelectedNodesRef.current = [];
        return;
      }

      // Prioritize Surface Face Click
      if (surfaceHitMeta) {
        if (transformControlsRef.current) transformControlsRef.current.detach();
        const pName = surfaceHitMeta.partName || Object.keys(jbeamParts || {})[0] || 'default_part';
        if (onSelectSurfaceRef.current) {
          onSelectSurfaceRef.current({ ...surfaceHitMeta, partName: pName });
        }
        if (onSelectNodeRef.current) onSelectNodeRef.current(null);
        if (onSelectBeamRef.current) onSelectBeamRef.current(null, null, null);
        setMultiSelectedNodes([]);
        multiSelectedNodesRef.current = [];
        return;
      }

      // Fallback Beam Click (between 10px and 18px)
      if (hitBeam) {
        if (transformControlsRef.current) transformControlsRef.current.detach();
        if (onSelectBeamRef.current) {
          onSelectBeamRef.current(hitBeam.partName, hitBeam.beamKey, hitBeam.beamData);
        }
        if (onSelectNodeRef.current) onSelectNodeRef.current(null);
        if (onSelectSurfaceRef.current) onSelectSurfaceRef.current(null);
        setMultiSelectedNodes([]);
        multiSelectedNodesRef.current = [];
        return;
      }

      // 4. Proximity Node Fallback (near node center within 12px)
      const nearbyNode = findHoveredOrNearNode(e.clientX, e.clientY);
      if (nearbyNode) {
        const nid = nearbyNode.userData.id;
        if (e.shiftKey || e.ctrlKey) {
          setMultiSelectedNodes(prev => {
            const next = prev.includes(nid) ? prev.filter(x => x !== nid) : [...prev, nid];
            multiSelectedNodesRef.current = next;
            updateTransformGizmoAttachmentRef.current?.(next, next[next.length - 1]);
            return next;
          });
        } else {
          setMultiSelectedNodes([nid]);
          multiSelectedNodesRef.current = [nid];
          if (transformControlsRef.current && (activeToolRef.current === 'select' || activeToolRef.current === 'boxSelect')) {
            transformControlsRef.current.attach(nearbyNode);
          }
        }
        if (onSelectNodeRef.current) onSelectNodeRef.current(nid);
        if (onSelectBeamRef.current) onSelectBeamRef.current(null, null, null);
        if (onSelectSurfaceRef.current) onSelectSurfaceRef.current(null);
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
            onHighlightSubmeshRef.current(submeshName);
            if (onSelectNodeRef.current) onSelectNodeRef.current(null);
            if (onSelectBeamRef.current) onSelectBeamRef.current(null, null, null);
            if (onSelectSurfaceRef.current) onSelectSurfaceRef.current(null);
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
      } else if (e.key === 'Delete' || e.key === 'Backspace' || e.key === 'x' || e.key === 'X') {
        handleDeleteClick();
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

    if (!jbeamParts || typeof jbeamParts !== 'object') return;

    const partKeys = Object.keys(jbeamParts).filter(k => k !== '__meta');
    let mergedNodes = {};
    let mergedBeams = {};
    let mergedTriangles = {};
    let mergedQuads = {};
    const nodePosMap = new Map();

    for (const partKey of partKeys) {
      const part = jbeamParts[partKey];
      if (!part || typeof part !== 'object') continue;

      if (part.nodes) {
        for (const nKey of Object.keys(part.nodes).filter(k => k !== '__meta')) {
          const n = { ...part.nodes[nKey] };
          n.__partName = partKey;
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
          b.__partName = partKey;
          b.__beamKey = bKey;
          if (part.__isNonActive) b.__isNonActive = true;
          mergedBeams[`${partKey}_${bKey}`] = b;
        }
      }
      if (part.hydros) {
        for (const hKey of Object.keys(part.hydros).filter(k => k !== '__meta')) {
          const h = { ...part.hydros[hKey] };
          h.__partName = partKey;
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
          tri.__partName = partKey;
          tri.__triKey = tKey;
          if (part.__isNonActive) tri.__isNonActive = true;
          mergedTriangles[`${partKey}_${tKey}`] = tri;
        }
      }
      if (part.quads) {
        for (const qKey of Object.keys(part.quads).filter(k => k !== '__meta')) {
          const quad = { ...part.quads[qKey] };
          if (!quad || typeof quad !== 'object') continue;
          quad.__partName = partKey;
          quad.__quadKey = qKey;
          if (part.__isNonActive) quad.__isNonActive = true;
          mergedQuads[`${partKey}_${qKey}`] = quad;
        }
      }
    }

    nodePosMapRef.current = nodePosMap;

    // Build Triangles and Quads (Aerodynamic & Collision Surfaces)
    const hasSurfaces = Object.keys(mergedTriangles).length > 0 || Object.keys(mergedQuads).length > 0;
    if (visibility.triangles && hasSurfaces) {
      const surfacesGroup = buildTrianglesGroup(mergedTriangles, mergedNodes, mergedQuads, {
        faceOrientation,
        showNormals,
        selectedSurface: selectedSurfaceInfo,
        nonActiveViewType
      });
      structureGroup.add(surfacesGroup);
      surfacesGroupRef.current = surfacesGroup;
    } else {
      surfacesGroupRef.current = null;
    }

    // Build Beams (including cross-part virtual connectors)
    if (visibility.beams && Object.keys(mergedBeams).length > 0) {
      const beamsGroup = buildBeamsGroup(mergedBeams, mergedNodes, selectedBeamKey, colorMode, externalNodes, nonActiveViewType, selectedBeamInfo);
      structureGroup.add(beamsGroup);
      beamsGroupRef.current = beamsGroup;
    } else {
      beamsGroupRef.current = null;
    }

    // Build Nodes: pass scoped dictionary so each part renders its own distinct nodes
    const visualNodesDict = {};
    for (const partKey of partKeys) {
      const part = jbeamParts[partKey];
      if (!part?.nodes) continue;
      for (const nKey of Object.keys(part.nodes).filter(k => k !== '__meta')) {
        const scopedKey = `${partKey}_${nKey}`;
        visualNodesDict[scopedKey] = mergedNodes[scopedKey];
      }
    }

    if (visibility.nodes && Object.keys(visualNodesDict).length > 0) {
      const nodesGroup = buildNodesGroup(visualNodesDict, selectedNodeId, colorMode, highlightedFlexbodyNodeIds, multiSelectedNodes, nonActiveViewType);
      structureGroup.add(nodesGroup);
      nodesGroupRef.current = nodesGroup;

      // Build Node Labels (if toggled on)
      if (visibility.labels) {
        const labelsGroup = buildNodeLabelsGroup(visualNodesDict, selectedNodeId, highlightedFlexbodyNodeIds);
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
            const m = nodesGroup.children.find(c => c.userData?.id === nid && !c.userData?.isNonActive);
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
          const targetMesh = nodesGroup.children.find(c => c.userData?.id === activeNodeId && !c.userData?.isNonActive);
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

      // Center of Gravity 3D Symbol (if toggled on)
      if (showCogMarker) {
        const cogGroup = buildCogMarkerGroup(calculatedMass, true);
        structureGroup.add(cogGroup);
      }

      // Parametric Ghost Wheels & Tires (if toggled on)
      if (showGhostWheels) {
        const wheelsGroup = buildGhostWheelsGroup(mergedNodes, {
          ...DEFAULT_WHEEL_CONFIG,
          visible: true
        });
        structureGroup.add(wheelsGroup);
      }
      // Multi-Part Linkage: Detect and highlight mounting joints between open components (Mounts mode only)
      if (viewportSource === 'openTabs' && nonActiveViewType === 'mountPoints') {
        const jointsGroup = buildMountingJointsGroup(mergedNodes, 0.08);
        if (jointsGroup && jointsGroup.children.length > 0) {
          structureGroup.add(jointsGroup);
          mountingJointsGroupRef.current = jointsGroup;
        } else {
          mountingJointsGroupRef.current = null;
        }
      }
    } else {
      nodesGroupRef.current = null;
      if (transformControlsRef.current) transformControlsRef.current.detach();
    }
  }, [jbeamParts, selectedNodeId, multiSelectedNodes, selectedBeamKey, selectedBeamInfo, selectedSurfaceInfo, visibility, colorMode, externalNodes, highlightedFlexbodyNodeIds, faceOrientation, showNormals, showGhostWheels, showCogMarker, nonActiveViewType, activeTool, viewportSource]);

  // Live 3D Focus Highlight for Monaco Code-Hover
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

    if (!codeHoveredElement || !jbeamParts) return;

    const mergedNodes = {};
    for (const pKey of Object.keys(jbeamParts).filter(k => k !== '__meta')) {
      const p = jbeamParts[pKey];
      if (p?.nodes) {
        for (const nKey of Object.keys(p.nodes).filter(k => k !== '__meta')) {
          mergedNodes[nKey] = p.nodes[nKey];
        }
      }
    }

    const hoverOverlay = buildCodeHoverGroup(codeHoveredElement, mergedNodes);
    while (hoverOverlay.children.length > 0) {
      group.add(hoverOverlay.children.pop());
    }
  }, [codeHoveredElement, jbeamParts]);

  // Option 3: Visual Mesh (.dae) Loading & Opacity synchronization
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

  useEffect(() => {
    if (visualMeshManagerRef.current) {
      visualMeshManagerRef.current.highlightSubmesh(highlightedSubmesh);
    }
  }, [highlightedSubmesh]);

  useEffect(() => {
    if (visualMeshManagerRef.current && visualMeshManagerRef.current.currentMesh) {
      if (effectiveIsolateMesh && activeMatchingMeshNames.size > 0) {
        visualMeshManagerRef.current.filterSubmeshes(activeMatchingMeshNames);
      } else {
        visualMeshManagerRef.current.filterSubmeshes(null);
      }
    }
  }, [effectiveIsolateMesh, activeMatchingMeshNames, visualMeshDaeText]);

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

    // 1. Include JBeam physics structure (nodes, beams, triangles)
    const structureGroup = structureGroupRef.current;
    if (structureGroup && structureGroup.children.length > 0) {
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
  }, []);

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
    <div className={`blender-viewport-container ${isPanMode ? 'pan-mode-active' : ''}`}>
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
                title="Switch 3D Viewport Mode: Single Part, Vehicle Assembly, Multi-Part Linkage, or Powertrain Studio"
              >
                {viewportSource === 'assembly' ? (
                  <AssemblyIcon size={13} />
                ) : viewportSource === 'openTabs' ? (
                  <LinkIcon size={13} />
                ) : viewportSource === 'powertrain' ? (
                  <PowertrainIcon size={13} />
                ) : (
                  <FileIcon size={13} />
                )}
                <span>View Mode</span>
                <span className="view-mode-active-pill">
                  {viewportSource === 'assembly'
                    ? 'Assembly'
                    : viewportSource === 'openTabs'
                    ? 'Multi-Part'
                    : viewportSource === 'powertrain'
                    ? 'Powertrain'
                    : 'Part'}
                </span>
                <ChevronDownIcon size={11} className={`dropdown-chevron ${showViewModeDropdown ? 'rotate-180' : ''}`} />
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
                      <span className="view-mode-option-check">✓</span>
                    )}
                  </div>

                  <div
                    className={`dropdown-menu-action-item view-mode-option ${viewportSource === 'assembly' ? 'active' : ''}`}
                    onClick={() => {
                      onChangeViewportSource('assembly');
                      setShowViewModeDropdown(false);
                    }}
                  >
                    <div className="view-mode-option-icon">
                      <AssemblyIcon size={14} />
                    </div>
                    <div className="view-mode-option-text">
                      <div className="view-mode-option-title">Vehicle Assembly</div>
                      <div className="view-mode-option-desc">Full vehicle assembly with all slots & components</div>
                    </div>
                    {viewportSource === 'assembly' && <span className="view-mode-option-check">✓</span>}
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
                    {viewportSource === 'openTabs' && <span className="view-mode-option-check">✓</span>}
                  </div>

                  <div
                    className={`dropdown-menu-action-item view-mode-option ${viewportSource === 'powertrain' ? 'active' : ''}`}
                    onClick={() => {
                      onChangeViewportSource('powertrain');
                      setShowViewModeDropdown(false);
                    }}
                  >
                    <div className="view-mode-option-icon">
                      <PowertrainIcon size={14} />
                    </div>
                    <div className="view-mode-option-text">
                      <div className="view-mode-option-title">Powertrain Studio</div>
                      <div className="view-mode-option-desc">Drivetrain DAG, torque curves & dyno analysis</div>
                    </div>
                    {viewportSource === 'powertrain' && <span className="view-mode-option-check">✓</span>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Multi-Part Linkage Sub-Actions */}
          {viewportSource === 'openTabs' && (
            <div className="header-pill-group non-active-style-selector">
              <button
                type="button"
                onClick={() => onChangeNonActiveViewType && onChangeNonActiveViewType('cadWire')}
                className={`header-pill-btn ${nonActiveViewType === 'cadWire' || nonActiveViewType === 'wireframe' ? 'active' : ''}`}
                title="CAD Wire: Color-code each open component with high-contrast CAD wireframe"
              >
                <span>CAD Wire</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeNonActiveViewType && onChangeNonActiveViewType('mountPoints')}
                className={`header-pill-btn ${nonActiveViewType === 'mountPoints' ? 'active' : ''}`}
                title="Mount Points: Highlight interface proximity nodes ready for mounting"
              >
                <JointIcon size={11} />
                <span>Mounts</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeNonActiveViewType && onChangeNonActiveViewType('crossBeams')}
                className={`header-pill-btn ${nonActiveViewType === 'crossBeams' ? 'active' : ''}`}
                title="Cross-Beams: Emphasize inter-component mounting and virtual connector beams"
              >
                <span>Cross-Beams</span>
              </button>
              {onAutoLinkMounts && (
                <button
                  type="button"
                  onClick={onAutoLinkMounts}
                  className="header-pill-btn auto-mount-btn"
                  title="Auto-Mount: Automatically connect closest detected proximity joint pairs with BeamNG mounting beams (optional: true)"
                >
                  <LinkIcon size={11} />
                  <span>Auto-Mount</span>
                </button>
              )}
              {nodeCollisionCount > 0 && onPrefixActiveNodes && (
                <button
                  type="button"
                  onClick={onPrefixActiveNodes}
                  className="header-pill-btn prefix-nodes-btn"
                  title={`Resolve ${nodeCollisionCount} node collisions between open parts by prefixing active part nodes with '${suggestedPrefix}'`}
                >
                  <span>Prefix ({suggestedPrefix}*)</span>
                </button>
              )}
            </div>
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

          {/* Combined Snap Mode & Value Pill Group (Seamless Theme Match) */}
          <div className="header-pill-group">
            <button
              type="button"
              onClick={handleToggleSnapMode}
              className="header-pill-btn"
              title={`Snap Mode: ${snapMode === 'grid' ? 'Grid Snap' : 'DAE Mesh Snap'}. Click to switch to ${snapMode === 'grid' ? 'DAE Snap' : 'Grid Snap'}.`}
            >
              <SnapIcon
                size={13}
                active={
                  (snapMode === 'grid' && internalGridSnap > 0) ||
                  (snapMode === 'dae' && snapToMeshVertex)
                }
              />
              <span>{snapMode === 'grid' ? 'Grid' : 'DAE'}</span>
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

          {/* Bilateral Symmetry (X-Mirror) & PCA Symmetry Detection */}
          <div className="header-pill-group">
            <button
              type="button"
              onClick={() => onToggleSymmetry && onToggleSymmetry()}
              className={`header-pill-btn ${symmetryEnabled ? 'active' : ''}`}
              title="Toggle Bilateral Left/Right Symmetry Mirroring (X-Axis)"
            >
              <SymmetryIcon size={14} active={Boolean(symmetryEnabled)} />
              <span>X-Mirror: {symmetryEnabled ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          {/* Quick Action Pills for Selection (Extrude E, Connect F, Subdivide W) */}
          {(selectedNodeId || multiSelectedNodes.length > 0) && (
            <div className="header-pill-group">
              <button
                onClick={() => handleExtrude([0, -0.3, 0])}
                className="header-pill-btn"
                title="Extrude Selected Node(s) with connecting beams and cross-bracing (E)"
              >
                <ExtrudeIcon size={12} />
                <span>Extrude (E)</span>
              </button>
              {multiSelectedNodes.length >= 2 && (
                <button
                  onClick={handleQuickConnect}
                  className="header-pill-btn"
                  title="Quick-Connect Selected Nodes into Beam, Triangle, or Quad (F)"
                >
                  <span>Connect {multiSelectedNodes.length} Nodes (F)</span>
                </button>
              )}
            </div>
          )}

          {selectedBeamKey && (
            <div className="header-pill-group">
              <button
                onClick={handleSubdivideSelectedBeam}
                className="header-pill-btn"
                title="Subdivide Selected Beam into Two Segments (W)"
              >
                <SubdivideIcon size={12} />
                <span>Subdivide (W)</span>
              </button>
            </div>
          )}

          {selectedBeamKey && selectedBeamInfo?.beam && (
            <div className="header-preset-group" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span className="header-label" style={{ fontSize: 11, opacity: 0.85 }}>Type:</span>
              <CustomSelect
                value={selectedBeamInfo.beam.beamType || '|NORMAL'}
                options={[
                  { value: '|NORMAL', label: 'Normal' },
                  { value: '|SUPPORT', label: 'Support' },
                  { value: '|HYDRO', label: 'Hydro' },
                  { value: '|BOUNDED', label: 'Bounded' },
                  { value: '|ANISOTROPIC', label: 'Anisotropic' },
                  { value: '|PRESSURED', label: 'Pressured' },
                  { value: '|LBEAM', label: 'L-Beam' }
                ]}
                onChange={(val) => {
                  if (onChangeBeamTypeRef.current && selectedBeamInfo) {
                    onChangeBeamTypeRef.current(
                      selectedBeamInfo.partName,
                      selectedBeamInfo.beam['id1:'],
                      selectedBeamInfo.beam['id2:'],
                      val
                    );
                  }
                }}
                compact={true}
                searchable={false}
                className="header-custom-select"
                title="Change Selected Beam Type"
              />
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

          {/* Delete Button when an element is selected (Sleek Theme Match) */}
          {(selectedNodeId || selectedBeamKey) && (
            <div className="header-pill-group">
              <button
                onClick={handleDeleteClick}
                className="header-pill-btn delete-pill-btn"
                title="Delete Selected Element (Del)"
              >
                <TrashIcon size={13} />
                <span>Delete {selectedNodeId ? `Node (${selectedNodeId})` : 'Beam'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Header Right: Primary Geometry Visibility & Viewport Overlays */}
        <div className="header-right">
          {/* Primary Geometry Visibility */}
          <div className="header-pill-group">
            <button
              onClick={() => setVisibility(v => ({ ...v, nodes: !v.nodes }))}
              className={`header-pill-btn ${visibility.nodes ? 'active' : ''}`}
              title="Toggle Nodes Visibility"
            >
              Nodes
            </button>
            <button
              onClick={() => setVisibility(v => ({ ...v, beams: !v.beams }))}
              className={`header-pill-btn ${visibility.beams ? 'active' : ''}`}
              title="Toggle Beams Visibility"
            >
              Beams
            </button>
            <button
              onClick={() => setVisibility(v => ({ ...v, triangles: !v.triangles }))}
              className={`header-pill-btn ${visibility.triangles ? 'active' : ''}`}
              title="Toggle Triangles Visibility"
            >
              Tris
            </button>
          </div>

          {/* Overlays Popover Menu */}
          <div className="viewport-dropdown-container" ref={overlaysMenuRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowOverlaysDropdown(prev => !prev);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className={`header-pill-btn overlays-dropdown-trigger ${showOverlaysDropdown ? 'active' : ''}`}
              title="Viewport Overlays & Display Diagnostics"
            >
              <LayersIcon size={12} />
              <span>Overlays</span>
              <ChevronDownIcon size={11} className={`dropdown-chevron ${showOverlaysDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showOverlaysDropdown && (
              <div
                className="viewport-dropdown-menu"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
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

                <div className="dropdown-menu-divider" />
                <div className="dropdown-section-title">Physics & Symmetry Diagnostics</div>

                <label className="dropdown-menu-item">
                  <input
                    type="checkbox"
                    checked={showGhostWheels}
                    onChange={() => setShowGhostWheels(w => !w)}
                  />
                  <span className="dropdown-item-label">Ghost Wheels & Tires</span>
                </label>

                <label className="dropdown-menu-item">
                  <input
                    type="checkbox"
                    checked={showCogMarker}
                    onChange={() => setShowCogMarker(c => !c)}
                  />
                  <span className="dropdown-item-label">Center of Gravity ({massStats.totalMassKg} kg)</span>
                </label>

                <div
                  className="dropdown-menu-action-item"
                  onClick={() => {
                    handleDetectPlanes();
                    setShowOverlaysDropdown(false);
                  }}
                  title="Detect model symmetry plane via Principal Component Analysis (PCA)"
                >
                  <SymmetryIcon size={12} />
                  <span>Analyze PCA Symmetry Planes</span>
                </div>

                <div className="dropdown-menu-divider" />
                <div className="dropdown-section-title">Color Mode</div>

                <div className="dropdown-color-mode-pills">
                  <button
                    type="button"
                    className={`color-pill ${colorMode === 'type' ? 'active' : ''}`}
                    onClick={() => setColorMode('type')}
                    title="Color elements by physics type"
                  >
                    Type
                  </button>
                  <button
                    type="button"
                    className={`color-pill ${colorMode === 'part' ? 'active' : ''}`}
                    onClick={() => setColorMode('part')}
                    title="Color elements by assembly part"
                  >
                    Part
                  </button>
                  <button
                    type="button"
                    className={`color-pill ${colorMode === 'mass' ? 'active' : ''}`}
                    onClick={() => setColorMode('mass')}
                    title="Color nodes by weight heatmap & scale radius by mass"
                  >
                    Mass
                  </button>
                  <button
                    type="button"
                    className={`color-pill ${colorMode === 'stiffness' ? 'active' : ''}`}
                    onClick={() => setColorMode('stiffness')}
                    title="Color beams by spring stiffness (beamSpring) heatmap"
                  >
                    Stiffness
                  </button>
                  <button
                    type="button"
                    className={`color-pill ${colorMode === 'deform' ? 'active' : ''}`}
                    onClick={() => setColorMode('deform')}
                    title="Color beams by crumple & deformation yield (beamDeform) heatmap"
                  >
                    Deform
                  </button>
                </div>

                <div className="dropdown-menu-divider" />
                <div className="dropdown-section-title">Reference & Tools</div>
                {onOpenBlueprintModal && (
                  <div
                    className="dropdown-menu-action-item"
                    onClick={() => {
                      onOpenBlueprintModal();
                      setShowOverlaysDropdown(false);
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
                      setShowOverlaysDropdown(false);
                    }}
                    title="Open Wavefront OBJ Converter"
                  >
                    <ObjModelIcon size={12} />
                    <span>Wavefront OBJ Converter</span>
                  </div>
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

            {discoveredDaeFiles && discoveredDaeFiles.length > 0 ? (
              <div className="viewport-dropdown-container dae-dropdown-container" ref={daeMenuRef}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDaeDropdown(prev => !prev);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className={`header-pill-btn dae-dropdown-trigger ${showDaeDropdown ? 'active' : ''} ${visualMeshDaeText ? 'has-mesh' : ''}`}
                  title="Visual Mesh Overlay: Select a 3D model (.dae) to overlay or composite"
                >
                  <MeshIcon size={12} />
                  <span className="dae-trigger-label">
                    {visualMeshName && (visualMeshName === '__all__' || visualMeshName.startsWith('All Project Models'))
                      ? `All Models (${discoveredDaeFiles.length})`
                      : (visualMeshName ? visualMeshName : 'No Visual Mesh')}
                  </span>
                  <ChevronDownIcon size={11} className={`dropdown-chevron ${showDaeDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showDaeDropdown && (
                  <div
                    className="viewport-dropdown-menu dae-mesh-menu"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="dropdown-section-title">Visual Mesh Overlay (.dae)</div>

                    {/* No Visual Mesh */}
                    <div
                      className={`dropdown-menu-action-item dae-menu-option ${!visualMeshName ? 'active' : ''}`}
                      onClick={() => {
                        if (onSelectProjectDae) onSelectProjectDae('');
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
                      {!visualMeshName && <span className="view-mode-option-check">✓</span>}
                    </div>

                    {/* All Project Models */}
                    {discoveredDaeFiles.length > 1 && (
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
                          <span className="view-mode-option-check">✓</span>
                        )}
                      </div>
                    )}

                    {discoveredDaeFiles.length > 0 && <div className="dropdown-menu-divider" />}
                    {discoveredDaeFiles.length > 0 && <div className="dropdown-section-title">Project DAE Files</div>}

                    {discoveredDaeFiles.map(d => {
                      const isSelected = visualMeshName === d.name;
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
                          {isSelected && <span className="view-mode-option-check">✓</span>}
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
                onClick={() => {
                  if (onOpenDaeDialog) onOpenDaeDialog();
                  else daeInputRef.current?.click();
                }}
                className={`header-pill-btn ${visualMeshDaeText ? 'active' : ''}`}
                title="Load Collada (.dae) 3D Model Visual Overlay"
              >
                <MeshIcon size={13} />
                <span>{visualMeshName ? visualMeshName : '+ .dae'}</span>
              </button>
            )}

            {visualMeshDaeText && (
              <>
                <button
                  onClick={handleToggleIsolate}
                  className={`header-pill-btn ${effectiveIsolateMesh ? 'active' : ''}`}
                  title={effectiveIsolateMesh
                    ? "Currently showing ONLY 3D submeshes matching active .jbeam file. Click to show full vehicle."
                    : "Currently showing entire 3D model. Click to isolate ONLY 3D submeshes matching active .jbeam file."
                  }
                >
                  <FocusIcon size={12} />
                  <span>{effectiveIsolateMesh ? 'Active Only' : 'All Meshes'}</span>
                </button>

                <button
                  onClick={() => setMeshVisible(v => !v)}
                  className={`header-pill-btn ${meshVisible ? 'active' : ''}`}
                  title="Toggle Visual Ghost Mesh Visibility"
                >
                  <GhostIcon size={12} />
                  <span>{meshVisible ? 'Ghost' : 'Hidden'}</span>
                </button>

                <button
                  onClick={() => setMeshWireframe(w => !w)}
                  className={`header-pill-btn ${meshWireframe ? 'active' : ''}`}
                  title="Toggle Solid Surface vs Wireframe Cage"
                >
                  <WireframeIcon size={12} />
                  <span>{meshWireframe ? 'Wire' : 'Solid'}</span>
                </button>

                <div
                  className="header-slider-container"
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerMove={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onMouseMove={(e) => e.stopPropagation()}
                  onMouseUp={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="range"
                    min="0.05"
                    max="1"
                    step="0.05"
                    value={meshOpacity}
                    onChange={(e) => setMeshOpacity(parseFloat(e.target.value))}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerMove={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onMouseMove={(e) => e.stopPropagation()}
                    onMouseUp={(e) => e.stopPropagation()}
                    className="header-opacity-slider"
                    title={`Adjust Ghost Opacity (${Math.round(meshOpacity * 100)}%)`}
                  />
                  <span className="header-slider-readout">{Math.round(meshOpacity * 100)}%</span>
                </div>

                {onUnloadVisualMesh && (
                  <button
                    onClick={onUnloadVisualMesh}
                    className="header-pill-btn icon-only"
                    title="Unload Visual Mesh Overlay"
                  >
                    <CloseIcon size={11} />
                  </button>
                )}
              </>
            )}
          </div>

          {/* Blueprint Reference Studio Button */}
          {onOpenBlueprintModal && (
            <div className="header-pill-group">
              <button
                type="button"
                onClick={onOpenBlueprintModal}
                className="header-pill-btn blueprint-btn"
                title="Blueprint Reference Studio: Align & calibrate orthographic top/front/side blueprints"
              >
                <BlueprintIcon size={12} />
                <span>Blueprints</span>
              </button>
            </div>
          )}

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
          onClick={() => {
            if (selectedNodeId || multiSelectedNodesRef.current.length > 0) {
              handleExtrude([0, -0.3, 0]);
            } else {
              handleSetTool('extrude');
            }
          }}
          className={`blender-tool-btn ${currentTool === 'extrude' ? 'active' : ''}`}
          title="Extrude Selected Node(s) with Connecting Beams & Cross-Bracing (E)"
        >
          <ExtrudeIcon size={17} />
          <span className="tool-tooltip">Extrude (E)</span>
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
          title={multiSelectedNodes.length > 1 ? `Delete ${multiSelectedNodes.length} Selected Nodes ${symmetryEnabled ? '(+Mirror)' : ''} (Del or X)` : (selectedSurfaceInfo ? `Delete Surface ${symmetryEnabled ? '(+Mirror)' : ''} (Del or X)` : `Delete Selected Element ${symmetryEnabled ? '(+Mirror)' : ''} (Del or X)`)}
        >
          <TrashIcon size={17} />
          <span className="tool-tooltip">Delete (Del / X)</span>
        </button>
      </div>

      {/* Dynamic Creation Prompt Banner (Modern Dark Theme Matching Rest of Studio) */}
      {currentTool !== 'select' && (
        <div className="blender-action-prompt">
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
                <input
                  type="number"
                  min="1"
                  value={batchRenameIndex}
                  onChange={(e) => onUpdateBatchRenameIndex && onUpdateBatchRenameIndex(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="prompt-inline-number"
                  title="Next sequential index number"
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
        </div>
      )}

      {/* 3D Heatmap Legend HUD */}
      {(colorMode === 'mass' || colorMode === 'stiffness' || colorMode === 'deform') && (
        <div className="heatmap-legend-hud">
          <div className="heatmap-hud-header">
            <span className="heatmap-hud-title">
              {colorMode === 'mass' && 'Node Mass Heatmap'}
              {colorMode === 'stiffness' && 'Beam Stiffness (beamSpring)'}
              {colorMode === 'deform' && 'Crash Yield & Deform (beamDeform)'}
            </span>
            <span className={`heatmap-hud-mode-tag ${colorMode}`}>
              {colorMode.toUpperCase()}
            </span>
          </div>

          <div className={`heatmap-hud-bar ${colorMode}`} />

          <div className="heatmap-hud-labels">
            {colorMode === 'mass' && (
              <>
                <span>{heatmapStats.mass.min}</span>
                <span>{heatmapStats.mass.mid}</span>
                <span>{heatmapStats.mass.max}</span>
              </>
            )}
            {colorMode === 'stiffness' && (
              <>
                <span>{heatmapStats.stiffness.min}</span>
                <span>{heatmapStats.stiffness.mid}</span>
                <span>{heatmapStats.stiffness.max}</span>
              </>
            )}
            {colorMode === 'deform' && (
              <>
                <span style={{ color: '#ff5252' }}>{heatmapStats.deform.min} (Crush)</span>
                <span style={{ color: '#ffd600' }}>{heatmapStats.deform.mid}</span>
                <span style={{ color: '#00e5ff' }}>{heatmapStats.deform.max} (Rigid)</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default JBeamViewport;
