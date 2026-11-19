# Changelog

All notable changes to the **JBeam.editor** project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v0.2Beta] - 2026-11-19

### ⚠️ Early Beta Safety Notice
- Added startup and workspace-open safety notice warning modders to maintain backup copies of working vehicle projects while using early beta builds. Includes a *"Don't show again until next update (v0.2Beta)"* suppression option.

### 🌟 New Features & Major Additions
- **Dedicated Mechanical Workspace & Dyno Simulator** `[EXPERIMENTAL]`:
  - Interactive Dyno torque & horsepower curve viewer with live RPM scrub slider, peak horsepower/torque calculation, and transmission top speed readout.
  - Multi-ratio Gearing & Sawtooth simulator with customizable tire radius and final drive ratios.
  - Ackermann steering kinematics simulator with real-time lock-to-lock steering angle visualization.
  - Powertrain device architecture hierarchy tree with 1-click **Focus 3D** camera centering and **Jump to Code** Monaco editor navigation.
  - Bound physical chassis nodes resolution for rotating drive shafts and halfshafts.
  - Resizable horizontal split-pane with minimum/maximum boundary limits.
- **Connected Topology Focus (Neighborhood X-Ray)** `[EXPERIMENTAL]`:
  - Quick-toggle via <kbd>Alt + F</kbd> or the top Overlays dropdown menu.
  - Automatically isolates directly connected beams and adjacent neighbor nodes for selected nodes, gracefully dimming background geometry.
  - Declutters floating 3D billboard node labels to show only selected and neighbor nodes.
- **Dedicated 3D Meshes (.DAE) Panel & Multi-Mesh Spawning**:
  - Independent 3D Submesh Explorer featuring individual mesh checkboxes, polycount/triangle counts, and search filtering.
  - Multi-mesh simultaneous spawning (e.g. hood + front fenders + bumper).
  - 1-click JBeam part generation directly from selected 3D visual submeshes, complete with auto-generated flexbody bindings and composite bounding box cage generation.
- **Enhanced Detached Viewport (Multi-Monitor Popout)**:
  - Secondary detached window now hosts its own full Assembly Manager, 3D Meshes (.DAE) panel, and Element Inspector.
  - Collapsible left/right sidebar activity bars with smooth resizable drag handles.
  - Full keyboard event forwarding (<kbd>F5</kbd> reload, <kbd>F12</kbd> DevTools, <kbd>Delete</kbd>, <kbd>Alt + F</kbd>, <kbd>Alt + G</kbd>) from the secondary window.
  - Protected with top-level `ErrorBoundary` to gracefully recover from any transient WebGL or render errors without a blank screen.
- **Theme-Matched 3D Viewport Background & Ground Grid**:
  - Replaced the harsh pitch-black void with an **Editor Gray** (`#1e2127`) default matching the main UI theme.
  - Real-time background tone switcher with palette swatches and active checkmarks: *Editor Gray*, *Theme Charcoal* (`#1a1a1a`), *CAD Slate* (`#282c34`), and *Pitch Black* (`#0d0e11`).
  - Redesigned neutral ground grid with slate-gray axis lines (`0x5e6878`) and subtle grid cells (`0x2e3440` at 75% opacity).
  - Live persistence in `localStorage` and multi-window sync across main and detached views.
- **PCA Symmetry Plane Detection** `[EXPERIMENTAL]`:
  - Principal Component Analysis (PCA) algorithm calculates true bilateral symmetry planes across complex vehicle geometries.

### 🛠️ Improvements & Fixes
- **Toolbar & UI Streamlining**:
  - Removed duplicate top-bar delete button in favor of standard <kbd>Delete</kbd> key shortcut.
  - Streamlined extrude tool placement to the top action bar with active node state guarding.
  - Cleaned up debug GPU badges and generic placeholder codes.
- **PC Vehicle Configuration Parser**:
  - Fixed syntax parser to gracefully parse unquoted keys and comments in legacy BeamNG `.pc` configuration files.
- **Element Inspector & Physics Sync**:
  - Live node coordinate updates and two-way lossy-free AST synchronization.
  - Metric engineering notation display for beam springs and damping (`kN/m`, `MN/m`).
- **Comprehensive Test Suite**:
  - 27 automated test suites passing with 100% green status.

---

## [v0.1Beta] - 2026-11-05

### Initial Release
- Lossless bidirectional AST synchronization between Monaco source editor and Three.js 3D viewport.
- Real-time BeamNG physics node, beam, and triangle/quad rendering with color modes.
- Blender-style 3D navigation gizmo and camera presets.
- Bilateral left/right symmetry engine (X-Mirror).
- Multi-part vehicle assembly indexing and `.pc` variant loader.
- Blueprint tracing overlays with 2-point wheelbase calibration.
- Wavefront OBJ converter and vertex welder.
- Live socket bridge with BeamNG.drive simulation.
