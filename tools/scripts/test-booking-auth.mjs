#!/usr/bin/env node
/* eslint-env node, es2021 */
/* eslint-disable import/extensions, import/no-unresolved, no-console, max-len -- executable test assertions */
/* eslint-disable no-restricted-syntax, no-await-in-loop -- sequential assertions isolate mocked clock and signature counts */
import assert from 'node:assert/strict';
// eslint-disable-next-line import/no-relative-packages -- test the actual Worker helper
import flightTimes from '../../workers/wknd-aero-api/src/flight-times.js';
// eslint-disable-next-line import/no-relative-packages -- test the actual Worker helper
import { authenticateBooking } from '../../workers/wknd-aero-api/src/booking-auth.js';
import bookingAuthFixture from './lib/booking-auth-fixture.mjs';
import loadTestAeroWorker from './lib/load-test-aero-worker.mjs';

const worker = await loadTestAeroWorker();
const auth = await bookingAuthFixture();
const values = new Map();
const env = {
  ...auth.env,
  WKND_AERO_CATALOG: {
    get: async (key, type) => {
      const value = values.get(key);
      return value && type === 'json' ? JSON.parse(value) : value || null;
    },
    put: async (key, value) => values.set(key, value),
    list: async ({ prefix, cursor }) => {
      const keys = [...values.keys()].filter((key) => key.startsWith(prefix));
      const offset = cursor ? Number(Buffer.from(cursor, 'base64url').toString()) : 0;
      return {
        keys: keys.slice(offset, offset + 1).map((name) => ({ name })),
        list_complete: offset + 1 >= keys.length,
        cursor: Buffer.from(String(offset + 1)).toString('base64url'),
      };
    },
  },
};
const request = (path, token, method, body, delegated = false) => worker.fetch(new Request(`https://worker.test${path}`, {
  method: method || 'GET',
  headers: {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(delegated ? { 'X-WKND-Delegation': 'mcp' } : {}),
  },
  ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
}), env);

