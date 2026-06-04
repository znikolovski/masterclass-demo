#!/usr/bin/env node
/**
 * Add adventureCategory and journeyStage to key pages in Document Authoring.
 * Prerequisites: valid DA token in .hlx/.da-token.json (run `aem login` or da-auth).
 * Usage: node tools/scripts/patch-analytics-metadata.mjs [--dry-run] [--preview]
 */

import { readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ORG = 'znikolovski';
const SITE = 'masterclass-demo';
const BRANCH = 'main';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DRY_RUN = process.argv.includes('--dry-run');
const PREVIEW = process.argv.includes('--preview');

/** @type {Record<string, { adventureCategory: string, journeyStage: string, template?: string }>} */
const PAGE_ANALYTICS = {
  '/': { adventureCategory: 'general-outdoor', journeyStage: 'inspiration', template: 'homepage' },
  '/about': { adventureCategory: 'general-outdoor', journeyStage: 'community', template: 'page' },
  '/adventures': { adventureCategory: 'general-outdoor', journeyStage: 'discovery', template: 'landing-page' },
  '/destinations': { adventureCategory: 'general-outdoor', journeyStage: 'discovery', template: 'landing-page' },
  '/expeditions': { adventureCategory: 'general-outdoor', journeyStage: 'planning', template: 'landing-page' },
  '/gear': { adventureCategory: 'general-outdoor', journeyStage: 'planning', template: 'landing-page' },
  '/faq': { adventureCategory: 'general-outdoor', journeyStage: 'planning', template: 'landing-page' },
  '/basecamp': { adventureCategory: 'general-outdoor', journeyStage: 'planning', template: 'landing-page' },
  '/field-notes': { adventureCategory: 'photography', journeyStage: 'inspiration', template: 'landing-page' },
  '/community': { adventureCategory: 'general-outdoor', journeyStage: 'community', template: 'page' },
  '/sustainability': { adventureCategory: 'general-outdoor', journeyStage: 'community', template: 'page' },
};

/** @type {Record<string, { adventureCategory: string, journeyStage: string }>} */
const BLOG_ANALYTICS = {
  'yosemite-rock-climbing': { adventureCategory: 'climbing', journeyStage: 'inspiration' },
  'patagonia-trek': { adventureCategory: 'trekking', journeyStage: 'inspiration' },
  'wild-swimming-guide': { adventureCategory: 'water', journeyStage: 'inspiration' },
  'alpine-cycling': { adventureCategory: 'cycling', journeyStage: 'inspiration' },
  'kayaking-norway': { adventureCategory: 'water', journeyStage: 'inspiration' },
  'winter-mountaineering': { adventureCategory: 'winter-alpine', journeyStage: 'inspiration' },
  'desert-survival-guide': { adventureCategory: 'desert', journeyStage: 'inspiration' },
  'mountain-photography': { adventureCategory: 'photography', journeyStage: 'inspiration' },
  'ultralight-backpacking': { adventureCategory: 'trekking', journeyStage: 'inspiration' },
  'surfing-costa-rica': { adventureCategory: 'water', journeyStage: 'inspiration' },
};

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
      /* continue */
    }
  }
  return null;
}

/**
 * @param {string} html
 * @param {string} key
 * @param {string} value
 */
function upsertDivMetadataRow(html, key, value) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rowRegex = new RegExp(
    `<div>\\s*<div>${escaped}<\\/div>\\s*<div>[\\s\\S]*?<\\/div>\\s*<\\/div>`,
    'i',
  );
  const newRow = `    <div>
      <div>${key}</div>
      <div>${value}</div>
    </div>`;

  if (html.includes('class="metadata"')) {
    if (rowRegex.test(html)) {
      return html.replace(rowRegex, newRow);
    }
    return html.replace(
      /(<div class="metadata">[\s\S]*?)(\n\s*<\/div>\s*\n\s*<\/div>)/,
      `$1\n${newRow}$2`,
    );
  }

  const section = `
<div>
  <div class="metadata">
${newRow}
  </div>
</div>`;
  return `${html.trim()}\n${section}`;
}

