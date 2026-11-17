/*
 * Account — WKND customer's order history and saved addresses (Adobe Commerce account
 * drop-in). Customers sign in with the shared WKND sign-in (Auth0, as for WKND Aero).
 * Authoring: none.
 */
import {
  initializeCommerce, getProductLink, checkIsAuthenticated, SHOP_PATHS,
} from '../../scripts/commerce.js';

async function renderSignedOut(block, shopAuth) {
  const wrapper = document.createElement('div');
  wrapper.className = 'account__signin';
  wrapper.innerHTML = '<p>Sign in with your WKND account to see your orders and saved addresses.</p>';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button';
  button.textContent = 'Sign in with WKND';
  const error = document.createElement('p');
  error.className = 'account__error';
  error.setAttribute('role', 'alert');
  button.addEventListener('click', async () => {
    error.textContent = '';
    try {
      await shopAuth.signInToShop();
      window.location.reload();
    } catch (e) {
      error.textContent = e?.message || 'Sign-in was cancelled.';
    }
  });
  wrapper.append(button, error);
  block.replaceChildren(wrapper);
}

export default async function decorate(block) {
  await initializeCommerce();
  const shopAuth = await import('../../scripts/shop-auth.js');
  if (!checkIsAuthenticated()) {
    await renderSignedOut(block, shopAuth);
    return;
  }
  await import('../../scripts/initializers/account.js');
  const [
    { render: AccountProvider }, { default: OrdersList }, { default: Addresses },
    { tryRenderAemAssetsImage }, { events },
  ] = await Promise.all([
    import('@dropins/storefront-account/render.js'),
    import('@dropins/storefront-account/containers/OrdersList.js'),
    import('@dropins/storefront-account/containers/Addresses.js'),
    import('@dropins/tools/lib/aem/assets.js'),
    import('@dropins/tools/event-bus.js'),
  ]);

  const fragment = document.createRange().createContextualFragment(`
    <div class="account__toolbar"><button type="button" class="button secondary account__signout">Sign out</button></div>
    <div class="account__orders"></div>
    <h2>Saved addresses</h2>
    <div class="account__addresses"></div>`);
  fragment.querySelector('.account__signout').addEventListener('click', () => shopAuth.signOutOfShop());
  block.replaceChildren(fragment);

  await Promise.all([
    AccountProvider.render(OrdersList, {
      minifiedView: false,
      withHeader: true,
      routeOrderDetails: (orderNumber) => `${SHOP_PATHS.order}?orderRef=${encodeURIComponent(orderNumber)}`,
      routeReturnDetails: () => SHOP_PATHS.account,
      routeOrderProduct: (item) => getProductLink(item?.product?.urlKey),
      slots: {
        OrderItemImage: (ctx) => {
          const { data, defaultImageProps } = ctx;
          tryRenderAemAssetsImage(ctx, {
            alias: data.product?.sku,
            imageProps: defaultImageProps,
            params: { width: defaultImageProps.width, height: defaultImageProps.height },
          });
        },
      },
    })(block.querySelector('.account__orders')),
    AccountProvider.render(Addresses, { minifiedView: false, withHeader: false })(block.querySelector('.account__addresses')),
  ]);

  events.on('authenticated', (signedIn) => {
    if (!signedIn) window.location.reload();
  });
}
