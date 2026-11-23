/* eslint-env node */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

function inlineModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}

async function sourceModule(path, imports = {}) {
  let source = await readFile(new URL(path, import.meta.url), 'utf8');
  Object.entries(imports).forEach(([specifier, replacement]) => {
    source = source.replaceAll(`'${specifier}'`, `'${replacement}'`);
  });
  return import(inlineModule(source));
}

const nativeURL = inlineModule(await readFile(new URL('../../scripts/native-context.js', import.meta.url), 'utf8'));
const personURL = inlineModule(await readFile(new URL('../../scripts/person-binding.js', import.meta.url), 'utf8'));
const customerSource = await readFile(new URL('../../scripts/customer-identity.js', import.meta.url), 'utf8');
const customerURL = inlineModule(customerSource.replace("'./person-binding.js'", `'${personURL}'`));
const native = await import(nativeURL);
const customer = await import(customerURL);
global.window = { location: { origin: 'https://wknd-adventures.run.place' } };
assert.equal(native.getNativeContext(), null);
assert.equal(native.applyNativeContext({}), true);
window.wkndNativeContext = { collect: false, personalize: false };
assert.equal(native.applyNativeContext({}), false);
window.wkndNativeContext = {
  collect: true,
  personalize: false,
  identity: { namespace: 'wkndCustomerId', id: 'opaque-account' },
};
const event = {};
assert.equal(native.applyNativeContext(event), true);
assert.deepEqual(event, {});
window.location.origin = 'https://unrelated.example';
assert.equal(native.getNativeContext(), null);
window.location.origin = 'https://wknd-adventures.run.place';
window.wkndNativeContext = { collect: 'yes', personalize: true };
assert.equal(native.getNativeContext(), null);

customer.updateCustomerIdentity({ sub: 'account' });
const configured = {};
customer.applyCustomerIdentity(configured);
assert.deepEqual(configured, {});
const pendingIdentity = {
  xdm: { identityMap: { wkndCustomerId: [{ id: 'legacy-account' }], ECID: [{ id: 'existing-device' }] } },
};
customer.applyCustomerIdentity(pendingIdentity);
assert.deepEqual(pendingIdentity.xdm.identityMap, { ECID: [{ id: 'existing-device' }] });
customer.updateCustomerIdentity(null);
const signedOut = {};
customer.applyCustomerIdentity(signedOut);
assert.deepEqual(signedOut, {});
await customer.restoreCustomerIdentity(async () => ({
  sub: 'restored-account', email: 'not-for-analytics@example.invalid', accessToken: 'not-for-analytics',
}));
const restored = {};
customer.applyCustomerIdentity(restored);
assert.deepEqual(restored, {});

[{}, { sub: '' }, { sub: 123 }, { sub: 'x'.repeat(257) }].forEach((profile) => {
  customer.updateCustomerIdentity(profile);
  const invalid = {};
  customer.applyCustomerIdentity(invalid);
  assert.deepEqual(invalid, {});
});

async function verifyLateProfileCannotReplaceIdentity(nextProfile) {
  let finish;
  const pending = customer.restoreCustomerIdentity(() => new Promise((resolve) => {
    finish = resolve;
  }));
  customer.updateCustomerIdentity(nextProfile);
  finish({ sub: 'old-account' });
  await pending;
  const current = {};
  customer.applyCustomerIdentity(current);
  assert.deepEqual(current, {});
}
await verifyLateProfileCannotReplaceIdentity(null);
await verifyLateProfileCannotReplaceIdentity({ sub: 'new-account' });

await assert.rejects(customer.restoreCustomerIdentity(async () => {
  throw new Error('Profile unavailable');
}), /Profile unavailable/);
const unavailable = {};
customer.applyCustomerIdentity(unavailable);
assert.deepEqual(unavailable, {});

global.profileLoads = 0;
global.document = { cookie: 'auth_dropin_user_token=test-token' };
const shop = await sourceModule('../../scripts/shop-auth.js', {
  './wknd-auth.js': inlineModule(`
    export function configureAuth() {}
    export async function getAccessToken() { throw new Error('Unexpected token refresh'); }
    export async function getUserProfile() {
      globalThis.profileLoads += 1;
      return { sub: 'cookie-account' };
    }
    export function hasSignedInBefore() { return false; }
    export async function restoreSession() { throw new Error('Unexpected session refresh'); }
    export async function signIn() {}
    export async function signOut() {}
  `),
  './commerce-config.js': inlineModule('export const SHOP_AUTH_CONFIG_URL = "https://auth.example.invalid/config";'),
  './account-state.js': inlineModule(`
    export const ACCOUNT_PATH = '/account';
    export function clearAccountState() {}
    export function setAccountState() {}
  `),
  './shop-analytics.js': inlineModule('export function pushShopEvent() {}'),
  './customer-identity.js': customerURL,
  './person-binding.js': personURL,
});
assert.equal(await shop.restoreShopSession(), true);
assert.equal(global.profileLoads, 1);
const cookieAccount = {};
customer.applyCustomerIdentity(cookieAccount);
assert.deepEqual(cookieAccount, {});
customer.updateCustomerIdentity(null);
assert.equal(shop.syncShopSession(), true);
await new Promise(setImmediate);
assert.equal(global.profileLoads, 2);
const backgroundAccount = {};
customer.applyCustomerIdentity(backgroundAccount);
assert.deepEqual(backgroundAccount, {});

const { WEB_SDK_CONFIG } = await sourceModule('../../scripts/martech-config.js', {
  './analytics-page.js': inlineModule(`
    export function mapPageToAnalytics() { return true; }
    export function isAemProductionHost() { return false; }
  `),
  './native-context.js': nativeURL,
  './customer-identity.js': customerURL,
});
customer.updateCustomerIdentity({ sub: 'browser-account' });
delete window.wkndNativeContext;
const standalone = {};
assert.equal(WEB_SDK_CONFIG.onBeforeEventSend(standalone), true);
assert.deepEqual(standalone, {});
window.wkndNativeContext = { collect: true, personalize: true };
const anonymousNative = {};
assert.equal(WEB_SDK_CONFIG.onBeforeEventSend(anonymousNative), true);
assert.deepEqual(anonymousNative, {});
window.wkndNativeContext.identity = { namespace: 'wkndCustomerId', id: 'native-account' };
const signedInNative = {};
assert.equal(WEB_SDK_CONFIG.onBeforeEventSend(signedInNative), true);
assert.deepEqual(signedInNative, {});
const legacyNative = {
  xdm: { identityMap: { wkndCustomerId: [{ id: 'legacy-native' }], ECID: [{ id: 'existing-device' }] } },
};
assert.equal(WEB_SDK_CONFIG.onBeforeEventSend(legacyNative), true);
assert.deepEqual(legacyNative.xdm.identityMap, { ECID: [{ id: 'existing-device' }] });
window.wkndNativeContext = { collect: false, personalize: false };
assert.equal(WEB_SDK_CONFIG.onBeforeEventSend({}), false);
console.log('Native collection consent and unverified customer identity suppression passed.'); // eslint-disable-line no-console
