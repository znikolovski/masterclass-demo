/**
 * Global drop-in initialisation for WKND Shop pages (adapted from aem-boilerplate-commerce).
 */
import { events } from '@dropins/tools/event-bus.js';
import { getCookie } from '@dropins/tools/lib.js';
import { CORE_FETCH_GRAPHQL } from '../commerce-utils.js';
import { syncShopSession } from '../shop-auth.js';
import { startShopAnalytics } from '../shop-analytics.js';

export const getUserTokenCookie = () => getCookie('auth_dropin_user_token');

const setAuthHeaders = (state) => {
  const token = getUserTokenCookie();
  if (state && token) {
    CORE_FETCH_GRAPHQL.setFetchGraphQlHeader('Authorization', `Bearer ${token}`);
  } else {
    CORE_FETCH_GRAPHQL.removeFetchGraphQlHeader('Authorization');
  }
};

const persistCartDataInSession = (data) => {
  if (data?.id) sessionStorage.setItem('DROPINS_CART_ID', data.id);
  else sessionStorage.removeItem('DROPINS_CART_ID');
  // lightweight count for the header badge on non-shop pages (no drop-ins loaded there)
  localStorage.setItem('wknd:cart-count', String(data?.totalQuantity || 0));
  window.dispatchEvent(new CustomEvent('wknd:cart-count', { detail: data?.totalQuantity || 0 }));
};

export default async function initializeDropins() {
  events.on('cart/data', persistCartDataInSession, { eager: true });
  startShopAnalytics();

  // Auth0 (WKND customer sign-in) → drop-in customer token, before the auth drop-in validates it
  syncShopSession();
  setAuthHeaders(!!getUserTokenCookie());
  events.on('authenticated', setAuthHeaders, { eager: true });

  await import('./auth.js');
  await import('./cart.js');
}
