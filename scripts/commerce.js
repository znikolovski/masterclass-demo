/**
 * WKND Shop commerce runtime — Adobe Commerce storefront drop-ins wired to the WKND Commerce
 * API Mesh. Adapted from hlxsites/aem-boilerplate-commerce (Apache-2.0) and loaded only on
 * shop pages / commerce blocks so the rest of the site pays nothing for it.
 */
import { getConfigValue, getHeaders, initializeConfig } from '@dropins/tools/lib/aem/configs.js';
import { initializers } from '@dropins/tools/initializer.js';
import { isAemAssetsEnabled } from '@dropins/tools/lib/aem/assets.js';
import { CART_FRAGMENT } from '@dropins/storefront-cart/fragments.js';
import { ORDER_SUMMARY_FRAGMENT } from '@dropins/storefront-order/fragments.js';
import { loadCSS } from './aem.js';
import commerceConfig, { BUNDLE_ATTRIBUTION_READY, DM_DELIVERY_ORIGIN } from './commerce-config.js';
import { preconnectDm } from './dm-image.js';
import { CORE_FETCH_GRAPHQL, CS_FETCH_GRAPHQL } from './commerce-utils.js';
import { installBundleAttribution } from './commerce-attribution.js';

export * from './commerce-utils.js';

let initPromise;
let configured = false;

/**
 * Synchronous drop-in configuration (endpoints, headers, DM image params). Blocks that need
 * their own initializer early (e.g. the PDP) call this and load it in parallel with
 * initializeCommerce() instead of waiting for the auth and cart initializers.
 */
export function configureCommerce() {
  if (configured) return;
  configured = true;
  initializeConfig(commerceConfig);
  preconnectDm(DM_DELIVERY_ORIGIN);
  loadCSS(`${window.hlx?.codeBasePath || ''}/styles/commerce.css`);
  CORE_FETCH_GRAPHQL.setEndpoint(getConfigValue('commerce-core-endpoint'));
  CORE_FETCH_GRAPHQL.setFetchGraphQlHeaders((prev) => ({ ...prev, ...getHeaders('all') }));
  installBundleAttribution(CORE_FETCH_GRAPHQL, {
    enabled: BUNDLE_ATTRIBUTION_READY,
    cartFragment: CART_FRAGMENT,
    orderSummaryFragment: ORDER_SUMMARY_FRAGMENT,
  });
  CS_FETCH_GRAPHQL.setEndpoint(getConfigValue('commerce-endpoint'));
  CS_FETCH_GRAPHQL.setFetchGraphQlHeaders((prev) => ({ ...prev, ...getHeaders('cs') }));
  if (isAemAssetsEnabled()) {
    // Dynamic Media OpenAPI wants integer dimensions
    initializers.setImageParamKeys({
      width: (value) => ['width', Math.floor(value)],
      height: (value) => ['height', Math.floor(value)],
      quality: 'quality',
      crop: 'crop',
      fit: 'fit',
    });
  }
}

/** Configures the drop-ins and runs the global initializers once per page (idempotent). */
export function initializeCommerce() {
  if (!initPromise) {
    initPromise = (async () => {
      configureCommerce();
      const { default: initializeDropins } = await import('./initializers/index.js');
      await initializeDropins();
    })();
  }
  return initPromise;
}
