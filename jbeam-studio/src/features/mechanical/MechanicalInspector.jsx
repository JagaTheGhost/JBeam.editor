/**
 * JBeam Studio - Mechanical Component Inspector
 * Displays parameter specifications, bound 3D nodes, matching DAE submeshes,
 * quick-navigation actions, and two-way property editing for selected mechanical components.
 */

import React, { useState, useEffect } from 'react';
import {
  FocusIcon,
  CodeIcon,
  CubeIcon,
  EngineIcon,
  CloseIcon
} from '../../components/Icons.jsx';

export function MechanicalInspector({
  selectedCategory, // 'device' | 'hydro' | 'suspension' | 'brakes' | 'mount' | 'energy' | 'variable'
  selectedItem,
  panelHeight = 260,
  onFocus3D,
  onJumpToCode,
  onIsolateMesh,
  onUpdateBeamProperties = null,
  onDeselect
}) {
  const [editSpring, setEditSpring] = useState('');
  const [editDamp, setEditDamp] = useState('');
  const [editStrength, setEditStrength] = useState('');
  const [editFactor, setEditFactor] = useState('');
  const [editInRate, setEditInRate] = useState('');
  const [editOutRate, setEditOutRate] = useState('');
  const [saveFeedback, setSaveFeedback] = useState('');

  useEffect(() => {
    setSaveFeedback('');
    if (!selectedItem) return;
    setEditSpring(selectedItem.beamSpring !== undefined && selectedItem.beamSpring !== null ? String(selectedItem.beamSpring) : '');
    setEditDamp(selectedItem.beamDamp !== undefined && selectedItem.beamDamp !== null ? String(selectedItem.beamDamp) : '');
    setEditStrength(selectedItem.beamStrength !== undefined && selectedItem.beamStrength !== null ? String(selectedItem.beamStrength) : '');
    setEditFactor(selectedItem.factor !== undefined && selectedItem.factor !== null ? String(selectedItem.factor) : '');
    setEditInRate(selectedItem.inRate !== undefined && selectedItem.inRate !== null ? String(selectedItem.inRate) : '');
    setEditOutRate(selectedItem.outRate !== undefined && selectedItem.outRate !== null ? String(selectedItem.outRate) : '');
  }, [selectedItem, selectedCategory]);

  if (!selectedItem) {
    return (
      <div className="mechanical-inspector-empty">
        <div className="inspector-empty-icon">
          <EngineIcon size={24} />
        </div>
        <div className="inspector-empty-title">No Mechanical Part Selected</div>
        <div className="inspector-empty-desc">
          Hover any component in the tree to preview it in 3D, or click to inspect and edit its parameters.
        </div>
      </div>
    );
  }

  const isDevice = selectedCategory === 'device';
  const isHydro = selectedCategory === 'hydro';
  const isSuspension = selectedCategory === 'suspension';
  const isBrakes = selectedCategory === 'brakes';
  const isMount = selectedCategory === 'mount';
  const isEnergy = selectedCategory === 'energy';
  const isVariable = selectedCategory === 'variable';

  const title = isDevice
    ? selectedItem.name
    : isHydro
    ? selectedItem.beamName || `Hydro ${selectedItem.id1} ↔ ${selectedItem.id2}`
    : isMount
    ? selectedItem.breakGroup || selectedItem.engineGroup || `Mount ${selectedItem.id1} ↔ ${selectedItem.id2}`
    : isBrakes
    ? `Wheel ${selectedItem.name} (${selectedItem.side})`
    : selectedItem.name;

  const subtitle = isDevice
    ? `${selectedItem.type} (${selectedItem.category})`
    : isHydro
    ? 'Steering / Hydraulic Actuator'
    : isSuspension
    ? `${selectedItem.subType || 'Suspension Kinematics'}`
    : isBrakes
    ? 'Brake & Wheel Assembly'
    : isMount
    ? 'Engine / Transmission Mount Beam'
    : isVariable
    ? `Tuning Variable (${selectedItem.category})`
    : selectedItem.type;

  const handleApplyBeamEdits = () => {
    if (!onUpdateBeamProperties || !selectedItem?.id1 || !selectedItem?.id2) return;
    const updates = {};
    if (isHydro) {
      if (editFactor !== '' && !isNaN(Number(editFactor))) updates.factor = Number(editFactor);
      if (editInRate !== '' && !isNaN(Number(editInRate))) updates.inRate = Number(editInRate);
      if (editOutRate !== '' && !isNaN(Number(editOutRate))) updates.outRate = Number(editOutRate);
    } else {
      if (editSpring !== '' && !isNaN(Number(editSpring))) updates.beamSpring = Number(editSpring);
      if (editDamp !== '' && !isNaN(Number(editDamp))) updates.beamDamp = Number(editDamp);
      if (editStrength !== '' && !isNaN(Number(editStrength))) updates.beamStrength = Number(editStrength);
    }
    if (Object.keys(updates).length === 0) return;
    const ok = onUpdateBeamProperties(selectedItem, updates);
    setSaveFeedback(ok ? 'Applied to JBeam' : 'Open source file to edit');
    setTimeout(() => setSaveFeedback(''), 2500);
  };

  const targetFileName = selectedItem.filePath
    ? String(selectedItem.filePath).replace(/\\/g, '/').split('/').pop()
    : (selectedItem.partName || null);

  return (
    <div className="mechanical-inspector-panel" style={panelHeight ? { height: panelHeight } : undefined}>
      {/* Header */}
      <div className="inspector-header-row">
        <div className="inspector-title-group">
          <span className="inspector-title">{title}</span>
          <span className="inspector-subtitle">
            {subtitle}{targetFileName ? ` · ${targetFileName}` : ''}
          </span>
        </div>
        {onDeselect && (
          <button
            type="button"
            className="inspector-close-btn"
            onClick={onDeselect}
            title="Deselect"
          >
            <CloseIcon size={12} />
          </button>
        )}
      </div>

      {/* Action Buttons Toolbar */}
      <div className="inspector-actions-bar">
        {onFocus3D && (
          <button
            type="button"
            className="inspector-action-btn primary"
            onClick={() => onFocus3D(selectedCategory, selectedItem)}
            title="Focus camera on this part in 3D"
          >
            <FocusIcon size={13} />
            <span>Focus 3D</span>
          </button>
        )}

        {isDevice && selectedItem.boundMeshes && selectedItem.boundMeshes.length > 0 && onIsolateMesh && (
          <button
            type="button"
            className="inspector-action-btn"
            onClick={() => onIsolateMesh(selectedItem.boundMeshes[0])}
            title={`Isolate 3D DAE submesh: ${selectedItem.boundMeshes[0]}`}
          >
            <CubeIcon size={13} />
            <span>Isolate Mesh</span>
          </button>
        )}

        {onJumpToCode && (
          <button
            type="button"
            className="inspector-action-btn"
            onClick={() => onJumpToCode(selectedCategory, selectedItem)}
            title="Jump to definition in JBeam code editor"
          >
            <CodeIcon size={13} />
            <span>Jump to Code</span>
          </button>
        )}
      </div>

      <div className="inspector-scroll-area">
        {/* Device Properties */}
        {isDevice && (
          <div className="inspector-section">
            <div className="inspector-section-label">Device Architecture</div>
            <div className="inspector-props-table">
              <div className="prop-row">
                <span className="prop-name">Device Name</span>
                <span className="prop-val mono">{selectedItem.name}</span>
              </div>
              <div className="prop-row">
                <span className="prop-name">Device Type</span>
                <span className="prop-val mono">{selectedItem.type}</span>
              </div>
              <div className="prop-row">
                <span className="prop-name">Input Connection</span>
                <span className="prop-val mono">{selectedItem.inputName || 'None (Power Source Root)'}</span>
              </div>
              {selectedItem.deviceProps?.idleRPM !== undefined && (
                <div className="prop-row">
                  <span className="prop-name">Idle / Max RPM</span>
                  <span className="prop-val mono">{selectedItem.deviceProps.idleRPM} / {selectedItem.deviceProps.maxRPM || '—'}</span>
                </div>
              )}
              {selectedItem.deviceProps?.gearRatio !== undefined && (
                <div className="prop-row">
                  <span className="prop-name">Final Drive Ratio</span>
                  <span className="prop-val mono bold">{selectedItem.deviceProps.gearRatio}:1</span>
                </div>
              )}
              {selectedItem.partName && (
                <div className="prop-row">
                  <span className="prop-name">Source Part</span>
                  <span className="prop-val mono highlight">{selectedItem.partName}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bound 3D Nodes */}
        {isDevice && selectedItem.boundNodes && selectedItem.boundNodes.length > 0 && (
          <div className="inspector-section">
            <div className="inspector-section-label">Bound 3D Nodes ({selectedItem.boundNodes.length})</div>
            <div className="bound-nodes-pills-wrap">
              {selectedItem.boundNodes.slice(0, 16).map(nodeId => (
                <button
                  key={nodeId}
                  type="button"
                  className="node-id-pill clickable"
                  title={`Focus node ${nodeId} in 3D Viewport`}
                  onClick={() => onFocus3D && onFocus3D('device', { ...selectedItem, boundNodes: [nodeId] })}
                >
                  {nodeId}
                </button>
              ))}
              {selectedItem.boundNodes.length > 16 && (
                <span className="node-id-pill more">+{selectedItem.boundNodes.length - 16} more</span>
              )}
            </div>
          </div>
        )}

        {/* Bound Meshes */}
        {isDevice && selectedItem.boundMeshes && selectedItem.boundMeshes.length > 0 && (
          <div className="inspector-section">
            <div className="inspector-section-label">Correlated 3D Meshes</div>
            <div className="bound-meshes-list">
              {selectedItem.boundMeshes.map(mesh => (
                <div key={mesh} className="bound-mesh-card">
                  <CubeIcon size={12} />
                  <span>{mesh}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hydro Specifics + Two-Way Editing */}
        {isHydro && (
          <div className="inspector-section">
            <div className="inspector-section-label">Hydraulic Parameters</div>
            <div className="inspector-props-table">
              <div className="prop-row">
                <span className="prop-name">Nodes</span>
                <span className="prop-val mono">{selectedItem.id1} ↔ {selectedItem.id2}</span>
              </div>
              <div className="prop-row">
                <span className="prop-name">Factor</span>
                <input
                  type="number"
                  step="0.01"
                  value={editFactor}
                  onChange={(e) => setEditFactor(e.target.value)}
                  className="mech-inline-input"
                />
              </div>
              <div className="prop-row">
                <span className="prop-name">In Rate (m/s)</span>
                <input
                  type="number"
                  step="0.05"
                  value={editInRate}
                  onChange={(e) => setEditInRate(e.target.value)}
                  className="mech-inline-input"
                />
              </div>
              <div className="prop-row">
                <span className="prop-name">Out Rate (m/s)</span>
                <input
                  type="number"
                  step="0.05"
                  value={editOutRate}
                  onChange={(e) => setEditOutRate(e.target.value)}
                  className="mech-inline-input"
                />
              </div>
              {onUpdateBeamProperties && (
                <div className="prop-row">
                  <button type="button" className="inspector-action-btn primary" onClick={handleApplyBeamEdits}>
                    Apply to Code
                  </button>
                  {saveFeedback && <span className="prop-val highlight">{saveFeedback}</span>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Mount & Suspension Beam Specifics + Two-Way Editing */}
        {(isMount || isSuspension) && (
          <div className="inspector-section">
            <div className="inspector-section-label">
              {isMount ? 'Mount Elasticity & Limits' : 'Suspension Kinematics & Damping'}
            </div>
            <div className="inspector-props-table">
              {selectedItem.id1 && (
                <div className="prop-row">
                  <span className="prop-name">Anchor Nodes</span>
                  <span className="prop-val mono">
                    {selectedItem.boundNodes ? selectedItem.boundNodes.join(' ↔ ') : `${selectedItem.id1} ↔ ${selectedItem.id2 || ''}`}
                  </span>
                </div>
              )}
              {selectedItem.breakGroup && (
                <div className="prop-row">
                  <span className="prop-name">Break Group</span>
                  <span className="prop-val mono bold">{selectedItem.breakGroup}</span>
                </div>
              )}
              {(isMount || (isSuspension && selectedItem.id1 && selectedItem.id2 && selectedItem.kind !== 'torsionbar' && selectedItem.kind !== 'rail')) && (
                <>
                  <div className="prop-row">
                    <span className="prop-name">Spring (N/m)</span>
                    <input
                      type="number"
                      step="1000"
                      value={editSpring}
                      onChange={(e) => setEditSpring(e.target.value)}
                      className="mech-inline-input"
                    />
                  </div>
                  <div className="prop-row">
                    <span className="prop-name">Damp (N·s/m)</span>
                    <input
                      type="number"
                      step="50"
                      value={editDamp}
                      onChange={(e) => setEditDamp(e.target.value)}
                      className="mech-inline-input"
                    />
                  </div>
                  {isMount && (
                    <div className="prop-row">
                      <span className="prop-name">Break Strength</span>
                      <input
                        type="number"
                        step="1000"
                        value={editStrength}
                        onChange={(e) => setEditStrength(e.target.value)}
                        className="mech-inline-input"
                      />
                    </div>
                  )}
                  {onUpdateBeamProperties && (
                    <div className="prop-row">
                      <button type="button" className="inspector-action-btn primary" onClick={handleApplyBeamEdits}>
                        Apply to Code
                      </button>
                      {saveFeedback && <span className="prop-val highlight">{saveFeedback}</span>}
                    </div>
                  )}
                </>
              )}
              {selectedItem.partName && (
                <div className="prop-row">
                  <span className="prop-name">Part Source</span>
                  <span className="prop-val mono highlight">{selectedItem.partName}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Brakes & Wheels Specifics */}
        {isBrakes && (
          <div className="inspector-section">
            <div className="inspector-section-label">Brake & Tire Fitment</div>
            <div className="inspector-props-table">
              <div className="prop-row">
                <span className="prop-name">Brake Torque</span>
                <span className="prop-val bold">{selectedItem.brakeTorque} Nm</span>
              </div>
              <div className="prop-row">
                <span className="prop-name">Parking Torque</span>
                <span className="prop-val">{selectedItem.parkingTorque} Nm</span>
              </div>
              <div className="prop-row">
                <span className="prop-name">Rotor Diameter</span>
                <span className="prop-val">{selectedItem.brakeDiameter ? `${selectedItem.brakeDiameter} m` : '—'}</span>
              </div>
              <div className="prop-row">
                <span className="prop-name">Tire Radius / Width</span>
                <span className="prop-val">{selectedItem.radius}m / {selectedItem.tireWidth}m</span>
              </div>
              <div className="prop-row">
                <span className="prop-name">Pressure</span>
                <span className="prop-val">{selectedItem.pressurePSI} PSI</span>
              </div>
            </div>
          </div>
        )}

        {/* Energy Storage */}
        {isEnergy && (
          <div className="inspector-section">
            <div className="inspector-section-label">Energy Storage Specs</div>
            <div className="inspector-props-table">
              <div className="prop-row">
                <span className="prop-name">Storage Name</span>
                <span className="prop-val mono">{selectedItem.name}</span>
              </div>
              <div className="prop-row">
                <span className="prop-name">Type</span>
                <span className="prop-val">{selectedItem.type}</span>
              </div>
              {selectedItem.properties?.fuelCapacity !== undefined && (
                <div className="prop-row">
                  <span className="prop-name">Capacity</span>
                  <span className="prop-val bold">{selectedItem.properties.fuelCapacity} L</span>
                </div>
              )}
              {selectedItem.properties?.energyCapacity !== undefined && (
                <div className="prop-row">
                  <span className="prop-name">Energy Capacity</span>
                  <span className="prop-val bold">{selectedItem.properties.energyCapacity} kWh</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tunable Variable */}
        {isVariable && (
          <div className="inspector-section">
            <div className="inspector-section-label">Tunable Parameter Range</div>
            <div className="inspector-props-table">
              <div className="prop-row">
                <span className="prop-name">Variable</span>
                <span className="prop-val mono bold">{selectedItem.name}</span>
              </div>
              <div className="prop-row">
                <span className="prop-name">Title</span>
                <span className="prop-val">{selectedItem.title}</span>
              </div>
              <div className="prop-row">
                <span className="prop-name">Default Value</span>
                <span className="prop-val bold">{selectedItem.defaultVal} {selectedItem.unit}</span>
              </div>
              <div className="prop-row">
                <span className="prop-name">Range</span>
                <span className="prop-val mono">[{selectedItem.minVal} .. {selectedItem.maxVal}]</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
