/**
 * Signed-in state for WKND Adventures chrome (header account menu), readable on every page
 * without loading Auth0 or the drop-ins. Written by scripts/shop-auth.js on sign-in/out and
 * session restore; only the first name and initials are cached on this device.
 */
const KEY = 'wknd:account';
export const ACCOUNT_EVENT = 'wknd:account';
export const ACCOUNT_PATH = '/account';

/** @returns {{ firstName: string, initials: string } | null} */
export function getAccountState() {
  try {
    const state = JSON.parse(localStorage.getItem(KEY) || 'null');
    return state?.initials ? state : null;
  } catch {
    return null;
  }
}

function announce(state) {
  window.dispatchEvent(new CustomEvent(ACCOUNT_EVENT, { detail: state }));
}

/**
 * @param {{ given_name?: string, family_name?: string, name?: string, nickname?: string,
 *   email?: string }} profile
 */
export function setAccountState(profile) {
  // database (email/password) users often have their email as `name`; never show it as a name
  const realName = (v) => (v && !v.includes('@') ? v : '');
  const [first = '', ...rest] = realName(profile?.name).split(' ').filter(Boolean);
  const firstName = profile?.given_name || first || realName(profile?.nickname)
    || (profile?.email || '').split('@')[0];
  const lastName = profile?.family_name || rest.at(-1) || '';
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || 'W';
  const state = { firstName, initials };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* storage unavailable */ }
  announce(state);
  return state;
}

export function clearAccountState() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* storage unavailable */ }
  announce(null);
}
