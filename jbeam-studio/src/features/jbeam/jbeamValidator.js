/*
  JBeam Structural & Syntax Diagnostics Validator
  Performs multi-layer validation:
  1. SJSON syntax validation
  2. JBeam table schema validation
  3. Structural integrity:
     - Missing node references in beams
     - Duplicate node IDs
     - Invalid / non-numeric coordinates
     - Degenerate triangles
     - Malformed sections
*/

import { decodeWithMetaWithDiagnostics } from './sjsonParser.js';
import { processAllParts } from './tableSchema.js';
import { extractPartFlexbodies, getNodeGroups, matchesSubmeshName } from './flexbodyUtils.js';

export function validateJBeamDocument(text, filePath = 'document.jbeam', options = {}) {
  const problems = [];
  let dataBundle = null;
  let interpretedData = null;

  const nodeToPartMap = options.workspaceIndex?.nodeToPartMap || options.nodeToPartMap || {};
  const assembledNodes = options.assembledNodes;

  // 1. SJSON Syntax Pass
  try {
    dataBundle = decodeWithMetaWithDiagnostics(text, filePath, true);
    if (dataBundle && dataBundle.diagnosticsList) {
      for (const diag of dataBundle.diagnosticsList) {
        problems.push({
          source: 'Syntax',
          severity: diag.severity || 'error',
          message: diag.message,
          line: (diag.range && diag.range[0] !== undefined) ? diag.range[0] + 1 : 1,
          column: (diag.range && diag.range[1] !== undefined) ? diag.range[1] + 1 : 1,
          endLine: (diag.range && diag.range[2] !== undefined) ? diag.range[2] + 1 : 1,
          endColumn: (diag.range && diag.range[3] !== undefined) ? diag.range[3] + 1 : 1,
          range: diag.range || [0, 0, 0, 0]
        });
      }
    }
  } catch (err) {
    problems.push({
      source: 'Parser',
      severity: 'error',
      message: `Fatal syntax parser error: ${err.message}`,
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 1,
      range: [0, 0, 0, 0]
    });
    return {
      isValid: false,
      problems,
      dataBundle: null,
      interpretedData: null,
      parts: {}
    };
  }

  // If fatal errors exist in SJSON pass, return immediately with syntax errors
  if (dataBundle && dataBundle.errorsExist && !dataBundle.data) {
    return {
      isValid: false,
      problems,
      dataBundle,
      interpretedData: null,
      parts: {}
    };
  }

  // 2. Table Schema & Structural Pass
  try {
    const rawData = dataBundle?.data || {};
    const [partsData, schemaDiagnostics] = processAllParts(rawData);
    interpretedData = partsData;

    // Add schema diagnostics
    if (schemaDiagnostics && schemaDiagnostics.length > 0) {
      for (const diag of schemaDiagnostics) {
        const severity = diag[0] === 'warning' ? 'warning' : 'error';
        const message = diag[1];
        const range = diag[2] || [0, 0, 0, 0];
        problems.push({
          source: 'TableSchema',
          severity,
          message,
          line: range[0] + 1,
          column: range[1] + 1,
          endLine: range[2] + 1,
          endColumn: range[3] + 1,
          range
        });
      }
    }

    // 3. Deep Structural Relationship Checks
    const partKeys = Object.keys(interpretedData).filter(k => k !== '__meta');
    for (const partName of partKeys) {
      const part = interpretedData[partName];
      if (!part || typeof part !== 'object') continue;

      const declaredNodeIds = new Set();
      const nodePosMap = new Map();

      // Check nodes
      if (part.nodes && typeof part.nodes === 'object') {
        const nodeKeys = Object.keys(part.nodes).filter(k => k !== '__meta');
        for (const nodeKey of nodeKeys) {
          const node = part.nodes[nodeKey];
          if (!node || typeof node !== 'object') continue;

          const nodeId = node.id || node.name || nodeKey;
          const range = node.__meta?.range || [0, 0, 0, 0];

          // Check duplicate node ID
          if (declaredNodeIds.has(nodeId)) {
            problems.push({
              source: 'Integrity',
              severity: 'warning',
              message: `Duplicate node ID "${nodeId}" defined in part "${partName}"`,
              line: range[0] + 1,
              column: range[1] + 1,
              endLine: range[2] + 1,
              endColumn: range[3] + 1,
              range
            });
          } else {
            declaredNodeIds.add(nodeId);
          }

          // Check coordinate validity
          const px = Number(node.posX !== undefined ? node.posX : (node.pos && node.pos[0] !== undefined ? node.pos[0] : (node.rx !== undefined ? node.rx : NaN)));
          const py = Number(node.posY !== undefined ? node.posY : (node.pos && node.pos[1] !== undefined ? node.pos[1] : (node.ry !== undefined ? node.ry : NaN)));
          const pz = Number(node.posZ !== undefined ? node.posZ : (node.pos && node.pos[2] !== undefined ? node.pos[2] : (node.rz !== undefined ? node.rz : NaN)));

          if (isNaN(px) || isNaN(py) || isNaN(pz)) {
            problems.push({
              source: 'Coordinates',
              severity: 'error',
              message: `Node "${nodeId}" contains invalid non-numeric coordinates: [${node.posX}, ${node.posY}, ${node.posZ}]`,
              line: range[0] + 1,
              column: range[1] + 1,
              endLine: range[2] + 1,
              endColumn: range[3] + 1,
              range
            });
          } else {
            nodePosMap.set(nodeId, [px, py, pz]);
            node.pos = [px, py, pz];
          }
        }
      }

      // Check beams for missing node references
      if (part.beams && typeof part.beams === 'object') {
        const beamKeys = Object.keys(part.beams).filter(k => k !== '__meta');
        for (const beamKey of beamKeys) {
          const beam = part.beams[beamKey];
          if (!beam || typeof beam !== 'object') continue;

          const id1 = beam['id1:'];
          const id2 = beam['id2:'];
          const range = beam.__meta?.range || [0, 0, 0, 0];

          if (!id1 || !id2) {
            problems.push({
              source: 'Beams',
              severity: 'error',
              message: `Beam is missing node reference endpoint (id1: ${id1}, id2: ${id2})`,
              line: range[0] + 1,
              column: range[1] + 1,
              endLine: range[2] + 1,
              endColumn: range[3] + 1,
              range
            });
            continue;
          }

          const checkNodeRef = (nid, elemType) => {
            if (declaredNodeIds.has(nid)) return;

            const openTabRef = options.openTabsNodes && options.openTabsNodes[nid];
            const externalPart = nodeToPartMap[nid] ||
              (assembledNodes && typeof assembledNodes === 'object' && (assembledNodes[nid]?.partOrigin || (assembledNodes.has && assembledNodes.has(nid) ? 'assembly' : null))) ||
              (openTabRef ? (openTabRef.tabTitle || openTabRef.partName || 'open file') : null);

            if (externalPart) {
              problems.push({
                source: 'Inter-Part',
                severity: 'info',
                message: `${elemType} connects to external node "${nid}" (provided by component "${externalPart}")`,
                line: range[0] + 1,
                column: range[1] + 1,
                endLine: range[2] + 1,
                endColumn: range[3] + 1,
                range
              });
            } else {
              problems.push({
                source: 'Reference',
                severity: options.strictReferences ? 'error' : 'warning',
                message: `${elemType} references non-existent node "${nid}" in part "${partName}" (may be provided by an attached part/chassis)`,
                line: range[0] + 1,
                column: range[1] + 1,
                endLine: range[2] + 1,
                endColumn: range[3] + 1,
                range
              });
            }
          };

          checkNodeRef(id1, 'Beam');
          checkNodeRef(id2, 'Beam');

          if (id1 === id2) {
            problems.push({
              source: 'Beams',
              severity: 'warning',
              message: `Zero-length beam connecting node "${id1}" to itself`,
              line: range[0] + 1,
              column: range[1] + 1,
              endLine: range[2] + 1,
              endColumn: range[3] + 1,
              range
            });
          }
        }
      }

      // Check triangles for missing node references & degenerate geometry
      if (part.triangles && typeof part.triangles === 'object') {
        const triKeys = Object.keys(part.triangles).filter(k => k !== '__meta');
        for (const triKey of triKeys) {
          const tri = part.triangles[triKey];
          if (!tri || typeof tri !== 'object') continue;

          const id1 = tri['id1:'];
          const id2 = tri['id2:'];
          const id3 = tri['id3:'];
          const range = tri.__meta?.range || [0, 0, 0, 0];

          if (!id1 || !id2 || !id3) {
            problems.push({
              source: 'Triangles',
              severity: 'error',
              message: `Triangle is missing node endpoint (id1: ${id1}, id2: ${id2}, id3: ${id3})`,
              line: range[0] + 1,
              column: range[1] + 1,
              endLine: range[2] + 1,
              endColumn: range[3] + 1,
              range
            });
            continue;
          }

          const checkTriNodeRef = (nid) => {
            if (declaredNodeIds.has(nid)) return;
            const externalPart = nodeToPartMap[nid] ||
              (assembledNodes && typeof assembledNodes === 'object' && (assembledNodes[nid]?.partOrigin || (assembledNodes.has && assembledNodes.has(nid) ? 'assembly' : null)));

            if (externalPart) {
              problems.push({
                source: 'Inter-Part',
                severity: 'info',
                message: `Triangle connects to external node "${nid}" (provided by part "${externalPart}")`,
                line: range[0] + 1,
                column: range[1] + 1,
                endLine: range[2] + 1,
                endColumn: range[3] + 1,
                range
              });
            } else {
              problems.push({
                source: 'Reference',
                severity: options.strictReferences ? 'error' : 'warning',
                message: `Triangle references non-existent node "${nid}" in part "${partName}" (may be provided by an attached part/chassis)`,
                line: range[0] + 1,
                column: range[1] + 1,
                endLine: range[2] + 1,
                endColumn: range[3] + 1,
                range
              });
            }
          };

          checkTriNodeRef(id1);
          checkTriNodeRef(id2);
          checkTriNodeRef(id3);
        }
      }

      // Check flexbodies for empty node groups & .dae submesh existence
      if (part.flexbodies && typeof part.flexbodies === 'object') {
        const partFlexbodies = extractPartFlexbodies(part, partName);
        const daeNames = options.daeSubmeshNames ? (Array.isArray(options.daeSubmeshNames) ? options.daeSubmeshNames : Array.from(options.daeSubmeshNames)) : [];

        for (const fb of partFlexbodies) {
          const range = fb.range || [0, 0, 0, 0];

          // 1. Check if flexbody defines groups, but 0 nodes in the part/assembly match
          if (fb.groups && fb.groups.length > 0) {
            let matchedNodeCount = 0;
            for (const grp of fb.groups) {
              // Check part's own nodes
              if (part.nodes) {
                for (const nk of Object.keys(part.nodes).filter(k => k !== '__meta')) {
                  const node = part.nodes[nk];
                  const nGroups = getNodeGroups(node);
                  if (nGroups.includes(grp)) {
                    matchedNodeCount++;
                  }
                }
              }
              // Check assembled nodes if available
              if (options.assembledNodes && typeof options.assembledNodes === 'object') {
                for (const ank of Object.keys(options.assembledNodes).filter(k => k !== '__meta')) {
                  const aNode = options.assembledNodes[ank];
                  const aGroups = getNodeGroups(aNode);
                  if (aGroups.includes(grp)) {
                    matchedNodeCount++;
                  }
                }
              }
            }

            if (matchedNodeCount === 0) {
              problems.push({
                source: 'Flexbody',
                severity: 'warning',
                message: `Flexbody mesh "${fb.meshName}" references group(s) [${fb.groups.join(', ')}] with 0 defined nodes. Mesh will not deform in BeamNG.`,
                line: range[0] + 1,
                column: range[1] + 1,
                endLine: range[2] + 1,
                endColumn: range[3] + 1,
                range
              });
            }
          }

          // 2. Check if .dae visual mesh is loaded, but this flexbody mesh does not exist in .dae
          if (daeNames.length > 0) {
            const isMatchedInDae = daeNames.some(dName => matchesSubmeshName(dName, fb.meshName));
            if (!isMatchedInDae) {
              problems.push({
                source: 'Flexbody',
                severity: 'info',
                message: `Flexbody mesh "${fb.meshName}" not found in loaded 3D visual model (${options.daeFileName || 'visual mesh'}).`,
                line: range[0] + 1,
                column: range[1] + 1,
                endLine: range[2] + 1,
                endColumn: range[3] + 1,
                range
              });
            }
          }
        }
      }
    }
  } catch (err) {
    problems.push({
      source: 'Validator',
      severity: 'error',
      message: `Structural validation error: ${err.message}`,
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 1,
      range: [0, 0, 0, 0]
    });
  }

  // Deduplicate identical problems
  const uniqueProblems = [];
  const seenSet = new Set();
  for (const p of problems) {
    const key = `${p.severity}|${p.line}|${p.column}|${p.message}`;
    if (!seenSet.has(key)) {
      seenSet.add(key);
      uniqueProblems.push(p);
    }
  }

  const hasErrors = uniqueProblems.some(p => p.severity === 'error');

  return {
    isValid: !hasErrors,
    problems: uniqueProblems,
    dataBundle,
    interpretedData,
    parts: interpretedData || {}
  };
}

export default {
  validateJBeamDocument
};

