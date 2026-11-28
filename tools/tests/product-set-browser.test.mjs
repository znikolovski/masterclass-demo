/* eslint-disable import/no-unresolved -- Browser import-map modules. */
/* eslint-disable import/no-extraneous-dependencies -- Existing browser tooling. */
/* eslint-disable no-await-in-loop -- Sequential variant refinement and viewport checks. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = new URL('../../', import.meta.url);
const backendRoot = process.env.WKND_COMMERCE_TEST_ROOT;
const pants = 'WKND-PNT-002-BASA-M';

test('Product Kit: authored products and real SDK bulk addition', {
  timeout: 60000,
  skip: !backendRoot && 'Set WKND_COMMERCE_TEST_ROOT to the matching Commerce checkout.',
}, async (t) => {
  const backend = createRequire(path.join(backendRoot, 'package.json'));
  const { createMemoryStore } = backend('./lib/store');
  const { importCatalog } = backend('./lib/importer');
  const { migrateLegacyPromotions } = backend('./lib/promotions');
  const { createCart } = backend('./lib/cart');
  const { runGraphQL } = backend('./lib/graphql-server');
  const store = createMemoryStore();
  await importCatalog(store, backend('./data/catalog.json'), { replace: true });
  await migrateLegacyPromotions(store);
  await Promise.all(['WKND-PNT-002', 'WKND-TRV-007'].map((sku) => (
    store.collection('asset_links').insertOne({
      _id: `fixture-${sku}`,
      sku,
      alias: sku,
      roles: ['thumbnail'],
      url: `https://delivery-p115476-e1135027.adobeaemcloud.com/adobe/assets/fixture-${sku}`,
      label: `Catalog image for ${sku}`,
    })
  )));
  const cart = await createCart(store);
  await store.collection('carts').updateOne({ id: cart.id }, {
    $set: {
      items: [{
        uid: 'pants', sku: pants, parentSku: 'WKND-PNT-002', quantity: 2,
      }],
    },
  });
  const calls = [];
  let addMode = 'normal';
  let unavailable = false;
  const draft = await readFile(new URL('drafts/shop/product-set.plain.html', root), 'utf8');
  const server = createServer(async (request, response) => {
    try {
      const { pathname, searchParams } = new URL(request.url, 'http://localhost');
      if (pathname === '/') {
        response.setHeader('Content-Type', 'text/html');
        response.end(`<!doctype html><html><head>
          <meta name="viewport" content="width=device-width,initial-scale=1">
          <link rel="stylesheet" href="/styles/brand.css">
          <link rel="stylesheet" href="/styles/styles.css">
          <link rel="stylesheet" href="/styles/lazy-styles.css">
          <link rel="stylesheet" href="/styles/commerce.css">
          <link rel="stylesheet" href="/blocks/product-kit/product-kit.css">
          <script type="importmap">{"imports":{
            "@dropins/tools/":"/scripts/__dropins__/tools/",
            "@dropins/storefront-cart/":"/scripts/__dropins__/storefront-cart/"
          }}</script></head><body class="appear"><main>${draft}</main></body></html>`);
        return;
      }
      if (pathname === '/scripts/commerce.js') {
        response.setHeader('Content-Type', 'text/javascript');
        response.end(`import { FetchGraphQL } from '@dropins/tools/fetch-graphql.js';
          import { setEndpoint } from '@dropins/storefront-cart/api.js';
          const core = new FetchGraphQL();
          core.setEndpoint(location.origin + '/graphql');
          core.setFetchGraphQlHeader('Store', 'wknd_au');
          setEndpoint(core);
          export const CORE_FETCH_GRAPHQL = core;
          export const CS_FETCH_GRAPHQL = core;
          export const initializeCommerce = async () => {};
          export const getProductLink = (key) => '/shop/products/' + key;`);
        return;
      }
      if (pathname === '/graphql') {
        let body = '';
        // eslint-disable-next-line no-restricted-syntax -- Node HTTP request stream.
        for await (const chunk of request) body += chunk;
        const payload = request.method === 'GET'
          ? { query: searchParams.get('query'), variables: JSON.parse(searchParams.get('variables') || '{}') }
          : JSON.parse(body);
        calls.push(payload);
        response.setHeader('Content-Type', 'application/json');
        if (payload.query.includes('addProductsToCart(')) {
          if (addMode === 'error') {
            response.end(JSON.stringify({ errors: [{ message: 'Fixture addition failure' }] }));
            return;
          }
          if (addMode === 'partial') {
            payload.variables = {
              ...payload.variables, cartItems: payload.variables.cartItems.slice(0, 1),
            };
          }
        }
        const result = (await runGraphQL(payload, { store })).body;
        if (unavailable && payload.query.includes('WkndProductSet')) {
          result.data.products.forEach((product) => { product.inStock = false; });
        }
        response.end(JSON.stringify(result));
        return;
      }
      const file = new URL(`.${pathname}`, root);
      assert.ok(file.href.startsWith(root.href));
      response.setHeader('Content-Type', pathname.endsWith('.css') ? 'text/css' : 'text/javascript');
      response.end(await readFile(file));
    } catch (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
      // eslint-disable-next-line no-console -- Report unexpected fixture server failures.
      if (error.code !== 'ENOENT') console.error(error);
    }
  });
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  const browser = await chromium.launch();
  const pageErrors = [];
  try {
    const page = await browser.newPage();
    const origin = `http://127.0.0.1:${server.address().port}`;
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.route('**/*', (route) => {
      if (route.request().resourceType() === 'image') {
        return route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#eee"/></svg>',
        });
      }
      return route.request().url().startsWith(origin) ? route.continue() : route.abort();
    });
    await page.goto(origin);
    await page.evaluate(async (cartId) => {
      document.cookie = `DROPIN__CART__CART-ID=${cartId}; path=/`;
      window.decorateProductSet = (await import('./blocks/product-kit/product-kit.js')).default;
      await window.decorateProductSet(document.querySelector('.product-kit'));
    }, cart.id);
    const block = page.locator('.product-kit');
    const button = block.getByRole('button', { name: 'Add all to cart', exact: true });
    const selectPants = async () => {
      const selects = block.locator('select');
      for (let i = 0; i < await selects.count(); i += 1) {
        const select = selects.nth(i);
        const choices = await select.locator('option').allTextContents();
        const label = choices.includes('Basalt Black') ? 'Basalt Black' : 'M';
        await select.selectOption({ label });
        await page.waitForFunction(() => (
          [...document.querySelectorAll('.product-kit select')].every((control) => !control.disabled)
        ));
      }
    };
    const reset = async (html) => {
      await page.evaluate(async (markup) => {
        const element = document.createElement('div');
        element.className = 'product-kit';
        element.innerHTML = markup;
        document.querySelector('.product-kit').replaceWith(element);
        await window.decorateProductSet(element);
      }, html);
    };
    const skuRows = '<div><div>WKND-PNT-002</div></div><div><div>WKND-TRV-007</div></div>';

    await t.test('catalog cards, complete variants, one bulk mutation and exact increments', async () => {
      assert.equal(await block.locator('article').count(), 2);
      assert.equal(await block.locator('img').count(), 2);
      assert.equal(await button.isDisabled(), true);
      assert.match(await block.textContent(), /From/);
      await selectPants();
      assert.equal(await button.isEnabled(), true);
      const widths = [375, 768, 1280];
      for (let index = 0; index < widths.length; index += 1) {
        const width = widths[index];
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(await page.evaluate(() => (
          document.documentElement.scrollWidth <= window.innerWidth
        )), true, `no overflow at ${width}px`);
        if (process.env.WKND_PRODUCT_SET_SCREENSHOTS) {
          await page.screenshot({
            path: path.join(process.env.WKND_PRODUCT_SET_SCREENSHOTS, `product-set-${width}.png`),
            fullPage: true,
          });
        }
      }
      await button.evaluate((element) => { element.click(); element.click(); });
      await page.waitForFunction(() => (
        document.querySelector('.product-kit__status').textContent.startsWith('Your selected products were added.')
      ));
      const writes = calls.filter((call) => call.query.includes('addProductsToCart('));
      assert.equal(writes.length, 1);
      assert.deepEqual(writes[0].variables.cartItems.map((item) => item.sku), [pants, 'WKND-TRV-007']);
      const saved = await store.collection('carts').findOne({ id: cart.id });
      assert.equal(saved.items.find((item) => item.sku === pants).quantity, 3);
      assert.equal(saved.items.find((item) => item.sku === 'WKND-TRV-007').quantity, 1);
      assert.equal(saved.coupons.length, 0);
      assert.equal(await button.isDisabled(), true);
      assert.ok(!calls.some((call) => call.query.includes('wkndPromotionKits')));
    });
    await t.test('Commerce extension repeated SKU rows and duplicate selections', async () => {
      await reset(`${skuRows}<div><div>WKND-TRV-007</div></div>`);
      assert.equal(await block.locator('article').count(), 2);
      assert.deepEqual(await block.locator('article').evaluateAll((cards) => (
        cards.map((card) => card.dataset.sku)
      )), ['WKND-PNT-002', 'WKND-TRV-007']);
    });
    await t.test('unknown products and conflicting author fields fail visibly', async () => {
      await reset('<div><div>skus</div><div>WKND-TRV-007, MISSING-SKU</div></div>');
      assert.match(await block.getByRole('alert').textContent(), /MISSING-SKU/);
      assert.equal(await block.locator('button').count(), 0);
      await reset('<div><div>skus</div><div>WKND-TRV-007</div></div><div><div>promotion-id</div><div>prm_252c7a623a5a0e42ac91e565a5d04d8c</div></div>');
      assert.match(await block.getByRole('alert').textContent(), /not both/);
    });
    await t.test('unavailable products prevent a bulk addition', async () => {
      unavailable = true;
      await reset('<div><div>WKND-TRV-007</div></div>');
      assert.match(await block.textContent(), /This product is unavailable/);
      assert.equal(await button.isDisabled(), true);
      unavailable = false;
    });
    await t.test('failed and partial writes cannot produce success or automatic retry', async () => {
      const modes = ['error', 'partial'];
      for (let index = 0; index < modes.length; index += 1) {
        const mode = modes[index];
        await reset(skuRows);
        await selectPants();
        addMode = mode;
        const before = calls.filter((call) => call.query.includes('addProductsToCart(')).length;
        await button.click();
        assert.match(await block.getByRole('alert').textContent(), /Could not confirm all additions/);
        assert.equal(await button.isDisabled(), true);
        assert.equal(calls.filter((call) => call.query.includes('addProductsToCart(')).length, before + 1);
        assert.ok(!(await block.getByRole('alert').textContent()).includes('were added'));
      }
      addMode = 'normal';
    });
    await t.test('existing quantities alone are not proof of an addition', async () => {
      await page.evaluate(async () => {
        const { initProductSet, refineKitProduct } = await import('./blocks/product-kit/product-kit.js');
        const { CS_FETCH_GRAPHQL, getProductLink } = await import('./scripts/commerce.js');
        const { events } = await import('@dropins/tools/event-bus.js');
        const { getCartData } = await import('@dropins/storefront-cart/api.js');
        const fetchGraphQl = (...args) => CS_FETCH_GRAPHQL.fetchGraphQl(...args);
        await initProductSet(document.querySelector('.product-kit'), {
          skus: ['WKND-TRV-007'],
          events,
          fetchGraphQl,
          getProductLink,
          refineProduct: (sku, options) => refineKitProduct(fetchGraphQl, sku, options),
          getCart: getCartData,
          addProducts: getCartData,
        }).ready;
      });
      await button.click();
      assert.match(await block.getByRole('alert').textContent(), /did not confirm every selected product/);
      assert.equal(await button.isDisabled(), true);
    });
    await t.test('promotion mode still recognizes parents and adds only missing products', async () => {
      const id = 'prm_252c7a623a5a0e42ac91e565a5d04d8c';
      await store.collection('promotions').insertOne({
        _id: id,
        id,
        enabled: true,
        mode: 'automatic',
        name: 'Fixture merchandising kit',
        target: { kind: 'skus', values: ['WKND-PNT-002', 'WKND-TRV-007'] },
        discount: { kind: 'percentage', basisPoints: 2000 },
      });
      await reset(`<div><div>promotion-id</div><div>${id}</div></div>`);
      await page.evaluate(async () => {
        const { events } = await import('@dropins/tools/event-bus.js');
        const { getCartData } = await import('@dropins/storefront-cart/api.js');
        events.emit('cart/data', await getCartData());
      });
      const remaining = block.getByRole('button', { name: 'Add remaining products', exact: true });
      await page.waitForFunction(() => document.querySelector('.product-kit button, .product-kit [role="alert"]'));
      assert.equal(await block.getByRole('alert').count(), 0, await block.innerText());
      assert.equal(await remaining.isDisabled(), true);
      assert.match(await block.locator('[data-sku="WKND-PNT-002"]').textContent(), /Already in your cart/);
      assert.equal(await block.locator('select').count(), 0);
    });
    await t.test('a new guest can add a set without a cached cart', async () => {
      const guest = await browser.newPage();
      try {
        await guest.route('https://**/*', (route) => route.abort());
        await guest.goto(origin);
        await guest.evaluate(async () => {
          const element = document.querySelector('.product-kit');
          element.innerHTML = '<div><div>WKND-TRV-007</div></div><div><div>WKND-LGT-001</div></div>';
          const { default: decorate } = await import('./blocks/product-kit/product-kit.js');
          await decorate(element);
        });
        await guest.getByRole('button', { name: 'Add all to cart', exact: true }).click();
        await guest.waitForFunction(() => (
          document.querySelector('.product-kit__status').textContent.startsWith('Your selected products were added.')
          || document.querySelector('.product-kit [role="alert"]')
        ));
        assert.equal(
          await guest.locator('.product-kit [role="alert"]').count(),
          0,
          await guest.locator('.product-kit').innerText(),
        );
        const added = await guest.evaluate(async () => {
          const { getCartData } = await import('@dropins/storefront-cart/api.js');
          const result = await getCartData();
          return { id: result.id, skus: result.items.map((item) => item.sku) };
        });
        assert.notEqual(added.id, cart.id);
        assert.deepEqual(added.skus.sort(), ['WKND-LGT-001', 'WKND-TRV-007']);
      } finally {
        await guest.close();
      }
    });
    assert.deepEqual(pageErrors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => { server.close(resolve); });
  }
});
