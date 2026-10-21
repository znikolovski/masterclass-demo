#!/usr/bin/env node
/* eslint-env node, es2021 */
/* eslint-disable no-console, no-restricted-syntax, no-await-in-loop, max-len, import/extensions -- sequential browser regression */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright'; // eslint-disable-line import/no-extraneous-dependencies

const root = resolve(process.env.BOOKING_WIDGET_ROOT || '.');
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
const mime = {
  '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2',
};
let base;
const server = createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://localhost');
  if (pathname === '/host') {
    const mode = searchParams.get('mode') || 'details';
    const output = {
      details, list: listing, empty, error: denied,
    }[mode];
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><html><head><style>
      body{margin:0}iframe{display:block;border:0;width:100%;height:1800px}
      </style></head><body><iframe title="Booking widget" src="/widget"></iframe>
      <script>
        window.output=${JSON.stringify(output)};
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
              event.source.postMessage({jsonrpc:'2.0',id:message.id,result:window.output},event.origin);
            } else {
              window.heldRequest={id:message.id,source:event.source,origin:event.origin};
            }
          } else if(message?.method==='ui/notifications/size-changed'){
            window.sizes.push(message.params);
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
  const errors = [];
  const external = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!request.url().startsWith(base)
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
        await block.getByText('Booking details loaded.', { exact: true }).waitFor();
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
