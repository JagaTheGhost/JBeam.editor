# JBeam.editor

**A Hybrid 3D & Source Development Environment for BeamNG.drive Vehicle Creators**

JBeam.editor is a standalone desktop application built specifically for BeamNG.drive modders, vehicle designers, and physics engineers. It combines a full-featured source code editor (Monaco Editor) with real-time 3D WebGL physics structure visualization and lossless bidirectional AST synchronization.

---

## ✨ Key Features

- **Hybrid Development Environment**:
  - **Split View**: Work on source code and interact with the 3D vehicle structure simultaneously.
  - **Code Focus**: Expand the editor for concentrated source authoring.
  - **3D Focus**: Maximize the 3D viewport for structural inspection.
  - **Detached Viewport (Multi-Monitor Popout)**: Pop out the 3D viewport into an independent secondary window across dual or triple displays with live real-time sync.
- **JBeam Source Code Editor**:
  - Full syntax highlighting powered by a custom Monaco Monarch grammar for BeamNG JBeam.
  - Bracket pair colorization, line numbers, code folding, and find/replace.
  - Preserves 100% of indentation, spacing, and comments (`//` and `/* ... */`).
- **3D Structure Viewport (WebGL / Three.js)**:
  - Renders **Nodes** as interactive 3D spheres with optional **Floating Billboard Labels**.
  - Renders **Beams** as connecting lines with official BeamNG color coding (`|NORMAL`, `|HYDRO`, `|SUPPORT`, `|BOUNDED`, `|ANISOTROPIC`, `|LBEAM`).
  - Renders **Triangles & Quads** as translucent aerodynamic and collision surfaces with wireframe edges.
  - **Blender-Style Orientation Gizmo**: Interactive coordinate cube in the top-right corner to snap into Front, Rear, Left, Right, Top, or Bottom orthographic views.
  - Ground grid with vehicle-aligned coordinate axes (**X**: Lateral, **Y**: Longitudinal, **Z**: Vertical).
- **Two-Way AST Synchronization & Symmetry**:
  - **Code to Viewport**: Editing source code instantly parses and updates the 3D structural model.
  - **Viewport to Code**: Select a node in 3D and drag its translation gizmo; the exact coordinates are updated in the document AST without altering comments or surrounding code.
  - **Left/Right Symmetry Engine**: Automatically detects and mirrors coordinate changes across symmetrical node pairs (`fr1r` ↔ `fr1l`).
- **Gizmos & Multi-Node Cluster Manipulation**:
  - Hold <kbd>Shift</kbd> to select multiple nodes.
  - Unified centroid gizmo allows moving multi-node clusters while preserving relative distances.
  - <kbd>Alt + G</kbd> resets gizmo offsets.
- **Multi-Part Vehicle Assembly & Slot Manager**:
  - Automatically indexes all `.jbeam` parts and `.pc` vehicle configurations across any vehicle mod folder.
  - **Hierarchical Slot Tree**: Visualizes nested slots (`slots` / `slots2` and `slotType`) from root chassis to nested components.
  - **Variant Configuration (.pc) Loader**: Select any `.pc` configuration from a dropdown to assemble all matching parts into a unified composite vehicle.
  - **Interactive Part Swapping**: Dropdown selectors for every slot allow modders to swap parts.
  - **Independent Part Visibility Toggles**: Eye icon `👁️` toggles show/hide for individual parts in 3D.
  - **Composite 3D Visualization & Distinct Part Coloring**: Color-codes each assembly part with its own distinct palette color.
- **Reference Meshes (DAE & Blueprints)**:
  - Load `.dae` Collada meshes alongside JBeam nodes to align physics skeletons directly against 3D body panels.
  - Project 2D technical drawings/blueprints into 3D space with opacity and scale controls.
- **Powertrain Visualizer**:
  - Interactive component graph showing engine, clutch, gearbox, transfer case, differentials, and wheel connections.
- **Live Simulation Connection (SimConnection)**:
  - Real-time socket bridge with BeamNG.drive physics engine.
  - Mirrors live node deformation and stress states directly from the game.
  - Instant vehicle reload (<kbd>Ctrl + R</kbd>).
- **Multi-Layer Validation & Diagnostics**:
  - Identifies SJSON syntax errors, missing node references in beams, duplicate node IDs, invalid non-numeric coordinates, and degenerate triangles.
  - Bottom Problems panel allows one-click jumping to the exact line in source code.
- **Installer & Auto-Updates**:
  - Custom Web Bootstrapper with BeamNG Steam and userfolder auto-detection.
  - In-app update notification banner linked to GitHub Releases.

---

## 📖 Detailed Documentation

For the full reference manual, open:
* **In-App**: Help $\rightarrow$ **JBeam.editor Documentation**
* **Offline HTML**: [`docs/index.html`](../docs/index.html)
* **Markdown**: [`docs/README.md`](../docs/README.md)
