/**
 * JBeam Studio - Powertrain & Drivetrain Architecture Parser
 * Analyzes JBeam powertrain device tables, builds topological torque-flow DAGs,
 * extracts engine torque/power curves, and classifies vehicle drivetrain layout (FWD, RWD, AWD, 4WD).
 */

export const POWERTRAIN_CATEGORIES = {
  combustionEngine: 'engine',
  electricMotor: 'engine',
  engine: 'engine',

  frictionClutch: 'coupling',
  clutch: 'coupling',
  torqueConverter: 'coupling',
  centrifugalClutch: 'coupling',
  viscousClutch: 'coupling',

  manualGearbox: 'gearbox',
  automaticGearbox: 'gearbox',
  sequentialGearbox: 'gearbox',
  dualClutchGearbox: 'gearbox',
  cvtGearbox: 'gearbox',
  rangeBox: 'gearbox',
  splitter: 'gearbox',

  transfercase: 'transfercase',
  splitShaft: 'transfercase',

  differential: 'differential',
  torsionReactor: 'differential',

  shaft: 'shaft',
  driveshaft: 'shaft',
  halfshaft: 'shaft',
  wheelaxle: 'shaft',

  hydrodynamicRetarder: 'accessory',
  retarder: 'accessory',
  hydraulicPump: 'accessory',
  supercharger: 'accessory',
  turbocharger: 'accessory'
};

/**
 * Returns user-friendly category and color metadata for a given powertrain device type.
 */
export function getDeviceCategory(deviceType) {
  if (!deviceType || typeof deviceType !== 'string') return 'shaft';
  const clean = deviceType.trim();
  const cat = POWERTRAIN_CATEGORIES[clean] || 'shaft';
  return cat;
}

/**
 * Calculates torque and horsepower curve array from raw JBeam engine torque table.
 * @param {Array|object} rawTorque - Table rows of [rpm, torque]
 * @returns {Array<{ rpm: number, torque: number, powerKw: number, powerHp: number }>}
 */
export function calculateEngineTorqueCurve(rawTorque) {
  const torqueCurve = [];
  if (rawTorque && typeof rawTorque === 'object') {
    const rows = Array.isArray(rawTorque) ? rawTorque : Object.values(rawTorque);
    for (const row of rows) {
      if (!row) continue;
      let rpm, torque;
      if (Array.isArray(row)) {
        if (row[0] === 'rpm') continue;
        rpm = Number(row[0]);
        torque = Number(row[1]);
      } else if (typeof row === 'object') {
        const r0 = row[0] !== undefined ? row[0] : row['0'];
        const r1 = row[1] !== undefined ? row[1] : row['1'];
        if (r0 === 'rpm' || r1 === 'torque') continue;
        rpm = r0 !== undefined ? Number(r0) : Number(row.rpm);
        torque = r1 !== undefined ? Number(r1) : Number(row.torque);
      }
      if (!isNaN(rpm) && !isNaN(torque)) {
        // Power in kW: (Torque * RPM) / 9549
        // Power in HP: kW * 1.34102
        const powerKw = Math.round((torque * rpm) / 9549);
        const powerHp = Math.round(powerKw * 1.34102);
        torqueCurve.push({
          rpm,
          torque: Math.round(torque),
          powerKw,
          powerHp
        });
      }
    }
  }

  // Sort by RPM ascending
  torqueCurve.sort((a, b) => a.rpm - b.rpm);
  return torqueCurve;
}

/**
 * Extracts and aggregates powertrain devices from a set of JBeam parts
 * (either a single active part or multiple assembled parts).
 *
 * @param {Object} jbeamParts - Map of partName -> parsed part object
 * @returns {Object} Comprehensive Powertrain Graph analysis
 */
