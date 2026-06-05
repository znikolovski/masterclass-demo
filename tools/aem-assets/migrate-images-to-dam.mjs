#!/usr/bin/env node
/**
 * Import migration manifest assets into AEM DAM via Asset Import from URL API.
 *
 * Requires Asset Import API enabled on the AEM program (returns 404 on A Perfect Circle).
 * Prefer: npm run migrate:download && npm run migrate:upload (Direct Binary Upload).
 *
 * Requires:
 *   AEM_ACCESS_TOKEN  — IMS bearer (AEM author + Asset Author API scope)
 *   AEM_API_KEY       — Adobe Developer Console client ID (Asset Author API)
 *
 * Usage:
 *   node tools/aem-assets/migrate-images-to-dam.mjs --dry-run
 *   node tools/aem-assets/migrate-images-to-dam.mjs --limit=10
 *   node tools/aem-assets/migrate-images-to-dam.mjs --canonical-only
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(__dirname, 'output/migration-manifest.json');
const BATCH_SIZE = 50;
const AUTHOR = 'https://author-p115476-e1135027.adobeaemcloud.com';

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    canonicalOnly: argv.includes('--canonical-only'),
    limit: Number(argv.find((a) => a.startsWith('--limit='))?.slice(8) || 0) || Infinity,
  };
}

function getAuth() {
  const token = process.env.AEM_ACCESS_TOKEN?.trim();
  const apiKey = process.env.AEM_API_KEY?.trim();
  if (!token || !apiKey) {
    console.error(`
Missing AEM import credentials.

  export AEM_ACCESS_TOKEN="<IMS bearer from AEM author>"
  export AEM_API_KEY="<Adobe Developer Console Client ID for Asset Author API>"

See docs/ASSET-ANALYTICS-PLAN.md §2.2.
Alternatively use AEM MCP import-aem-asset when the MCP server is online.
`);
    process.exit(1);
  }
  return { token, apiKey };
}

/**
 * @param {string} jobId
 * @param {{ token: string, apiKey: string }} auth
 */
async function pollImportJob(jobId, auth) {
  const statusUrl = `${AUTHOR}/adobe/assets/import/jobs/${jobId}/status`;
  const resultUrl = `${AUTHOR}/adobe/assets/import/jobs/${jobId}/result`;

  for (let i = 0; i < 90; i += 1) {
    await new Promise((r) => setTimeout(r, 2000));
    const statusRes = await fetch(statusUrl, {
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'X-Api-Key': auth.apiKey,
      },
    });
    if (!statusRes.ok) continue;

    const statusBody = await statusRes.json();
    const state = statusBody.state || statusBody.data?.state;
    if (state && state !== 'PROCESSING' && state !== 'QUEUED') {
      const resultRes = await fetch(resultUrl, {
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'X-Api-Key': auth.apiKey,
        },
      });
      if (resultRes.ok) return resultRes.json();
      return statusBody;
    }
  }
  throw new Error(`Import job ${jobId} timed out`);
}

/**
 * @param {object[]} batch
 * @param {{ token: string, apiKey: string }} auth
 */
async function importBatch(batch, auth) {
  const folder = batch[0].damFolder;
  const body = {
    folder,
    files: batch.map((item) => ({
      fileName: item.fileName,
      mimeType: item.mimeType,
      url: item.sourceUrl,
      assetMetadata: item.assetMetadata,
    })),
  };

  const res = await fetch(`${AUTHOR}/adobe/assets/import/fromUrl`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.token}`,
      'X-Api-Key': auth.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Import ${res.status}: ${text.slice(0, 400)}`);
  }

  const json = JSON.parse(text);
  const jobId = json.data?.id || json.jobId;
  if (!jobId) throw new Error(`No job id in response: ${text.slice(0, 200)}`);
  return pollImportJob(jobId, auth);
}

async function verifySource(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

  let items = manifest.items.filter((i) => i.status !== 'imported');
  if (opts.canonicalOnly) {
    items = items.filter((i) => i.legacyUrl || i.count >= 10);
  }
  items = items.slice(0, opts.limit);

  console.log(`Importing ${items.length} assets to AEM DAM…`);

  if (opts.dryRun) {
    items.forEach((item) => {
      console.log(`  [dry-run] ${item.damFolder}/${item.fileName} ← ${item.sourceUrl}`);
    });
    return;
  }

  const auth = getAuth();
  const reachable = [];
  for (const item of items) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await verifySource(item.sourceUrl);
    if (ok) reachable.push(item);
    else {
      item.status = 'skipped';
      item.error = 'source URL not reachable';
      console.warn(`  skip (404): ${item.sourceUrl}`);
    }
  }

  const batches = [];
  for (let i = 0; i < reachable.length; i += BATCH_SIZE) {
    batches.push(reachable.slice(i, i + BATCH_SIZE));
  }

  for (let b = 0; b < batches.length; b += 1) {
    const batch = batches[b];
    console.log(`\nBatch ${b + 1}/${batches.length}: ${batch.length} files → ${batch[0].damFolder}`);
    // eslint-disable-next-line no-await-in-loop
    const result = await importBatch(batch, auth);
    result.items?.forEach((row) => {
      const item = batch.find((x) => x.fileName === row.fileName);
      if (!item) return;
      if (row.status === 'imported') {
        item.status = 'imported';
        item.assetId = row.assetId;
        item.damPath = row.assetPath || `${item.damFolder}/${item.fileName}`;
        console.log(`  ✓ ${item.fileName}`);
      } else {
        item.status = 'failed';
        item.error = row.error?.detail || row.error?.title || 'import failed';
        console.warn(`  ✗ ${item.fileName}: ${item.error}`);
      }
    });
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  const imported = manifest.items.filter((i) => i.status === 'imported').length;
  console.log(`\nUpdated manifest: ${MANIFEST_PATH}`);
  console.log(`Imported: ${imported}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
