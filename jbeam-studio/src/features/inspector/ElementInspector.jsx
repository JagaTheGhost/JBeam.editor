import React, { useState, useEffect, useMemo } from 'react';
import CustomSelect from '../../components/CustomSelect.jsx';
import NumberStepper from '../../components/NumberStepper.jsx';
import { getSymmetricNodeId } from '../jbeam/symmetryUtils.js';
import { normalizeBeamType } from '../viewport/visualizers.js';
import { resolveFlexbodyAssociations } from '../jbeam/flexbodyUtils.js';
import { normalizeGroupList, getCrashGroupColor } from '../jbeam/crashZonesParser.js';
import { SubdivideIcon, MeshIcon, FocusIcon, EditIcon, CheckIcon, CloseIcon, TagIcon, WarningIcon } from '../../components/Icons.jsx';
import { formatBatchNodeName } from '../jbeam/batchRenamer.js';
import { BEAM_PRESETS, formatNtoMetric } from './inspectorUtils.js';

function getInputTypeForProp(val) {
  if (typeof val === 'string' && (val.includes('$') || val.includes('=') || isNaN(Number(val)))) {
    return 'text';
  }
  return 'number';
}

export function ElementInspector({
  selectedNodeId,
  selectedBeamInfo,
  selectedSurfaceInfo = null,
  selectedWheelInfo = null,
  selectedTorsionBarInfo = null,
  selectedSlideNodeInfo = null,
  multiSelectedNodes = [],
  onMultiSelectChange = null,
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
  onSelectBeam = null,
  onUpdateBeamProperties = null,
  onUpdateNodeProperties = null,
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

  // Local state for interactive beam physical properties
  const [beamPropsInput, setBeamPropsInput] = useState({
    beamSpring: '',
    beamDamp: '',
    beamDeform: '',
    beamStrength: '',
    beamPrecompression: ''
  });

  // Local state for interactive node physical properties
  const [nodePropsInput, setNodePropsInput] = useState({
    nodeWeight: '',
    frictionCoef: ''
  });

  // Local state for interactive beam subdivision tool
  const [subdivideCuts, setSubdivideCuts] = useState(1);
  const [customSubdivideNodeName, setCustomSubdivideNodeName] = useState('');

  // Reset subdivide state when selected beam changes
  useEffect(() => {
    setSubdivideCuts(1);
    setCustomSubdivideNodeName('');
  }, [selectedBeamInfo?.beamKey, selectedBeamInfo?.id1, selectedBeamInfo?.id2]);

  // Determine the effective single node being inspected
  const effectiveNodeId = selectedNodeId || (Array.isArray(multiSelectedNodes) && multiSelectedNodes.length === 1 ? multiSelectedNodes[0] : null);

  // Deeply resolve bi-directional flexbody and node group associations
  const flexbodyAssociations = useMemo(() => {
    return resolveFlexbodyAssociations(jbeamParts, {
      daeSubmeshNames: visualMeshSubnames,
      submeshDetails: visualMeshSubmeshDetails
    });
  }, [jbeamParts, visualMeshSubnames, visualMeshSubmeshDetails]);

  // Calculate connected beams for the selected node
  const connectedBeams = useMemo(() => {
    if (!effectiveNodeId || !jbeamParts) return [];
    const list = [];
    const seen = new Set();
    const partKeys = Object.keys(jbeamParts).filter(k => k !== '__meta');
    for (const pKey of partKeys) {
      const part = jbeamParts[pKey];
      if (part?.beams) {
        for (const [bk, b] of Object.entries(part.beams)) {
          if (bk === '__meta' || !b) continue;
          const id1 = b['id1:'] || b[0];
          const id2 = b['id2:'] || b[1];
          if (id1 === effectiveNodeId || id2 === effectiveNodeId) {
            const otherId = id1 === effectiveNodeId ? id2 : id1;
            const pairKey = `${id1}__${id2}`;
            if (!seen.has(pairKey)) {
              seen.add(pairKey);
              list.push({
                partName: pKey,
                beamKey: bk,
                beam: b,
                otherNodeId: otherId,
                beamType: b.beamType || (bk.startsWith('hydro_') ? '|HYDRO' : '|NORMAL')
              });
            }
          }
        }
      }
    }
    return list;
  }, [effectiveNodeId, jbeamParts]);

  // Reset rename state when selected node changes
  useEffect(() => {
    setIsEditingName(false);
    setNameInput(effectiveNodeId || '');
  }, [effectiveNodeId]);

  // Locate selected node in active parts (robust against prefixing and cross-component namespaces)
  let foundNode = null;
  let foundPartName = null;

  if (effectiveNodeId && jbeamParts) {
    const partKeys = Object.keys(jbeamParts).filter(k => k !== '__meta');
    for (const pKey of partKeys) {
      const part = jbeamParts[pKey];
      if (part?.nodes) {
        if (part.nodes[effectiveNodeId]) {
          foundNode = part.nodes[effectiveNodeId];
          foundPartName = pKey;
          break;
        }
        if (part.nodes[`${pKey}_${effectiveNodeId}`]) {
          foundNode = part.nodes[`${pKey}_${effectiveNodeId}`];
          foundPartName = pKey;
          break;
        }
        for (const [nk, nd] of Object.entries(part.nodes)) {
          if (nk === '__meta') continue;
          if (nk === effectiveNodeId ||
              nd?.id === effectiveNodeId ||
              nd?.name === effectiveNodeId ||
              `${pKey}_${nk}` === effectiveNodeId ||
              nk === effectiveNodeId.replace(`${pKey}_`, '')) {
            foundNode = nd;
            foundPartName = pKey;
            break;
          }
        }
        if (foundNode) break;
      }
    }
  }

  // Fallback: if effectiveNodeId exists, never drop down to Structure Summary while a node is selected!
  if (!foundNode && effectiveNodeId) {
    foundNode = {
      id: effectiveNodeId,
      name: effectiveNodeId,
      posX: localCoords.x,
      posY: localCoords.y,
      posZ: localCoords.z,
      pos: [localCoords.x, localCoords.y, localCoords.z]
    };
    foundPartName = jbeamParts ? Object.keys(jbeamParts).filter(k => k !== '__meta')[0] : 'main';
  }

  // Synchronize local coordinate state with selection / live coords
  useEffect(() => {
    if (liveCoords && liveCoords.id === effectiveNodeId) {
      const lx = Number(liveCoords.pos[0] || 0);
      const ly = Number(liveCoords.pos[1] || 0);
      const lz = Number(liveCoords.pos[2] || 0);
      setLocalCoords(prev => {
        if (prev.x === lx && prev.y === ly && prev.z === lz) return prev;
        return { x: lx, y: ly, z: lz };
      });
    } else if (foundNode) {
      const rawX = foundNode.posX !== undefined ? foundNode.posX : (foundNode.pos ? foundNode.pos[0] : (foundNode.rx !== undefined ? foundNode.rx : 0));
      const rawY = foundNode.posY !== undefined ? foundNode.posY : (foundNode.pos ? foundNode.pos[1] : (foundNode.ry !== undefined ? foundNode.ry : 0));
      const rawZ = foundNode.posZ !== undefined ? foundNode.posZ : (foundNode.pos ? foundNode.pos[2] : (foundNode.rz !== undefined ? foundNode.rz : 0));
      const px = Number(rawX || 0);
      const py = Number(rawY || 0);
      const pz = Number(rawZ || 0);
      setLocalCoords(prev => {
        if (prev.x === px && prev.y === py && prev.z === pz) return prev;
        return { x: px, y: py, z: pz };
      });
    }
  }, [
    effectiveNodeId,
    foundNode?.id,
    foundNode?.posX,
    foundNode?.posY,
    foundNode?.posZ,
    foundNode?.pos?.[0],
    foundNode?.pos?.[1],
    foundNode?.pos?.[2],
    liveCoords?.id,
    liveCoords?.pos?.[0],
    liveCoords?.pos?.[1],
    liveCoords?.pos?.[2]
  ]);

  const handleCoordInput = (axis, value) => {
    const num = parseFloat(value);
    const updated = { ...localCoords, [axis]: isNaN(num) ? 0 : num };
    setLocalCoords(updated);
    if (onNodeCoordinateChange && effectiveNodeId) {
      onNodeCoordinateChange(effectiveNodeId, [updated.x, updated.y, updated.z]);
    }
  };

  // 1. BEAM INSPECTOR
  let inspectedBeam = selectedBeamInfo?.beam;
  let inspectedPartName = selectedBeamInfo?.partName;
  let inspectedBeamKey = selectedBeamInfo?.beamKey;

  if (selectedBeamInfo && jbeamParts) {
    const targetId1 = selectedBeamInfo.id1 || selectedBeamInfo.beam?.['id1:'];
    const targetId2 = selectedBeamInfo.id2 || selectedBeamInfo.beam?.['id2:'];

    if (!inspectedBeam || Object.keys(inspectedBeam).length <= 4) {
      for (const pKey of Object.keys(jbeamParts).filter(k => k !== '__meta')) {
        const part = jbeamParts[pKey];
        if (part?.beams) {
          if (inspectedBeamKey && part.beams[inspectedBeamKey]) {
            inspectedBeam = part.beams[inspectedBeamKey];
            inspectedPartName = pKey;
            break;
          }
          if (targetId1 && targetId2) {
            for (const [bk, b] of Object.entries(part.beams)) {
              if (bk === '__meta') continue;
              if ((b['id1:'] === targetId1 && b['id2:'] === targetId2) || (b['id1:'] === targetId2 && b['id2:'] === targetId1)) {
                inspectedBeam = b;
                inspectedBeamKey = bk;
                inspectedPartName = pKey;
                break;
              }
            }
            if (inspectedBeam) break;
          }
        }
      }
    }
  }

  // Fallback to selectedBeamInfo if not resolved in jbeamParts, guarding against orphaned cross-tab ghost beams
  if ((!inspectedBeam || !inspectedBeam['id1:']) && selectedBeamInfo) {
    const partKeys = jbeamParts ? Object.keys(jbeamParts).filter(k => k !== '__meta') : [];
    const belongsToCurrentParts = partKeys.length === 0 ||
      (selectedBeamInfo.partName && jbeamParts[selectedBeamInfo.partName]) ||
      (selectedBeamInfo.id1 && Object.values(jbeamParts).some(p => p.nodes && (p.nodes[selectedBeamInfo.id1] || p.nodes[`${p.__partName || ''}_${selectedBeamInfo.id1}`]))) ||
      (selectedBeamInfo.id2 && Object.values(jbeamParts).some(p => p.nodes && (p.nodes[selectedBeamInfo.id2] || p.nodes[`${p.__partName || ''}_${selectedBeamInfo.id2}`])));

    if (belongsToCurrentParts) {
      inspectedBeam = selectedBeamInfo.beam || {
        'id1:': selectedBeamInfo.id1,
        'id2:': selectedBeamInfo.id2,
        beamType: selectedBeamInfo.beamType || '|NORMAL',
        partName: inspectedPartName
      };
    } else {
      inspectedBeam = null;
    }
  }

  // Synchronize local beam & node properties with selection
  useEffect(() => {
    if (inspectedBeam) {
      const bs = inspectedBeam.beamSpring !== undefined ? String(inspectedBeam.beamSpring) : '';
      const bd = inspectedBeam.beamDamp !== undefined ? String(inspectedBeam.beamDamp) : '';
      const bdef = inspectedBeam.beamDeform !== undefined ? String(inspectedBeam.beamDeform) : '';
      const bstr = inspectedBeam.beamStrength !== undefined ? String(inspectedBeam.beamStrength) : '';
      const bpre = inspectedBeam.beamPrecompression !== undefined ? String(inspectedBeam.beamPrecompression) : '1';
      setBeamPropsInput(prev => {
        if (
          prev.beamSpring === bs &&
          prev.beamDamp === bd &&
          prev.beamDeform === bdef &&
          prev.beamStrength === bstr &&
          prev.beamPrecompression === bpre
        ) {
          return prev;
        }
        return {
          beamSpring: bs,
          beamDamp: bd,
          beamDeform: bdef,
          beamStrength: bstr,
          beamPrecompression: bpre
        };
      });
    }
  }, [
    inspectedBeam?.['id1:'],
    inspectedBeam?.['id2:'],
    inspectedBeam?.beamSpring,
    inspectedBeam?.beamDamp,
    inspectedBeam?.beamDeform,
    inspectedBeam?.beamStrength,
    inspectedBeam?.beamPrecompression
  ]);

  useEffect(() => {
    if (foundNode) {
      const nw = foundNode.nodeWeight !== undefined ? String(foundNode.nodeWeight) : '';
      const fc = foundNode.frictionCoef !== undefined ? String(foundNode.frictionCoef) : '';
      setNodePropsInput(prev => {
        if (prev.nodeWeight === nw && prev.frictionCoef === fc) return prev;
        return { nodeWeight: nw, frictionCoef: fc };
      });
    }
  }, [effectiveNodeId, foundNode?.id, foundNode?.nodeWeight, foundNode?.frictionCoef]);

  // 0. WHEEL INSPECTOR (When a PressureWheel is selected)
  if (selectedWheelInfo) {
    const wheel = selectedWheelInfo.wheelDef || selectedWheelInfo;
    const stats = selectedWheelInfo.stats || {};
    const radiusInch = wheel.radius ? (wheel.radius / 0.0254).toFixed(1) : '—';
    const hubInch = wheel.hubRadius ? ((wheel.hubRadius * 2) / 0.0254).toFixed(1) : '—';
    const widthMm = wheel.tireWidth ? Math.round(wheel.tireWidth * 1000) : '—';

    return (
      <div className="inspector-panel">
        <div className="inspector-header">
          <span className="badge" style={{ backgroundColor: 'var(--bng-orange, #0099FF)', color: '#fff' }}>
            PRESSURE WHEEL
          </span>
          <div className="inspector-title-row">
            <span className="inspector-title">Wheel [{wheel.name}]</span>
          </div>
        </div>

        <div className="inspector-section">
          <div className="inspector-section-title">Identity & Axle Spindle</div>
          <div className="prop-row">
            <span className="prop-label">Wheel Name</span>
            <span className="prop-value" style={{ fontWeight: 600, color: 'var(--bng-orange-hover, #33ADFF)' }}>
              {wheel.name} ({wheel.side === 'left' ? 'Left Side' : 'Right Side'})
            </span>
          </div>
          <div className="prop-row">
            <span className="prop-label">Spindle Axis</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {wheel.node1 && (
                <button
                  type="button"
                  className="inspector-node-chip"
                  onClick={() => onSelectNode && onSelectNode(wheel.node1)}
                  title={`Select Inner Spindle Node "${wheel.node1}"`}
                >
                  {wheel.node1} ↗
                </button>
              )}
              {wheel.node2 && (
                <button
                  type="button"
                  className="inspector-node-chip"
                  onClick={() => onSelectNode && onSelectNode(wheel.node2)}
                  title={`Select Outer Spindle Node "${wheel.node2}"`}
                >
                  {wheel.node2} ↗
                </button>
              )}
            </div>
          </div>
          {wheel.nodeArm && (
            <div className="prop-row">
              <span className="prop-label">Torque / Brake Arm</span>
              <button
                type="button"
                className="inspector-node-chip"
                onClick={() => onSelectNode && onSelectNode(wheel.nodeArm)}
                title={`Select Torque Arm Node "${wheel.nodeArm}"`}
              >
                {wheel.nodeArm} ↗
              </button>
            </div>
          )}
          <div className="prop-row">
            <span className="prop-label">Part Origin</span>
            <span className="prop-value">{wheel.partName || 'Active Part'}</span>
          </div>
        </div>

        <div className="inspector-section">
          <div className="inspector-section-title">Physical Tire & Rim Dimensions</div>
          <div className="prop-row">
            <span className="prop-label">Tire Outer Radius</span>
            <span className="prop-value">{wheel.radius} m ({radiusInch}" overall)</span>
          </div>
          <div className="prop-row">
            <span className="prop-label">Rim Diameter</span>
            <span className="prop-value">{hubInch}" rim ({wheel.hubRadius} m radius)</span>
          </div>
          <div className="prop-row">
            <span className="prop-label">Tire Section Width</span>
            <span className="prop-value">{widthMm} mm ({wheel.tireWidth} m)</span>
          </div>
          <div className="prop-row">
            <span className="prop-label">Circumferential Rays</span>
            <span className="prop-value" style={{ color: '#00e5ff', fontWeight: 600 }}>{wheel.numRays} rays</span>
          </div>
          <div className="prop-row">
            <span className="prop-label">Inflation Pressure</span>
            <span className="prop-value" style={{ color: '#38bdf8', fontWeight: 600 }}>
              {wheel.pressurePSI} PSI
            </span>
          </div>
          {wheel.wheelOffset !== undefined && wheel.wheelOffset !== 0 && (
            <div className="prop-row">
              <span className="prop-label">Axle Offset</span>
              <span className="prop-value">{wheel.wheelOffset} m</span>
            </div>
          )}
        </div>

        <div className="inspector-section">
          <div className="inspector-section-title">Braking & Dynamics</div>
          <div className="prop-row">
            <span className="prop-label">Brake Torque</span>
            <span className="prop-value">{wheel.brakeTorque || 0} N·m</span>
          </div>
          <div className="prop-row">
            <span className="prop-label">Parking Torque</span>
            <span className="prop-value">{wheel.parkingTorque || 0} N·m</span>
          </div>
          {stats.nodeCount && (
            <div className="prop-row">
              <span className="prop-label">Generated Mesh</span>
              <span className="prop-value">
                {stats.nodeCount} nodes · {stats.beamCount} beams · {stats.surfaceCount} faces
              </span>
            </div>
          )}
        </div>

        {wheel.range && (
          <button
            onClick={() => onJumpToCode && onJumpToCode(wheel.range[0] + 1, {
              partName: wheel.partName,
              filePath: wheel.filePath || jbeamParts?.[wheel.partName]?.__filePath,
              type: 'wheel'
            })}
            className="btn-primary"
            style={{ width: '100%', marginTop: 8 }}
          >
            Jump to Wheel in Source (Ln {wheel.range[0] + 1})
          </button>
        )}
      </div>
    );
  }

  // 0b. TORSION BAR INSPECTOR
  if (selectedTorsionBarInfo) {
    const tb = selectedTorsionBarInfo.torsionBar || selectedTorsionBarInfo;
    const springKn = tb.spring ? (tb.spring / 1000).toFixed(1) : 0;

    return (
      <div className="inspector-panel">
        <div className="inspector-header">
          <span className="badge" style={{ backgroundColor: '#00e676', color: '#000', fontWeight: 700 }}>
            TORSION BAR / SWAYBAR
          </span>
          <div className="inspector-title-row">
            <span className="inspector-title">{tb.name || 'Torsion Bar'}</span>
          </div>
        </div>

        <div className="inspector-section">
          <div className="inspector-section-title">Nodes & Topology</div>
          <div className="prop-row">
            <span className="prop-label">Arm 1 Tip (id1:)</span>
            <button
              type="button"
              className="inspector-node-chip"
              onClick={() => onSelectNode && onSelectNode(tb.id1)}
              title={`Select Arm Node "${tb.id1}"`}
            >
              {tb.id1} ↗
            </button>
          </div>
          <div className="prop-row">
            <span className="prop-label">Pivot 1 (id2:)</span>
            <button
              type="button"
              className="inspector-node-chip"
              onClick={() => onSelectNode && onSelectNode(tb.id2)}
              title={`Select Pivot Node "${tb.id2}"`}
            >
              {tb.id2} ↗
            </button>
          </div>
          <div className="prop-row">
            <span className="prop-label">Pivot 2 (id3:)</span>
            <button
              type="button"
              className="inspector-node-chip"
              onClick={() => onSelectNode && onSelectNode(tb.id3)}
              title={`Select Pivot Node "${tb.id3}"`}
            >
              {tb.id3} ↗
            </button>
          </div>
          <div className="prop-row">
            <span className="prop-label">Arm 2 Tip (id4:)</span>
            <button
              type="button"
              className="inspector-node-chip"
              onClick={() => onSelectNode && onSelectNode(tb.id4)}
              title={`Select Arm Node "${tb.id4}"`}
            >
              {tb.id4} ↗
            </button>
          </div>
          <div className="prop-row">
            <span className="prop-label">Part Origin</span>
            <span className="prop-value">{tb.partOrigin || 'Active Part'}</span>
          </div>
        </div>

        <div className="inspector-section">
          <div className="inspector-section-title">Torsional Elasticity & Limits</div>
          <div className="prop-row">
            <span className="prop-label">Spring Stiffness</span>
            <span className="prop-value" style={{ color: '#00e676', fontWeight: 600 }}>
              {tb.spring?.toLocaleString()} N/m ({springKn} kN/m)
            </span>
          </div>
          <div className="prop-row">
            <span className="prop-label">Damping</span>
            <span className="prop-value">{tb.damp || 0} N·s/m</span>
          </div>
          <div className="prop-row">
            <span className="prop-label">Deformation Threshold</span>
            <span className="prop-value">{tb.deform}</span>
          </div>
          <div className="prop-row">
            <span className="prop-label">Yield Strength</span>
            <span className="prop-value">{tb.strength}</span>
          </div>
          {tb.breakGroup && (
            <div className="prop-row">
              <span className="prop-label">Break Group</span>
              <span className="prop-value" style={{ color: '#f59e0b', fontWeight: 600 }}>{tb.breakGroup}</span>
            </div>
          )}
        </div>

        {tb.lineRange && (
          <button
            onClick={() => onJumpToCode && onJumpToCode(tb.lineRange[0] + 1, {
              partName: tb.partOrigin,
              filePath: jbeamParts?.[tb.partOrigin]?.__filePath,
              type: 'torsionbar'
            })}
            className="btn-primary"
            style={{ width: '100%', marginTop: 8 }}
          >
            Jump to Torsion Bar in Source (Ln {tb.lineRange[0] + 1})
          </button>
        )}
      </div>
    );
  }

  // 0c. SLIDENODE & RAIL INSPECTOR
  if (selectedSlideNodeInfo) {
    const sn = selectedSlideNodeInfo.slideNode || selectedSlideNodeInfo;
    const rail = selectedSlideNodeInfo.rail;

    return (
      <div className="inspector-panel">
        <div className="inspector-header">
          <span className="badge" style={{ backgroundColor: '#00e5ff', color: '#000', fontWeight: 700 }}>
            SLIDENODE / RAIL
          </span>
          <div className="inspector-title-row">
            <span className="inspector-title">Node [{sn.id}] on Rail [{sn.railName}]</span>
          </div>
        </div>

        <div className="inspector-section">
          <div className="inspector-section-title">Slide Node Details</div>
          <div className="prop-row">
            <span className="prop-label">Sliding Node ID</span>
            <button
              type="button"
              className="inspector-node-chip"
              onClick={() => onSelectNode && onSelectNode(sn.id)}
              title={`Select Sliding Node "${sn.id}"`}
            >
              {sn.id} ↗
            </button>
          </div>
          <div className="prop-row">
            <span className="prop-label">Assigned Rail</span>
            <span className="prop-value" style={{ color: '#00e5ff', fontWeight: 600 }}>{sn.railName}</span>
          </div>
          {rail && rail.links && (
            <div className="prop-row">
              <span className="prop-label">Rail Path Nodes</span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {rail.links.map(nid => (
                  <button
                    key={nid}
                    type="button"
                    className="inspector-node-chip"
                    onClick={() => onSelectNode && onSelectNode(nid)}
                    title={`Select Rail Link Node "${nid}"`}
                  >
                    {nid} ↗
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="prop-row">
            <span className="prop-label">Attached to Rail</span>
            <span className="prop-value">{sn.attached ? 'Yes (Constrained)' : 'No'}</span>
          </div>
          <div className="prop-row">
            <span className="prop-label">Tolerance</span>
            <span className="prop-value">{sn.tolerance || 0} m</span>
          </div>
          <div className="prop-row">
            <span className="prop-label">Spring Stiffness</span>
            <span className="prop-value">{typeof sn.spring === 'number' ? sn.spring.toLocaleString() : sn.spring} N/m</span>
          </div>
          <div className="prop-row">
            <span className="prop-label">Strength</span>
            <span className="prop-value">{sn.strength}</span>
          </div>
        </div>

        {sn.lineRange && (
          <button
            onClick={() => onJumpToCode && onJumpToCode(sn.lineRange[0] + 1, {
              partName: sn.partOrigin,
              filePath: jbeamParts?.[sn.partOrigin]?.__filePath,
              type: 'slidenode'
            })}
            className="btn-primary"
            style={{ width: '100%', marginTop: 8 }}
          >
            Jump to SlideNode in Source (Ln {sn.lineRange[0] + 1})
          </button>
        )}
      </div>
    );
  }

  if (inspectedBeam && inspectedBeam['id1:'] && inspectedBeam['id2:']) {
    const beam = inspectedBeam;
    const partName = inspectedPartName || beam.__partName;
    const beamKey = inspectedBeamKey || beam.__beamKey;
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

    const coreBeamPropKeys = ['beamSpring', 'beamDamp', 'beamDeform', 'beamStrength', 'beamPrecompression', 'beamType'];
    const crashPropKeys = ['breakGroup', 'breakGroup:', 'deformGroup', 'deformGroup:'];
    const breakGroups = normalizeGroupList(beam.breakGroup || beam['breakGroup:']);
    const deformGroups = normalizeGroupList(beam.deformGroup || beam['deformGroup:']);
    const otherBeamProps = Object.keys(beam).filter(
      k => !['__meta', 'id1:', 'id2:', 'node1', 'node2', '__partName', '__beamKey', ...coreBeamPropKeys, ...crashPropKeys].includes(k)
    );

    const normType = normalizeBeamType(beam.beamType || (beamKey?.startsWith('hydro_') ? '|HYDRO' : '|NORMAL'));
    const isSpecialType = normType !== '|NORMAL';
    const typeLabel = normType.startsWith('|') ? normType.slice(1) : normType;

    // Physics sanity check (beamDeform > beamStrength)
    const numDeform = Number(beamPropsInput.beamDeform || beam.beamDeform);
    const rawStrength = beamPropsInput.beamStrength !== '' ? beamPropsInput.beamStrength : beam.beamStrength;
    const numStrength = rawStrength === 'FLT_MAX' ? Infinity : Number(rawStrength);
    const isDeformHigherThanStrength = !isNaN(numDeform) && numDeform > 0 && !isNaN(numStrength) && isFinite(numStrength) && numDeform > numStrength;

    const isFLTMax = rawStrength === 'FLT_MAX' || rawStrength === '"FLT_MAX"';

    const commitBeamProp = (propKey, rawVal) => {
      if (!onUpdateBeamProperties || !inspectedBeam) return;
      let parsed = rawVal;
      if (propKey === 'beamStrength') {
        if (rawVal === 'FLT_MAX' || rawVal === '"FLT_MAX"') {
          parsed = 'FLT_MAX';
        } else {
          const num = Number(rawVal);
          parsed = isNaN(num) ? rawVal : num;
        }
      } else if (['beamSpring', 'beamDamp', 'beamDeform', 'beamPrecompression'].includes(propKey)) {
        const num = Number(rawVal);
        parsed = isNaN(num) ? rawVal : num;
      }
      onUpdateBeamProperties(partName, beam['id1:'], beam['id2:'], { [propKey]: parsed });
    };

    const handleToggleFLTMax = () => {
      if (isFLTMax) {
        const newStrength = (!isNaN(numDeform) && numDeform > 0) ? Math.max(100000, numDeform * 3) : 250000;
        setBeamPropsInput(prev => ({ ...prev, beamStrength: String(newStrength) }));
        commitBeamProp('beamStrength', newStrength);
      } else {
        setBeamPropsInput(prev => ({ ...prev, beamStrength: 'FLT_MAX' }));
        commitBeamProp('beamStrength', 'FLT_MAX');
      }
    };

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
            <button
              type="button"
              className="inspector-node-chip"
              onClick={() => onSelectNode && onSelectNode(beam['id1:'])}
              title={`Select Node "${beam['id1:']}" in 3D Viewport & Inspector`}
            >
              {beam['id1:']} <span style={{ opacity: 0.6 }}>↗</span>
            </button>
          </div>
          <div className="prop-row">
            <span className="prop-label">Node 2</span>
            <button
              type="button"
              className="inspector-node-chip"
              onClick={() => onSelectNode && onSelectNode(beam['id2:'])}
              title={`Select Node "${beam['id2:']}" in 3D Viewport & Inspector`}
            >
              {beam['id2:']} <span style={{ opacity: 0.6 }}>↗</span>
            </button>
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
          <div className="inspector-subdivide-panel">
            <div className="inspector-subdivide-title-bar">
              <div className="subdivide-title-left">
                <SubdivideIcon size={14} className="text-accent" />
                <span className="subdivide-heading">Subdivide Beam</span>
              </div>
              <span className="subdivide-cad-badge">CAD TOOL</span>
            </div>

            {/* Number of cuts / segments */}
            <div className="subdivide-control-row">
              <span className="subdivide-label">Number of Cuts</span>
              <div className="subdivide-stepper-group">
                <button
                  type="button"
                  className="subdivide-step-btn"
                  disabled={subdivideCuts <= 1}
                  onClick={() => setSubdivideCuts(c => Math.max(1, c - 1))}
                  title="Decrease cuts"
                >
                  -
                </button>
                <span className="subdivide-cuts-val">{subdivideCuts}</span>
                <button
                  type="button"
                  className="subdivide-step-btn"
                  disabled={subdivideCuts >= 8}
                  onClick={() => setSubdivideCuts(c => Math.min(8, c + 1))}
                  title="Increase cuts"
                >
                  +
                </button>
                <span className="subdivide-segments-info">
                  ({subdivideCuts + 1} segments)
                </span>
              </div>
            </div>

            {/* Quick cut presets */}
            <div className="subdivide-presets-row">
              {[1, 2, 3, 4].map(c => (
                <button
                  key={c}
                  type="button"
                  className={`subdivide-preset-btn ${subdivideCuts === c ? 'active' : ''}`}
                  onClick={() => setSubdivideCuts(c)}
                >
                  {c === 1 ? '1 Cut (Mid)' : `${c} Cuts`}
                </button>
              ))}
            </div>

            {/* Custom Node Name / Prefix */}
            <div className="subdivide-control-row">
              <span className="subdivide-label">{subdivideCuts === 1 ? 'Node Name' : 'Node Prefix'}</span>
              <input
                type="text"
                className="subdivide-name-input"
                value={customSubdivideNodeName}
                onChange={(e) => setCustomSubdivideNodeName(e.target.value)}
                placeholder={subdivideCuts === 1 ? `${beam['id1:']}_mid` : 'auto (#)'}
                title="Custom name for intermediate node(s). Leave blank for auto-numbering."
              />
            </div>

            {/* Live Geometry Preview */}
            <div className="subdivide-preview-box">
              <div className="subdivide-preview-row">
                <span>Segment Length:</span>
                <b style={{ color: '#00e676' }}>
                  {lengthMeters !== null ? `${(lengthMeters / (subdivideCuts + 1)).toFixed(4)} m` : '—'}
                </b>
              </div>
              {subdivideCuts === 1 && midPos && (
                <div className="subdivide-preview-row">
                  <span>Midpoint:</span>
                  <span className="subdivide-coords-mono">
                    [{midPos.map(v => v.toFixed(3)).join(', ')}]
                  </span>
                </div>
              )}
              {symmetryEnabled && (
                <div className="subdivide-preview-row" style={{ color: '#38bdf8' }}>
                  <span>X-Mirror:</span>
                  <span>Active (mirrored on opposite side)</span>
                </div>
              )}
            </div>

            {/* Action Execution Button */}
            <button
              type="button"
              className="btn-subdivide-execute"
              onClick={() => {
                onSubdivideBeam({
                  partName,
                  id1: beam['id1:'],
                  id2: beam['id2:'],
                  splitPos: midPos,
                  customNodeId: customSubdivideNodeName.trim() || null,
                  cuts: subdivideCuts
                });
              }}
              title={`Split this beam into ${subdivideCuts + 1} equal segments by inserting ${subdivideCuts} intermediate node(s)`}
            >
              <SubdivideIcon size={14} />
              <span>
                Subdivide into {subdivideCuts + 1} Segments
              </span>
            </button>
          </div>
        )}

        {/* Quick Physics Presets Bar */}
        <div className="inspector-presets-bar">
          <div className="inspector-presets-header">Quick Physics Presets</div>
          <div className="inspector-presets-grid">
            {BEAM_PRESETS.map(p => (
              <button
                key={p.name}
                type="button"
                className="preset-chip-btn"
                onClick={() => {
                  if (onUpdateBeamProperties) {
                    onUpdateBeamProperties(partName, beam['id1:'], beam['id2:'], p.properties);
                  }
                  if (p.beamType && onChangeBeamType) {
                    onChangeBeamType(partName, beam['id1:'], beam['id2:'], p.beamType);
                  }
                }}
                title={p.tooltip}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Physics Warning Box */}
        {isDeformHigherThanStrength && (
          <div className="inspector-warning-box">
            <span className="warning-icon"><WarningIcon size={14} className="text-warning" /></span>
            <div>
              <strong>Physics Issue:</strong> <code>beamDeform</code> ({formatNtoMetric(numDeform, 'N')}) &gt; <code>beamStrength</code> ({formatNtoMetric(numStrength, 'N')}). Beam will snap before deforming. Set <code>beamStrength</code> to FLT_MAX or increase its value.
            </div>
          </div>
        )}

        {/* Interactive Physical Properties */}
        <div className="inspector-section">
          <div className="inspector-section-title">Physical Properties</div>

          <div className="prop-row">
            <span className="prop-label" title="Spring stiffness in Newtons per meter">beamSpring</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type={getInputTypeForProp(beamPropsInput.beamSpring)}
                className="inspector-prop-input"
                value={beamPropsInput.beamSpring}
                placeholder="1501000"
                onChange={(e) => setBeamPropsInput(prev => ({ ...prev, beamSpring: e.target.value }))}
                onBlur={() => commitBeamProp('beamSpring', beamPropsInput.beamSpring)}
                onKeyDown={(e) => e.key === 'Enter' && commitBeamProp('beamSpring', beamPropsInput.beamSpring)}
                title="Spring stiffness in N/m (e.g. 1500000 = 1.5 MN/m)"
              />
              <span className="prop-unit-hint">{formatNtoMetric(beamPropsInput.beamSpring, 'N/m')}</span>
            </div>
          </div>

          <div className="prop-row">
            <span className="prop-label" title="Oscillation damping in N·s/m">beamDamp</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type={getInputTypeForProp(beamPropsInput.beamDamp)}
                className="inspector-prop-input"
                value={beamPropsInput.beamDamp}
                placeholder="120"
                onChange={(e) => setBeamPropsInput(prev => ({ ...prev, beamDamp: e.target.value }))}
                onBlur={() => commitBeamProp('beamDamp', beamPropsInput.beamDamp)}
                onKeyDown={(e) => e.key === 'Enter' && commitBeamProp('beamDamp', beamPropsInput.beamDamp)}
                title="Oscillation damping in N·s/m"
              />
              <span className="prop-unit-hint">N·s/m</span>
            </div>
          </div>

          <div className="prop-row">
            <span className="prop-label" title="Plastic deformation threshold in Newtons">beamDeform</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type={getInputTypeForProp(beamPropsInput.beamDeform)}
                className="inspector-prop-input"
                value={beamPropsInput.beamDeform}
                placeholder="35000"
                onChange={(e) => setBeamPropsInput(prev => ({ ...prev, beamDeform: e.target.value }))}
                onBlur={() => commitBeamProp('beamDeform', beamPropsInput.beamDeform)}
                onKeyDown={(e) => e.key === 'Enter' && commitBeamProp('beamDeform', beamPropsInput.beamDeform)}
                title="Deformation threshold in Newtons"
              />
              <span className="prop-unit-hint">{formatNtoMetric(beamPropsInput.beamDeform, 'N')}</span>
            </div>
          </div>

          <div className="prop-row">
            <span className="prop-label" title="Failure / snap threshold">beamStrength</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {isFLTMax ? (
                <button
                  type="button"
                  className="fltmax-toggle-btn active"
                  onClick={handleToggleFLTMax}
                  title="Beam is unbreakable (FLT_MAX). Click to make breakable."
                >
                  <CheckIcon size={12} className="inline-icon" /> FLT_MAX (Unbreakable)
                </button>
              ) : (
                <>
                  <input
                    type={getInputTypeForProp(beamPropsInput.beamStrength)}
                    className="inspector-prop-input"
                    value={beamPropsInput.beamStrength}
                    placeholder="250000"
                    onChange={(e) => setBeamPropsInput(prev => ({ ...prev, beamStrength: e.target.value }))}
                    onBlur={() => commitBeamProp('beamStrength', beamPropsInput.beamStrength)}
                    onKeyDown={(e) => e.key === 'Enter' && commitBeamProp('beamStrength', beamPropsInput.beamStrength)}
                    title="Snap strength in Newtons"
                  />
                  <button
                    type="button"
                    className="fltmax-toggle-btn"
                    onClick={handleToggleFLTMax}
                    title="Set beam to unbreakable (FLT_MAX)"
                  >
                    FLT_MAX
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="prop-row">
            <span className="prop-label" title="Initial pre-tension / expansion factor (1.0 = neutral)">precompression</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type={getInputTypeForProp(beamPropsInput.beamPrecompression)}
                step="0.01"
                className="inspector-prop-input"
                value={beamPropsInput.beamPrecompression}
                placeholder="1.0"
                onChange={(e) => setBeamPropsInput(prev => ({ ...prev, beamPrecompression: e.target.value }))}
                onBlur={() => commitBeamProp('beamPrecompression', beamPropsInput.beamPrecompression)}
                onKeyDown={(e) => e.key === 'Enter' && commitBeamProp('beamPrecompression', beamPropsInput.beamPrecompression)}
                title="Beam precompression (1.0 = neutral, <1.0 = contracted, >1.0 = expanded)"
              />
              <span className="prop-unit-hint">factor</span>
            </div>
          </div>

          {/* Other Attributes */}
          {otherBeamProps.length > 0 && (
            <div style={{ marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6 }}>
              <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Other Attributes</div>
              {otherBeamProps.map(k => (
                <div key={k} className="prop-row">
                  <span className="prop-label">{k}</span>
                  <span className="prop-value">{String(beam[k])}</span>
                </div>
              ))}
            </div>
          )}

          {/* Crash & Detachment Zones Section */}
          <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Crash & Detachment Zones
              </span>
              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                {breakGroups.length + deformGroups.length > 0 ? `${breakGroups.length + deformGroups.length} Active` : 'Ungrouped'}
              </span>
            </div>

            {breakGroups.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 9.5, color: '#fda4af', marginBottom: 3, fontWeight: 600 }}>
                  Break Group (Detachment Latch)
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {breakGroups.map(bg => (
                    <span
                      key={bg}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '2px 7px',
                        borderRadius: 4,
                        background: 'rgba(244,63,94,0.15)',
                        border: `1px solid ${getCrashGroupColor(bg)}`,
                        color: '#f8fafc'
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: getCrashGroupColor(bg) }} />
                      {bg}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {deformGroups.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 9.5, color: '#7dd3fc', marginBottom: 3, fontWeight: 600 }}>
                  Deform Group (Mesh Crush / Shatter)
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {deformGroups.map(dg => (
                    <span
                      key={dg}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '2px 7px',
                        borderRadius: 4,
                        background: 'rgba(14,165,233,0.15)',
                        border: `1px solid ${getCrashGroupColor(dg)}`,
                        color: '#f8fafc'
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: getCrashGroupColor(dg) }} />
                      {dg}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {breakGroups.length === 0 && deformGroups.length === 0 && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Standard structural member (no break or deform group triggers).
              </div>
            )}
          </div>
        </div>

        {beam.__meta?.range && (
          <button
            onClick={() => onJumpToCode && onJumpToCode(beam.__meta.range[0] + 1, {
              partName: inspectedPartName,
              filePath: inspectedBeam?.__filePath || inspectedBeam?.filePath || jbeamParts?.[inspectedPartName]?.__filePath,
              id: inspectedBeamKey,
              type: 'beam'
            })}
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
          <NumberStepper
            min={1}
            value={batchRenameIndex}
            onChange={(val) => onUpdateBatchRenameIndex && onUpdateBatchRenameIndex(val)}
            width={64}
            title="Next sequential index number"
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

  // 2. MULTI-NODE INSPECTOR (When 2 or more nodes are selected via Box Drag or Shift-Click)
  if (multiSelectedNodes && multiSelectedNodes.length > 1) {
    const selectedNodesList = [];
    let sumMass = 0;
    let avgX = 0, avgY = 0, avgZ = 0;

    for (const nid of multiSelectedNodes) {
      let nObj = null;
      let pName = null;
      if (jbeamParts) {
        for (const pKey of Object.keys(jbeamParts).filter(k => k !== '__meta')) {
          const p = jbeamParts[pKey];
          if (p?.nodes) {
            if (p.nodes[nid]) { nObj = p.nodes[nid]; pName = pKey; break; }
            if (p.nodes[`${pKey}_${nid}`]) { nObj = p.nodes[`${pKey}_${nid}`]; pName = pKey; break; }
            for (const [nk, nd] of Object.entries(p.nodes)) {
              if (nk === nid || nk === nid.replace(`${pKey}_`, '')) { nObj = nd; pName = pKey; break; }
            }
            if (nObj) break;
          }
        }
      }
      const [nx, ny, nz] = nObj ? [
        nObj.posX ?? nObj.pos?.[0] ?? nObj.rx ?? 0,
        nObj.posY ?? nObj.pos?.[1] ?? nObj.ry ?? 0,
        nObj.posZ ?? nObj.pos?.[2] ?? nObj.rz ?? 0
      ] : [0, 0, 0];
      const mass = Number(nObj?.nodeWeight) || 5.0;
      sumMass += mass;
      avgX += nx; avgY += ny; avgZ += nz;
      selectedNodesList.push({ id: nid, partName: pName, node: nObj, coords: [nx, ny, nz] });
    }
    const count = multiSelectedNodes.length;
    avgX = (avgX / count).toFixed(4);
    avgY = (avgY / count).toFixed(4);
    avgZ = (avgZ / count).toFixed(4);

    return (
      <div className="inspector-panel">
        <div className="inspector-header">
          <span className="badge badge-node">MULTI-NODES</span>
          <span className="inspector-title">{count} Nodes Selected</span>
        </div>

        <div className="inspector-section">
          <div className="inspector-section-title">Selected Nodes ({count})</div>
          <div className="multi-node-chips-grid">
            {selectedNodesList.map(item => (
              <div
                key={item.id}
                className="multi-node-chip"
                onClick={() => onSelectNode && onSelectNode(item.id)}
                title={`Click to inspect node "${item.id}" alone`}
              >
                <span className="chip-name">{item.id}</span>
                {onMultiSelectChange && (
                  <button
                    className="chip-remove-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMultiSelectChange(multiSelectedNodes.filter(x => x !== item.id));
                    }}
                    title="Remove from selection"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="inspector-section">
          <div className="inspector-section-title">Selection Center & Mass</div>
          <div className="prop-row">
            <span className="prop-label">Average Center</span>
            <span className="prop-value" style={{ fontFamily: 'monospace' }}>
              [{avgX}, {avgY}, {avgZ}]
            </span>
          </div>
          <div className="prop-row">
            <span className="prop-label">Total Mass</span>
            <span className="prop-value" style={{ color: '#00e676', fontWeight: 600 }}>
              {sumMass.toFixed(2)} kg
            </span>
          </div>
          <div className="prop-row">
            <span className="prop-label">Node Count</span>
            <span className="prop-value">{count}</span>
          </div>
        </div>

        <div className="inspector-hint">
          Hold Shift and click in 3D to add/remove nodes, or drag a selection box (Shift+Drag).
        </div>
      </div>
    );
  }

  // 3. SINGLE NODE INSPECTOR
  if (foundNode) {
    const mirrorId = symmetryEnabled ? getSymmetricNodeId(effectiveNodeId) : null;
    const otherProps = Object.keys(foundNode).filter(
      k => !['__meta', 'id', 'name', 'posX', 'posY', 'posZ', 'pos'].includes(k)
    );

    const commitNodeProp = (propKey, rawVal) => {
      if (!onUpdateNodeProperties || !foundNode) return;
      const num = Number(rawVal);
      const parsed = isNaN(num) ? rawVal : num;
      onUpdateNodeProperties(foundPartName, effectiveNodeId, { [propKey]: parsed });
    };

    const handleStartRename = () => {
      setNameInput(effectiveNodeId);
      setIsEditingName(true);
    };

    const handleConfirmRename = () => {
      const trimmed = nameInput.trim();
      if (trimmed && trimmed !== effectiveNodeId && onRenameNode) {
        onRenameNode(foundPartName, effectiveNodeId, trimmed, { symmetry: symmetryEnabled });
      }
      setIsEditingName(false);
    };

    const handleCancelRename = () => {
      setNameInput(effectiveNodeId);
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
              <span className="inspector-title">{effectiveNodeId}</span>
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
              <span className="prop-value" style={{ color: 'var(--bng-orange-hover, #33ADFF)' }}>
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
          const nodeGroups = flexbodyAssociations.nodeToGroups[effectiveNodeId] || [];
          const drivingFlexbodies = flexbodyAssociations.getFlexbodiesForNode(effectiveNodeId);
          return (
            <div className="inspector-section">
              <div className="inspector-section-title">Flexbody Association</div>
              <div className="prop-row">
                <span className="prop-label">Node Group(s)</span>
                <span className="prop-value">
                  {nodeGroups.length > 0 ? (
                    <span className="node-group-badge-list">
                      {nodeGroups.map((g, idx) => (
                        <span key={`${g}_${idx}`} className="badge-group-pill">{g}</span>
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
                    {drivingFlexbodies.map((fb, idx) => (
                      <button
                        key={`${fb.meshName}_${idx}`}
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

        {/* Physical Properties (nodeWeight, nodeMaterial, frictionCoef) */}
        <div className="inspector-section">
          <div className="inspector-section-title">Physical Properties</div>

          {/* Node Physics Sanity Warnings */}
          {(() => {
            const numW = Number(nodePropsInput.nodeWeight || foundNode.nodeWeight);
            if (!isNaN(numW) && numW < 0.2 && numW > 0) {
              return (
                <div className="inspector-warning-box">
                  <span className="warning-icon"><WarningIcon size={14} className="text-warning" /></span>
                  <div>
                    <strong>Physics Instability:</strong> <code>nodeWeight</code> ({numW} kg) is unusually low (&lt;0.2 kg). High beam stiffness may cause mesh exploding or simulation spiking.
                  </div>
                </div>
              );
            }
            if (!isNaN(numW) && numW > 500) {
              return (
                <div className="inspector-warning-box">
                  <span className="warning-icon"><WarningIcon size={14} className="text-warning" /></span>
                  <div>
                    <strong>High Node Mass:</strong> <code>nodeWeight</code> ({numW} kg) is very heavy (&gt;500 kg). Ensure attached beams have sufficient stiffness.
                  </div>
                </div>
              );
            }
            return null;
          })()}

          <div className="prop-row">
            <span className="prop-label" title="Physical weight of node in kilograms">nodeWeight</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type={getInputTypeForProp(nodePropsInput.nodeWeight)}
                step="0.1"
                className="inspector-prop-input"
                value={nodePropsInput.nodeWeight}
                placeholder="4.5"
                onChange={(e) => setNodePropsInput(prev => ({ ...prev, nodeWeight: e.target.value }))}
                onBlur={() => commitNodeProp('nodeWeight', nodePropsInput.nodeWeight)}
                onKeyDown={(e) => e.key === 'Enter' && commitNodeProp('nodeWeight', nodePropsInput.nodeWeight)}
                title="Node mass in kilograms"
              />
              <span className="prop-unit-hint">kg</span>
            </div>
          </div>

          <div className="prop-row" style={{ alignItems: 'center' }}>
            <span className="prop-label" title="Surface collision & friction material">nodeMaterial</span>
            <CustomSelect
              value={foundNode.nodeMaterial || '|NM_METAL'}
              options={[
                { value: '|NM_METAL', label: '|NM_METAL (Steel/Sheet metal)' },
                { value: '|NM_PLASTIC', label: '|NM_PLASTIC (Polymer/Bumper)' },
                { value: '|NM_RUBBER', label: '|NM_RUBBER (Rubber/Bushing)' },
                { value: '|NM_GLASS', label: '|NM_GLASS (Glass pane)' },
                { value: '|NM_ALUMINUM', label: '|NM_ALUMINUM (Alloy/Lightweight)' }
              ]}
              onChange={(mat) => onUpdateNodeProperties && onUpdateNodeProperties(foundPartName, effectiveNodeId, { nodeMaterial: mat })}
              compact={true}
              searchable={false}
              className="inspector-custom-select"
              title="Change Node Collision Material"
            />
          </div>

          <div className="prop-row">
            <span className="prop-label" title="Surface ground/tire friction coefficient (default 0.5)">frictionCoef</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type={getInputTypeForProp(nodePropsInput.frictionCoef)}
                step="0.05"
                min="0"
                max="3"
                className="inspector-prop-input"
                value={nodePropsInput.frictionCoef}
                placeholder="0.5"
                onChange={(e) => setNodePropsInput(prev => ({ ...prev, frictionCoef: e.target.value }))}
                onBlur={() => commitNodeProp('frictionCoef', nodePropsInput.frictionCoef)}
                onKeyDown={(e) => e.key === 'Enter' && commitNodeProp('frictionCoef', nodePropsInput.frictionCoef)}
                title="Friction coefficient (0.0 = ice, 0.5 = normal, 1.0+ = sticky)"
              />
              <span className="prop-unit-hint">coef</span>
            </div>
          </div>

          {/* Other Attributes */}
          {otherProps.filter(k => !['nodeWeight', 'nodeMaterial', 'frictionCoef'].includes(k)).length > 0 && (
            <div style={{ marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6 }}>
              <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Other Attributes</div>
              {otherProps.filter(k => !['nodeWeight', 'nodeMaterial', 'frictionCoef'].includes(k)).map(k => (
                <div key={k} className="prop-row">
                  <span className="prop-label">{k}</span>
                  <span className="prop-value">{String(foundNode[k])}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Connected Beams Graph Navigation Section */}
        <div className="inspector-section">
          <div className="inspector-section-title">
            Connected Beams ({connectedBeams.length})
          </div>
          {connectedBeams.length === 0 ? (
            <div className="text-muted" style={{ fontSize: 11, fontStyle: 'italic', padding: '4px 0' }}>
              No connected beams found
            </div>
          ) : (
            <div className="connected-beams-container">
              {connectedBeams.map((cb, idx) => (
                <button
                  key={`${cb.partName}_${cb.beamKey || idx}`}
                  type="button"
                  className="connected-beam-chip"
                  onClick={() => onSelectBeam && onSelectBeam(cb.partName, cb.beamKey, cb.beam)}
                  title={`Click to select beam "${effectiveNodeId} ↔ ${cb.otherNodeId}" in 3D Viewport & Inspector`}
                >
                  <span className="beam-chip-nodes">↔ <strong>{cb.otherNodeId}</strong></span>
                  {cb.beamType && cb.beamType !== '|NORMAL' && (
                    <span className={`beam-chip-tag beam-chip-${cb.beamType.replace('|', '').toLowerCase()}`}>
                      {cb.beamType.replace('|', '')}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {foundNode.__meta?.range && (
          <button
            onClick={() => onJumpToCode && onJumpToCode(foundNode.__meta.range[0] + 1, {
              partName: foundPartName,
              filePath: foundNode?.__filePath || foundNode?.filePath || jbeamParts?.[foundPartName]?.__filePath,
              id: effectiveNodeId,
              type: 'node'
            })}
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
    const surfaceType = String(selectedSurfaceInfo.triangleType || selectedSurfaceInfo.quadType || 'NORMALTYPE').toUpperCase();
    const dragCoef = selectedSurfaceInfo.dragCoef;
    const liftCoef = selectedSurfaceInfo.liftCoef;
    const groundModel = selectedSurfaceInfo.groundModel;
    const pressureGroup = selectedSurfaceInfo.pressureGroup;

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
            <span className="prop-label" title="Projected area resisting oncoming airflow (BeamNG -Y longitudinal axis)">Frontal Proj. (Drag)</span>
            <span className="prop-value" style={{ fontFamily: 'var(--font-mono)', color: '#f59e0b' }}>
              {(area * Math.abs(normal[1] || 0)).toFixed(4)} m²
            </span>
          </div>
          <div className="prop-row">
            <span className="prop-label" title="Projected horizontal area contributing to downforce or lift (BeamNG +Z vertical axis)">Planform Proj. (Lift)</span>
            <span className="prop-value" style={{ fontFamily: 'var(--font-mono)', color: '#00e5ff' }}>
              {(area * Math.abs(normal[2] || 0)).toFixed(4)} m²
            </span>
          </div>
          <div className="prop-row">
            <span className="prop-label">Normal Vector</span>
            <span className="prop-value" style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
              [{normal.map(n => Number(n).toFixed(3)).join(', ')}]
            </span>
          </div>
        </div>

        <div className="inspector-section">
          <div className="inspector-section-title">Physics & Aerodynamics Classification</div>
          <div className="prop-row">
            <span className="prop-label">Surface Type</span>
            <span className="prop-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {surfaceType === 'NONCOLLIDABLE' && (
                <span className="type-badge aero" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
                  NONCOLLIDABLE (Aero Only)
                </span>
              )}
              {surfaceType === 'PRESSURE' && (
                <span className="type-badge pressure" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
                  PRESSURE (Pneumatic)
                </span>
              )}
              {surfaceType !== 'NONCOLLIDABLE' && surfaceType !== 'PRESSURE' && (
                <span className="type-badge normal" style={{ background: 'rgba(37, 99, 235, 0.2)', color: '#60a5fa', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
                  NORMALTYPE (Collidable Hull)
                </span>
              )}
            </span>
          </div>

          {dragCoef !== null && dragCoef !== undefined && (
            <div className="prop-row">
              <span className="prop-label" title="Aerodynamic Drag Coefficient">dragCoef</span>
              <span className="prop-value" style={{ fontFamily: 'var(--font-mono)', color: '#f59e0b', fontWeight: 600 }}>
                {dragCoef}
              </span>
            </div>
          )}

          {liftCoef !== null && liftCoef !== undefined && (
            <div className="prop-row">
              <span className="prop-label" title="Aerodynamic Lift Coefficient">liftCoef</span>
              <span className="prop-value" style={{ fontFamily: 'var(--font-mono)', color: '#00e5ff', fontWeight: 600 }}>
                {liftCoef}
              </span>
            </div>
          )}

          {groundModel && (
            <div className="prop-row">
              <span className="prop-label" title="Ground Contact Material Override">groundModel</span>
              <span className="prop-value" style={{ fontFamily: 'var(--font-mono)', color: '#e2e8f0' }}>
                {groundModel}
              </span>
            </div>
          )}

          {pressureGroup && (
            <div className="prop-row">
              <span className="prop-label" title="Pressurized Chamber Group">pressureGroup</span>
              <span className="prop-value" style={{ fontFamily: 'var(--font-mono)', color: '#fbbf24' }}>
                {pressureGroup}
              </span>
            </div>
          )}
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
            onClick={() => onJumpToCode && onJumpToCode(selectedSurfaceInfo.range[0] + 1, {
              partName: selectedSurfaceInfo.partName,
              filePath: selectedSurfaceInfo.filePath || jbeamParts?.[selectedSurfaceInfo.partName]?.__filePath,
              type: 'surface'
            })}
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
                            onJumpToCode && onJumpToCode(fb.range[0] + 1, {
                              partName: fb.partName,
                              filePath: jbeamParts?.[fb.partName]?.__filePath,
                              type: 'flexbody'
                            });
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
