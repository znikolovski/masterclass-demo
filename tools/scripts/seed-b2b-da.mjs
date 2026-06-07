#!/usr/bin/env node
/**
 * Seed wknd-business DA content: nav, footer, and core B2B pages.
 * Usage: node tools/scripts/seed-b2b-da.mjs [--dry-run] [--preview] [--publish]
 */

import { formBlockSection, WKND_FORMS } from './lib/form-sheet.mjs';
import {
  getDaToken, putSource, triggerPreview, triggerPublish,
} from './lib/da-source.mjs';

const ORG = 'znikolovski';
const SITE = 'wknd-business';
const BRANCH = 'main';
const B2B_API = 'https://wknd-b2b-api.wknd-adventures.workers.dev';
const DRY_RUN = process.argv.includes('--dry-run');
const PREVIEW = process.argv.includes('--preview');
const PUBLISH = process.argv.includes('--publish');

/** Images from masterclass-demo DA (wknd-adventures.com URLs 404). */
const IMG = {
  hero: 'https://content.da.live/znikolovski/masterclass-demo/.index/hero-mountain-83c7a2a5.jpeg',
  patagonia: 'https://content.da.live/znikolovski/masterclass-demo/.index/adobestock-231698835-e7751006.jpg',
  community: 'https://content.da.live/znikolovski/masterclass-demo/.index/gallery-lake-06996a30.jpg',
  fieldNotes: 'https://content.da.live/znikolovski/masterclass-demo/.index/gallery-skier-b56caf67.jpg',
};

function daPage(body) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
  <header></header>
  <main>
${body}
  </main>
  <footer></footer>
</body>
</html>`;
}

function metadataBlock(fields) {
  const rows = Object.entries(fields)
    .map(([k, v]) => `      <div><div><p>${k}</p></div><div><p>${v}</p></div></div>`)
    .join('\n');
  return `<div>
  <div class="metadata">
${rows}
  </div>
</div>`;
}

const NAV = daPage(`<div>
  <p><a href="/" title="WKND Business">WKND Business</a></p>
</div>
<div>
  <ul>
    <li><a href="/field-notes">Field Notes</a></li>
    <li><a href="/request-adventure">Request Adventure</a></li>
    <li><a href="/contact">Contact</a></li>
    <li><a href="/register">Register</a></li>
    <li><a href="/login">Sign In</a></li>
    <li><a href="/dashboard">Dashboard</a></li>
  </ul>
</div>`);

const FOOTER = daPage(`<div>
  <p>WKND Business</p>
  <p>Corporate adventure experiences for teams — offsites, rewards, and leadership retreats.</p>
</div>
<div>
  <h4 id="explore">Explore</h4>
  <ul>
    <li><a href="/field-notes">Field Notes</a></li>
    <li><a href="/request-adventure">Request Adventure</a></li>
    <li><a href="/contact">Contact</a></li>
  </ul>
</div>
<div>
  <h4 id="account">Account</h4>
  <ul>
    <li><a href="/register">Register</a></li>
    <li><a href="/login">Sign In</a></li>
    <li><a href="/dashboard">Dashboard</a></li>
  </ul>
</div>
<div>
  <h4 id="wknd">WKND</h4>
  <ul>
    <li><a href="https://main--masterclass-demo--znikolovski.aem.live/">WKND Adventures (B2C)</a></li>
    <li><a href="/about">About</a></li>
  </ul>
</div>
<div>
  <p>© 2026 WKND Business. All rights reserved.</p>
  <p>Built for teams who go further together.</p>
</div>`);

function block(name, rows) {
  const body = rows.map((cells) => {
    const cols = cells.map((c) => `<div><div>${c}</div></div>`).join('\n      ');
    return `    <div>\n      ${cols}\n    </div>`;
  }).join('\n');
  return `<div>
  <div class="${name}">
${body}
  </div>
</div>`;
}

const PAGES = {
  '/content/nav': NAV,
  '/content/footer': FOOTER,
  '/': daPage(`
<div>
  <div class="hero-adventure">
    <div>
      <div>
        <picture><img src="${IMG.hero}" alt="Team on a mountain ridge"></picture>
      </div>
    </div>
    <div>
      <div><p>WKND Business</p></div>
      <div><h1>Adventures built for teams</h1></div>
      <div><p>Book curated outdoor experiences for offsites, rewards, and leadership retreats.</p></div>
      <div><p><a href="/register">Register your business</a></p></div>
      <div><p><a href="/request-adventure">Request an adventure</a></p></div>
    </div>
  </div>
</div>
<div>
  <div class="columns-featured">
    <div>
      <div>
        <picture><img src="${IMG.patagonia}" alt="Patagonia trek"></picture>
      </div>
      <div>
        <p>Corporate retreats</p>
        <h2>From basecamp to boardroom</h2>
        <p>Structured itineraries with safety, logistics, and storytelling built in.</p>
        <p><a href="/about">Learn more</a></p>
      </div>
    </div>
  </div>
