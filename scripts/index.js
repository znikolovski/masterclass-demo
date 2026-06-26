/** Helix index fetch helpers — catalog in tools/scripts/dry-analysis.mjs */

/**
 * @param {string} indexName e.g. blog-index.json
 * @returns {string}
 */
export function helixIndexPath(indexName) {
  const base = window.hlx.codeBasePath || '';
  return `${base}/${indexName}`;
}

/**
 * @param {string} indexPath
 * @returns {Promise<object[]>}
 */
export async function fetchHelixIndex(indexPath) {
  try {
    const resp = await fetch(indexPath);
    if (!resp.ok) return [];
    const json = await resp.json();
    return Array.isArray(json?.data) ? json.data : [];
  } catch {
    return [];
  }
}
