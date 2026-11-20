#!/usr/bin/env node
/* eslint-env node, es2021 */
/* eslint-disable import/extensions, max-len, no-console, no-restricted-syntax, no-await-in-loop -- isolated sequential browser test */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright'; // eslint-disable-line import/no-extraneous-dependencies
import bookingAuthFixture from './lib/booking-auth-fixture.mjs';
import loadTestAeroWorker from './lib/load-test-aero-worker.mjs';

const auth = await bookingAuthFixture();
const worker = await loadTestAeroWorker();
const values = new Map();
const env = {
  ...auth.env,
  WKND_AERO_CATALOG: {
    put: async (key, value) => values.set(key, value),
    get: async (key, type) => {
      const value = values.get(key);
      return value && type === 'json' ? JSON.parse(value) : value || null;
    },
  },
};
const root = resolve('.');
const head = await readFile(resolve(root, 'head.html'), 'utf8');
const importMap = head.match(/<script[^>]*type="importmap"[^>]*>([\s\S]*?)<\/script>/)?.[1];
assert(importMap, 'The shared page head must provide the booking and Commerce import map');
values.set('catalog:adventures:patagonia-trek', JSON.stringify({
  sku: 'patagonia-trek', name: 'Patagonia trek',
}));
const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/__checkout-test') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
      <link rel="stylesheet" href="/styles/styles.css">
      <meta name="aero-api" content="https://worker.test">
      <link rel="stylesheet" href="/blocks/aero/aero-header/aero-header.css">
      <link rel="stylesheet" href="/blocks/aero/booking-journey/booking-journey.css">
      <script type="importmap">${importMap}</script>
      </head><body class="appear"><header><div class="aero-header"></div></header>
      <main><div class="booking-journey"><div id="mount"></div></div></main>
      <script type="module">
        import header from '/blocks/aero/aero-header/aero-header.js';
        import decorate from '/blocks/aero/booking-journey/booking-journey.js';
        await header(document.querySelector('.aero-header'));
        await decorate(document.querySelector('.booking-journey'));
      </script></body></html>`);
    return;
  }
  if (pathname === '/nav.plain.html') {
    res.setHeader('Content-Type', 'text/html');
    res.end('<div><a href="/">WKND AERO</a><a href="/book/flights">BOOK</a>'
      + '<a href="/book/flights">FLIGHT STATUS</a><a href="/sign-in">SIGN IN</a></div>');
    return;
  }
  const path = resolve(root, `.${pathname}`);
  if (!path.startsWith(`${root}/`)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const file = await readFile(path);
    res.setHeader('Content-Type', extname(path) === '.css' ? 'text/css' : 'text/javascript');
    res.end(file);
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'EISDIR') console.error(error);
    res.writeHead(404).end();
  }
});
await new Promise((done) => { server.listen(0, '127.0.0.1', done); });
const base = `http://127.0.0.1:${server.address().port}`;
let browser;

