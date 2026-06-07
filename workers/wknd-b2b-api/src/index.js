/**
 * WKND API — Cloudflare Worker for B2B auth/dashboard and document-based form submissions.
 * Demo security: PBKDF2 password hashing, signed JWT sessions, input validation.
 */

import { FORM_SCHEMAS, handleFormSubmit } from './forms.js';

const PBKDF2_ITERATIONS = 100_000;
const TOKEN_TTL_SEC = 86_400;
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

/**
 * @param {string} text
 */
function jsonResponse(text, status = 200, headers = {}) {
  return new Response(text, {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

/**
 * @param {object} data
 * @param {number} [status]
 * @param {Record<string, string>} [headers]
 */
function json(data, status = 200, headers = {}) {
  return jsonResponse(JSON.stringify(data), status, headers);
}

/**
 * @param {string} origin
 * @param {string} allowed
 */
function isAllowedOrigin(origin, allowed) {
  if (!origin) return false;
  const list = allowed.split(',').map((s) => s.trim()).filter(Boolean);
  if (list.includes(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    return hostname.endsWith('.aem.page') || hostname.endsWith('.aem.live');
  } catch {
    return false;
  }
}

/**
 * @param {Request} request
 * @param {object} env
 */
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = env.ALLOWED_ORIGINS || '';
  if (!isAllowedOrigin(origin, allowed)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * @param {string} email
 */
function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

/**
 * @returns {string}
 */
function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

/**
 * @param {string} password
 * @param {Uint8Array} salt
 */
async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    key,
    256,
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

/**
 * @param {string} password
 * @param {string} stored
 */
async function verifyPassword(password, stored) {
  const [saltB64, hashB64] = stored.split(':');
  if (!saltB64 || !hashB64) return false;
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const computed = await hashPassword(password, salt);
  return computed === hashB64;
}

/**
 * @param {string} password
 */
async function createPasswordHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPassword(password, salt);
  return `${btoa(String.fromCharCode(...salt))}:${hash}`;
}

/**
 * @param {object} env
 */
async function getJwtSecret(env) {
  return env.JWT_SECRET || 'wknd-b2b-demo-secret-change-in-production';
}

/**
 * @param {object} payload
 * @param {object} env
 */
async function signToken(payload, env) {
  const secret = await getJwtSecret(env);
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC,
  }));
  const data = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${data}.${signature}`;
}

/**
 * @param {string} token
 * @param {object} env
 */
async function verifyToken(token, env) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const secret = await getJwtSecret(env);
  const data = `${parts[0]}.${parts[1]}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const sig = Uint8Array.from(
    atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')),
    (c) => c.charCodeAt(0),
  );
  const valid = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(data));
  if (!valid) return null;
  const payload = JSON.parse(atob(parts[1]));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

/**
 * @param {Request} request
 * @param {object} env
 */
async function getAuthBusinessId(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const payload = await verifyToken(token, env);
  return payload?.businessId || null;
}

/**
 * @param {KVNamespace} kv
 * @param {string} ip
 */
async function checkRateLimit(kv, ip) {
  const key = `ratelimit:${ip}`;
  const raw = await kv.get(key);
  const now = Date.now();
  const entry = raw ? JSON.parse(raw) : { count: 0, windowStart: now };
  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count += 1;
  await kv.put(key, JSON.stringify(entry), { expirationTtl: 120 });
  return entry.count <= RATE_LIMIT_MAX;
}

/**
 * @param {object} body
 */
function validateRegistration(body) {
  const errors = [];
  if (!body.companyName?.trim() || body.companyName.length > 120) errors.push('Invalid company name');
  if (!body.contactName?.trim() || body.contactName.length > 120) errors.push('Invalid contact name');
  if (!isValidEmail(body.contactEmail)) errors.push('Invalid contact email');
  if (!isValidEmail(body.loginEmail)) errors.push('Invalid login email');
  if (!body.phone?.trim() || body.phone.length > 40) errors.push('Invalid phone');
  if (!body.password || body.password.length < 8 || body.password.length > 128) errors.push('Password must be 8–128 characters');
  if (body.password !== body.confirmPassword) errors.push('Passwords do not match');
  if (body.logoDataUrl) {
    if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(body.logoDataUrl)) {
      errors.push('Invalid logo format');
    } else {
      const b64 = body.logoDataUrl.split(',')[1] || '';
      const bytes = (b64.length * 3) / 4;
      if (bytes > MAX_LOGO_BYTES) errors.push('Logo exceeds 2MB');
    }
  }
  return errors;
}

