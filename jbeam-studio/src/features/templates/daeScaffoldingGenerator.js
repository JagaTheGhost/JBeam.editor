/**
 * DAE-to-JBeam Scaffolding Generator
 * Analyzes Collada (.dae) 3D vehicle models and automatically generates
 * perfectly mapped .jbeam files, flexbody bindings, and parent-child slot hierarchies.
 */

import { sanitizeVehicleId } from './vehicleTemplateGenerator.js';

/**
 * Intelligent categorization dictionary for vehicle submeshes.
 */
export const SUBMESH_CATEGORIES = {
  frame: { priority: 1, label: 'Chassis / Frame', isRootCandidate: true, folder: 'frame' },
  body: { priority: 2, label: 'Main Body / Cabin', isRootCandidate: true, folder: 'body' },
  bumper_f: { priority: 10, label: 'Front Bumper', isDetachable: true, folder: 'bumpers/front' },
  bumper_r: { priority: 11, label: 'Rear Bumper', isDetachable: true, folder: 'bumpers/rear' },
  hood: { priority: 12, label: 'Hood / Bonnet', isDetachable: true, folder: 'hood' },
  trunk: { priority: 13, label: 'Tailgate / Trunk', isDetachable: true, folder: 'tailgate' },
  door_fl: { priority: 14, label: 'Front Left Door', isDetachable: true, folder: 'doors', isSymmetric: true, side: 'L' },
  door_fr: { priority: 15, label: 'Front Right Door', isDetachable: true, folder: 'doors', isSymmetric: true, side: 'R' },
  door_rl: { priority: 16, label: 'Rear Left Door', isDetachable: true, folder: 'doors', isSymmetric: true, side: 'L' },
  door_rr: { priority: 17, label: 'Rear Right Door', isDetachable: true, folder: 'doors', isSymmetric: true, side: 'R' },
  fender_fl: { priority: 18, label: 'Front Left Fender', isDetachable: true, folder: 'fenders', isSymmetric: true, side: 'L' },
  fender_fr: { priority: 19, label: 'Front Right Fender', isDetachable: true, folder: 'fenders', isSymmetric: true, side: 'R' },
  fender_rl: { priority: 20, label: 'Rear Left Quarter', isDetachable: true, folder: 'fenders', isSymmetric: true, side: 'L' },
  fender_rr: { priority: 21, label: 'Rear Right Quarter', isDetachable: true, folder: 'fenders', isSymmetric: true, side: 'R' },
  fascia: { priority: 22, label: 'Front Fascia / Grille', isDetachable: true, folder: 'fascia' },
  headlights: { priority: 23, label: 'Headlights', isDetachable: true, folder: 'lighting' },
  taillights: { priority: 24, label: 'Taillights', isDetachable: true, folder: 'lighting' },
  signals: { priority: 25, label: 'Signal Lights', isDetachable: true, folder: 'lighting' },
  mirror_l: { priority: 26, label: 'Left Mirror', isDetachable: true, folder: 'mirrors', isSymmetric: true, side: 'L' },
  mirror_r: { priority: 27, label: 'Right Mirror', isDetachable: true, folder: 'mirrors', isSymmetric: true, side: 'R' },
  glass: { priority: 30, label: 'Windows / Windshield', isDetachable: true, folder: 'glass' },
  interior: { priority: 31, label: 'Interior / Dashboard', isDetachable: true, folder: 'interior' },
  seats: { priority: 32, label: 'Seats', isDetachable: true, folder: 'interior' },
  steering: { priority: 40, label: 'Steering Linkage', isDetachable: true, folder: 'suspension' },
  suspension_f: { priority: 41, label: 'Front Suspension', isDetachable: true, folder: 'suspension', isChassisSlot: true },
  suspension_r: { priority: 42, label: 'Rear Suspension', isDetachable: true, folder: 'suspension', isChassisSlot: true },
  exhaust: { priority: 45, label: 'Exhaust System', isDetachable: true, folder: 'exhaust', isChassisSlot: true },
  fueltank: { priority: 46, label: 'Fuel Tank', isDetachable: true, folder: 'fueltank', isChassisSlot: true },
  radiator: { priority: 47, label: 'Radiator & Support', isDetachable: true, folder: 'radiator' },
  bed: { priority: 50, label: 'Truck Bed / Tray', isDetachable: true, folder: 'bed' },
  accessory: { priority: 99, label: 'Exterior Accessory / Detail', isDetachable: true, folder: 'accessories' }
};

/**
 * Checks whether a submesh name is a generic 3D modeling fragment
 * (e.g. Mesh_001, Cylinder_042, Cube_003) rather than a named automotive part.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isGenericMeshName(name) {
  if (!name || typeof name !== 'string') return true;
  return /^(?:mesh|cylinder|cube|sphere|circle|cone|plane|torus|nurbs|object|curve|geom|default|shape)[-_0-9.]*$/i.test(name.trim());
}

/**
 * Detects known automotive style/variant keywords (tube, offroad, heavy, sport, facelift, etc.)
 * @param {string} name
 * @returns {string|null}
 */
export function detectVariantKeyword(name) {
  if (!name || typeof name !== 'string') return null;
  const n = name.toLowerCase();
  if (/(?:^|[_-])(?:tube|tubular|stinger)(?:[_-]|$)/i.test(n)) return 'tube';
  if (/(?:^|[_-])(?:offroad|shackle)(?:[_-]|$)/i.test(n)) return 'offroad';
  if (/(?:^|[_-])(?:prefacelift|early)(?:[_-]|$)/i.test(n)) {
    if (/heavy/i.test(n)) return 'prefacelift_heavy';
    return 'prefacelift';
  }
  if (/(?:^|[_-])(?:facelift|late)(?:[_-]|$)/i.test(n)) {
    if (/sport/i.test(n)) return 'sport_facelift';
    if (/heavy/i.test(n)) return 'facelift_heavy';
    return 'facelift';
  }
  if (/(?:^|[_-])(?:sport|roadsport|race|drift|rally|custom)(?:[_-]|$)/i.test(n)) return 'sport';
  if (/(?:^|[_-])heavy(?:[_-]|$)/i.test(n)) return 'heavy';
  if (/(?:^|[_-])(?:wide|widebody|flare|flares)(?:[_-]|$)/i.test(n)) return 'wide';
  if (/(?:^|[_-])(?:cf|carbon|carbonfiber)(?:[_-]|$)/i.test(n)) return 'cf';
  if (/(?:^|[_-])(?:flatbed|tray)(?:[_-]|$)/i.test(n)) return 'flatbed';
  if (/(?:^|[_-])stepside(?:[_-]|$)/i.test(n)) return 'stepside';
  if (/(?:^|[_-])dually(?:[_-]|$)/i.test(n)) return 'dually';
  if (/(?:^|[_-])(?:long|longbed)(?:[_-]|$)/i.test(n)) return 'longbed';
  return null;
}

/**
 * Categorizes a submesh name into standard automotive sections.
 * @param {string} rawName
 * @returns {{category: string, label: string, isRootCandidate: boolean, isDetachable: boolean, isGeneric: boolean}}
 */
