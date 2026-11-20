import { readBlockConfig } from '../../scripts/aem.js';
import { initializeCommerce, CS_FETCH_GRAPHQL, getProductLink } from '../../scripts/commerce.js';
import { SHOP_PATHS } from '../../scripts/commerce-config.js';
import { createDmPicture } from '../../scripts/dm-image.js';
import { pushShopEvent } from '../../scripts/shop-analytics.js';

const FIELDS = `__typename sku name urlKey shortDescription inStock
  images(roles: ["thumbnail"]) { url label }
  attributes { name label value }
  ... on SimpleProductView { price { final { amount { value currency } } } }
  ... on ComplexProductView {
    priceRange { minimum { final { amount { value currency } } } maximum { final { amount { value currency } } } }
    options { id title values { id title ... on ProductViewOptionValueSwatch { inStock } } }
  }`;
const PRODUCTS = `query Of1Products($skus: [String!]!) { products(skus: $skus) { ${FIELDS} } }`;
const REFINE = `query Of1Refine($sku: String!, $optionIds: [String!]!) {
  refineProduct(sku: $sku, optionIds: $optionIds) { ${FIELDS} }
}`;
const SPECS = [
  ['material', 'Material'], ['weight_g', 'Weight (g)'], ['waterproof_rating', 'Waterproof rating'],
  ['capacity_l', 'Capacity (L)'], ['activity', 'Activity'], ['warranty', 'Warranty'],
];
const UNIT = { unitId: 'wknd-of1-products', unitName: 'OF1 product comparison' };

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function action(label, callback) {
  const button = el('button', label, 'button');
  button.type = 'button';
  button.addEventListener('click', callback);
  return button;
}

async function graphql(query, variables) {
  const result = await CS_FETCH_GRAPHQL.fetchGraphQl(query, { method: 'POST', variables });
  if (result.errors?.length) throw new Error(result.errors[0].message);
  if (!result.data) throw new Error('The shop returned no product data.');
  return result.data;
}

const amount = (product) => product.price?.final?.amount
  || product.priceRange?.minimum?.final?.amount;
const money = (price) => (Number.isFinite(price?.value)
  ? new Intl.NumberFormat('en-AU', { style: 'currency', currency: price.currency }).format(price.value)
  : 'Price unavailable');
const specs = (product) => new Map((product.attributes || []).map((a) => [a.name, a.value]));

function priceText(product) {
  const min = amount(product);
  const max = product.priceRange?.maximum?.final?.amount;
  return max && min?.value !== max.value ? `From ${money(min)}` : money(min);
}

function track(event, products, data = {}) {
  pushShopEvent(event, {
    eventType: event === 'shopRecsImpression' ? 'commerce.recommendations.impressions' : 'web.webinteraction.linkClicks',
    items: products,
    data: { recommendation: UNIT, of1: { experience: 'product', ...data } },
  });
}

function comparisonTable(products) {
  const region = el('div', null, 'product-comparison__table-region');
  region.setAttribute('role', 'region');
  region.setAttribute('aria-label', 'Compare product specifications');
  region.tabIndex = 0;
  const table = el('table');
  const caption = el('caption', 'The details, side by side');
  caption.append(el('span', 'Scroll across to compare each product.', 'product-comparison__scroll-hint'));
  table.append(caption);
  const head = el('thead');
  const header = el('tr');
  const corner = el('th', 'Specification');
  corner.scope = 'col';
  header.append(corner);
  products.forEach((product) => {
    const th = el('th', product.name);
    th.scope = 'col';
    header.append(th);
  });
  head.append(header);
  const body = el('tbody');
  const rows = [
    ['Price', products.map(priceText)],
    ['Availability', products.map((p) => (p.inStock ? 'In stock' : 'Out of stock'))],
    ...SPECS.map(([key, label]) => [label, products.map((p) => specs(p).get(key))])
      .filter(([, values]) => values.some((value) => value != null && value !== '')),
  ];
  rows.forEach(([label, values]) => {
    const row = el('tr');
    const th = el('th', label);
    th.scope = 'row';
    row.append(th, ...values.map((value) => el('td', value == null || value === '' ? 'Not specified' : String(value))));
    body.append(row);
  });
  table.append(head, body);
  region.append(table, el('p', 'Prices shown before option selection. Not specified means this detail is not available in the catalog.', 'product-comparison__note'));
  return region;
}

