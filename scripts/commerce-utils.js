/**
 * WKND Shop commerce utilities shared by commerce.js, the drop-in initializers and blocks.
 * Leaf module (no initializer imports) so there are no dependency cycles.
 */
import { FetchGraphQL } from '@dropins/tools/fetch-graphql.js';
import { getMetadata } from './aem.js';
import { SHOP_PATHS, SHOP_ROOT } from './commerce-config.js';

export { SHOP_PATHS, SHOP_ROOT };

export const PDP_IMAGE_SIZES = { width: 960, height: 1200 };

// Core GraphQL (cart, checkout, customer, orders) and Catalog Service (PDP, PLP, recs).
// Both point at the same API Mesh, which merges the two schemas like Adobe's storefront mesh.
export const CORE_FETCH_GRAPHQL = new FetchGraphQL();
export const CS_FETCH_GRAPHQL = new FetchGraphQL();

export const rootLink = (path) => path;

export function getProductLink(urlKey) {
  return SHOP_PATHS.product(urlKey);
}

export function getProductSku() {
  return getMetadata('sku') || null;
}

export function getOptionsUIDsFromUrl() {
  return new URLSearchParams(window.location.search).get('optionsUIDs')?.split(',');
}

export function checkIsAuthenticated() {
  return document.cookie.split('; ').some((c) => c.startsWith('auth_dropin_user_token='));
}

export function preloadFile(href, as) {
  if (document.head.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = as === 'script' ? 'modulepreload' : 'preload';
  if (as !== 'script') link.as = as;
  link.href = href;
  document.head.append(link);
}

/**
 * Optional authored label overrides from one multi-sheet DA spreadsheet at
 * /shop/placeholders.json (one sheet per drop-in: pdp, cart, checkout, ...).
 * Drop-ins ship English defaults, so a missing sheet or key is not an error.
 */
let placeholderSheets;

// AU locale defaults (GST, postcode) for drop-in strings that ship US/EU wording.
const AU_LABELS = {
  Dropin: { CartItem: { taxIncluded: { label: 'incl. GST' }, taxExcluded: { label: 'excl. GST' } } },
  Cart: {
    PriceSummary: {
      shipping: {
        zipPlaceholder: 'Postcode',
        alternateField: { zip: 'Estimate using country/postcode' },
      },
      estimatedShippingForm: { zip: { placeholder: 'Postcode' } },
    },
  },
};
const deepMerge = (target, source) => {
  Object.entries(source).forEach(([key, value]) => {
    if (value && typeof value === 'object') {
      target[key] = deepMerge(target[key] && typeof target[key] === 'object' ? target[key] : {}, value);
    } else {
      target[key] = value;
    }
  });
  return target;
};
// Sheet keys use dot paths (Cart.Cart.heading); drop-in dictionaries are nested objects.
const toLabels = (rows = []) => rows.reduce((labels, { Key, Value }) => {
  const keys = String(Key || '').split('.').filter(Boolean);
  const leaf = keys.pop();
  if (!leaf) return labels;
  const node = keys.reduce((obj, k) => {
    obj[k] ??= {};
    return obj[k];
  }, labels);
  node[leaf] = Value;
  return labels;
}, {});
export async function fetchPlaceholders(path) {
  placeholderSheets ??= fetch(`${SHOP_ROOT}/placeholders.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  const json = await placeholderSheets;
  const sheet = path?.split('/').pop().replace(/\.json$/, '');
  let rows = json.data;
  if (json[':names']) {
    rows = sheet ? json[sheet]?.data : json[':names'].flatMap((n) => json[n]?.data || []);
  }
  return deepMerge(structuredClone(AU_LABELS), toLabels(rows));
}