export function categorizeSubmesh(rawName) {
  if (!rawName || typeof rawName !== 'string') {
    return { category: 'accessory', label: 'Accessory', isRootCandidate: false, isDetachable: false, isGeneric: true };
  }

  const name = rawName.toLowerCase().trim();
  const isGeneric = isGenericMeshName(rawName);

  // Root frame / chassis / cabin
  if (/^(?:frame|chassis|subframe|ladder)/.test(name)) {
    return { category: 'frame', label: 'Chassis Frame', isRootCandidate: true, isDetachable: false, isGeneric: false };
  }
  if (/^(?:body|cab|cabin|unibody|shell|hull)/.test(name)) {
    return { category: 'body', label: 'Main Body', isRootCandidate: true, isDetachable: false, isGeneric: false };
  }

  // Hood / Bonnet
  if (/hood|bonnet/.test(name)) {
    return { category: 'hood', label: 'Hood', isRootCandidate: false, isDetachable: true, isGeneric: false };
  }

  // Trunk / Tailgate
  if (/trunk|\btailgate\b|\bhatch\b/.test(name) || (/\bboot\b/.test(name) && !/shiftboot/.test(name))) {
    return { category: 'trunk', label: 'Tailgate / Trunk', isRootCandidate: false, isDetachable: true, isGeneric: false };
  }

  // Bumpers - Strict Front vs Rear boundary matching with bilateral _L/_R awareness
  if (/bumper/.test(name)) {
    const hasFrontBumperToken = /bumper[_-]f(?:[_-]|$)|(?:^|[_-])(?:front)[_-]?bumper|bumper.*[_-]f\b/i.test(name);
    const hasRearBumperToken = /bumper(?:step)?[_-]r(?:[_-]|$)|(?:^|[_-])(?:rear|back)[_-]?bumper|bumper.*[_-]r\b/i.test(name);
    if (hasFrontBumperToken && !hasRearBumperToken) {
      return { category: 'bumper_f', label: 'Front Bumper', isRootCandidate: false, isDetachable: true, isGeneric: false };
    }
    if (hasRearBumperToken && !hasFrontBumperToken) {
      return { category: 'bumper_r', label: 'Rear Bumper', isRootCandidate: false, isDetachable: true, isGeneric: false };
    }
    // Secondary check: strip trailing bilateral indicator (_L, _R) before testing
    const cleanNoTrailingLR = name.replace(/[_-][lr]$/i, '');
    const isFront = /(?:^|[_-])(?:f|front)(?:[_-]|$)/i.test(cleanNoTrailingLR);
    const isRear = /(?:^|[_-])(?:r|rear|back)(?:[_-]|$)/i.test(cleanNoTrailingLR);
    if (isRear && !isFront) {
      return { category: 'bumper_r', label: 'Rear Bumper', isRootCandidate: false, isDetachable: true, isGeneric: false };
    }
    return { category: 'bumper_f', label: 'Front Bumper', isRootCandidate: false, isDetachable: true, isGeneric: false };
  }

  // Doors - Strict side and quadrant matching
  if (/door/.test(name)) {
    if (/(?:^|[_-])fl\b|front.*[_-]l|[_-]l.*front/i.test(name)) {
      return { category: 'door_fl', label: 'Front Left Door', isRootCandidate: false, isDetachable: true, isGeneric: false };
    }
    if (/(?:^|[_-])fr\b|front.*[_-]r|[_-]r.*front/i.test(name)) {
      return { category: 'door_fr', label: 'Front Right Door', isRootCandidate: false, isDetachable: true, isGeneric: false };
    }
    if (/(?:^|[_-])rl\b|rear.*[_-]l|[_-]l.*rear/i.test(name)) {
      return { category: 'door_rl', label: 'Rear Left Door', isRootCandidate: false, isDetachable: true, isGeneric: false };
    }
    if (/(?:^|[_-])rr\b|rear.*[_-]r|[_-]r.*rear/i.test(name)) {
      return { category: 'door_rr', label: 'Rear Right Door', isRootCandidate: false, isDetachable: true, isGeneric: false };
    }
    if (/(?:^|[_-])l$|left/i.test(name)) {
      return { category: 'door_fl', label: 'Left Door', isRootCandidate: false, isDetachable: true, isGeneric: false };
    }
    if (/(?:^|[_-])r$|right/i.test(name)) {
      return { category: 'door_fr', label: 'Right Door', isRootCandidate: false, isDetachable: true, isGeneric: false };
    }
    return { category: 'door_fl', label: 'Door', isRootCandidate: false, isDetachable: true, isGeneric: false };
  }

  // Fenders / Quarter panels
  if (/fender|quarter/.test(name)) {
    if (/(?:^|[_-])fl\b|front.*[_-]l/i.test(name)) {
      return { category: 'fender_fl', label: 'Front Left Fender', isRootCandidate: false, isDetachable: true, isGeneric: false };
    }
    if (/(?:^|[_-])fr\b|front.*[_-]r/i.test(name)) {
      return { category: 'fender_fr', label: 'Front Right Fender', isRootCandidate: false, isDetachable: true, isGeneric: false };
    }
    if (/(?:^|[_-])rl\b|rear.*[_-]l/i.test(name)) {
      return { category: 'fender_rl', label: 'Rear Left Quarter', isRootCandidate: false, isDetachable: true, isGeneric: false };
    }
    if (/(?:^|[_-])rr\b|rear.*[_-]r/i.test(name)) {
      return { category: 'fender_rr', label: 'Rear Right Quarter', isRootCandidate: false, isDetachable: true, isGeneric: false };
    }
    if (/(?:^|[_-])l$|left/i.test(name)) {
      return { category: 'fender_fl', label: 'Left Fender', isRootCandidate: false, isDetachable: true, isGeneric: false };
    }
    if (/(?:^|[_-])r$|right/i.test(name)) {
      return { category: 'fender_fr', label: 'Right Fender', isRootCandidate: false, isDetachable: true, isGeneric: false };
    }
    return { category: 'fender_fl', label: 'Fender', isRootCandidate: false, isDetachable: true, isGeneric: false };
  }

  // Fascia & Grille
  if (/fascia|grille|valance|airdam|header_panel/i.test(name)) {
    return { category: 'fascia', label: 'Front Fascia / Grille', isRootCandidate: false, isDetachable: true, isGeneric: false };
  }

  // Lighting
  if (/headlight|headlamp/i.test(name)) {
    return { category: 'headlights', label: 'Headlights', isRootCandidate: false, isDetachable: true, isGeneric: false };
  }
  if (/taillight|taillamp|tail_light|chmsl/i.test(name)) {
    return { category: 'taillights', label: 'Taillights', isRootCandidate: false, isDetachable: true, isGeneric: false };
  }
  if (/signal|indicator|marker/i.test(name)) {
    return { category: 'signals', label: 'Signal Lights', isRootCandidate: false, isDetachable: true, isGeneric: false };
  }

  // Mirrors
  if (/mirror/i.test(name)) {
    if (/(?:^|[_-])l$|left/i.test(name)) {
      return { category: 'mirror_l', label: 'Left Mirror', isRootCandidate: false, isDetachable: true, isGeneric: false };
    }
    if (/(?:^|[_-])r$|right/i.test(name)) {
      return { category: 'mirror_r', label: 'Right Mirror', isRootCandidate: false, isDetachable: true, isGeneric: false };
    }
    return { category: 'mirror_l', label: 'Mirror', isRootCandidate: false, isDetachable: true, isGeneric: false };
  }

  // Truck Bed
  if (/bed|tray|cargo_box|flatbed|campershell/i.test(name)) {
    return { category: 'bed', label: 'Truck Bed', isRootCandidate: false, isDetachable: true, isGeneric: false };
  }

  // Fuel tanks
  if (/fueltank|fuel_tank|fuelcell/i.test(name)) {
    return { category: 'fueltank', label: 'Fuel Tank', isRootCandidate: false, isDetachable: true, isGeneric: false };
  }

  // Exhaust
  if (/exhaust|muffler|sidepipes|header/i.test(name)) {
    return { category: 'exhaust', label: 'Exhaust System', isRootCandidate: false, isDetachable: true, isGeneric: false };
  }

  // Radiator
  if (/radiator|radsupport|intercooler/i.test(name)) {
    return { category: 'radiator', label: 'Radiator & Support', isRootCandidate: false, isDetachable: true, isGeneric: false };
  }

  // Glass / Windows
  if (/glass|windshield|window|backlight/i.test(name)) {
    return { category: 'glass', label: 'Glass / Windshield', isRootCandidate: false, isDetachable: true, isGeneric: false };
  }

  // Seats & Interior
  if (/seat/i.test(name)) {
    return { category: 'seats', label: 'Seats', isRootCandidate: false, isDetachable: true, isGeneric: false };
  }
  if (/interior|dash|gauge|console/i.test(name)) {
    return { category: 'interior', label: 'Interior', isRootCandidate: false, isDetachable: true, isGeneric: false };
  }

  // Suspension & Steering
  if (/suspension|strut|shock|spring|axle|wishbone|controlarm|sway_bar|swaybar/i.test(name)) {
    const isRearSusp = /(?:^|[_-])(?:r|rear)(?:[_-]|$)/i.test(name);
    if (isRearSusp) {
      return { category: 'suspension_r', label: 'Rear Suspension', isRootCandidate: false, isDetachable: true, isGeneric: false };
    }
    return { category: 'suspension_f', label: 'Front Suspension', isRootCandidate: false, isDetachable: true, isGeneric: false };
  }
  if (/steer|tie_rod|tierod|drag_link|draglink|track_bar|spindle/i.test(name)) {
    return { category: 'steering', label: 'Steering Linkage', isRootCandidate: false, isDetachable: true, isGeneric: false };
  }

  // Generic loose fragment vs. named accessory
  if (isGeneric) {
    return { category: 'accessory', label: 'Body Detail', isRootCandidate: false, isDetachable: false, isGeneric: true };
  }

  // Human-friendly title case from snake_case
  const cleanLabel = rawName
    .replace(/^percheron_|^vehicle_/i, '')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  return { category: 'accessory', label: cleanLabel, isRootCandidate: false, isDetachable: true, isGeneric: false };
}

