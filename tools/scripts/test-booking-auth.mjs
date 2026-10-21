#!/usr/bin/env node
/* eslint-env node, es2021 */
/* eslint-disable import/extensions, import/no-unresolved, no-console, max-len -- executable test assertions */
import assert from 'node:assert/strict';
// eslint-disable-next-line import/no-relative-packages -- test the actual Worker helper
import flightTimes from '../../workers/wknd-aero-api/src/flight-times.js';
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
  console.log('PASS authenticated checkout, ownership isolation, private pagination, delegated MCP reads, legacy isolation, durable snapshots and time zones');
} finally {
  auth.restore();
}
