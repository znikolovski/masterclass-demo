/*
 * Cart — Adobe Commerce cart drop-in (adapted from aem-boilerplate-commerce, Apache-2.0).
 * Authoring (key/value rows, all optional):
 *   max-items  limit the number of line items shown
 * Prices are AUD incl. GST; coupons such as WKND10 are validated by the commerce backend.
 */
import { readBlockConfig } from '../../scripts/aem.js';
import { initializeCommerce, getProductLink, SHOP_PATHS } from '../../scripts/commerce.js';
import { pushShopEvent } from '../../scripts/shop-analytics.js';

export default async function decorate(block) {
  const { 'max-items': maxItems } = readBlockConfig(block);
  await initializeCommerce();
  await import('../../scripts/initializers/cart.js');
  const [
    { render: provider }, { default: CartSummaryList }, { default: OrderSummary },
    { default: EstimateShipping }, { default: Coupons }, { tryRenderAemAssetsImage }, { events },
  ] = await Promise.all([
    import('@dropins/storefront-cart/render.js'),
    import('@dropins/storefront-cart/containers/CartSummaryList.js'),
    import('@dropins/storefront-cart/containers/OrderSummary.js'),
    import('@dropins/storefront-cart/containers/EstimateShipping.js'),
    import('@dropins/storefront-cart/containers/Coupons.js'),
    import('@dropins/tools/lib/aem/assets.js'),
    import('@dropins/tools/event-bus.js'),
  ]);

  const fragment = document.createRange().createContextualFragment(`
    <div class="cart__wrapper">
      <div class="cart__left-column"><div class="cart__list"></div></div>
      <div class="cart__right-column">
        <div class="cart__order-summary"></div>
        <p class="cart__note">Prices include GST. Free standard shipping in Australia over $150.</p>
      </div>
    </div>`);
  const $list = fragment.querySelector('.cart__list');
  const $summary = fragment.querySelector('.cart__order-summary');
  const $rightColumn = fragment.querySelector('.cart__right-column');
  block.replaceChildren(fragment);

  const productLink = (item) => getProductLink(item.url?.urlKey);

  await Promise.all([
    provider.render(CartSummaryList, {
      routeProduct: productLink,
      routeEmptyCartCTA: () => SHOP_PATHS.root,
      maxItems: parseInt(maxItems, 10) || undefined,
      enableUpdateItemQuantity: true,
      enableRemoveItem: true,
      slots: {
        Thumbnail: (ctx) => {
          const { item, defaultImageProps } = ctx;
          const anchor = document.createElement('a');
          anchor.href = productLink(item);
          tryRenderAemAssetsImage(ctx, {
            alias: item.sku,
            imageProps: defaultImageProps,
            wrapper: anchor,
            params: { width: defaultImageProps.width, height: defaultImageProps.height },
          });
        },
      },
    })($list),
    provider.render(OrderSummary, {
      routeCheckout: () => SHOP_PATHS.checkout,
      slots: {
        EstimateShipping: async (ctx) => {
          const wrapper = document.createElement('div');
          await provider.render(EstimateShipping, {})(wrapper);
          ctx.replaceWith(wrapper);
        },
        Coupons: (ctx) => {
          const coupons = document.createElement('div');
          provider.render(Coupons)(coupons);
          ctx.appendChild(coupons);
        },
      },
    })($summary),
  ]);

  let viewed = false;
  events.on('cart/data', (cart) => {
    const empty = !cart || cart.totalQuantity < 1;
    $rightColumn.hidden = empty;
    block.classList.toggle('commerce-cart--empty', empty);
    if (!viewed && cart) {
      viewed = true;
      pushShopEvent('shopCartView', {
        eventType: 'commerce.productListViews',
        commerce: { productListViews: { value: 1 } },
        items: cart.items || [],
        data: { itemCount: cart.totalQuantity || 0 },
      });
    }
  }, { eager: true });
}
