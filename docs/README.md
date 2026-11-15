# JBeam.editor — Complete Reference Manual & Feature Guide

> **Version:** v0.1Beta  
> **Target Application:** BeamNG.drive Vehicle & Physics Development Environment

---

## Table of Contents

1. [Introduction & System Architecture](#1-introduction--system-architecture)
2. [Workspace Layouts & Multi-Monitor Popouts](#2-workspace-layouts--multi-monitor-popouts)
3. [Monaco JBeam Source Code Editor](#3-monaco-jbeam-source-code-editor)
4. [Lossless Bidirectional AST Synchronization](#4-lossless-bidirectional-ast-synchronization)
5. [3D Structure Viewport (WebGL / Three.js)](#5-3d-structure-viewport-webgl--threejs)
6. [3D Gizmos & Multi-Node Cluster Manipulation](#6-3d-gizmos--multi-node-cluster-manipulation)
7. [Blender-Style Orientation Gizmo](#7-blender-style-orientation-gizmo)
8. [Bilateral Symmetry Engine](#8-bilateral-symmetry-engine)
9. [Geometry & Modeling Operations](#9-geometry--modeling-operations)
10. [Multi-Part Vehicle Assembly & Slot Manager](#10-multi-part-vehicle-assembly--slot-manager)
11. [Reference Meshes (DAE & Blueprints)](#11-reference-meshes-dae--blueprints)
12. [Powertrain Visualizer](#12-powertrain-visualizer)
13. [Live Simulation Socket Connection (SimConnection)](#13-live-simulation-socket-connection-simconnection)
14. [Multi-Layer Diagnostics & Problems Panel](#14-multi-layer-diagnostics--problems-panel)
15. [Custom Web Bootstrapper Installer & Auto-Updates](#15-custom-web-bootstrapper-installer--auto-updates)
16. [Comprehensive Keyboard Shortcuts Cheat Sheet](#16-comprehensive-keyboard-shortcuts-cheat-sheet)

---

## 1. Introduction & System Architecture

**JBeam.editor** is a dedicated desktop application engineered for BeamNG.drive vehicle modders, chassis designers, and vehicle dynamics engineers.

Traditional workflows require writing raw coordinate matrices in text editors and repeatedly launching BeamNG.drive to visually inspect the skeleton. JBeam.editor eliminates this friction by running a **Monaco code editor** side-by-side with an **interactive 3D WebGL physics skeleton renderer**.

### Core Tenet: Lossless Synchronization
Unlike standard 3D DCC tools (such as Blender) which frequently alter formatting, strip annotations, or modify table structures during export, JBeam.editor preserves:
* Exact comment blocks (`//` and `/* ... */`)
* Custom indentation and spacing
* SJSON table header layouts
* Part metadata and variable blocks

---

## 2. Workspace Layouts & Multi-Monitor Popouts

JBeam.editor adapts to diverse workstation setups:

* **Split View (Default)**: Side-by-side Monaco code editor on the left, 3D structure viewport on the right. An interactive splitter bar allows custom width distribution.
* **Code Focus**: Collapses the 3D viewport to give the code editor 100% of the screen width for heavy scripting and formula writing.
* **3D Focus**: Maximizes the 3D viewport for structural inspection, node placement, and beam tension analysis.
* **Detached Viewport (Multi-Monitor Popout)**: Clicking **Detach Viewport** pops the 3D viewport into an independent secondary window. Modders can drag the 3D viewport onto a dedicated secondary monitor while authoring code full-screen on the primary display. Clicking **Dock Window** re-attaches the viewport instantly.

---

## 3. Monaco JBeam Source Code Editor

Powered by the engine behind VS Code, customized with an official BeamNG grammar:

* **Monarch Syntax Highlighting**: Recognizes all official BeamNG tokens (`nodes`, `beams`, `triangles`, `quads`, `slots`, `slots2`, `variables`, `flexbodies`, `powertrain`, `soundscape`, etc.).
* **Rainbow Bracket Pair Colorization**: Visually distinguishes deeply nested JSON and SJSON table levels.
* **In-line Diagnostics**: Underlines syntax errors, missing commas, or unclosed delimiters.
* **Code Folding & Minimap**: Collapse individual sub-assemblies or tables with a single click.

---

## 4. Lossless Bidirectional AST Synchronization

* **Source to Viewport**: As you type coordinates, the 3D skeleton updates in real-time.
* **Viewport to Source**: Clicking and translating a node in the 3D viewport updates the exact coordinate figures in the source code file without reformatting adjacent lines.

---

## 5. 3D Structure Viewport (WebGL / Three.js)

The 3D viewport renders the vehicle physics skeleton with official BeamNG color coding:

### Structural Elements
* **Nodes**: Interactive spheres representing concentrated mass points. Hovering shows the node ID and exact coordinates.
* **Beams**: Connecting spring-damper lines color-coded by type:
  * **Cyan / White**: Normal structural beams
  * **Purple**: Hydro beams (steering racks, hydraulic rams)
  * **Green**: Support beams
  * **Orange**: Bounded beams
  * **Pink**: Anisotropic beams
  * **Slate**: LBeams
* **Triangles & Quads**: Semi-transparent faces representing aerodynamic drag surfaces and collision meshes.
* **Billboard Text Labels**: Floating node labels toggleable via the **Labels** button.

### Coordinate Standard
Follows official BeamNG vehicle coordinate space:
* **+X / -X**: Lateral (Left / Right, `+X` = Left, `-X` = Right)
* **-Y / +Y**: Longitudinal (`-Y` = Forward, `+Y` = Rearward)
* **+Z / -Z**: Vertical (`+Z` = Up, `-Z` = Down)

---

## 6. 3D Gizmos & Multi-Node Cluster Manipulation

* **Single Node Gizmo**: Translating the red (X), green (Y), or blue (Z) arrows moves the node along that axis.
* **Multi-Node Selection**: Hold <kbd>Shift</kbd> and click multiple nodes to select an entire cluster (e.g. an entire bumper or suspension subframe).
* **Centroid Multi-Move**: A unified translation gizmo appears at the geometric center of the selection. Dragging moves the entire group simultaneously, maintaining intra-cluster distances.
* **Reset Offsets (<kbd>Alt + G</kbd>)**: Instantly resets temporary node offset transforms.

---

## 7. Blender-Style Orientation Gizmo

Located in the upper right corner of the 3D viewport:
* Click on **+X**, **-X**, **+Y**, **-Y**, **+Z**, or **-Z** to snap the camera into standard Front, Back, Left, Right, Top, or Bottom orthographic views.
* Left-click and drag the orientation widget to orbit the viewport with precision.

---

## 8. Bilateral Symmetry Engine

BeamNG vehicles are designed symmetrically across the vehicle centerline ($X=0$):
* **Pair Matching**: Automatically associates left/right pairs (`f1l` $\leftrightarrow$ `f1r`, `door_fl` $\leftrightarrow$ `door_fr`).
* **Mirror Transform**: When **Symmetry** is toggled ON, translating node `f1l` automatically mirrors its coordinates to `f1r` across the vehicle centerline ($-X$).

---

## 9. Geometry & Modeling Operations

* **Extrude (<kbd>E</kbd>)**: Extrudes selected nodes into new nodes and connecting beams along an offset vector.
* **Quick-Connect (<kbd>F</kbd>)**: Instantly creates structural beams connecting all selected nodes.
* **Subdivide (<kbd>W</kbd>)**: Inserts a new midpoint node into an existing beam, splitting it into two half-beams.
* **Flip Normal (<kbd>Alt + F</kbd>)**: Inverts triangle/quad winding order for aerodynamic surfaces.
* **Prefix Part Nodes**: Bulk-prefixes node identifiers to prevent naming conflicts across vehicle parts.

---

## 10. Multi-Part Vehicle Assembly & Slot Manager

* **Variant (.pc) Loader**: Select any `.pc` configuration file to composite all matching chassis, suspension, engine, and body parts into a single 3D vehicle skeleton.
* **Interactive Slot Swapping**: Dropdown menus allow swapping parts on the fly (e.g. standard vs sleeper cab).
* **Part Visibility (Eye Icon `👁️`)**: Isolate or hide individual parts.
* **Part Color Coding**: Switch between coloring beams by *Type* or by *Part* for visual separation.

---

## 11. Reference Meshes (DAE & Blueprints)

* **DAE Collada Mesh Overlay**: Load the visual `.dae` 3D body model alongside the JBeam skeleton to ensure nodes line up with sheet metal and wheel arches.
* **Orthographic Blueprints**: Import 2D technical drawings on background planes with adjustable opacity and scale.

---

## 12. Powertrain Visualizer

Automatically parses the `powertrain` table and renders an interactive directed flow graph:
```
[mainEngine] ──> [clutch] ──> [gearbox] ──> [transfercase] ──> [differentials] ──> [wheels]
```
Allows visual inspection of gear ratios, differential types, and torque split configurations.

---

## 13. Live Simulation Socket Connection (SimConnection)

Connects JBeam.editor directly to a running session of **BeamNG.drive**:
* **Live Deformation Sync**: Mirrors real-time vehicle deformation from the simulator into the 3D viewport.
* **Instant Vehicle Reload (<kbd>Ctrl + R</kbd>)**: Reloads the vehicle in-game with updated physics without reloading the map or game.
* **Synchronized Selection**: Selecting a node in JBeam.editor highlights it inside the simulator's debug overlay.

---

## 14. Multi-Layer Diagnostics & Problems Panel

* Flags SJSON syntax errors, unclosed brackets, and broken tokens.
* Detects dangling beams referencing missing node IDs.
* Highlights duplicate node IDs and zero-area degenerate triangles.
* Clicking any diagnostic item jumps directly to the line in the source code.

---

## 15. Custom Web Bootstrapper Installer & Auto-Updates

* **Standalone Installer (`JBeam.editor-Setup-v0.1Beta.exe`)**:
  * Auto-discovers BeamNG.drive Steam and userfolder locations.
  * Registers file associations for `.jbeam` and `.pc`.
  * Adds Windows Explorer right-click context menu (*Open in JBeam.editor*).
* **In-App Auto-Updates**:
  * Silently checks GitHub Releases API on startup.
  * Displays a BeamNG-themed update notification banner with a 1-click update link.

---

## 16. Comprehensive Keyboard Shortcuts Cheat Sheet

| Action | Shortcut | Context |
| :--- | :--- | :--- |
| **Save File** | <kbd>Ctrl + S</kbd> | Global |
| **Open File** | <kbd>Ctrl + O</kbd> | Global |
| **Reload Vehicle in Sim** | <kbd>Ctrl + R</kbd> | Live Sim Connected |
| **Toggle Left Sidebar** | <kbd>Ctrl + B</kbd> | Global |
| **Reset Gizmo Offset** | <kbd>Alt + G</kbd> | 3D Viewport |
| **Camera: Front View** | <kbd>Numpad 1</kbd> | 3D Viewport |
| **Camera: Side View** | <kbd>Numpad 3</kbd> | 3D Viewport |
| **Camera: Top View** | <kbd>Numpad 7</kbd> | 3D Viewport |
| **Toggle Perspective / Orthographic** | <kbd>Numpad 5</kbd> | 3D Viewport |
| **Invert View (Opposite Side)** | <kbd>Numpad 9</kbd> | 3D Viewport |
| **Extrude Selected Nodes** | <kbd>E</kbd> | 3D Viewport |
| **Quick-Connect Beams** | <kbd>F</kbd> | 3D Viewport |
| **Subdivide Selected Beam** | <kbd>W</kbd> | 3D Viewport |
| **Flip Triangle / Quad Normal** | <kbd>Alt + F</kbd> | 3D Viewport |

