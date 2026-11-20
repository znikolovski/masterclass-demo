#!/usr/bin/env node
/* eslint-env node, es2021 */
/* eslint-disable import/extensions, no-console -- executable regression checks */
import assert from 'node:assert/strict';
import { fetchBookingProducts, getAeroShopLink } from '../../scripts/aero-shop.js';

const originalFetch = globalThis.fetch;
let calls = 0;
let response;
globalThis.fetch = async (input, options) => {
  calls += 1;
  const url = new URL(input);
  assert.deepEqual(JSON.parse(url.searchParams.get('variables')), {
    filter: [{ attribute: 'adventure', in: ['patagonia-trek'] }],
  });
  assert.equal(options.headers.Store, 'wknd_au');
  assert(options.signal);
  return response;
};

try {
  assert.deepEqual(await fetchBookingProducts([]), []);
  assert.deepEqual(await fetchBookingProducts([undefined, '', 'BK_0123456789abcdef']), []);
  assert.equal(calls, 0);
  const product = {
    sku: 'SHELL', name: 'Alpine Shell', urlKey: 'alpine-shell', inStock: true,
  };
  response = Response.json({
    data: {
      productSearch: {
        items: [
          { productView: product }, { productView: product },
          { productView: { ...product, sku: 'SOLD-OUT', inStock: false } },
          { productView: { sku: 'BROKEN' } }, { productView: null },
        ],
      },
    },
  });
  assert.deepEqual(await fetchBookingProducts(['patagonia-trek', 'patagonia-trek']), [product]);
  assert.equal(getAeroShopLink('alpine-shell'), 'https://wknd-adventures.run.place/shop/products/alpine-shell');
  assert.equal(new URL(getAeroShopLink('//other.test?x=1')).origin, 'https://wknd-adventures.run.place');
  response = Response.json({ errors: [{ message: 'Catalog failed' }] });
  await assert.rejects(fetchBookingProducts(['patagonia-trek']), /query failed/);
  response = Response.json({ data: {} });
  await assert.rejects(fetchBookingProducts(['patagonia-trek']), /response is invalid/);
  response = new Response('', { status: 503 });
  await assert.rejects(fetchBookingProducts(['patagonia-trek']), /HTTP 503/);
  console.log('PASS booking product filtering, deduplication, stock, safe canonical links and explicit catalog errors');
} finally {
  globalThis.fetch = originalFetch;
}
