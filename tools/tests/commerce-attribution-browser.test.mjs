/* eslint-disable import/no-unresolved, import/no-absolute-path -- Browser server imports */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
// eslint-disable-next-line import/no-extraneous-dependencies -- Existing browser validation tooling
import { chromium } from 'playwright';

const root = new URL('../../', import.meta.url);
const bundleId = `bnd_${'a'.repeat(32)}`;

test('browser: real CMS cart content with local provider; raw receipt attribution and confirmation dedup', async () => {
  const content = await fetch('https://wknd-adventures.run.place/shop/cart.plain.html');
  assert.equal(content.status, 200);
  const html = await content.text();
  assert.ok(html.includes('commerce-cart'));
  assert.ok(html.includes('wknd-cart-addons'));
  const server = createServer(async (request, response) => {
    if (request.url === '/shop/cart' || request.url === '/shop/order') {
      response.setHeader('Content-Type', 'text/html');
      response.end(`<!doctype html><html><head>
        <meta name="analytics" content="off"><meta name="aam" content="off">
        <script type="importmap">{"imports":{
          "@dropins/tools/":"/scripts/__dropins__/tools/",
          "@dropins/storefront-cart/":"/scripts/__dropins__/storefront-cart/",
          "@dropins/storefront-order/":"/scripts/__dropins__/storefront-order/"
        }}</script>
        <link rel="stylesheet" href="/styles/styles.css">
        <link rel="stylesheet" href="/styles/commerce.css">
        <link rel="stylesheet" href="/blocks/commerce-cart/commerce-cart.css">
        </head><body class="appear"><main>${html}</main></body></html>`);
      return;
    }
    if (request.url === '/mock-graphql') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        data: {
          cart: {
            id: 'mock-cart',
            prices: { discounts: [{ wknd_bundle_id: bundleId, wknd_experiment_id: null }] },
          },
        },
      }));
      return;
    }
    if (request.url === '/mock-order') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        data: {
          placeOrder: {
            orderV2: {
              number: 'mock-receipt',
              total: { discounts: [{ wknd_bundle_id: bundleId, wknd_experiment_id: 'receipt_test' }] },
            },
          },
        },
      }));
      return;
    }
    try {
      const file = new URL(`.${request.url}`, root);
      if (!file.href.startsWith(root.href)) {
        response.writeHead(403).end();
        return;
      }
      response.setHeader('Content-Type', file.pathname.endsWith('.js') ? 'text/javascript' : 'text/css');
      response.end(await readFile(file));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const errors = [];
  try {
    const page = await browser.newPage();
    const requests = [];
    page.on('request', (request) => requests.push(new URL(request.url()).pathname));
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {
        await route.fulfill({ status: 204, body: '' });
        return;
      }
      const path = url.pathname;
      if (path === '/scripts/commerce.js' && !url.searchParams.has('off-probe')) {
        await route.fulfill({
          contentType: 'text/javascript', body: `
          export async function initializeCommerce() {}
          export const getProductLink = key => '/shop/products/' + key;
          export const checkIsAuthenticated = () => false;
          export const CORE_FETCH_GRAPHQL = {};`,
        });
      } else if (path === '/scripts/commerce-config.js') {
        const response = await route.fetch();
        const body = (await response.text()).replace(
          'export const BUNDLE_ATTRIBUTION_READY = true;',
          'export const BUNDLE_ATTRIBUTION_READY = false;',
        );
        await route.fulfill({ response, body });
      } else if (path === '/scripts/initializers/cart.js') {
        await route.fulfill({ contentType: 'text/javascript', body: 'export {};' });
      } else if (path === '/scripts/__dropins__/tools/lib/aem/assets.js') {
        await route.fulfill({
          contentType: 'text/javascript',
          body: `export function tryRenderAemAssetsImage() {}
            export const isAemAssetsEnabled = () => false;`,
        });
      } else if (path === '/scripts/__dropins__/storefront-cart/render.js') {
        await route.fulfill({
          contentType: 'text/javascript', body: `
          export const render = { render: component => target => {
            if (component === 'CartSummaryList') target.textContent = 'Your cart is empty';
            else target.textContent = 'Local provider';
            return Promise.resolve();
          } };`,
        });
      } else if (path.startsWith('/scripts/__dropins__/storefront-cart/containers/')) {
        const name = path.split('/').pop().replace('.js', '');
        await route.fulfill({ contentType: 'text/javascript', body: `export default '${name}';` });
      } else {
        await route.continue();
      }
    });
    await page.goto(`${origin}/shop/cart`);
    const offProbe = await page.evaluate(async () => {
      window.hlx = {};
      const { BUNDLE_ATTRIBUTION_READY } = await import('/scripts/commerce-config.js');
      const { configureCommerce } = await import('/scripts/commerce.js?off-probe');
      configureCommerce();
      return BUNDLE_ATTRIBUTION_READY;
    });
    assert.equal(offProbe, false);
    assert.equal(requests.some((path) => path.includes('/storefront-order/')
      || path.includes('/storefront-checkout/')
      || path.endsWith('/storefront-cart/fragments.js')), false);
    const result = await page.evaluate(async () => {
      window.hlx = {};
      const { default: decorateCart } = await import('/blocks/commerce-cart/commerce-cart.js');
      const cart = document.querySelector('.commerce-cart');
      cart.classList.add('block');
      await decorateCart(cart);
      const { events } = await import('/scripts/__dropins__/tools/event-bus.js');
      const { FetchGraphQL } = await import('/scripts/__dropins__/tools/fetch-graphql.js');
      const { CART_FRAGMENT } = await import('/scripts/__dropins__/storefront-cart/fragments.js');
      const { ORDER_SUMMARY_FRAGMENT } = await import('/scripts/__dropins__/storefront-order/fragments.js');
      const attribution = await import('/scripts/commerce-attribution.js');
      const analytics = await import('/scripts/shop-analytics.js');
      const api = new FetchGraphQL();
      api.setEndpoint(`${window.location.origin}/mock-graphql`);
      attribution.installBundleAttribution(api, {
        enabled: true,
      });
      await analytics.startShopAnalytics();
      const emit = async (name, payload) => new Promise((resolve) => {
        const subscription = events.on(name, () => {
          subscription.off();
          setTimeout(resolve, 0);
        });
        events.emit(name, payload);
      });
      await api.fetchGraphQl(`query { cart { ...CART_FRAGMENT } } ${CART_FRAGMENT}`, { method: 'POST' });
      await emit('cart/data', { id: 'mock-cart', totalQuantity: 0, items: [] });
      const offHits = window.adobeDataLayer?.length || 0;
      document.querySelector('meta[name="analytics"]').content = 'on';
      await emit('cart/product/added', [{ sku: 'MOCK-SKU', quantity: 1 }]);
      const cartHit = window.adobeDataLayer.at(-1);
      // The owned mock endpoint returns a receipt; no real order mutation is sent.
      api.setEndpoint(`${window.location.origin}/mock-order`);
      await api.fetchGraphQl(ORDER_SUMMARY_FRAGMENT, { method: 'POST' });
      await emit('order/placed', { number: 'mock-receipt', grandTotal: { value: 12 }, items: [] });
      const pending = JSON.parse(sessionStorage.getItem('wknd:shop:pendingPurchase'));
      return {
        offHits,
        cartBundles: cartHit.data.wkndShop.bundles,
        purchaseBundles: pending.data.bundles || null,
        purchaseBeforeRedirect: window.adobeDataLayer.filter((hit) => hit.event === 'shopPurchase').length,
      };
    });
    assert.equal(result.offHits, 0);
    assert.deepEqual(result.cartBundles, [{ bundle_id: bundleId, experiment_id: null }]);
    assert.deepEqual(
      result.purchaseBundles,
      [{ bundle_id: bundleId, experiment_id: 'receipt_test' }],
    );
    assert.equal(result.purchaseBeforeRedirect, 0);
    await page.getByText('Your cart is empty', { exact: true }).waitFor();
    /* eslint-disable no-restricted-syntax, no-await-in-loop -- Viewports share one browser page */
    for (const width of [375, 768, 1200]) {
      await page.setViewportSize({ width, height: 800 });
      assert.equal(await page.locator('.cart__order-summary').isVisible(), false);
      if (process.env.TMPDIR) {
        await page.screenshot({ path: `${process.env.TMPDIR}/bundle-cart-${width}.png`, fullPage: true });
      }
      /* eslint-enable no-restricted-syntax, no-await-in-loop */
    }
    await page.goto(`${origin}/shop/order`);
    const flushed = await page.evaluate(async () => {
      document.querySelector('meta[name="analytics"]').content = 'on';
      const { startShopAnalytics } = await import('/scripts/shop-analytics.js');
      await startShopAnalytics();
      await startShopAnalytics();
      return {
        purchases: window.adobeDataLayer.filter((hit) => hit.event === 'shopPurchase').length,
        pending: sessionStorage.getItem('wknd:shop:pendingPurchase'),
      };
    });
    assert.deepEqual(flushed, { purchases: 1, pending: null });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => { server.close(resolve); });
  }
});
