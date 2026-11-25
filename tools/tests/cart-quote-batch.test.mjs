import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import install, { BUNDLE_COMPLETION_FIELD } from '../../scripts/cart-quote-batch.js';

const address = { country_code: 'AU', postcode: '2000', region: { region: '' } };
const method = { carrier_code: 'standard', method_code: 'standard' };
const money = (value) => ({ currency: 'AUD', value });
const cart = (value) => ({ id: 'fixture-cart', prices: { grand_total: money(value) } });
const shipping = (value, identity = method) => [{
  ...identity,
  amount: money(value),
  price_excl_tax: money(value),
  price_incl_tax: money(value),
  error_message: null,
}];
const query = (name, field) => `mutation ${name}(
  $cartId: String!, $cartItems: [CartItemUpdateInput!]!,
  $itemsSortInput: QuoteItemsSortInput! = {field: CREATED_AT, order: DESC}
) {
  ${field}(input: {cart_id: $cartId, cart_items: $cartItems}) {
    cart { ...CART_FRAGMENT } errors { code message }
  }
}
fragment CART_FRAGMENT on Cart { id prices { grand_total { value currency } } }`;
const UPDATE = query('UPDATE_PRODUCTS_FROM_CART_MUTATION', 'updateCartItems');
const ADD = `mutation ADD_PRODUCTS_TO_CART_MUTATION(
  $cartId: String!, $cartItems: [CartItemInput!]!, $pageSize: Int! = 100
) {
  addProductsToCart(cartId: $cartId, cartItems: $cartItems) {
    cart { ...CART_FRAGMENT } user_errors { code message }
  }
}
fragment CART_FRAGMENT on Cart { id prices { grand_total { value currency } } }`;
const bundleIntent = {
  cartId: 'fixture-cart', promotionId: 'fixture-promotion', bundleId: 'fixture-bundle', cartVersion: 'v3',
};
const bundleOptions = {
  variables: {
    cartId: 'fixture-cart',
    pageSize: 100,
    cartItems: [{ sku: 'fixture-jacket', quantity: 1, [BUNDLE_COMPLETION_FIELD]: bundleIntent }],
  },
};
const SHIPPING = 'mutation ESTIMATE_SHIPPING_METHODS_MUTATION { estimateShippingMethods }';
const TOTALS = 'mutation GET_ESTIMATED_TOTALS_MUTATION { estimateTotals }';
const estimateOptions = {
  variables: { cartId: 'fixture-cart', address, shipping_method: method },
};
const editOptions = {
  variables: { cartId: 'fixture-cart', cartItems: [{ cart_item_uid: 'line-one', quantity: 2 }] },
  cache: 'no-store',
};

async function fixture(overrides = {}) {
  const calls = [];
  const statuses = [];
  let edits = 0;
  let invalidate;
  const client = {
    async fetchGraphQl(document, options) {
      calls.push({ document, options });
      if (document.includes('$wkndCartEstimate:')) {
        edits += 1;
        const custom = typeof overrides.batch === 'function'
          ? await overrides.batch(edits) : overrides.batch;
        return custom || {
          data: {
            updateCartItems: { cart: cart(39.90), errors: [] },
            shipping: shipping(overrides.shippingAmount ?? 9.95, overrides.method || method),
            estimated: { cart: cart(overrides.estimatedAmount ?? 49.85) },
          },
        };
      }
      if (document === SHIPPING) {
        const identity = edits ? overrides.method || method : method;
        return { data: { estimateShippingMethods: shipping(9.95, identity) } };
      }
      if (document === TOTALS) return { data: { estimateTotals: { cart: cart(49.85) } } };
      return { data: { updateCartItems: { cart: cart(0), errors: [] } } };
    },
  };
  install(client, {
    getCartDataFromCache: () => ({ items: [{ uid: 'line-one' }] }),
    getRequestContext: overrides.context || (() => null),
    registerInvalidation: (handler) => { invalidate = handler; },
    onEstimateError: () => statuses.push('error'),
    onEstimateSuccess: () => statuses.push('success'),
  });
  await client.fetchGraphQl(SHIPPING, estimateOptions);
  await client.fetchGraphQl(TOTALS, estimateOptions);
  calls.length = 0;
  statuses.length = 0;
  return {
    client, calls, statuses, invalidate: () => invalidate(),
  };
}

