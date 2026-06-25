#!/usr/bin/env node
/**
 * Trigger WKND Aero Worker catalog sync from Adventures query-index.
 */
const WORKER_URL = process.env.AERO_API_URL || 'https://wknd-aero-api.jaggah.workers.dev';
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

const headers = { 'Content-Type': 'application/json' };
if (ADMIN_SECRET) headers['X-Admin-Secret'] = ADMIN_SECRET;

const resp = await fetch(`${WORKER_URL}/api/catalog/sync`, { method: 'POST', headers });
const text = await resp.text();
if (!resp.ok) {
  console.error(`Sync failed ${resp.status}:`, text.slice(0, 300));
  process.exit(1);
}
console.log('Catalog sync OK:', text);
