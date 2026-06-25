#!/usr/bin/env node
/**
 * Seed WKND Aero DA content paths (preview/publish via admin API when token available).
 * Usage: node tools/scripts/seed-aero-da.mjs [--preview] [--publish]
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getDaToken,
  putSource,
  triggerPreview,
  triggerPublish,
} from './lib/da-source.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ORG = 'znikolovski';
const SITE = 'wknd-aero';
const BRANCH = 'main';
const PREVIEW = process.argv.includes('--preview');
const PUBLISH = process.argv.includes('--publish');

/**
 * Wrap section-only draft markup in the DA body fragment format.
 * @param {string} sections
 * @returns {string}
 */
function toDaHtml(sections) {
  return `<body>
  <header></header>
  <main>
${sections.trim()}
  </main>
  <footer></footer>
</body>`;
}

const PAGES = [
  { path: '/', draft: 'drafts/wknd-aero/home.plain.html' },
  { path: '/destinations', draft: 'drafts/wknd-aero/destinations.plain.html' },
  { path: '/adventures', draft: 'drafts/wknd-aero/adventures.plain.html' },
  { path: '/travel-inspiration', draft: 'drafts/wknd-aero/travel-inspiration.plain.html' },
  { path: '/wknd-pass', draft: 'drafts/wknd-aero/wknd-pass.plain.html' },
  { path: '/book/flights', draft: 'drafts/wknd-aero/book-flights.plain.html' },
  { path: '/fragments/flight-search', draft: 'drafts/wknd-aero/flight-search.plain.html' },
  { path: '/nav', draft: 'drafts/wknd-aero/nav.plain.html' },
  { path: '/footer', draft: 'drafts/wknd-aero/footer.plain.html' },
];

const adventuresDir = join(ROOT, 'drafts/wknd-aero/adventures');
if (existsSync(adventuresDir)) {
  readdirSync(adventuresDir)
    .filter((name) => name.endsWith('.plain.html'))
    .forEach((name) => {
      const slug = name.replace(/\.plain\.html$/, '');
      PAGES.push({
        path: `/adventures/${slug}`,
        draft: `drafts/wknd-aero/adventures/${name}`,
      });
    });
}

const token = getDaToken(ROOT);
if (!token) {
  console.error('No valid DA token. Run: npx github:adobe-rnd/da-auth-helper token');
  console.error('(HLX_AUTH_TOKEN from admin.hlx.page does not work for DA content uploads.)');
  process.exit(1);
}

console.log(`Seeding ${PAGES.length} pages on ${SITE}…\n`);

for (const page of PAGES) {
  const abs = join(ROOT, page.draft);
  if (!existsSync(abs)) {
    console.warn(`  Skip missing ${page.draft}`);
    continue;
  }
  const body = toDaHtml(readFileSync(abs, 'utf8'));
  try {
    await putSource(token, ORG, SITE, page.path, body);
  } catch (err) {
    if (String(err.message).includes('401')) {
      console.error('\nDA token rejected (401). Refresh with:');
      console.error('  npx github:adobe-rnd/da-auth-helper token');
      console.error('Ensure you have write access to https://da.live/edit#/' + `${ORG}/${SITE}/`);
    }
    throw err;
  }
  if (PREVIEW) await triggerPreview(token, ORG, SITE, BRANCH, page.path);
  if (PUBLISH) await triggerPublish(token, ORG, SITE, BRANCH, page.path);
  console.log(`  ✓ ${page.path}`);
}

console.log(`\nDone. Open https://da.live/edit#/${ORG}/${SITE}/`);
