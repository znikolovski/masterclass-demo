#!/usr/bin/env node
/**
 * Configure Document Authoring Library (blocks + templates in the Author sidebar).
 * See https://docs.da.live/administrators/guides/setup-library
 *
 * Prerequisites: `aem content clone --path /` (cached token in .hlx/.da-token.json)
 * Usage: node tools/sidekick/setup-da-library.mjs
 *
 * Git copies use full HTML documents (scripts + styles) so DA .html preview URLs
 * on the code bus render styled blocks. DA uploads use full documents; templates
 * use <table> block markup so Experience Workspace insertTemplate preserves blocks.
 */

import {
  mkdirSync, readFileSync, readdirSync, statSync, writeFileSync,
} from 'node:fs';
import {
  basename, dirname, join, relative,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { wrapLibraryPreviewPage } from './wrap-library-preview.mjs';

const ORG = 'znikolovski';
const SITE = 'masterclass-demo';
const CONTENT_BASE = `https://content.da.live/${ORG}/${SITE}`;
const PREVIEW_BASE = `https://main--${SITE}--${ORG}.aem.page`;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function getToken() {
  const paths = [
    join(ROOT, '.hlx/.da-token.json'),
    `${process.env.HOME}/.aem/da-token.json`,
    `${process.env.HOME}/.aem/ims-token.json`,
  ];
  for (const p of paths) {
    try {
      const raw = JSON.parse(readFileSync(p, 'utf8'));
      const token = raw.access_token || raw.imsToken;
      const expires = raw.expires_at || (raw.imsTokenExpiry && raw.imsTokenExpiry * 1000);
      if (token && (!expires || expires > Date.now() + 60_000)) return token;
    } catch {
      /* try next path */
    }
  }
  return null;
}

async function putSource(token, daPath, body, mime = 'application/json') {
  const form = new FormData();
  form.append('data', new Blob([body], { type: mime }), basename(daPath));
  const url = `https://admin.da.live/source/${ORG}/${SITE}/${daPath}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PUT ${daPath} → ${res.status}: ${text.slice(0, 300)}`);
  }
}

