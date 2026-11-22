// codegen:layout-pattern=generic-detail
import {
  callShopTool, money, productImage, isPreview as isShopPreview,
} from '../../scripts/llmapp-shop.js';

const DM = 'https://delivery-p115476-e1135027.adobeaemcloud.com/adobe/assets/urn:aaid:aem:';

// Sample data for standalone/preview mode.
// In production, data comes dynamically from bridge.toolResult.structuredContent.
// outputSchema is a single checklist object (detail concept) — read structuredContent directly.
const SAMPLE_DATA = {
  checklist_title: 'W Circuit · 9-Day Cold/Wet Patagonia Pack',
  essentials: [
    '65–75L backpack with rain cover',
    'Trekking poles (pair)',
    'Headlamp + spare batteries',
    'Permit + printed reservations',
    'Trowel and waste bags',
  ],
  clothing: [
    'Waterproof hardshell jacket',
    'Waterproof overtrousers',
    'Insulated puffy (synthetic preferred for wet)',
    'Fleece / midlayer',
    'Merino base layers (top + bottom)',
    'Waterproof gloves + liner gloves',
    'Warm beanie + sun hat',
  ],
  shelter_and_sleep: [
    '3-season freestanding tent (wind-rated)',
    'Sleeping bag rated to -5°C comfort',
    'Insulated sleeping pad (R-value 4+)',
    'Extra guy lines + stakes for wind',
  ],
  navigation_and_safety: [
    'Map + compass',
    'GPS or phone with offline maps',
    'First-aid kit',
    'Emergency bivy / space blanket',
    'Whistle',
  ],
  food_and_water: [
    'Stove + fuel canister',
    'Cook pot + spork',
    'Water filter or purification tablets',
    '2x 1L water bottles',
    '9 days trail meals + snacks',
  ],
  activity_specific: [
    'Gaiters for mud/scree',
    'Camp shoes for refugio/river crossings',
    'Dry bags for gear organisation',
  ],
  optional_items: [
    'Camera + spare battery',
    'Lightweight camp chair',
    'Paperback / journal',
  ],
  known_weight_grams: 11800,
  unresolved_conditions: [
    'March snow line on the pass is uncertain — verify before departure',
    'River crossing depth after rain not confirmed',
  ],
  safety_note: 'Gear supports good decisions but does not replace them — turn back if conditions exceed your experience.',
  shop_status: 'ok',
  shop_matches: [
    {
      group: 'essentials',
      item: 'Headlamp + spare batteries',
      product: {
        sku: 'WKND-LGT-001',
        name: 'Alpine Start Headlamp 400',
        type: 'simple',
        url: 'https://wknd-adventures.run.place/shop/products/alpine-start-headlamp-400',
        image: `${DM}130bee34-2743-4b3d-9f58-c1d3410ab2dc/as/alpine-start-headlamp-400.webp?width=480`,
        in_stock: true,
        price: { currency: 'AUD', min: 69 },
      },
    },
    {
      group: 'clothing',
      item: 'Waterproof hardshell jacket',
      product: {
        sku: 'WKND-JKT-003',
        name: 'Torrent Rain Jacket',
        type: 'configurable',
        url: 'https://wknd-adventures.run.place/shop/products/torrent-rain-jacket',
        image: `${DM}d6d5b8f3-540b-4be5-88a6-dbd99c3f30a1/as/torrent-rain-jacket.webp?width=480`,
        in_stock: true,
        price: { currency: 'AUD', min: 249 },
      },
    },
  ],
};

const GROUPS = [
  { key: 'essentials', label: 'Essentials', badge: 'required' },
  { key: 'clothing', label: 'Clothing', badge: 'required' },
  { key: 'shelter_and_sleep', label: 'Shelter & Sleep', badge: 'required' },
  { key: 'navigation_and_safety', label: 'Navigation & Safety', badge: 'required' },
  { key: 'food_and_water', label: 'Food & Water', badge: 'required' },
  { key: 'activity_specific', label: 'Activity Specific', badge: 'required' },
  { key: 'optional_items', label: 'Optional Comforts', badge: 'conditional' },
];

/**
 * The WKND shop product matched to a checklist item: simple products are added to the shopper's
 * cart directly (add-shop-cart-items); products with sizes/colours hand off to get-shop-product.
 */
function shopMatch(product, bridge) {
  const wrap = document.createElement('div');
  wrap.className = 'bgc-shop';
  wrap.append(productImage(product.image, '', 'bgc-shop-thumb'));

  const text = document.createElement('span');
  text.className = 'bgc-shop-text';
  text.textContent = `WKND: ${product.name} · ${money({ value: product.price?.min, currency: product.price?.currency })}`;
  wrap.append(text);

  const status = document.createElement('span');
  status.className = 'bgc-shop-status';
  status.setAttribute('role', 'status');

  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'bgc-shop-btn';
  const configurable = product.type === 'configurable';
  action.textContent = configurable ? 'Choose options' : 'Add to cart';
  action.setAttribute('aria-label', `${action.textContent}: ${product.name}`);
  action.addEventListener('click', async () => {
    if (isShopPreview(bridge)) {
      status.textContent = 'Preview only — open this in ChatGPT to shop this gear.';
      return;
    }
    if (configurable) {
      bridge.sendMessage(`Show me the WKND ${product.name} (SKU ${product.sku}) so I can choose options`);
      return;
    }
    action.disabled = true;
    status.textContent = 'Adding…';
    try {
      const data = await callShopTool(bridge, 'add-shop-cart-items', { sku: product.sku, quantity: 1 });
      if (data.error) throw new Error(data.error.message);
      status.textContent = 'Added to your WKND cart.';
    } catch (error) {
      status.textContent = error?.message || 'Could not add this item.';
    } finally {
      action.disabled = false;
    }
  });
  wrap.append(action, status);
  return wrap;
}

