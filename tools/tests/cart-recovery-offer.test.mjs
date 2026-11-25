import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
// eslint-disable-next-line import/no-extraneous-dependencies -- Existing browser validation tooling
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const cart = { id: 'fixture-cart', totalQuantity: 1, items: [{ uid: 'fixture-item', quantity: 1 }] };
const eligible = {
  status: 'ELIGIBLE',
  coupon_code: 'FIXTURE_RECOVERY',
  percent_off: 10,
  max_discount: { value: 25 },
  saving: { value: 20 },
  current_saving: { value: 0 },
};

async function setup(t) {
  const server = createServer(async (request, response) => {
    const { pathname } = new URL(request.url, 'http://localhost');
    if (pathname === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end(`<!doctype html><html><body>
        <main><div class="commerce-cart"><div id="summary">Cart available</div></div></main>
        <script type="importmap">{"imports":{
          "@dropins/tools/event-bus.js":"/fixtures/events.js",
          "@dropins/tools/lib.js":"/fixtures/lib.js"
        }}</script>
        </body></html>`);
      return;
    }
    if (pathname === '/scripts/commerce.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(`export const checkIsAuthenticated = () => window.fixture.authenticated;
        export const CORE_FETCH_GRAPHQL = {
          fetchGraphQl: (...args) => window.fixture.request(...args),
          setFetchGraphQlHeader: () => {},
          removeFetchGraphQlHeader: () => {},
        };`);
      return;
    }
    const fixtures = {
      '/fixtures/events.js': 'export const events = window.fixture.eventBus;',
      '/fixtures/lib.js': `export const getCookie = () => (
        window.fixture.authenticated ? 'fixture-user-token' : undefined);`,
      '/scripts/commerce-utils.js': `export {
        CORE_FETCH_GRAPHQL, checkIsAuthenticated,
      } from "./commerce.js";`,
      '/scripts/commerce-config.js': 'export const SHOP_PATHS = { cart: "/shop/cart" };',
      '/scripts/shop-auth.js': 'export const syncShopSession = () => {};',
      '/scripts/shop-analytics.js': 'export const startShopAnalytics = () => {};',
      '/scripts/initializers/auth.js': 'await window.fixture.waitForAuth();',
      '/scripts/initializers/cart.js': 'await window.fixture.loadCart();',
    };
    if (fixtures[pathname]) {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(fixtures[pathname]);
      return;
    }
    const file = resolve(root, `.${pathname}`);
    if (!file.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(await readFile(file));
    } catch (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
    }
  });
  await new Promise((done) => { server.listen(0, '127.0.0.1', done); });
  t.after(() => new Promise((done) => { server.close(done); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.route('**/*', (route) => (route.request().url().startsWith(`${origin}/`)
    ? route.continue() : route.abort()));
  await page.goto(origin);
  await page.evaluate(async () => {
    const handlers = new Map();
    window.fixture = {
      authenticated: true,
      calls: 0,
      response: null,
      events: [],
      request: async () => {
        window.fixture.calls += 1;
        return window.fixture.response;
      },
      emit: (event, value) => (handlers.get(event) || []).forEach((handler) => handler(value)),
    };
    const events = {
      on: (event, handler) => {
        if (!handlers.has(event)) handlers.set(event, []);
        handlers.get(event).push(handler);
      },
    };
    const moduleUrl = '/blocks/commerce-cart/recovery-offer.js';
    const { default: initRecoveryOffer, prefetchRecoveryOffer } = await import(moduleUrl);
    window.fixture.prefetch = () => prefetchRecoveryOffer({ events });
    window.fixture.eventBus = events;
    initRecoveryOffer(document.querySelector('#summary'), {
      events,
      pushShopEvent: (name, payload) => window.fixture.events.push({ name, payload }),
    });
  });
  return page;
}

async function startPrefetch(page) {
  await page.evaluate(() => {
    const { request } = window.fixture;
    window.fixture.request = (query, ...args) => {
      if (!query.includes('query WkndCustomerRecoveryOffer')) return request(query, ...args);
      window.fixture.calls += 1;
      return new Promise((done) => { window.fixture.complete = done; });
    };
    window.fixture.prefetch();
  });
}

const customerReply = (value = cart, offer = eligible) => ({
  data: {
    wkndCustomerRecoveryOffer: {
      cart_id: value.id,
      items: value.items,
      applied_coupon_codes: (value.appliedCoupons || []).map(({ code }) => code),
      offer,
    },
  },
});

['offer first', 'cart first'].forEach((order) => {
  test(`initial recovery overlaps actual cart initialization after auth: ${order}`, async (t) => {
    const page = await setup(t);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.evaluate(() => {
      window.history.replaceState(null, '', '/shop/cart');
      window.fixture.waitForAuth = () => new Promise((done) => {
        window.fixture.completeAuth = done;
      });
      window.fixture.loadCart = () => {
        window.fixture.cartStarted = true;
        return new Promise((done) => {
          window.fixture.completeCart = (value) => {
            window.fixture.emit('cart/data', value);
            done();
          };
        });
      };
      window.fixture.request = () => {
        window.fixture.calls += 1;
        return new Promise((done) => { window.fixture.complete = done; });
      };
      const url = '/scripts/initializers/index.js';
      window.fixture.initializing = import(url).then(({ default: initialize }) => initialize());
    });
    await page.waitForFunction(() => Boolean(window.fixture.completeAuth));
    assert.equal(await page.evaluate(() => window.fixture.calls), 0);
    assert.equal(await page.evaluate(() => Boolean(window.fixture.cartStarted)), false);
    await page.evaluate(() => window.fixture.completeAuth());
    await page.waitForFunction(() => window.fixture.calls === 1 && window.fixture.cartStarted);
    if (order === 'offer first') {
      await page.evaluate((reply) => window.fixture.complete(reply), customerReply());
    } else {
      await page.evaluate((value) => window.fixture.completeCart(value), cart);
    }
    assert.equal(await page.locator('.cart-recovery-offer').count(), 0);
    assert.equal(await page.locator('#summary').innerText(), 'Cart available');
    if (order === 'offer first') {
      await page.evaluate((value) => window.fixture.completeCart(value), cart);
    } else {
      await page.evaluate((reply) => window.fixture.complete(reply), customerReply());
    }
    await page.getByRole('button', { name: 'Apply this offer' }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.calls), 1);
    assert.deepEqual(errors, []);
  });
});

test('prefetched snapshot comparison ignores item and coupon ordering', async (t) => {
  const page = await setup(t);
  const value = {
    ...cart,
    items: [...cart.items, { uid: 'another-item', quantity: 2 }],
    appliedCoupons: [{ code: 'SECOND' }, { code: 'FIRST' }],
  };
  await startPrefetch(page);
  const reply = customerReply(value);
  reply.data.wkndCustomerRecoveryOffer.items.reverse();
  reply.data.wkndCustomerRecoveryOffer.applied_coupon_codes.reverse();
  await page.evaluate(({ current, response }) => {
    window.fixture.emit('cart/data', current);
    window.fixture.complete(response);
  }, { current: value, response: reply });
  await page.getByRole('button', { name: 'Apply this offer' }).waitFor();
  assert.equal(await page.evaluate(() => window.fixture.calls), 1);
});

['cart', 'quantity', 'coupon', 'no existing cart'].forEach((change) => {
  test(`mismatched initial recovery snapshot is not reused: ${change}`, async (t) => {
    const page = await setup(t);
    await startPrefetch(page);
    const reply = customerReply();
    const snapshot = reply.data.wkndCustomerRecoveryOffer;
    if (change === 'cart') snapshot.cart_id = 'old-cart';
    if (change === 'quantity') snapshot.items = [{ ...cart.items[0], quantity: 2 }];
    if (change === 'coupon') snapshot.applied_coupon_codes = ['OLD'];
    if (change === 'no existing cart') reply.data.wkndCustomerRecoveryOffer = null;
    await page.evaluate(({ value, response }) => {
      window.fixture.response = {
        data: { wkndRecoveryOffer: { status: 'INELIGIBLE' } },
      };
      window.fixture.emit('cart/data', value);
      window.fixture.complete(response);
    }, { value: cart, response: reply });
    await page.waitForFunction(() => window.fixture.calls === 2);
    assert.equal(await page.locator('.cart-recovery-offer').count(), 0);
  });
});

test('failed initial recovery is visible and retries without claiming', async (t) => {
  const page = await setup(t);
  await startPrefetch(page);
  await page.evaluate((value) => {
    window.fixture.emit('cart/data', value);
    window.fixture.complete({ errors: [{ message: 'Fixture prefetch failure' }] });
  }, cart);
  await page.getByRole('button', { name: 'Retry offer check' }).waitFor();
  assert.equal(await page.evaluate(() => window.fixture.calls), 1);
  await page.evaluate((offer) => {
    window.fixture.response = { data: { wkndRecoveryOffer: offer } };
  }, eligible);
  await page.getByRole('button', { name: 'Retry offer check' }).click();
  await page.getByRole('button', { name: 'Apply this offer' }).waitFor();
  assert.equal(await page.evaluate(() => window.fixture.calls), 2);
});

test('unused initial recovery cannot cross a sign-out and sign-in boundary', async (t) => {
  const page = await setup(t);
  await startPrefetch(page);
  await page.evaluate(({ value, response }) => {
    window.fixture.authenticated = false;
    window.fixture.emit('authenticated', false);
    window.fixture.authenticated = true;
    window.fixture.emit('authenticated', true);
    window.fixture.response = { data: { wkndRecoveryOffer: { status: 'INELIGIBLE' } } };
    window.fixture.emit('cart/data', value);
    window.fixture.complete(response);
  }, { value: cart, response: customerReply() });
  await page.waitForFunction(() => window.fixture.calls === 2);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(done)));
  assert.equal(await page.locator('.cart-recovery-offer').count(), 0);
});

test('a newer cart edit invalidates an initial recovery reply already being awaited', async (t) => {
  const page = await setup(t);
  await startPrefetch(page);
  await page.evaluate(({ value, response }) => {
    window.fixture.emit('cart/data', value);
    window.fixture.response = { data: { wkndRecoveryOffer: { status: 'INELIGIBLE' } } };
    window.fixture.emit('cart/data', {
      ...value, items: [{ ...value.items[0], quantity: 2 }],
    });
    window.fixture.complete(response);
  }, { value: cart, response: customerReply() });
  await page.waitForFunction(() => window.fixture.calls === 2);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(done)));
  assert.equal(await page.locator('.cart-recovery-offer').count(), 0);
});

test('failed recovery checks are visible and retry the same cart without claiming an offer', async (t) => {
  const page = await setup(t);
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.evaluate((value) => {
    window.fixture.response = { errors: [{ message: 'Fixture service failure' }] };
    window.fixture.emit('cart/data', value);
  }, cart);
  await page.getByRole('button', { name: 'Retry offer check' }).waitFor({ timeout: 2000 });
  assert.match(await page.getByRole('status').innerText(), /couldn't check/);
  assert.equal(errors.length, 1);
  await page.evaluate((offer) => {
    window.fixture.response = { data: { wkndRecoveryOffer: offer } };
  }, eligible);
  await page.getByRole('button', { name: 'Retry offer check' }).click();
  await page.getByRole('button', { name: 'Apply this offer' }).waitFor();
  assert.equal(await page.evaluate(() => window.fixture.calls), 2);
  await page.evaluate((value) => { window.fixture.emit('cart/data', value); }, cart);
  assert.equal(await page.evaluate(() => window.fixture.calls), 2);
  assert.equal(await page.locator('#summary').innerText(), 'Cart available');
});

['empty cart', 'sign-out'].forEach((invalidation) => {
  test(`a pending recovery reply cannot reappear after ${invalidation}`, async (t) => {
    const page = await setup(t);
    await page.evaluate((value) => {
      window.fixture.request = () => {
        window.fixture.calls += 1;
        return new Promise((done) => { window.fixture.complete = done; });
      };
      window.fixture.emit('cart/data', value);
    }, cart);
    await page.waitForFunction(() => window.fixture.calls === 1);
    await page.evaluate(({ action, offer }) => {
      if (action === 'empty cart') window.fixture.emit('cart/data', null);
      else {
        window.fixture.authenticated = false;
        window.fixture.emit('authenticated', false);
      }
      window.fixture.complete({ data: { wkndRecoveryOffer: offer } });
    }, { action: invalidation, offer: eligible });
    await page.evaluate(() => new Promise((done) => {
      requestAnimationFrame(() => requestAnimationFrame(done));
    }));
    assert.equal(await page.locator('.cart-recovery-offer').count(), 0);
  });
});

test('ineligible or inferior recovery offers remain hidden', async (t) => {
  const page = await setup(t);
  const offers = [
    { ...eligible, status: 'INELIGIBLE' },
    { ...eligible, status: 'REDEEMED' },
    { ...eligible, status: 'UNAVAILABLE' },
    { ...eligible, current_saving: { value: 25 } },
  ];
  /* eslint-disable no-restricted-syntax, no-await-in-loop -- Shared cart DOM. */
  for (const [index, offer] of offers.entries()) {
    await page.evaluate(({ value, result }) => {
      window.fixture.response = { data: { wkndRecoveryOffer: result } };
      window.fixture.emit('cart/data', value);
    }, {
      value: { ...cart, items: [{ uid: 'fixture-item', quantity: index + 1 }] },
      result: offer,
    });
    await page.waitForFunction((count) => window.fixture.calls === count, index + 1);
    await page.evaluate(() => new Promise((done) => { requestAnimationFrame(done); }));
    assert.equal(await page.locator('.cart-recovery-offer').count(), 0);
  }
  /* eslint-enable no-restricted-syntax, no-await-in-loop */
});
