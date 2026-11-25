/**
 * JBeam Studio - Mechanical System Extractor
 * Extracts, unifies, and correlates powertrain DAGs, steering hydros,
 * suspension kinematics, brakes/wheels, engine/transmission mounts,
 * energy storage, and tunable mechanical variables across JBeam parts.
 */

import { parsePowertrainGraph } from '../powertrain/powertrainParser.js';
import { extractPressureWheels } from '../jbeam/pressureWheelsParser.js';
import { extractTorsionBars, extractRailsAndSlideNodes } from '../jbeam/suspensionPhysicsParser.js';

function getRowsList(section) {
  if (!section || typeof section !== 'object') return [];
  return Array.isArray(section) ? section : Object.values(section);
}

function getRowEndpointIds(row) {
  if (!row || typeof row !== 'object') return [null, null];
  if (Array.isArray(row)) {
    const id1 = row[0];
    const id2 = row[1];
    if (typeof id1 === 'string' && (id1 === 'id1:' || id1 === 'id1')) return [null, null];
    return [id1 ? String(id1) : null, id2 ? String(id2) : null];
  }
  const id1 = row['id1:'] ?? row.id1 ?? null;
  const id2 = row['id2:'] ?? row.id2 ?? null;
  if (id1 === 'id1:' || id1 === 'id1') return [null, null];
  return [id1 ? String(id1) : null, id2 ? String(id2) : null];
}

function normalizeBreakGroupText(bg) {
  if (!bg) return null;
  if (typeof bg === 'string') return bg.trim() || null;
  if (Array.isArray(bg)) {
    const strs = bg.filter(v => typeof v === 'string' && v.trim());
    return strs.length > 0 ? strs.join(', ') : null;
  }
  if (typeof bg === 'object') {
    const strs = Object.keys(bg)
      .filter(k => k !== '__meta' && typeof bg[k] === 'string' && bg[k].trim())
      .map(k => bg[k].trim());
    return strs.length > 0 ? strs.join(', ') : null;
  }
  return String(bg);
}

function detectAxleFromNames(...names) {
  const joined = names.filter(Boolean).join(' ').toLowerCase();
  if (/(^|[_\s])f($|[_\s\d])|front|_fl\b|_fr\b|\bf[whx]\d/i.test(joined)) return 'front';
  if (/(^|[_\s])r($|[_\s\d])|rear|_rl\b|_rr\b|\br[whx]\d/i.test(joined)) return 'rear';
  return 'other';
}

function normalizeBeamTypeStr(bt) {
  if (bt === undefined || bt === null || bt === '') return '|NORMAL';
  if (typeof bt === 'number') {
    switch (bt) {
      case 1: return '|ANISOTROPIC';
      case 2: return '|BOUNDED';
      case 3: return '|PRESSURED';
      case 4: return '|LBEAM';
      case 6: return '|HYDRO';
      case 7: return '|SUPPORT';
      default: return '|NORMAL';
    }
  }
  return String(bt).trim().toUpperCase();
}

/**
 * Extracts all mechanical subsystems from a given jbeamParts dictionary
 * @param {Object} jbeamParts - Map of partName -> parsed JBeam part structure
 * @param {string|null} activePartName - Currently focused or active part key
 * @returns {Object} Comprehensive mechanical overview
 */