/**
 * Resolves which modular part file, slot type, and folder a given submesh should belong to.
 * Fully supports variants (e.g. tube, offroad, heavy, facelift) with shared slotType,
 * bilateral symmetry, and BeamNG-standard categorized folder layouts.
 *
 * @param {string} rawName
 * @param {string} cleanId - Vehicle ID
 * @returns {{
 *   isModular: boolean,
 *   partKey: string,
 *   slotType: string,
 *   slotLabel: string,
 *   label: string,
 *   folder: string,
 *   category: string,
 *   isSymmetric: boolean,
 *   side: 'L'|'R'|null,
 *   isChassisSlot: boolean,
 *   isVariant: boolean
 * }}
 */
export function resolvePartGrouping(rawName, cleanId = 'custom_vehicle') {
  if (!rawName || typeof rawName !== 'string') {
    return {
      isModular: false,
      partKey: `${cleanId}_body`,
      slotType: `${cleanId}_body`,
      slotLabel: 'Body Shell',
      label: 'Main Body',
      folder: 'body',
      category: 'body',
      isSymmetric: false,
      side: null,
      isChassisSlot: false,
      isVariant: false
    };
  }

  const name = rawName.toLowerCase().trim();
  const unprefixed = name.replace(new RegExp(`^${cleanId}[_-]`, 'i'), '');

  // 1. Generic loose fragments (Mesh_001, Cylinder_042) -> body
  if (isGenericMeshName(unprefixed)) {
    return {
      isModular: false,
      partKey: `${cleanId}_body`,
      slotType: `${cleanId}_body`,
      slotLabel: 'Body Shell',
      label: 'Main Body',
      folder: 'body',
      category: 'body',
      isSymmetric: false,
      side: null,
      isChassisSlot: false,
      isVariant: false
    };
  }

  // 2. Structural frame, cab, cabin, shell, interior, dash, floor, roof -> body
  if (/^(?:body|cab|cabin|unibody|shell|hull|chassis|frame|subframe|interior|dash|seat|floor|roof)/.test(unprefixed)) {
    return {
      isModular: false,
      partKey: `${cleanId}_body`,
      slotType: `${cleanId}_body`,
      slotLabel: 'Body Shell',
      label: 'Main Body',
      folder: 'body',
      category: 'body',
      isSymmetric: false,
      side: null,
      isChassisSlot: false,
      isVariant: false
    };
  }

  // 3. Brackets, mounts, bolts, straps, clamps, airbags without a modular parent -> body
  if (/^(?:airbag|airsp|bolt|mount|bracket|strap|clamp|screw|hardware|shiftboot)/.test(unprefixed)) {
    return {
      isModular: false,
      partKey: `${cleanId}_body`,
      slotType: `${cleanId}_body`,
      slotLabel: 'Body Shell',
      label: 'Main Body',
      folder: 'body',
      category: 'body',
      isSymmetric: false,
      side: null,
      isChassisSlot: false,
      isVariant: false
    };
  }

  // 4. Bumpers - with strict front vs rear separation and variant grouping
  if (/bumper/.test(unprefixed)) {
    const isFront = /(?:^|[_-])(?:f|front)(?:[_-]|$)/i.test(unprefixed) || /bumper.*[_-]f\b/i.test(unprefixed);
    const isRear = /(?:^|[_-])(?:r|rear|back)(?:[_-]|$)/i.test(unprefixed) || /bumper.*[_-]r\b/i.test(unprefixed);
    const variant = detectVariantKeyword(unprefixed);

    // Bumper Guards as accessory sub-part
    if (/guards/i.test(unprefixed)) {
      const isR = isRear && !isFront;
      const keySuffix = isR ? 'bumper_guards_R' : 'bumper_guards_F';
      const slotName = isR ? 'Rear Bumper Guards' : 'Front Bumper Guards';
      return {
        isModular: true,
        partKey: `${cleanId}_${keySuffix}`,
        slotType: `${cleanId}_${keySuffix}`,
        slotLabel: slotName,
        label: slotName,
        folder: isR ? 'bumpers/rear' : 'bumpers/front',
        category: isR ? 'bumper_r' : 'bumper_f',
        isSymmetric: false,
        side: null,
        isChassisSlot: false,
        isVariant: false
      };
    }

    if (isRear && !isFront) {
      const slotType = `${cleanId}_bumper_R`;
      const isVariant = Boolean(variant && variant !== 'standard');
      const partKey = isVariant ? `${cleanId}_bumper_R_${variant}` : `${cleanId}_bumper_R`;
      const label = isVariant
        ? `Rear Bumper (${variant.replace(/_/g, ' ').toUpperCase()})`
        : 'Rear Bumper';
      return {
        isModular: true,
        partKey,
        slotType,
        slotLabel: 'Rear Bumper',
        label,
        folder: 'bumpers/rear',
        category: 'bumper_r',
        isSymmetric: false,
        side: null,
        isChassisSlot: false,
        isVariant
      };
    }

    // Default to Front Bumper
    const slotType = `${cleanId}_bumper_F`;
    const isVariant = Boolean(variant && variant !== 'standard');
    const partKey = isVariant ? `${cleanId}_bumper_F_${variant}` : `${cleanId}_bumper_F`;
    const label = isVariant
      ? `Front Bumper (${variant.replace(/_/g, ' ').toUpperCase()})`
      : 'Front Bumper';
    return {
      isModular: true,
      partKey,
      slotType,
      slotLabel: 'Front Bumper',
      label,
      folder: 'bumpers/front',
      category: 'bumper_f',
      isSymmetric: false,
      side: null,
      isChassisSlot: false,
      isVariant
    };
  }

  // 5. Doors (including door glass, handles, panels)
  if (/door/.test(unprefixed) || /sunroof.*door/.test(unprefixed)) {
    const isFL = /(?:^|[_-])fl\b|front.*[_-]l|[_-]l.*front/i.test(unprefixed);
    const isFR = /(?:^|[_-])fr\b|front.*[_-]r|[_-]r.*front/i.test(unprefixed);
    const isRL = /(?:^|[_-])rl\b|rear.*[_-]l|[_-]l.*rear/i.test(unprefixed);
    const isRR = /(?:^|[_-])rr\b|rear.*[_-]r|[_-]r.*rear/i.test(unprefixed);

    if (isFL) {
      return {
        isModular: true,
        partKey: `${cleanId}_door_FL`,
        slotType: `${cleanId}_door_FL`,
        slotLabel: 'Front Left Door',
        label: 'Front Left Door',
        folder: 'doors',
        category: 'door_fl',
        isSymmetric: true,
        side: 'L',
        isChassisSlot: false,
        isVariant: false
      };
    }
    if (isFR) {
      return {
        isModular: true,
        partKey: `${cleanId}_door_FR`,
        slotType: `${cleanId}_door_FR`,
        slotLabel: 'Front Right Door',
        label: 'Front Right Door',
        folder: 'doors',
        category: 'door_fr',
        isSymmetric: true,
        side: 'R',
        isChassisSlot: false,
        isVariant: false
      };
    }
    if (isRL) {
      return {
        isModular: true,
        partKey: `${cleanId}_door_RL`,
        slotType: `${cleanId}_door_RL`,
        slotLabel: 'Rear Left Door',
        label: 'Rear Left Door',
        folder: 'doors',
        category: 'door_rl',
        isSymmetric: true,
        side: 'L',
        isChassisSlot: false,
        isVariant: false
      };
    }
    if (isRR) {
      return {
        isModular: true,
        partKey: `${cleanId}_door_RR`,
        slotType: `${cleanId}_door_RR`,
        slotLabel: 'Rear Right Door',
        label: 'Rear Right Door',
        folder: 'doors',
        category: 'door_rr',
        isSymmetric: true,
        side: 'R',
        isChassisSlot: false,
        isVariant: false
      };
    }
    if (/(?:^|[_-])l$|left/i.test(unprefixed)) {
      return {
        isModular: true,
        partKey: `${cleanId}_door_FL`,
        slotType: `${cleanId}_door_FL`,
        slotLabel: 'Front Left Door',
        label: 'Left Door',
        folder: 'doors',
        category: 'door_fl',
        isSymmetric: true,
        side: 'L',
        isChassisSlot: false,
        isVariant: false
      };
    }
    if (/(?:^|[_-])r$|right/i.test(unprefixed)) {
      return {
        isModular: true,
        partKey: `${cleanId}_door_FR`,
        slotType: `${cleanId}_door_FR`,
        slotLabel: 'Front Right Door',
        label: 'Right Door',
        folder: 'doors',
        category: 'door_fr',
        isSymmetric: true,
        side: 'R',
        isChassisSlot: false,
        isVariant: false
      };
    }
    return {
      isModular: true,
      partKey: `${cleanId}_door_FL`,
      slotType: `${cleanId}_door_FL`,
      slotLabel: 'Front Left Door',
      label: 'Door',
      folder: 'doors',
      category: 'door_fl',
      isSymmetric: false,
      side: null,
      isChassisSlot: false,
      isVariant: false
    };
  }

  // 6. Hood / Bonnet
  if (/hood|bonnet/.test(unprefixed)) {
    const variant = detectVariantKeyword(unprefixed);
    const isVariant = Boolean(variant && variant !== 'standard');
    const partKey = isVariant ? `${cleanId}_hood_${variant}` : `${cleanId}_hood`;
    const label = isVariant ? `Hood (${variant.toUpperCase()})` : 'Hood';
    return {
      isModular: true,
      partKey,
      slotType: `${cleanId}_hood`,
      slotLabel: 'Hood',
      label,
      folder: 'hood',
      category: 'hood',
      isSymmetric: false,
      side: null,
      isChassisSlot: false,
      isVariant
    };
  }

  // 7. Trunk / Tailgate
  if (/trunk|\btailgate\b|\bhatch\b/.test(unprefixed) || (/\bboot\b/.test(unprefixed) && !/shiftboot/.test(unprefixed))) {
    const variant = detectVariantKeyword(unprefixed);
    const isVariant = Boolean(variant && variant !== 'standard');
    const partKey = isVariant ? `${cleanId}_tailgate_${variant}` : `${cleanId}_tailgate`;
    const label = isVariant ? `Tailgate (${variant.toUpperCase()})` : 'Tailgate';
    return {
      isModular: true,
      partKey,
      slotType: `${cleanId}_tailgate`,
      slotLabel: 'Tailgate / Trunk',
      label,
      folder: 'tailgate',
      category: 'trunk',
      isSymmetric: false,
      side: null,
      isChassisSlot: false,
      isVariant
    };
  }

  // 8. Fenders & Quarter Panels
  if (/fender|quarter/.test(unprefixed)) {
    const isFL = /(?:^|[_-])fl\b|front.*[_-]l/i.test(unprefixed);
    const isFR = /(?:^|[_-])fr\b|front.*[_-]r/i.test(unprefixed);
    const isRL = /(?:^|[_-])rl\b|rear.*[_-]l/i.test(unprefixed);
    const isRR = /(?:^|[_-])rr\b|rear.*[_-]r/i.test(unprefixed);

    if (isFL) {
      return {
        isModular: true,
        partKey: `${cleanId}_fender_FL`,
        slotType: `${cleanId}_fender_FL`,
        slotLabel: 'Front Left Fender',
        label: 'Front Left Fender',
        folder: 'fenders',
        category: 'fender_fl',
        isSymmetric: true,
        side: 'L',
        isChassisSlot: false,
        isVariant: false
      };
    }
    if (isFR) {
      return {
        isModular: true,
        partKey: `${cleanId}_fender_FR`,
        slotType: `${cleanId}_fender_FR`,
        slotLabel: 'Front Right Fender',
        label: 'Front Right Fender',
        folder: 'fenders',
        category: 'fender_fr',
        isSymmetric: true,
        side: 'R',
        isChassisSlot: false,
        isVariant: false
      };
    }
    if (isRL) {
      return {
        isModular: true,
        partKey: `${cleanId}_fender_RL`,
        slotType: `${cleanId}_fender_RL`,
        slotLabel: 'Rear Left Quarter',
        label: 'Rear Left Quarter',
        folder: 'fenders',
        category: 'fender_rl',
        isSymmetric: true,
        side: 'L',
        isChassisSlot: false,
        isVariant: false
      };
    }
    if (isRR) {
      return {
        isModular: true,
        partKey: `${cleanId}_fender_RR`,
        slotType: `${cleanId}_fender_RR`,
        slotLabel: 'Rear Right Quarter',
        label: 'Rear Right Quarter',
        folder: 'fenders',
        category: 'fender_rr',
        isSymmetric: true,
        side: 'R',
        isChassisSlot: false,
        isVariant: false
      };
    }
    if (/(?:^|[_-])l$|left/i.test(unprefixed)) {
      return {
        isModular: true,
        partKey: `${cleanId}_fender_FL`,
        slotType: `${cleanId}_fender_FL`,
        slotLabel: 'Front Left Fender',
        label: 'Left Fender',
        folder: 'fenders',
        category: 'fender_fl',
        isSymmetric: true,
        side: 'L',
        isChassisSlot: false,
        isVariant: false
      };
    }
    if (/(?:^|[_-])r$|right/i.test(unprefixed)) {
      return {
        isModular: true,
        partKey: `${cleanId}_fender_FR`,
        slotType: `${cleanId}_fender_FR`,
        slotLabel: 'Front Right Fender',
        label: 'Right Fender',
        folder: 'fenders',
        category: 'fender_fr',
        isSymmetric: true,
        side: 'R',
        isChassisSlot: false,
        isVariant: false
      };
    }
    return {
      isModular: true,
      partKey: `${cleanId}_fender_FL`,
      slotType: `${cleanId}_fender_FL`,
      slotLabel: 'Front Left Fender',
      label: 'Fender',
      folder: 'fenders',
      category: 'fender_fl',
      isSymmetric: false,
      side: null,
      isChassisSlot: false,
      isVariant: false
    };
  }

  // 9. Fascia & Grille
  if (/fascia|grille|valance|airdam/i.test(unprefixed)) {
    const variant = detectVariantKeyword(unprefixed);
    const isVariant = Boolean(variant && variant !== 'standard');
    const partKey = isVariant ? `${cleanId}_fascia_${variant}` : `${cleanId}_fascia`;
    return {
      isModular: true,
      partKey,
      slotType: `${cleanId}_fascia`,
      slotLabel: 'Front Fascia & Grille',
      label: isVariant ? `Front Fascia (${variant.toUpperCase()})` : 'Front Fascia & Grille',
      folder: 'fascia',
      category: 'fascia',
      isSymmetric: false,
      side: null,
      isChassisSlot: false,
      isVariant
    };
  }

  // 10. Headlights & Taillights
  if (/headlight|headlamp/i.test(unprefixed)) {
    return {
      isModular: true,
      partKey: `${cleanId}_headlights`,
      slotType: `${cleanId}_headlights`,
      slotLabel: 'Headlights',
      label: 'Headlights',
      folder: 'lighting',
      category: 'headlights',
      isSymmetric: false,
      side: null,
      isChassisSlot: false,
      isVariant: false
    };
  }
  if (/taillight|taillamp|tail_light|chmsl/i.test(unprefixed)) {
    return {
      isModular: true,
      partKey: `${cleanId}_taillights`,
      slotType: `${cleanId}_taillights`,
      slotLabel: 'Taillights',
      label: 'Taillights',
      folder: 'lighting',
      category: 'taillights',
      isSymmetric: false,
      side: null,
      isChassisSlot: false,
      isVariant: false
    };
  }

  // 11. Mirrors
  if (/mirror/i.test(unprefixed)) {
    const isR = /(?:^|[_-])r$|right/i.test(unprefixed);
    return {
      isModular: true,
      partKey: isR ? `${cleanId}_mirror_R` : `${cleanId}_mirror_L`,
      slotType: isR ? `${cleanId}_mirror_R` : `${cleanId}_mirror_L`,
      slotLabel: isR ? 'Right Mirror' : 'Left Mirror',
      label: isR ? 'Right Mirror' : 'Left Mirror',
      folder: 'mirrors',
      category: isR ? 'mirror_r' : 'mirror_l',
      isSymmetric: true,
      side: isR ? 'R' : 'L',
      isChassisSlot: false,
      isVariant: false
    };
  }

  // 12. Glass / Windows
  if (/glass|windshield|backlight/.test(unprefixed)) {
    return {
      isModular: true,
      partKey: `${cleanId}_${unprefixed}`,
      slotType: `${cleanId}_${unprefixed}`,
      slotLabel: 'Glass / Windshield',
      label: 'Glass / Windshield',
      folder: 'glass',
      category: 'glass',
      isSymmetric: false,
      side: null,
      isChassisSlot: false,
      isVariant: false
    };
  }

  // 13. Truck Bed
  if (/bed|tray|cargo_box|flatbed/i.test(unprefixed)) {
    const variant = detectVariantKeyword(unprefixed);
    const isVariant = Boolean(variant && variant !== 'standard');
    const partKey = isVariant ? `${cleanId}_bed_${variant}` : `${cleanId}_bed`;
    return {
      isModular: true,
      partKey,
      slotType: `${cleanId}_bed`,
      slotLabel: 'Truck Bed',
      label: isVariant ? `Truck Bed (${variant.toUpperCase()})` : 'Truck Bed',
      folder: 'bed',
      category: 'bed',
      isSymmetric: false,
      side: null,
      isChassisSlot: false,
      isVariant
    };
  }

  // 14. Suspension & Steering
  if (/suspension|strut|shock|spring|axle|wishbone|controlarm|sway_bar|swaybar/i.test(unprefixed)) {
    const isR = /(?:^|[_-])(?:r|rear)(?:[_-]|$)/i.test(unprefixed);
    return {
      isModular: true,
      partKey: isR ? `${cleanId}_suspension_R` : `${cleanId}_suspension_F`,
      slotType: isR ? `${cleanId}_suspension_R` : `${cleanId}_suspension_F`,
      slotLabel: isR ? 'Rear Suspension' : 'Front Suspension',
      label: isR ? 'Rear Suspension' : 'Front Suspension',
      folder: 'suspension',
      category: isR ? 'suspension_r' : 'suspension_f',
      isSymmetric: false,
      side: null,
      isChassisSlot: true,
      isVariant: false
    };
  }
  if (/steering|tierod|tie_rod|draglink|drag_link/.test(unprefixed)) {
    if (/midlift/.test(unprefixed)) {
      return {
        isModular: true,
        partKey: `${cleanId}_midlift_steering`,
        slotType: `${cleanId}_midlift_steering`,
        slotLabel: 'Midlift Steering Linkage',
        label: 'Midlift Steering Linkage',
        folder: 'suspension',
        category: 'steering',
        isSymmetric: false,
        side: null,
        isChassisSlot: true,
        isVariant: false
      };
    }
    if (/taglift/.test(unprefixed)) {
      return {
        isModular: true,
        partKey: `${cleanId}_taglift_steering`,
        slotType: `${cleanId}_taglift_steering`,
        slotLabel: 'Taglift Steering Linkage',
        label: 'Taglift Steering Linkage',
        folder: 'suspension',
        category: 'steering',
        isSymmetric: false,
        side: null,
        isChassisSlot: true,
        isVariant: false
      };
    }
    return {
      isModular: true,
      partKey: `${cleanId}_steering`,
      slotType: `${cleanId}_steering`,
      slotLabel: 'Steering Linkage',
      label: 'Steering Linkage',
      folder: 'suspension',
      category: 'steering',
      isSymmetric: false,
      side: null,
      isChassisSlot: true,
      isVariant: false
    };
  }

  // 15. Fuel tanks
  if (/fueltank|fuel_tank|fuelcell/i.test(unprefixed)) {
    if (/_l$|_l_|left/.test(unprefixed)) {
      return {
        isModular: true,
        partKey: `${cleanId}_fueltank_L`,
        slotType: `${cleanId}_fueltank`,
        slotLabel: 'Fuel Tank',
        label: 'Left Fuel Tank',
        folder: 'fueltank',
        category: 'fueltank',
        isSymmetric: true,
        side: 'L',
        isChassisSlot: true,
        isVariant: false
      };
    }
    if (/_r$|_r_|right/.test(unprefixed)) {
      return {
        isModular: true,
        partKey: `${cleanId}_fueltank_R`,
        slotType: `${cleanId}_fueltank`,
        slotLabel: 'Fuel Tank',
        label: 'Right Fuel Tank',
        folder: 'fueltank',
        category: 'fueltank',
        isSymmetric: true,
        side: 'R',
        isChassisSlot: true,
        isVariant: false
      };
    }
    return {
      isModular: true,
      partKey: `${cleanId}_fueltank`,
      slotType: `${cleanId}_fueltank`,
      slotLabel: 'Fuel Tank',
      label: 'Fuel Tank',
      folder: 'fueltank',
      category: 'fueltank',
      isSymmetric: false,
      side: null,
      isChassisSlot: true,
      isVariant: false
    };
  }

  // 16. Exhaust
  if (/exhaust|muffler|sidepipes/i.test(unprefixed)) {
    return {
      isModular: true,
      partKey: `${cleanId}_exhaust`,
      slotType: `${cleanId}_exhaust`,
      slotLabel: 'Exhaust System',
      label: 'Exhaust System',
      folder: 'exhaust',
      category: 'exhaust',
      isSymmetric: false,
      side: null,
      isChassisSlot: true,
      isVariant: false
    };
  }

  // Default: Part of main body shell
  return {
    isModular: false,
    partKey: `${cleanId}_body`,
    slotType: `${cleanId}_body`,
    slotLabel: 'Body Shell',
    label: 'Main Body',
    folder: 'body',
    category: 'body',
    isSymmetric: false,
    side: null,
    isChassisSlot: false,
    isVariant: false
  };
}

