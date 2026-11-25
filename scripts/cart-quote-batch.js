const installed = new WeakSet();
export const BUNDLE_COMPLETION_FIELD = 'wknd_bundle_completion';
const SHIPPING = 'ESTIMATE_SHIPPING_METHODS_MUTATION';
const TOTALS = 'GET_ESTIMATED_TOTALS_MUTATION';
const FIELDS = {
  UPDATE_PRODUCTS_FROM_CART_MUTATION: 'updateCartItems',
  ADD_PRODUCTS_TO_CART_MUTATION: 'addProductsToCart',
};
const ESTIMATE_VARIABLE = 'wkndCartEstimate';
const SHIPPING_FIELDS = `amount { currency value }
  carrier_code method_code error_message
  price_excl_tax { currency value } price_incl_tax { currency value }`;

/** @typedef {{ carrier_code: string, method_code: string }} ShippingMethod */
/** @typedef {{ country_code: string, postcode?: string, region?: object }} EstimateAddress */

function addressKey(address) {
  if (!address?.country_code) return null;
  return JSON.stringify([
    address.country_code, address.postcode || '',
    address.region?.region_id ?? address.region?.region ?? '',
  ]);
}

function sameMethod(first, second) {
  return Boolean(first?.carrier_code && first?.method_code
    && first.carrier_code === second?.carrier_code && first.method_code === second?.method_code);
}

function quoteError(error) {
  return ['shipping', 'estimated'].includes(error.path?.[0]);
}

function hasCart(cart, id) {
  return cart?.id === id && Number.isFinite(cart.prices?.grand_total?.value)
    && typeof cart.prices.grand_total.currency === 'string';
}

function contextKey(context) {
  return JSON.stringify([
    context?.endpoint || '', Array.from(new Headers(context?.headers || {}).entries()),
  ]);
}

function selectionEnd(query, start) {
  let depth = 1;
  let end = start;
  for (; end < query.length && depth; end += 1) {
    if (query[end] === '{') depth += 1;
    if (query[end] === '}') depth -= 1;
  }
  return depth ? null : end;
}

