/* eslint-disable no-restricted-syntax, no-await-in-loop -- sequential browser assertions */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { chromium } from 'playwright'; // eslint-disable-line import/no-extraneous-dependencies

test('flight offer uses verified Commerce responses and a separate Shop sign-in', async () => {
  const head = await readFile(new URL('../../head.html', import.meta.url), 'utf8');
  const importMap = head.match(/<script[^>]*type="importmap"[^>]*>([\s\S]*?)<\/script>/)[1];
  const server = createServer(async (req, res) => {
    if (req.url === '/favicon.ico') {
      res.writeHead(204).end();
      return;
    }
    const files = {
      '/offer.js': '../../blocks/commerce-cart/aero-offer.js',
      '/scripts/commerce-config.js': '../../scripts/commerce-config.js',
      '/scripts/aero-flight-offer.js': '../../scripts/aero-flight-offer.js',
      '/cart.css': '../../blocks/commerce-cart/commerce-cart.css',
      '/booking.css': '../../blocks/aero/booking-journey/booking-journey.css',
      '/styles/styles.css': '../../styles/styles.css',
      '/styles/brand.css': '../../styles/brand.css',
      '/blocks/aero/booking-journey/app/flight-offer.js':
        '../../blocks/aero/booking-journey/app/flight-offer.js',
    };
    if (req.url === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end(`<!doctype html><head><meta name="viewport" content="width=device-width">
        <script type="importmap">${importMap}</script><link rel="stylesheet" href="/cart.css">
        <link rel="stylesheet" href="/styles/brand.css">
        <link rel="stylesheet" href="/styles/styles.css">
        <link rel="stylesheet" href="/booking.css">
        </head><body class="appear"><main class="commerce-cart"></main></body>`);
      return;
    }
    if (req.url === '/scripts/aero-auth.js' || req.url === '/scripts/aero-shop.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(req.url.endsWith('aero-auth.js')
        ? 'export const getBookingAccessToken = async () => "existing-aero-token"; export const signInForBooking = async () => {};'
        : 'export const AERO_SHOP_ORIGIN = "https://wknd-adventures.run.place";');
      return;
    }
    // Keep the module URL at its real depth so its relative import resolves unchanged.
    const file = req.url === '/blocks/commerce-cart/aero-offer.js' ? files['/offer.js'] : files[req.url];
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript');
    res.end(await readFile(new URL(file, import.meta.url), 'utf8'));
  });
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (entry) => {
    if (entry.type() === 'error') browserErrors.push(entry.text());
  });
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async () => {
      const moduleUrl = new URL('/blocks/commerce-cart/aero-offer.js', window.location.origin);
      const { default: init } = await import(moduleUrl.href);
      const booking = 'BK_0123456789abcdef';
      window.mount = ({ signedIn = true, status = 'ELIGIBLE', search } = {}) => {
        document.querySelector('main').replaceChildren();
        const state = {
          signedIn,
          calls: [],
          refreshes: 0,
          additions: [],
          cart: { items: [] },
          error: false,
          held: null,
          hold: false,
          offer: {
            status,
            booking_id: booking,
            promotion_id: 'server-promo',
            bundle_id: 'server-kit',
            name: 'Server approved kit',
            percent_off: 50,
            expires_at: new Date(Date.now() + 86400000).toISOString(),
            components: [
              { sku: 'WKND-HYD-002', quantity: 1, name: 'Collapsible Bottle 1L' },
              { sku: 'WKND-LGT-001', quantity: 1, name: 'Alpine Start Headlamp 400' },
              { sku: 'WKND-TRV-009', quantity: 1, name: 'Wilderness First Aid Kit' },
            ],
          },
        };
        init(document.querySelector('main'), {
          search: search ?? `?aero_booking=${booking}`,
          isAuthenticated: () => state.signedIn,
          signIn: async () => { state.signedIn = true; },
          refreshCart: async () => { state.refreshes += 1; return state.cart; },
          addProducts: async (items) => {
            state.additions.push(items);
            if (state.failAdd) {
              state.cart.items.push(items[0]);
              throw new Error('Some stock changed');
            }
            state.cart.items.push(...items);
          },
          events: { on: (name, handler) => { state.authChanged = handler; } },
          fetchGraphQl: async (query, options) => {
            state.calls.push({ query, options });
            const claim = query.includes('mutation');
            if (claim && !state.error) state.offer.status = 'CLAIMED';
            const result = () => (state.error ? { errors: [{ message: 'Unavailable' }] } : {
              data: {
                [claim ? 'claimWkndAeroBundleOffer' : 'wkndAeroBundleOffer']: {
                  ...state.offer, status: claim ? 'CLAIMED' : state.offer.status,
                },
              },
            });
            if (state.hold) {
              return new Promise((resolve) => { state.held = () => resolve(result()); });
            }
            return result();
          },
        });
        window.state = state;
      };
    });
    await page.evaluate(() => window.mount({ signedIn: false }));
    await page.getByRole('button', { name: 'Sign in to check offer' }).waitFor();
    assert.equal(await page.evaluate(() => window.state.calls.length), 0);
    await page.getByRole('button', { name: 'Sign in to check offer' }).click();
    await page.getByRole('button', { name: 'Claim flight-linked offer' }).waitFor();
    await page.getByRole('button', { name: 'Claim flight-linked offer' }).click();
    await page.getByText('Offer saved to your account.', { exact: false }).waitFor();
    assert.equal(await page.evaluate(() => window.state.refreshes), 1);
    const calls = await page.evaluate(() => window.state.calls);
    assert.equal(calls.length, 2);
    assert(calls[0].query.includes('query WkndAeroBundleOffer'));
    assert(calls[1].query.includes('mutation ClaimWkndAeroBundleOffer'));
    assert.deepEqual(calls[1].options.variables, { bookingId: 'BK_0123456789abcdef' });
    assert(!JSON.stringify(calls).includes('addProducts'));
    assert.equal(await page.evaluate(() => window.state.additions.length), 0);
    assert((await page.getByRole('link', { name: /Collapsible Bottle/ }).getAttribute('href'))
      .endsWith('/shop/search?q=WKND-HYD-002'));
    await page.getByRole('button', { name: 'Add missing kit products' }).click();
    await page.getByText('Kit products are in your cart.', { exact: false }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.state.additions), [
      [
        { sku: 'WKND-HYD-002', quantity: 1 },
        { sku: 'WKND-LGT-001', quantity: 1 },
        { sku: 'WKND-TRV-009', quantity: 1 },
      ],
    ]);
    await page.getByRole('button', { name: 'Check offer again' }).click();
    await page.getByRole('button', { name: 'Add missing kit products' }).click();
    await page.getByText('Kit products are in your cart.', { exact: false }).waitFor();
    assert.equal(await page.evaluate(() => window.state.additions.length), 1);
    await page.evaluate(() => window.mount({ status: 'CLAIMED' }));
    await page.getByRole('button', { name: 'Add missing kit products' }).waitFor();
    await page.evaluate(() => { window.state.failAdd = true; });
    await page.getByRole('button', { name: 'Add missing kit products' }).click();
    await page.getByText('Could not confirm every kit product.', { exact: false }).waitFor();
    await page.evaluate(() => { window.state.failAdd = false; });
    await page.getByRole('button', { name: 'Check offer again' }).click();
    await page.getByRole('button', { name: 'Add missing kit products' }).click();
    await page.getByText('Kit products are in your cart.', { exact: false }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.state.additions[1]), [
      { sku: 'WKND-LGT-001', quantity: 1 },
      { sku: 'WKND-TRV-009', quantity: 1 },
    ], 'retry adds only products still missing after a partial failure');

    await page.evaluate(() => window.mount({ status: 'REDEEMED' }));
    await page.getByText('This flight-linked offer has already been used.').waitFor();
    assert.equal(await page.getByRole('button').count(), 0);
    await page.evaluate(() => window.mount({ status: 'INELIGIBLE' }));
    await page.getByText('No flight-linked offer is available', { exact: false }).waitFor();
    assert.equal(await page.getByRole('link').count(), 0);
    for (const search of ['?aero_booking=forged', '?aero_booking=BK_0123456789abcdef&aero_booking=BK_0123456789abcdef']) {
      await page.evaluate((value) => window.mount({ search: value }), search);
      await page.getByText('This booking reference is invalid.', { exact: false }).waitFor();
      assert.equal(await page.evaluate(() => window.state.calls.length), 0);
    }
    await page.evaluate(() => window.mount({}));
    await page.getByRole('button', { name: 'Claim flight-linked offer' }).waitFor();
    await page.evaluate(() => { window.state.error = true; });
    await page.getByRole('button', { name: 'Claim flight-linked offer' }).click();
    await page.getByRole('button', { name: 'Retry flight-linked offer' }).waitFor();
    assert.equal(await page.getByRole('link').count(), 0);
    await page.evaluate(() => {
      window.state.error = false;
      window.state.offer.expires_at = '2020-01-01T00:00:00Z';
    });
    await page.getByRole('button', { name: 'Retry flight-linked offer' }).click();
    await page.getByText('Could not confirm your flight-linked offer.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('link').count(), 0);

    await page.evaluate(() => window.mount({}));
    await page.getByRole('button', { name: 'Claim flight-linked offer' }).waitFor();
    await page.evaluate(() => { window.state.hold = true; });
    await page.getByRole('button', { name: 'Claim flight-linked offer' }).click();
    await page.evaluate(() => {
      window.state.signedIn = false;
      window.state.authChanged();
      window.state.held();
    });
    await page.getByRole('button', { name: 'Sign in to check offer' }).waitFor();
    assert.equal(await page.getByRole('link').count(), 0, 'sign-out discards an in-flight claim response');
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    }
    const aeroCalls = [];
    await page.route('https://edge-graph.adobe.io/**', async (route) => {
      const request = route.request();
      const body = request.postDataJSON();
      aeroCalls.push({ body, authorization: request.headers().authorization });
      const claim = body.query.includes('mutation');
      await route.fulfill({
        json: {
          data: {
            [claim ? 'claimWkndAeroBundleOffer' : 'wkndAeroBundleOffer']: {
              status: claim ? 'CLAIMED' : 'ELIGIBLE',
              booking_id: 'BK_0123456789abcdef',
              promotion_id: 'verified-promo',
              bundle_id: 'verified-kit',
              name: 'Adventure Essentials',
              percent_off: 50,
              expires_at: new Date(Date.now() + 86400000).toISOString(),
              components: [
                { sku: 'WKND-HYD-002', quantity: 1, name: 'Collapsible Bottle 1L' },
                { sku: 'WKND-LGT-001', quantity: 1, name: 'Alpine Start Headlamp 400' },
                { sku: 'WKND-TRV-009', quantity: 1, name: 'Wilderness First Aid Kit' },
              ],
            },
          },
        },
      });
    });
    await page.evaluate(async () => {
      const preactModule = 'preact';
      const { h, render } = await import(preactModule);
      const moduleUrl = new URL('/blocks/aero/booking-journey/app/flight-offer.js', window.location);
      const { default: Offer } = await import(moduleUrl.href);
      document.querySelector('main').replaceChildren();
      document.querySelector('main').className = 'booking-journey';
      window.showAero = (signedIn) => render(h(Offer, {
        bookingId: 'BK_0123456789abcdef', api: 'https://worker.test', signedIn,
      }), document.querySelector('main'));
      window.showAero(true);
    });
    await page.getByRole('button', { name: 'Claim flight-linked offer' }).click();
    const shopLink = page.getByRole('link', { name: 'Shop your kit (opens in a new tab)' });
    await shopLink.waitFor();
    assert.equal(
      await shopLink.getAttribute('href'),
      'https://wknd-adventures.run.place/shop/cart?aero_booking=BK_0123456789abcdef',
    );
    assert.equal(aeroCalls.length, 2);
    assert(aeroCalls.every((call) => call.authorization === 'Bearer existing-aero-token'));
    assert.deepEqual(aeroCalls[1].body.variables, { bookingId: 'BK_0123456789abcdef' });
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    }
    if (process.env.AERO_OFFER_SCREENSHOT) {
      await page.screenshot({ path: process.env.AERO_OFFER_SCREENSHOT, fullPage: true });
    }
    await page.evaluate(() => window.showAero(false));
    await page.getByRole('button', { name: 'Sign in to check your offer' }).waitFor();
    assert.equal(await shopLink.count(), 0, 'Aero sign-out hides a previously claimed offer');
    assert.deepEqual(browserErrors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => { server.close(resolve); });
  }
});
