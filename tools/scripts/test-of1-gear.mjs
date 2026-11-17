#!/usr/bin/env node
/**
 * OF1 → WKND shop gear recommendations: replays a published card template through the real
 * OF1 SDK (no model calls) and checks the autoblocked product-recommendations panel.
 * Run: node tools/scripts/test-of1-gear.mjs [http://localhost:3000] [screenshot-directory]
 */
import assert from 'node:assert/strict';
import path from 'node:path';
// eslint-disable-next-line import/no-extraneous-dependencies -- development-only browser checks
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:3000';
const screenshots = process.argv[3];
const query = 'Gear for trekking in Patagonia';
const adventure = 'patagonia-trek';
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const anchorSearches = [];
  page.on('request', (request) => {
    if (!request.url().includes('/graphql')) return;
    const url = new URL(request.url());
    const variables = JSON.parse(url.searchParams.get('variables') || '{}');
    if (variables.filter?.some((f) => f.attribute === 'adventure')) anchorSearches.push(variables);
  });

  const template = await page.request.get(`${base}/templates/of1/recommendation.plain.html`);
  assert(template.ok(), `recommendation template returned ${template.status()}`);
  const cardsHtml = await page.evaluate(({ html, slug }) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const cards = doc.querySelector('.cards');
    cards.querySelector('a').setAttribute('href', `/blog/${slug}`);
    return cards.outerHTML;
  }, { html: await template.text(), slug: adventure });

  const stream = (title) => [
    {
      type: 'section', format: 'html', index: 0, html: cardsHtml, stylesheet: null,
    },
    { type: 'suggestions', suggestions: [{ label: 'Keep exploring', query: 'Another trek' }] },
    { type: 'done', template: 'recommendation', title },
  ].map((event) => JSON.stringify(event)).join('\n');
  await page.route('**/api/generate', (route) => route.fulfill({
    contentType: 'application/x-ndjson',
    body: `${stream('Patagonia gear')}\n`,
  }));
  await page.route('https://cdn1.adoberesources.net/alloy/**', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `
      const queue = window.alloy.q;
      const execute = ([resolve]) => resolve({});
      queue.push = execute;
      queue.forEach(execute);
    `,
  }));

  await page.goto(`${base}/of1?q=${encodeURIComponent(query)}`);
  const panel = page.locator('.generated-section .product-recommendations');
  await panel.first().waitFor({ state: 'attached', timeout: 30000 });
  assert.equal(await panel.count(), 1, 'one gear panel per response');
  assert.equal(await panel.getAttribute('data-unit-id'), 'wknd-of1-gear');
  assert(await panel.evaluate((block) => {
    const section = block.closest('.section');
    return !block.closest('.cards')
      && section.previousElementSibling?.querySelector('.cards .cards-card-actions');
  }), 'gear panel follows the adventure cards');

  await panel.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('.generated-section .product-recommendations')
    ?.querySelectorAll('a[href*="/shop/products/"]').length > 0, null, { timeout: 45000 });
  const products = await panel.locator('a[href*="/shop/products/"]').evaluateAll((links) => (
    [...new Set(links.map((link) => new URL(link.href).pathname))]
  ));
  assert(products.length >= 2, `expected recommended products, got ${products.length}`);
  assert(anchorSearches.some((v) => v.filter[0].in.includes(adventure)), 'anchor search used the response adventures');
  assert(await panel.getByText('Gear up for this adventure').count(), 'panel heading');
  assert((await panel.getByRole('button', { name: /add to cart|choose options/i }).count())
    + (await panel.getByRole('link', { name: /choose options/i }).count()) > 0, 'cart actions');
  const impressions = await page.evaluate(() => (window.adobeDataLayer || [])
    .filter((e) => e?.event === 'shopRecsImpression').map((e) => e.data?.wkndShop?.recommendation?.unitId));
  assert(impressions.includes('wknd-of1-gear'), 'recommendation impression pushed to ACDL');
  if (screenshots) await panel.screenshot({ path: path.join(screenshots, 'of1-gear-1280.png') });
  console.log(`PASS gear panel after adventure cards, anchored on ${adventure}, ${products.length} products, impression analytics`);

  // Narrow layout: no horizontal overflow from the carousel.
  await page.setViewportSize({ width: 375, height: 800 });
  await panel.scrollIntoViewIfNeeded();
  assert(!await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), 'no horizontal overflow at 375px');
  if (screenshots) await panel.screenshot({ path: path.join(screenshots, 'of1-gear-375.png') });
  console.log('PASS responsive gear panel at 375 px');

  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  console.log('PASS no page errors');
} finally {
  await browser.close();
}
