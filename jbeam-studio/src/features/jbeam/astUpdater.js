/*
  Lossless AST Document Updater for Two-Way JBeam Synchronization
  Adapted from BeamNG vscode-jbeam-editor dataUpdater.js
  Replaces only the exact numeric coordinate strings in the document,
  preserving 100% of indentation, formatting, comments, and other sections.
*/

import { decodeWithMeta, getMetaForCurBundle } from './sjsonParser.js';
import { getSymmetricNodeId, getSymmetricCoordinates } from './symmetryUtils.js';

/**
 * Replaces a slice of text in a multi-line string given 0-based [startLine, startCol, endLine, endCol]
 */
export function replaceRangeInText(text, range, newText) {
  const lines = text.split('\n');
  const [startLine, startCol, endLine, endCol] = range;

  if (startLine >= lines.length) return text;

  if (startLine === endLine) {
    const line = lines[startLine];
    const before = line.slice(0, startCol);
    const after = line.slice(endCol);
    lines[startLine] = before + newText + after;
  } else {
    const firstLine = lines[startLine].slice(0, startCol);
    const lastLine = lines[endLine].slice(endCol);
    lines.splice(startLine, endLine - startLine + 1, firstLine + newText + lastLine);
  }

  return lines.join('\n');
}

/**
 * Appends or combines an offset translation with an existing JBeam Lua expression string.
 * Example: "$=$track_width / 2" + 0.05 => "$=($track_width / 2) + 0.05"
 */
