/*
  JBeam Studio - Batch Node Renamer Utility
  Matches Blender-JBeam-Editor's batch node renaming behavior:
  Accepts patterns containing '#' (e.g. '#fl', 'node_#_r', 'f#l', 'cab##')
  and generates sequential node IDs as nodes are clicked in 3D.
*/

/**
 * Formats a node ID based on a batch renaming pattern and integer index.
 * @param {string} pattern - Pattern string (e.g. '#fl', 'node_#_l', '##c')
 * @param {number} index - Positive sequential index (e.g. 1, 2, 3)
 * @returns {string} Formatted node ID
 */
export function formatBatchNodeName(pattern, index) {
  const safeIdx = Math.max(0, parseInt(index, 10) || 1);
  const cleanPattern = typeof pattern === 'string' ? pattern.trim() : '';

  if (!cleanPattern) {
    return String(safeIdx);
  }

  if (cleanPattern.includes('#')) {
    // Replace '#' sequences. Multiple '#' like '##' format with zero padding!
    return cleanPattern.replace(/#+/g, (match) => {
      const padLen = match.length;
      return String(safeIdx).padStart(padLen, '0');
    });
  }

  // If pattern has no '#', append the index cleanly
  return `${cleanPattern}${safeIdx}`;
}

/**
 * Validates whether a pattern is safe and suitable for JBeam node IDs.
 * Node IDs must not contain spaces, commas, quotes, braces or brackets.
 * @param {string} pattern
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateBatchPattern(pattern) {
  if (typeof pattern !== 'string' || !pattern.trim()) {
    return { valid: false, error: 'Pattern cannot be empty' };
  }

  const trimmed = pattern.trim();
  // BeamNG node IDs should only contain letters, numbers, underscores, and our '#' placeholder
  if (!/^[a-zA-Z0-9_#]+$/.test(trimmed)) {
    return {
      valid: false,
      error: 'Pattern must only contain alphanumeric characters, underscores, and "#"'
    };
  }

  return { valid: true, error: null };
}

/**
 * Returns a preview array of the next upcoming node IDs.
 * @param {string} pattern
 * @param {number} startIndex
 * @param {number} count
 * @returns {string[]}
 */
export function previewBatchSequence(pattern, startIndex = 1, count = 3) {
  const start = Math.max(0, parseInt(startIndex, 10) || 1);
  const sequence = [];
  for (let i = 0; i < count; i++) {
    sequence.push(formatBatchNodeName(pattern, start + i));
  }
  return sequence;
}

export default {
  formatBatchNodeName,
  validateBatchPattern,
  previewBatchSequence
};

