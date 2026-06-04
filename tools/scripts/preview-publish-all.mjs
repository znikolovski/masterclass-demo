#!/usr/bin/env node
/**
 * Preview and/or publish all site pages via admin.hlx.page.
 *
 * Prerequisites: valid IMS token in .hlx/.da-token.json (run `aem login`).
 *
 * Usage:
 *   node tools/scripts/preview-publish-all.mjs              # preview + publish all pages
 *   node tools/scripts/preview-publish-all.mjs --preview    # preview only
 *   node tools/scripts/preview-publish-all.mjs --publish    # publish (live) only
 *   node tools/scripts/preview-publish-all.mjs --dry-run    # list paths, no API calls
 *   node tools/scripts/preview-publish-all.mjs --from-index   # merge paths from query-index.json
 *
 * Environment overrides: DA_ORG, DA_SITE, DA_BRANCH, PREVIEW_BASE
 */

import { readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

const ORG = process.env.DA_ORG || 'znikolovski';
const SITE = process.env.DA_SITE || 'masterclass-demo';
const BRANCH = process.env.DA_BRANCH || 'main';
const PREVIEW_BASE = process.env.PREVIEW_BASE
  || `https://${BRANCH}--${SITE}--${ORG}.aem.page`;

const ARGS = new Set(process.argv.slice(2));
const DRY_RUN = ARGS.has('--dry-run');
const PREVIEW_ONLY = ARGS.has('--preview');
const PUBLISH_ONLY = ARGS.has('--publish');
const FROM_INDEX = ARGS.has('--from-index');
const DO_PREVIEW = PREVIEW_ONLY || (!PREVIEW_ONLY && !PUBLISH_ONLY);
const DO_PUBLISH = PUBLISH_ONLY || (!PREVIEW_ONLY && !PUBLISH_ONLY);

const DELAY_MS = Number(process.env.DA_DELAY_MS || 300);
const MAX_ATTEMPTS = 3;

/** Paths that are not standalone pages (fragments, tooling, etc.). */
const PATH_DENYLIST = [
  /^\/fragments\//,
  /^\/blocks\//,
  /^\/tools\//,
  /^\/library/,
  /^\/drafts\//,
  /^\/icons\//,
  /^\/fonts\//,
  /^\/nav$/,
  /^\/footer$/,
  /^\/templates\//,
  /^\/metadata/,
  /^\/index$/,
];

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
 * @param {string} path
 */
function normalizePath(path) {
  if (!path || path === '/' || path === 'index' || path === '/index') return '/';
  const withSlash = path.startsWith('/') ? path : `/${path}`;
  const trimmed = withSlash.replace(/\/+$/, '') || '/';
  return trimmed === '/index' ? '/' : trimmed;
}

/**
 * @param {string} path
 */
function apiPath(path) {
  return path === '/' ? '' : path;
}

/**
 * @param {string} path
 */
function isPublishablePage(path) {
  const normalized = normalizePath(path);
  if (PATH_DENYLIST.some((re) => re.test(normalized))) return false;
  if (normalized.includes('.')) return false;
  return true;
}

function listPathsFromReports() {
  const paths = new Set(['/']);
  const reportsDir = join(ROOT, 'tools/importer/reports');

  const addReport = (file) => {
    try {
      const report = JSON.parse(readFileSync(join(reportsDir, file), 'utf8'));
      if (report.path) paths.add(normalizePath(`/${report.path}`));
    } catch {
      /* skip */
    }
  };

  readdirSync(reportsDir).forEach((file) => {
    if (file.endsWith('.report.json')) addReport(file);
  });

  const blogDir = join(reportsDir, 'blog');
  try {
    readdirSync(blogDir)
      .filter((f) => f.endsWith('.report.json'))
      .forEach((file) => paths.add(normalizePath(`/blog/${basename(file, '.report.json')}`)));
  } catch {
    /* no blog dir */
  }

  return [...paths];
}

async function listPathsFromQueryIndex() {
  try {
    const res = await fetch(`${PREVIEW_BASE}/query-index.json`);
    if (!res.ok) {
      console.warn(`query-index fetch failed: ${res.status}`);
      return [];
    }
    const json = await res.json();
    const rows = Array.isArray(json?.data) ? json.data : [];
    return rows
      .map((row) => normalizePath(row.path || ''))
      .filter((path) => path && isPublishablePage(path));
  } catch (err) {
    console.warn(`query-index fetch error: ${err.message}`);
    return [];
  }
}

function buildPageList() {
  const paths = new Set();
  listPathsFromReports().forEach((path) => {
    if (isPublishablePage(path)) paths.add(normalizePath(path));
  });
  return [...paths].sort((a, b) => a.localeCompare(b));
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * @param {string} token
 * @param {'preview'|'live'} action
 * @param {string} path
 */
async function triggerLifecycle(token, action, path) {
  const segment = apiPath(path);
  const url = `https://admin.hlx.page/${action}/${ORG}/${SITE}/${BRANCH}${segment}`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      let body = '';
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }
      return { ok: true, status: res.status, body: body.slice(0, 120) };
    }

    const retryable = [429, 500, 502, 503, 504].includes(res.status);
    if (!retryable || attempt === MAX_ATTEMPTS) {
      const text = await res.text().catch(() => '');
      return { ok: false, status: res.status, body: text.slice(0, 200) };
    }

    const retryAfter = Number(res.headers.get('retry-after') || 0) * 1000;
    await sleep(retryAfter || 2 ** attempt * 1000);
  }

  return { ok: false, status: 0, body: 'unknown' };
}

