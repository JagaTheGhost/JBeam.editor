import React, { useState, useMemo } from 'react';
import { parsePowertrainGraph } from './powertrainParser.js';

// SVG Icons for Powertrain Device Categories
export function EngineIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v4M4 8v8M20 8v8M6 8h12v8H6z" />
      <path d="M18 10h4v4h-4M2 10h4v4H2M9 16v4M15 16v4" />
    </svg>
  );
}

export function CouplingIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="12" r="5" />
      <circle cx="16" cy="12" r="5" />
      <path d="M12 7v10" />
    </svg>
  );
}

export function GearIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function DiffIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="7" />
      <path d="M12 5v14M5 12h14" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

export function ShaftIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12h16M7 8l-3 4 3 4M17 8l3 4-3 4" />
    </svg>
  );
}

function ChevronDownIcon({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function ChevronRightIcon({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export const CATEGORY_META = {
  engine: { label: 'Engine', color: 'var(--bng-orange-hover, #FF8533)', icon: EngineIcon },
  coupling: { label: 'Clutch', color: '#E040FB', icon: CouplingIcon },
  gearbox: { label: 'Transmission', color: 'var(--bng-orange, #FF6600)', icon: GearIcon },
  transfercase: { label: 'Transfer Case', color: 'var(--bng-yellow, #FFC107)', icon: DiffIcon },
  differential: { label: 'Differential', color: 'var(--bng-green, #4CAF50)', icon: DiffIcon },
  shaft: { label: 'Shaft / Axle', color: 'var(--bng-silver, #B3B3B3)', icon: ShaftIcon },
  accessory: { label: 'Accessory', color: 'var(--bng-yellow, #FFC107)', icon: GearIcon }
};

/**
 * Format differential and gearbox types safely without [object Object]
 */
export function formatDifferentialBadge(props) {
  if (!props) return null;
  const ratio = props.gearRatio;
  let dType = props.diffType;
  if (Array.isArray(dType)) {
    dType = dType.filter(x => typeof x === 'string').join('/');
  } else if (dType && typeof dType === 'object') {
    dType = Object.values(dType).filter(x => typeof x === 'string').join('/');
  } else if (typeof dType !== 'string') {
    dType = null;
  }

  if (ratio) {
    return `${ratio}:1 ${dType ? `(${dType})` : 'FD'}`;
  }
  return dType ? `${dType} Diff` : null;
}

export function formatGearboxBadge(props) {
  if (!props) return null;
  const ratios = props.gearRatios;
  if (Array.isArray(ratios)) {
    const fGears = ratios.filter(r => Number(r) > 0).length;
    return `${fGears}-Speed`;
  }
  if (ratios && typeof ratios === 'object') {
    const fGears = Object.values(ratios).filter(r => Number(r) > 0).length;
    return `${fGears}-Speed`;
  }
  return null;
}

/**
 * Interactive SVG Engine Dyno Chart Component (Torque & Horsepower curves)
 */
export function TorqueDynoCurve({ engineSpecs }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);

  if (!engineSpecs || !engineSpecs.torqueCurve || engineSpecs.torqueCurve.length < 2) {
    return null;
  }

  const { torqueCurve, maxRpm, peakTorqueNm, peakPowerHp } = engineSpecs;
  const width = 310;
  const height = 125;
  const padL = 34;
  const padR = 34;
  const padT = 14;
  const padB = 20;

  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const maxValTorque = Math.max(peakTorqueNm * 1.15, 100);
  const maxValHp = Math.max(peakPowerHp * 1.15, 100);

  const getX = (rpm) => padL + (rpm / maxRpm) * chartW;
  const getYTorque = (t) => padT + chartH - (t / maxValTorque) * chartH;
  const getYPower = (hp) => padT + chartH - (hp / maxValHp) * chartH;

  const torquePath = torqueCurve.reduce((acc, pt, i) => {
    const x = getX(pt.rpm);
    const y = getYTorque(pt.torque);
    return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  const powerPath = torqueCurve.reduce((acc, pt, i) => {
    const x = getX(pt.rpm);
    const y = getYPower(pt.powerHp);
    return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  return (
    <div className="powertrain-dyno-box">
      <div className="dyno-header">
        <span className="powertrain-section-label" style={{ fontSize: 10 }}>Engine Dyno Curve</span>
        <div className="dyno-legends">
          <span className="legend-item"><span className="legend-dot torque" />Torque (Nm)</span>
          <span className="legend-item"><span className="legend-dot power" />Power (HP)</span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="dyno-svg"
        onMouseLeave={() => setHoveredPoint(null)}
      >
        {/* Subtle grid lines */}
        <line x1={padL} y1={padT} x2={padL + chartW} y2={padT} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
        <line x1={padL} y1={padT + chartH / 2} x2={padL + chartW} y2={padT + chartH / 2} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
        <line x1={padL} y1={padT + chartH} x2={padL + chartW} y2={padT + chartH} stroke="rgba(255,255,255,0.12)" />

        {/* Left Axis label (Torque) */}
        <text x={padL - 4} y={padT + 4} textAnchor="end" fill="#FF8533" fontSize="9" fontFamily="monospace">
          {Math.round(maxValTorque)}
        </text>
        <text x={padL - 4} y={padT + chartH} textAnchor="end" fill="#FF8533" fontSize="9" fontFamily="monospace">
          0
        </text>

        {/* Right Axis label (HP) */}
        <text x={padL + chartW + 4} y={padT + 4} textAnchor="start" fill="#F44336" fontSize="9" fontFamily="monospace">
          {Math.round(maxValHp)}
        </text>
        <text x={padL + chartW + 4} y={padT + chartH} textAnchor="start" fill="#F44336" fontSize="9" fontFamily="monospace">
          0
        </text>

        {/* Curve Lines */}
        <path d={torquePath} fill="none" stroke="#FF8533" strokeWidth="2" strokeLinecap="round" />
        <path d={powerPath} fill="none" stroke="#F44336" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 2" />

        {/* Hover overlay indicator */}
        {hoveredPoint && (
          <line
            x1={getX(hoveredPoint.rpm)}
            y1={padT}
            x2={getX(hoveredPoint.rpm)}
            y2={padT + chartH}
            stroke="rgba(255,255,255,0.4)"
            strokeDasharray="2 2"
          />
        )}
      </svg>

      {hoveredPoint ? (
        <div className="dyno-tooltip-bar">
          <span>{hoveredPoint.rpm} RPM</span>
          <span style={{ color: '#FF8533' }}>{hoveredPoint.torque} Nm</span>
          <span style={{ color: '#F44336' }}>{hoveredPoint.powerHp} HP</span>
        </div>
      ) : (
        <div className="dyno-peak-summary">
          <span>Peak: <strong>{peakTorqueNm} Nm</strong> @ {engineSpecs.peakTorqueRpm} RPM</span>
          <span><strong>{peakPowerHp} HP</strong> @ {engineSpecs.peakPowerRpm} RPM</span>
        </div>
      )}
    </div>
  );
}

/**
 * Individual Device Card Component (Exact Image 1 Reference)
 */
function PowertrainDeviceCard({
  dev,
  isSelected,
  isExpanded,
  onToggleExpand,
  onSelect,
  onSelectInCode
}) {
  const meta = CATEGORY_META[dev.category] || CATEGORY_META.shaft;
  const IconComp = meta.icon;
  const props = dev.properties || {};

  let badgeText = null;
  if (dev.type.toLowerCase().includes('gearbox')) {
    badgeText = formatGearboxBadge(props);
  } else if (dev.type.toLowerCase().includes('differential')) {
    badgeText = formatDifferentialBadge(props);
  } else if (dev.type.toLowerCase().includes('engine') && props.maxRPM) {
    badgeText = `${props.idleRPM || 650}-${props.maxRPM} RPM`;
  }

  const outputCount = dev.children?.length || 0;

  // Selected device properties safe formatting
  const propertyEntries = useMemo(() => {
    if (!props) return [];
    const entries = [];
    for (const [k, v] of Object.entries(props)) {
      if (k.startsWith('__') || k === 'torque' || k === 'torqueCompressionBrake' || typeof v === 'function') {
        continue;
      }
      let displayVal = '';
      try {
        if (Array.isArray(v)) {
          displayVal = v.join(', ');
        } else if (v && typeof v === 'object') {
          displayVal = Object.values(v).join(', ');
        } else {
          displayVal = String(v ?? '');
        }
      } catch {
        displayVal = '[Complex Object]';
      }
      if (displayVal.length > 40) displayVal = displayVal.substring(0, 37) + '...';
      entries.push([k, displayVal]);
    }
    return entries;
  }, [props]);

  return (
    <div
      className={`powertrain-card ${isSelected ? 'selected' : ''}`}
    >
      <div className="powertrain-card-main" onClick={() => onSelect(isSelected ? null : dev.name)}>
        <button
          type="button"
          className="powertrain-chevron-toggle"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(dev.name);
          }}
          title={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
        </button>

        <div className="powertrain-icon-box" style={{ color: meta.color }}>
          <IconComp size={14} />
        </div>

        <div className="powertrain-card-body">
          <div className="powertrain-card-title">{dev.name}</div>
          <div className="powertrain-card-type">{dev.type}</div>
          <div className="powertrain-card-connection">
            {dev.inputName ? (
              <>from <span className="source-parent">{dev.inputName}</span> (port {dev.inputIndex || 1})</>
            ) : (
              <span className="source-root">Source (Root Device)</span>
            )}
          </div>
        </div>

        <div className="powertrain-card-meta">
          {badgeText && <span className="powertrain-tech-badge">{badgeText}</span>}
          {outputCount > 0 && (
            <span className="powertrain-output-count">
              → {outputCount} output{outputCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="powertrain-card-details">
          {propertyEntries.length > 0 ? (
            <div className="powertrain-props-grid">
              {propertyEntries.slice(0, 8).map(([k, val]) => (
                <React.Fragment key={k}>
                  <span className="powertrain-prop-name">{k}:</span>
                  <span className="powertrain-prop-val" title={val}>{val}</span>
                </React.Fragment>
              ))}
            </div>
          ) : (
            <div style={{ color: '#8b949e', fontSize: 10 }}>No custom properties declared</div>
          )}

          {onSelectInCode && (
            <button
              type="button"
              className="powertrain-code-btn"
              onClick={(e) => {
                e.stopPropagation();
                onSelectInCode(dev.name);
              }}
            >
              Jump to Code in Editor
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Main Powertrain & Drivetrain Architecture Visualizer Component
 */
export function PowertrainVisualizer({
  jbeamParts,
  compositeVehicleParts = null,
  onApplyEdit = null,
  activeDocumentText = '',
  onSelectDeviceInCode = null
}) {
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [expandedNodes, setExpandedNodes] = useState({});

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

  const { devices, roots, edges, totalDevices, drivetrainLayout, engineSpecs } = graph;

  const toggleExpand = (deviceId) => {
    setExpandedNodes(prev => ({
      ...prev,
      [deviceId]: prev[deviceId] !== undefined ? !prev[deviceId] : false
    }));
  };

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

  // Topological / Torque-Flow ordered devices list for clean layout
  const orderedDeviceList = useMemo(() => {
    const list = [];
    const visited = new Set();

    function traverse(devId) {
      if (visited.has(devId)) return;
      visited.add(devId);
      const dev = devices[devId];
      if (dev) {
        list.push(dev);
        if (dev.children) {
          for (const ch of dev.children) {
            traverse(ch.name);
          }
        }
      }
    }

    // Traverse starting from roots (e.g. engines)
    for (const rId of roots) {
      traverse(rId);
    }

    // Append any unvisited devices (auxiliary or independent)
    for (const dev of Object.values(devices)) {
      if (!visited.has(dev.name)) {
        list.push(dev);
      }
    }

    return list;
  }, [devices, roots]);

  // Filtered devices list for flat search
  const displayedDevices = useMemo(() => {
    if (!filterQuery) return orderedDeviceList;
    const q = filterQuery.toLowerCase();
    return orderedDeviceList.filter(d =>
      d.name.toLowerCase().includes(q) ||
      d.type.toLowerCase().includes(q) ||
      d.category.toLowerCase().includes(q)
    );
  }, [orderedDeviceList, filterQuery]);

  if (totalDevices === 0) {
    return (
      <div className="powertrain-empty-state">
        <div className="powertrain-empty-card" style={{ padding: '24px 18px', maxWidth: '100%' }}>
          <div className="powertrain-empty-icon" style={{ width: 48, height: 48 }}>
            <EngineIcon size={24} />
          </div>
          <h4 className="powertrain-empty-title" style={{ fontSize: 14 }}>No Powertrain Found</h4>
          <p className="powertrain-empty-desc" style={{ fontSize: 12 }}>
            This part does not declare a <code>"powertrain"</code> table.
          </p>
          {onApplyEdit && (
            <button
              type="button"
              className="blueprint-action-btn"
              style={{ width: 'auto', padding: '6px 14px', fontSize: 11 }}
              onClick={handleInsertStarterPowertrain}
            >
              Insert Standard Powertrain
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="powertrain-visualizer-container">
      {/* Top Header: Standard Drive badge, Devices badge, Links badge */}
      <div className="powertrain-top-badges">
        <span className="powertrain-badge-pill layout-drive">
          {drivetrainLayout || 'Standard Drive'}
        </span>
        <span className="powertrain-badge-pill stat-count">{totalDevices} Devices</span>
        {edges.length > 0 && (
          <span className="powertrain-badge-pill stat-count">{edges.length} Links</span>
        )}
        {isUsingAssembly && (
          <span className="powertrain-badge-pill assembly-source">Assembly</span>
        )}
      </div>

      {/* Subheader: TORQUE FLOW ARCHITECTURE & Filter devices */}
      <div className="powertrain-sub-header">
        <div className="powertrain-section-label">TORQUE FLOW ARCHITECTURE</div>
        <input
          type="text"
          placeholder="Filter devices..."
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          className="powertrain-filter-input"
        />
      </div>

      {/* Engine Dyno Chart if available */}
      {engineSpecs && <TorqueDynoCurve engineSpecs={engineSpecs} />}

      {/* Device Cards List (Image 1 Reference) */}
      <div className="powertrain-cards-list">
        {displayedDevices.length === 0 ? (
          <div style={{ color: '#8b949e', fontSize: 11, textAlign: 'center', padding: '12px 0' }}>
            No devices matching &quot;{filterQuery}&quot;
          </div>
        ) : (
          displayedDevices.map(dev => (
            <PowertrainDeviceCard
              key={dev.name}
              dev={dev}
              isSelected={selectedDeviceId === dev.name}
              isExpanded={expandedNodes[dev.name] !== false}
              onToggleExpand={toggleExpand}
              onSelect={setSelectedDeviceId}
              onSelectInCode={onSelectDeviceInCode}
            />
          ))
        )}
      </div>
    </div>
  );
}