/**
 * Parses Collada (.dae) XML text and extracts all submesh metadata.
 * Prioritizes actual Collada <node name="..."> elements inside <library_visual_scenes>,
 * which corresponds 1:1 with Three.js object names and BeamNG flexbody bindings.
 *
 * @param {string} daeContent - Raw XML text of .dae file
 * @returns {Array<{name: string, id: string, category: string, label: string, isRootCandidate: boolean, isDetachable: boolean, isGeneric: boolean, approxVertices: number}>}
 */
export function extractSubmeshesFromDae(daeContent) {
  if (!daeContent || typeof daeContent !== 'string') return [];

  const submeshes = [];
  const seenNames = new Set();

  // Pattern 1 (Primary): Visual Scene <node id="..." name="...">
  const vsStart = daeContent.indexOf('<library_visual_scenes>');
  const vsEnd = daeContent.indexOf('</library_visual_scenes>');
  const searchBlock = (vsStart !== -1 && vsEnd !== -1)
    ? daeContent.substring(vsStart, vsEnd)
    : '';

  if (searchBlock) {
    const nodeRegex = /<node\s+([^>]*?)>/gi;
    let match;

    while ((match = nodeRegex.exec(searchBlock)) !== null) {
      const attrs = match[1] || '';

      const typeMatch = attrs.match(/\btype=["']([^"']+)["']/i);
      const nodeType = typeMatch ? typeMatch[1].toUpperCase() : 'NODE';
      if (nodeType === 'JOINT') continue;

      const nameMatch = attrs.match(/\bname=["']([^"']+)["']/i);
      const idMatch = attrs.match(/\bid=["']([^"']+)["']/i);

      const rawName = (nameMatch ? nameMatch[1] : (idMatch ? idMatch[1] : '')).trim();
      const rawId = idMatch ? idMatch[1] : rawName;

      if (!rawName) continue;
      if (/^(?:camera|light|lamp|sun|spot|point|ambient|armature)/i.test(rawName)) continue;

      const cleanName = rawName.replace(/-mesh$/i, '').replace(/_mesh$/i, '').trim();
      if (!cleanName || seenNames.has(cleanName)) continue;
      seenNames.add(cleanName);

      const cat = categorizeSubmesh(cleanName);
      submeshes.push({
        name: cleanName,
        id: rawId,
        ...cat,
        approxVertices: 100
      });
    }
  }

  // Fallback Pattern 2: <geometry id="..." name="...">
  if (submeshes.length === 0) {
    const geomRegex = /<geometry\s+[^>]*?id=["']([^"']+)["'][^>]*?(?:name=["']([^"']+)["'])?[^>]*?>/gi;
    let match;

    while ((match = geomRegex.exec(daeContent)) !== null) {
      const rawId = match[1] || '';
      const rawName = match[2] || rawId;

      const cleanName = rawName.replace(/-mesh$/i, '').replace(/_mesh$/i, '').trim();
      if (!cleanName || seenNames.has(cleanName)) continue;
      seenNames.add(cleanName);

      const cat = categorizeSubmesh(cleanName);
      submeshes.push({
        name: cleanName,
        id: rawId,
        ...cat,
        approxVertices: 100
      });
    }
  }

  return submeshes;
}

