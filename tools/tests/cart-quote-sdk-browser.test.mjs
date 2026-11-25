/* eslint-disable import/no-unresolved -- Existing browser test tooling */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
// eslint-disable-next-line import/no-extraneous-dependencies -- Existing browser validation tooling
import { chromium } from 'playwright';

const root = new URL('../../', import.meta.url);
const money = (value) => ({ currency: 'AUD', value });
const rawCart = (value) => ({
  id: 'fixture-cart',
  total_quantity: 2,
  is_virtual: false,
  itemsV2: {
    items: [],
    total_count: 0,
    page_info: { current_page: 1, page_size: 100, total_pages: 1 },
  },
  applied_coupons: [],
  shipping_addresses: [],
  prices: {
    grand_total: money(value),
    grand_total_excluding_tax: money(value),
    subtotal_excluding_tax: money(value),
    subtotal_including_tax: money(value),
    applied_taxes: [],
    discounts: [],
  },
});
const methods = [{
  carrier_code: 'standard',
  method_code: 'standard',
  error_message: null,
  amount: money(9.95),
  price_excl_tax: money(9.95),
  price_incl_tax: money(9.95),
}];

test('browser: already-bound real SDK linked client uses the public subclass and one batch', {
  timeout: 15000,
}, async () => {
  const calls = [];
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end(`<!doctype html><html><head><script type="importmap">{"imports":{
        "@dropins/tools/":"/scripts/__dropins__/tools/",
        "@dropins/storefront-cart/":"/scripts/__dropins__/storefront-cart/",
        "@dropins/tools/fetch-graphql.js":"/scripts/commerce-fetch-graphql.js",
        "/scripts/__dropins__/tools/fetch-graphql.js":"/scripts/commerce-fetch-graphql.js"
      }}</script></head><body><p id="status"></p></body></html>`);
      return;
    }
    if (path === '/graphql') {
      let body = '';
      // eslint-disable-next-line no-restricted-syntax -- Node HTTP requests are async streams.
      for await (const chunk of request) body += chunk;
      const payload = JSON.parse(body);
      calls.push(payload);
      let data;
      if (payload.query.includes('$wkndCartEstimate:')) {
        const bundle = payload.query.includes('completeWkndBundle(');
        data = {
          [bundle ? 'addProductsToCart' : 'updateCartItems']: {
            cart: rawCart(bundle ? 445.50 : 39.90), errors: [], user_errors: [],
          },
          shipping: methods,
          estimated: { cart: rawCart(bundle ? 445.50 : 49.85) },
        };
      } else if (payload.query.includes('ESTIMATE_SHIPPING_METHODS_MUTATION')) {
        data = { estimateShippingMethods: methods };
      } else {
        data = { estimateTotals: { cart: rawCart(29.90) } };
      }
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ data }));
      return;
    }
    try {
      const file = new URL(`.${path}`, root);
      assert.ok(file.href.startsWith(root.href));
      response.setHeader('Content-Type', 'text/javascript');
      response.end(await readFile(file));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  const browser = await chromium.launch();
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const result = await page.evaluate(async () => {
      document.cookie = 'DROPIN__CART__CART-ID=fixture-cart; path=/';
      const api = await import('@dropins/storefront-cart/api.js');
      const { events } = await import('@dropins/tools/event-bus.js');
      let published;
      events.on('cart/data', (cart) => { published = cart; });
      const { FetchGraphQL, enableCartQuoteBatch } = await import('../../../../../../../../../scripts/commerce-fetch-graphql.js');
      const core = new FetchGraphQL();
      core.setEndpoint(`${window.location.origin}/graphql`);
      core.setFetchGraphQlHeader('Store', 'wknd_au');
      api.setEndpoint(core);
      enableCartQuoteBatch({
        getCartDataFromCache: api.getCartDataFromCache,
        onEstimateError: () => { document.querySelector('#status').textContent = 'Estimate failed'; },
      });
      const address = { countryCode: 'AU', postcode: '2000', region: { region: '' } };
      const estimate = {
        ...address,
        shipping_method: { carrier_code: 'standard', method_code: 'standard' },
      };
      await api.getEstimateShipping(address);
      const initial = await api.getEstimatedTotals(estimate);
      initial.items = [{ uid: 'fixture-line', quantity: 1, sku: 'fixture-bottle' }];
      sessionStorage.setItem('DROPIN__CART__CART__DATA', JSON.stringify(initial));
      const updated = await api.updateProductsFromCart([{ uid: 'fixture-line', quantity: 2 }]);
      await api.getEstimateShipping(address);
      const estimated = await api.getEstimatedTotals(estimate);
      const bundlePublication = new Promise((resolve) => {
        events.on('cart/data', (cart) => {
          if (cart.total.includingTax.value === 445.50) resolve();
        });
      });
      const completed = await api.addProductsToCart([{
        sku: 'fixture-jacket',
        quantity: 1,
        customFields: {
          wknd_bundle_completion: {
            cartId: 'fixture-cart', promotionId: 'promotion', bundleId: 'bundle', cartVersion: 'v3',
          },
        },
      }]);
      await api.getEstimateShipping(address);
      const bundleTotal = await api.getEstimatedTotals(estimate);
      await bundlePublication;
      return {
        updated: updated.total.includingTax.value,
        estimated: estimated.total.includingTax.value,
        completed: completed.total.includingTax.value,
        published: published.total.includingTax.value,
        bundleTotal: bundleTotal.total.includingTax.value,
      };
    });
    assert.deepEqual(result, {
      updated: 39.90, estimated: 49.85, completed: 445.50, published: 445.50, bundleTotal: 445.50,
    });
    assert.equal(calls.length, 4, 'two initial estimates, one ordinary edit, one atomic bundle');
    assert.equal(calls[2].variables.wkndCartEstimate.address.country_code, 'AU');
    assert.match(calls[3].query, /addProductsToCart:\s*completeWkndBundle\(/);
    assert.equal(calls[3].variables.cartItems, undefined);
    assert.equal(calls[3].variables.wkndBundleVersion, 'v3');
    await page.evaluate(async () => {
      const { default: init } = await import('../../../../../../../../../blocks/commerce-cart/bundle-offers.js');
      const container = document.createElement('div');
      document.body.append(container);
      const initial = {
        id: 'fixture-cart', totalQuantity: 1, items: [{ sku: 'bottle', quantity: 1 }],
      };
      const offer = {
        promotion_id: 'promotion',
        bundle_id: 'bundle',
        cart_version: 'v3',
        name: 'Test kit',
        quote_expires_at: new Date(Date.now() + 60000).toISOString(),
        saving: { value: 20, currency: 'AUD' },
        components: ['bottle', 'jacket'].map((sku) => ({
          sku,
          name: sku,
          required_quantity: 1,
          unit_price: { value: 100, currency: 'AUD' },
        })),
      };
      window.bundleFixture = { reads: 0, adds: 0, refreshes: 0 };
      init(container, {
        events: { on: (_name, callback) => callback(initial) },
        fetchGraphQl: async () => {
          window.bundleFixture.reads += 1;
          return { data: { wkndBundleOffers: [offer] } };
        },
        addProducts: async (items) => {
          window.bundleFixture.adds += 1;
          window.bundleFixture.items = items;
          return {
            ...initial,
            totalQuantity: 2,
            items: [...initial.items, { sku: 'jacket', quantity: 1 }],
          };
        },
        refreshCart: async () => {
          window.bundleFixture.refreshes += 1;
          return initial;
        },
      });
    });
    await page.getByRole('button', { name: 'Add remaining products for Test kit', exact: true }).click();
    await page.getByText(
      'Your cart contains the complete kit. The best eligible discount is applied automatically.',
      { exact: true },
    ).waitFor();
    const completion = await page.evaluate(() => window.bundleFixture);
    assert.equal(completion.adds, 1);
    assert.equal(completion.refreshes, 0, 'successful bundle must not issue a cart preflight');
    assert.equal(completion.reads, 2, 'initial display and post-completion refresh only');
    assert.deepEqual(completion.items, [{
      sku: 'jacket',
      quantity: 1,
      customFields: {
        wknd_bundle_completion: {
          cartId: 'fixture-cart', promotionId: 'promotion', bundleId: 'bundle', cartVersion: 'v3',
        },
      },
    }]);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => {
      server.close((error) => { if (error) reject(error); else resolve(); });
    });
  }
});