test('one ordered request preserves mutation output and supplies fresh shipping-inclusive totals', async () => {
  const { client, calls } = await fixture();
  const updated = await client.fetchGraphQl(UPDATE, editOptions);
  const methods = await client.fetchGraphQl(SHIPPING, estimateOptions);
  const estimated = await client.fetchGraphQl(TOTALS, estimateOptions);
  assert.equal(updated.data.updateCartItems.cart.prices.grand_total.value, 39.90);
  assert.equal(updated.errors, undefined);
  assert.equal(methods.data.estimateShippingMethods[0].amount.value, 9.95);
  assert.equal(estimated.data.estimateTotals.cart.prices.grand_total.value, 49.85);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.cache, 'no-store');
  assert.deepEqual(calls[0].options.variables.cartItems, editOptions.variables.cartItems);
  assert.deepEqual(calls[0].options.variables.wkndCartEstimate, {
    cart_id: 'fixture-cart', address, shipping_method: method,
  });
  const { document } = calls[0];
  assert.ok(document.indexOf('updateCartItems(') < document.indexOf('shipping:'));
  assert.ok(document.indexOf('shipping:') < document.indexOf('estimated:'));
  assert.ok(document.indexOf('estimated:') < document.indexOf('fragment CART_FRAGMENT'));
});