/**
 * Generates realistic, symmetric seed nodes and beams for vehicle sub-parts.
 * Gives modders an immediate physical foundation with bilateral symmetry.
 *
 * @param {string} partKey
 * @param {object} partInfo
 * @param {string} cleanId
 * @returns {{nodesText: string, beamsText: string, trianglesText: string}}
 */
export function generateSeedNodesAndBeams(partKey, partInfo, cleanId) {
  const group = partKey;
  const cat = partInfo.category || '';
  const side = partInfo.side || null;

  // 1. Doors
  if (cat.startsWith('door_')) {
    const isL = side === 'L';
    const sgn = isL ? 1 : -1;
    const sfx = isL ? 'l' : 'r';
    const yOff = cat.includes('rl') || cat.includes('rr') ? 0.8 : -0.2;

    const nodesText = `      ["id", "posX", "posY", "posZ"],
      {"nodeWeight": 4.0},
      {"frictionCoef": 0.5},
      {"nodeMaterial": "|NM_METAL"},
      {"group": "${group}"},
      ["d1${sfx}", ${(sgn * 0.82).toFixed(2)}, ${(yOff - 0.40).toFixed(2)}, 0.45],
      ["d2${sfx}", ${(sgn * 0.82).toFixed(2)}, ${(yOff + 0.40).toFixed(2)}, 0.45],
      ["d3${sfx}", ${(sgn * 0.82).toFixed(2)}, ${(yOff - 0.40).toFixed(2)}, 0.85],
      ["d4${sfx}", ${(sgn * 0.82).toFixed(2)}, ${(yOff + 0.40).toFixed(2)}, 0.85]`;

    const beamsText = `      ["id1:", "id2:"],
      {"beamSpring": 1501000, "beamDamp": 120},
      {"beamDeform": 28000, "beamStrength": 90000},
      ["d1${sfx}", "d2${sfx}"],
      ["d3${sfx}", "d4${sfx}"],
      ["d1${sfx}", "d3${sfx}"],
      ["d2${sfx}", "d4${sfx}"],
      ["d1${sfx}", "d4${sfx}"],
      ["d2${sfx}", "d3${sfx}"]`;

    const trianglesText = `      ["id1:", "id2:", "id3:"],
      {"groundModel": "metal", "dragCoef": 0.8},
      ["d1${sfx}", "d2${sfx}", "d3${sfx}"],
      ["d2${sfx}", "d4${sfx}", "d3${sfx}"]`;

    return { nodesText, beamsText, trianglesText };
  }

  // 2. Fenders
  if (cat.startsWith('fender_')) {
    const isL = side === 'L';
    const sgn = isL ? 1 : -1;
    const sfx = isL ? 'l' : 'r';
    const isRear = cat.includes('rl') || cat.includes('rr');
    const yFront = isRear ? 1.4 : -2.0;
    const yRear = isRear ? 2.1 : -1.2;

    const nodesText = `      ["id", "posX", "posY", "posZ"],
      {"nodeWeight": 3.0},
      {"frictionCoef": 0.5},
      {"nodeMaterial": "|NM_METAL"},
      {"group": "${group}"},
      ["fe1${sfx}", ${(sgn * 0.84).toFixed(2)}, ${yFront.toFixed(2)}, 0.55],
      ["fe2${sfx}", ${(sgn * 0.84).toFixed(2)}, ${yRear.toFixed(2)}, 0.60],
      ["fe3${sfx}", ${(sgn * 0.84).toFixed(2)}, ${yFront.toFixed(2)}, 0.85],
      ["fe4${sfx}", ${(sgn * 0.84).toFixed(2)}, ${yRear.toFixed(2)}, 0.88]`;

    const beamsText = `      ["id1:", "id2:"],
      {"beamSpring": 1201000, "beamDamp": 100},
      {"beamDeform": 22000, "beamStrength": 75000},
      ["fe1${sfx}", "fe2${sfx}"],
      ["fe3${sfx}", "fe4${sfx}"],
      ["fe1${sfx}", "fe3${sfx}"],
      ["fe2${sfx}", "fe4${sfx}"],
      ["fe1${sfx}", "fe4${sfx}"],
      ["fe2${sfx}", "fe3${sfx}"]`;

    const trianglesText = `      ["id1:", "id2:", "id3:"],
      {"groundModel": "metal", "dragCoef": 0.8},
      ["fe1${sfx}", "fe2${sfx}", "fe3${sfx}"],
      ["fe2${sfx}", "fe4${sfx}", "fe3${sfx}"]`;

    return { nodesText, beamsText, trianglesText };
  }

  // 3. Front Bumper
  if (cat === 'bumper_f') {
    const nodesText = `      ["id", "posX", "posY", "posZ"],
      {"nodeWeight": 3.5},
      {"frictionCoef": 0.5},
      {"nodeMaterial": "|NM_METAL"},
      {"group": "${group}"},
      ["fb1l",  0.85, -2.15, 0.45],
      ["fb1",   0.00, -2.20, 0.45],
      ["fb1r", -0.85, -2.15, 0.45],
      ["fb2l",  0.82, -2.10, 0.65],
      ["fb2",   0.00, -2.15, 0.65],
      ["fb2r", -0.82, -2.10, 0.65]`;

    const beamsText = `      ["id1:", "id2:"],
      {"beamSpring": 1601000, "beamDamp": 150},
      {"beamDeform": 32000, "beamStrength": 110000},
      ["fb1l", "fb1"],
      ["fb1", "fb1r"],
      ["fb2l", "fb2"],
      ["fb2", "fb2r"],
      ["fb1l", "fb2l"],
      ["fb1", "fb2"],
      ["fb1r", "fb2r"],
      ["fb1l", "fb2"],
      ["fb1r", "fb2"]`;

    const trianglesText = `      ["id1:", "id2:", "id3:"],
      {"groundModel": "metal", "dragCoef": 0.8},
      ["fb1l", "fb1", "fb2l"],
      ["fb1", "fb2", "fb2l"],
      ["fb1", "fb1r", "fb2r"],
      ["fb1", "fb2r", "fb2"]`;

    return { nodesText, beamsText, trianglesText };
  }

  // 4. Rear Bumper
  if (cat === 'bumper_r') {
    const nodesText = `      ["id", "posX", "posY", "posZ"],
      {"nodeWeight": 3.5},
      {"frictionCoef": 0.5},
      {"nodeMaterial": "|NM_METAL"},
      {"group": "${group}"},
      ["rb1l",  0.85,  2.15, 0.45],
      ["rb1",   0.00,  2.20, 0.45],
      ["rb1r", -0.85,  2.15, 0.45],
      ["rb2l",  0.82,  2.10, 0.65],
      ["rb2",   0.00,  2.15, 0.65],
      ["rb2r", -0.82,  2.10, 0.65]`;

    const beamsText = `      ["id1:", "id2:"],
      {"beamSpring": 1601000, "beamDamp": 150},
      {"beamDeform": 32000, "beamStrength": 110000},
      ["rb1l", "rb1"],
      ["rb1", "rb1r"],
      ["rb2l", "rb2"],
      ["rb2", "rb2r"],
      ["rb1l", "rb2l"],
      ["rb1", "rb2"],
      ["rb1r", "rb2r"],
      ["rb1l", "rb2"],
      ["rb1r", "rb2"]`;

    const trianglesText = `      ["id1:", "id2:", "id3:"],
      {"groundModel": "metal", "dragCoef": 0.8},
      ["rb1", "rb1l", "rb2l"],
      ["rb2", "rb1", "rb2l"],
      ["rb1r", "rb1", "rb2r"],
      ["rb2r", "rb1", "rb2"]`;

    return { nodesText, beamsText, trianglesText };
  }

  // 5. Hood
  if (cat === 'hood') {
    const nodesText = `      ["id", "posX", "posY", "posZ"],
      {"nodeWeight": 4.0},
      {"frictionCoef": 0.5},
      {"nodeMaterial": "|NM_METAL"},
      {"group": "${group}"},
      ["h1l",  0.75, -2.00, 0.85],
      ["h1r", -0.75, -2.00, 0.85],
      ["h2l",  0.78, -1.00, 0.90],
      ["h2r", -0.78, -1.00, 0.90]`;

    const beamsText = `      ["id1:", "id2:"],
      {"beamSpring": 1401000, "beamDamp": 120},
      {"beamDeform": 24000, "beamStrength": 80000},
      ["h1l", "h1r"],
      ["h2l", "h2r"],
      ["h1l", "h2l"],
      ["h1r", "h2r"],
      ["h1l", "h2r"],
      ["h1r", "h2l"]`;

    const trianglesText = `      ["id1:", "id2:", "id3:"],
      {"groundModel": "metal", "dragCoef": 0.8},
      ["h1l", "h1r", "h2l"],
      ["h1r", "h2r", "h2l"]`;

    return { nodesText, beamsText, trianglesText };
  }

  // 6. Tailgate / Trunk
  if (cat === 'trunk') {
    const nodesText = `      ["id", "posX", "posY", "posZ"],
      {"nodeWeight": 4.0},
      {"frictionCoef": 0.5},
      {"nodeMaterial": "|NM_METAL"},
      {"group": "${group}"},
      ["t1l",  0.75,  2.10, 0.55],
      ["t1r", -0.75,  2.10, 0.55],
      ["t2l",  0.75,  2.10, 0.90],
      ["t2r", -0.75,  2.10, 0.90]`;

    const beamsText = `      ["id1:", "id2:"],
      {"beamSpring": 1401000, "beamDamp": 120},
      {"beamDeform": 24000, "beamStrength": 80000},
      ["t1l", "t1r"],
      ["t2l", "t2r"],
      ["t1l", "t2l"],
      ["t1r", "t2r"],
      ["t1l", "t2r"],
      ["t1r", "t2l"]`;

    const trianglesText = `      ["id1:", "id2:", "id3:"],
      {"groundModel": "metal", "dragCoef": 0.8},
      ["t1l", "t1r", "t2l"],
      ["t1r", "t2r", "t2l"]`;

    return { nodesText, beamsText, trianglesText };
  }

  // 7. Suspension (Front or Rear)
  if (cat.startsWith('suspension_') || cat === 'steering') {
    const isRear = cat === 'suspension_r';
    const yPos = isRear ? 1.4 : -1.4;
    const pfx = isRear ? 'rx' : 'fx';

    const nodesText = `      ["id", "posX", "posY", "posZ"],
      {"nodeWeight": 6.0},
      {"frictionCoef": 0.5},
      {"nodeMaterial": "|NM_METAL"},
      {"group": "${group}"},
      ["${pfx}1l",  0.65, ${yPos.toFixed(2)}, 0.35],
      ["${pfx}1r", -0.65, ${yPos.toFixed(2)}, 0.35],
      ["${pfx}2l",  0.80, ${yPos.toFixed(2)}, 0.35],
      ["${pfx}2r", -0.80, ${yPos.toFixed(2)}, 0.35]`;

    const beamsText = `      ["id1:", "id2:"],
      {"beamSpring": 4501000, "beamDamp": 250},
      {"beamDeform": 65000, "beamStrength": 220000},
      ["${pfx}1l", "${pfx}1r"],
      ["${pfx}1l", "${pfx}2l"],
      ["${pfx}1r", "${pfx}2r"]`;

    const trianglesText = `      ["id1:", "id2:", "id3:"],
      {"groundModel": "metal", "dragCoef": 0.5}`;

    return { nodesText, beamsText, trianglesText };
  }

  // 8. Mirrors
  if (cat.startsWith('mirror_')) {
    const isL = side === 'L';
    const sgn = isL ? 1 : -1;
    const sfx = isL ? 'l' : 'r';

    const nodesText = `      ["id", "posX", "posY", "posZ"],
      {"nodeWeight": 1.2},
      {"frictionCoef": 0.5},
      {"nodeMaterial": "|NM_PLASTIC"},
      {"group": "${group}"},
      ["mi1${sfx}", ${(sgn * 0.88).toFixed(2)}, -0.45, 0.95],
      ["mi2${sfx}", ${(sgn * 0.98).toFixed(2)}, -0.45, 0.95]`;

    const beamsText = `      ["id1:", "id2:"],
      {"beamSpring": 801000, "beamDamp": 60},
      {"beamDeform": 12000, "beamStrength": 45000},
      ["mi1${sfx}", "mi2${sfx}"]`;

    const trianglesText = `      ["id1:", "id2:", "id3:"],
      {"groundModel": "plastic", "dragCoef": 0.2}`;

    return { nodesText, beamsText, trianglesText };
  }

  // Default fallback for generic parts
  const nodesText = `      ["id", "posX", "posY", "posZ"],
      {"nodeWeight": 4.0},
      {"frictionCoef": 0.5},
      {"nodeMaterial": "|NM_METAL"},
      {"group": "${group}"}`;

  const beamsText = `      ["id1:", "id2:"],
      {"beamSpring": 1501000, "beamDamp": 120},
      {"beamDeform": 28000, "beamStrength": 90000}`;

  const trianglesText = `      ["id1:", "id2:", "id3:"],
      {"groundModel": "metal", "dragCoef": 0.8}`;

  return { nodesText, beamsText, trianglesText };
}