</div>
<div>
  <div class="carousel-blog">
    <div>
      <div><div>Latest from Field Notes</div></div>
      <div><div>6</div></div>
      <div><div>/field-notes</div></div>
    </div>
  </div>
</div>
${metadataBlock({
  Title: 'WKND Business — Team Adventures',
  Description: 'Book curated outdoor experiences for your business with WKND Business.',
  template: 'landing-page',
  'b2b-api': B2B_API,
})}`),
  '/register': daPage(`
${block('business-register', [
  ['Title', 'Register Your Business'],
  ['Subtitle', 'Create an account to request and manage team adventures.'],
  ['API endpoint', ''],
  ['Redirect URL', '/dashboard'],
])}
${metadataBlock({
  Title: 'Register — WKND Business',
  Description: 'Register your business for WKND corporate adventures.',
  template: 'landing-page',
  'b2b-api': B2B_API,
})}`),
  '/login': daPage(`
${block('business-login', [
  ['Title', 'Business Sign In'],
  ['Subtitle', 'Access your adventure dashboard.'],
  ['API endpoint', ''],
  ['Redirect URL', '/dashboard'],
])}
${metadataBlock({
  Title: 'Sign In — WKND Business',
  template: 'landing-page',
  'b2b-api': B2B_API,
})}`),
  '/dashboard': daPage(`
${block('business-dashboard', [
  ['Title', 'Adventure Dashboard'],
  ['API endpoint', ''],
  ['Request URL', '/request-adventure'],
])}
${metadataBlock({
  Title: 'Dashboard — WKND Business',
  template: 'landing-page',
  'b2b-api': B2B_API,
})}`),
  '/contact': daPage(`
<div>
  <h1>Contact us</h1>
  <p>Questions about corporate packages, safety, or custom itineraries? Send us a message.</p>
</div>
<div>
  ${formBlockSection(WKND_FORMS['wknd-contact-b2b'], { title: 'Send a message' })}
</div>
${metadataBlock({
  Title: 'Contact — WKND Business',
  template: 'landing-page',
})}`),
  '/request-adventure': daPage(`
<div>
  <h1>Request an adventure</h1>
  <p>Tell us about your team, dates, and goals. We will follow up with options and pricing.</p>
</div>
<div>
  ${formBlockSection(WKND_FORMS['wknd-adventure-interest-b2b'], { title: 'Team adventure request' })}
</div>
${metadataBlock({
  Title: 'Request Adventure — WKND Business',
  template: 'landing-page',
})}`),
  '/about': daPage(`
<div>
  <div class="hero-adventure">
    <div>
      <div>
        <picture><img src="${IMG.community}" alt="Team outdoors"></picture>
      </div>
    </div>
    <div>
      <div><p>About</p></div>
      <div><h1>WKND for business</h1></div>
      <div><p>We help companies build culture through shared adventure.</p></div>
    </div>
  </div>
</div>
<div>
  <p>WKND Business extends the WKND Adventures editorial brand with logistics, duty-of-care, and team sizing for corporate groups.</p>
</div>
${metadataBlock({
  Title: 'About — WKND Business',
  template: 'landing-page',
})}`),
  '/field-notes': daPage(`
<div>
  <div class="hero-adventure">
    <div>
      <div>
        <picture><img src="${IMG.fieldNotes}" alt="Field notes"></picture>
      </div>
    </div>
    <div>
      <div><p>Field Notes</p></div>
      <div><h1>Stories from the trail</h1></div>
      <div><p>Inspiration for your next team adventure.</p></div>
    </div>
  </div>
</div>
<div>
  <div class="carousel-blog">
    <div>
      <div><div>Latest stories</div></div>
      <div><div>6</div></div>
      <div><div>/field-notes</div></div>
    </div>
  </div>
</div>
${metadataBlock({
  Title: 'Field Notes — WKND Business',
  template: 'landing-page',
  journeyStage: 'inspiration',
})}`),
};

const token = getDaToken();
if (!token) {
  console.error('No valid DA token. Run: npx github:adobe-rnd/da-auth-helper token');
  process.exit(1);
}

console.log(`${DRY_RUN ? 'Dry run' : 'Seeding'} ${Object.keys(PAGES).length} pages on ${SITE}…\n`);

let count = 0;
for (const [path, html] of Object.entries(PAGES)) {
  if (DRY_RUN) {
    console.log(`  ~ ${path}`);
    continue;
  }
  await putSource(token, ORG, SITE, path, html.trim());
  if (PREVIEW) await triggerPreview(token, ORG, SITE, BRANCH, path);
  if (PUBLISH) await triggerPublish(token, ORG, SITE, BRANCH, path);
  console.log(`  ✓ ${path}`);
  count += 1;
}

console.log(`\nDone. ${DRY_RUN ? 'Would seed' : 'Seeded'} ${DRY_RUN ? Object.keys(PAGES).length : count} page(s).`);
