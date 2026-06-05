#!/usr/bin/env node
/**
 * Resolve Dynamic Media delivery URLs for imported DAM assets.
 *
 * Reads asset metadata from AEM author API and extracts publish/delivery links.
 * Infers damPath from damFolder + fileName when the manifest was not updated by upload.
 *
 * Usage:
 *   export AEM_ACCESS_TOKEN="<bearer>"
 *   npm run migrate:resolve-delivery
 *   npm run migrate:resolve-delivery -- --missing-only
 *   npm run migrate:resolve-delivery -- --file=ian-provo.jpg
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAuthorUrl, requireAuth, toDamPath } from './dam-metadata.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(__dirname, 'output/migration-manifest.json');

function parseArgs(argv) {
  return {
    limit: Number(argv.find((a) => a.startsWith('--limit='))?.slice(8) || 0) || Infinity,
    file: argv.find((a) => a.startsWith('--file='))?.slice(7) || null,
    missingOnly: argv.includes('--missing-only'),
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
 * @param {string} value
 */
function isDeliveryUrl(value) {
  return typeof value === 'string'
    && (value.includes('/is/image/') || value.includes('/is/content/') || value.includes('delivery'));
}

/**
 * @param {Record<string, unknown>} meta
 * @returns {string|null}
 */
function extractFromMetadata(meta) {
  if (!meta || typeof meta !== 'object') return null;

  const direct = [
    meta['dam:scene7Url'],
    meta.damScene7Url,
    meta['dam:publishUrl'],
    meta['dam:remoteAssetUrl'],
  ].find((value) => isDeliveryUrl(value));
  if (direct) return direct;

  const domain = meta['dam:scene7Domain'] || meta.damScene7Domain;
  const file = meta['dam:scene7File'] || meta.damScene7File;
  if (typeof domain === 'string' && typeof file === 'string' && domain && file) {
    const base = domain.replace(/\/$/, '');
    const assetPath = file.replace(/^\//, '');
    if (assetPath.includes('/')) return `${base}/is/image/${assetPath}`;
    const company = meta['dam:scene7Company'] || meta.damScene7Company;
    if (typeof company === 'string' && company) {
      return `${base}/is/image/${company}/${assetPath}`;
    }
    return `${base}/is/image/${assetPath}`;
  }

  return null;
}

/**
 * @param {unknown} body
 * @returns {string|null}
 */
function extractDeliveryUrl(body) {
  if (!body || typeof body !== 'object') return null;

  const candidates = [
    body.publishUrl,
    body.deliveryUrl,
    body['jcr:content']?.metadata?.damScene7Url,
    body.properties?.publishUrl,
    body.links?.find?.((l) => l.rel === 'publish' || l.rel === 'delivery')?.href,
  ];

  for (const c of candidates) {
    if (isDeliveryUrl(c)) return c;
  }

  const entities = body.entities;
  if (Array.isArray(entities)) {
    for (const entity of entities) {
      const links = entity.links || entity['links'];
      if (Array.isArray(links)) {
        const pub = links.find((l) => l.rel === 'publish' || l.rel === 'delivery');
        if (pub?.href && isDeliveryUrl(pub.href)) return pub.href;
      }
      if (isDeliveryUrl(entity.properties?.publishUrl)) return entity.properties.publishUrl;
    }
  }

  return null;
}

/**
 * @param {string} authorUrl
 * @param {string} damPath
 * @param {Record<string, string>} headers
 */
async function readMetadataDeliveryUrl(authorUrl, damPath, headers) {
  const res = await fetch(`${authorUrl}${damPath}/jcr:content/metadata.1.json`, { headers });
  if (!res.ok) return null;
  const meta = await res.json();
  return extractFromMetadata(meta);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const authorUrl = getAuthorUrl();
  const headers = requireAuth();

  let items = manifest.items.filter((item) => inferDamPath(item));
  if (opts.file) items = items.filter((item) => item.fileName === opts.file);
  if (opts.missingOnly) items = items.filter((item) => !item.deliveryUrl);
  items = items.slice(0, opts.limit);

  if (items.length === 0) {
    console.log('No assets to check. Ensure migration-manifest.json has damFolder + fileName.');
    return;
  }

  console.log(`Checking ${items.length} assets for Dynamic Media delivery URLs on ${authorUrl}…`);

  let resolved = 0;
  let missing = 0;
  let notInDam = 0;

  for (const item of items) {
    const damPath = inferDamPath(item);
    const apiPath = damPath.replace('/content/dam/', '');
    const url = `${authorUrl}/api/assets/${apiPath}.json`;

    // eslint-disable-next-line no-await-in-loop
    const res = await fetch(url, { headers });
    if (!res.ok) {
      notInDam += 1;
      console.warn(`  skip ${item.fileName}: asset not in DAM (GET ${res.status})`);
      continue;
    }

    item.damPath = damPath;
    if (item.status === 'pending' || item.status === 'staged') item.status = 'imported';

    // eslint-disable-next-line no-await-in-loop
    const body = await res.json();
    let deliveryUrl = extractDeliveryUrl(body);

    if (!deliveryUrl) {
      // eslint-disable-next-line no-await-in-loop
      deliveryUrl = await readMetadataDeliveryUrl(authorUrl, damPath, headers);
    }

    if (deliveryUrl) {
      item.deliveryUrl = deliveryUrl;
      resolved += 1;
      console.log(`  ✓ ${item.fileName}`);
    } else {
      missing += 1;
      console.warn(`  · ${item.fileName}: no delivery URL yet (approve + Publish to Dynamic Media)`);
    }
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\nResolved ${resolved}/${items.length} delivery URLs`);
  if (notInDam > 0) console.log(`Not in DAM: ${notInDam}`);
  if (missing > 0) {
    console.log(`Awaiting DM publish: ${missing} (Assets View → select → Publish → Dynamic Media)`);
  }
  if (resolved > 0) {
    console.log('Run: npm run migrate:replace-da -- --preview');
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
