#!/usr/bin/env node
/* eslint-env node, es2021 */
/* eslint-disable no-console, no-restricted-syntax, no-await-in-loop, max-len, import/extensions -- sequential browser regression */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright'; // eslint-disable-line import/no-extraneous-dependencies

const root = resolve(process.env.BOOKING_WIDGET_ROOT || '.');
const editorAgents = [
  'https://28538-blocksource.adobeio-static.net/agent.js',
  'https://28538-copycheck.adobeio-static.net/agent.js',
  'https://28538-planeew.adobeio-static.net/agent.js',
];
const id = 'BK_0123456789abcdef';
const booking = {
  id,
  demo: true,
  status: 'confirmed',
  seats: ['2A'],
  passengerCount: 1,
  total: 459,
  currency: 'USD',
  flight: {
    origin: 'MEL',
    destination: 'PUQ',
    cabin: 'Economy',
    aircraft: 'Boeing 737',
    duration: '3h 30m',
    departureAt: '2026-11-30T21:30:00Z',
    originTimeZone: 'Australia/Melbourne',
    arrivalAt: '2026-12-01T01:00:00Z',
    destinationTimeZone: 'America/Punta_Arenas',
  },
  adventure: { title: '<img src=x onerror=alert(1)>', editorialUrl: 'https://example.test/adventure' },
  preparation: {
    itinerary: ['Published route'],
    packingList: [],
    permits: ['Check with the operator'],
    sourceUrl: 'javascript:alert(1)', // eslint-disable-line no-script-url -- rejected source fixture
  },
};
const details = { structuredContent: { mode: 'details', booking } };
const listing = { structuredContent: { mode: 'list', bookings: [booking], nextCursor: 'page-2' } };
const empty = { structuredContent: { mode: 'list', bookings: [], nextCursor: null } };
const denied = { isError: true, structuredContent: { error: { message: 'Sign in to view your bookings.' } } };
const flightOffer = {
  status: 'ELIGIBLE',
  booking_id: id,
  promotion_id: 'prm_test',
  bundle_id: 'bundle_test',
  name: 'Adventure Essentials — confirmed demo flight',
  percent_off: 50,
  expires_at: new Date(Date.now() + 86400000).toISOString(),
  components: [
    { sku: 'WKND-HYD-002', quantity: 1, name: 'Collapsible Bottle 1L' },
    { sku: 'WKND-LGT-001', quantity: 1, name: 'Alpine Start Headlamp 400' },
    { sku: 'WKND-TRV-009', quantity: 1, name: 'Wilderness First Aid Kit' },
  ],
};
const eligible = { structuredContent: { mode: 'flight-offer', offer: flightOffer } };
const claimed = { structuredContent: { mode: 'flight-offer', offer: { ...flightOffer, status: 'CLAIMED' } } };
const kitCart = {
  currency: 'AUD',
  lines: flightOffer.components,
  totals: {
    subtotal: { value: 300, currency: 'AUD' },
    discounts: [{ label: flightOffer.name, amount: { value: 150, currency: 'AUD' } }],
    grand_total: { value: 150, currency: 'AUD' },
    shipping: null,
    tax_included: [],
  },
};
const added = {
  structuredContent: {
    ...claimed.structuredContent,
    cart: kitCart,
    message: 'All missing kit products were added together. Your flight is unchanged.',
  },
};
const mime = {
  '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2',
};
let base;
const server = createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://localhost');
  if (pathname === '/.rum/100') {
    res.writeHead(204).end();
    return;
  }
  if (pathname === '/host') {
    const mode = searchParams.get('mode') || 'details';
    const output = {
      details, list: listing, empty, error: denied, offer: eligible, claimed, added,
    }[mode];
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><html><head><meta charset="utf-8"><style>
      body{margin:0}iframe{display:block;border:0;width:100%;height:1800px}
      </style></head><body><iframe title="Booking widget" src="/widget"></iframe>
      <script>
        window.output=${JSON.stringify(output)};
        window.toolOutputs=${JSON.stringify({
    'get-flight-gear-offer': eligible,
    'claim-flight-gear-offer': claimed,
    'add-flight-gear-kit': added,
    'get-shop-cart': { structuredContent: { cart: kitCart } },
  })};
        window.calls=[];
        window.sizes=[];
        window.sendResult=(result)=>document.querySelector('iframe').contentWindow.postMessage({
          jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result
        },location.origin);
        addEventListener('message',event=>{
          const message=event.data;
          if(message?.method==='ui/initialize'){
            event.source.postMessage({jsonrpc:'2.0',id:message.id,result:{
              hostInfo:{name:'booking-test'},hostContext:{theme:'light'},hostCapabilities:{serverTools:{}}
            }},event.origin);
          } else if(message?.method==='ui/notifications/initialized'){
            window.sendResult(window.output);
          } else if(message?.method==='tools/call'){
            window.calls.push(message.params);
            if(window.rejectCall){
              event.source.postMessage({jsonrpc:'2.0',id:message.id,error:{code:-32603,message:'Denied'}},event.origin);
            } else if(!window.holdCall){
              event.source.postMessage({jsonrpc:'2.0',id:message.id,result:window.toolOutputs[message.params.name]||window.output},event.origin);
            } else {
              window.heldRequest={id:message.id,source:event.source,origin:event.origin};
            }
          } else if(message?.method==='ui/notifications/size-changed'){
            window.sizes.push(message.params);
            if(Number.isFinite(message.params?.height)){
              document.querySelector('iframe').style.height=message.params.height+'px';
            }
          }
        });
      </script></body></html>`);
    return;
  }
  if (pathname === '/widget') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body style="margin:0"><script type="module" src="/scripts/aem-embed.js"></script>
      <aem-embed url="${base}/eds-widgets/check-booking"></aem-embed></body></html>`);
    return;
  }
  const path = pathname === '/eds-widgets/check-booking.plain.html'
    ? resolve(root, 'drafts/eds-widgets/check-booking.plain.html') : resolve(root, `.${pathname}`);
  if (!path.startsWith(`${root}/`)) { res.writeHead(403).end(); return; }
  try {
    const content = await readFile(path);
    res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream');
    res.end(content);
  } catch (error) {
    if (!['ENOENT', 'EISDIR'].includes(error.code)) console.error(error);
    res.writeHead(404).end();
  }
});
await new Promise((done) => { server.listen(0, '127.0.0.1', done); });
base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  // The framed page loader also imports authoring agents; keep those services out of this SDK test.
  for (const url of editorAgents) {
    await page.route(url, (route) => route.fulfill({ contentType: 'text/javascript', body: 'export {};' }));
  }
  const errors = [];
  const external = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
      console.error(`Browser console error: ${message.text()}`);
    }
  });
  page.on('requestfailed', (request) => {
    console.error(`Browser request failed: ${request.url()} (${request.failure()?.errorText})`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      console.error(`Browser request returned ${response.status()}: ${response.url()}`);
    }
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!request.url().startsWith(base)
      && !editorAgents.includes(request.url())
      && !['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) {
      external.push(request.url());
    }
  });
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const mode of ['details', 'list', 'empty', 'error']) {
      await page.goto(`${base}/host?mode=${mode}`);
      const frame = page.frameLocator('iframe');
      const block = frame.locator('.check-booking');
      if (mode === 'details') {
        try {
          await block.getByText('Booking details loaded.', { exact: true }).waitFor();
        } catch (error) {
          const state = await frame.locator('aem-embed').evaluate((embed) => ({
            initialized: embed.initialized,
            shadow: embed.shadowRoot?.innerHTML,
          }));
          console.error(`Booking widget state: ${JSON.stringify(state)}`);
          throw error;
        }
        assert((await block.innerText()).includes('(Australia/Melbourne)'));
        assert((await block.innerText()).includes('requirements have not been confirmed'));
        assert((await block.innerText()).includes('<img src=x onerror=alert(1)>'));
        assert.equal(await block.locator('img').count(), 0);
        assert.equal(await block.locator('a[href^="javascript:"]').count(), 0);
      } else if (mode === 'list') {
        await block.getByText('1 bookings on this page.', { exact: true }).waitFor();
      } else if (mode === 'empty') {
        await block.getByText('No bookings found for your account.', { exact: true }).waitFor();
      } else {
        await block.getByRole('alert').filter({ hasText: 'Sign in' }).waitFor();
      }
      assert(await block.evaluate((node) => node.scrollWidth <= node.clientWidth), `${mode} overflow at ${width}`);
      assert(await frame.locator('html').evaluate((node) => node.scrollWidth <= window.innerWidth), `${mode} iframe overflow at ${width}`);
      await page.waitForFunction(() => window.sizes.length > 0);
      if (process.argv[2]) await block.screenshot({ path: `${process.argv[2]}/booking-eds-${mode}-${width}.png` });
    }
  }
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/host?mode=details`);
    const offerBlock = page.frameLocator('iframe').locator('.check-booking');
    await offerBlock.getByText('Booking details loaded.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.calls.length), 0, 'No automatic offer or cart call');
    await offerBlock.getByRole('button', { name: 'Check flight-linked offer', exact: true }).click();
    await offerBlock.getByRole('button', { name: 'Claim flight-linked offer', exact: true }).waitFor();
    assert.match(await offerBlock.innerText(), /50% off one exact complete kit/);
    assert.equal(await offerBlock.getByRole('button', { name: 'Add kit to cart', exact: true }).count(), 0);
    await offerBlock.getByRole('button', { name: 'Claim flight-linked offer', exact: true }).click();
    await offerBlock.getByText('Offer saved to your account. No gear has been added or purchased.', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.calls.map((call) => call.name)), [
      'get-flight-gear-offer', 'claim-flight-gear-offer',
    ]);
    await offerBlock.getByRole('button', { name: 'Add kit to cart', exact: true }).click();
    await offerBlock.getByText('All missing kit products were added together. Your flight is unchanged.', { exact: true }).waitFor();
    assert.match(await offerBlock.locator('.check-booking-offer-cart').innerText(), /150\.00/);
    assert.match(await offerBlock.locator('.check-booking-offer-cart').innerText(), /Adventure Essentials/);
    assert.deepEqual(await page.evaluate(() => window.calls), [
      { name: 'get-flight-gear-offer', arguments: { booking_id: id } },
      { name: 'claim-flight-gear-offer', arguments: { booking_id: id } },
      { name: 'add-flight-gear-kit', arguments: { booking_id: id } },
    ]);
    assert(await offerBlock.evaluate((node) => node.scrollWidth <= node.clientWidth), `Offer overflow at ${width}`);
    if (process.argv[2]) {
      await offerBlock.evaluate((node) => Promise.all(node.getAnimations({ subtree: true }).map((animation) => animation.finished)));
      await offerBlock.locator('.check-booking-flight-offer').screenshot({ path: `${process.argv[2]}/flight-kit-${width}.png` });
    }
    await page.evaluate(() => {
      window.toolOutputs['get-shop-cart'] = { isError: true, structuredContent: { error: { message: 'Sign in to check your cart.' } } };
    });
    await offerBlock.getByRole('button', { name: 'Check applied kit savings', exact: true }).click();
    await offerBlock.getByRole('alert').filter({ hasText: 'Sign in to check your cart' }).waitFor();
    assert.equal(await offerBlock.locator('.shop-widget-totals').count(), 0, 'No stale savings on authorization failure');
  }
  await page.goto(`${base}/host?mode=offer`);
  const directOffer = page.frameLocator('iframe').locator('.check-booking');
  await directOffer.getByRole('button', { name: 'Claim flight-linked offer', exact: true }).waitFor();
  await page.evaluate((output) => window.sendResult(output), added);
  await directOffer.getByText(added.structuredContent.message, { exact: true }).waitFor();
  assert.equal(await directOffer.getByText('Offer saved to your account. No gear has been added or purchased.', { exact: true }).count(), 0);
  assert.match(await directOffer.locator('.check-booking-offer-cart').innerText(), /150\.00/);
  for (const state of ['INELIGIBLE', 'REDEEMED']) {
    await page.evaluate((output) => window.sendResult(output), {
      structuredContent: { mode: 'flight-offer', offer: { ...flightOffer, status: state } },
    });
    await directOffer.getByText(state === 'REDEEMED'
      ? 'This flight-linked offer has already been used.'
      : 'No flight-linked offer is available for this booking and account.', { exact: true }).waitFor();
    assert.equal(await directOffer.getByRole('button', { name: 'Claim flight-linked offer', exact: true }).count(), 0);
    assert.equal(await directOffer.getByRole('button', { name: 'Add kit to cart', exact: true }).count(), 0);
  }
  await page.evaluate((output) => window.sendResult(output), {
    structuredContent: { mode: 'flight-offer', offer: { ...flightOffer, expires_at: '2020-01-01T00:00:00Z' } },
  });
  await directOffer.getByRole('alert').filter({ hasText: 'invalid or expired' }).waitFor();
  await page.goto(`${base}/host?mode=list`);
  const block = page.frameLocator('iframe').locator('.check-booking');
  await block.getByRole('button', { name: `View details for ${id}` }).waitFor();
  await page.evaluate((output) => { window.output = output; }, details);
  await block.getByRole('button', { name: `View details for ${id}` }).click();
  await block.getByText('Booking details loaded.', { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.calls.at(-1)), { name: 'check-booking', arguments: { booking_id: id } });
  await page.evaluate((output) => window.sendResult(output), listing);
  await block.getByRole('button', { name: 'Next page' }).waitFor();
  await page.evaluate((output) => { window.output = output; }, empty);
  await block.getByRole('button', { name: 'Next page' }).click();
  await block.getByText('No bookings found for your account.', { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.calls.at(-1)), { name: 'check-booking', arguments: { cursor: 'page-2' } });
  await page.evaluate((output) => { window.output = output; }, details);
  await block.getByLabel('Booking ID', { exact: true }).fill(id);
  await block.getByLabel('Booking ID', { exact: true }).press('Enter');
  await block.getByText('Booking details loaded.', { exact: true }).waitFor();
  await page.evaluate(() => { window.rejectCall = true; });
  await block.getByRole('button', { name: 'My bookings', exact: true }).click();
  await block.getByRole('alert').waitFor();
  assert(!(await block.innerText()).includes('Demo booking - not a ticket'));
  await page.evaluate((output) => { window.rejectCall = false; window.sendResult(output); }, details);
  await block.getByText('Booking details loaded.', { exact: true }).waitFor();
  await page.evaluate(() => { window.holdCall = true; });
  await block.getByRole('button', { name: 'My bookings', exact: true }).click();
  await page.waitForFunction(() => window.heldRequest);
  await page.evaluate(() => {
    document.querySelector('iframe').contentWindow.postMessage({
      jsonrpc: '2.0', method: 'ui/notifications/tool-cancelled', params: {},
    }, window.location.origin);
  });
  await block.getByRole('alert').filter({ hasText: 'cancelled' }).waitFor();
  await page.evaluate((output) => {
    const request = window.heldRequest;
    request.source.postMessage({ jsonrpc: '2.0', id: request.id, result: output }, request.origin);
  }, details);
  await page.waitForTimeout(100);
  assert(!(await block.innerText()).includes('Demo booking - not a ticket'));
  await page.goto(`${base}/widget`);
  await page.locator('.check-booking').getByText(/Private booking data is not available in page previews/).waitFor();
  assert.equal(await page.locator('.check-booking-card').count(), 0);
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  console.log('PASS EDS aem-embed + real SDK: responsive states, details, pagination, keyboard lookup, safe content, cancellation/race handling, size reporting and private-data-free standalone preview.');
} finally {
  if (browser) await browser.close();
  await new Promise((done) => { server.close(done); });
}