export function parsePowertrainGraph(jbeamParts) {
  if (!jbeamParts || typeof jbeamParts !== 'object') {
    return {
      devices: {},
      roots: [],
      orphans: [],
      terminals: [],
      edges: [],
      totalDevices: 0,
      drivetrainLayout: 'None',
      engineSpecs: null
    };
  }

  const rawDevices = new Map();
  const companionConfigs = new Map();

  // 1. Traverse all parts to harvest powertrain tables and companion device objects
  const partNames = Object.keys(jbeamParts).filter(k => k !== '__meta');
  for (const partName of partNames) {
    const part = jbeamParts[partName];
    if (!part || typeof part !== 'object') continue;

    // A. Extract declared powertrain table entries
    const ptTable = part.powertrain;
    if (ptTable && typeof ptTable === 'object') {
      const rows = Array.isArray(ptTable) ? ptTable : Object.values(ptTable);
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        
        let type, name, inputName, inputIndex, inlineOptions;

        if (Array.isArray(row)) {
          // Table header check: ["type", "name", "inputName", "inputIndex"]
          if (row[0] === 'type' || row[1] === 'name') continue;
          type = row[0];
          name = row[1];
          inputName = row[2];
          inputIndex = row[3];
          inlineOptions = typeof row[4] === 'object' ? row[4] : {};
        } else {
          // Keyed row object from tableSchema
          type = row.type;
          name = row.name;
          inputName = row.inputName;
          inputIndex = row.inputIndex !== undefined ? row.inputIndex : 1;
          inlineOptions = { ...row };
          delete inlineOptions.type;
          delete inlineOptions.name;
          delete inlineOptions.inputName;
          delete inlineOptions.inputIndex;
          delete inlineOptions.__meta;
        }

        if (name && type) {
          const deviceId = String(name).trim();
          const devType = String(type).trim();
          const devInput = inputName ? String(inputName).trim() : null;
          const devIndex = Number(inputIndex) || 1;

          rawDevices.set(deviceId, {
            name: deviceId,
            type: devType,
            category: getDeviceCategory(devType),
            inputName: devInput,
            inputIndex: devIndex,
            inlineOptions: inlineOptions || {},
            partName,
            filePath: part.__filePath || part.filePath || null,
            children: []
          });
        }
      }
    }

    // B. Collect companion configuration dictionaries defined at part root level
    for (const [key, val] of Object.entries(part)) {
      if (key !== '__meta' && val && typeof val === 'object' && !Array.isArray(val)) {
        if (!companionConfigs.has(key)) {
          companionConfigs.set(key, val);
        }
      }
    }
  }

  // 2. Attach companion configs to registered devices
  const devices = {};
  for (const [devId, devObj] of rawDevices.entries()) {
    const companion = companionConfigs.get(devId) || {};
    devices[devId] = {
      ...devObj,
      properties: {
        ...devObj.inlineOptions,
        ...companion
      }
    };
  }

  // 3. Build topological parent-child connections, directed edges, and diagnostics
  const edges = [];
  const roots = [];
  const orphans = [];
  const terminals = [];
  const diagnostics = [];
  const portUsageMap = new Map();

  for (const [devId, device] of Object.entries(devices)) {
    const parentId = device.inputName;
    const isDummyParent = !parentId || parentId.toLowerCase() === 'dummy' || parentId.startsWith('$');

    if (isDummyParent) {
      roots.push(devId);
    } else if (devices[parentId]) {
      devices[parentId].children.push({
        name: devId,
        inputIndex: device.inputIndex
      });
      edges.push({
        source: parentId,
        target: devId,
        inputIndex: device.inputIndex,
        sourceType: devices[parentId].type,
        targetType: device.type
      });

      const portKey = `${parentId}:${device.inputIndex}`;
      if (!portUsageMap.has(portKey)) {
        portUsageMap.set(portKey, []);
      }
      portUsageMap.get(portKey).push(devId);
    } else {
      orphans.push(devId);
      diagnostics.push({
        severity: 'error',
        deviceId: devId,
        type: 'missing_input',
        message: `Device "${devId}" connects to non-existent input "${parentId}". In BeamNG, this breaks downstream torque flow.`
      });
    }
  }

  // Check port collisions on single-channel output devices
  for (const [portKey, connectedDevices] of portUsageMap.entries()) {
    if (connectedDevices.length > 1) {
      const [parentId, portIndex] = portKey.split(':');
      const parentDevice = devices[parentId];
      if (parentDevice && parentDevice.category !== 'differential' && parentDevice.category !== 'transfercase') {
        diagnostics.push({
          severity: 'warning',
          deviceId: parentId,
          type: 'port_collision',
          message: `Port ${portIndex} on "${parentId}" has ${connectedDevices.length} devices connected (${connectedDevices.join(', ')}). Multiple devices on a single shaft port may cause torque divergence.`
        });
      }
    }
  }

  // Find leaf/terminal devices (devices with 0 downstream children)
  for (const [devId, device] of Object.entries(devices)) {
    if (device.children.length === 0) {
      terminals.push(devId);
      if (device.category === 'shaft' || device.type.toLowerCase().includes('axle') || device.type.toLowerCase().includes('shaft')) {
        const hasWheel = device.properties?.connectedWheel || device.inlineOptions?.connectedWheel;
        if (!hasWheel) {
          diagnostics.push({
            severity: 'warning',
            deviceId: devId,
            type: 'missing_wheel_binding',
            message: `Terminal axle "${devId}" does not define "connectedWheel" (e.g. {"connectedWheel": "RL"}). Torque will not reach the tire in BeamNG.`
          });
        }
      }
    }
  }

  // Check for missing companion configs
  for (const [devId, device] of Object.entries(devices)) {
    if (device.category === 'gearbox' && !device.properties?.gearRatios) {
      diagnostics.push({
        severity: 'warning',
        deviceId: devId,
        type: 'missing_gear_ratios',
        message: `Transmission "${devId}" has no "gearRatios" table defined.`
      });
    }
    if (device.category === 'engine' && !device.properties?.torque) {
      diagnostics.push({
        severity: 'warning',
        deviceId: devId,
        type: 'missing_torque_curve',
        message: `Engine "${devId}" has no "torque" (RPM vs Nm) table defined.`
      });
    }
  }

  // 4. Classify Drivetrain Architecture Layout (AWD, 4WD, FWD, RWD)
  let drivetrainLayout = 'Unknown';
  if (Object.keys(devices).length === 0) {
    drivetrainLayout = 'None';
  } else {
    let hasFrontDrivenWheels = false;
    let hasRearDrivenWheels = false;
    let hasTransferCase = false;

    for (const [devId, device] of Object.entries(devices)) {
      const lower = devId.toLowerCase();
      const typeLower = device.type.toLowerCase();

      if (typeLower.includes('transfercase') || typeLower.includes('rangebox') || lower.includes('transfer_case') || lower.includes('transfercase')) {
        hasTransferCase = true;
      }

      // Check differentials or shafts driving front vs rear
      if (lower.includes('_f') || lower.includes('front') || lower.includes('diff_f') || lower.includes('differential_f')) {
        hasFrontDrivenWheels = true;
      }
      if (lower.includes('_r') || lower.includes('rear') || lower.includes('diff_r') || lower.includes('differential_r')) {
        hasRearDrivenWheels = true;
      }
      if (lower.includes('wheelaxle_fl') || lower.includes('wheelaxle_fr')) {
        hasFrontDrivenWheels = true;
      }
      if (lower.includes('wheelaxle_rl') || lower.includes('wheelaxle_rr')) {
        hasRearDrivenWheels = true;
      }
    }

    if (hasFrontDrivenWheels && hasRearDrivenWheels) {
      drivetrainLayout = hasTransferCase ? '4WD' : 'AWD';
    } else if (hasFrontDrivenWheels) {
      drivetrainLayout = 'FWD';
    } else if (hasRearDrivenWheels) {
      drivetrainLayout = 'RWD';
    } else {
      drivetrainLayout = 'Standard Drive';
    }
  }

  // 5. Extract Engine Torque and Power Curves for primary combustion engine
  let engineSpecs = null;
  for (const [devId, device] of Object.entries(devices)) {
    if (device.category === 'engine') {
      const props = device.properties || {};
      const torqueCurve = calculateEngineTorqueCurve(props.torque);

      // Compute peak values
      let peakTorqueNm = 0;
      let peakTorqueRpm = 0;
      let peakPowerHp = 0;
      let peakPowerRpm = 0;

      for (const pt of torqueCurve) {
        if (pt.torque > peakTorqueNm) {
          peakTorqueNm = pt.torque;
          peakTorqueRpm = pt.rpm;
        }
        if (pt.powerHp > peakPowerHp) {
          peakPowerHp = pt.powerHp;
          peakPowerRpm = pt.rpm;
        }
      }

      engineSpecs = {
        deviceId: devId,
        type: device.type,
        idleRpm: Number(props.idleRPM) || 650,
        maxRpm: Number(props.maxRPM) || (torqueCurve.length > 0 ? torqueCurve[torqueCurve.length - 1].rpm : 6000),
        inertia: Number(props.inertia) || 0.15,
        friction: Number(props.friction) || 10,
        peakTorqueNm,
        peakTorqueRpm,
        peakPowerHp,
        peakPowerRpm,
        torqueCurve
      };
      break; // Pick primary engine
    }
  }

  return {
    devices,
    roots,
    orphans,
    terminals,
    edges,
    totalDevices: Object.keys(devices).length,
    drivetrainLayout,
    engineSpecs,
    diagnostics
  };
}

