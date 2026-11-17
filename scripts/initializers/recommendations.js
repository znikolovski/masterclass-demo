import { initializers } from '@dropins/tools/initializer.js';
import { initialize, setEndpoint } from '@dropins/storefront-recommendations/api.js';
import initializeDropin from './dropin.js';
import { CS_FETCH_GRAPHQL, fetchPlaceholders } from '../commerce-utils.js';

await initializeDropin(async () => {
  setEndpoint(CS_FETCH_GRAPHQL);
  const labels = await fetchPlaceholders('placeholders/recommendations.json');
  return initializers.mountImmediately(initialize, { langDefinitions: { default: { ...labels } } });
})();
