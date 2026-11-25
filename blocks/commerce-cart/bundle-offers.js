import { BUNDLE_COMPLETION_FIELD } from '../../scripts/cart-quote-batch.js';

const QUERY = `query WkndBundleOffers($cartId: String!) {
  wkndBundleOffers(cart_id: $cartId) {
    promotion_id bundle_id name quote_expires_at cart_version
    saving { value currency }
    components {
      sku name required_quantity cart_quantity missing_quantity
      unit_price { value currency }
    }
  }
}`;

const money = (amount) => new Intl.NumberFormat('en-AU', {
  style: 'currency', currency: 'AUD',
}).format(amount);

function missingProducts(offer, cart) {
  const quantities = new Map();
  (cart.items || []).forEach(({ sku, quantity }) => {
    quantities.set(sku, (quantities.get(sku) || 0) + quantity);
  });
  return offer.components.map((component) => ({
    sku: component.sku,
    quantity: Math.max(0, component.required_quantity - (quantities.get(component.sku) || 0)),
  })).filter(({ quantity }) => quantity > 0);
}

function validateOffer(offer) {
  if (!offer || !offer.promotion_id || !offer.bundle_id || typeof offer.name !== 'string'
    || !/^v(0|[1-9]\d{0,15})$/.test(offer.cart_version)
    || !Number.isFinite(Date.parse(offer.quote_expires_at))
    || offer.saving?.currency !== 'AUD' || !Number.isFinite(offer.saving.value)
    || offer.saving.value <= 0 || !Array.isArray(offer.components)
    || offer.components.length < 2 || offer.components.length > 5
    || new Set(offer.components.map((c) => c.sku)).size !== offer.components.length
    || offer.components.some((c) => !c.sku || typeof c.name !== 'string'
      || !Number.isInteger(c.required_quantity) || c.required_quantity < 1
      || c.required_quantity > 20 || c.unit_price?.currency !== 'AUD'
      || !Number.isFinite(c.unit_price.value) || c.unit_price.value <= 0)) {
    throw new Error('The shop returned an invalid bundle offer.');
  }
}

/**
 * Suggests approved kits for a partial cart. Commerce remains the discount authority.
 * @param {Element} container
 * @param {{ events: object, fetchGraphQl: Function, addProducts: Function,
 *   refreshCart: Function }} deps
 */
