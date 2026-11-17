/*
 * Order — order confirmation / order details (Adobe Commerce order drop-in).
 *   ?orderRef=<token>   guest order (token returned by placeOrder)
 *   ?orderRef=<number>  signed-in customer's order
 *   no orderRef         order lookup form (order number + email + last name)
 * Authoring: none.
 */
import {
  initializeCommerce, getProductLink, checkIsAuthenticated, SHOP_PATHS,
} from '../../scripts/commerce.js';

function demoNotice() {
  const p = document.createElement('p');
  p.className = 'shop-demo-notice';
  p.innerHTML = '<strong>Demo order.</strong>&nbsp;Paid with WKND Demo Pay — no money was taken and nothing will ship.';
  return p;
}

export default async function decorate(block) {
  await initializeCommerce();
  const params = new URLSearchParams(window.location.search);
  const orderRef = params.get('orderRef');
  await import('../../scripts/initializers/order.js');
  const [
    { render: OrderProvider }, { events }, { tryRenderAemAssetsImage },
  ] = await Promise.all([
    import('@dropins/storefront-order/render.js'),
    import('@dropins/tools/event-bus.js'),
    import('@dropins/tools/lib/aem/assets.js'),
  ]);
  block.textContent = '';

  if (!orderRef) {
    const { OrderSearch } = await import('@dropins/storefront-order/containers/OrderSearch.js');
    const intro = document.createElement('p');
    intro.textContent = 'Find a demo order with its order number, email and last name.';
    const $form = document.createElement('div');
    block.append(intro, $form);
    await OrderProvider.render(OrderSearch, {
      isAuth: checkIsAuthenticated(),
      renderSignIn: async () => true,
      routeCustomerOrder: () => SHOP_PATHS.order,
      routeGuestOrder: () => SHOP_PATHS.order,
    })($form);
    return;
  }

  const [
    { default: OrderHeader }, { default: OrderStatus }, { default: CustomerDetails },
    { default: OrderCostSummary }, { default: OrderProductList },
  ] = await Promise.all([
    import('@dropins/storefront-order/containers/OrderHeader.js'),
    import('@dropins/storefront-order/containers/OrderStatus.js'),
    import('@dropins/storefront-order/containers/CustomerDetails.js'),
    import('@dropins/storefront-order/containers/OrderCostSummary.js'),
    import('@dropins/storefront-order/containers/OrderProductList.js'),
  ]);

  const fragment = document.createRange().createContextualFragment(`
    <div class="order__header"></div>
    <div class="order__layout">
      <div class="order__main">
        <div class="order__status"></div>
        <div class="order__products"></div>
        <div class="order__customer"></div>
      </div>
      <aside class="order__aside">
        <div class="order__summary"></div>
        <p class="order__continue"><a class="button" href="${SHOP_PATHS.root}">Continue shopping</a></p>
      </aside>
    </div>`);
  fragment.prepend(demoNotice());
  block.append(fragment);

  const productLink = (item) => getProductLink(item.product?.urlKey || item.productUrlKey);
  await Promise.all([
    OrderProvider.render(OrderHeader, { handleEmailAvailability: async () => true })(block.querySelector('.order__header')),
    OrderProvider.render(OrderStatus, { slots: { OrderActions: () => null } })(block.querySelector('.order__status')),
    OrderProvider.render(OrderProductList, {
      routeProductDetails: productLink,
      slots: {
        CartSummaryItemImage: (ctx) => {
          const { data, defaultImageProps } = ctx;
          tryRenderAemAssetsImage(ctx, {
            alias: data.product?.sku || data.productSku,
            imageProps: defaultImageProps,
            params: { width: defaultImageProps.width, height: defaultImageProps.height },
          });
        },
      },
    })(block.querySelector('.order__products')),
    OrderProvider.render(CustomerDetails)(block.querySelector('.order__customer')),
    OrderProvider.render(OrderCostSummary)(block.querySelector('.order__summary')),
  ]);

  events.on('order/error', () => {
    block.querySelector('.order__layout').hidden = true;
    const p = document.createElement('p');
    p.textContent = 'We couldn’t find that order. Check the link or look it up by order number.';
    block.append(p);
  });
}
