/*
 * Product details — Adobe Commerce PDP drop-in (adapted from aem-boilerplate-commerce).
 * Authoring: none. PDPs are rendered from the catalog by the WKND Commerce `pdp-markup`
 * overlay with a `sku` metadata value; the server-rendered fallback content inside the block
 * keeps the page crawlable and is replaced on decoration.
 * Images come exclusively from Dynamic Media OpenAPI (tryRenderAemAssetsImage).
 */
import {
  InLineAlert, Icon, Button, provider as UI,
} from '@dropins/tools/components.js';
import { h } from '@dropins/tools/preact.js';
import { events } from '@dropins/tools/event-bus.js';
import { tryRenderAemAssetsImage } from '@dropins/tools/lib/aem/assets.js';
import {
  initializeCommerce, SHOP_PATHS, PDP_IMAGE_SIZES as IMAGES_SIZES, shopPromises,
} from '../../scripts/commerce.js';

// Attributes shown as headline specs (first match wins) and those kept out of the spec grid
const KEY_SPECS = ['waterproof_rating', 'weight_g', 'capacity_l', 'material', 'warranty'];
const HIDDEN_SPECS = ['adventure_tags'];

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const humanize = (slug) => slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function imageSlotConfig(ctx) {
  const { data, defaultImageProps } = ctx;
  return {
    alias: data.sku,
    imageProps: defaultImageProps,
    params: { width: defaultImageProps.width, height: defaultImageProps.height },
  };
}

function formatNumericAttributeValue(value) {
  const trimmed = String(value).trim();
  if (!/^[+-]?\d+(\.\d+)?$/.test(trimmed)) return value;
  return new Intl.NumberFormat('en-AU').format(Number(trimmed));
}

/** Label/value for a spec, folding units out of labels such as "Weight (g)". */
function specText({ label, value }) {
  const unit = label.match(/\(([^)]+)\)$/)?.[1];
  const name = label.replace(/\s*\([^)]+\)$/, '');
  const formatted = formatNumericAttributeValue(value);
  return [name, unit ? `${formatted} ${unit}` : String(formatted)];
}

