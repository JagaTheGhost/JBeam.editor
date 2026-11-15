import React, { useState, useEffect, useMemo } from 'react';
import CustomSelect from '../../components/CustomSelect.jsx';
import { getSymmetricNodeId } from '../jbeam/symmetryUtils.js';
import { normalizeBeamType } from '../viewport/visualizers.js';
import { resolveFlexbodyAssociations } from '../jbeam/flexbodyUtils.js';
import { SubdivideIcon, MeshIcon, FocusIcon, EditIcon, CheckIcon, CloseIcon, TagIcon } from '../../components/Icons.jsx';
import { formatBatchNodeName } from '../jbeam/batchRenamer.js';

export function ElementInspector({
  selectedNodeId,
  selectedBeamInfo,
  selectedSurfaceInfo = null,
  jbeamParts,
  onNodeCoordinateChange,
  onRenameNode,
  onJumpToCode,
  liveCoords,
  symmetryEnabled,
  onToggleSymmetry,
  onSubdivideBeam,
  onFlipSurfaceNormal = null,
  visualMeshName = null,
  visualMeshSubnames = [],
  visualMeshSubmeshDetails = {},
  discoveredDaeFiles = [],
  onSelectProjectDae = null,
  onOpenDaeDialog = null,
  onUnloadVisualMesh = null,
  highlightedSubmesh = null,
  onHighlightSubmesh = null,
  onSelectNode = null,
  isolateMatchingMesh = false,
  onToggleIsolateMesh = null,
  batchRenamePattern = '#fl',
  batchRenameIndex = 1,
  onUpdateBatchRenamePattern = null,
  onUpdateBatchRenameIndex = null,
  onResetBatchRenameIndex = null,
  batchRenameActive = false,
  onToggleBatchRename = null,
  onChangeBeamType = null
}) {
  const [localCoords, setLocalCoords] = useState({ x: 0, y: 0, z: 0 });
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  // Deeply resolve bi-directional flexbody and node group associations
  const flexbodyAssociations = useMemo(() => {
    return resolveFlexbodyAssociations(jbeamParts, {
      daeSubmeshNames: visualMeshSubnames,
      submeshDetails: visualMeshSubmeshDetails
    });
  }, [jbeamParts, visualMeshSubnames, visualMeshSubmeshDetails]);

  // Reset rename state when selected node changes
  useEffect(() => {
    setIsEditingName(false);
    setNameInput(selectedNodeId || '');
  }, [selectedNodeId]);

  // Locate selected node in active parts
  let foundNode = null;
  let foundPartName = null;

  if (selectedNodeId && jbeamParts) {
    const partKeys = Object.keys(jbeamParts).filter(k => k !== '__meta');
    for (const pKey of partKeys) {
      const part = jbeamParts[pKey];
      if (part?.nodes && part.nodes[selectedNodeId]) {
        foundNode = part.nodes[selectedNodeId];
        foundPartName = pKey;
        break;
      }
    }
  }

  // Synchronize local coordinate state with selection / live coords
  useEffect(() => {
    if (liveCoords && liveCoords.id === selectedNodeId) {
      setLocalCoords({
        x: Number(liveCoords.pos[0] || 0),
        y: Number(liveCoords.pos[1] || 0),
        z: Number(liveCoords.pos[2] || 0)
      });
    } else if (foundNode) {
      const px = foundNode.posX !== undefined ? foundNode.posX : (foundNode.pos ? foundNode.pos[0] : (foundNode.rx !== undefined ? foundNode.rx : 0));
      const py = foundNode.posY !== undefined ? foundNode.posY : (foundNode.pos ? foundNode.pos[1] : (foundNode.ry !== undefined ? foundNode.ry : 0));
      const pz = foundNode.posZ !== undefined ? foundNode.posZ : (foundNode.pos ? foundNode.pos[2] : (foundNode.rz !== undefined ? foundNode.rz : 0));
      setLocalCoords({ x: Number(px), y: Number(py), z: Number(pz) });
    }
  }, [selectedNodeId, foundNode, liveCoords]);

  const handleCoordInput = (axis, value) => {
    const num = parseFloat(value);
    const updated = { ...localCoords, [axis]: isNaN(num) ? 0 : num };
    setLocalCoords(updated);
    if (onNodeCoordinateChange && selectedNodeId) {
      onNodeCoordinateChange(selectedNodeId, [updated.x, updated.y, updated.z]);
    }
  };

  // 1. BEAM INSPECTOR
  if (selectedBeamInfo && selectedBeamInfo.beam) {
    const { partName, beamKey, beam } = selectedBeamInfo;
    const part = jbeamParts ? jbeamParts[partName] : null;
    let n1 = part?.nodes ? part.nodes[beam['id1:']] : null;
    let n2 = part?.nodes ? part.nodes[beam['id2:']] : null;

    // Cross-part node lookup if not in current part
    if ((!n1 || !n2) && jbeamParts) {
      for (const pKey of Object.keys(jbeamParts).filter(k => k !== '__meta')) {
        const p = jbeamParts[pKey];
        if (p?.nodes) {
          if (!n1 && p.nodes[beam['id1:']]) n1 = p.nodes[beam['id1:']];
          if (!n2 && p.nodes[beam['id2:']]) n2 = p.nodes[beam['id2:']];
        }
      }
    }

    let lengthMeters = null;
    let midPos = null;
    if (n1 && n2) {
      const p1 = [n1.posX ?? n1.pos?.[0] ?? n1.rx ?? 0, n1.posY ?? n1.pos?.[1] ?? n1.ry ?? 0, n1.posZ ?? n1.pos?.[2] ?? n1.rz ?? 0];
      const p2 = [n2.posX ?? n2.pos?.[0] ?? n2.rx ?? 0, n2.posY ?? n2.pos?.[1] ?? n2.ry ?? 0, n2.posZ ?? n2.pos?.[2] ?? n2.rz ?? 0];
      lengthMeters = Math.hypot(p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]);
      midPos = [
        Number(((p1[0] + p2[0]) / 2).toFixed(4)),
        Number(((p1[1] + p2[1]) / 2).toFixed(4)),
        Number(((p1[2] + p2[2]) / 2).toFixed(4))
      ];
    }

    const otherBeamProps = Object.keys(beam).filter(
      k => !['__meta', 'id1:', 'id2:', 'node1', 'node2', '__partName', '__beamKey'].includes(k)
    );

    const normType = normalizeBeamType(beam.beamType || (beamKey?.startsWith('hydro_') ? '|HYDRO' : '|NORMAL'));
    const isSpecialType = normType !== '|NORMAL';
    const typeLabel = normType.startsWith('|') ? normType.slice(1) : normType;

    return (
      <div className="inspector-panel">
        <div className="inspector-header">
          <span className="badge badge-beam">BEAM</span>
          {isSpecialType && (
            <span className={`badge badge-beam-type badge-beam-${typeLabel.toLowerCase()}`}>
              {typeLabel}
            </span>
          )}
          <span className="inspector-title">{beam['id1:']} ↔ {beam['id2:']}</span>
        </div>

        <div className="inspector-section">
          <div className="inspector-section-title">Connection & Geometry</div>
          <div className="prop-row">
            <span className="prop-label">Part</span>
            <span className="prop-value">{partName || 'vehicle'}</span>
          </div>
          <div className="prop-row">
            <span className="prop-label">Node 1</span>
            <span className="prop-value" style={{ color: 'var(--bng-orange-hover, #FF8533)' }}>{beam['id1:']}</span>
          </div>
          <div className="prop-row">
            <span className="prop-label">Node 2</span>
            <span className="prop-value" style={{ color: 'var(--bng-orange-hover, #FF8533)' }}>{beam['id2:']}</span>
          </div>
          <div className="prop-row" style={{ alignItems: 'center' }}>
            <span className="prop-label">Beam Type</span>
            <CustomSelect
              value={normType}
              options={[
                { value: '|NORMAL', label: '|NORMAL (Standard)' },
                { value: '|SUPPORT', label: '|SUPPORT (Anti-Inversion)' },
                { value: '|HYDRO', label: '|HYDRO (Hydraulic)' },
                { value: '|BOUNDED', label: '|BOUNDED (Travel Limit)' },
                { value: '|ANISOTROPIC', label: '|ANISOTROPIC (Directional)' },
                { value: '|PRESSURED', label: '|PRESSURED (Pneumatic)' },
                { value: '|LBEAM', label: '|LBEAM (Longitudinal)' }
              ]}
              onChange={(val) => {
                if (onChangeBeamType) {
                  onChangeBeamType(partName, beam['id1:'], beam['id2:'], val);
                }
              }}
              compact={true}
              searchable={false}
              className="inspector-custom-select"
              title="Change Beam Type"
            />
          </div>
          {lengthMeters !== null && (
            <div className="prop-row">
              <span className="prop-label">Calculated Length</span>
              <span className="prop-value" style={{ color: '#00e676', fontWeight: 600 }}>
                {lengthMeters.toFixed(4)} m
              </span>
            </div>
          )}
        </div>

        {midPos && onSubdivideBeam && (
          <button
            onClick={() => onSubdivideBeam(partName, beam['id1:'], beam['id2:'], midPos)}
            className="btn-primary"
            style={{ width: '100%', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            title="Split this beam into two equal halves by inserting an intermediate node at midpoint"
          >
            <SubdivideIcon size={15} />
            <span>Subdivide Beam (Insert Midpoint Node)</span>
          </button>
        )}

        <div className="inspector-section">
          <div className="inspector-section-title">Physical Properties</div>
          {otherBeamProps.map(k => (
            <div key={k} className="prop-row">
              <span className="prop-label">{k}</span>
              <span className="prop-value">{String(beam[k])}</span>
            </div>
          ))}
        </div>

        {beam.__meta?.range && (
          <button
            onClick={() => onJumpToCode && onJumpToCode(beam.__meta.range[0] + 1)}
            className="btn-secondary"
            style={{ width: '100%', marginTop: 8 }}
          >
            Jump to Beam in Source (Ln {beam.__meta.range[0] + 1})
          </button>
        )}
      </div>
    );
  }

  // Batch Node Renamer Component Block (Only visible when tool is active)
  const renderBatchRenamerSection = () => (
    <div className="inspector-section">
      <div className="inspector-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <TagIcon size={13} />
          Batch Node Renamer
        </span>
        {onToggleBatchRename && (
          <button
            onClick={onToggleBatchRename}
            className="batch-start-toggle-btn active"
            title="Stop sequential batch node renaming (R or Esc)"
          >
            Done
          </button>
        )}
      </div>
      <div className="prop-row">
        <span className="prop-label">Pattern</span>
        <input
          type="text"
          className="inspector-mini-input"
          value={batchRenamePattern}
          onChange={(e) => onUpdateBatchRenamePattern && onUpdateBatchRenamePattern(e.target.value)}
          placeholder="#fl"
          title="Naming pattern with '#' placeholder (e.g. #fl -> 1fl, 2fl)"
        />
      </div>
      <div className="prop-row">
        <span className="prop-label">Node Index</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number"
            min="1"
            className="inspector-mini-input"
            style={{ width: 60 }}
            value={batchRenameIndex}
            onChange={(e) => onUpdateBatchRenameIndex && onUpdateBatchRenameIndex(Math.max(1, parseInt(e.target.value, 10) || 1))}
          />
          {onResetBatchRenameIndex && (
            <button
              onClick={onResetBatchRenameIndex}
              className="inspector-mini-btn"
              title="Reset index to 1"
            >
              Reset
            </button>
          )}
        </div>
      </div>
      <div className="prop-row">
        <span className="prop-label">Next ID</span>
        <span className="prop-value" style={{ fontFamily: 'monospace', fontWeight: 600, color: '#fff' }}>
          {formatBatchNodeName(batchRenamePattern, batchRenameIndex)}
        </span>
      </div>
      <div className="batch-renamer-active-hint">
        Click any node in 3D viewport to rename sequentially.
      </div>
    </div>
  );

  // 2. NODE INSPECTOR
  if (foundNode) {
    const mirrorId = symmetryEnabled ? getSymmetricNodeId(selectedNodeId) : null;
    const otherProps = Object.keys(foundNode).filter(
      k => !['__meta', 'id', 'name', 'posX', 'posY', 'posZ', 'pos'].includes(k)
    );

    const handleStartRename = () => {
      setNameInput(selectedNodeId);
      setIsEditingName(true);
    };

    const handleConfirmRename = () => {
      const trimmed = nameInput.trim();
      if (trimmed && trimmed !== selectedNodeId && onRenameNode) {
        onRenameNode(foundPartName, selectedNodeId, trimmed, { symmetry: symmetryEnabled });
      }
      setIsEditingName(false);
    };

    const handleCancelRename = () => {
      setNameInput(selectedNodeId);
      setIsEditingName(false);
    };

    return (
      <div className="inspector-panel">
        <div className="inspector-header">
          <span className="badge badge-node">NODE</span>
          {isEditingName ? (
            <div className="inspector-rename-box">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmRename();
                  if (e.key === 'Escape') handleCancelRename();
                }}
                className="inspector-rename-input"
                autoFocus
                placeholder="New node ID..."
              />
              <button
                onClick={handleConfirmRename}
                className="rename-action-btn confirm"
                title="Confirm Rename across document (Enter)"
              >
                <CheckIcon size={12} />
              </button>
              <button
                onClick={handleCancelRename}
                className="rename-action-btn cancel"
                title="Cancel (Esc)"
              >
                <CloseIcon size={12} />
              </button>
            </div>
          ) : (
            <div className="inspector-title-row">
              <span className="inspector-title">{selectedNodeId}</span>
              <button
                onClick={handleStartRename}
                className="rename-trigger-btn"
                title="Rename node across entire part & attached beams/surfaces"
              >
                <EditIcon size={13} />
              </button>
            </div>
          )}
        </div>

        <div className="inspector-section">
          <div className="inspector-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Part Assignment</span>
            <button
              onClick={onToggleSymmetry}
              className={`symmetry-toggle-btn ${symmetryEnabled ? 'active' : ''}`}
              title="Toggle automatic left/right node symmetry"
            >
              Symmetry: {symmetryEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="prop-row">
            <span className="prop-label">Part</span>
            <span className="prop-value">{foundPartName}</span>
          </div>
          {mirrorId && (
            <div className="prop-row">
              <span className="prop-label">Mirrored Node</span>
              <span className="prop-value" style={{ color: 'var(--bng-orange-hover, #FF8533)' }}>
                {mirrorId} {symmetryEnabled ? '(Synced)' : '(Inactive)'}
              </span>
            </div>
          )}
        </div>

        <div className="inspector-section">
          <div className="inspector-section-title">Physics Coordinates (meters)</div>
          <div className="coord-grid">
            <div className="coord-field">
              <label style={{ color: '#ff5252' }}>X (Lateral)</label>
              <input
                type="number"
                step="0.005"
                value={localCoords.x}
                onChange={(e) => handleCoordInput('x', e.target.value)}
                className="inspector-input"
              />
            </div>
            <div className="coord-field">
              <label style={{ color: '#69f0ae' }}>Y (Longitudinal)</label>
              <input
                type="number"
                step="0.005"
                value={localCoords.y}
                onChange={(e) => handleCoordInput('y', e.target.value)}
                className="inspector-input"
              />
            </div>
            <div className="coord-field">
              <label style={{ color: '#448aff' }}>Z (Vertical)</label>
              <input
                type="number"
                step="0.005"
                value={localCoords.z}
                onChange={(e) => handleCoordInput('z', e.target.value)}
                className="inspector-input"
              />
            </div>
          </div>
        </div>

        {/* Flexbody Association & 3D Mesh Driver Link */}
        {(() => {
          const nodeGroups = flexbodyAssociations.nodeToGroups[selectedNodeId] || [];
          const drivingFlexbodies = flexbodyAssociations.getFlexbodiesForNode(selectedNodeId);
          return (
            <div className="inspector-section">
              <div className="inspector-section-title">Flexbody Association</div>
              <div className="prop-row">
                <span className="prop-label">Node Group(s)</span>
                <span className="prop-value">
                  {nodeGroups.length > 0 ? (
                    <span className="node-group-badge-list">
                      {nodeGroups.map(g => (
                        <span key={g} className="badge-group-pill">{g}</span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-muted" style={{ fontStyle: 'italic', fontSize: 11 }}>
                      (Ungrouped - not bound to flexbody)
                    </span>
                  )}
                </span>
              </div>
              {drivingFlexbodies.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 5 }}>
                    Deforms Visual 3D Mesh ({drivingFlexbodies.length}):
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {drivingFlexbodies.map(fb => (
                      <button
                        key={fb.meshName}
                        onClick={() => onHighlightSubmesh && onHighlightSubmesh(fb.meshName)}
                        className={`btn-submesh-link ${highlightedSubmesh === fb.meshName ? 'active-highlight' : ''}`}
                        title={`Click to highlight "${fb.meshName}" (${fb.nodeCount} driver nodes) in 3D Viewport`}
                      >
                        <MeshIcon size={11} />
                        <span>{fb.meshName}</span>
                        {fb.isMatchedInDae && <span className="submesh-dae-badge">3D</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {otherProps.length > 0 && (
          <div className="inspector-section">
            <div className="inspector-section-title">Properties</div>
            {otherProps.map(k => (
              <div key={k} className="prop-row">
                <span className="prop-label">{k}</span>
                <span className="prop-value">{String(foundNode[k])}</span>
              </div>
            ))}
          </div>
        )}

        {foundNode.__meta?.range && (
          <button
            onClick={() => onJumpToCode && onJumpToCode(foundNode.__meta.range[0] + 1)}
            className="btn-secondary"
            style={{ width: '100%', marginTop: 8 }}
          >
            Jump to Node in Source (Ln {foundNode.__meta.range[0] + 1})
          </button>
        )}

        {batchRenameActive && renderBatchRenamerSection()}
      </div>
    );
  }

  // 3. SURFACE INSPECTOR (Triangles & Quads)
  if (selectedSurfaceInfo) {
    const isQuad = selectedSurfaceInfo.type === 'quad';
    const nodes = selectedSurfaceInfo.nodes || [selectedSurfaceInfo.id1, selectedSurfaceInfo.id2, selectedSurfaceInfo.id3, selectedSurfaceInfo.id4].filter(Boolean);
    const normal = selectedSurfaceInfo.normal || [0, 1, 0];
    const area = selectedSurfaceInfo.area || 0;

    return (
      <div className="inspector-panel">
        <div className="inspector-header">
          <span className={`badge ${isQuad ? 'badge-quad' : 'badge-triangle'}`}>
            {isQuad ? 'QUAD' : 'TRIANGLE'}
          </span>
          <span className="inspector-title" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            {nodes.join(' - ')}
          </span>
        </div>

        <div className="inspector-section">
          <div className="inspector-section-title">Surface Geometry</div>
          <div className="prop-row">
            <span className="prop-label">Part</span>
            <span className="prop-value">{selectedSurfaceInfo.partName || 'Active Part'}</span>
          </div>
          <div className="prop-row">
            <span className="prop-label">Vertices ({nodes.length})</span>
            <span className="prop-value" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
              [{nodes.join(', ')}]
            </span>
          </div>
          <div className="prop-row">
            <span className="prop-label">Surface Area</span>
            <span className="prop-value">{area.toFixed(4)} m²</span>
          </div>
          <div className="prop-row">
            <span className="prop-label">Normal Vector</span>
            <span className="prop-value" style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
              [{normal.map(n => Number(n).toFixed(3)).join(', ')}]
            </span>
          </div>
        </div>

        <div className="inspector-section">
          <div className="inspector-section-title">Face Orientation & Winding Order</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.4 }}>
            Winding order controls aerodynamic lift/drag and physical collision normals in BeamNG.
          </div>

          <button
            onClick={() => onFlipSurfaceNormal && onFlipSurfaceNormal(selectedSurfaceInfo)}
            className="btn-primary"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 10px' }}
            title="Flip surface normal (reverses vertex winding order)"
          >
            <SubdivideIcon size={13} />
            <span>Flip Normal ({isQuad ? '[1,2,3,4] ↔ [4,3,2,1]' : '[1,2,3] ↔ [3,2,1]'})</span>
          </button>
        </div>

        {selectedSurfaceInfo.range && (
          <button
            onClick={() => onJumpToCode && onJumpToCode(selectedSurfaceInfo.range[0] + 1)}
            className="btn-secondary"
            style={{ width: '100%', marginTop: 8 }}
          >
            Jump to Surface in Source (Ln {selectedSurfaceInfo.range[0] + 1})
          </button>
        )}
      </div>
    );
  }

  // 4. SUMMARY OVERVIEW (When nothing is selected)
  let totalNodes = 0;
  let totalBeams = 0;
  let totalTriangles = 0;
  const partList = [];

  if (jbeamParts) {
    for (const pKey of Object.keys(jbeamParts).filter(k => k !== '__meta')) {
      const p = jbeamParts[pKey];
      if (!p || typeof p !== 'object') continue;
      partList.push(pKey);
      if (p.nodes) totalNodes += Object.keys(p.nodes).filter(k => k !== '__meta').length;
      if (p.beams) totalBeams += Object.keys(p.beams).filter(k => k !== '__meta').length;
      if (p.triangles) totalTriangles += Object.keys(p.triangles).filter(k => k !== '__meta').length;
    }
  }

  const flexbodyList = flexbodyAssociations.flexbodies;

  return (
    <div className="inspector-panel">
      <div className="inspector-header">
        <span className="inspector-title">Structure Summary</span>
      </div>

      <div className="inspector-section">
        <div className="prop-row">
          <span className="prop-label">Active Parts</span>
          <span className="prop-value">{partList.length}</span>
        </div>
        <div className="prop-row">
          <span className="prop-label">Total Nodes</span>
          <span className="prop-value">{totalNodes}</span>
        </div>
        <div className="prop-row">
          <span className="prop-label">Total Beams</span>
          <span className="prop-value">{totalBeams}</span>
        </div>
        <div className="prop-row">
          <span className="prop-label">Total Triangles</span>
          <span className="prop-value">{totalTriangles}</span>
        </div>
      </div>

      {/* Option 3: Visual Mesh Overlay Controls */}
      <div className="inspector-section">
        <div className="inspector-section-title">
          <span>Visual Mesh Overlay (.dae)</span>
          {visualMeshName ? (
            <span className="mesh-active-badge">{visualMeshName}</span>
          ) : (
            <span className="fb-status-pill status-unmatched">None</span>
          )}
        </div>

        {discoveredDaeFiles && discoveredDaeFiles.length > 0 && (
          <div className="mesh-select-row">
            <CustomSelect
              value={
                visualMeshName && (visualMeshName === '__all__' || visualMeshName.startsWith('All Project Models'))
                  ? '__all__'
                  : (visualMeshName ? (discoveredDaeFiles.find(d => d.name === visualMeshName)?.path || '') : '')
              }
              options={[
                { value: '', label: '-- No Overlay --' },
                ...(discoveredDaeFiles.length > 1
                  ? [{ value: '__all__', label: `All Project Models (${discoveredDaeFiles.length} files)` }]
                  : []),
                ...discoveredDaeFiles.map(f => ({ value: f.path, label: f.name, sublabel: f.path })),
                { value: '__browse__', label: '+ Browse other .dae...' }
              ]}
              onChange={(val) => {
                if (val === '__browse__') {
                  onOpenDaeDialog && onOpenDaeDialog();
                } else {
                  onSelectProjectDae && onSelectProjectDae(val);
                }
              }}
              className="inspector-custom-select"
              placeholder="-- No Overlay --"
              title="Select 3D Visual Mesh from project folder"
            />
          </div>
        )}

        <div className="mesh-actions-row">
          <button
            onClick={() => onOpenDaeDialog && onOpenDaeDialog()}
            className="btn-secondary"
            style={{ flex: 1, fontSize: 11 }}
          >
            <MeshIcon size={12} />
            <span>Load .dae Model</span>
          </button>
          {visualMeshName && onUnloadVisualMesh && (
            <button
              onClick={onUnloadVisualMesh}
              className="btn-secondary btn-danger"
              style={{ fontSize: 11 }}
              title="Unload active visual mesh"
            >
              Unload
            </button>
          )}
        </div>

        {visualMeshName && (
          <div style={{ marginTop: 8 }}>
            <button
              onClick={onToggleIsolateMesh}
              className={`btn-secondary ${isolateMatchingMesh ? 'btn-active' : ''}`}
              style={{ width: '100%', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '5px 8px' }}
              title="Filter .dae 3D overlay to show only submeshes matching the active .jbeam file"
            >
              <FocusIcon size={12} />
              <span>{isolateMatchingMesh ? 'Matching Part Meshes (Active)' : 'Show All .dae Meshes'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Flexbody Visual Bindings Table */}
      {flexbodyList.length > 0 && (
        <div className="inspector-section">
          <div className="inspector-section-title">
            <span>Flexbody Bindings ({flexbodyList.length})</span>
          </div>
          <div className="flexbody-list">
            {flexbodyList.map((fb, idx) => {
              const isHighlighted = highlightedSubmesh === fb.meshName;
              const isMatched = fb.isMatchedInDae;
              return (
                <div
                  key={`${fb.meshName}_${idx}`}
                  className={`flexbody-item ${isHighlighted ? 'active' : ''}`}
                  onClick={() => onHighlightSubmesh && onHighlightSubmesh(fb.meshName)}
                  title={`Submesh: "${fb.meshName}" deformed by node groups: [${fb.groups.join(', ') || 'default'}] (${fb.nodeCount} nodes). Click to highlight in 3D.`}
                >
                  <div className="fb-item-header">
                    <span className="fb-mesh-name" title={fb.meshName}>
                      <MeshIcon size={12} style={{ marginRight: 4, verticalAlign: -1, flexShrink: 0 }} />
                      <span className="fb-mesh-name-text">{fb.meshName}</span>
                    </span>
                    <div className="fb-badges-group">
                      {fb.daeStats && (
                        <span
                          className="fb-stat-pill"
                          title={`${fb.daeStats.vertices.toLocaleString()} vertices, ${fb.daeStats.triangles.toLocaleString()} triangles${fb.daeStats.daeFile ? ` (${fb.daeStats.daeFile})` : ''}`}
                        >
                          {fb.daeStats.vertices.toLocaleString()}v / {fb.daeStats.triangles.toLocaleString()}t
                        </span>
                      )}
                      <span
                        className={`fb-status-pill ${isMatched ? 'status-matched' : 'status-unmatched'}`}
                        title={isMatched ? (fb.daeStats?.daeFile ? `Submesh found in ${fb.daeStats.daeFile}` : 'Submesh found in loaded 3D visual mesh') : (visualMeshName ? 'Submesh missing from active .dae' : 'JBeam')}
                      >
                        {isMatched ? 'Bound in 3D' : (visualMeshName ? 'Not in .dae' : 'JBeam')}
                      </span>
                    </div>
                  </div>
                  <div className="fb-item-details">
                    <span className="fb-groups-text" title={`Groups: [${fb.groups.join(', ') || 'all'}]`}>
                      Groups: [{fb.groups.join(', ') || 'all'}]
                    </span>
                    <div className="fb-actions-group">
                      {fb.nodeCount > 0 ? (
                        <span className="fb-node-count-badge">
                          {fb.nodeCount} node{fb.nodeCount === 1 ? '' : 's'}
                        </span>
                      ) : (
                        <span className="fb-node-count-badge badge-warning" title="No nodes have this group in this vehicle. The mesh will not deform.">
                          0 nodes (unbound)
                        </span>
                      )}
                      {fb.range && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onJumpToCode && onJumpToCode(fb.range[0] + 1);
                          }}
                          className="jump-link"
                          title="Jump to flexbody row in source code"
                        >
                          Ln {fb.range[0] + 1}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Bound Nodes Interactive Chip List when highlighted */}
                  {isHighlighted && fb.boundNodeIds.length > 0 && (
                    <div className="fb-bound-nodes-container" onClick={(e) => e.stopPropagation()}>
                      <div className="fb-bound-nodes-label">
                        <span>Driver Nodes ({fb.boundNodeIds.length}):</span>
                      </div>
                      <div className="fb-bound-nodes-chips">
                        {fb.boundNodeIds.slice(0, 36).map(nid => (
                          <button
                            key={nid}
                            onClick={() => onSelectNode && onSelectNode(nid)}
                            className="fb-node-chip"
                            title={`Select node "${nid}"`}
                          >
                            {nid}
                          </button>
                        ))}
                        {fb.boundNodeIds.length > 36 && (
                          <span className="fb-node-chip-more">+{fb.boundNodeIds.length - 36} more</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {batchRenameActive && renderBatchRenamerSection()}

      <div className="inspector-hint">
        Click any node or beam in the 3D Viewport or Structure Explorer to inspect properties, calculate physical lengths, and manipulate coordinates.
      </div>
    </div>
  );
}

export default ElementInspector;
