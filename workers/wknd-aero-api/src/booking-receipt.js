const PREFIX = 'booking-receipt:';
const CURSOR = 'booking-receipt-cursor';
const RETENTION = 90 * 86400;

function retention(booking) {
  return { expiration: Math.floor(Date.parse(booking.createdAt) / 1000) + RETENTION };
}

export async function prepareBookingReceipt(env, storageKey, booking) {
  const key = `${PREFIX}${storageKey.slice('customer-booking:'.length)}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(storageKey));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const idempotencyKey = [
    hex.slice(0, 8), hex.slice(8, 12), `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`, hex.slice(20, 32),
  ].join('-');
  // An index entry cannot send until the confirmed booking itself is persisted.
  await env.WKND_AERO_CATALOG.put(key, JSON.stringify({
    storageKey, idempotencyKey, createdAt: booking.createdAt,
  }), retention(booking));
  return key;
}

function email(booking, env, idempotencyKey) {
  const lead = booking.passengers[0];
  const { flight } = booking;
  const amount = new Intl.NumberFormat('en', {
    style: 'currency', currency: booking.currency,
  }).format(booking.total);
  return {
    sender: { email: env.WKND_EMAIL_FROM, name: 'WKND Adventures' },
    to: [{ email: lead.email, name: `${lead.first} ${lead.last}` }],
    subject: `WKND Aero demo booking confirmed: ${booking.id}`,
    headers: { idempotencyKey },
    textContent: [
      `Hello ${lead.first},`,
      '',
      'Your WKND Aero demo booking is confirmed. This is not a real airline ticket or payment.',
      `Booking: ${booking.id}`,
      `Flight: ${flight.id} - ${flight.origin} to ${flight.destination}`,
      `Departure: ${flight.departTime} (${flight.originTimeZone || 'local airport time'})`,
      `Passengers: ${booking.passengerCount}`,
      `Seats: ${booking.seats.join(', ')}`,
      ...(booking.adventure ? [`Adventure: ${booking.adventure.title}`] : []),
      `Total: ${amount} ${booking.currency}`,
      '',
      'This transactional confirmation does not subscribe you to marketing.',
    ].join('\n'),
  };
}

export async function dispatchBookingReceipt(env, key, now = Date.now()) {
  const store = env.WKND_AERO_CATALOG;
  const entry = await store.get(key, 'json');
  if (!entry) return;
  const booking = await store.get(entry.storageKey, 'json');
  if (!booking || booking.status !== 'confirmed') {
    // eslint-disable-next-line no-console
    console.error('WKND Aero receipt is waiting for its persisted booking.');
    return;
  }
  const statusKey = `booking-receipt-status:${entry.idempotencyKey}`;
  const confirmation = await store.get(statusKey, 'json');
  if (confirmation?.status === 'accepted' || confirmation?.status === 'unknown') {
    await store.delete(key);
    return;
  }
  const startedKey = `booking-receipt-started:${entry.idempotencyKey}`;
  const started = await store.get(startedKey, 'json');
  if (started && now - started.at >= 15 * 60000) {
    // Brevo deduplicates for 30 minutes. Never blindly retry an unknown send beyond a safe window.
    await store.put(statusKey, JSON.stringify({ status: 'unknown' }), retention(booking));
    await store.delete(key);
    // eslint-disable-next-line no-console
    console.error('WKND Aero receipt needs provider reconciliation; automatic resend stopped.');
    return;
  }
  const attemptKey = `booking-receipt-attempt:${entry.idempotencyKey}:${Math.floor(now / 300000)}`;
  if (await store.get(attemptKey)) return;
  try {
    if (!env.WKND_BREVO_API_KEY || !env.WKND_EMAIL_FROM) {
      throw new Error('receipt_configuration_missing');
    }
    const payload = email(booking, env, entry.idempotencyKey);
    // Write-once records avoid KV's one-write-per-key-per-second limit.
    if (!started) await store.put(startedKey, JSON.stringify({ at: now }), retention(booking));
    await store.put(attemptKey, 'attempted', { expirationTtl: 3600 });
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': env.WKND_BREVO_API_KEY,
      },
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify(payload),
    });
    const accepted = await response.json();
    const duplicate = response.status === 400 && accepted.code === 'duplicate_parameter';
    if (!duplicate && (!response.ok || typeof accepted.messageId !== 'string' || !accepted.messageId)) {
      throw new Error('receipt_provider_rejected');
    }
    const acceptedStatus = {
      status: 'accepted',
      acceptedAt: new Date(now).toISOString(),
      ...(duplicate ? {} : { messageId: accepted.messageId }),
    };
    await store.put(statusKey, JSON.stringify(acceptedStatus), retention(booking));
  } catch {
    // Do not log recipient data, credentials or provider response bodies.
    // eslint-disable-next-line no-console
    console.error('WKND Aero receipt delivery failed; scheduled retry retained.');
    return;
  }
  if (now - Date.parse(entry.createdAt) >= 1000) await store.delete(key);
}

export async function drainBookingReceipts(env) {
  const store = env.WKND_AERO_CATALOG;
  const cursor = await store.get(CURSOR);
  const page = await store.list({
    prefix: PREFIX, limit: 25, ...(cursor ? { cursor } : {}),
  });
  // eslint-disable-next-line no-restricted-syntax -- bounded, sequential sends
  for (const { name } of page.keys) {
    // eslint-disable-next-line no-await-in-loop -- avoid bursts of outbound email requests
    await dispatchBookingReceipt(env, name);
  }
  if (page.list_complete) await store.delete(CURSOR);
  else await store.put(CURSOR, page.cursor, { expirationTtl: 86400 });
}