test('explicit bundle intent selects the atomic operation with no client quantities on the wire', async () => {
  const { client, calls } = await fixture({
    batch: {
      data: {
        addProductsToCart: { cart: cart(445.50), user_errors: [] },
        shipping: shipping(0),
        estimated: { cart: cart(445.50) },
      },
    },
  });
  const result = await client.fetchGraphQl(ADD, bundleOptions);
  assert.equal(result.data.addProductsToCart.cart.prices.grand_total.value, 445.50);
  await client.fetchGraphQl(SHIPPING, estimateOptions);
  await client.fetchGraphQl(TOTALS, estimateOptions);
  assert.equal(calls.length, 1);
  const { document, options } = calls[0];
  assert.match(document, /addProductsToCart:\s*completeWkndBundle\(/);
  assert.doesNotMatch(document, /\$cartItems/);
  assert.equal(options.variables.cartItems, undefined);
  assert.equal(options.variables.wkndBundlePromotion, 'fixture-promotion');
  assert.equal(options.variables.wkndBundleId, 'fixture-bundle');
  assert.equal(options.variables.wkndBundleVersion, 'v3');
  assert.equal(options.variables.pageSize, 100);
  assert.ok(document.indexOf('completeWkndBundle(') < document.indexOf('shipping:'));
  assert.ok(document.indexOf('shipping:') < document.indexOf('estimated:'));
});

test('bundle without a selected destination still uses the atomic operation', async () => {
  const calls = [];
  const client = {
    async fetchGraphQl(document, options) {
      calls.push({ document, options });
      return { data: { addProductsToCart: { cart: cart(445.50), user_errors: [] } } };
    },
  };
  install(client, { getCartDataFromCache: () => ({ items: [] }) });
  const result = await client.fetchGraphQl(ADD, bundleOptions);
  assert.equal(result.data.addProductsToCart.cart.prices.grand_total.value, 445.50);
  assert.equal(calls.length, 1);
  assert.match(calls[0].document, /addProductsToCart:\s*completeWkndBundle\(/);
  assert.doesNotMatch(calls[0].document, /\$wkndCartEstimate:|\$cartItems/);
  assert.equal(calls[0].options.variables.cartItems, undefined);
});

test('bundle intent fails closed for changed carts, malformed versions, mixed items or SDK documents', async () => {
  const { client, calls } = await fixture();
  await Promise.all([
    { cartId: 'other-cart' }, { cartVersion: 'bad' }, { bundleId: '' },
  ].map(async (change) => {
    const options = structuredClone(bundleOptions);
    Object.assign(options.variables.cartItems[0][BUNDLE_COMPLETION_FIELD], change);
    await assert.rejects(client.fetchGraphQl(ADD, options), /Invalid bundle/);
  }));
  const mixed = structuredClone(bundleOptions);
  mixed.variables.cartItems.push({ sku: 'another-product', quantity: 1 });
  await assert.rejects(client.fetchGraphQl(ADD, mixed), /Invalid bundle/);
  await assert.rejects(
    client.fetchGraphQl(ADD.replace('cartItems:', 'changedItems:'), bundleOptions),
    /cannot safely complete/,
  );
  assert.equal(calls.length, 0, 'must never fall back to a normal add');
});

test('atomic domain failures retain their GraphQL error and never retry as a standard add', async () => {
  const errors = [{ message: 'Cart changed', extensions: { code: 'CART_CHANGED' }, path: ['addProductsToCart'] }];
  const { client, calls } = await fixture({
    batch: { data: { addProductsToCart: null }, errors },
  });
  const result = await client.fetchGraphQl(ADD, bundleOptions);
  assert.deepEqual(result.errors, errors);
  assert.equal(result.data.addProductsToCart, null);
  assert.equal(calls.length, 1);
  assert.match(calls[0].document, /completeWkndBundle/);
});

test('free shipping amount changes use fresh results, not a remembered rate', async () => {
  const { client, calls } = await fixture({ shippingAmount: 0, estimatedAmount: 39.90 });
  await client.fetchGraphQl(UPDATE, editOptions);
  const methods = await client.fetchGraphQl(SHIPPING, estimateOptions);
  const estimated = await client.fetchGraphQl(TOTALS, estimateOptions);
  assert.equal(methods.data.estimateShippingMethods[0].amount.value, 0);
  assert.equal(estimated.data.estimateTotals.cart.prices.grand_total.value, 39.90);
  assert.equal(calls.length, 1);
});

test('a changed first shipping method requires genuine follow-up requests', async () => {
  const changedMethod = { carrier_code: 'free', method_code: 'free' };
  const { client, calls } = await fixture({ method: changedMethod });
  await client.fetchGraphQl(UPDATE, editOptions);
  const methods = await client.fetchGraphQl(SHIPPING, estimateOptions);
  await client.fetchGraphQl(TOTALS, {
    variables: { ...estimateOptions.variables, shipping_method: changedMethod },
  });
  assert.equal(methods.data.estimateShippingMethods[0].carrier_code, 'free');
  assert.equal(calls.length, 3);
});

test('estimate failures retain committed mutation, notify, and perform fresh estimates', async (t) => {
  const log = t.mock.method(console, 'error', () => {});
  const { client, calls, statuses } = await fixture({
    batch: {
      data: {
        updateCartItems: { cart: cart(39.90), errors: [] },
        shipping: null,
        estimated: { cart: null },
      },
      errors: [{ message: 'fixture estimate unavailable', path: ['estimated', 'cart'] }],
    },
  });
  const updated = await client.fetchGraphQl(UPDATE, editOptions);
  assert.equal(updated.data.updateCartItems.cart.prices.grand_total.value, 39.90);
  assert.equal(updated.errors, undefined);
  assert.deepEqual(statuses, ['error']);
  assert.equal(log.mock.callCount(), 1);
  await client.fetchGraphQl(SHIPPING, estimateOptions);
  await client.fetchGraphQl(TOTALS, estimateOptions);
  assert.equal(calls.length, 3);
  assert.deepEqual(statuses, ['error', 'success']);
});

test('partial mutation errors are preserved and derived prices cannot be consumed', async (t) => {
  const errors = [{ code: 'INSUFFICIENT_STOCK', message: 'fixture stock failure' }];
  const add = `mutation ADD_PRODUCTS_TO_CART_MUTATION(
    $cartId: String!, $cartItems: [CartItemInput!]!
  ) {
    addProductsToCart(cartId: $cartId, cartItems: $cartItems) {
      cart { ...CART_FRAGMENT } user_errors { code message }
    }
  }
  fragment CART_FRAGMENT on Cart { id prices { grand_total { value currency } } }`;
  await Promise.all([
    [UPDATE, 'updateCartItems', 'errors'],
    [add, 'addProductsToCart', 'user_errors'],
  ].map(([document, field, errorField]) => t.test(field, async () => {
    const { client, calls } = await fixture({
      batch: {
        data: {
          [field]: { cart: cart(19.95), [errorField]: errors },
          shipping: shipping(9.95),
          estimated: { cart: cart(29.90) },
        },
      },
    });
    const updated = await client.fetchGraphQl(document, editOptions);
    assert.deepEqual(updated.data[field][errorField], errors);
    await client.fetchGraphQl(SHIPPING, estimateOptions);
    await client.fetchGraphQl(TOTALS, estimateOptions);
    assert.equal(calls.length, 3);
  })));
});

test('removing the last line bypasses batching; new input cannot reuse previous financial data', async () => {
  const { client, calls, invalidate } = await fixture();
  await client.fetchGraphQl(UPDATE, {
    variables: { cartId: 'fixture-cart', cartItems: [{ cart_item_uid: 'line-one', quantity: 0 }] },
  });
  assert.equal(calls[0].document, UPDATE);
  calls.length = 0;
  await client.fetchGraphQl(UPDATE, editOptions);
  invalidate();
  await client.fetchGraphQl(SHIPPING, estimateOptions);
  await client.fetchGraphQl(TOTALS, estimateOptions);
  assert.equal(calls.length, 3);
});

test('the SDK continuation can run after rendering, but a dropped continuation expires', async () => {
  const { client, calls } = await fixture();
  await client.fetchGraphQl(UPDATE, editOptions);
  await delay(20);
  await client.fetchGraphQl(SHIPPING, estimateOptions);
  await client.fetchGraphQl(TOTALS, estimateOptions);
  assert.equal(calls.length, 1);
  calls.length = 0;
  await client.fetchGraphQl(UPDATE, editOptions);
  await delay(1100);
  await client.fetchGraphQl(SHIPPING, estimateOptions);
  await client.fetchGraphQl(TOTALS, estimateOptions);
  assert.equal(calls.length, 3);
});

test('equivalent recreated headers allow continuation; changed authorization requires new requests', async () => {
  let authorization = 'fixture-only-A';
  const { client, calls } = await fixture({
    context: () => ({
      endpoint: 'https://fixture.invalid/graphql',
      headers: { Store: 'wknd_au', Authorization: authorization },
    }),
  });
  await client.fetchGraphQl(UPDATE, editOptions);
  await client.fetchGraphQl(SHIPPING, estimateOptions);
  await client.fetchGraphQl(TOTALS, estimateOptions);
  assert.equal(calls.length, 1);
  calls.length = 0;
  await client.fetchGraphQl(UPDATE, editOptions);
  authorization = 'fixture-only-B';
  await client.fetchGraphQl(SHIPPING, estimateOptions);
  await client.fetchGraphQl(TOTALS, estimateOptions);
  assert.equal(calls.length, 3);
});

test('a late earlier mutation cannot replace the latest action quote', async () => {
  let completeFirst;
  const first = new Promise((resolve) => { completeFirst = resolve; });
  const { client, calls } = await fixture({
    batch: async (index) => {
      if (index === 1) await first;
      return {
        data: {
          updateCartItems: { cart: cart(index === 1 ? 39.90 : 59.85), errors: [] },
          shipping: shipping(9.95),
          estimated: { cart: cart(index === 1 ? 49.85 : 69.80) },
        },
      };
    },
  });
  const earlier = client.fetchGraphQl(UPDATE, editOptions);
  await client.fetchGraphQl(UPDATE, editOptions);
  completeFirst();
  await earlier;
  await client.fetchGraphQl(SHIPPING, estimateOptions);
  const estimated = await client.fetchGraphQl(TOTALS, estimateOptions);
  assert.equal(estimated.data.estimateTotals.cart.prices.grand_total.value, 69.80);
  assert.equal(calls.length, 2);
});

test('a new SDK cart read cannot reuse a previous action quote', async () => {
  const { client, calls } = await fixture();
  await client.fetchGraphQl(UPDATE, editOptions);
  await client.fetchGraphQl('query GUEST_CART_QUERY { cart { id } }', { variables: {} });
  await client.fetchGraphQl(SHIPPING, estimateOptions);
  await client.fetchGraphQl(TOTALS, estimateOptions);
  assert.equal(calls.length, 4);
});

test('a changed SDK document with extra mutation roots passes through without quoting', async (t) => {
  const warning = t.mock.method(console, 'warn', () => {});
  const { client, calls } = await fixture();
  const changed = UPDATE.replace(
    '\n}\nfragment',
    '\n another: updateCartItems(input: {cart_id: $cartId, cart_items: $cartItems}) { cart { id } }\n}\nfragment',
  );
  await client.fetchGraphQl(changed, editOptions);
  assert.equal(calls[0].document, changed);
  assert.equal(warning.mock.callCount(), 1);
});
