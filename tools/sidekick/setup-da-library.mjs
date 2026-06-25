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
  existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync,
} from 'node:fs';
import {
  basename, dirname, join, relative,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { wrapLibraryPreviewPage, getPreviewOptionsForDaPath } from './wrap-library-preview.mjs';

const ORG = process.env.DA_ORG || 'znikolovski';
const SITE = process.env.DA_SITE || process.argv.find((a) => a.startsWith('--site='))?.slice(7) || 'masterclass-demo';
const CONTENT_BASE = `https://content.da.live/${ORG}/${SITE}`;
const PREVIEW_BASE = `https://main--${SITE}--${ORG}.aem.page`;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Per-site block allowlist sheet path.
 * @param {string} site
 * @returns {string}
 */
function getLibraryBlocksPath(site) {
  const map = {
    'masterclass-demo': 'library/blocks-adventures.json',
    'wknd-business': 'library/blocks-business.json',
    'wknd-aero': 'library/blocks-aero.json',
  };
  return join(ROOT, map[site] || 'library/blocks.json');
}

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
  // Content-bus preview only applies to published HTML pages (not JSON index sheets or .plain.html sources).
  if (daPath.endsWith('.json') || daPath.endsWith('.plain.html')) return;
  const pagePath = daPath.replace(/\.html$/, '').replace(/^\//, '');
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
  // DA injects built-in "AEM Assets" when aem.repositoryId is in site config (data tab).
  // A custom library row with the same title breaks both classic DA and EW: da-library maps
  // name "aem-assets" to experience "assets" and iframes the row path (our .js URL) instead
  // of calling openAssets / renderAssets. See adobe/da-live ew-panel-extensions/aem-assets.js.
  byTitle.delete('AEM Assets');

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
      // Not "AEM Assets" — that name is reserved for DA built-in (aem-assets).
      title: 'Browse AEM Assets',
      path: `${PREVIEW_BASE}/tools/aem-assets/aem-assets.html`,
      experience: 'fullsize-dialog',
    },
    {
      title: 'Fragment Picker',
      path: `${PREVIEW_BASE}/tools/fragment-picker/fragment-picker.html`,
      experience: 'dialog',
    },
    {
      // EW Extensions panel (classic DA uses Prepare → Send to Adobe Target OOTB).
      title: 'Send to Adobe Target',
      path: `${PREVIEW_BASE}/tools/adobe-target/adobe-target.html`,
      experience: 'fullsize-dialog',
      icon: 'https://da.live/blocks/edit/img/S2_Icon_Target_20_N.svg#S2_Icon_Target',
    },
  ];
  required.forEach((row) => byTitle.set(row.title, { ...byTitle.get(row.title), ...row }));
  return [...byTitle.values()];
}

function orderMultiSheetConfig(sheets, names) {
  // da-live getFirstSheet() uses Object.keys(config)[0], NOT :names[0].
  // Sheet keys must come first with "data" first so aem.repositoryId is found.
  const out = {};
  names.forEach((name) => {
    if (sheets[name]) out[name] = sheets[name];
  });
  Object.keys(sheets).forEach((name) => {
    if (!names.includes(name) && !name.startsWith(':')) out[name] = sheets[name];
  });
  out[':names'] = names;
  out[':type'] = 'multi-sheet';
  if (sheets[':version'] != null) out[':version'] = sheets[':version'];
  return out;
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

  const sheetOrder = ['data', 'permissions', 'library', 'prepare'];
  const present = new Set(existing?.[':names'] || Object.keys(existing || {}).filter((k) => !k.startsWith(':')));
  const names = sheetOrder.filter((n) => present.has(n) || n === 'library' || n === 'data' || n === 'permissions');
  if (!names.includes('data')) names.unshift('data');
  if (!names.includes('permissions')) names.push('permissions');
  if (!names.includes('library')) names.push('library');
  [...present].forEach((n) => {
    if (!names.includes(n)) names.push(n);
  });

  if (existing?.[':type'] === 'multi-sheet') {
    return orderMultiSheetConfig(
      { ...existing, library: librarySheet },
      names,
    );
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
    columns: ['key', 'value'],
    total: 0,
    data: [],
  };

  return orderMultiSheetConfig(
    {
      data,
      permissions,
      library: librarySheet,
    },
    ['data', 'permissions', 'library'],
  );
}

/**
 * Sidekick fetches `{origin}{path}.plain.html` for markup and `{origin}{path}` as the
 * styled shell. Paths must be site-relative preview URLs like `/blocks/cards/cards.html`,
 * not content.da.live URLs (those resolve to `/org/site/blocks/...` and break previews).
 * @param {string} daPath
 * @returns {string}
 */