export function addOffsetToExpr(expr, delta) {
  if (typeof expr !== 'string' || Math.abs(delta) < 0.0001) return expr;
  const formatDelta = (num) => {
    const formatted = Number(Math.abs(num)).toFixed(4);
    return formatted.replace(/\.?0+$/, '');
  };

  const deltaStr = delta >= 0 ? ` + ${formatDelta(delta)}` : ` - ${formatDelta(delta)}`;
  const isQuoted = (expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"));
  const inner = isQuoted ? expr.slice(1, -1) : expr;

  if (inner.startsWith('$=')) {
    const body = inner.slice(2).trim();
    if (body.startsWith('(') && body.endsWith(')')) {
      const res = `$=(${body.slice(1, -1)})${deltaStr}`;
      return isQuoted ? JSON.stringify(res) : res;
    }
    const res = `$=(${body})${deltaStr}`;
    return isQuoted ? JSON.stringify(res) : res;
  }
  const res = `$=(${inner})${deltaStr}`;
  return isQuoted ? JSON.stringify(res) : res;
}

/**
 * Updates node coordinates in the source text losslessly.
 *
 * If the node has inherited assembly offsets (totalOffset from nodeOffset / nodeMove),
 * they are automatically subtracted so local part space coordinates are safely preserved.
 *
 * If a coordinate was defined via a "$=" expression, the offset is appended to the formula.
 *
 * @param {string} sourceText - Original JBeam file text
 * @param {Array<Object>} updatedNodes - Array of nodes with updated pos: [x, y, z] and __meta.range
 * @returns {{ updatedText: string, modifiedCount: number, error: string | null }}
 */
export function updateNodeCoordinatesLossless(sourceText, updatedNodes) {
  if (!sourceText || !Array.isArray(updatedNodes) || updatedNodes.length === 0) {
    return { updatedText: sourceText, modifiedCount: 0, error: null };
  }

  let dataBundle;
  try {
    dataBundle = decodeWithMeta(sourceText, 'document.jbeam', true);
  } catch (err) {
    return { updatedText: sourceText, modifiedCount: 0, error: `Cannot parse AST for update: ${err.message}` };
  }

  // Collect individual replacement operations: { range: [startLine, startCol, endLine, endCol], value: string }
  const replacements = [];
  const appliedIndices = new Set();

  for (const node of updatedNodes) {
    if (!node || !Array.isArray(node.pos)) {
      continue;
    }

    const documentId = node.__meta?.unresolved
      ? (node.__meta.unresolved['0'] ?? node.id)
      : (node.id || node.name);

    if (!documentId) continue;

    const matchedStartIndices = [];

    // 1. Primary lookup: via __meta.range and getMetaForCurBundle
    if (node.__meta && Array.isArray(node.__meta.range)) {
      const [nodeStartLine, nodeStartCol] = node.__meta.range;
      const metaDataStack = getMetaForCurBundle(dataBundle, nodeStartLine, nodeStartCol);
      if (metaDataStack && metaDataStack.length > 0) {
        const candidate = metaDataStack[0];
        if (candidate && candidate.id !== undefined && dataBundle.metaData[candidate.id]) {
          if (!candidate.obj || candidate.obj[0] === undefined || candidate.obj[0] === documentId || candidate.obj['0'] === documentId) {
            matchedStartIndices.push(candidate.id);
          }
        }
      }
    }

    // 2. Resilient Fallback / Multi-part expansion:
    // If not found via meta range or if node has no specific meta range, find occurrences across parts
    if (matchedStartIndices.length === 0) {
      const parts = dataBundle.data || {};
      const targetParts = node.partName && parts[node.partName]
        ? [node.partName]
        : Object.keys(parts).filter(k => k !== '__meta');

      for (const pKey of targetParts) {
        const p = parts[pKey];
        if (p?.nodes) {
          const nodesObj = p.nodes;
          const keys = Object.keys(nodesObj);
          for (const k of keys) {
            if (k === '__meta') continue;
            const row = nodesObj[k];
            if (row && (row[0] === documentId || row['0'] === documentId)) {
              if (row.__meta?.id !== undefined && dataBundle.metaData[row.__meta.id]) {
                matchedStartIndices.push(row.__meta.id);
              }
            }
          }
        }
      }
    }

    for (const startIdx of matchedStartIndices) {
      if (appliedIndices.has(startIdx)) continue;
      appliedIndices.add(startIdx);

      // Check if X, Y, Z tokens exist in AST metadata
      const posXMeta = dataBundle.metaData[startIdx + 2];
      const posYMeta = dataBundle.metaData[startIdx + 3];
      const posZMeta = dataBundle.metaData[startIdx + 4];

      if (!posXMeta || !posYMeta || !posZMeta) {
        continue;
      }

      // Format new positions to clean 4 decimal places
      const formatCoord = (num) => {
        const formatted = Number(num).toFixed(4);
        // Strip trailing zeros after dot if clean
        return formatted.replace(/\.?0+$/, '');
      };

      // If node has totalOffset applied (from nodeOffset/nodeMove in assembly), un-apply it
      let targetX = Number(node.pos[0]);
      let targetY = Number(node.pos[1]);
      let targetZ = Number(node.pos[2]);

      if (Array.isArray(node.totalOffset)) {
        targetX -= (Number(node.totalOffset[0]) || 0);
        targetY -= (Number(node.totalOffset[1]) || 0);
        targetZ -= (Number(node.totalOffset[2]) || 0);
      }

      const metas = [posXMeta, posYMeta, posZMeta];
      const targets = [targetX, targetY, targetZ];
      const initPoss = [node.posX, node.posY, node.posZ];

      for (let axis = 0; axis < 3; axis++) {
        const meta = metas[axis];
        const targetVal = targets[axis];
        const origVal = meta.value;

        if (typeof origVal === 'string' && origVal.startsWith('$=')) {
          // Evaluate delta and append offset to expression
          const initialVal = initPoss[axis] !== undefined ? Number(initPoss[axis]) : targetVal;
          const delta = targetVal - initialVal;
          if (Math.abs(delta) > 0.0001) {
            const newExpr = addOffsetToExpr(origVal, delta);
            replacements.push({ range: meta.range, value: newExpr });
          }
        } else if (typeof origVal !== 'string') {
          const newStr = formatCoord(targetVal);
          replacements.push({ range: meta.range, value: newStr });
        }
      }
    }
  }

  if (replacements.length === 0) {
    return { updatedText: sourceText, modifiedCount: 0, error: null };
  }

  // Sort replacements descending: highest line first, then highest column first
  // This guarantees that earlier lines/columns are never invalidated or shifted!
  replacements.sort((a, b) => {
    const endRowA = a.range[2];
    const endRowB = b.range[2];
    if (endRowA !== endRowB) {
      return endRowB - endRowA;
    }
    const endColA = a.range[3];
    const endColB = b.range[3];
    return endColB - endColA;
  });

  let currentText = sourceText;
  for (const rep of replacements) {
    currentText = replaceRangeInText(currentText, rep.range, rep.value);
  }

  return {
    updatedText: currentText,
    modifiedCount: Math.floor(replacements.length / 3),
    error: null
  };
}

/**
 * Inserts one or more formatted row strings into a section of a given part.
 * If the section exists, appends rows before the closing bracket.
 * If the section does not exist, creates the section before the closing brace of the part.
 */
export function insertRowsIntoSectionLossless(sourceText, partName, sectionName, rowStrings, defaultHeader = null) {
  if (!sourceText || !rowStrings || rowStrings.length === 0) {
    return { updatedText: sourceText, error: null };
  }

  let dataBundle;
  try {
    dataBundle = decodeWithMeta(sourceText, 'document.jbeam', false);
  } catch (err) {
    return { updatedText: sourceText, error: `Parse error: ${err.message}` };
  }

  const parts = dataBundle.data;
  let targetPartName = partName;
  if (!parts[targetPartName]) {
    const validKeys = Object.keys(parts).filter(k => k !== '__meta');
    if (validKeys.length > 0) targetPartName = validKeys[0];
    else return { updatedText: sourceText, error: `Part '${partName}' not found` };
  }

  const part = parts[targetPartName];
  const lines = sourceText.split('\n');

  if (part[sectionName] && part[sectionName].__meta?.range) {
    const sectionRange = part[sectionName].__meta.range;
    const endLine = sectionRange[2];
    const closingLine = lines[endLine];
    const indentMatch = closingLine.match(/^(\s*)/);
    const baseIndent = indentMatch ? indentMatch[1] : '    ';
    const rowIndent = baseIndent + '  ';

    // Ensure previous non-empty line has trailing comma
    let prevLineIdx = endLine - 1;
    while (prevLineIdx >= 0 && lines[prevLineIdx].trim() === '') {
      prevLineIdx--;
    }
    if (prevLineIdx >= 0) {
      const prevLineTrimmed = lines[prevLineIdx].trimEnd();
      if (!prevLineTrimmed.endsWith(',') && !prevLineTrimmed.endsWith('[')) {
        lines[prevLineIdx] = prevLineTrimmed + ',';
      }
    }

    const formattedRows = rowStrings.map(r => `${rowIndent}${r.trim()},`);
    lines.splice(endLine, 0, ...formattedRows);

    return { updatedText: lines.join('\n'), error: null };
  } else if (part.__meta?.range) {
    // Section doesn't exist yet: insert before closing brace of the part
    const partRange = part.__meta.range;
    const endLine = partRange[2];
    const closingLine = lines[endLine];
    const indentMatch = closingLine.match(/^(\s*)/);
    const baseIndent = indentMatch ? indentMatch[1] : '  ';
    const secIndent = baseIndent + '  ';
    const rowIndent = secIndent + '  ';

    // Ensure preceding line has trailing comma
    let prevLineIdx = endLine - 1;
    while (prevLineIdx >= 0 && lines[prevLineIdx].trim() === '') {
      prevLineIdx--;
    }
    if (prevLineIdx >= 0) {
      const prevLineTrimmed = lines[prevLineIdx].trimEnd();
      if (!prevLineTrimmed.endsWith(',') && !prevLineTrimmed.endsWith('{')) {
        lines[prevLineIdx] = prevLineTrimmed + ',';
      }
    }

    const newSectionLines = [
      `${secIndent}"${sectionName}": [`,
      ...(defaultHeader ? [`${rowIndent}${defaultHeader},`] : []),
      ...rowStrings.map(r => `${rowIndent}${r.trim()},`),
      `${secIndent}],`
    ];

    lines.splice(endLine, 0, ...newSectionLines);
    return { updatedText: lines.join('\n'), error: null };
  }

  return { updatedText: sourceText, error: 'Could not locate insertion point in AST' };
}

/**
 * Removes rows from a given section that match a predicate function.
 */
export function deleteRowFromSectionLossless(sourceText, partName, sectionName, predicate) {
  if (!sourceText) return { updatedText: sourceText, deletedCount: 0, error: null };

  let dataBundle;
  try {
    dataBundle = decodeWithMeta(sourceText, 'document.jbeam', false);
  } catch (err) {
    return { updatedText: sourceText, deletedCount: 0, error: `Parse error: ${err.message}` };
  }

  const parts = dataBundle.data;
  let targetPartName = partName;
  if (!parts[targetPartName]) {
    const validKeys = Object.keys(parts).filter(k => k !== '__meta');
    if (validKeys.length > 0) targetPartName = validKeys[0];
    else return { updatedText: sourceText, deletedCount: 0, error: `Part '${partName}' not found` };
  }

  const part = parts[targetPartName];
  if (!part[sectionName]) return { updatedText: sourceText, deletedCount: 0, error: `Section '${sectionName}' not found` };

  const section = part[sectionName];
  const rows = [];
  const keys = Object.keys(section).filter(k => k !== '__meta');
  for (const k of keys) {
    rows.push(section[k]);
  }

  const matchedRanges = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row && row.__meta?.range && predicate(row, i)) {
      matchedRanges.push(row.__meta.range);
    }
  }

  if (matchedRanges.length === 0) {
    return { updatedText: sourceText, deletedCount: 0, error: null };
  }

  // Sort descending so deletion doesn't shift earlier line indices
  matchedRanges.sort((a, b) => b[0] - a[0]);

  const lines = sourceText.split('\n');
  for (const range of matchedRanges) {
    const [startLine, , endLine] = range;
    lines.splice(startLine, endLine - startLine + 1);
  }

  return { updatedText: lines.join('\n'), deletedCount: matchedRanges.length, error: null };
}

