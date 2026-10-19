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
    if (new URL(request.url).pathname !== '/health' || request.method !== 'GET') {
      return new Response('Not found', { status: 404 });
    }
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
