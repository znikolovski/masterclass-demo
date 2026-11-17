/**
 * Bridges the shared WKND customer sign-in (Auth0, reused from WKND Aero) to the Adobe Commerce
 * drop-ins: the Auth0 access token becomes the drop-ins' customer token
 * (`auth_dropin_user_token` cookie + Authorization header), and sign-in/out is announced on the
 * drop-in event bus so the cart merges guest carts and checkout/account switch to customer mode.
 */
import {
  getAccessToken, getUserProfile, hasSignedInBefore, restoreSession, signIn, signOut,
} from './wknd-auth.js';
import { SHOP_AUTH_CONFIG_URL } from './commerce-config.js';

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
  return token;
}

function clearToken() {
  [TOKEN_COOKIE, ...PROFILE_COOKIES].forEach(clearCookie);
}

/**
 * On page load: if the drop-in token is missing but this browser has signed in before,
 * restore the Auth0 session silently in the background (never blocks rendering) and announce
 * it on the event bus, which switches cart/checkout to the customer.
 */
export function syncShopSession() {
  if (hasShopToken()) return true;
  if (!hasSignedInBefore()) return false;
  (async () => {
    if (!await restoreSession(SHOP_AUTH_CONFIG_URL)) return;
    await storeToken();
    await emit('authenticated', true);
  })().catch(() => {});
  return false;
}

export async function signInToShop() {
  await signIn(SHOP_AUTH_CONFIG_URL);
  await storeToken();
  await emit('authenticated', true);
  return true;
}

export async function signOutOfShop() {
  clearToken();
  sessionStorage.removeItem('DROPINS_CART_ID');
  localStorage.setItem('wknd:cart-count', '0');
  await emit('authenticated', false).catch(() => {});
  await signOut(SHOP_AUTH_CONFIG_URL, { returnTo: `${window.location.origin}/shop` });
}

export { SHOP_AUTH_CONFIG_URL };
