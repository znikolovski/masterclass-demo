/* global globalThis */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CART_FRAGMENT } from '../../scripts/__dropins__/storefront-cart/fragments.js';
import {
  ORDER_SUMMARY_FRAGMENT, PLACE_ORDER_FRAGMENT,
} from '../../scripts/__dropins__/storefront-order/fragments.js';
import {
  installBundleAttribution, cartAttribution, clearCartAttribution, takeOrderAttribution,
} from '../../scripts/commerce-attribution.js';
import { pushShopEvent, mapShopToAnalytics } from '../../scripts/shop-analytics.js';

const bundleId = `bnd_${'a'.repeat(32)}`;
const discount = (experiment = null) => ({
  wknd_bundle_id: bundleId,
  wknd_experiment_id: experiment,
  label: 'private coupon',
  amount: { value: 12, currency: 'AUD' },
});
const metadata = (experiment = null) => ({
  bundles: [{ bundle_id: bundleId, experiment_id: experiment }],
});
function hooks(enabled = true) {
  const before = [];
  const after = [];
  const api = {
    addBeforeHook: (hook) => before.push(hook),
    addAfterHook: (hook) => after.push(hook),
  };
  const config = {
    enabled, cartFragment: CART_FRAGMENT, orderSummaryFragment: ORDER_SUMMARY_FRAGMENT,
  };
  installBundleAttribution(api, config);
  installBundleAttribution(api, config);
  return { before, after };
}

test('gate closed adds no hooks; enabled hooks extend only exact total discount fragments', async () => {
  assert.deepEqual(hooks(false), { before: [], after: [] });
  const { before, after } = hooks();
  assert.equal(before.length, 1);
  assert.equal(after.length, 1);
  const query = `query Cart { cart { ...CART_FRAGMENT } }\n${CART_FRAGMENT}`;
  const options = {
    method: 'POST',
    headers: { Authorization: 'mock-token', Store: 'wknd_au' },
    signal: new AbortController().signal,
    body: JSON.stringify({ query, variables: { cartId: 'mock-cart' } }),
  };
  const result = await before[0](options);
  assert.equal(result.headers, options.headers);
  assert.equal(result.signal, options.signal);
  assert.deepEqual(JSON.parse(result.body).variables, { cartId: 'mock-cart' });
  const extended = JSON.parse(result.body).query;
  assert.equal(extended.split('wknd_bundle_id').length - 1, 1);
  assert.equal(extended.replace('        wknd_bundle_id\n        wknd_experiment_id\n', ''), query);
  const order = await before[0]({
    ...options, body: JSON.stringify({ query: ORDER_SUMMARY_FRAGMENT }),
  });
  assert.equal(JSON.parse(order.body).query.split('wknd_bundle_id').length - 1, 1);
  const unrelated = { ...options, body: JSON.stringify({ query: 'query { storeConfig { id } }' }) };
  assert.equal(await before[0](unrelated), unrelated);
  assert.equal((await before[0]({ method: 'GET' })).method, 'GET');
  let mismatched;
  installBundleAttribution({
    addBeforeHook(hook) { mismatched = hook; },
    addAfterHook() {},
  }, { enabled: true, cartFragment: 'changed SDK' });
  await assert.rejects(mismatched(options), /pinned Commerce/);
});

test('raw cart totals alone supply bounded safe IDs; removed discounts and reset clear context', () => {
  clearCartAttribution();
  const capture = hooks().after[0];
  const response = {
    data: {
      addProductsToCart: {
        cart: {
          id: 'mock-cart',
          prices: { discounts: [discount('kit_test')] },
          email: 'not-collected',
          itemsV2: { items: [{ prices: { discounts: [discount('item')] } }] },
        },
      },
    },
  };
  assert.equal(capture({}, response), response);
  assert.deepEqual(cartAttribution(), metadata('kit_test'));
  const copied = cartAttribution();
  copied.bundles[0].bundle_id = 'changed';
  assert.deepEqual(cartAttribution(), metadata('kit_test'));
  capture({}, {
    data: {
      cart: {
        id: 'mock-cart',
        prices: {
          discounts: [
            discount('not-an-email@example.invalid'), { wknd_bundle_id: 'invalid' },
          ],
        },
      },
    },
  });
  assert.deepEqual(cartAttribution(), metadata());
  capture({}, { data: { cart: { id: 'mock-cart', prices: { discounts: [] } } } });
  assert.deepEqual(cartAttribution(), {});
  capture({}, response);
  clearCartAttribution();
  assert.deepEqual(cartAttribution(), {});
});

