/**
 * JBeam Studio - Mechanical Component Inspector
 * Displays parameter specifications, bound 3D nodes, matching DAE submeshes,
 * and quick-navigation actions for selected mechanical components.
 */

import React from 'react';
import {
  FocusIcon,
  CodeIcon,
  CubeIcon,
  EngineIcon,
  GearboxIcon,
  DifferentialIcon,
  ShaftIcon,
  LayersIcon,
  CloseIcon
} from '../../components/Icons.jsx';

export function MechanicalInspector({
  selectedCategory, // 'device' | 'hydro' | 'mount' | 'energy'
  selectedItem, // Device object or hydro/mount object
  panelHeight = 260,
  onFocus3D,
  onJumpToCode,
  onIsolateMesh,
  onDeselect
}) {
  if (!selectedItem) {
    return (
      <div className="mechanical-inspector-empty">
        <div className="inspector-empty-icon">
          <EngineIcon size={24} />
        </div>
        <div className="inspector-empty-title">No Mechanical Part Selected</div>
        <div className="inspector-empty-desc">
          Click on any powertrain device, steering hydro, or engine mount from the tree or in the 3D viewport to inspect its specs.
        </div>
      </div>
    );
  }

  const isDevice = selectedCategory === 'device';
  const isHydro = selectedCategory === 'hydro';
  const isMount = selectedCategory === 'mount';
  const isEnergy = selectedCategory === 'energy';

  const title = isDevice
    ? selectedItem.name
    : isHydro
    ? selectedItem.beamName || `Hydro ${selectedItem.id1} → ${selectedItem.id2}`
    : isMount
    ? selectedItem.breakGroup || selectedItem.engineGroup || `Mount ${selectedItem.id1} ↔ ${selectedItem.id2}`
    : selectedItem.name;

  const subtitle = isDevice
    ? `${selectedItem.type} (${selectedItem.category})`
    : isHydro
    ? 'Steering / Hydraulic Actuator'
    : isMount
    ? 'Engine / Transmission Mount Beam'
    : selectedItem.type;

  return (
    <div className="mechanical-inspector-panel" style={panelHeight ? { height: panelHeight } : undefined}>
      {/* Header */}
      <div className="inspector-header-row">
        <div className="inspector-title-group">
          <span className="inspector-title">{title}</span>
          <span className="inspector-subtitle">{subtitle}</span>
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
              <div className="prop-row">
                <span className="prop-name">Input Index</span>
                <span className="prop-val">{selectedItem.inputIndex || 1}</span>
              </div>
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

        {/* Hydro Specifics */}
        {isHydro && (
          <div className="inspector-section">
            <div className="inspector-section-label">Hydraulic Parameters</div>
            <div className="inspector-props-table">
              <div className="prop-row">
                <span className="prop-name">Nodes</span>
                <span className="prop-val mono">{selectedItem.id1} ↔ {selectedItem.id2}</span>
              </div>
              <div className="prop-row">
                <span className="prop-name">Steering Factor</span>
                <span className="prop-val bold">{selectedItem.factor}</span>
              </div>
              <div className="prop-row">
                <span className="prop-name">In Rate</span>
                <span className="prop-val">{selectedItem.inRate} m/s</span>
              </div>
              <div className="prop-row">
                <span className="prop-name">Out Rate</span>
                <span className="prop-val">{selectedItem.outRate} m/s</span>
              </div>
              {selectedItem.partName && (
                <div className="prop-row">
                  <span className="prop-name">Part Source</span>
                  <span className="prop-val mono highlight">{selectedItem.partName}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Mount Specifics */}
        {isMount && (
          <div className="inspector-section">
            <div className="inspector-section-label">Mount Elasticity & Limits</div>
            <div className="inspector-props-table">
              <div className="prop-row">
                <span className="prop-name">Anchor Nodes</span>
                <span className="prop-val mono">{selectedItem.id1} ↔ {selectedItem.id2}</span>
              </div>
              {selectedItem.breakGroup && (
                <div className="prop-row">
                  <span className="prop-name">Break Group</span>
                  <span className="prop-val mono bold">{selectedItem.breakGroup}</span>
                </div>
              )}
              {selectedItem.engineGroup && (
                <div className="prop-row">
                  <span className="prop-name">Engine Group</span>
                  <span className="prop-val mono">{selectedItem.engineGroup}</span>
                </div>
              )}
              {selectedItem.beamSpring && (
                <div className="prop-row">
                  <span className="prop-name">Spring (N/m)</span>
                  <span className="prop-val">{selectedItem.beamSpring.toLocaleString()}</span>
                </div>
              )}
              {selectedItem.beamStrength && (
                <div className="prop-row">
                  <span className="prop-name">Breaking Limit</span>
                  <span className="prop-val">{selectedItem.beamStrength.toLocaleString()} N</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