/**
 * Calculates shift drop RPM, gear ratios, and speeds for every forward gear.
 * @param {Array<number>} rawRatios - Gear ratios array (including reverse & neutral)
 * @param {number} diffRatio - Final drive ratio (e.g. 3.73)
 * @param {number} shiftRpm - Engine RPM at which upshift occurs (e.g. 6500)
 * @param {number} tireRadius - Tire radius in meters (e.g. 0.36)
 * @returns {Array<Object>} Per-gear drop analysis
 */
export function calculateGearShiftDrops(rawRatios, diffRatio = 3.73, shiftRpm = 6500, tireRadius = 0.36) {
  const ratios = Array.isArray(rawRatios) ? rawRatios : [];
  const forwardGears = [];
  let gIdx = 1;

  for (const gr of ratios) {
    if (typeof gr !== 'number') continue;
    if (gr <= 0) continue; // Skip reverse (<0) and neutral (0)
    forwardGears.push({
      gearNum: gIdx++,
      ratio: gr
    });
  }

  const results = [];
  for (let i = 0; i < forwardGears.length; i++) {
    const current = forwardGears[i];
    const next = forwardGears[i + 1] || null;
    const totalRatio = current.ratio * diffRatio;

    // Top speed in km/h at shift RPM
    const topSpeedKmh = totalRatio > 0 ? (shiftRpm * 2 * Math.PI * tireRadius * 3.6) / (totalRatio * 60) : 0;
    const topSpeedMph = topSpeedKmh * 0.621371;

    let nextGearRpm = null;
    let rpmDrop = null;
    let rpmDropPercent = null;

    if (next) {
      // RPM after upshift to next gear: shiftRpm * (nextRatio / currentRatio)
      nextGearRpm = Math.round(shiftRpm * (next.ratio / current.ratio));
      rpmDrop = shiftRpm - nextGearRpm;
      rpmDropPercent = Math.round((rpmDrop / shiftRpm) * 100);
    }

    results.push({
      gearNum: current.gearNum,
      ratio: current.ratio,
      totalRatio: parseFloat(totalRatio.toFixed(3)),
      topSpeedKmh: Math.round(topSpeedKmh),
      topSpeedMph: Math.round(topSpeedMph),
      shiftRpm,
      nextGearRpm,
      rpmDrop,
      rpmDropPercent
    });
  }

  return results;
}

