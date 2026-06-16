#!/usr/bin/env node
/**
 * Repair homepage blocks where DA lost block class names (tabs-activity, marquee-ticker).
 * Usage: node tools/scripts/fix-homepage-blocks-da.mjs [--dry-run] [--preview] [--publish]
 */

import { getDaToken, getSource, putSource, triggerPreview, triggerPublish } from './lib/da-source.mjs';

const ORG = 'znikolovski';
const SITE = 'masterclass-demo';
const BRANCH = 'main';
const DRY_RUN = process.argv.includes('--dry-run');
const PREVIEW = process.argv.includes('--preview') || !process.argv.includes('--no-preview');
const PUBLISH = process.argv.includes('--publish');

const CTA_SECTION = `<div><p>Start Here</p><h2>Not sure where to start?</h2><p>WKND Adventures is built for people who are serious about the outdoors — but it's not a gatekeeping exercise. If you're planning your first multi-day route, you belong here. If you're a seasoned alpinist looking for detailed beta on a route you haven't done, you belong here too. The depth of the archive is the point. If you know roughly what you want to do but haven't committed to a specific route yet, the Destinations section is the fastest way in. It's organised by region, and every destination page links to every relevant route, gear guide, and field note we've published for that area. Start broad, then go deep.</p><p><a href="/adventures">Browse Adventures</a> <a href="/destinations">Find a Destination</a></p><div class="section-metadata"><div><div><p>style</p></div><div><p>inverse, narrow</p></div></div></div></div>`;

const CTA_SECTION_PATTERN = /<div><h2>Not sure where to start\?<\/h2>[\s\S]*?<div class="section-metadata"><div><div><p>style<\/p><\/div><div><p>inverse(?:, narrow)?<\/p><\/div><\/div><\/div><\/div>/;

/**
 * @param {string} html
 */
function repairHomepageHtml(html) {
  let out = html;
  let tabsFixed = false;
  let marqueeFixed = false;
  let ctaFixed = false;

  const tabsNeedle = '<h2>Browse by Activity</h2><div class="">';
  if (out.includes(tabsNeedle) && !out.includes('<div class="tabs-activity">')) {
    out = out.replace(tabsNeedle, '<h2>Browse by Activity</h2><div class="tabs-activity">');
    tabsFixed = true;
  }

  const marqueeNeedle = '<div><div class=""><div><div><p>Climbing</p></div></div><div><div><p>Kayaking</p></div></div>';
  if (out.includes(marqueeNeedle) && !out.includes('<div class="marquee-ticker">')) {
    out = out.replace(
      marqueeNeedle,
      '<div><div class="marquee-ticker"><div><div><p>Climbing</p></div></div><div><div><p>Kayaking</p></div></div>',
    );
    marqueeFixed = true;
  }

  if (CTA_SECTION_PATTERN.test(out) && !out.includes('<p>Start Here</p><h2>Not sure where to start?</h2>')) {
    out = out.replace(CTA_SECTION_PATTERN, CTA_SECTION);
    ctaFixed = true;
  }

  return { html: out, tabsFixed, marqueeFixed, ctaFixed };
}

async function main() {
  const token = getDaToken();
  if (!token) {
    console.error('No DA token. Run auth skill or set DA_TOKEN.');
    process.exit(1);
  }

  const source = await getSource(token, ORG, SITE, '/');
  if (!source) {
    console.error('Homepage not found in DA.');
    process.exit(1);
  }

  const { html, tabsFixed, marqueeFixed, ctaFixed } = repairHomepageHtml(source);
  console.log({ tabsFixed, marqueeFixed, ctaFixed, bytes: html.length });

  if (!tabsFixed && !marqueeFixed && !ctaFixed) {
    console.log('Nothing to repair — homepage blocks already look OK.');
    return;
  }

  if (DRY_RUN) {
    console.log('Dry run — not writing to DA.');
    return;
  }

  await putSource(token, ORG, SITE, '/', html);
  console.log('PUT / → DA source updated.');

  if (PREVIEW) {
    await triggerPreview(token, ORG, SITE, BRANCH, '/');
    console.log('Preview triggered for /.');
  }
  if (PUBLISH) {
    await triggerPublish(token, ORG, SITE, BRANCH, '/');
    console.log('Publish triggered for /.');
  }

  console.log('Done. Check https://main--masterclass-demo--znikolovski.aem.page/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