/**
 * Generates an intelligently grouped, modular bundle of JBeam files and slot hierarchy from a .dae model.
 *
 * - Groups loose/generic mesh fragments into the parent body flexbodies.
 * - Places modular part files neatly into categorized subfolders (bumpers/front, bumpers/rear, doors, etc.)
 *   or a clean `parts/` subfolder according to folderStructure mode.
 * - Uses strictly valid BeamNG TableSchema `slots` table format (never `slots2`), guaranteeing 0 validation errors.
 * - Generates bilateral symmetrical nodes for doors, fenders, bumpers, and suspension.
 *
 * @param {object} params
 * @param {string} params.daeContent - Collada .dae file text
 * @param {string} [params.daeFileName='vehicle.dae'] - Name of the .dae file
 * @param {string} [params.vehicleId='custom_vehicle'] - Unique vehicle identifier
 * @param {string} [params.vehicleName='Custom Vehicle'] - User-facing display title
 * @param {string} [params.author='BeamModder'] - Author name
 * @param {string} [params.rootMeshName] - Submesh to use as the root chassis/body
 * @param {string[]} [params.selectedSubmeshes] - Optional subset of submeshes to include
 * @param {boolean} [params.consolidateGenericMeshes=true] - Auto-bind loose numeric fragments into body flexbody
 * @param {boolean} [params.organizeInPartsFolder=true] - Place modular sub-parts in subfolders
 * @param {string} [params.folderStructure=null] - 'categorized' | 'parts' | 'flat'
 * @returns {{files: object, rootPartName: string, submeshCount: number, slotsCount: number, modularPartsCount: number}}
 */
