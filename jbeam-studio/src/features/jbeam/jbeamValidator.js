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
import { extractTorsionBars, extractRailsAndSlideNodes } from './suspensionPhysicsParser.js';
import { extractRefNodes, extractCamerasInternal } from './vehicleFrameParser.js';
import { extractCrashZones, normalizeGroupList } from './crashZonesParser.js';

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

      // Check pressureWheels and hubWheels
      const wheelSections = [part.pressureWheels, part.hubWheels].filter(Boolean);
      for (const wheelSection of wheelSections) {
        if (typeof wheelSection !== 'object') continue;
        const wKeys = Object.keys(wheelSection).filter(k => k !== '__meta');
        for (const wKey of wKeys) {
          const w = wheelSection[wKey];
          if (!w || typeof w !== 'object') continue;

          const node1 = w['node1:'] || w.node1;
          const node2 = w['node2:'] || w.node2;
          const range = w.__meta?.range || [0, 0, 0, 0];

          if (node1 || node2) {
            const checkWheelNode = (nid, label) => {
              if (!nid) return;
              if (declaredNodeIds.has(nid)) return;
              const externalPart = nodeToPartMap[nid] ||
                (assembledNodes && typeof assembledNodes === 'object' && (assembledNodes[nid]?.partOrigin || (assembledNodes.has && assembledNodes.has(nid) ? 'assembly' : null)));

              if (externalPart) {
                problems.push({
                  source: 'Inter-Part',
                  severity: 'info',
                  message: `Wheel "${w.name || wKey}" ${label} connects to external node "${nid}" (provided by part "${externalPart}")`,
                  line: range[0] + 1,
                  column: range[1] + 1,
                  endLine: range[2] + 1,
                  endColumn: range[3] + 1,
                  range
                });
              } else {
                problems.push({
                  source: 'PressureWheels',
                  severity: options.strictReferences ? 'error' : 'warning',
                  message: `Wheel "${w.name || wKey}" ${label} references non-existent spindle node "${nid}" in part "${partName}" (may cause ghost hub in-game)`,
                  line: range[0] + 1,
                  column: range[1] + 1,
                  endLine: range[2] + 1,
                  endColumn: range[3] + 1,
                  range
                });
              }
            };

            checkWheelNode(node1, 'inner spindle (node1:)');
            checkWheelNode(node2, 'outer spindle (node2:)');

            if (w.wheelDir !== undefined && w.wheelDir !== 1 && w.wheelDir !== -1) {
              problems.push({
                source: 'PressureWheels',
                severity: 'warning',
                message: `Wheel "${w.name || wKey}" has invalid wheelDir: ${w.wheelDir} (must be 1 for right or -1 for left)`,
                line: range[0] + 1,
                column: range[1] + 1,
                endLine: range[2] + 1,
                endColumn: range[3] + 1,
                range
              });
            }

            if (w.numRays !== undefined) {
              const rays = Number(w.numRays);
              if (isNaN(rays) || rays < 6 || rays % 2 !== 0) {
                problems.push({
                  source: 'PressureWheels',
                  severity: 'warning',
                  message: `Wheel "${w.name || wKey}" has invalid numRays: ${w.numRays} (must be an even integer >= 6)`,
                  line: range[0] + 1,
                  column: range[1] + 1,
                  endLine: range[2] + 1,
                  endColumn: range[3] + 1,
                  range
                });
              }
            }

            if (w.radius !== undefined && w.hubRadius !== undefined) {
              const r = Number(w.radius);
              const hr = Number(w.hubRadius);
              if (r > 0 && hr > 0 && hr >= r) {
                problems.push({
                  source: 'PressureWheels',
                  severity: 'warning',
                  message: `Wheel "${w.name || wKey}" hubRadius (${hr}m) must be strictly smaller than tire radius (${r}m)`,
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

      // --- 3g. TorsionBars Validation ---
        if (part.torsionbars) {
          const torsionBars = extractTorsionBars(part);
          for (const tb of torsionBars) {
            const range = tb.lineRange || part.torsionbars?.__meta?.range || [0, 0, 0, 0];
            const checkTbNode = (nid, label) => {
              if (declaredNodeIds.has(nid)) return;
              const externalPart = nodeToPartMap[nid] ||
                (assembledNodes && typeof assembledNodes === 'object' && (assembledNodes[nid]?.partOrigin || (assembledNodes.has && assembledNodes.has(nid) ? 'assembly' : null)));
              if (!externalPart) {
                problems.push({
                  source: 'TorsionBars',
                  severity: options.strictReferences ? 'error' : 'warning',
                  message: `Torsionbar "${tb.name}" ${label} references non-existent node "${nid}" in part "${partName}"`,
                  line: range[0] + 1,
                  column: range[1] + 1,
                  endLine: range[2] + 1,
                  endColumn: range[3] + 1,
                  range
                });
              }
            };

            checkTbNode(tb.id1, 'arm 1 tip (id1:)');
            checkTbNode(tb.id2, 'pivot 1 (id2:)');
            checkTbNode(tb.id3, 'pivot 2 (id3:)');
            checkTbNode(tb.id4, 'arm 2 tip (id4:)');

            // Zero-length torsion axis
            if (tb.id2 === tb.id3) {
              problems.push({
                source: 'TorsionBars',
                severity: 'error',
                message: `Torsionbar "${tb.name}" central torsion axis has zero length (id2 == id3 == "${tb.id2}"). In BeamNG, coincident torsionbar pivots cause physics crashes.`,
                line: range[0] + 1,
                column: range[1] + 1,
                endLine: range[2] + 1,
                endColumn: range[3] + 1,
                range
              });
            }

            if (tb.id1 === tb.id2 || tb.id3 === tb.id4) {
              problems.push({
                source: 'TorsionBars',
                severity: 'warning',
                message: `Torsionbar "${tb.name}" has coincident arm nodes (zero lever arm length)`,
                line: range[0] + 1,
                column: range[1] + 1,
                endLine: range[2] + 1,
                endColumn: range[3] + 1,
                range
              });
            }

            if (typeof tb.spring === 'number' && tb.spring <= 0) {
              problems.push({
                source: 'TorsionBars',
                severity: 'warning',
                message: `Torsionbar "${tb.name}" has non-positive spring rate: ${tb.spring}`,
                line: range[0] + 1,
                column: range[1] + 1,
                endLine: range[2] + 1,
                endColumn: range[3] + 1,
                range
              });
            }
          }
        }

        // --- 3h. Rails & SlideNodes Validation ---
        if (part.rails || part.slidenodes) {
          const { rails, slideNodes } = extractRailsAndSlideNodes(part);

          for (const [railName, rail] of Object.entries(rails)) {
            const range = rail.lineRange || part.rails?.__meta?.range || [0, 0, 0, 0];
            if (!rail.links || rail.links.length < 2) {
              problems.push({
                source: 'Rails',
                severity: 'error',
                message: `Rail "${railName}" has fewer than 2 linked nodes (requires at least 2 nodes to form a guide rail)`,
                line: range[0] + 1,
                column: range[1] + 1,
                endLine: range[2] + 1,
                endColumn: range[3] + 1,
                range
              });
            } else {
              for (const linkNode of rail.links) {
                if (!declaredNodeIds.has(linkNode)) {
                  const externalPart = nodeToPartMap[linkNode] ||
                    (assembledNodes && typeof assembledNodes === 'object' && (assembledNodes[linkNode]?.partOrigin || (assembledNodes.has && assembledNodes.has(linkNode) ? 'assembly' : null)));
                  if (!externalPart) {
                    problems.push({
                      source: 'Rails',
                      severity: options.strictReferences ? 'error' : 'warning',
                      message: `Rail "${railName}" references non-existent link node "${linkNode}" in part "${partName}"`,
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

          for (const sn of slideNodes) {
            const range = sn.lineRange || part.slidenodes?.__meta?.range || [0, 0, 0, 0];
            if (!declaredNodeIds.has(sn.id)) {
              const externalPart = nodeToPartMap[sn.id] ||
                (assembledNodes && typeof assembledNodes === 'object' && (assembledNodes[sn.id]?.partOrigin || (assembledNodes.has && assembledNodes.has(sn.id) ? 'assembly' : null)));
              if (!externalPart) {
                problems.push({
                  source: 'SlideNodes',
                  severity: options.strictReferences ? 'error' : 'warning',
                  message: `SlideNode references non-existent node "${sn.id}" in part "${partName}"`,
                  line: range[0] + 1,
                  column: range[1] + 1,
                  endLine: range[2] + 1,
                  endColumn: range[3] + 1,
                  range
                });
              }
            }

            if (sn.railName && !rails[sn.railName]) {
              problems.push({
                source: 'SlideNodes',
                severity: 'error',
                message: `SlideNode "${sn.id}" references undefined rail "${sn.railName}"`,
                line: range[0] + 1,
                column: range[1] + 1,
                endLine: range[2] + 1,
                endColumn: range[3] + 1,
                range
              });
            }
          }
        }

        // --- 3i. RefNodes Validation ---
        if (part.refNodes) {
          const rawRef = part.refNodes;
          const rawKeys = typeof rawRef === 'object' && rawRef !== null
            ? (Array.isArray(rawRef) ? rawRef : Object.keys(rawRef).filter(k => k !== '__meta'))
            : [];
          const isPlaceholder = rawKeys.length === 0 || (Array.isArray(rawRef) && rawRef.length === 1 && Array.isArray(rawRef[0]));
          if (!isPlaceholder) {
            const range = part.refNodes?.__meta?.range || [0, 0, 0, 0];
            const refResult = extractRefNodes(part, part.nodes || {});

            if (!refResult.refNode || !refResult.backNode || !refResult.leftNode || !refResult.upNode) {
              problems.push({
                source: 'RefNodes',
                severity: options.strictReferences ? 'error' : 'warning',
                message: `Incomplete "refNodes" declaration in part "${partName}". Must define ref, back, left, and up reference nodes.`,
                line: range[0] + 1,
                column: range[1] + 1,
                endLine: range[2] + 1,
                endColumn: range[3] + 1,
                range
              });
            } else {
              const nodeRoles = [
                { id: refResult.refNode, label: 'ref' },
                { id: refResult.backNode, label: 'back' },
                { id: refResult.leftNode, label: 'left' },
                { id: refResult.upNode, label: 'up' }
              ];

              for (const { id: nid, label } of nodeRoles) {
                if (!declaredNodeIds.has(nid)) {
                  const externalPart = nodeToPartMap[nid] ||
                    (assembledNodes && typeof assembledNodes === 'object' && (assembledNodes[nid]?.partOrigin || (assembledNodes.has && assembledNodes.has(nid) ? 'assembly' : null)));
                  if (!externalPart) {
                    problems.push({
                      source: 'RefNodes',
                      severity: options.strictReferences ? 'error' : 'warning',
                      message: `Reference node (${label}) references non-existent node "${nid}" in part "${partName}"`,
                      line: range[0] + 1,
                      column: range[1] + 1,
                      endLine: range[2] + 1,
                      endColumn: range[3] + 1,
                      range
                    });
                  }
                }
              }

              const ids = [refResult.refNode, refResult.backNode, refResult.leftNode, refResult.upNode];
              const uniqueIds = new Set(ids);
              if (uniqueIds.size < 4) {
                problems.push({
                  source: 'RefNodes',
                  severity: options.strictReferences ? 'error' : 'warning',
                  message: `Duplicate or coincident nodes in "refNodes" [ref: "${refResult.refNode}", back: "${refResult.backNode}", left: "${refResult.leftNode}", up: "${refResult.upNode}"]. Vehicle origin triad requires 4 distinct non-coincident nodes.`,
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

        // --- 3j. CamerasInternal Validation ---
        if (part.camerasInternal || part.cameraInternal) {
          const rawCams = part.camerasInternal || part.cameraInternal;
          const range = rawCams?.__meta?.range || [0, 0, 0, 0];
          const cams = extractCamerasInternal(part, part.nodes || {});

          for (const cam of cams) {
            if (cam.fov <= 0 || cam.fov > 175) {
              problems.push({
                source: 'CamerasInternal',
                severity: 'warning',
                message: `Camera "${cam.type}" has unusual FOV (${cam.fov}°). BeamNG internal cockpit cameras typically use 45° to 90°.`,
                line: range[0] + 1,
                column: range[1] + 1,
                endLine: range[2] + 1,
                endColumn: range[3] + 1,
                range
              });
            }

            for (const aid of cam.anchorIds) {
              if (!declaredNodeIds.has(aid)) {
                const externalPart = nodeToPartMap[aid] ||
                  (assembledNodes && typeof assembledNodes === 'object' && (assembledNodes[aid]?.partOrigin || (assembledNodes.has && assembledNodes.has(aid) ? 'assembly' : null)));
                if (!externalPart) {
                  problems.push({
                    source: 'CamerasInternal',
                    severity: options.strictReferences ? 'error' : 'warning',
                    message: `Camera "${cam.type}" anchor references non-existent node "${aid}" in part "${partName}"`,
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

        // --- 3k. Crash Zones (BreakGroup & DeformGroup) Validation ---
        if (part.beams) {
          const crashZones = extractCrashZones({ [partName]: part });

          for (const [bgName, bgData] of Object.entries(crashZones.breakGroups)) {
            if (bgData.beams.length === 1) {
              const b = bgData.beams[0];
              const range = b.lineRange || part.beams?.__meta?.range || [0, 0, 0, 0];
              problems.push({
                source: 'CrashZones',
                severity: 'info',
                message: `BreakGroup "${bgName}" contains only 1 beam. Single-beam breakgroups easily detach unintentionally from minor road vibrations.`,
                line: range[0] + 1,
                column: range[1] + 1,
                endLine: range[2] + 1,
                endColumn: range[3] + 1,
                range
              });
            }
          }

          if (part.flexbodies) {
            const rawFlex = part.flexbodies;
            const flexList = Array.isArray(rawFlex) ? rawFlex : Object.values(rawFlex);
            for (const fb of flexList) {
              if (!fb) continue;
              const rawDeform = fb.deformGroup || fb['deformGroup:'] || (Array.isArray(fb) ? (fb[6] || fb[4]) : null);
              const deformList = normalizeGroupList(rawDeform);
              const fbRange = fb.__meta?.range || part.flexbodies?.__meta?.range || [0, 0, 0, 0];
              for (const dg of deformList) {
                if (!crashZones.deformGroups[dg] || crashZones.deformGroups[dg].beams.length === 0) {
                  problems.push({
                    source: 'CrashZones',
                    severity: 'warning',
                    message: `Flexbody mesh references deformGroup "${dg}", but no beams in part "${partName}" are assigned to this deformGroup.`,
                    line: fbRange[0] + 1,
                    column: fbRange[1] + 1,
                    endLine: fbRange[2] + 1,
                    endColumn: fbRange[3] + 1,
                    range: fbRange
                  });
                }
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

