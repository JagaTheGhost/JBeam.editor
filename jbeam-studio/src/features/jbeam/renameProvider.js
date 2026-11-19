/*
  JBeam Studio - Monaco Editor Node Rename Provider
  Enables native F2 / "Rename Symbol" / Context Menu renaming directly in the Code Editor.
  Losslessly cascades node renames across all tables ("nodes", "beams", "triangles", "quads", etc.)
  and symmetrically renames bilateral counterparts across the X-axis when symmetry is enabled,
  guaranteeing that beam connections and surfaces never break!
*/

import { JBEAM_LANGUAGE_ID } from './monacoJBeam.js';
import { resolveContextAtPosition } from './hoverProvider.js';
import { renameNodeLossless } from './astUpdater.js';

/**
 * Registers the Rename Provider with Monaco Editor for the JBeam language.
 * Bound to F2, Right Click -> Rename Symbol, and Command Palette.
 * 
 * @param {object} monacoInstance - Monaco editor global instance
 * @param {Function} [getSymmetryEnabled] - Callback returning current symmetry state (boolean)
 * @returns {object|null} Disposable
 */
export function registerJBeamRenameProvider(monacoInstance, getSymmetryEnabled = () => true) {
  if (!monacoInstance || !monacoInstance.languages) return null;

  return monacoInstance.languages.registerRenameProvider(JBEAM_LANGUAGE_ID, {
    resolveRenameLocation(model, position, token) {
      if (!model || !position) return null;
      const word = model.getWordAtPosition(position);
      if (!word?.word) {
        return {
          rejectReason: 'Place cursor on a node ID to rename.'
        };
      }

      const { sectionName } = resolveContextAtPosition(model, position.lineNumber);
      const validSections = new Set(['nodes', 'beams', 'triangles', 'quads', 'hydros', 'torsionbars', 'slidenodes', 'rails']);
      if (sectionName && !validSections.has(sectionName.toLowerCase())) {
        return {
          rejectReason: `Cannot rename node inside '${sectionName}' section.`
        };
      }

      const lineContent = model.getLineContent(position.lineNumber);
      if (lineContent.trim().startsWith('//')) {
        return { rejectReason: 'Cannot rename inside a comment.' };
      }

      // Check if word is a header token or section keyword
      if (word.word.endsWith(':') || ['id', 'id:', 'posx', 'posy', 'posz', 'beamspring', 'beamdamp'].includes(word.word.toLowerCase())) {
        return { rejectReason: 'Cannot rename a table header or parameter keyword.' };
      }

      return {
        range: new monacoInstance.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
        text: word.word
      };
    },

    provideRenameEdits(model, position, newName, token) {
      if (!model || !position || !newName) return null;
      const word = model.getWordAtPosition(position);
      if (!word?.word) return null;

      const oldNodeId = word.word.trim();
      const targetNewId = newName.trim();
      if (!targetNewId || oldNodeId === targetNewId) return null;

      const { partName } = resolveContextAtPosition(model, position.lineNumber);
      const sourceText = model.getValue();
      const symmetry = typeof getSymmetryEnabled === 'function' ? getSymmetryEnabled() : true;

      const res = renameNodeLossless(sourceText, partName, oldNodeId, targetNewId, {
        symmetry,
        allParts: true
      });

      if (res.error || !res.replacements || res.replacements.length === 0) {
        return null;
      }

      const edits = res.replacements.map(rep => {
        const [sLine, sCol, eLine, eCol] = rep.range;
        return {
          resource: model.uri,
          textEdit: {
            range: new monacoInstance.Range(sLine + 1, sCol + 1, eLine + 1, eCol + 1),
            text: rep.value
          }
        };
      });

      return { edits };
    }
  });
}

export default {
  registerJBeamRenameProvider
};
