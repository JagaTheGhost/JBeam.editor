/**
 * JBeam Studio - Mechanical System Extractor
 * Extracts, unifies, and correlates powertrain DAGs, steering hydros,
 * engine/transmission mounts, and energy storage across JBeam parts.
 */

import { parsePowertrainGraph, getDeviceCategory } from '../powertrain/powertrainParser.js';

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
      energyList: [],
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
  const energyList = [];
  const mechanicalNodeNames = new Set();
  const submeshNames = new Set();

  const partKeys = Object.keys(jbeamParts).filter(k => k !== '__meta');

  for (const partKey of partKeys) {
    const part = jbeamParts[partKey];
    if (!part || typeof part !== 'object') continue;

    // 2. Extract Hydros (Steering racks, tilt actuators)
    if (part.hydros && typeof part.hydros === 'object') {
      const rows = Array.isArray(part.hydros) ? part.hydros : Object.values(part.hydros);
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        if (Array.isArray(row)) {
          if (row[0] === 'id1:' || row[0] === 'id1') continue;
          const id1 = row[0];
          const id2 = row[1];
          const options = typeof row[2] === 'object' ? row[2] : {};
          if (id1 && id2) {
            mechanicalNodeNames.add(String(id1));
            mechanicalNodeNames.add(String(id2));
            hydrosList.push({
              id1: String(id1),
              id2: String(id2),
              beamName: options.beamName || `hydro_${id1}_${id2}`,
              factor: options.factor !== undefined ? Number(options.factor) : 1.0,
              inRate: options.inRate !== undefined ? Number(options.inRate) : 1.25,
              outRate: options.outRate !== undefined ? Number(options.outRate) : 1.25,
              inLimit: options.inLimit !== undefined ? Number(options.inLimit) : 0,
              outLimit: options.outLimit !== undefined ? Number(options.outLimit) : 0,
              steeringWheelLock: options.steeringWheelLock || null,
              partName: partKey,
              filePath: part.__filePath || part.filePath || null
            });
          }
        } else if (row.id1 && row.id2) {
          mechanicalNodeNames.add(String(row.id1));
          mechanicalNodeNames.add(String(row.id2));
          hydrosList.push({
            id1: String(row.id1),
            id2: String(row.id2),
            beamName: row.beamName || `hydro_${row.id1}_${row.id2}`,
            factor: row.factor !== undefined ? Number(row.factor) : 1.0,
            inRate: row.inRate !== undefined ? Number(row.inRate) : 1.25,
            outRate: row.outRate !== undefined ? Number(row.outRate) : 1.25,
            inLimit: row.inLimit !== undefined ? Number(row.inLimit) : 0,
            outLimit: row.outLimit !== undefined ? Number(row.outLimit) : 0,
            steeringWheelLock: row.steeringWheelLock || null,
            partName: partKey,
            filePath: part.__filePath || part.filePath || null
          });
        }
      }
    }

    // 3. Extract Mounts & BreakGroups from Beams
    if (part.beams && typeof part.beams === 'object') {
      const rows = Array.isArray(part.beams) ? part.beams : Object.values(part.beams);
      let currentBreakGroup = null;
      let currentEngineGroup = null;

      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;

        if (Array.isArray(row)) {
          if (row[0] === 'id1:' || row[0] === 'id1') continue;
          const id1 = row[0];
          const id2 = row[1];
          const inlineOptions = typeof row[2] === 'object' ? row[2] : (typeof row[row.length - 1] === 'object' ? row[row.length - 1] : {});

          const bg = inlineOptions.breakGroup !== undefined ? inlineOptions.breakGroup : currentBreakGroup;
          const eg = inlineOptions.engineGroup !== undefined ? inlineOptions.engineGroup : currentEngineGroup;

          const isMountLike = (
            (bg && typeof bg === 'string' && (bg.toLowerCase().includes('mount') || bg.toLowerCase().includes('engine') || bg.toLowerCase().includes('trans'))) ||
            (eg && typeof eg === 'string' && eg.length > 0)
          );

          if (isMountLike && id1 && id2) {
            mechanicalNodeNames.add(String(id1));
            mechanicalNodeNames.add(String(id2));
            mountsList.push({
              id1: String(id1),
              id2: String(id2),
              breakGroup: bg || null,
              engineGroup: eg || null,
              beamSpring: inlineOptions.beamSpring !== undefined ? inlineOptions.beamSpring : null,
              beamDamp: inlineOptions.beamDamp !== undefined ? inlineOptions.beamDamp : null,
              beamStrength: inlineOptions.beamStrength !== undefined ? inlineOptions.beamStrength : null,
              partName: partKey,
              filePath: part.__filePath || part.filePath || null
            });
          }
        } else {
          if (row.breakGroup !== undefined) currentBreakGroup = row.breakGroup;
          if (row.engineGroup !== undefined) currentEngineGroup = row.engineGroup;

          const bg = row.breakGroup !== undefined ? row.breakGroup : currentBreakGroup;
          const eg = row.engineGroup !== undefined ? row.engineGroup : currentEngineGroup;

          const isMountLike = (
            (bg && typeof bg === 'string' && (bg.toLowerCase().includes('mount') || bg.toLowerCase().includes('engine') || bg.toLowerCase().includes('trans'))) ||
            (eg && typeof eg === 'string' && eg.length > 0)
          );

          if (isMountLike && row.id1 && row.id2) {
            mechanicalNodeNames.add(String(row.id1));
            mechanicalNodeNames.add(String(row.id2));
            mountsList.push({
              id1: String(row.id1),
              id2: String(row.id2),
              breakGroup: bg || null,
              engineGroup: eg || null,
              beamSpring: row.beamSpring !== undefined ? row.beamSpring : null,
              beamDamp: row.beamDamp !== undefined ? row.beamDamp : null,
              beamStrength: row.beamStrength !== undefined ? row.beamStrength : null,
              partName: partKey,
              filePath: part.__filePath || part.filePath || null
            });
          }
        }
      }
    }

    // 4. Extract Energy Storage (Fuel tanks, batteries)
    if (part.energyStorage && typeof part.energyStorage === 'object') {
      const rows = Array.isArray(part.energyStorage) ? part.energyStorage : Object.values(part.energyStorage);
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        if (Array.isArray(row) && (row[0] === 'type' || row[1] === 'name')) continue;
        const type = row.type || (Array.isArray(row) ? row[0] : null);
        const name = row.name || (Array.isArray(row) ? row[1] : null);
        if (name) {
          energyList.push({
            name: String(name),
            type: String(type || 'fuelTank'),
            partName: partKey,
            filePath: part.__filePath || part.filePath || null,
            properties: part[name] || {}
          });
        }
      }
    }

    // 5. Correlate Flexbodies & DAE Submeshes for mechanical components
    if (part.flexbodies && typeof part.flexbodies === 'object') {
      const rows = Array.isArray(part.flexbodies) ? part.flexbodies : Object.values(part.flexbodies);
      for (const row of rows) {
        if (!row) continue;
        const meshName = Array.isArray(row) ? row[0] : (row.mesh || row[0]);
        if (typeof meshName === 'string') {
          const lower = meshName.toLowerCase();
          if (
            lower.includes('engine') || lower.includes('transmission') || lower.includes('gearbox') ||
            lower.includes('diff') || lower.includes('shaft') || lower.includes('exhaust') ||
            lower.includes('suspension') || lower.includes('brake') || lower.includes('radiator') ||
            lower.includes('intake') || lower.includes('turbo') || lower.includes('header')
          ) {
            submeshNames.add(meshName);
          }
        }
      }
    }

    // 6. Harvest node names associated with mechanical prefixes
    if (part.nodes && typeof part.nodes === 'object') {
      const rows = Array.isArray(part.nodes) ? part.nodes : Object.values(part.nodes);
      for (const row of rows) {
        if (!row) continue;
        const id = Array.isArray(row) ? row[0] : row.id;
        if (typeof id === 'string') {
          const lower = id.toLowerCase();
          if (
            lower.startsWith('e') || // e1r, e2r, e3r, e4r (engine)
            lower.startsWith('tra') || // tra1r (transmission)
            lower.startsWith('d') || // diff
            lower.startsWith('rd') || // rear diff
            lower.startsWith('fd') || // front diff
            lower.startsWith('s') || // steering
            lower.startsWith('fx') || lower.startsWith('rx') // front/rear axle
          ) {
            mechanicalNodeNames.add(id);
          }
        }
      }
    }
  }

  // Correlate devices with their node bindings and submeshes
  for (const dev of devicesList) {
    const devName = dev.name.toLowerCase();
    const boundNodes = [];
    for (const nodeName of mechanicalNodeNames) {
      const lowerNode = nodeName.toLowerCase();
      if (dev.category === 'engine' && (lowerNode.startsWith('e') || lowerNode.includes('eng'))) {
        boundNodes.push(nodeName);
      } else if (dev.category === 'gearbox' && (lowerNode.startsWith('tra') || lowerNode.includes('trans'))) {
        boundNodes.push(nodeName);
      } else if (dev.category === 'differential' && (lowerNode.startsWith('d') || lowerNode.includes('diff'))) {
        boundNodes.push(nodeName);
      }
    }
    // Fallback: If boundNodes is empty, check nodes and beams from the defining part
    if (boundNodes.length === 0 && dev.partName && jbeamParts[dev.partName]) {
      const pObj = jbeamParts[dev.partName];
      if (pObj.nodes && typeof pObj.nodes === 'object') {
        const rows = Array.isArray(pObj.nodes) ? pObj.nodes : Object.values(pObj.nodes);
        for (const r of rows) {
          if (!r) continue;
          const nid = Array.isArray(r) ? r[0] : (r.id || r.name);
          if (nid && nid !== 'id:' && nid !== 'id' && typeof nid === 'string') {
            boundNodes.push(nid);
          }
        }
      }
      if (boundNodes.length === 0 && pObj.beams && typeof pObj.beams === 'object') {
        const rows = Array.isArray(pObj.beams) ? pObj.beams : Object.values(pObj.beams);
        for (const b of rows) {
          if (!b) continue;
          const b1 = Array.isArray(b) ? b[0] : b['id1:'];
          const b2 = Array.isArray(b) ? b[1] : b['id2:'];
          if (b1 && b1 !== 'id1:' && typeof b1 === 'string') boundNodes.push(b1);
          if (b2 && b2 !== 'id2:' && typeof b2 === 'string') boundNodes.push(b2);
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
      }
    }
    dev.boundMeshes = boundMeshes;
  }

  return {
    graph,
    devicesList,
    hydrosList,
    mountsList,
    energyList,
    totalDevices: devicesList.length,
    drivetrainLayout: graph.drivetrainLayout || 'None',
    mechanicalNodeNames,
    submeshNames: Array.from(submeshNames)
  };
}
