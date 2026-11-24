import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
// eslint-disable-next-line import/no-extraneous-dependencies -- Existing browser test tooling.
import { chromium } from 'playwright';
import { applyAamPageSignals } from '../../scripts/martech-config.js';

test('Production page views send canonical, allowlisted signals without mutating ACDL', () => {
  global.window = { location: { hostname: 'wknd-adventures.run.place', origin: 'https://wknd-adventures.run.place' } };
  try {
    [
      ['climbing', 'inspiration'], ['general-outdoor', 'planning'],
    ].forEach(([adventureCategory, journeyStage]) => {
      const page = {
        environment: 'live', adventureCategory, journeyStage, account: 'not-an-audience-signal',
      };
      const content = {
        xdm: { page, web: { webPageDetails: { pageViews: { value: 1 } } } },
        data: { __adobe: { analytics: { prop1: 'live' }, target: { existing: 'value' } } },
      };
      assert.equal(applyAamPageSignals(content), true);
      assert.equal(content.xdm.eventType, 'web.webpagedetails.pageViews');
      assert.equal(content.xdm.page.environment, 'production');
      assert.equal(page.environment, 'live');
      // eslint-disable-next-line no-underscore-dangle -- Reserved Web SDK service node.
      const adobe = content.data.__adobe;
      assert.equal(adobe.analytics.prop1, 'live');
      assert.deepEqual(adobe.target, { existing: 'value' });
      assert.deepEqual(adobe.audiencemanager, {
        eventType: 'web.webpagedetails.pageViews',
        'page.environment': 'production',
        'page.adventureCategory': adventureCategory,
        'page.journeyStage': journeyStage,
      });
      assert.equal(content.xdm.identityMap, undefined);
    });
  } finally {
    delete global.window;
  }
});

test('explicit events, native contexts and preview hosts are not rewritten', () => {
  try {
    [
      ['wknd-adventures.run.place', undefined, 'web.webinteraction.linkClicks'],
      ['wknd-adventures.run.place', undefined, 'commerce.purchases'],
      ['wknd-adventures.run.place', undefined, 'decisioning.propositionDisplay'],
      ['wknd-adventures.run.place', { collect: true, personalize: false }, 'web.webpagedetails.pageViews'],
      ['main--masterclass-demo--znikolovski.aem.page', undefined, 'web.webpagedetails.pageViews'],
    ].forEach(([hostname, native, eventType]) => {
      global.window = {
        location: { hostname, origin: `https://${hostname}` }, wkndNativeContext: native,
      };
      const content = {
        xdm: { eventType, page: { environment: 'live' }, web: { webPageDetails: { pageViews: { value: 1 } } } },
      };
      const before = structuredClone(content);
      assert.equal(applyAamPageSignals(content), true);
      assert.deepEqual(content, before);
    });
    global.window = { location: { hostname: 'wknd-adventures.run.place' } };
    const content = { xdm: { web: { webPageDetails: { pageViews: { value: 0 } } } } };
    assert.equal(applyAamPageSignals(content), true);
    assert.equal(content.xdm.eventType, undefined);
    assert.equal(content.data, undefined);
  } finally {
    delete global.window;
  }
});

