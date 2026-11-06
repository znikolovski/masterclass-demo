import { runIngestion } from './ingestion.js';

export default {
  async scheduled(controller, env) {
    const started = Date.now();
    try {
      const result = await runIngestion(env);
      console.log(JSON.stringify({ component: 'of1-ingestion', ...result, durationMs: Date.now() - started }));
    } catch (error) {
      console.error(JSON.stringify({ component: 'of1-ingestion', status: 'failed', error: error.message }));
      throw error;
    }
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/flight-options.json' && request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }
    if (url.pathname === '/flight-options.json' && request.method === 'GET') {
      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      };
      try {
        const row = await env.STATE.prepare('SELECT value FROM ingestion_state WHERE id = 1').first();
        if (!row) throw new Error('Ingestion state is missing');
        const state = JSON.parse(row.value);
        const records = state.flightOptions || {};
        const entries = Object.values(records).map((record) => record.entry).filter(Boolean);
        const ids = entries.map((entry) => entry.id);
        if (new Set(ids).size !== ids.length) throw new Error('Duplicate flight option IDs');
        return Response.json({ entries }, { headers });
      } catch (error) {
        console.error(JSON.stringify({
          component: 'of1-flight-catalog',
          status: 'failed',
          error: error.message,
        }));
        return Response.json({ error: 'Flight options are unavailable.' }, { status: 503, headers });
      }
    }
    if (url.pathname !== '/health' || request.method !== 'GET') return new Response('Not found', { status: 404 });
    return Response.json({
      service: 'wknd-of1-ingestion',
      process: 'running',
      mode: env.MODE,
      writesEnabled: env.MODE === 'write'
        && Boolean(env.DA_TOKEN || (env.IMS_CLIENT_ID && env.IMS_CLIENT_SECRET && env.IMS_SCOPES))
        && env.SYNC_POLICY_VERIFIED === 'true',
    });
  },
};
