# 3D Modeling & Selection Tools

JBeam.editor provides an interactive **Left Tool Shelf** inside the 3D viewport for direct structural authoring with lossless AST write-back.

![3D Modeling Tool Shelf & Camera Controls](images/Tools%20and%20cam%20controls.png)

---

## 1. Left Tool Shelf

| Tool | Shortcut | Description |
| :--- | :---: | :--- |
| **Select** | <kbd>V</kbd> | Click nodes, beams, triangles, quads, or wheels to inspect/edit them. Hold <kbd>Shift</kbd> to multi-select. |
| **Box Select** | <kbd>B</kbd> | Drag a marquee rectangle in 3D space to select multiple nodes at once. |
| **Add Node** | — | Click in the 3D viewport (snapping to the active grid) to insert a new node into the active part. |
| **Add Beam** | — | Click two existing nodes sequentially to create a beam between them (supports cross-part connections in Multi-Part mode). |
| **Add Triangle** | — | Click three nodes to create a `triangles` collision/aero face. |
| **Add Quad** | — | Click four nodes to create a `quads` face. |
| **Batch Rename** | — | Rename a multi-node selection sequentially using a pattern (e.g. `frame_##`) with live preview and cascading reference updates. |
| **Delete** | <kbd>Del</kbd> | Delete the selected node(s), beam, triangle, or quad from the AST (cascading beam/surface cleanup on node deletion). |

---

## 2. Translation Gizmo & Multi-Node Cluster Manipulation

- **Single Node**: Select any node to display the XYZ translation gizmo. Dragging an axis updates `posX`, `posY`, `posZ` directly in the source code without disturbing comments or formatting.
- **Multi-Node Cluster**: Hold <kbd>Shift</kbd> (or use **Box Select** <kbd>B</kbd>) to select multiple nodes. A unified centroid gizmo moves the entire cluster while preserving relative spacing.
- **Reset Gizmo**: Press <kbd>Alt + G</kbd> to reset temporary gizmo offsets.

---

## 3. Symmetry Engine (`X-Mirror` & PCA Symmetry Planes)

- **`X-Mirror` Toggle** (top viewport bar): When enabled, creating, moving, renaming, or flipping normals on a right/left node (`*r` / `*l`, `*R` / `*L`, `fr1r` ↔ `fr1l`) automatically mirrors the operation to its bilateral partner.
- **PCA Symmetry Plane Detection (`Physics → Analyze PCA Symmetry Planes`)**: Computes Principal Component Analysis across node coordinates to detect mirror planes and highlight asymmetric nodes.

---

## 4. Connected Topology Focus (Neighborhood X-Ray)

Press <kbd>Alt + F</kbd> with one or more nodes selected to isolate only the selected nodes, their directly connected beams, and immediate neighbor nodes. Unrelated geometry is dimmed and background labels are hidden for clutter-free inspection in dense chassis.

---

## 5. Face Orientation & Flip Normal

- Toggle **Face Orientation** in the **View** menu to color-code triangle/quad winding (front vs. back faces) and display surface normal arrows.
- Use **Flip Normal** in the inspector/context action to reverse vertex winding in `triangles` / `quads` (with optional `X-Mirror` bilateral flipping).

---

## 6. Blueprint Overlays & Wavefront OBJ Converter

- **Blueprint Overlays** (`Tools → Blueprint Overlays...`): Load orthographic reference images (Side, Front, Rear, Top) onto 3D viewport planes with scale/offset/opacity controls for tracing real vehicle proportions.
- **Wavefront OBJ ↔ JBeam Converter** (`Tools → Wavefront OBJ Converter...`): Import `.obj` meshes as JBeam `nodes` + `beams` + `triangles`, or export an active JBeam part to `.obj` for external DCC inspection.

![Blueprint & OBJ Tools](images/09-blueprints-and-obj.png)