const formatNum = (num) => {
  const formatted = Number(num).toFixed(4);
  return formatted.replace(/\.?0+$/, '');
};

/**
 * Adds a node (and optionally its mirrored counterpart) to the active part losslessly.
 */
export function addNodeLossless(sourceText, partName, { id, pos }, symmetry = false) {
  if (!id || !Array.isArray(pos)) return { updatedText: sourceText, error: 'Invalid node parameters' };

  const rowStrings = [];
  const x = Number(pos[0]) || 0;
  const y = Number(pos[1]) || 0;
  const z = Number(pos[2]) || 0;

  // Primary node
  rowStrings.push(`["${id}", ${formatNum(x)}, ${formatNum(y)}, ${formatNum(z)}]`);

  // Symmetric counterpart if enabled and not strictly centered
  if (symmetry && Math.abs(x) > 0.005) {
    let symId = getSymmetricNodeId(id);
    if (!symId) {
      if (id.endsWith('r') || id.endsWith('R')) symId = getSymmetricNodeId(id);
      else symId = id + '_l';
    }
    if (symId && symId !== id) {
      const symCoords = getSymmetricCoordinates([x, y, z]);
      rowStrings.push(`["${symId}", ${formatNum(symCoords[0])}, ${formatNum(symCoords[1])}, ${formatNum(symCoords[2])}]`);
    }
  }

  return insertRowsIntoSectionLossless(
    sourceText,
    partName,
    'nodes',
    rowStrings,
    '["id", "posX", "posY", "posZ"]'
  );
}

/**
 * Adds a beam (and optionally its mirrored counterpart) to the active part losslessly.
 * Supports cross-part mounting links (with BeamNG {"optional": true} and breakGroup).
 */
export function addBeamLossless(sourceText, partName, { id1, id2, properties = {}, isCrossPart = false, breakGroup = null }, symmetry = false) {
  if (!id1 || !id2 || id1 === id2) return { updatedText: sourceText, error: 'Invalid beam endpoints' };

  const rowStrings = [];
  const beamProps = { ...properties };

  if (isCrossPart) {
    beamProps.optional = true;
    if (breakGroup || !beamProps.breakGroup) {
      beamProps.breakGroup = breakGroup || `${partName}_mount`;
    }
  }

  // If specific properties are provided (e.g. beamSpring, optional), add an option header object
  if (beamProps && Object.keys(beamProps).length > 0) {
    rowStrings.push(JSON.stringify(beamProps));
  }

  rowStrings.push(`["${id1}", "${id2}"]`);

  if (symmetry) {
    const sym1 = getSymmetricNodeId(id1) || id1;
    const sym2 = getSymmetricNodeId(id2) || id2;

    // Only add if not identical to the primary beam and not already reversed
    if ((sym1 !== id1 || sym2 !== id2) && !(sym1 === id2 && sym2 === id1)) {
      rowStrings.push(`["${sym1}", "${sym2}"]`);
    }
  }

  // If cross-part options were set at header level, reset optional & breakGroup to prevent leaking to subsequent beams
  if (isCrossPart) {
    rowStrings.push(JSON.stringify({ optional: false, breakGroup: "" }));
  }

  return insertRowsIntoSectionLossless(
    sourceText,
    partName,
    'beams',
    rowStrings,
    '["id1:", "id2:"]'
  );
}

/**
 * Adds a triangle (and optionally its mirrored counterpart with inverted winding) losslessly.
 */
export function addTriangleLossless(sourceText, partName, { id1, id2, id3, properties = {} }, symmetry = false) {
  if (!id1 || !id2 || !id3) return { updatedText: sourceText, error: 'Invalid triangle vertices' };

  const rowStrings = [];
  if (properties && Object.keys(properties).length > 0) {
    rowStrings.push(JSON.stringify(properties));
  }

  rowStrings.push(`["${id1}", "${id2}", "${id3}"]`);

  if (symmetry) {
    const sym1 = getSymmetricNodeId(id1) || id1;
    const sym2 = getSymmetricNodeId(id2) || id2;
    const sym3 = getSymmetricNodeId(id3) || id3;

    if (sym1 !== id1 || sym2 !== id2 || sym3 !== id3) {
      // Invert winding order (swap vertices 2 & 3) to ensure outward-facing surface normal on mirrored side!
      rowStrings.push(`["${sym1}", "${sym3}", "${sym2}"]`);
    }
  }

  return insertRowsIntoSectionLossless(
    sourceText,
    partName,
    'triangles',
    rowStrings,
    '["id1:", "id2:", "id3:"]'
  );
}

/**
 * Deletes a node and optionally cascades to attached beams and triangles losslessly.
 */
export function deleteNodeLossless(sourceText, partName, nodeId, cascade = true) {
  if (!nodeId) return { updatedText: sourceText, deletedCount: 0, error: null };

  let currentText = sourceText;

  // 1. Delete node row
  const nodeRes = deleteRowFromSectionLossless(currentText, partName, 'nodes', (row) => row[0] === nodeId);
  if (nodeRes.error) return nodeRes;
  currentText = nodeRes.updatedText;

  // 2. Cascade delete attached beams, triangles, and quads if requested
  if (cascade) {
    const beamRes = deleteRowFromSectionLossless(currentText, partName, 'beams', (row) => row[0] === nodeId || row[1] === nodeId);
    if (!beamRes.error) currentText = beamRes.updatedText;

    const triRes = deleteRowFromSectionLossless(currentText, partName, 'triangles', (row) => row[0] === nodeId || row[1] === nodeId || row[2] === nodeId);
    if (!triRes.error) currentText = triRes.updatedText;

    const quadRes = deleteRowFromSectionLossless(currentText, partName, 'quads', (row) => row[0] === nodeId || row[1] === nodeId || row[2] === nodeId || row[3] === nodeId);
    if (!quadRes.error) currentText = quadRes.updatedText;
  }

  return { updatedText: currentText, error: null };
}

