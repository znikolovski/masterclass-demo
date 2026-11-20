/*
 * Cart recovery offer for signed-in shoppers. Eligibility (24h–7d inactive cart, no purchase
 * since, one redemption per campaign) is decided only by the Commerce backend
 * (wkndRecoveryOffer / claimWkndRecoveryOffer); this UI never grants a discount itself.
 * The shopper applies the offer explicitly; an existing coupon is never replaced silently.
 */
import { CORE_FETCH_GRAPHQL, checkIsAuthenticated } from '../../scripts/commerce.js';

const OFFER_FIELDS = 'status coupon_code percent_off max_discount { value } expires_at';
const OFFER_QUERY = `query WkndRecoveryOffer($cartId: String!) { wkndRecoveryOffer(cart_id: $cartId) { ${OFFER_FIELDS} } }`;
const CLAIM_MUTATION = `mutation ClaimWkndRecoveryOffer($cartId: String!) { claimWkndRecoveryOffer(cart_id: $cartId) { ${OFFER_FIELDS} } }`;
const AVAILABLE = ['ELIGIBLE', 'CLAIMED'];

async function request(query, cartId) {
  const { data, errors } = await CORE_FETCH_GRAPHQL.fetchGraphQl(query, { method: 'POST', variables: { cartId } });
  if (errors?.length) throw new Error(errors[0].message);
  return data;
}

const formatAud = (value) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(value);

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
      <h2 id="cart-recovery-offer-title" class="cart-recovery-offer__title">Welcome back</h2>
      <p class="cart-recovery-offer__text"></p>
      <button type="button" class="dropin-button dropin-button--primary cart-recovery-offer__apply"></button>
      <p class="cart-recovery-offer__status" role="status" aria-live="polite"></p>
    </section>`);
  const text = `Take ${offer.percent_off}% off your gear, up to ${formatAud(offer.max_discount?.value)}${ends ? ` — ends ${ends}` : ''}. One use per account.`;
  fragment.querySelector('.cart-recovery-offer__text').textContent = text;
  fragment.querySelector('.cart-recovery-offer__apply').textContent = replacing ? 'Use this offer instead of your code' : 'Apply offer';
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

  const remove = () => {
    $offer?.remove();
    $offer = null;
  };

  async function show(cart) {
    let offer;
    try {
      offer = (await request(OFFER_QUERY, cart.id))?.wkndRecoveryOffer;
    } catch (e) {
      return; // backend without recovery offers or transient failure: keep the standard cart
    }
    if (!offer || !AVAILABLE.includes(offer.status) || !offer.coupon_code) return;
    const applied = (cart.appliedCoupons || []).map((c) => c.code?.toUpperCase());
    if (applied.includes(offer.coupon_code)) return;
    remove();
    $offer = renderOffer(offer, { replacing: applied.length > 0 });
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

  // Re-check when the cart or its applied code changes (e.g. after sign-in or a coupon edit).
  events.on('cart/data', (cart) => {
    if (!cart?.id || !(cart.totalQuantity > 0) || !checkIsAuthenticated()) {
      checkedKey = null;
      remove();
      return;
    }
    const key = `${cart.id}|${(cart.appliedCoupons || []).map((c) => c.code).join(',')}`;
    if (key === checkedKey) return;
    checkedKey = key;
    show(cart);
  }, { eager: true });
}