/**
 * Calculates transmission sawtooth line segments (Speed vs. RPM) for plotting.
 * @param {Array<number>} rawRatios
 * @param {number} diffRatio
 * @param {number} maxRpm
 * @param {number} idleRpm
 * @param {number} tireRadius
 * @returns {Object} Sawtooth chart data model
 */
export function calculateSawtoothCurve(rawRatios, diffRatio = 3.73, maxRpm = 6800, idleRpm = 800, tireRadius = 0.36) {
  const forwardGears = calculateGearShiftDrops(rawRatios, diffRatio, maxRpm, tireRadius);
  const gearLines = [];

  for (let i = 0; i < forwardGears.length; i++) {
    const g = forwardGears[i];
    const endSpeedKmh = g.topSpeedKmh;

    // For 1st gear, line starts at zero speed / idle RPM; for subsequent gears, line starts at previous gear speed and dropped RPM
    const entryRpm = i === 0 ? idleRpm : (forwardGears[i - 1].nextGearRpm || idleRpm);
    const entrySpeedKmh = i === 0 ? 0 : forwardGears[i - 1].topSpeedKmh;

    gearLines.push({
      gearNum: g.gearNum,
      ratio: g.ratio,
      entrySpeedKmh,
      entryRpm,
      exitSpeedKmh: endSpeedKmh,
      exitRpm: maxRpm,
      rpmDrop: g.rpmDrop,
      nextGearRpm: g.nextGearRpm
    });
  }

  return {
    gearLines,
    maxSpeedKmh: forwardGears.length > 0 ? forwardGears[forwardGears.length - 1].topSpeedKmh : 220,
    maxRpm,
    idleRpm
  };
}

/**
 * Updates gear ratios and optional differential final drive ratio in JBeam text losslessly.
 */
export function updateGearboxRatiosInText(jbeamText, gearboxName = 'gearbox', newRatios = [], newDiffRatio = null, diffName = 'differential_R') {
  if (!jbeamText || typeof jbeamText !== 'string') return jbeamText;
  let result = jbeamText;

  if (Array.isArray(newRatios) && newRatios.length > 0) {
    const ratiosFormatted = newRatios.map(r => (typeof r === 'number' ? r : (Number(r) || 0))).join(', ');
    const gearboxBlockRegex = new RegExp(`("${gearboxName}"\\s*:\\s*\\{[\\s\\S]*?"gearRatios"\\s*:\\s*\\[)[\\s\\S]*?(\\])`, 'i');
    if (gearboxBlockRegex.test(result)) {
      result = result.replace(gearboxBlockRegex, `$1${ratiosFormatted}$2`);
    } else {
      const genericRegex = /("gearRatios"\s*:\s*\[)[\s\S]*?(\])/i;
      if (genericRegex.test(result)) {
        result = result.replace(genericRegex, `$1${ratiosFormatted}$2`);
      }
    }
  }

  if (newDiffRatio !== null && !isNaN(Number(newDiffRatio))) {
    const diffVal = Number(newDiffRatio);
    const diffBlockRegex = new RegExp(`("${diffName}"\\s*:\\s*\\{[\\s\\S]*?"gearRatio"\\s*:\\s*)[\\d.]+`, 'i');
    if (diffBlockRegex.test(result)) {
      result = result.replace(diffBlockRegex, `$1${diffVal}`);
    } else {
      const genericDiffRegex = /("gearRatio"\s*:\s*)[\d.]+/i;
      if (genericDiffRegex.test(result)) {
        result = result.replace(genericDiffRegex, `$1${diffVal}`);
      }
    }
  }

  return result;
}

