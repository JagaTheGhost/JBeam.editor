/**
 * Builds a compressed multi-level prefix tree from DAE submesh names using '_' as delimiter.
 * - Unwraps a shared single-root vehicle prefix (e.g. 'bastion_') when multiple submeshes share it.
 * - Compresses single-child chains (Patrica/radix style) so unique items stay flat leaves
 *   and single-branch chains merge into one readable folder (e.g. 'badge_pillar').
 */

function naturalCompare(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function compareTreeNodes(a, b) {
  if (a.type !== b.type) {
    return a.type === 'folder' ? -1 : 1;
  }
  return naturalCompare(a.label, b.label);
}

/**
 * Finds the longest shared leading underscore-token prefix across all submesh names,
 * provided every mesh has at least one token remaining after stripping.
 *
 * @param {string[][]} tokenLists
 * @returns {string[]}
 */
function findCommonRootTokens(tokenLists) {
  if (!Array.isArray(tokenLists) || tokenLists.length < 2) return [];
  const minLen = Math.min(...tokenLists.map(t => t.length));
  if (minLen <= 1) return [];

  const first = tokenLists[0];
  const common = [];
  for (let i = 0; i < minLen - 1; i++) {
    const tok = first[i];
    if (tokenLists.every(t => t[i] === tok)) {
      common.push(tok);
    } else {
      break;
    }
  }
  return common;
}

/**
 * Recursively compresses trie nodes into clean folder & leaf structures.
 */
function compressTrieNode(node, submeshDetails, pathPrefix = '') {
  const childEntries = Array.from(node.children.entries());

  // Collect all descendant mesh names for this node
  const collectAll = (n, out = []) => {
    for (const m of n.ownMeshes) out.push(m);
    for (const child of n.children.values()) collectAll(child, out);
    return out;
  };

  // Single-branch compression: merge child chain if this node has no own meshes and exactly 1 child
  let mergedLabel = node.token;
  let current = node;
  while (current.ownMeshes.length === 0 && current.children.size === 1) {
    const [nextTok, nextChild] = Array.from(current.children.entries())[0];
    mergedLabel = mergedLabel ? `${mergedLabel}_${nextTok}` : nextTok;
    current = nextChild;
  }

  // If after compression we end at a single leaf with no children, emit a leaf
  if (current.ownMeshes.length === 1 && current.children.size === 0) {
    const meshName = current.ownMeshes[0];
    const details = submeshDetails?.[meshName] || null;
    return {
      type: 'leaf',
      id: `leaf:${meshName}`,
      label: mergedLabel || meshName,
      name: meshName,
      triangles: details?.triangles || 0,
      vertices: details?.vertices || 0
    };
  }

  // Otherwise emit a folder containing compressed children + any exact-prefix ownMeshes
  const nextPrefix = pathPrefix ? `${pathPrefix}_${mergedLabel}` : mergedLabel;
  const items = [];

  for (const ownName of current.ownMeshes) {
    const details = submeshDetails?.[ownName] || null;
    items.push({
      type: 'leaf',
      id: `leaf:${ownName}`,
      label: mergedLabel || ownName,
      name: ownName,
      triangles: details?.triangles || 0,
      vertices: details?.vertices || 0
    });
  }

  for (const [, childNode] of current.children.entries()) {
    items.push(compressTrieNode(childNode, submeshDetails, nextPrefix));
  }

  items.sort(compareTreeNodes);

  const meshNames = collectAll(current, []);
  const totalTriangles = meshNames.reduce((acc, m) => acc + (submeshDetails?.[m]?.triangles || 0), 0);

  return {
    type: 'folder',
    id: `folder:${nextPrefix}`,
    label: mergedLabel,
    meshNames,
    meshCount: meshNames.length,
    totalTriangles,
    children: items
  };
}

/**
 * Builds a multi-level underscore-grouped tree for a list of submesh names.
 *
 * @param {string[]} submeshNames
 * @param {Record<string, { triangles?: number, vertices?: number }>} [submeshDetails]
 * @returns {{ rootPrefix: string, nodes: Array<Object> }}
 */
export function buildSubmeshPrefixTree(submeshNames = [], submeshDetails = {}) {
  if (!Array.isArray(submeshNames) || submeshNames.length === 0) {
    return { rootPrefix: '', nodes: [] };
  }

  const tokenLists = submeshNames.map(name => {
    const parts = String(name).split('_').filter(Boolean);
    return parts.length > 0 ? parts : [String(name)];
  });

  const commonTokens = findCommonRootTokens(tokenLists);
  const rootPrefix = commonTokens.join('_');
  const stripCount = commonTokens.length;

  const root = { token: '', ownMeshes: [], children: new Map() };

  for (let i = 0; i < submeshNames.length; i++) {
    const fullName = submeshNames[i];
    const tokens = tokenLists[i].slice(stripCount);
    const effectiveTokens = tokens.length > 0 ? tokens : [fullName];

    let curr = root;
    for (const tok of effectiveTokens) {
      if (!curr.children.has(tok)) {
        curr.children.set(tok, { token: tok, ownMeshes: [], children: new Map() });
      }
      curr = curr.children.get(tok);
    }
    curr.ownMeshes.push(fullName);
  }

  const nodes = [];
  for (const [, childNode] of root.children.entries()) {
    nodes.push(compressTrieNode(childNode, submeshDetails, ''));
  }

  nodes.sort(compareTreeNodes);

  return { rootPrefix, nodes };
}
