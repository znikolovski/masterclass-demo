#!/usr/bin/env node
/**
 * Add adventure interest form block to masterclass-demo /adventures page.
 * Usage: node tools/scripts/seed-b2c-adventure-form.mjs [--dry-run] [--preview]
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formBlockSection, WKND_FORMS } from './lib/form-sheet.mjs';
import {
  appendInsideMain,
  getDaToken, getSource, putSource, triggerPreview, triggerPublish, trimDaHtml,
} from './lib/da-source.mjs';

const ORG = 'znikolovski';
const SITE = 'masterclass-demo';
const BRANCH = 'main';
const DRY_RUN = process.argv.includes('--dry-run');
const PREVIEW = process.argv.includes('--preview');
const PUBLISH = process.argv.includes('--publish');

const FORM_SECTION = `<div>
${formBlockSection(WKND_FORMS['wknd-adventure-interest'], {
  title: 'Register your interest',
  description: 'Tell us which adventure you have in mind and we will be in touch.',
})}
</div>`;

/** Remove duplicate / malformed adventure-interest form markup from prior seed runs. */
function stripAdventureFormSections(html) {
  let out = trimDaHtml(html);
  // Orphan content saved after </body> or </html>
  out = out.replace(/<\/body>[\s\S]*$/i, '</body>');
  // Section div: heading + intro + form block OR flattened <p>Form</p> + pre/code
  out = out.replace(
    /<div>\s*<h2[^>]*>Register your interest<\/h2>[\s\S]*?<\/div>/gi,
    '',
  );
  // Legacy: heading through end of main without wrapping div
  out = out.replace(
    /<h2[^>]*>Register your interest<\/h2>[\s\S]*?(?=<\/main>)/i,
    '',
  );
  // Empty trailing section left after strip
  out = out.replace(/<div>\s*<\/div>\s*(?=<\/main>)/i, '');
  return out;
}

const token = getDaToken();
if (!token) {
  console.error('No valid DA token. Run: npx github:adobe-rnd/da-auth-helper token');
  process.exit(1);
}

const path = '/adventures';
let html = await getSource(token, ORG, SITE, path);
if (!html) {
  console.error(`Page ${path} not found in DA.`);
  process.exit(1);
}

html = stripAdventureFormSections(html);
html = appendInsideMain(html, `\n${FORM_SECTION}\n`);

if (DRY_RUN) {
  console.log('Would append form section to /adventures');
  process.exit(0);
}

await putSource(token, ORG, SITE, path, html);
if (PREVIEW) await triggerPreview(token, ORG, SITE, BRANCH, path);
if (PUBLISH) await triggerPublish(token, ORG, SITE, BRANCH, path);
console.log('✓ Added adventure interest form to /adventures');
