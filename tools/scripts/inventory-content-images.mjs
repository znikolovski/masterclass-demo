#!/usr/bin/env node
/**
 * Crawl live/preview pages and list unique image URLs for AEM Assets migration.
 *
 * Usage:
 *   node tools/scripts/inventory-content-images.mjs
 *   node tools/scripts/inventory-content-images.mjs --base=https://main--masterclass-demo--znikolovski.aem.page
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchQueryIndex } from './lib/site-index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BASE = 'https://main--masterclass-demo--znikolovski.aem.live';

function parseArgs(argv) {
  const opts = { base: DEFAULT_BASE, outDir: join(__dirname, 'output') };
  argv.forEach((arg) => {
    if (arg.startsWith('--base=')) opts.base = arg.slice(7);
    else if (arg.startsWith('--out-dir=')) opts.outDir = arg.slice(10);
  });
  return opts;
}

function extractImages(html, pagePath) {
  const hits = [];
  const imgRe = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match = imgRe.exec(html);
  while (match) {
    hits.push({ page: pagePath, src: match[1] });
    match = imgRe.exec(html);
  }
  return hits;
}

function classify(src) {
  if (src.includes('/media_')) return 'media-bus';
  if (/\/is\/(image|content)\//.test(src)) return 'dynamic-media';
  if (src.includes('wknd-adventures.com')) return 'external-legacy';
  if (src.startsWith('/') || src.includes('.aem.')) return 'same-origin';
  return 'external';
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const origin = new URL(opts.base).origin;
  const index = await fetchQueryIndex(origin);

  const all = [];
  const paths = index.paths.slice(0, 80);

  await paths.reduce(async (prev, pagePath) => {
    await prev;
    const url = `${origin}${pagePath}.plain.html`;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const html = await res.text();
      all.push(...extractImages(html, pagePath));
    } catch {
      // skip unreachable pages
    }
  }, Promise.resolve());

  const bySrc = new Map();
  all.forEach(({ page, src }) => {
    const entry = bySrc.get(src) || {
      src,
      classification: classify(src),
      pages: [],
      count: 0,
    };
    entry.count += 1;
    if (!entry.pages.includes(page)) entry.pages.push(page);
    bySrc.set(src, entry);
  });

  const inventory = [...bySrc.values()].sort((a, b) => b.count - a.count);
  mkdirSync(opts.outDir, { recursive: true });
  const outPath = join(opts.outDir, 'image-migration-inventory.json');
  writeFileSync(outPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    origin,
    pageCount: paths.length,
    uniqueImages: inventory.length,
    legacyExternal: inventory.filter((i) => i.classification === 'external-legacy').length,
    items: inventory,
  }, null, 2));

  console.log(`Image inventory: ${inventory.length} unique URLs from ${paths.length} pages`);
  console.log(`  Legacy external (wknd-adventures.com): ${inventory.filter((i) => i.classification === 'external-legacy').length}`);
  console.log(`  Saved: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
