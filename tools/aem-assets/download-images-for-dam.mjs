#!/usr/bin/env node
/**
 * Download migration manifest sources into local staging folders mirroring DAM layout.
 *
 * Output: tools/aem-assets/staging/{heroes|adventures|...}/<fileName>
 *
 * Usage:
 *   node tools/aem-assets/download-images-for-dam.mjs
 *   node tools/aem-assets/download-images-for-dam.mjs --limit=10
 */

import {
  readFileSync, writeFileSync, mkdirSync, existsSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(__dirname, 'output/migration-manifest.json');
const STAGING_ROOT = join(__dirname, 'staging');

function parseArgs(argv) {
  return {
    limit: Number(argv.find((a) => a.startsWith('--limit='))?.slice(8) || 0) || Infinity,
    force: argv.includes('--force'),
  };
}

function folderSegment(damFolder) {
  return damFolder.split('/').pop() || 'misc';
}

async function downloadFile(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const items = manifest.items
    .filter((i) => i.status !== 'imported')
    .slice(0, opts.limit);

  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const item of items) {
    const segment = folderSegment(item.damFolder);
    const dir = join(STAGING_ROOT, segment);
    const dest = join(dir, item.fileName);

    if (!opts.force && existsSync(dest)) {
      item.localPath = dest;
      item.status = item.status === 'failed' ? 'staged' : item.status;
      skip += 1;
      continue;
    }

    mkdirSync(dir, { recursive: true });
    try {
      // eslint-disable-next-line no-await-in-loop
      const buffer = await downloadFile(item.sourceUrl);
      writeFileSync(dest, buffer);
      item.localPath = dest;
      item.fileSize = buffer.length;
      if (item.status === 'failed' || item.status === 'skipped') item.status = 'staged';
      ok += 1;
      console.log(`✓ ${segment}/${item.fileName} (${buffer.length} bytes)`);
    } catch (err) {
      item.status = 'skipped';
      item.error = err.message || 'download failed';
      fail += 1;
      console.warn(`✗ ${item.fileName}: ${item.error}`);
    }
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\nStaging: ${STAGING_ROOT}`);
  console.log(`Downloaded: ${ok}, skipped (cached): ${skip}, failed: ${fail}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