async function main() {
  let paths = buildPageList();

  if (FROM_INDEX) {
    const indexPaths = await listPathsFromQueryIndex();
    const merged = new Set(paths);
    indexPaths.forEach((path) => {
      if (isPublishablePage(path)) merged.add(normalizePath(path));
    });
    paths = [...merged].sort((a, b) => a.localeCompare(b));
  }

  const actions = [
    DO_PREVIEW && 'preview',
    DO_PUBLISH && 'publish',
  ].filter(Boolean).join(' + ');

  console.log(`${DRY_RUN ? 'Dry run' : actions} for ${paths.length} page(s)`);
  console.log(`  org=${ORG} site=${SITE} branch=${BRANCH}`);
  console.log(`  preview base: ${PREVIEW_BASE}\n`);

  if (DRY_RUN) {
    paths.forEach((path) => console.log(`  ${path}`));
    return;
  }

  const token = getToken();
  if (!token) {
    console.error('No valid DA/IMS token. Run: aem login');
    process.exit(1);
  }

  const results = { preview: { ok: 0, fail: 0 }, live: { ok: 0, fail: 0 } };
  const failures = [];

  for (const path of paths) {
    const label = path === '/' ? '/' : path;

    if (DO_PREVIEW) {
      const preview = await triggerLifecycle(token, 'preview', path);
      if (preview.ok) {
        results.preview.ok += 1;
        console.log(`  ✓ preview ${label}`);
      } else {
        results.preview.fail += 1;
        failures.push({ path, action: 'preview', ...preview });
        console.log(`  ✗ preview ${label} → ${preview.status}`);
      }
      await sleep(DELAY_MS);
    }

    if (DO_PUBLISH) {
      const live = await triggerLifecycle(token, 'live', path);
      if (live.ok) {
        results.live.ok += 1;
        console.log(`  ✓ publish ${label}`);
      } else {
        results.live.fail += 1;
        failures.push({ path, action: 'publish', ...live });
        console.log(`  ✗ publish ${label} → ${live.status}`);
      }
      await sleep(DELAY_MS);
    }
  }

  console.log('\nSummary:');
  if (DO_PREVIEW) {
    console.log(`  preview: ${results.preview.ok} ok, ${results.preview.fail} failed`);
  }
  if (DO_PUBLISH) {
    console.log(`  publish: ${results.live.ok} ok, ${results.live.fail} failed`);
  }

  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f) => {
      console.log(`  ${f.action} ${f.path} → ${f.status} ${f.body || ''}`);
    });
    process.exit(1);
  }

  console.log(`\nLive site: https://${BRANCH}--${SITE}--${ORG}.aem.live/`);
}

main();
