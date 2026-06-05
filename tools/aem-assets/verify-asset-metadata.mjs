#!/usr/bin/env node
/**
 * Verify WKND metadata on imported assets (read-back via Assets OpenAPI).
 *
 * Usage:
 *   export AEM_ACCESS_TOKEN="<bearer>"
 *   npm run migrate:verify-metadata
 *   npm run migrate:verify-metadata -- --file=media_1e4b49be43a70d306b1c312d0d78dd369b5ccce40.jpg
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatMetadataValue,
  getAuthorUrl,
  metadataValuesMatch,
  requireAuth,
  verifyAssetMetadata,
} from './dam-metadata.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(__dirname, 'output/migration-manifest.json');

function parseArgs(argv) {
  return {
    limit: Number(argv.find((a) => a.startsWith('--limit='))?.slice(8) || 0) || 10,
    file: argv.find((a) => a.startsWith('--file='))?.slice(7) || null,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const authorUrl = getAuthorUrl();
  const headers = requireAuth();

  let items = manifest.items.filter((i) => i.damFolder && i.fileName);
  if (opts.file) items = items.filter((i) => i.fileName === opts.file);
  items = items.slice(0, opts.limit);

  console.log(`Verifying ${items.length} assets…\n`);

  for (const item of items) {
    try {
      // eslint-disable-next-line no-await-in-loop
      // eslint-disable-next-line no-await-in-loop
      const found = await verifyAssetMetadata(
        authorUrl,
        item.damFolder,
        item.fileName,
        item.assetMetadata,
        headers,
      );
      const usage = found['wknd:contentUsage'];
      const category = found['wknd:adventureCategory'];
      const title = found['dc:title'];
      const expectedUsage = item.assetMetadata['wknd:contentUsage'];
      const ok = title && category
        && metadataValuesMatch(expectedUsage, usage);
      console.log(`${ok ? '✓' : '✗'} ${item.fileName}`);
      console.log(`    dc:title = ${formatMetadataValue(title) ?? '(missing)'}`);
      console.log(`    wknd:adventureCategory = ${formatMetadataValue(category) ?? '(missing)'}`);
      console.log(`    wknd:contentUsage = ${formatMetadataValue(usage) ?? '(missing)'} (expected ${formatMetadataValue(expectedUsage)})`);
    } catch (err) {
      console.log(`✗ ${item.fileName}: ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
