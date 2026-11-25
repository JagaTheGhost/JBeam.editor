# JBeam.editor

**A Hybrid 3D & Source Development Environment for BeamNG.drive Vehicle Creators**

[![GitHub Release](https://img.shields.io/github/v/release/JagaTheGhost/JBeam.editor?color=0099FF&label=Release)](https://github.com/JagaTheGhost/JBeam.editor/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg)](LICENSE)

**JBeam.editor** is a dedicated desktop IDE engineered for BeamNG.drive modders, vehicle designers, and physics engineers. It pairs a **Monaco Source Code Editor** with a real-time **Three.js / WebGL 3D Physics Viewport**, **lossless bidirectional AST synchronization**, multi-part vehicle assembly, Collada (`.dae`) mesh integration, and deep BeamNG physics diagnostics.

> **Core Guarantee — Lossless Editing:** Unlike external 3D exporters that rewrite files and strip comments, JBeam.editor mutates only the exact AST ranges you change, preserving 100% of your `//` & `/* ... */` comments, indentation, formatting, and table headers.

---

## ✨ Key Capabilities

- **Hybrid Workspace & Multi-Monitor Popout**: Split View, Code Focus, 3D Focus, and a **Detached Viewport** window for dual-monitor setups with live sync.
- **File Explorer & Monaco JBeam Editor**:
  - Hierarchical file tree with vertical indent guides, quick filter, `Pin` stay-in-files mode, `+` background tab open, and distinct extension badges (`.jbeam`, `.dae`, `.pc`, `.json`, `.html`, `.lua`, textures).
  - Custom JBeam Monarch grammar, rainbow brackets, inline hover documentation, `F2` cascading node rename (with `X-Mirror` symmetry), and batch node renaming.
  - App-wide dark custom tooltips with zero duplicate OS popups.
- **3D Viewport Sources (`Part` · `Multi-Part` · `Assembly`)**:
  - **Part Mode**: Inspect and edit the active `.jbeam` file.
  - **Multi-Part Mode**: View all open tabs together, grouped by file in `View Modes`, with `CAD Wire`, `Joints`, `Cross` (cross-part beams), `Auto-Mount`, and **Clash Inspector** for overlapping nodes.
  - **Assembly Mode**: Index an entire vehicle mod folder, load `.pc` configurations, swap `slots` / `slots2` parts, and toggle part visibility.
- **View Modes Floating HUD (`Parts` · `Type` · `Crash` · `Heat`)**:
  - **Parts**: 3-level Component Family & Collada `.dae` submesh hierarchy with solo (`S`), visibility (`👁️`), and `Hide All` / `Expand`.
  - **Type**: Filter/color nodes, beams, and surfaces by official BeamNG physics type (`NORMAL`, `HYDRO`, `SUPPORT`, `BOUNDED`, `ANISOTROPIC`, `LBEAM`, `PRESSURE`, etc.).
  - **Crash**: Visualize `breakGroup` and `deformGroup` zones with soloing.
  - **Heat**: `beamStrength` yield heatmap (`min` / `mid` / `max` / `FLT_MAX`).
- **3D Modeling, Symmetry & Utilities**:
  - Interactive Left Tool Shelf: Select (`V`), Box Select (`B`), Add Node, Add Beam, Add Triangle, Add Quad, Batch Rename, Delete, plus `X-Mirror` Symmetry, **Connected Topology Focus** (`Alt+F`), Face Orientation & Flip Normal, **Blueprint Overlays**, and **Wavefront OBJ ↔ JBeam Converter**.
- **Physics Diagnostics (`Physics` Menu)**:
  - **PressureWheels Skeleton** + nested **Ghost Wheels & Tires** (lathed tire carcass, stepped rim, auto-adapting Car 6-spoke + brake rotor vs. Truck 10-lug deep-dish, multi-axle & dually `disable`/expression support, `slots2` `nodeOffset` alignment).
  - **Torsion Bars / Swaybars**, **Rails & SlideNodes**, **Center of Gravity (CoG)**, **Aerodynamics & CoP** + **Surface Flow Vectors**, **Frame Triad (`refNodes`)**, and **Cockpit Cameras (`camerasInternal`)**.
- **Inspector, Structure Tree & Multi-Layer Diagnostics**:
  - **Element Inspector** with property editing & Jump-to-Code; **Structure Tree** with single-click expand/collapse and 3D hover isolation/dimming.
  - **Problems Panel** with clickable `Errors` / `Warnings` / `Notices` severity filters and **BeamNG Game Log** parser.
  - **Live SimConnection**: Socket bridge to BeamNG.drive with real-time deformation mirroring and `Ctrl+R` instant vehicle reload.

---

## 📖 Documentation & GitHub Wiki

- **GitHub Wiki (Full Feature Reference)**: [`wiki/Home.md`](wiki/Home.md)
  - [Getting Started](wiki/Getting-Started.md) · [File Explorer & Code Editor](wiki/File-Explorer-and-Code-Editor.md) · [3D Viewport & View Modes](wiki/3D-Viewport-and-View-Modes.md)
  - [3D Modeling & Selection Tools](wiki/3D-Modeling-and-Selection-Tools.md) · [Physics Diagnostics & Wheels](wiki/Physics-Diagnostics-and-Wheels.md) · [Inspector, Structure & Diagnostics](wiki/Inspector-Structure-and-Diagnostics.md)
  - [Keyboard Shortcuts](wiki/Keyboard-Shortcuts.md)
- **Interactive HTML Manual**: [`docs/index.html`](docs/index.html)
- **Markdown Reference**: [`docs/README.md`](docs/README.md)

---

## 🚀 Getting Started

### Development Setup
```bash
# Clone the repository
git clone https://github.com/JagaTheGhost/JBeam.editor.git
cd JBeam.editor

# Install dependencies and launch
cd jbeam-studio
npm install
npm start
```

### Running Tests & Production Build
```bash
npm test --prefix jbeam-studio
npm run build --prefix jbeam-studio
```

### Custom Installer
From the repository root:
```bat
launch-installer.bat
```

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
