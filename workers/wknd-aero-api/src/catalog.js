import { buildCatalogIndex, toProductBusEntity } from './product-bus-schema.js';

/**
 * @param {object} env
 */
export async function syncCatalogFromAdventures(env) {
  const indexUrl = env.ADVENTURES_INDEX_URL || env.ADVENUTURES_INDEX_URL;
  const resp = await fetch(indexUrl);
  if (!resp.ok) throw new Error(`index fetch ${resp.status}`);
  const index = await resp.json();
  const siteHost = env.AERO_SITE_HOST || 'https://main--wknd-aero--znikolovski.aem.network';

  const adventures = (index.data || []).filter((row) => {
    const p = row.path || '';
    return p.startsWith('/blog/') && !p.includes('/drafts/');
  });

  await Promise.all(adventures.map(async (entry) => {
    const entity = toProductBusEntity(entry, siteHost);
    await env.WKND_AERO_CATALOG.put(`catalog:adventures:${entity.sku}`, JSON.stringify(entity));
    if (env.PRODUCT_BUS_SITEKEY) {
      await fetch(`https://api.adobecommerce.live/znikolovski/sites/wknd-aero/catalog/adventures/${entity.sku}.json`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.PRODUCT_BUS_SITEKEY}`,
        },
        body: JSON.stringify(entity),
      }).catch(() => {});
    }
  }));

  const catalogIndex = buildCatalogIndex(adventures, siteHost);
  await env.WKND_AERO_CATALOG.put('catalog:adventures:index', JSON.stringify(catalogIndex));
  await env.WKND_AERO_CATALOG.put('catalog:meta', JSON.stringify({
    lastSyncedAt: new Date().toISOString(),
    count: adventures.length,
  }));

  return catalogIndex;
}

/**
 * @param {object} env
 */
export async function getCatalogIndex(env) {
  const raw = await env.WKND_AERO_CATALOG.get('catalog:adventures:index');
  if (raw) return JSON.parse(raw);
  return syncCatalogFromAdventures(env);
}

/**
 * @param {object} env
 * @param {string} slug
 */
export async function getCatalogEntity(env, slug) {
  const raw = await env.WKND_AERO_CATALOG.get(`catalog:adventures:${slug}`);
  if (raw) return JSON.parse(raw);
  await syncCatalogFromAdventures(env);
  const retry = await env.WKND_AERO_CATALOG.get(`catalog:adventures:${slug}`);
  return retry ? JSON.parse(retry) : null;
}