/**
 * Deletes a beam by endpoint nodes losslessly.
 */
export function deleteBeamLossless(sourceText, partName, id1, id2) {
  return deleteRowFromSectionLossless(sourceText, partName, 'beams', (row) =>
    (row[0] === id1 && row[1] === id2) || (row[0] === id2 && row[1] === id1)
  );
}

/**
 * Updates the beamType of a beam losslessly in the source JBeam.
 * Supports updating existing inline option objects or adding a new inline object.
 * Optionally mirrors to the symmetric counterpart beam.
 */
export function updateBeamTypeLossless(sourceText, partName, id1, id2, newBeamType, symmetry = false) {
  if (!sourceText || !id1 || !id2) return { updatedText: sourceText, error: 'Invalid parameters' };

  let currentText = sourceText;
  const normalizedType = newBeamType.startsWith('|') ? newBeamType : `|${newBeamType}`;

  const updateSingleBeam = (txt, targetId1, targetId2) => {
    let dataBundle;
    try {
      dataBundle = decodeWithMeta(txt, 'document.jbeam', false);
    } catch (err) {
      return { updatedText: txt, error: `Parse error: ${err.message}` };
    }

    const parts = dataBundle.data;
    let targetPartName = partName;
    if (!parts[targetPartName]) {
      const validKeys = Object.keys(parts).filter(k => k !== '__meta');
      if (validKeys.length > 0) targetPartName = validKeys[0];
      else return { updatedText: txt, error: `Part '${partName}' not found` };
    }

    const part = parts[targetPartName];
    const sectionName = (part.beams ? 'beams' : (part.hydros ? 'hydros' : null));
    if (!sectionName || !part[sectionName]) {
      return { updatedText: txt, error: `Section 'beams' not found in part '${targetPartName}'` };
    }

    const section = part[sectionName];
    const keys = Object.keys(section).filter(k => k !== '__meta');
    let matchedRow = null;

    for (const k of keys) {
      const row = section[k];
      if (Array.isArray(row) && row.__meta?.range) {
        if ((row[0] === targetId1 && row[1] === targetId2) || (row[0] === targetId2 && row[1] === targetId1)) {
          matchedRow = row;
          break;
        }
      }
    }

    if (!matchedRow) {
      return { updatedText: txt, error: `Beam '${targetId1}' ↔ '${targetId2}' not found` };
    }

    const [startLine, startCol, endLine, endCol] = matchedRow.__meta.range;
    const lines = txt.split('\n');

    let oldRowText = '';
    if (startLine === endLine) {
      oldRowText = lines[startLine].substring(startCol, endCol);
    } else {
      oldRowText = lines.slice(startLine, endLine + 1).join('\n');
    }

    const hasTrailingComma = oldRowText.trim().endsWith(',');
    const comma = hasTrailingComma ? ',' : '';

    let newRowText = '';
    if (matchedRow.length >= 3 && typeof matchedRow[2] === 'object' && matchedRow[2] !== null) {
      const opts = { ...matchedRow[2] };
      opts.beamType = normalizedType;
      delete opts.__meta;
      newRowText = `["${matchedRow[0]}", "${matchedRow[1]}", ${JSON.stringify(opts)}]${comma}`;
    } else {
      if (normalizedType === '|NORMAL') {
        newRowText = `["${matchedRow[0]}", "${matchedRow[1]}"]${comma}`;
      } else {
        newRowText = `["${matchedRow[0]}", "${matchedRow[1]}", {"beamType": "${normalizedType}"}]${comma}`;
      }
    }

    const updated = replaceRangeInText(txt, matchedRow.__meta.range, newRowText);
    return { updatedText: updated, error: null };
  };

  const res1 = updateSingleBeam(currentText, id1, id2);
  if (res1.error) return res1;
  currentText = res1.updatedText;

  const isSym = typeof symmetry === 'object' ? Boolean(symmetry?.symmetry) : Boolean(symmetry);
  if (isSym) {
    const symId1 = getSymmetricNodeId(id1);
    const symId2 = getSymmetricNodeId(id2);
    if (symId1 && symId2 && (symId1 !== id1 || symId2 !== id2)) {
      const res2 = updateSingleBeam(currentText, symId1, symId2);
      if (!res2.error) {
        currentText = res2.updatedText;
      }
    }
  }

  return { updatedText: currentText, error: null };
}

/**
 * Deletes a triangle by its 3 vertex nodes losslessly.
 */
export function deleteTriangleLossless(sourceText, partName, id1, id2, id3) {
  const set = new Set([id1, id2, id3]);
  return deleteRowFromSectionLossless(sourceText, partName, 'triangles', (row) =>
    row[0] && row[1] && row[2] && set.has(row[0]) && set.has(row[1]) && set.has(row[2])
  );
}

/**
 * Adds a quad (and optionally its mirrored counterpart with inverted winding) losslessly.
 */
export function addQuadLossless(sourceText, partName, { id1, id2, id3, id4, properties = {} }, symmetry = false) {
  if (!id1 || !id2 || !id3 || !id4) return { updatedText: sourceText, error: 'Invalid quad vertices' };

  const rowStrings = [];
  if (properties && Object.keys(properties).length > 0) {
    rowStrings.push(JSON.stringify(properties));
  }

  rowStrings.push(`["${id1}", "${id2}", "${id3}", "${id4}"]`);

  if (symmetry) {
    const sym1 = getSymmetricNodeId(id1) || id1;
    const sym2 = getSymmetricNodeId(id2) || id2;
    const sym3 = getSymmetricNodeId(id3) || id3;
    const sym4 = getSymmetricNodeId(id4) || id4;

    if (sym1 !== id1 || sym2 !== id2 || sym3 !== id3 || sym4 !== id4) {
      // Invert winding order (sym1, sym4, sym3, sym2) to ensure outward-facing surface normal on mirrored side
      rowStrings.push(`["${sym1}", "${sym4}", "${sym3}", "${sym2}"]`);
    }
  }

  return insertRowsIntoSectionLossless(
    sourceText,
    partName,
    'quads',
    rowStrings,
    '["id1:", "id2:", "id3:", "id4:"]'
  );
}

