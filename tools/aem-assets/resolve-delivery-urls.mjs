#!/usr/bin/env node
/**
 * Resolve Dynamic Media Open API delivery URLs for imported DAM assets.
 *
 * Prefers delivery-p*.adobeaemcloud.com/adobe/assets/urn:aaid:aem:… URLs.
 * Does NOT use legacy Scene7 URLs (s7*.scene7.com/is/image/…).
 *
 * Usage:
 *   export AEM_ACCESS_TOKEN="<bearer>"
 *   npm run migrate:resolve-delivery
 *   npm run migrate:resolve-delivery -- --missing-only
 *   npm run migrate:resolve-delivery -- --upgrade-legacy
 *   npm run migrate:resolve-delivery -- --file=ian-provo.jpg
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  authorToDeliveryBase,
  buildOpenApiDeliveryUrl,
  extractRepoAssetId,
  findOpenApiHref,
  isLegacyScene7Url,
  isOpenApiDeliveryUrl,
  normalizeDeliveryUrl,
} from './dam-delivery.mjs';
import { getAuthorUrl, requireAuth, toDamPath } from './dam-metadata.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(__dirname, 'output/migration-manifest.json');

function parseArgs(argv) {
  return {
    limit: Number(argv.find((a) => a.startsWith('--limit='))?.slice(8) || 0) || Infinity,
    file: argv.find((a) => a.startsWith('--file='))?.slice(7) || null,
    missingOnly: argv.includes('--missing-only'),
    upgradeLegacy: argv.includes('--upgrade-legacy'),
  };
}

/**
 * @param {{ damPath?: string|null, damFolder?: string, fileName?: string }} item
 */
function inferDamPath(item) {
  if (item.damPath) return item.damPath;
  if (item.damFolder && item.fileName) return toDamPath(item.damFolder, item.fileName);
  return null;
}

/**
 * @param {string} deliveryBase
 * @param {string} assetId
 * @param {Record<string, string>} headers
 */
async function fetchOpenApiFromDeliveryApi(deliveryBase, assetId, headers) {
  const url = `${deliveryBase}/adobe/assets/${assetId}`;
  const res = await fetch(url, {
    headers: { ...headers, Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const type = res.headers.get('content-type') || '';
  if (!type.includes('json')) return null;
  const body = await res.json();
  return findOpenApiHref(body);
}

/**
 * @param {string} authorUrl
 * @param {string} deliveryBase
 * @param {string} apiPath
 * @param {string} fileName
 * @param {Record<string, string>} headers
 */
/**
 * @param {string} authorUrl
 * @param {string} damPath
 * @param {string} apiPath
 * @param {Record<string, string>} headers
 */
async function resolveAssetUrn(authorUrl, damPath, apiPath, headers) {
  const apiRes = await fetch(`${authorUrl}/api/assets/${apiPath}.json`, { headers });
  if (apiRes.ok) {
    const body = await apiRes.json();
    const assetId = extractRepoAssetId(body);
    if (assetId) return { status: apiRes.status, assetId };
  }

  // Siren Assets API on author often omits repo:assetId — jcr:uuid is on the asset node.
  const slingRes = await fetch(`${authorUrl}${damPath}.1.json`, { headers });
  if (slingRes.ok) {
    const body = await slingRes.json();
    const assetId = extractRepoAssetId(body);
    if (assetId) return { status: slingRes.status, assetId };
  }

  return {
    status: apiRes.ok ? apiRes.status : slingRes.status,
    assetId: null,
  };
}

async function resolveOpenApiDeliveryUrl(authorUrl, deliveryBase, damPath, apiPath, fileName, headers) {
  const urnResult = await resolveAssetUrn(authorUrl, damPath, apiPath, headers);
  if (!urnResult.assetId) {
    return { status: urnResult.status, deliveryUrl: null, assetId: null };
  }

  const assetId = urnResult.assetId;

  let deliveryUrl = await fetchOpenApiFromDeliveryApi(deliveryBase, assetId, headers);
  if (!deliveryUrl) {
    deliveryUrl = buildOpenApiDeliveryUrl(deliveryBase, assetId, fileName);
  }
  if (deliveryUrl) {
    deliveryUrl = normalizeDeliveryUrl(deliveryUrl);
  }

  return { status: urnResult.status, deliveryUrl, assetId };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const authorUrl = getAuthorUrl();
  const deliveryBase = authorToDeliveryBase(authorUrl);
  const headers = requireAuth();

  let items = manifest.items.filter((item) => inferDamPath(item));
  if (opts.file) items = items.filter((item) => item.fileName === opts.file);
  if (opts.missingOnly) {
    items = items.filter((item) => !item.deliveryUrl);
  } else if (opts.upgradeLegacy) {
    items = items.filter((item) => !item.deliveryUrl || isLegacyScene7Url(item.deliveryUrl));
  }

  items = items.slice(0, opts.limit);

  if (items.length === 0) {
    console.log('No assets to check. Use --upgrade-legacy to replace Scene7 URLs.');
    return;
  }

  console.log(`Resolving Open API delivery URLs for ${items.length} assets`);
  console.log(`  author:   ${authorUrl}`);
  console.log(`  delivery: ${deliveryBase}`);

  let resolved = 0;
  let missing = 0;
  let notInDam = 0;
  let skippedLegacy = 0;

  for (const item of items) {
    const damPath = inferDamPath(item);
    const apiPath = damPath.replace('/content/dam/', '');

    // eslint-disable-next-line no-await-in-loop
    const result = await resolveOpenApiDeliveryUrl(
      authorUrl, deliveryBase, damPath, apiPath, item.fileName, headers,
    );

    if (result.status === 404) {
      notInDam += 1;
      console.warn(`  skip ${item.fileName}: asset not in DAM`);
      continue;
    }

    if (!result.status || result.status >= 400) {
      notInDam += 1;
      console.warn(`  skip ${item.fileName}: GET api/assets ${result.status}`);
      continue;
    }

    item.damPath = damPath;
    item.assetId = result.assetId || item.assetId;
    if (item.status === 'pending' || item.status === 'staged') item.status = 'imported';

    if (result.deliveryUrl && isOpenApiDeliveryUrl(result.deliveryUrl)) {
      if (isLegacyScene7Url(item.deliveryUrl)) {
        item.deliveryUrlLegacy = item.deliveryUrl;
      }
      item.deliveryUrl = result.deliveryUrl;
      item.deliveryApi = 'open-api';
      resolved += 1;
      console.log(`  ✓ ${item.fileName}`);
      console.log(`      ${result.deliveryUrl}`);
    } else {
      missing += 1;
      if (isLegacyScene7Url(item.deliveryUrl)) skippedLegacy += 1;
      console.warn(`  · ${item.fileName}: no Open API URL (approve + Publish to Dynamic Media)`);
      if (result.assetId) {
        console.warn(`      assetId: ${result.assetId}`);
      }
    }
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\nResolved ${resolved}/${items.length} Open API delivery URLs`);
  if (notInDam > 0) console.log(`Not in DAM: ${notInDam}`);
  if (missing > 0) {
    console.log(`Awaiting DM publish: ${missing}`);
    if (skippedLegacy) {
      console.log(`  (${skippedLegacy} still have legacy Scene7 URLs — not used for replace-da)`);
    }
  }
  if (resolved > 0) {
    console.log('Run: npm run migrate:replace-da -- --preview');
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