try {
  const a = await auth.token();
  const b = await auth.token('customer-b');
  assert.equal((await request('/api/bookings')).status, 401);
  assert.equal((await request('/api/bookings', 'invalid')).status, 401);
  assert.equal((await request('/api/bookings', await auth.token('a', 'other:read'))).status, 403);
  assert.equal((await request('/api/bookings', await auth.token('a', undefined, { audience: 'https://wrong.test' }))).status, 401);
  assert.equal((await request('/api/bookings', await auth.token('a', undefined, { issuer: 'https://wrong.test/' }))).status, 401);
  assert.equal((await request('/api/bookings', await auth.token('a', undefined, { expires: '1 second ago' }))).status, 401);
  const config = await request('/api/auth/config');
  assert.deepEqual(await config.json(), {
    issuer: auth.env.AUTH0_ISSUER, clientId: 'test-checkout', audience: auth.env.BOOKING_API_AUDIENCE,
  });
  assert.equal((await worker.fetch(new Request('https://worker.test/api/auth/config'), {})).status, 503);
  const { flights } = await (await request('/api/flights/search?origin=MEL&dest=PUQ&depart=2026-12-01')).json();
  const [flight] = flights;
  values.set('catalog:adventures:patagonia-trek', JSON.stringify({
    sku: 'patagonia-trek',
    name: 'Patagonia trek',
    editorialUrl: 'https://main--masterclass-demo--znikolovski.aem.live/blog/patagonia-trek',
  }));
  const body = {
    requestId: crypto.randomUUID(),
    quoteId: flight.quoteId,
    flightId: flight.id,
    passengerCount: 1,
    seats: ['2A'],
    passengers: [{ first: 'PRIVATE', last: 'PERSON', email: 'private@example.test' }],
    owner: 'customer-b',
    adventureId: 'patagonia-trek',
  };
  assert.equal((await request('/api/bookings', undefined, 'POST', body)).status, 401);
  const created = await request('/api/bookings', a, 'POST', body);
  assert.equal(created.status, 201);
  const booking = await created.json();
  assert.equal(booking.flight.departureAt, '2026-11-30T21:30:00.000Z');
  assert.equal(booking.flight.arrivalAt, '2026-12-01T02:50:00.000Z');
  assert.equal(booking.flight.originTimeZone, 'Australia/Melbourne');
  assert.equal(booking.adventure.id, 'patagonia-trek');
  assert(booking.preparation.itinerary.length > 0);
  assert(booking.preparation.packingList.length > 0);
  assert(booking.preparation.permits.length > 0);
  assert(booking.preparation.sourceUrl.endsWith('/blog/patagonia-trek'));
  assert.equal((await request(`/api/bookings/${booking.id}`, b)).status, 404);
  assert.equal((await request(`/api/bookings/${booking.id}`)).status, 401);
  values.set(`booking:${booking.id}`, JSON.stringify(booking));
  assert.equal((await request(`/api/bookings/${booking.id}`, b)).status, 404);
  const detail = await request(`/api/bookings/${booking.id}`, a);
  assert.equal(detail.status, 200);
  assert.equal(detail.headers.get('Cache-Control'), 'no-store');
  assert(!JSON.stringify(await detail.json()).includes('PRIVATE'));
  assert.equal((await request('/api/bookings', a, 'POST', body)).status, 200);
  assert.equal((await request('/api/bookings', a, 'POST', { ...body, seats: ['3A'] })).status, 409);
  const second = await request('/api/bookings', a, 'POST', { ...body, requestId: crypto.randomUUID() });
  assert.equal(second.status, 201);
  const firstPage = await (await request('/api/bookings', a)).json();
  assert.equal(firstPage.bookings.length, 1);
  assert(firstPage.nextCursor);
  assert(!JSON.stringify(firstPage).includes('private@example.test'));
  const next = await (await request(`/api/bookings?cursor=${firstPage.nextCursor}`, a)).json();
  assert.equal(next.bookings.length, 1);
  assert.equal(next.nextCursor, null);
  assert.deepEqual((await (await request('/api/bookings', b)).json()).bookings, []);
  assert.equal((await request('/api/bookings?cursor=bad!', a)).status, 400);
  const assertion = await auth.delegated();
  assert.equal((await request(`/api/bookings/${booking.id}`, assertion, 'GET', undefined, true)).status, 200);
  assert.equal((await request(`/api/bookings/${booking.id}`, assertion)).status, 401);
  assert.equal((await request('/api/bookings', assertion, 'POST', body, true)).status, 403);
  assert.equal((await request('/api/bookings', await auth.delegated('customer-b'), 'GET', undefined, true)).status, 200);
  assert.equal((await request(`/api/bookings/${booking.id}`, await auth.delegated('customer-b'), 'GET', undefined, true)).status, 404);
  assert.equal((await request('/api/bookings', await auth.delegated('customer-a', { identity_issuer: 'https://wrong.test/' }), 'GET', undefined, true)).status, 401);
  assert.equal((await request('/api/bookings', `${assertion.slice(0, -5)}aaaaa`, 'GET', undefined, true)).status, 401);
  const previousSecret = 'test-only-previous-assertion-key-at-least-32-bytes';
  const deadline = Math.floor(Date.now() / 1000) + 120;
  const rotationEnv = {
    ...auth.env,
    WKND_BOOKING_ASSERTION_PREVIOUS_SECRET: previousSecret,
    WKND_BOOKING_ASSERTION_PREVIOUS_EXPIRES_AT: String(deadline),
  };
  const verifyAssertion = (token, bindings = rotationEnv, scope = 'bookings:read', delegated = true) => authenticateBooking(new Request('https://worker.test/api/bookings', {
    headers: { Authorization: `Bearer ${token}`, ...(delegated ? { 'X-WKND-Delegation': 'mcp' } : {}) },
  }), bindings, scope);
  const oldAssertion = await auth.delegated('customer-a', {}, { secret: previousSecret });
  const currentAccount = await verifyAssertion(assertion);
  assert.deepEqual(await verifyAssertion(oldAssertion), currentAccount);
  assert.deepEqual(await verifyAssertion(a, rotationEnv, 'bookings:read', false), currentAccount);
  assert.deepEqual(await verifyAssertion(assertion, { ...auth.env, WKND_BOOKING_ASSERTION_PREVIOUS_SECRET: '', WKND_BOOKING_ASSERTION_PREVIOUS_EXPIRES_AT: '' }), currentAccount);
  const whitespacePrimary = ` ${auth.env.WKND_BOOKING_ASSERTION_SECRET} `;
  const whitespaceAssertion = await auth.delegated('customer-a', {}, { secret: whitespacePrimary });
  assert.deepEqual(await verifyAssertion(whitespaceAssertion, { ...auth.env, WKND_BOOKING_ASSERTION_SECRET: whitespacePrimary }), currentAccount);
  await assert.rejects(verifyAssertion(oldAssertion, auth.env), { status: 401 });
  await assert.rejects(verifyAssertion(await auth.delegated('customer-a', {}, { secret: 'test-only-unknown-assertion-key-at-least-32-bytes' })), { status: 401 });
  for (const token of [assertion, oldAssertion]) {
    await assert.rejects(verifyAssertion(token, rotationEnv, 'bookings:create'), { status: 403 });
  }
  const originalNow = Date.now;
  try {
    for (const offset of [-1, 0, 1]) {
      Date.now = () => deadline * 1000 + offset;
      if (offset < 0) assert.deepEqual(await verifyAssertion(oldAssertion), currentAccount);
      else await assert.rejects(verifyAssertion(oldAssertion), { status: 401 });
      assert.deepEqual(await verifyAssertion(assertion), currentAccount);
    }
  } finally {
    Date.now = originalNow;
  }
  const invalidConfigurations = [
    { WKND_BOOKING_ASSERTION_PREVIOUS_SECRET: '' },
    { WKND_BOOKING_ASSERTION_PREVIOUS_SECRET: 'short' },
    { WKND_BOOKING_ASSERTION_PREVIOUS_SECRET: auth.env.WKND_BOOKING_ASSERTION_SECRET },
    { WKND_BOOKING_ASSERTION_PREVIOUS_SECRET: 123 },
    { WKND_BOOKING_ASSERTION_PREVIOUS_SECRET: `${previousSecret} ` },
    { WKND_BOOKING_ASSERTION_PREVIOUS_EXPIRES_AT: undefined },
    { WKND_BOOKING_ASSERTION_PREVIOUS_EXPIRES_AT: '' },
    { WKND_BOOKING_ASSERTION_PREVIOUS_EXPIRES_AT: 'tomorrow' },
    { WKND_BOOKING_ASSERTION_PREVIOUS_EXPIRES_AT: '0' },
    { WKND_BOOKING_ASSERTION_PREVIOUS_EXPIRES_AT: '1.5' },
    { WKND_BOOKING_ASSERTION_PREVIOUS_EXPIRES_AT: deadline },
    { WKND_BOOKING_ASSERTION_PREVIOUS_EXPIRES_AT: '9007199254740992' },
    { WKND_BOOKING_ASSERTION_SECRET: '' },
    { WKND_BOOKING_ASSERTION_SECRET: 'short' },
    { WKND_BOOKING_ASSERTION_SECRET: 123 },
    { WKND_BOOKING_ASSERTION_SECRET: whitespacePrimary },
  ];
  for (const invalid of invalidConfigurations) {
    const bindings = { ...rotationEnv, ...invalid };
    await assert.rejects(verifyAssertion(assertion, bindings), { status: 503 });
    assert.deepEqual(await verifyAssertion(a, bindings, 'bookings:read', false), currentAccount);
  }
  const originalVerify = crypto.subtle.verify;
  let signatureChecks = 0;
  crypto.subtle.verify = function countVerifications(...args) {
    signatureChecks += 1;
    return originalVerify.apply(this, args);
  };
  try {
    const issuedAt = Math.floor(Date.now() / 1000);
    const invalidClaims = [
      [{ identity_issuer: 'https://wrong.test/' }, {}],
      [{ scope: 'other:read' }, {}],
      [{}, { issuer: 'https://wrong.test/' }],
      [{}, { audience: 'https://wrong.test' }],
      [{}, { issuedAt: issuedAt - 120, expires: issuedAt - 60 }],
      [{}, { issuedAt: issuedAt - 61, expires: issuedAt + 1 }],
      [{}, { issuedAt, expires: issuedAt + 61 }],
    ];
    for (const secret of [auth.env.WKND_BOOKING_ASSERTION_SECRET, previousSecret]) {
      for (const [claims, options] of invalidClaims) {
        const token = await auth.delegated('customer-a', claims, { ...options, secret });
        signatureChecks = 0;
        await assert.rejects(verifyAssertion(token), { status: claims.scope ? 403 : 401 });
        assert.equal(signatureChecks, secret === previousSecret ? 2 : 1, 'Only a signature mismatch may retry the previous key');
      }
    }
    signatureChecks = 0;
    Date.now = () => deadline * 1000 - 1;
    crypto.subtle.verify = async function crossDeadline(...args) {
      signatureChecks += 1;
      const result = await originalVerify.apply(this, args);
      if (signatureChecks === 2) Date.now = () => deadline * 1000;
      return result;
    };
    await assert.rejects(verifyAssertion(oldAssertion), { status: 401 });
  } finally {
    Date.now = originalNow;
    crypto.subtle.verify = originalVerify;
  }
  values.delete(`flight-quote:${flight.quoteId}`);
  assert.equal((await request(`/api/bookings/${booking.id}`, a)).status, 200);
  assert.equal((await request('/api/bookings', a, 'POST', { ...body, requestId: crypto.randomUUID() })).status, 409);
  assert.equal((await request('/api/flights/search?depart=2026-02-30')).status, 400);
  const unknown = flightTimes('ZZZ', 'ZZZ', '2026-12-01 08:30', 320);
  assert.equal(unknown.departureAt, null);
  assert.equal(unknown.arrivalAt, null);
  const winter = flightTimes('JFK', 'GVA', '2026-11-01 19:00', 480);
  assert.equal(winter.departureAt, '2026-11-02T00:00:00.000Z');
  assert.equal(winter.arrivalAt, '2026-11-02T08:00:00.000Z');
  console.log('PASS authenticated checkout, ownership isolation, private pagination, delegated MCP reads, deadline-bounded key rotation, legacy isolation, durable snapshots and time zones');
} finally {
  auth.restore();
}