/**
 * Deletes a quad by its 4 vertex nodes losslessly.
 */
export function deleteQuadLossless(sourceText, partName, id1, id2, id3, id4) {
  const set = new Set([id1, id2, id3, id4]);
  return deleteRowFromSectionLossless(sourceText, partName, 'quads', (row) =>
    row[0] && row[1] && row[2] && row[3] && set.has(row[0]) && set.has(row[1]) && set.has(row[2]) && set.has(row[3])
  );
}

/**
 * Quick-connects 2, 3, or 4 selected nodes into a beam, triangle, or quad.
 * Ported from official BeamNG Blender JBeam Editor "F" hotkey mechanic.
 *
 * @param {string} sourceText
 * @param {string} partName
 * @param {string[]} nodeIds - Array of 2, 3, or 4 selected node IDs
 * @param {object} [options]
 * @param {object} [options.beamProperties={}]
 * @param {boolean} [options.symmetry=false]
 * @returns {{updatedText: string, createdType: 'beam'|'triangle'|'quad', error: string|null}}
 */
export function quickConnectNodesLossless(sourceText, partName, nodeIds, options = {}) {
  if (!Array.isArray(nodeIds) || nodeIds.length < 2) {
    return { updatedText: sourceText, createdType: null, error: 'Select at least 2 nodes to connect' };
  }

  const symmetry = Boolean(options.symmetry);
  const beamProperties = options.beamProperties || {};

  if (nodeIds.length === 2) {
    const res = addBeamLossless(
      sourceText,
      partName,
      { id1: nodeIds[0], id2: nodeIds[1], properties: beamProperties },
      symmetry
    );
    return { ...res, createdType: 'beam' };
  }

  if (nodeIds.length === 3) {
    const res = addTriangleLossless(
      sourceText,
      partName,
      { id1: nodeIds[0], id2: nodeIds[1], id3: nodeIds[2] },
      symmetry
    );
    return { ...res, createdType: 'triangle' };
  }

  if (nodeIds.length === 4) {
    const res = addQuadLossless(
      sourceText,
      partName,
      { id1: nodeIds[0], id2: nodeIds[1], id3: nodeIds[2], id4: nodeIds[3] },
      symmetry
    );
    return { ...res, createdType: 'quad' };
  }

  return { updatedText: sourceText, createdType: null, error: 'Select 2, 3, or 4 nodes to connect (got ' + nodeIds.length + ')' };
}

/**
 * Extrudes one or more selected nodes along a translation vector [dx, dy, dz].
 * Ported from official BeamNG Blender JBeam Editor extrude mechanics (E key / Ctrl+RMB).
 * Automatically generates:
 *  1. Extruded nodes at new positions
 *  2. Connecting beams from source nodes to newly spawned nodes
 *  3. Structural cross-beams and diagonal bracing between parallel extruded segments
 *  4. Symmetrical bilateral counterparts if symmetry is enabled
 *
 * @param {string} sourceText
 * @param {string} partName
 * @param {object} params
 * @param {string[]} params.nodeIds - Array of source node IDs to extrude
 * @param {Array<{id: string, pos: number[]}>} params.nodesData - Array with positions of source nodes
 * @param {number[]} params.delta - [dx, dy, dz] in BeamNG coordinates
 * @param {object} [params.properties={}] - Beam physics properties
 * @param {boolean} [params.crossBracing=true] - Generate cross-diagonal bracing between pairs
 * @param {boolean} [symmetry=false] - Reflect extrusion symmetrically across X=0
 * @returns {{updatedText: string, newNodes: Array<{id: string, pos: number[]}>, createdBeams: number, error: string|null}}
 */
export function extrudeNodesLossless(
  sourceText,
  partName,
  { nodeIds, nodesData = [], delta = [0, -0.3, 0], properties = {}, crossBracing = true },
  symmetry = false
) {
  if (!sourceText || !Array.isArray(nodeIds) || nodeIds.length === 0) {
    return { updatedText: sourceText, newNodes: [], createdBeams: 0, error: 'No nodes selected for extrusion' };
  }

  let currentText = sourceText;
  const newNodes = [];
  const sourceToNewMap = new Map();

  // Find all existing node IDs in the document to guarantee collision-free names
  const existingNodeIds = new Set();
  const idMatches = sourceText.matchAll(/\[\s*["']([^"']+)["']\s*,\s*[-0-9.$]/g);
  for (const m of idMatches) {
    existingNodeIds.add(m[1]);
  }

  // Helper to generate a unique extruded node ID
  const generateNewNodeId = (baseId) => {
    // Check if baseId ends with digits or code+digits: e.g. f1r -> f2r
    const m = baseId.match(/^(.*?)(\d+)([a-zA-Z_]*)$/);
    if (m) {
      let num = parseInt(m[2], 10);
      while (true) {
        num++;
        const candidate = `${m[1]}${num}${m[3]}`;
        if (!existingNodeIds.has(candidate)) {
          existingNodeIds.add(candidate);
          return candidate;
        }
      }
    }
    // Fallback: append _e1, _e2...
    let idx = 1;
    while (true) {
      const candidate = `${baseId}_e${idx}`;
      if (!existingNodeIds.has(candidate)) {
        existingNodeIds.add(candidate);
        return candidate;
      }
      idx++;
    }
  };

  // 1. Create each extruded node
  for (const id of nodeIds) {
    const srcNode = nodesData.find(n => n.id === id);
    if (!srcNode || !Array.isArray(srcNode.pos)) continue;

    const newPos = [
      Number((srcNode.pos[0] + (delta[0] || 0)).toFixed(4)),
      Number((srcNode.pos[1] + (delta[1] || 0)).toFixed(4)),
      Number((srcNode.pos[2] + (delta[2] || 0)).toFixed(4))
    ];

    const newId = generateNewNodeId(id);
    sourceToNewMap.set(id, newId);
    newNodes.push({ id: newId, pos: newPos, sourceId: id });

    // Add node losslessly
    const nodeRes = addNodeLossless(
      currentText,
      partName,
      { id: newId, pos: newPos },
      symmetry
    );
    if (!nodeRes.error) {
      currentText = nodeRes.updatedText;
    }
  }

  let createdBeams = 0;

  // 2. Create connecting beams from source nodes to newly extruded nodes
  for (const [srcId, newId] of sourceToNewMap.entries()) {
    const beamRes = addBeamLossless(
      currentText,
      partName,
      { id1: srcId, id2: newId, properties },
      symmetry
    );
    if (!beamRes.error) {
      currentText = beamRes.updatedText;
      createdBeams++;
    }
  }

  // 3. If multiple nodes were extruded, link extruded nodes together and add cross-bracing
  if (nodeIds.length >= 2) {
    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const srcA = nodeIds[i];
        const srcB = nodeIds[j];
        const newA = sourceToNewMap.get(srcA);
        const newB = sourceToNewMap.get(srcB);

        if (newA && newB) {
          // Parallel extruded edge [newA -> newB]
          const parallelRes = addBeamLossless(
            currentText,
            partName,
            { id1: newA, id2: newB, properties },
            symmetry
          );
          if (!parallelRes.error) {
            currentText = parallelRes.updatedText;
            createdBeams++;
          }

          // Cross-diagonal bracing [srcA -> newB] and [srcB -> newA]
          if (crossBracing) {
            const diag1Res = addBeamLossless(
              currentText,
              partName,
              { id1: srcA, id2: newB, properties },
              symmetry
            );
            if (!diag1Res.error) {
              currentText = diag1Res.updatedText;
              createdBeams++;
            }

            const diag2Res = addBeamLossless(
              currentText,
              partName,
              { id1: srcB, id2: newA, properties },
              symmetry
            );
            if (!diag2Res.error) {
              currentText = diag2Res.updatedText;
              createdBeams++;
            }
          }
        }
      }
    }
  }

  return {
    updatedText: currentText,
    newNodes,
    createdBeams,
    error: null
  };
}

