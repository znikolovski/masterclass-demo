/**
 * Header mini cart: a modal drawer with the Adobe Commerce cart drop-in's MiniCart container.
 * Loaded on demand from the header cart icon, so no drop-ins load until the cart is opened.
 */
import { loadCSS } from '../../scripts/aem.js';

let dialog;
let rendering;
let trigger;

function buildDialog() {
  dialog = document.createElement('dialog');
  dialog.className = 'nav-minicart';
  dialog.setAttribute('aria-labelledby', 'nav-minicart-title');
  dialog.innerHTML = `
    <div class="nav-minicart-panel">
      <div class="nav-minicart-header">
        <h2 id="nav-minicart-title">Your cart <span class="nav-minicart-count"></span></h2>
        <button type="button" class="nav-minicart-close" aria-label="Close cart">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      </div>
      <div class="nav-minicart-body dropin-design" aria-live="polite">
        <p class="nav-minicart-status">Loading your cart…</p>
      </div>
    </div>`;
  dialog.querySelector('.nav-minicart-close').addEventListener('click', () => dialog.close());
  // Clicks on the ::backdrop target the dialog element itself.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('nav-minicart-open');
    trigger?.focus();
  });
  document.body.append(dialog);
}

function setCount(count) {
  const n = Math.max(0, Number(count) || 0);
  dialog.querySelector('.nav-minicart-count').textContent = n ? `(${n})` : '';
}

async function renderMiniCart() {
  const body = dialog.querySelector('.nav-minicart-body');
  const {
    initializeCommerce, getProductLink, SHOP_PATHS,
  } = await import('../../scripts/commerce.js');
  await initializeCommerce();
  await import('../../scripts/initializers/cart.js');
  const [
    { render: provider }, { default: MiniCart }, { tryRenderAemAssetsImage }, { events },
  ] = await Promise.all([
    import('@dropins/storefront-cart/render.js'),
    import('@dropins/storefront-cart/containers/MiniCart.js'),
    import('@dropins/tools/lib/aem/assets.js'),
    import('@dropins/tools/event-bus.js'),
  ]);

  const productLink = (item) => getProductLink(item.url?.urlKey);
  const list = document.createElement('div');
  list.className = 'nav-minicart-list';
  await provider.render(MiniCart, {
    hideHeading: true,
    routeProduct: productLink,
    routeCart: () => SHOP_PATHS.cart,
    routeCheckout: () => SHOP_PATHS.checkout,
    routeEmptyCartCTA: () => SHOP_PATHS.root,
    enableQuantityUpdate: true,
    enableItemRemoval: true,
    showDiscount: true,
    // The drop-in derives savings from row_total, which excludes GST in this tax-inclusive store.
    showSavings: false,
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
  })(list);
  body.replaceChildren(list);

  events.on('cart/data', (cart) => setCount(cart?.totalQuantity), { eager: true });
  return events;
}

async function trackOpen(events) {
  const { pushShopEvent } = await import('../../scripts/shop-analytics.js');
  const cart = events.lastPayload('cart/data');
  pushShopEvent('shopCartView', {
    eventType: 'commerce.productListViews',
    commerce: { productListViews: { value: 1 } },
    items: cart?.items || [],
    data: { itemCount: cart?.totalQuantity || 0, surface: 'mini-cart' },
  });
}

/**
 * Opens the mini cart drawer (built and rendered on first use).
 * @param {HTMLElement} [opener] element to return focus to on close
 */
export default async function openMiniCart(opener) {
  loadCSS(`${window.hlx?.codeBasePath || ''}/blocks/header/mini-cart.css`);
  if (!dialog) buildDialog();
  trigger = opener;
  if (!dialog.open) {
    dialog.showModal();
    document.body.classList.add('nav-minicart-open');
  }
  try {
    rendering ??= renderMiniCart();
    trackOpen(await rendering).catch(() => {});
  } catch (e) {
    rendering = undefined;
    // eslint-disable-next-line no-console
    console.error('Mini cart failed to load', e);
    const fallback = opener?.getAttribute('href') || '/shop/cart';
    dialog.querySelector('.nav-minicart-body').innerHTML = `
      <p class="nav-minicart-status">Your cart couldn't be loaded here.
      <a href="${fallback}">Open the cart page</a>.</p>`;
  }
}