function toSidekickPreviewPath(daPath) {
  if (!daPath) return daPath;
  const pathname = daPath.includes('://') ? new URL(daPath).pathname : daPath;
  const match = pathname.match(/\/((?:blocks\/aero\/[^/]+|(?:blocks|templates)\/[^/]+)\/[^/.]+)\.html$/);
  if (match) return `/${match[1]}.html`;
  if (pathname.match(/\/(blocks|templates)\//)) {
    return pathname.endsWith('.html') ? pathname : `${pathname}.html`;
  }
  return pathname;
}

/** EW Sidekick library panel reads /tools/sidekick/library.json (not library/blocks.json). */
function syncSidekickLibrary(root, site = SITE) {
  const blocks = JSON.parse(readFileSync(getLibraryBlocksPath(site), 'utf8'));
  const templates = JSON.parse(readFileSync(join(root, 'library/templates.json'), 'utf8'));
  let blocksData = blocks.data.map(({ name, path, value }) => ({
    name,
    path: toSidekickPreviewPath(path || value),
    value: value || path,
  }));
  let templatesData = templates.data.map(({ key, path, value }) => ({
    name: key,
    key,
    path: toSidekickPreviewPath(path || value),
    value: value || path,
  }));
  if (site !== 'masterclass-demo') {
    const rewrite = (url) => url?.replaceAll('znikolovski/masterclass-demo', `znikolovski/${site}`) || url;
    blocksData = blocksData.map((row) => ({
      ...row,
      path: rewrite(row.path),
      value: rewrite(row.value),
    }));
    templatesData = templatesData.map((row) => ({
      ...row,
      path: rewrite(row.path),
      value: rewrite(row.value),
    }));
  }
  // Sidekick loader (Gc in index.js) expects either top-level `data` (sheet) or
  // `:type: multi-sheet` with `:names` — not `{ blocks: { data } }` alone.
  const allEntries = [
    ...blocksData,
    ...templatesData.map(({ name, path, value }) => ({ name, path, value })),
  ];
  const payload = {
    ':type': 'multi-sheet',
    ':names': ['blocks'],
    blocks: {
      ':type': 'sheet',
      columns: ['name', 'path', 'value'],
      total: allEntries.length,
      data: allEntries,
    },
  };
  writeFileSync(
    join(root, 'tools/sidekick/library.json'),
    `${JSON.stringify(payload, null, 2)}\n`,
  );
}

function toContentDaUrl(anyUrl) {
  const rel = toSidekickPreviewPath(anyUrl);
  return `${CONTENT_BASE}${rel}`;
}

function normalizeLibrarySheets(root) {
  const templatesPath = join(root, 'library/templates.json');
  const blocksPath = getLibraryBlocksPath(SITE);
  if (!existsSync(blocksPath)) {
    throw new Error(`Missing library blocks file for ${SITE}: ${blocksPath}`);
  }

  const templates = JSON.parse(readFileSync(templatesPath, 'utf8'));
  templates.columns = ['key', 'value', 'path'];
  templates.data = templates.data.map(({ key, value, path }) => {
    const contentUrl = toContentDaUrl(path || value);
    const previewUrl = `${PREVIEW_BASE}${toSidekickPreviewPath(path || value)}`;
    return { key, value: contentUrl, path: previewUrl };
  });
  writeFileSync(templatesPath, `${JSON.stringify(templates, null, 2)}\n`);

  const blocks = JSON.parse(readFileSync(blocksPath, 'utf8'));
  blocks.columns = ['name', 'path', 'value'];
  blocks.data = blocks.data.map(({ name, path, value }) => {
    const previewUrl = `${PREVIEW_BASE}${toSidekickPreviewPath(path || value)}`;
    return { name, path: previewUrl, value: toContentDaUrl(path || value) };
  });
  writeFileSync(blocksPath, `${JSON.stringify(blocks, null, 2)}\n`);
}

const token = getToken();
if (!token) {
  console.error('No DA token. Run: npx github:adobe-rnd/da-auth-helper token');
  process.exit(1);
}

console.log('Setting up DA Library…\n');

normalizeLibrarySheets(ROOT);
syncSidekickLibrary(ROOT, SITE);
console.log(`  ✓ tools/sidekick/library.json (EW Sidekick library, ${SITE})`);

// 1. Library index sheets (DA sheet format)
{
  let blocksBody = readFileSync(getLibraryBlocksPath(SITE), 'utf8');
  if (SITE !== 'masterclass-demo') {
    blocksBody = blocksBody.replaceAll('znikolovski/masterclass-demo', `znikolovski/${SITE}`);
  }
  await putSource(token, 'library/blocks.json', blocksBody);
  await triggerPreview(token, 'library/blocks.json');
  console.log(`  ✓ library/blocks.json (from ${relative(ROOT, getLibraryBlocksPath(SITE))})`);
}
for (const file of ['library/templates.json']) {
  let body = readFileSync(join(ROOT, file), 'utf8');
  if (SITE !== 'masterclass-demo') {
    body = body.replaceAll(`znikolovski/masterclass-demo`, `znikolovski/${SITE}`);
  }
  await putSource(token, file, body);
  // EW block library reads this sheet from the preview host; PUT alone does not refresh it.
  await triggerPreview(token, file);
  console.log(`  ✓ ${file} (DA source + preview publish)`);
}

// 2a. Sync repo block previews referenced by library (form, B2B blocks, etc.)
const repoBlockPreviews = [
  'blocks/adventure-quiz/adventure-quiz.html',
  'blocks/quiz-results/quiz-results.html',
  'blocks/form/form.html',
  'blocks/embed-adaptive-form/embed-adaptive-form.html',
  'blocks/business-register/business-register.html',
  'blocks/business-login/business-login.html',
  'blocks/business-dashboard/business-dashboard.html',
  'blocks/aem-embed/aem-embed.html',
  'blocks/aero/aero-header/aero-header.html',
  'blocks/aero/aero-footer/aero-footer.html',
  'blocks/aero/aero-hero/aero-hero.html',
  'blocks/aero/flight-search/flight-search.html',
  'blocks/aero/adventures-bento/adventures-bento.html',
  'blocks/aero/aero-pass/aero-pass.html',
  'blocks/aero/aero-newsletter/aero-newsletter.html',
  'blocks/aero/destinations-grid/destinations-grid.html',
  'blocks/aero/travel-inspiration/travel-inspiration.html',
  'blocks/aero/booking-journey/booking-journey.html',
];
for (const rel of repoBlockPreviews) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) continue;
  const daPath = rel;
  const fragment = readFileSync(abs, 'utf8');
  const inner = fragment.match(/<main>[\s\S]*<\/main>/i)?.[0]
    || fragment.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1]
    || fragment;
  await putSource(token, daPath, inner.includes('<main>') ? `<!DOCTYPE html><html><body>${inner}</body></html>` : fragment, 'text/html');
  await triggerPreview(token, daPath);
  if (SITE === 'masterclass-demo') {
    console.log(`  ✓ ${daPath} (repo block → DA)`);
  } else {
    console.log(`  ✓ ${daPath} (repo block → DA ${SITE})`);
  }
}

