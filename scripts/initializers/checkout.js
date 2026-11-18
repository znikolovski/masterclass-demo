import { initializers } from '@dropins/tools/initializer.js';
import { initialize, setEndpoint } from '@dropins/storefront-checkout/api.js';
import initializeDropin from './dropin.js';
import { CORE_FETCH_GRAPHQL, fetchPlaceholders } from '../commerce-utils.js';

await initializeDropin(async () => {
  setEndpoint(CORE_FETCH_GRAPHQL);
  const labels = await fetchPlaceholders('placeholders/checkout.json');
  return initializers.mountImmediately(initialize, { langDefinitions: { default: { ...labels } } });
})();
