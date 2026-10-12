/**
 * WKND Aero API — Product Bus catalog, pipeline adapter, demo booking.
 */

import { syncCatalogFromAdventures, getCatalogIndex, getCatalogEntity } from './catalog.js';
import { renderPipelinePage } from './pipeline.js';
import { searchFlights, createBooking, BookingInputError } from './booking.js';
// eslint-disable-next-line import/no-relative-packages -- shared browser/Worker contract
import { JOURNEY_ID_PATTERN } from '../../../scripts/journey-context.js';

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
    return hostname.endsWith('.aem.page') || hostname.endsWith('.aem.live') || hostname.endsWith('.aem.network') || hostname === 'localhost';
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
  if (!isAllowedOrigin(origin, allowed) && origin) return {};
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Secret',
  };
}

/**
 * @param {object} data
 * @param {number} status
 * @param {Record<string, string>} headers
 */
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (url.pathname === '/catalog/adventures/index.json' && request.method === 'GET') {
        const catalog = await getCatalogIndex(env);
        return json(catalog, 200, { ...cors, 'Cache-Control': 'public, max-age=300' });
      }

      const entityMatch = url.pathname.match(/^\/catalog\/adventures\/([^/]+)\.json$/);
      if (entityMatch && request.method === 'GET') {
        const entity = await getCatalogEntity(env, entityMatch[1]);
        if (!entity) return json({ error: 'not found' }, 404, cors);
        return json(entity, 200, { ...cors, 'Cache-Control': 'public, max-age=300' });
      }

      if (url.pathname === '/api/catalog/sync' && request.method === 'POST') {
        const secret = request.headers.get('X-Admin-Secret');
        if (env.ADMIN_SECRET && secret !== env.ADMIN_SECRET) {
          return json({ error: 'unauthorized' }, 401, cors);
        }
        const result = await syncCatalogFromAdventures(env);
        return json({ ok: true, total: result.total }, 200, cors);
      }

      if (url.pathname === '/api/flights/search' && request.method === 'GET') {
        const result = searchFlights(url.searchParams);
        await env.WKND_AERO_CATALOG.put(
          `flight-quote:${result.flights[0].quoteId}`,
          JSON.stringify(result.flights),
          { expirationTtl: 1800 },
        );
        return json(result, 200, { ...cors, 'Cache-Control': 'no-store' });
      }

      if (url.pathname === '/api/bookings' && request.method === 'POST') {
        let body;
        try {
          body = await request.json();
        } catch {
          throw new BookingInputError('Invalid booking JSON');
        }
        if (!JOURNEY_ID_PATTERN.test(body?.requestId)
          || !JOURNEY_ID_PATTERN.test(body?.quoteId)) {
          throw new BookingInputError('Invalid booking request identifiers');
        }
        const id = `BK_${body.requestId.replace(/-/g, '').slice(0, 16).toLowerCase()}`;
        const previous = await env.WKND_AERO_CATALOG.get(`booking:${id}`, 'json');
        if (previous) {
          const lead = body.passengers?.[0];
          if (previous.flightId !== body.flightId || previous.quoteId !== body.quoteId
            || previous.passengerCount !== body.passengerCount
            || JSON.stringify(previous.seats) !== JSON.stringify(body.seats)
            || !['first', 'last', 'email'].every((key) => (
              previous.passengers[0][key] === lead?.[key]
            ))) {
            throw new BookingInputError('This booking request was already confirmed with different details.', 409);
          }
          return json(previous, 200, { ...cors, 'Cache-Control': 'no-store' });
        }
        const flights = await env.WKND_AERO_CATALOG.get(`flight-quote:${body.quoteId}`, 'json');
        const booking = createBooking(body, flights?.find((flight) => flight.id === body.flightId));
        await env.WKND_AERO_CATALOG.put(`booking:${booking.id}`, JSON.stringify(booking));
        return json(booking, 201, { ...cors, 'Cache-Control': 'no-store' });
      }

      const bookingMatch = url.pathname.match(/^\/api\/bookings\/([^/]+)$/);
      if (bookingMatch && request.method === 'GET') {
        const raw = await env.WKND_AERO_CATALOG.get(`booking:${bookingMatch[1]}`);
        if (!raw) return json({ error: 'not found' }, 404, cors);
        return json(JSON.parse(raw), 200, cors);
      }

      const pipelineMatch = url.pathname.match(/^\/znikolovski\/wknd-aero\/main\/adventures\/([^/]+)\/?$/);
      if (pipelineMatch && request.method === 'GET') {
        const page = await renderPipelinePage(env, pipelineMatch[1]);
        if (!page) return new Response('Not found', { status: 404, headers: cors });
        return new Response(page.html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
            ...cors,
          },
        });
      }

      return json({ error: 'not found', path: url.pathname }, 404, cors);
    } catch (err) {
      const status = err instanceof BookingInputError ? err.status : 500;
      // eslint-disable-next-line no-console
      console.error('WKND Aero API request failed.', { path: url.pathname, status });
      return json({
        error: status < 500 ? 'invalid booking' : 'internal error',
        message: status < 500 ? err.message : 'Unable to process the request.',
      }, status, cors);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncCatalogFromAdventures(env).catch(() => {}));
  },
};
