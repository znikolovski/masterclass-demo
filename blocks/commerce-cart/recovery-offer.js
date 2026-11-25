/*
 * Cart recovery offer for signed-in shoppers. Eligibility (55m–7d inactive cart, no purchase
 * since, one redemption per campaign) is decided only by the Commerce backend
 * (wkndRecoveryOffer / claimWkndRecoveryOffer); this UI never grants a discount itself.
 * The shopper applies the offer explicitly; an existing coupon is never replaced silently, and the
 * offer is only shown when the engine says it saves more than the promotion already applied.
 */
import { CORE_FETCH_GRAPHQL, checkIsAuthenticated } from '../../scripts/commerce-utils.js';

const OFFER_FIELDS = 'status coupon_code percent_off max_discount { value } expires_at saving { value } current_saving { value }';
const OFFER_QUERY = `query WkndRecoveryOffer($cartId: String!) { wkndRecoveryOffer(cart_id: $cartId) { ${OFFER_FIELDS} } }`;
const CUSTOMER_OFFER_QUERY = `query WkndCustomerRecoveryOffer {
  wkndCustomerRecoveryOffer {
    cart_id items { uid quantity } applied_coupon_codes
    offer { ${OFFER_FIELDS} }
  }
}`;
const CLAIM_MUTATION = `mutation ClaimWkndRecoveryOffer($cartId: String!) { claimWkndRecoveryOffer(cart_id: $cartId) { ${OFFER_FIELDS} } }`;
const AVAILABLE = ['ELIGIBLE', 'CLAIMED'];
let prefetched = null;

async function request(query, cartId) {
  const { data, errors } = await CORE_FETCH_GRAPHQL.fetchGraphQl(query, { method: 'POST', variables: { cartId } });
  if (errors?.length) throw new Error(errors[0].message);
  return data;
}

export function prefetchRecoveryOffer({ events }) {
  if (prefetched || !checkIsAuthenticated()) return;
  prefetched = request(CUSTOMER_OFFER_QUERY).then((data) => {
    if (data?.wkndCustomerRecoveryOffer === undefined) {
      throw new Error('The shop did not confirm the recovery offer check.');
    }
    return { snapshot: data.wkndCustomerRecoveryOffer };
  }).catch((error) => ({ error }));
  events.on('authenticated', () => { prefetched = null; });
}

function cartKey({ id, items = [], appliedCoupons = [] }) {
  return JSON.stringify([
    id,
    items.map((item) => [item.uid, item.quantity]).sort(([a], [b]) => a.localeCompare(b)),
    appliedCoupons.map(({ code }) => code?.toUpperCase()).filter(Boolean).sort(),
  ]);
}

async function offerForCart(cart) {
  const pending = prefetched;
  prefetched = null;
  if (pending) {
    const { snapshot, error } = await pending;
    if (error) throw error;
    if (snapshot && cartKey(cart) === cartKey({
      id: snapshot.cart_id,
      items: snapshot.items,
      appliedCoupons: snapshot.applied_coupon_codes.map((code) => ({ code })),
    })) return snapshot.offer;
  }
  return (await request(OFFER_QUERY, cart.id))?.wkndRecoveryOffer;
}

const formatAud = (value, digits = 0) => new Intl.NumberFormat('en-AU', {
  style: 'currency', currency: 'AUD', minimumFractionDigits: digits, maximumFractionDigits: digits,
}).format(value);

/** Only offers that beat what the cart already gets (both figures from the backend engine). */
const beatsCurrent = (offer) => (
  Number(offer.saving?.value) > Number(offer.current_saving?.value ?? 0)
);

function formatEnds(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  }).format(date);
}

function renderOffer(offer, { replacing }) {
  const ends = formatEnds(offer.expires_at);
  const fragment = document.createRange().createContextualFragment(`
    <section class="cart-recovery-offer" aria-labelledby="cart-recovery-offer-title">
      <p class="cart-recovery-offer__eyebrow">Welcome back</p>
      <h2 id="cart-recovery-offer-title" class="cart-recovery-offer__title"></h2>
      <p class="cart-recovery-offer__text"></p>
      <button type="button" class="cart-recovery-offer__apply">Apply this offer</button>
      <p class="cart-recovery-offer__status" role="status" aria-live="polite"></p>
    </section>`);
  const details = [
    `${offer.percent_off}% off your gear, up to ${formatAud(offer.max_discount?.value)}.`,
    ends ? `Ends ${ends}.` : '',
    'One use per account.',
    replacing ? `Replaces code ${replacing}.` : '',
  ].filter(Boolean).join(' ');
  fragment.querySelector('.cart-recovery-offer__title').textContent = `Save ${formatAud(offer.saving.value, 2)} on this cart`;
  fragment.querySelector('.cart-recovery-offer__text').textContent = details;
  return fragment.firstElementChild;
}

