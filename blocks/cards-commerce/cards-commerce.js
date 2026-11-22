/*
 * Commerce cards — product cards from the WKND catalog (Catalog Service via API Mesh), for any
 * page. Inserted by the Commerce Catalog library plugin (tools/commerce-catalog) or authored.
 *
 * Authoring (one row per product):
 *   cell 1  SKU (required)
 *   cell 2  eyebrow (optional; defaults to the product's activity)
 *   cell 3  description (optional; defaults to the short description)
 *   cell 4  CTA text (optional; default "View gear")
 *   cell 5  CTA link (optional; default the product page)
 * Light on purpose: no drop-ins; one GraphQL request for all cards. Card details (sale and stock
 * badges, spec bar, discount) match the shop search grid via scripts/product-card.js.
 */
import commerceConfig, { MESH_ENDPOINT, SHOP_PATHS } from '../../scripts/commerce-config.js';
import {
  cardBadges, cardSpecs, discountPercent, priceOf, productAttr,
} from '../../scripts/product-card.js';

const QUERY = `query CARDS_COMMERCE($skus: [String]) {
  products(skus: $skus) {
    __typename sku name urlKey shortDescription inStock
    images(roles: []) { url label roles }
    attributes(roles: []) { name value }
    ... on SimpleProductView { price {
      final { amount { value currency } } regular { amount { value currency } }
    } }
    ... on ComplexProductView { priceRange {
      minimum { final { amount { value currency } } regular { amount { value currency } } }
      maximum { final { amount { value currency } } }
    } }
  }
}`;

const IMAGE_WIDTHS = [400, 600, 800];

function readRows(block) {
  return [...block.children].map((row) => {
    const cells = [...row.children];
    const text = (i) => cells[i]?.textContent.trim() || '';
    return {
      sku: text(0).toUpperCase(),
      eyebrow: text(1),
      description: text(2),
      ctaText: text(3),
      ctaHref: cells[4]?.querySelector('a')?.getAttribute('href') || text(4),
    };
  }).filter((row) => row.sku);
}

async function fetchProducts(skus) {
  const { headers } = commerceConfig.public.default;
  const resp = await fetch(MESH_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers.all, ...headers.cs },
    body: JSON.stringify({ query: QUERY, variables: { skus } }),
  });
  if (!resp.ok) throw new Error(`catalog ${resp.status}`);
  const { data } = await resp.json();
  return new Map((data?.products || []).filter(Boolean).map((p) => [p.sku.toUpperCase(), p]));
}

const money = (amount) => {
  if (typeof amount?.value !== 'number') return '';
  return new Intl.NumberFormat('en', { style: 'currency', currency: amount.currency || 'AUD' })
    .format(amount.value);
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function priceMarkup(product) {
  const p = el('p', 'cards-commerce-price');
  const { final, regular } = priceOf(product);
  const max = product.priceRange?.maximum?.final?.amount;
  const from = max && final && max.value !== final.value ? 'From ' : '';
  p.append(el('strong', '', `${from}${money(final)}`));
  const percent = discountPercent(product);
  if (percent) {
    p.classList.add('cards-commerce-price-sale');
    p.append(' ', el('del', '', money(regular)));
    const saving = { value: regular.value - final.value, currency: final.currency };
    p.append(el('span', 'cards-commerce-saving', `Save ${money(saving)} (${percent}% off)`));
  }
  // the badges sit in the aria-hidden image link, so stock is repeated for assistive tech
  if (product.inStock === false) p.append(el('span', 'cards-commerce-sr', ' Sold out'));
  return p;
}

/** Dynamic Media OpenAPI renditions (bare asset URLs get /as/{alias}.webp?width=…). */
function picture(product) {
  const images = (product.images || []).filter((i) => i?.url);
  const image = images.find((i) => i.roles?.includes('image')) || images[0];
  if (!image) return null;
  const img = document.createElement('img');
  img.alt = image.label || product.name;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.width = 400;
  img.height = 500;
  const base = image.url.startsWith('//') ? `https:${image.url}` : image.url;
  if (/\/adobe\/assets\/urn:[^/]+$/.test(base)) {
    const alias = product.urlKey || product.sku;
    const at = (w) => `${base}/as/${alias}.webp?width=${w}&height=${Math.round(w * 1.25)}&quality=80`;
    img.src = at(600);
    img.srcset = IMAGE_WIDTHS.map((w) => `${at(w)} ${w}w`).join(', ');
    img.sizes = '(min-width: 1200px) 280px, (min-width: 600px) 45vw, 90vw';
  } else {
    img.src = base;
  }
  return img;
}

function link(href, className, content) {
  const a = document.createElement('a');
  a.href = href;
  if (className) a.className = className;
  if (typeof content === 'string') a.textContent = content;
  else if (content) a.append(content);
  return a;
}

function renderCard(card, row, product) {
  const href = row.ctaHref || SHOP_PATHS.product(product.urlKey);
  const eyebrowText = row.eyebrow || productAttr(product, 'activity') || '';
  card.classList.remove('cards-commerce-card-loading');
  card.replaceChildren();

  // the image repeats the name link: keep it out of the tab order and accessibility tree
  const media = link(href, 'cards-commerce-media', picture(product));
  media.tabIndex = -1;
  media.setAttribute('aria-hidden', 'true');
  const badges = cardBadges(product);
  if (badges.length) {
    const list = el('span', 'cards-commerce-badges');
    badges.forEach(([variant, text]) => {
      list.append(el('span', `cards-commerce-badge${variant ? ` cards-commerce-badge-${variant}` : ''}`, text));
    });
    media.append(list);
  }
  const specs = cardSpecs(product);
  if (specs.length) media.append(el('span', 'cards-commerce-specbar', `Specs: ${specs.join(' / ')}`));

  const body = document.createElement('div');
  body.className = 'cards-commerce-body';
  if (eyebrowText) {
    const eyebrow = document.createElement('p');
    eyebrow.className = 'cards-commerce-eyebrow';
    eyebrow.textContent = eyebrowText;
    body.append(eyebrow);
  }
  const name = document.createElement('h3');
  name.className = 'cards-commerce-name';
  name.append(link(href, '', product.name));
  body.append(name);
  const descriptionText = row.description || product.shortDescription || '';
  if (descriptionText) {
    const description = document.createElement('p');
    description.className = 'cards-commerce-description';
    description.textContent = descriptionText;
    body.append(description);
  }
  body.append(priceMarkup(product));
  const cta = document.createElement('p');
  cta.className = 'cards-commerce-cta';
  cta.append(link(href, 'button secondary', row.ctaText || 'View gear'));
  body.append(cta);
  card.append(media, body);
}

export default async function decorate(block) {
  const rows = readRows(block);
  const list = document.createElement('ul');
  list.className = 'cards-commerce-list';
  const cards = rows.map(() => {
    const li = document.createElement('li');
    li.className = 'cards-commerce-card cards-commerce-card-loading';
    li.innerHTML = '<div class="cards-commerce-media"></div><div class="cards-commerce-body"><p></p><p></p><p></p></div>';
    list.append(li);
    return li;
  });
  block.replaceChildren(list);
  if (!rows.length) return;

  let products;
  try {
    products = await fetchProducts([...new Set(rows.map((r) => r.sku))]);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('cards-commerce: catalog unavailable', e);
    products = new Map();
  }
  rows.forEach((row, i) => {
    const product = products.get(row.sku);
    if (product) renderCard(cards[i], row, product);
    else cards[i].remove();
  });
  if (!list.children.length) block.closest('.section')?.classList.add('cards-commerce-empty');
}
