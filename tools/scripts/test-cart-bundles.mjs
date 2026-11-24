#!/usr/bin/env node
/* eslint-disable no-await-in-loop, no-restricted-syntax -- sequential browser interactions */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// eslint-disable-next-line import/no-extraneous-dependencies
import { chromium } from 'playwright';

const { origin } = new URL(process.argv[2] || 'http://localhost:3133');
const screenshots = process.argv[3];
const content = await readFile(new URL('../../drafts/shop/cart.plain.html', import.meta.url), 'utf8');
const head = await readFile(new URL('../../head.html', import.meta.url), 'utf8');
const criticalStyle = head.match(/<style nonce="aem">[\s\S]*?<\/style>/)?.[0];
assert(criticalStyle, 'site critical styles are available');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (entry) => { if (entry.type() === 'error') consoleErrors.push(entry.text()); });
try {
  await page.route(`${origin}/bundle-offers-test`, (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="en"><head>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      ${criticalStyle}
      <link rel="stylesheet" href="/styles/brand.css">
      <link rel="stylesheet" href="/styles/styles.css">
      <link rel="stylesheet" href="/styles/commerce.css">
      <link rel="stylesheet" href="/blocks/commerce-cart/commerce-cart.css">
      </head><body class="appear shop"><main>${content}</main></body></html>`,
  }));
  await page.goto(`${origin}/bundle-offers-test`);
  await page.evaluate(async () => {
    const moduleUrl = new URL('/blocks/commerce-cart/bundle-offers.js', window.location.origin);
    const { default: init } = await import(moduleUrl.href);
    const block = document.querySelector('.commerce-cart');
    block.dataset.blockStatus = 'loaded';
    const container = document.createElement('div');
    container.className = 'cart__bundle-offers';
    block.replaceChildren(container);
    const state = {
      cart: { id: 'isolated-test-cart', totalQuantity: 1, items: [{ sku: 'WKND-A-RED-M', quantity: 1 }] },
      calls: [],
      failQuery: false,
      partialFailure: false,
      preflightComplete: false,
      held: [],
      holdResponses: false,
      offer: {
        promotion_id: 'isolated-test-promotion',
        bundle_id: 'isolated-test-bundle',
        name: 'Climbing essentials',
        quote_expires_at: new Date(Date.now() + 60000).toISOString(),
        saving: { value: 10, currency: 'AUD' },
        components: [
          {
            sku: 'WKND-A-RED-M',
            name: 'Red climbing layer',
            required_quantity: 2,
            cart_quantity: 1,
            missing_quantity: 1,
            unit_price: { value: 60, currency: 'AUD' },
          },
          {
            sku: 'WKND-B-ONE',
            name: 'Chalk bag',
            required_quantity: 1,
            cart_quantity: 0,
            missing_quantity: 1,
            unit_price: { value: 80, currency: 'AUD' },
          },
        ],
      },
    };
    let listener;
    state.emit = () => {
      state.cart.totalQuantity = state.cart.items.reduce((sum, item) => sum + item.quantity, 0);
      listener(structuredClone(state.cart));
    };
    const add = (products) => products.forEach(({ sku, quantity }) => {
      const item = state.cart.items.find((line) => line.sku === sku);
      if (item) item.quantity += quantity;
      else state.cart.items.push({ sku, quantity });
    });
    init(container, {
      events: { on: (name, handler) => { listener = handler; state.emit(); } },
      fetchGraphQl: async () => {
        if (state.failQuery) return { errors: [{ message: 'Test offer service unavailable' }] };
        const hasMissing = state.offer.components.some((component) => (
          state.cart.items.filter((i) => i.sku === component.sku)
            .reduce((sum, i) => sum + i.quantity, 0) < component.required_quantity
        ));
        const offers = hasMissing ? [structuredClone(state.offer)] : [];
        const response = { data: { wkndBundleOffers: offers } };
        if (state.holdResponses) {
          return new Promise((resolve) => { state.held.push(() => resolve(response)); });
        }
        return response;
      },
      addProducts: async (products) => {
        state.calls.push(structuredClone(products));
        if (state.partialFailure) {
          add(products.slice(0, 1));
          state.emit();
          throw new Error('Test stock changed during add');
        }
        add(products);
        state.emit();
        return structuredClone(state.cart);
      },
      refreshCart: async () => {
        if (state.preflightComplete) {
          state.cart.items = [{ sku: 'WKND-A-RED-M', quantity: 2 }, { sku: 'WKND-B-ONE', quantity: 1 }];
          state.preflightComplete = false;
        }
        state.emit();
        return structuredClone(state.cart);
      },
    });
    window.bundleTest = state;
  });
  const addButton = page.getByRole('button', { name: 'Add remaining products for Climbing essentials' });
  await addButton.waitFor();
  assert.match(await page.locator('.cart-bundle-offers__card').textContent(), /1 × Red climbing layer/);
  assert.match(await page.locator('.cart-bundle-offers__card').textContent(), /1 × Chalk bag/);
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => (
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    ));
    assert.equal(overflow, false, `no horizontal overflow at ${width}px`);
    if (screenshots) await page.screenshot({ path: `${screenshots}/bundle-completion-${width}.png` });
  }
  assert.deepEqual(consoleErrors, [], 'ordinary offer rendering has no console errors');
  await addButton.evaluate((button) => { button.click(); button.click(); });
  await page.waitForFunction(() => window.bundleTest.calls.length === 1
    && document.querySelector('.cart-bundle-offers__status').textContent.includes('complete kit'));
  assert.deepEqual(await page.evaluate(() => window.bundleTest.calls), [[
    { sku: 'WKND-A-RED-M', quantity: 1 }, { sku: 'WKND-B-ONE', quantity: 1 },
  ]], 'adds only the missing quantities once');
  assert.equal(await page.locator('.cart-bundle-offers__card').count(), 0, 'full kit removes suggestion');
  console.log('PASS partial-kit offer, exact missing quantities, duplicate-click protection, 3 viewports');

  await page.evaluate(() => {
    const state = window.bundleTest;
    state.cart.items = [{ sku: 'WKND-A-RED-M', quantity: 1 }, { sku: 'WKND-A-RED-M', quantity: 1 }];
    state.emit();
  });
  await addButton.waitFor();
  assert.equal(await page.locator('.cart-bundle-offers__card li').count(), 1);
  await addButton.click();
  await page.waitForFunction(() => window.bundleTest.calls.length === 2);
  assert.deepEqual(await page.evaluate(() => window.bundleTest.calls[1]), [
    { sku: 'WKND-B-ONE', quantity: 1 },
  ], 'aggregates existing exact-variant lines');

  await page.evaluate(() => {
    const state = window.bundleTest;
    state.cart.items = [{ sku: 'WKND-A-BLUE-M', quantity: 1 }];
    state.emit();
  });
  await page.waitForFunction(() => document.querySelectorAll('.cart-bundle-offers__card').length === 0);
  assert.equal(await addButton.count(), 0, 'different variant does not trigger offer');
  console.log('PASS exact variants and aggregated cart quantities');

  await page.evaluate(() => {
    const state = window.bundleTest;
    state.cart.items = [{ sku: 'WKND-A-RED-M', quantity: 1 }];
    state.preflightComplete = true;
    state.emit();
  });
  await addButton.waitFor();
  await addButton.click();
  await page.waitForFunction(() => (
    document.querySelector('.cart-bundle-offers__status').textContent.includes('already contains')
  ));
  assert.equal(await page.evaluate(() => window.bundleTest.calls.length), 2);
  console.log('PASS refresh detects externally completed kit without another add');

  await page.evaluate(() => {
    const state = window.bundleTest;
    state.cart.items = [{ sku: 'WKND-A-RED-M', quantity: 1 }];
    state.partialFailure = true;
    state.emit();
  });
  await addButton.waitFor();
  await addButton.click();
  await page.waitForFunction(() => (
    document.querySelector('.cart-bundle-offers__status').textContent.includes('Check your cart')
    && document.querySelectorAll('.cart-bundle-offers__card li').length === 1
  ));
  await page.evaluate(() => { window.bundleTest.partialFailure = false; });
  await addButton.click();
  await page.waitForFunction(() => window.bundleTest.calls.length === 4);
  assert.deepEqual(await page.evaluate(() => window.bundleTest.calls[3]), [
    { sku: 'WKND-B-ONE', quantity: 1 },
  ], 'after a partial failure retry adds only what is still missing');
  console.log('PASS explicit partial-add error and safe quantity recomputation on retry');

  await page.evaluate(() => {
    const state = window.bundleTest;
    state.cart.items = [{ sku: 'WKND-A-RED-M', quantity: 1 }];
    state.failQuery = true;
    state.emit();
  });
  const retry = page.getByRole('button', { name: 'Check bundle offers again' });
  await retry.waitFor();
  assert.match(await page.getByRole('status').textContent(), /checkout are still available/);
  await page.evaluate(() => { window.bundleTest.failQuery = false; });
  await retry.click();
  await addButton.waitFor();
  console.log('PASS unavailable service is explicit and retry restores offers');

  await page.evaluate(() => {
    const state = window.bundleTest;
    state.holdResponses = true;
    state.cart.items = [{ sku: 'WKND-A-RED-M', quantity: 2 }];
    state.emit();
  });
  await page.waitForFunction(() => window.bundleTest.held.length === 1);
  await page.evaluate(() => {
    const state = window.bundleTest;
    state.cart.items = [{ sku: 'WKND-UNRELATED', quantity: 1 }];
    state.emit();
  });
  await page.waitForFunction(() => window.bundleTest.held.length === 2);
  await page.evaluate(() => {
    const state = window.bundleTest;
    state.held.pop()();
    state.held.pop()();
    state.holdResponses = false;
  });
  assert.equal(await page.locator('.cart-bundle-offers__card').count(), 0);
  console.log('PASS late responses cannot restore a bundle for an unrelated newer cart');

  await page.clock.install();
  await page.evaluate(() => {
    const state = window.bundleTest;
    state.offer.quote_expires_at = new Date(Date.now() + 1000).toISOString();
    state.cart.items = [{ sku: 'WKND-A-RED-M', quantity: 2 }];
    state.emit();
  });
  await addButton.waitFor();
  await page.clock.fastForward(1500);
  await page.waitForFunction(() => document.querySelectorAll('.cart-bundle-offers__card').length === 0);
  assert.equal(await page.evaluate(() => window.bundleTest.calls.length), 4);
  assert.deepEqual(pageErrors, []);
  assert(
    consoleErrors.every((message) => message.includes('commerce-cart bundle offers')),
    'only deliberately injected failures are logged',
  );
  console.log('PASS quote expiry removes offer without adding products; no browser exceptions');
} finally {
  await browser.close();
}
