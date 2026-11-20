import { MESH_ENDPOINT, SHOP_PATHS } from './commerce-config.js';

export const AERO_SHOP_ORIGIN = 'https://wknd-adventures.run.place';

const PRODUCTS = `query AeroBookingGear($filter: [SearchClauseInput!]) {
  productSearch(phrase: "", page_size: 4, filter: $filter) {
    items { productView {
      sku name urlKey inStock images(roles: ["thumbnail"]) { url label }
      ... on SimpleProductView { price { final { amount { value currency } } } }
      ... on ComplexProductView { priceRange { minimum { final { amount { value currency } } } } }
    } }
  }
}`;

export function getAeroShopLink(urlKey) {
  return new URL(SHOP_PATHS.product(encodeURIComponent(urlKey)), AERO_SHOP_ORIGIN).href;
}

/** Only public adventure tags go to Commerce, never booking or passenger details. */
export async function fetchBookingProducts(adventureIds, signal) {
  const adventures = [...new Set(adventureIds)]
    .filter((id) => typeof id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id));
  if (!adventures.length) return [];
  const url = new URL(MESH_ENDPOINT);
  url.searchParams.set('query', PRODUCTS.replace(/\s+/g, ' '));
  url.searchParams.set('variables', JSON.stringify({
    filter: [{ attribute: 'adventure', in: adventures }],
  }));
  const response = await fetch(url, {
    headers: { Store: 'wknd_au' },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
      : AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Booking gear returned HTTP ${response.status}`);
  const result = await response.json();
  if (result.errors?.length) throw new Error('Booking gear catalog query failed.');
  if (!Array.isArray(result.data?.productSearch?.items)) {
    throw new Error('Booking gear catalog response is invalid.');
  }
  const seen = new Set();
  return result.data.productSearch.items.map((item) => item.productView)
    .filter((product) => {
      if (!product?.sku || !product.name || !product.urlKey || product.inStock !== true
        || seen.has(product.sku)) return false;
      seen.add(product.sku);
      return true;
    }).slice(0, 4);
}
