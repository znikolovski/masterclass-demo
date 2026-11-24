/**
 * WKND Adventures sign-in (Auth0, shared with WKND Aero) and its bridge to the Adobe Commerce
 * drop-ins: the Auth0 access token becomes the drop-ins' customer token
 * (`auth_dropin_user_token` cookie + Authorization header), and sign-in/out is announced on the
 * drop-in event bus so the cart merges guest carts and checkout/account switch to customer mode.
 */
import {
  configureAuth, getAccessToken, getUserProfile, hasSignedInBefore, restoreSession, signIn,
  signOut,
} from './wknd-auth.js';
import { SHOP_AUTH_CONFIG_URL } from './commerce-config.js';
import {
  ACCOUNT_PATH, clearAccountState, setAccountState,
} from './account-state.js';
import { pushShopEvent } from './shop-analytics.js';
import { restoreCustomerIdentity, updateCustomerIdentity } from './customer-identity.js';
import { requestPersonBinding } from './person-binding.js';

// Auth0 Allowed Callback + Logout URL: <origin>/account; the session persists across reloads.
configureAuth({ callbackPath: ACCOUNT_PATH, persist: true });

const TOKEN_COOKIE = 'auth_dropin_user_token';
const PROFILE_COOKIES = ['auth_dropin_firstname', 'auth_dropin_lastname'];
let profilePromise;

function decodeExp(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp ? payload.exp * 1000 : Date.now() + 3600000;
  } catch {
    return Date.now() + 3600000;
  }
}

function setCookie(name, value, maxAgeSeconds) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${Math.max(0, Math.floor(maxAgeSeconds))}; SameSite=Lax${secure}`;
}

function clearCookie(name) {
  document.cookie = `${name}=; path=/; max-age=0`;
}

export function hasShopToken() {
  return document.cookie.split('; ').some((c) => c.startsWith(`${TOKEN_COOKIE}=`));
}

async function emit(event, payload) {
  const { events } = await import('@dropins/tools/event-bus.js');
  events.emit(event, payload);
}

/** Auth0 profile (name, email) of the signed-in customer, or null. */
export function getShopProfile({ identityStatusOnly = false } = {}) {
  if (!profilePromise) {
    profilePromise = restoreCustomerIdentity(
      () => getUserProfile(SHOP_AUTH_CONFIG_URL),
      () => requestPersonBinding(identityStatusOnly ? 'person-status' : 'person-binding', {
        getToken: () => getAccessToken(SHOP_AUTH_CONFIG_URL),
      }),
    ).catch(() => {
      console.warn('WKND customer profile is unavailable; Adobe customer identity was not restored.'); // eslint-disable-line no-console
      return null;
    }).finally(() => { profilePromise = undefined; });
  }
  return profilePromise;
}

async function storeToken() {
  const token = await getAccessToken(SHOP_AUTH_CONFIG_URL);
  const ttl = (decodeExp(token) - Date.now()) / 1000 - 60;
  setCookie(TOKEN_COOKIE, token, ttl);
  const profile = await getShopProfile();
  if (profile) {
    setCookie(PROFILE_COOKIES[0], profile.given_name || profile.name?.split(' ')[0] || '', ttl);
    setCookie(PROFILE_COOKIES[1], profile.family_name || '', ttl);
  }
  setAccountState(profile || {});
  return token;
}

function clearToken() {
  updateCustomerIdentity(null);
  [TOKEN_COOKIE, ...PROFILE_COOKIES].forEach(clearCookie);
}

/**
 * Restore a previous session (refresh token / Auth0 session) and hand the token to the drop-ins.
 * @returns {Promise<boolean>} signed in
 */
export async function restoreShopSession() {
  if (hasShopToken()) {
    await getShopProfile();
    return true;
  }
  if (!hasSignedInBefore()) return false;
  if (!await restoreSession(SHOP_AUTH_CONFIG_URL)) {
    clearAccountState();
    return false;
  }
  await storeToken();
  await emit('authenticated', true);
  return true;
}

/**
 * Restore the customer identity on page load. If the drop-in token is missing,
 * also restore the Auth0 session and announce it on the drop-in event bus.
 */
export function syncShopSession() {
  const signedIn = hasShopToken();
  if (!signedIn && !hasSignedInBefore()) return false;
  restoreShopSession().catch(() => {
    console.warn('WKND customer session could not be restored. Sign in again to restore account tracking.'); // eslint-disable-line no-console
  });
  return signedIn;
}

/**
 * @param {{ signup?: boolean, surface?: string }} [opts] signup opens Auth0's "create account"
 *   screen; surface (header, account, checkout) is reported to Analytics
 */
export async function signInToShop({ signup = false, surface = 'unknown' } = {}) {
  await signIn(SHOP_AUTH_CONFIG_URL, { signup });
  await storeToken();
  pushShopEvent('shopSignIn', {
    eventType: 'web.webinteraction.linkClicks',
    data: { auth: { method: signup ? 'signup' : 'signin', surface } },
  });
  await emit('authenticated', true);
  return true;
}

/** @param {{ surface?: string }} [opts] where sign-out was chosen (Analytics) */
export async function signOutOfShop({ surface = 'unknown' } = {}) {
  // pushed before the token is cleared and Auth0 redirects (sent with sendBeacon)
  pushShopEvent('shopSignOut', { eventType: 'web.webinteraction.linkClicks', data: { auth: { surface } } });
  clearToken();
  clearAccountState();
  sessionStorage.removeItem('DROPINS_CART_ID');
  localStorage.setItem('wknd:cart-count', '0');
  await emit('authenticated', false).catch(() => {});
  await signOut(SHOP_AUTH_CONFIG_URL, { returnTo: `${window.location.origin}${ACCOUNT_PATH}` });
}

export { SHOP_AUTH_CONFIG_URL };
