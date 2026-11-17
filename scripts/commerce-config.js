/**
 * WKND Shop storefront configuration (Adobe Commerce drop-ins → WKND Commerce API Mesh).
 * Shape matches the commerce boilerplate `config.json` (`public.default`), consumed by
 * initializeConfig() from @dropins/tools. Kept in code so it can never collide with the
 * repoless site config or authored /shop content.
 */
// Local/preview test content lives under /drafts/shop; production under /shop.
export const SHOP_ROOT = typeof window !== 'undefined' && window.location.pathname.startsWith('/drafts/shop') ? '/drafts/shop' : '/shop';

const RUNTIME = 'https://28538-wkndcommerce-stage.adobeioruntime.net/api/v1/web/commerce';
export const MESH_ENDPOINT = 'https://edge-sandbox-graph.adobe.io/api/fd2c6dc7-f3ce-426a-83bd-63227acbcdb4/graphql';
export const SHOP_AUTH_CONFIG_URL = `${RUNTIME}/auth-config`;
export const CONTENT_AI_BASE = `${RUNTIME}/content-ai`;
export const DM_DELIVERY_ORIGIN = 'https://delivery-p115476-e1135027.adobeaemcloud.com';

// Product imagery is generated 4:5 (1600×2000); PDP renditions are requested at this size.
export const PDP_IMAGE_SIZES = { width: 960, height: 1200 };

export const SHOP_PATHS = {
  // The shop home is the folder index (DA shop/index), which EDS serves at /shop/ only.
  root: `${SHOP_ROOT}/`,
  search: `${SHOP_ROOT}/search`,
  product: (urlKey) => `${SHOP_ROOT}/products/${urlKey}`,
  cart: `${SHOP_ROOT}/cart`,
  checkout: `${SHOP_ROOT}/checkout`,
  order: `${SHOP_ROOT}/order`,
  account: `${SHOP_ROOT}/account`,
};

export default {
  public: {
    default: {
      'commerce-core-endpoint': MESH_ENDPOINT,
      'commerce-endpoint': MESH_ENDPOINT,
      'commerce-assets-enabled': true,
      headers: {
        all: { Store: 'wknd_au' },
        cs: {
          'Magento-Store-Code': 'wknd_store',
          'Magento-Store-View-Code': 'wknd_au',
          'Magento-Website-Code': 'wknd',
        },
      },
      analytics: {
        'base-currency-code': 'AUD',
        environment: 'Production',
        'store-code': 'wknd_store',
        'store-name': 'WKND Adventures Shop',
        'store-url': 'https://wknd-adventures.run.place',
        'store-view-code': 'wknd_au',
        'store-view-name': 'WKND Australia',
        'website-code': 'wknd',
        'website-name': 'WKND Adventures',
      },
    },
  },
};
