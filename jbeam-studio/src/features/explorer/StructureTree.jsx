import React, { useState } from 'react';
import {
  CubeIcon,
  NodeIcon,
  BeamIcon,
  TriangleIcon,
  ChevronRightIcon,
  ChevronDownIcon
} from '../../components/Icons.jsx';

export function StructureTree({ jbeamParts, selectedNodeId, selectedBeamKey, onSelectNode, onSelectBeam }) {
  const [expandedSections, setExpandedSections] = useState({ nodes: true, beams: true, triangles: false });
  const [nodeFilter, setNodeFilter] = useState('');
  const [beamFilter, setBeamFilter] = useState('');

  if (!jbeamParts || typeof jbeamParts !== 'object') {
    return <div className="tree-empty">No parsed vehicle structure</div>;
  }

  const partKeys = Object.keys(jbeamParts).filter(k => k !== '__meta');
  if (partKeys.length === 0) {
    return <div className="tree-empty">No parts found</div>;
  }

  const toggleSection = (key) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="structure-tree">
      {partKeys.map(partKey => {
        const part = jbeamParts[partKey];
        if (!part || typeof part !== 'object') return null;

        const nodes = part.nodes ? Object.keys(part.nodes).filter(k => k !== '__meta') : [];
        const beams = part.beams ? Object.keys(part.beams).filter(k => k !== '__meta') : [];
        const triangles = part.triangles ? Object.keys(part.triangles).filter(k => k !== '__meta') : [];
        const quads = part.quads ? Object.keys(part.quads).filter(k => k !== '__meta') : [];

        const filteredNodes = nodeFilter
          ? nodes.filter(n => n.toLowerCase().includes(nodeFilter.toLowerCase()))
          : nodes;

        const filteredBeams = beamFilter
          ? beams.filter(bKey => {
              const b = part.beams[bKey];
              const query = beamFilter.toLowerCase();
              return (
                (b['id1:'] && b['id1:'].toLowerCase().includes(query)) ||
                (b['id2:'] && b['id2:'].toLowerCase().includes(query)) ||
                (b.beamType && b.beamType.toLowerCase().includes(query))
              );
            })
          : beams;

        const nodesOpen = expandedSections[`${partKey}_nodes`] !== false;
        const beamsOpen = expandedSections[`${partKey}_beams`] !== false;
        const trianglesOpen = expandedSections[`${partKey}_triangles`] === true;

        return (
          <div key={partKey} className="tree-part">
            <div className="tree-part-header">
              <CubeIcon size={14} className="part-icon" />
              <span className="part-title">{partKey}</span>
            </div>

            {/* Nodes Section */}
            <div className="tree-section">
              <div
                className="tree-section-header"
                onClick={() => toggleSection(`${partKey}_nodes`)}
              >
                <span className="arrow">
                  {nodesOpen ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
                </span>
                <NodeIcon size={13} className="sec-icon" />
                <span className="section-name">Nodes</span>
                <span className="section-count">({nodes.length})</span>
              </div>

              {nodesOpen && (
                <div className="tree-section-body">
                  {nodes.length > 8 && (
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
                      const isSelected = selectedNodeId === nodeId;
                      return (
                        <div
                          key={nodeId}
                          onClick={() => onSelectNode(nodeId)}
                          className={`tree-item ${isSelected ? 'selected' : ''}`}
                        >
                          <span className="item-bullet" />
                          <span className="item-name">{nodeId}</span>
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
                onClick={() => toggleSection(`${partKey}_beams`)}
              >
                <span className="arrow">
                  {beamsOpen ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
                </span>
                <BeamIcon size={13} className="sec-icon" />
                <span className="section-name">Beams</span>
                <span className="section-count">({beams.length})</span>
              </div>

              {beamsOpen && (
                <div className="tree-section-body">
                  {beams.length > 10 && (
                    <input
                      type="text"
                      placeholder="Filter beams by node/type..."
                      value={beamFilter}
                      onChange={(e) => setBeamFilter(e.target.value)}
                      className="tree-filter-input"
                    />
                  )}
                  <div className="tree-item-list">
                    {filteredBeams.slice(0, 150).map(bKey => {
                      const beam = part.beams[bKey];
                      const isSelected = selectedBeamKey === `${partKey}_${bKey}` || selectedBeamKey === bKey;
                      const label = `${beam['id1:'] || '?'} ↔ ${beam['id2:'] || '?'}`;
                      return (
                        <div
                          key={bKey}
                          onClick={() => onSelectBeam(partKey, bKey, beam)}
                          className={`tree-item ${isSelected ? 'selected' : ''}`}
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
            <div className="tree-section">
              <div
                className="tree-section-header"
                onClick={() => toggleSection(`${partKey}_triangles`)}
              >
                <span className="arrow">
                  {trianglesOpen ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
                </span>
                <TriangleIcon size={13} className="sec-icon" />
                <span className="section-name">Triangles</span>
                <span className="section-count">({triangles.length})</span>
              </div>

              {trianglesOpen && (
                <div className="tree-section-body">
                  <div className="tree-item-list">
                    {triangles.slice(0, 150).map(tKey => {
                      const tri = part.triangles[tKey];
                      const label = `${tri['id1:'] || '?'} - ${tri['id2:'] || '?'} - ${tri['id3:'] || '?'}`;
                      return (
                        <div key={tKey} className="tree-item">
                          <span className="item-bullet tri-bullet" />
                          <span className="item-name">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Quads Section */}
            {quads.length > 0 && (
              <div className="tree-section">
                <div
                  className="tree-section-header"
                  onClick={() => toggleSection(`${partKey}_quads`)}
                >
                  <span className="arrow">
                    {expandedSections[`${partKey}_quads`] === true ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
                  </span>
                  <TriangleIcon size={13} className="sec-icon" />
                  <span className="section-name">Quads</span>
                  <span className="section-count">({quads.length})</span>
                </div>

                {expandedSections[`${partKey}_quads`] === true && (
                  <div className="tree-section-body">
                    <div className="tree-item-list">
                      {quads.slice(0, 150).map(qKey => {
                        const quad = part.quads[qKey];
                        const label = `${quad['id1:'] || '?'} - ${quad['id2:'] || '?'} - ${quad['id3:'] || '?'} - ${quad['id4:'] || '?'}`;
                        return (
                          <div key={qKey} className="tree-item">
                            <span className="item-bullet tri-bullet" />
                            <span className="item-name">{label}</span>
                          </div>
                        );
                      })}
                    </div>
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
