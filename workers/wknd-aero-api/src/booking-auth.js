import { createRemoteJWKSet, jwtVerify } from 'jose';

export class BookingAuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.status = status;
  }
}

const keySets = new Map();

function assertionKeys(env) {
  const encoder = new TextEncoder();
  const validSecret = (value) => typeof value === 'string'
    && value.trim() === value && encoder.encode(value).length >= 32;
  const current = env.WKND_BOOKING_ASSERTION_SECRET;
  const previous = env.WKND_BOOKING_ASSERTION_PREVIOUS_SECRET;
  const deadline = env.WKND_BOOKING_ASSERTION_PREVIOUS_EXPIRES_AT;
  if (!env.MCP_RESOURCE || typeof current !== 'string' || encoder.encode(current).length < 32) {
    throw new BookingAuthError('Booking delegation is not configured.', 503);
  }
  if ((previous === undefined || previous === '') && (deadline === undefined || deadline === '')) {
    return { current: encoder.encode(current) };
  }
  if (!validSecret(current) || !validSecret(previous) || previous === current
    || typeof deadline !== 'string' || !/^[1-9]\d*$/.test(deadline)
    || !Number.isSafeInteger(Number(deadline))) {
    throw new BookingAuthError('Booking delegation rotation is not configured.', 503);
  }
  return {
    current: encoder.encode(current),
    previous: encoder.encode(previous),
    expiresAt: Number(deadline),
  };
}

export async function authenticateBooking(request, env, scope) {
  const issuer = env.AUTH0_ISSUER;
  const audience = env.BOOKING_API_AUDIENCE;
  if (!issuer || !audience) {
    throw new BookingAuthError('Booking authentication is not configured.', 503);
  }
  const token = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) throw new BookingAuthError('Sign in to access your bookings.');

  // Only read requests accept delegated MCP assertions. Checkout uses Auth0 directly.
  const delegated = request.headers.get('X-WKND-Delegation') === 'mcp';
  let payload;
  try {
    if (delegated) {
      if (scope !== 'bookings:read') throw new BookingAuthError('Read-only delegation.', 403);
      const keys = assertionKeys(env);
      const options = {
        algorithms: ['HS256'],
        issuer: env.MCP_RESOURCE,
        audience,
        requiredClaims: ['sub', 'iat', 'exp', 'jti'],
        maxTokenAge: '60s',
      };
      try {
        ({ payload } = await jwtVerify(token, keys.current, options));
      } catch (error) {
        // Never retry claim/expiry failures, and never extend the absolute cutoff.
        if (error.code !== 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED'
          || !keys.previous || Date.now() / 1000 >= keys.expiresAt) throw error;
        ({ payload } = await jwtVerify(token, keys.previous, options));
        if (Date.now() / 1000 >= keys.expiresAt) {
          throw new BookingAuthError('Invalid or expired booking credentials.');
        }
      }
      if (payload.identity_issuer !== issuer || payload.exp - payload.iat > 60) {
        throw new BookingAuthError('Invalid delegated identity.');
      }
    } else {
      if (!keySets.has(issuer)) {
        keySets.set(issuer, createRemoteJWKSet(new URL('.well-known/jwks.json', issuer)));
      }
      ({ payload } = await jwtVerify(token, keySets.get(issuer), {
        algorithms: ['RS256'], issuer, audience, requiredClaims: ['sub', 'exp'],
      }));
    }
  } catch (error) {
    if (error instanceof BookingAuthError) throw error;
    if (error.code === 'ERR_JWKS_TIMEOUT' || error instanceof TypeError) {
      throw new BookingAuthError('The identity provider is temporarily unavailable.', 503);
    }
    throw new BookingAuthError('Invalid or expired booking credentials.');
  }
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 256) {
    throw new BookingAuthError('Missing customer identity.');
  }
  if (typeof payload.scope !== 'string' || !payload.scope.split(' ').includes(scope)) {
    throw new BookingAuthError('Booking permission is required.', 403);
  }
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([issuer, payload.sub])));
  const accountKey = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
  return { accountKey };
}

export function checkoutAuthConfig(env) {
  if (!env.AUTH0_ISSUER || !env.AUTH0_CHECKOUT_CLIENT_ID || !env.BOOKING_API_AUDIENCE) {
    throw new BookingAuthError('Website sign-in is not configured yet.', 503);
  }
  return {
    issuer: env.AUTH0_ISSUER,
    clientId: env.AUTH0_CHECKOUT_CLIENT_ID,
    audience: env.BOOKING_API_AUDIENCE,
  };
}
