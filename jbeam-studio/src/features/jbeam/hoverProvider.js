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

    // Look for top-level part name (indented by 2 spaces or under root object)
    if (!partName) {
      const partMatch = lineText.match(/^\s{1,4}"([a-zA-Z0-9_]+)"\s*:\s*\{/);
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
  if (!lineText || lineText.trim().startsWith('//')) return null;

  const { partName, sectionName } = resolveContextAtPosition(model, lineNumber);
  if (!sectionName) return null;

  const sec = sectionName.toLowerCase();
  const parts = validationResult?.parts || {};
  let targetPart = parts[partName];
  if (!targetPart) {
    const pKeys = Object.keys(parts).filter(k => k !== '__meta');
    if (pKeys.length > 0) targetPart = parts[pKeys[0]];
  }

  // 1. Nodes Section
  if (sec === 'nodes') {
    if (targetPart?.nodes) {
      for (const nid of Object.keys(targetPart.nodes).filter(k => k !== '__meta')) {
        const node = targetPart.nodes[nid];
        if (node.__meta?.range && node.__meta.range[0] + 1 === lineNumber) {
          return { type: 'node', id: nid, partName };
        }
      }
    }
    const nodeMatch = lineText.match(/^\s*\[\s*"([a-zA-Z0-9_]+)"/);
    if (nodeMatch) {
      return { type: 'node', id: nodeMatch[1], partName };
    }
    const wordObj = model.getWordAtPosition({ lineNumber, column });
    if (wordObj?.word && targetPart?.nodes && targetPart.nodes[wordObj.word]) {
      return { type: 'node', id: wordObj.word, partName };
    }
  }

  // 2. Beams Section
  if (sec === 'beams') {
    if (targetPart?.beams) {
      for (const bKey of Object.keys(targetPart.beams).filter(k => k !== '__meta')) {
        const beam = targetPart.beams[bKey];
        if (beam.__meta?.range && beam.__meta.range[0] + 1 === lineNumber) {
          const id1 = beam['id1:'];
          const id2 = beam['id2:'];
          return { type: 'beam', id1, id2, beamKey: bKey || `${id1}_${id2}`, partName };
        }
      }
    }
    const beamMatch = lineText.match(/^\s*\[\s*"([a-zA-Z0-9_]+)"\s*,\s*"([a-zA-Z0-9_]+)"/);
    if (beamMatch) {
      return { type: 'beam', id1: beamMatch[1], id2: beamMatch[2], beamKey: `${beamMatch[1]}_${beamMatch[2]}`, partName };
    }
  }

  // 3. Triangles Section
  if (sec === 'triangles') {
    if (targetPart?.triangles) {
      for (const tKey of Object.keys(targetPart.triangles).filter(k => k !== '__meta')) {
        const tri = targetPart.triangles[tKey];
        if (tri.__meta?.range && tri.__meta.range[0] + 1 === lineNumber) {
          const nodes = [tri['id1:'], tri['id2:'], tri['id3:']];
          return { type: 'triangle', nodes, key: tKey, partName };
        }
      }
    }
    const triMatch = lineText.match(/^\s*\[\s*"([a-zA-Z0-9_]+)"\s*,\s*"([a-zA-Z0-9_]+)"\s*,\s*"([a-zA-Z0-9_]+)"/);
    if (triMatch) {
      return { type: 'triangle', nodes: [triMatch[1], triMatch[2], triMatch[3]], partName };
    }
  }

  // 4. Quads Section
  if (sec === 'quads') {
    if (targetPart?.quads) {
      for (const qKey of Object.keys(targetPart.quads).filter(k => k !== '__meta')) {
        const quad = targetPart.quads[qKey];
        if (quad.__meta?.range && quad.__meta.range[0] + 1 === lineNumber) {
          const nodes = [quad['id1:'], quad['id2:'], quad['id3:'], quad['id4:']];
          return { type: 'quad', nodes, key: qKey, partName };
        }
      }
    }
    const quadMatch = lineText.match(/^\s*\[\s*"([a-zA-Z0-9_]+)"\s*,\s*"([a-zA-Z0-9_]+)"\s*,\s*"([a-zA-Z0-9_]+)"\s*,\s*"([a-zA-Z0-9_]+)"/);
    if (quadMatch) {
      return { type: 'quad', nodes: [quadMatch[1], quadMatch[2], quadMatch[3], quadMatch[4]], partName };
    }
  }

  return null;
}

export default {
  resolveContextAtPosition,
  resolveHoveredJBeamElement,
  provideJBeamHover,
  registerJBeamHoverProvider
};

