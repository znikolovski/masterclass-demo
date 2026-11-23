/* eslint-env node, es2021 */
/* eslint-disable import/extensions -- executable Node test */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import loadTestAeroWorker from '../scripts/lib/load-test-aero-worker.mjs';
// eslint-disable-next-line import/no-relative-packages, max-len -- test Worker delivery
import { prepareBookingReceipt, dispatchBookingReceipt, drainBookingReceipts } from '../../workers/wknd-aero-api/src/booking-receipt.js';

test('confirmed Aero receipts are durable, automatic, retried and idempotently acknowledged', async () => {
  const values = new Map();
  const writes = new Set();
  const env = {
    WKND_BREVO_API_KEY: 'test-api-key-not-a-real-secret',
    WKND_EMAIL_FROM: 'sender@example.test',
    WKND_AERO_CATALOG: {
      get: async (key, type) => {
        const value = values.get(key);
        return value && type === 'json' ? JSON.parse(value) : value || null;
      },
      put: async (key, value) => {
        if (key.startsWith('booking-receipt-status:') || key.startsWith('booking-receipt-started:')) {
          assert(!writes.has(key), 'Receipt status and start records must not be repeatedly written');
          writes.add(key);
        }
        values.set(key, value);
      },
      delete: async (key) => values.delete(key),
      list: async ({ prefix, limit }) => ({
        keys: [...values.keys()].filter((key) => key.startsWith(prefix))
          .slice(0, limit).map((name) => ({ name })),
        list_complete: true,
      }),
    },
  };
  const now = Date.now();
  const storageKey = `customer-booking:${'a'.repeat(64)}:BK_0123456789abcdef`;
  const booking = {
    id: 'BK_0123456789abcdef',
    status: 'confirmed',
    demo: true,
    createdAt: new Date().toISOString(),
    passengers: [{ first: 'Demo', last: 'Shopper', email: 'demo@example.test' }],
    flight: {
      id: 'WK101', origin: 'MEL', destination: 'PUQ', departTime: '2026-12-01 08:30',
    },
    seats: ['2A'],
    passengerCount: 1,
    total: 303,
    currency: 'USD',
    adventure: null,
    journey: { privateValue: 'must-not-be-forwarded' },
  };
  const key = await prepareBookingReceipt(env, storageKey, booking);
  const originalEntry = JSON.parse(values.get(key));
  const concurrent = { ...booking };
  await prepareBookingReceipt(env, storageKey, concurrent);
  assert.equal(
    JSON.parse(values.get(key)).idempotencyKey,
    originalEntry.idempotencyKey,
    'Concurrent preparation of the same booking uses the same provider deduplication key',
  );
  const originalFetch = globalThis.fetch;
  let requests = 0;
  let responseStatus = 503;
  let malformedAck = false;
  let duplicate = false;
  let requestKey;
  const statusKey = `booking-receipt-status:${originalEntry.idempotencyKey}`;
  globalThis.fetch = async (url, options) => {
    requests += 1;
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(options.headers['api-key'], env.WKND_BREVO_API_KEY);
    assert.equal(options.redirect, 'error');
    const payload = JSON.parse(options.body);
    assert(payload.textContent.includes('$303.00 USD'));
    assert(payload.textContent.includes('not a real airline ticket or payment'));
    assert(!JSON.stringify(payload).includes('must-not-be-forwarded'));
    assert.equal(payload.to[0].email, 'demo@example.test');
    assert.equal(payload.sender.email, 'sender@example.test');
    requestKey ||= payload.headers.idempotencyKey;
    assert.equal(payload.headers.idempotencyKey, requestKey, 'Every retry uses the same provider key');
    return new Response(JSON.stringify(duplicate ? { code: 'duplicate_parameter' }
      : { messageId: malformedAck ? undefined : 'test-message-id' }), { status: responseStatus });
  };
  try {
    await dispatchBookingReceipt(env, key, now + 1000);
    assert.equal(requests, 0, 'No receipt for an index whose booking was not persisted');
    values.set(storageKey, JSON.stringify(booking));
    await dispatchBookingReceipt({ ...env, WKND_BREVO_API_KEY: undefined }, key, now + 1000);
    assert.equal(requests, 0, 'Missing service configuration must fail closed');
    await dispatchBookingReceipt(env, key, now + 301000);
    assert.equal(requests, 1);
    assert(values.has(key), 'Provider failure retains the retry index');
    await dispatchBookingReceipt(env, key, now + 301001);
    assert.equal(requests, 1, 'Backoff avoids repeated sends within a retry window');
    responseStatus = 201;
    malformedAck = true;
    await dispatchBookingReceipt(env, key, now + 601000);
    assert(!values.has(statusKey));
    assert(values.has(key), 'A success-shaped malformed provider acknowledgement is not accepted');
    malformedAck = false;
    duplicate = true;
    responseStatus = 400;
    await dispatchBookingReceipt(env, key, now + 901000);
    assert.equal(JSON.parse(values.get(statusKey)).status, 'accepted');
    assert(!values.has(key));
    const acceptedRequests = requests;
    await dispatchBookingReceipt(env, key);
    await drainBookingReceipts(env);
    assert.equal(requests, acceptedRequests, 'Accepted receipts are not enqueued again');
    values.set(key, JSON.stringify(originalEntry));
    await dispatchBookingReceipt(env, key);
    assert(!values.has(key), 'A stale index for an accepted booking is cleaned without resending');
    assert.equal(requests, acceptedRequests);
    const uncertainBooking = { ...booking, id: 'BK_2223456789abcdef' };
    const uncertainStorageKey = storageKey.replace(booking.id, uncertainBooking.id);
    const uncertainKey = await prepareBookingReceipt(env, uncertainStorageKey, uncertainBooking);
    const uncertainStatusKey = `booking-receipt-status:${JSON.parse(values.get(uncertainKey)).idempotencyKey}`;
    values.set(uncertainStorageKey, JSON.stringify(uncertainBooking));
    globalThis.fetch = async () => { requests += 1; throw new Error('connection lost'); };
    await dispatchBookingReceipt(env, uncertainKey, now + 1000);
    assert.equal(requests, acceptedRequests + 1);
    await dispatchBookingReceipt(env, uncertainKey, now + 901000);
    assert.equal(JSON.parse(values.get(uncertainStatusKey)).status, 'unknown');
    assert.equal(requests, acceptedRequests + 1, 'Unknown sends must not be retried outside the safe deduplication window');
    const scheduledBooking = { ...booking, id: 'BK_1123456789abcdef' };
    const scheduledStorageKey = storageKey.replace(booking.id, scheduledBooking.id);
    const scheduledKey = await prepareBookingReceipt(env, scheduledStorageKey, scheduledBooking);
    const scheduledStatusKey = `booking-receipt-status:${JSON.parse(values.get(scheduledKey)).idempotencyKey}`;
    values.set(scheduledStorageKey, JSON.stringify(scheduledBooking));
    globalThis.fetch = async (url) => {
      assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
      requests += 1;
      return new Response(JSON.stringify({ messageId: 'scheduled-test-id' }), { status: 201 });
    };
    const worker = await loadTestAeroWorker();
    const background = [];
    await worker.scheduled({ cron: '*/5 * * * *' }, env, {
      waitUntil: (promise) => background.push(promise),
    });
    await Promise.all(background);
    assert.equal(JSON.parse(values.get(scheduledStatusKey)).status, 'accepted');
    assert.equal(requests, acceptedRequests + 2, 'The scheduled handler sends pending receipts automatically');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
