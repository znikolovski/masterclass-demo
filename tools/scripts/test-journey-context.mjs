#!/usr/bin/env node
/* eslint-env node, es2021 */
/* eslint-disable no-underscore-dangle, max-len, no-console -- Adobe test payloads */
import assert from 'node:assert/strict';
import {
  normalizeJourney, addJourneyToUrl, journeyFromUrl, sanitizeJourneyUrl, JOURNEY_TTL,
} from '../../scripts/journey-context.js';
import { journeyEventPayload, mapJourneyToAnalytics } from '../../scripts/journey-analytics.js';
import loadTestAeroWorker from './lib/load-test-aero-worker.mjs'; // eslint-disable-line import/extensions
import bookingAuthFixture from './lib/booking-auth-fixture.mjs'; // eslint-disable-line import/extensions

const worker = await loadTestAeroWorker();

const context = {
  id: crypto.randomUUID(),
  createdAt: Date.now(),
  source: 'llm-app',
  tool: 'discover_adventures',
  assisted: false,
  adventure: 'patagonia-peaks',
};
const destination = 'https://main--wknd-aero--znikolovski.aem.live/book/flights?dest=PUQ&adv=patagonia-peaks';
const normalized = normalizeJourney({ ...context, prompt: 'PRIVATE', email: 'PRIVATE' });
assert(!JSON.stringify(normalized).includes('PRIVATE'));
assert.equal(normalizeJourney({ ...context, id: 'a-person@example.com' }), null);
assert.equal(normalizeJourney({ ...context, createdAt: Date.now() - JOURNEY_TTL }), null);
assert.equal(normalizeJourney({ ...context, createdAt: Date.now() + 120000 }), null);
assert.equal(normalizeJourney({ ...context, tool: 'PRIVATE' }), null);
assert.equal(normalizeJourney({ ...context, assisted: 'yes' }), null);
const url = new URL(addJourneyToUrl(`${destination}&adobe_mc=OLD`, context));
assert.equal(url.searchParams.get('dest'), 'PUQ');
assert.equal(url.searchParams.get('adobe_mc'), null);
assert.deepEqual(journeyFromUrl(url), normalized);
assert.equal(addJourneyToUrl('https://example.com/?dest=PUQ', context), 'https://example.com/?dest=PUQ');
assert.equal(addJourneyToUrl('javascript:alert(1)', context), 'javascript:alert(1)'); // eslint-disable-line no-script-url
const privateUrl = 'https://wknd-adventures.run.place/of1?q=PRIVATE&llm_app_ctx=PRIVATE&adobe_mc=PRIVATE#sherpa?prompt=PRIVATE';
assert(!sanitizeJourneyUrl(privateUrl).includes('PRIVATE'));
globalThis.window = { location: { href: destination } };
const confirmation = {
  id: 'BK_0123456789abcdef',
  status: 'confirmed',
  total: 1150.25,
  currency: 'USD',
  demo: true,
  passengers: [{ first: 'PRIVATE', email: 'PRIVATE' }],
};
const payload = journeyEventPayload('bookingComplete', { booking: confirmation }, context);
payload.data.__adobe = { analytics: { events: 'event1' } };
payload.xdm.web.webPageDetails = { URL: privateUrl };
mapJourneyToAnalytics(payload);
assert.equal(payload.data.__adobe.analytics.events, 'event1,event40:BK_0123456789abcdef');
assert.equal(payload.data.__adobe.analytics.eVar30, context.id);
assert.equal(payload.data.__adobe.analytics.eVar33, 'unassisted');
assert.equal(payload.data.__adobe.analytics.currencyCode, 'USD');
assert.equal(payload.xdm.commerce.order.priceTotal, 1150.25);
assert.equal(payload.xdm.commerce.purchases, undefined);
assert(!JSON.stringify(payload).includes('PRIVATE'));
assert.throws(() => journeyEventPayload('bookingComplete', {
  booking: { ...confirmation, status: 'pending' },
}, context));
assert.throws(() => journeyEventPayload('madeUp', {}, context));
const unrelated = { data: { __adobe: { analytics: {} } }, xdm: {} };
globalThis.window.sessionStorage = { getItem: () => null };
mapJourneyToAnalytics(unrelated);
assert.equal(unrelated.data.__adobe.analytics.events, undefined);
console.log('PASS validated/expiring private context, safe hosts, redaction and hit-local event mapping');

const values = new Map();
const auth = await bookingAuthFixture();
const accessToken = await auth.token();
const env = {
  ...auth.env,
  ALLOWED_ORIGINS: 'https://wknd-adventures.run.place',
  WKND_AERO_CATALOG: {
    put: async (key, value) => values.set(key, value),
    get: async (key, type) => {
      const value = values.get(key);
      return value && type === 'json' ? JSON.parse(value) : value || null;
    },
  },
};
const search = await worker.fetch(new Request('https://worker.test/api/flights/search?origin=MEL&dest=PUQ', {
  headers: { Origin: 'https://wknd-adventures.run.place' },
}), env);
assert.equal(search.status, 200);
assert.equal(search.headers.get('Access-Control-Allow-Origin'), 'https://wknd-adventures.run.place');
const [flight] = (await search.json()).flights;
const body = {
  requestId: crypto.randomUUID(),
  quoteId: flight.quoteId,
  flightId: flight.id,
  passengerCount: 2,
  passengers: [{ first: 'Test', last: 'Traveller', email: 'test@example.com' }],
  seats: ['2A', '2B'],
  total: 1,
  journey: { ...context, prompt: 'PRIVATE' },
};
const book = (data) => worker.fetch(new Request('https://worker.test/api/bookings', {
  method: 'POST', body: JSON.stringify(data), headers: { Authorization: `Bearer ${accessToken}` },
}), env);
const booked = await book(body);
assert.equal(booked.status, 201);
const booking = await booked.json();
assert.equal(booking.total, flight.price * 2 + Math.round(flight.price * 2 * 0.295) + 30);
assert.equal(booking.currency, 'USD');
assert.equal(booking.demo, true);
assert.equal(booking.journey.id, context.id);
assert(!JSON.stringify(booking.journey).includes('PRIVATE'));
const repeated = await book(body);
assert.equal(repeated.status, 200);
assert.equal((await repeated.json()).id, booking.id);
assert.equal((await book({ ...body, seats: ['2A', '3A'] })).status, 409);
assert.equal((await book({ ...body, requestId: crypto.randomUUID(), quoteId: crypto.randomUUID() })).status, 409);
assert.equal((await book({ ...body, requestId: 'INVALID' })).status, 400);
assert.equal((await book({ ...body, requestId: crypto.randomUUID(), seats: [] })).status, 400);
values.set(`flight-quote:${flight.quoteId}`, JSON.stringify([{ ...flight, expiresAt: Date.now() - 1 }]));
assert.equal((await book({ ...body, requestId: crypto.randomUUID() })).status, 409);
const malformed = await worker.fetch(new Request('https://worker.test/api/bookings', {
  method: 'POST', body: '{', headers: { Authorization: `Bearer ${accessToken}` },
}), env);
assert.equal(malformed.status, 400);
auth.restore();
console.log('PASS server-priced demo confirmation, correlation, idempotent retry and explicit invalid/expired failures');