/**
 * @param {Request} request
 * @param {object} env
 */
async function handleRegister(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!await checkRateLimit(env.WKND_B2B_DATA, ip)) {
    return json({ error: 'Too many requests' }, 429, corsHeaders(request, env));
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400, corsHeaders(request, env));
  }

  const errors = validateRegistration(body);
  if (errors.length) {
    return json({ error: 'Validation failed', details: errors }, 400, corsHeaders(request, env));
  }

  const emailKey = `business:email:${body.loginEmail.toLowerCase()}`;
  if (await env.WKND_B2B_DATA.get(emailKey)) {
    return json({ error: 'An account with this email already exists' }, 409, corsHeaders(request, env));
  }

  const businessId = newId('biz');
  const passwordHash = await createPasswordHash(body.password);
  const record = {
    businessId,
    companyName: body.companyName.trim(),
    logoUrl: body.logoDataUrl || '',
    contact: {
      name: body.contactName.trim(),
      email: body.contactEmail.trim().toLowerCase(),
      phone: body.phone.trim(),
    },
    loginEmail: body.loginEmail.trim().toLowerCase(),
    passwordHash,
    createdAt: new Date().toISOString(),
  };

  await env.WKND_B2B_DATA.put(`business:${businessId}`, JSON.stringify(record));
  await env.WKND_B2B_DATA.put(emailKey, businessId);
  await env.WKND_B2B_DATA.put(`adventures:${businessId}`, JSON.stringify([]));

  const token = await signToken({ businessId, email: record.loginEmail }, env);
  return json({
    businessId,
    companyName: record.companyName,
    token,
  }, 201, corsHeaders(request, env));
}

/**
 * @param {Request} request
 * @param {object} env
 */
async function handleLogin(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!await checkRateLimit(env.WKND_B2B_DATA, ip)) {
    return json({ error: 'Too many requests' }, 429, corsHeaders(request, env));
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400, corsHeaders(request, env));
  }

  if (!isValidEmail(body.email) || !body.password) {
    return json({ error: 'Invalid credentials' }, 401, corsHeaders(request, env));
  }

  const businessId = await env.WKND_B2B_DATA.get(`business:email:${body.email.toLowerCase()}`);
  if (!businessId) {
    return json({ error: 'Invalid credentials' }, 401, corsHeaders(request, env));
  }

  const raw = await env.WKND_B2B_DATA.get(`business:${businessId}`);
  if (!raw) {
    return json({ error: 'Invalid credentials' }, 401, corsHeaders(request, env));
  }

  const business = JSON.parse(raw);
  const valid = await verifyPassword(body.password, business.passwordHash);
  if (!valid) {
    return json({ error: 'Invalid credentials' }, 401, corsHeaders(request, env));
  }

  const token = await signToken({ businessId, email: business.loginEmail }, env);
  return json({
    token,
    business: {
      businessId: business.businessId,
      companyName: business.companyName,
      logoUrl: business.logoUrl,
      contact: business.contact,
    },
  }, 200, corsHeaders(request, env));
}

/**
 * @param {Request} request
 * @param {object} env
 */
async function handleGetAdventures(request, env) {
  const businessId = await getAuthBusinessId(request, env);
  if (!businessId) {
    return json({ error: 'Unauthorized' }, 401, corsHeaders(request, env));
  }

  const raw = await env.WKND_B2B_DATA.get(`adventures:${businessId}`);
  const adventures = raw ? JSON.parse(raw) : [];
  const businessRaw = await env.WKND_B2B_DATA.get(`business:${businessId}`);
  const business = businessRaw ? JSON.parse(businessRaw) : null;

  return json({
    business: business ? {
      businessId: business.businessId,
      companyName: business.companyName,
      logoUrl: business.logoUrl,
    } : null,
    adventures,
  }, 200, corsHeaders(request, env));
}

