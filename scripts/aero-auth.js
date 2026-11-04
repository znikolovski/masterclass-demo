import { loadScript } from './aem.js';

let clientPromise;
let clientApi;
let sessionPromise;
let loginPromise;
let authenticated = false;
let revision = 0;
const listeners = new Set();
const SDK_URL = 'https://cdn.auth0.com/js/auth0-spa-js/2.5/auth0-spa-js.production.js';

function updateSession(value) {
  revision += 1;
  authenticated = value;
  listeners.forEach((listener) => listener(authenticated));
}

export function subscribeToBookingAuth(listener) {
  listeners.add(listener);
  listener(authenticated);
  return () => listeners.delete(listener);
}

export function invalidateBookingAuth() {
  updateSession(false);
}

async function getClient(api) {
  if (clientPromise && clientApi !== api) {
    throw new Error('The checkout authentication endpoint changed. Reload this page.');
  }
  if (!clientPromise) {
    clientApi = api;
    clientPromise = (async () => {
      const response = await fetch(`${api}/api/auth/config`, {
        cache: 'no-store', signal: AbortSignal.timeout(10000),
      });
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
        cacheLocation: 'memory',
        useRefreshTokens: false,
        authorizationParams: {
          audience: config.audience,
          scope: 'openid bookings:create bookings:read',
          redirect_uri: `${window.location.origin}/book/flights`,
        },
      });
    })().catch((error) => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

export async function signInForBooking(api) {
  if (loginPromise) return loginPromise;
  // Open on the click, before network requests, so browsers do not block the popup.
  const popup = window.open('', 'wknd-customer-login', 'width=500,height=700');
  if (!popup) throw new Error('Allow the sign-in popup to continue.');
  loginPromise = (async () => {
    const client = await getClient(api);
    await client.loginWithPopup({}, { popup, timeoutInSeconds: 120 });
    updateSession(true);
  })().finally(() => {
    if (!popup.closed) popup.close();
    loginPromise = undefined;
  });
  return loginPromise;
}

export async function restoreBookingSession(api) {
  if (!sessionPromise) {
    const started = revision;
    sessionPromise = (async () => {
      const client = await getClient(api);
      await client.checkSession();
      const signedIn = await client.isAuthenticated();
      if (revision === started) updateSession(signedIn);
    })().catch((error) => {
      sessionPromise = undefined;
      throw error;
    });
  }
  await sessionPromise;
}

export async function signOutForBooking(api) {
  const client = await getClient(api);
  await client.logout({ logoutParams: { returnTo: window.location.origin } });
  updateSession(false);
}

export async function getBookingAccessToken(api) {
  const client = await getClient(api);
  try {
    return await client.getTokenSilently();
  } catch (error) {
    if (['login_required', 'consent_required', 'interaction_required'].includes(error.error)) {
      invalidateBookingAuth();
    }
    throw error;
  }
}
