import { readBlockConfig, loadCSS } from '../../scripts/aem.js';
import { createDmPicture } from '../../scripts/dm-image.js';
import { priceOf } from '../../scripts/product-card.js';
import { SHOP_PATHS } from '../../scripts/commerce-config.js';

const FIELDS = `__typename sku name urlKey inStock images(roles:["thumbnail"]){url label}
  ...on SimpleProductView{price{final{amount{value currency}}}}
  ...on ComplexProductView{
    priceRange{minimum{final{amount{value currency}}} maximum{final{amount{value currency}}}}
    options{id title values{id title ...on ProductViewOptionValueSwatch{inStock}}}
  }`;
const KITS = `query WkndPromotionKits($promotion:String,$cart:String){
  wkndPromotionKits(promotion_id:$promotion,cart_id:$cart){
    promotion_id name products{sku cart_quantity product{${FIELDS}}}
  }
}`;
const PRODUCTS = `query WkndProductSet($skus:[String!]!){products(skus:$skus){${FIELDS}}}`;
const REFINE = `query WkndKitSelection($sku:String!,$options:[String!]!){
  refineProduct(sku:$sku,optionIds:$options){${FIELDS}}
}`;

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

const amount = (product) => priceOf(product).final;
const available = (product) => {
  const { __typename: productType } = product;
  return productType === 'SimpleProductView' && product.inStock
    && Number.isFinite(amount(product)?.value) && Boolean(amount(product)?.currency);
};
const quantityOf = (cart, sku) => (cart?.items || [])
  .filter((item) => item.sku === sku).reduce((sum, item) => sum + item.quantity, 0);

function priceText(product) {
  const price = amount(product);
  if (!Number.isFinite(price?.value) || !price?.currency) return 'Price unavailable';
  const formatted = new Intl.NumberFormat('en-AU', { style: 'currency', currency: price.currency })
    .format(price.value);
  const { __typename: productType } = product;
  return productType === 'ComplexProductView' ? `From ${formatted}` : formatted;
}

async function graphql(fetchGraphQl, query, variables) {
  const result = await fetchGraphQl(query, { method: 'POST', variables });
  if (result.errors?.length) throw new Error(result.errors[0].message);
  if (!result.data) throw new Error('The shop returned no product data.');
  return result.data;
}

export async function refineKitProduct(fetchGraphQl, sku, options) {
  return (await graphql(fetchGraphQl, REFINE, { sku, options })).refineProduct;
}

