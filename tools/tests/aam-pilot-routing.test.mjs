import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import {
  AAM_PILOT_HOST, isAamPilotHost, applyAamPilotSignals,
} from '../../scripts/martech-config.js';
import { applyCustomerIdentity, updateCustomerIdentity } from '../../scripts/customer-identity.js';

test('only the dedicated preview host selects the AAM pilot', () => {
  assert.equal(isAamPilotHost(AAM_PILOT_HOST), true);
  for (const host of [
    'main--masterclass-demo--znikolovski.aem.page',
    'main--masterclass-demo--znikolovski.aem.live',
    'wknd-adventures.run.place',
    'localhost',
    `${AAM_PILOT_HOST}.example.com`,
  ]) assert.equal(isAamPilotHost(host), false);
});

test('SDK configuration routes the pilot to Stage and keeps every other host unchanged', async () => {
  try {
    for (const hostname of [
      AAM_PILOT_HOST,
      'main--masterclass-demo--znikolovski.aem.page',
      'main--masterclass-demo--znikolovski.aem.live',
      'wknd-adventures.run.place',
      'localhost',
    ]) {
      globalThis.window = { location: { hostname } };
      const { WEB_SDK_CONFIG } = await import(`../../scripts/martech-config.js?host=${hostname}`);
      assert.equal(WEB_SDK_CONFIG.datastreamId, hostname === AAM_PILOT_HOST
        ? '77b2a52a-e8b9-4333-8d3b-f539db7acc11'
        : '56dee4fc-21a9-4e37-83ab-bdd874957aba');
    }
  } finally {
    delete globalThis.window;
  }
});

test('pilot page views retain only audience signals, not data-layer identities', () => {
  const identity = [{ id: 'test-subject', authenticatedState: 'authenticated', primary: true }];
  const content = {
    xdm: {
      eventType: 'web.webpagedetails.pageViews',
      page: {
        adventureCategory: 'climbing', journeyStage: 'planning', environment: 'production',
        unrelated: 'not-forwarded',
      },
      asset: { name: 'not-forwarded' },
      interaction: { text: 'not-forwarded' },
      identityMap: { wkndCustomerId: identity, arbitrary: [{ id: 'not-forwarded' }] },
    },
    data: { unrelated: 'not-forwarded' },
  };
  assert.equal(applyAamPilotSignals(content), true);
  assert.deepEqual(content, {
    xdm: {
      eventType: 'web.webpagedetails.pageViews',
      page: { adventureCategory: 'climbing', journeyStage: 'planning', environment: 'preview' },
    },
    data: { __adobe: { target: {} } },
  });
});

test('pilot identity comes from the current profile and is removed after logout', () => {
  const stale = [{ id: 'previous-user', authenticatedState: 'authenticated', primary: true }];
  const event = () => ({
    xdm: { eventType: 'web.webpagedetails.pageViews', identityMap: { wkndCustomerId: stale } },
  });
  updateCustomerIdentity({ sub: 'current-user' });
  const signedIn = event();
  applyAamPilotSignals(signedIn);
  applyCustomerIdentity(signedIn);
  assert.equal(signedIn.xdm.identityMap.wkndCustomerId[0].id, 'current-user');
  updateCustomerIdentity(null);
  const signedOut = event();
  applyAamPilotSignals(signedOut);
  applyCustomerIdentity(signedOut);
  assert.equal(Object.hasOwn(signedOut.xdm, 'identityMap'), false);
});

test('anonymous page views remain anonymous and non-page events are not collected', () => {
  const content = { xdm: { eventType: 'web.webpagedetails.pageViews' } };
  assert.equal(applyAamPilotSignals(content), true);
  assert.equal(Object.hasOwn(content.xdm, 'identityMap'), false);
  for (const eventType of [undefined, 'commerce.purchases', 'decisioning.propositionDisplay']) {
    assert.equal(applyAamPilotSignals({ xdm: { eventType } }), false);
  }
});

test('pilot collection waits for profile restoration; other hosts and native do not', async () => {
  const source = await readFile(new URL('../../scripts/scripts.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function loadMartech(');
  const end = source.indexOf('\n/**', start);
  await Promise.all([
    [AAM_PILOT_HOST, null, true],
    ['main--masterclass-demo--znikolovski.aem.page', null, false],
    [AAM_PILOT_HOST, { surface: 'native' }, false],
  ].map(async ([hostname, native, expectedRestore]) => {
    let finishProfile;
    let restored = false;
    let initialized = false;
    const profile = new Promise((resolve) => { finishProfile = resolve; });
    const martech = {
      initMartech: () => { initialized = true; },
      updateUserConsent: () => undefined,
    };
    // Substitute only the auth module boundary; exercise the real initialization ordering.
    const authSource = source.slice(start, end).replace(
      "await import('./shop-auth.js')", 'await getAuthModule()',
    );
    const context = {
      martechLoadedPromise: null,
      isMartechConfigured: () => true,
      getMartechModule: async () => martech,
      getAuthModule: async () => ({
        hasShopToken: () => true,
        getShopProfile: () => { restored = true; return profile; },
      }),
      window: { location: { hostname } },
      isAamPilotHost,
      getNativeContext: () => native,
      WEB_SDK_CONFIG: {},
      isPersonalizationEnabled: () => false,
      isAnalyticsEnabled: () => true,
      shouldProcessDataLayerEvent: () => true,
      getLaunchUrls: () => [],
      getTargetDecisionScopes: () => [],
      buildTargetApplyMetadata: () => ({}),
      isConsentGiven: () => false,
    };
    const initialize = runInNewContext(`${authSource}; loadMartech`, context);
    const pending = initialize({ querySelector: () => null });
    await new Promise((resolve) => { setImmediate(resolve); });
    assert.equal(restored, expectedRestore);
    assert.equal(initialized, !expectedRestore);
    finishProfile();
    await pending;
    assert.equal(initialized, true);
  }));
});