/**
 * Subdivides an existing beam by inserting a new node along its span and splitting
 * the original beam into two segments [id1 -> newNode] and [newNode -> id2].
 * If symmetry is ON, symmetrically reflects the node and subdivides the mirrored beam.
 */
export function subdivideBeamLossless(
  sourceText,
  partName,
  { id1, id2, newNodeId, newPos, properties = {} },
  symmetry = false
) {
  if (!sourceText || !id1 || !id2 || !newNodeId || !Array.isArray(newPos)) {
    return { updatedText: sourceText, error: 'Invalid parameters for beam subdivision' };
  }

  let currentText = sourceText;

  // 1. Delete original beam
  const delRes1 = deleteBeamLossless(currentText, partName, id1, id2);
  if (!delRes1.error) {
    currentText = delRes1.updatedText;
  }

  // If symmetry is on, also delete mirrored original beam
  if (symmetry) {
    const sym1 = getSymmetricNodeId(id1);
    const sym2 = getSymmetricNodeId(id2);
    if (sym1 && sym2 && (sym1 !== id1 || sym2 !== id2)) {
      const delResSym = deleteBeamLossless(currentText, partName, sym1, sym2);
      if (!delResSym.error) {
        currentText = delResSym.updatedText;
      }
    }
  }

  // 2. Add the new intermediate node (with symmetry)
  const nodeRes = addNodeLossless(
    currentText,
    partName,
    { id: newNodeId, pos: newPos },
    symmetry
  );
  if (nodeRes.error) {
    return { updatedText: sourceText, error: `Failed to insert intermediate node: ${nodeRes.error}` };
  }
  currentText = nodeRes.updatedText;

  // 3. Add first split beam segment [id1 -> newNodeId]
  const beam1Res = addBeamLossless(
    currentText,
    partName,
    { id1, id2: newNodeId, properties },
    symmetry
  );
  if (beam1Res.error) {
    return { updatedText: sourceText, error: `Failed to insert first split beam: ${beam1Res.error}` };
  }
  currentText = beam1Res.updatedText;

  // 4. Add second split beam segment [newNodeId -> id2]
  const beam2Res = addBeamLossless(
    currentText,
    partName,
    { id1: newNodeId, id2, properties },
    symmetry
  );
  if (beam2Res.error) {
    return { updatedText: sourceText, error: `Failed to insert second split beam: ${beam2Res.error}` };
  }
  currentText = beam2Res.updatedText;

  return {
    updatedText: currentText,
    newNodeId,
    error: null
  };
}

/**
 * Renames a node across all its definitions and references within a part losslessly.
 * Ported from official BeamNG Blender JBeam Editor logic (rec_node_ref_rename).
 * Updates:
 *  - "nodes" definition row: ["oldId", posX, posY, posZ] -> ["newId", ...]
 *  - "beams": ["oldId", "n2"] -> ["newId", "n2"]
 *  - "triangles": ["oldId", "n2", "n3"] -> ["newId", "n2", "n3"]
 *  - "quads": ["oldId", "n2", "n3", "n4"] -> ["newId", "n2", "n3", "n4"]
 *  - "slidenodes", "rails", "hydros", "torsionbars", "refNodes", etc.
 * Optionally mirrors the rename symmetrically across the X-axis (e.g. c25r -> cab_25r also renames c25l -> cab_25l).
 *
 * @param {string} sourceText - Original JBeam text
 * @param {string} partName - Name of the part being edited
 * @param {string} oldNodeId - The current node ID
 * @param {string} newNodeId - The target new node ID
 * @param {object} [options] - { symmetry: boolean, allParts: boolean }
 * @returns {{ updatedText: string, renamedCount: number, error: string | null }}
 */
