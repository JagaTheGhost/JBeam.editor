import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

/**
 * BlenderOrientationGizmo
 * 
 * Authentic Blender 3D Viewport Navigation & Orientation Gizmo
 * - Rotates synchronously in real-time with the Three.js viewport camera
 * - 6 Color-coded axes (X, Y, Z, -X, -Y, -Z) with authentic depth-sorting
 * - Interactive: Click any bubble to smoothly snap camera to that principal view
 * - Drag anywhere on gizmo / center hub to fluidly orbit the 3D camera
 * - Integrated Blender navigation controls: Smooth Zoom, Screen Pan, Perspective/Ortho, and Fit
 */
export function BlenderOrientationGizmo({
  cameraRef,
  orbitControlsRef,
  onSetPreset,
  onFit,
  viewPreset,
  isPanMode = false,
  onTogglePan
}) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [hoveredAxis, setHoveredAxis] = useState(null);
  const [isDraggingGizmo, setIsDraggingGizmo] = useState(false);

  // Drag & Click tracking state
  const dragRef = useRef({
    isDragging: false,
    hasMoved: false,
    dragType: null, // 'orbit' | 'zoom' | 'pan'
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    targetPreset: null
  });

  // Camera Quat state for 60fps SVG projection
  const [, setTick] = useState(0);

  // Axis definitions in Three.js coordinates
  // BeamNG Coordinate Mapping:
  //   X Lateral: Driver side (+X BeamNG) = (-1, 0, 0) Three.js; Passenger side (-X BeamNG) = (1, 0, 0) Three.js
  //   Y Longitudinal: Front (-Y BeamNG) = (0, 0, -1) Three.js; Rear (+Y BeamNG) = (0, 0, 1) Three.js
  //   Z Vertical: Up (+Z BeamNG) = (0, 1, 0) Three.js; Down (-Z BeamNG) = (0, -1, 0) Three.js
  const axesDef = [
    {
      id: 'x-pos',
      label: 'X',
      color: '#ea384c', // Red
      vec: new THREE.Vector3(1, 0, 0),
      preset: 'side-right',
      title: 'Right Side View (+X Passenger)',
      isPositive: true
    },
    {
      id: 'x-neg',
      label: '-X',
      color: '#ea384c',
      vec: new THREE.Vector3(-1, 0, 0),
      preset: 'side',
      title: 'Left Side View (-X Driver)',
      isPositive: false
    },
    {
      id: 'z-pos',
      label: 'Z',
      color: '#388bfd', // Blue
      vec: new THREE.Vector3(0, 1, 0),
      preset: 'top',
      title: 'Top View (+Z Vertical)',
      isPositive: true
    },
    {
      id: 'z-neg',
      label: '-Z',
      color: '#388bfd',
      vec: new THREE.Vector3(0, -1, 0),
      preset: 'bottom',
      title: 'Bottom View (-Z Vertical)',
      isPositive: false
    },
    {
      id: 'y-front',
      label: 'Y',
      color: '#38d39f', // Green
      vec: new THREE.Vector3(0, 0, -1),
      preset: 'front',
      title: 'Front View (-Y Forward)',
      isPositive: true
    },
    {
      id: 'y-rear',
      label: '-Y',
      color: '#38d39f',
      vec: new THREE.Vector3(0, 0, 1),
      preset: 'rear',
      title: 'Rear View (+Y Backward)',
      isPositive: false
    }
  ];

  // Animation loop to keep gizmo in sync with camera rotations
  useEffect(() => {
    let animId;
    const lastQuat = new THREE.Quaternion();

    const checkCamera = () => {
      animId = requestAnimationFrame(checkCamera);
      const cam = cameraRef?.current;
      if (!cam) return;

      if (!cam.quaternion.equals(lastQuat)) {
        lastQuat.copy(cam.quaternion);
        // Trigger React re-render of SVG projection
        setTick(t => (t + 1) % 1000000);
      }
    };

    animId = requestAnimationFrame(checkCamera);
    return () => cancelAnimationFrame(animId);
  }, [cameraRef]);

  // Project 3D axes onto 2D Gizmo circle
  const center = 50;
  const radius = 34; // Radius of outer bubbles
  const cam = cameraRef?.current;
  const invQuat = cam ? cam.quaternion.clone().invert() : new THREE.Quaternion();

  const projectedAxes = axesDef.map(axis => {
    const p = axis.vec.clone().applyQuaternion(invQuat);
    return {
      ...axis,
      x: center + p.x * radius,
      y: center - p.y * radius, // Invert Y for screen coordinates
      depth: p.z // Depth along camera view axis (-1 = into screen, +1 = toward viewer)
    };
  });

  // Depth sorting: Back axes first, then center pivot, then front axes
  projectedAxes.sort((a, b) => a.depth - b.depth);

  // Orbit camera via Gizmo drag or Click to snap
  const handlePointerDownGizmo = (e, dragType = 'orbit') => {
    e.preventDefault();
    e.stopPropagation();

    dragRef.current = {
      isDragging: false,
      hasMoved: false,
      dragType,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      targetPreset: dragRef.current.targetPreset || null
    };

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
  };

  const handlePointerMoveGizmo = (e) => {
    const drag = dragRef.current;
    if (!drag.dragType) return;

    const totalDist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
    if (!drag.hasMoved && totalDist > 3) {
      drag.hasMoved = true;
      drag.isDragging = true;
      setIsDraggingGizmo(true);
    }

    if (!drag.isDragging) return;

    e.preventDefault();
    e.stopPropagation();

    const cam = cameraRef?.current;
    const controls = orbitControlsRef?.current;
    if (!cam || !controls) return;

    const dx = e.clientX - drag.lastX;
    const dy = e.clientY - drag.lastY;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;

    const target = controls.target;
    const offset = new THREE.Vector3().subVectors(cam.position, target);

    if (drag.dragType === 'orbit') {
      const spherical = new THREE.Spherical().setFromVector3(offset);
      spherical.theta -= dx * 0.015;
      spherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, spherical.phi - dy * 0.015));
      offset.setFromSpherical(spherical);
      cam.position.copy(target).add(offset);
      cam.lookAt(target);
      controls.update();
    } else if (drag.dragType === 'zoom') {
      const factor = 1 - dy * 0.015;
      offset.multiplyScalar(Math.max(0.1, factor));
      cam.position.copy(target).add(offset);
      controls.update();
    } else if (drag.dragType === 'pan') {
      const dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      const right = new THREE.Vector3().crossVectors(cam.up, dir).negate().normalize();
      const up = new THREE.Vector3().copy(cam.up).normalize();

      const pan = right.clone().multiplyScalar(-dx * 0.005).add(up.clone().multiplyScalar(dy * 0.005));
      cam.position.add(pan);
      target.add(pan);
      controls.target.copy(target);
      controls.update();
    }
  };

  const handlePointerUpGizmo = (e) => {
    const drag = dragRef.current;
    if (drag.dragType) {
      if (!drag.hasMoved && drag.targetPreset) {
        if (onSetPreset) onSetPreset(drag.targetPreset);
      }
      drag.isDragging = false;
      drag.hasMoved = false;
      drag.dragType = null;
      drag.targetPreset = null;
      setIsDraggingGizmo(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
  };

  // Zoom button click
  const handleZoomClick = (dir = 1) => {
    const cam = cameraRef?.current;
    const controls = orbitControlsRef?.current;
    if (!cam || !controls) return;
    const target = controls.target;
    const offset = new THREE.Vector3().subVectors(cam.position, target);
    offset.multiplyScalar(dir > 0 ? 0.85 : 1.18);
    cam.position.copy(target).add(offset);
    controls.update();
  };

  return (
    <div
      ref={containerRef}
      className={`blender-orientation-gizmo-wrapper ${isDraggingGizmo ? 'dragging' : ''}`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* 3D Orientation Bubble Gizmo */}
      <div
        className="blender-gizmo-sphere-container"
        onPointerDown={(e) => handlePointerDownGizmo(e, 'orbit')}
        onPointerMove={handlePointerMoveGizmo}
        onPointerUp={handlePointerUpGizmo}
        onPointerCancel={handlePointerUpGizmo}
      >
        <svg
          ref={svgRef}
          width="100"
          height="100"
          viewBox="0 0 100 100"
          className="blender-gizmo-svg"
        >
          {/* Authentic 3D Radial Gradients for Spheres */}
          <defs>
            <radialGradient id="gizmo-grad-x" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#ff7b89" />
              <stop offset="55%" stopColor="#ea384c" />
              <stop offset="100%" stopColor="#991b1b" />
            </radialGradient>
            <radialGradient id="gizmo-grad-y" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#6ee7b7" />
              <stop offset="55%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#047857" />
            </radialGradient>
            <radialGradient id="gizmo-grad-z" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#93c5fd" />
              <stop offset="55%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </radialGradient>
          </defs>

          {/* Guidance Disc - Translucent Dark Glass */}
          <circle
            cx={center}
            cy={center}
            r="44"
            fill="rgba(18, 20, 26, 0.65)"
            stroke="rgba(255, 255, 255, 0.12)"
            strokeWidth="1"
          />

          {/* Render axes sorted by depth */}
          {projectedAxes.map((axis) => {
            const isHovered = hoveredAxis === axis.id;
            const isActive = viewPreset === axis.preset;
            const bubbleRadius = axis.isPositive ? 9.5 : 5.5;

            const getFill = () => {
              if (axis.isPositive) {
                if (axis.id === 'x-pos') return 'url(#gizmo-grad-x)';
                if (axis.id === 'y-front') return 'url(#gizmo-grad-y)';
                return 'url(#gizmo-grad-z)';
              }
              return isHovered ? axis.color : 'rgba(20, 22, 28, 0.88)';
            };

            return (
              <g
                key={axis.id}
                className={`gizmo-axis-group ${isHovered ? 'hovered' : ''} ${isActive ? 'active-axis' : ''}`}
                onPointerEnter={() => setHoveredAxis(axis.id)}
                onPointerLeave={() => setHoveredAxis(null)}
                onPointerDown={(e) => {
                  dragRef.current.targetPreset = axis.preset;
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onSetPreset) onSetPreset(axis.preset);
                }}
                style={{ cursor: 'pointer' }}
              >
                {/* Connecting stem line */}
                <line
                  x1={center}
                  y1={center}
                  x2={axis.x}
                  y2={axis.y}
                  stroke={axis.color}
                  strokeWidth={axis.isPositive ? 2.5 : 1.5}
                  strokeDasharray={axis.isPositive ? 'none' : '2 2'}
                  opacity={axis.isPositive ? 0.92 : 0.45}
                  strokeLinecap="round"
                />

                {/* Active Axis Snapped Ring */}
                {isActive && (
                  <circle
                    cx={axis.x}
                    cy={axis.y}
                    r={bubbleRadius + 3.5}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2"
                    opacity="0.95"
                  />
                )}

                {/* Hover Glow Halo */}
                {isHovered && !isActive && (
                  <circle
                    cx={axis.x}
                    cy={axis.y}
                    r={bubbleRadius + 3.5}
                    fill="none"
                    stroke={axis.color}
                    strokeWidth="1.8"
                    opacity="0.85"
                  />
                )}

                {/* Axis Bubble / Dot */}
                <circle
                  cx={axis.x}
                  cy={axis.y}
                  r={isHovered && !axis.isPositive ? 7 : bubbleRadius}
                  fill={getFill()}
                  stroke={axis.isPositive ? 'rgba(255,255,255,0.2)' : axis.color}
                  strokeWidth={axis.isPositive ? 0.8 : 2}
                  style={{
                    filter: axis.isPositive
                      ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))'
                      : 'none',
                    transition: 'r 0.12s ease'
                  }}
                />

                {/* Axis Letter Label */}
                {axis.isPositive && (
                  <text
                    x={axis.x}
                    y={axis.y + 3.5}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="9.5"
                    fontWeight="800"
                    fontFamily="system-ui, -apple-system, sans-serif"
                    pointerEvents="none"
                  >
                    {axis.label}
                  </text>
                )}

                {/* Generous Hit Area for easy clicking on small dots */}
                <circle
                  cx={axis.x}
                  cy={axis.y}
                  r={bubbleRadius + 5}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                />
              </g>
            );
          })}

          {/* Central Pivot Hub */}
          <circle
            cx={center}
            cy={center}
            r="9"
            fill="rgba(28, 30, 38, 0.9)"
            stroke="rgba(255, 255, 255, 0.2)"
            strokeWidth="1.2"
            style={{ pointerEvents: 'none' }}
          />
        </svg>

        {/* Hover Tooltip (Styled, Dark Theme, Left Positioned) */}
        {hoveredAxis && (
          <div className="blender-gizmo-tooltip">
            {axesDef.find(a => a.id === hoveredAxis)?.title}
          </div>
        )}
      </div>

      {/* Blender Navigation Controls (Zoom, Pan, Iso, Fit) */}
      <div className="blender-gizmo-nav-column">
        {/* Zoom Button */}
        <button
          type="button"
          className="gizmo-nav-btn"
          title="Zoom View (Click to zoom, Drag to scrub)"
          onClick={() => handleZoomClick(1)}
          onPointerDown={(e) => handlePointerDownGizmo(e, 'zoom')}
          onPointerMove={handlePointerMoveGizmo}
          onPointerUp={handlePointerUpGizmo}
          onPointerCancel={handlePointerUpGizmo}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>

        {/* Pan / Move Toggle Button */}
        <button
          type="button"
          className={`gizmo-nav-btn ${isPanMode ? 'active' : ''}`}
          title={isPanMode ? 'Pan Mode: ACTIVE (Click to return to Orbit, or press Esc)' : 'Toggle Pan Mode (Left-click & drag anywhere to pan view)'}
          onClick={(e) => {
            e.stopPropagation();
            if (onTogglePan) onTogglePan();
          }}
          onPointerDown={(e) => handlePointerDownGizmo(e, 'pan')}
          onPointerMove={handlePointerMoveGizmo}
          onPointerUp={handlePointerUpGizmo}
          onPointerCancel={handlePointerUpGizmo}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="5 9 2 12 5 15" />
            <polyline points="9 5 12 2 15 5" />
            <polyline points="15 19 12 22 9 19" />
            <polyline points="19 9 22 12 19 15" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <line x1="12" y1="2" x2="12" y2="22" />
          </svg>
        </button>

        {/* Isometric Snap Button */}
        <button
          type="button"
          className={`gizmo-nav-btn ${viewPreset === 'iso' ? 'active' : ''}`}
          title="Isometric 3D Perspective View (Iso)"
          onClick={() => onSetPreset && onSetPreset('iso')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
        </button>

        {/* Frame / Fit Button */}
        <button
          type="button"
          className="gizmo-nav-btn"
          title="Frame / Fit Entire Vehicle into View (. or Home)"
          onClick={() => onFit && onFit()}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M3 7V5a2 2 0 0 1 2-2h2" />
            <path d="M17 3h2a2 2 0 0 1 2 2v2" />
            <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
            <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default BlenderOrientationGizmo;