/**
 * Adds a new powertrain device row to the JBeam "powertrain" table losslessly.
 * @param {string} jbeamText
 * @param {{ type: string, name: string, inputName: string, inputIndex?: number }} device
 * @returns {string} Updated JBeam text
 */
export function addPowertrainDeviceInText(jbeamText, device) {
  if (!jbeamText || typeof jbeamText !== 'string' || !device || !device.name) return jbeamText;
  const inputIdx = device.inputIndex != null ? device.inputIndex : 1;
  const rowFormatted = `["${device.type || 'shaft'}", "${device.name}", "${device.inputName || 'mainEngine'}", ${inputIdx}]`;

  // Check if device already exists in powertrain
  const existingRegex = new RegExp(`\\[\\s*"[^"]*"\\s*,\\s*"${device.name}"\\s*,`, 'i');
  if (existingRegex.test(jbeamText)) {
    return connectPowertrainDeviceInText(jbeamText, device.name, device.inputName, inputIdx);
  }

  // Find powertrain table
  const ptTableRegex = /("powertrain"\s*:\s*\[[\s\S]*?)(\s*\])/i;
  if (ptTableRegex.test(jbeamText)) {
    return jbeamText.replace(ptTableRegex, (match, prefix, suffix) => {
      const trimmed = prefix.trimEnd();
      const needsComma = !trimmed.endsWith('[') && !trimmed.endsWith(',');
      const sep = needsComma ? ',' : '';
      return `${trimmed}${sep}\n            ${rowFormatted}\n        ${suffix.trimStart()}`;
    });
  }

  // If no powertrain table exists, insert one inside the active part
  const partBodyRegex = /(["'][a-zA-Z0-9_-]+["']\s*:\s*\{)/i;
  if (partBodyRegex.test(jbeamText)) {
    return jbeamText.replace(partBodyRegex, `$1\n    "powertrain": [\n        ["type", "name", "inputName", "inputIndex"],\n        ${rowFormatted}\n    ],`);
  }

  return jbeamText;
}

/**
 * Re-connects an existing powertrain device to a new input parent device & port index.
 * @param {string} jbeamText
 * @param {string} deviceName
 * @param {string} newInputName
 * @param {number} newInputIndex
 * @returns {string}
 */
export function connectPowertrainDeviceInText(jbeamText, deviceName, newInputName, newInputIndex = 1) {
  if (!jbeamText || !deviceName) return jbeamText;
  const regex = new RegExp(`(\\[\\s*"[^"]+"\\s*,\\s*"${deviceName}"\\s*,\\s*)"[^"]*"(\\s*,\\s*)\\d+(\\s*\\])`, 'i');
  if (regex.test(jbeamText)) {
    return jbeamText.replace(regex, `$1"${newInputName}"$2${newInputIndex}$3`);
  }
  return jbeamText;
}

/**
 * Removes a powertrain device from the "powertrain" table in JBeam text.
 * @param {string} jbeamText
 * @param {string} deviceName
 * @returns {string}
 */
export function removePowertrainDeviceInText(jbeamText, deviceName) {
  if (!jbeamText || !deviceName) return jbeamText;
  const rowRegex = new RegExp(`\\s*\\[\\s*"[^"]+"\\s*,\\s*"${deviceName}"[^\\]]*\\]\\s*,?`, 'i');
  return jbeamText.replace(rowRegex, '');
}

/**
 * Computes forced induction (turbo/supercharger) boost and augmented torque & HP curves.
 * @param {Array<{ rpm: number, torque: number }>} naTorqueCurve
 * @param {{ wastegatePressure?: number, spoolRpm?: number, maxBoostRpm?: number, intercoolerEfficiency?: number, turboType?: string }} turboSpecs
 */
export function calculateForcedInductionTorque(naTorqueCurve = [], turboSpecs = {}) {
  const wastegatePsi = turboSpecs.wastegatePressure ?? 12.0; // psi
  const spoolRpm = turboSpecs.spoolRpm ?? 2200;
  const maxBoostRpm = turboSpecs.maxBoostRpm ?? 4200;
  const intercoolerEff = turboSpecs.intercoolerEfficiency ?? 0.85;
  const isSupercharger = turboSpecs.turboType === 'supercharger';

  const boostedCurve = [];
  let peakNaTorque = 0;
  let peakNaHp = 0;
  let peakBoostedTorque = 0;
  let peakBoostedHp = 0;
  let peakBoostRpm = spoolRpm;

  for (const pt of naTorqueCurve) {
    const rpm = pt.rpm;
    const naT = pt.torque;
    const radPerSec = (rpm * 2 * Math.PI) / 60;
    const naHp = Math.round(((naT * radPerSec) / 1000) * 1.34102);

    if (naT > peakNaTorque) peakNaTorque = naT;
    if (naHp > peakNaHp) peakNaHp = naHp;

    // Boost curve calculations
    let boostPsi = 0;
    if (isSupercharger) {
      const progress = Math.min(1, Math.max(0, (rpm - 800) / (7000 - 800)));
      boostPsi = wastegatePsi * (0.35 + 0.65 * progress);
    } else {
      if (rpm < spoolRpm) {
        boostPsi = wastegatePsi * 0.12 * Math.max(0, (rpm - 800) / (spoolRpm - 800));
      } else if (rpm < maxBoostRpm) {
        const factor = (rpm - spoolRpm) / (maxBoostRpm - spoolRpm);
        boostPsi = wastegatePsi * (0.12 + 0.88 * factor);
      } else {
        boostPsi = wastegatePsi;
      }
    }

    const boostBar = Number((boostPsi * 0.0689476).toFixed(2));
    const pressureRatio = 1 + (boostPsi / 14.7) * intercoolerEff;
    const boostedTorque = Math.round(naT * pressureRatio);
    const boostedHp = Math.round(((boostedTorque * radPerSec) / 1000) * 1.34102);

    if (boostedTorque > peakBoostedTorque) {
      peakBoostedTorque = boostedTorque;
      peakBoostRpm = rpm;
    }
    if (boostedHp > peakBoostedHp) peakBoostedHp = boostedHp;

    boostedCurve.push({
      rpm,
      naTorque: naT,
      naHp,
      boostPsi: Number(boostPsi.toFixed(1)),
      boostBar,
      boostedTorque,
      boostedHp
    });
  }

  return {
    curve: boostedCurve,
    peakNaTorque,
    peakNaHp,
    peakBoostedTorque,
    peakBoostedHp,
    peakBoostRpm,
    deltaTorque: peakBoostedTorque - peakNaTorque,
    deltaHp: peakBoostedHp - peakNaHp,
    maxBoostPsi: wastegatePsi,
    maxBoostBar: Number((wastegatePsi * 0.0689476).toFixed(2))
  };
}

/**
 * Calculates engine thermal status, radiator equilibrium, and boil-over buffer.
 * @param {{ radiatorArea?: number, coolantVolume?: number, thermostatOpenTemp?: number, fanTemp?: number, headGasketFailureTemp?: number, oilCooler?: boolean }} thermalParams
 */
export function calculateEngineThermalStatus(thermalParams = {}, ambientTemp = 20) {
  const area = thermalParams.radiatorArea ?? 0.35; // m^2
  const coolantVol = thermalParams.coolantVolume ?? 8.5; // Liters
  const thermoTemp = thermalParams.thermostatOpenTemp ?? 88; // °C
  const fanTemp = thermalParams.fanTemp ?? 95; // °C
  const headGasketLimit = thermalParams.headGasketFailureTemp ?? 130; // °C
  const hasOilCooler = Boolean(thermalParams.oilCooler);

  const coolingCapacityKw = Math.round(area * 140 + (hasOilCooler ? 28 : 0));
  const operatingTempC = thermoTemp + 4;
  const headGasketMarginC = headGasketLimit - operatingTempC;

  // Time in minutes to boil over if air flow drops to zero under full engine load
  const thermalBufferMinutes = Number(((coolantVol * 4.184 * (108 - operatingTempC)) / 55).toFixed(1));

  let status = 'optimal';
  if (operatingTempC > 105) status = 'overheating';
  else if (headGasketMarginC < 25) status = 'warning';
  else if (coolingCapacityKw < 35) status = 'moderate';

  return {
    coolingCapacityKw,
    operatingTempC,
    fanTriggerTempC: fanTemp,
    headGasketMarginC,
    thermalBufferMinutes,
    status
  };
}

/**
 * Calculates differential locking characteristics for Open, LSD, Spool, Viscous & Active Torque Vectoring.
 * @param {{ diffType?: string, gearRatio?: number, lsdPreload?: number, lsdLockCoef?: number, lsdRevLockCoef?: number, lockTorque?: number }} diffSpecs
 */
export function calculateDiffLockingCharacteristics(diffSpecs = {}) {
  const type = diffSpecs.diffType || 'open';
  const ratio = diffSpecs.gearRatio ?? 3.73;
  const preload = diffSpecs.lsdPreload ?? 50; // Nm
  const lockCoef = diffSpecs.lsdLockCoef ?? 0.20; // 20%
  const revLockCoef = diffSpecs.lsdRevLockCoef ?? 0.10; // 10%
  const lockTorque = diffSpecs.lockTorque ?? 2500; // Nm

  let powerLockPercent = 0;
  let coastLockPercent = 0;
  let maxCrossAxleTorque = 0;
  let behaviorSummary = '';

  switch (type) {
    case 'open':
      powerLockPercent = 0;
      coastLockPercent = 0;
      maxCrossAxleTorque = 0;
      behaviorSummary = 'Equal 50/50 torque split. Power is limited by the wheel with least traction.';
      break;
    case 'lsd':
      powerLockPercent = Math.round(lockCoef * 100);
      coastLockPercent = Math.round(revLockCoef * 100);
      maxCrossAxleTorque = Math.round(preload + 400 * lockCoef);
      behaviorSummary = `Clutch-pack LSD with ${preload} Nm preload. Locks up to ${powerLockPercent}% under power and ${coastLockPercent}% on deceleration.`;
      break;
    case 'locking':
      powerLockPercent = 100;
      coastLockPercent = 100;
      maxCrossAxleTorque = lockTorque;
      behaviorSummary = `Solid mechanical spool/locker with ${lockTorque} Nm threshold. Both wheels forced to turn at equal speed.`;
      break;
    case 'viscous':
      powerLockPercent = 45;
      coastLockPercent = 35;
      maxCrossAxleTorque = 350;
      behaviorSummary = 'Smooth velocity-sensitive fluid shear locking. Engages progressively as axle speed differential increases.';
      break;
    case 'torqueVectoring':
      powerLockPercent = 90;
      coastLockPercent = 70;
      maxCrossAxleTorque = 1200;
      behaviorSummary = 'Electronically controlled active clutches capable of overdriving outside wheel for active yaw control.';
      break;
    default:
      behaviorSummary = 'Standard differential behavior.';
  }

  return {
    diffType: type,
    gearRatio: ratio,
    powerLockPercent,
    coastLockPercent,
    maxCrossAxleTorque,
    behaviorSummary
  };
}

/**
 * Calculates electric motor torque curve, power, and battery range estimation.
 * @param {{ maxTorque?: number, maxPowerKw?: number, maxRpm?: number, inverterEfficiency?: number, batteryCapacityKwh?: number, regenTorque?: number }} motorSpecs
 */
export function calculateElectricMotorCurve(motorSpecs = {}) {
  const maxTorque = motorSpecs.maxTorque ?? 400; // Nm
  const maxPowerKw = motorSpecs.maxPowerKw ?? 220; // kW
  const maxRpm = motorSpecs.maxRpm ?? 15000;
  const inverterEff = motorSpecs.inverterEfficiency ?? 0.94;
  const batteryKwh = motorSpecs.batteryCapacityKwh ?? 75;
  const regenTorque = motorSpecs.regenTorque ?? 160;

  // Base RPM where constant torque transitions into constant power: P = T * omega
  const baseRpm = Math.round((maxPowerKw * 1000) / ((maxTorque * 2 * Math.PI) / 60));
  const peakHp = Math.round(maxPowerKw * 1.34102);

  const curve = [];
  const step = Math.max(250, Math.round(maxRpm / 30));
  for (let rpm = 0; rpm <= maxRpm; rpm += step) {
    let t = maxTorque;
    if (rpm > baseRpm) {
      const radPerSec = (rpm * 2 * Math.PI) / 60;
      t = Math.round((maxPowerKw * 1000) / radPerSec);
    }
    const rad = (rpm * 2 * Math.PI) / 60;
    const hp = Math.round(((t * rad) / 1000) * 1.34102);
    curve.push({
      rpm,
      torque: t,
      powerKw: Math.round((t * rad) / 1000),
      powerHp: hp
    });
  }

  return {
    curve,
    baseRpm,
    maxTorque,
    maxPowerKw,
    peakHp,
    maxRpm,
    inverterEfficiencyPercent: Math.round(inverterEff * 100),
    batteryCapacityKwh: batteryKwh,
    regenTorque,
    estRangeKm: Math.round(batteryKwh * 5.2),
    estRangeMiles: Math.round(batteryKwh * 3.23)
  };
}

/**
 * Generates official modular BeamNG powertrain JBeam files separated across:
 * - ${vehicleName}_engine.jbeam
 * - ${vehicleName}_transmission.jbeam
 * - ${vehicleName}_driveshaft.jbeam
 * - ${vehicleName}_differential_R.jbeam
 * - ${vehicleName}_radiator.jbeam
 */
export function generateModularPowertrainFiles({
  vehicleName = 'my_vehicle',
  layout = 'RWD',
  engineType = 'I4_2.0L',
  transmissionType = '6M',
  diffType = 'lsd',
  finalDriveRatio = 3.73
}) {
  const cleanName = vehicleName.toLowerCase().replace(/[^a-z0-9_]/g, '_');

  const files = {};

  // 1. Engine File
  files[`${cleanName}_engine.jbeam`] = JSON.stringify({
    [`${cleanName}_engine_${engineType}`]: {
      information: {
        authors: "JBeam Studio",
        name: `2.0L Turbocharged Engine (${engineType})`,
        value: 2800
      },
      slotType: `${cleanName}_engine`,
      slots: [
        ["type", "default", "description"],
        [`${cleanName}_transmission`, `${cleanName}_transmission_${transmissionType}`, "Transmission"],
        [`${cleanName}_intake`, `${cleanName}_turbo_stage1`, "Intake & Turbocharger"],
        [`${cleanName}_radiator`, `${cleanName}_radiator`, "Radiator"]
      ],
      powertrain: [
        ["type", "name", "inputName", "inputIndex"],
        ["combustionEngine", "mainEngine", "dummy", 0]
      ],
      mainEngine: {
        torque: [
          ["rpm", "torque"],
          [0, 0],
          [500, 140],
          [1000, 220],
          [2000, 310],
          [3000, 360],
          [4000, 380],
          [5000, 390],
          [6000, 370],
          [7000, 320],
          [7500, 240]
        ],
        idleRPM: 750,
        maxRPM: 7200,
        inertia: 0.14,
        friction: 14,
        dynamicFriction: 0.024
      }
    }
  }, null, 4);

  // 2. Transmission File
  files[`${cleanName}_transmission.jbeam`] = JSON.stringify({
    [`${cleanName}_transmission_${transmissionType}`]: {
      information: {
        authors: "JBeam Studio",
        name: "6-Speed Manual Transmission",
        value: 1200
      },
      slotType: `${cleanName}_transmission`,
      slots: [
        ["type", "default", "description"],
        [`${cleanName}_driveshaft`, `${cleanName}_driveshaft`, "Rear Driveshaft"]
      ],
      powertrain: [
        ["type", "name", "inputName", "inputIndex"],
        ["frictionClutch", "clutch", "mainEngine", 1],
        ["manualGearbox", "gearbox", "clutch", 1]
      ],
      gearbox: {
        gearRatios: [-3.4, 0, 3.82, 2.24, 1.52, 1.15, 0.92, 0.76],
        parkLockRatio: 0
      },
      clutch: {
        clutchMass: 6.5,
        clutchTorque: 500
      }
    }
  }, null, 4);

  // 3. Driveshaft File
  files[`${cleanName}_driveshaft.jbeam`] = JSON.stringify({
    [`${cleanName}_driveshaft`]: {
      information: {
        authors: "JBeam Studio",
        name: "Rear Driveshaft",
        value: 300
      },
      slotType: `${cleanName}_driveshaft`,
      powertrain: [
        ["type", "name", "inputName", "inputIndex"],
        ["shaft", "driveshaft", "gearbox", 1]
      ]
    }
  }, null, 4);

  // 4. Rear Differential File
  files[`${cleanName}_differential_R.jbeam`] = JSON.stringify({
    [`${cleanName}_differential_R`]: {
      information: {
        authors: "JBeam Studio",
        name: `Rear Differential (${diffType.toUpperCase()} ${finalDriveRatio}:1)`,
        value: 650
      },
      slotType: `${cleanName}_differential_R`,
      powertrain: [
        ["type", "name", "inputName", "inputIndex"],
        ["differential", "differential_R", "driveshaft", 1, {
          diffType: diffType,
          gearRatio: finalDriveRatio,
          lsdPreload: 60,
          lsdLockCoef: 0.20,
          lsdRevLockCoef: 0.10
        }],
        ["shaft", "wheelaxle_RL", "differential_R", 1],
        ["shaft", "wheelaxle_RR", "differential_R", 2]
      ]
    }
  }, null, 4);

  // 5. Radiator File
  files[`${cleanName}_radiator.jbeam`] = JSON.stringify({
    [`${cleanName}_radiator`]: {
      information: {
        authors: "JBeam Studio",
        name: "Performance Radiator",
        value: 400
      },
      slotType: `${cleanName}_radiator`,
      radiator: {
        radiatorArea: 0.38,
        coolantVolume: 9.0,
        thermostatOpenTemp: 88,
        fanTemp: 94
      }
    }
  }, null, 4);

  return files;
}
