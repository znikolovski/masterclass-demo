/*
 * Checkout — Adobe Commerce checkout drop-in for the WKND demo store.
 * Adapted from hlxsites/aem-boilerplate-commerce (Apache-2.0):
 *  - sign-in uses the shared WKND customer sign-in (Auth0, as for WKND Aero), not passwords
 *  - the only payment method is WKND Demo Pay — demonstration only, no payment is taken
 * Authoring: none (the block has no configuration).
 */
import {
  initializeCommerce, getProductLink, SHOP_PATHS, shopPromises,
} from '../../scripts/commerce.js';
import { pushShopEvent } from '../../scripts/shop-analytics.js';

const SHIPPING_FORM_NAME = 'selectedShippingAddress';
const BILLING_FORM_NAME = 'selectedBillingAddress';
const LOGIN_FORM_NAME = 'login-form';
const DEBOUNCE_TIME = 1000;
const DEMO_PAY = 'wknd_demo_pay';

function demoNotice(text) {
  const p = document.createElement('p');
  p.className = 'shop-demo-notice';
  p.innerHTML = `<strong>Demo store.</strong>&nbsp;${text}`;
  return p;
}

export default async function decorate(block) {
  await initializeCommerce();
  await Promise.all([
    import('../../scripts/initializers/checkout.js'),
    import('../../scripts/initializers/account.js'),
    import('../../scripts/initializers/order.js'),
  ]);
  const [
    { events }, { ProgressSpinner, provider: UI }, utils, checkoutApi, orderApi,
    { render: CheckoutProvider }, { render: CartProvider }, { render: AccountProvider },
    { default: LoginForm }, { default: MergedCartBanner }, { default: ServerError },
    { default: OutOfStock }, { default: BillToShippingAddress }, { default: ShippingMethods },
    { default: PaymentMethods }, { default: PlaceOrder }, { default: OrderSummary },
    { default: CartSummaryList }, { default: AddressForm }, { default: Addresses },
    { tryRenderAemAssetsImage }, shopAuth,
  ] = await Promise.all([
    import('@dropins/tools/event-bus.js'),
    import('@dropins/tools/components.js'),
    import('@dropins/storefront-checkout/lib/utils.js'),
    import('@dropins/storefront-checkout/api.js'),
    import('@dropins/storefront-order/api.js'),
    import('@dropins/storefront-checkout/render.js'),
    import('@dropins/storefront-cart/render.js'),
    import('@dropins/storefront-account/render.js'),
    import('@dropins/storefront-checkout/containers/LoginForm.js'),
    import('@dropins/storefront-checkout/containers/MergedCartBanner.js'),
    import('@dropins/storefront-checkout/containers/ServerError.js'),
    import('@dropins/storefront-checkout/containers/OutOfStock.js'),
    import('@dropins/storefront-checkout/containers/BillToShippingAddress.js'),
    import('@dropins/storefront-checkout/containers/ShippingMethods.js'),
    import('@dropins/storefront-checkout/containers/PaymentMethods.js'),
    import('@dropins/storefront-checkout/containers/PlaceOrder.js'),
    import('@dropins/storefront-cart/containers/OrderSummary.js'),
    import('@dropins/storefront-cart/containers/CartSummaryList.js'),
    import('@dropins/storefront-account/containers/AddressForm.js'),
    import('@dropins/storefront-account/containers/Addresses.js'),
    import('@dropins/tools/lib/aem/assets.js'),
    import('../../scripts/shop-auth.js'),
  ]);

  const redirectToCartIfEmpty = (cart) => {
    if (events.lastPayload('order/placed')) return;
    if (cart === null || cart?.items?.length === 0) window.location.href = SHOP_PATHS.cart;
  };
  redirectToCartIfEmpty(events.lastPayload('cart/initialized'));

  const fragment = utils.createFragment(`
    <div class="checkout__wrapper">
      <div class="checkout__loader"></div>
      <div class="checkout__loader-status" role="status" aria-live="polite"></div>
      <div class="checkout__content">
        <div class="checkout__merged-cart-banner"></div>
        <div class="checkout__main">
          <ol class="checkout__steps" aria-label="Checkout progress">
            <li data-step="1">Contact</li>
            <li data-step="2">Shipping address</li>
            <li data-step="3">Delivery</li>
            <li data-step="4">Payment</li>
          </ol>
          <div class="checkout__demo"></div>
          <div class="checkout__server-error checkout__block"></div>
          <div class="checkout__out-of-stock checkout__block"></div>
          <div class="checkout__account-prompt" hidden>
            <div>
              <p class="checkout__account-prompt-title">Have a WKND account?</p>
              <p>Sign in to check out faster with your details and saved addresses, or continue as a guest below.</p>
            </div>
            <div class="checkout__account-prompt-actions">
              <button type="button" class="button primary" data-action="signin">Sign in</button>
              <button type="button" class="button secondary" data-action="signup">Create account</button>
            </div>
            <p class="checkout__account-prompt-error" role="alert"></p>
          </div>
          <div class="checkout__login checkout__block"></div>
          <div class="checkout__shipping-form checkout__block"></div>
          <div class="checkout__bill-to-shipping checkout__block"></div>
          <div class="checkout__delivery checkout__block"></div>
          <div class="checkout__payment-methods checkout__block"></div>
          <div class="checkout__billing-form checkout__block"></div>
          <div class="checkout__place-order checkout__block shop-accent"></div>
        </div>
        <div class="checkout__aside">
          <div class="checkout__order-summary checkout__block"></div>
          <div class="checkout__cart-summary checkout__block"></div>
          <div class="checkout__promises"></div>
        </div>
      </div>
    </div>`);
  const $ = utils.createScopedSelector(fragment);
  const $content = $('.checkout__content');
  const $loader = $('.checkout__loader');
  const $loaderStatus = $('.checkout__loader-status');
  const $shippingForm = $('.checkout__shipping-form');
  const $billingForm = $('.checkout__billing-form');
  $('.checkout__demo').append(demoNotice('WKND Demo Pay simulates payment — no card details are collected and nothing will be charged or shipped.'));
  $('.checkout__promises').append(shopPromises(['shipping', 'warranty', 'demo']));
  const $steps = [...fragment.querySelectorAll('.checkout__steps li')];
  // guests: offer sign-in up front (the drop-in reloads checkout in customer mode on success)
  const $prompt = $('.checkout__account-prompt');
  $prompt.hidden = shopAuth.hasShopToken();
  $prompt.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const error = $prompt.querySelector('.checkout__account-prompt-error');
      error.textContent = '';
      button.disabled = true;
      try {
        await shopAuth.signInToShop({ signup: button.dataset.action === 'signup', surface: 'checkout' });
      } catch {
        error.textContent = 'Sign-in was cancelled. You can still check out as a guest.';
      } finally {
        button.disabled = false;
      }
    });
  });
  block.replaceChildren(fragment);

  const shippingFormRef = { current: null };
  const billingFormRef = { current: null };
  const loaderRef = { current: null };
  let shippingForm;
  let billingForm;

  const showSpinner = async () => {
    $loaderStatus.textContent = 'Placing your order…';
    if (!loaderRef.current) loaderRef.current = await UI.render(ProgressSpinner, {})($loader);
  };
  const hideSpinner = () => {
    $loaderStatus.textContent = '';
    loaderRef.current?.remove();
    loaderRef.current = null;
  };

  const storeConfig = () => checkoutApi.getStoreConfigCache?.() || { defaultCountry: 'AU' };
  const defaults = (cartAddress) => (cartAddress
    ? utils.transformCartAddressToFormValues(cartAddress)
    : { countryCode: storeConfig().defaultCountry || 'AU' });

  const guestAddressForm = (container, ref, data, type) => {
    const shipping = type === 'shipping';
    const cartAddress = utils.getCartAddress(data, type);
    const setOnCart = utils.setAddressOnCart({ type, debounceMs: DEBOUNCE_TIME });
    const estimate = shipping ? utils.estimateShippingCost({ debounceMs: DEBOUNCE_TIME }) : null;
    let first = true;
    return AccountProvider.render(AddressForm, {
      addressesFormTitle: shipping ? 'Shipping address' : 'Billing address',
      fieldIdPrefix: type,
      formName: shipping ? SHIPPING_FORM_NAME : BILLING_FORM_NAME,
      forwardFormRef: ref,
      hideActionFormButtons: true,
      inputsDefaultValueSet: defaults(cartAddress),
      isOpen: true,
      showBillingCheckBox: false,
      showShippingCheckBox: false,
      showFormLoader: false,
      onChange: (values) => {
        if (!first || !cartAddress) setOnCart(values);
        if (estimate && !cartAddress) estimate(values);
        first = false;
      },
    })(container);
  };

  const customerAddresses = (container, ref, data, type) => {
    const shipping = type === 'shipping';
    const cartAddress = utils.getCartAddress(data, type);
    const setOnCart = utils.setAddressOnCart({ type, debounceMs: DEBOUNCE_TIME });
    let first = true;
    return AccountProvider.render(Addresses, {
      addressFormTitle: shipping ? 'Ship to a new address' : 'Bill to a new address',
      defaultSelectAddressId: cartAddress ? cartAddress.id ?? 0 : undefined,
      fieldIdPrefix: type,
      formName: shipping ? SHIPPING_FORM_NAME : BILLING_FORM_NAME,
      forwardFormRef: ref,
      inputsDefaultValueSet: cartAddress && cartAddress.id === undefined
        ? defaults(cartAddress)
        : defaults(),
      minifiedView: false,
      selectable: true,
      ...(shipping ? { selectShipping: true } : { selectBilling: true }),
      showSaveCheckBox: true,
      showBillingCheckBox: false,
      showShippingCheckBox: false,
      title: shipping ? 'Shipping address' : 'Billing address',
      onAddressData: (values) => {
        if (!first || !cartAddress) setOnCart(values);
        first = false;
      },
    })(container);
  };

  const productLink = (item) => getProductLink(item.url?.urlKey);

  await Promise.all([
    CheckoutProvider.render(MergedCartBanner)(block.querySelector('.checkout__merged-cart-banner')),
    CheckoutProvider.render(ServerError, {
      onRetry: () => $content.classList.remove('checkout__content--error'),
      onServerError: () => $content.classList.add('checkout__content--error'),
    })(block.querySelector('.checkout__server-error')),
    CheckoutProvider.render(OutOfStock, {
      routeCart: () => SHOP_PATHS.cart,
      onCartProductsUpdate: async (items) => {
        const { updateProductsFromCart } = await import('@dropins/storefront-cart/api.js');
        updateProductsFromCart(items).catch(console.error);
      },
    })(block.querySelector('.checkout__out-of-stock')),
    CheckoutProvider.render(LoginForm, {
      name: LOGIN_FORM_NAME,
      onSignInClick: () => shopAuth.signInToShop({ surface: 'checkout' }).catch((e) => console.warn('Sign-in cancelled', e)),
      onSignOutClick: () => shopAuth.signOutOfShop({ surface: 'checkout' }),
    })(block.querySelector('.checkout__login')),
    CheckoutProvider.render(BillToShippingAddress, {
      onChange: (checked) => {
        $billingForm.hidden = checked;
      },
    })(block.querySelector('.checkout__bill-to-shipping')),
    CheckoutProvider.render(ShippingMethods)(block.querySelector('.checkout__delivery')),
    CheckoutProvider.render(PaymentMethods, {
      slots: {
        Methods: {
          [DEMO_PAY]: {
            autoSync: true,
            render: (ctx) => ctx.replaceHTML(demoNotice('Your order will be confirmed instantly with a demo payment reference.')),
          },
        },
      },
    })(block.querySelector('.checkout__payment-methods')),
    CartProvider.render(OrderSummary, {})(block.querySelector('.checkout__order-summary')),
    CartProvider.render(CartSummaryList, {
      variant: 'secondary',
      routeProduct: productLink,
      slots: {
        Thumbnail: (ctx) => {
          const { item, defaultImageProps } = ctx;
          tryRenderAemAssetsImage(ctx, {
            alias: item.sku,
            imageProps: defaultImageProps,
            params: { width: defaultImageProps.width, height: defaultImageProps.height },
          });
        },
      },
    })(block.querySelector('.checkout__cart-summary')),
    CheckoutProvider.render(PlaceOrder, {
      handleValidation: () => utils.validateForms([
        { name: LOGIN_FORM_NAME },
        { name: SHIPPING_FORM_NAME, ref: shippingFormRef },
        { name: BILLING_FORM_NAME, ref: billingFormRef },
      ]),
      handlePlaceOrder: async ({ cartId }) => {
        await showSpinner();
        try {
          await orderApi.placeOrder(cartId);
        } finally {
          hideSpinner();
        }
      },
    })(block.querySelector('.checkout__place-order')),
  ]);

  const steps = new Set();
  const renderSteps = () => {
    const current = [1, 2, 3, 4].find((n) => !steps.has(n)) || 4;
    $steps.forEach((li) => {
      const n = Number(li.dataset.step);
      li.classList.toggle('is-done', steps.has(n));
      if (n === current && !steps.has(n)) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
  };
  renderSteps();
  const trackStep = (step, option) => {
    if (steps.has(step)) return;
    steps.add(step);
    renderSteps();
    pushShopEvent('shopCheckoutStep', { eventType: 'commerce.checkouts', data: { checkout: { step, option } } });
  };

  async function renderAddresses(data) {
    if (!data) return;
    if (data.isGuest) {
      if (!utils.isVirtualCart(data) && !shippingForm) shippingForm = await guestAddressForm($shippingForm, shippingFormRef, data, 'shipping');
      if (!billingForm) billingForm = await guestAddressForm($billingForm, billingFormRef, data, 'billing');
    } else {
      if (!shippingForm) shippingForm = await customerAddresses($shippingForm, shippingFormRef, data, 'shipping');
      if (!billingForm) billingForm = await customerAddresses($billingForm, billingFormRef, data, 'billing');
    }
    if (data.email) trackStep(1, data.isGuest ? 'guest' : 'signed-in');
    if (data.shippingAddresses?.[0]) trackStep(2, data.shippingAddresses[0].country?.code);
    if (utils.getCartShippingMethod?.(data)) trackStep(3, utils.getCartShippingMethod(data)?.code);
    if (utils.getCartPaymentMethod?.(data)) trackStep(4, DEMO_PAY);
  }

  const syncBillingVisibility = (values) => {
    $billingForm.hidden = values?.isBillToShipping ?? true;
  };
  syncBillingVisibility(events.lastPayload('checkout/values'));
  events.on('checkout/values', syncBillingVisibility);
  events.on('checkout/initialized', renderAddresses, { eager: true });
  events.on('checkout/updated', renderAddresses);
  events.on('cart/initialized', redirectToCartIfEmpty, { eager: true });
  events.on('cart/data', redirectToCartIfEmpty);
  events.on('authenticated', (signedIn) => {
    // switch between guest forms and saved addresses
    if (signedIn && !events.lastPayload('order/placed')) window.location.reload();
  });
  events.on('order/placed', (order) => {
    const ref = shopAuth.hasShopToken() ? order.number : order.token;
    window.location.href = `${SHOP_PATHS.order}?orderRef=${encodeURIComponent(ref)}&orderNumber=${encodeURIComponent(order.number)}`;
  });
}
