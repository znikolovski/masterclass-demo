/* eslint-env node, es2021 */
/* eslint-disable import/no-relative-packages -- use the Worker's installed verifier */
import {
  generateKeyPair, exportJWK, SignJWT,
} from '../../../workers/wknd-aero-api/node_modules/jose/dist/webapi/index.js';

export default async function bookingAuthFixture(settings = {}) {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'test-booking-key', alg: 'RS256' };
  const issuer = settings.issuer || 'https://booking-auth.test/';
  const audience = settings.audience || 'https://worker.test';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, ...args) => {
    if (String(input) === `${issuer}.well-known/jwks.json`) {
      return Response.json({ keys: [jwk] });
    }
    return originalFetch(input, ...args);
  };
  const secret = 'test-only-delegation-secret-at-least-32-bytes';
  const env = {
    AUTH0_ISSUER: issuer,
    AUTH0_CHECKOUT_CLIENT_ID: 'test-checkout',
    BOOKING_API_AUDIENCE: audience,
    MCP_RESOURCE: settings.resource || 'https://mcp.test/mcp',
    WKND_BOOKING_ASSERTION_SECRET: secret,
  };
  const token = (sub = 'customer-a', scope = 'bookings:create bookings:read', options = {}) => new SignJWT({ scope })
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
    .setSubject(sub)
    .setIssuer(options.issuer || issuer)
    .setAudience(options.audience || audience)
    .setIssuedAt()
    .setExpirationTime(options.expires || '5m')
    .sign(privateKey);
  const delegated = (sub = 'customer-a', overrides = {}) => new SignJWT({
    identity_issuer: issuer, scope: 'bookings:read', ...overrides,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(sub)
    .setIssuer(env.MCP_RESOURCE)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('60s')
    .setJti(crypto.randomUUID())
    .sign(new TextEncoder().encode(secret));
  return {
    env,
    token,
    delegated,
    restore: () => { globalThis.fetch = originalFetch; },
  };
}
