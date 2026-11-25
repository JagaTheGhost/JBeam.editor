/**
 * Suspension Physics Parser for BeamNG JBeam
 * Parses torsionbars (swaybars/anti-roll bars), rails, slidenodes,
 * and calculates suspension kinematics (camber, toe, travel sweep).
 */

/**
 * Extracts all torsionbars from a parsed part or parts dictionary.
 * Supports both processed object format and raw table array format.
 *
 * JBeam schema:
 * "torsionbars": [
 *   ["id1:", "id2:", "id3:", "id4:"],
 *   {"spring": 1500, "damp": 10, "deform": 10000, "strength": 50000},
 *   ["arbr2r", "arbr1r", "arbr1l", "arbr2l", {"vkTag":"arb_R"}]
 * ]
 *
 * @param {object} partsDictOrPart - Processed parts dictionary or single part
 * @returns {Array<object>} Array of normalized torsion bar objects
 */
export function extractTorsionBars(partsDictOrPart) {
  if (!partsDictOrPart || typeof partsDictOrPart !== 'object') return [];

  const results = [];
  const parts = partsDictOrPart.torsionbars !== undefined
    ? { _single: partsDictOrPart }
    : partsDictOrPart;

  for (const [partKey, part] of Object.entries(parts)) {
    if (partKey === '__meta' || !part || typeof part !== 'object') continue;

    const rawTorsionBars = part.torsionbars;
    if (!rawTorsionBars) continue;

    // Case 1: Processed object array or dictionary (post-tableSchema)
    if (Array.isArray(rawTorsionBars)) {
      let activeOptions = {
        spring: 100000,
        damp: 10,
        deform: 10000,
        strength: 50000,
        breakGroup: null,
        name: null
      };

      let headerIndices = null;

      for (let i = 0; i < rawTorsionBars.length; i++) {
        const row = rawTorsionBars[i];
        if (!row) continue;

        // Header detection
        if (Array.isArray(row) && row.length >= 4 && typeof row[0] === 'string' && row[0].includes('id1')) {
          headerIndices = {};
          row.forEach((col, idx) => {
            const cleanCol = String(col).replace(/:/g, '').trim();
            headerIndices[cleanCol] = idx;
          });
          continue;
        }

        // Inline property modifier dictionary
        if (typeof row === 'object' && !Array.isArray(row)) {
          if (row.id1 !== undefined && row.id2 !== undefined && row.id3 !== undefined && row.id4 !== undefined) {
            // Already parsed as an object row
            results.push({
              id1: String(row.id1),
              id2: String(row.id2),
              id3: String(row.id3),
              id4: String(row.id4),
              spring: row.spring !== undefined ? Number(row.spring) : activeOptions.spring,
              damp: row.damp !== undefined ? Number(row.damp) : activeOptions.damp,
              deform: row.deform !== undefined ? (typeof row.deform === 'string' ? row.deform : Number(row.deform)) : activeOptions.deform,
              strength: row.strength !== undefined ? (typeof row.strength === 'string' ? row.strength : Number(row.strength)) : activeOptions.strength,
              name: row.name || activeOptions.name || `tb_${partKey}_${i}`,
              breakGroup: row.breakGroup || activeOptions.breakGroup || null,
              partOrigin: partKey === '_single' ? (part.name || 'active_part') : partKey,
              lineRange: row.__meta?.range || part.torsionbars?.__meta?.range || null,
              rawRowIndex: i
            });
            continue;
          }

          // Options dictionary updating active options
          activeOptions = {
            ...activeOptions,
            spring: row.spring !== undefined ? Number(row.spring) : activeOptions.spring,
            damp: row.damp !== undefined ? Number(row.damp) : activeOptions.damp,
            deform: row.deform !== undefined ? row.deform : activeOptions.deform,
            strength: row.strength !== undefined ? row.strength : activeOptions.strength,
            breakGroup: row.breakGroup !== undefined ? row.breakGroup : activeOptions.breakGroup,
            name: row.name !== undefined ? row.name : activeOptions.name
          };
          continue;
        }

        // Array row format
        if (Array.isArray(row) && row.length >= 4) {
          const id1Idx = headerIndices?.id1 ?? 0;
          const id2Idx = headerIndices?.id2 ?? 1;
          const id3Idx = headerIndices?.id3 ?? 2;
          const id4Idx = headerIndices?.id4 ?? 3;

          const id1 = String(row[id1Idx] || '').trim();
          const id2 = String(row[id2Idx] || '').trim();
          const id3 = String(row[id3Idx] || '').trim();
          const id4 = String(row[id4Idx] || '').trim();

          if (!id1 || !id2 || !id3 || !id4) continue;

          // Check if last element is an inline options dict
          const lastEl = row[row.length - 1];
          const inlineOpts = (typeof lastEl === 'object' && !Array.isArray(lastEl)) ? lastEl : {};

          results.push({
            id1,
            id2,
            id3,
            id4,
            spring: inlineOpts.spring !== undefined ? Number(inlineOpts.spring) : activeOptions.spring,
            damp: inlineOpts.damp !== undefined ? Number(inlineOpts.damp) : activeOptions.damp,
            deform: inlineOpts.deform !== undefined ? inlineOpts.deform : activeOptions.deform,
            strength: inlineOpts.strength !== undefined ? inlineOpts.strength : activeOptions.strength,
            name: inlineOpts.name || activeOptions.name || `tb_${partKey}_${i}`,
            breakGroup: inlineOpts.breakGroup || activeOptions.breakGroup || null,
            partOrigin: partKey === '_single' ? (part.name || 'active_part') : partKey,
            lineRange: row.__meta?.range || null,
            rawRowIndex: i
          });
        }
      }
    } else if (typeof rawTorsionBars === 'object') {
      // Keyed object dictionary
      for (const [tbKey, tbObj] of Object.entries(rawTorsionBars)) {
        if (tbKey === '__meta' || !tbObj || typeof tbObj !== 'object') continue;
        const id1 = tbObj.id1 || tbObj['id1:'];
        const id2 = tbObj.id2 || tbObj['id2:'];
        const id3 = tbObj.id3 || tbObj['id3:'];
        const id4 = tbObj.id4 || tbObj['id4:'];
        if (id1 && id2 && id3 && id4) {
          results.push({
            id1: String(id1),
            id2: String(id2),
            id3: String(id3),
            id4: String(id4),
            spring: tbObj.spring !== undefined ? Number(tbObj.spring) : 100000,
            damp: tbObj.damp !== undefined ? Number(tbObj.damp) : 10,
            deform: tbObj.deform ?? 10000,
            strength: tbObj.strength ?? 50000,
            name: tbObj.name || tbKey,
            breakGroup: tbObj.breakGroup || null,
            partOrigin: partKey === '_single' ? (part.name || 'active_part') : partKey,
            lineRange: tbObj.__meta?.range || null,
            rawKey: tbKey
          });
        }
      }
    }
  }

  return results;
}

