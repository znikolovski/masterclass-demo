#!/usr/bin/env node
/**
 * Real OF1 SDK + gateway + Commerce/drop-ins, backed by an isolated in-memory catalog/cart.
 * Requires the sibling wknd-commerce and wknd-automation workspaces; never mutates live carts.
 * Run: node tools/scripts/test-of1-products.mjs [http://localhost:3001]
 * Pass an explicit /of1 URL to replay a published site.
 * Start AEM with --html-folder drafts.
 */
/* eslint-disable no-await-in-loop, no-restricted-syntax -- sequential browser interactions */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
// eslint-disable-next-line import/no-extraneous-dependencies
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const { createMemoryStore } = require('../../../wknd-commerce/lib/store.js');
const { importCatalog } = require('../../../wknd-commerce/lib/importer.js');
const { runGraphQL } = require('../../../wknd-commerce/lib/graphql-server.js');
const { main: gateway } = require('../../../wknd-automation/actions/of1-gateway/index.js');
// eslint-disable-next-line import/extensions
const catalog = structuredClone(require('../../../wknd-commerce/data/catalog.json'));

const pageUrl = new URL(process.argv[2] || 'http://localhost:3001');
const of1Url = new URL(pageUrl.pathname === '/' ? '/drafts/of1' : pageUrl.pathname, pageUrl.origin).href;
const screenshots = process.argv[3];
const torrent = catalog.products.find((p) => p.sku === 'WKND-JKT-003');
// Make a real variant-price boundary deterministic, independent of the seed's stock pattern.
torrent.variants.slice(0, 2).forEach((variant, i) => {
  const price = catalog.prices.find((p) => p.sku === variant.sku);
  price.regular = i === 0 ? 349 : 249;
  delete price.special;
  catalog.inventory.find((item) => item.sku === variant.sku).qty = 10;
});
const store = createMemoryStore();
await importCatalog(store, catalog, { replace: true });

