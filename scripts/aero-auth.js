/**
 * WKND Aero booking sign-in — thin wrapper over the shared WKND customer sign-in
 * (scripts/wknd-auth.js), which the WKND Shop also uses.
 */
import {
  getAccessToken, invalidateAuth, restoreSession, signIn, signOut, subscribeToAuth,
} from './wknd-auth.js';

const configUrl = (api) => `${api}/api/auth/config`;

export const subscribeToBookingAuth = subscribeToAuth;
export const invalidateBookingAuth = invalidateAuth;
export const signInForBooking = (api) => signIn(configUrl(api));
export const restoreBookingSession = (api) => restoreSession(configUrl(api)).then(() => undefined);
export const signOutForBooking = (api) => signOut(configUrl(api));
export const getBookingAccessToken = (api) => getAccessToken(configUrl(api));
