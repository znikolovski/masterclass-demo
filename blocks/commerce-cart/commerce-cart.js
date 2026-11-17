/*
 * Cart — Adobe Commerce cart drop-in (adapted from aem-boilerplate-commerce, Apache-2.0).
 * Authoring (key/value rows, all optional):
 *   max-items  limit the number of line items shown
 * Prices are AUD incl. GST; coupons such as WKND10 are validated by the commerce backend.
 */
import { readBlockConfig } from '../../scripts/aem.js';
import { SHOP_PATHS } from '../../scripts/commerce-config.js';
import { shopPromises } from '../../scripts/shop-promises.js';
import { shopStylesReady } from '../../scripts/shop-styles.js';

/**
 * Renders the cart drop-ins into the painted layout (runs after decorate() has resolved).
 * @param {Element} block
 * @param {{ maxItems?: string, $list: Element, $summary: Element, setEmpty: Function }} ctx
 */
async function renderCart(block, {
  maxItems, $list, $summary, setEmpty,
}) {
  const [{ initializeCommerce, getProductLink }, { pushShopEvent }] = await Promise.all([
    import('../../scripts/commerce.js'),
    import('../../scripts/shop-analytics.js'),
  ]);
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

  const productLink = (item) => getProductLink(item.url?.urlKey);

  let viewed = false;
  events.on('cart/data', (cart) => {
    setEmpty(!cart || cart.totalQuantity < 1);
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
}

export default async function decorate(block) {
  const { 'max-items': maxItems } = readBlockConfig(block);
  const fragment = document.createRange().createContextualFragment(`
    <div class="cart__wrapper">
      <div class="cart__left-column"><div class="cart__list"></div></div>
      <div class="cart__right-column">
        <div class="cart__order-summary shop-accent"></div>
        <p class="cart__note">Prices include GST.</p>
      </div>
    </div>`);
  fragment.querySelector('.cart__right-column').append(shopPromises(['shipping', 'warranty', 'demo']));
  const $list = fragment.querySelector('.cart__list');
  const $summary = fragment.querySelector('.cart__order-summary');
  const $note = fragment.querySelector('.cart__note');
  // an empty cart keeps the shop promises, without the order summary
  const setEmpty = (empty) => {
    block.classList.toggle('commerce-cart--empty', empty);
    $summary.hidden = empty;
    $note.hidden = empty;
  };
  // Shop pages cache the item count, so the layout (empty state vs list + summary) is reserved
  // before the drop-ins load; the cart/data handler corrects it if the cache is stale.
  setEmpty(!(Number(localStorage.getItem('wknd:cart-count')) > 0));
  // promise styles live in commerce.css: reveal styled, not re-flowed (the reserved raw block
  // stays in place meanwhile)
  await shopStylesReady();
  block.replaceChildren(fragment);

  // Don't await: the section is revealed when decorate() resolves, so the reserved layout
  // paints straight away instead of the page reflowing once the drop-ins have rendered.
  renderCart(block, {
    maxItems, $list, $summary, setEmpty,
  }).catch((e) => console.error('commerce-cart', e));
}
