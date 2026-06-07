#!/usr/bin/env node
/**
 * Generate WKND form JSON files and publish to DA (document-based adaptive forms).
 * AEM author adaptive forms API is not exposed via MCP on this program; these
 * sheet JSON files render through the EDS form block until AEM Forms are authored
 * in the Forms console and URLs are swapped.
 *
 * Usage:
 *   node tools/scripts/create-wknd-forms.mjs [--dry-run]
 *   node tools/scripts/create-wknd-forms.mjs --push-da [--preview] [--publish]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formPageHtml, WKND_FORMS } from './lib/form-sheet.mjs';
import { getDaToken, putSource, triggerPreview, triggerPublish } from './lib/da-source.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FORMS_DIR = join(ROOT, 'forms');
const ORG = 'znikolovski';
const SITES = ['masterclass-demo', 'wknd-business'];
const BRANCH = 'main';
const DRY_RUN = process.argv.includes('--dry-run');
const PUSH_DA = process.argv.includes('--push-da');
const PREVIEW = process.argv.includes('--preview');
const PUBLISH = process.argv.includes('--publish');

mkdirSync(FORMS_DIR, { recursive: true });

for (const [slug, json] of Object.entries(WKND_FORMS)) {
  const path = join(FORMS_DIR, `${slug}.json`);
  const body = `${JSON.stringify(json, null, 2)}\n`;
  if (!DRY_RUN) writeFileSync(path, body);
  console.log(`${DRY_RUN ? '~' : '✓'} forms/${slug}.json`);
}

if (!PUSH_DA) {
  console.log('\nForm JSON written. Push to DA with --push-da or commit to Git for code-bus delivery.');
  process.exit(0);
}

const token = getDaToken();
if (!token) {
  console.error('No valid DA token (cached token expired). Refresh with one of:');
  console.error('  npx github:adobe-rnd/da-auth-helper token');
  console.error('  aem content status   # may prompt browser login if token missing');
  console.error('Or paste a Bearer token from da.live DevTools:');
  console.error('  export DA_TOKEN="<token>" && npm run b2b:forms');
  process.exit(1);
}

const formHtml = (slug, json) => {
  const jsonStr = JSON.stringify(json);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${slug}</title></head><body><pre><code>${jsonStr.replace(/</g, '\\u003c')}</code></pre></body></html>`;
};

for (const site of SITES) {
  console.log(`\nPushing forms to ${site}…`);
  for (const [slug, json] of Object.entries(WKND_FORMS)) {
    const needsB2c = slug === 'wknd-adventure-interest';
    const needsB2b = slug !== 'wknd-adventure-interest';
    if (site === 'masterclass-demo' && !needsB2c && slug !== 'wknd-contact-b2b') continue;
    if (site === 'wknd-business' && needsB2c && slug === 'wknd-adventure-interest') continue;

    const jsonPath = `/forms/${slug}.json`;
    const pagePath = `/forms/${slug}`;
    if (DRY_RUN) {
      console.log(`  ~ ${jsonPath}`);
      console.log(`  ~ ${pagePath}`);
      continue;
    }
    await putSource(token, ORG, site, jsonPath, formHtml(slug, json));
    if (PREVIEW) await triggerPreview(token, ORG, site, BRANCH, jsonPath);
    console.log(`  ✓ ${jsonPath}`);

    const pageTitle = slug === 'wknd-adventure-interest'
      ? 'Adventure interest'
      : slug === 'wknd-adventure-interest-b2b'
        ? 'Request a B2B adventure'
        : 'Contact us';
    const pageDescription = slug.includes('adventure')
      ? 'Tell us about your trip and we will be in touch.'
      : 'Send us a message and our team will respond shortly.';
    await putSource(token, ORG, site, pagePath, formPageHtml(pageTitle, json, pageDescription));
    if (PREVIEW) await triggerPreview(token, ORG, site, BRANCH, pagePath);
    if (PUBLISH) await triggerPublish(token, ORG, site, BRANCH, pagePath);
    console.log(`  ✓ ${pagePath}`);
  }
}

console.log('\nDone. Rendered forms: /forms/{slug} — JSON data: /forms/{slug}.json');
