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
        </body></html>`);
      return;
    }
    if (pathname === '/scripts/commerce.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(`export const checkIsAuthenticated = () => window.fixture.authenticated;
        export const CORE_FETCH_GRAPHQL = {
          fetchGraphQl: (...args) => window.fixture.request(...args),
        };`);
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
    const { default: initRecoveryOffer } = await import(moduleUrl);
    initRecoveryOffer(document.querySelector('#summary'), {
      events,
      pushShopEvent: (name, payload) => window.fixture.events.push({ name, payload }),
    });
  });
  return page;
}

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
  /* eslint-disable no-restricted-syntax, no-await-in-loop -- Sequential states share one cart DOM. */
  for (const [index, offer] of offers.entries()) {
    await page.evaluate(({ value, result }) => {
      window.fixture.response = { data: { wkndRecoveryOffer: result } };
      window.fixture.emit('cart/data', value);
    }, { value: { ...cart, items: [{ uid: 'fixture-item', quantity: index + 1 }] }, result: offer });
    await page.waitForFunction((count) => window.fixture.calls === count, index + 1);
    await page.evaluate(() => new Promise((done) => { requestAnimationFrame(done); }));
    assert.equal(await page.locator('.cart-recovery-offer').count(), 0);
  }
  /* eslint-enable no-restricted-syntax, no-await-in-loop */
});
