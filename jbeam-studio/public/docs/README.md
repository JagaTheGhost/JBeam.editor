# JBeam.editor — Complete Reference Manual & Feature Guide

> **Version:** v0.2Beta  
> **Target Application:** BeamNG.drive Vehicle & Physics Development Environment

---

## Table of Contents

1. [Introduction & System Architecture](#1-introduction--system-architecture)
2. [Workspace Layouts & Multi-Monitor Popouts](#2-workspace-layouts--multi-monitor-popouts)
3. [Monaco JBeam Source Code Editor](#3-monaco-jbeam-source-code-editor)
4. [Lossless Bidirectional AST Synchronization](#4-lossless-bidirectional-ast-synchronization)
5. [3D Structure Viewport & Themes](#5-3d-structure-viewport--themes)
6. [Connected Topology Focus (Neighborhood X-Ray) [EXPERIMENTAL]](#6-connected-topology-focus-neighborhood-x-ray-experimental)
7. [3D Gizmos & Multi-Node Cluster Manipulation](#7-3d-gizmos--multi-node-cluster-manipulation)
8. [Blender-Style Orientation Gizmo](#8-blender-style-orientation-gizmo)
9. [Bilateral Symmetry Engine](#9-bilateral-symmetry-engine)
10. [Geometry & Modeling Operations](#10-geometry--modeling-operations)
11. [Multi-Part Vehicle Assembly & Slot Manager](#11-multi-part-vehicle-assembly--slot-manager)
12. [Dedicated 3D Meshes (.DAE) Panel & Multi-Spawn](#12-dedicated-3d-meshes-dae-panel--multi-spawn)
13. [Mechanical Workspace & Dyno Studio [EXPERIMENTAL]](#13-mechanical-workspace--dyno-studio-experimental)
14. [Live Simulation Socket Connection (SimConnection)](#14-live-simulation-socket-connection-simconnection)
15. [Multi-Layer Diagnostics & Problems Panel](#15-multi-layer-diagnostics--problems-panel)
16. [PressureWheels & Soft-Body Tire Simulation](#16-pressurewheels--soft-body-tire-simulation)
17. [Suspension Mechanics & Kinematics Sweep](#17-suspension-mechanics--kinematics-sweep)
18. [Custom Web Bootstrapper Installer & Auto-Updates](#18-custom-web-bootstrapper-installer--auto-updates)
19. [Comprehensive Keyboard Shortcuts Cheat Sheet](#19-comprehensive-keyboard-shortcuts-cheat-sheet)

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

### Viewport Background Themes & Neutral Ground Grid
Customize the 3D scene background directly from the **Overlays** popover menu:
* **Editor Gray (Default, `#1e2127`)**: Matches the main dark charcoal editor theme.
* **Theme Charcoal (`#1a1a1a`)**: Pure background charcoal matching the sidebars.
* **CAD Slate (`#282c34`)**: High-visibility CAD gray.
* **Pitch Black (`#0d0e11`)**: OLED deep black void.
* Ground grid features slate-gray center axes (`#5e6878`) and subtle grid cells (`#2e3440` at 75% opacity).

---

## 6. Connected Topology Focus (Neighborhood X-Ray) [EXPERIMENTAL]

When engineering dense vehicle chassis with thousands of beams:
* **Toggle Shortcut (<kbd>Alt + F</kbd>)**: Isolates directly connected beams and adjacent neighbor nodes for selected nodes, gently dimming all unrelated vehicle geometry.
* **Decluttered Billboard Labels**: Automatically hides floating labels for background elements, displaying only selected nodes and immediate structural neighbors.

---

## 7. 3D Gizmos & Multi-Node Cluster Manipulation

* **Single Node Gizmo**: Translating the red (X), green (Y), or blue (Z) arrows moves the node along that axis.
* **Multi-Node Selection**: Hold <kbd>Shift</kbd> and click multiple nodes to select an entire cluster (e.g. an entire bumper or suspension subframe).
* **Centroid Multi-Move**: A unified translation gizmo appears at the geometric center of the selection. Dragging moves the entire group simultaneously, maintaining intra-cluster distances.
* **Reset Offsets (<kbd>Alt + G</kbd>)**: Instantly resets temporary node offset transforms.

---

## 8. Blender-Style Orientation Gizmo

Located in the upper right corner of the 3D viewport:
* Click on **+X**, **-X**, **+Y**, **-Y**, **+Z**, or **-Z** to snap the camera into standard Front, Back, Left, Right, Top, or Bottom orthographic views.
* Left-click and drag the orientation widget to orbit the viewport with precision.

---

## 9. Bilateral Symmetry Engine

BeamNG vehicles are designed symmetrically across the vehicle centerline ($X=0$):
* **Pair Matching**: Automatically associates left/right pairs (`f1l` $\leftrightarrow$ `f1r`, `door_fl` $\leftrightarrow$ `door_fr`).
* **Mirror Transform**: When **Symmetry** is toggled ON, translating node `f1l` automatically mirrors its coordinates to `f1r` across the vehicle centerline ($-X$).
* **PCA Symmetry Plane Detection [EXPERIMENTAL]**: Uses Principal Component Analysis to calculate mathematical symmetry planes for irregular chassis.

---

## 10. Geometry & Modeling Operations

* **Extrude (<kbd>E</kbd>)**: Extrudes selected nodes into new nodes and connecting beams along an offset vector.
* **Quick-Connect (<kbd>F</kbd>)**: Instantly creates structural beams connecting all selected nodes.
* **Subdivide (<kbd>W</kbd>)**: Inserts a new midpoint node into an existing beam, splitting it into two half-beams.
* **Delete (<kbd>Delete</kbd>)**: Deletes selected nodes, beams, or surfaces with cascading AST removal.
* **Wavefront OBJ Converter [EXPERIMENTAL]**: Converts 3D polygon meshes to JBeam with vertex welding.
* **Prefix Part Nodes**: Bulk-prefixes node identifiers to prevent naming conflicts across vehicle parts.

---

## 11. Multi-Part Vehicle Assembly & Slot Manager

* **Variant (.pc) Loader**: Select any `.pc` configuration file to composite all matching chassis, suspension, engine, and body parts into a single 3D vehicle skeleton.
* **Interactive Slot Swapping**: Dropdown menus allow swapping parts on the fly (e.g. standard vs sleeper cab).
* **Part Visibility (Eye Icon `👁️`)**: Isolate or hide individual parts.
* **Part Color Coding**: Switch between coloring beams by *Type* or by *Part* for visual separation.

---

## 12. Dedicated 3D Meshes (.DAE) Panel & Multi-Spawn

* **Submesh Explorer**: Checkbox selection for discovered visual submeshes (`hood`, `doors`, `chassis`) with polycount stats.
* **Multi-Mesh Spawning**: Spawn multiple visual body panels simultaneously as reference overlays.
* **1-Click JBeam Part Generator**: Computes the composite bounding box of spawned meshes and generates a new `.jbeam` part file with pre-configured `flexbodies` bindings.
* **Detached Window Support**: Fully functional inside both the main studio and the secondary popout window.

---

## 13. Mechanical Workspace & Dyno Studio [EXPERIMENTAL]

A comprehensive vehicle dynamics and powertrain analysis suite:
* **Interactive Dyno**: Live horsepower and torque curves with RPM scrub slider and gear top speed calculator.
* **Gearing & Sawtooth Simulator**: Analyzes transmission shift drops, final drive, and tire radius.
* **Ackermann Steering Kinematics**: Lock-to-lock steering angle simulator visualizing inside vs outside wheel divergence.
* **Device Architecture**: Hierarchical tree for engines, gearboxes, differentials, shafts, mounts, and fuel storage with **Focus 3D** and **Jump to Code**.

---

## 14. Live Simulation Socket Connection (SimConnection)

Connects JBeam.editor directly to a running session of **BeamNG.drive**:
* **Live Deformation Sync**: Mirrors real-time vehicle deformation from the simulator into the 3D viewport.
* **Instant Vehicle Reload (<kbd>Ctrl + R</kbd>)**: Reloads the vehicle in-game with updated physics without reloading the map or game.
* **Synchronized Selection**: Selecting a node in JBeam.editor highlights it inside the simulator's debug overlay.

---

## 15. Multi-Layer Diagnostics & Problems Panel

* Flags SJSON syntax errors, unclosed brackets, and broken tokens.
* Detects dangling beams referencing missing node IDs.
* Highlights duplicate node IDs and zero-area degenerate triangles.
* Clicking any diagnostic item jumps directly to the line in the source code.

---

## 16. PressureWheels & Soft-Body Tire Simulation

* **BeamNG `pressureWheels` & Legacy `hubWheels` Parser**:
  * Decodes single-part and multi-part wheel assemblies (suspension spindle nodes + rim hub parameters + tire tread and PSI parameters).
  * Automatically resolves dual schemas: parsed dictionary objects and raw SJSON tabular arrays.
* **3D Soft-Body Physics Skeleton Generation**:
  * Calculates spindle rotation axis ($\mathbf{P}_2 - \mathbf{P}_1$) and disc basis vectors across `numRays` angular steps.
  * Generates inner/outer rim nodes ($H_{in}$, $H_{out}$) and tread nodes ($T_{in}$, $T_{out}$).
  * Synthesizes spindle-to-rim spokes, rim barrel cross beams, sidewall beams (`|TIRESIDE`), tread ring perimeter beams (`|PRESSURED`), and diagonal shear beams (`|ANISOTROPIC`).
  * Generates translucent pneumatic pressure quads (`PRESSURE`) with normal-oriented surfaces.
* **Interactive 3D Viewport & HUD Overlay**:
  * Toggleable via the **Overlays** menu (**PressureWheels Skeleton**).
  * Interactive 3D raycast picking: clicking any wheel in the 3D scene opens its dedicated **Pressure Wheel** inspector card.
  * Billboard HUD overlay displaying wheel name, radius, width, and inflation pressure (e.g. `FR (28.0 PSI)`).
  * Multi-monitor IPC synchronization: wheel selection synchronizes seamlessly between main editor and detached viewports.
* **Dedicated Inspector & Diagnostics**:
  * Element Inspector displays wheel identity, spindle node jump chips, metric and imperial dimensions, inflation PSI, brake/parking torques, and line jump to Monaco code.
  * Diagnostic validation catches missing spindle node references (`node1:` / `node2:`), invalid `wheelDir`, odd `numRays`, and inverted `hubRadius >= radius` before testing in-game.

---

## 17. Suspension Mechanics & Kinematics Sweep

* **TorsionBars (Anti-Roll / Swaybars)**:
  * Complete 4-node parser (`[id1, id2, id3, id4]`) decoding lever arm tips (`id1`, `id4`) and chassis pivots (`id2`, `id3`).
  * 3D rendering: central torsion shaft cylinder, torque reaction coil spiral, lever arm lines, and spring rate badges (`ARB: XX kN/m`).
  * Dedicated inspector card with 1-click jump to Monaco code and node jump chips.
  * Structural diagnostics catch fatal zero-length torsion axes (`id2 == id3`), coincident arms, and missing nodes.
* **Rails & SlideNodes**:
  * Visualizes polyline guide rails with directional caps and metallic sliding collar nodes (`tolerance`, `spring`, `fixToRail`).
  * Diagnostics flag rails with fewer than 2 nodes and slidenodes referencing undefined rails.

---

## 18. Crash & Detachment Zones (`breakGroup` & `deformGroup`)

BeamNG handles part detachment and visual damage deformation using group triggers:
* **`breakGroup` (Detachment Latches & Hinges)**:
  * Governs structural separation and part shedding (e.g. hood latches, door hinges, bumper clips, exhaust hangers).
  * In the **Crash Zones** color mode, all beams belonging to a breakGroup are rendered in vibrant deterministic colors.
  * Structural diagnostics detect single-beam breakGroups, warning modders that road vibrations may prematurely trigger unintended part separation.
* **`deformGroup` (Mesh Crush & Shatter Triggers)**:
  * Governs mesh deformation triggers and material breaking (broken headlight glass, crumpled fenders, shattered mirrors).
  * Automatically correlates flexbody definitions with their trigger beams.
  * Diagnostics alert when a flexbody mesh references a deformGroup with zero assigned beams.
* **Interactive Left Floating HUD & Solo Filtering**:
  * Displays total break and deform groups across active parts.
  * Click any group chip to solo it in 3D: soloed beams shine with bright neon colors while all other structural beams are dimmed to dark slate (`#334155`).
  * Dedicated **Crash & Detachment Zones** card in the Element Inspector displays active groups and role explanations when inspecting beams.

---

## 19. Custom Web Bootstrapper Installer & Auto-Updates

* **Standalone Installer (`JBeam.editor-Setup-v0.2Beta.exe`)**:
  * Auto-discovers BeamNG.drive Steam and userfolder locations.
  * Registers file associations for `.jbeam` and `.pc`.
  * Adds Windows Explorer right-click context menu (*Open in JBeam.editor*).
* **In-App Auto-Updates**:
  * Silently checks GitHub Releases API on startup.
  * Displays a BeamNG-themed update notification banner with a 1-click update link.

---

## 20. Comprehensive Keyboard Shortcuts Cheat Sheet

| Action | Shortcut | Context |
| :--- | :--- | :--- |
| **Save File** | <kbd>Ctrl + S</kbd> | Global |
| **Open File** | <kbd>Ctrl + O</kbd> | Global |
| **Reload Vehicle in Sim** | <kbd>Ctrl + R</kbd> | Live Sim Connected |
| **Connected Topology Focus (X-Ray)** | <kbd>Alt + F</kbd> | 3D Viewport |
| **Reset Gizmo Offset** | <kbd>Alt + G</kbd> | 3D Viewport |
| **Delete Selected Element(s)** | <kbd>Delete</kbd> | 3D Viewport |
| **Toggle Left Sidebar** | <kbd>Ctrl + B</kbd> | Global |
| **Camera: Front View** | <kbd>Numpad 1</kbd> | 3D Viewport |
| **Camera: Side View** | <kbd>Numpad 3</kbd> | 3D Viewport |
| **Camera: Top View** | <kbd>Numpad 7</kbd> | 3D Viewport |
| **Toggle Perspective / Orthographic** | <kbd>Numpad 5</kbd> | 3D Viewport |
| **Invert View (Opposite Side)** | <kbd>Numpad 9</kbd> | 3D Viewport |
| **Extrude Selected Nodes** | <kbd>E</kbd> | 3D Viewport (Node Selected) |
| **Quick-Connect Beams** | <kbd>F</kbd> | 3D Viewport (2+ Nodes Selected) |
| **Subdivide Selected Beam** | <kbd>W</kbd> | 3D Viewport (Beam Selected) |