/** Accessible tabs over the info panels (WAI-ARIA tabs pattern, automatic activation). */
function buildTabs(container, panels) {
  const list = el('div', 'product-details__tablist');
  list.setAttribute('role', 'tablist');
  list.setAttribute('aria-label', 'Product information');
  const tabs = panels.map(({ id, label, panel }, i) => {
    const tab = el('button', 'product-details__tab', label);
    tab.type = 'button';
    tab.id = `pdp-tab-${id}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `pdp-panel-${id}`);
    panel.id = `pdp-panel-${id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    panel.tabIndex = 0;
    panel.hidden = i !== 0;
    tab.setAttribute('aria-selected', String(i === 0));
    tab.tabIndex = i === 0 ? 0 : -1;
    list.append(tab);
    return tab;
  });
  const select = (index) => {
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].panel.hidden = i !== index;
    });
    tabs[index].focus();
  };
  tabs.forEach((tab, i) => tab.addEventListener('click', () => select(i)));
  list.addEventListener('keydown', (e) => {
    const current = tabs.indexOf(document.activeElement);
    if (current < 0) return;
    const next = {
      ArrowRight: (current + 1) % tabs.length,
      ArrowLeft: (current - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(next);
  });
  container.append(list, ...panels.map(({ panel }) => panel));
}

function renderSpecs(container, attributes) {
  const grid = el('dl', 'product-details__spec-grid');
  attributes.filter((a) => !HIDDEN_SPECS.includes(a.id) && a.value !== '' && a.value != null)
    .forEach((attribute) => {
      const [name, value] = specText(attribute);
      const item = el('div', 'product-details__spec');
      item.append(el('dt', 'shop-eyebrow', name), el('dd', '', value));
      grid.append(item);
    });
  container.replaceChildren(grid);
}

function renderKeySpecs(container, attributes) {
  const picks = KEY_SPECS.map((id) => attributes.find((a) => a.id === id && a.value))
    .filter(Boolean).slice(0, 3);
  container.replaceChildren(...picks.map((attribute) => {
    const [name, value] = specText(attribute);
    const tile = el('div', 'product-details__keyspec');
    tile.append(el('span', 'shop-eyebrow', name), el('strong', '', value));
    return tile;
  }));
  container.hidden = !picks.length;
}

function renderMadeFor(container, attributes) {
  const tags = String(attributes.find((a) => a.id === 'adventure_tags')?.value || '')
    .split(',').map((t) => t.trim()).filter(Boolean);
  container.replaceChildren();
  if (!tags.length) return false;
  container.append(el('p', '', 'Our guides picked this for these WKND adventures:'));
  const list = el('ul', 'product-details__adventures');
  tags.forEach((tag) => {
    const li = el('li');
    const link = el('a', '', humanize(tag));
    link.href = `${SHOP_PATHS.search}?filter=${encodeURIComponent(`adventure:${tag}`)}`;
    link.setAttribute('aria-label', `More gear for ${humanize(tag)}`);
    li.append(link);
    list.append(li);
  });
  container.append(list);
  return true;
}

function renderBadges(containers, data) {
  const regular = data?.prices?.regular?.amount;
  const final = data?.prices?.final?.amount;
  const badges = [];
  if (regular && final && final < regular) {
    badges.push(['shop-badge shop-badge--sale', `Sale −${Math.round((1 - final / regular) * 100)}%`]);
  }
  if (data?.inStock === false) badges.push(['shop-badge shop-badge--muted', 'Sold out']);
  containers.forEach((container) => {
    container.replaceChildren(...badges.map(([cls, text]) => el('span', cls, text)));
    container.hidden = !badges.length;
  });
}

export default async function decorate(block) {
  await initializeCommerce();
  const [pdpApi, { render: pdpRendered }] = await Promise.all([
    import('@dropins/storefront-pdp/api.js'),
    import('@dropins/storefront-pdp/render.js'),
    import('../../scripts/initializers/pdp.js'),
  ]);
  const [
    { default: ProductHeader }, { default: ProductPrice }, { default: ProductShortDescription },
    { default: ProductOptions }, { default: ProductQuantity }, { default: ProductDescription },
    { default: ProductGallery },
  ] = await Promise.all([
    import('@dropins/storefront-pdp/containers/ProductHeader.js'),
    import('@dropins/storefront-pdp/containers/ProductPrice.js'),
    import('@dropins/storefront-pdp/containers/ProductShortDescription.js'),
    import('@dropins/storefront-pdp/containers/ProductOptions.js'),
    import('@dropins/storefront-pdp/containers/ProductQuantity.js'),
    import('@dropins/storefront-pdp/containers/ProductDescription.js'),
    import('@dropins/storefront-pdp/containers/ProductGallery.js'),
  ]);

  let product = events.lastPayload('pdp/data')?.sku ? events.lastPayload('pdp/data') : null;
  let isOutOfStock = false;

  const fragment = document.createRange().createContextualFragment(`
    <div class="product-details__alert"></div>
    <div class="product-details__wrapper">
      <div class="product-details__left-column">
        <div class="product-details__media">
          <div class="shop-badges" hidden></div>
          <div class="product-details__gallery"></div>
        </div>
        <div class="product-details__keyspecs" hidden></div>
      </div>
      <div class="product-details__right-column">
        <div class="product-details__topline">
          <span class="shop-eyebrow product-details__activity"></span>
          <span class="product-details__stock"></span>
        </div>
        <div class="product-details__header"></div>
        <div class="product-details__price-panel">
          <div class="product-details__price"></div>
          <p class="product-details__price-note">Includes GST · Free standard shipping in Australia over $150</p>
        </div>
        <div class="product-details__media product-details__media--mobile">
          <div class="shop-badges" hidden></div>
          <div class="product-details__gallery product-details__gallery--mobile"></div>
        </div>
        <div class="product-details__short-description"></div>
        <div class="product-details__configuration">
          <div class="product-details__options"></div>
          <div class="product-details__purchase">
            <div class="product-details__quantity"></div>
            <div class="product-details__buttons shop-accent"></div>
          </div>
          <div class="product-details__add-to-cart-status" role="status" aria-live="polite"></div>
        </div>
        <div class="product-details__promises"></div>
      </div>
    </div>
    <section class="product-details__info" aria-label="Product information">
      <div class="product-details__description"></div>
      <div class="product-details__specs"></div>
      <div class="product-details__made-for"></div>
    </section>`);
  const $ = (sel) => fragment.querySelector(sel);
  const $alert = $('.product-details__alert');
  const $status = $('.product-details__add-to-cart-status');
  const $galleryDesktop = $('.product-details__left-column .product-details__gallery');
  const $galleryMobile = $('.product-details__gallery--mobile');
  const $buttons = $('.product-details__buttons');
  const $badges = [...fragment.querySelectorAll('.shop-badges')];
  const $keySpecs = $('.product-details__keyspecs');
  const $specs = $('.product-details__specs');
  const $madeFor = $('.product-details__made-for');
  const $activity = $('.product-details__activity');
  const $stock = $('.product-details__stock');
  const $info = $('.product-details__info');
  $('.product-details__promises').append(shopPromises(['shipping', 'warranty', 'tested'], 'shop-promises product-details__promise-cards'));
  const slots = {
    CarouselThumbnail: (ctx) => {
      if (ctx.mediaType === 'image') tryRenderAemAssetsImage(ctx, { ...imageSlotConfig(ctx), wrapper: document.createElement('span') });
    },
    CarouselMainImage: (ctx) => {
      if (ctx.mediaType === 'image') tryRenderAemAssetsImage(ctx, imageSlotConfig(ctx));
    },
  };
  const gallery = (controls, peak) => pdpRendered.render(ProductGallery, {
    // no arrows: their side padding would letterbox the 4:5 imagery (thumbnails/dots navigate)
    controls, arrows: false, peak, gap: 'small', loop: false, imageParams: { ...IMAGES_SIZES }, slots,
  });

  const $description = $('.product-details__description');
  block.replaceChildren(fragment);

  const infoPanels = [
    { id: 'specs', label: 'Specifications', panel: $specs },
    { id: 'details', label: 'Details', panel: $description },
    { id: 'made-for', label: 'Made for', panel: $madeFor },
  ];
  buildTabs($info, infoPanels);

  await Promise.all([
    gallery('dots', false)($galleryMobile),
    gallery('thumbnailsColumn', false)($galleryDesktop),
    pdpRendered.render(ProductHeader, {})(block.querySelector('.product-details__header')),
    pdpRendered.render(ProductPrice, {})(block.querySelector('.product-details__price')),
    pdpRendered.render(ProductShortDescription, {})(block.querySelector('.product-details__short-description')),
    pdpRendered.render(ProductOptions, {
      hideSelectedValue: false,
      slots: {
        SwatchImage: (ctx) => tryRenderAemAssetsImage(ctx, { ...imageSlotConfig(ctx), wrapper: document.createElement('span') }),
      },
    })(block.querySelector('.product-details__options')),
    pdpRendered.render(ProductQuantity, {})(block.querySelector('.product-details__quantity')),
    pdpRendered.render(ProductDescription, {})($description),
  ]);

  let inlineAlert;
  const showAlert = async (heading, description, type = 'error') => {
    inlineAlert?.remove();
    inlineAlert = await UI.render(InLineAlert, {
      heading,
      description,
      type,
      icon: h(Icon, { source: type === 'success' ? 'CheckWithCircle' : 'Warning' }),
      'aria-live': 'assertive',
      role: 'alert',
      onDismiss: () => inlineAlert.remove(),
      ...(type === 'success' ? { actionButtonPosition: 'top', additionalActions: [{ label: 'View cart', onClick: () => { window.location.href = SHOP_PATHS.cart; } }] } : {}),
    })($alert);
    $alert.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const addToCart = await UI.render(Button, {
    children: 'Add to cart',
    icon: h(Icon, { source: 'Cart' }),
    'aria-label': `Add ${product?.name || ''} to cart`,
    onClick: async () => {
      addToCart.setProps((prev) => ({ ...prev, children: 'Adding…', disabled: true }));
      $status.textContent = 'Adding to cart';
      try {
        const values = pdpApi.getProductConfigurationValues();
        if (!pdpApi.isProductConfigurationValid()) throw new Error('Choose a colour and size first.');
        const { addProductsToCart } = await import('@dropins/storefront-cart/api.js');
        await addProductsToCart([{ ...values }]);
        await showAlert('Added to your cart', `${product?.name || 'Item'} is in your cart.`, 'success');
      } catch (error) {
        await showAlert('Could not add to cart', error.message);
      } finally {
        addToCart.setProps((prev) => ({ ...prev, children: 'Add to cart', disabled: isOutOfStock }));
        $status.textContent = '';
      }
    },
  })($buttons);

  events.on('pdp/data', (data) => {
    product = data?.sku ? data : product;
    isOutOfStock = data?.inStock === false;
    const attributes = data?.attributes || [];
    $activity.textContent = attributes.find((a) => a.id === 'activity')?.value || 'WKND gear';
    $stock.textContent = isOutOfStock ? 'Sold out' : 'In stock';
    $stock.classList.toggle('is-out', isOutOfStock);
    renderSpecs($specs, attributes);
    renderKeySpecs($keySpecs, attributes);
    const hasMadeFor = renderMadeFor($madeFor, attributes);
    $info.querySelector('#pdp-tab-made-for').hidden = !hasMadeFor;
    renderBadges($badges, data);
    addToCart.setProps((prev) => ({ ...prev, disabled: isOutOfStock, children: isOutOfStock ? 'Out of stock' : 'Add to cart' }));
  }, { eager: true });
  events.on('pdp/valid', (valid) => {
    addToCart.setProps((prev) => ({ ...prev, disabled: isOutOfStock || !valid }));
  }, { eager: true });
}
