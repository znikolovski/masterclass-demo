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

test('browser: already-bound real SDK linked client uses the public subclass and one batch', async () => {
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
        data = {
          updateCartItems: { cart: rawCart(39.90), errors: [] },
          shipping: methods,
          estimated: { cart: rawCart(49.85) },
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
      return {
        updated: updated.total.includingTax.value, estimated: estimated.total.includingTax.value,
      };
    });
    assert.deepEqual(result, { updated: 39.90, estimated: 49.85 });
    assert.equal(calls.length, 3, 'two initial estimates, then one ordered mutation');
    assert.equal(calls[2].variables.wkndCartEstimate.address.country_code, 'AU');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => {
      server.close((error) => { if (error) reject(error); else resolve(); });
    });
  }
});
