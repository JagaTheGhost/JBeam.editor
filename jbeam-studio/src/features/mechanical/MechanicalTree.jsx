/**
 * JBeam Studio - Mechanical System Tree
 * Displays the hierarchical topology of powertrain devices, steering hydros,
 * engine mounts, and energy storage with search and scope switching.
 */

import React, { useState, useMemo } from 'react';
import {
  EngineIcon,
  GearboxIcon,
  DifferentialIcon,
  ShaftIcon,
  CouplingIcon,
  TurboIcon,
  SearchIcon,
  CheckIcon,
  WarningIcon,
  LayersIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  EyeIcon,
  FocusIcon
} from '../../components/Icons.jsx';

function getCategoryIcon(category, size = 14) {
  switch (category) {
    case 'engine':
      return <EngineIcon size={size} />;
    case 'gearbox':
      return <GearboxIcon size={size} />;
    case 'differential':
      return <DifferentialIcon size={size} />;
    case 'coupling':
      return <CouplingIcon size={size} />;
    case 'accessory':
      return <TurboIcon size={size} />;
    default:
      return <ShaftIcon size={size} />;
  }
}

export function MechanicalTree({
  overview,
  selectedItemId,
  selectedCategory, // 'device' | 'hydro' | 'mount' | 'energy'
  onSelectItem,
  scope, // 'assembly' | 'activeDocument'
  onChangeScope,
  hasAssembly = false,
  onFocus3D = null,
  activeDocumentName = ''
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState({
    powertrain: true,
    hydros: true,
    mounts: true,
    energy: true
  });

  const toggleSection = (sectionKey) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  const filteredDevices = useMemo(() => {
    if (!overview?.devicesList) return [];
    if (!searchQuery.trim()) return overview.devicesList;
    const q = searchQuery.toLowerCase();
    return overview.devicesList.filter(d =>
      d.name.toLowerCase().includes(q) ||
      d.type.toLowerCase().includes(q) ||
      d.category.toLowerCase().includes(q)
    );
  }, [overview, searchQuery]);

  const filteredHydros = useMemo(() => {
    if (!overview?.hydrosList) return [];
    if (!searchQuery.trim()) return overview.hydrosList;
    const q = searchQuery.toLowerCase();
    return overview.hydrosList.filter(h =>
      h.beamName.toLowerCase().includes(q) ||
      h.id1.toLowerCase().includes(q) ||
      h.id2.toLowerCase().includes(q)
    );
  }, [overview, searchQuery]);

  const filteredMounts = useMemo(() => {
    if (!overview?.mountsList) return [];
    if (!searchQuery.trim()) return overview.mountsList;
    const q = searchQuery.toLowerCase();
    return overview.mountsList.filter(m =>
      (m.breakGroup && m.breakGroup.toLowerCase().includes(q)) ||
      m.id1.toLowerCase().includes(q) ||
      m.id2.toLowerCase().includes(q)
    );
  }, [overview, searchQuery]);

  const filteredEnergy = useMemo(() => {
    if (!overview?.energyList) return [];
    if (!searchQuery.trim()) return overview.energyList;
    const q = searchQuery.toLowerCase();
    return overview.energyList.filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.type.toLowerCase().includes(q)
    );
  }, [overview, searchQuery]);

  return (
    <div className="mechanical-tree-container">
      {/* Scope Switcher Banner */}
      <div className="mechanical-scope-bar">
        <span className="scope-label">Scope:</span>
        <button
          type="button"
          className={`scope-pill ${scope === 'assembly' ? 'active' : ''}`}
          onClick={() => onChangeScope && onChangeScope('assembly')}
          disabled={!hasAssembly}
          title={hasAssembly ? 'Analyze whole assembled vehicle' : 'No assembled vehicle loaded'}
        >
          <span>Assembled Vehicle</span>
        </button>
        <button
          type="button"
          className={`scope-pill ${scope === 'activeDocument' ? 'active' : ''}`}
          onClick={() => onChangeScope && onChangeScope('activeDocument')}
          title="Analyze active JBeam document only"
        >
          <span>Active File</span>
        </button>
      </div>

      {/* Drivetrain Badge & Quick Summary */}
      <div className="mechanical-header-card">
        <div className="drivetrain-title-row">
          <span className="layout-badge">
            Layout: <strong>{overview?.drivetrainLayout || 'Custom'}</strong>
          </span>
          <span className="count-badge">
            {overview?.totalDevices || 0} Devices
          </span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mechanical-search-box">
        <SearchIcon size={13} className="search-icon-muted" />
        <input
          type="text"
          placeholder="Filter devices, hydros, mounts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="mechanical-search-input"
        />
        {searchQuery && (
          <button
            type="button"
            className="search-clear-btn"
            onClick={() => setSearchQuery('')}
          >
            ×
          </button>
        )}
      </div>

      {/* Tree Content Area */}
      <div className="mechanical-tree-scroll">
        {/* Section 1: Powertrain Devices */}
        <div className="tree-section">
          <div
            className="tree-section-header"
            onClick={() => toggleSection('powertrain')}
          >
            <span className="section-chevron">
              {expandedSections.powertrain ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
            </span>
            <span className="section-title">Powertrain & Drivetrain</span>
            <span className="section-counter">{filteredDevices.length}</span>
          </div>

          {expandedSections.powertrain && (
            <div className="tree-items-list">
              {filteredDevices.length === 0 ? (
                <div className="tree-empty-hint">No powertrain devices found in this scope.</div>
              ) : (
                filteredDevices.map(dev => {
                  const isSelected = selectedCategory === 'device' && selectedItemId === dev.name;
                  return (
                    <div
                      key={dev.name}
                      className={`tree-item-row ${isSelected ? 'selected' : ''}`}
                      onClick={() => onSelectItem && onSelectItem('device', dev.name, dev)}
                    >
                      <span className="item-icon-wrapper" data-category={dev.category}>
                        {getCategoryIcon(dev.category, 13)}
                      </span>
                      <div className="item-text-stack">
                        <span className="item-primary-name">{dev.name}</span>
                        <span className="item-sub-desc">
                          {dev.type} {dev.inputName ? `← ${dev.inputName}` : '(Root)'}
                        </span>
                      </div>
                      {dev.boundNodes && dev.boundNodes.length > 0 && (
                        <span className="item-node-badge" title={`${dev.boundNodes.length} bound 3D nodes`}>
                          {dev.boundNodes.length}N
                        </span>
                      )}
                      {onFocus3D && (
                        <button
                          type="button"
                          className="item-hover-focus-btn"
                          title="Focus in 3D"
                          onClick={(e) => {
                            e.stopPropagation();
                            onFocus3D('device', dev);
                          }}
                        >
                          <FocusIcon size={12} />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Section 2: Hydros & Steering */}
        <div className="tree-section">
          <div
            className="tree-section-header"
            onClick={() => toggleSection('hydros')}
          >
            <span className="section-chevron">
              {expandedSections.hydros ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
            </span>
            <span className="section-title">Hydros & Steering</span>
            <span className="section-counter">{filteredHydros.length}</span>
          </div>

          {expandedSections.hydros && (
            <div className="tree-items-list">
              {filteredHydros.length === 0 ? (
                <div className="tree-empty-hint">No hydro actuators or steering racks declared.</div>
              ) : (
                filteredHydros.map((hydro, idx) => {
                  const hydroKey = `${hydro.id1}_${hydro.id2}_${idx}`;
                  const isSelected = selectedCategory === 'hydro' && selectedItemId === hydroKey;
                  return (
                    <div
                      key={hydroKey}
                      className={`tree-item-row ${isSelected ? 'selected' : ''}`}
                      onClick={() => onSelectItem && onSelectItem('hydro', hydroKey, hydro)}
                    >
                      <span className="item-icon-wrapper" data-category="hydro">
                        <ShaftIcon size={13} />
                      </span>
                      <div className="item-text-stack">
                        <span className="item-primary-name">{hydro.beamName || `Hydro ${hydro.id1} → ${hydro.id2}`}</span>
                        <span className="item-sub-desc">
                          Factor: {hydro.factor} | Rate: {hydro.inRate}m/s
                        </span>
                      </div>
                      {onFocus3D && (
                        <button
                          type="button"
                          className="item-hover-focus-btn"
                          title="Focus hydro in 3D"
                          onClick={(e) => {
                            e.stopPropagation();
                            onFocus3D('hydro', hydro);
                          }}
                        >
                          <FocusIcon size={12} />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Section 3: Mounts & BreakGroups */}
        <div className="tree-section">
          <div
            className="tree-section-header"
            onClick={() => toggleSection('mounts')}
          >
            <span className="section-chevron">
              {expandedSections.mounts ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
            </span>
            <span className="section-title">Engine & Trans Mounts</span>
            <span className="section-counter">{filteredMounts.length}</span>
          </div>

          {expandedSections.mounts && (
            <div className="tree-items-list">
              {filteredMounts.length === 0 ? (
                <div className="tree-empty-hint">No engine/transmission mount beams found.</div>
              ) : (
                filteredMounts.map((mount, idx) => {
                  const mountKey = `${mount.id1}_${mount.id2}_${idx}`;
                  const isSelected = selectedCategory === 'mount' && selectedItemId === mountKey;
                  return (
                    <div
                      key={mountKey}
                      className={`tree-item-row ${isSelected ? 'selected' : ''}`}
                      onClick={() => onSelectItem && onSelectItem('mount', mountKey, mount)}
                    >
                      <span className="item-icon-wrapper" data-category="mount">
                        <LayersIcon size={13} />
                      </span>
                      <div className="item-text-stack">
                        <span className="item-primary-name">
                          {mount.breakGroup || mount.engineGroup || 'Engine Mount'}
                        </span>
                        <span className="item-sub-desc">
                          Nodes: {mount.id1} ↔ {mount.id2}
                        </span>
                      </div>
                      {onFocus3D && (
                        <button
                          type="button"
                          className="item-hover-focus-btn"
                          title="Focus mount in 3D"
                          onClick={(e) => {
                            e.stopPropagation();
                            onFocus3D('mount', mount);
                          }}
                        >
                          <FocusIcon size={12} />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Section 4: Energy Storage */}
        <div className="tree-section">
          <div
            className="tree-section-header"
            onClick={() => toggleSection('energy')}
          >
            <span className="section-chevron">
              {expandedSections.energy ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
            </span>
            <span className="section-title">Energy Storage</span>
            <span className="section-counter">{filteredEnergy.length}</span>
          </div>

          {expandedSections.energy && (
            <div className="tree-items-list">
              {filteredEnergy.length === 0 ? (
                <div className="tree-empty-hint">No fuel tanks or battery packs declared.</div>
              ) : (
                filteredEnergy.map(e => {
                  const isSelected = selectedCategory === 'energy' && selectedItemId === e.name;
                  return (
                    <div
                      key={e.name}
                      className={`tree-item-row ${isSelected ? 'selected' : ''}`}
                      onClick={() => onSelectItem && onSelectItem('energy', e.name, e)}
                    >
                      <span className="item-icon-wrapper" data-category="energy">
                        <TurboIcon size={13} />
                      </span>
                      <div className="item-text-stack">
                        <span className="item-primary-name">{e.name}</span>
                        <span className="item-sub-desc">{e.type}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