export function renameNodeLossless(sourceText, partName, oldNodeId, newNodeId, options = {}) {
  if (!sourceText || !oldNodeId || !newNodeId) {
    return { updatedText: sourceText, renamedCount: 0, error: 'Invalid parameters for node rename' };
  }

  const trimmedOld = String(oldNodeId).trim();
  const trimmedNew = String(newNodeId).trim();
  if (trimmedOld === trimmedNew) {
    return { updatedText: sourceText, renamedCount: 0, error: null };
  }

  let dataBundle;
  try {
    dataBundle = decodeWithMeta(sourceText, 'document.jbeam', true);
  } catch (err) {
    return { updatedText: sourceText, renamedCount: 0, error: `Parse error: ${err.message}` };
  }

  const parts = dataBundle.data;
  let targetParts = [];
  if (options.allParts) {
    targetParts = Object.keys(parts).filter(k => k !== '__meta');
  } else if (parts[partName]) {
    targetParts = [partName];
  } else {
    const validKeys = Object.keys(parts).filter(k => k !== '__meta');
    if (validKeys.length > 0) targetParts = [validKeys[0]];
    else return { updatedText: sourceText, renamedCount: 0, error: `Part '${partName}' not found` };
  }

  // Build rename mappings: oldId -> newId, and if symmetry enabled, oldSym -> newSym
  const renamePairs = [
    { from: trimmedOld, to: trimmedNew }
  ];

  if (options.symmetry) {
    const symOld = getSymmetricNodeId(trimmedOld);
    const symNew = getSymmetricNodeId(trimmedNew);
    if (symOld && symNew && symOld !== trimmedOld && symNew !== trimmedNew) {
      renamePairs.push({ from: symOld, to: symNew });
    }
  }

  const lines = sourceText.split('\n');
  const replacements = [];
  const seenRanges = new Set();
  const EXCLUDED_SECTIONS = new Set(['information', 'slotType', 'slots', 'slots2', 'variables', '__meta']);

  for (const pKey of targetParts) {
    const part = parts[pKey];
    if (!part) continue;

    for (const secKey of Object.keys(part)) {
      if (EXCLUDED_SECTIONS.has(secKey)) continue;

      const secObj = part[secKey];
      if (!secObj || !secObj.__meta || !secObj.__meta.range) continue;

      const [secStartLine, , secEndLine] = secObj.__meta.range;

      // Scan all metadata tokens within this section's line boundary
      for (const meta of dataBundle.metaData) {
        if (!meta.range) continue;
        const [tokStartLine, tokStartCol, tokEndLine, tokEndCol] = meta.range;

        // Skip tokens outside section line boundaries
        if (tokStartLine < secStartLine || tokEndLine > secEndLine) continue;

        // Only value tokens (string values)
        if (meta.type !== 'value' || typeof meta.value !== 'string') continue;

        for (const pair of renamePairs) {
          if (meta.value === pair.from) {
            const rangeKey = `${tokStartLine}:${tokStartCol}:${tokEndLine}:${tokEndCol}`;
            if (seenRanges.has(rangeKey)) continue;

            // In 'nodes' section, only rename column 0 (node ID) of row arrays
            if (secKey === 'nodes') {
              if (meta.parent && meta.parent.type === 'array' && meta.parent.obj) {
                if (meta.parent.obj[0] !== pair.from) {
                  continue; // Not the node ID column
                }
              }
            }

            // Determine quotes from original source text
            let tokenText = '';
            if (tokStartLine === tokEndLine && tokStartLine < lines.length) {
              tokenText = lines[tokStartLine].slice(tokStartCol, tokEndCol);
            }

            let replacementVal;
            if (tokenText.startsWith('"') && tokenText.endsWith('"')) {
              replacementVal = JSON.stringify(pair.to);
            } else if (tokenText.startsWith("'") && tokenText.endsWith("'")) {
              replacementVal = `'${pair.to.replace(/'/g, "\\'")}'`;
            } else {
              // Unquoted SJSON value: quote if contains special characters
              replacementVal = /^[a-zA-Z0-9_]+$/.test(pair.to) ? pair.to : JSON.stringify(pair.to);
            }

            seenRanges.add(rangeKey);
            replacements.push({
              range: meta.range,
              value: replacementVal
            });
          }
        }
      }
    }
  }

  if (replacements.length === 0) {
    return { updatedText: sourceText, renamedCount: 0, error: null };
  }

  // Sort descending: highest line first, then highest column first
  replacements.sort((a, b) => {
    if (a.range[2] !== b.range[2]) return b.range[2] - a.range[2];
    return b.range[3] - a.range[3];
  });

  let currentText = sourceText;
  for (const rep of replacements) {
    currentText = replaceRangeInText(currentText, rep.range, rep.value);
  }

  return {
    updatedText: currentText,
    renamedCount: replacements.length,
    error: null
  };
}

function deepCleanMeta(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  let clone = Array.isArray(obj) ? [] : {};
  Object.keys(obj).forEach(key => {
    if (key === '__meta') return;
    clone[key] = deepCleanMeta(obj[key]);
  });
  return clone;
}

/**
 * Flips the surface normal / winding order of a triangle or quad row in JBeam AST losslessly.
 * For triangles: [id1, id2, id3] -> [id3, id2, id1]
 * For quads:     [id1, id2, id3, id4] -> [id4, id3, id2, id1]
 * If options.symmetry is true, also flips the mirrored counterpart on the other side.
 * Preserves all inline options, comments, whitespace, and formatting.
 *
 * @param {string} sourceText
 * @param {string} partName
 * @param {'triangles' | 'quads'} sectionName
 * @param {string[]} nodeIds - The array of vertex node IDs (3 for triangle, 4 for quad)
 * @param {object} [options={}] - { symmetry: boolean }
 * @returns {{ updatedText: string, flippedCount: number, error: string | null }}
 */
