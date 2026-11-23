/*
 * Preview data for the WKND shop widgets (tools/widget-preview.html and page previews), based on
 * real catalog items. Loaded only in preview mode; live widgets render tool results.
 */
import { DEMO_NOTICE } from './llmapp-shop.js';

const DM = 'https://delivery-p115476-e1135027.adobeaemcloud.com/adobe/assets/urn:aaid:aem:';
const SITE = 'https://wknd-adventures.run.place/shop/products/';
const aud = (value) => ({ value, currency: 'AUD' });

const COLOURS = [
  {
    id: 'Y29uZmlndXJhYmxlL2NvbG9yL29jZWFu', title: 'Deep Ocean', in_stock: true, swatch: '#1F4E66',
  },
  {
    id: 'Y29uZmlndXJhYmxlL2NvbG9yL2dsYWNpZXI=', title: 'Glacier Blue', in_stock: true, swatch: '#4A7FA7',
  },
  {
    id: 'Y29uZmlndXJhYmxlL2NvbG9yL2NoYWxr', title: 'Chalk White', in_stock: false, swatch: '#EDEBE6',
  },
];
const SIZES = ['XS', 'S', 'M', 'L', 'XL'].map((title) => ({
  id: btoa(`configurable/size/${title.toLowerCase()}`), title, in_stock: title !== 'XS', swatch: null,
}));

export const SAMPLE_JACKET = {
  sku: 'WKND-JKT-003',
  name: 'Torrent Rain Jacket',
  type: 'configurable',
  url: `${SITE}torrent-rain-jacket`,
  description: 'A packable 2.5-layer rain shell with pit zips and a helmet-compatible hood for wet trail days.',
  image: `${DM}d6d5b8f3-540b-4be5-88a6-dbd99c3f30a1/as/torrent-rain-jacket.webp?width=480`,
  image_alt: 'Torrent Rain Jacket in Deep Ocean',
  in_stock: true,
  price: {
    currency: 'AUD', min: 249, max: 249, regular: 279,
  },
  attributes: {
    activity: { label: 'Activity', value: 'Hiking' },
    material: { label: 'Material', value: '2.5-layer recycled polyester' },
    weight_g: { label: 'Weight (g)', value: 290 },
  },
  options: [{ id: 'color', title: 'Colour', values: COLOURS }, { id: 'size', title: 'Size', values: SIZES }],
  // Glacier Blue / M is sold out although both values are in stock on their own.
  sold_out: [['Y29uZmlndXJhYmxlL2NvbG9yL2dsYWNpZXI=', btoa('configurable/size/m')]],
};

export const SAMPLE_HEADLAMP = {
  sku: 'WKND-LGT-001',
  name: 'Alpine Start Headlamp 400',
  type: 'simple',
  url: `${SITE}alpine-start-headlamp-400`,
  description: 'A 400-lumen headlamp with red night mode and a USB-C battery.',
  image: `${DM}130bee34-2743-4b3d-9f58-c1d3410ab2dc/as/alpine-start-headlamp-400.webp?width=480`,
  image_alt: 'Alpine Start Headlamp 400',
  in_stock: true,
  price: {
    currency: 'AUD', min: 69, max: 69, regular: 69,
  },
  attributes: {
    activity: { label: 'Activity', value: 'All-round' },
    material: { label: 'Material', value: 'IPX7 waterproof housing' },
    weight_g: { label: 'Weight (g)', value: 80 },
  },
  options: [],
};

export const SAMPLE_PRODUCTS = {
  view: 'products',
  query: 'rain jacket',
  total: 3,
  products: [
    SAMPLE_JACKET,
    {
      ...SAMPLE_JACKET,
      sku: 'WKND-JKT-009',
      name: 'Kids Torrent Rain Jacket',
      url: `${SITE}kids-torrent-rain-jacket`,
      image: `${DM}73ccbe50-91ad-4319-a693-dd7a8d75e744/as/kids-torrent-rain-jacket.webp?width=480`,
      image_alt: 'Kids Torrent Rain Jacket',
      price: {
        currency: 'AUD', min: 129, max: 129, regular: 129,
      },
      attributes: { activity: { label: 'Activity', value: 'Family' }, weight_g: { label: 'Weight (g)', value: 220 } },
    },
    SAMPLE_HEADLAMP,
  ],
};

