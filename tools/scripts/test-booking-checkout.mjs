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
const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/__checkout-test') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
      <link rel="stylesheet" href="/styles/styles.css">
      <link rel="stylesheet" href="/blocks/aero/booking-journey/booking-journey.css">
      <script type="importmap">{"imports":{"preact":"https://esm.sh/preact@10.24.3","preact/hooks":"https://esm.sh/preact@10.24.3/hooks"}}</script>
      </head><body class="appear"><main><div class="booking-journey"><div id="mount"></div></div></main>
      <script type="module">
        import init from '/blocks/aero/booking-journey/app/index.js';
        const mount=document.querySelector('#mount');
        Object.assign(mount.dataset,{api:'https://worker.test',origin:'MEL',dest:'PUQ',depart:'2026-12-01',passengers:'1'});
        init(mount);
      </script></body></html>`);
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
  let posts = 0;
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
      async loginWithPopup(_,options){
        if(window.testCancelLogin) throw {error:'popup_closed'};
        options.popup.close(); window.testSignedIn=true;
      }
      async getTokenSilently(){return ${JSON.stringify(token)};}
    }};`,
  }));
  await page.goto(`${base}/__checkout-test`);
  await page.locator('.flight-card button').first().click();
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
  await page.evaluate(() => { window.testCancelLogin = true; });
  await page.getByRole('button', { name: 'Sign in to book', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'cancelled' }).waitFor();
  assert(await complete.isDisabled());
  assert.equal(posts, 0);
  await page.evaluate(() => { window.testCancelLogin = false; });
  await page.getByRole('button', { name: 'Sign in to book', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Signed in to WKND' }).waitFor();
  assert((await page.locator('.booking-flight-summary').innerText()).includes('2A'));
  assert(!(await complete.isDisabled()));
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Checkout overflow at ${width}px`);
    if (process.argv[2]) {
      await page.screenshot({ path: `${process.argv[2]}/booking-checkout-${width}.png`, fullPage: true });
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
  assert.equal(posts, 2);
  assert.equal(booking.seats[0], '2A');
  assert.equal(booking.flight.origin, 'MEL');
  const stored = await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }));
  assert(!stored.includes(token));
  assert(!stored.includes('private@example.test'));
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS popup cancellation/retry, preserved checkout selections, authenticated confirmation, memory-only credentials and responsive checkout');
} finally {
  if (browser) await browser.close();
  await new Promise((done) => { server.close(done); });
  auth.restore();
}
