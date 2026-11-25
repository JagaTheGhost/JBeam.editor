# Inspector, Structure Tree & Diagnostics

## 1. Right Sidebar: `Inspector` & `Structure`

### Element Inspector (`Inspector` Tab)
Selecting any **Node**, **Beam**, **Triangle/Quad**, **TorsionBar**, **SlideNode**, or **PressureWheel** in the 3D viewport opens its detailed card in the **Inspector**:
- View/edit coordinates, node weights, beam stiffness/damping/strength, surface `dragCoef`, crash `breakGroup`/`deformGroup` tags, and aerodynamic drag/lift projections.
- Click **Jump to Code** to navigate straight to the exact line in the Monaco editor.

![Element Inspector](images/13-element-inspector.png)

### Structure Tree (`Structure` Tab)
Displays a searchable hierarchy of the active part's **Nodes**, **Beams**, **Triangles**, and **Quads**:
- **Single-Click Collapse**: Click any section header (`NODES`, `BEAMS`, `TRIS`, `QUADS`) once to expand or collapse it.
- **3D Hover Isolation & Dimming**: Hovering over any node, beam, triangle, or quad row in the Structure Tree highlights that element in the 3D viewport and gently dims the rest of the vehicle for focused inspection.

![Structure Tree Hover Isolation](images/14-structure-tree-hover.png)

---

## 2. Bottom Panel: `Problems` & `BeamNG Game Log`

### JBeam Diagnostics
Validates your open JBeam documents in real time for:
- SJSON syntax errors, unclosed braces, and invalid table headers
- Missing node references in `beams`, `triangles`, `quads`, `torsionbars`, `rails`, `slidenodes`, `refNodes`, `camerasInternal`, and `pressureWheels`
- Duplicate node IDs, degenerate surfaces, single-beam `breakGroup` warnings, and flexbody `deformGroup` mismatches

**Severity Filter Toggles**: Click **Errors**, **Warnings**, or **Notices** in the Problems header to toggle visibility for each severity level independently. Click any problem row to jump directly to its line in the code editor.

![Problems Panel](images/15-problems-panel.png)

### BeamNG Game Log
Switch to the **BeamNG Game Log** sub-tab inside the bottom panel to parse and inspect `beamng.log` entries alongside your JBeam diagnostics.

---

## 3. Live Simulation Connection (`SimConnection`)

Connect JBeam.editor directly to a running **BeamNG.drive** instance via `Tools → Connect to BeamNG` (or the status bar indicator):
- **Live Deformation Mirroring**: View real-time node deformation and stress states from the game inside JBeam.editor.
- **Instant Vehicle Reload (<kbd>Ctrl + R</kbd>)**: Trigger an immediate vehicle reload in BeamNG.drive after saving edits.