export const SAMPLE_PRODUCT = {
  view: 'products',
  total: 1,
  products: [SAMPLE_JACKET],
  selected_variant: null,
  selected_options: { size: SIZES[2].id },
  missing_options: ['Colour'],
};

const LINES = [
  {
    line_id: 'preview-1',
    sku: 'WKND-JKT-003-OCEA-M',
    name: 'Torrent Rain Jacket',
    options: [{ label: 'Colour', value: 'Deep Ocean' }, { label: 'Size', value: 'M' }],
    quantity: 2,
    unit_price: aud(249),
    row_total: aud(498),
    available: true,
    image: `${DM}d6d5b8f3-540b-4be5-88a6-dbd99c3f30a1/as/torrent-rain-jacket.webp?width=240`,
  },
  {
    line_id: 'preview-2',
    sku: 'WKND-LGT-001',
    name: 'Alpine Start Headlamp 400',
    options: [],
    quantity: 1,
    unit_price: aud(69),
    row_total: aud(69),
    available: false,
    message: 'Only 0 left in stock',
    image: `${DM}130bee34-2743-4b3d-9f58-c1d3410ab2dc/as/alpine-start-headlamp-400.webp?width=240`,
  },
];

export const SAMPLE_CART = {
  view: 'cart',
  notice: DEMO_NOTICE,
  cart: {
    version: '0000000000000000',
    item_count: 3,
    currency: 'AUD',
    lines: LINES,
    totals: {
      subtotal: aud(567),
      discounts: [{ label: 'TRAILREADY — $20 off orders over $200', amount: aud(20) }],
      shipping: null,
      tax_included: [{ label: 'GST (10% incl.)', amount: aud(49.73) }],
      grand_total: aud(547),
    },
    coupons: ['TRAILREADY'],
    offer_applied: false,
    checkout: {
      email: null,
      shipping_address: null,
      shipping_methods: [],
      shipping_method: null,
      payment_method: null,
    },
    missing: ['available_items', 'email', 'shipping_address', 'shipping_method'],
    ready: false,
  },
  // Welcome-back offer as reported by the shop (beats TRAILREADY's $20).
  offer: {
    kind: 'welcome_back',
    status: 'ELIGIBLE',
    saving: aud(25),
    current_saving: aud(20),
    percent_off: 10,
    max_discount: aud(25),
    expires_at: '2026-12-01T09:00:00.000Z',
    replaces_code: 'TRAILREADY',
  },
};

const STANDARD = {
  code: 'standard', carrier: 'wknd', title: 'Standard (3–6 business days) — free over $150', amount: aud(0),
};
const EXPRESS = {
  code: 'express', carrier: 'wknd', title: 'Express (1–2 business days)', amount: aud(19.95),
};

export const SAMPLE_CHECKOUT = {
  view: 'checkout',
  notice: DEMO_NOTICE,
  account_email: 'sam@example.com',
  saved_addresses: [],
  warnings: [],
  cart: {
    ...SAMPLE_CART.cart,
    version: '0000000000000001',
    item_count: 2,
    lines: [LINES[0]],
    totals: {
      subtotal: aud(498),
      discounts: [{ label: 'Welcome back — 10% off your gear (max $25)', amount: aud(25) }],
      shipping: aud(19.95),
      tax_included: [{ label: 'GST (10% incl.)', amount: aud(44.81) }],
      grand_total: aud(492.95),
    },
    coupons: [],
    offer_applied: true,
    checkout: {
      email: 'sam@example.com',
      shipping_address: {
        name: 'Sam Lee', street: ['12 Harbour St'], city: 'Sydney', region: 'NSW', postcode: '2000', country: 'AU', telephone: '0400 000 000',
      },
      shipping_methods: [STANDARD, EXPRESS],
      shipping_method: EXPRESS,
      payment_method: 'wknd_demo_pay',
    },
    missing: [],
    ready: true,
  },
};

/*
 * Simulated preview scenarios (tools/widget-preview.html?block=<widget>&scenario=<name>).
 * These are fixtures, not live Commerce results: the shop does not send a climbing planner offer
 * yet. Items and prices come from the real catalog; the offer follows the planned terms
 * (10% off selected climbing gear, capped at $25, applied automatically).
 */
