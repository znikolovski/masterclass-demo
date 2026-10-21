#!/usr/bin/env node
/* eslint-disable import/no-absolute-path, import/no-unresolved, no-underscore-dangle, max-len, no-console -- browser-evaluated imports and Adobe test payloads */
import assert from 'node:assert/strict';
import { chromium } from 'playwright'; // eslint-disable-line import/no-extraneous-dependencies
import loadTestAeroWorker from './lib/load-test-aero-worker.mjs'; // eslint-disable-line import/extensions
import bookingAuthFixture from './lib/booking-auth-fixture.mjs'; // eslint-disable-line import/extensions

const base = process.argv[2] || 'http://localhost:3000';
const screenshots = process.argv[3];
const aero = 'https://main--wknd-aero--znikolovski.aem.live';
const adventure = 'https://wknd-adventures.run.place';
const worker = await loadTestAeroWorker();
const auth = await bookingAuthFixture();
const checkoutToken = await auth.token();
const browser = await chromium.launch();
const journey = {
  id: crypto.randomUUID(),
  createdAt: Date.now(),
  source: 'llm-app',
  tool: 'discover_adventures',
  assisted: false,
};
const identity = '54758217238990693431236455737116189050';
const handles = [
  { type: 'identity:result', payload: [{ id: identity, namespace: { code: 'ECID' } }] },
  {
    type: 'state:store',
    payload: [{
      key: 'kndctr_28260E2056581D3B7F000101_AdobeOrg_identity',
      // Opaque example from Adobe's client-state documentation, not a real user cookie.
      value: 'CiY1NDc1ODIxNzIzODk5MDY5MzQzMTIzNjQ1NTczNzExNjE4OTA1MFINCLGOvszNLhABGAEgBKABsY6-zM0uqAGHz-z2y82cul3wAbGOvszNLg==',
      maxAge: 3600,
    }],
  },
];
const values = new Map();
values.set('catalog:adventures:ohrid-macedonia', JSON.stringify({
  sku: 'ohrid-macedonia',
  name: 'Ohrid',
  editorialUrl: `${adventure}/blog/ohrid-macedonia`,
}));
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

