#!/usr/bin/env node
/**
 * Upload staged images to AEM DAM via Direct Binary Upload API (Cloud Service).
 *
 * Requires AEM_ACCESS_TOKEN from an AEM author IMS session (Assets write permission).
 *
 * Usage:
 *   npm run migrate:download
 *   export AEM_ACCESS_TOKEN="<bearer from author DevTools>"
 *   node tools/aem-assets/upload-images-to-dam.mjs --dry-run
 *   node tools/aem-assets/upload-images-to-dam.mjs --limit=5
 *
 * If metadata was skipped on a prior run:
 *   npm run migrate:metadata
 */

import {
  readFileSync, writeFileSync, existsSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyAssetMetadata, getAuthorUrl, requireAuth,
} from './dam-metadata.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(__dirname, 'output/migration-manifest.json');
const STAGING_ROOT = join(__dirname, 'staging');

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    limit: Number(argv.find((a) => a.startsWith('--limit='))?.slice(8) || 0) || Infinity,
    stagedOnly: argv.includes('--staged-only'),
    skipMetadata: argv.includes('--skip-metadata'),
  };
}

/**
 * @param {string} authorUrl
 * @param {string} damFolder
 * @param {string} fileName
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @param {Record<string, string>} headers
 */
async function uploadBinary(authorUrl, damFolder, fileName, buffer, mimeType, headers) {
  const initiateUrl = `${authorUrl}${damFolder}.initiateUpload.json`;
  const initRes = await fetch(initiateUrl, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `fileName=${encodeURIComponent(fileName)}&fileSize=${buffer.length}`,
  });

  const initText = await initRes.text();
  if (!initRes.ok) {
    throw new Error(`initiateUpload ${initRes.status}: ${initText.slice(0, 300)}`);
  }

  const initData = JSON.parse(initText);
  const fileInfo = initData.files?.[0];
  if (!fileInfo?.uploadURIs?.[0]) {
    throw new Error(`No upload URI in initiate response: ${initText.slice(0, 200)}`);
  }

  const putRes = await fetch(fileInfo.uploadURIs[0], {
    method: 'PUT',
    body: buffer,
  });
  if (!putRes.ok && putRes.status !== 201) {
    const putText = await putRes.text();
    throw new Error(`binary PUT ${putRes.status}: ${putText.slice(0, 200)}`);
  }

  const completePath = initData.completeURI?.startsWith('http')
    ? initData.completeURI
    : `${authorUrl}${initData.completeURI}`;
  const completeBody = [
    `fileName=${encodeURIComponent(fileInfo.fileName)}`,
    `mimeType=${encodeURIComponent(fileInfo.mimeType || mimeType)}`,
    `uploadToken=${encodeURIComponent(fileInfo.uploadToken)}`,
  ].join('&');

  const affinity = initRes.headers.get('affinity-cookie')
    || initRes.headers.get('Affinity-Cookie');

  const completeHeaders = {
    ...headers,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (affinity) completeHeaders['Affinity-cookie'] = affinity;

  const completeRes = await fetch(completePath, {
    method: 'POST',
    headers: completeHeaders,
    body: completeBody,
  });

  const completeText = await completeRes.text();
  if (!completeRes.ok) {
    throw new Error(`completeUpload ${completeRes.status}: ${completeText.slice(0, 300)}`);
  }

  return `${damFolder}/${fileName}`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const authorUrl = getAuthorUrl();

  let items = manifest.items.filter((i) => i.status !== 'imported');
  if (opts.stagedOnly) {
    items = items.filter((i) => i.localPath
      || existsSync(join(STAGING_ROOT, i.damFolder.split('/').pop(), i.fileName)));
  }
  items = items.slice(0, opts.limit);

  console.log(`Uploading ${items.length} assets to ${authorUrl}…`);

  if (opts.dryRun) {
    items.forEach((item) => {
      console.log(`  [dry-run] ${item.damFolder}/${item.fileName}`);
    });
    return;
  }

  const headers = requireAuth();

  const probe = await fetch(`${authorUrl}/api/assets/wknd-adventures.json`, { headers });
  if (probe.status === 401 || probe.status === 403) {
    console.error(`Assets API ${probe.status} — refresh AEM_ACCESS_TOKEN.`);
    process.exit(1);
  }

  let imported = 0;
  let failed = 0;

  for (const item of items) {
    const segment = item.damFolder.split('/').pop();
    const localPath = item.localPath || join(STAGING_ROOT, segment, item.fileName);

    if (!existsSync(localPath)) {
      item.status = 'skipped';
      item.error = 'missing local file — run migrate:download first';
      failed += 1;
      console.warn(`  skip (no file): ${item.fileName}`);
      continue;
    }

    const buffer = readFileSync(localPath);
    try {
      // eslint-disable-next-line no-await-in-loop
      const damPath = await uploadBinary(
        authorUrl,
        item.damFolder,
        item.fileName,
        buffer,
        item.mimeType,
        headers,
      );
      item.status = 'imported';
      item.damPath = damPath;
      item.error = null;

      if (!opts.skipMetadata) {
        // eslint-disable-next-line no-await-in-loop
        const meta = await applyAssetMetadata(
          authorUrl,
          item.damFolder,
          item.fileName,
          item.assetMetadata,
          headers,
        );
        item.metadataApplied = true;
        item.metadataMethod = meta.method;
      }

      imported += 1;
      console.log(`  ✓ ${item.fileName} → ${damPath}${item.metadataApplied ? ' + metadata' : ''}`);
    } catch (err) {
      item.status = 'failed';
      item.error = err.message || 'upload failed';
      failed += 1;
      console.warn(`  ✗ ${item.fileName}: ${item.error}`);
    }
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\nImported: ${imported}, failed/skipped: ${failed}`);
  console.log('Next: approve assets, publish to Dynamic Media, then npm run migrate:resolve-delivery');
  if (opts.skipMetadata) console.log('Metadata skipped — run: npm run migrate:metadata');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
