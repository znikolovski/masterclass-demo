/**
 * WKND Shop commerce runtime — Adobe Commerce storefront drop-ins wired to the WKND Commerce
 * API Mesh. Adapted from hlxsites/aem-boilerplate-commerce (Apache-2.0) and loaded only on
 * shop pages / commerce blocks so the rest of the site pays nothing for it.
 */
import { getConfigValue, getHeaders, initializeConfig } from '@dropins/tools/lib/aem/configs.js';
import { loadCSS } from './aem.js';
import commerceConfig, { DM_DELIVERY_ORIGIN } from './commerce-config.js';
import { preconnectDm } from './dm-image.js';
import { CORE_FETCH_GRAPHQL, CS_FETCH_GRAPHQL } from './commerce-utils.js';

export * from './commerce-utils.js';

let initPromise;

/** Configures the drop-ins once per page (idempotent). */
export function initializeCommerce() {
  if (!initPromise) {
    initPromise = (async () => {
      initializeConfig(commerceConfig);
      preconnectDm(DM_DELIVERY_ORIGIN);
      loadCSS(`${window.hlx?.codeBasePath || ''}/styles/commerce.css`);
      CORE_FETCH_GRAPHQL.setEndpoint(getConfigValue('commerce-core-endpoint'));
      CORE_FETCH_GRAPHQL.setFetchGraphQlHeaders((prev) => ({ ...prev, ...getHeaders('all') }));
      CS_FETCH_GRAPHQL.setEndpoint(getConfigValue('commerce-endpoint'));
      CS_FETCH_GRAPHQL.setFetchGraphQlHeaders((prev) => ({ ...prev, ...getHeaders('cs') }));
      const { default: initializeDropins } = await import('./initializers/index.js');
      await initializeDropins();
    })();
  }
  return initPromise;
}
