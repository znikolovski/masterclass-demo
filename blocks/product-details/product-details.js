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
import { initializeCommerce, SHOP_PATHS, PDP_IMAGE_SIZES as IMAGES_SIZES } from '../../scripts/commerce.js';

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
    { default: ProductAttributes }, { default: ProductGallery },
  ] = await Promise.all([
    import('@dropins/storefront-pdp/containers/ProductHeader.js'),
    import('@dropins/storefront-pdp/containers/ProductPrice.js'),
    import('@dropins/storefront-pdp/containers/ProductShortDescription.js'),
    import('@dropins/storefront-pdp/containers/ProductOptions.js'),
    import('@dropins/storefront-pdp/containers/ProductQuantity.js'),
    import('@dropins/storefront-pdp/containers/ProductDescription.js'),
    import('@dropins/storefront-pdp/containers/ProductAttributes.js'),
    import('@dropins/storefront-pdp/containers/ProductGallery.js'),
  ]);

  let product = events.lastPayload('pdp/data')?.sku ? events.lastPayload('pdp/data') : null;
  let isOutOfStock = false;

  const fragment = document.createRange().createContextualFragment(`
    <div class="product-details__alert"></div>
    <div class="product-details__wrapper">
      <div class="product-details__left-column">
        <div class="product-details__gallery"></div>
      </div>
      <div class="product-details__right-column">
        <div class="product-details__header"></div>
        <div class="product-details__price"></div>
        <div class="product-details__gallery product-details__gallery--mobile"></div>
        <div class="product-details__short-description"></div>
        <div class="product-details__configuration">
          <div class="product-details__options"></div>
          <div class="product-details__quantity"></div>
          <div class="product-details__buttons"></div>
          <div class="product-details__add-to-cart-status" role="status" aria-live="polite"></div>
        </div>
        <p class="product-details__shipping">Free standard shipping in Australia on orders over $150 · 3-year Trail Promise warranty</p>
        <div class="product-details__description"></div>
        <div class="product-details__attributes"></div>
      </div>
    </div>`);
  const $ = (sel) => fragment.querySelector(sel);
  const $alert = $('.product-details__alert');
  const $status = $('.product-details__add-to-cart-status');
  const $galleryDesktop = $('.product-details__left-column .product-details__gallery');
  const $galleryMobile = $('.product-details__gallery--mobile');
  const $buttons = $('.product-details__buttons');
  const slots = {
    CarouselThumbnail: (ctx) => {
      if (ctx.mediaType === 'image') tryRenderAemAssetsImage(ctx, { ...imageSlotConfig(ctx), wrapper: document.createElement('span') });
    },
    CarouselMainImage: (ctx) => {
      if (ctx.mediaType === 'image') tryRenderAemAssetsImage(ctx, imageSlotConfig(ctx));
    },
  };
  const gallery = (controls, peak) => pdpRendered.render(ProductGallery, {
    controls, arrows: true, peak, gap: 'small', loop: false, imageParams: { ...IMAGES_SIZES }, slots,
  });

  block.replaceChildren(fragment);

  await Promise.all([
    gallery('dots', false)($galleryMobile),
    gallery('thumbnailsColumn', true)($galleryDesktop),
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
    pdpRendered.render(ProductDescription, {})(block.querySelector('.product-details__description')),
    pdpRendered.render(ProductAttributes, { formatValue: formatNumericAttributeValue })(block.querySelector('.product-details__attributes')),
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
    addToCart.setProps((prev) => ({ ...prev, disabled: isOutOfStock, children: isOutOfStock ? 'Out of stock' : 'Add to cart' }));
  }, { eager: true });
  events.on('pdp/valid', (valid) => {
    addToCart.setProps((prev) => ({ ...prev, disabled: isOutOfStock || !valid }));
  }, { eager: true });
}
