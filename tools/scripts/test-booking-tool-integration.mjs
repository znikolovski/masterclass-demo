#!/usr/bin/env node
/* eslint-env node, es2021 */
/* eslint-disable import/extensions, import/no-dynamic-require, no-console, max-len -- cross-repository integration */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import bookingAuthFixture from './lib/booking-auth-fixture.mjs';
import loadTestAeroWorker from './lib/load-test-aero-worker.mjs';

const require = createRequire(import.meta.url);
const handlerPath = resolve(process.argv[2] || '../masterclass-demo-llmapp/actions/check-booking/index.js');
const handler = require(handlerPath);
const auth = await bookingAuthFixture({
  issuer: 'https://dev-g4kzp3zwgwzs8oha.us.auth0.com/',
  audience: 'https://wknd-aero-api.jaggah.workers.dev',
  resource: 'https://28538-wkndsherpa.adobeio-static.net/api/v1/web/llm-apps/mcp',
});
const worker = await loadTestAeroWorker();
const values = new Map();
const env = {
  ...auth.env,
  WKND_AERO_CATALOG: {
    put: async (key, value) => values.set(key, value),
    get: async (key, type) => {
      const value = values.get(key);
      return value && type === 'json' ? JSON.parse(value) : value || null;
    },
    list: async ({ prefix }) => ({
      keys: [...values.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })),
      list_complete: true,
    }),
  },
};
const jwksFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url).startsWith(env.BOOKING_API_AUDIENCE)) {
    return worker.fetch(new Request(url, options), env);
  }
  if (String(url) === `${env.AUTH0_ISSUER}.well-known/jwks.json`) return jwksFetch(url, options);
  throw new Error('Unexpected external request in booking integration test.');
};
try {
  const [flight] = (await (await worker.fetch(new Request(`${env.BOOKING_API_AUDIENCE}/api/flights/search?origin=MEL&dest=PUQ&depart=2026-12-01`), env)).json()).flights;
  const token = await auth.token();
  const created = await worker.fetch(new Request(`${env.BOOKING_API_AUDIENCE}/api/bookings`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      requestId: crypto.randomUUID(),
      quoteId: flight.quoteId,
      flightId: flight.id,
      passengerCount: 1,
      seats: ['2A'],
      passengers: [{ first: 'PRIVATE', last: 'PERSON', email: 'private@example.test' }],
    }),
  }), env);
  assert.equal(created.status, 201);
  const booking = await created.json();
  const extra = {
    authInfo: {
      resource: env.MCP_RESOURCE,
      scopes: ['bookings:read'],
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      extra: { sub: 'customer-a', iss: env.AUTH0_ISSUER },
    },
    variables: { WKND_BOOKING_ASSERTION_SECRET: env.WKND_BOOKING_ASSERTION_SECRET },
  };
  const details = await handler({ booking_id: booking.id }, extra);
  assert(!details.isError, JSON.stringify(details));
  assert.equal(details.structuredContent.booking.id, booking.id);
  assert.equal(details.structuredContent.booking.flight.departureAt, booking.flight.departureAt);
  assert(!JSON.stringify(details).includes('PRIVATE'));
  assert(!JSON.stringify(details).includes('private@example.test'));
  assert(!JSON.stringify(details).includes(token));
  const listed = await handler({}, extra);
  assert.equal(listed.structuredContent.bookings[0].id, booking.id);
  const denied = await handler({ booking_id: booking.id }, {
    ...extra, authInfo: { ...extra.authInfo, extra: { sub: 'customer-b', iss: env.AUTH0_ISSUER } },
  });
  assert.equal(denied.isError, true);
  assert.equal(denied.structuredContent.error.status, 404);
  console.log('PASS website-issued identity → real companion handler → signed delegation → same-owner Worker lookup, listing and cross-account denial');
} finally {
  auth.restore();
}
