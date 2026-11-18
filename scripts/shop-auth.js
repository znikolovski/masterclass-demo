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

// Auth0 Allowed Callback + Logout URL: <origin>/account; the session persists across reloads.
configureAuth({ callbackPath: ACCOUNT_PATH, persist: true });

const TOKEN_COOKIE = 'auth_dropin_user_token';
const PROFILE_COOKIES = ['auth_dropin_firstname', 'auth_dropin_lastname'];

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

async function storeToken() {
  const token = await getAccessToken(SHOP_AUTH_CONFIG_URL);
  const ttl = (decodeExp(token) - Date.now()) / 1000 - 60;
  setCookie(TOKEN_COOKIE, token, ttl);
  const profile = await getUserProfile(SHOP_AUTH_CONFIG_URL).catch(() => null);
  if (profile) {
    setCookie(PROFILE_COOKIES[0], profile.given_name || profile.name?.split(' ')[0] || '', ttl);
    setCookie(PROFILE_COOKIES[1], profile.family_name || '', ttl);
  }
  setAccountState(profile || {});
  return token;
}

function clearToken() {
  [TOKEN_COOKIE, ...PROFILE_COOKIES].forEach(clearCookie);
}

/**
 * Restore a previous session (refresh token / Auth0 session) and hand the token to the drop-ins.
 * @returns {Promise<boolean>} signed in
 */
export async function restoreShopSession() {
  if (hasShopToken()) return true;
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
 * On page load: if the drop-in token is missing but this browser has signed in before,
 * restore the Auth0 session silently in the background (never blocks rendering) and announce
 * it on the event bus, which switches cart/checkout to the customer.
 */
export function syncShopSession() {
  if (hasShopToken()) return true;
  if (!hasSignedInBefore()) return false;
  restoreShopSession().catch(() => {});
  return false;
}

/** @param {{ signup?: boolean }} [opts] signup opens Auth0's "create account" screen */
export async function signInToShop({ signup = false } = {}) {
  await signIn(SHOP_AUTH_CONFIG_URL, { signup });
  await storeToken();
  await emit('authenticated', true);
  return true;
}

export async function signOutOfShop() {
  clearToken();
  clearAccountState();
  sessionStorage.removeItem('DROPINS_CART_ID');
  localStorage.setItem('wknd:cart-count', '0');
  await emit('authenticated', false).catch(() => {});
  await signOut(SHOP_AUTH_CONFIG_URL, { returnTo: `${window.location.origin}${ACCOUNT_PATH}` });
}

/** Auth0 profile (name, email) of the signed-in customer, or null. */
export async function getShopProfile() {
  return getUserProfile(SHOP_AUTH_CONFIG_URL).catch(() => null);
}

export { SHOP_AUTH_CONFIG_URL };