try {
  browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const token = await auth.token();
  const checkoutUrl = `${base}/__checkout-test?origin=MEL&dest=PUQ&adv=patagonia-trek&depart=2026-12-01&passengers=1`;
  let gearFailure = false;
  let gearEmpty = false;
  let gearRequests = 0;
  await context.route('https://edge-graph.adobe.io/**', async (route) => {
    gearRequests += 1;
    const url = new URL(route.request().url());
    assert.deepEqual(JSON.parse(url.searchParams.get('variables')), {
      filter: [{ attribute: 'adventure', in: ['patagonia-trek'] }],
    });
    assert(!url.href.includes('private'));
    assert(!url.href.includes('BK_'));
    if (gearFailure) return route.fulfill({ status: 503 });
    return route.fulfill({
      json: {
        data: {
          productSearch: {
            items: gearEmpty ? [] : [{
              productView: {
                sku: 'WKND-JKT-001',
                name: 'Alpine Shell Jacket',
                urlKey: 'alpine-shell-jacket',
                inStock: true,
                images: [],
                priceRange: { minimum: { final: { amount: { value: 449, currency: 'AUD' } } } },
              },
            }],
          },
        },
      },
    });
  });
  let posts = 0;
  let catalogRequests = 0;
  let booking;
  await context.route('https://worker.test/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization,content-type',
          'Access-Control-Allow-Methods': 'GET,POST',
        },
      });
    }
    if (new URL(req.url()).pathname === '/catalog/adventures/index.json') {
      catalogRequests += 1;
      return route.fulfill({
        headers: { 'Access-Control-Allow-Origin': '*' },
        json: { data: [{ sku: 'patagonia-trek', destinationIata: 'PUQ' }] },
      });
    }
    if (new URL(req.url()).pathname === '/api/bookings') posts += 1;
    const response = await worker.fetch(new Request(req.url(), {
      method: req.method(), headers: req.headers(), body: req.postData() || undefined,
    }), env);
    const body = await response.text();
    if (response.status === 201) booking = JSON.parse(body);
    return route.fulfill({
      status: response.status,
      headers: { ...Object.fromEntries(response.headers), 'Access-Control-Allow-Origin': '*' },
      body,
    });
  });
  await context.route('https://cdn.auth0.com/js/auth0-spa-js/**', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `window.auth0={Auth0Client:class {
      constructor(config){window.testAuthConfig=config;}
      async checkSession(){if(window.testRestoreSession)window.testSignedIn=true;}
      async isAuthenticated(){return !!window.testSignedIn;}
      async loginWithPopup(_,options){
        if(window.testCancelLogin) throw {error:window.testCancelLogin};
        options.popup.close(); window.testSignedIn=true;
      }
      async logout(options){
        if(window.testLogoutFailure)throw {error:'network_error'};
        window.testLogoutConfig=options;window.testSignedIn=false;
      }
      async getTokenSilently(){
        if(window.testExpiredSession)throw {error:'login_required'};
        return ${JSON.stringify(token)};
      }
    }};`,
  }));
  await page.goto(checkoutUrl);
  assert.equal(gearRequests, 0, 'No product request before a flight is selected');
  gearFailure = true;
  await page.locator('.flight-card button').first().click();
  const gear = page.getByRole('region', { name: 'Recommended adventure gear' });
  await gear.getByRole('alert').waitFor();
  gearFailure = false;
  gearEmpty = true;
  await gear.getByRole('button', { name: 'Retry gear recommendations' }).click();
  await gear.getByRole('status').filter({ hasText: 'No matching gear' }).waitFor();
  gearEmpty = false;
  await page.reload();
  await page.locator('.flight-card button').first().click();
  await gear.getByRole('heading', { name: 'Alpine Shell Jacket' }).waitFor();
  const product = gear.getByRole('link', { name: /Alpine Shell Jacket/ });
  assert.equal(await product.getAttribute('href'), 'https://wknd-adventures.run.place/shop/products/alpine-shell-jacket');
  assert.equal(await product.getAttribute('target'), '_blank');
  assert.equal(await product.getAttribute('rel'), 'noopener noreferrer');
  assert((await gear.innerText()).includes('From $449.00'));
  await page.getByRole('button', { name: 'Seat 2A', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('First name', { exact: true }).fill('Test');
  await page.getByLabel('Last name', { exact: true }).fill('Customer');
  await page.getByLabel('Email', { exact: true }).fill('private@example.test');
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await page.getByRole('tab', { name: /PayPal/ }).click();
  const complete = page.getByRole('button', { name: 'Complete booking', exact: false });
  assert(await complete.isDisabled());
  assert.equal(posts, 0);
  await page.evaluate(() => { window.testCancelLogin = 'cancelled'; });
  await page.getByRole('button', { name: 'Sign in to book', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'cancelled' }).waitFor();
  assert(await complete.isDisabled());
  assert.equal(posts, 0);
  await page.evaluate(() => { window.testCancelLogin = false; });
  await page.getByRole('button', { name: 'Sign in to book', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Signed in to WKND' }).waitFor();
  assert((await page.locator('.booking-flight-summary').innerText()).includes('2A'));
  assert(!(await complete.isDisabled()));
  const header = page.locator('.aero-header');
  await header.getByRole('button', { name: 'SIGN OUT', exact: true }).waitFor();
  await page.evaluate(() => { window.testLogoutFailure = true; });
  await header.getByRole('button', { name: 'SIGN OUT', exact: true }).click();
  await header.getByRole('alert').filter({ hasText: 'Unable to update sign-in' }).waitFor();
  assert(!(await complete.isDisabled()), 'Failed logout must not falsely clear the session');
  await page.evaluate(() => { window.testLogoutFailure = false; });
  await header.getByRole('button', { name: 'SIGN OUT', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in to book', exact: true }).waitFor();
  assert(await complete.isDisabled());
  assert.equal((await page.evaluate(() => window.testLogoutConfig)).logoutParams.returnTo, base);
  await page.evaluate(() => { window.testCancelLogin = 'popup_closed'; });
  await header.getByRole('button', { name: 'SIGN IN', exact: true }).click();
  await header.getByRole('alert').filter({ hasText: 'cancelled' }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/__checkout-test', 'Sign-in must not navigate to the missing /sign-in page');
  assert(await complete.isDisabled());
  await page.evaluate(() => { window.testCancelLogin = false; });
  await header.getByRole('button', { name: 'SIGN IN', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Signed in to WKND' }).waitFor();
  assert(!(await complete.isDisabled()));
  await page.evaluate(() => { window.testExpiredSession = true; });
  await complete.click();
  await header.getByRole('button', { name: 'SIGN IN', exact: true }).waitFor();
  assert(await complete.isDisabled());
  assert.equal(posts, 0);
  await page.evaluate(() => { window.testExpiredSession = false; });
  await header.getByRole('button', { name: 'SIGN IN', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Signed in to WKND' }).waitFor();
  assert.equal(await page.locator('.booking-journey [role="alert"]:visible').count(), 0, 'Reauthentication must clear the stale checkout sign-in error');
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    if (width < 900) {
      await header.getByRole('button', { name: 'Open navigation', exact: true }).click();
      assert(await header.getByRole('button', { name: 'SIGN OUT', exact: true }).isVisible());
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Checkout overflow at ${width}px`);
    if (process.argv[2]) {
      await page.screenshot({ path: `${process.argv[2]}/booking-checkout-${width}.png`, fullPage: true });
    }
    if (width < 900) {
      await header.getByRole('button', { name: 'Close navigation', exact: true }).click();
    }
  }
  const config = await page.evaluate(() => window.testAuthConfig);
  assert.equal(config.cacheLocation, 'memory');
  assert.equal(config.authorizationParams.audience, auth.env.BOOKING_API_AUDIENCE);
  values.forEach((value, key) => {
    if (key.startsWith('flight-quote:')) {
      const flights = JSON.parse(value).map((flight) => ({ ...flight, expiresAt: Date.now() - 1 }));
      values.set(key, JSON.stringify(flights));
    }
  });
  await complete.click();
  await page.getByRole('alert').filter({ hasText: 'fare has expired' }).waitFor();
  assert(await complete.isDisabled());
  await page.getByRole('button', { name: 'Search for a new fare', exact: true }).click();
  await page.locator('.flight-card button').first().click();
  await page.getByRole('button', { name: 'Seat 2A', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  assert.equal(await page.getByLabel('Email', { exact: true }).inputValue(), 'private@example.test');
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await complete.click();
  await page.getByRole('heading', { name: 'Demo booking confirmed' }).waitFor();
  await gear.getByRole('heading', { name: 'Gear up for your booked adventure' }).waitFor();
  await gear.getByRole('heading', { name: 'Alpine Shell Jacket' }).waitFor();
  assert.equal(posts, 2);
  assert.equal(booking.seats[0], '2A');
  assert.equal(booking.flight.origin, 'MEL');
  const stored = await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }));
  assert(!stored.includes(token));
  assert(!stored.includes('private@example.test'));
  const restored = await context.newPage();
  await restored.addInitScript(() => { window.testRestoreSession = true; });
  await restored.goto(checkoutUrl.replace('&adv=patagonia-trek', ''));
  await restored.locator('.aero-header').getByRole('button', { name: 'SIGN OUT', exact: true }).waitFor();
  await restored.locator('.flight-card button').first().click();
  await restored.getByRole('region', { name: 'Recommended adventure gear' })
    .getByRole('heading', { name: 'Alpine Shell Jacket' }).waitFor();
  assert(catalogRequests > 0, 'Direct flight bookings must resolve gear using destination catalog tags');
  await restored.getByRole('button', { name: 'Seat 2A', exact: true }).click();
  await restored.getByRole('button', { name: 'Continue', exact: true }).click();
  await restored.getByLabel('First name', { exact: true }).fill('Restored');
  await restored.getByLabel('Last name', { exact: true }).fill('Customer');
  await restored.getByLabel('Email', { exact: true }).fill('restored@example.test');
  await restored.getByRole('button', { name: 'Continue to payment' }).click();
  await restored.getByRole('status').filter({ hasText: 'Signed in to WKND' }).waitFor();
  assert.equal(await restored.getByRole('button', { name: 'Sign in to book', exact: true }).count(), 0);
  await restored.close();
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS shared-head booking bootstrap; synchronized login/logout, cancellation, expiry, SSO restoration, preserved selections, authenticated confirmation; adventure-tagged shopping, failure/retry/empty states, canonical product links, confirmed and in-progress recommendations; responsive memory-only checkout');
} finally {
  if (browser) await browser.close();
  await new Promise((done) => { server.close(done); });
  auth.restore();
}