export function flipSurfaceLossless(sourceText, partName, sectionName, nodeIds, options = {}) {
  if (!sourceText || !nodeIds || !Array.isArray(nodeIds) || nodeIds.length < 3) {
    return { updatedText: sourceText, flippedCount: 0, error: 'Invalid surface parameters' };
  }

  let dataBundle;
  try {
    dataBundle = decodeWithMeta(sourceText, 'document.jbeam', false);
  } catch (err) {
    return { updatedText: sourceText, flippedCount: 0, error: `Parse error: ${err.message}` };
  }

  const parts = dataBundle.data;
  let targetPartName = partName;
  if (!parts[targetPartName]) {
    const validKeys = Object.keys(parts).filter(k => k !== '__meta');
    if (validKeys.length > 0) targetPartName = validKeys[0];
    else return { updatedText: sourceText, flippedCount: 0, error: `Part '${partName}' not found` };
  }

  const part = parts[targetPartName];
  const secName = sectionName === 'quads' ? 'quads' : 'triangles';
  if (!part[secName]) {
    return { updatedText: sourceText, flippedCount: 0, error: `Section '${secName}' not found in part '${targetPartName}'` };
  }

  const expectedCount = secName === 'quads' ? 4 : 3;
  const targetNodeSet = new Set(nodeIds.map(n => String(n).trim()));

  // If symmetry is enabled, also calculate the mirrored target node set
  let symNodeSet = null;
  if (options.symmetry) {
    const symNodes = nodeIds.map(n => getSymmetricNodeId(n) || n);
    const isDistinct = symNodes.some((s, idx) => s !== nodeIds[idx]);
    if (isDistinct) {
      symNodeSet = new Set(symNodes);
    }
  }

  const section = part[secName];
  const rowKeys = Object.keys(section).filter(k => k !== '__meta');
  const replacements = [];

  for (const rk of rowKeys) {
    const row = section[rk];
    if (!row || typeof row !== 'object' || !row.__meta?.range) continue;

    // Check if row is an array table row
    const rowNodes = [];
    for (let i = 0; i < expectedCount; i++) {
      if (row[i] !== undefined && typeof row[i] === 'string') {
        rowNodes.push(row[i].trim());
      }
    }

    if (rowNodes.length !== expectedCount) continue;

    const isDirectMatch = rowNodes.every(n => targetNodeSet.has(n));
    const isSymMatch = symNodeSet && rowNodes.every(n => symNodeSet.has(n));

    if (isDirectMatch || isSymMatch) {
      // Collect extra items (e.g. inline options dict, nonFlexMaterials)
      const extraItems = [];
      const allRowKeys = Object.keys(row).filter(k => k !== '__meta');
      for (const k of allRowKeys) {
        const idx = Number(k);
        if (!isNaN(idx) && idx >= expectedCount) {
          const val = row[k];
          if (val && typeof val === 'object') {
            extraItems.push(JSON.stringify(deepCleanMeta(val)));
          } else if (val !== undefined) {
            extraItems.push(JSON.stringify(val));
          }
        }
      }

      // Reverse nodes to flip winding order
      const reversedNodes = [...rowNodes].reverse();
      const nodeStrings = reversedNodes.map(n => JSON.stringify(n));
      const newRowText = `[${[...nodeStrings, ...extraItems].join(', ')}]`;

      replacements.push({
        range: row.__meta.range,
        newText: newRowText
      });
    }
  }

  if (replacements.length === 0) {
    return { updatedText: sourceText, flippedCount: 0, error: 'Surface not found in section' };
  }

  // Sort replacements descending by range
  replacements.sort((a, b) => {
    if (a.range[2] !== b.range[2]) return b.range[2] - a.range[2];
    return b.range[3] - a.range[3];
  });

  let currentText = sourceText;
  for (const rep of replacements) {
    currentText = replaceRangeInText(currentText, rep.range, rep.newText);
  }

  return {
    updatedText: currentText,
    flippedCount: replacements.length,
    error: null
  };
}

/**
 * Derives a clean BeamNG-style short prefix from a tab title or part name.
 * e.g. "Test_2.jbeam" -> "t2_", "hood.jbeam" -> "h_", "bumper_f" -> "bf_"
 * @param {string} partName
 * @param {string} [tabTitle]
 * @returns {string}
 */
export function getPartPrefix(partName, tabTitle = '') {
  let base = (tabTitle || partName || 'p')
    .replace(/\.jbeam$/i, '')
    .trim();

  // If there are underscores or dashes (e.g. pickup_hood -> ph_, test_2 -> t2_)
  const segments = base.split(/[_-]+/).filter(Boolean);
  if (segments.length > 1) {
    let pfx = '';
    for (const seg of segments) {
      if (/^\d+$/.test(seg)) {
        pfx += seg;
      } else {
        pfx += seg[0].toLowerCase();
      }
    }
    return `${pfx}_`;
  }

  // Single word: e.g. "Test2" or "engine"
  const match = base.match(/^([a-zA-Z]+)(\d+)?$/);
  if (match) {
    const letters = match[1];
    const num = match[2] || '';
    const initial = letters.length <= 2 ? letters.toLowerCase() : letters[0].toLowerCase();
    return `${initial}${num}_`;
  }
  return `${base.slice(0, 2).toLowerCase()}_`;
}

/**
 * Losslessly prefixes all nodes declared in a part with a given prefix,
 * updating all node declarations and beam/triangle/quad references across the part.
 *
 * @param {string} sourceText
 * @param {string} partName
 * @param {string} prefix
 * @returns {{ updatedText: string, renamedCount: number, error: string | null }}
 */
export function prefixAllNodesInPart(sourceText, partName, prefix) {
  if (!sourceText || !prefix) return { updatedText: sourceText, renamedCount: 0, error: 'Invalid parameters' };

  let dataBundle;
  try {
    dataBundle = decodeWithMeta(sourceText, 'document.jbeam', true);
  } catch (err) {
    return { updatedText: sourceText, renamedCount: 0, error: `Parse error: ${err.message}` };
  }

  const parts = dataBundle.data;
  let targetPartName = partName;
  if (!parts[targetPartName]) {
    const validKeys = Object.keys(parts).filter(k => k !== '__meta');
    if (validKeys.length > 0) targetPartName = validKeys[0];
    else return { updatedText: sourceText, renamedCount: 0, error: `Part '${partName}' not found` };
  }

  const part = parts[targetPartName];
  if (!part.nodes) return { updatedText: sourceText, renamedCount: 0, error: 'Part has no nodes' };

  const nodesTable = Array.isArray(part.nodes) ? part.nodes : Object.values(part.nodes);
  const nodeIds = [];
  for (const row of nodesTable) {
    if (!row || typeof row !== 'object') continue;
    const nid = row.id || row['0'] || (Array.isArray(row) ? row[0] : null);
    if (nid && typeof nid === 'string' && nid.toLowerCase() !== 'id' && !nid.startsWith(prefix)) {
      if (!nodeIds.includes(nid)) nodeIds.push(nid);
    }
  }

  if (nodeIds.length === 0) {
    return { updatedText: sourceText, renamedCount: 0, error: null };
  }

  let currentText = sourceText;
  let totalRenamed = 0;
  for (const nid of nodeIds) {
    const newId = `${prefix}${nid}`;
    const res = renameNodeLossless(currentText, targetPartName, nid, newId, { symmetry: false });
    if (!res.error && res.updatedText) {
      currentText = res.updatedText;
      totalRenamed++;
    }
  }

  return {
    updatedText: currentText,
    renamedCount: totalRenamed,
    error: null
  };
}

export default {
  replaceRangeInText,
  updateNodeCoordinatesLossless,
  insertRowsIntoSectionLossless,
  deleteRowFromSectionLossless,
  addNodeLossless,
  addBeamLossless,
  addTriangleLossless,
  addQuadLossless,
  deleteNodeLossless,
  deleteBeamLossless,
  deleteTriangleLossless,
  deleteQuadLossless,
  quickConnectNodesLossless,
  extrudeNodesLossless,
  subdivideBeamLossless,
  renameNodeLossless,
  prefixAllNodesInPart,
  getPartPrefix,
  flipSurfaceLossless,
  addOffsetToExpr
};

