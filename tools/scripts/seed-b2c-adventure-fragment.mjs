#!/usr/bin/env node
/**
 * Sync /fragments/wknd-adventure-interest with current WKND_FORMS sheet JSON
 * (formSlug + query-index adventure select). Required for fragment autopopulate.
 *
 * Usage: node tools/scripts/seed-b2c-adventure-fragment.mjs [--dry-run] [--preview] [--publish]
 */

import {
  formPageHtml, WKND_FORMS,
} from './lib/form-sheet.mjs';
import {
  getDaToken, putSource, triggerPreview, triggerPublish,
} from './lib/da-source.mjs';

const ORG = 'znikolovski';
const SITE = 'masterclass-demo';
const BRANCH = 'main';
const PATH = '/fragments/wknd-adventure-interest';
const DRY_RUN = process.argv.includes('--dry-run');
const PREVIEW = process.argv.includes('--preview');
const PUBLISH = process.argv.includes('--publish');

const html = formPageHtml(
  'Adventure interest',
  WKND_FORMS['wknd-adventure-interest'],
  'Tell us about your trip and we will be in touch.',
);

const token = getDaToken();
if (!token) {
  console.error('No valid DA token. Run: npx github:adobe-rnd/da-auth-helper token');
  process.exit(1);
}

if (DRY_RUN) {
  console.log(`Would update ${PATH} (${html.length} bytes)`);
  process.exit(0);
}

await putSource(token, ORG, SITE, PATH, html);
if (PREVIEW) await triggerPreview(token, ORG, SITE, BRANCH, PATH);
if (PUBLISH) await triggerPublish(token, ORG, SITE, BRANCH, PATH);
console.log(`✓ Updated ${PATH}`);
