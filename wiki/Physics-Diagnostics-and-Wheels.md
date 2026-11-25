# Physics Diagnostics & Wheels

Open the **Physics** dropdown in the top-right viewport bar to toggle real-time BeamNG physics visualizations.

![Physics Diagnostics Menu](images/10-physics-menu.png)

---

## 1. PressureWheels Skeleton & Ghost Wheels

### `PressureWheels Skeleton`
Decodes official BeamNG `pressureWheels` and legacy `hubWheels` tables across single parts, multi-part assemblies, and external/common wheel files:
- **Multi-Part & Multi-Axle Inheritance**: Resolves `variables`, `$components`, and `$=...` Lua expressions (e.g., `simplifiedDuallies`, `$tirepressure_F`, `$trackoffset_F`), sequential `rowState` (`wheelOffset` per row for inner/outer dualies), `disable` conditions, and `slots`/`slots2` `nodeOffset` coordinates.
- **Soft-Body Skeleton**: Generates inner/outer hub nodes (`hin`/`hout`), tire carcass nodes (`tin`/`tout`), spoke beams, rim rings, sidewall beams (`|TIRESIDE`), tread rings (`|PRESSURED`), and pneumatic `PRESSURE` collision quads.
- **Interactive Picking**: Click any wheel in 3D to inspect its radius, hubRadius, tireWidth, hubWidth, numRays, PSI, and jump straight to its definition in code.

### `Ghost Wheels & Tires` *(Nested under PressureWheels Skeleton)*
Only available and spawned when **PressureWheels Skeleton** is enabled:
- **Lathed Tire & Stepped Rim**: Smooth `LatheGeometry` tire carcass with rounded shoulders, sidewall bulge, circumferential tread guide rings, and a stepped rim barrel.
- **Auto-Adapting Car vs. Truck Look**: Automatically renders a **deep-dish 10-lug hub & planetary dome** for heavy-duty truck wheels, or a **6-spoke face + inner brake rotor** for passenger/sport cars.

![Car and Truck Ghost Wheels](images/11-pressure-and-ghost-wheels.png)

---

## 2. Suspension & Chassis Physics

- **Torsion Bars / Swaybars**: Parses 4-node `torsionbars` (`[id1, id2, id3, id4]`), rendering central torsion axis cylinders, torque reaction spirals, and lever arms with stiffness (`N/m`), plus diagnostics for coincident axes or missing nodes.
- **Rails & SlideNodes**: Renders `rails` guide polylines with end caps and `slidenodes` sliding collars (`|ATTACHED`) with tolerance spheres.
- **Center of Gravity (CoG)**: Computes total vehicle mass (`kg`) from `nodeWeight` across active parts and places a 3D CoG marker at the exact mass centroid.

---

## 3. Aerodynamics, Reference Frame & Cameras

- **Aerodynamics & CoP**: Computes frontal projected area ($A_{frontal}$ in $m^2$ along BeamNG $-Y$), lateral area, 3D **Center of Pressure (CoP)** marker, stability margin relative to CoG, and front/rear downforce balance.
  - **Surface Flow Vectors** *(Nested under Aerodynamics & CoP)*: Displays 3D airflow normal vectors on aerodynamic surfaces.
- **Frame Triad (`refNodes`)** *(Off by default)*: Visualizes the vehicle coordinate frame (`ref`, `back`, `left`, `up`) as 3D triad arrows and validates orthogonality / duplicate node references.
- **Cockpit Cameras (`camerasInternal`)** *(Off by default)*: Renders driver POV camera frustum pyramids, eye markers, anchor node tethers (`id1`..`id6`), and checks for unusual FOV or missing anchors.

![Aero, CoG, and Suspension Overlays](images/12-physics-overlays.png)
