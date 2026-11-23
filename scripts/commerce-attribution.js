const CART_DISCOUNTS = `      discounts {
        amount {
          value
          currency
        }
        label
        coupon {
          code
        }
        applied_to
      }`;
const ORDER_DISCOUNTS = `    discounts {
      amount {
        currency
        value
      }
      label
    }`;
const FIELDS = 'wknd_bundle_id\n        wknd_experiment_id';
const MAX_ENTRIES = 20;
const carts = new Map();
const orders = new Map();
const installed = new WeakSet();
let currentCartId;

function attribution(discounts) {
  if (!Array.isArray(discounts)) return {};
  const bundles = discounts.flatMap((discount) => {
    const bundleId = discount?.wknd_bundle_id;
    if (typeof bundleId !== 'string' || !/^bnd_[a-f0-9]{32}$/.test(bundleId)) return [];
    const experimentId = discount.wknd_experiment_id;
    return [{
      bundle_id: bundleId,
      experiment_id: typeof experimentId === 'string'
        && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(experimentId) ? experimentId : null,
    }];
  });
  return bundles.length ? { bundles: bundles.slice(0, 5) } : {};
}

function remember(map, key, discounts) {
  map.delete(key);
  map.set(key, attribution(discounts));
  if (map.size > MAX_ENTRIES) map.delete(map.keys().next().value);
}

export function clearCartAttribution() {
  currentCartId = undefined;
  carts.clear();
}

export function cartAttribution() {
  return structuredClone(carts.get(currentCartId) || {});
}

export function takeOrderAttribution(number) {
  const metadata = orders.get(number) || {};
  orders.delete(number);
  return structuredClone(metadata);
}

/** Only server cart totals and a successful placeOrder receipt can supply applied attribution. */
function capture(response) {
  if (response.errors?.length) return;
  const data = response.data || {};
  const cartResults = [data.cart, data.customerCart,
    ...Object.values(data).map((result) => result?.cart)];
  cartResults.forEach((cart) => {
    if (!cart?.id || !Object.hasOwn(cart.prices || {}, 'discounts')) return;
    currentCartId = cart.id;
    remember(carts, cart.id, cart.prices.discounts);
  });
  const placed = data.placeOrder;
  const order = placed?.orderV2;
  if (placed?.errors?.length || !order?.number) return;
  remember(orders, order.number, order.total?.discounts);
}

/** Enable only after the publisher verifies cart/order discount metadata in Production Mesh. */
export function installBundleAttribution(fetchGraphQL, {
  enabled = false, cartFragment, orderSummaryFragment,
} = {}) {
  if (!enabled || installed.has(fetchGraphQL)) return;
  if (!cartFragment?.includes(CART_DISCOUNTS)
    || !orderSummaryFragment?.includes(ORDER_DISCOUNTS)) {
    throw new Error('Bundle attribution does not match the pinned Commerce discount fragments');
  }
  const extendedCart = cartFragment.replace(
    CART_DISCOUNTS,
    CART_DISCOUNTS.replace('        label', `        ${FIELDS}\n        label`),
  );
  const extendedOrder = orderSummaryFragment.replace(
    ORDER_DISCOUNTS,
    ORDER_DISCOUNTS.replace('      label', `      ${FIELDS}\n      label`),
  );
  fetchGraphQL.addBeforeHook((options) => {
    if (options.method !== 'POST' || typeof options.body !== 'string') return options;
    const body = JSON.parse(options.body);
    if (typeof body.query !== 'string') return options;
    const query = body.query.replace(cartFragment, extendedCart)
      .replace(orderSummaryFragment, extendedOrder);
    return query === body.query ? options : {
      ...options, body: JSON.stringify({ ...body, query }),
    };
  });
  fetchGraphQL.addAfterHook((options, response) => {
    capture(response);
    return response;
  });
  installed.add(fetchGraphQL);
}
