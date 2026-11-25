import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  CubeIcon,
  FolderIcon,
  EyeIcon,
  EyeOffIcon,
  CheckIcon,
  FilePlusIcon,
  CloseIcon,
  ChevronDownIcon
} from '../../components/Icons.jsx';
import { sanitizeVehicleId } from '../templates/vehicleTemplateGenerator.js';
import {
  computeCompositeBoundingBox,
  deriveMultiMeshPartName,
  generateMultiMeshJBeam
} from './meshJBeamGenerator.js';
import { buildSubmeshPrefixTree } from './submeshTreeUtils.js';

/**
 * Dedicated 3D Mesh (.DAE Collada) Sidebar Panel
 * Part 1: Submesh / Object Explorer with interactive multi-mesh 3D spawning.
 * Part 2: Dedicated JBeam file creation for single or multiple 3D meshes.
 */
export function DaeMeshPanel({
  workspacePath = '',
  discoveredDaeFiles = [],
  selectedDaePath = '',
  onSelectDaePath = null,
  onLoadDaeContent = null,
  onUploadDaeFile = null,
  onOpenDaeDialog = null,
  visualMeshName = null,
  visualMeshSubnames = [],
  visualMeshSubmeshDetails = {},
  spawnedMeshNames = new Set(),
  onToggleSpawnMesh = null,
  onSpawnAll = null,
  onDespawnAll = null,
  meshOpacity = 0.45,
  onMeshOpacityChange = null,
  meshWireframe = false,
  onMeshWireframeChange = null,
  onCreateJBeamForMesh = null
}) {
  // Search & Filter Tabs for Section 1
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'spawned' | 'selected'
  const [explorerViewMode, setExplorerViewMode] = useState('tree'); // 'tree' | 'flat'
  const [expandedFolderIds, setExpandedFolderIds] = useState(() => new Set());
  const emptyFileInputRef = useRef(null);

  // Multi-Mesh JBeam Selection State (starts empty; no preloaded mesh)
  const [selectedMeshes, setSelectedMeshes] = useState(() => new Set());
  const [customPartName, setCustomPartName] = useState('');
  const [customSlotType, setCustomSlotType] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [isCreatingJBeam, setIsCreatingJBeam] = useState(false);
  const [creationSuccessMsg, setCreationSuccessMsg] = useState('');
  const [creationErrorMsg, setCreationErrorMsg] = useState('');

  // Infer a vehicle prefix from workspace path or folder name
  const vehiclePrefix = useMemo(() => {
    if (!workspacePath) return 'custom';
    const folder = workspacePath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'vehicle';
    return sanitizeVehicleId(folder);
  }, [workspacePath]);

  // Derived selected DAE file name
  const selectedDaeName = useMemo(() => {
    if (selectedDaePath) {
      const match = (discoveredDaeFiles || []).find(d => d.path === selectedDaePath);
      if (match?.name) return match.name;
      return selectedDaePath.split(/[\\/]/).pop();
    }
    return discoveredDaeFiles[0]?.name || '';
  }, [selectedDaePath, discoveredDaeFiles]);

  // Auto-request loading of workspace DAE file if model is detected in folder but submeshes not loaded yet
  useEffect(() => {
    if (selectedDaePath === '__none__') return;
    if (discoveredDaeFiles && discoveredDaeFiles.length > 0 && visualMeshSubnames.length === 0 && !selectedDaePath) {
      if (onSelectDaePath) {
        onSelectDaePath(discoveredDaeFiles[0].path);
      }
    }
  }, [discoveredDaeFiles, visualMeshSubnames.length, selectedDaePath, onSelectDaePath]);

  // Filtered submesh names based on search query and filter tab
  const filteredSubnames = useMemo(() => {
    let list = visualMeshSubnames;
    if (filterTab === 'spawned') {
      list = list.filter(name => spawnedMeshNames.has(name));
    } else if (filterTab === 'selected') {
      list = list.filter(name => selectedMeshes.has(name));
    }

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(name => name.toLowerCase().includes(q));
  }, [visualMeshSubnames, filterTab, searchQuery, spawnedMeshNames, selectedMeshes]);

  // Hierarchical underscore prefix tree for filtered submeshes
  const submeshTree = useMemo(() => {
    return buildSubmeshPrefixTree(filteredSubnames, visualMeshSubmeshDetails);
  }, [filteredSubnames, visualMeshSubmeshDetails]);

  const allFolderIds = useMemo(() => {
    const ids = [];
    const walk = (nodes) => {
      for (const node of nodes) {
        if (node.type === 'folder') {
          ids.push(node.id);
          walk(node.children);
        }
      }
    };
    walk(submeshTree.nodes);
    return ids;
  }, [submeshTree]);

  const areAllFoldersExpanded = allFolderIds.length > 0 && allFolderIds.every(id => expandedFolderIds.has(id));

  const toggleFolderExpand = (folderId) => {
    setExpandedFolderIds(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleToggleExpandAll = () => {
    if (areAllFoldersExpanded) {
      setExpandedFolderIds(new Set());
    } else {
      setExpandedFolderIds(new Set(allFolderIds));
    }
  };

  // Batch-toggle JBeam selection for all meshes inside a prefix folder
  const handleToggleGroupSelection = (meshNames) => {
    if (!Array.isArray(meshNames) || meshNames.length === 0) return;
    setSelectedMeshes(prev => {
      const next = new Set(prev);
      const allSelected = meshNames.every(m => next.has(m));
      if (allSelected) {
        meshNames.forEach(m => next.delete(m));
      } else {
        meshNames.forEach(m => next.add(m));
      }
      return next;
    });
    setCreationSuccessMsg('');
    setCreationErrorMsg('');
  };

  // Auto-derive part name and description based on current selection
  const derivedPartName = useMemo(() => {
    return deriveMultiMeshPartName(vehiclePrefix, selectedMeshes);
  }, [vehiclePrefix, selectedMeshes]);

  const activePartKey = useMemo(() => {
    return (customPartName.trim() || derivedPartName).replace(/[^a-zA-Z0-9_]/g, '_');
  }, [customPartName, derivedPartName]);

  const activeSlotKey = useMemo(() => {
    return (customSlotType.trim() || activePartKey).replace(/[^a-zA-Z0-9_]/g, '_');
  }, [customSlotType, activePartKey]);

  // Compute composite bounding box across all selected meshes
  const compositeBBox = useMemo(() => {
    return computeCompositeBoundingBox(selectedMeshes, visualMeshSubmeshDetails);
  }, [selectedMeshes, visualMeshSubmeshDetails]);

  // Toggle inclusion of a mesh in the JBeam creation selection (clean uncheck without side effects)
  const handleToggleMeshSelection = (meshName) => {
    setSelectedMeshes(prev => {
      const next = new Set(prev);
      if (next.has(meshName)) {
        next.delete(meshName);
      } else {
        next.add(meshName);
      }
      return next;
    });
    setCreationSuccessMsg('');
    setCreationErrorMsg('');
  };

  // Remove a specific mesh from selection (from chips)
  const handleRemoveMeshFromSelection = (meshName) => {
    setSelectedMeshes(prev => {
      const next = new Set(prev);
      next.delete(meshName);
      return next;
    });
  };

  // Quick preset: Select ALL currently spawned meshes for JBeam creation
  const handleSelectAllSpawned = () => {
    if (spawnedMeshNames.size === 0) return;
    setSelectedMeshes(new Set(spawnedMeshNames));
    setCreationSuccessMsg('');
    setCreationErrorMsg('');
  };

  // Quick preset: Clear selection
  const handleClearSelection = () => {
    setSelectedMeshes(new Set());
    setCreationSuccessMsg('');
    setCreationErrorMsg('');
  };

  // Browser file upload handler for DAE
  const handleBrowserDaeInput = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        if (onUploadDaeFile) {
          onUploadDaeFile(text, file.name);
        } else if (onLoadDaeContent) {
          onLoadDaeContent(text, file.name, file.name);
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Submit Multi-Mesh JBeam Generation
  const handleGenerateJBeam = async () => {
    if (selectedMeshes.size === 0) {
      setCreationErrorMsg('Please select at least one 3D submesh in the Submesh Explorer above.');
      return;
    }

    const meshesArray = Array.from(selectedMeshes);
    const partKey = activePartKey;
    const slotKey = activeSlotKey;
    const partDesc = customDescription.trim() || (
      meshesArray.length === 1
        ? meshesArray[0].replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        : `${partKey.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} Assembly`
    );

    setIsCreatingJBeam(true);
    setCreationSuccessMsg('');
    setCreationErrorMsg('');

    try {
      const jbeamContent = generateMultiMeshJBeam({
        partKey,
        slotKey,
        partDesc,
        targetMeshes: meshesArray,
        meshDetailsMap: visualMeshSubmeshDetails,
        templateType: 'skeleton'
      });

      const fileName = `${partKey}.jbeam`;
      if (onCreateJBeamForMesh) {
        await onCreateJBeamForMesh({
          fileName,
          content: jbeamContent,
          partKey,
          targetMesh: meshesArray[0],
          targetMeshes: meshesArray
        });
      }

      setCreationSuccessMsg(`Created ${fileName} with ${meshesArray.length} ${meshesArray.length === 1 ? 'mesh' : 'meshes'}!`);
    } catch (err) {
      console.error('Failed to create JBeam for mesh(es):', err);
      setCreationErrorMsg(err.message || 'Failed to create JBeam file.');
    } finally {
      setIsCreatingJBeam(false);
    }
  };

  const hasLoadedDae = visualMeshSubnames.length > 0;
  const spawnedCount = spawnedMeshNames ? spawnedMeshNames.size : 0;
  const selectedCount = selectedMeshes.size;

  return (
    <div className="dae-mesh-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Panel Top Header & DAE Model Selector */}
      <div className="dae-panel-header" style={{
        padding: '12px 14px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'rgba(0, 0, 0, 0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CubeIcon size={17} style={{ color: '#38bdf8' }} />
            <span style={{ fontWeight: 600, fontSize: '13px', color: '#f1f5f9', letterSpacing: '0.02em' }}>
              3D Models (.DAE)
            </span>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            {onOpenDaeDialog && (
              <button
                type="button"
                onClick={onOpenDaeDialog}
                className="dae-action-btn"
                title="Browse .DAE file from disk"
                style={{
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  color: '#38bdf8',
                  borderRadius: '4px',
                  padding: '3px 8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <FolderIcon size={12} />
                <span>Open DAE</span>
              </button>
            )}

            <label
              className="dae-action-btn"
              title="Upload .DAE from browser"
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#e2e8f0',
                borderRadius: '4px',
                padding: '3px 8px',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span>Upload</span>
              <input
                type="file"
                accept=".dae"
                onChange={handleBrowserDaeInput}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </div>

        {/* Project DAE Dropdown Selector if workspace has files */}
        {discoveredDaeFiles && discoveredDaeFiles.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>Model:</label>
            <select
              value={selectedDaePath || ''}
              onChange={(e) => onSelectDaePath && onSelectDaePath(e.target.value)}
              className="dae-select-input"
              style={{
                flex: 1,
                background: '#181b20',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#f8fafc',
                fontSize: '11px',
                padding: '4px 8px',
                borderRadius: '4px'
              }}
            >
              <option value="__none__">-- No Visual Mesh --</option>
              {discoveredDaeFiles.map(d => (
                <option key={d.path || d.name} value={d.path}>
                  {d.name}
                </option>
              ))}
              {discoveredDaeFiles.length > 1 && (
                <option value="__all__">All Project Models ({discoveredDaeFiles.length})</option>
              )}
            </select>
          </div>
        ) : (
          <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>
            {visualMeshName ? `Active: ${visualMeshName}` : 'No .dae in folder — click Open DAE or Upload'}
          </div>
        )}
      </div>

      {/* Main Body - Scrollable content with Part 1 and Part 2 */}
      <div className="dae-panel-scroll" style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {!hasLoadedDae ? (
          discoveredDaeFiles && discoveredDaeFiles.length > 0 ? (
            <div className="dae-empty-state" style={{
              textAlign: 'center',
              padding: '30px 16px',
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: '8px',
              border: '1px dashed rgba(56, 189, 248, 0.3)',
              marginTop: '10px'
            }}>
              <CubeIcon size={36} style={{ color: '#38bdf8', marginBottom: '12px' }} />
              <h4 style={{ margin: '0 0 6px', fontSize: '13px', color: '#e2e8f0', fontWeight: 600 }}>
                Loading 3D Model ({selectedDaeName || discoveredDaeFiles[0]?.name})...
              </h4>
              <p style={{ margin: '0 0 16px', fontSize: '11px', color: '#94a3b8', lineHeight: 1.5 }}>
                Reading submeshes and geometric data from project file.
              </p>
              <button
                type="button"
                onClick={() => onSelectDaePath && onSelectDaePath(selectedDaePath || discoveredDaeFiles[0].path)}
                className="btn-primary"
                style={{
                  background: '#0284c7',
                  border: 'none',
                  color: '#fff',
                  padding: '7px 14px',
                  borderRadius: '5px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Load {selectedDaeName || discoveredDaeFiles[0]?.name}
              </button>
            </div>
          ) : (
            <div className="dae-empty-state" style={{
              textAlign: 'center',
              padding: '30px 16px',
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: '8px',
              border: '1px dashed rgba(255, 255, 255, 0.12)',
              marginTop: '10px'
            }}>
              <CubeIcon size={36} style={{ color: '#475569', marginBottom: '12px' }} />
              <h4 style={{ margin: '0 0 6px', fontSize: '13px', color: '#e2e8f0', fontWeight: 600 }}>
                No 3D Model Loaded
              </h4>
              <p style={{ margin: '0 0 16px', fontSize: '11px', color: '#94a3b8', lineHeight: 1.5 }}>
                Open a .DAE Collada vehicle mesh from your project folder or upload one to spawn submeshes and generate matching JBeam files.
              </p>
              <input
                ref={emptyFileInputRef}
                type="file"
                accept=".dae"
                onChange={handleBrowserDaeInput}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => {
                  if (onOpenDaeDialog && window.jbeamAPI?.openDaeDialog) {
                    onOpenDaeDialog();
                  } else if (emptyFileInputRef.current) {
                    emptyFileInputRef.current.click();
                  }
                }}
                className="btn-primary"
                style={{
                  background: '#2563eb',
                  border: 'none',
                  color: '#fff',
                  padding: '7px 14px',
                  borderRadius: '5px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Choose .DAE File...
              </button>
            </div>
          )
        ) : (
          <>
            {/* ======================================================== */}
            {/* PART 1: Submesh Explorer & Multi-Mesh 3D Spawner         */}
            {/* ======================================================== */}
            <div className="dae-section-part1" style={{ marginBottom: '20px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#f1f5f9', letterSpacing: '0.02em' }}>
                    1. 3D Submesh Explorer
                  </span>
                  <span style={{
                    fontSize: '10px',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    background: spawnedCount > 0 ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                    color: spawnedCount > 0 ? '#38bdf8' : '#94a3b8',
                    fontWeight: 600
                  }}>
                    {spawnedCount} / {visualMeshSubnames.length} in 3D
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={onSpawnAll}
                    title="Spawn all submeshes in 3D Viewport"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#38bdf8',
                      fontSize: '11px',
                      cursor: 'pointer',
                      padding: '2px 4px'
                    }}
                  >
                    Spawn All
                  </button>
                  <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                  <button
                    type="button"
                    onClick={onDespawnAll}
                    title="Clear / hide all meshes from 3D Viewport"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#94a3b8',
                      fontSize: '11px',
                      cursor: 'pointer',
                      padding: '2px 4px'
                    }}
                  >
                    Despawn All
                  </button>
                </div>
              </div>

              {/* Filter Bar with Search and Quick Tabs */}
              <div style={{ marginBottom: '8px' }}>
                <input
                  type="text"
                  placeholder="Filter parts (hood, door, box, pipes...)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    background: 'rgba(0, 0, 0, 0.25)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '4px',
                    padding: '5px 8px',
                    fontSize: '11px',
                    color: '#f8fafc',
                    marginBottom: '6px'
                  }}
                />

                <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setFilterTab('all')}
                    style={{
                      flex: 1,
                      padding: '3px 0',
                      fontSize: '10px',
                      borderRadius: '3px',
                      border: '1px solid',
                      borderColor: filterTab === 'all' ? '#38bdf8' : 'rgba(255, 255, 255, 0.08)',
                      background: filterTab === 'all' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                      color: filterTab === 'all' ? '#38bdf8' : '#94a3b8',
                      cursor: 'pointer',
                      fontWeight: filterTab === 'all' ? 600 : 400
                    }}
                  >
                    All ({visualMeshSubnames.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTab('spawned')}
                    style={{
                      flex: 1,
                      padding: '3px 0',
                      fontSize: '10px',
                      borderRadius: '3px',
                      border: '1px solid',
                      borderColor: filterTab === 'spawned' ? '#4ade80' : 'rgba(255, 255, 255, 0.08)',
                      background: filterTab === 'spawned' ? 'rgba(74, 222, 128, 0.15)' : 'transparent',
                      color: filterTab === 'spawned' ? '#4ade80' : '#94a3b8',
                      cursor: 'pointer',
                      fontWeight: filterTab === 'spawned' ? 600 : 400
                    }}
                  >
                    Spawned ({spawnedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTab('selected')}
                    style={{
                      flex: 1,
                      padding: '3px 0',
                      fontSize: '10px',
                      borderRadius: '3px',
                      border: '1px solid',
                      borderColor: filterTab === 'selected' ? '#f59e0b' : 'rgba(255, 255, 255, 0.08)',
                      background: filterTab === 'selected' ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                      color: filterTab === 'selected' ? '#f59e0b' : '#94a3b8',
                      cursor: 'pointer',
                      fontWeight: filterTab === 'selected' ? 600 : 400
                    }}
                  >
                    For JBeam ({selectedCount})
                  </button>
                </div>

                {/* Hierarchy View Mode & Root Prefix Bar */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '6px',
                  fontSize: '10px',
                  color: '#94a3b8'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                    {explorerViewMode === 'tree' && submeshTree.rootPrefix && (
                      <span
                        title={`Common prefix "${submeshTree.rootPrefix}_" unwrapped for cleaner grouping`}
                        style={{
                          background: 'rgba(56, 189, 248, 0.1)',
                          border: '1px solid rgba(56, 189, 248, 0.25)',
                          color: '#7dd3fc',
                          padding: '1px 6px',
                          borderRadius: '3px',
                          fontFamily: 'monospace',
                          fontSize: '10px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {submeshTree.rootPrefix}_*
                      </span>
                    )}
                    {explorerViewMode === 'tree' && allFolderIds.length > 0 && !searchQuery.trim() && (
                      <button
                        type="button"
                        onClick={handleToggleExpandAll}
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '3px',
                          color: '#cbd5e1',
                          fontSize: '10px',
                          padding: '1px 6px',
                          cursor: 'pointer'
                        }}
                      >
                        {areAllFoldersExpanded ? 'Collapse All' : 'Expand All'}
                      </button>
                    )}
                  </div>

                  <div style={{
                    display: 'inline-flex',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '3px',
                    overflow: 'hidden',
                    flexShrink: 0
                  }}>
                    <button
                      type="button"
                      onClick={() => setExplorerViewMode('tree')}
                      title="Group submeshes into multi-level underscore prefix folders"
                      style={{
                        background: explorerViewMode === 'tree' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                        color: explorerViewMode === 'tree' ? '#38bdf8' : '#94a3b8',
                        border: 'none',
                        padding: '2px 7px',
                        fontSize: '10px',
                        fontWeight: explorerViewMode === 'tree' ? 600 : 400,
                        cursor: 'pointer'
                      }}
                    >
                      Tree
                    </button>
                    <button
                      type="button"
                      onClick={() => setExplorerViewMode('flat')}
                      title="Show flat list of all submeshes"
                      style={{
                        background: explorerViewMode === 'flat' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                        color: explorerViewMode === 'flat' ? '#38bdf8' : '#94a3b8',
                        border: 'none',
                        borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
                        padding: '2px 7px',
                        fontSize: '10px',
                        fontWeight: explorerViewMode === 'flat' ? 600 : 400,
                        cursor: 'pointer'
                      }}
                    >
                      Flat
                    </button>
                  </div>
                </div>
              </div>

              {/* Submeshes List (Hierarchical Underscore Tree or Flat Explorer) */}
              <div className="submeshes-scroll-box" style={{
                maxHeight: '260px',
                overflowY: 'auto',
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '6px',
                padding: '4px'
              }}>
                {filteredSubnames.length === 0 ? (
                  <div style={{ padding: '14px', textAlign: 'center', fontSize: '11px', color: '#64748b' }}>
                    {searchQuery ? `No meshes match "${searchQuery}"` : 'No meshes in this view filter'}
                  </div>
                ) : (() => {
                  const renderLeafRow = (name, displayLabel = name, depth = 0) => {
                    const isSpawned = spawnedMeshNames.has(name);
                    const isSelectedForJBeam = selectedMeshes.has(name);
                    const details = visualMeshSubmeshDetails[name];

                    return (
                      <div
                        key={name}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '4px 8px',
                          paddingLeft: `${(explorerViewMode === 'tree' ? 6 : 8) + depth * 14}px`,
                          borderRadius: '4px',
                          marginBottom: '2px',
                          background: isSelectedForJBeam
                            ? 'rgba(56, 189, 248, 0.12)'
                            : (isSpawned ? 'rgba(255, 255, 255, 0.03)' : 'transparent'),
                          border: isSelectedForJBeam
                            ? '1px solid rgba(56, 189, 248, 0.35)'
                            : '1px solid transparent',
                          transition: 'background 0.15s, border-color 0.15s'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                          {explorerViewMode === 'tree' && (
                            <span style={{ width: '11px', flexShrink: 0 }} />
                          )}
                          <input
                            type="checkbox"
                            checked={isSelectedForJBeam}
                            onChange={() => handleToggleMeshSelection(name)}
                            onClick={(e) => e.stopPropagation()}
                            title={isSelectedForJBeam ? 'Remove from JBeam part' : 'Include in JBeam part'}
                            style={{
                              accentColor: '#38bdf8',
                              cursor: 'pointer',
                              margin: 0
                            }}
                          />

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onToggleSpawnMesh) onToggleSpawnMesh(name);
                            }}
                            title={isSpawned ? 'Despawn from 3D Viewport' : 'Spawn into 3D Viewport'}
                            style={{
                              background: isSpawned ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                              border: isSpawned ? '1px solid rgba(34, 197, 94, 0.5)' : '1px solid rgba(255, 255, 255, 0.15)',
                              color: isSpawned ? '#4ade80' : '#64748b',
                              borderRadius: '3px',
                              padding: '2px 4px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            {isSpawned ? <EyeIcon size={12} /> : <EyeOffIcon size={12} />}
                          </button>

                          <span
                            onClick={() => handleToggleMeshSelection(name)}
                            title={name}
                            style={{
                              fontSize: '11px',
                              fontWeight: isSelectedForJBeam ? 600 : 500,
                              color: isSelectedForJBeam ? '#38bdf8' : (isSpawned ? '#f1f5f9' : '#94a3b8'),
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              cursor: 'pointer',
                              userSelect: 'none'
                            }}
                          >
                            {displayLabel}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                          {isSelectedForJBeam && (
                            <span style={{
                              fontSize: '9px',
                              color: '#38bdf8',
                              background: 'rgba(56, 189, 248, 0.2)',
                              padding: '1px 4px',
                              borderRadius: '3px',
                              fontWeight: 600
                            }}>
                              JBeam
                            </span>
                          )}

                          {details && (
                            <span style={{
                              fontSize: '10px',
                              color: '#64748b',
                              background: 'rgba(255, 255, 255, 0.04)',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              whiteSpace: 'nowrap'
                            }}>
                              {details.triangles ? `${details.triangles.toLocaleString()} tris` : `${details.vertices || 0} pts`}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  };

                  const renderTreeNode = (node, depth = 0) => {
                    if (node.type === 'leaf') {
                      return renderLeafRow(node.name, node.label, depth);
                    }

                    const isExpanded = Boolean(searchQuery.trim()) || expandedFolderIds.has(node.id);
                    const allSelected = node.meshNames.every(m => selectedMeshes.has(m));
                    const someSelected = !allSelected && node.meshNames.some(m => selectedMeshes.has(m));
                    const spawnedInGroup = node.meshNames.filter(m => spawnedMeshNames.has(m)).length;
                    const allSpawned = spawnedInGroup === node.meshCount;
                    const someSpawned = !allSpawned && spawnedInGroup > 0;

                    return (
                      <div key={node.id}>
                        <div
                          onClick={() => toggleFolderExpand(node.id)}
                          title={`${node.label} (${node.meshCount} meshes${node.totalTriangles > 0 ? `, ${node.totalTriangles.toLocaleString()} tris` : ''})`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '4px 8px',
                            paddingLeft: `${6 + depth * 14}px`,
                            borderRadius: '4px',
                            marginBottom: '2px',
                            background: allSelected
                              ? 'rgba(56, 189, 248, 0.14)'
                              : 'rgba(255, 255, 255, 0.04)',
                            border: someSelected || allSelected
                              ? '1px solid rgba(56, 189, 248, 0.28)'
                              : '1px solid rgba(255, 255, 255, 0.05)',
                            cursor: 'pointer',
                            userSelect: 'none'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#94a3b8',
                              transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                              transition: 'transform 0.12s ease',
                              flexShrink: 0
                            }}>
                              <ChevronDownIcon size={11} />
                            </span>

                            <input
                              type="checkbox"
                              checked={allSelected}
                              ref={(el) => {
                                if (el) el.indeterminate = someSelected;
                              }}
                              onChange={() => handleToggleGroupSelection(node.meshNames)}
                              onClick={(e) => e.stopPropagation()}
                              title={allSelected ? `Uncheck all ${node.meshCount} meshes in ${node.label}` : `Include all ${node.meshCount} meshes in ${node.label}`}
                              style={{
                                accentColor: '#38bdf8',
                                cursor: 'pointer',
                                margin: 0,
                                flexShrink: 0
                              }}
                            />

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onToggleSpawnMesh) onToggleSpawnMesh(node.meshNames);
                              }}
                              title={allSpawned ? `Despawn all ${node.meshCount} in ${node.label}` : `Spawn all ${node.meshCount} in ${node.label}`}
                              style={{
                                background: allSpawned
                                  ? 'rgba(34, 197, 94, 0.2)'
                                  : someSpawned
                                    ? 'rgba(56, 189, 248, 0.18)'
                                    : 'rgba(255, 255, 255, 0.06)',
                                border: allSpawned
                                  ? '1px solid rgba(34, 197, 94, 0.5)'
                                  : someSpawned
                                    ? '1px solid rgba(56, 189, 248, 0.45)'
                                    : '1px solid rgba(255, 255, 255, 0.15)',
                                color: allSpawned ? '#4ade80' : (someSpawned ? '#38bdf8' : '#64748b'),
                                borderRadius: '3px',
                                padding: '2px 4px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                              }}
                            >
                              {allSpawned || someSpawned ? <EyeIcon size={12} /> : <EyeOffIcon size={12} />}
                            </button>

                            <span style={{ display: 'inline-flex', color: '#38bdf8', flexShrink: 0 }}>
                              <FolderIcon size={12} />
                            </span>

                            <span style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              color: '#e2e8f0',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              {node.label}
                            </span>

                            <span style={{
                              fontSize: '9.5px',
                              color: '#7dd3fc',
                              background: 'rgba(56, 189, 248, 0.14)',
                              padding: '0px 5px',
                              borderRadius: '8px',
                              fontWeight: 600,
                              flexShrink: 0
                            }}>
                              {node.meshCount}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                            {node.totalTriangles > 0 && (
                              <span style={{
                                fontSize: '10px',
                                color: '#64748b',
                                background: 'rgba(255, 255, 255, 0.04)',
                                padding: '1px 5px',
                                borderRadius: '3px',
                                whiteSpace: 'nowrap'
                              }}>
                                {node.totalTriangles > 999
                                  ? `${(node.totalTriangles / 1000).toFixed(1)}k tris`
                                  : `${node.totalTriangles} tris`}
                              </span>
                            )}
                          </div>
                        </div>

                        {isExpanded && node.children.map(child => renderTreeNode(child, depth + 1))}
                      </div>
                    );
                  };

                  if (explorerViewMode === 'flat') {
                    return filteredSubnames.map(name => renderLeafRow(name, name, 0));
                  }
                  return submeshTree.nodes.map(node => renderTreeNode(node, 0));
                })()}
              </div>

              {/* Viewport Render Controls */}
              <div style={{
                marginTop: '10px',
                padding: '8px 10px',
                background: 'rgba(0, 0, 0, 0.15)',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                  <label style={{ fontSize: '10px', color: '#94a3b8', whiteSpace: 'nowrap' }}>Opacity:</label>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={meshOpacity}
                    onChange={(e) => onMeshOpacityChange && onMeshOpacityChange(parseFloat(e.target.value))}
                    style={{ flex: 1, accentColor: '#38bdf8', height: '4px' }}
                  />
                  <span style={{ fontSize: '10px', color: '#cbd5e1', minWidth: '28px' }}>
                    {Math.round(meshOpacity * 100)}%
                  </span>
                </div>

                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '10px',
                  color: '#94a3b8',
                  cursor: 'pointer'
                }}>
                  <input
                    type="checkbox"
                    checked={meshWireframe}
                    onChange={(e) => onMeshWireframeChange && onMeshWireframeChange(e.target.checked)}
                    style={{ accentColor: '#38bdf8' }}
                  />
                  <span>Wireframe</span>
                </label>
              </div>
            </div>

            {/* ======================================================== */}
            {/* PART 2: Create JBeam File for Selected 3D Meshes         */}
            {/* ======================================================== */}
            <div className="dae-section-part2" style={{
              background: 'rgba(0, 0, 0, 0.25)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: '8px',
              padding: '12px 14px'
            }}>
              {/* Header with Selected Mesh Count Badge */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FilePlusIcon size={14} style={{ color: '#38bdf8' }} />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#f1f5f9', letterSpacing: '0.02em' }}>
                    2. Create JBeam for 3D Mesh(es)
                  </span>
                </div>
                <span style={{
                  fontSize: '10px',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  background: selectedCount > 0 ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                  color: selectedCount > 0 ? '#38bdf8' : '#94a3b8',
                  fontWeight: 600
                }}>
                  {selectedCount} {selectedCount === 1 ? 'Mesh' : 'Meshes'} Included
                </span>
              </div>

              {/* Feedback Notifications */}
              {creationSuccessMsg && (
                <div style={{
                  padding: '6px 10px',
                  background: 'rgba(34, 197, 94, 0.15)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: '4px',
                  color: '#4ade80',
                  fontSize: '11px',
                  marginBottom: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <CheckIcon size={12} />
                  <span>{creationSuccessMsg}</span>
                </div>
              )}

              {creationErrorMsg && (
                <div style={{
                  padding: '6px 10px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '4px',
                  color: '#f87171',
                  fontSize: '11px',
                  marginBottom: '10px'
                }}>
                  {creationErrorMsg}
                </div>
              )}

              {/* Quick Actions Row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <button
                  type="button"
                  onClick={handleSelectAllSpawned}
                  disabled={spawnedCount === 0}
                  title="Include all currently spawned 3D meshes in this JBeam part"
                  style={{
                    background: 'rgba(56, 189, 248, 0.1)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    color: '#38bdf8',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 600,
                    cursor: spawnedCount === 0 ? 'not-allowed' : 'pointer',
                    opacity: spawnedCount === 0 ? 0.5 : 1
                  }}
                >
                  Use All Spawned in 3D ({spawnedCount})
                </button>

                {selectedCount > 0 && (
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#94a3b8',
                      fontSize: '10px',
                      cursor: 'pointer',
                      padding: '2px 4px'
                    }}
                  >
                    Clear Selection
                  </button>
                )}
              </div>

              {/* Selected Submeshes Chip Cloud (Uses Explorer solely for selection) */}
              <div style={{
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '6px',
                padding: '6px',
                marginBottom: '10px',
                minHeight: '44px'
              }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' }}>
                  {Array.from(selectedMeshes).map(name => (
                    <span
                      key={name}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        background: 'rgba(56, 189, 248, 0.15)',
                        border: '1px solid rgba(56, 189, 248, 0.35)',
                        borderRadius: '4px',
                        padding: '2px 6px',
                        fontSize: '11px',
                        color: '#f0f9ff'
                      }}
                    >
                      <span title={name} style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {name}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveMeshFromSelection(name)}
                        title={`Remove ${name} from JBeam part`}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#38bdf8',
                          cursor: 'pointer',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                          lineHeight: 1
                        }}
                      >
                        <CloseIcon size={10} />
                      </button>
                    </span>
                  ))}
                </div>

                {selectedCount === 0 && (
                  <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', padding: '4px 0' }}>
                    Select meshes in the 3D Submesh Explorer above, or click "Use All Spawned in 3D".
                  </div>
                )}
              </div>

              {/* Combined Dimensions & Metrics Card */}
              <div style={{
                padding: '8px 10px',
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.2)',
                borderRadius: '6px',
                marginBottom: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Combined 3D Bounds
                  </span>
                  {compositeBBox?.totalTriangles > 0 && (
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                      {compositeBBox.totalTriangles.toLocaleString()} total tris
                    </span>
                  )}
                </div>

                {compositeBBox?.hasBBox ? (
                  <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: '#f1f5f9' }}>
                    <span><b>Width (X):</b> {compositeBBox.size.x.toFixed(2)}m</span>
                    <span style={{ color: 'rgba(255,255,255,0.2)' }}>•</span>
                    <span><b>Length (Y):</b> {compositeBBox.size.y.toFixed(2)}m</span>
                    <span style={{ color: 'rgba(255,255,255,0.2)' }}>•</span>
                    <span><b>Height (Z):</b> {compositeBBox.size.z.toFixed(2)}m</span>
                  </div>
                ) : (
                  <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>
                    Select submeshes in Explorer to inspect geometry dimensions.
                  </div>
                )}
              </div>

              {/* JBeam Part ID & Filename */}
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>
                  Part ID / Filename (.jbeam):
                </label>
                <input
                  type="text"
                  value={customPartName || derivedPartName}
                  onChange={(e) => setCustomPartName(e.target.value)}
                  placeholder="e.g. apex_gt_tanker_bed"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    background: 'rgba(0, 0, 0, 0.25)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '4px',
                    padding: '5px 8px',
                    fontSize: '11px',
                    color: '#f8fafc'
                  }}
                />
              </div>

              {/* Slot Type */}
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>
                  Slot Type:
                </label>
                <input
                  type="text"
                  value={customSlotType || activePartKey}
                  onChange={(e) => setCustomSlotType(e.target.value)}
                  placeholder="e.g. apex_gt_tanker_bed"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    background: 'rgba(0, 0, 0, 0.25)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '4px',
                    padding: '5px 8px',
                    fontSize: '11px',
                    color: '#f8fafc'
                  }}
                />
              </div>

              {/* Live Flexbody Binding Code Preview */}
              <div style={{
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '5px',
                padding: '6px 8px',
                marginBottom: '12px'
              }}>
                <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '4px', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Generated Flexbodies ({selectedCount}):</span>
                  <span style={{ color: '#38bdf8' }}>BeamNG Standard</span>
                </div>
                <div style={{
                  maxHeight: '75px',
                  overflowY: 'auto',
                  fontFamily: 'monospace',
                  fontSize: '10px',
                  lineHeight: '1.4',
                  color: '#93c5fd'
                }}>
                  {selectedCount === 0 ? (
                    <span style={{ color: '#64748b' }}>// Select meshes to preview flexbody bindings</span>
                  ) : (
                    Array.from(selectedMeshes).map((m, i) => (
                      <div key={m}>
                        ["{m}", ["{activePartKey}"]]{i < selectedCount - 1 ? ',' : ''}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Create Button */}
              <button
                type="button"
                onClick={handleGenerateJBeam}
                disabled={isCreatingJBeam || selectedCount === 0}
                className="btn-primary"
                style={{
                  width: '100%',
                  background: selectedCount > 0 ? '#0284c7' : '#334155',
                  border: 'none',
                  color: '#ffffff',
                  padding: '8px 12px',
                  borderRadius: '5px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: isCreatingJBeam ? 'wait' : (selectedCount > 0 ? 'pointer' : 'not-allowed'),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  opacity: isCreatingJBeam || selectedCount === 0 ? 0.6 : 1
                }}
              >
                <FilePlusIcon size={14} />
                <span>
                  {isCreatingJBeam
                    ? 'Creating JBeam File...'
                    : `Create ${activePartKey}.jbeam (${selectedCount} ${selectedCount === 1 ? 'Mesh' : 'Meshes'})`}
                </span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default DaeMeshPanel;