/**
 * Shows the recovery offer above the order summary when the backend reports one.
 * @param {Element} container element the offer is inserted before
 * @param {{ events: object, pushShopEvent: Function }} deps
 */
export default function initRecoveryOffer(container, { events, pushShopEvent }) {
  let $offer = null;
  let checkedKey = null;
  let busy = false;
  let latest = 0;

  const remove = () => {
    $offer?.remove();
    $offer = null;
  };

  async function show(cart, key) {
    latest += 1;
    const run = latest;
    checkedKey = key;
    remove();
    let offer;
    try {
      offer = await offerForCart(cart);
    } catch (e) {
      if (run !== latest) return;
      checkedKey = null;
      // eslint-disable-next-line no-console
      console.error('commerce-cart recovery offer check failed', e?.name || 'Error');
      const fragment = document.createRange().createContextualFragment(`
        <section class="cart-recovery-offer" aria-label="Recovery offer check">
          <p class="cart-recovery-offer__status" role="status" aria-live="polite">
            We couldn't check your recovery offer. Your cart has not been changed.
          </p>
          <button type="button" class="cart-recovery-offer__apply">Retry offer check</button>
        </section>`);
      $offer = fragment.firstElementChild;
      container.before($offer);
      $offer.querySelector('button').addEventListener('click', () => show(cart, key));
      pushShopEvent('shopRecoveryOfferError', { eventType: 'web.webinteraction.linkClicks', data: { offerStatus: 'ERROR' } });
      return;
    }
    if (run !== latest) return; // a newer cart state is being checked
    remove();
    const usable = offer && AVAILABLE.includes(offer.status) && offer.coupon_code;
    if (!usable || !beatsCurrent(offer)) return;
    const applied = (cart.appliedCoupons || []).map((c) => c.code?.toUpperCase()).filter(Boolean);
    if (applied.includes(offer.coupon_code)) return;
    $offer = renderOffer(offer, { replacing: applied[0] || null });
    container.before($offer);
    pushShopEvent('shopRecoveryOfferView', { eventType: 'web.webinteraction.linkClicks', data: { offerStatus: offer.status } });

    const $button = $offer.querySelector('.cart-recovery-offer__apply');
    const $status = $offer.querySelector('.cart-recovery-offer__status');
    $button.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      $button.disabled = true;
      $status.textContent = 'Applying your offer…';
      try {
        const claimed = offer.status === 'CLAIMED' ? offer : (await request(CLAIM_MUTATION, cart.id))?.claimWkndRecoveryOffer;
        if (claimed?.status !== 'CLAIMED') throw new Error('This offer is no longer available.');
        const { applyCouponsToCart, ApplyCouponsStrategy } = await import('@dropins/storefront-cart/api.js');
        await applyCouponsToCart([claimed.coupon_code], ApplyCouponsStrategy.REPLACE);
        pushShopEvent('shopRecoveryOfferApply', { eventType: 'web.webinteraction.linkClicks', data: { offerStatus: 'APPLIED' } });
        remove();
      } catch (e) {
        $status.textContent = e?.message || 'We couldn’t apply this offer. Please try again.';
        $button.disabled = false;
        pushShopEvent('shopRecoveryOfferError', { eventType: 'web.webinteraction.linkClicks', data: { offerStatus: 'ERROR' } });
      } finally {
        busy = false;
      }
    });
  }

  events.on('authenticated', (signedIn) => {
    if (signedIn) return;
    latest += 1;
    checkedKey = null;
    remove();
  });

  // Re-check when the cart or its applied code changes (e.g. after sign-in or a coupon edit).
  events.on('cart/data', (cart) => {
    if (!cart?.id || !(cart.totalQuantity > 0) || !checkIsAuthenticated()) {
      latest += 1;
      checkedKey = null;
      remove();
      return;
    }
    // Savings depend on the lines too, so quantity edits re-check the comparison.
    const key = cartKey(cart);
    if (key === checkedKey) return;
    show(cart, key);
  }, { eager: true });
}
