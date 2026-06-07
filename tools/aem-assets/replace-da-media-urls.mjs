#!/usr/bin/env node
/**
 * Replace Media Bus / legacy / content.da.live image URLs in DA with DAM delivery URLs.
 *
 * Prerequisites:
 *   - migration-manifest.json with deliveryUrl populated (after DM publish)
 *   - DA token in .hlx/.da-token.json or ~/.aem/da-token.json
 *
 * Usage:
 *   npm run migrate:replace-da -- --dry-run
 *   npm run migrate:replace-da -- --preview
 *   npm run migrate:replace-da -- --preview --publish
 *   npm run migrate:replace-da -- --include-drafts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLegacyScene7Url, isOpenApiDeliveryUrl } from './dam-delivery.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const ORG = 'znikolovski';
const SITE = 'masterclass-demo';
const MANIFEST_PATH = join(__dirname, 'output/migration-manifest.json');

const DRY_RUN = process.argv.includes('--dry-run');
const PREVIEW = process.argv.includes('--preview');
const PUBLISH = process.argv.includes('--publish');
const INCLUDE_DRAFTS = process.argv.includes('--include-drafts');
const INCLUDE_LIBRARY = process.argv.includes('--include-library');

function getToken() {
  const paths = [
    join(ROOT, '.hlx/.da-token.json'),
    `${process.env.HOME}/.aem/da-token.json`,
  ];
  for (const p of paths) {
    try {
      const raw = JSON.parse(readFileSync(p, 'utf8'));
      const token = raw.access_token || raw.imsToken;
      const expires = raw.expires_at || (raw.imsTokenExpiry && raw.imsTokenExpiry * 1000);
      if (token && (!expires || expires > Date.now() + 60_000)) return token;
    } catch {
      // continue
    }
  }
  return null;
}

/**
 * @param {string} value
 */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strip DA content hash suffix: hero-mountain-83c7a2a5.jpeg → hero-mountain.jpeg
 * @param {string} name
 */
function stripDaHashSuffix(name) {
  return name.replace(/-[a-f0-9]{6,10}(?=\.[^.]+$)/i, '');
}

/**
 * @param {string} ref
 */
function basenameKey(ref) {
  if (!ref) return null;
  const name = basename(ref.split('?')[0]);
  const stripped = stripDaHashSuffix(name);
  const stem = stripped.replace(/\.[^.]+$/, '').toLowerCase();
  return stem.length >= 4 ? stem : null;
}

/**
 * @param {object} manifest
 */
