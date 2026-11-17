import { initializers } from '@dropins/tools/initializer.js';
import { initialize, setEndpoint } from '@dropins/storefront-order/api.js';
import initializeDropin from './dropin.js';
import { CORE_FETCH_GRAPHQL, fetchPlaceholders } from '../commerce-utils.js';

await initializeDropin(async () => {
  setEndpoint(CORE_FETCH_GRAPHQL);
  const params = new URLSearchParams(window.location.search);
  const labels = await fetchPlaceholders('placeholders/order.json');
  return initializers.mountImmediately(initialize, {
    langDefinitions: { default: { ...labels } },
    orderRef: params.get('orderRef') || undefined,
  });
})();
