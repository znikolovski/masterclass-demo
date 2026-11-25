/**
 * Product Bus adventure catalog client (shared by Aero blocks).
 */
import { getAeroApiBase } from './aero-blocks.js';

/** @type {object|null} */
let catalogCache = null;
/** @type {number} */
let catalogCacheAt = 0;

const CACHE_MS = 300000;

/**
 * @returns {Promise<object>}
 */
export async function fetchAdventureCatalog() {
  if (catalogCache && Date.now() - catalogCacheAt < CACHE_MS) return catalogCache;
  const base = getAeroApiBase();
  const resp = await fetch(`${base}/catalog/adventures/index.json`);
  if (!resp.ok) throw new Error('catalog unavailable');
  catalogCache = await resp.json();
  catalogCacheAt = Date.now();
  return catalogCache;
}

/**
 * @param {object} catalog
 * @returns {object[]}
 */
export function getCatalogItems(catalog) {
  return catalog?.data || catalog?.items || [];
}

/**
 * Destination options for flight search — one entry per adventure.
 * @param {object[]} items
 * @returns {{ code: string, label: string, slug: string }[]}
 */
export function getAdventureDestinationOptions(items) {
  return items
    .map((item) => {
      const code = item.destinationIata || item.extensions?.destinationIata || '';
      const slug = item.sku || item.slug || '';
      const label = item.name || slug;
      if (!code || !slug) return null;
      return { code, label, slug };
    })
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label));
}
