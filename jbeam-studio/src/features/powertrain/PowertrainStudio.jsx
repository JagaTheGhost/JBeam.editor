/*
  JBeam Studio - Dedicated Powertrain Flow & Wiring Studio
  Visual interactive schematic canvas for BeamNG drivetrain architectures,
  connected SVG torque wiring, gear shift sawtooth drops, and live ratio tuning.
*/

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  parsePowertrainGraph,
  calculateEngineTorqueCurve,
  calculateGearShiftDrops,
  calculateSawtoothCurve,
  updateGearboxRatiosInText,
  getDeviceCategory,
  addPowertrainDeviceInText,
  connectPowertrainDeviceInText,
  removePowertrainDeviceInText,
  calculateForcedInductionTorque,
  calculateEngineThermalStatus,
  calculateDiffLockingCharacteristics,
  calculateElectricMotorCurve,
  generateModularPowertrainFiles
} from './powertrainParser.js';
import {
  EngineIcon,
  GearboxIcon,
  DifferentialIcon,
  SchematicIcon,
  TurboIcon,
  ThermalsIcon,
  EvIcon,
  CloseIcon,
  ReloadIcon,
  LayersIcon,
  WarningIcon,
  ErrorIcon,
  CheckIcon,
  EditIcon
} from '../../components/Icons.jsx';

/**
 * Safe JSON stringifier that strips circular references and AST internal metadata (__meta, parent)
 */
export function safeJsonStringify(obj, space = 2) {
  if (!obj || typeof obj !== 'object') return String(obj ?? '');
  try {
    const seen = new WeakSet();
    return JSON.stringify(
      obj,
      (key, value) => {
        if (key === '__meta' || key === 'parent' || key === '__astRef') return undefined;
        if (typeof value === 'function' || typeof value === 'symbol') return undefined;
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular Reference]';
          }
          seen.add(value);
        }
        return value;
      },
      space
    );
  } catch (err) {
    try {
      const clean = {};
      for (const [k, v] of Object.entries(obj)) {
        if (k === '__meta' || k === 'parent') continue;
        if (typeof v === 'object' && v !== null) {
          clean[k] = Array.isArray(v) ? `[Array(${v.length})]` : '[Object]';
        } else {
          clean[k] = v;
        }
      }
      return JSON.stringify(clean, null, space);
    } catch {
      return '/* Could not serialize properties */';
    }
  }
}

class PowertrainErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('PowertrainStudio error caught:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, background: 'var(--bng-charcoal, #1A1A1A)', border: '1px solid var(--bng-gunmetal, #3D3D3D)', color: '#f87171', borderRadius: 8, margin: 20 }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: 14 }}>Powertrain View Encountered an Error</h3>
          <p style={{ margin: '0 0 12px 0', fontSize: 12, color: 'var(--bng-silver, #B3B3B3)' }}>
            {this.state.error?.message || 'An error occurred while rendering the powertrain architecture.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '6px 14px',
              background: 'var(--bng-orange, #FF6600)',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            Retry View
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function PowertrainStudio({
  jbeamParts,
  compositeVehicleParts = null,
  onApplyEdit = null,
  activeDocumentText = '',
  activePartName = 'main',
  onReturnToViewport = null,
  workspacePath = null,
  onCreateFiles = null
}) {
  const [selectedDeviceName, setSelectedDeviceName] = useState(null);
  const [hoveredDeviceName, setHoveredDeviceName] = useState(null);
  const [tireRadius, setTireRadius] = useState(0.36); // standard ~28-29" tire (0.36m radius)
  const [activeTab, setActiveTab] = useState('schematic'); // 'schematic' | 'gearing' | 'forced_induction' | 'thermals' | 'differentials' | 'ev_hybrid'
  const [gearingSubView, setGearingSubView] = useState('sawtooth'); // 'sawtooth' | 'table' | 'tuner'
  const [customShiftRpm, setCustomShiftRpm] = useState(null);

  // Authoring: Add Device Modal State
  const [showAddDeviceModal, setShowAddDeviceModal] = useState(false);
  const [newDevType, setNewDevType] = useState('turbocharger');
  const [newDevName, setNewDevName] = useState('turbo_stage1');
  const [newDevInputName, setNewDevInputName] = useState('mainEngine');
  const [newDevInputIndex, setNewDevInputIndex] = useState(1);

  // Authoring: Modular File Wizard State
  const [showModularModal, setShowModularModal] = useState(false);
  const getInitialVehicleName = () => {
    if (workspacePath) {
      const clean = workspacePath.replace(/\\/g, '/').split('/').filter(Boolean).pop();
      if (clean) return clean.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    }
    return 'my_vehicle';
  };
  const [modVehicleName, setModVehicleName] = useState(getInitialVehicleName);

  useEffect(() => {
    if (workspacePath) {
      const clean = workspacePath.replace(/\\/g, '/').split('/').filter(Boolean).pop();
      if (clean && modVehicleName === 'my_vehicle') {
        setModVehicleName(clean.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
      }
    }
  }, [workspacePath]);
  const [modLayout, setModLayout] = useState('RWD');
  const [modEngineType, setModEngineType] = useState('I4_2.0L');
  const [modTransType, setModTransType] = useState('6M');
  const [modDiffType, setModDiffType] = useState('lsd');
  const [generatedModularFiles, setGeneratedModularFiles] = useState(null);

  // Module 2: Forced Induction (Turbo / Supercharger) State
  const [turboWastegatePsi, setTurboWastegatePsi] = useState(14.5);
  const [turboSpoolRpm, setTurboSpoolRpm] = useState(2200);
  const [turboMaxBoostRpm, setTurboMaxBoostRpm] = useState(3800);
  const [turboIntercoolerEff, setTurboIntercoolerEff] = useState(0.85);
  const [turboType, setTurboType] = useState('turbocharger'); // 'turbocharger' | 'supercharger'

  // Module 3: Thermals & Radiator Cooling State
  const [radiatorArea, setRadiatorArea] = useState(0.38);
  const [coolantVolume, setCoolantVolume] = useState(8.5);
  const [thermoTemp, setThermoTemp] = useState(88);
  const [fanTemp, setFanTemp] = useState(94);
  const [headGasketLimit, setHeadGasketLimit] = useState(130);
  const [hasOilCooler, setHasOilCooler] = useState(true);

  // Module 4: Differential Locking & Active Control State
  const [diffType, setDiffType] = useState('lsd');
  const [diffRatio, setDiffRatio] = useState(3.73);
  const [lsdPreload, setLsdPreload] = useState(60);
  const [lsdLockPower, setLsdLockPower] = useState(25);
  const [lsdLockCoast, setLsdLockCoast] = useState(15);
  const [lockTorque, setLockTorque] = useState(2500);

  // Module 5: Electric EV & Hybrid Powertrain State
  const [evMaxTorque, setEvMaxTorque] = useState(420);
  const [evMaxPowerKw, setEvMaxPowerKw] = useState(240);
  const [evMaxRpm, setEvMaxRpm] = useState(16000);
  const [evBatteryKwh, setEvBatteryKwh] = useState(78);
  const [evRegenTorque, setEvRegenTorque] = useState(150);

  // Wire layout measuring
  const canvasRef = useRef(null);
  const [wirePaths, setWirePaths] = useState([]);

  // Auto-resolve to composite vehicle assembly parts if active part has no powertrain devices
  const { effectiveParts, isUsingAssembly } = useMemo(() => {
    const activeHasDevices = Object.values(jbeamParts || {}).some(p => p && (p.powertrain || p.mainEngine));
    if (!activeHasDevices && compositeVehicleParts && Object.keys(compositeVehicleParts).length > 0) {
      const compHasDevices = Object.values(compositeVehicleParts).some(p => p && (p.powertrain || p.mainEngine));
      if (compHasDevices) {
        return { effectiveParts: compositeVehicleParts, isUsingAssembly: true };
      }
    }
    return { effectiveParts: jbeamParts, isUsingAssembly: false };
  }, [jbeamParts, compositeVehicleParts]);

  const graph = useMemo(() => {
    return parsePowertrainGraph(effectiveParts);
  }, [effectiveParts]);

  // Find primary transmission and differential
  const { primaryGearbox, primaryDiff } = useMemo(() => {
    let gb = null;
    let diff = null;
    for (const d of Object.values(graph.devices)) {
      if (d.category === 'gearbox' && !gb) gb = d;
      if (d.category === 'differential' && !diff) diff = d;
    }
    return { primaryGearbox: gb, primaryDiff: diff };
  }, [graph]);

  // Local editable ratios state for Ratio Tuner
  const [editedRatios, setEditedRatios] = useState([]);
  const [editedDiffRatio, setEditedDiffRatio] = useState(3.73);

  useEffect(() => {
    const raw = primaryGearbox?.properties?.gearRatios || [-3.4, 0, 3.8, 2.2, 1.5, 1.15, 0.9, 0.75];
    setEditedRatios(Array.isArray(raw) ? [...raw] : [-3.4, 0, 3.8, 2.2, 1.5, 1.15, 0.9, 0.75]);
    const dRatio = Number(primaryDiff?.properties?.gearRatio) || 3.73;
    setEditedDiffRatio(dRatio);
  }, [primaryGearbox, primaryDiff]);

  const shiftRpm = useMemo(() => {
    if (customShiftRpm !== null) return customShiftRpm;
    return graph.engineSpecs?.maxRpm || 6500;
  }, [customShiftRpm, graph.engineSpecs]);

  // Organize devices into pipeline stages for schematic canvas
  const stages = useMemo(() => {
    const stageMap = {
      engine: [],
      coupling: [],
      gearbox: [],
      transfercase: [],
      differential: [],
      shaft: [],
      accessory: []
    };

    for (const d of Object.values(graph.devices)) {
      const cat = d.category || 'shaft';
      if (stageMap[cat]) stageMap[cat].push(d);
      else stageMap.shaft.push(d);
    }

    return [
      { key: 'engine', label: '1. Power Generation', items: stageMap.engine },
      { key: 'coupling', label: '2. Clutches & Converters', items: stageMap.coupling },
      { key: 'gearbox', label: '3. Transmissions', items: stageMap.gearbox },
      { key: 'transfercase', label: '4. Transfer Cases & Splitters', items: stageMap.transfercase },
      { key: 'differential', label: '5. Differentials & Axles', items: stageMap.differential },
      { key: 'shaft', label: '6. Output Shafts & Hubs', items: stageMap.shaft }
    ].filter(s => s.items.length > 0);
  }, [graph]);

  // Simulation Model 1: Forced Induction (Turbo/Supercharger)
  const forcedInductionAnalysis = useMemo(() => {
    const naCurve = graph.engineSpecs?.torqueCurve || [
      { rpm: 1000, torque: 180 },
      { rpm: 2000, torque: 280 },
      { rpm: 3000, torque: 340 },
      { rpm: 4000, torque: 370 },
      { rpm: 5000, torque: 380 },
      { rpm: 6000, torque: 360 },
      { rpm: 7000, torque: 310 }
    ];
    return calculateForcedInductionTorque(naCurve, {
      wastegatePressure: turboWastegatePsi,
      spoolRpm: turboSpoolRpm,
      maxBoostRpm: turboMaxBoostRpm,
      intercoolerEfficiency: turboIntercoolerEff,
      turboType
    });
  }, [graph.engineSpecs, turboWastegatePsi, turboSpoolRpm, turboMaxBoostRpm, turboIntercoolerEff, turboType]);

  // Simulation Model 2: Thermals & Cooling
  const thermalAnalysis = useMemo(() => {
    return calculateEngineThermalStatus({
      radiatorArea,
      coolantVolume,
      thermostatOpenTemp: thermoTemp,
      fanTemp,
      headGasketFailureTemp: headGasketLimit,
      oilCooler: hasOilCooler
    });
  }, [radiatorArea, coolantVolume, thermoTemp, fanTemp, headGasketLimit, hasOilCooler]);

  // Simulation Model 3: Differential Locking & Split
  const diffLockAnalysis = useMemo(() => {
    return calculateDiffLockingCharacteristics({
      diffType,
      gearRatio: diffRatio,
      lsdPreload,
      lsdLockCoef: lsdLockPower / 100,
      lsdRevLockCoef: lsdLockCoast / 100,
      lockTorque
    });
  }, [diffType, diffRatio, lsdPreload, lsdLockPower, lsdLockCoast, lockTorque]);

  // Simulation Model 4: Electric EV Motor
  const evAnalysis = useMemo(() => {
    return calculateElectricMotorCurve({
      maxTorque: evMaxTorque,
      maxPowerKw: evMaxPowerKw,
      maxRpm: evMaxRpm,
      batteryCapacityKwh: evBatteryKwh,
      regenTorque: evRegenTorque
    });
  }, [evMaxTorque, evMaxPowerKw, evMaxRpm, evBatteryKwh, evRegenTorque]);

  // Authoring Actions
  const handleAddDevice = () => {
    if (!onApplyEdit || !activeDocumentText) return;
    const updated = addPowertrainDeviceInText(activeDocumentText, {
      type: newDevType,
      name: newDevName.trim() || `${newDevType}_custom`,
      inputName: newDevInputName || 'mainEngine',
      inputIndex: newDevInputIndex || 1
    });
    onApplyEdit(updated);
    setShowAddDeviceModal(false);
  };

  const handleConnectDevice = (devName, targetInput, targetPort = 1) => {
    if (!onApplyEdit || !activeDocumentText) return;
    const updated = connectPowertrainDeviceInText(activeDocumentText, devName, targetInput, targetPort);
    onApplyEdit(updated);
  };

  const handleRemoveDevice = (devName) => {
    if (!onApplyEdit || !activeDocumentText) return;
    const updated = removePowertrainDeviceInText(activeDocumentText, devName);
    onApplyEdit(updated);
  };

  const handleGenerateModularSetup = async () => {
    const files = generateModularPowertrainFiles({
      vehicleName: modVehicleName,
      layout: modLayout,
      engineType: modEngineType,
      transmissionType: modTransType,
      diffType: modDiffType,
      finalDriveRatio: diffRatio
    });
    setGeneratedModularFiles(files);

    if (onCreateFiles) {
      await onCreateFiles(files);
    } else if (window.jbeamAPI?.saveDirectFile && workspacePath) {
      for (const [fileName, content] of Object.entries(files)) {
        await window.jbeamAPI.saveDirectFile(`${workspacePath}\\${fileName}`, content);
      }
    }
  };

  // Measure card anchors to compute directional SVG Bezier wires
  const updateWireLayout = useCallback(() => {
    if (!canvasRef.current || graph.edges.length === 0) {
      setWirePaths([]);
      return;
    }
    const container = canvasRef.current;
    const containerRect = container.getBoundingClientRect();
    const scrollLeft = container.scrollLeft;
    const scrollTop = container.scrollTop;

    const paths = [];
    for (const edge of graph.edges) {
      const srcEl = container.querySelector(`[data-device-id="${edge.source}"]`);
      const tgtEl = container.querySelector(`[data-device-id="${edge.target}"]`);
      if (srcEl && tgtEl) {
        const srcRect = srcEl.getBoundingClientRect();
        const tgtRect = tgtEl.getBoundingClientRect();

        const x1 = srcRect.right - containerRect.left + scrollLeft;
        const y1 = srcRect.top - containerRect.top + srcRect.height / 2 + scrollTop;
        const x2 = tgtRect.left - containerRect.left + scrollLeft;
        const y2 = tgtRect.top - containerRect.top + tgtRect.height / 2 + scrollTop;

        const dx = Math.max((x2 - x1) * 0.5, 25);
        const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

        paths.push({
          source: edge.source,
          target: edge.target,
          inputIndex: edge.inputIndex,
          sourceType: edge.sourceType,
          targetType: edge.targetType,
          category: getDeviceCategory(edge.sourceType),
          d,
          midX: (x1 + x2) / 2,
          midY: (y1 + y2) / 2
        });
      }
    }
    setWirePaths(paths);
  }, [graph]);

  useEffect(() => {
    const timer = setTimeout(updateWireLayout, 50);
    window.addEventListener('resize', updateWireLayout);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateWireLayout);
    };
  }, [updateWireLayout, stages, activeTab]);

  // Compute Gearing Shift Drops and Speeds
  const shiftDropAnalysis = useMemo(() => {
    const ratiosToUse = editedRatios.length > 0 ? editedRatios : (primaryGearbox?.properties?.gearRatios || [-3.4, 0, 3.8, 2.2, 1.5, 1.15, 0.9, 0.75]);
    const diffToUse = Number(editedDiffRatio) || 3.73;
    return calculateGearShiftDrops(ratiosToUse, diffToUse, shiftRpm, tireRadius);
  }, [editedRatios, editedDiffRatio, shiftRpm, tireRadius, primaryGearbox]);

  // Compute Sawtooth Chart Points
  const sawtoothData = useMemo(() => {
    const ratiosToUse = editedRatios.length > 0 ? editedRatios : (primaryGearbox?.properties?.gearRatios || [-3.4, 0, 3.8, 2.2, 1.5, 1.15, 0.9, 0.75]);
    const diffToUse = Number(editedDiffRatio) || 3.73;
    const idleRpm = graph.engineSpecs?.idleRpm || 800;
    return calculateSawtoothCurve(ratiosToUse, diffToUse, shiftRpm, idleRpm, tireRadius);
  }, [editedRatios, editedDiffRatio, shiftRpm, tireRadius, primaryGearbox, graph.engineSpecs]);

  // Apply Ratio Changes directly to JBeam Code
  const handleApplyRatiosToJBeam = () => {
    if (!onApplyEdit || !activeDocumentText) return;
    const gbName = primaryGearbox?.name || 'gearbox';
    const diffName = primaryDiff?.name || 'differential_R';
    const updated = updateGearboxRatiosInText(
      activeDocumentText,
      gbName,
      editedRatios,
      editedDiffRatio,
      diffName
    );
    onApplyEdit(updated);
  };

  const handleResetRatios = () => {
    const raw = primaryGearbox?.properties?.gearRatios || [-3.4, 0, 3.8, 2.2, 1.5, 1.15, 0.9, 0.75];
    setEditedRatios(Array.isArray(raw) ? [...raw] : [-3.4, 0, 3.8, 2.2, 1.5, 1.15, 0.9, 0.75]);
    const dRatio = Number(primaryDiff?.properties?.gearRatio) || 3.73;
    setEditedDiffRatio(dRatio);
  };

  const handleRatioChange = (index, val) => {
    const num = parseFloat(val);
    setEditedRatios(prev => {
      const copy = [...prev];
      copy[index] = isNaN(num) ? 0 : num;
      return copy;
    });
  };

  const selectedDevice = selectedDeviceName ? graph.devices[selectedDeviceName] : null;

  // Starter Powertrain Template Insertion
  const handleInsertStarterPowertrain = () => {
    if (!onApplyEdit || !activeDocumentText) return;
    const starterSnippet = `
    "powertrain": [
      ["type", "name", "inputName", "inputIndex"],
      ["combustionEngine", "mainEngine", "dummy", 0],
      ["clutch", "clutch", "mainEngine", 1],
      ["manualGearbox", "gearbox", "clutch", 1],
      ["differential", "differential_R", "gearbox", 1],
      ["shaft", "wheelaxle_RL", "differential_R", 1, {"connectedWheel": "RL"}],
      ["shaft", "wheelaxle_RR", "differential_R", 2, {"connectedWheel": "RR"}]
    ],
    "mainEngine": {
      "torque": [
        ["rpm", "torque"],
        [0, 0],
        [1000, 180],
        [2000, 270],
        [3000, 340],
        [4000, 390],
        [5000, 410],
        [6000, 380],
        [7000, 320]
      ],
      "idleRPM": 750,
      "maxRPM": 7200,
      "inertia": 0.16
    },
    "gearbox": {
      "gearRatios": [-3.4, 0, 3.8, 2.2, 1.5, 1.15, 0.9, 0.75]
    },
    "differential_R": {
      "gearRatio": 3.73
    },`;

    const lastBrace = activeDocumentText.lastIndexOf('}');
    if (lastBrace === -1) return;
    const partClosingBrace = activeDocumentText.lastIndexOf('}', lastBrace - 1);
    const insertPos = partClosingBrace !== -1 ? partClosingBrace : lastBrace;
    const updated = activeDocumentText.slice(0, insertPos) + starterSnippet + '\n  ' + activeDocumentText.slice(insertPos);
    onApplyEdit(updated);
  };

  // Wire Color Mapping by Source Category (BeamNG-aligned palette)
  const getWireColor = (category) => {
    switch (category) {
      case 'engine': return '#FF8533'; // Warm Amber
      case 'coupling': return '#E040FB'; // Magenta
      case 'gearbox': return '#FF6600'; // BeamNG Orange
      case 'transfercase': return '#FFC107'; // Caution Amber/Yellow
      case 'differential': return '#4CAF50'; // Emerald Green
      default: return '#FF8533';
    }
  };

  const isHighlighted = (source, target) => {
    const activeTarget = hoveredDeviceName || selectedDeviceName;
    if (!activeTarget) return false;
    return source === activeTarget || target === activeTarget;
  };

  return (
    <PowertrainErrorBoundary>
      <div className="powertrain-studio-container">
      {/* Studio Top Header Bar */}
      <div className="powertrain-studio-header">
        <div className="studio-header-left">
          {onReturnToViewport && (
            <button
              type="button"
              className="return-viewport-btn"
              onClick={onReturnToViewport}
              title="Return to 3D Viewport"
            >
              <span>← 3D Viewport</span>
            </button>
          )}
          <div className="studio-header-divider" />
          <div className="studio-brand">
            <EngineIcon size={16} />
            <span className="studio-title">Powertrain Flow & Wiring Studio</span>
          </div>
          <span className="layout-badge">Layout: {graph.drivetrainLayout}</span>
          {isUsingAssembly && (
            <span className="source-badge">Assembly</span>
          )}
          <span className="device-count-badge">{graph.totalDevices} Devices</span>
          {graph.engineSpecs && (
            <span className="specs-badge">
              Peak: {graph.engineSpecs.peakPowerHp} HP @ {graph.engineSpecs.peakPowerRpm} RPM | {graph.engineSpecs.peakTorqueNm} Nm
            </span>
          )}
        </div>

        {/* View Tabs */}
        <div className="studio-tabs">
          <button
            type="button"
            className={`studio-tab-btn ${activeTab === 'schematic' ? 'active' : ''}`}
            onClick={() => setActiveTab('schematic')}
          >
            <SchematicIcon size={14} />
            <span>Schematic & Wiring</span>
            {graph.diagnostics?.length > 0 && (
              <span className="tab-alert-badge">{graph.diagnostics.length}</span>
            )}
          </button>
          <button
            type="button"
            className={`studio-tab-btn ${activeTab === 'gearing' ? 'active' : ''}`}
            onClick={() => setActiveTab('gearing')}
          >
            <GearboxIcon size={14} />
            <span>Gearing & Sawtooth</span>
          </button>
          <button
            type="button"
            className={`studio-tab-btn ${activeTab === 'forced_induction' ? 'active' : ''}`}
            onClick={() => setActiveTab('forced_induction')}
          >
            <TurboIcon size={14} />
            <span>Forced Induction & Turbo</span>
          </button>
          <button
            type="button"
            className={`studio-tab-btn ${activeTab === 'thermals' ? 'active' : ''}`}
            onClick={() => setActiveTab('thermals')}
          >
            <ThermalsIcon size={14} />
            <span>Thermals & Cooling</span>
          </button>
          <button
            type="button"
            className={`studio-tab-btn ${activeTab === 'differentials' ? 'active' : ''}`}
            onClick={() => setActiveTab('differentials')}
          >
            <DifferentialIcon size={14} />
            <span>Differential & Locking</span>
          </button>
          <button
            type="button"
            className={`studio-tab-btn ${activeTab === 'ev_hybrid' ? 'active' : ''}`}
            onClick={() => setActiveTab('ev_hybrid')}
          >
            <EvIcon size={14} />
            <span>Electric EV & Hybrid</span>
          </button>
        </div>
      </div>

      {/* Main Studio Body */}
      <div className="powertrain-studio-body">
        {/* TAB 1: Schematic Canvas with Directional Bezier Wires */}
        {activeTab === 'schematic' && (
          <div className="schematic-canvas-pane" ref={canvasRef} onScroll={updateWireLayout}>
            {/* Schematic Authoring Toolbar */}
            <div className="schematic-toolbar-row">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Interactive Canvas: Select inputs on device cards to rewire torque flow</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="blueprint-action-btn small"
                  style={{ width: 'auto', padding: '5px 12px', fontSize: 11 }}
                  onClick={() => setShowAddDeviceModal(true)}
                  title="Add a new device to the powertrain"
                >
                  <span>+ Add Device</span>
                </button>
                <button
                  type="button"
                  className="blueprint-action-btn small secondary"
                  style={{ width: 'auto', padding: '5px 12px', fontSize: 11 }}
                  onClick={() => setShowModularModal(true)}
                  title="Generate official modular BeamNG powertrain files"
                >
                  <span>Modular Setup Wizard</span>
                </button>
              </div>
            </div>

            {/* Powertrain Architectural Diagnostics Banner */}
            {graph.diagnostics && graph.diagnostics.length > 0 && (
              <div className="powertrain-diagnostics-banner">
                <div className="diag-banner-header">
                  <div className="diag-banner-title">
                    <WarningIcon size={14} />
                    <span>Drivetrain Diagnostics ({graph.diagnostics.length} issues detected)</span>
                  </div>
                  <span className="diag-banner-sub">Resolve broken connections before testing in BeamNG.drive</span>
                </div>
                <div className="diag-cards-row">
                  {graph.diagnostics.map((diag, idx) => (
                    <div
                      key={idx}
                      className={`diag-card ${diag.severity}`}
                      onClick={() => setSelectedDeviceName(diag.deviceId)}
                      title={`Click to inspect device: ${diag.deviceId}`}
                    >
                      <div className="diag-card-header">
                        <span className={`diag-severity-pill ${diag.severity}`}>{diag.severity}</span>
                        <span className="diag-target-dev">{diag.deviceId}</span>
                      </div>
                      <div className="diag-msg-text">{diag.message}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stages.length === 0 ? (
              <div className="powertrain-empty-state">
                <div className="powertrain-empty-card">
                  <div className="powertrain-empty-icon">
                    <EngineIcon size={32} />
                  </div>
                  <h3 className="powertrain-empty-title">No Powertrain Architecture in Active Part</h3>
                  <p className="powertrain-empty-desc">
                    The currently selected component does not contain a <code>"powertrain"</code> device table or engine <code>"torque"</code> curve.
                  </p>
                  <div className="powertrain-empty-actions">
                    {onApplyEdit && (
                      <button
                        type="button"
                        className="blueprint-action-btn"
                        style={{ width: 'auto', padding: '9px 20px' }}
                        onClick={handleInsertStarterPowertrain}
                      >
                        Insert Standard Powertrain (Engine + 6-Speed + Diff)
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="schematic-interactive-area" style={{ position: 'relative' }}>
                {/* SVG Wiring Layer connecting Output Ports to Input Ports */}
                <svg className="schematic-wires-svg" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
                  <defs>
                    <marker id="wire-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                      <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--bng-silver, #B3B3B3)" />
                    </marker>
                    <marker id="wire-arrow-active" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                      <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--bng-orange, #FF6600)" />
                    </marker>
                  </defs>

                  {wirePaths.map((w, idx) => {
                    const active = isHighlighted(w.source, w.target);
                    const color = getWireColor(w.category);
                    return (
                      <g key={idx} className={`wire-group ${active ? 'active' : ''}`}>
                        {/* Shadow / halo */}
                        <path
                          d={w.d}
                          fill="none"
                          stroke="#141414"
                          strokeWidth={active ? 6 : 4}
                          strokeLinecap="round"
                        />
                        {/* Colored wire path */}
                        <path
                          d={w.d}
                          fill="none"
                          stroke={active ? 'var(--bng-orange, #FF6600)' : color}
                          strokeWidth={active ? 3 : 2}
                          strokeDasharray={active ? '6,3' : 'none'}
                          strokeLinecap="round"
                          markerEnd={active ? 'url(#wire-arrow-active)' : 'url(#wire-arrow)'}
                          opacity={active ? 1 : 0.65}
                        />
                      </g>
                    );
                  })}
                </svg>

                {/* Device Stage Columns */}
                <div className="stages-row" style={{ position: 'relative', zIndex: 2 }}>
                  {stages.map(st => (
                    <div key={st.key} className="stage-column">
                      <div className="stage-header">
                        <span>{st.label}</span>
                        <span className="stage-count">({st.items.length})</span>
                      </div>

                      <div className="stage-cards-list">
                        {st.items.map(dev => {
                          const isSelected = selectedDeviceName === dev.name;
                          const isHovered = hoveredDeviceName === dev.name;
                          const devDiags = graph.diagnostics?.filter(d => d.deviceId === dev.name) || [];
                          const hasErrors = devDiags.some(d => d.severity === 'error');
                          const hasWarnings = devDiags.some(d => d.severity === 'warning');
                          const connectedWheel = dev.properties?.connectedWheel || dev.inlineOptions?.connectedWheel;

                          return (
                            <div
                              key={dev.name}
                              data-device-id={dev.name}
                              className={`powertrain-node-card ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''} ${hasErrors ? 'has-error' : ''} ${hasWarnings ? 'has-warning' : ''}`}
                              onClick={() => setSelectedDeviceName(dev.name)}
                              onMouseEnter={() => setHoveredDeviceName(dev.name)}
                              onMouseLeave={() => setHoveredDeviceName(null)}
                            >
                              <div className="card-top-row">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                  <span className="dev-type-badge">{dev.type}</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {devDiags.length > 0 && (
                                      <span className="card-alert-badge" title={devDiags[0].message}>
                                        {hasErrors ? 'ERROR' : 'WARN'}
                                      </span>
                                    )}
                                    {onApplyEdit && dev.name !== 'mainEngine' && (
                                      <button
                                        type="button"
                                        className="node-delete-btn"
                                        title={`Remove ${dev.name} from powertrain`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRemoveDevice(dev.name);
                                        }}
                                      >
                                        ×
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <span className="dev-name">{dev.name}</span>
                              </div>

                              {/* Ports and Wheel Information */}
                              <div className="card-ports-row" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                  <span className="port-in" style={{ fontSize: 10, color: 'var(--bng-silver, #B3B3B3)' }}>IN:</span>
                                  <select
                                    value={`${dev.inputName || 'dummy'}:${dev.inputIndex ?? 1}`}
                                    onChange={(e) => {
                                      const parts = e.target.value.split(':');
                                      handleConnectDevice(dev.name, parts[0], parseInt(parts[1], 10) || 1);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="card-wire-select"
                                    title="Rewire input device connection"
                                  >
                                    <option value="dummy:0">None (Root Source)</option>
                                    {Object.values(graph.devices)
                                      .filter(d => d.name !== dev.name)
                                      .map(d => (
                                        <React.Fragment key={d.name}>
                                          <option value={`${d.name}:1`}>{d.name} (P1)</option>
                                          {(d.category === 'differential' || d.category === 'transfercase') && (
                                            <option value={`${d.name}:2`}>{d.name} (P2)</option>
                                          )}
                                        </React.Fragment>
                                      ))}
                                  </select>
                                </div>
                                {dev.children?.length > 0 && (
                                  <span className="port-out" title={`${dev.children.length} downstream devices connected`}>
                                    OUT: <b>{dev.children.length}</b> ({dev.children.map(c => c.name).join(', ')})
                                  </span>
                                )}
                              </div>

                              {/* Terminal Wheel Attachment Badge */}
                              {dev.children?.length === 0 && (dev.category === 'shaft' || dev.type.includes('axle')) && (
                                <div className="card-wheel-row">
                                  {connectedWheel ? (
                                    <span className="wheel-bound-tag">Tire: {connectedWheel}</span>
                                  ) : (
                                    <span className="wheel-unbound-tag">No Wheel Bound</span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Gearing & Speeds, Sawtooth Drops & Live Ratio Tuner */}
        {activeTab === 'gearing' && (
          <div className="gearing-pane">
            {/* Sub-View Navigation Bar */}
            <div className="gearing-subnav-bar">
              <div className="subnav-left">
                <button
                  type="button"
                  className={`subnav-pill-btn ${gearingSubView === 'sawtooth' ? 'active' : ''}`}
                  onClick={() => setGearingSubView('sawtooth')}
                >
                  Sawtooth Shift Drops
                </button>
                <button
                  type="button"
                  className={`subnav-pill-btn ${gearingSubView === 'table' ? 'active' : ''}`}
                  onClick={() => setGearingSubView('table')}
                >
                  Gearing Table
                </button>
                <button
                  type="button"
                  className={`subnav-pill-btn ${gearingSubView === 'tuner' ? 'active' : ''}`}
                  onClick={() => setGearingSubView('tuner')}
                >
                  <EditIcon size={12} />
                  <span>Ratio Tuner</span>
                </button>
              </div>

              <div className="subnav-right">
                <div className="shift-point-ctrl">
                  <span>Shift RPM:</span>
                  <input
                    type="range"
                    min={4000}
                    max={Math.max(graph.engineSpecs?.maxRpm || 7000, 8500)}
                    step={100}
                    value={shiftRpm}
                    onChange={(e) => setCustomShiftRpm(Number(e.target.value))}
                    className="shift-slider"
                  />
                  <b>{shiftRpm} RPM</b>
                </div>

                <div className="tire-radius-ctrl">
                  <span>Tire Radius:</span>
                  <input
                    type="number"
                    step="0.01"
                    value={tireRadius}
                    onChange={(e) => setTireRadius(parseFloat(e.target.value) || 0.36)}
                    className="blueprint-num-input"
                    style={{ width: 65 }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--bng-silver, #B3B3B3)' }}>m</span>
                </div>
              </div>
            </div>

            {/* SUB-VIEW 1: Interactive Sawtooth Shift Drop Chart */}
            {gearingSubView === 'sawtooth' && (
              <div className="sawtooth-view-container">
                <div className="sawtooth-header-card">
                  <div className="sawtooth-title-group">
                    <span className="chart-main-title">Transmission Sawtooth Shift-Drop Diagram</span>
                    <span className="chart-sub-title">Speed (km/h) vs. Engine RPM across shift points</span>
                  </div>
                  {graph.engineSpecs && (
                    <div className="powerband-legend">
                      <span className="legend-swatch" style={{ background: 'rgba(76, 175, 80, 0.2)', borderColor: '#4CAF50' }} />
                      <span>Engine Sweet Spot ({graph.engineSpecs.peakTorqueRpm} - {graph.engineSpecs.peakPowerRpm} RPM)</span>
                    </div>
                  )}
                </div>

                {/* SVG Sawtooth Diagram */}
                <div className="sawtooth-svg-card">
                  <svg width="100%" height="300" viewBox="0 0 900 300" preserveAspectRatio="xMidYMid meet">
                    {/* Background Grid Lines (RPM) */}
                    {[1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000].map(rpm => {
                      if (rpm > shiftRpm * 1.05) return null;
                      const y = 255 - (rpm / (shiftRpm * 1.08)) * 230;
                      return (
                        <g key={rpm}>
                          <line x1="60" y1={y} x2="870" y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="3,3" />
                          <text x="52" y={y + 4} textAnchor="end" fill="#B3B3B3" fontSize="10">{rpm}</text>
                        </g>
                      );
                    })}
                    <text x="52" y="14" textAnchor="end" fill="#FFFFFF" fontSize="10" fontWeight="bold">RPM</text>

                    {/* Engine Powerband Sweet Spot Shading */}
                    {graph.engineSpecs && (() => {
                      const topY = shiftRpm * 1.08;
                      const yPeakTorque = 255 - (graph.engineSpecs.peakTorqueRpm / topY) * 230;
                      const yPeakPower = 255 - (graph.engineSpecs.peakPowerRpm / topY) * 230;
                      const rectHeight = Math.abs(yPeakTorque - yPeakPower);
                      const minY = Math.min(yPeakTorque, yPeakPower);
                      return (
                        <g>
                          <rect
                            x="60"
                            y={minY}
                            width="810"
                            height={rectHeight}
                            fill="rgba(76, 175, 80, 0.12)"
                            stroke="rgba(76, 175, 80, 0.35)"
                            strokeWidth="1"
                            strokeDasharray="4,2"
                          />
                          <text x="860" y={minY + 14} textAnchor="end" fill="#4CAF50" fontSize="10" fontWeight="600" opacity="0.9">
                            Powerband Peak ({graph.engineSpecs.peakTorqueRpm} - {graph.engineSpecs.peakPowerRpm} RPM)
                          </text>
                        </g>
                      );
                    })()}

                    {/* Sawtooth Gear Curves & Drop Lines */}
                    {(() => {
                      const maxSpeed = Math.max(sawtoothData.maxSpeedKmh, 160) * 1.05;
                      const topY = shiftRpm * 1.08;
                      const speedStep = maxSpeed > 280 ? 50 : (maxSpeed > 160 ? 40 : 20);
                      const speedTicks = [];
                      for (let s = 0; s <= maxSpeed; s += speedStep) {
                        speedTicks.push(s);
                      }

                      return (
                        <>
                          {/* X-Axis Baseline & Speed Ticks */}
                          <line x1="60" y1="255" x2="870" y2="255" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                          {speedTicks.map(speed => {
                            const x = 60 + (speed / maxSpeed) * 810;
                            if (x > 870) return null;
                            return (
                              <g key={`speed-${speed}`}>
                                <line x1={x} y1="255" x2={x} y2="260" stroke="#3D3D3D" strokeWidth="1" />
                                <text x={x} y="274" textAnchor="middle" fill="#B3B3B3" fontSize="10">{speed}</text>
                              </g>
                            );
                          })}
                          <text x="870" y="274" textAnchor="end" fill="#FFFFFF" fontSize="10" fontWeight="bold">km/h</text>

                          {/* Gear Trajectories */}
                          {sawtoothData.gearLines.map((line, idx) => {
                            const xStart = 60 + (line.entrySpeedKmh / maxSpeed) * 810;
                            const yStart = 255 - (line.entryRpm / topY) * 230;
                            const xEnd = 60 + (line.exitSpeedKmh / maxSpeed) * 810;
                            const yEnd = 255 - (line.exitRpm / topY) * 230;

                            const nextGear = sawtoothData.gearLines[idx + 1];
                            const yDrop = nextGear ? 255 - (nextGear.entryRpm / topY) * 230 : null;
                            const xMid = (xStart + xEnd) / 2;
                            const yMid = (yStart + yEnd) / 2;

                            return (
                              <g key={line.gearNum}>
                                {/* Diagonal Acceleration Line */}
                                <line
                                  x1={xStart}
                                  y1={yStart}
                                  x2={xEnd}
                                  y2={yEnd}
                                  stroke="#FF6600"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                />

                                {/* Red Shift Drop Line to next gear entry RPM */}
                                {nextGear && yDrop != null && (
                                  <g>
                                    <line
                                      x1={xEnd}
                                      y1={yEnd}
                                      x2={xEnd}
                                      y2={yDrop}
                                      stroke="#F44336"
                                      strokeWidth="1.5"
                                      strokeDasharray="3,3"
                                    />
                                    <circle cx={xEnd} cy={yDrop} r="3" fill="#F44336" />
                                    <text
                                      x={xEnd + 5}
                                      y={(yEnd + yDrop) / 2 + 3}
                                      fill="#FF8533"
                                      fontSize="9"
                                      fontWeight="600"
                                    >
                                      -{Math.round(line.exitRpm - nextGear.entryRpm)}
                                    </text>
                                  </g>
                                )}

                                {/* Gear End Peak Point */}
                                <circle cx={xEnd} cy={yEnd} r="4" fill="#FF8533" stroke="#FF6600" strokeWidth="1" />

                                {/* Gear Label with Pill Backdrop for High Contrast */}
                                <rect
                                  x={xMid - 27}
                                  y={yMid - 21}
                                  width="54"
                                  height="18"
                                  rx="4"
                                  fill="#1A1A1A"
                                  stroke="#3D3D3D"
                                  strokeWidth="1"
                                  opacity="0.95"
                                />
                                <text
                                  x={xMid}
                                  y={yMid - 8}
                                  textAnchor="middle"
                                  fill="#FFFFFF"
                                  fontSize="10"
                                  fontWeight="bold"
                                >
                                  G{line.gearNum} ({line.ratio})
                                </text>
                              </g>
                            );
                          })}
                        </>
                      );
                    })()}
                  </svg>
                </div>

                {/* Shift Drop Metrics Cards */}
                <div className="shift-drops-grid">
                  {shiftDropAnalysis.map(item => (
                    <div key={item.gearNum} className="shift-drop-metric-card">
                      <div className="metric-gear-title">Gear {item.gearNum} ({item.ratio})</div>
                      <div className="metric-speed-val">{item.topSpeedKmh} km/h <span className="mph-val">({item.topSpeedMph} mph)</span></div>
                      {item.nextGearRpm ? (
                        <div className="metric-drop-row">
                          <span className="drop-arrow">→ G{item.gearNum + 1}:</span>
                          <span className="drop-rpm-tag">{item.nextGearRpm} RPM</span>
                          <span className="drop-delta-tag">(-{item.rpmDrop} RPM / {item.rpmDropPercent}%)</span>
                        </div>
                      ) : (
                        <div className="metric-top-gear-tag">Top Cruising Gear</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SUB-VIEW 2: Complete Gearing Table */}
            {gearingSubView === 'table' && (
              <div className="gearing-table-view">
                <table className="gearing-table">
                  <thead>
                    <tr>
                      <th>Gear</th>
                      <th>Ratio</th>
                      <th>Total Reduction</th>
                      <th>Top Speed (km/h)</th>
                      <th>Top Speed (mph)</th>
                      <th>Upshift Landing RPM</th>
                      <th>RPM Drop</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shiftDropAnalysis.map(g => (
                      <tr key={g.gearNum}>
                        <td><b>Gear {g.gearNum}</b></td>
                        <td>{g.ratio}</td>
                        <td>{g.totalRatio}:1</td>
                        <td style={{ color: 'var(--bng-orange, #FF6600)', fontWeight: 'bold' }}>{g.topSpeedKmh} km/h</td>
                        <td style={{ color: 'var(--bng-silver, #B3B3B3)' }}>{g.topSpeedMph} mph</td>
                        <td>{g.nextGearRpm ? `${g.nextGearRpm} RPM` : 'Top Gear'}</td>
                        <td style={{ color: g.rpmDrop ? 'var(--bng-red, #F44336)' : 'var(--bng-silver, #B3B3B3)' }}>
                          {g.rpmDrop ? `-${g.rpmDrop} RPM (${g.rpmDropPercent}%)` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* SUB-VIEW 3: Live Ratio Tuner with JBeam Code Sync */}
            {gearingSubView === 'tuner' && (
              <div className="ratio-tuner-container">
                <div className="tuner-action-card">
                  <div className="tuner-title-block">
                    <h3>Transmission & Differential Ratio Tuner</h3>
                    <p>Adjust gear ratios or final drive to instantly recalculate speed and shift drops, then save to JBeam.</p>
                  </div>
                  <div className="tuner-action-buttons">
                    <button type="button" onClick={handleResetRatios} className="tuner-btn secondary">
                      <ReloadIcon size={12} />
                      <span>Reset</span>
                    </button>
                    {onApplyEdit && (
                      <button type="button" onClick={handleApplyRatiosToJBeam} className="tuner-btn primary">
                        <CheckIcon size={12} />
                        <span>Apply Changes to JBeam Code</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="tuner-inputs-grid">
                  <div className="tuner-group-card">
                    <h4>Forward & Reverse Ratios ({primaryGearbox?.name || 'gearbox'})</h4>
                    <div className="ratios-inputs-list">
                      {editedRatios.map((r, idx) => {
                        const isRev = r < 0;
                        const isNeut = r === 0;
                        const label = isRev ? 'Reverse (R)' : (isNeut ? 'Neutral (N)' : `Gear`);
                        return (
                          <div key={idx} className="ratio-input-row">
                            <span className="ratio-label">{label} [index {idx}]:</span>
                            <input
                              type="number"
                              step="0.05"
                              value={r}
                              onChange={(e) => handleRatioChange(idx, e.target.value)}
                              className="ratio-input"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="tuner-group-card">
                    <h4>Differential Final Drive ({primaryDiff?.name || 'differential_R'})</h4>
                    <div className="ratio-input-row">
                      <span className="ratio-label">Final Drive Ratio:</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editedDiffRatio}
                        onChange={(e) => setEditedDiffRatio(parseFloat(e.target.value) || 3.73)}
                        className="ratio-input"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Forced Induction & Turbo/Supercharger Studio */}
        {activeTab === 'forced_induction' && (
          <div className="authoring-pane">
            <div className="authoring-header-card">
              <div className="authoring-title-group">
                <h3>Forced Induction Studio (Turbocharger & Supercharger)</h3>
                <p>Simulate wastegate boost pressure, spool-up curves, and augmented net torque/HP output.</p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <span className="layout-badge">
                  Max Boost: {forcedInductionAnalysis.maxBoostPsi} PSI ({forcedInductionAnalysis.maxBoostBar} bar)
                </span>
              </div>
            </div>

            {/* Dyno SVG with NA vs Boosted Curves */}
            <div className="sawtooth-svg-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <b style={{ color: '#f8fafc', fontSize: 13 }}>Engine Output Comparison: NA vs. Forced Induction</b>
                <div style={{ display: 'flex', gap: 14, fontSize: 11 }}>
                  <span style={{ color: '#FF8533', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 14, height: 2, background: '#FF8533', display: 'inline-block' }} />Boosted Torque (Nm)
                  </span>
                  <span style={{ color: '#FF8533', opacity: 0.6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 14, height: 2, background: '#FF8533', borderTop: '2px dashed #FF8533', display: 'inline-block' }} />NA Torque
                  </span>
                  <span style={{ color: '#F44336', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 14, height: 2, background: '#F44336', display: 'inline-block' }} />Boosted Power (HP)
                  </span>
                  <span style={{ color: '#FFC107', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 14, height: 2, background: '#FFC107', display: 'inline-block' }} />Boost (PSI)
                  </span>
                </div>
              </div>

              <div style={{ height: 260 }}>
                <svg width="100%" height="260" viewBox="0 0 800 260" preserveAspectRatio="xMidYMid meet">
                  {(() => {
                    const curve = forcedInductionAnalysis.curve;
                    const maxRpm = Math.max(...curve.map(p => p.rpm), 7000);
                    const maxTorque = Math.max(...curve.map(p => p.boostedTorque), 200);
                    const maxHp = Math.max(...curve.map(p => p.boostedHp), 200);
                    const topY = Math.max(maxTorque, maxHp) * 1.15;

                    const grid = [2000, 4000, 6000, 8000].map(rpm => {
                      if (rpm > maxRpm) return null;
                      const x = 50 + (rpm / maxRpm) * 720;
                      return (
                        <g key={rpm}>
                          <line x1={x} y1="20" x2={x} y2="230" stroke="rgba(255,255,255,0.06)" strokeDasharray="3,3" />
                          <text x={x} y="246" textAnchor="middle" fill="#B3B3B3" fontSize="10">{rpm}</text>
                        </g>
                      );
                    });

                    const naPoints = curve.map(p => `${50 + (p.rpm / maxRpm) * 720},${230 - (p.naTorque / topY) * 200}`).join(' ');
                    const boostedPoints = curve.map(p => `${50 + (p.rpm / maxRpm) * 720},${230 - (p.boostedTorque / topY) * 200}`).join(' ');
                    const hpPoints = curve.map(p => `${50 + (p.rpm / maxRpm) * 720},${230 - (p.boostedHp / topY) * 200}`).join(' ');
                    const boostLinePoints = curve.map(p => `${50 + (p.rpm / maxRpm) * 720},${230 - (p.boostPsi / (forcedInductionAnalysis.maxBoostPsi * 1.25)) * 100}`).join(' ');

                    return (
                      <>
                        {grid}
                        <line x1="50" y1="230" x2="770" y2="230" stroke="#3D3D3D" strokeWidth="1" />
                        <polyline fill="none" stroke="#FF8533" strokeWidth="1.5" strokeDasharray="4,4" opacity="0.6" points={naPoints} />
                        <polyline fill="none" stroke="#FF8533" strokeWidth="3" points={boostedPoints} />
                        <polyline fill="none" stroke="#F44336" strokeWidth="2.5" points={hpPoints} />
                        <polyline fill="none" stroke="#FFC107" strokeWidth="2" strokeDasharray="2,2" points={boostLinePoints} />
                      </>
                    );
                  })()}
                </svg>
              </div>
            </div>

            {/* Performance Stats Cards */}
            <div className="authoring-stats-row">
              <div className="authoring-stat-card">
                <span className="authoring-stat-label">Net Peak Torque</span>
                <span className="authoring-stat-val" style={{ color: '#FF8533' }}>{forcedInductionAnalysis.peakBoostedTorque} Nm</span>
                <span className="authoring-stat-sub">+{forcedInductionAnalysis.deltaTorque} Nm over stock</span>
              </div>
              <div className="authoring-stat-card">
                <span className="authoring-stat-label">Net Peak Power</span>
                <span className="authoring-stat-val" style={{ color: '#F44336' }}>{forcedInductionAnalysis.peakBoostedHp} HP</span>
                <span className="authoring-stat-sub">+{forcedInductionAnalysis.deltaHp} HP gain</span>
              </div>
              <div className="authoring-stat-card">
                <span className="authoring-stat-label">Peak Boost Pressure</span>
                <span className="authoring-stat-val" style={{ color: '#FFC107' }}>{forcedInductionAnalysis.maxBoostPsi} PSI</span>
                <span className="authoring-stat-sub">{forcedInductionAnalysis.maxBoostBar} Bar gauge</span>
              </div>
              <div className="authoring-stat-card">
                <span className="authoring-stat-label">Boost Threshold</span>
                <span className="authoring-stat-val" style={{ color: '#FF6600' }}>{turboSpoolRpm} RPM</span>
                <span className="authoring-stat-sub">Full boost at {turboMaxBoostRpm} RPM</span>
              </div>
            </div>

            {/* Tuning Controls Grid */}
            <div className="authoring-grid">
              <div className="authoring-card">
                <h4>Induction Type & Wastegate</h4>
                <div className="authoring-ctrl-row">
                  <span>Type:</span>
                  <select value={turboType} onChange={e => setTurboType(e.target.value)} className="authoring-select">
                    <option value="turbocharger">Exhaust Turbocharger</option>
                    <option value="supercharger">Belt-Driven Supercharger</option>
                  </select>
                </div>
                <div className="authoring-ctrl-row">
                  <span>Wastegate Target (PSI):</span>
                  <input
                    type="number"
                    step="0.5"
                    value={turboWastegatePsi}
                    onChange={e => setTurboWastegatePsi(parseFloat(e.target.value) || 12)}
                    className="authoring-input"
                  />
                </div>
                <div className="authoring-ctrl-row">
                  <span>Intercooler Efficiency (%):</span>
                  <input
                    type="number"
                    step="5"
                    min="50"
                    max="100"
                    value={Math.round(turboIntercoolerEff * 100)}
                    onChange={e => setTurboIntercoolerEff((parseFloat(e.target.value) || 85) / 100)}
                    className="authoring-input"
                  />
                </div>
              </div>

              <div className="authoring-card">
                <h4>Turbine Spool Profile</h4>
                <div className="authoring-ctrl-row">
                  <span>Initial Spool RPM:</span>
                  <input
                    type="number"
                    step="100"
                    value={turboSpoolRpm}
                    onChange={e => setTurboSpoolRpm(parseInt(e.target.value, 10) || 2000)}
                    className="authoring-input"
                  />
                </div>
                <div className="authoring-ctrl-row">
                  <span>Full Boost RPM:</span>
                  <input
                    type="number"
                    step="100"
                    value={turboMaxBoostRpm}
                    onChange={e => setTurboMaxBoostRpm(parseInt(e.target.value, 10) || 3800)}
                    className="authoring-input"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: Thermals & Engine Cooling Simulator */}
        {activeTab === 'thermals' && (
          <div className="authoring-pane">
            <div className="authoring-header-card">
              <div className="authoring-title-group">
                <h3>Engine Thermals & Cooling Simulator</h3>
                <p>Simulate radiator cooling capacity, steady-state water temperature, and boilover margins under sustained high-RPM load.</p>
              </div>
              <span className={`layout-badge status-${thermalAnalysis.status}`} style={{
                backgroundColor: thermalAnalysis.status === 'optimal' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)',
                color: thermalAnalysis.status === 'optimal' ? '#4CAF50' : '#F44336'
              }}>
                Thermal Status: {thermalAnalysis.status.toUpperCase()}
              </span>
            </div>

            {/* Thermal Metrics Cards */}
            <div className="authoring-stats-row">
              <div className="authoring-stat-card">
                <span className="authoring-stat-label">Cooling Dissipation</span>
                <span className="authoring-stat-val" style={{ color: '#FF8533' }}>{thermalAnalysis.coolingCapacityKw} kW</span>
                <span className="authoring-stat-sub">Continuous heat rejection</span>
              </div>
              <div className="authoring-stat-card">
                <span className="authoring-stat-label">Operating Temperature</span>
                <span className="authoring-stat-val" style={{ color: '#4CAF50' }}>{thermalAnalysis.operatingTempC} °C</span>
                <span className="authoring-stat-sub">Thermostat open: {thermoTemp} °C</span>
              </div>
              <div className="authoring-stat-card">
                <span className="authoring-stat-label">Head Gasket Safety Margin</span>
                <span className="authoring-stat-val" style={{ color: '#FFC107' }}>+{thermalAnalysis.headGasketMarginC} °C</span>
                <span className="authoring-stat-sub">Failure limit: {headGasketLimit} °C</span>
              </div>
              <div className="authoring-stat-card">
                <span className="authoring-stat-label">Zero-Airflow Buffer</span>
                <span className="authoring-stat-val" style={{ color: '#B3B3B3' }}>{thermalAnalysis.thermalBufferMinutes} min</span>
                <span className="authoring-stat-sub">Time before boilover under full throttle</span>
              </div>
            </div>

            {/* Controls */}
            <div className="authoring-grid">
              <div className="authoring-card">
                <h4>Radiator & Coolant Volume</h4>
                <div className="authoring-ctrl-row">
                  <span>Radiator Core Area (m²):</span>
                  <input
                    type="number"
                    step="0.02"
                    value={radiatorArea}
                    onChange={e => setRadiatorArea(parseFloat(e.target.value) || 0.35)}
                    className="authoring-input"
                  />
                </div>
                <div className="authoring-ctrl-row">
                  <span>Coolant Capacity (Liters):</span>
                  <input
                    type="number"
                    step="0.5"
                    value={coolantVolume}
                    onChange={e => setCoolantVolume(parseFloat(e.target.value) || 8.5)}
                    className="authoring-input"
                  />
                </div>
                <div className="authoring-ctrl-row">
                  <span>Auxiliary Oil Cooler:</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={hasOilCooler}
                      onChange={e => setHasOilCooler(e.target.checked)}
                    />
                    <span style={{ fontSize: 11 }}>Installed (+28 kW dissipation)</span>
                  </label>
                </div>
              </div>

              <div className="authoring-card">
                <h4>Thermostats & Warning Thresholds</h4>
                <div className="authoring-ctrl-row">
                  <span>Thermostat Open Temp (°C):</span>
                  <input
                    type="number"
                    step="1"
                    value={thermoTemp}
                    onChange={e => setThermoTemp(parseInt(e.target.value, 10) || 88)}
                    className="authoring-input"
                  />
                </div>
                <div className="authoring-ctrl-row">
                  <span>Radiator Fan Trigger Temp (°C):</span>
                  <input
                    type="number"
                    step="1"
                    value={fanTemp}
                    onChange={e => setFanTemp(parseInt(e.target.value, 10) || 94)}
                    className="authoring-input"
                  />
                </div>
                <div className="authoring-ctrl-row">
                  <span>Head Gasket Failure Temp (°C):</span>
                  <input
                    type="number"
                    step="1"
                    value={headGasketLimit}
                    onChange={e => setHeadGasketLimit(parseInt(e.target.value, 10) || 130)}
                    className="authoring-input"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: Differential Locking & Electronic Control */}
        {activeTab === 'differentials' && (
          <div className="authoring-pane">
            <div className="authoring-header-card">
              <div className="authoring-title-group">
                <h3>Differential Locking & Dynamic Torque Split</h3>
                <p>Configure cross-axle locking mechanisms: Open, Clutch-Pack LSD, Spool Locker, Viscous Coupling, and Active Torque Vectoring.</p>
              </div>
              <span className="layout-badge">
                Final Drive: {diffRatio}:1
              </span>
            </div>

            {/* Differential Behavior Summary Banner */}
            <div className="sawtooth-header-card" style={{ padding: '14px 18px', background: 'rgba(255, 102, 0, 0.12)', borderColor: 'rgba(255, 102, 0, 0.35)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <b style={{ color: 'var(--bng-orange-hover, #FF8533)', fontSize: 13 }}>{diffLockAnalysis.diffType.toUpperCase()} DIFFERENTIAL BEHAVIOR</b>
                <span style={{ fontSize: 12, color: '#e2e8f0' }}>{diffLockAnalysis.behaviorSummary}</span>
              </div>
            </div>

            {/* Diff Stats */}
            <div className="authoring-stats-row">
              <div className="authoring-stat-card">
                <span className="authoring-stat-label">Power-On Lock</span>
                <span className="authoring-stat-val" style={{ color: 'var(--bng-orange, #FF6600)' }}>{diffLockAnalysis.powerLockPercent}%</span>
                <span className="authoring-stat-sub">Acceleration locking coef</span>
              </div>
              <div className="authoring-stat-card">
                <span className="authoring-stat-label">Coast / Decel Lock</span>
                <span className="authoring-stat-val" style={{ color: 'var(--bng-orange-hover, #FF8533)' }}>{diffLockAnalysis.coastLockPercent}%</span>
                <span className="authoring-stat-sub">Engine braking stability</span>
              </div>
              <div className="authoring-stat-card">
                <span className="authoring-stat-label">Preload Torque</span>
                <span className="authoring-stat-val" style={{ color: 'var(--bng-green, #4CAF50)' }}>{lsdPreload} Nm</span>
                <span className="authoring-stat-sub">Initial static breakaway lock</span>
              </div>
              <div className="authoring-stat-card">
                <span className="authoring-stat-label">Max Cross-Axle Torque</span>
                <span className="authoring-stat-val" style={{ color: 'var(--bng-yellow, #FFC107)' }}>{diffLockAnalysis.maxCrossAxleTorque} Nm</span>
                <span className="authoring-stat-sub">Wheel-to-wheel transfer capacity</span>
              </div>
            </div>

            {/* Controls */}
            <div className="authoring-grid">
              <div className="authoring-card">
                <h4>Differential Architecture</h4>
                <div className="authoring-ctrl-row">
                  <span>Differential Type:</span>
                  <select value={diffType} onChange={e => setDiffType(e.target.value)} className="authoring-select">
                    <option value="open">Open Differential (50/50, No Lock)</option>
                    <option value="lsd">Clutch-Pack Limited Slip (LSD)</option>
                    <option value="locking">Mechanical Spool / Locker (100% Lock)</option>
                    <option value="viscous">Viscous Fluid Coupling</option>
                    <option value="torqueVectoring">Active Electronic Torque Vectoring</option>
                  </select>
                </div>
                <div className="authoring-ctrl-row">
                  <span>Final Drive Ratio:</span>
                  <input
                    type="number"
                    step="0.01"
                    value={diffRatio}
                    onChange={e => setDiffRatio(parseFloat(e.target.value) || 3.73)}
                    className="authoring-input"
                  />
                </div>
              </div>

              {diffType === 'lsd' && (
                <div className="authoring-card">
                  <h4>Clutch-Pack Lock Coefficients</h4>
                  <div className="authoring-ctrl-row">
                    <span>Power Lock (%):</span>
                    <input
                      type="number"
                      step="5"
                      min="0"
                      max="100"
                      value={lsdLockPower}
                      onChange={e => setLsdLockPower(parseInt(e.target.value, 10) || 25)}
                      className="authoring-input"
                    />
                  </div>
                  <div className="authoring-ctrl-row">
                    <span>Coast Lock (%):</span>
                    <input
                      type="number"
                      step="5"
                      min="0"
                      max="100"
                      value={lsdLockCoast}
                      onChange={e => setLsdLockCoast(parseInt(e.target.value, 10) || 15)}
                      className="authoring-input"
                    />
                  </div>
                  <div className="authoring-ctrl-row">
                    <span>Preload (Nm):</span>
                    <input
                      type="number"
                      step="10"
                      value={lsdPreload}
                      onChange={e => setLsdPreload(parseInt(e.target.value, 10) || 60)}
                      className="authoring-input"
                    />
                  </div>
                </div>
              )}

              {diffType === 'locking' && (
                <div className="authoring-card">
                  <h4>Locker Threshold</h4>
                  <div className="authoring-ctrl-row">
                    <span>Breakaway Torque (Nm):</span>
                    <input
                      type="number"
                      step="100"
                      value={lockTorque}
                      onChange={e => setLockTorque(parseInt(e.target.value, 10) || 2500)}
                      className="authoring-input"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 6: Electric EV & Hybrid Powertrains */}
        {activeTab === 'ev_hybrid' && (
          <div className="authoring-pane">
            <div className="authoring-header-card">
              <div className="authoring-title-group">
                <h3>Electric (EV) & Hybrid Powertrain Studio</h3>
                <p>Simulate electric motor instantaneous torque, constant-power hyperbola, inverter efficiency, and battery range.</p>
              </div>
              <span className="layout-badge">
                Battery: {evBatteryKwh} kWh
              </span>
            </div>

            {/* EV Motor Dyno SVG */}
            <div className="sawtooth-svg-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <b style={{ color: 'var(--bng-white, #FFFFFF)', fontSize: 13 }}>Electric Motor Torque & Power Curve</b>
                <div style={{ display: 'flex', gap: 14, fontSize: 11 }}>
                  <span style={{ color: 'var(--bng-orange, #FF6600)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 14, height: 2, background: 'var(--bng-orange, #FF6600)', display: 'inline-block' }} />Motor Torque (Nm)
                  </span>
                  <span style={{ color: 'var(--bng-red, #F44336)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 14, height: 2, background: 'var(--bng-red, #F44336)', display: 'inline-block' }} />Electric Power (HP)
                  </span>
                </div>
              </div>

              <div style={{ height: 260 }}>
                <svg width="100%" height="260" viewBox="0 0 800 260" preserveAspectRatio="xMidYMid meet">
                  {(() => {
                    const curve = evAnalysis.curve;
                    const maxRpm = evMaxRpm || 16000;
                    const topY = Math.max(evMaxTorque, evAnalysis.peakHp) * 1.15;

                    const grid = [4000, 8000, 12000, 16000].map(rpm => {
                      if (rpm > maxRpm) return null;
                      const x = 50 + (rpm / maxRpm) * 720;
                      return (
                        <g key={rpm}>
                          <line x1={x} y1="20" x2={x} y2="230" stroke="rgba(255,255,255,0.06)" strokeDasharray="3,3" />
                          <text x={x} y="246" textAnchor="middle" fill="#B3B3B3" fontSize="10">{rpm}</text>
                        </g>
                      );
                    });

                    const torquePoints = curve.map(p => `${50 + (p.rpm / maxRpm) * 720},${230 - (p.torque / topY) * 200}`).join(' ');
                    const hpPoints = curve.map(p => `${50 + (p.rpm / maxRpm) * 720},${230 - (p.powerHp / topY) * 200}`).join(' ');

                    return (
                      <>
                        {grid}
                        <line x1="50" y1="230" x2="770" y2="230" stroke="#3D3D3D" strokeWidth="1" />
                        <polyline fill="none" stroke="var(--bng-orange, #FF6600)" strokeWidth="3" points={torquePoints} />
                        <polyline fill="none" stroke="var(--bng-red, #F44336)" strokeWidth="2.5" points={hpPoints} />
                      </>
                    );
                  })()}
                </svg>
              </div>
            </div>

            {/* EV Metrics Cards */}
            <div className="authoring-stats-row">
              <div className="authoring-stat-card">
                <span className="authoring-stat-label">Instant Stall Torque</span>
                <span className="authoring-stat-val" style={{ color: 'var(--bng-orange, #FF6600)' }}>{evMaxTorque} Nm</span>
                <span className="authoring-stat-sub">Available from 0 to {evAnalysis.baseRpm} RPM</span>
              </div>
              <div className="authoring-stat-card">
                <span className="authoring-stat-label">Peak Electric Power</span>
                <span className="authoring-stat-val" style={{ color: 'var(--bng-red, #F44336)' }}>{evAnalysis.peakHp} HP</span>
                <span className="authoring-stat-sub">{evMaxPowerKw} kW output</span>
              </div>
              <div className="authoring-stat-card">
                <span className="authoring-stat-label">Estimated EV Range</span>
                <span className="authoring-stat-val" style={{ color: 'var(--bng-green, #4CAF50)' }}>{evAnalysis.estRangeKm} km</span>
                <span className="authoring-stat-sub">{evAnalysis.estRangeMiles} miles ({evBatteryKwh} kWh)</span>
              </div>
              <div className="authoring-stat-card">
                <span className="authoring-stat-label">Regenerative Braking</span>
                <span className="authoring-stat-val" style={{ color: 'var(--bng-orange-hover, #FF8533)' }}>{evRegenTorque} Nm</span>
                <span className="authoring-stat-sub">Inverter efficiency: {evAnalysis.inverterEfficiencyPercent}%</span>
              </div>
            </div>

            {/* Motor Controls */}
            <div className="authoring-grid">
              <div className="authoring-card">
                <h4>Motor Specifications</h4>
                <div className="authoring-ctrl-row">
                  <span>Max Torque (Nm):</span>
                  <input
                    type="number"
                    step="20"
                    value={evMaxTorque}
                    onChange={e => setEvMaxTorque(parseInt(e.target.value, 10) || 400)}
                    className="authoring-input"
                  />
                </div>
                <div className="authoring-ctrl-row">
                  <span>Peak Motor Power (kW):</span>
                  <input
                    type="number"
                    step="10"
                    value={evMaxPowerKw}
                    onChange={e => setEvMaxPowerKw(parseInt(e.target.value, 10) || 200)}
                    className="authoring-input"
                  />
                </div>
                <div className="authoring-ctrl-row">
                  <span>Max Motor RPM:</span>
                  <input
                    type="number"
                    step="500"
                    value={evMaxRpm}
                    onChange={e => setEvMaxRpm(parseInt(e.target.value, 10) || 15000)}
                    className="authoring-input"
                  />
                </div>
              </div>

              <div className="authoring-card">
                <h4>Battery & Energy Recovery</h4>
                <div className="authoring-ctrl-row">
                  <span>Battery Capacity (kWh):</span>
                  <input
                    type="number"
                    step="5"
                    value={evBatteryKwh}
                    onChange={e => setEvBatteryKwh(parseInt(e.target.value, 10) || 75)}
                    className="authoring-input"
                  />
                </div>
                <div className="authoring-ctrl-row">
                  <span>Max Regen Torque (Nm):</span>
                  <input
                    type="number"
                    step="10"
                    value={evRegenTorque}
                    onChange={e => setEvRegenTorque(parseInt(e.target.value, 10) || 150)}
                    className="authoring-input"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Add Powertrain Device */}
        {showAddDeviceModal && (
          <div className="blueprint-modal-backdrop" onClick={() => setShowAddDeviceModal(false)}>
            <div className="blueprint-modal-window" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
              <div className="blueprint-modal-header">
                <div className="blueprint-modal-title">
                  <EngineIcon size={16} />
                  <span>Add Powertrain Device</span>
                </div>
                <button className="blueprint-close-btn" onClick={() => setShowAddDeviceModal(false)}>
                  <CloseIcon size={14} />
                </button>
              </div>

              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="authoring-ctrl-row">
                  <span>Device Type:</span>
                  <select
                    value={newDevType}
                    onChange={e => {
                      setNewDevType(e.target.value);
                      setNewDevName(`${e.target.value}_1`);
                    }}
                    className="authoring-select"
                    style={{ width: 220 }}
                  >
                    <option value="turbocharger">Turbocharger</option>
                    <option value="supercharger">Supercharger</option>
                    <option value="clutch">Friction Clutch</option>
                    <option value="torqueConverter">Torque Converter</option>
                    <option value="manualGearbox">Manual Gearbox</option>
                    <option value="automaticGearbox">Automatic Gearbox</option>
                    <option value="transfercase">Transfer Case (4WD/AWD)</option>
                    <option value="differential">Differential</option>
                    <option value="shaft">Driveshaft / Halfshaft</option>
                    <option value="electricMotor">Electric EV Motor</option>
                  </select>
                </div>

                <div className="authoring-ctrl-row">
                  <span>Device Name:</span>
                  <input
                    type="text"
                    value={newDevName}
                    onChange={e => setNewDevName(e.target.value)}
                    className="authoring-input"
                    style={{ width: 220, textAlign: 'left' }}
                  />
                </div>

                <div className="authoring-ctrl-row">
                  <span>Input Parent:</span>
                  <select
                    value={newDevInputName}
                    onChange={e => setNewDevInputName(e.target.value)}
                    className="authoring-select"
                    style={{ width: 220 }}
                  >
                    {Object.values(graph.devices).map(d => (
                      <option key={d.name} value={d.name}>{d.name} ({d.type})</option>
                    ))}
                  </select>
                </div>

                <div className="authoring-ctrl-row">
                  <span>Input Port Index:</span>
                  <select
                    value={newDevInputIndex}
                    onChange={e => setNewDevInputIndex(parseInt(e.target.value, 10) || 1)}
                    className="authoring-select"
                    style={{ width: 80 }}
                  >
                    <option value="1">Port 1</option>
                    <option value="2">Port 2</option>
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                  <button
                    type="button"
                    className="blueprint-action-btn secondary"
                    style={{ width: 'auto', padding: '6px 14px' }}
                    onClick={() => setShowAddDeviceModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="blueprint-action-btn"
                    style={{ width: 'auto', padding: '6px 16px' }}
                    onClick={handleAddDevice}
                  >
                    Add Device to JBeam
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Modular Setup Wizard */}
        {showModularModal && (
          <div className="blueprint-modal-backdrop" onClick={() => setShowModularModal(false)}>
            <div className="blueprint-modal-window" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()}>
              <div className="blueprint-modal-header">
                <div className="blueprint-modal-title">
                  <LayersIcon size={16} />
                  <span>Modular BeamNG Powertrain Setup Wizard</span>
                </div>
                <button className="blueprint-close-btn" onClick={() => setShowModularModal(false)}>
                  <CloseIcon size={14} />
                </button>
              </div>

              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                  Generates separated modular JBeam files (Engine, Transmission, Driveshaft, Differential, Radiator) according to official BeamNG vehicle modding architecture.
                </p>

                <div className="authoring-grid">
                  <div className="authoring-card">
                    <h4>Vehicle Configuration</h4>
                    <div className="authoring-ctrl-row">
                      <span>Vehicle Code Name:</span>
                      <input
                        type="text"
                        value={modVehicleName}
                        onChange={e => setModVehicleName(e.target.value)}
                        className="authoring-input"
                        style={{ width: 140, textAlign: 'left' }}
                      />
                    </div>
                    <div className="authoring-ctrl-row">
                      <span>Drivetrain Layout:</span>
                      <select value={modLayout} onChange={e => setModLayout(e.target.value)} className="authoring-select">
                        <option value="RWD">Front-Engine RWD</option>
                        <option value="FWD">Front-Engine FWD</option>
                        <option value="AWD">All-Wheel Drive (AWD)</option>
                      </select>
                    </div>
                  </div>

                  <div className="authoring-card">
                    <h4>Component Presets</h4>
                    <div className="authoring-ctrl-row">
                      <span>Engine:</span>
                      <select value={modEngineType} onChange={e => setModEngineType(e.target.value)} className="authoring-select">
                        <option value="I4_2.0L">2.0L Inline-4 Turbo</option>
                        <option value="V6_3.0L">3.0L V6 Twin-Turbo</option>
                        <option value="V8_5.0L">5.0L Naturally Aspirated V8</option>
                      </select>
                    </div>
                    <div className="authoring-ctrl-row">
                      <span>Transmission:</span>
                      <select value={modTransType} onChange={e => setModTransType(e.target.value)} className="authoring-select">
                        <option value="6M">6-Speed Manual</option>
                        <option value="8A">8-Speed Automatic</option>
                        <option value="7DCT">7-Speed Dual-Clutch (DCT)</option>
                      </select>
                    </div>
                    <div className="authoring-ctrl-row">
                      <span>Differential:</span>
                      <select value={modDiffType} onChange={e => setModDiffType(e.target.value)} className="authoring-select">
                        <option value="lsd">Limited Slip (LSD)</option>
                        <option value="open">Open Differential</option>
                        <option value="locking">Locking Spool</option>
                      </select>
                    </div>
                  </div>
                </div>

                {generatedModularFiles ? (
                  <div style={{ background: 'var(--bng-surface-gray, #262626)', border: '1px solid var(--bng-green, #4CAF50)', borderRadius: 6, padding: 12 }}>
                    <b style={{ color: 'var(--bng-green, #4CAF50)', fontSize: 12, display: 'block', marginBottom: 6 }}>
                      Generated {Object.keys(generatedModularFiles).length} Modular JBeam Files:
                    </b>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: 'var(--bng-orange-hover, #FF8533)' }}>
                      {Object.keys(generatedModularFiles).map(fn => (
                        <li key={fn}>{fn}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                  <button
                    type="button"
                    className="blueprint-action-btn secondary"
                    style={{ width: 'auto', padding: '6px 14px' }}
                    onClick={() => setShowModularModal(false)}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    className="blueprint-action-btn"
                    style={{ width: 'auto', padding: '6px 16px' }}
                    onClick={handleGenerateModularSetup}
                  >
                    Generate Modular JBeam Files
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Right Inspection Drawer for Selected Device */}
        {selectedDevice && (
          <div className="device-inspector-drawer">
            <div className="drawer-header">
              <div className="drawer-title">
                <span className="dev-name">{selectedDevice.name}</span>
                <span className="dev-cat">({selectedDevice.category})</span>
              </div>
              <button onClick={() => setSelectedDeviceName(null)} className="drawer-close-btn">
                <CloseIcon size={12} />
              </button>
            </div>

            <div className="drawer-content">
              <div className="prop-row">
                <span>Device Type</span>
                <code>{selectedDevice.type}</code>
              </div>
              <div className="prop-row">
                <span>Input Source</span>
                <code>{selectedDevice.inputName || 'Root'}</code>
              </div>
              <div className="prop-row">
                <span>Input Port</span>
                <code>{selectedDevice.inputIndex ?? 1}</code>
              </div>

              {selectedDevice.properties && Object.keys(selectedDevice.properties).length > 0 && (
                <div className="config-box" style={{ marginTop: 12 }}>
                  <b style={{ fontSize: 11, opacity: 0.8, display: 'block', marginBottom: 6 }}>PARAMETERS</b>
                  <pre style={{ margin: 0, fontSize: 11, color: 'var(--bng-orange-hover, #FF8533)', maxHeight: 220, overflow: 'auto' }}>
                    {safeJsonStringify(selectedDevice.properties, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  </PowertrainErrorBoundary>
  );
}

export default PowertrainStudio;
