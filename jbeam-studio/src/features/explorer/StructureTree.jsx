import React, { useState, useMemo } from 'react';
import {
  CubeIcon,
  NodeIcon,
  BeamIcon,
  TriangleIcon,
  QuadIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  FocusIcon,
  CloseIcon
} from '../../components/Icons.jsx';

export function StructureTree({
  jbeamParts,
  selectedNodeId,
  selectedBeamKey,
  selectedSurfaceInfo = null,
  onSelectNode,
  onSelectBeam,
  onSelectSurface = null,
  onHoverElement = null,
  onSelectCodeElements = null,
  hoverFocusDimming = true,
  onToggleHoverFocusDimming = null
}) {
  const [expandedSections, setExpandedSections] = useState({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [nodeFilter, setNodeFilter] = useState('');
  const [beamFilter, setBeamFilter] = useState('');
  const [beamTypeFilter, setBeamTypeFilter] = useState('ALL');
  const [surfaceFilter, setSurfaceFilter] = useState('');
  const [multiSelectedMap, setMultiSelectedMap] = useState(() => new Map());

  const partKeys = useMemo(() => {
    if (!jbeamParts || typeof jbeamParts !== 'object') return [];
    return Object.keys(jbeamParts).filter(k => k !== '__meta');
  }, [jbeamParts]);

  if (!jbeamParts || typeof jbeamParts !== 'object') {
    return <div className="tree-empty">No parsed vehicle structure</div>;
  }

  if (partKeys.length === 0) {
    return <div className="tree-empty">No parts found</div>;
  }

  const isSectionOpen = (key, defaultOpen = false) => {
    if (key in expandedSections) return expandedSections[key];
    return defaultOpen;
  };

  const toggleSection = (key, currentOpen) => {
    setExpandedSections(prev => ({ ...prev, [key]: !currentOpen }));
  };

  const handleCollapseAll = () => {
    const next = {};
    for (const pk of partKeys) {
      next[`${pk}_part`] = true;
      next[`${pk}_nodes`] = false;
      next[`${pk}_beams`] = false;
      next[`${pk}_triangles`] = false;
      next[`${pk}_quads`] = false;
    }
    setExpandedSections(next);
  };

  const handleExpandAll = () => {
    const next = {};
    for (const pk of partKeys) {
      next[`${pk}_part`] = true;
      next[`${pk}_nodes`] = true;
      next[`${pk}_beams`] = true;
      next[`${pk}_triangles`] = true;
      next[`${pk}_quads`] = true;
    }
    setExpandedSections(next);
  };

  const emitHover = (element) => {
    if (onHoverElement) onHoverElement(element);
  };

  const toggleMultiItem = (itemKey, elementPayload) => {
    setMultiSelectedMap(prev => {
      const next = new Map(prev);
      if (next.has(itemKey)) {
        next.delete(itemKey);
      } else {
        next.set(itemKey, elementPayload);
      }

      if (onSelectCodeElements) {
        if (next.size === 0) {
          onSelectCodeElements(null);
        } else {
          const grouped = { nodes: [], beams: [], triangles: [], quads: [] };
          for (const el of next.values()) {
            if (el.type === 'node') grouped.nodes.push(el);
            else if (el.type === 'beam') grouped.beams.push(el);
            else if (el.type === 'triangle') grouped.triangles.push(el);
            else if (el.type === 'quad') grouped.quads.push(el);
          }
          onSelectCodeElements(grouped);
        }
      }
      return next;
    });
  };

  const clearMultiSelection = () => {
    setMultiSelectedMap(new Map());
    if (onSelectCodeElements) onSelectCodeElements(null);
  };

  const qGlobal = globalFilter.trim().toLowerCase();

  return (
    <div
      className="structure-tree"
      onMouseLeave={() => emitHover(null)}
    >
      {/* Top Structure Toolbar: Search + Focus Dim Toggle + Expand/Collapse */}
      <div className="structure-toolbar">
        <div className="structure-search-row">
          <input
            type="text"
            placeholder="Search nodes, beams, tris across parts..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="tree-filter-input structure-global-search"
          />
          {globalFilter && (
            <button
              type="button"
              className="structure-clear-btn"
              onClick={() => setGlobalFilter('')}
              title="Clear search"
            >
              <CloseIcon size={10} />
            </button>
          )}
        </div>

        <div className="structure-controls-row">
          {onToggleHoverFocusDimming && (
            <button
              type="button"
              onClick={onToggleHoverFocusDimming}
              className={`structure-action-pill ${hoverFocusDimming ? 'active' : ''}`}
              title="Hover Focus Dimming: Slightly dim non-hovered elements in 3D so hovered/selected items stand out clearly"
            >
              <FocusIcon size={11} active={hoverFocusDimming} />
              <span>Hover Focus</span>
            </button>
          )}

          <div className="structure-expand-group">
            <button
              type="button"
              className="structure-mini-btn"
              onClick={handleExpandAll}
              title="Expand all sections"
            >
              Expand
            </button>
            <button
              type="button"
              className="structure-mini-btn"
              onClick={handleCollapseAll}
              title="Collapse all sections"
            >
              Collapse
            </button>
          </div>
        </div>

        {multiSelectedMap.size > 0 && (
          <div className="structure-multi-bar">
            <span>{multiSelectedMap.size} pinned in 3D (Ctrl+Click to add/remove)</span>
            <button type="button" className="structure-mini-btn" onClick={clearMultiSelection}>
              Clear
            </button>
          </div>
        )}
      </div>

      {partKeys.map(partKey => {
        const part = jbeamParts[partKey];
        if (!part || typeof part !== 'object') return null;

        const nodes = part.nodes ? Object.keys(part.nodes).filter(k => k !== '__meta') : [];
        const beams = part.beams ? Object.keys(part.beams).filter(k => k !== '__meta') : [];
        const triangles = part.triangles ? Object.keys(part.triangles).filter(k => k !== '__meta') : [];
        const quads = part.quads ? Object.keys(part.quads).filter(k => k !== '__meta') : [];

        const qNode = (nodeFilter || qGlobal).trim().toLowerCase();
        const filteredNodes = qNode
          ? nodes.filter(n => n.toLowerCase().includes(qNode))
          : nodes;

        const qBeam = (beamFilter || qGlobal).trim().toLowerCase();
        const filteredBeams = beams.filter(bKey => {
          const b = part.beams[bKey];
          if (!b || typeof b !== 'object') return false;
          if (beamTypeFilter !== 'ALL') {
            const bt = String(b.beamType || '|NORMAL').toUpperCase();
            if (!bt.includes(beamTypeFilter)) return false;
          }
          if (!qBeam) return true;
          return (
            (b['id1:'] && String(b['id1:']).toLowerCase().includes(qBeam)) ||
            (b['id2:'] && String(b['id2:']).toLowerCase().includes(qBeam)) ||
            (b.beamType && String(b.beamType).toLowerCase().includes(qBeam))
          );
        });

        const qSurf = (surfaceFilter || qGlobal).trim().toLowerCase();
        const filteredTriangles = qSurf
          ? triangles.filter(tKey => {
              const t = part.triangles[tKey];
              if (!t || typeof t !== 'object') return false;
              const s = `${t['id1:'] || ''} ${t['id2:'] || ''} ${t['id3:'] || ''} ${t.triangleType || ''}`.toLowerCase();
              return s.includes(qSurf);
            })
          : triangles;

        const filteredQuads = qSurf
          ? quads.filter(qKey => {
              const q = part.quads[qKey];
              if (!q || typeof q !== 'object') return false;
              const s = `${q['id1:'] || ''} ${q['id2:'] || ''} ${q['id3:'] || ''} ${q['id4:'] || ''} ${q.quadType || ''}`.toLowerCase();
              return s.includes(qSurf);
            })
          : quads;

        const partOpen = qGlobal ? true : isSectionOpen(`${partKey}_part`, true);
        const nodesOpen = qGlobal ? filteredNodes.length > 0 : isSectionOpen(`${partKey}_nodes`, true);
        const beamsOpen = qGlobal ? filteredBeams.length > 0 : isSectionOpen(`${partKey}_beams`, true);
        const trianglesOpen = qGlobal ? filteredTriangles.length > 0 : isSectionOpen(`${partKey}_triangles`, false);
        const quadsOpen = qGlobal ? filteredQuads.length > 0 : isSectionOpen(`${partKey}_quads`, false);

        return (
          <div key={partKey} className="tree-part">
            <div
              className="tree-part-header clickable"
              onClick={() => toggleSection(`${partKey}_part`, partOpen)}
              title={`${partKey}: ${nodes.length} nodes, ${beams.length} beams, ${triangles.length} tris`}
            >
              <span className="arrow">
                {partOpen ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
              </span>
              <CubeIcon size={13} className="part-icon" />
              <span className="part-title">{partKey}</span>
              <span className="part-summary-counts">
                {nodes.length}n · {beams.length}b{triangles.length + quads.length > 0 ? ` · ${triangles.length + quads.length}s` : ''}
              </span>
            </div>

            {partOpen && (
              <div className="tree-part-body">
                {/* Nodes Section */}
                <div className="tree-section">
                  <div
                    className="tree-section-header"
                    onClick={() => toggleSection(`${partKey}_nodes`, nodesOpen)}
                  >
                    <span className="arrow">
                      {nodesOpen ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
                    </span>
                    <NodeIcon size={13} className="sec-icon" />
                    <span className="section-name">Nodes</span>
                    <span className="section-count">
                      ({qNode ? `${filteredNodes.length}/${nodes.length}` : nodes.length})
                    </span>
                  </div>

                  {nodesOpen && (
                    <div className="tree-section-body">
                      {nodes.length > 8 && !qGlobal && (
                        <input
                          type="text"
                          placeholder="Filter nodes..."
                          value={nodeFilter}
                          onChange={(e) => setNodeFilter(e.target.value)}
                          className="tree-filter-input"
                        />
                      )}
                      <div className="tree-item-list">
                        {filteredNodes.slice(0, 150).map(nodeId => {
                          const node = part.nodes[nodeId];
                          const isSelected = selectedNodeId === nodeId;
                          const multiKey = `node:${partKey}:${nodeId}`;
                          const isMulti = multiSelectedMap.has(multiKey);
                          const nodePayload = { type: 'node', id: nodeId, partName: partKey, range: node?.__meta?.range };

                          return (
                            <div
                              key={nodeId}
                              onMouseEnter={() => emitHover(nodePayload)}
                              onMouseLeave={() => emitHover(null)}
                              onClick={(e) => {
                                if (e.ctrlKey || e.metaKey) {
                                  toggleMultiItem(multiKey, nodePayload);
                                } else {
                                  onSelectNode && onSelectNode(nodeId);
                                }
                              }}
                              title={`Node ${nodeId} (Click to inspect & jump to code, Ctrl+Click to multi-pin in 3D)`}
                              className={`tree-item ${isSelected ? 'selected' : ''} ${isMulti ? 'multi-selected' : ''}`}
                            >
                              <span className="item-bullet" />
                              <span className="item-name">{nodeId}</span>
                              {node?.nodeWeight !== undefined && (
                                <span className="tree-item-meta">{Number(node.nodeWeight).toFixed(1)}kg</span>
                              )}
                            </div>
                          );
                        })}
                        {filteredNodes.length > 150 && (
                          <div className="tree-more">... and {filteredNodes.length - 150} more</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Beams Section */}
                <div className="tree-section">
                  <div
                    className="tree-section-header"
                    onClick={() => toggleSection(`${partKey}_beams`, beamsOpen)}
                  >
                    <span className="arrow">
                      {beamsOpen ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
                    </span>
                    <BeamIcon size={13} className="sec-icon" />
                    <span className="section-name">Beams</span>
                    <span className="section-count">
                      ({(qBeam || beamTypeFilter !== 'ALL') ? `${filteredBeams.length}/${beams.length}` : beams.length})
                    </span>
                  </div>

                  {beamsOpen && (
                    <div className="tree-section-body">
                      {beams.length > 10 && !qGlobal && (
                        <>
                          <input
                            type="text"
                            placeholder="Filter beams by node/type..."
                            value={beamFilter}
                            onChange={(e) => setBeamFilter(e.target.value)}
                            className="tree-filter-input"
                          />
                          <div className="structure-beam-chips">
                            {[
                              { id: 'ALL', label: 'All' },
                              { id: 'NORMAL', label: 'Normal' },
                              { id: 'SUPPORT', label: 'Support' },
                              { id: 'HYDRO', label: 'Hydro' },
                              { id: 'BOUNDED', label: 'Bounded' }
                            ].map(chip => (
                              <button
                                key={chip.id}
                                type="button"
                                className={`structure-chip-btn ${beamTypeFilter === chip.id ? 'active' : ''}`}
                                onClick={() => setBeamTypeFilter(chip.id)}
                              >
                                {chip.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                      <div className="tree-item-list">
                        {filteredBeams.slice(0, 150).map(bKey => {
                          const beam = part.beams[bKey];
                          const isSelected = selectedBeamKey === `${partKey}_${bKey}` || selectedBeamKey === bKey;
                          const id1 = beam['id1:'];
                          const id2 = beam['id2:'];
                          const label = `${id1 || '?'} ↔ ${id2 || '?'}`;
                          const multiKey = `beam:${partKey}:${bKey}`;
                          const isMulti = multiSelectedMap.has(multiKey);
                          const beamPayload = {
                            type: 'beam',
                            id1,
                            id2,
                            beamKey: bKey,
                            partName: partKey,
                            range: beam?.__meta?.range
                          };

                          return (
                            <div
                              key={bKey}
                              onMouseEnter={() => emitHover(beamPayload)}
                              onMouseLeave={() => emitHover(null)}
                              onClick={(e) => {
                                if (e.ctrlKey || e.metaKey) {
                                  toggleMultiItem(multiKey, beamPayload);
                                } else {
                                  onSelectBeam && onSelectBeam(partKey, bKey, beam);
                                }
                              }}
                              title={`Beam ${label} (Click to inspect & jump to code, Ctrl+Click to multi-pin in 3D)`}
                              className={`tree-item ${isSelected ? 'selected' : ''} ${isMulti ? 'multi-selected' : ''}`}
                            >
                              <span className="item-bullet beam-bullet" />
                              <span className="item-name">{label}</span>
                              {beam.beamType && <span className="beam-type-badge">{beam.beamType}</span>}
                            </div>
                          );
                        })}
                        {filteredBeams.length > 150 && (
                          <div className="tree-more">... and {filteredBeams.length - 150} more</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Triangles Section */}
                {triangles.length > 0 && (
                  <div className="tree-section">
                    <div
                      className="tree-section-header"
                      onClick={() => toggleSection(`${partKey}_triangles`, trianglesOpen)}
                    >
                      <span className="arrow">
                        {trianglesOpen ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
                      </span>
                      <TriangleIcon size={13} className="sec-icon" />
                      <span className="section-name">Triangles</span>
                      <span className="section-count">
                        ({qSurf ? `${filteredTriangles.length}/${triangles.length}` : triangles.length})
                      </span>
                    </div>

                    {trianglesOpen && (
                      <div className="tree-section-body">
                        {triangles.length > 8 && !qGlobal && (
                          <input
                            type="text"
                            placeholder="Filter triangles by node..."
                            value={surfaceFilter}
                            onChange={(e) => setSurfaceFilter(e.target.value)}
                            className="tree-filter-input"
                          />
                        )}
                        <div className="tree-item-list">
                          {filteredTriangles.slice(0, 150).map(tKey => {
                            const tri = part.triangles[tKey];
                            const n1 = tri['id1:'];
                            const n2 = tri['id2:'];
                            const n3 = tri['id3:'];
                            const label = `${n1 || '?'} - ${n2 || '?'} - ${n3 || '?'}`;
                            const isSelected = selectedSurfaceInfo?.partName === partKey && selectedSurfaceInfo?.surfaceKey === tKey;
                            const multiKey = `tri:${partKey}:${tKey}`;
                            const isMulti = multiSelectedMap.has(multiKey);
                            const triPayload = {
                              type: 'triangle',
                              nodes: [n1, n2, n3],
                              key: tKey,
                              partName: partKey,
                              range: tri?.__meta?.range
                            };

                            return (
                              <div
                                key={tKey}
                                onMouseEnter={() => emitHover(triPayload)}
                                onMouseLeave={() => emitHover(null)}
                                onClick={(e) => {
                                  if (e.ctrlKey || e.metaKey) {
                                    toggleMultiItem(multiKey, triPayload);
                                  } else if (onSelectSurface) {
                                    onSelectSurface({
                                      type: 'triangle',
                                      partName: partKey,
                                      surfaceKey: tKey,
                                      nodes: [n1, n2, n3],
                                      dragCoef: tri.dragCoef,
                                      triangleType: tri.triangleType,
                                      range: tri.__meta?.range,
                                      rawData: tri
                                    });
                                  }
                                }}
                                title={`Triangle ${label} (Hover to highlight in 3D, Ctrl+Click to multi-pin)`}
                                className={`tree-item ${isSelected ? 'selected' : ''} ${isMulti ? 'multi-selected' : ''}`}
                              >
                                <span className="item-bullet tri-bullet" />
                                <span className="item-name">{label}</span>
                                {tri.triangleType && <span className="beam-type-badge">{tri.triangleType}</span>}
                              </div>
                            );
                          })}
                          {filteredTriangles.length > 150 && (
                            <div className="tree-more">... and {filteredTriangles.length - 150} more</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Quads Section */}
                {quads.length > 0 && (
                  <div className="tree-section">
                    <div
                      className="tree-section-header"
                      onClick={() => toggleSection(`${partKey}_quads`, quadsOpen)}
                    >
                      <span className="arrow">
                        {quadsOpen ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
                      </span>
                      <QuadIcon size={13} className="sec-icon" />
                      <span className="section-name">Quads</span>
                      <span className="section-count">
                        ({qSurf ? `${filteredQuads.length}/${quads.length}` : quads.length})
                      </span>
                    </div>

                    {quadsOpen && (
                      <div className="tree-section-body">
                        <div className="tree-item-list">
                          {filteredQuads.slice(0, 150).map(qKey => {
                            const quad = part.quads[qKey];
                            const n1 = quad['id1:'];
                            const n2 = quad['id2:'];
                            const n3 = quad['id3:'];
                            const n4 = quad['id4:'];
                            const label = `${n1 || '?'} - ${n2 || '?'} - ${n3 || '?'} - ${n4 || '?'}`;
                            const isSelected = selectedSurfaceInfo?.partName === partKey && selectedSurfaceInfo?.surfaceKey === qKey;
                            const multiKey = `quad:${partKey}:${qKey}`;
                            const isMulti = multiSelectedMap.has(multiKey);
                            const quadPayload = {
                              type: 'quad',
                              nodes: [n1, n2, n3, n4],
                              key: qKey,
                              partName: partKey,
                              range: quad?.__meta?.range
                            };

                            return (
                              <div
                                key={qKey}
                                onMouseEnter={() => emitHover(quadPayload)}
                                onMouseLeave={() => emitHover(null)}
                                onClick={(e) => {
                                  if (e.ctrlKey || e.metaKey) {
                                    toggleMultiItem(multiKey, quadPayload);
                                  } else if (onSelectSurface) {
                                    onSelectSurface({
                                      type: 'quad',
                                      partName: partKey,
                                      surfaceKey: qKey,
                                      nodes: [n1, n2, n3, n4],
                                      dragCoef: quad.dragCoef,
                                      quadType: quad.quadType,
                                      range: quad.__meta?.range,
                                      rawData: quad
                                    });
                                  }
                                }}
                                title={`Quad ${label} (Hover to highlight in 3D, Ctrl+Click to multi-pin)`}
                                className={`tree-item ${isSelected ? 'selected' : ''} ${isMulti ? 'multi-selected' : ''}`}
                              >
                                <span className="item-bullet tri-bullet" />
                                <span className="item-name">{label}</span>
                                {quad.quadType && <span className="beam-type-badge">{quad.quadType}</span>}
                              </div>
                            );
                          })}
                          {filteredQuads.length > 150 && (
                            <div className="tree-more">... and {filteredQuads.length - 150} more</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default StructureTree;
