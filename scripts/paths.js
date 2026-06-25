/** @see docs/DRY-ANALYSIS.md */

const WKND_TITLE_SUFFIX = /\s+—\s+WKND Adventures$/i;

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isSafePath(path) {
  return typeof path === 'string' && /^\/[a-z0-9\-/]*$/i.test(path);
}

/**
 * @param {string} title
 * @returns {string}
 */
export function stripWkndTitleSuffix(title) {
  const raw = (title || '').trim();
  if (!raw) return '';
  return raw.replace(WKND_TITLE_SUFFIX, '').trim() || raw;
}

/**
 * @param {string} path
 * @param {string} param
 * @param {string} value
 * @returns {string}
 */
export function buildPathWithQueryParam(path, param, value) {
  if (!isSafePath(path)) return '#';
  const url = new URL(path, window.location.origin);
  url.searchParams.set(param, value);
  return `${url.pathname}${url.search}`;
}
