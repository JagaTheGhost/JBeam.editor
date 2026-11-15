/**
 * JBeam Studio - Vehicle Mod Template Generator
 * Generates official BeamNG.drive compliant starter vehicles with
 * modular JBeam parts, slot hierarchies, default .pc configurations,
 * and metadata.
 */

export function sanitizeVehicleId(rawId) {
  if (!rawId) return 'new_vehicle';
  return rawId
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '') || 'new_vehicle';
}

/**
 * Generates a complete set of vehicle files based on user parameters.
 *
 * @param {Object} options
 * @param {string} options.vehicleId - Unique vehicle identifier (e.g., 'hyperion_gt')
 * @param {string} options.vehicleName - User-friendly display name (e.g., 'Hyperion GT')
 * @param {string} options.author - Creator name (e.g., 'BeamModder')
 * @param {string} [options.archetype='unibody'] - 'unibody', 'truck', or 'minimal'
 * @returns {Record<string, string>} Map of relative file paths to file text contents
 */
export function generateVehicleModFiles({
  vehicleId = 'custom_car',
  vehicleName = 'Custom Vehicle',
  author = 'Author',
  archetype = 'unibody'
}) {
  const id = sanitizeVehicleId(vehicleId);
  const name = vehicleName.trim() || 'Custom Vehicle';
  const authorName = author.trim() || 'Author';

  const files = {};

  // 1. info.json
  files['info.json'] = JSON.stringify({
    Name: name,
    Brand: 'Custom',
    Author: authorName,
    Type: archetype === 'truck' ? 'Truck' : 'Car',
    default_pc: 'default',
    default_color: 'White',
    paints: {
      'White': '1 1 1 1.2',
      'Jet Black': '0.05 0.05 0.05 1.2',
      'Flame Red': '0.85 0.1 0.1 1.2',
      'Royal Blue': '0.1 0.25 0.85 1.2'
    }
  }, null, 2);

  // 2. main.materials.json
  files['main.materials.json'] = JSON.stringify({
    [`${id}_paint`]: {
      name: `${id}_paint`,
      mapTo: `${id}_paint`,
      class: 'Material',
      Stages: [
        {
          color: [0.15, 0.45, 0.9, 1.0],
          metallicFactor: 0.7,
          roughnessFactor: 0.3
        }
      ]
    },
    [`${id}_frame`]: {
      name: `${id}_frame`,
      mapTo: `${id}_frame`,
      class: 'Material',
      Stages: [
        {
          color: [0.2, 0.2, 0.2, 1.0],
          metallicFactor: 0.2,
          roughnessFactor: 0.8
        }
      ]
    }
  }, null, 2);

  // 3. default.pc
  files['default.pc'] = JSON.stringify({
    format: 2,
    model: id,
    mainPartName: id,
    parts: {
      [`${id}_body`]: `${id}_body`,
      [`${id}_engine`]: `${id}_engine`,
      [`${id}_suspension_F`]: `${id}_suspension_F`,
      [`${id}_suspension_R`]: `${id}_suspension_R`
    },
    paints: [
      {
        baseColor: [0.85, 0.85, 0.85, 1.2],
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        metallic: 0.3,
        roughness: 0.4
      }
    ]
  }, null, 2);

  // Dimensions based on archetype (BeamNG standard: -Y is Front/Forward, +Y is Rear/Backward)
  const zFloor = archetype === 'truck' ? 0.45 : 0.35;
  const zRoof = archetype === 'truck' ? 1.60 : 1.35;
  const xHalf = archetype === 'truck' ? 0.95 : 0.85;
  const yFront = archetype === 'truck' ? -1.95 : -1.70;
  const yRear = archetype === 'truck' ? 1.95 : 1.65;
  const yMid = 0.0;

  // 4. Main Root Part: <id>.jbeam
  files[`${id}.jbeam`] = `{
  "${id}": {
    "information": {
      "authors": "${authorName}",
      "name": "${name} Main Chassis"
    },
    "slotType": "main",
    "slots": [
      ["type", "default", "description"],
      ["${id}_body", "${id}_body", "Body Shell"],
      ["${id}_engine", "${id}_engine", "Engine & Powertrain"],
      ["${id}_suspension_F", "${id}_suspension_F", "Front Suspension"],
      ["${id}_suspension_R", "${id}_suspension_R", "Rear Suspension"]
    ],
    "refNodes": [
      ["ref:", "back:", "left:", "up:", "leftCorner:", "rightCorner:"],
      ["ref", "refback", "refleft", "refup", "f1l", "f1r"]
    ],
    "nodes": [
      ["id", "posX", "posY", "posZ"],
      {"nodeWeight": 14.5},
      {"group": "${id}_frame"},
      {"chemEnergy": false},
      {"collision": true},
      {"selfCollision": true},

      // Front frame nodes
      ["f1r", -${xHalf}, ${yFront}, ${zFloor}],
      ["f1l", ${xHalf}, ${yFront}, ${zFloor}],
      ["f2r", -${xHalf}, ${yFront}, ${zFloor + 0.28}],
      ["f2l", ${xHalf}, ${yFront}, ${zFloor + 0.28}],

      // Mid cabin frame nodes
      ["m1r", -${xHalf}, ${yMid}, ${zFloor}],
      ["m1l", ${xHalf}, ${yMid}, ${zFloor}],
      ["m2r", -${xHalf}, ${yMid}, ${zFloor + 0.28}],
      ["m2l", ${xHalf}, ${yMid}, ${zFloor + 0.28}],

      // Rear frame nodes
      ["r1r", -${xHalf}, ${yRear}, ${zFloor}],
      ["r1l", ${xHalf}, ${yRear}, ${zFloor}],
      ["r2r", -${xHalf}, ${yRear}, ${zFloor + 0.28}],
      ["r2l", ${xHalf}, ${yRear}, ${zFloor + 0.28}],

      // Orientation reference nodes (camera, AI & vehicle orientation)
      {"group": ""},
      {"collision": false},
      {"selfCollision": false},
      {"nodeWeight": 4.0},
      ["ref", 0.0, 0.0, ${zFloor + 0.15}],
      {"nodeWeight": 1.5},
      ["refback", 0.0, 0.45, ${zFloor + 0.15}],
      ["refleft", 0.45, 0.0, ${zFloor + 0.15}],
      ["refup", 0.0, 0.0, ${zFloor + 0.60}]
    ],
    "beams": [
      ["id1:", "id2:"],
      {"beamPrecompression": 1, "beamType": "|NORMAL", "beamLongBound": 1, "beamShortBound": 1},
      {"beamSpring": 3500000, "beamDamp": 250},
      {"beamDeform": 45000, "beamStrength": 350000},

      // Longitudinal chassis rails
      ["f1r", "m1r"],
      ["f1l", "m1l"],
      ["m1r", "r1r"],
      ["m1l", "r1l"],
      ["f2r", "m2r"],
      ["f2l", "m2l"],
      ["m2r", "r2r"],
      ["m2l", "r2l"],

      // Vertical uprights
      ["f1r", "f2r"],
      ["f1l", "f2l"],
      ["m1r", "m2r"],
      ["m1l", "m2l"],
      ["r1r", "r2r"],
      ["r1l", "r2l"],

      // Cross members
      ["f1r", "f1l"],
      ["f2r", "f2l"],
      ["m1r", "m1l"],
      ["m2r", "m2l"],
      ["r1r", "r1l"],
      ["r2r", "r2l"],

      // Shear diagonals
      ["f1r", "m2r"],
      ["f2r", "m1r"],
      ["f1l", "m2l"],
      ["f2l", "m1l"],
      ["m1r", "r2r"],
      ["m2r", "r1r"],
      ["m1l", "r2l"],
      ["m2l", "r1l"],

      // Horizontal floor diagonals
      ["f1r", "m1l"],
      ["f1l", "m1r"],
      ["m1r", "r1l"],
      ["m1l", "r1r"],

      // Reference node rigid diamond
      {"beamSpring": 1500000, "beamDamp": 100},
      {"beamDeform": 75000, "beamStrength": "FLT_MAX"},
      ["ref", "refback"],
      ["ref", "refleft"],
      ["ref", "refup"],
      ["refback", "refleft"],
      ["refback", "refup"],
      ["refleft", "refup"],

      // Anchor reference nodes to frame
      ["ref", "m1r"],
      ["ref", "m1l"],
      ["ref", "m2r"],
      ["ref", "m2l"],
      ["ref", "f1r"],
      ["ref", "f1l"],
      ["ref", "r1r"],
      ["ref", "r1l"]
    ],
    "triangles": [
      ["id1:", "id2:", "id3:"],
      {"groundModel": "metal"},
      {"dragCoef": 3},
      // Chassis lower collision floor
      ["f1r", "f1l", "m1l"],
      ["f1r", "m1l", "m1r"],
      ["m1r", "m1l", "r1l"],
      ["m1r", "r1l", "r1r"]
    ]
  }
}
`;

  // 5. Body Shell: <id>_body.jbeam
  files[`${id}_body.jbeam`] = `{
  "${id}_body": {
    "information": {
      "authors": "${authorName}",
      "name": "${name} Body Shell"
    },
    "slotType": "${id}_body",
    "flexbodies": [],
    "nodes": [
      ["id", "posX", "posY", "posZ"],
      {"nodeWeight": 8.0},
      {"group": "${id}_body"},
      {"chemEnergy": false},
      {"collision": true},
      {"selfCollision": true},

      // Roof & Pillar Nodes
      ["rf1r", -${xHalf * 0.75}, ${yFront * 0.25}, ${zRoof}],
      ["rf1l", ${xHalf * 0.75}, ${yFront * 0.25}, ${zRoof}],
      ["rf2r", -${xHalf * 0.75}, ${yRear * 0.5}, ${zRoof}],
      ["rf2l", ${xHalf * 0.75}, ${yRear * 0.5}, ${zRoof}],

      // Windshield cowl
      ["cowl_r", -${xHalf * 0.85}, ${yFront * 0.55}, ${zFloor + 0.55}],
      ["cowl_l", ${xHalf * 0.85}, ${yFront * 0.55}, ${zFloor + 0.55}],

      // Lower body sill / rocker nodes
      ["b1r", -${xHalf * 0.9}, ${yFront * 0.5}, ${zFloor + 0.1}],
      ["b1l", ${xHalf * 0.9}, ${yFront * 0.5}, ${zFloor + 0.1}],
      ["b2r", -${xHalf * 0.9}, ${yRear * 0.5}, ${zFloor + 0.1}],
      ["b2l", ${xHalf * 0.9}, ${yRear * 0.5}, ${zFloor + 0.1}]
    ],
    "beams": [
      ["id1:", "id2:"],
      {"beamSpring": 2200000, "beamDamp": 400},
      {"beamDeform": 35000, "beamStrength": 220000},

      // Roof perimeter
      ["rf1r", "rf1l"],
      ["rf2r", "rf2l"],
      ["rf1r", "rf2r"],
      ["rf1l", "rf2l"],
      ["rf1r", "rf2l"],
      ["rf1l", "rf2r"],

      // A-Pillars
      ["rf1r", "cowl_r"],
      ["rf1l", "cowl_l"],
      ["cowl_r", "b1r"],
      ["cowl_l", "b1l"],
      ["cowl_r", "cowl_l"],
      ["rf1r", "b1r"],
      ["rf1l", "b1l"],
      ["rf1r", "cowl_l"],
      ["rf1l", "cowl_r"],
      ["cowl_r", "b1l"],
      ["cowl_l", "b1r"],

      // B/C-Pillars
      ["rf2r", "b2r"],
      ["rf2l", "b2l"],
      ["b1r", "b2r"],
      ["b1l", "b2l"],
      ["rf2r", "b2l"],
      ["rf2l", "b2r"],

      // Side Wall Cross-Bracing (prevents fore-aft roof parallelogramming / flapping)
      ["rf1r", "b2r"],
      ["rf2r", "b1r"],
      ["rf1l", "b2l"],
      ["rf2l", "b1l"],
      ["cowl_r", "rf2r"],
      ["cowl_l", "rf2l"],
      ["cowl_r", "b2r"],
      ["cowl_l", "b2l"],

      // Fully triangulated mounts to chassis frame (eliminates all rocking/wobble)
      {"beamSpring": 2800000, "beamDamp": 600},
      ["b1r", "m2r"],
      ["b1r", "m1r"],
      ["b1r", "f1r"],
      ["b1r", "f2r"],

      ["b1l", "m2l"],
      ["b1l", "m1l"],
      ["b1l", "f1l"],
      ["b1l", "f2l"],

      ["b2r", "m2r"],
      ["b2r", "m1r"],
      ["b2r", "r1r"],
      ["b2r", "r2r"],

      ["b2l", "m2l"],
      ["b2l", "m1l"],
      ["b2l", "r1l"],
      ["b2l", "r2l"],

      ["cowl_r", "f2r"],
      ["cowl_l", "f2l"],
      ["cowl_r", "m2r"],
      ["cowl_l", "m2l"],
      ["cowl_r", "f1r"],
      ["cowl_l", "f1l"],

      // Direct Roof to Chassis Frame anchors
      ["rf1r", "f2r"],
      ["rf1l", "f2l"],
      ["rf1r", "m2r"],
      ["rf1l", "m2l"],
      ["rf2r", "m2r"],
      ["rf2l", "m2l"],
      ["rf2r", "r2r"],
      ["rf2l", "r2l"]
    ],
    "triangles": [
      ["id1:", "id2:", "id3:"],
      {"groundModel": "metal"},
      {"dragCoef": 0.8},
      // Roof Surface
      ["rf1r", "rf1l", "rf2l"],
      ["rf1r", "rf2l", "rf2r"],
      // Windshield
      ["cowl_r", "cowl_l", "rf1l"],
      ["cowl_r", "rf1l", "rf1r"]
    ]
  }
}
`;

  // 6. Engine: <id>_engine.jbeam
  files[`${id}_engine.jbeam`] = `{
  "${id}_engine": {
    "information": {
      "authors": "${authorName}",
      "name": "${name} 3.0L Inline Engine"
    },
    "slotType": "${id}_engine",
    "mainEngine": {
      "torque": [
        ["rpm", "torque"],
        [0, 0],
        [500, 110],
        [1000, 210],
        [2000, 290],
        [3000, 340],
        [4000, 360],
        [5000, 350],
        [6000, 310],
        [7000, 240]
      ],
      "idleRPM": 800,
      "maxRPM": 6800,
      "inertia": 0.16,
      "friction": 14,
      "dynamicFriction": 0.024,
      "engineBrakeTorque": 35,
      "burnEfficiency": 0.32
    },
    "powertrain": [
      ["type", "name", "inputName", "inputIndex"],
      ["combustionEngine", "mainEngine", "dummy", 0],
      ["frictionClutch", "clutch", "mainEngine", 1],
      ["manualGearbox", "gearbox", "clutch", 1],
      ["differential", "differential_R", "gearbox", 1, {"diffType": "open", "gearRatio": 3.9}],
      ["shaft", "wheelaxle_RR", "differential_R", 1, {"connectedWheel": "RR", "breakTriggerBeam": "axle_RR", "uiName": "Rear Right Axle"}],
      ["shaft", "wheelaxle_RL", "differential_R", 2, {"connectedWheel": "RL", "breakTriggerBeam": "axle_RL", "uiName": "Rear Left Axle"}]
    ],
    "gearbox": {
      "uiName": "Gearbox",
      "gearRatios": [-3.4, 0, 3.4, 2.1, 1.4, 1.0, 0.8],
      "friction": 1.2,
      "dynamicFriction": 0.0012,
      "torqueLossCoef": 0.015
    },
    "clutch": {
      "uiName": "Clutch",
      "clutchFreePlay": 0.25,
      "lockSpring": 2500
    },
    "nodes": [
      ["id", "posX", "posY", "posZ"],
      {"nodeWeight": 45.0},
      {"group": "${id}_engine"},
      {"chemEnergy": false},
      {"collision": true},
      {"selfCollision": false},

      ["e1r", -0.22, ${yFront * 0.65}, ${zFloor + 0.15}],
      ["e1l", 0.22, ${yFront * 0.65}, ${zFloor + 0.15}],
      ["e2r", -0.22, ${yFront * 0.15}, ${zFloor + 0.15}],
      ["e2l", 0.22, ${yFront * 0.15}, ${zFloor + 0.15}]
    ],
    "beams": [
      ["id1:", "id2:"],
      {"beamSpring": 6000000, "beamDamp": 600},
      {"beamDeform": 95000, "beamStrength": 500000},

      // Engine block solid cage
      ["e1r", "e1l"],
      ["e2r", "e2l"],
      ["e1r", "e2r"],
      ["e1l", "e2l"],
      ["e1r", "e2l"],
      ["e1l", "e2r"],

      // Engine mounts to chassis with healthy damping
      {"beamSpring": 2500000, "beamDamp": 800},
      ["e1r", "f1r"],
      ["e1l", "f1l"],
      ["e2r", "m1r"],
      ["e2l", "m1l"]
    ]
  }
}
`;

  // 7. Front Suspension: <id>_suspension_F.jbeam
  files[`${id}_suspension_F.jbeam`] = `{
  "${id}_suspension_F": {
    "information": {
      "authors": "${authorName}",
      "name": "${name} Front Suspension"
    },
    "slotType": "${id}_suspension_F",
    "nodes": [
      ["id", "posX", "posY", "posZ"],
      {"nodeWeight": 8.0},
      {"group": "${id}_suspension_F"},
      {"collision": false},
      {"selfCollision": false},

      // Front wheel hubs & spindles (wheel center at Z=0.32)
      ["fw1r", -${xHalf - 0.11}, ${yFront * 0.75}, 0.32],
      ["fw1rr", -${xHalf + 0.13}, ${yFront * 0.75}, 0.32, {"collision": true}],
      ["fw2r", -${xHalf - 0.11}, ${yFront * 0.75}, 0.60],

      ["fw1l", ${xHalf - 0.11}, ${yFront * 0.75}, 0.32],
      ["fw1ll", ${xHalf + 0.13}, ${yFront * 0.75}, 0.32, {"collision": true}],
      ["fw2l", ${xHalf - 0.11}, ${yFront * 0.75}, 0.60]
    ],
    "beams": [
      ["id1:", "id2:"],
      {"beamSpring": 4500000, "beamDamp": 1200},
      {"beamDeform": 75000, "beamStrength": 450000},

      // Front Right rigid hub upright
      ["fw1r", "fw1rr"],
      ["fw1r", "fw2r"],
      ["fw1rr", "fw2r"],

      // Front Left rigid hub upright
      ["fw1l", "fw1ll"],
      ["fw1l", "fw2l"],
      ["fw1ll", "fw2l"],

      // Lower Control A-Arms (pivots cleanly around f1-m1 axis, no kinematic binding)
      {"beamSpring": 3200000, "beamDamp": 1200},
      ["fw1r", "f1r"],
      ["fw1r", "m1r"],
      ["fw1rr", "f1r"],
      ["fw1rr", "m1r"],

      ["fw1l", "f1l"],
      ["fw1l", "m1l"],
      ["fw1ll", "f1l"],
      ["fw1ll", "m1l"],

      // Lateral anti-sway track stabilizers
      {"beamSpring": 1800000, "beamDamp": 900},
      ["fw1r", "f1l"],
      ["fw1l", "f1r"],

      // Upper guide links (smooth arc, highly damped)
      {"beamSpring": 2200000, "beamDamp": 1100},
      ["fw2r", "f2r"],
      ["fw2r", "m2r"],
      ["fw2l", "f2l"],
      ["fw2l", "m2l"],

      // Front Suspension Coilovers (Springs & Dampers)
      {"beamSpring": 42000, "beamDamp": 3200},
      {"beamPrecompression": 1.05},
      ["fw1r", "f2r"],
      ["fw1l", "f2l"]
    ],
    "pressureWheels": [
      ["name", "hubGroup", "group", "node1:", "node2:", "nodeS", "nodeArm:", "wheelDir"],
      {"disableMeshBreaking": false, "disableHubMeshBreaking": false, "enableHubcaps": false},
      {"hasTire": true},
      {"enableBraking": true},
      {"brakeTorque": 1600},
      {"parkingTorque": 0},
      {"brakeSpring": 120},

      // 15-inch rim (0.19m) with 195/65 R15 tire (0.32m outer radius, 0.20m width)
      {"hubRadius": 0.19},
      {"wheelOffset": 0.0},
      {"hubWidth": 0.20},
      {"numRays": 12},
      {"radius": 0.32},
      {"tireWidth": 0.20},

      // Tire Rubber Physics
      {"hubNodeWeight": 2.2},
      {"hubNodeMaterial": "|NM_RUBBER"},
      {"hubFrictionCoef": 1.0},
      {"nodeWeight": 1.8},
      {"nodeMaterial": "|NM_RUBBER"},
      {"frictionCoef": 1.05},
      {"triangleCollision": false},
      {"pressure": 28},
      {"maxPressure": 50},

      // Tire structural carcass beams
      {"hubTreadBeamSpring": 1500000, "hubTreadBeamDamp": 15},
      {"hubPeripheryBeamSpring": 1500000, "hubPeripheryBeamDamp": 15},
      {"hubSideBeamSpring": 1600000, "hubSideBeamDamp": 15},
      {"wheelSideBeamSpring": 180000, "wheelSideBeamDamp": 25},
      {"wheelTreadBeamSpring": 180000, "wheelTreadBeamDamp": 25},
      {"wheelPeripheryBeamSpring": 180000, "wheelPeripheryBeamDamp": 25},

      // Front Wheels: node1 is outer spindle, node2 is inner hub, nodeArm is upright
      {"selfCollision": false},
      {"collision": true},
      ["FR", "wheel_FR", "tire_FR", "fw1rr", "fw1r", 9999, "fw2r", 1],
      ["FL", "wheel_FL", "tire_FL", "fw1ll", "fw1l", 9999, "fw2l", -1]
    ]
  }
}
`;

  // 8. Rear Suspension: <id>_suspension_R.jbeam
  files[`${id}_suspension_R.jbeam`] = `{
  "${id}_suspension_R": {
    "information": {
      "authors": "${authorName}",
      "name": "${name} Rear Suspension"
    },
    "slotType": "${id}_suspension_R",
    "nodes": [
      ["id", "posX", "posY", "posZ"],
      {"nodeWeight": 8.0},
      {"group": "${id}_suspension_R"},
      {"collision": false},
      {"selfCollision": false},

      // Rear wheel hubs & spindles (wheel center at Z=0.32)
      ["rw1r", -${xHalf - 0.11}, ${yRear * 0.75}, 0.32],
      ["rw1rr", -${xHalf + 0.13}, ${yRear * 0.75}, 0.32, {"collision": true}],
      ["rw2r", -${xHalf - 0.11}, ${yRear * 0.75}, 0.60],

      ["rw1l", ${xHalf - 0.11}, ${yRear * 0.75}, 0.32],
      ["rw1ll", ${xHalf + 0.13}, ${yRear * 0.75}, 0.32, {"collision": true}],
      ["rw2l", ${xHalf - 0.11}, ${yRear * 0.75}, 0.60]
    ],
    "beams": [
      ["id1:", "id2:"],
      {"beamSpring": 4500000, "beamDamp": 1200},
      {"beamDeform": 75000, "beamStrength": 450000},

      // Rear Right rigid hub upright
      ["rw1r", "rw1rr"],
      ["rw1r", "rw2r"],
      ["rw1rr", "rw2r"],

      // Rear Left rigid hub upright
      ["rw1l", "rw1ll"],
      ["rw1l", "rw2l"],
      ["rw1ll", "rw2l"],

      // Lower Control A-Arms (pivots cleanly around r1-m1 axis, no kinematic binding)
      {"beamSpring": 3200000, "beamDamp": 1200},
      ["rw1r", "r1r"],
      ["rw1r", "m1r"],
      ["rw1rr", "r1r"],
      ["rw1rr", "m1r"],

      ["rw1l", "r1l"],
      ["rw1l", "m1l"],
      ["rw1ll", "r1l"],
      ["rw1ll", "m1l"],

      // Lateral anti-sway track stabilizers
      {"beamSpring": 1800000, "beamDamp": 900},
      ["rw1r", "r1l"],
      ["rw1l", "r1r"],

      // Upper guide links (smooth arc, highly damped)
      {"beamSpring": 2200000, "beamDamp": 1100},
      ["rw2r", "r2r"],
      ["rw2r", "m2r"],
      ["rw2l", "r2l"],
      ["rw2l", "m2l"],

      // Rear Suspension Coilovers (Springs & Dampers)
      {"beamSpring": 45000, "beamDamp": 3400},
      {"beamPrecompression": 1.05},
      ["rw1r", "r2r"],
      ["rw1l", "r2l"]
    ],
    "pressureWheels": [
      ["name", "hubGroup", "group", "node1:", "node2:", "nodeS", "nodeArm:", "wheelDir"],
      {"disableMeshBreaking": false, "disableHubMeshBreaking": false, "enableHubcaps": false},
      {"hasTire": true},
      {"enableBraking": true},
      {"brakeTorque": 1200},
      {"parkingTorque": 2500},
      {"brakeSpring": 120},

      // 15-inch rim (0.19m) with 195/65 R15 tire (0.32m outer radius, 0.20m width)
      {"hubRadius": 0.19},
      {"wheelOffset": 0.0},
      {"hubWidth": 0.20},
      {"numRays": 12},
      {"radius": 0.32},
      {"tireWidth": 0.20},

      // Tire Rubber Physics
      {"hubNodeWeight": 2.2},
      {"hubNodeMaterial": "|NM_RUBBER"},
      {"hubFrictionCoef": 1.0},
      {"nodeWeight": 1.8},
      {"nodeMaterial": "|NM_RUBBER"},
      {"frictionCoef": 1.05},
      {"triangleCollision": false},
      {"pressure": 28},
      {"maxPressure": 50},

      // Tire structural carcass beams
      {"hubTreadBeamSpring": 1500000, "hubTreadBeamDamp": 15},
      {"hubPeripheryBeamSpring": 1500000, "hubPeripheryBeamDamp": 15},
      {"hubSideBeamSpring": 1600000, "hubSideBeamDamp": 15},
      {"wheelSideBeamSpring": 180000, "wheelSideBeamDamp": 25},
      {"wheelTreadBeamSpring": 180000, "wheelTreadBeamDamp": 25},
      {"wheelPeripheryBeamSpring": 180000, "wheelPeripheryBeamDamp": 25},

      // Rear Wheels
      {"selfCollision": false},
      {"collision": true},
      ["RR", "wheel_RR", "tire_RR", "rw1rr", "rw1r", 9999, "rw2r", 1],
      ["RL", "wheel_RL", "tire_RL", "rw1ll", "rw1l", 9999, "rw2l", -1]
    ]
  }
}
`;

  return files;
}

export default {
  sanitizeVehicleId,
  generateVehicleModFiles
};
