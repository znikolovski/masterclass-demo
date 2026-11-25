#!/usr/bin/env node
/* eslint-env node, es2021 */
/* eslint-disable import/extensions, import/no-dynamic-require, no-console, max-len, no-restricted-syntax, no-await-in-loop -- isolated cross-repository/browser acceptance */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, dirname, extname } from 'node:path';
import { chromium } from 'playwright'; // eslint-disable-line import/no-extraneous-dependencies
import loadTestAeroWorker from './lib/load-test-aero-worker.mjs';

const root = resolve('.');
const departureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const require = createRequire(import.meta.url);
const handlerPath = resolve(process.argv[2] || '../masterclass-demo-llmapp/actions/search-flights/index.js');
const analyticsPath = resolve(dirname(handlerPath), '../lib/analytics.js');
require.cache[analyticsPath] = {
  id: analyticsPath, filename: analyticsPath, loaded: true, exports: { withAnalytics: (_name, handler) => handler },
};
const handler = require(handlerPath);
const worker = await loadTestAeroWorker();
const quotes = new Map();
const env = {
  WKND_AERO_CATALOG: {
    put: async (key, value) => quotes.set(key, value),
    get: async (key, type) => {
      const value = quotes.get(key);
      return value && type === 'json' ? JSON.parse(value) : value || null;
    },
  },
};
const originalFetch = globalThis.fetch;
let flightQueries = 0;
let output;
globalThis.fetch = async (url, options) => {
  const parsed = new URL(url);
  if (parsed.pathname === '/api/flights/search') {
    assert.equal(options?.method || 'GET', 'GET');
    assert.deepEqual(Object.fromEntries(parsed.searchParams), {
      origin: 'MEL', dest: 'PUQ', depart: departureDate, passengers: '2',
    });
    flightQueries += 1;
    return worker.fetch(new Request(url, options), env);
  }
  if (parsed.pathname.endsWith('query-index.json')) {
    return Response.json({ data: [{ path: '/adventures/patagonia-trek', title: 'Patagonia trek' }] });
  }
  if (parsed.pathname.endsWith('index.json')) {
    return Response.json({ data: [{ sku: 'patagonia-trek', name: 'Patagonia trek', destinationIata: 'PUQ' }] });
  }
  throw new Error(`Unexpected request in offline flight test: ${parsed.pathname}`);
};
try {
  output = await handler({
    adventure_id: 'patagonia-trek', origin: 'MEL', depart: departureDate, passengers: 2,
  }, {
    variables: { WKND_CATALOG_BASE: 'https://worker.test' },
  });
  assert.equal(output.isError, undefined, JSON.stringify(output));
  assert.equal(output.structuredContent.flights.length, 3);
  assert.equal(flightQueries, 1);
  assert([...quotes.keys()].every((key) => key.startsWith('flight-quote:')), 'Search must create only ephemeral quotes, never bookings');
} finally {
  globalThis.fetch = originalFetch;
}
const cart = {
  structuredContent: {
    view: 'cart',
    offer: null,
    cart: {
      currency: 'AUD',
      lines: [{ name: 'Climbing gear' }],
      totals: {
        subtotal: { value: 300, currency: 'AUD' },
        discounts: [{ label: 'Climbing planner discount', amount: { value: 30, currency: 'AUD' } }],
        grand_total: { value: 270, currency: 'AUD' },
        shipping: null,
        tax_included: [],
      },
    },
  },
};
const widgetOutputs = {
  'search-flights': output,
  'discover-adventures': { structuredContent: { adventures: [{ adventure_id: 'patagonia-trek', title: 'Patagonia trek', activity: 'Hiking' }] } },
  'build-route-briefing': { structuredContent: { adventure_id: 'patagonia-trek', title: 'Patagonia trek' } },
};
const mime = {
  '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2',
};
let base;
const server = createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://localhost');
  if (pathname === '/.rum/100' || pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
  if (pathname === '/host') {
    const widget = searchParams.get('widget') || 'search-flights';
    assert(Object.hasOwn(widgetOutputs, widget));
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><html><head><style>body{margin:0}iframe{display:block;border:0;width:100%;height:2400px}</style></head>
      <body><iframe title="Flight widget" src="/widget?name=${widget}"></iframe><script>
      window.output=${JSON.stringify(widgetOutputs[widget])};window.cartOutput=${JSON.stringify(cart)};
      window.calls=[];window.links=[];window.messages=[];
      window.sendResult=(result)=>document.querySelector('iframe').contentWindow.postMessage({
        jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result
      },location.origin);
      addEventListener('message',event=>{
        const message=event.data;
        const reply=(result)=>event.source.postMessage({jsonrpc:'2.0',id:message.id,result},event.origin);
        if(message?.method==='ui/initialize')reply({hostInfo:{name:'flight-test'},hostContext:{theme:'light',preview:${searchParams.has('preview')}},hostCapabilities:{serverTools:{},openLinks:{}}});
        else if(message?.method==='ui/notifications/initialized')window.sendResult(window.output);
        else if(message?.method==='tools/call'){
          window.calls.push(message.params);
          reply(message.params.name==='get-shop-cart'?window.cartOutput:window.output);
        }else if(message?.method==='ui/open-link'){window.links.push(message.params);reply({});}
        else if(message?.method==='ui/message'){window.messages.push(message.params);reply({});}
        else if(message?.id)reply({});
      });</script></body></html>`);
    return;
  }
  if (pathname === '/widget') {
    const widget = searchParams.get('name') || 'search-flights';
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">
      <script type="module" src="/scripts/aem-embed.js"></script>
      <aem-embed url="${base}/eds-widgets/${widget}"></aem-embed></body></html>`);
    return;
  }
  if (/^\/eds-widgets\/(discover-adventures|build-route-briefing)\.plain\.html$/.test(pathname)) {
    const name = pathname.split('/').pop().replace('.plain.html', '');
    res.setHeader('Content-Type', 'text/html');
    res.end(`<div><div class="${name}"><div><div><h2>Adventure planning</h2></div></div></div></div>`);
    return;
  }
  const path = pathname === '/eds-widgets/search-flights.plain.html'
    ? resolve(root, 'drafts/eds-widgets/search-flights.plain.html') : resolve(root, `.${pathname}`);
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
  const warnings = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('console', (message) => { if (message.type() === 'warning') warnings.push(message.text()); });
  await page.route('**/*graphql*', (route) => { throw new Error(`Unexpected live Commerce request: ${route.request().url()}`); });
  if (process.env.LLM_AERO_SCREENSHOT_DIR) await mkdir(process.env.LLM_AERO_SCREENSHOT_DIR, { recursive: true });
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/host`);
    const block = page.frameLocator('iframe').locator('.search-flights');
    await block.getByRole('link', { name: 'Continue in Aero with WK205' }).waitFor();
    assert.equal(await block.locator('.search-flights-card').count(), 3);
    assert.match(await block.innerText(), /confirmed, eligible booking/);
    assert.equal(await page.evaluate(() => window.calls.length), 0, 'No automatic cart/offer request');
    assert(await block.evaluate((node) => node.scrollWidth <= node.clientWidth), `No overflow at ${width}`);
    await block.getByRole('button', { name: 'Check my gear discounts', exact: true }).click();
    await block.getByText('Climbing planner discount', { exact: true }).waitFor();
    assert.match(await block.locator('.search-flights-discount-results').innerText(), /AUD/);
    assert.match(await block.locator('.search-flights-discount-results').innerText(), /270\.00/);
    assert.equal(await block.getByRole('button', { name: 'Apply this offer' }).count(), 0);
    await block.getByRole('link', { name: 'Continue in Aero with WK205' }).click();
    await page.waitForFunction(() => window.links.length > 0);
    assert.match(JSON.stringify(await page.evaluate(() => window.links)), /flight_id=WK205/);
    if (process.env.LLM_AERO_SCREENSHOT_DIR) {
      await page.screenshot({ path: resolve(process.env.LLM_AERO_SCREENSHOT_DIR, `llm-aero-${width}.png`), fullPage: true });
    }
    await page.evaluate(() => { window.cartOutput = { isError: true, structuredContent: { error: { message: 'Sign in to check your discounts.' } } }; });
    await block.getByRole('button', { name: 'Check my gear discounts', exact: true }).click();
    await block.getByRole('alert').filter({ hasText: 'Sign in to check your discounts' }).waitFor();
    assert.equal(await block.locator('.shop-widget-totals').count(), 0, 'No stale savings after failed authorization');
    await block.getByLabel('Departure airport', { exact: true }).fill('SYD');
    await block.getByRole('button', { name: 'Search demo flights', exact: true }).click();
    await page.waitForFunction(() => window.calls.some((call) => call.name === 'search-flights'));
    const calls = await page.evaluate(() => window.calls);
    assert.equal(calls.at(-1).arguments.origin, 'SYD');
    assert.equal(calls.at(-1).arguments.adventure_id, 'patagonia-trek');
    assert(calls.every((call) => ['get-shop-cart', 'search-flights'].includes(call.name)), 'No booking, offer or cart mutation tool calls');
    await page.evaluate(() => {
      const invalid = structuredClone(window.output);
      invalid.structuredContent.flights[0].booking_url = 'https://evil.test/book/flights';
      window.sendResult(invalid);
    });
    await block.getByRole('alert').filter({ hasText: 'invalid or expired' }).waitFor();
    assert.equal(await block.getByRole('link').count(), 0, 'Reject invalid checkout links');
    await page.evaluate(() => {
      const failed = structuredClone(window.output);
      failed.isError = true;
      failed.content = [{ type: 'text', text: 'Flight search is unavailable. Try again.' }];
      failed.structuredContent.status = 'unavailable';
      failed.structuredContent.flights = [];
      window.sendResult(failed);
    });
    await block.getByRole('alert').filter({ hasText: 'Flight search is unavailable' }).waitFor();
    assert.equal(await block.getByText('No flights found. Try a different date or route.', { exact: true }).count(), 0);
  }
  await page.goto(`${base}/host?preview=1`);
  const preview = page.frameLocator('iframe').locator('.search-flights');
  await preview.getByText(/No fares are shown in page previews/).waitFor();
  assert.equal(await preview.locator('.search-flights-card').count(), 0);
  assert(await preview.getByRole('button', { name: 'Check my gear discounts', exact: true }).isDisabled());
  for (const widget of ['discover-adventures', 'build-route-briefing']) {
    await page.goto(`${base}/host?widget=${widget}`);
    try {
      await page.frameLocator('iframe').getByRole('button', { name: 'Find Flights', exact: true }).click({ timeout: 10000 });
    } catch (error) {
      console.error({
        widget, errors, warnings, body: (await page.frameLocator('iframe').locator('body').first().innerText()).slice(0, 1500),
      });
      throw error;
    }
    await page.waitForFunction(() => window.messages.length > 0);
    assert.match(JSON.stringify(await page.evaluate(() => window.messages)), /adventure_id: patagonia-trek/);
  }
  assert.deepEqual(errors, [], 'No browser/console errors');
  console.log('PASS: actual Worker/handler contract, real SDK widgets at 375/768/1280, context handoff, authenticated discount display, no automatic claims/writes, and invalid-link rejection.');
} finally {
  await browser?.close();
  await new Promise((done) => { server.close(done); });
}