/**
 * @param {string} html
 * @param {string} key
 * @param {string} value
 */
function upsertTableMetadataRow(html, key, value) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rowRegex = new RegExp(
    `<tr><td>${escaped}<\\/td><td>[\\s\\S]*?<\\/td><\\/tr>`,
    'i',
  );
  const newRow = `<tr><td>${key}</td><td>${value}</td></tr>`;

  if (/Metadata<\/td><\/tr>/i.test(html)) {
    if (rowRegex.test(html)) {
      return html.replace(rowRegex, newRow);
    }
    return html.replace(
      /(<table>[\s\S]*?Metadata[\s\S]*?<tbody>[\s\S]*?)(<\/tbody>)/i,
      `$1\n      ${newRow}\n    $2`,
    );
  }
  return html;
}

/**
 * @param {string} html
 * @param {Record<string, string>} fields
 */
function patchMetadata(html, fields) {
  let out = html;
  Object.entries(fields).forEach(([key, value]) => {
    if (!value) return;
    if (out.includes('class="metadata"')) {
      out = upsertDivMetadataRow(out, key, value);
    } else if (/Metadata<\/td><\/tr>/i.test(out)) {
      out = upsertTableMetadataRow(out, key, value);
    } else {
      out = upsertDivMetadataRow(out, key, value);
    }
  });
  return out;
}

function daPath(path) {
  const normalized = path === '/' ? 'index' : path.replace(/^\//, '');
  return `${normalized}.html`;
}

function listBlogPaths() {
  const dir = join(ROOT, 'tools/importer/reports/blog');
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.report.json'))
      .map((f) => `/blog/${basename(f, '.report.json')}`);
  } catch {
    return Object.keys(BLOG_ANALYTICS).map((slug) => `/blog/${slug}`);
  }
}

function buildPageList() {
  const pages = Object.keys(PAGE_ANALYTICS);
  const blogs = listBlogPaths();
  return [...pages, ...blogs];
}

function fieldsForPath(path) {
  if (path.startsWith('/blog/')) {
    const slug = path.split('/').pop();
    const blog = BLOG_ANALYTICS[slug] || { adventureCategory: 'general-outdoor', journeyStage: 'inspiration' };
    return {
      adventureCategory: blog.adventureCategory,
      journeyStage: blog.journeyStage,
      template: 'blog-article',
    };
  }
  return PAGE_ANALYTICS[path] || {};
}

async function getSource(token, path) {
  const url = `https://admin.da.live/source/${ORG}/${SITE}/${daPath(path)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.text();
}

async function putSource(token, path, body) {
  const form = new FormData();
  const file = daPath(path);
  form.append('data', new Blob([body], { type: 'text/html' }), basename(file));
  const url = `https://admin.da.live/source/${ORG}/${SITE}/${file}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PUT ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
}

async function triggerPreview(token, path) {
  const normalized = path === '/' ? '' : path;
  const url = `https://admin.hlx.page/preview/${ORG}/${SITE}/${BRANCH}${normalized}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.warn(`  ! preview ${path} → ${res.status}`);
  }
}

const token = getToken();
if (!token) {
  console.error('No valid DA token. Run: aem login (or complete da-auth in browser).');
  process.exit(1);
}

const paths = buildPageList();
console.log(`${DRY_RUN ? 'Dry run' : 'Patching'} analytics metadata on ${paths.length} pages…\n`);

let updated = 0;
for (const path of paths) {
  const fields = fieldsForPath(path);
  const before = await getSource(token, path);
  const after = patchMetadata(before, fields);
  if (before === after) {
    console.log(`  − ${path} (unchanged)`);
    continue;
  }
  if (DRY_RUN) {
    console.log(`  ~ ${path} → ${fields.adventureCategory} / ${fields.journeyStage}`);
    continue;
  }
  await putSource(token, path, after);
  if (PREVIEW) await triggerPreview(token, path);
  console.log(`  ✓ ${path} → ${fields.adventureCategory} / ${fields.journeyStage}`);
  updated += 1;
}

console.log(`\nDone. ${updated} page(s) updated.${PREVIEW ? ' Preview triggered.' : ''}`);