function kitView(kit, {
  refineProduct, addProducts, getProductLink, onAdded, isCurrent, getCart, addAll = false,
}) {
  const section = el('section', null, 'product-kit__kit');
  if (kit.promotion_id) section.dataset.promotion = kit.promotion_id;
  section.append(el('h2', addAll ? 'Choose your products' : 'Build your kit'));
  section.append(el('p', 'Choose your options below. Any eligible discount is confirmed in your cart.', 'product-kit__note'));
  const list = el('div', null, 'product-kit__products');
  const status = el('p', '', 'product-kit__status');
  status.setAttribute('role', 'status');
  const add = el('button', addAll ? 'Add all to cart' : 'Add remaining products', 'button primary');
  add.type = 'button';
  const controls = [];
  let writing = false;
  let uncertain = false;
  let complete = false;
  const states = kit.products.map((entry) => ({
    entry, selected: entry.product, pending: false, selects: [],
  }));
  const needsAddition = (state) => addAll || !state.entry.cart_quantity;
  const ready = () => isCurrent() && !writing && !uncertain && !complete
    && states.some(needsAddition)
    && states.every((state) => !needsAddition(state) || (
      !state.pending && available(state.selected) && state.selects.every((select) => select.value)
    ));
  const refreshButton = () => { add.disabled = !ready(); };
  states.forEach((state) => {
    const { entry } = state;
    const { product } = entry;
    const card = el('article', null, 'product-kit__product');
    card.dataset.sku = entry.sku;
    const image = product.images?.[0];
    if (image?.url) {
      card.append(createDmPicture(image.url, image.label || product.name, { alias: product.sku }));
    }
    const link = el('a', product.name);
    link.href = getProductLink(product.urlKey);
    const title = el('h3');
    title.append(link);
    const price = el('p', priceText(product), 'product-kit__price');
    const selectionStatus = el('p', needsAddition(state) ? '' : 'Already in your cart', 'product-kit__selection');
    selectionStatus.setAttribute('role', 'status');
    card.append(title, price, selectionStatus);
    if (needsAddition(state) && product.options?.length) {
      const options = el('fieldset');
      options.append(el('legend', `Choose your ${product.name}`));
      state.selects = product.options.map((option) => {
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
        controls.push(select);
        select.addEventListener('change', async () => {
          if (writing || state.pending) return;
          state.pending = true;
          state.selects.forEach((control) => { control.disabled = true; });
          selectionStatus.textContent = 'Checking price and availability...';
          refreshButton();
          try {
            const optionIds = state.selects.map((control) => control.value).filter(Boolean);
            state.selected = await refineProduct(product.sku, optionIds);
            if (!state.selected) throw new Error('This selection is no longer available.');
            price.textContent = priceText(state.selected);
            (state.selected.options || []).forEach((updated) => {
              const index = product.options.findIndex((original) => original.id === updated.id);
              if (index < 0) return;
              [...state.selects[index].options].forEach((choice) => {
                const value = updated.values.find((item) => item.id === choice.value);
                if (choice.value) choice.disabled = value?.inStock === false;
              });
            });
            selectionStatus.textContent = 'Select all options to continue';
            if (state.selects.every((control) => control.value)) {
              selectionStatus.textContent = available(state.selected)
                ? 'In stock' : 'This selection is unavailable';
            }
          } catch (error) {
            state.selected = { ...product, inStock: false };
            selectionStatus.textContent = `Could not check this selection. Choose again. ${error.message}`;
            // eslint-disable-next-line no-console
            console.error('product-kit selection', error);
          } finally {
            state.pending = false;
            state.selects.forEach((control) => { control.disabled = false; });
            refreshButton();
          }
        });
        return select;
      });
      card.append(options);
      selectionStatus.textContent = 'Select all options to continue';
    } else if (needsAddition(state)) {
      selectionStatus.textContent = available(product) ? 'In stock' : 'This product is unavailable';
    }
    list.append(card);
  });
  add.addEventListener('click', async () => {
    if (!ready()) return;
    writing = true;
    refreshButton();
    controls.forEach((control) => { control.disabled = true; });
    section.setAttribute('aria-busy', 'true');
    const selections = states.filter(needsAddition).map((state) => ({
      sku: state.selected.sku, quantity: 1,
    }));
    status.textContent = 'Adding your selected products...';
    try {
      const before = addAll ? await getCart() : null;
      if (!isCurrent()) throw new Error('Your account changed. Review your cart before continuing.');
      const cart = await addProducts(selections);
      if (!cart?.id || !selections.every(({ sku, quantity }) => (
        quantityOf(cart, sku) >= quantityOf(before, sku) + quantity
      ))) throw new Error('The shop did not confirm every selected product.');
      complete = true;
      states.forEach((state) => {
        if (needsAddition(state)) state.entry.cart_quantity = 1;
      });
      status.textContent = 'Your selected products were added. Your cart confirms any eligible discount.';
      onAdded(cart);
    } catch (error) {
      uncertain = true;
      status.setAttribute('role', 'alert');
      status.textContent = `Could not confirm all additions. Review your cart before trying again. ${error.message}`;
      // eslint-disable-next-line no-console
      console.error('product-kit add', error);
    } finally {
      writing = false;
      section.setAttribute('aria-busy', 'false');
      controls.forEach((control) => { control.disabled = uncertain || complete; });
      refreshButton();
    }
  });
  refreshButton();
  const cartLink = el('a', 'Review cart');
  cartLink.href = SHOP_PATHS.cart;
  section.append(list, add, cartLink, status);
  return section;
}

export function initProductSet(block, {
  skus, events, fetchGraphQl, refineProduct, addProducts, getProductLink, getCart,
}) {
  let generation = 0;
  const load = async () => {
    generation += 1;
    const request = generation;
    block.replaceChildren(el('p', 'Loading products...', 'product-kit__status'));
    try {
      const data = await graphql(fetchGraphQl, PRODUCTS, { skus });
      if (!Array.isArray(data.products)) throw new Error('The shop returned no product list.');
      const products = skus.map((sku) => data.products.find((product) => product?.sku === sku));
      const missing = skus.filter((sku, index) => !products[index]);
      if (missing.length) throw new Error(`Products not found: ${missing.join(', ')}.`);
      if (request !== generation) return;
      block.replaceChildren(kitView({
        products: products.map((product) => ({ sku: product.sku, product, cart_quantity: 0 })),
      }, {
        refineProduct,
        addProducts,
        getProductLink,
        getCart,
        addAll: true,
        isCurrent: () => request === generation,
        onAdded: () => {},
      }));
    } catch (error) {
      if (request !== generation) return;
      const message = el('p', `Could not load products. ${error.message}`, 'product-kit__status');
      message.setAttribute('role', 'alert');
      block.replaceChildren(message);
      // eslint-disable-next-line no-console
      console.error('product-kit load', error);
    }
  };
  events.on('cart/authenticated', load);
  return { reload: load, ready: load() };
}

