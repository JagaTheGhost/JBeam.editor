/**
 * JBeam Studio - Dedicated Mechanical Workspace
 * Coordinates the mechanical subsystems tree, component inspector,
 * 3D spatial hover/focus isolation, and two-way JBeam synchronization.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { extractMechanicalOverview } from './mechanicalExtractor.js';
import { MechanicalTree } from './MechanicalTree.jsx';
import { MechanicalInspector } from './MechanicalInspector.jsx';

export function MechanicalWorkspace({
  jbeamParts,
  compositeVehicleParts = null,
  openTabsParts = null,
  workspaceIndex = null,
  activeDocumentText = '',
  activePartName = 'main',
  workspacePath = null,
  onNavigateToElement = null,
  onFocusNodeIn3D = null,
  onHoverElement = null,
  onSelectSubmesh = null,
  onIsolateMesh = null,
  onUpdateBeamProperties = null
}) {
  const hasAssembly = Boolean(compositeVehicleParts && Object.keys(compositeVehicleParts).length > 0);
  const hasOpenTabs = Boolean(openTabsParts && Object.keys(openTabsParts).length > 0);

  const [scope, setScope] = useState(hasAssembly ? 'assembly' : (hasOpenTabs ? 'openTabs' : 'activeDocument'));
  const [selectedCategory, setSelectedCategory] = useState(null);
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
    if (scope === 'openTabs' && openTabsParts && Object.keys(openTabsParts).length > 0) {
      return openTabsParts;
    }
    return jbeamParts || {};
  }, [scope, compositeVehicleParts, openTabsParts, jbeamParts]);

  // Extract full mechanical overview
  const overview = useMemo(() => {
    return extractMechanicalOverview(targetParts, activePartName);
  }, [targetParts, activePartName]);

  const handleHoverItem = useCallback((category, item) => {
    if (!onHoverElement) return;
    if (!category || !item) {
      onHoverElement(null);
      return;
    }
    if (category === 'hydro' || category === 'mount' || (category === 'suspension' && item.id1 && item.id2 && item.kind !== 'torsionbar' && item.kind !== 'rail')) {
      onHoverElement({
        type: 'beam',
        id1: item.id1,
        id2: item.id2,
        partName: item.partName
      });
    } else if (item.boundNodes && item.boundNodes.length > 0) {
      onHoverElement({
        nodes: item.boundNodes.map(id => ({ type: 'node', id, partName: item.partName }))
      });
    } else if (item.id1) {
      onHoverElement({ type: 'node', id: item.id1, partName: item.partName });
    } else {
      onHoverElement(null);
    }
  }, [onHoverElement]);

  const handleSelectItem = useCallback((category, id, data) => {
    setSelectedCategory(category);
    setSelectedItemId(id);
    setSelectedItemData(data);

    const targetPart = data?.partName || activePartName;
    const resolvedFilePath = data?.filePath || (workspaceIndex?.partsMap?.[targetPart]?.filePath) || (compositeVehicleParts?.[targetPart]?.__filePath);

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
    } else if (category === 'hydro' || category === 'mount' || category === 'suspension' || category === 'brakes') {
      if (data?.id1 && onFocusNodeIn3D) {
        onFocusNodeIn3D(data.id1, {
          partName: targetPart,
          filePath: resolvedFilePath,
          otherNodeId: data.id2,
          allBoundNodes: data.boundNodes || [data.id1, data.id2].filter(Boolean),
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
    } else if (item.id1 && onFocusNodeIn3D) {
      onFocusNodeIn3D(item.id1, {
        partName: targetPart,
        filePath: resolvedFilePath,
        otherNodeId: item.id2,
        allBoundNodes: item.boundNodes || [item.id1, item.id2].filter(Boolean),
        category,
        item
      });
    }
  }, [onFocusNodeIn3D, onSelectSubmesh, activePartName, workspaceIndex, compositeVehicleParts]);

  const handleJumpToCode = useCallback((category, item) => {
    if (!item || !onNavigateToElement) return;
    const targetName =
      category === 'device' ? item.name :
      category === 'hydro' ? (item.beamName || item.id1) :
      category === 'variable' ? item.name :
      category === 'brakes' ? item.name :
      (item.breakGroup || item.id1 || item.name);

    const typeMap = {
      device: 'powertrain',
      hydro: 'hydros',
      mount: 'beams',
      suspension: item.kind === 'torsionbar' ? 'torsionbars' : (item.kind === 'rail' ? 'rails' : (item.kind === 'slidenode' ? 'slidenodes' : 'beams')),
      brakes: 'pressureWheels',
      energy: 'energyStorage',
      variable: 'variables'
    };

    const targetPart = item.partName || activePartName;
    const resolvedFilePath = item.filePath || (workspaceIndex?.partsMap?.[targetPart]?.filePath) || (compositeVehicleParts?.[targetPart]?.__filePath);
    onNavigateToElement({
      name: targetName,
      type: typeMap[category] || 'beams',
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
        hasAssembly={hasAssembly}
        hasOpenTabs={hasOpenTabs}
        onFocus3D={handleFocus3D}
        onHoverItem={handleHoverItem}
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
          onUpdateBeamProperties={onUpdateBeamProperties}
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