/**
 * @param {Request} request
 * @param {object} env
 */
async function handleCreateAdventure(request, env) {
  const businessId = await getAuthBusinessId(request, env);
  if (!businessId) {
    return json({ error: 'Unauthorized' }, 401, corsHeaders(request, env));
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400, corsHeaders(request, env));
  }

  if (!body.adventureName?.trim()) {
    return json({ error: 'Adventure name is required' }, 400, corsHeaders(request, env));
  }

  const key = `adventures:${businessId}`;
  const raw = await env.WKND_B2B_DATA.get(key);
  const adventures = raw ? JSON.parse(raw) : [];

  const record = {
    requestId: newId('req'),
    businessId,
    adventureName: body.adventureName.trim(),
    adventureType: (body.adventureType || 'general').trim(),
    teamSize: Number(body.teamSize) || 1,
    preferredDates: body.preferredDates || '',
    notes: body.notes || '',
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  adventures.unshift(record);
  await env.WKND_B2B_DATA.put(key, JSON.stringify(adventures));

  return json({ adventure: record }, 201, corsHeaders(request, env));
}

/**
 * @param {Request} request
 * @param {object} env
 * @param {string} requestId
 */
async function handlePatchAdventure(request, env, requestId) {
  const businessId = await getAuthBusinessId(request, env);
  if (!businessId) {
    return json({ error: 'Unauthorized' }, 401, corsHeaders(request, env));
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400, corsHeaders(request, env));
  }

  const allowed = new Set(['pending', 'current', 'archived']);
  if (!allowed.has(body.status)) {
    return json({ error: 'Invalid status' }, 400, corsHeaders(request, env));
  }

  const key = `adventures:${businessId}`;
  const raw = await env.WKND_B2B_DATA.get(key);
  const adventures = raw ? JSON.parse(raw) : [];
  const idx = adventures.findIndex((a) => a.requestId === requestId);
  if (idx < 0) {
    return json({ error: 'Not found' }, 404, corsHeaders(request, env));
  }

  adventures[idx] = {
    ...adventures[idx],
    status: body.status,
    updatedAt: new Date().toISOString(),
  };
  await env.WKND_B2B_DATA.put(key, JSON.stringify(adventures));

  return json({ adventure: adventures[idx] }, 200, corsHeaders(request, env));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (url.pathname === '/api/b2b/register' && request.method === 'POST') {
        return handleRegister(request, env);
      }
      if (url.pathname === '/api/b2b/login' && request.method === 'POST') {
        return handleLogin(request, env);
      }
      if (url.pathname === '/api/b2b/adventures' && request.method === 'GET') {
        return handleGetAdventures(request, env);
      }
      if (url.pathname === '/api/b2b/adventures' && request.method === 'POST') {
        return handleCreateAdventure(request, env);
      }
      const patchMatch = url.pathname.match(/^\/api\/b2b\/adventures\/([^/]+)$/);
      if (patchMatch && request.method === 'PATCH') {
        return handlePatchAdventure(request, env, patchMatch[1]);
      }
      if (url.pathname === '/api/b2b/health') {
        return json({ status: 'ok' }, 200, cors);
      }
      const formMatch = url.pathname.match(/^\/api\/forms\/([^/]+)$/);
      if (formMatch && request.method === 'POST' && FORM_SCHEMAS[formMatch[1]]) {
        return handleFormSubmit(request, env, formMatch[1], {
          json,
          corsHeaders,
          checkRateLimit,
        });
      }
      if (url.pathname === '/api/forms/health') {
        return json({ status: 'ok', forms: Object.keys(FORM_SCHEMAS) }, 200, cors);
      }

      return json({ error: 'Not found' }, 404, cors);
    } catch (err) {
      return json({ error: 'Internal error' }, 500, cors);
    }
  },
};
