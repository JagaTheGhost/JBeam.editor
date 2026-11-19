/*
  JBeam Studio - Monaco Editor Hover Provider
  Matches and extends vscode-jbeam-editor's hover documentation & breadcrumbs.
  Displays parameter definitions, types, defaults, units, valid ranges,
  physics advice, and official BeamNG documentation when hovering in Monaco.
*/

import { JBEAM_LANGUAGE_ID } from './monacoJBeam.js';
import { findDocumentationEntry, formatHoverMarkdown, normalizeSectionName } from './docHelper.js';

/**
 * Scans upwards from the current line to identify the enclosing part and section.
 * @param {object} model - Monaco text model
 * @param {number} lineNumber - 1-based line number
 * @returns {{ partName: string, sectionName: string }}
 */
export function resolveContextAtPosition(model, lineNumber) {
  let sectionName = '';
  let partName = '';

  const knownSections = new Set([
    'information', 'slotType', 'slots', 'slots2', 'variables', 'refNodes',
    'nodes', 'beams', 'triangles', 'quads', 'flexbodies', 'props', 'hydros',
    'torsionbars', 'controller', 'materials', 'glowMap'
  ]);

  let bracketDepth = 0;

  for (let l = lineNumber; l >= 1; l--) {
    const lineText = model.getLineContent(l);

    // Look for section keys: "sectionName": [ or "sectionName": {
    if (!sectionName) {
      const sectionMatch = lineText.match(/"([a-zA-Z0-9_]+)"\s*:\s*[\[{]/);
      if (sectionMatch) {
        const candidate = sectionMatch[1];
        if (knownSections.has(candidate) || knownSections.has(candidate.toLowerCase())) {
          sectionName = candidate;
        }
      }
    }

    // Look for top-level part name (indented by 0 to 4 spaces or under root object)
    if (!partName) {
      const partMatch = lineText.match(/^\s{0,4}"([a-zA-Z0-9_]+)"\s*:\s*\{/);
      if (partMatch) {
        const candidate = partMatch[1];
        if (!knownSections.has(candidate)) {
          partName = candidate;
        }
      }
    }

    if (sectionName && partName) break;
  }

  return { partName, sectionName };
}

/**
 * Provides hover documentation contents for Monaco.
 * @param {object} model
 * @param {object} position
 * @param {object} monaco
 * @returns {object|null}
 */
export function provideJBeamHover(model, position, monaco) {
  if (!model || !position) return null;

  // Extract word under cursor (including alphanumeric and underscores)
  const wordObj = model.getWordAtPosition(position);
  if (!wordObj || !wordObj.word) return null;

  const word = wordObj.word;
  const context = resolveContextAtPosition(model, position.lineNumber);

  // Lookup in documentation catalog
  const entry = findDocumentationEntry(word, context.sectionName);
  if (!entry) return null;

  const markdownText = formatHoverMarkdown(entry.key, entry.doc, context);

  const range = monaco
    ? new monaco.Range(position.lineNumber, wordObj.startColumn, position.lineNumber, wordObj.endColumn)
    : {
        startLineNumber: position.lineNumber,
        startColumn: wordObj.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: wordObj.endColumn
      };

  return {
    range,
    contents: [
      {
        value: markdownText,
        isTrusted: true,
        supportHtml: true
      }
    ]
  };
}

/**
 * Registers the Hover Provider with Monaco Editor for the JBeam language.
 * @param {object} monacoInstance
 * @returns {object|null} Disposable
 */
export function registerJBeamHoverProvider(monacoInstance) {
  if (!monacoInstance || !monacoInstance.languages) return null;

  return monacoInstance.languages.registerHoverProvider(JBEAM_LANGUAGE_ID, {
    provideHover(model, position) {
      return provideJBeamHover(model, position, monacoInstance);
    }
  });
}

/**
 * Resolves an individual line into a JBeam physical element.
 * @private
 */
export function resolveElementFromLine(lineText, lineNumber, sectionName, partName, validationResult = null, model = null, column = 1) {
  if (!lineText) return null;
  const trimmed = lineText.trim();
  if (!trimmed || trimmed.startsWith('//')) return null;

  // Physical element rows in JBeam table format always begin with array bracket '['
  if (!trimmed.startsWith('[')) return null;

  const sec = (sectionName || '').toLowerCase();
  const parts = validationResult?.parts || {};
  let targetPart = parts[partName];
  if (!targetPart) {
    const pKeys = Object.keys(parts).filter(k => k !== '__meta');
    if (pKeys.length > 0) targetPart = parts[pKeys[0]];
  }

  // Extract tokens: quoted strings preferred, fallback to comma-separated inside brackets
  let tokens = [...lineText.matchAll(/"([^"]+)"/g)].map(m => m[1]);
  if (tokens.length === 0) {
    const insideMatch = lineText.match(/\[\s*([^\]]+)\]/);
    if (insideMatch) {
      tokens = insideMatch[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }
  }
  if (tokens.length === 0) return null;

  // 1. Nodes Section
  if (sec === 'nodes') {
    const firstToken = tokens[0];
    if (!firstToken || firstToken.endsWith(':') || ['id', 'id:', 'posx', 'posy', 'posz'].includes(firstToken.toLowerCase())) {
      return null;
    }

    if (targetPart?.nodes) {
      for (const nid of Object.keys(targetPart.nodes).filter(k => k !== '__meta')) {
        const node = targetPart.nodes[nid];
        if (node.__meta?.range && node.__meta.range[0] + 1 === lineNumber) {
          return { type: 'node', id: nid, nodeData: node, partName, lineNumber };
        }
      }
    }

    return { type: 'node', id: firstToken, nodeData: targetPart?.nodes?.[firstToken] || null, partName, lineNumber };
  }

  // 2. Beams Section
  if (sec === 'beams') {
    if (tokens.length < 2) return null;
    const [id1, id2] = tokens;
    if (id1.endsWith(':') || id2.endsWith(':') || id1.toLowerCase() === 'id1:' || id2.toLowerCase() === 'id2:') {
      return null;
    }

    if (targetPart?.beams) {
      for (const bKey of Object.keys(targetPart.beams).filter(k => k !== '__meta')) {
        const beam = targetPart.beams[bKey];
        if (beam.__meta?.range && beam.__meta.range[0] + 1 === lineNumber) {
          const bId1 = beam['id1:'] || id1;
          const bId2 = beam['id2:'] || id2;
          return { type: 'beam', id1: bId1, id2: bId2, beamKey: bKey || `${bId1}_${bId2}`, beamData: beam, partName, lineNumber };
        }
      }
    }

    let beamData = null;
    let beamKey = `${id1}_${id2}`;
    if (targetPart?.beams) {
      for (const [k, b] of Object.entries(targetPart.beams)) {
        if (k === '__meta') continue;
        if ((b['id1:'] === id1 && b['id2:'] === id2) || (b['id1:'] === id2 && b['id2:'] === id1)) {
          beamData = b;
          beamKey = k;
          break;
        }
      }
    }

    return { type: 'beam', id1, id2, beamKey, beamData, partName, lineNumber };
  }

  // 3. Triangles Section
  if (sec === 'triangles') {
    if (tokens.length < 3) return null;
    const [id1, id2, id3] = tokens;
    if (id1.endsWith(':') || id2.endsWith(':') || id3.endsWith(':') || id1.toLowerCase() === 'id1:') {
      return null;
    }

    if (targetPart?.triangles) {
      for (const tKey of Object.keys(targetPart.triangles).filter(k => k !== '__meta')) {
        const tri = targetPart.triangles[tKey];
        if (tri.__meta?.range && tri.__meta.range[0] + 1 === lineNumber) {
          const nodes = [tri['id1:'] || id1, tri['id2:'] || id2, tri['id3:'] || id3];
          return { type: 'triangle', nodes, key: tKey, surfaceData: tri, partName, lineNumber };
        }
      }
    }

    let surfaceData = null;
    let key = `${id1}_${id2}_${id3}`;
    if (targetPart?.triangles) {
      for (const [k, t] of Object.entries(targetPart.triangles)) {
        if (k === '__meta') continue;
        if (t['id1:'] === id1 && t['id2:'] === id2 && t['id3:'] === id3) {
          surfaceData = t;
          key = k;
          break;
        }
      }
    }

    return { type: 'triangle', nodes: [id1, id2, id3], key, surfaceData, partName, lineNumber };
  }

  // 4. Quads Section
  if (sec === 'quads') {
    if (tokens.length < 4) return null;
    const [id1, id2, id3, id4] = tokens;
    if (id1.endsWith(':') || id2.endsWith(':') || id3.endsWith(':') || id4.endsWith(':') || id1.toLowerCase() === 'id1:') {
      return null;
    }

    if (targetPart?.quads) {
      for (const qKey of Object.keys(targetPart.quads).filter(k => k !== '__meta')) {
        const quad = targetPart.quads[qKey];
        if (quad.__meta?.range && quad.__meta.range[0] + 1 === lineNumber) {
          const nodes = [quad['id1:'] || id1, quad['id2:'] || id2, quad['id3:'] || id3, quad['id4:'] || id4];
          return { type: 'quad', nodes, key: qKey, surfaceData: quad, partName, lineNumber };
        }
      }
    }

    let surfaceData = null;
    let key = `${id1}_${id2}_${id3}_${id4}`;
    if (targetPart?.quads) {
      for (const [k, q] of Object.entries(targetPart.quads)) {
        if (k === '__meta') continue;
        if (q['id1:'] === id1 && q['id2:'] === id2 && q['id3:'] === id3 && q['id4:'] === id4) {
          surfaceData = q;
          key = k;
          break;
        }
      }
    }

    return { type: 'quad', nodes: [id1, id2, id3, id4], key, surfaceData, partName, lineNumber };
  }

  return null;
}

/**
 * Resolves the physical JBeam element (node, beam, triangle, quad) at the given editor line/column.
 * Used for live code-hover focus in the 3D viewport.
 * 
 * @param {object} model - Monaco editor text model
 * @param {number} lineNumber - 1-based line number
 * @param {number} [column] - 1-based column number
 * @param {object} [validationResult] - Parsed validation result with part AST metadata
 * @returns {{ type: 'node'|'beam'|'triangle'|'quad', id?: string, id1?: string, id2?: string, beamKey?: string, nodes?: string[], partName?: string }|null}
 */
export function resolveHoveredJBeamElement(model, lineNumber, column = 1, validationResult = null) {
  if (!model || !lineNumber) return null;
  const lineText = model.getLineContent(lineNumber);
  if (!lineText) return null;

  const { partName, sectionName } = resolveContextAtPosition(model, lineNumber);
  if (!sectionName) return null;

  return resolveElementFromLine(lineText, lineNumber, sectionName, partName, validationResult, model, column);
}

/**
 * Resolves all physical JBeam elements (nodes, beams, triangles, quads) within a multi-line range.
 * Used when the user selects multiple lines in Monaco to highlight all corresponding 3D elements simultaneously.
 * 
 * @param {object} model - Monaco editor text model
 * @param {number} startLine - 1-based start line number
 * @param {number} endLine - 1-based end line number
 * @param {object} [validationResult] - Parsed validation result with part AST metadata
 * @returns {{ nodes: Array, beams: Array, triangles: Array, quads: Array, all: Array }|null}
 */
export function resolveElementsInLineRange(model, startLine, endLine, validationResult = null) {
  if (!model || !startLine || !endLine) return null;
  const minLine = Math.min(startLine, endLine);
  const maxLine = Math.max(startLine, endLine);

  const result = {
    nodes: [],
    beams: [],
    triangles: [],
    quads: [],
    all: []
  };

  const seenNodeIds = new Set();
  const seenBeamKeys = new Set();
  const seenTriKeys = new Set();
  const seenQuadKeys = new Set();

  let { partName, sectionName } = resolveContextAtPosition(model, minLine);

  const knownSections = new Set([
    'information', 'slotType', 'slots', 'slots2', 'variables', 'refNodes',
    'nodes', 'beams', 'triangles', 'quads', 'flexbodies', 'props', 'hydros',
    'torsionbars', 'controller', 'materials', 'glowMap'
  ]);

  for (let ln = minLine; ln <= maxLine; ln++) {
    const lineText = model.getLineContent(ln);
    if (!lineText) continue;
    const trimmed = lineText.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;

    // Check if this line changes the section
    const sectionMatch = trimmed.match(/"([a-zA-Z0-9_]+)"\s*:\s*[\[{]/);
    if (sectionMatch) {
      const candidate = sectionMatch[1];
      if (knownSections.has(candidate) || knownSections.has(candidate.toLowerCase())) {
        sectionName = candidate;
      }
    }
    // Check if this line changes the part
    const partMatch = trimmed.match(/^"([a-zA-Z0-9_]+)"\s*:\s*\{/);
    if (partMatch && !knownSections.has(partMatch[1])) {
      partName = partMatch[1];
    }

    if (!sectionName) continue;

    const el = resolveElementFromLine(lineText, ln, sectionName, partName, validationResult, model);
    if (!el) continue;

    if (el.type === 'node' && el.id && !seenNodeIds.has(el.id)) {
      seenNodeIds.add(el.id);
      result.nodes.push(el);
      result.all.push(el);
    } else if (el.type === 'beam') {
      const key = el.beamKey || `${el.id1}_${el.id2}`;
      if (!seenBeamKeys.has(key)) {
        seenBeamKeys.add(key);
        result.beams.push(el);
        result.all.push(el);
      }
    } else if (el.type === 'triangle' && el.nodes?.length >= 3) {
      const key = el.key || el.nodes.join('_');
      if (!seenTriKeys.has(key)) {
        seenTriKeys.add(key);
        result.triangles.push(el);
        result.all.push(el);
      }
    } else if (el.type === 'quad' && el.nodes?.length >= 4) {
      const key = el.key || el.nodes.join('_');
      if (!seenQuadKeys.has(key)) {
        seenQuadKeys.add(key);
        result.quads.push(el);
        result.all.push(el);
      }
    }
  }

  return result.all.length > 0 ? result : null;
}

export default {
  resolveContextAtPosition,
  resolveHoveredJBeamElement,
  resolveElementsInLineRange,
  provideJBeamHover,
  registerJBeamHoverProvider
};