async function triggerPreview(token, daPath) {
  const pagePath = daPath.replace(/\.html$/, '');
  const res = await fetch(`https://admin.hlx.page/preview/${ORG}/${SITE}/main/${pagePath}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    console.warn(`  ⚠ preview ${pagePath} → ${res.status}: ${text.slice(0, 120)}`);
  }
}

async function getConfig(token) {
  const res = await fetch(`https://admin.da.live/config/${ORG}/${SITE}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET config → ${res.status}`);
  return res.json();
}

async function saveConfig(token, config, exists) {
  const form = new FormData();
  form.append('config', JSON.stringify(config));
  const method = exists ? 'POST' : 'PUT';
  const res = await fetch(`https://admin.da.live/config/${ORG}/${SITE}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} config → ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

function walkPlainHtml(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walkPlainHtml(abs, files);
    else if (name.endsWith('.plain.html')) files.push(abs);
  }
  return files;
}

/** Full DA page skeleton — templates must match live page source shape for EW insert. */
function wrapDaDocument(fragment) {
  return `<body><header></header><main>\n${fragment.trim()}\n</main><footer></footer></body>`;
}

/** EW insertTemplate collapses sibling section divs; <hr> restores section breaks on save. */
function wrapDaTemplate(fragment) {
  const withSectionBreaks = fragment.replace(/<\/div>\s*\n\s*<hr>\s*\n\s*<div>/gi, '</div>\n<hr>\n<div>')
    .replace(/<\/div>\s*\n\s*<div>/g, '</div>\n<hr>\n<div>');
  return wrapDaDocument(withSectionBreaks);
}

function buildLibraryRows(existingRows = []) {
  const byTitle = new Map(existingRows.map((row) => [row.title, row]));
  const required = [
    {
      title: 'Blocks',
      path: `${CONTENT_BASE}/library/blocks.json`,
    },
    {
      title: 'Templates',
      path: `${CONTENT_BASE}/library/templates.json`,
    },
    {
      title: 'AEM Assets',
      path: `${PREVIEW_BASE}/tools/aem-assets/aem-assets.html`,
      experience: 'fullsize-dialog',
    },
  ];
  required.forEach((row) => byTitle.set(row.title, { ...byTitle.get(row.title), ...row }));
  return [...byTitle.values()];
}

function buildDaConfig(existing) {
  const existingLibrary = existing?.library?.data || [];
  const libraryRows = buildLibraryRows(existingLibrary);

  const librarySheet = {
    ':type': 'sheet',
    columns: ['title', 'path', 'format', 'ref', 'icon', 'experience'],
    total: libraryRows.length,
    data: libraryRows,
  };

  if (existing?.[':type'] === 'multi-sheet') {
    const names = new Set(existing[':names'] || []);
    names.add('library');
    if (!names.has('permissions')) names.add('permissions');
    if (!names.has('data')) names.add('data');
    return {
      ...existing,
      ':names': [...names],
      library: librarySheet,
    };
  }

  const permissions = existing?.permissions || {
    ':type': 'sheet',
    columns: ['path', 'actions', 'groups'],
    total: 2,
    data: [
      { path: 'CONFIG', actions: 'write', groups: '*' },
      { path: '/**', actions: 'read,write', groups: '*' },
    ],
  };

  const data = existing?.data || {
    ':type': 'sheet',
    columns: [],
    total: 0,
    data: [],
  };

  return {
    ':names': ['permissions', 'data', 'library'],
    ':type': 'multi-sheet',
    permissions,
    data,
    library: librarySheet,
  };
}

function normalizeLibrarySheets(root) {
  const templatesPath = join(root, 'library/templates.json');
  const blocksPath = join(root, 'library/blocks.json');

  const templates = JSON.parse(readFileSync(templatesPath, 'utf8'));
  templates.columns = ['key', 'value', 'path'];
  templates.data = templates.data.map(({ key, value, path }) => {
    const url = path || value;
    return { key, value: value || url, path: path || url };
  });
  writeFileSync(templatesPath, `${JSON.stringify(templates, null, 2)}\n`);

  const blocks = JSON.parse(readFileSync(blocksPath, 'utf8'));
  blocks.columns = ['name', 'path', 'value'];
  blocks.data = blocks.data.map(({ name, path, value }) => {
    const url = path || value;
    return { name, path: url, value: value || url };
  });
  writeFileSync(blocksPath, `${JSON.stringify(blocks, null, 2)}\n`);
}

const token = getToken();
if (!token) {
  console.error('No DA token. Run: aem content clone --path /');
  process.exit(1);
}

console.log('Setting up DA Library…\n');

normalizeLibrarySheets(ROOT);

// 1. Library index sheets (DA sheet format)
for (const file of ['library/blocks.json', 'library/templates.json']) {
  const body = readFileSync(join(ROOT, file), 'utf8');
  await putSource(token, file, body);
  console.log(`  ✓ ${file}`);
}

// 2. Sync block/template HTML from sidekick snippets → DA + git (for .html preview URLs)
const sidekickRoot = join(ROOT, 'tools/sidekick');
for (const abs of walkPlainHtml(sidekickRoot)) {
  const rel = relative(sidekickRoot, abs);
  if (!rel.startsWith('blocks/') && !rel.startsWith('templates/')) continue;
  const daPath = rel.replace(/\.plain\.html$/, '.html');
  const fragment = readFileSync(abs, 'utf8');
  const label = basename(daPath, '.html').replace(/-/g, ' ');
  const title = `${label.charAt(0).toUpperCase()}${label.slice(1)} — Library preview`;
  const previewOptions = daPath.includes('templates/blog-article/')
    ? { bodyClasses: ['blog-article'], stylesheets: ['/styles/blog.css'] }
    : {};

  const isTemplate = daPath.startsWith('templates/');
  const daBody = isTemplate ? wrapDaTemplate(fragment) : fragment;

  await putSource(token, daPath, daBody, 'text/html');
  await triggerPreview(token, daPath);

  const gitPath = join(ROOT, daPath);
  mkdirSync(dirname(gitPath), { recursive: true });
  writeFileSync(gitPath, wrapLibraryPreviewPage(title, fragment, previewOptions));
  console.log(`  ✓ ${daPath} (DA ${isTemplate ? 'document' : 'fragment'} + git preview page)`);
}

// 3. DA site config — library tab pointing at index sheets
const existing = await getConfig(token);
const config = buildDaConfig(existing);
await saveConfig(token, config, Boolean(existing));
console.log('  ✓ DA config (library tab → blocks.json + templates.json)');

console.log('\nDone. Hard-refresh Author: https://da.live/edit#/znikolovski/masterclass-demo/index');
