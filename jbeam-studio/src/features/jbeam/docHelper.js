/*
  JBeam Studio - Documentation Helper & Parameter Reference
  Comprehensive BeamNG.drive parameter definitions, types, defaults, valid ranges,
  physics recommendations, and official documentation links.
  Matches and extends vscode-jbeam-editor's docHelper.
*/

export const JBEAM_DOCUMENTATION = {
  // Top-Level / General Sections
  "information": {
    "description": "Metadata for the JBeam part including display name, authors, and component type.",
    "type": "object",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/information/"
  },
  "information > name": {
    "description": "User-facing display name of the part shown in the Vehicle Configuration menu.",
    "type": "string",
    "default": "",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/information/"
  },
  "information > authors": {
    "description": "Author(s) or creator(s) of this vehicle part.",
    "type": "string",
    "default": "BeamNG",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/information/"
  },
  "slotType": {
    "description": "Defines which slot this part can install into. Must match the slot name defined in the parent part.",
    "type": "string",
    "default": "main",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/slots/"
  },

  // Nodes Section
  "nodes": {
    "description": "Lumped-mass vertices of the soft-body physics skeleton in 3D space.",
    "type": "table",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/nodes/"
  },
  "nodes > id": {
    "description": "Unique identifier for this node within the vehicle skeleton.",
    "type": "string",
    "default": "",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/nodes/#args_id"
  },
  "nodes > posX": {
    "description": "Lateral position in 3D space. Left = -X, Right = +X (BeamNG vehicle space).",
    "type": "number",
    "default": "0",
    "units": "m",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/nodes/#args_posX"
  },
  "nodes > posY": {
    "description": "Longitudinal position in 3D space. Forward = +Y, Rear = -Y (BeamNG vehicle space).",
    "type": "number",
    "default": "0",
    "units": "m",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/nodes/#args_posY"
  },
  "nodes > posZ": {
    "description": "Vertical position in 3D space. Up = +Z, Down = -Z (BeamNG vehicle space).",
    "type": "number",
    "default": "0",
    "units": "m",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/nodes/#args_posZ"
  },
  "nodes > nodeWeight": {
    "description": "Concentrated mass of the node in kilograms (kg).",
    "type": "number",
    "default": "5.0",
    "units": "kg",
    "validRange": "0.5 – 100.0 kg",
    "physicsNote": "Light body skin ~1.5–3kg; Suspension arms & subframes ~10–25kg; Engine block core ~30–60kg. Minimum recommended safe mass is ≥0.5kg to prevent high-frequency solver jitter.",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/nodes/#args_nodeWeight"
  },
  "nodes > collision": {
    "description": "Determines whether this node collides with environment, ground terrain, and other vehicles.",
    "type": "boolean",
    "default": "true",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/nodes/#args_collision"
  },
  "nodes > selfCollision": {
    "description": "Determines whether this node collides with other parts and panels of the same vehicle.",
    "type": "boolean",
    "default": "false",
    "physicsNote": "Enable primarily for exterior body panels, hoods, doors, and bumpers. Keep false for interior dense frame nodes to improve performance.",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/nodes/#args_selfCollision"
  },
  "nodes > staticCollision": {
    "description": "Determines whether this node collides with static map geometry and obstacles.",
    "type": "boolean",
    "default": "true",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/nodes/#args_staticCollision"
  },
  "nodes > group": {
    "description": "Assigns the node to one or more deformation groups. Flexbody 3D visual meshes bind to these groups to deform.",
    "type": "string|array",
    "default": "",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/nodes/#args_group"
  },
  "nodes > frictionCoef": {
    "description": "Static friction coefficient of the node surface upon contact.",
    "type": "number",
    "default": "1.0",
    "validRange": "0.1 – 2.5",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/nodes/#args_frictionCoef"
  },
  "nodes > slidingFrictionCoef": {
    "description": "Dynamic sliding friction coefficient of the node surface.",
    "type": "number",
    "default": "frictionCoef",
    "validRange": "0.1 – 2.0",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/nodes/#args_slidingFrictionCoef"
  },
  "nodes > nodeMaterial": {
    "description": "Physical acoustic and spark contact material (e.g. '|NM_METAL', '|NM_RUBBER', '|NM_PLASTIC').",
    "type": "string",
    "default": "|NM_METAL",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/nodes/#args_nodeMaterial"
  },
  "nodes > fixed": {
    "description": "Locks the node completely in 3D world space (infinite mass anchor). Used for test benches and static fixtures.",
    "type": "boolean",
    "default": "false",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/nodes/#args_fixed"
  },

  // Beams Section
  "beams": {
    "description": "Viscoelastic spring-damper structural connections between pairs of nodes.",
    "type": "table",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/beams/"
  },
  "beams > id1": {
    "description": "Identifier of the start node for this beam.",
    "type": "string",
    "default": "",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/beams/#args_id1"
  },
  "beams > id2": {
    "description": "Identifier of the end node for this beam.",
    "type": "string",
    "default": "",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/beams/#args_id2"
  },
  "beams > beamSpring": {
    "description": "Hookean elastic spring stiffness of the beam in Newtons per meter (N/m).",
    "type": "number",
    "default": "4300000",
    "units": "N/m",
    "validRange": "200,000 – 10,000,000 N/m",
    "physicsNote": "Light body panels ~500k–1MN/m; Standard vehicle chassis ~2M–4MN/m; Heavy/rigid frame ~6M–10MN/m. Stiffness >15MN/m without sufficient node mass risks instability/explosion.",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/beams/#args_beamSpring"
  },
  "beams > beamDamp": {
    "description": "Viscous damping coefficient of the beam in Newton-seconds per meter (N·s/m).",
    "type": "number",
    "default": "580",
    "units": "N·s/m",
    "validRange": "20 – 2,000 N·s/m",
    "physicsNote": "Rule of thumb: beamDamp ≈ 0.0001 to 0.0003 * beamSpring. Insufficient damping causes elastic vibration/ringing; excessive damping creates sluggish deformation or freezing.",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/beams/#args_beamDamp"
  },
  "beams > beamDeform": {
    "description": "Plastic deformation yield threshold in Newtons (N). Force required to permanently bend/shorten the beam.",
    "type": "number",
    "default": "220000",
    "units": "N",
    "validRange": "8,000 – 350,000 N (or 'FLT_MAX')",
    "physicsNote": "Body sheet metal ~12k–35kN; Crash structure/crumple zones ~45k–90kN; Main frame rails ~120k–250kN. Use 'FLT_MAX' for suspension links that should never bend.",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/beams/#args_beamDeform"
  },
  "beams > beamStrength": {
    "description": "Ultimate tensile/compressive breaking limit in Newtons (N). When exceeded, the beam snaps.",
    "type": "number",
    "default": "FLT_MAX",
    "units": "N",
    "validRange": "25,000 – 600,000 N (or 'FLT_MAX')",
    "physicsNote": "Detachable components (bumpers, mirrors, fenders) ~30k–120kN; Chassis core beams ~250k–500kN; Core safety cell usually uses 'FLT_MAX'.",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/beams/#args_beamStrength"
  },
  "beams > beamType": {
    "description": "Physics behavior model for the beam.",
    "type": "string",
    "default": "|NORMAL",
    "options": ["|NORMAL", "|SUPPORT", "|HYDRO", "|BOUNDED", "|ANISOTROPIC", "|PRESSURED", "|LBEAM"],
    "physicsNote": "|NORMAL: standard spring-damper. |SUPPORT: only resists compression (anti-inversion). |HYDRO: hydraulic actuator/steering cylinder. |BOUNDED: progressive multi-stage stiffness.",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/beams/#args_beamType"
  },
  "beams > beamPrecompression": {
    "description": "Initial rest length ratio modifier at spawn time.",
    "type": "number",
    "default": "1.0",
    "validRange": "0.75 – 1.25",
    "physicsNote": "Values <1.0 preload the beam into tension (shorter); values >1.0 preload into compression (longer). Standard support beams often use 0.95–0.98.",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/beams/#args_beamPrecompression"
  },
  "beams > breakGroup": {
    "description": "Name of the group of beams that break together as a unit (e.g. bumper mounts, door hinges).",
    "type": "string|array",
    "default": "",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/beams/#args_breakGroup"
  },
  "beams > deformGroup": {
    "description": "Triggers flexbody texture damage or glass breakage when beams in this group deform past trigger ratio.",
    "type": "string|array",
    "default": "",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/beams/#args_deformGroup"
  },
  "beams > deformationTriggerRatio": {
    "description": "Deformation percentage threshold (0.01 = 1% deformation) required to trigger the deformGroup.",
    "type": "number",
    "default": "0.05",
    "validRange": "0.005 – 0.2",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/beams/#args_deformationTriggerRatio"
  },
  "beams > optional": {
    "description": "Suppresses load errors if one of the beam's nodes is in an uninstalled optional slot/subpart.",
    "type": "boolean",
    "default": "false",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/beams/#args_optional"
  },
  "beams > dampCutoffHz": {
    "description": "Low-pass vibration filter frequency cutoff in Hertz. Dampens high-frequency chatter.",
    "type": "number",
    "default": "0",
    "units": "Hz",
    "validRange": "100 – 1,000 Hz",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/beams/#args_dampCutoffHz"
  },

  // Surfaces: Triangles & Quads
  "triangles": {
    "description": "3-node surface elements for aerodynamics (lift/drag), ground contact, and visual physics.",
    "type": "table",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/triangles/"
  },
  "quads": {
    "description": "4-node coplanar surface elements. Automatically tessellated into pairs of triangles with matching aero properties.",
    "type": "table",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/triangles/"
  },
  "triangles > dragCoef": {
    "description": "Aerodynamic drag coefficient per unit surface area.",
    "type": "number",
    "default": "100",
    "validRange": "20 – 300",
    "physicsNote": "Streamlined body panels ~50–100; Blunt surfaces ~120–200; Airbrakes / spoilers ~200–350.",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/triangles/#args_dragCoef"
  },
  "triangles > liftCoef": {
    "description": "Aerodynamic lift coefficient per unit area. Positive generates lift; negative generates downforce.",
    "type": "number",
    "default": "0",
    "validRange": "-250 – 250",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/triangles/#args_liftCoef"
  },
  "triangles > pressureGroup": {
    "description": "Enclosed cabin or tire air cavity pressure simulation group.",
    "type": "string",
    "default": "",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/triangles/#args_pressureGroup"
  },

  // Flexbodies Section
  "flexbodies": {
    "description": "Visual 3D polygon meshes (.dae) that skin and deform dynamically with the underlying JBeam node skeleton.",
    "type": "table",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/flexbodies/"
  },
  "flexbodies > mesh": {
    "description": "Exact name of the submesh object inside the Collada (.dae) 3D model file.",
    "type": "string",
    "default": "",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/flexbodies/#args_mesh"
  },
  "flexbodies > group": {
    "description": "Node group name(s) whose motion deforms this 3D visual mesh.",
    "type": "string|array",
    "default": "",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/flexbodies/#args_group"
  },
  "flexbodies > pos": {
    "description": "3D position offset [X, Y, Z] applied to the mesh relative to vehicle origin.",
    "type": "array",
    "default": "[0, 0, 0]",
    "units": "m",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/flexbodies/#args_pos"
  },
  "flexbodies > rot": {
    "description": "Intrinsic Euler rotation offset [X, Y, Z] in degrees applied to the mesh.",
    "type": "array",
    "default": "[0, 0, 0]",
    "units": "deg",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/flexbodies/#args_rot"
  },
  "flexbodies > scale": {
    "description": "3D scale factor [X, Y, Z] applied to the mesh.",
    "type": "array",
    "default": "[1, 1, 1]",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/flexbodies/#args_scale"
  },
  "flexbodies > disableMeshBreaking": {
    "description": "Prevents polygons of this mesh from being clipped away when underlying beams break.",
    "type": "boolean",
    "default": "false",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/flexbodies/#args_disableMeshBreaking"
  },
  "flexbodies > ignoreNodeOffset": {
    "description": "If true, mesh placement ignores the vehicle-level nodeOffset modifier.",
    "type": "boolean",
    "default": "false",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/flexbodies/#args_ignoreNodeOffset"
  },

  // Slots Section
  "slots": {
    "description": "Modular vehicle attachment points for subcomponents (doors, engines, wheels, suspension).",
    "type": "table",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/slots/"
  },
  "slots2": {
    "description": "Modern multi-type modular attachment slots system with allowTypes and denyTypes filtering.",
    "type": "table",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/slots/"
  },
  "slots2 > name": {
    "description": "Unique slot identifier within this vehicle part.",
    "type": "string",
    "default": "",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/slots/"
  },
  "slots2 > allowTypes": {
    "description": "List of compatible slotType strings that are allowed to attach into this slot.",
    "type": "array",
    "default": "[]",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/slots/"
  },
  "slots2 > default": {
    "description": "Name of the default part that populates this slot when the vehicle spawns.",
    "type": "string",
    "default": "",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/slots/"
  },
  "slots2 > description": {
    "description": "User-friendly label shown in the Vehicle Configuration UI menu.",
    "type": "string",
    "default": "",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/slots/"
  },

  // Variables Section
  "variables": {
    "description": "User-tunable parameters exposed in the Vehicle Tuning menu (e.g. tire pressure, camber, ride height).",
    "type": "table",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/variables/"
  },
  "variables > name": {
    "description": "Internal variable identifier referenced by '$varName' or '$=expression' in JBeam tables.",
    "type": "string",
    "default": "",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/variables/"
  },
  "variables > type": {
    "description": "Tuning control widget type in the UI (e.g. 'range', 'checkbox').",
    "type": "string",
    "default": "range",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/variables/"
  },
  "variables > min": {
    "description": "Minimum selectable tuning value.",
    "type": "number",
    "default": "0",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/variables/"
  },
  "variables > max": {
    "description": "Maximum selectable tuning value.",
    "type": "number",
    "default": "100",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/variables/"
  },
  "variables > default": {
    "description": "Default initial value of the tuning variable.",
    "type": "number",
    "default": "50",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/variables/"
  },
  "variables > step": {
    "description": "Slider increment step value.",
    "type": "number",
    "default": "1",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/variables/"
  },

  // RefNodes Section
  "refNodes": {
    "description": "Defines the 4 core reference orientation nodes [ref, back, left, up] for vehicle camera, speedometer, and physics orientation.",
    "type": "table",
    "documentation": "https://documentation.beamng.com/modding/vehicle/sections/refnodes/"
  }
};