test('purchase uses only committed order receipt, never cart/proposed totals, and consumes once', () => {
  const capture = hooks().after[0];
  capture({}, {
    data: {
      cart: { id: 'mock-cart', prices: { discounts: [discount('cart-only')] } },
      proposedOrderTotal: { discounts: [discount('proposal-only')] },
    },
  });
  assert.deepEqual(takeOrderAttribution('missing'), {});
  capture({}, {
    data: {
      placeOrder: {
        errors: [{ message: 'failed' }],
        orderV2: { number: 'failed', total: { discounts: [discount()] } },
      },
    },
  });
  assert.deepEqual(takeOrderAttribution('failed'), {});
  capture({}, {
    errors: [{ message: 'failed' }],
    data: {
      placeOrder: {
        orderV2: { number: 'partial', total: { discounts: [discount()] } },
      },
    },
  });
  assert.deepEqual(takeOrderAttribution('partial'), {});
  for (let i = 0; i < 21; i += 1) {
    capture({}, {
      data: {
        placeOrder: {
          orderV2: { number: `mock-${i}`, total: { discounts: [discount()] } },
        },
      },
    });
  }
  assert.deepEqual(takeOrderAttribution('mock-0'), {});
  assert.deepEqual(takeOrderAttribution('mock-20'), metadata());
  assert.deepEqual(takeOrderAttribution('mock-20'), {});
});

test('combined payment/placement operation uses the same committed receipt, not payment cart context', async () => {
  const { before, after } = hooks();
  const query = `mutation setPaymentMethodAndPlaceOrder(
    $cartId: String!, $paymentMethod: PaymentMethodInput!
  ) {
    setPaymentMethodOnCart(input: { cart_id: $cartId, payment_method: $paymentMethod }) {
      cart { selected_payment_method { code title } }
    }
    placeOrder(input: { cart_id: $cartId }) { ...PLACE_ORDER_FRAGMENT }
  }
  ${PLACE_ORDER_FRAGMENT}`;
  const variables = { cartId: 'mock-cart', paymentMethod: { code: 'wknd_demo_pay' } };
  const request = await before[0]({ method: 'POST', body: JSON.stringify({ query, variables }) });
  assert.deepEqual(JSON.parse(request.body).variables, variables);
  assert.equal(JSON.parse(request.body).query.split('wknd_bundle_id').length - 1, 1);
  const response = {
    data: {
      setPaymentMethodOnCart: {
        cart: { id: 'mock-cart', prices: { discounts: [discount('cart-only')] } },
      },
      placeOrder: {
        orderV2: { number: 'combined-receipt', total: { discounts: [discount('committed')] } },
      },
    },
  };
  assert.equal(after[0]({}, response), response);
  assert.deepEqual(takeOrderAttribution('combined-receipt'), metadata('committed'));
  assert.deepEqual(takeOrderAttribution('combined-receipt'), {});
});

test('existing cart events and Analytics context gain IDs without extra commerce hits or PII', () => {
  globalThis.document = { cookie: '', querySelector: () => null };
  globalThis.window = {
    location: { href: 'https://local.invalid/shop/cart' },
    sessionStorage: { getItem: () => null },
    adobeDataLayer: [],
  };
  try {
    const capture = hooks().after[0];
    capture({}, { data: { cart: { id: 'mock-cart', prices: { discounts: [discount()] } } } });
    pushShopEvent('shopCartAdd', {
      eventType: 'commerce.productListAdds', commerce: { productListAdds: { value: 1 } },
    });
    assert.equal(window.adobeDataLayer.length, 1);
    const hit = window.adobeDataLayer[0];
    assert.deepEqual(hit.data.wkndShop.bundles, metadata().bundles);
    const content = { data: { ...hit.data, __adobe: { analytics: { events: 'scAdd' } } } };
    mapShopToAnalytics(content);
    // eslint-disable-next-line no-underscore-dangle -- Adobe Analytics payload shape
    const { analytics } = content.data.__adobe;
    assert.deepEqual(analytics.contextData, { 'wknd.bundle_ids': bundleId });
    assert.equal(analytics.events, 'scAdd');
    assert.equal(JSON.stringify(hit).includes('private coupon'), false);
    pushShopEvent('shopPurchase', { eventType: 'commerce.purchases' });
    assert.equal(window.adobeDataLayer[1].data.wkndShop.bundles, undefined);
    document.querySelector = () => ({ content: 'off' });
    pushShopEvent('shopCartView');
    assert.equal(window.adobeDataLayer.length, 2);
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    clearCartAttribution();
  }
});