function renderChecklist(block, data, bridge) {
  const matches = new Map((Array.isArray(data.shop_matches) ? data.shop_matches : [])
    .filter((m) => m && typeof m.item === 'string' && m.product?.sku && m.product.in_stock !== false)
    .map((m) => [`${m.group}::${m.item}`, m.product]));
  const card = document.createElement('div');
  card.className = 'bgc-card';

  // Header
  const header = document.createElement('div');
  header.className = 'bgc-header';

  const title = document.createElement('h3');
  title.className = 'bgc-title';
  title.textContent = data.checklist_title;
  header.appendChild(title);

  if (typeof data.known_weight_grams === 'number' && data.known_weight_grams > 0) {
    const pill = document.createElement('span');
    pill.className = 'bgc-weight-pill';
    pill.textContent = `≈ ${(data.known_weight_grams / 1000).toFixed(1)} kg known`;
    header.appendChild(pill);
  }
  card.appendChild(header);

  // Unresolved conditions strip
  const unresolved = Array.isArray(data.unresolved_conditions) ? data.unresolved_conditions : [];
  if (unresolved.length) {
    const strip = document.createElement('div');
    strip.className = 'bgc-unresolved';
    const stripLabel = document.createElement('div');
    stripLabel.className = 'bgc-unresolved-label';
    stripLabel.textContent = 'Unresolved conditions';
    strip.appendChild(stripLabel);
    unresolved.forEach((c) => {
      const line = document.createElement('div');
      line.className = 'bgc-unresolved-item';
      line.textContent = c;
      strip.appendChild(line);
    });
    card.appendChild(strip);
  }

  // Scroll region with groups
  const scroll = document.createElement('div');
  scroll.className = 'bgc-scroll';

  GROUPS.forEach((group) => {
    const items = Array.isArray(data[group.key]) ? data[group.key] : [];
    if (!items.length) return;

    const section = document.createElement('div');
    section.className = 'bgc-group';

    const groupLabel = document.createElement('div');
    groupLabel.className = 'bgc-group-label';
    groupLabel.textContent = group.label;
    section.appendChild(groupLabel);

    items.forEach((it) => {
      const row = document.createElement('div');
      row.className = 'bgc-row';

      const name = document.createElement('span');
      name.className = 'bgc-item';
      name.textContent = it;
      row.appendChild(name);

      const badge = document.createElement('span');
      badge.className = `bgc-badge bgc-badge-${group.badge}`;
      badge.textContent = group.badge;
      row.appendChild(badge);

      section.appendChild(row);
      const product = matches.get(`${group.key}::${it}`);
      if (product) section.appendChild(shopMatch(product, bridge));
    });

    scroll.appendChild(section);
  });

  card.appendChild(scroll);

  // CTA row
  const cta = document.createElement('div');
  cta.className = 'bgc-cta';

  const primary = document.createElement('button');
  primary.className = 'bgc-btn bgc-btn-primary';
  primary.type = 'button';
  primary.textContent = 'Audit My Pack Weight';

  const secondary = document.createElement('button');
  secondary.className = 'bgc-btn bgc-btn-secondary';
  secondary.type = 'button';
  secondary.textContent = 'Build Route Briefing';

  if (bridge) {
    primary.addEventListener('click', () => bridge.sendMessage('Audit my pack weight for this checklist'));
    secondary.addEventListener('click', () => bridge.sendMessage('Build a route briefing for this trek'));
  }

  cta.appendChild(primary);
  cta.appendChild(secondary);
  if (matches.size) {
    const cart = document.createElement('button');
    cart.className = 'bgc-btn bgc-btn-secondary';
    cart.type = 'button';
    cart.textContent = 'View My Cart';
    if (bridge) cart.addEventListener('click', () => bridge.sendMessage('Show my WKND cart'));
    cta.appendChild(cart);
  }
  card.appendChild(cta);

  block.appendChild(card);
}

export default async function decorate(block, bridge) {
  let data;

  if (bridge) {
    bridge.applyHostStyles();
    const isPreview = bridge.hostContext?.preview === true;
    if (isPreview) {
      data = SAMPLE_DATA;
    } else {
      // Detail concept — structuredContent IS the checklist object (flat). No wrapper key.
      const result = await bridge.toolResult;
      data = result?.structuredContent || {};
    }
  } else {
    data = SAMPLE_DATA;
  }

  block.textContent = '';

  if (!data || !data.checklist_title) {
    const empty = document.createElement('p');
    empty.className = 'bgc-empty';
    empty.textContent = 'No packing checklist was generated.';
    block.appendChild(empty);
  } else {
    renderChecklist(block, data, bridge);
  }

  if (bridge) {
    bridge.reportSize(block.offsetWidth, block.offsetHeight);
    let resizeTimer;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => bridge.reportSize(block.offsetWidth, block.offsetHeight), 150);
    });
    ro.observe(block);
  }
}