export function generateScaffoldingFromDae({
  daeContent,
  daeFileName = 'model.dae',
  vehicleId = 'custom_vehicle',
  vehicleName = 'Custom Vehicle',
  author = 'BeamModder',
  rootMeshName = null,
  selectedSubmeshes = null,
  consolidateGenericMeshes = true,
  organizeInPartsFolder = true,
  folderStructure = null
}) {
  const cleanId = sanitizeVehicleId(vehicleId) || 'custom_vehicle';
  const allSubmeshes = extractSubmeshesFromDae(daeContent);

  // Folder structure resolution:
  // If folderStructure is explicitly passed ('categorized', 'parts', 'flat'), use it.
  // Otherwise, default to 'parts' if organizeInPartsFolder is true, or 'flat' if false.
  const structureMode = folderStructure || (organizeInPartsFolder ? 'parts' : 'flat');

  const activeSubmeshes = Array.isArray(selectedSubmeshes) && selectedSubmeshes.length > 0
    ? allSubmeshes.filter(s => selectedSubmeshes.includes(s.name))
    : allSubmeshes;

  // 1. Identify Root Mesh (Body/Chassis)
  let root = activeSubmeshes.find(s => s.name === rootMeshName);
  if (!root) {
    root = activeSubmeshes.find(s => s.isRootCandidate) ||
           activeSubmeshes.find(s => /body|cab|cabin|chassis|frame/i.test(s.name)) ||
           activeSubmeshes[0];
  }
  const rootName = root ? root.name : `${cleanId}_body`;

  // 2. Separate into:
  //    a) Body-bound meshes (cab, frame, brackets, bolts, loose fragments)
  //    b) Modular detachable parts (doors, hood, bumpers, fenders, fueltanks, steering)
  const bodyBoundMeshes = [];
  const modularGroups = new Map(); // partKey -> { key, label, slotType, slotLabel, folder, category, isSymmetric, side, isChassisSlot, isVariant, submeshes: [] }
  const slotToDefaultPart = new Map(); // slotType -> { defaultPartKey, slotLabel, isChassisSlot }

  for (const s of activeSubmeshes) {
    if (s.name === rootName) {
      bodyBoundMeshes.push(s.name);
      continue;
    }

    const groupInfo = resolvePartGrouping(s.name, cleanId);

    if (groupInfo.isModular && (!consolidateGenericMeshes || !s.isGeneric)) {
      const partKey = groupInfo.partKey;
      if (!modularGroups.has(partKey)) {
        modularGroups.set(partKey, {
          key: partKey,
          label: groupInfo.label,
          slotType: groupInfo.slotType || partKey,
          slotLabel: groupInfo.slotLabel || groupInfo.label,
          folder: groupInfo.folder || 'parts',
          category: groupInfo.category || 'accessory',
          isSymmetric: Boolean(groupInfo.isSymmetric),
          side: groupInfo.side || null,
          isChassisSlot: Boolean(groupInfo.isChassisSlot),
          isVariant: Boolean(groupInfo.isVariant),
          submeshes: []
        });
      }
      modularGroups.get(partKey).submeshes.push(s.name);

      // Register or update slot default
      const st = groupInfo.slotType || partKey;
      if (!slotToDefaultPart.has(st)) {
        slotToDefaultPart.set(st, {
          defaultPartKey: partKey,
          slotLabel: groupInfo.slotLabel || groupInfo.label,
          isChassisSlot: Boolean(groupInfo.isChassisSlot)
        });
      } else if (!groupInfo.isVariant) {
        // If this part is a standard/base part (not an alternative variant), promote it to default
        slotToDefaultPart.get(st).defaultPartKey = partKey;
      }
    } else {
      bodyBoundMeshes.push(s.name);
    }
  }

  // Ensure root mesh is included in bodyBoundMeshes if not already present
  if (!bodyBoundMeshes.includes(rootName)) {
    bodyBoundMeshes.unshift(rootName);
  }

  const files = {};
  const defaultPcParts = {};

  // --------------------------------------------------------------------------
  // 1. Root Vehicle Slot Master (`<vehicleId>.jbeam`)
  // Uses strictly compliant BeamNG TableSchema `slots` table!
  // --------------------------------------------------------------------------
  const mainSlots = [
    '["type", "default", "description"]',
    `["${cleanId}_body", "${cleanId}_body", "${vehicleName} Body"]`,
    `["${cleanId}_engine", "${cleanId}_engine", "Engine & Drivetrain"]`
  ];

  // If suspension/fueltank/exhaust parts were discovered, assign them to chassis slots
  const discoveredChassisSlots = new Set();
  for (const [st, info] of slotToDefaultPart.entries()) {
    if (info.isChassisSlot) {
      mainSlots.push(`["${st}", "${info.defaultPartKey}", "${info.slotLabel}"]`);
      defaultPcParts[st] = info.defaultPartKey;
      discoveredChassisSlots.add(st);
    }
  }

  // Ensure standard front & rear suspension slots exist on chassis if not already added
  if (!discoveredChassisSlots.has(`${cleanId}_suspension_F`)) {
    mainSlots.push(`["${cleanId}_suspension_F", "${cleanId}_suspension_F", "Front Suspension"]`);
    defaultPcParts[`${cleanId}_suspension_F`] = `${cleanId}_suspension_F`;
  }
  if (!discoveredChassisSlots.has(`${cleanId}_suspension_R`)) {
    mainSlots.push(`["${cleanId}_suspension_R", "${cleanId}_suspension_R", "Rear Suspension"]`);
    defaultPcParts[`${cleanId}_suspension_R`] = `${cleanId}_suspension_R`;
  }

  files[`${cleanId}.jbeam`] = `{
  "${cleanId}": {
    "information": {
      "authors": "${author}",
      "name": "${vehicleName} (Chassis)",
      "value": 15000
    },
    "slotType": "main",
    "slots": [
      ${mainSlots.join(',\n      ')}
    ]
  }
}`;

  defaultPcParts[`${cleanId}_body`] = `${cleanId}_body`;
  defaultPcParts[`${cleanId}_engine`] = `${cleanId}_engine`;

  // --------------------------------------------------------------------------
  // 2. Main Body JBeam (`<vehicleId>_body.jbeam`)
  // Declares slots for actual modular parts, and binds all body meshes in flexbodies!
  // --------------------------------------------------------------------------
  const bodySlots = ['["type", "default", "description"]'];
  for (const [slotType, slotInfo] of slotToDefaultPart.entries()) {
    if (!slotInfo.isChassisSlot) {
      bodySlots.push(`["${slotType}", "${slotInfo.defaultPartKey}", "${slotInfo.slotLabel}"]`);
      defaultPcParts[slotType] = slotInfo.defaultPartKey;
    }
  }

  // Format body flexbody entries
  const bodyFlexRows = bodyBoundMeshes.map(meshName => `      ["${meshName}", ["${cleanId}_body"]]`);

  files[`${cleanId}_body.jbeam`] = `{
  "${cleanId}_body": {
    "information": {
      "authors": "${author}",
      "name": "${vehicleName} Body Shell",
      "value": 8000
    },
    "slotType": "${cleanId}_body",
    "slots": [
      ${bodySlots.join(',\n      ')}
    ],
    "flexbodies": [
      ["mesh", "[group]:", "nonFlexMaterials"],
${bodyFlexRows.join(',\n')}
    ],
    "nodes": [
      ["id", "posX", "posY", "posZ"],
      {"nodeWeight": 6.5},
      {"frictionCoef": 0.5},
      {"nodeMaterial": "|NM_METAL"},
      {"group": "${cleanId}_body"}
      // Place body nodes in 3D viewport using [N] or DAE Snap directly on the visual mesh
    ],
    "beams": [
      ["id1:", "id2:"],
      {"beamSpring": 2001000, "beamDamp": 200},
      {"beamDeform": 45000, "beamStrength": 150000}
      // Connect nodes in 3D viewport using [B], [F], or Extrude [E]
    ],
    "triangles": [
      ["id1:", "id2:", "id3:"],
      {"groundModel": "metal", "dragCoef": 0.8}
      // Connect surface collision triangles using [T] or [F]
    ]
  }
}`;

  // --------------------------------------------------------------------------
  // 3. Modular Parts (Placed into categorized folders, parts/ folder, or root)
  // --------------------------------------------------------------------------
  for (const [partKey, partInfo] of modularGroups.entries()) {
    const groupKey = partKey;
    const flexRows = partInfo.submeshes.map(meshName => `      ["${meshName}", ["${groupKey}"]]`);

    let filePath;
    if (structureMode === 'categorized') {
      filePath = `${partInfo.folder}/${partKey}.jbeam`;
    } else if (structureMode === 'parts') {
      filePath = `parts/${partKey}.jbeam`;
    } else {
      filePath = `${partKey}.jbeam`;
    }

    const { nodesText, beamsText, trianglesText } = generateSeedNodesAndBeams(partKey, partInfo, cleanId);

    files[filePath] = `{
  "${partKey}": {
    "information": {
      "authors": "${author}",
      "name": "${vehicleName} ${partInfo.label}",
      "value": 450
    },
    "slotType": "${partInfo.slotType}",
    "flexbodies": [
      ["mesh", "[group]:", "nonFlexMaterials"],
${flexRows.join(',\n')}
    ],
    "nodes": [
${nodesText}
    ],
    "beams": [
${beamsText}
    ],
    "triangles": [
${trianglesText}
    ]
  }
}`;
  }

  // --------------------------------------------------------------------------
  // 4. Default Configuration (`default.pc`)
  // --------------------------------------------------------------------------
  files['default.pc'] = JSON.stringify({
    format: 2,
    model: cleanId,
    parts: defaultPcParts,
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

  // --------------------------------------------------------------------------
  // 5. Vehicle Information (`info.json`)
  // --------------------------------------------------------------------------
  files['info.json'] = JSON.stringify({
    Name: vehicleName,
    Brand: 'Custom',
    Author: author,
    Type: 'Car',
    default_pc: 'default',
    default_color: 'White',
    paints: {
      'White': '1 1 1 1.2',
      'Jet Black': '0.05 0.05 0.05 1.2',
      'Flame Red': '0.85 0.1 0.1 1.2',
      'Royal Blue': '0.1 0.25 0.85 1.2'
    }
  }, null, 2);

  return {
    files,
    rootPartName: `${cleanId}_body`,
    submeshCount: activeSubmeshes.length,
    bodyBoundCount: bodyBoundMeshes.length,
    modularPartsCount: modularGroups.size,
    slotsCount: slotToDefaultPart.size
  };
}

export default {
  SUBMESH_CATEGORIES,
  isGenericMeshName,
  categorizeSubmesh,
  resolvePartGrouping,
  extractSubmeshesFromDae,
  generateScaffoldingFromDae
};