const index = {
  total: 3,
  data: [
    { path: '/blog/patagonia-trek', title: 'Patagonia field notes', image: '/media_1e4b49be43a70d306b1c312d0d78dd369b5ccce40.jpg' },
    { path: '/blog/coastal-hiking', title: 'Coastal hiking', image: '' },
    { path: '/blog/winter-mountaineering', title: 'Winter mountaineering', image: '' },
  ],
};
const json = (data) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
let additions = 0;
let failProducts = false;
let failAdd = false;
async function commerce(body) {
  if (/addProductsToCart/.test(body.query) && /mutation/.test(body.query)) {
    additions += 1;
    if (failAdd) return { errors: [{ message: 'Test stock changed. Please check your cart.' }] };
  }
  if (failProducts && /Of1Products/.test(body.query)) return { errors: [{ message: 'Test catalog unavailable' }] };
  return (await runGraphQL(body, { store })).body;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
try {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/graphql', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.method() === 'GET'
      ? { query: url.searchParams.get('query'), variables: JSON.parse(url.searchParams.get('variables') || '{}') }
      : request.postDataJSON();
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(await commerce(body)) });
  });
  await page.route('**/api/generate*', async (route) => {
    const body = route.request().postDataJSON();
    const result = await gateway({
      OF1_PRODUCT_FIRST_ENABLED: 'true',
      __ow_path: '/api/generate',
      __ow_method: 'post',
      __ow_headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      __ow_body: JSON.stringify(body),
    }, {
      fetch: async (url, options) => {
        if (url.includes('/graphql')) return json(await commerce(JSON.parse(options.body)));
        if (url.includes('/blog-index.json')) return json(index);
        // Model-free adventure regression, still decorated by the real SDK.
        return new Response(`${[
          {
            type: 'section', format: 'html', index: 0, html: '<div class="cards"><div><div><h3>Patagonia adventure</h3></div><div><p>Published field notes</p><p><a href="/blog/patagonia-trek">Read the guide</a></p></div></div></div>',
          },
          { type: 'suggestions', suggestions: [{ label: 'Compare jackets', query: 'Compare waterproof jackets' }] },
          { type: 'done', template: 'recommendation', title: 'Patagonia adventure' },
        ].map((event) => JSON.stringify(event)).join('\n')}\n`, { headers: { 'Content-Type': 'application/x-ndjson' } });
      },
    });
    await route.fulfill({
      status: result.statusCode, contentType: result.headers['Content-Type'], body: result.body,
    });
  });
  await page.route('https://cdn1.adoberesources.net/alloy/**', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: 'const q = window.alloy.q; const run = ([resolve]) => resolve({}); q.push = run; q.forEach(run);',
  }));
  const query = 'Compare Alpine Shell Jacket and Torrent Rain Jacket';
  await page.goto(`${of1Url}?q=${encodeURIComponent(query)}`);
  const panel = page.locator('.generated-section .product-comparison').first();
  await panel.locator('.product-comparison__card').first().waitFor({ timeout: 45000 });
  assert.equal(await panel.locator('.product-comparison__card').count(), 2);
  assert.equal(await panel.locator('table thead th').count(), 3);
  assert((await panel.textContent()).includes('410'), 'catalog-backed weight');
  assert((await panel.textContent()).includes('20'), 'catalog-backed waterproofing');
  assert.equal(await page.locator('.generated-section .product-recommendations').count(), 0, 'no duplicate adventure gear');
  assert.equal(await page.locator('.generated-section .aero-options').count(), 0);
  const sherpa = page.locator('.generated-section .sherpa-options');
  assert.equal(await sherpa.count(), 1, 'one visible product Sherpa handoff');
  const chat = sherpa.getByRole('link', { name: 'Chat with WKND Sherpa', exact: true });
  assert(await chat.isVisible(), 'product results expose the Sherpa CTA');
  const handoff = await chat.evaluate((link) => {
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
    link.click();
    return link.getAttribute('href');
  });
  const handoffParams = new URLSearchParams(handoff.slice('#sherpa?'.length));
  assert.equal(handoffParams.get('send'), 'true');
  assert.equal(handoffParams.get('prompt'), [
    'Help me choose WKND products and compare which options best fit my needs.',
    `My current search is: ${query}.`,
    'The products shown include: Alpine Shell Jacket; Torrent Rain Jacket.',
  ].join(' '));
  console.log('PASS automatically rendered product Sherpa CTA and exact product-specific handoff');
  assert.equal(await page.locator('.generated-section .cards a[href*="/blog/"]').count(), 3);
  assert.equal(await panel.locator('.product-comparison__eyebrow').textContent(), 'WKND gear finder');
  assert.equal(await panel.getByRole('link', { name: 'View cart', exact: true }).count(), 1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await panel.getByRole('button', { name: 'Compare specifications', exact: true }).click();
  assert(await panel.locator('.product-comparison__table-region').evaluate((node) => document.activeElement === node), 'comparison shortcut transfers keyboard focus');
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  const card = panel.locator('[data-sku="WKND-JKT-001"]');
  const add = card.getByRole('button', { name: 'Add Alpine Shell Jacket to cart', exact: true });
  assert(await add.isDisabled(), 'configurable products require all options');
  const chooseOptions = async (target) => {
    const selects = target.locator('select');
    for (let i = 0; i < await selects.count(); i += 1) {
      const select = selects.nth(i);
      const value = await select.locator('option').evaluateAll((choices) => choices.find((c) => c.value && !c.disabled)?.value);
      assert(value, 'at least one available option');
      // eslint-disable-next-line no-await-in-loop
      await select.selectOption(value);
      // eslint-disable-next-line no-await-in-loop
      await page.waitForFunction((node) => !node.disabled, await select.elementHandle());
    }
  };
  await chooseOptions(card);
  assert(await add.isEnabled(), 'complete available variant is purchasable');
  await add.evaluate((button) => { button.click(); button.click(); });
  await card.getByText('Alpine Shell Jacket added to your cart.', { exact: true }).waitFor();
  assert.equal(additions, 1, 'one mutation per click');
  await page.waitForFunction(() => (window.adobeDataLayer || []).filter((e) => e.event === 'shopCartAdd').length === 1);
  console.log('PASS real SDK/gateway/catalog comparison, inline variants, cart add, no duplicate panels');

  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await panel.scrollIntoViewIfNeeded();
    assert(!await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), `no page overflow at ${width}`);
    assert(await panel.evaluate((node) => node.getBoundingClientRect().width <= 1200), 'comparison stays within the site content width');
    assert(await panel.locator('select').first().evaluate((node) => node.getBoundingClientRect().height >= 44), 'option controls have touch-friendly targets');
    if (width === 375) {
      const region = panel.locator('.product-comparison__table-region');
      await region.focus();
      await region.press('ArrowRight');
      await page.waitForFunction((node) => node.scrollLeft > 0, await region.elementHandle());
    }
    if (screenshots) await panel.screenshot({ path: `${screenshots}/of1-products-${width}.png` });
  }
  await page.waitForFunction(() => (window.adobeDataLayer || []).some((e) => e.event === 'shopRecsImpression'
    && e.data?.wkndShop?.recommendation?.unitId === 'wknd-of1-products'));
  const impressions = await page.evaluate(() => window.adobeDataLayer.filter((e) => e.event === 'shopRecsImpression'
    && e.data?.wkndShop?.recommendation?.unitId === 'wknd-of1-products').length);
  assert.equal(impressions, 1, 'one visible comparison impression across resizes');
  console.log('PASS 375/768/1280px layouts and deduplicated comparison analytics');

  const followUp = async (text, panels) => {
    const input = page.locator('.suggestion-input').last();
    await input.fill(text);
    await input.press('Enter');
    await page.waitForFunction((count) => document.querySelectorAll('.product-comparison .product-comparison__list').length === count, panels, { timeout: 45000 });
  };
  await followUp('WKND-PCK-005', 2);
  const simple = page.locator('.generated-section .product-comparison').last();
  assert.equal(await sherpa.count(), 2, 'one Sherpa handoff per product turn');
  assert.equal(await simple.locator('table').count(), 0, 'single product does not get a fake comparison');
  const simpleAdd = simple.getByRole('button', { name: /Add .* to cart/ });
  await simpleAdd.click();
  await simple.getByText(/added to your cart/).waitFor();
  assert.equal(additions, 2);
  assert(await add.isEnabled(), 'earlier turn remains usable');

  failAdd = true;
  await simpleAdd.click();
  await simple.getByText(/Could not confirm the addition/).waitFor();
  assert.equal(additions, 3, 'failed cart mutation is never automatically retried');
  failAdd = false;
  await followUp('waterproof jackets under $1', 2);
  // No-match results intentionally have no list.
  await page.locator('.product-comparison').last().getByText(/No products match/).waitFor();
  console.log('PASS simple add, recoverable cart error, multi-turn isolation and no-match result');

  failProducts = true;
  const input = page.locator('.suggestion-input').last();
  await input.fill('WKND-PCK-005');
  await input.press('Enter');
  const failed = page.locator('.product-comparison').last();
  await failed.getByRole('button', { name: 'Try again', exact: true }).waitFor();
  failProducts = false;
  await failed.getByRole('button', { name: 'Try again', exact: true }).click();
  await failed.locator('[data-sku="WKND-PCK-005"]').waitFor();
  assert.equal(await failed.locator('article').count(), 1, 'retry preserves original product identities');
  console.log('PASS catalog-error retry preserves block configuration');

  await followUp('Compare waterproof jackets under $300', 4);
  const budgetPanel = page.locator('.product-comparison').last();
  const budgetCard = budgetPanel.locator('[data-sku="WKND-JKT-003"]');
  await chooseOptions(budgetCard);
  assert(await budgetCard.getByRole('button', { name: /Add .* to cart/ }).isDisabled(), 'over-budget variant cannot be purchased');
  await budgetCard.getByText(/exceeds your budget/).waitFor();
  const size = budgetCard.locator('select').nth(1);
  const values = await size.locator('option').evaluateAll((choices) => choices.filter((c) => c.value && !c.disabled).map((c) => c.value));
  await size.selectOption(values[1]);
  await page.waitForFunction((node) => !node.disabled, await size.elementHandle());
  assert(await budgetCard.getByRole('button', { name: /Add .* to cart/ }).isEnabled(), 'within-budget variant is purchasable');
  console.log('PASS selected variant price, not parent minimum, enforces the hard budget');

  await page.evaluate(() => {
    const meta = document.createElement('meta');
    meta.name = 'analytics';
    meta.content = 'off';
    document.head.append(meta);
  });
  const before = await page.evaluate(() => window.adobeDataLayer.length);
  await followUp('WKND-PCK-005', 5);
  await page.locator('.product-comparison').last().scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  assert.equal(await page.evaluate(() => window.adobeDataLayer.length), before, 'analytics-off suppresses new events');
  console.log('PASS analytics-off for product results');

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(' | ')}`);
  console.log('PASS no page errors');
  await page.route('**/scripts/initializers/cart.js', (route) => route.abort());
  await page.goto(`${of1Url}?q=WKND-PCK-005`);
  await page.locator('.product-comparison').getByRole('button', { name: 'Reload page', exact: true }).waitFor();
  console.log('PASS failed Commerce initialization offers reload instead of a cached failing retry');
} catch (error) {
  console.error(await page.locator('.of1, .product-comparison').allTextContents());
  throw error;
} finally {
  await browser.close();
}
