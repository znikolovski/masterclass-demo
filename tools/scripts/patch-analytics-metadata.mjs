#!/usr/bin/env node
/* eslint-disable import/extensions, no-restricted-syntax, no-await-in-loop, no-continue */
/**
 * Add adventureInterest, adventureCategory, and journeyStage to pages in DA.
 * Usage: node tools/scripts/patch-analytics-metadata.mjs [--dry-run] [--preview] [--publish]
 */

import { readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BLOG_ANALYTICS, PAGE_ANALYTICS, fieldsForPath,
} from './lib/adventure-page-metadata.mjs';
import {
  getDaToken, putSource, triggerPreview, triggerPublish,
} from './lib/da-source.mjs';

const ORG = 'znikolovski';
const SITE = 'masterclass-demo';
const BRANCH = 'main';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DRY_RUN = process.argv.includes('--dry-run');
const PREVIEW = process.argv.includes('--preview');
const PUBLISH = process.argv.includes('--publish');

/**
 * @param {string} key
 */
function escapeRegex(key) {
  return key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} html
 * @param {string} key
 * @param {string} value
 */
function upsertDivMetadataRow(html, key, value) {
  const escaped = escapeRegex(key);
  const rowRegex = new RegExp(
    `<div>\\s*<div>(?:<p>)?\\s*${escaped}\\s*(?:<\\/p>)?\\s*<\\/div>\\s*<div>[\\s\\S]*?<\\/div>\\s*<\\/div>`,
    'i',
  );
  const newRow = `<div><div><p>${key}</p></div><div><p>${value}</p></div></div>`;

  if (html.includes('class="metadata"')) {
    if (rowRegex.test(html)) {
      return html.replace(rowRegex, newRow);
    }
    return html.replace(
      /(<div class="metadata">)/i,
      `$1\n    ${newRow}`,
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
  const escaped = escapeRegex(key);
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

async function getSource(token, path) {
  const normalized = path === '/' ? 'index' : path.replace(/^\//, '');
  const url = `https://admin.da.live/source/${ORG}/${SITE}/${normalized}.html`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.text();
}

const token = getDaToken(ROOT);
if (!token) {
  console.error('No valid DA token. Run: npx github:adobe-rnd/da-auth-helper token');
  process.exit(1);
}

const paths = [
  ...Object.keys(PAGE_ANALYTICS),
  ...listBlogPaths(),
];

console.log(`${DRY_RUN ? 'Dry run' : 'Patching'} adventure metadata on ${paths.length} pages…\n`);

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
    console.log(`  ~ ${path} → ${fields.adventureInterest || '—'} / ${fields.adventureCategory} / ${fields.journeyStage}`);
    continue;
  }
  await putSource(token, ORG, SITE, path, after);
  if (PREVIEW) await triggerPreview(token, ORG, SITE, BRANCH, path);
  if (PUBLISH) await triggerPublish(token, ORG, SITE, BRANCH, path);
  console.log(`  ✓ ${path} → interest=${fields.adventureInterest || '—'} category=${fields.adventureCategory}`);
  updated += 1;
}

console.log(`\nDone. ${updated} page(s) updated.`);
