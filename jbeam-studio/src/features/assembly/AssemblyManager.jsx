import React, { useState, useMemo } from 'react';
import CustomSelect from '../../components/CustomSelect.jsx';
import {
  EyeIcon,
  EyeOffIcon,
  EditIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  CheckIcon
} from '../../components/Icons.jsx';

function safeFormatStr(val, fallback = '') {
  if (val == null) return fallback;
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') {
    if (typeof val.txt === 'string') return val.txt;
    if (typeof val.description === 'string') return val.description;
    if (typeof val.name === 'string') return val.name;
    if (typeof val.title === 'string') return val.title;
    return fallback;
  }
  return String(val);
}

/**
 * Strips raw BeamNG localization prefixes (e.g. "ui.vehicleconfig.information.name: BRAND BRAND")
 * and extracts user-friendly readable titles.
 */
function cleanLocalizationString(rawStr, fallback = '') {
  if (!rawStr) return fallback;
  let str = safeFormatStr(rawStr, fallback);
  if (!str) return fallback;
  // If string contains localization prefix like "ui.vehicleconfig.information.name: BRAND BRAND"
  if (str.includes(':')) {
    const afterColon = str.split(':').slice(1).join(':').trim();
    if (afterColon && !afterColon.startsWith('ui.')) {
      return afterColon;
    }
  }
  // If it's a raw dotted key like "ui.percheron.name"
  if (str.startsWith('ui.')) {
    const parts = str.split('.');
    return parts[parts.length - 1];
  }
  return str;
}

/**
 * Error boundary for Assembly tree
 */
class AssemblyErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.warn('[AssemblyManager] Tree render warning:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="assembly-empty">
          <p>Unable to display complete vehicle slot hierarchy.</p>
          <p className="subtext">A part contains complex metadata. Try selecting another configuration.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Recursive tree node rendering a slot and its assigned child part.
 */
function SlotTreeNode({
  slotItem,
  depth = 0,
  partVisibility = {},
  onToggleVisibility,
  onSelectPartForSlot,
  onOpenPartInEditor,
  searchFilter = ''
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  const {
    slotName,
    description,
    chosenPart,
    isNone,
    availableParts = [],
    child
  } = slotItem;

  const sSlotName = safeFormatStr(slotName, 'slot');
  const sDesc = safeFormatStr(description, sSlotName);
  const sChosenPart = safeFormatStr(chosenPart, '');
  const filterLower = (searchFilter || '').toLowerCase();

  // Deduplicate availableParts to eliminate React duplicate key errors
  const uniqueAvailableParts = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const partId of (availableParts || [])) {
      const s = safeFormatStr(partId);
      if (s && !seen.has(s)) {
        seen.add(s);
        list.push(s);
      }
    }
    return list;
  }, [availableParts]);

  const matchesFilter =
    !filterLower ||
    sSlotName.toLowerCase().includes(filterLower) ||
    sDesc.toLowerCase().includes(filterLower) ||
    sChosenPart.toLowerCase().includes(filterLower);

  const hasChildren = child && child.slots && child.slots.length > 0;
  const isVisible = child ? (partVisibility[child.partName] !== false) : true;

  if (!matchesFilter && !hasChildren) return null;

  return (
    <div className="assembly-slot-node" style={{ paddingLeft: `${Math.min(depth * 10, 50)}px` }}>
      <div className={`assembly-slot-row ${child ? 'has-part' : 'empty-slot'}`}>
        {/* Expand/Collapse Arrow */}
        <span
          className="slot-expand-arrow"
          onClick={() => setIsExpanded(prev => !prev)}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />
          ) : (
            <span className="dot">•</span>
          )}
        </span>

        {/* Visibility Eye Toggle */}
        {child ? (
          <button
            onClick={() => onToggleVisibility(child.partName)}
            className={`slot-vis-btn ${isVisible ? 'active' : 'hidden'}`}
            title={isVisible ? `Hide ${child.partName} in 3D` : `Show ${child.partName} in 3D`}
          >
            {isVisible ? <EyeIcon size={13} /> : <EyeOffIcon size={13} />}
          </button>
        ) : (
          <span className="slot-vis-spacer" />
        )}

        {/* Part Color Badge */}
        {child && (
          <span
            className="part-color-badge"
            style={{ backgroundColor: child.color }}
            title={`Part Color: ${child.color}`}
          />
        )}

        {/* Slot Info & Dropdown */}
        <div className="slot-details">
          <div className="slot-title-row" title={`${sDesc} [${sSlotName}]`}>
            <span className="slot-name">{cleanLocalizationString(sDesc) || sSlotName}</span>
            <span className="slot-id">[{sSlotName}]</span>
          </div>

          <div className="slot-selector-row">
            <CustomSelect
              value={isNone ? 'none' : (sChosenPart || '')}
              options={[
                { value: 'none', label: '-- Empty / None --' },
                ...uniqueAvailableParts.map(sPartId => ({
                  value: sPartId,
                  label: sPartId
                }))
              ]}
              onChange={(val) => onSelectPartForSlot(slotName, val)}
              className="slot-part-custom-select"
              compact={true}
              placeholder="-- Empty / None --"
              title={isNone ? 'Empty / None' : sChosenPart}
            />

            {child?.filePath && (
              <button
                onClick={() => onOpenPartInEditor(child.filePath, child.partName)}
                className="slot-edit-btn"
                title={`Open ${child.partName} in Code Editor`}
              >
                <EditIcon size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Render Nested Children if chosen part has its own slots */}
      {hasChildren && isExpanded && (
        <div className="assembly-children">
          {child.slots.map(subSlot => (
            <SlotTreeNode
              key={safeFormatStr(subSlot.slotName, Math.random().toString())}
              slotItem={subSlot}
              depth={depth + 1}
              partVisibility={partVisibility}
              onToggleVisibility={onToggleVisibility}
              onSelectPartForSlot={onSelectPartForSlot}
              onOpenPartInEditor={onOpenPartInEditor}
              searchFilter={searchFilter}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function AssemblyManager({
  configurations = [],
  activeConfigName,
  onSelectConfiguration,
  rootParts = [],
  activeRootPart,
  onSelectRootPart,
  assemblyTree,
  partVisibility,
  onTogglePartVisibility,
  onToggleAllVisibility,
  onSelectPartForSlot,
  onOpenPartInEditor,
  onAssembleVehicle,
  isAssembling = false,
  viewportSource = 'assembly',
  onChangeViewportSource = null,
  totalAssembledStats = { parts: 0, nodes: 0, beams: 0 }
}) {
  const [filterQuery, setFilterQuery] = useState('');

  // Deduplicate configurations and root parts to prevent duplicate React keys
  const uniqueConfigurations = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const c of (configurations || [])) {
      const fn = c?.fileName || String(c);
      if (fn && !seen.has(fn)) {
        seen.add(fn);
        list.push(c);
      }
    }
    return list;
  }, [configurations]);

  const uniqueRootParts = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const p of (rootParts || [])) {
      const name = p?.partName || safeFormatStr(p);
      if (name && !seen.has(name)) {
        seen.add(name);
        list.push(p);
      }
    }
    return list;
  }, [rootParts]);

  return (
    <div className="assembly-manager">
      {/* Top Header: Configuration & Root Part Selection */}
      <div className="assembly-header">
        <div className="assembly-title-row">
          <span className="assembly-title">VEHICLE ASSEMBLY</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="assembly-badge">Multi-Part</span>
            {onChangeViewportSource && (
              <button
                type="button"
                className={`action-pill-btn ${viewportSource === 'assembly' ? 'active' : ''}`}
                style={{
                  fontSize: '10px',
                  padding: '2px 8px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  border: '1px solid',
                  background: viewportSource === 'assembly' ? 'rgba(255, 102, 0, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                  borderColor: viewportSource === 'assembly' ? 'var(--accent-color, #ff6600)' : 'rgba(255, 255, 255, 0.1)',
                  color: viewportSource === 'assembly' ? '#ff9933' : '#aaa'
                }}
                onClick={() => onChangeViewportSource(viewportSource === 'assembly' ? 'activeDocument' : 'assembly')}
                title={viewportSource === 'assembly' ? '3D Viewport is displaying full vehicle assembly' : 'Click to show assembled vehicle in 3D Viewport'}
              >
                {viewportSource === 'assembly' ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    3D Assembly Active <CheckIcon size={11} />
                  </span>
                ) : (
                  'Show 3D Assembly'
                )}
              </button>
            )}
          </div>
        </div>

        {/* Configuration Selector */}
        <div className="assembly-field">
          <label>Variant Configuration (.pc):</label>
          {uniqueConfigurations.length > 0 ? (
            <CustomSelect
              value={activeConfigName || ''}
              options={[
                { value: '', label: '-- Custom Assembly --' },
                ...uniqueConfigurations.map(c => ({
                  value: c.fileName,
                  label: `${c.configurationName} (${c.fileName})`,
                  sublabel: c.fileName
                }))
              ]}
              onChange={(val) => onSelectConfiguration(val)}
              className="assembly-custom-select"
              placeholder="-- Custom Assembly --"
            />
          ) : (
            <div className="assembly-no-pc-notice">
              <span>No .pc configurations found in this folder</span>
            </div>
          )}
        </div>

        {/* Root Part Selector */}
        {uniqueRootParts.length > 0 && (
          <div className="assembly-field">
            <label>Root Chassis Model:</label>
            <CustomSelect
              value={activeRootPart || ''}
              options={uniqueRootParts.map(p => {
                const cleanName = cleanLocalizationString(p.information?.name);
                const displaySuffix = cleanName && cleanName !== p.partName ? ` (${cleanName})` : '';
                return {
                  value: p.partName,
                  label: `${p.partName}${displaySuffix}`,
                  sublabel: cleanName !== p.partName ? cleanName : ''
                };
              })}
              onChange={(val) => onSelectRootPart(val)}
              className="assembly-custom-select"
              placeholder="-- Select Root Chassis --"
            />
          </div>
        )}

        {/* Summary Stats & Quick Actions */}
        <div className="assembly-stats-bar">
          <div className="stats-text">
            <span><strong>{Number.isFinite(totalAssembledStats?.parts) ? totalAssembledStats.parts : 0}</strong> Parts</span> •{' '}
            <span><strong>{Number.isFinite(totalAssembledStats?.nodes) ? totalAssembledStats.nodes : 0}</strong> Nodes</span> •{' '}
            <span><strong>{Number.isFinite(totalAssembledStats?.beams) ? totalAssembledStats.beams : 0}</strong> Beams</span>
          </div>
          <div className="stats-actions">
            <button
              onClick={() => onToggleAllVisibility(true)}
              className="action-pill-btn"
              title="Show all parts in 3D"
            >
              Show All
            </button>
            <button
              onClick={() => onToggleAllVisibility(false)}
              className="action-pill-btn"
              title="Hide all parts in 3D"
            >
              Hide All
            </button>
          </div>
        </div>

        {/* Search Filter */}
        <input
          type="text"
          placeholder="Filter slots or parts..."
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          className="assembly-search-input"
        />
      </div>

      {/* Hierarchical Slot Tree */}
      <div className="assembly-tree-scroll">
        <AssemblyErrorBoundary>
          {isAssembling ? (
            <div className="assembly-loading">
              <span>Resolving vehicle slot hierarchy...</span>
            </div>
          ) : assemblyTree ? (
            <SlotTreeNode
              slotItem={{
                slotName: 'root',
                description: 'Root Chassis Frame',
                chosenPart: safeFormatStr(assemblyTree.partName),
                availableParts: uniqueRootParts.map(p => safeFormatStr(p.partName || p)),
                child: assemblyTree
              }}
              depth={0}
              partVisibility={partVisibility}
              onToggleVisibility={onTogglePartVisibility}
              onSelectPartForSlot={(slotName, val) => {
                if (slotName === 'root' && onSelectRootPart) {
                  onSelectRootPart(val);
                } else if (onSelectPartForSlot) {
                  onSelectPartForSlot(slotName, val);
                }
              }}
              onOpenPartInEditor={onOpenPartInEditor}
              searchFilter={filterQuery}
            />
          ) : (
            <div className="assembly-empty">
              <p>No active vehicle root chassis found.</p>
              <p className="subtext">Select a root chassis or load a vehicle configuration to explore slots.</p>
            </div>
          )}
        </AssemblyErrorBoundary>
      </div>
    </div>
  );
}

export default AssemblyManager;