test('initial collection awaits read-only identity status only for existing Production web sessions', async () => {
  const source = await readFile(new URL('../../scripts/scripts.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function loadMartech(');
  const end = source.indexOf('\n/**', start);
  const initialization = source.slice(start, end).replace("await import('./shop-auth.js')", 'await getAuthModule()');
  await Promise.all([
    [true, null, true, true, true],
    [true, null, true, false, false],
    [false, null, true, true, false],
    [true, { collect: true }, true, true, false],
    [true, null, false, true, false],
  ].map(async ([production, native, analytics, token, expected]) => {
    let resolveStatus;
    let initialized = false;
    let restoration;
    const status = new Promise((resolve) => { resolveStatus = resolve; });
    const context = {
      martechLoadedPromise: null,
      isMartechConfigured: () => true,
      getMartechModule: async () => ({
        initMartech: async () => { initialized = true; },
        updateUserConsent: () => undefined,
      }),
      getAuthModule: async () => ({
        hasShopToken: () => token,
        getShopProfile: (options) => { restoration = options; return status; },
      }),
      getNativeContext: () => native,
      isAemProductionHost: () => production,
      WEB_SDK_CONFIG: {},
      isPersonalizationEnabled: () => false,
      isAnalyticsEnabled: () => analytics,
      shouldProcessDataLayerEvent: () => true,
      getLaunchUrls: () => [],
      getTargetDecisionScopes: () => [],
      buildTargetApplyMetadata: () => ({}),
      isConsentGiven: () => false,
    };
    const initialize = runInNewContext(`${initialization}; loadMartech`, context);
    const pending = initialize({ querySelector: () => null });
    await new Promise(setImmediate);
    assert.equal(!!restoration, expected);
    if (restoration) assert.equal(restoration.identityStatusOnly, true);
    assert.equal(initialized, !expected);
    resolveStatus();
    await pending;
    assert.equal(initialized, true);
  }));
});

test('header and collection restoration share the pending binding instead of invalidating each other', async () => {
  const source = await readFile(new URL('../../scripts/shop-auth.js', import.meta.url), 'utf8');
  const start = source.indexOf('export function getShopProfile(');
  const end = source.indexOf('\nasync function storeToken', start);
  const helper = source.slice(start, end).replace('export function', 'function');
  await Promise.all([true, false].map(async (identityStatusOnly) => {
    let resolveStatus;
    const operations = [];
    const status = new Promise((resolve) => { resolveStatus = resolve; });
    const context = {
      profilePromise: undefined,
      SHOP_AUTH_CONFIG_URL: 'test-auth-config',
      getUserProfile: async () => ({ sub: 'not-projected-to-adobe' }),
      getAccessToken: async () => 'test-shopper-bearer',
      restoreCustomerIdentity: async (getProfile, getStatus) => {
        const profile = await getProfile();
        await getStatus();
        return profile;
      },
      requestPersonBinding: (operation) => { operations.push(operation); return status; },
    };
    const getProfile = runInNewContext(`${helper}; getShopProfile`, context);
    const first = getProfile({ identityStatusOnly });
    assert.equal(getProfile({ identityStatusOnly: !identityStatusOnly }), first);
    await new Promise(setImmediate);
    assert.deepEqual(operations, [identityStatusOnly ? 'person-status' : 'person-binding']);
    resolveStatus();
    await first;
    await getProfile();
    assert.equal(operations.at(-1), 'person-binding');
    assert.equal(operations.length, 2);
  }));
});

test('the actual martech page-view beacon carries canonical signals and the existing server alias', async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  await Promise.all([
    ['climbing', 'inspiration'], ['general-outdoor', 'planning'],
  ].map(async ([adventureCategory, journeyStage]) => {
    const page = await browser.newPage();
    const diagnostics = [];
    page.on('console', (message) => {
      if (message.type() === 'error') diagnostics.push(message.text());
    });
    page.on('requestfailed', (request) => {
      diagnostics.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText}`);
    });
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === 'edge.adobedc.net') {
        return route.fulfill({
          status: url.pathname.endsWith('/collect') ? 204 : 200,
          contentType: 'application/json',
          headers: {
            'Access-Control-Allow-Origin': 'https://wknd-adventures.run.place',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'content-type',
          },
          body: url.pathname.endsWith('/collect') ? undefined : JSON.stringify({
            handle: [{
              type: 'state:store',
              payload: [{
                key: 'kndctr_28260E2056581D3B7F000101_AdobeOrg_consent',
                value: 'general=in',
                maxAge: 1800,
              }, {
                key: 'kndctr_28260E2056581D3B7F000101_AdobeOrg_identity',
                value: 'fixture-identity',
                maxAge: 1800,
              }],
            }],
          }),
        });
      }
      if (url.origin !== 'https://wknd-adventures.run.place') return route.abort();
      if (url.pathname === '/gear') {
        return route.fulfill({ contentType: 'text/html', body: '<title>Gear</title><main></main>' });
      }
      if (!/^\/(?:scripts|plugins\/martech\/src)\/[\w/.-]+\.js$/.test(url.pathname)) return route.abort();
      return route.fulfill({
        contentType: 'text/javascript',
        body: await readFile(new URL(`../../${url.pathname.slice(1)}`, import.meta.url), 'utf8'),
      });
    });
    await page.goto('https://wknd-adventures.run.place/gear');
    await page.evaluate(async ({ category, stage }) => {
      window.beacons = [];
      const originalFetch = window.fetch.bind(window);
      window.fetch = (url, options) => {
        if (String(url).includes('edge.adobedc.net') && options?.body) {
          const payload = JSON.parse(options.body);
          if (payload.events) window.beacons.push(payload);
        }
        return originalFetch(url, options);
      };
      const sendBeacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = (url, body) => {
        if (url.includes('edge.adobedc.net')) {
          Promise.resolve(body instanceof Blob ? body.text() : body)
            .then((text) => window.beacons.push(JSON.parse(text)));
        }
        return sendBeacon(url, body);
      };
      window.adobeDataLayer = [{
        page: { environment: 'live', adventureCategory: category, journeyStage: stage },
      }];
      const bindingURL = '/scripts/person-binding.js';
      const { requestPersonBinding } = await import(bindingURL);
      await requestPersonBinding('person-status', {
        getToken: async () => 'test-shopper-bearer',
        fetchImpl: async (url, request) => {
          if (JSON.parse(request.body).op !== 'person-status') throw new Error('Unexpected issuance');
          const issued = Date.now();
          return {
            ok: true,
            json: async () => ({
              apiVersion: 'wknd.person-binding/v1',
              purpose: 'idLinkage',
              environment: 'production',
              status: 'ok',
              consent: 'granted',
              evidence: false,
              financialAuthorization: false,
              semanticAllowlist: [],
              binding: {
                source: 'server-issued',
                purpose: 'idLinkage',
                personAlias: `wpa_${'a'.repeat(32)}`,
                environment: 'production',
                runtimeNamespace: '28538-wkndcommerce',
                orgId: '28260E2056581D3B7F000101@AdobeOrg',
                dpid: '1547309',
                namespace: 'wkndCustomerId',
                issuer: 'https://28538-wkndcommerce.adobeioruntime.net/api/v1/web/commerce/target-diagnostic',
                consentGeneration: '12345678-1234-4234-8234-123456789012',
                issuedAt: new Date(issued).toISOString(),
                expiresAt: new Date(issued + 300000).toISOString(),
                freshnessMs: 300000,
              },
            }),
          };
        },
      });
      const configURL = '/scripts/martech-config.js';
      const { WEB_SDK_CONFIG } = await import(configURL);
      const martechURL = '/plugins/martech/src/index.js';
      const { initMartech, martechLazy, updateUserConsent } = await import(martechURL);
      await initMartech({ ...WEB_SDK_CONFIG, thirdPartyCookiesEnabled: false }, {
        personalization: false, launchUrls: [],
      });
      await martechLazy();
      await updateUserConsent({
        collect: true, personalize: false, marketing: false, share: false,
      });
    }, { category: adventureCategory, stage: journeyStage });
    await page.waitForFunction(() => window.beacons.length > 0, null, { timeout: 5000 })
      .catch((error) => { throw new Error(`${error.message}; ${diagnostics.join('; ')}`); });
    const events = await page.evaluate(
      () => window.beacons.flatMap((payload) => payload.events || []),
    );
    assert.equal(events.length, 1);
    const [event] = events;
    assert.equal(event.xdm.eventType, 'web.webpagedetails.pageViews');
    assert.equal(event.xdm.page.environment, 'production');
    assert.equal(event.xdm.page.adventureCategory, adventureCategory);
    assert.equal(event.xdm.page.journeyStage, journeyStage);
    assert.deepEqual(event.xdm.identityMap.wkndCustomerId, [{
      id: `wpa_${'a'.repeat(32)}`, authenticatedState: 'authenticated', primary: true,
    }]);
    // eslint-disable-next-line no-underscore-dangle -- Reserved Web SDK service node.
    const adobe = event.data.__adobe;
    assert.equal(adobe.analytics.prop1, 'live');
    assert.equal(adobe.audiencemanager['page.environment'], 'production');
    assert.equal(Object.keys(adobe.audiencemanager).length, 4);
    assert.deepEqual(diagnostics, []);
    await page.close();
  }));
});
