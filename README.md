# JBeam.editor

**A Hybrid 3D & Source Development Environment for BeamNG.drive Vehicle Creators**

[![GitHub Release](https://img.shields.io/github/v/release/JagaTheGhost/JBeam.editor?color=FF6600&label=Release)](https://github.com/JagaTheGhost/JBeam.editor/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg)](LICENSE)

JBeam.editor is a dedicated desktop application engineered for BeamNG.drive modders, vehicle designers, and physics engineers. It combines a full-featured source code editor (Monaco Editor) with real-time 3D WebGL physics structure visualization and lossless bidirectional AST synchronization.

---

## ✨ Key Features

- **Hybrid Development Environment**:
  - **Split View**: Work on source code and interact with the 3D vehicle structure simultaneously.
  - **Code Focus**: Expand the editor for concentrated source authoring.
  - **3D Focus**: Maximize the 3D viewport for structural inspection.
  - **Detached Viewport (Multi-Monitor Popout)**: Pop out the 3D viewport into an independent secondary window across dual displays with live real-time sync.
- **JBeam Source Code Editor**:
  - Custom Monaco Monarch grammar for BeamNG JBeam keywords and tokens.
  - Rainbow bracket colorization, line numbers, code folding, and find/replace.
  - Preserves 100% of indentation, spacing, and comments (`//` and `/* ... */`).
- **3D Structure Viewport (WebGL / Three.js)**:
  - Renders **Nodes** as interactive 3D spheres with optional **Floating Billboard Labels**.
  - Renders **Beams** color-coded by official BeamNG type (`NORMAL`, `HYDRO`, `SUPPORT`, `BOUNDED`, `ANISOTROPIC`, `LBEAM`).
  - Renders **Triangles & Quads** as translucent aerodynamic and collision surfaces.
  - **Blender-Style Orientation Gizmo**: Interactive 3D coordinate cube in the top-right corner to snap into Front, Rear, Left, Right, Top, or Bottom orthographic views.
  - Ground grid with vehicle-aligned coordinate axes (**X**: Lateral, **Y**: Longitudinal, **Z**: Vertical).
- **Two-Way AST Synchronization & Symmetry**:
  - **Code to Viewport**: Editing source code instantly parses and updates the 3D structural model.
  - **Viewport to Code**: Select a node in 3D and drag its translation gizmo; exact coordinates are updated in the document AST without altering comments.
  - **Left/Right Symmetry Engine**: Automatically detects and mirrors coordinate changes across symmetrical node pairs (`fr1r` ↔ `fr1l`).
- **Gizmos & Multi-Node Cluster Manipulation**:
  - Hold <kbd>Shift</kbd> to select multiple nodes.
  - Unified centroid gizmo allows moving multi-node clusters while preserving relative distances.
  - <kbd>Alt + G</kbd> resets gizmo offsets.
- **Multi-Part Vehicle Assembly & Slot Manager**:
  - Automatically indexes all `.jbeam` parts and `.pc` vehicle configurations across any vehicle mod folder.
  - **Hierarchical Slot Tree**: Visualizes nested slots (`slots` / `slots2` and `slotType`).
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

## 📖 Documentation

The complete reference manual and feature breakdown is available:
* **Interactive HTML Guide**: [`docs/index.html`](docs/index.html)
* **Markdown Manual**: [`docs/README.md`](docs/README.md)

---

## 🚀 Getting Started

### Development Setup
```bash
# Clone the repository
git clone https://github.com/JagaTheGhost/JBeam.editor.git
cd JBeam.editor

# Install app dependencies
cd jbeam-studio
npm install

# Run JBeam.editor in development mode
npm start
```

### Running the Custom Installer
From the project root:
```bat
launch-installer.bat
```

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
