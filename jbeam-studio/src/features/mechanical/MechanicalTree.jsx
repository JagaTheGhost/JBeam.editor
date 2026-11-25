/**
 * JBeam Studio - Mechanical System Tree
 * Displays the hierarchical topology of powertrain devices, steering hydros,
 * suspension kinematics, brakes/wheels, engine mounts, energy storage, and variables
 * with search, scope switching, and live 3D hover highlighting.
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
  LayersIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  FocusIcon,
  WheelIcon,
  SlidersIcon,
  CloseIcon
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
  selectedCategory, // 'device' | 'hydro' | 'suspension' | 'brakes' | 'mount' | 'energy' | 'variable'
  onSelectItem,
  scope, // 'assembly' | 'openTabs' | 'activeDocument'
  onChangeScope,
  hasAssembly = false,
  hasOpenTabs = false,
  onFocus3D = null,
  onHoverItem = null
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [axleFilter, setAxleFilter] = useState('all'); // 'all' | 'front' | 'rear'
  const [expandedSections, setExpandedSections] = useState({
    powertrain: true,
    hydros: true,
    suspension: true,
    brakes: true,
    mounts: true,
    energy: false,
    variables: false,
    aniso: false
  });

  const toggleSection = (sectionKey) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  const setAllExpanded = (expanded) => {
    setExpandedSections({
      powertrain: expanded,
      hydros: expanded,
      suspension: expanded,
      brakes: expanded,
      mounts: expanded,
      energy: expanded,
      variables: expanded,
      aniso: expanded
    });
  };

  const q = searchQuery.trim().toLowerCase();

  const filteredDevices = useMemo(() => {
    const list = overview?.devicesList || [];
    if (!q) return list;
    return list.filter(d =>
      d.name.toLowerCase().includes(q) ||
      d.type.toLowerCase().includes(q) ||
      d.category.toLowerCase().includes(q)
    );
  }, [overview, q]);

  const filteredHydros = useMemo(() => {
    const list = overview?.hydrosList || [];
    if (!q) return list;
    return list.filter(h =>
      h.beamName.toLowerCase().includes(q) ||
      h.id1.toLowerCase().includes(q) ||
      h.id2.toLowerCase().includes(q)
    );
  }, [overview, q]);

  const filteredSuspension = useMemo(() => {
    let list = overview?.suspensionList || [];
    if (axleFilter !== 'all') {
      list = list.filter(s => s.axle === axleFilter);
    }
    if (!q) return list;
    return list.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.subType.toLowerCase().includes(q) ||
      (s.id1 && s.id1.toLowerCase().includes(q)) ||
      (s.id2 && s.id2.toLowerCase().includes(q))
    );
  }, [overview, q, axleFilter]);

  const filteredAniso = useMemo(() => {
    const list = overview?.anisoBeamsList || [];
    if (!q) return list;
    return list.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.id1 && s.id1.toLowerCase().includes(q)) ||
      (s.id2 && s.id2.toLowerCase().includes(q))
    );
  }, [overview, q]);

  const filteredBrakes = useMemo(() => {
    const list = overview?.brakesList || [];
    if (!q) return list;
    return list.filter(b =>
      b.name.toLowerCase().includes(q) ||
      (b.partName && b.partName.toLowerCase().includes(q))
    );
  }, [overview, q]);

  const filteredMounts = useMemo(() => {
    const list = overview?.mountsList || [];
    if (!q) return list;
    return list.filter(m =>
      (m.breakGroup && m.breakGroup.toLowerCase().includes(q)) ||
      (m.engineGroup && m.engineGroup.toLowerCase().includes(q)) ||
      m.id1.toLowerCase().includes(q) ||
      m.id2.toLowerCase().includes(q)
    );
  }, [overview, q]);

  const filteredEnergy = useMemo(() => {
    const list = overview?.energyList || [];
    if (!q) return list;
    return list.filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.type.toLowerCase().includes(q)
    );
  }, [overview, q]);

  const filteredVariables = useMemo(() => {
    const list = overview?.variablesList || [];
    if (!q) return list;
    return list.filter(v =>
      v.name.toLowerCase().includes(q) ||
      v.title.toLowerCase().includes(q) ||
      v.category.toLowerCase().includes(q)
    );
  }, [overview, q]);

  const emitHover = (cat, item) => {
    if (onHoverItem) onHoverItem(cat, item);
  };

  return (
    <div
      className="mechanical-tree-container"
      onMouseLeave={() => emitHover(null, null)}
    >
      {/* Scope Switcher Banner */}
      <div className="mechanical-scope-bar">
        <button
          type="button"
          className={`scope-pill ${scope === 'assembly' ? 'active' : ''}`}
          onClick={() => onChangeScope && onChangeScope('assembly')}
          disabled={!hasAssembly}
          title={hasAssembly ? 'Analyze whole assembled vehicle' : 'Open a folder / .pc assembly first'}
        >
          <span>Assembled</span>
        </button>
        <button
          type="button"
          className={`scope-pill ${scope === 'openTabs' ? 'active' : ''}`}
          onClick={() => onChangeScope && onChangeScope('openTabs')}
          disabled={!hasOpenTabs}
          title={hasOpenTabs ? 'Analyze all currently open JBeam tabs' : 'Open multiple tabs to combine'}
        >
          <span>Open Tabs</span>
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
            Layout: <strong>{overview?.drivetrainLayout || 'None'}</strong>
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="count-badge">{overview?.totalDevices || 0} Dev</span>
            <button
              type="button"
              className="structure-mini-btn"
              onClick={() => setAllExpanded(true)}
              title="Expand all mechanical sections"
            >
              +
            </button>
            <button
              type="button"
              className="structure-mini-btn"
              onClick={() => setAllExpanded(false)}
              title="Collapse all mechanical sections"
            >
              −
            </button>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mechanical-search-box">
        <SearchIcon size={13} className="search-icon-muted" />
        <input
          type="text"
          placeholder="Filter engine, hydros, shocks, brakes, $vars..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="mechanical-search-input"
        />
        {searchQuery && (
          <button
            type="button"
            className="search-clear-btn"
            onClick={() => setSearchQuery('')}
            title="Clear filter"
          >
            <CloseIcon size={10} />
          </button>
        )}
      </div>

      {/* Tree Content Area */}
      <div className="mechanical-tree-scroll">
        {/* Section 1: Powertrain Devices */}
        <div className="tree-section">
          <div className="tree-section-header" onClick={() => toggleSection('powertrain')}>
            <span className="section-chevron">
              {(q || expandedSections.powertrain) ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
            </span>
            <span className="section-title">Powertrain & Drivetrain</span>
            <span className="section-counter">{filteredDevices.length}</span>
          </div>

          {(q || expandedSections.powertrain) && (
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
                      onMouseEnter={() => emitHover('device', dev)}
                      onMouseLeave={() => emitHover(null, null)}
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
          <div className="tree-section-header" onClick={() => toggleSection('hydros')}>
            <span className="section-chevron">
              {(q || expandedSections.hydros) ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
            </span>
            <span className="section-title">Hydros & Steering</span>
            <span className="section-counter">{filteredHydros.length}</span>
          </div>

          {(q || expandedSections.hydros) && (
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
                      onMouseEnter={() => emitHover('hydro', hydro)}
                      onMouseLeave={() => emitHover(null, null)}
                      onClick={() => onSelectItem && onSelectItem('hydro', hydroKey, hydro)}
                    >
                      <span className="item-icon-wrapper" data-category="hydro">
                        <ShaftIcon size={13} />
                      </span>
                      <div className="item-text-stack">
                        <span className="item-primary-name">{hydro.beamName || `Hydro ${hydro.id1} ↔ ${hydro.id2}`}</span>
                        <span className="item-sub-desc">
                          {hydro.id1} ↔ {hydro.id2} · Factor: {hydro.factor}
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

        {/* Section 3: Suspension & Kinematics */}
        <div className="tree-section">
          <div className="tree-section-header" onClick={() => toggleSection('suspension')}>
            <span className="section-chevron">
              {(q || expandedSections.suspension) ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
            </span>
            <span className="section-title">Suspension & Kinematics</span>
            <span className="section-counter">{filteredSuspension.length}</span>
          </div>

          {(q || expandedSections.suspension) && (
            <div className="tree-items-list">
              {(overview?.suspensionList?.length || 0) > 0 && (
                <div className="mech-axle-pills">
                  {[
                    { id: 'all', label: 'All Axles' },
                    { id: 'front', label: 'Front' },
                    { id: 'rear', label: 'Rear' }
                  ].map(ax => (
                    <button
                      key={ax.id}
                      type="button"
                      className={`structure-chip-btn ${axleFilter === ax.id ? 'active' : ''}`}
                      onClick={() => setAxleFilter(ax.id)}
                    >
                      {ax.label}
                    </button>
                  ))}
                </div>
              )}
              {filteredSuspension.length === 0 ? (
                <div className="tree-empty-hint">No bounded shocks, bumpstops, torsionbars, or rails found.</div>
              ) : (
                filteredSuspension.slice(0, 120).map((susp, idx) => {
                  const suspKey = `${susp.kind}_${susp.id1 || idx}_${susp.id2 || idx}_${idx}`;
                  const isSelected = selectedCategory === 'suspension' && selectedItemId === suspKey;
                  return (
                    <div
                      key={suspKey}
                      className={`tree-item-row ${isSelected ? 'selected' : ''}`}
                      onMouseEnter={() => emitHover('suspension', susp)}
                      onMouseLeave={() => emitHover(null, null)}
                      onClick={() => onSelectItem && onSelectItem('suspension', suspKey, susp)}
                    >
                      <span className="item-icon-wrapper" data-category="suspension">
                        <CouplingIcon size={13} />
                      </span>
                      <div className="item-text-stack">
                        <span className="item-primary-name">{susp.name}</span>
                        <span className="item-sub-desc">
                          {susp.subType}{susp.beamSpring ? ` · ${Math.round(susp.beamSpring / 1000)}k N/m` : ''}
                        </span>
                      </div>
                      {onFocus3D && (
                        <button
                          type="button"
                          className="item-hover-focus-btn"
                          title="Focus in 3D"
                          onClick={(e) => {
                            e.stopPropagation();
                            onFocus3D('suspension', susp);
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

        {/* Section 4: Brakes & Wheels */}
        <div className="tree-section">
          <div className="tree-section-header" onClick={() => toggleSection('brakes')}>
            <span className="section-chevron">
              {(q || expandedSections.brakes) ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
            </span>
            <span className="section-title">Brakes & Wheels</span>
            <span className="section-counter">{filteredBrakes.length}</span>
          </div>

          {(q || expandedSections.brakes) && (
            <div className="tree-items-list">
              {filteredBrakes.length === 0 ? (
                <div className="tree-empty-hint">No pressureWheels / brakes found in this scope.</div>
              ) : (
                filteredBrakes.map((brk, idx) => {
                  const brkKey = `brake_${brk.name}_${idx}`;
                  const isSelected = selectedCategory === 'brakes' && selectedItemId === brkKey;
                  return (
                    <div
                      key={brkKey}
                      className={`tree-item-row ${isSelected ? 'selected' : ''}`}
                      onMouseEnter={() => emitHover('brakes', brk)}
                      onMouseLeave={() => emitHover(null, null)}
                      onClick={() => onSelectItem && onSelectItem('brakes', brkKey, brk)}
                    >
                      <span className="item-icon-wrapper" data-category="brakes">
                        <WheelIcon size={13} />
                      </span>
                      <div className="item-text-stack">
                        <span className="item-primary-name">Wheel {brk.name} ({brk.side})</span>
                        <span className="item-sub-desc">
                          {brk.brakeTorque > 0 ? `${brk.brakeTorque} Nm` : 'No brakeTorque'} · R: {brk.radius?.toFixed(2)}m · {brk.pressurePSI} PSI
                        </span>
                      </div>
                      {onFocus3D && (
                        <button
                          type="button"
                          className="item-hover-focus-btn"
                          title="Focus wheel in 3D"
                          onClick={(e) => {
                            e.stopPropagation();
                            onFocus3D('brakes', brk);
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

        {/* Section 5: Mounts & BreakGroups */}
        <div className="tree-section">
          <div className="tree-section-header" onClick={() => toggleSection('mounts')}>
            <span className="section-chevron">
              {(q || expandedSections.mounts) ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
            </span>
            <span className="section-title">Engine & Trans Mounts</span>
            <span className="section-counter">{filteredMounts.length}</span>
          </div>

          {(q || expandedSections.mounts) && (
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
                      onMouseEnter={() => emitHover('mount', mount)}
                      onMouseLeave={() => emitHover(null, null)}
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
                          {mount.id1} ↔ {mount.id2}{mount.beamStrength ? ` · ${Math.round(mount.beamStrength / 1000)}kN` : ''}
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

        {/* Section 6: Energy Storage */}
        <div className="tree-section">
          <div className="tree-section-header" onClick={() => toggleSection('energy')}>
            <span className="section-chevron">
              {(q || expandedSections.energy) ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
            </span>
            <span className="section-title">Energy Storage</span>
            <span className="section-counter">{filteredEnergy.length}</span>
          </div>

          {(q || expandedSections.energy) && (
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
                      onMouseEnter={() => emitHover('energy', e)}
                      onMouseLeave={() => emitHover(null, null)}
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

        {/* Section 7: Mechanical Tunables ($Variables) */}
        <div className="tree-section">
          <div className="tree-section-header" onClick={() => toggleSection('variables')}>
            <span className="section-chevron">
              {(q || expandedSections.variables) ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
            </span>
            <span className="section-title">Mechanical Tunables ($Vars)</span>
            <span className="section-counter">{filteredVariables.length}</span>
          </div>

          {(q || expandedSections.variables) && (
            <div className="tree-items-list">
              {filteredVariables.length === 0 ? (
                <div className="tree-empty-hint">No tuning $variables declared in this scope.</div>
              ) : (
                filteredVariables.map((v, idx) => {
                  const varKey = `${v.partName}_${v.name}_${idx}`;
                  const isSelected = selectedCategory === 'variable' && selectedItemId === varKey;
                  return (
                    <div
                      key={varKey}
                      className={`tree-item-row ${isSelected ? 'selected' : ''}`}
                      onClick={() => onSelectItem && onSelectItem('variable', varKey, v)}
                    >
                      <span className="item-icon-wrapper" data-category="variable">
                        <SlidersIcon size={13} />
                      </span>
                      <div className="item-text-stack">
                        <span className="item-primary-name">{v.name}</span>
                        <span className="item-sub-desc">
                          {v.category} · Default: {v.defaultVal}{v.unit}
                        </span>
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