export default function initBundleOffers(container, {
  events, fetchGraphQl, addProducts, refreshCart,
}) {
  const fragment = document.createRange().createContextualFragment(`
    <section class="cart-bundle-offers" hidden aria-label="Complete your bundle">
      <h2 class="cart-bundle-offers__heading">Complete your bundle</h2>
      <div class="cart-bundle-offers__cards"></div>
      <p class="cart-bundle-offers__status" role="status" aria-live="polite"></p>
      <button type="button" class="cart-bundle-offers__retry" hidden>Check bundle offers again</button>
    </section>`);
  const panel = fragment.firstElementChild;
  const cards = panel.querySelector('.cart-bundle-offers__cards');
  const status = panel.querySelector('.cart-bundle-offers__status');
  const retry = panel.querySelector('.cart-bundle-offers__retry');
  container.append(panel);
  let currentCart = null;
  let checkedKey = null;
  let version = 0;
  let busy = false;
  let expiryTimer;

  const message = (text) => {
    status.textContent = text;
    panel.hidden = !text && !cards.childElementCount;
  };
  const report = (error) => {
    // eslint-disable-next-line no-console
    console.error('commerce-cart bundle offers', error);
  };
  async function request(cartId) {
    const { data, errors } = await fetchGraphQl(QUERY, {
      method: 'POST', variables: { cartId }, cache: 'no-cache',
    });
    if (errors?.length) throw new Error(errors[0].message);
    if (!Array.isArray(data?.wkndBundleOffers)) throw new Error('Bundle offers are unavailable.');
    data.wkndBundleOffers.forEach(validateOffer);
    return data.wkndBundleOffers;
  }

  async function show(cart) {
    version += 1;
    const run = version;
    clearTimeout(expiryTimer);
    cards.replaceChildren();
    retry.hidden = true;
    panel.hidden = !status.textContent;
    try {
      const offers = (await request(cart.id)).filter((offer) => (
        Date.parse(offer.quote_expires_at) > Date.now()
        && offer.components.some((component) => (
          (cart.items || []).some((item) => item.sku === component.sku && item.quantity > 0)
        ))
        && missingProducts(offer, cart).length
      ));
      if (run !== version || busy || !container.isConnected) return;
      offers.forEach((offer) => {
        const card = document.createElement('article');
        card.className = 'cart-bundle-offers__card';
        const title = document.createElement('h3');
        title.textContent = offer.name;
        const terms = document.createElement('p');
        terms.textContent = `Complete this kit to save ${money(offer.saving.value)} automatically. One kit only; shipping excluded. The best eligible promotion applies.`;
        const list = document.createElement('ul');
        const missing = missingProducts(offer, cart);
        missing.forEach(({ sku, quantity }) => {
          const component = offer.components.find((c) => c.sku === sku);
          const item = document.createElement('li');
          item.textContent = `${quantity} × ${component.name} (${sku}) — ${money(component.unit_price.value)} each`;
          list.append(item);
        });
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cart-bundle-offers__add';
        button.textContent = 'Add remaining products';
        button.setAttribute('aria-label', `Add remaining products for ${offer.name}`);
        button.addEventListener('click', async () => {
          if (busy) return;
          busy = true;
          version += 1;
          clearTimeout(expiryTimer);
          panel.setAttribute('aria-busy', 'true');
          cards.querySelectorAll('button').forEach((control) => { control.disabled = true; });
          message('Completing your bundle with current prices and availability...');
          try {
            const additions = missingProducts(offer, cart);
            if (!additions.length) {
              message('Your cart already contains this complete kit.');
              return;
            }
            if (Date.parse(offer.quote_expires_at) <= Date.now()) {
              throw new Error('This bundle quote expired. Check the latest offers.');
            }
            const confirmed = await addProducts(additions.map((item) => ({
              ...item,
              customFields: {
                [BUNDLE_COMPLETION_FIELD]: {
                  cartId: cart.id,
                  promotionId: offer.promotion_id,
                  bundleId: offer.bundle_id,
                  cartVersion: offer.cart_version,
                },
              },
            })));
            if (!confirmed?.id || confirmed.id !== cart.id
              || missingProducts(offer, confirmed).length) {
              throw new Error('The shop did not confirm every required product.');
            }
            currentCart = confirmed;
            message('Your cart contains the complete kit. The best eligible discount is applied automatically.');
          } catch (error) {
            report(error);
            message(`Could not complete the bundle. Check your cart before trying again. ${error.message}`);
            try {
              currentCart = await refreshCart();
            } catch (refreshError) {
              report(refreshError);
              message('Could not confirm your cart. Refresh the cart page before trying again.');
            }
          } finally {
            busy = false;
            panel.setAttribute('aria-busy', 'false');
            if (currentCart?.id) await show(currentCart);
            else cards.replaceChildren();
          }
        });
        card.append(title, terms, list, button);
        cards.append(card);
      });
      panel.hidden = !offers.length && !status.textContent;
      if (offers.length) {
        const expires = Math.min(...offers.map((o) => Date.parse(o.quote_expires_at)));
        expiryTimer = setTimeout(() => {
          message('');
          show(currentCart);
        }, Math.max(1, expires - Date.now()));
      }
    } catch (error) {
      if (run !== version) return;
      report(error);
      message('Bundle offers are unavailable. Your cart and checkout are still available.');
      retry.hidden = false;
    }
  }

  retry.addEventListener('click', () => show(currentCart));
  events.on('cart/data', (cart) => {
    currentCart = cart;
    if (!cart?.id || !(cart.totalQuantity > 0)) {
      version += 1;
      checkedKey = null;
      clearTimeout(expiryTimer);
      cards.replaceChildren();
      message('');
      return;
    }
    const lines = (cart.items || []).map((item) => (
      [item.sku, item.quantity, item.price?.value, item.price?.currency]
    ));
    const coupons = (cart.appliedCoupons || []).map((coupon) => coupon.code);
    const key = JSON.stringify([cart.id, lines, coupons]);
    if (key === checkedKey) return;
    checkedKey = key;
    version += 1;
    if (!busy) {
      message('');
      show(cart);
    }
  }, { eager: true });
}
