/**
 * WKND Shop analytics — bridges Adobe Commerce drop-in events to the Adobe Client Data Layer
 * using XDM commerce event types (mapped by Launch / Web SDK, see docs/SHOP-ANALYTICS-PLAN.md).
 * Follows the site's ACDL contract: honours `<meta name="analytics" content="off">`, never sends
 * PII (no email, names or addresses), and correlates with the WKND journey id.
 */
import { getJourney } from './journey-analytics.js';

const CURRENCY = 'AUD';
const VIEW_HISTORY_KEY = 'wknd:shop:productViewHistory';
const MAX_HISTORY = 20;
const PENDING_PURCHASE_KEY = 'wknd:shop:pendingPurchase';
let started = false;

function analyticsDisabled() {
  const flag = document.querySelector('meta[name="analytics"]')?.content?.toLowerCase();
  return ['off', 'false', 'no'].includes(flag);
}

const money = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : undefined);

/** Normalises drop-in product/cart/order item shapes to XDM productListItems. */
export function toProductListItem(item = {}) {
  if (item.SKU) return item;
  const qty = item.quantity ?? item.quantityOrdered ?? 1;
  const unit = money(item.price?.value ?? item.prices?.price?.value
    ?? item.price?.final?.amount?.value ?? item.priceRange?.minimum?.final?.amount?.value
    ?? item.price?.amount?.value ?? item.finalPrice);
  return {
    SKU: item.topLevelSku || item.sku || item.productSku,
    name: item.name || item.productName,
    quantity: qty,
    priceTotal: unit != null ? money(unit * qty) : undefined,
    currencyCode: CURRENCY,
    ...(item.variantSku || (item.sku && item.topLevelSku && item.sku !== item.topLevelSku)
      ? { productAddMethod: 'variant', _wknd: { variantSku: item.variantSku || item.sku } } : {}),
  };
}

const signedIn = () => typeof document !== 'undefined'
  && document.cookie.split('; ').some((c) => c.startsWith('auth_dropin_user_token='));

/**
 * Push a shop event. The martech ACDL forwarder sends every pushed event to the Web SDK; the
 * webInteraction signal makes it an Analytics link event (not an extra page view), and
 * mapShopToAnalytics() maps data.wkndShop to the shop eVars/events.
 */
export function pushShopEvent(event, {
  eventType, commerce = {}, items = [], data = {},
} = {}) {
  if (typeof window === 'undefined' || analyticsDisabled()) return;
  const journey = getJourney(false);
  window.adobeDataLayer ||= [];
  window.adobeDataLayer.push({
    event,
    xdm: {
      eventType,
      web: { webInteraction: { type: 'other', name: event, linkClicks: { value: 1 } } },
      ...(Object.keys(commerce).length ? { commerce } : {}),
      ...(items.length ? { productListItems: items.map(toProductListItem) } : {}),
    },
    data: {
      wkndShop: {
        event, currency: CURRENCY, customer: signedIn() ? 'signed-in' : 'guest', ...data,
      },
      ...(journey ? { wkndJourney: { id: journey.id, source: journey.source } } : {}),
    },
  });
}

/* ---------- Analytics mapping (Web SDK onBeforeEventSend) ---------- */

/*
 * Report suite slots (docs/SHOP-ANALYTICS-PLAN.md). Standard commerce metrics (prodView, scAdd,
 * scRemove, scView, scCheckout, purchase, products, revenue) come from the XDM commerce fields.
 */
const SHOP_EVENT_NUMBERS = {
  shopRecsImpression: 50,
  shopRecsClick: 51,
  shopSearch: 52,
  siteSearch: 52,
  siteSearchSummary: 53,
  shopCheckoutStep: 55,
  shopSignIn: 56,
  shopSignOut: 58,
};
const CHECKOUT_STEPS = {
  1: 'contact', 2: 'shipping-address', 3: 'delivery', 4: 'payment',
};

/**
 * Maps shop and site-search events to Analytics as link events with their eVars/events.
 * @param {Object} content Web SDK onBeforeEventSend payload (data.__adobe.analytics prepared)
 */
export function mapShopToAnalytics(content) {
  const shop = content.data?.wkndShop;
  const search = content.data?.wkndSearch;
  const name = shop?.event || search?.event;
  if (!name) return;
  /* eslint-disable no-underscore-dangle -- Adobe's documented Analytics mapping */
  const s = content.data.__adobe.analytics;
  /* eslint-enable no-underscore-dangle */
  s.linkType = 'o';
  s.linkName = name;
  const events = [];
  const add = (metric) => metric && events.push(metric);
  add(SHOP_EVENT_NUMBERS[name] && `event${SHOP_EVENT_NUMBERS[name]}`);

  if (shop) {
    s.eVar44 = shop.customer;
    if (shop.recommendation?.unitId) s.eVar40 = shop.recommendation.unitId;
    if (shop.checkout?.step) {
      s.eVar41 = `${shop.checkout.step}-${CHECKOUT_STEPS[shop.checkout.step] || 'step'}`;
    }
    if (shop.search?.phrase) s.eVar42 = shop.search.phrase.toLowerCase();
    if (shop.auth) {
      s.eVar45 = `${shop.auth.surface || 'unknown'}:${shop.auth.method || 'signout'}`;
      if (name === 'shopSignIn' && shop.auth.method === 'signup') add('event57');
    }
  }
  if (search) {
    if (search.phrase) s.eVar42 = search.phrase.toLowerCase();
    if (search.resultType) s.eVar43 = search.resultType;
    if (name === 'siteSearchClick' && search.resultType === 'sherpa') add('event54');
  }
  if (events.length) {
    s.events = [...new Set([...(s.events || '').split(',').filter(Boolean), ...events])].join(',');
  }
}