// 2b. Sync block/template HTML from sidekick snippets → DA + git (for .html preview URLs)
const sidekickRoot = join(ROOT, 'tools/sidekick');
for (const abs of walkPlainHtml(sidekickRoot)) {
  const rel = relative(sidekickRoot, abs);
  if (!rel.startsWith('blocks/') && !rel.startsWith('templates/')) continue;
  const daPath = rel.replace(/\.plain\.html$/, '.html');
  const fragment = readFileSync(abs, 'utf8');
  const label = basename(daPath, '.html').replace(/-/g, ' ');
  const title = `${label.charAt(0).toUpperCase()}${label.slice(1)} — Library preview`;
  const previewOptions = daPath.includes('templates/blog-article/')
    ? { bodyClasses: ['blog-article'], stylesheets: ['/styles/blog.css'], ...getPreviewOptionsForDaPath(daPath) }
    : getPreviewOptionsForDaPath(daPath);

  const isTemplate = daPath.startsWith('templates/');
  const previewOptionsWithBlock = isTemplate ? previewOptions : previewOptions;
  const daBody = isTemplate ? wrapDaTemplate(fragment) : fragment;

  await putSource(token, daPath, daBody, 'text/html');
  await triggerPreview(token, daPath);

  const plainDaPath = `${daPath}.plain.html`;
  await putSource(token, plainDaPath, fragment, 'text/html');
  await triggerPreview(token, plainDaPath);

  if (SITE === 'masterclass-demo') {
    const gitPath = join(ROOT, daPath);
    mkdirSync(dirname(gitPath), { recursive: true });
    writeFileSync(
      gitPath,
      wrapLibraryPreviewPage(title, fragment, previewOptionsWithBlock),
    );
    writeFileSync(`${gitPath}.plain.html`, `${fragment.trim()}\n`);
    console.log(`  ✓ ${daPath} (DA ${isTemplate ? 'document' : 'fragment'} + git preview shell + .plain.html)`);
  } else {
    const gitPath = join(ROOT, daPath);
    if (daPath.startsWith('blocks/aero/')) {
      mkdirSync(dirname(gitPath), { recursive: true });
      writeFileSync(
        gitPath,
        wrapLibraryPreviewPage(title, fragment, previewOptionsWithBlock),
      );
      writeFileSync(`${gitPath}.plain.html`, `${fragment.trim()}\n`);
    }
    console.log(`  ✓ ${daPath} (DA ${isTemplate ? 'document' : 'fragment'} + .plain.html)`);
  }
}

// 3. DA site config — library tab pointing at index sheets
const existing = await getConfig(token);
const config = buildDaConfig(existing);
await saveConfig(token, config, Boolean(existing));
console.log('  ✓ DA config (library tab → blocks.json + templates.json)');

console.log(`\nDone. Hard-refresh Author: https://da.live/edit#/${ORG}/${SITE}/index`);
