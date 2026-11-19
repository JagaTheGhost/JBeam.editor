/**
 * JBeam Studio - Dedicated Mechanical Workspace
 * Coordinates the mechanical subsystems tree, component inspector,
 * 3D spatial isolation, and two-way JBeam synchronization.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { extractMechanicalOverview } from './mechanicalExtractor.js';
import { MechanicalTree } from './MechanicalTree.jsx';
import { MechanicalInspector } from './MechanicalInspector.jsx';

export function MechanicalWorkspace({
  jbeamParts,
  compositeVehicleParts = null,
  workspaceIndex = null,
  activeDocumentText = '',
  activePartName = 'main',
  workspacePath = null,
  onNavigateToElement = null,
  onFocusNodeIn3D = null,
  onSelectSubmesh = null,
  onIsolateMesh = null
}) {
  const [scope, setScope] = useState('assembly'); // 'assembly' | 'activeDocument'
  const [selectedCategory, setSelectedCategory] = useState(null); // 'device' | 'hydro' | 'mount' | 'energy'
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [selectedItemData, setSelectedItemData] = useState(null);
  const [inspectorHeight, setInspectorHeight] = useState(260);
  const isResizingRef = React.useRef(false);

  const handleSplitterMouseDown = useCallback((e) => {
    e.preventDefault();
    isResizingRef.current = true;
    const startY = e.clientY;
    const startH = inspectorHeight;

    const handleMouseMove = (moveEvent) => {
      if (!isResizingRef.current) return;
      const deltaY = moveEvent.clientY - startY;
      const newH = Math.max(140, Math.min(window.innerHeight * 0.65, startH - deltaY));
      setInspectorHeight(newH);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [inspectorHeight]);

  // Active parts map according to chosen scope
  const targetParts = useMemo(() => {
    if (scope === 'assembly' && compositeVehicleParts && Object.keys(compositeVehicleParts).length > 0) {
      return compositeVehicleParts;
    }
    return jbeamParts || {};
  }, [scope, compositeVehicleParts, jbeamParts]);

  // Extract full mechanical overview
  const overview = useMemo(() => {
    return extractMechanicalOverview(targetParts, activePartName);
  }, [targetParts, activePartName]);

  const handleSelectItem = useCallback((category, id, data) => {
    setSelectedCategory(category);
    setSelectedItemId(id);
    setSelectedItemData(data);

    const targetPart = data?.partName || activePartName;
    const resolvedFilePath = data?.filePath || (workspaceIndex?.partsMap?.[targetPart]?.filePath) || (compositeVehicleParts?.[targetPart]?.__filePath);

    // Auto-correlate 3D elements if applicable
    if (category === 'device') {
      if (data?.boundMeshes && data.boundMeshes.length > 0 && onSelectSubmesh) {
        onSelectSubmesh(data.boundMeshes[0]);
      }
      if (data?.boundNodes && data.boundNodes.length > 0 && onFocusNodeIn3D) {
        onFocusNodeIn3D(data.boundNodes[0], {
          partName: targetPart,
          filePath: resolvedFilePath,
          allBoundNodes: data.boundNodes,
          boundMeshes: data.boundMeshes,
          category,
          item: data
        });
      }
    } else if (category === 'hydro' || category === 'mount') {
      if (data?.id1 && onFocusNodeIn3D) {
        onFocusNodeIn3D(data.id1, {
          partName: targetPart,
          filePath: resolvedFilePath,
          otherNodeId: data.id2,
          allBoundNodes: [data.id1, data.id2].filter(Boolean),
          category,
          item: data
        });
      }
    }
  }, [onSelectSubmesh, onFocusNodeIn3D, activePartName, workspaceIndex, compositeVehicleParts]);

  const handleFocus3D = useCallback((category, item) => {
    if (!item) return;
    const targetPart = item.partName || activePartName;
    const resolvedFilePath = item.filePath || (workspaceIndex?.partsMap?.[targetPart]?.filePath) || (compositeVehicleParts?.[targetPart]?.__filePath);

    if (category === 'device') {
      if (item.boundNodes && item.boundNodes.length > 0 && onFocusNodeIn3D) {
        onFocusNodeIn3D(item.boundNodes[0], {
          partName: targetPart,
          filePath: resolvedFilePath,
          allBoundNodes: item.boundNodes,
          boundMeshes: item.boundMeshes,
          category,
          item
        });
      } else if (item.boundMeshes && item.boundMeshes.length > 0 && onSelectSubmesh) {
        onSelectSubmesh(item.boundMeshes[0]);
      } else if (onFocusNodeIn3D) {
        onFocusNodeIn3D(null, {
          partName: targetPart,
          filePath: resolvedFilePath,
          boundMeshes: item.boundMeshes,
          category,
          item
        });
      }
    } else if (category === 'hydro' || category === 'mount') {
      if (item.id1 && onFocusNodeIn3D) {
        onFocusNodeIn3D(item.id1, {
          partName: targetPart,
          filePath: resolvedFilePath,
          otherNodeId: item.id2,
          allBoundNodes: [item.id1, item.id2].filter(Boolean),
          category,
          item
        });
      }
    } else if (category === 'energy') {
      if (item.boundNodes && item.boundNodes.length > 0 && onFocusNodeIn3D) {
        onFocusNodeIn3D(item.boundNodes[0], {
          partName: targetPart,
          filePath: resolvedFilePath,
          allBoundNodes: item.boundNodes,
          category,
          item
        });
      }
    }
  }, [onFocusNodeIn3D, onSelectSubmesh, activePartName, workspaceIndex, compositeVehicleParts]);

  const handleJumpToCode = useCallback((category, item) => {
    if (!item || !onNavigateToElement) return;
    const targetName = category === 'device' ? item.name : (category === 'hydro' ? (item.beamName || item.id1) : (item.breakGroup || item.id1));
    const targetPart = item.partName || activePartName;
    const resolvedFilePath = item.filePath || (workspaceIndex?.partsMap?.[targetPart]?.filePath) || (compositeVehicleParts?.[targetPart]?.__filePath);
    onNavigateToElement({
      name: targetName,
      type: category === 'device' ? 'powertrain' : (category === 'hydro' ? 'hydros' : 'beams'),
      partName: targetPart,
      filePath: resolvedFilePath,
      boundNodes: item.boundNodes,
      item
    });
  }, [onNavigateToElement, activePartName, workspaceIndex, compositeVehicleParts]);

  return (
    <div className="mechanical-workspace-container">
      {/* Primary Tree Navigation Dock */}
      <MechanicalTree
        overview={overview}
        selectedItemId={selectedItemId}
        selectedCategory={selectedCategory}
        onSelectItem={handleSelectItem}
        scope={scope}
        onChangeScope={setScope}
        hasAssembly={Boolean(compositeVehicleParts && Object.keys(compositeVehicleParts).length > 0)}
        onFocus3D={handleFocus3D}
        activeDocumentName={activePartName}
      />

      {/* Resizer Splitter between Tree and Inspector */}
      {selectedItemId && (
        <div
          className="mechanical-splitter-bar"
          onMouseDown={handleSplitterMouseDown}
          title="Drag up or down to resize Inspector panel"
        >
          <div className="mechanical-splitter-grip" />
        </div>
      )}

      {/* Inspector Dock (Visible when an element is active) */}
      {selectedItemId && (
        <MechanicalInspector
          selectedCategory={selectedCategory}
          selectedItem={selectedItemData}
          panelHeight={inspectorHeight}
          onFocus3D={handleFocus3D}
          onJumpToCode={handleJumpToCode}
          onIsolateMesh={onIsolateMesh}
          onDeselect={() => {
            setSelectedItemId(null);
            setSelectedCategory(null);
            setSelectedItemData(null);
          }}
        />
      )}
    </div>
  );
}

export default MechanicalWorkspace;
