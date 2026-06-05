#!/usr/bin/env node
/**
 * Build DAM migration manifest from live image inventory + repo legacy URLs.
 *
 * Usage:
 *   node tools/aem-assets/build-migration-manifest.mjs
 *   node tools/aem-assets/build-migration-manifest.mjs --base=https://main--masterclass-demo--znikolovski.aem.live
 */

import {
  readFileSync, writeFileSync, mkdirSync, readdirSync, statSync,
} from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const DEFAULT_BASE = 'https://main--masterclass-demo--znikolovski.aem.live';

const LEGACY_FOLDER_MAP = {
  adventures: '/content/dam/wknd-adventures/adventures',
  activities: '/content/dam/wknd-adventures/activities',
  magazine: '/content/dam/wknd-adventures/magazine',
  contributors: '/content/dam/wknd-adventures/contributors',
};

/** Live fallback when legacy wknd-adventures.com URL is dead (404). */
const LEGACY_SOURCE_FALLBACK = {
  'activities/garibaldi-lake.jpg': 'https://main--masterclass-demo--znikolovski.aem.live/media_1e4b49be43a70d306b1c312d0d78dd369b5ccce40.jpg',
};

const INVALID_SRC = /^(about:|data:|javascript:|#)/i;

/** @type {Record<string, string>} */
const PAGE_CATEGORY = {
  '/field-notes': 'photography',
  '/blog/alpine-cycling': 'cycling',
  '/blog/yosemite-rock-climbing': 'climbing',
  '/blog/patagonia-trek': 'trekking',
  '/blog/wild-swimming-guide': 'water',
  '/blog/kayaking-norway': 'water',
  '/blog/surfing-costa-rica': 'water',
  '/blog/winter-mountaineering': 'winter-alpine',
  '/blog/desert-survival-guide': 'desert',
  '/blog/mountain-photography': 'photography',
};

function parseArgs(argv) {
  const opts = { base: DEFAULT_BASE };
  argv.forEach((arg) => {
    if (arg.startsWith('--base=')) opts.base = arg.slice(7);
  });
  return opts;
}

/**
 * @param {string} src
 */
function normalizeSrc(src) {
  return src.replace(/&#x26;/g, '&').replace(/&amp;/g, '&');
}

/**
 * @param {string} src
 * @param {string} origin
 */
function toSourceUrl(src, origin) {
  const clean = normalizeSrc(src);
  if (clean.startsWith('http')) return clean.split('?')[0];
  if (clean.startsWith('./media_') || clean.startsWith('/media_')) {
    const file = clean.split('?')[0].replace(/^\.?\//, '');
    return `${origin}/${file}`;
  }
  return clean;
}

/**
 * @param {string} src
 */
function toFileName(src) {
  const clean = normalizeSrc(src);
  const path = clean.split('?')[0];
  const name = basename(path);
  return name || 'asset.jpg';
}

/**
 * @param {string[]} pages
 * @param {string} [legacyPath]
 */
function resolveDamFolder(pages, legacyPath) {
  if (legacyPath) {
    const segment = legacyPath.includes('/images/')
      ? legacyPath.split('/images/')[1]?.split('/')[0]
      : legacyPath.split('/')[0];
    if (segment && LEGACY_FOLDER_MAP[segment]) return LEGACY_FOLDER_MAP[segment];
  }
  if (pages.some((p) => p.startsWith('/blog/'))) return '/content/dam/wknd-adventures/blog';
  if (pages.includes('/field-notes')) return '/content/dam/wknd-adventures/magazine';
  if (pages.includes('/') && pages.length <= 3) return '/content/dam/wknd-adventures/heroes';
  if (pages.some((p) => ['/adventures', '/destinations', '/expeditions'].includes(p))) {
    return '/content/dam/wknd-adventures/adventures';
  }
  return '/content/dam/wknd-adventures/activities';
}

/**
 * @param {string[]} pages
 */
function resolveCategory(pages) {
  for (const page of pages) {
    if (PAGE_CATEGORY[page]) return PAGE_CATEGORY[page];
  }
  return 'general-outdoor';
}

/**
 * Multi-select wknd:contentUsage — returns all applicable usage tags.
 * @param {string[]} pages
 * @param {string} damFolder
 * @param {string} [legacyRelPath]
 * @returns {string[]}
 */
function resolveContentUsage(pages, damFolder, legacyRelPath) {
  /** @type {Set<string>} */
  const usages = new Set();

  if (pages.some((p) => p.startsWith('/blog/'))) usages.add('blog');
  if (damFolder.includes('/heroes') || pages.some((p) => ['/', '/about'].includes(p))) {
    usages.add('hero');
  }
  if (damFolder.includes('/magazine') || pages.includes('/field-notes')) usages.add('magazine');
  if (damFolder.includes('/contributors')) usages.add('contributor');
  if (pages.some((p) => ['/adventures', '/destinations', '/expeditions', '/gear'].includes(p))) {
    usages.add('card');
  }
  if (legacyRelPath?.startsWith('magazine/')) usages.add('magazine');
  if (legacyRelPath?.startsWith('contributors/')) usages.add('contributor');
  if (legacyRelPath?.startsWith('adventures/')) usages.add('card');

  if (usages.size === 0) usages.add('card');
  return [...usages].sort();
}

/**
 * @param {string} url
 */
function mimeFromName(url) {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
  const map = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
  };
  return map[ext] || 'image/jpeg';
}

function collectLegacyUrls() {
  const re = /https:\/\/wknd-adventures\.com\/images\/([^"']+)/g;
  /** @type {Map<string, string>} */
  const urls = new Map();

  /** @param {string} d */
  function scan(d) {
    readdirSync(d).forEach((f) => {
      const p = join(d, f);
      try {
        const s = statSync(p);
        if (s.isDirectory() && !f.startsWith('.') && f !== 'node_modules') scan(p);
        else if (/\.(html|json|md)$/.test(f)) {
          const t = readFileSync(p, 'utf8');
          let m;
          while ((m = re.exec(t))) {
            urls.set(`https://wknd-adventures.com/images/${m[1]}`, m[1]);
          }
        }
      } catch {
        // skip unreadable paths
      }
    });
  }

  ['blocks', 'templates', 'tools/sidekick', 'drafts'].forEach((d) => scan(join(ROOT, d)));
  return urls;
}

/** @type {string[]} */
const PRESERVE_FIELDS = [
  'status', 'damPath', 'deliveryUrl', 'assetId', 'localPath', 'error',
  'metadataApplied', 'metadataMethod', 'metadataVerified', 'metadataError',
];

/**
 * @param {object} item
 * @param {Map<string, object>} previousByFile
 */
function preserveMigrationState(item, previousByFile) {
  const prev = previousByFile.get(item.fileName);
  if (!prev) return item;
  PRESERVE_FIELDS.forEach((field) => {
    if (prev[field] != null) item[field] = prev[field];
  });
  return item;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const origin = new URL(opts.base).origin;
  const inventoryPath = join(ROOT, 'tools/scripts/output/image-migration-inventory.json');
  const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
  const outPath = join(__dirname, 'output/migration-manifest.json');

  /** @type {Map<string, object>} */
  const previousByFile = new Map();
  try {
    const previous = JSON.parse(readFileSync(outPath, 'utf8'));
    previous.items?.forEach((item) => previousByFile.set(item.fileName, item));
  } catch {
    // no prior manifest
  }

  /** @type {Map<string, object>} */
  const byKey = new Map();

  inventory.items.forEach((item) => {
    const src = normalizeSrc(item.src);
    if (INVALID_SRC.test(src)) return;
    const key = src.split('?')[0];
    byKey.set(key, {
      contentSrc: src,
      sourceUrl: toSourceUrl(src, origin),
      fileName: toFileName(src),
      mimeType: mimeFromName(toSourceUrl(src, origin)),
      classification: item.classification,
      pages: item.pages,
      count: item.count,
      damFolder: resolveDamFolder(item.pages),
      assetMetadata: {
        'dc:title': toFileName(src).replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
        'wknd:adventureCategory': resolveCategory(item.pages),
        'wknd:contentUsage': resolveContentUsage(item.pages, resolveDamFolder(item.pages)),
      },
      legacyUrl: null,
      status: 'pending',
      damPath: null,
      deliveryUrl: null,
      assetId: null,
    });
  });

  collectLegacyUrls().forEach((relPath, url) => {
    const fileName = basename(relPath);
    const key = `legacy:${fileName}`;
    if (byKey.has(key)) return;
    const fallbackUrl = LEGACY_SOURCE_FALLBACK[relPath];
    byKey.set(key, {
      contentSrc: url,
      sourceUrl: fallbackUrl || url,
      fileName,
      mimeType: mimeFromName(url),
      classification: 'external-legacy',
      pages: [],
      count: 0,
      damFolder: resolveDamFolder([], relPath),
      assetMetadata: {
        'dc:title': fileName.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
        'wknd:adventureCategory': 'general-outdoor',
        'wknd:contentUsage': resolveContentUsage([], resolveDamFolder([], relPath), relPath),
      },
      legacyUrl: url,
      status: 'pending',
      damPath: null,
      deliveryUrl: null,
      assetId: null,
    });
  });

  const items = [...byKey.values()]
    .map((item) => preserveMigrationState(item, previousByFile))
    .sort((a, b) => b.count - a.count);

  const manifest = {
    generatedAt: new Date().toISOString(),
    origin,
    authorUrl: 'https://author-p115476-e1135027.adobeaemcloud.com',
    total: items.length,
    items,
  };

  const outDir = join(__dirname, 'output');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  console.log(`Migration manifest: ${manifest.total} assets`);
  console.log(`  Media-bus / live: ${manifest.items.filter((i) => i.classification === 'media-bus').length}`);
  console.log(`  Legacy (repo only): ${manifest.items.filter((i) => i.classification === 'external-legacy').length}`);
  console.log(`  Saved: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