try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  const events = [];
  const diagnostics = [];
  const edgeUrls = [];
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) diagnostics.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  let bookingMode = 'http';
  let posts = 0;
  let release;
  let confirmed;
  const read = (stage) => events.filter((event) => event.data?.wkndJourney?.stage === stage);
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname.endsWith('adobedtm.com')) {
      return route.fulfill({ contentType: 'text/javascript', body: '' });
    }
    if (url.hostname === 'cdn.auth0.com') {
      return route.fulfill({
        contentType: 'text/javascript',
        body: `window.auth0={Auth0Client:class {
          async loginWithPopup(_,options){options.popup.close();}
          async getTokenSilently(){return ${JSON.stringify(checkoutToken)};}
        }};`,
      });
    }
    if (url.hostname.endsWith('adobedc.net')
      || (url.hostname === 'adobedc.demdex.net'
        && request.frame().url().includes('/__journey-widget'))) {
      edgeUrls.push(url.href);
      if (request.frame().url().includes('edge-failure')) return route.abort('failed');
      const body = request.postDataJSON();
      if (body?.events) events.push(...body.events);
      const optedOut = body?.consent?.some((consent) => consent.value?.general === 'out');
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          handle: [...handles, ...(optedOut ? [{
            type: 'state:store',
            payload: [{
              key: 'kndctr_28260E2056581D3B7F000101_AdobeOrg_consent',
              value: 'general=out',
              maxAge: 3600,
            }],
          }] : [])],
        }),
      });
    }
    if (url.hostname === 'cdn1.adoberesources.net') {
      return route.fulfill({
        contentType: 'text/javascript',
        body: `window.alloy=async(command)=>command==='getIdentity'?{identity:{ECID:'${identity}'}}:{};`,
      });
    }
    if (url.hostname === 'experience.adobe.net') {
      return route.fulfill({
        contentType: 'text/javascript',
        body: `window.adobe={concierge:{bootstrap:async()=> {
          document.querySelector('#brand-concierge-mount').innerHTML=
            '<div class="brand-concierge-container"><input class="chat-input"><button aria-label="Send message">Send</button><a href="${aero}/book/flights?dest=OHD&adv=lake-ohrid-escape">Flights</a></div>';
        }}};`,
      });
    }
    if (url.hostname === 'wknd-aero-api.jaggah.workers.dev'
      && url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/bookings') {
        posts += 1;
        if (bookingMode === 'http') return route.fulfill({ status: 503, body: 'Unavailable' });
        if (bookingMode === 'network') return route.abort('failed');
        if (bookingMode === 'invalid') {
          return route.fulfill({
            contentType: 'application/json', body: JSON.stringify({ id: 'NOT_A_CONFIRMATION' }),
          });
        }
        if (bookingMode === 'hold') await new Promise((resolve) => { release = resolve; });
      }
      const response = await worker.fetch(new Request(request.url(), {
        method: request.method(), headers: request.headers(), body: request.postData() || undefined,
      }), env);
      const body = await response.text();
      if (url.pathname === '/api/bookings' && response.ok) confirmed = JSON.parse(body);
      return route.fulfill({
        status: response.status,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body,
      });
    }
    if (url.pathname === '/api/generate' && request.method() === 'POST') {
      const template = await context.request.get(`${base}/templates/of1/recommendation.plain.html`);
      const sections = await page.evaluate((html) => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return [...doc.body.children].map((section) => section.innerHTML);
      }, await template.text());
      const stream = sections.map((html, index) => ({
        type: 'section', format: 'html', index, html, stylesheet: null,
      }));
      stream.push(
        { type: 'suggestions', suggestions: [{ label: 'Lofoten', query: 'Lofoten' }] },
        { type: 'done', title: 'Journey test' },
      );
      return route.fulfill({
        contentType: 'application/x-ndjson',
        body: `${stream.map((event) => JSON.stringify(event)).join('\n')}\n`,
      });
    }
    if (url.pathname === '/__journey-host') {
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><body><iframe title="Discovery widget" sandbox="allow-scripts allow-same-origin" src="/__journey-widget"></iframe></body></html>',
      });
    }
    if (url.pathname === '/__journey-widget') {
      const result = {
        structuredContent: {
          adventures: [{ adventure_id: 'lake-ohrid-escape', title: 'Ohrid', activity: 'Hiking' }],
          intent: 'Ohrid PRIVATE_INTENT',
        },
        _meta: {
          wkndJourney: journey,
          wkndEdge: {
            datastreamId: '56dee4fc-21a9-4e37-83ab-bdd874957aba',
            orgId: '28260E2056581D3B7F000101@AdobeOrg',
            handles: url.searchParams.has('identity-only')
              ? handles.filter((handle) => handle.type !== 'state:store') : handles,
            identityMap: { ECID: [{ id: identity, authenticatedState: 'ambiguous', primary: true }] },
          },
        },
      };
      return route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html><head>
          <link rel="stylesheet" href="/blocks/discover-adventures/discover-adventures.css">
          </head><body><main><div id="widget" class="discover-adventures"></div></main>
          <script type="module">
            import decorate from '/blocks/discover-adventures/discover-adventures.js';
            window.handoffUrls=[];
            ${url.searchParams.has('configured') || url.searchParams.has('consent-out')
    || url.searchParams.has('consent-pending') ? `
              const sdk=await import('/scripts/llmapps-sdk.js');
              await sdk._loadAlloyScripts();
              await window.alloy('configure', {
                datastreamId:'56dee4fc-21a9-4e37-83ab-bdd874957aba',
                orgId:'28260E2056581D3B7F000101@AdobeOrg',
                ${url.searchParams.has('consent-out') ? "defaultConsent:'out'," : ''}
                ${url.searchParams.has('consent-pending') ? "defaultConsent:'pending'," : ''}
              });
            ` : ''}
            ${url.searchParams.has('no-cookies')
    ? "Object.defineProperty(navigator,'cookieEnabled',{get:()=>false});" : ''}
            ${url.searchParams.has('blocked-identity-cookie') ? `
              Object.defineProperty(document,'cookie',{
                get(){return '';},
                set(){}
              });
            ` : ''}
            await decorate(document.querySelector('#widget'), {
              applyHostStyles(){}, reportSize(){}, hostContext:{},
              toolResult:Promise.resolve(${JSON.stringify(result)}),
              async openLink(url){window.handoffUrls.push(url);return {};},
            });
          </script></body></html>`,
      });
    }
    if (url.origin === aero && url.pathname === '/book/flights') {
      return route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html><head>
          <meta name="brand" content="wknd-aero"><title>Book flights</title>
          <script type="module" src="/scripts/scripts.js"></script>
          <link rel="stylesheet" href="/styles/styles.css">
          </head><body><header></header><main><div><div class="booking-journey"><div><div>Book your flight</div></div></div></div></main><footer></footer></body></html>`,
      });
    }
    if (url.origin === aero || url.origin === adventure) {
      const response = await route.fetch({
        url: `${base}${url.pathname}${url.search}`, maxRetries: 2,
      });
      const body = response.headers()['content-type']?.includes('text/html')
        ? (await response.text()).replace(/<script[^>]*src="[^"]*livereload[^"]*"[^>]*><\/script>/gi, '')
        : undefined;
      return route.fulfill({ response, ...(body === undefined ? {} : { body }) });
    }
    return route.continue();
  });
  // The widget is exercised inside an iframe without pop-up permission.
  await page.goto(`${base}/__journey-host`);
  const widget = page.frameLocator('iframe');
  await widget.locator('.da-cta-tertiary').waitFor();
  const widgetFrame = page.frames().find((frame) => frame.url().includes('/__journey-widget'));
  await widget.locator('.da-cta-tertiary').click();
  await widgetFrame.waitForFunction(() => window.handoffUrls.length === 1);
  const handoff = await widgetFrame.evaluate(() => window.handoffUrls[0]);
  assert.equal(new URL(handoff).searchParams.get('wj'), journey.id);
  await assert.doesNotReject(async () => {
    await widgetFrame.waitForFunction(() => document.querySelector('.da-cta-tertiary').disabled === false);
  });
  await page.waitForTimeout(500);
  await page.goto(handoff);
  await page.locator('.aero-options:visible a.primary').waitFor();
  await page.waitForFunction(() => typeof window.alloy === 'function');
  await page.waitForTimeout(1500);
  assert.equal(read('of1Search').length, 1);
  assert.equal(read('of1Results').length, 1);
  assert.equal(read('llmAppHandoff').length, 1, JSON.stringify({
    diagnostics,
    edgeUrls,
    sent: events.map((event) => ({ type: event.xdm?.eventType, data: event.data })),
  }));
  assert(events.every((event) => !JSON.stringify(event).includes('PRIVATE_INTENT')));
  const config = await page.evaluate(async () => {
    const analytics = await import('/scripts/analytics-page.js');
    const martech = await import('/scripts/martech-config.js');
    return {
      custom: analytics.getAnalyticsEnvironment('wknd-adventures.run.place'),
      unknown: analytics.getAnalyticsEnvironment('unknown.run.place'),
      urls: martech.getLaunchUrls(),
    };
  });
  assert.equal(config.custom, 'live');
  assert.equal(config.unknown, 'other');
  assert(config.urls[0].includes('launch-43614c033f3c.min.js'));
  await page.locator('.generative-suggestions:not(.dimmed) .suggestion-input').fill('Ohrid again');
  await page.locator('.generative-suggestions:not(.dimmed) .suggestion-input').press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.generative-suggestions').length === 2);
  await page.waitForTimeout(800);
  assert.equal(read('of1Search').length, 2);
  assert.equal(read('of1Results').length, 2);
  if (screenshots) await page.screenshot({ path: `${screenshots}/journey-of1.png`, fullPage: true });
  await page.locator('.aero-options:visible a.primary').last().click();
  await page.waitForURL(`${aero}/book/flights**`);
  assert.equal(new URL(page.url()).searchParams.get('wj'), journey.id);
  await page.locator('.flight-card').first().waitFor();
  await page.locator('.flight-card button').first().click();
  await page.locator('.seat:not([disabled])').first().click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('#pax-first').fill('Test');
  await page.locator('#pax-last').fill('Traveller');
  await page.locator('#pax-email').fill('PRIVATE_PASSENGER@example.com');
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await page.getByRole('tab', { name: /PayPal/i }).click();
  await page.getByRole('button', { name: 'Sign in to book', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Signed in to WKND' }).waitFor();
  const complete = page.getByRole('button', { name: 'Complete booking', exact: false });
  await complete.click();
  await page.getByRole('alert').waitFor();
  assert.equal(read('bookingComplete').length, 0);
  bookingMode = 'network';
  await complete.click();
  await page.waitForTimeout(300);
  assert.equal(read('bookingComplete').length, 0);
  bookingMode = 'invalid';
  await complete.click();
  await page.waitForTimeout(300);
  assert.equal(read('bookingComplete').length, 0);
  bookingMode = 'hold';
  await complete.evaluate((button) => { button.click(); button.click(); });
  await page.waitForFunction(() => document.querySelector('.booking-complete-btn').disabled);
  await new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      if (release) resolve();
      else if (attempts > 100) reject(new Error('Booking request did not arrive'));
      else {
        attempts += 1;
        setTimeout(check, 20);
      }
    };
    check();
  });
  assert.equal(posts, 4);
  assert.equal(read('bookingComplete').length, 0);
  release();
  await page.getByRole('heading', { name: 'Demo booking confirmed' }).waitFor();
  await page.waitForTimeout(600);
  assert.equal(read('bookingComplete').length, 1);
  assert.deepEqual(
    read('bookingError').map((event) => event.data.wkndJourney.reason),
    ['http', 'network', 'invalid-response'],
  );
  assert.equal(read('flightSearchStart').length, 1);
  assert.equal(read('bookingStart').length, 1);
  assert.deepEqual(read('bookingStep').map((event) => event.data.wkndJourney.step), [1, 2, 3]);
  assert(read('bookingComplete')[0].data.__adobe.analytics.events.includes(`event40:${confirmed.id}`));
  assert.equal(read('bookingComplete')[0].data.wkndJourney.total, confirmed.total);
  assert.equal(read('bookingComplete')[0].data.__adobe.analytics.eVar33, 'unassisted');
  assert.equal(read('bookingComplete')[0].data.__adobe.analytics.eVar30, journey.id);
  assert(events.every((event) => !JSON.stringify(event).includes('PRIVATE_PASSENGER')));
  await page.evaluate(async (booking) => {
    const { pushBookingEvent } = await import('/scripts/aero-analytics.js');
    pushBookingEvent('bookingComplete', { booking, onceKey: booking.id });
  }, confirmed);
  await page.waitForTimeout(300);
  assert.equal(read('bookingComplete').length, 1);
  if (screenshots) await page.screenshot({ path: `${screenshots}/journey-booked.png`, fullPage: true });
  console.log('PASS native widget handoff, real OF1 turns, captured Edge mapping, direct checkout, HTTP/network/invalid failures and deduplication');

  await page.goto(handoff);
  await page.locator('.aero-options:visible').waitFor();
  await page.evaluate(async () => {
    const { default: init } = await import('/scripts/concierge.js');
    await init();
  });
  await page.getByRole('button', { name: 'Chat with WKND Sherpa', exact: true }).click();
  const frame = page.frameLocator('.wknd-sherpa-frame');
  await frame.locator('.chat-input').waitFor();
  await frame.locator('.chat-input').fill('PRIVATE_CHAT');
  await frame.getByRole('button', { name: 'Send message' }).click();
  await page.waitForTimeout(400);
  assert.equal(read('sherpaOpen').length, 1);
  assert.equal(read('sherpaMessageAttempt').length, 1);
  assert(events.every((event) => !JSON.stringify(event).includes('PRIVATE_CHAT')));
  await frame.getByRole('link', { name: 'Flights' }).click();
  await page.waitForURL(`${aero}/book/flights**`);
  assert.equal(new URL(page.url()).searchParams.get('wja'), '1');
  assert.equal(new URL(page.url()).searchParams.get('wj'), journey.id);
  assert.equal(read('aeroHandoff').length, 2);
  await page.locator('.flight-card').first().waitFor();
  await page.waitForTimeout(500);
  assert.equal(read('bookingStart').at(-1).data.__adobe.analytics.eVar33, 'assisted');
  await page.reload();
  await page.locator('.flight-card').first().waitFor();
  assert.equal(await page.evaluate(async () => (
    (await import('/scripts/journey-analytics.js')).getJourney().assisted
  )), true);
  await page.goto(handoff);
  await page.locator('.aero-options:visible').waitFor();
  await page.evaluate(async () => {
    const block = document.createElement('div');
    block.className = 'flight-search';
    document.querySelector('main').append(block);
    const { default: decorate } = await import('/blocks/aero/flight-search/flight-search.js');
    await decorate(block);
    const select = block.querySelector('[name="destination"]');
    if (!select.querySelector('[value="OHD"]')) {
      select.add(new Option('Ohrid', 'OHD'));
    }
    select.value = 'OHD';
  });
  const searchesBeforeForm = read('flightSearchStart').length;
  await page.locator('.flight-search-form button[type="submit"]').click();
  await page.waitForURL(`${aero}/book/flights**`);
  assert(new URL(page.url()).searchParams.has('fsid'));
  assert.equal(new URL(page.url()).searchParams.get('wj'), journey.id);
  await page.locator('.flight-card').first().waitFor();
  await page.waitForTimeout(500);
  assert.equal(read('flightSearchStart').length - searchesBeforeForm, 1);
  assert.equal(read('aeroHandoff').length, 3);
  const undecorated = await page.evaluate(async (url) => {
    await window.alloy('setConsent', {
      consent: [{ standard: 'Adobe', version: '1.0', value: { general: 'out' } }],
    });
    return (await import('/scripts/journey-analytics.js')).decorateJourneyIdentity(url);
  }, `${aero}/book/flights?dest=PUQ`);
  assert(!new URL(undecorated).searchParams.has('adobe_mc'));
  assert.deepEqual(errors, []);
  console.log('PASS optional Sherpa open/send-attempt/Aero handoff, assisted reload and consent-out identity handling');

  // Each native SDK instance must finish before checking the shared event collector.
  /* eslint-disable no-restricted-syntax, no-await-in-loop */
  for (const variant of [
    'configured', 'identity-only', 'blocked-identity-cookie',
    'configured&blocked-identity-cookie', 'configured&consent-out',
    'blocked-identity-cookie&consent-out', 'blocked-identity-cookie&consent-pending',
    'blocked-identity-cookie&edge-failure', 'no-cookies',
  ]) {
    const extra = await context.newPage();
    extra.on('console', (message) => {
      if (['error', 'warning'].includes(message.type())) diagnostics.push(message.text());
    });
    extra.on('pageerror', (error) => errors.push(error.message));
    await extra.goto(`${base}/__journey-widget?${variant}`);
    await extra.locator('.da-cta-tertiary').waitFor();
    const before = read('llmAppHandoff').length;
    const clickedAt = Date.now();
    await extra.locator('.da-cta-tertiary').click();
    await extra.waitForFunction(() => window.handoffUrls.length === 1);
    assert(Date.now() - clickedAt < 2500, `${variant}: widget navigation was delayed`);
    await extra.waitForTimeout(500);
    const href = await extra.evaluate(() => window.handoffUrls[0]);
    assert.equal(new URL(href).searchParams.get('wj'), journey.id);
    const blocked = variant.includes('blocked-identity-cookie');
    const suppressed = variant === 'no-cookies' || variant.includes('consent-out')
      || variant.includes('consent-pending') || variant.includes('edge-failure');
    assert.equal(
      read('llmAppHandoff').length - before,
      suppressed ? 0 : 1,
      `${variant}: ${JSON.stringify(diagnostics)}`,
    );
    if (variant === 'no-cookies' || suppressed) {
      assert(!new URL(href).searchParams.has('adobe_mc'));
    }
    if (blocked && !suppressed) {
      const event = read('llmAppHandoff').at(-1);
      assert.equal(event.data.__adobe.analytics.events, 'event31');
      assert.equal(event.data.__adobe.analytics.eVar30, journey.id);
      assert.equal(event.xdm.identityMap.ECID[0].id, identity);
      assert.equal(await extra.evaluate(() => document.cookie), '');
      assert(new URL(href).searchParams.get('adobe_mc').includes(identity));
      await extra.locator('.da-cta-tertiary').click();
      await extra.waitForFunction(() => window.handoffUrls.length === 2);
      await extra.waitForTimeout(500);
      assert.equal(read('llmAppHandoff').length - before, 2);
    }
    if (screenshots && variant === 'blocked-identity-cookie') {
      for (const width of [375, 768, 1200]) {
        await extra.setViewportSize({ width, height: 800 });
        await extra.screenshot({ path: `${screenshots}/widget-cookies-${width}.png`, fullPage: true });
      }
    }
    await extra.close();
  }
  /* eslint-enable no-restricted-syntax, no-await-in-loop */
  assert.deepEqual(errors, []);
  const storagePage = await context.newPage();
  await storagePage.goto(`${base}/__journey-host`);
  const bounded = await storagePage.evaluate(async () => {
    const { getJourney, saveJourney, pushJourneyEvent } = await import('/scripts/journey-analytics.js');
    const first = getJourney();
    for (let index = 0; index < 300; index += 1) {
      pushJourneyEvent('bookingStart', { onceKey: index.toString() });
    }
    pushJourneyEvent('bookingStart', { onceKey: '299' });
    const keys = JSON.parse(sessionStorage.getItem('wknd:milestones')).keys.length;
    const count = window.adobeDataLayer.length;
    saveJourney({ ...first, id: crypto.randomUUID() });
    pushJourneyEvent('bookingStart', { onceKey: '299' });
    const reset = JSON.parse(sessionStorage.getItem('wknd:milestones')).keys.length;
    Object.defineProperty(window, 'sessionStorage', {
      get() { throw new DOMException('Blocked', 'SecurityError'); },
    });
    saveJourney({ ...first, id: crypto.randomUUID() });
    const memory = getJourney();
    return {
      keys, count, reset, retained: getJourney().id === memory.id,
    };
  });
  assert.deepEqual(bounded, {
    keys: 256, count: 300, reset: 1, retained: true,
  });
  await storagePage.close();
  console.log('PASS configured/identity-only/cookie-blocked SDK handling, widget consent, failed Edge navigation and bounded/blocked journey storage');
} finally {
  await browser.close();
  auth.restore();
}
