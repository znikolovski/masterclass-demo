/** Product Bus adventure entity helpers */
// eslint-disable-next-line import/extensions
import ADVENTURE_ENRICHMENT from './adventure-catalog-enrichment.json';

export { ADVENTURE_ENRICHMENT };

/**
 * @typedef {object} AdventureEnrich
 * @property {string} destinationIata
 * @property {string} adventureCategory
 * @property {number} demoPrice
 */

/**
 * Infer nearest gateway airport from slug keywords when enrichment is missing.
 * @param {string} slug
 * @returns {AdventureEnrich}
 */
function inferEnrichmentFromSlug(slug) {
  const s = slug.toLowerCase();
  if (s.includes('patagonia')) return { destinationIata: 'PUQ', adventureCategory: 'trekking', demoPrice: 899 };
  if (s.includes('yosemite') || s.includes('climbing')) return { destinationIata: 'FAT', adventureCategory: 'climbing', demoPrice: 349 };
  if (s.includes('ohrid') || s.includes('macedonia')) return { destinationIata: 'OHD', adventureCategory: 'general-outdoor', demoPrice: 429 };
  if (s.includes('ladakh') || s.includes('himalaya')) return { destinationIata: 'IXL', adventureCategory: 'trekking', demoPrice: 899 };
  if (s.includes('mekong') || s.includes('vietnam')) return { destinationIata: 'VCA', adventureCategory: 'water', demoPrice: 499 };
  if (s.includes('costa-rica') || s.includes('surf')) return { destinationIata: 'LIR', adventureCategory: 'water', demoPrice: 549 };
  if (s.includes('norway') || s.includes('lofoten')) return { destinationIata: 'EVE', adventureCategory: 'water', demoPrice: 749 };
  if (s.includes('desert') || s.includes('sonoran')) return { destinationIata: 'PHX', adventureCategory: 'desert', demoPrice: 429 };
  if (s.includes('alpine') || s.includes('cycling')) return { destinationIata: 'GVA', adventureCategory: 'cycling', demoPrice: 599 };
  if (s.includes('winter') || s.includes('mountaineering')) return { destinationIata: 'ZRH', adventureCategory: 'winter-alpine', demoPrice: 799 };
  if (s.includes('swim')) return { destinationIata: 'BRS', adventureCategory: 'water', demoPrice: 499 };
  return { destinationIata: 'DEN', adventureCategory: 'general-outdoor', demoPrice: 399 };
}

/**
 * Extract first Adventures Media Bus image URL from query-index image field.
 * @param {string} [raw]
 * @param {string} [origin]
 * @returns {string}
 */
export function resolveCatalogImageUrl(raw, origin = 'https://main--masterclass-demo--znikolovski.aem.live') {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return '';
  if (/^https?:\/\//i.test(trimmed)) {
    const first = trimmed.match(/^https?:\/\/[^\s"'<>]+/i);
    return first ? first[0] : '';
  }
  const mediaMatch = trimmed.match(
    /\.\/?media_[a-f0-9]+\.(?:jpe?g|png|webp|avif)(?:\?[^./\s"'<>]*)?/i,
  );
  if (!mediaMatch) return '';
  let path = mediaMatch[0].replace(/^\.\//, '');
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/(\.(?:jpe?g|png|webp|avif)\?[^/]*?)\.\/media_.*$/, '$1');
  return `${origin.replace(/\/$/, '')}${path}`;
}

/**
 * @param {object} entry query-index row
 * @param {string} siteHost
 * @returns {object}
 */
export function toProductBusEntity(entry, siteHost) {
  const path = entry.path || '';
  const slug = path.replace(/^\/blog\//, '').replace(/\/$/, '');
  const enrich = ADVENTURE_ENRICHMENT[slug] || inferEnrichmentFromSlug(slug);
  const imageUrl = resolveCatalogImageUrl(entry.image);

  return {
    sku: slug,
    name: entry.title || slug,
    path: `/adventures/${slug}`,
    url: `${siteHost}/adventures/${slug}`,
    description: entry.description || '',
    brand: 'wknd-adventures',
    price: { currency: 'USD', final: enrich.demoPrice },
    images: imageUrl ? [{ url: imageUrl, label: entry.title }] : [],
    destinationIata: enrich.destinationIata,
    adventureCategory: enrich.adventureCategory,
    editorialUrl: `https://main--masterclass-demo--znikolovski.aem.live${path}`,
    extensions: {
      destinationIata: enrich.destinationIata,
      adventureCategory: enrich.adventureCategory,
    },
  };
}

/**
 * @param {object[]} entries
 * @param {string} siteHost
 */
export function buildCatalogIndex(entries, siteHost) {
  const data = entries.map((e) => toProductBusEntity(e, siteHost));
  return {
    ':type': 'product-bus-catalog',
    total: data.length,
    data,
  };
}