/** Shared promotion landing/cart controller; writes use the existing cart SDK. */
export function initPromotionKits(block, {
  promotionId, events, fetchGraphQl, refineProduct, addProducts, getProductLink,
}) {
  block.classList.add('product-kit');
  loadCSS(`${window.hlx?.codeBasePath || ''}/blocks/product-kit/product-kit.css`);
  let generation = 0;
  let cartId = null;
  let cartKey;
  let adding = false;
  const load = async () => {
    generation += 1;
    const request = generation;
    block.querySelectorAll('button, select').forEach((control) => { control.disabled = true; });
    if (!promotionId && !cartId) {
      block.replaceChildren();
      return;
    }
    try {
      const data = await graphql(fetchGraphQl, KITS, { promotion: promotionId, cart: cartId });
      if (!Array.isArray(data.wkndPromotionKits)) throw new Error('The shop returned no kit list.');
      if (request !== generation) return;
      block.replaceChildren(...data.wkndPromotionKits.map((kit) => kitView(kit, {
        isCurrent: () => request === generation,
        refineProduct,
        getProductLink,
        addProducts: async (selections) => {
          if (adding) throw new Error('Another kit addition is in progress.');
          adding = true;
          generation += 1;
          try {
            return await addProducts(selections);
          } finally {
            adding = false;
          }
        },
        onAdded: (cart) => {
          cartId = cart.id;
          load();
        },
      })));
    } catch (error) {
      if (request !== generation) return;
      const message = el('p', `Could not load product kits. ${error.message}`, 'product-kit__status');
      message.setAttribute('role', 'alert');
      block.replaceChildren(message);
      // eslint-disable-next-line no-console
      console.error('product-kit load', error);
    }
  };
  events.on('cart/data', (cart) => {
    cartId = cart?.id || null;
    const items = (cart?.items || []).map((item) => [item.sku, item.quantity]);
    const key = JSON.stringify([cartId, items]);
    if (key === cartKey) return;
    cartKey = key;
    if (!adding) load();
  }, { eager: true });
  events.on('cart/authenticated', () => {
    generation += 1;
    cartKey = undefined;
    cartId = null;
    block.replaceChildren();
  });
  return { reload: load };
}

export default async function decorate(block) {
  const config = readBlockConfig(block);
  const rows = [...block.children]
    .filter((row) => row.children.length === 1).map((row) => row.textContent.trim());
  let skuValues = rows;
  if (config.skus) skuValues = Array.isArray(config.skus) ? config.skus : [config.skus];
  const skus = [...new Set(skuValues
    .flatMap((value) => value.split(/[\s,]+/)).filter(Boolean))];
  const parameter = new URLSearchParams(window.location.search).get('promotion');
  const id = (config['promotion-id'] || parameter)?.trim();
  try {
    if (skus.length && config['promotion-id']) throw new Error('Choose SKUs or a promotion ID, not both.');
    if (!skus.length && (!id || !/^prm_[a-f0-9]{32}$/.test(id))) {
      throw new Error('Provide product SKUs or a valid promotion kit link.');
    }
    const {
      initializeCommerce, CORE_FETCH_GRAPHQL, CS_FETCH_GRAPHQL, getProductLink,
    } = await import('../../scripts/commerce.js');
    await initializeCommerce();
    const [
      { events },
      { addProductsToCart, getCartData, getCartDataFromCache },
      { getCookie },
    ] = await Promise.all([
      import('@dropins/tools/event-bus.js'),
      import('@dropins/storefront-cart/api.js'),
      import('@dropins/tools/lib.js'),
    ]);
    const fetchCatalog = (...args) => CS_FETCH_GRAPHQL.fetchGraphQl(...args);
    const options = {
      events,
      getProductLink,
      refineProduct: (sku, values) => refineKitProduct(fetchCatalog, sku, values),
      addProducts: addProductsToCart,
      getCart: () => {
        const hasCart = getCartDataFromCache()?.id || getCookie('DROPIN__CART__CART-ID')
          || getCookie('auth_dropin_user_token');
        return hasCart ? getCartData() : null;
      },
    };
    if (skus.length) {
      await initProductSet(block, { ...options, skus, fetchGraphQl: fetchCatalog }).ready;
    } else {
      initPromotionKits(block, {
        ...options,
        promotionId: id,
        fetchGraphQl: (...args) => CORE_FETCH_GRAPHQL.fetchGraphQl(...args),
      });
    }
  } catch (error) {
    const message = el('p', `Could not load products. ${error.message}`, 'product-kit__status');
    message.setAttribute('role', 'alert');
    block.replaceChildren(message);
    // eslint-disable-next-line no-console
    console.error('product-kit initialization', error);
  }
}
