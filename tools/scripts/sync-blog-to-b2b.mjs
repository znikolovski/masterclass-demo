#!/usr/bin/env node
/**
 * Copy blog content from masterclass-demo DA bucket to wknd-business.
 * Usage: node tools/scripts/sync-blog-to-b2b.mjs [--dry-run] [--preview]
 */

import { readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  daPath, getDaToken, getSource, putSource, triggerPreview,
} from './lib/da-source.mjs';

const ORG = 'znikolovski';
const SOURCE_SITE = 'masterclass-demo';
const TARGET_SITE = 'wknd-business';
const BRANCH = 'main';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DRY_RUN = process.argv.includes('--dry-run');
const PREVIEW = process.argv.includes('--preview');

function listBlogPaths() {
  const dir = join(ROOT, 'tools/importer/reports/blog');
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.report.json'))
      .map((f) => `/blog/${basename(f, '.report.json')}`);
  } catch {
    return [
      '/blog/alpine-cycling',
      '/blog/desert-survival-guide',
      '/blog/kayaking-norway',
      '/blog/mountain-photography',
      '/blog/patagonia-trek',
      '/blog/surfing-costa-rica',
      '/blog/ultralight-backpacking',
      '/blog/wild-swimming-guide',
      '/blog/winter-mountaineering',
      '/blog/yosemite-rock-climbing',
    ];
  }
}

const PATHS = ['/field-notes', ...listBlogPaths()];

const token = getDaToken();
if (!token) {
  console.error('No valid DA token. Run: aem login');
  process.exit(1);
}

console.log(`${DRY_RUN ? 'Dry run' : 'Syncing'} ${PATHS.length} paths: ${SOURCE_SITE} → ${TARGET_SITE}\n`);

let copied = 0;
for (const path of PATHS) {
  const html = await getSource(token, ORG, SOURCE_SITE, path);
  if (!html) {
    console.log(`  − ${path} (not found in source)`);
    continue;
  }
  if (DRY_RUN) {
    console.log(`  ~ ${path} (${html.length} bytes)`);
    continue;
  }
  await putSource(token, ORG, TARGET_SITE, path, html);
  if (PREVIEW) await triggerPreview(token, ORG, TARGET_SITE, BRANCH, path);
  console.log(`  ✓ ${path}`);
  copied += 1;
}

console.log(`\nDone. ${DRY_RUN ? 'Would copy' : 'Copied'} ${DRY_RUN ? PATHS.length : copied} page(s).`);
