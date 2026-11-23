import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../scripts/commerce-config.js', import.meta.url), 'utf8');
const pilot = 'https://feat-aam-stage-pilot--masterclass-demo--znikolovski.aem.page';
const stageMesh = 'https://edge-sandbox-graph.adobe.io/api/fd2c6dc7-f3ce-426a-83bd-63227acbcdb4/graphql';
const productionMesh = 'https://edge-graph.adobe.io/api/46e0d9f5-4d7a-463d-bebb-678c9106d482/graphql';
const storage = (entries = []) => {
  const values = new Map(entries);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    values,
  };
};
let version = 0;
async function load(origin, session = storage(), local = storage()) {
  const cookies = [];
  globalThis.window = { location: { origin, pathname: '/shop/cart' }, sessionStorage: session, localStorage: local };
  globalThis.document = { set cookie(value) { cookies.push(value); } };
  try {
    const config = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${version++}`);
    return { config, cookies };
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
}

test('only the exact pilot origin selects Stage for both GraphQL clients, auth and Content AI', async () => {
  const { config } = await load(pilot);
  assert.equal(config.MESH_ENDPOINT, stageMesh);
  assert.equal(config.default.public.default['commerce-core-endpoint'], stageMesh);
  assert.equal(config.default.public.default['commerce-endpoint'], stageMesh);
  assert.equal(config.SHOP_AUTH_CONFIG_URL, 'https://28538-wkndcommerce-stage.adobeioruntime.net/api/v1/web/commerce/auth-config');
  assert.equal(config.CONTENT_AI_BASE, 'https://28538-wkndcommerce-stage.adobeioruntime.net/api/v1/web/commerce/content-ai');
  assert.equal(config.SHOP_PATHS.cart, '/shop/cart');
});

test('canonical, local, other previews and near-matching origins retain Production and all storage', async () => {
  for (const origin of [
    'https://wknd-adventures.run.place', 'http://localhost:3000',
    'https://main--masterclass-demo--znikolovski.aem.page',
    pilot.replace('.page', '.live'), pilot.replace('https:', 'http:'),
    `${pilot}:8443`, `${pilot}.example.com`,
  ]) {
    const session = storage([['DROPINS_CART_ID', 'production-cart']]);
    const local = storage([['wknd:cart-count', '3']]);
    const { config, cookies } = await load(origin, session, local);
    assert.equal(config.MESH_ENDPOINT, productionMesh, origin);
    assert.equal(config.default.public.default['commerce-core-endpoint'], productionMesh);
    assert.equal(config.default.public.default['commerce-endpoint'], productionMesh);
    assert.equal(config.SHOP_AUTH_CONFIG_URL, 'https://28538-wkndcommerce.adobeioruntime.net/api/v1/web/commerce/auth-config');
    assert.equal(config.CONTENT_AI_BASE, 'https://28538-wkndcommerce.adobeioruntime.net/api/v1/web/commerce/content-ai');
    assert.deepEqual([...session.values], [['DROPINS_CART_ID', 'production-cart']]);
    assert.deepEqual([...local.values], [['wknd:cart-count', '3']]);
    assert.deepEqual(cookies, []);
  }
});

test('legacy pilot cart caches are invalidated, Stage reloads and unrelated storage survive', async () => {
  const session = storage([
    ['DROPINS_CART_ID', 'production-cart'],
    ['DROPIN__CART__CART__DATA', '{"id":"production-cart"}'],
    ['DROPIN__CART__SHIPPING__DATA', '{"country":"AU"}'],
    ['unrelated', 'keep'],
  ]);
  const local = storage([
    ['DROPIN__CART__CART__AUTHENTICATED', 'true'], ['wknd:cart-count', '3'],
    ['consent', 'unchanged'], ['auth', 'unchanged'],
  ]);
  const first = await load(pilot, session, local);
  assert.deepEqual([...session.values], [['unrelated', 'keep'], ['wknd:cart-environment', stageMesh]]);
  assert.deepEqual([...local.values], [
    ['consent', 'unchanged'], ['auth', 'unchanged'], ['wknd:cart-environment', stageMesh],
  ]);
  assert.deepEqual(first.cookies, ['DROPIN__CART__CART-ID=; path=/; max-age=0; SameSite=Lax; Secure']);
  session.setItem('DROPINS_CART_ID', 'stage-cart');
  session.setItem('DROPIN__CART__CART__DATA', '{"id":"stage-cart"}');
  local.setItem('wknd:cart-count', '2');
  const reload = await load(pilot, session, local);
  assert.equal(session.getItem('DROPINS_CART_ID'), 'stage-cart');
  assert.equal(session.getItem('DROPIN__CART__CART__DATA'), '{"id":"stage-cart"}');
  assert.equal(local.getItem('wknd:cart-count'), '2');
  assert.deepEqual(reload.cookies, []);

  const oldTab = storage([['DROPIN__CART__CART__DATA', '{"id":"production-cart"}']]);
  const otherTab = await load(pilot, oldTab, local);
  assert.equal(oldTab.getItem('DROPIN__CART__CART__DATA'), null);
  assert.equal(local.getItem('wknd:cart-count'), '2');
  assert.deepEqual(otherTab.cookies, []);
});