function productCard(product, maxPrice, cartApi) {
  const card = el('article', null, 'product-comparison__card');
  card.dataset.sku = product.sku;
  const media = el('div', null, 'product-comparison__media');
  const showImage = (view) => {
    const image = view.images?.[0];
    if (!image?.url) {
      media.replaceChildren(el('p', 'Image unavailable'));
      return;
    }
    const picture = createDmPicture(image.url, image.label || product.name, { alias: view.sku });
    picture.querySelector('img').addEventListener('error', () => {
      media.replaceChildren(el('p', 'Image unavailable'));
    }, { once: true });
    media.replaceChildren(picture);
  };
  showImage(product);
  const title = el('h3', product.name);
  const price = el('p', priceText(product), 'product-comparison__price');
  const description = el('p', product.shortDescription, 'product-comparison__description');
  const highlights = el('dl', null, 'product-comparison__highlights');
  const attributes = specs(product);
  SPECS.filter(([key]) => ['weight_g', 'waterproof_rating', 'capacity_l'].includes(key))
    .filter(([key]) => attributes.get(key) != null && attributes.get(key) !== '')
    .slice(0, 2).forEach(([key, label]) => {
      const item = el('div');
      item.append(el('dt', label), el('dd', String(attributes.get(key))));
      highlights.append(item);
    });
  const options = el('fieldset');
  options.append(el('legend', 'Make it yours'));
  options.setAttribute('aria-label', `Choose options for ${product.name}`);
  const status = el('p', '', 'product-comparison__status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  let selected = product;
  let pending = false;
  const selects = (product.options || []).map((option) => {
    const label = el('label', option.title);
    const select = el('select');
    select.setAttribute('aria-label', `${option.title} for ${product.name}`);
    select.append(new Option(`Choose ${option.title.toLowerCase()}`, ''));
    option.values.forEach((value) => {
      const choice = new Option(value.title, value.id);
      choice.disabled = value.inStock === false;
      select.append(choice);
    });
    label.append(select);
    options.append(label);
    return select;
  });
  options.hidden = !selects.length;
  const withinBudget = () => maxPrice == null || (amount(selected)?.value <= maxPrice);
  const available = () => {
    const { __typename: productType } = selected;
    return productType === 'SimpleProductView' && selected.inStock
      && Number.isFinite(amount(selected)?.value) && withinBudget()
      && selects.every((s) => s.value);
  };
  const add = action('Add to cart', async () => {
    if (pending || !available()) return;
    pending = true;
    add.disabled = true;
    selects.forEach((s) => { s.disabled = true; });
    card.setAttribute('aria-busy', 'true');
    status.textContent = 'Adding to cart...';
    try {
      const cart = await cartApi.addProductsToCart([{
        sku: product.sku, quantity: 1, optionsUIDs: selects.map((s) => s.value),
      }]);
      if (!cart?.id) throw new Error('The shop did not confirm the addition.');
      status.textContent = `${product.name} added to your cart.`;
    } catch (error) {
      status.textContent = `Could not confirm the addition. Check your cart before trying again. ${error.message}`;
      // eslint-disable-next-line no-console
      console.error('OF1 add to cart failed:', error);
    } finally {
      pending = false;
      add.disabled = !available();
      selects.forEach((s) => { s.disabled = false; });
      card.setAttribute('aria-busy', 'false');
    }
  });
  add.classList.add('primary');
  add.setAttribute('aria-label', `Add ${product.name} to cart`);
  const refresh = () => {
    price.textContent = priceText(selected);
    add.disabled = pending || !available();
    if (!selected.inStock) status.textContent = 'This selection is out of stock.';
    else if (!withinBudget()) status.textContent = 'This selection exceeds your budget. Choose another option.';
    else status.textContent = selects.length && !selects.every((s) => s.value) ? 'Select your options to continue.' : 'In stock. Ready for your next adventure.';
  };
  selects.forEach((select) => select.addEventListener('change', async () => {
    if (pending) return;
    pending = true;
    add.disabled = true;
    selects.forEach((s) => { s.disabled = true; });
    status.textContent = 'Checking this selection...';
    try {
      const data = await graphql(REFINE, {
        sku: product.sku, optionIds: selects.map((s) => s.value).filter(Boolean),
      });
      if (!data.refineProduct) throw new Error('This product is no longer available.');
      selected = data.refineProduct;
      showImage(selected);
      if (selected.options) {
        selected.options.forEach((option, i) => {
          [...selects[i].options].forEach((choice) => {
            const value = option.values.find((v) => v.id === choice.value);
            if (choice.value) choice.disabled = value?.inStock === false;
          });
        });
      }
      refresh();
    } catch (error) {
      selected = { ...selected, inStock: false };
      status.textContent = `Could not check these options. Please choose again. ${error.message}`;
      // eslint-disable-next-line no-console
      console.error('OF1 option lookup failed:', error);
    } finally {
      pending = false;
      selects.forEach((s) => { s.disabled = false; });
      add.disabled = !available();
    }
  }));
  const link = el('a', 'Explore product', 'product-comparison__product-link');
  link.href = getProductLink(product.urlKey);
  link.addEventListener('click', () => track('shopRecsClick', [product], { target: link.pathname }));
  const content = el('div', null, 'product-comparison__content');
  const purchase = el('div', null, 'product-comparison__purchase');
  const actions = el('div', null, 'product-comparison__actions');
  actions.append(add, link);
  purchase.append(options, status, actions);
  content.append(title, price);
  if (product.shortDescription) content.append(description);
  if (highlights.childElementCount) content.append(highlights);
  content.append(purchase);
  card.append(media, content);
  refresh();
  return card;
}

export default async function decorate(block) {
  const config = readBlockConfig(block);
  const original = [...block.children].map((row) => row.cloneNode(true));
  const skus = [...new Set((config.skus || '').split(',').map((sku) => sku.trim()).filter(Boolean))];
  const maxPrice = config['max-price'] == null ? null : Number(config['max-price']);
  const heading = el('h2', config.heading || (skus.length > 1 ? 'Compare your gear' : 'Your gear'));
  const header = el('div', null, 'product-comparison__header');
  const introduction = el('div', null, 'product-comparison__introduction');
  introduction.append(el('p', 'WKND gear finder', 'product-comparison__eyebrow'), heading);
  header.append(introduction);
  block.replaceChildren(header);
  if (skus.length > 3 || skus.some((sku) => !/^[A-Za-z0-9_-]{1,100}$/.test(sku))
    || (maxPrice != null && (!Number.isFinite(maxPrice) || maxPrice < 0))) {
    block.append(el('p', 'This product comparison is not configured correctly.'));
    // eslint-disable-next-line no-console
    console.error('Invalid product-comparison configuration');
    return;
  }
  if (!skus.length) {
    block.append(el('p', 'No products match these criteria. Try another category or budget.'));
    return;
  }
  const loading = el('p', 'Loading current products...');
  loading.setAttribute('role', 'status');
  block.append(loading);
  let commerceReady = false;
  try {
    await initializeCommerce();
    commerceReady = true;
    const [data, cartApi] = await Promise.all([
      graphql(PRODUCTS, { skus }), import('@dropins/storefront-cart/api.js'),
    ]);
    const products = skus.map((sku) => data.products?.find((p) => p.sku === sku)).filter(Boolean);
    if (!products.length) throw new Error('These products are no longer available.');
    const list = el('div', null, 'product-comparison__list');
    list.append(...products.map((p) => productCard(p, maxPrice, cartApi)));
    loading.remove();
    const toolbar = el('div', null, 'product-comparison__toolbar');
    const summary = el('p', `${products.length} ${products.length === 1 ? 'product' : 'products'} to explore`, 'product-comparison__count');
    toolbar.append(summary);
    const cart = el('a', 'View cart', 'button secondary');
    cart.href = SHOP_PATHS.cart;
    header.append(cart);
    introduction.append(el('p', 'Compare the details. Find your fit. Get out there.', 'product-comparison__intro'));
    const table = products.length > 1 ? comparisonTable(products) : null;
    if (table) {
      const compare = action('Compare specifications', () => {
        table.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
        table.focus({ preventScroll: true });
      });
      compare.className = 'product-comparison__compare';
      toolbar.append(compare);
    }
    block.append(toolbar);
    block.append(list);
    if (products.length < skus.length) block.append(el('p', 'Some requested products are no longer available.'));
    if (table) block.append(table);
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        track('shopRecsImpression', products, { comparedSkus: products.map((p) => p.sku) });
        observer.disconnect();
      }
    });
    observer.observe(block);
    block.closest('.section')?.addEventListener('click', (event) => {
      const link = event.target.closest('a[href]');
      if (link && /^\/blog\/[a-z0-9-]+\/?$/.test(link.pathname)) {
        track('shopOf1AdventureClick', products, { target: link.pathname });
      }
    });
  } catch (error) {
    loading.textContent = 'Product information is unavailable. Please try again.';
    block.append(action(commerceReady ? 'Try again' : 'Reload page', () => {
      if (!commerceReady) {
        window.location.reload();
        return undefined;
      }
      block.replaceChildren(...original.map((row) => row.cloneNode(true)));
      return decorate(block);
    }));
    // eslint-disable-next-line no-console
    console.error('OF1 product comparison failed:', error);
  }
}