/* ---------- consented product view history (feeds recommendations) ---------- */

export function getProductViewHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(VIEW_HISTORY_KEY) || '[]');
    return Array.isArray(list) ? list.filter((e) => e?.sku && e?.date) : [];
  } catch {
    return [];
  }
}

function recordProductView(sku) {
  if (!sku || analyticsDisabled()) return;
  try {
    const next = [{ sku, date: new Date().toISOString() },
      ...getProductViewHistory().filter((e) => e.sku !== sku)].slice(0, MAX_HISTORY);
    localStorage.setItem(VIEW_HISTORY_KEY, JSON.stringify(next));
  } catch { /* storage unavailable */ }
}

/* ---------- drop-in event bridge ---------- */

function flushPendingPurchase() {
  let purchase;
  try {
    purchase = JSON.parse(sessionStorage.getItem(PENDING_PURCHASE_KEY) || 'null');
    sessionStorage.removeItem(PENDING_PURCHASE_KEY);
  } catch { /* storage unavailable */ }
  if (purchase) pushShopEvent('shopPurchase', purchase);
}

export async function startShopAnalytics() {
  if (started) return;
  started = true;
  flushPendingPurchase();
  const { events } = await import('@dropins/tools/event-bus.js');
  const viewed = new Set();

  events.on('pdp/data', (product) => {
    if (!product?.sku || viewed.has(product.sku)) return;
    viewed.add(product.sku);
    recordProductView(product.sku);
    pushShopEvent('shopProductView', {
      eventType: 'commerce.productViews',
      commerce: { productViews: { value: 1 } },
      items: [product],
      data: { product: { sku: product.sku, name: product.name, inStock: product.inStock } },
    });
  }, { eager: true });

  events.on('cart/product/added', (items) => {
    const list = Array.isArray(items) ? items : [items];
    pushShopEvent('shopCartAdd', {
      eventType: 'commerce.productListAdds', commerce: { productListAdds: { value: 1 } }, items: list,
    });
  });
  events.on('cart/product/removed', (items) => {
    const list = Array.isArray(items) ? items : [items];
    pushShopEvent('shopCartRemove', {
      eventType: 'commerce.productListRemovals', commerce: { productListRemovals: { value: 1 } }, items: list,
    });
  });
  events.on('cart/product/updated', (items) => {
    const list = Array.isArray(items) ? items : [items];
    pushShopEvent('shopCartUpdate', { eventType: 'commerce.productListUpdates', items: list });
  });

  events.on('checkout/initialized', (data) => {
    pushShopEvent('shopCheckoutStart', {
      eventType: 'commerce.checkouts',
      commerce: { checkouts: { value: 1 } },
      items: data?.items || [],
      data: {
        cartTotal: money(data?.total?.includingTax?.value ?? data?.prices?.grandTotal?.value),
      },
    });
  }, { eager: true });

  // Checkout redirects to the confirmation page straight after order/placed, so the
  // purchase is queued and pushed once on the next page load (see flushPendingPurchase).
  events.on('order/placed', (order) => {
    const total = money(order?.grandTotal?.value ?? order?.total?.grandTotal?.value);
    const orderNumber = order?.number || order?.orderNumber;
    const purchase = {
      eventType: 'commerce.purchases',
      commerce: {
        purchases: { value: 1 },
        order: {
          purchaseID: orderNumber,
          priceTotal: total,
          currencyCode: CURRENCY,
          payments: [{ paymentType: 'wknd_demo_pay', paymentAmount: total, currencyCode: CURRENCY }],
        },
      },
      items: (order?.items || []).map(toProductListItem),
      data: { demo: true, orderNumber, guest: !order?.customerId },
    };
    try {
      sessionStorage.setItem(PENDING_PURCHASE_KEY, JSON.stringify(purchase));
    } catch {
      pushShopEvent('shopPurchase', purchase);
    }
  }, { eager: true });

  events.on('search/result', (result) => {
    const { request = {}, result: res = {} } = result || {};
    if (!request.phrase) return;
    pushShopEvent('shopSearch', {
      eventType: 'siteSearch',
      data: {
        search: {
          phrase: request.phrase.slice(0, 100),
          resultCount: res.totalCount ?? res.total_count ?? 0,
        },
      },
    });
  });

  events.on('recommendations/data', (units) => {
    (Array.isArray(units) ? units : [units]).filter((u) => u?.items?.length).forEach((unit) => {
      pushShopEvent('shopRecsImpression', {
        eventType: 'commerce.recommendations.impressions',
        items: unit.items,
        data: {
          recommendation: { unitId: unit.unitId, unitName: unit.unitName, typeId: unit.typeId },
        },
      });
    });
  });

  document.addEventListener('click', (e) => {
    const link = e.target.closest?.('.product-recommendations a[href*="/products/"]');
    if (!link) return;
    const block = link.closest('.product-recommendations');
    pushShopEvent('shopRecsClick', {
      eventType: 'commerce.recommendations.clicks',
      data: {
        recommendation: { unitId: block?.dataset.unitId },
        target: new URL(link.href).pathname,
      },
    });
  }, { capture: true });
}
