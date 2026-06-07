const SESSION_KEY = 'wknd-b2b-session';
const DEFAULT_API = 'https://wknd-b2b-api.wknd-adventures.workers.dev';

/**
 * @param {string} name
 */
function getPageMetadata(name) {
  const block = document.querySelector('main .metadata');
  if (!block) return '';
  const row = [...block.children].find(
    (r) => r.children[0]?.textContent?.trim().toLowerCase() === name.toLowerCase(),
  );
  return row?.children[1]?.textContent?.trim() || '';
}

/**
 * Resolve B2B API base URL from page metadata or block override.
 * @param {string} [override]
 */
export function getApiBase(override) {
  if (override?.trim()) return override.replace(/\/$/, '');
  const headMeta = document.querySelector('meta[name="b2b-api"]');
  if (headMeta?.content?.trim()) return headMeta.content.trim().replace(/\/$/, '');
  const pageMeta = getPageMetadata('b2b-api');
  if (pageMeta) return pageMeta.replace(/\/$/, '');
  return DEFAULT_API;
}

/**
 * @returns {string|null}
 */
export function getSessionToken() {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

/**
 * @param {string} token
 */
export function setSessionToken(token) {
  sessionStorage.setItem(SESSION_KEY, token);
}

export function clearSessionToken() {
  sessionStorage.removeItem(SESSION_KEY);
}

/**
 * @param {string} base
 * @param {string} path
 * @param {RequestInit} [init]
 */
async function apiFetch(base, path, init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getSessionToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${base}${path}`, { ...init, headers });
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/**
 * @param {string} base
 * @param {object} payload
 */
export async function registerBusiness(base, payload) {
  return apiFetch(base, '/api/b2b/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * @param {string} base
 * @param {string} email
 * @param {string} password
 */
export async function loginBusiness(base, email, password) {
  const data = await apiFetch(base, '/api/b2b/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (data?.token) setSessionToken(data.token);
  return data;
}

/**
 * @param {string} base
 */
export async function fetchAdventures(base) {
  return apiFetch(base, '/api/b2b/adventures');
}

/**
 * @param {string} base
 * @param {object} payload
 */
export async function createAdventureRequest(base, payload) {
  return apiFetch(base, '/api/b2b/adventures', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * @param {string} base
 * @param {string} requestId
 * @param {string} status
 */
export async function updateAdventureStatus(base, requestId, status) {
  return apiFetch(base, `/api/b2b/adventures/${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