function buildBatch(query, field, bundle = false) {
  const header = query.match(/^(\s*mutation\s+\w+\s*\()([\s\S]*?)(\)\s*\{)/);
  if (!header || query.includes(`$${ESTIMATE_VARIABLE}`)
    || /["#]/.test(header[2]) || !query.includes('fragment CART_FRAGMENT')) return null;
  const end = selectionEnd(query, header[0].length);
  if (!end) return null;
  const selection = query.slice(header[0].length, end - 1);
  // Only the pinned SDK's variable-only selection is supported, not arbitrary GraphQL literals.
  if (/["#]/.test(selection)) return null;
  const name = bundle ? `${field}\\s*:\\s*completeWkndBundle` : field;
  const root = selection.match(new RegExp(`^\\s*${name}\\s*\\([\\s\\S]*?\\)\\s*\\{`));
  const rootEnd = root && selectionEnd(selection, root[0].length);
  if (!rootEnd || selection.slice(rootEnd).trim()) return null;
  return `${header[1]}${header[2]}\n$${ESTIMATE_VARIABLE}: EstimateTotalsInput!\n${header[3]}
    ${selection}
    shipping: estimateShippingMethods(input: $${ESTIMATE_VARIABLE}) { ${SHIPPING_FIELDS} }
    estimated: estimateTotals(input: $${ESTIMATE_VARIABLE}) { cart { ...CART_FRAGMENT } }
  ${query.slice(end - 1)}`;
}

function bundleRequest(query, variables) {
  const items = variables.cartItems;
  if (!Array.isArray(items) || !items.some((item) => (
    Object.hasOwn(item, BUNDLE_COMPLETION_FIELD)
  ))) return null;
  const intent = items[0]?.[BUNDLE_COMPLETION_FIELD];
  if (!intent || intent.cartId !== variables.cartId
    || ![intent.promotionId, intent.bundleId].every((id) => typeof id === 'string' && id.trim())
    || !/^v(0|[1-9]\d{0,15})$/.test(intent.cartVersion)
    || items.some((item) => (
      JSON.stringify(item[BUNDLE_COMPLETION_FIELD]) !== JSON.stringify(intent)
    ))
    || !buildBatch(query, 'addProductsToCart')) {
    throw new Error('Invalid bundle completion request. Refresh your cart and try again.');
  }
  const declaration = /\$cartItems\s*:\s*\[CartItemInput!\]!\s*,?/;
  const root = /addProductsToCart\s*\(\s*cartId:\s*\$cartId\s*,?\s*cartItems:\s*\$cartItems\s*\)/;
  if (!declaration.test(query) || !root.test(query)) {
    throw new Error('The cart SDK cannot safely complete this bundle.');
  }
  const { cartItems, ...rest } = variables;
  return {
    query: query.replace(declaration, `$wkndBundlePromotion: String!,
      $wkndBundleId: String!, $wkndBundleVersion: String!,`)
      .replace(root, `addProductsToCart: completeWkndBundle(
        cart_id: $cartId, promotion_id: $wkndBundlePromotion,
        bundle_id: $wkndBundleId, expected_cart_version: $wkndBundleVersion)`),
    variables: {
      ...rest,
      wkndBundlePromotion: intent.promotionId,
      wkndBundleId: intent.bundleId,
      wkndBundleVersion: intent.cartVersion,
    },
  };
}

function removesLastLine(variables, cart) {
  const removed = variables.cartItems?.filter((item) => item.quantity === 0) || [];
  if (!removed.length) return false;
  if (!cart?.items?.length) return true;
  return cart.items.every((item) => removed.some((edit) => edit.cart_item_uid === item.uid));
}

/**
 * Adapt the pinned SDK's estimate continuations to one ordered backend mutation.
 * Retain selection context; financial data serves only the automatic post-update estimate cycle.
 * @param {object} fetchGraphQL existing core GraphQL client
 * @param {object} deps cart state and estimate-status callbacks
 */
export default function installCartQuoteBatch(fetchGraphQL, {
  getCartDataFromCache,
  getRequestContext = () => null,
  registerInvalidation = () => {},
  onEstimateError = () => {},
  onEstimateSuccess = () => {},
}) {
  if (installed.has(fetchGraphQL)) return;
  installed.add(fetchGraphQL);
  const client = fetchGraphQL;
  const fetch = client.fetchGraphQl.bind(client);
  let generation = 0;
  let selected = null;
  let pendingShipping = null;
  let continuation = null;
  registerInvalidation(() => {
    generation += 1;
    continuation = null;
    pendingShipping = null;
  });

  const failedEstimate = () => {
    onEstimateError();
    // eslint-disable-next-line no-console
    console.error('commerce-cart estimated total unavailable; reapply the destination to retry');
  };

  client.fetchGraphQl = async (query, options = {}) => {
    const operation = typeof query === 'string' ? query.match(/\bmutation\s+(\w+)/)?.[1] : null;
    const variables = options.variables || {};
    const bundle = bundleRequest(query, variables);
    const document = bundle?.query || query;
    const mutationVariables = bundle?.variables || variables;
    const id = variables.cartId;
    const key = addressKey(variables.address);
    const current = continuation;
    const requestContext = contextKey(getRequestContext());
    if (current && current.generation === generation && id === current.id
      && key === current.key && current.context === requestContext
      && (options.method || 'POST') === 'POST' && !options.signal?.aborted) {
      if (operation === SHIPPING && !current.shippingUsed) {
        current.shippingUsed = true;
        return { data: { estimateShippingMethods: structuredClone(current.shipping) } };
      }
      if (operation === TOTALS && current.shippingUsed && !current.totalsUsed
        && sameMethod(variables.shipping_method, current.method)) {
        current.totalsUsed = true;
        continuation = null;
        onEstimateSuccess();
        return { data: { estimateTotals: structuredClone(current.estimated) } };
      }
    }

    const field = FIELDS[operation];
    const cartRead = typeof query === 'string'
      && /\bquery\s+(?:GUEST_CART_QUERY|CUSTOMER_CART_QUERY)\b/.test(query);
    const isEdit = cartRead || (operation && operation !== SHIPPING && operation !== TOTALS);
    let run = generation;
    let batch = null;
    let estimate = null;
    if (isEdit) {
      generation += 1;
      run = generation;
      continuation = null;
      pendingShipping = null;
      if (field && id && selected?.id === id && (options.method || 'POST') === 'POST'
        && !options.signal?.aborted
        && !removesLastLine(variables, getCartDataFromCache())) {
        batch = buildBatch(document, field, Boolean(bundle));
        if (!batch) {
          if (bundle) throw new Error('The cart SDK cannot safely quote this bundle.');
          // eslint-disable-next-line no-console
          console.warn('commerce-cart quote batch does not match the pinned SDK; using normal requests');
        } else {
          estimate = {
            cart_id: id,
            address: structuredClone(selected.address),
            shipping_method: { ...selected.method },
          };
        }
      }
    }
    if (operation === SHIPPING) {
      if (current && (current.id !== id || current.key !== key)) continuation = null;
      pendingShipping = null;
    }
    let response;
    try {
      response = await fetch(batch || document, batch || bundle ? {
        ...options,
        variables: {
          ...mutationVariables,
          ...(batch ? { [ESTIMATE_VARIABLE]: estimate } : {}),
        },
      } : options);
    } catch (error) {
      if (operation === TOTALS || batch) failedEstimate();
      throw error;
    }
    if (run !== generation) return response;

    if (batch) {
      const updated = response.data?.[field];
      const errors = response.errors || [];
      if (!updated?.cart || errors.some((error) => !quoteError(error))
        || updated.errors?.length || updated.user_errors?.length) return response;
      if (!hasCart(updated.cart, id)) {
        failedEstimate();
        throw new Error('Cart mutation returned an unexpected cart');
      }
      const { shipping } = response.data;
      const method = Array.isArray(shipping) ? shipping.find((item) => !item.error_message) : null;
      const { estimated } = response.data;
      if (errors.length || !hasCart(estimated?.cart, id) || !Array.isArray(shipping)) {
        failedEstimate();
      } else if (sameMethod(method, estimate.shipping_method)
        && contextKey(getRequestContext()) === requestContext) {
        const entry = {
          generation: run,
          id,
          key: addressKey(estimate.address),
          method,
          context: requestContext,
          shipping,
          estimated,
          shippingUsed: false,
          totalsUsed: false,
        };
        continuation = entry;
        // The SDK schedules its automatic estimate after rendering; new input invalidates it.
        // A dropped continuation expires without serving a later action.
        setTimeout(() => { if (continuation === entry) continuation = null; }, 1000);
      }
      const mutationErrors = errors.filter((error) => !quoteError(error));
      return {
        ...response,
        data: { [field]: updated },
        errors: mutationErrors.length ? mutationErrors : undefined,
      };
    }
    if (operation === SHIPPING && !response.errors?.length) {
      const methods = response.data?.estimateShippingMethods;
      const method = Array.isArray(methods) ? methods.find((item) => !item.error_message) : null;
      if (id && key && method) {
        pendingShipping = {
          id, key, method, generation: run,
        };
      }
    }
    if (operation === TOTALS) {
      if (response.errors?.length || !hasCart(response.data?.estimateTotals?.cart, id)) {
        failedEstimate();
      } else {
        onEstimateSuccess();
        if (pendingShipping?.generation === generation && pendingShipping.id === id
          && pendingShipping.key === key
          && sameMethod(pendingShipping.method, variables.shipping_method)) {
          selected = {
            id,
            address: structuredClone(variables.address),
            method: {
              carrier_code: variables.shipping_method.carrier_code,
              method_code: variables.shipping_method.method_code,
            },
          };
        }
      }
    }
    return response;
  };
}