/**
 * Normalizes a section name to match documented section keys.
 * @param {string} sectionName
 * @returns {string}
 */
export function normalizeSectionName(sectionName) {
  if (!sectionName) return '';
  const s = sectionName.toLowerCase().trim();
  if (s.includes('node')) return 'nodes';
  if (s.includes('beam')) return 'beams';
  if (s.includes('tri')) return 'triangles';
  if (s.includes('quad')) return 'quads';
  if (s.includes('flex')) return 'flexbodies';
  if (s.includes('slot2')) return 'slots2';
  if (s.includes('slot')) return 'slots';
  if (s.includes('var')) return 'variables';
  if (s.includes('info')) return 'information';
  if (s.includes('ref')) return 'refNodes';
  return s;
}

/**
 * Finds the documentation entry for a parameter word and optional section.
 * @param {string} word
 * @param {string} [sectionName]
 * @returns {{ key: string, doc: object } | null}
 */
export function findDocumentationEntry(word, sectionName = '') {
  if (!word || typeof word !== 'string') return null;
  const cleanWord = word.replace(/["':,]/g, '').trim();
  if (!cleanWord) return null;

  const cleanSection = normalizeSectionName(sectionName);

  // 1. Try exact section > word match (e.g. 'beams > beamSpring')
  if (cleanSection) {
    const key = `${cleanSection} > ${cleanWord}`;
    if (JBEAM_DOCUMENTATION[key]) {
      return { key, doc: JBEAM_DOCUMENTATION[key] };
    }
  }

  // 2. Try top-level section match (e.g. 'flexbodies', 'nodes', 'beams')
  if (JBEAM_DOCUMENTATION[cleanWord]) {
    return { key: cleanWord, doc: JBEAM_DOCUMENTATION[cleanWord] };
  }

  // 3. Scan all keys for matching parameter name suffix (e.g. ' > beamSpring', ' > nodeWeight')
  for (const [key, doc] of Object.entries(JBEAM_DOCUMENTATION)) {
    if (key.endsWith(` > ${cleanWord}`)) {
      return { key, doc };
    }
  }

  return null;
}

/**
 * Formats documentation as Markdown content suitable for Monaco Hover provider.
 * @param {string} key
 * @param {object} doc
 * @param {object} [context]
 * @returns {string}
 */
export function formatHoverMarkdown(key, doc, context = {}) {
  const parts = [];

  // Breadcrumb Header
  const breadcrumb = context.partName
    ? `${context.partName} > ${key}`
    : key;
  parts.push(`### \`${breadcrumb}\``);

  // Description
  parts.push(doc.description);

  // Specs & Properties List
  const details = [];
  if (doc.type) details.push(`- **Type:** \`${doc.type}\``);
  if (doc.default !== undefined && doc.default !== '') details.push(`- **Default:** \`${doc.default}\``);
  if (doc.units) details.push(`- **Units:** \`${doc.units}\``);
  if (doc.validRange) details.push(`- **Recommended Range:** \`${doc.validRange}\``);
  if (doc.options) details.push(`- **Options:** ${doc.options.map(o => `\`${o}\``).join(', ')}`);

  if (details.length > 0) {
    parts.push(details.join('\n'));
  }

  // Physics Advice / Note
  if (doc.physicsNote) {
    parts.push(`> **BeamNG Physics Guide:** ${doc.physicsNote}`);
  }

  // Official Documentation Link
  if (doc.documentation) {
    parts.push(`[View BeamNG Official Documentation](${doc.documentation})`);
  }

  return parts.join('\n\n');
}

export default {
  JBEAM_DOCUMENTATION,
  normalizeSectionName,
  findDocumentationEntry,
  formatHoverMarkdown
};