function buildReplacements(manifest) {
  /** @type {Array<{from: RegExp, to: string, label: string}>} */
  const rules = [];
  const seen = new Set();

  /**
   * @param {string} pattern
   * @param {string} to
   * @param {string} label
   */
  function addRule(pattern, to, label) {
    const key = `${pattern}→${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    rules.push({ from: new RegExp(pattern, 'g'), to, label });
  }

  /** @type {Map<string, string>} */
  const stemToDelivery = new Map();

  manifest.items.forEach((item) => {
    if (!item.deliveryUrl || !isOpenApiDeliveryUrl(item.deliveryUrl)) return;

    const file = escapeRegex(item.fileName);
    addRule(
      `(?:https?:\\/\\/[^"'\\s>]+\\/)?${file}(?:\\?[^"'\\s>]*)?`,
      item.deliveryUrl,
      `file:${item.fileName}`,
    );

    if (item.sourceUrl) {
      addRule(
        `${escapeRegex(item.sourceUrl)}(?:\\?[^"'\\s>]*)?`,
        item.deliveryUrl,
        `source:${item.fileName}`,
      );
    }

    if (item.legacyUrl) {
      addRule(escapeRegex(item.legacyUrl), item.deliveryUrl, `legacy:${item.fileName}`);
      const legacyPath = item.legacyUrl.replace(/^https?:\/\/wknd-adventures\.com\/images\//, '');
      if (legacyPath !== item.legacyUrl) {
        addRule(
          `https:\\/\\/wknd-adventures\\.com\\/images\\/${escapeRegex(legacyPath)}`,
          item.deliveryUrl,
          `wknd-path:${item.fileName}`,
        );
      }
    }

    const rel = item.contentSrc.split('?')[0].replace(/^\.\//, '');
    if (rel.startsWith('media_')) {
      addRule(
        `\\.\\/${escapeRegex(rel)}(?:\\?[^"'\\s>]*)?`,
        item.deliveryUrl,
        `relative:${item.fileName}`,
      );
    }

    [item.fileName, item.legacyUrl, item.sourceUrl, item.contentSrc].forEach((ref) => {
      const stem = basenameKey(ref);
      if (stem) stemToDelivery.set(stem, item.deliveryUrl);
    });
  });

  stemToDelivery.forEach((deliveryUrl, stem) => {
    // Avoid overly broad stems (e.g. "adobestock" matching many assets).
    if (stem.length < 12 && !stem.includes('-')) return;
    const escapedStem = escapeRegex(stem);
    addRule(
      `https:\\/\\/content\\.da\\.live\\/${ORG}\\/${SITE}\\/[^"'\\s>]*${escapedStem}(?:-[a-f0-9]{6,10})?\\.[^"'\\s>]+`,
      deliveryUrl,
      `da.live:${stem}`,
    );
    addRule(
      `https:\\/\\/wknd-adventures\\.com\\/images\\/[^"'\\s>]*${escapedStem}\\.[^"'\\s>]+`,
      deliveryUrl,
      `wknd-stem:${stem}`,
    );
  });

  return rules;
}

/**
 * @param {string} token
 * @param {string} prefix
 */
async function listDaEntries(token, prefix = '') {
  const res = await fetch(`https://admin.da.live/list/${ORG}/${SITE}${prefix}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  return res.json();
}

/**
 * @param {string} token
 */
async function listDaHtmlPaths(token) {
  /** @param {string} prefix */
  async function walk(prefix = '') {
    const entries = await listDaEntries(token, prefix);
    /** @type {string[]} */
    const files = [];

    for (const entry of entries) {
      const name = entry.path?.split('/').pop() || entry.name;
      if (entry.ext === 'html') {
        const rel = prefix ? `${prefix.replace(/^\//, '')}/${name}` : name;
        files.push(rel);
        continue;
      }
      if (!entry.ext && name && !name.endsWith('.html')) {
        if (!INCLUDE_DRAFTS && name === 'drafts') continue;
        if (!INCLUDE_LIBRARY && (name === 'library' || name === 'blocks')) continue;
        files.push(...await walk(`${prefix}/${name}`));
      }
    }
    return files;
  }

  return walk();
}

/**
 * @param {string} path
 */
function daPath(path) {
  const normalized = path === '/' ? 'index' : path.replace(/^\//, '');
  return `${normalized}.html`;
}

/**
 * @param {string} token
 * @param {string} file
 */
async function getSource(token, file) {
  const url = `https://admin.da.live/source/${ORG}/${SITE}/${file}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`GET ${file} → ${res.status}`);
  return res.text();
}

/**
 * @param {string} token
 * @param {string} file
 * @param {string} body
 */
async function putSource(token, file, body) {
  const form = new FormData();
  form.append('data', new Blob([body], { type: 'text/html' }), basename(file));
  const url = `https://admin.da.live/source/${ORG}/${SITE}/${file}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(`PUT ${file} → ${res.status} ${await res.text()}`);
}

/**
 * @param {string} html
 * @param {Array<{from: RegExp, to: string, label: string}>} rules
 */
function applyReplacements(html, rules) {
  let out = html;
  /** @type {string[]} */
  const labels = [];

  rules.forEach(({ from, to, label }) => {
    const before = out;
    out = out.replace(from, to);
    if (out !== before) labels.push(label);
  });

  return { html: out, count: labels.length, labels };
}

/**
 * @param {string} html
 */
function collectUnmatchedImageUrls(html) {
  const daLive = [...new Set(html.match(/https:\/\/content\.da\.live\/[^"'\s>]+\.(?:jpg|jpeg|png|webp)/gi) || [])];
  const wknd = [...new Set(html.match(/https:\/\/wknd-adventures\.com\/images\/[^"'\s>]+/gi) || [])];
  const mediaBus = [...new Set(html.match(/https:\/\/main--masterclass-demo--znikolovski\.aem\.live\/media_[^"'\s>]+/gi) || [])];
  return { daLive, wknd, mediaBus };
}

/**
 * DA file path → admin.hlx.page path (no .html).
 * @param {string} file
 */
function pagePathFromFile(file) {
  const stem = file.replace(/\.html$/, '');
  if (stem === 'index') return '/';
  return `/${stem}`;
}

/**
 * Trigger preview ingestion (required after DA source PUT).
 * @param {string} token
 * @param {string} file
 */
async function previewPage(token, file) {
  const path = pagePathFromFile(file);
  const adminPath = path === '/' ? '/' : path;
  const res = await fetch(
    `https://admin.hlx.page/preview/${ORG}/${SITE}/main${adminPath}`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
  );
  const base = `https://${ORG}--${SITE}.aem.page`;
  const url = path === '/' ? `${base}/` : `${base}${path}`;
  if (!res.ok) {
    console.warn(`  preview failed ${file}: ${res.status} ${(await res.text()).slice(0, 120)}`);
    return;
  }
  console.log(`  previewed: ${url}`);
}

/**
 * @param {string} token
 * @param {string} file
 */
async function publishPage(token, file) {
  const path = pagePathFromFile(file);
  const adminPath = path === '/' ? '/' : path;
  const res = await fetch(
    `https://admin.hlx.page/live/${ORG}/${SITE}/main${adminPath}`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
  );
  const base = `https://${ORG}--${SITE}.aem.live`;
  const url = path === '/' ? `${base}/` : `${base}${path}`;
  if (!res.ok) {
    console.warn(`  publish failed ${file}: ${res.status} ${(await res.text()).slice(0, 120)}`);
    return;
  }
  console.log(`  published: ${url}`);
}

async function main() {
  const token = getToken();
  if (!token) {
    console.error('No valid DA token. Run da-auth first.');
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const withDelivery = manifest.items.filter((i) => isOpenApiDeliveryUrl(i.deliveryUrl));
  const legacyOnly = manifest.items.filter(
    (i) => i.deliveryUrl && isLegacyScene7Url(i.deliveryUrl),
  ).length;
  if (!withDelivery.length) {
    console.error('No Open API deliveryUrl entries in manifest.');
    if (legacyOnly) {
      console.error(`  ${legacyOnly} assets still have legacy Scene7 URLs.`);
      console.error('  Run: npm run migrate:resolve-delivery -- --upgrade-legacy');
    } else {
      console.error('  Run migrate:resolve-delivery first.');
    }
    process.exit(1);
  }
  if (legacyOnly) {
    console.warn(`Skipping ${legacyOnly} legacy Scene7 URLs (use --upgrade-legacy on resolve-delivery).`);
  }

  const rules = buildReplacements(manifest);
  const files = await listDaHtmlPaths(token);
  console.log(`Scanning ${files.length} DA HTML files (${rules.length} replacement rules)…`);

  let updated = 0;
  let replacementGroups = 0;
  /** @type {Set<string>} */
  const unmatchedDaLive = new Set();
  /** @type {Set<string>} */
  const unmatchedWknd = new Set();
  /** @type {Set<string>} */
  const unmatchedMediaBus = new Set();

  for (const file of files) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const html = await getSource(token, file);
      const { html: next, count, labels } = applyReplacements(html, rules);

      const remaining = collectUnmatchedImageUrls(next);
      remaining.daLive.forEach((u) => unmatchedDaLive.add(u));
      remaining.wknd.forEach((u) => unmatchedWknd.add(u));
      remaining.mediaBus.forEach((u) => unmatchedMediaBus.add(u));

      if (!count) continue;

      console.log(`${file}: ${count} replacement group(s) [${labels.join(', ')}]`);
      replacementGroups += count;

      if (DRY_RUN) continue;

      // eslint-disable-next-line no-await-in-loop
      await putSource(token, file, next);
      updated += 1;

      if (PREVIEW) {
        // eslint-disable-next-line no-await-in-loop
        await previewPage(token, file);
      }
      if (PUBLISH) {
        // eslint-disable-next-line no-await-in-loop
        await publishPage(token, file);
      }
    } catch (err) {
      console.warn(`${file}: ${err.message}`);
    }
  }

  console.log(DRY_RUN ? '\nDry run complete.' : `\nUpdated ${updated} DA file(s), ${replacementGroups} replacement group(s).`);

  if (unmatchedDaLive.size || unmatchedWknd.size || unmatchedMediaBus.size) {
    console.log('\nStill unmigrated after run (no manifest deliveryUrl match):');
    if (unmatchedDaLive.size) {
      console.log(`  content.da.live: ${unmatchedDaLive.size} unique URL(s) — DA-hosted binaries not in DAM manifest`);
    }
    if (unmatchedWknd.size) {
      console.log(`  wknd-adventures.com: ${unmatchedWknd.size} unique URL(s) — add to DAM or expand manifest`);
      [...unmatchedWknd].slice(0, 5).forEach((u) => console.log(`    ${u}`));
    }
    if (unmatchedMediaBus.size) {
      console.log(`  aem.live/media_*: ${unmatchedMediaBus.size} unique URL(s)`);
    }
    console.log('\nTip: DA pages mostly use content.da.live copies with different filenames than the');
    console.log('media_bus assets in migration-manifest.json. Re-pick images via AEM Asset Selector,');
    console.log('or upload the missing legacy/DA binaries and re-run resolve-delivery + replace-da.');
  }

  if (!DRY_RUN && updated > 0 && !PREVIEW) {
    console.log('\nRun with --preview to ingest DA changes (admin.hlx.page/preview).');
  }
  if (!DRY_RUN && updated > 0 && PREVIEW && !PUBLISH) {
    console.log('\nPreview updated. Run with --publish to push the same pages to aem.live.');
  }
  console.log('\nNote: img src URLs are sideloaded to ./media_<hash> at preview (Media Bus).');
  console.log('Scene7 URLs in HTML after delivery are expected — bytes may still come from DAM.');
  console.log('For live DM CDN URLs at runtime, use Asset Selector copyMode: reference (Approach B).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