/**
 * Extracts rails and slidenodes from a part or parts dictionary.
 *
 * Rails format:
 * "rails": {
 *   "steeringrack": {"links:": ["fh6r", "fh6l"], "broken:": [], "looped": false, "capped": true}
 * }
 * Or array format:
 * "rails": [
 *   ["name:", "links:", "looped:", "capped:"],
 *   ["steeringrack", ["fh6r", "fh6l"], false, true]
 * ]
 *
 * Slidenodes format:
 * "slidenodes": [
 *   ["id:", "railName", "attached", "fixToRail", "tolerance", "spring", "strength", "capStrength"],
 *   ["fx5r", "steeringrack", true, true, 0.0, 14001000, "FLT_MAX", "FLT_MAX"]
 * ]
 *
 * @param {object} partsDictOrPart - Processed parts dictionary or single part
 * @returns {{ rails: Record<string, object>, slideNodes: Array<object> }}
 */
export function extractRailsAndSlideNodes(partsDictOrPart) {
  if (!partsDictOrPart || typeof partsDictOrPart !== 'object') {
    return { rails: {}, slideNodes: [] };
  }

  const rails = {};
  const slideNodes = [];
  const parts = (partsDictOrPart.rails !== undefined || partsDictOrPart.slidenodes !== undefined)
    ? { _single: partsDictOrPart }
    : partsDictOrPart;

  for (const [partKey, part] of Object.entries(parts)) {
    if (partKey === '__meta' || !part || typeof part !== 'object') continue;

    // --- 1. Parse Rails ---
    const rawRails = part.rails;
    if (rawRails) {
      if (typeof rawRails === 'object' && !Array.isArray(rawRails)) {
        for (const [railName, railDef] of Object.entries(rawRails)) {
          if (railName === '__meta' || !railDef || typeof railDef !== 'object') continue;
          const links = railDef['links:'] || railDef.links || [];
          rails[railName] = {
            name: railName,
            links: Array.isArray(links) ? links.map(String) : [],
            looped: Boolean(railDef.looped),
            capped: railDef.capped !== undefined ? Boolean(railDef.capped) : true,
            partOrigin: partKey === '_single' ? (part.name || 'active_part') : partKey,
            lineRange: railDef.__meta?.range || null
          };
        }
      } else if (Array.isArray(rawRails)) {
        let headerMap = null;
        for (let i = 0; i < rawRails.length; i++) {
          const row = rawRails[i];
          if (!row) continue;
          if (Array.isArray(row) && row.length >= 2 && typeof row[0] === 'string' && row[0].includes('name')) {
            headerMap = {};
            row.forEach((col, idx) => {
              const clean = String(col).replace(/:/g, '').trim();
              headerMap[clean] = idx;
            });
            continue;
          }
          if (Array.isArray(row) && row.length >= 2) {
            const nameIdx = headerMap?.name ?? 0;
            const linksIdx = headerMap?.links ?? 1;
            const railName = String(row[nameIdx] || '').trim();
            const links = row[linksIdx];
            if (railName && Array.isArray(links)) {
              rails[railName] = {
                name: railName,
                links: links.map(String),
                looped: Boolean(row[2]),
                capped: row[3] !== undefined ? Boolean(row[3]) : true,
                partOrigin: partKey === '_single' ? (part.name || 'active_part') : partKey,
                lineRange: row.__meta?.range || null
              };
            }
          }
        }
      }
    }

    // --- 2. Parse SlideNodes ---
    const rawSlideNodes = part.slidenodes;
    if (rawSlideNodes) {
      if (Array.isArray(rawSlideNodes)) {
        let activeOptions = {
          attached: true,
          fixToRail: false,
          tolerance: 0.0,
          spring: 500000,
          strength: 'FLT_MAX',
          capStrength: 'FLT_MAX'
        };

        let headerIndices = null;

        for (let i = 0; i < rawSlideNodes.length; i++) {
          const row = rawSlideNodes[i];
          if (!row) continue;

          // Header detection
          if (Array.isArray(row) && row.length >= 2 && typeof row[0] === 'string' && row[0].includes('id')) {
            headerIndices = {};
            row.forEach((col, idx) => {
              const clean = String(col).replace(/:/g, '').trim();
              headerIndices[clean] = idx;
            });
            continue;
          }

          // Inline options dictionary
          if (typeof row === 'object' && !Array.isArray(row)) {
            const id = row.id || row['id:'];
            const railName = row.railName || row['railName:'] || row.rail || row['rail:'];
            if (id !== undefined && railName !== undefined) {
              slideNodes.push({
                id: String(id),
                railName: String(railName),
                attached: row.attached !== undefined ? Boolean(row.attached) : activeOptions.attached,
                fixToRail: row.fixToRail !== undefined ? Boolean(row.fixToRail) : activeOptions.fixToRail,
                tolerance: Number(row.tolerance) || 0.0,
                spring: row.spring !== undefined ? Number(row.spring) : activeOptions.spring,
                strength: row.strength !== undefined ? row.strength : activeOptions.strength,
                capStrength: row.capStrength !== undefined ? row.capStrength : activeOptions.capStrength,
                partOrigin: partKey === '_single' ? (part.name || 'active_part') : partKey,
                lineRange: row.__meta?.range || null,
                rawIndex: i
              });
              continue;
            }

            activeOptions = {
              ...activeOptions,
              attached: row.attached !== undefined ? Boolean(row.attached) : activeOptions.attached,
              fixToRail: row.fixToRail !== undefined ? Boolean(row.fixToRail) : activeOptions.fixToRail,
              tolerance: row.tolerance !== undefined ? Number(row.tolerance) : activeOptions.tolerance,
              spring: row.spring !== undefined ? Number(row.spring) : activeOptions.spring,
              strength: row.strength !== undefined ? row.strength : activeOptions.strength,
              capStrength: row.capStrength !== undefined ? row.capStrength : activeOptions.capStrength
            };
            continue;
          }

          // Array format
          if (Array.isArray(row) && row.length >= 2) {
            const idIdx = headerIndices?.id ?? 0;
            const railIdx = headerIndices?.railName ?? headerIndices?.rail ?? 1;

            const id = String(row[idIdx] || '').trim();
            const railName = String(row[railIdx] || '').trim();

            if (!id || !railName) continue;

            const lastEl = row[row.length - 1];
            const inlineOpts = (typeof lastEl === 'object' && !Array.isArray(lastEl)) ? lastEl : {};

            slideNodes.push({
              id,
              railName,
              attached: inlineOpts.attached !== undefined ? Boolean(inlineOpts.attached) : (row[2] !== undefined ? Boolean(row[2]) : activeOptions.attached),
              fixToRail: inlineOpts.fixToRail !== undefined ? Boolean(inlineOpts.fixToRail) : (row[3] !== undefined ? Boolean(row[3]) : activeOptions.fixToRail),
              tolerance: inlineOpts.tolerance !== undefined ? Number(inlineOpts.tolerance) : (row[4] !== undefined ? Number(row[4]) : activeOptions.tolerance),
              spring: inlineOpts.spring !== undefined ? Number(inlineOpts.spring) : (row[5] !== undefined ? Number(row[5]) : activeOptions.spring),
              strength: inlineOpts.strength !== undefined ? inlineOpts.strength : (row[6] !== undefined ? row[6] : activeOptions.strength),
              capStrength: inlineOpts.capStrength !== undefined ? inlineOpts.capStrength : (row[7] !== undefined ? row[7] : activeOptions.capStrength),
              partOrigin: partKey === '_single' ? (part.name || 'active_part') : partKey,
              lineRange: row.__meta?.range || null,
              rawIndex: i
            });
          }
        }
      } else if (typeof rawSlideNodes === 'object') {
        for (const [snKey, snObj] of Object.entries(rawSlideNodes)) {
          if (snKey === '__meta' || !snObj || typeof snObj !== 'object') continue;
          const id = snObj.id || snObj['id:'];
          const railName = snObj.railName || snObj['railName:'] || snObj.rail || snObj['rail:'];
          if (id && railName) {
            slideNodes.push({
              id: String(id),
              railName: String(railName),
              attached: snObj.attached !== undefined ? Boolean(snObj.attached) : true,
              fixToRail: snObj.fixToRail !== undefined ? Boolean(snObj.fixToRail) : false,
              tolerance: Number(snObj.tolerance) || 0.0,
              spring: snObj.spring !== undefined ? Number(snObj.spring) : 500000,
              strength: snObj.strength !== undefined ? snObj.strength : 'FLT_MAX',
              capStrength: snObj.capStrength !== undefined ? snObj.capStrength : 'FLT_MAX',
              partOrigin: partKey === '_single' ? (part.name || 'active_part') : partKey,
              lineRange: snObj.__meta?.range || null,
              rawKey: snKey
            });
          }
        }
      }
    }
  }

  return { rails, slideNodes };
}
