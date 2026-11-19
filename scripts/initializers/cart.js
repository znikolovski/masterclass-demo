import { initializers } from '@dropins/tools/initializer.js';
import { getCookie } from '@dropins/tools/lib.js';
import { initialize, setEndpoint, refreshCart } from '@dropins/storefront-cart/api.js';
import initializeDropin from './dropin.js';
import { CORE_FETCH_GRAPHQL, fetchPlaceholders } from '../commerce-utils.js';

await initializeDropin(async () => {
  setEndpoint(CORE_FETCH_GRAPHQL);
  const labels = await fetchPlaceholders('placeholders/cart.json');
  return initializers.mountImmediately(initialize, {
    langDefinitions: { default: { ...labels } },
    features: { isFreeGiftsCartPriceRulesEnabled: false },
  });
})();

// A signed-in shopper's cart is shared with the WKND LLM app (ChatGPT), so changes made there
// (or an order placed there) show up when they return to this tab.
let lastRefresh = Date.now();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !getCookie('auth_dropin_user_token')) return;
  if (Date.now() - lastRefresh < 10000) return;
  lastRefresh = Date.now();
  refreshCart().catch(() => {});
});
