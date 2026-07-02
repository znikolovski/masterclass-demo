#!/usr/bin/env node
/**
 * Re-preview/publish blog adventure pages so page metadata → <head> meta tags → map index.
 *
 * metadata:patch writes latitude/longitude/placeName into the .metadata block in DA.
 * Helix query reads head > meta[name="latitude"] etc. — that only appears after preview/publish.
 *
 * Usage:
 *   node tools/scripts/republish-map-adventures.mjs [--dry-run] [--preview] [--publish]
 */
/* eslint-disable no-await-in-loop, no-restricted-syntax */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLOG_GEO } from './lib/adventure-page-metadata.mjs';
import {
  getDaToken, triggerPreview, triggerPublish,
} from './lib/da-source.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ORG = process.env.DA_ORG || 'znikolovski';
const SITE = process.env.DA_SITE || 'masterclass-demo';
const BRANCH = process.env.DA_BRANCH || 'main';
const DRY_RUN = process.argv.includes('--dry-run');
const DO_PREVIEW = process.argv.includes('--preview') || !process.argv.includes('--publish');
const DO_PUBLISH = process.argv.includes('--publish') || !process.argv.includes('--preview');
const DELAY_MS = Number(process.env.DA_DELAY_MS || 400);

const PATHS = [
  ...Object.keys(BLOG_GEO).map((slug) => `/blog/${slug}`),
  '/destinations',
];

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

const token = getDaToken(ROOT);
if (!token && !DRY_RUN) {
  console.error('No valid DA token. Run: npx github:adobe-rnd/da-auth-helper token');
  process.exit(1);
}

console.log(`${DRY_RUN ? 'Dry run' : 'Republishing'} ${PATHS.length} map-related page(s)…\n`);

let ok = 0;
let fail = 0;

for (const path of PATHS) {
  if (DRY_RUN) {
    console.log(`  ${path}`);
    continue;
  }

  let pathOk = true;
  if (DO_PREVIEW) {
    const previewed = await triggerPreview(token, ORG, SITE, BRANCH, path);
    if (!previewed) pathOk = false;
    await sleep(DELAY_MS);
  }
  if (DO_PUBLISH) {
    const published = await triggerPublish(token, ORG, SITE, BRANCH, path);
    if (!published) pathOk = false;
    await sleep(DELAY_MS);
  }

  if (pathOk) {
    console.log(`  ✓ ${path}`);
    ok += 1;
  } else {
    console.log(`  ✗ ${path}`);
    fail += 1;
  }
}

if (!DRY_RUN) {
  console.log(`\nDone. ${ok} ok, ${fail} failed.`);
  console.log('Wait ~2–5 min, then check:');
  console.log(`  curl -s ${process.env.PREVIEW_BASE || `https://${BRANCH}--${SITE}--${ORG}.aem.page`}/adventures-map-index.json | jq '.total,.data[].path'`);
}
