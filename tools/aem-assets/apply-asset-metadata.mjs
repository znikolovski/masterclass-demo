#!/usr/bin/env node
/**
 * Apply WKND metadata to already-uploaded DAM assets (fix missing metadata after migrate:upload).
 *
 * Usage:
 *   export AEM_ACCESS_TOKEN="<bearer>"
 *   npm run migrate:metadata
 *   npm run migrate:metadata -- --limit=5
 *   npm run migrate:metadata -- --file=media_1e4b49be43a70d306b1c312d0d78dd369b5ccce40.jpg
 *   npm run migrate:metadata -- --failed-only
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyAssetMetadata, formatMetadataValue, getAuthorUrl, requireAuth,
} from './dam-metadata.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(__dirname, 'output/migration-manifest.json');

function parseArgs(argv) {
  return {
    limit: Number(argv.find((a) => a.startsWith('--limit='))?.slice(8) || 0) || Infinity,
    file: argv.find((a) => a.startsWith('--file='))?.slice(7) || null,
    failedOnly: argv.includes('--failed-only'),
    dryRun: argv.includes('--dry-run'),
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const authorUrl = getAuthorUrl();

  let items = manifest.items.filter((i) => i.damFolder && i.fileName);
  if (opts.file) items = items.filter((i) => i.fileName === opts.file);
  if (opts.failedOnly) {
    items = items.filter((i) => !i.metadataApplied || i.metadataError);
  }
  items = items.slice(0, opts.limit);

  const label = opts.failedOnly ? 'retrying failed metadata for' : 'applying metadata to';
  console.log(`${label} ${items.length} assets on ${authorUrl}…`);

  if (opts.dryRun) {
    items.forEach((item) => {
      console.log(`  [dry-run] ${item.damFolder}/${item.fileName}`, item.assetMetadata);
    });
    return;
  }

  const headers = requireAuth();
  let ok = 0;
  let failed = 0;

  for (const item of items) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await applyAssetMetadata(
        authorUrl,
        item.damFolder,
        item.fileName,
        item.assetMetadata,
        headers,
      );
      item.metadataApplied = true;
      item.metadataMethod = result.method;
      item.assetId = result.assetId || item.assetId;
      item.metadataVerified = result.verified;
      item.metadataError = null;
      item.damPath = item.damPath || `${item.damFolder}/${item.fileName}`;
      if (item.status === 'pending' || item.status === 'staged') item.status = 'imported';
      ok += 1;
      const usage = formatMetadataValue(result.verified?.['wknd:contentUsage']) || '?';
      console.log(`  ✓ ${item.fileName} (${result.method}) wknd:contentUsage=[${usage}]`);
    } catch (err) {
      item.metadataApplied = false;
      item.metadataError = err.message || 'metadata failed';
      failed += 1;
      console.warn(`  ✗ ${item.fileName}: ${item.metadataError}`);
    }
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\nMetadata applied: ${ok}, failed: ${failed}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
