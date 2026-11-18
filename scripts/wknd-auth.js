/**
 * Shared WKND customer sign-in (Auth0 SPA SDK) for WKND Aero bookings and the WKND Shop.
 * One Auth0 client per page, created from a config endpoint returning
 * { issuer, clientId, audience } (Aero worker /api/auth/config or the shop auth-config action —
 * both serve the same tenant, client and API audience).
 */
import { loadScript } from './aem.js';

const SDK_URL = 'https://cdn.auth0.com/js/auth0-spa-js/2.5/auth0-spa-js.production.js';
// profile/email let the shop backend resolve the customer's name and email via /userinfo.
const SCOPE = 'openid profile email bookings:create bookings:read';

let clientPromise;
let clientConfigUrl;
let sessionPromise;
let loginPromise;
let authenticated = false;
let revision = 0;
const listeners = new Set();

const SIGNED_IN_HINT = 'wknd:signed-in';
// Per-site client options (configureAuth). Sign-in is popup-only, so nothing is ever loaded at
// the callback URL; Auth0 still requires it to be an Allowed Callback URL. Aero keeps its
// booking page and in-memory tokens; WKND Adventures sets /account and persists the session.
const clientOptions = { callbackPath: '/book/flights', persist: false };

/**
 * Configure this page's Auth0 client; call before the first sign-in/session call.
 * @param {{ callbackPath?: string, persist?: boolean }} opts persist = rotating refresh tokens
 *   cached in localStorage, so the session survives reloads in browsers that block third-party
 *   cookies (falls back to silent iframe auth when the tenant issues no refresh token)
 */
export function configureAuth(opts) {
  Object.assign(clientOptions, opts);
}

function updateSession(value) {
  revision += 1;
  authenticated = value;
  // hint lets pages skip a silent Auth0 round trip for visitors who never signed in
  try {
    if (value) localStorage.setItem(SIGNED_IN_HINT, '1');
    else localStorage.removeItem(SIGNED_IN_HINT);
  } catch { /* storage unavailable */ }
  listeners.forEach((listener) => listener(authenticated));
}

export function hasSignedInBefore() {
  try {
    return localStorage.getItem(SIGNED_IN_HINT) === '1';
  } catch {
    return false;
  }
}

export function isSignedIn() {
  return authenticated;
}

export function subscribeToAuth(listener) {
  listeners.add(listener);
  listener(authenticated);
  return () => listeners.delete(listener);
}

export function invalidateAuth() {
  updateSession(false);
}

async function createClient(configUrl) {
  const response = await fetch(configUrl, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Website sign-in is not configured or is unavailable.');
  const config = await response.json();
  const issuer = new URL(config.issuer);
  if (issuer.protocol !== 'https:' || !config.clientId || !config.audience) {
    throw new Error('Website sign-in configuration is invalid.');
  }
  try {
    await loadScript(SDK_URL);
  } catch {
    document.querySelector(`script[src="${SDK_URL}"]`)?.remove();
    throw new Error('Unable to load secure sign-in. Check your connection and retry.');
  }
  if (!window.auth0?.Auth0Client) throw new Error('Unable to load secure sign-in.');
  return new window.auth0.Auth0Client({
    domain: issuer.host,
    clientId: config.clientId,
    cacheLocation: clientOptions.persist ? 'localstorage' : 'memory',
    useRefreshTokens: clientOptions.persist,
    useRefreshTokensFallback: clientOptions.persist,
    authorizationParams: {
      audience: config.audience,
      scope: SCOPE,
      redirect_uri: new URL(clientOptions.callbackPath, window.location.origin).href,
    },
  });
}

/** The first config endpoint used on a page wins; all endpoints serve the same tenant. */
export async function getAuthClient(configUrl) {
  if (!clientPromise) {
    clientConfigUrl = configUrl;
    clientPromise = createClient(configUrl).catch((error) => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

export function getAuthConfigUrl() {
  return clientConfigUrl;
}

/**
 * @param {string} configUrl
 * @param {{ signup?: boolean }} [opts] signup opens Auth0's sign-up screen instead of log-in
 */
export async function signIn(configUrl, { signup = false } = {}) {
  if (loginPromise) return loginPromise;
  // Open on the click, before network requests, so browsers do not block the popup.
  const popup = window.open('', 'wknd-customer-login', 'width=500,height=700');
  if (!popup) throw new Error('Allow the sign-in popup to continue.');
  loginPromise = (async () => {
    const client = await getAuthClient(configUrl);
    await client.loginWithPopup(
      signup ? { authorizationParams: { screen_hint: 'signup' } } : {},
      { popup, timeoutInSeconds: 120 },
    );
    updateSession(true);
  })().finally(() => {
    if (!popup.closed) popup.close();
    loginPromise = undefined;
  });
  return loginPromise;
}

export async function restoreSession(configUrl) {
  if (!sessionPromise) {
    const started = revision;
    sessionPromise = (async () => {
      const client = await getAuthClient(configUrl);
      await client.checkSession();
      const signedIn = await client.isAuthenticated();
      if (revision === started) updateSession(signedIn);
    })().catch((error) => {
      sessionPromise = undefined;
      throw error;
    });
  }
  await sessionPromise;
  return authenticated;
}

export async function signOut(configUrl, { returnTo = window.location.origin } = {}) {
  const client = await getAuthClient(configUrl);
  await client.logout({ logoutParams: { returnTo } });
  // only after a successful logout — a failed logout must not falsely clear the session
  updateSession(false);
}

export async function getAccessToken(configUrl, options) {
  const client = await getAuthClient(configUrl);
  try {
    return await client.getTokenSilently(options);
  } catch (error) {
    if (['login_required', 'consent_required', 'interaction_required'].includes(error.error)) {
      invalidateAuth();
    }
    throw error;
  }
}

export async function getUserProfile(configUrl) {
  const client = await getAuthClient(configUrl);
  return client.getUser();
}