const PLANNER_LINES = [
  {
    line_id: 'preview-planner-1',
    sku: 'WKND-PNT-002-BASA-M',
    name: 'Crag Climbing Pants',
    options: [{ label: 'Colour', value: 'Basalt Black' }, { label: 'Size', value: 'M' }],
    quantity: 1,
    unit_price: aud(129),
    row_total: aud(129),
    available: true,
    image: `${DM}2e3a354e-3606-4c00-9d00-7ebfb9ce1121/as/crag-climbing-pants.webp?width=240`,
  },
  {
    line_id: 'preview-planner-2',
    sku: 'WKND-PCK-004-EMBE',
    name: 'Crag Pack 30L',
    options: [{ label: 'Colour', value: 'Ember Red' }],
    quantity: 1,
    unit_price: aud(179),
    row_total: aud(179),
    available: true,
    image: `${DM}3a763d57-6a86-4e5f-a049-7c98551ca796/as/crag-pack-30l.webp?width=240`,
  },
];

const PLANNER_CART = {
  view: 'cart',
  notice: DEMO_NOTICE,
  cart: {
    ...SAMPLE_CART.cart,
    version: '0000000000000010',
    item_count: 2,
    lines: PLANNER_LINES,
    totals: {
      subtotal: aud(308),
      discounts: [],
      shipping: null,
      tax_included: [{ label: 'GST (10% incl.)', amount: aud(28) }],
      grand_total: aud(308),
    },
    coupons: [],
    missing: ['email', 'shipping_address', 'shipping_method'],
  },
  // 10% of $308 is $30.80, capped at $25; nothing else is discounted yet.
  offer: {
    kind: 'climbing_planner',
    status: 'ELIGIBLE',
    saving: aud(25),
    current_saving: aud(0),
    percent_off: 10,
    max_discount: aud(25),
    expires_at: null,
    replaces_code: null,
  },
};

const PLANNER_UNAVAILABLE = {
  kind: 'climbing_planner',
  status: 'UNAVAILABLE',
  message: 'The climbing planner offer can’t be checked right now, so no climbing discount is shown. Your cart and prices are unchanged.',
};

const PLANNER_CHECKOUT = {
  ...SAMPLE_CHECKOUT,
  cart: {
    ...SAMPLE_CHECKOUT.cart,
    version: '0000000000000011',
    item_count: 2,
    lines: PLANNER_LINES,
    totals: {
      subtotal: aud(308),
      discounts: [{ label: 'Climbing planner — 10% off selected climbing gear (max $25)', amount: aud(25) }],
      shipping: aud(0),
      tax_included: [{ label: 'GST (10% incl.)', amount: aud(25.73) }],
      grand_total: aud(283),
    },
    offer_applied: false,
    checkout: { ...SAMPLE_CHECKOUT.cart.checkout, shipping_method: STANDARD },
  },
  offer: null,
};

const PLANNER_CHECKOUT_UNAVAILABLE = {
  ...PLANNER_CHECKOUT,
  cart: {
    ...PLANNER_CHECKOUT.cart,
    version: '0000000000000012',
    totals: {
      subtotal: aud(308),
      discounts: [],
      shipping: aud(0),
      tax_included: [{ label: 'GST (10% incl.)', amount: aud(28) }],
      grand_total: aud(308),
    },
  },
  offer: PLANNER_UNAVAILABLE,
};

const SCENARIOS = {
  'planner-offer': { cart: PLANNER_CART, checkout: PLANNER_CHECKOUT },
  'planner-offer-unavailable': {
    cart: { ...PLANNER_CART, offer: PLANNER_UNAVAILABLE },
    checkout: PLANNER_CHECKOUT_UNAVAILABLE,
  },
};

/**
 * Preview data for a widget view ('cart' | 'checkout'): the default sample, or the simulated
 * scenario named by the preview harness (`hostContext.previewScenario`).
 * @throws {Error} for a scenario that has no fixture for this view
 */
export function previewSample(view, bridge) {
  const scenario = bridge?.hostContext?.previewScenario;
  if (!scenario) return { cart: SAMPLE_CART, checkout: SAMPLE_CHECKOUT }[view];
  const sample = Object.hasOwn(SCENARIOS, scenario) ? SCENARIOS[scenario][view] : undefined;
  if (!sample) throw new Error(`no "${scenario}" preview scenario for this widget`);
  return sample;
}