export function extractMechanicalOverview(jbeamParts, activePartName = null) {
  if (!jbeamParts || typeof jbeamParts !== 'object') {
    return {
      graph: { devices: {}, roots: [], edges: [], drivetrainLayout: 'None' },
      devicesList: [],
      hydrosList: [],
      mountsList: [],
      suspensionList: [],
      brakesList: [],
      variablesList: [],
      energyList: [],
      gearboxSpecs: null,
      diffSpecs: [],
      totalDevices: 0,
      drivetrainLayout: 'None',
      mechanicalNodeNames: new Set(),
      submeshNames: []
    };
  }

  // 1. Extract Powertrain DAG
  const graph = parsePowertrainGraph(jbeamParts);
  const devicesList = Object.values(graph.devices || {});

  const hydrosList = [];
  const mountsList = [];
  const suspensionList = [];
  const anisoBeamsList = [];
  const energyList = [];
  const variablesList = [];
  const diffSpecs = [];
  let gearboxSpecs = null;
  let frontMassKg = 0;
  let rearMassKg = 0;
  let totalMassKg = 0;

  const mechanicalNodeNames = new Set();
  const submeshNames = new Set();

  const partKeys = Object.keys(jbeamParts).filter(k => k !== '__meta');

  for (const partKey of partKeys) {
    const part = jbeamParts[partKey];
    if (!part || typeof part !== 'object') continue;
    const filePath = part.__filePath || part.filePath || null;

    // 2. Extract Hydros (Steering racks, tilt actuators) - supports both raw arrays and tableSchema objects (id1:/id2:)
    if (part.hydros && typeof part.hydros === 'object') {
      for (const row of getRowsList(part.hydros)) {
        if (!row || typeof row !== 'object') continue;
        const [id1, id2] = getRowEndpointIds(row);
        if (!id1 || !id2) continue;

        const opts = Array.isArray(row)
          ? (typeof row[row.length - 1] === 'object' && !Array.isArray(row[row.length - 1]) ? row[row.length - 1] : {})
          : row;

        mechanicalNodeNames.add(id1);
        mechanicalNodeNames.add(id2);
        hydrosList.push({
          id1,
          id2,
          beamName: opts.beamName || `hydro_${id1}_${id2}`,
          factor: opts.factor !== undefined && !isNaN(Number(opts.factor)) ? Number(opts.factor) : 1.0,
          inRate: opts.inRate !== undefined && !isNaN(Number(opts.inRate)) ? Number(opts.inRate) : 1.25,
          outRate: opts.outRate !== undefined && !isNaN(Number(opts.outRate)) ? Number(opts.outRate) : 1.25,
          inLimit: opts.inLimit !== undefined && !isNaN(Number(opts.inLimit)) ? Number(opts.inLimit) : 0,
          outLimit: opts.outLimit !== undefined && !isNaN(Number(opts.outLimit)) ? Number(opts.outLimit) : 0,
          steeringWheelLock: opts.steeringWheelLock || null,
          beamSpring: opts.beamSpring !== undefined ? Number(opts.beamSpring) : null,
          beamDamp: opts.beamDamp !== undefined ? Number(opts.beamDamp) : null,
          partName: partKey,
          filePath,
          __meta: row.__meta || null
        });
      }
    }

    // 3. Extract Mounts, BreakGroups & Suspension Beams (|BOUNDED shocks/springs, |SUPPORT bumpstops)
    if (part.beams && typeof part.beams === 'object') {
      let currentBreakGroup = null;
      let currentEngineGroup = null;

      for (const row of getRowsList(part.beams)) {
        if (!row || typeof row !== 'object') continue;

        if (!Array.isArray(row) && row.__meta?.type === 'object' && !row['id1:'] && !row.id1) {
          if (row.breakGroup !== undefined) currentBreakGroup = row.breakGroup;
          if (row.engineGroup !== undefined) currentEngineGroup = row.engineGroup;
          continue;
        }

        const [id1, id2] = getRowEndpointIds(row);
        if (!id1 || !id2) continue;

        const inlineOptions = Array.isArray(row)
          ? (typeof row[row.length - 1] === 'object' && !Array.isArray(row[row.length - 1]) ? row[row.length - 1] : {})
          : row;

        const rawBg = inlineOptions.breakGroup !== undefined ? inlineOptions.breakGroup : currentBreakGroup;
        const bg = normalizeBreakGroupText(rawBg);
        const eg = normalizeBreakGroupText(inlineOptions.engineGroup !== undefined ? inlineOptions.engineGroup : currentEngineGroup);
        const normType = normalizeBeamTypeStr(inlineOptions.beamType);

        const isMountLike = Boolean(
          (bg && /mount|engine|trans|subframe_mount|engmount/i.test(bg)) ||
          (eg && eg.length > 0)
        );

        if (isMountLike) {
          mechanicalNodeNames.add(id1);
          mechanicalNodeNames.add(id2);
          mountsList.push({
            id1,
            id2,
            breakGroup: bg || null,
            engineGroup: eg || null,
            beamSpring: inlineOptions.beamSpring !== undefined ? inlineOptions.beamSpring : null,
            beamDamp: inlineOptions.beamDamp !== undefined ? inlineOptions.beamDamp : null,
            beamStrength: inlineOptions.beamStrength !== undefined ? inlineOptions.beamStrength : null,
            beamDeform: inlineOptions.beamDeform !== undefined ? inlineOptions.beamDeform : null,
            partName: partKey,
            filePath,
            __meta: row.__meta || null
          });
        }

        if (normType === '|BOUNDED' || normType === '|SUPPORT' || normType === '|ANISOTROPIC') {
          const beamLabel = inlineOptions.name || inlineOptions.beamName || (
            normType === '|BOUNDED' ? `Shock/Spring ${id1} ↔ ${id2}` :
            normType === '|SUPPORT' ? `Bumpstop/Limit ${id1} ↔ ${id2}` :
            `Aniso ${id1} ↔ ${id2}`
          );
          const itemObj = {
            kind: normType === '|BOUNDED' ? 'bounded' : (normType === '|SUPPORT' ? 'support' : 'aniso'),
            subType: normType,
            axle: detectAxleFromNames(partKey, id1, id2, beamLabel),
            name: beamLabel,
            id1,
            id2,
            boundNodes: [id1, id2],
            beamSpring: inlineOptions.beamSpring !== undefined ? Number(inlineOptions.beamSpring) : null,
            beamDamp: inlineOptions.beamDamp !== undefined ? Number(inlineOptions.beamDamp) : null,
            beamLimitSpring: inlineOptions.beamLimitSpring !== undefined ? Number(inlineOptions.beamLimitSpring) : null,
            beamLimitDamp: inlineOptions.beamLimitDamp !== undefined ? Number(inlineOptions.beamLimitDamp) : null,
            beamPrecompression: inlineOptions.beamPrecompression !== undefined ? Number(inlineOptions.beamPrecompression) : null,
            longBoundRange: inlineOptions.longBoundRange !== undefined ? Number(inlineOptions.longBoundRange) : null,
            shortBoundRange: inlineOptions.shortBoundRange !== undefined ? Number(inlineOptions.shortBoundRange) : null,
            partName: partKey,
            filePath,
            __meta: row.__meta || null
          };
          if (normType === '|ANISOTROPIC') {
            anisoBeamsList.push(itemObj);
          } else {
            suspensionList.push(itemObj);
          }
        }
      }
    }

    // 4. Extract Energy Storage (Fuel tanks, batteries)
    if (part.energyStorage && typeof part.energyStorage === 'object') {
      for (const row of getRowsList(part.energyStorage)) {
        if (!row || typeof row !== 'object') continue;
        if (Array.isArray(row) && (row[0] === 'type' || row[1] === 'name')) continue;
        const type = row.type || (Array.isArray(row) ? row[0] : null);
        const name = row.name || (Array.isArray(row) ? row[1] : null);
        if (name && name !== 'name') {
          energyList.push({
            name: String(name),
            type: String(type || 'fuelTank'),
            partName: partKey,
            filePath,
            properties: part[name] || {},
            __meta: row.__meta || part[name]?.__meta || null
          });
        }
      }
    }

    // 5. Extract Real Gearbox Ratios & Differential Ratios from Device Sub-Objects
    for (const dev of devicesList) {
      if (dev.partName !== partKey) continue;
      const devBlock = part[dev.name];
      if (devBlock && typeof devBlock === 'object') {
        dev.deviceProps = devBlock;
        if (dev.category === 'gearbox') {
          const rawGears = devBlock.gearRatios || devBlock.gears;
          let ratios = [];
          if (Array.isArray(rawGears)) {
            ratios = rawGears.map(Number).filter(n => Number.isFinite(n) && n > 0);
          } else if (rawGears && typeof rawGears === 'object') {
            ratios = Object.keys(rawGears)
              .filter(k => k !== '__meta')
              .map(k => Number(rawGears[k]))
              .filter(n => Number.isFinite(n) && n > 0);
          }
          if (ratios.length > 0 && !gearboxSpecs) {
            gearboxSpecs = {
              name: dev.name,
              type: dev.type,
              ratios,
              allGears: Array.isArray(rawGears)
                ? rawGears.filter(v => typeof v === 'number')
                : Object.keys(rawGears || {}).filter(k => k !== '__meta').map(k => Number(rawGears[k])).filter(Number.isFinite),
              partName: partKey
            };
          }
        }
        if (dev.category === 'differential') {
          const ratio = Number(devBlock.gearRatio);
          diffSpecs.push({
            name: dev.name,
            diffType: devBlock.diffType || 'open',
            gearRatio: Number.isFinite(ratio) && ratio > 0 ? ratio : null,
            lsdPreload: devBlock.lsdPreload,
            lsdLockCoef: devBlock.lsdLockCoef,
            partName: partKey
          });
        }
      }
    }

    // 6. Extract Tunable Mechanical Variables ($camber, $toe, $spring, $damp, $gear, $trackoffset, etc.)
    if (part.variables && typeof part.variables === 'object') {
      for (const row of getRowsList(part.variables)) {
        if (!row || typeof row !== 'object') continue;
        const varName = Array.isArray(row) ? row[0] : row.name;
        if (!varName || varName === 'name' || typeof varName !== 'string' || !varName.startsWith('$')) continue;
        const category = Array.isArray(row) ? (row[3] || 'General') : (row.category || 'General');
        const defVal = Array.isArray(row) ? Number(row[4]) : Number(row.default);
        const minVal = Array.isArray(row) ? Number(row[5]) : Number(row.min);
        const maxVal = Array.isArray(row) ? Number(row[6]) : Number(row.max);
        variablesList.push({
          name: varName,
          title: Array.isArray(row) ? (row[7] || varName) : (row.title || varName),
          unit: Array.isArray(row) ? (row[2] || '') : (row.unit || ''),
          category: String(category),
          defaultVal: Number.isFinite(defVal) ? defVal : 0,
          minVal: Number.isFinite(minVal) ? minVal : 0,
          maxVal: Number.isFinite(maxVal) ? maxVal : 1,
          partName: partKey,
          filePath,
          __meta: row.__meta || null
        });
      }
    }

    // 7. Correlate Flexbodies & DAE Submeshes for mechanical components
    if (part.flexbodies && typeof part.flexbodies === 'object') {
      for (const row of getRowsList(part.flexbodies)) {
        if (!row) continue;
        const meshName = Array.isArray(row) ? row[0] : (row.mesh || row[0]);
        if (typeof meshName === 'string' && meshName.toLowerCase() !== 'mesh') {
          const lower = meshName.toLowerCase();
          if (
            lower.includes('engine') || lower.includes('transmission') || lower.includes('gearbox') ||
            lower.includes('diff') || lower.includes('shaft') || lower.includes('exhaust') ||
            lower.includes('suspension') || lower.includes('brake') || lower.includes('radiator') ||
            lower.includes('intake') || lower.includes('turbo') || lower.includes('header') ||
            lower.includes('steering') || lower.includes('strut') || lower.includes('spring') ||
            lower.includes('shock') || lower.includes('swaybar') || lower.includes('subframe')
          ) {
            submeshNames.add(meshName);
          }
        }
      }
    }

    // 8. Harvest node names associated with mechanical prefixes & accumulate mass distribution
    if (part.nodes && typeof part.nodes === 'object') {
      for (const row of getRowsList(part.nodes)) {
        if (!row || typeof row !== 'object') continue;
        const id = Array.isArray(row) ? row[0] : (row.id || row.name);
        if (typeof id === 'string' && id !== 'id' && id !== 'id:') {
          const nw = Number(Array.isArray(row) ? undefined : row.nodeWeight);
          const py = Number(Array.isArray(row) ? row[2] : (row.posY ?? row.y ?? row.ry ?? 0));
          if (Number.isFinite(nw) && nw > 0) {
            totalMassKg += nw;
            if (py < 0) frontMassKg += nw;
            else rearMassKg += nw;
          }
          const lower = id.toLowerCase();
          if (
            /^e\d+[lr]?$/i.test(lower) || lower.startsWith('eng') ||
            lower.startsWith('tra') ||
            lower.startsWith('rdiff') || lower.startsWith('fdiff') || lower.includes('diff') ||
            /^s\d+[lr]?$/i.test(lower) || lower.startsWith('fh') || lower.startsWith('rh') ||
            lower.startsWith('fx') || lower.startsWith('rx')
          ) {
            mechanicalNodeNames.add(id);
          }
        }
      }
    }
  }

  // 9. Extract TorsionBars, Rails & SlideNodes into Suspension & Kinematics
  try {
    const tbars = extractTorsionBars(jbeamParts) || [];
    for (const tb of tbars) {
      const ids = tb.nodes || [tb.id1, tb.id2, tb.id3, tb.id4].filter(Boolean);
      suspensionList.push({
        kind: 'torsionbar',
        subType: 'TorsionBar',
        axle: detectAxleFromNames(tb.partName, tb.name, ...ids),
        name: tb.name || `TorsionBar (${ids.join(' - ')})`,
        id1: ids[0] || null,
        id2: ids[1] || null,
        boundNodes: ids,
        spring: tb.spring,
        damp: tb.damp,
        partName: tb.partName || activePartName,
        filePath: jbeamParts[tb.partName]?.__filePath || null,
        __meta: tb.__meta || null
      });
    }
  } catch {}

  try {
    const { rails, slideNodes } = extractRailsAndSlideNodes(jbeamParts) || {};
    if (rails) {
      for (const [rKey, rail] of Object.entries(rails)) {
        const ids = rail.nodes || [];
        suspensionList.push({
          kind: 'rail',
          subType: 'Rail',
          name: `Rail: ${rail.name || rKey}`,
          id1: ids[0] || null,
          id2: ids[1] || null,
          boundNodes: ids,
          looped: rail.looped,
          partName: rail.partName || activePartName,
          filePath: jbeamParts[rail.partName]?.__filePath || null,
          __meta: rail.__meta || null
        });
      }
    }
    if (Array.isArray(slideNodes)) {
      for (const sn of slideNodes) {
        if (!sn?.id) continue;
        suspensionList.push({
          kind: 'slidenode',
          subType: 'SlideNode',
          name: `SlideNode: ${sn.id} → ${sn.railName || 'rail'}`,
          id1: sn.id,
          id2: null,
          boundNodes: [sn.id],
          railName: sn.railName,
          partName: sn.partName || activePartName,
          filePath: jbeamParts[sn.partName]?.__filePath || null,
          __meta: sn.__meta || null
        });
      }
    }
  } catch {}

  // 10. Extract Brakes & Wheel Hub Specs from PressureWheels
  const brakesList = [];
  try {
    const wheels = extractPressureWheels(jbeamParts) || [];
    for (const w of wheels) {
      brakesList.push({
        name: w.name,
        side: w.side,
        brakeTorque: w.brakeTorque || 0,
        parkingTorque: w.parkingTorque || 0,
        brakeDiameter: w.brakeDiameter || 0,
        radius: w.radius,
        hubRadius: w.hubRadius,
        tireWidth: w.tireWidth,
        pressurePSI: w.pressurePSI,
        id1: w.node1 || w.nodeArm || null,
        id2: w.node2 || null,
        boundNodes: [w.node1, w.node2, w.nodeArm].filter(Boolean),
        partName: w.partName || activePartName,
        filePath: jbeamParts[w.partName]?.__filePath || null,
        range: w.range || null
      });
    }
  } catch {}

  // 11. Correlate devices with their node bindings and submeshes
  for (const dev of devicesList) {
    const boundNodes = [];
    for (const nodeName of mechanicalNodeNames) {
      const lowerNode = nodeName.toLowerCase();
      if (dev.category === 'engine' && (/^e\d+[lr]?$/i.test(lowerNode) || lowerNode.includes('eng'))) {
        boundNodes.push(nodeName);
      } else if (dev.category === 'gearbox' && (lowerNode.startsWith('tra') || lowerNode.includes('trans'))) {
        boundNodes.push(nodeName);
      } else if (dev.category === 'differential' && (lowerNode.startsWith('rd') || lowerNode.startsWith('fd') || lowerNode.includes('diff'))) {
        boundNodes.push(nodeName);
      }
    }

    // Fallback: If boundNodes is empty, check nodes and beams from the defining part
    if (boundNodes.length === 0 && dev.partName && jbeamParts[dev.partName]) {
      const pObj = jbeamParts[dev.partName];
      if (pObj.nodes && typeof pObj.nodes === 'object') {
        for (const r of getRowsList(pObj.nodes)) {
          if (!r) continue;
          const nid = Array.isArray(r) ? r[0] : (r.id || r.name);
          if (nid && nid !== 'id:' && nid !== 'id' && typeof nid === 'string') {
            boundNodes.push(nid);
          }
        }
      }
      if (boundNodes.length === 0 && pObj.beams && typeof pObj.beams === 'object') {
        for (const b of getRowsList(pObj.beams)) {
          if (!b) continue;
          const [b1, b2] = getRowEndpointIds(b);
          if (b1) boundNodes.push(b1);
          if (b2) boundNodes.push(b2);
        }
      }
    }

    dev.boundNodes = Array.from(new Set(boundNodes));
    dev.filePath = dev.filePath || jbeamParts[dev.partName]?.__filePath || jbeamParts[dev.partName]?.filePath || null;

    // Bound submesh
    const boundMeshes = [];
    for (const mesh of submeshNames) {
      const lowerMesh = mesh.toLowerCase();
      if (dev.category === 'engine' && lowerMesh.includes('engine')) {
        boundMeshes.push(mesh);
      } else if (dev.category === 'gearbox' && (lowerMesh.includes('trans') || lowerMesh.includes('gearbox'))) {
        boundMeshes.push(mesh);
      } else if (dev.category === 'differential' && lowerMesh.includes('diff')) {
        boundMeshes.push(mesh);
      } else if (dev.category === 'shaft' && (lowerMesh.includes('shaft') || lowerMesh.includes('axle'))) {
        boundMeshes.push(mesh);
      }
    }
    dev.boundMeshes = boundMeshes;
  }

  // 12. Compute Vehicle Balance Metrics (Weight Split, Brake Bias, Ride Frequency & Damping Ratio)
  const frontWeightPct = totalMassKg > 0 ? Math.round((frontMassKg / totalMassKg) * 1000) / 10 : 50;
  const rearWeightPct = totalMassKg > 0 ? Math.round((100 - frontWeightPct) * 10) / 10 : 50;

  let frontBrakeTorque = 0;
  let rearBrakeTorque = 0;
  for (const b of brakesList) {
    if (/^f/i.test(b.name || '')) frontBrakeTorque += b.brakeTorque || 0;
    else if (/^r/i.test(b.name || '')) rearBrakeTorque += b.brakeTorque || 0;
  }
  const totalBrakeTorque = frontBrakeTorque + rearBrakeTorque;
  const frontBrakePct = totalBrakeTorque > 0 ? Math.round((frontBrakeTorque / totalBrakeTorque) * 1000) / 10 : null;
  const rearBrakePct = totalBrakeTorque > 0 ? Math.round((100 - frontBrakePct) * 10) / 10 : null;

  const calcAxleDynamics = (axleKey, axleMassKg) => {
    const cornerMass = axleMassKg > 10 ? axleMassKg / 2 : 350;
    const bounded = suspensionList.filter(s => s.kind === 'bounded' && s.axle === axleKey && Number.isFinite(s.beamSpring) && s.beamSpring > 0);
    if (bounded.length === 0) return null;
    const avgK = bounded.reduce((acc, s) => acc + s.beamSpring, 0) / bounded.length;
    const damped = bounded.filter(s => Number.isFinite(s.beamDamp) && s.beamDamp > 0);
    const avgC = damped.length > 0 ? damped.reduce((acc, s) => acc + s.beamDamp, 0) / damped.length : 0;
    const freqHz = (1 / (2 * Math.PI)) * Math.sqrt(avgK / cornerMass);
    const zeta = avgC > 0 ? avgC / (2 * Math.sqrt(avgK * cornerMass)) : 0;
    return {
      springRate: Math.round(avgK),
      dampingRate: Math.round(avgC),
      freqHz: Math.round(freqHz * 100) / 100,
      dampingRatio: Math.round(zeta * 100) / 100
    };
  };

  const vehicleBalance = {
    totalMassKg: Math.round(totalMassKg),
    frontWeightPct,
    rearWeightPct,
    frontBrakePct,
    rearBrakePct,
    frontDynamics: calcAxleDynamics('front', frontMassKg),
    rearDynamics: calcAxleDynamics('rear', rearMassKg)
  };

  // 13. Powertrain Topology Integrity Checks
  const powertrainIssues = [];
  for (const dev of devicesList) {
    if (dev.inputName && dev.inputName !== 'dummy' && !graph.devices?.[dev.inputName]) {
      powertrainIssues.push({
        severity: 'error',
        device: dev.name,
        message: `"${dev.name}" references missing input "${dev.inputName}"`
      });
    }
  }
  if (devicesList.length > 0 && !devicesList.some(d => d.category === 'engine')) {
    powertrainIssues.push({
      severity: 'info',
      device: null,
      message: 'No engine device found in current scope (switch to Assembled or open engine file)'
    });
  }

  return {
    graph,
    devicesList,
    hydrosList,
    mountsList,
    suspensionList,
    anisoBeamsList,
    brakesList,
    variablesList,
    energyList,
    gearboxSpecs,
    diffSpecs,
    vehicleBalance,
    powertrainIssues,
    totalDevices: devicesList.length,
    drivetrainLayout: graph.drivetrainLayout || 'None',
    mechanicalNodeNames,
    submeshNames: Array.from(submeshNames)
  };
}
