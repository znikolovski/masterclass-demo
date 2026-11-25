import { SHOP_PATHS } from '../../scripts/commerce-config.js';
import {
  AERO_OFFER_QUERY, AERO_OFFER_CLAIM, validateAeroOffer,
} from '../../scripts/aero-flight-offer.js';

const BOOKING_ID = /^BK_[0-9a-f]{16}$/;

/** A booking reference is a lookup hint, never a discount or identity credential. */
export default function initAeroOffer(container, {
  fetchGraphQl, isAuthenticated, signIn, events, refreshCart, addProducts,
  search = window.location.search,
}) {
  const ids = new URLSearchParams(search).getAll('aero_booking');
  if (!ids.length) return;
  const panel = document.createElement('section');
  panel.className = 'cart-aero-offer';
  panel.setAttribute('aria-label', 'Flight-linked gear offer');
  const title = document.createElement('h2');
  title.textContent = 'Your flight-linked gear offer';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const details = document.createElement('div');
  const button = document.createElement('button');
  button.type = 'button';
  panel.append(title, status, details, button);
  container.prepend(panel);
  if (ids.length !== 1 || !BOOKING_ID.test(ids[0])) {
    status.textContent = 'This booking reference is invalid. Open the link from your Aero confirmation.';
    button.hidden = true;
    return;
  }
  const [bookingId] = ids;
  let version = 0;
  let operation = 'check';
  let busy = false;
  let selectedOffer = null;

  function show(offer) {
    validateAeroOffer(offer, bookingId);
    selectedOffer = offer;
    if (offer.status === 'INELIGIBLE' || offer.status === 'REDEEMED') {
      status.textContent = offer.status === 'REDEEMED'
        ? 'This flight-linked offer has already been used.'
        : 'No flight-linked offer is available for this booking and account. Check that you signed in with the account that booked the flight.';
      button.hidden = true;
      return;
    }
    const terms = document.createElement('p');
    terms.textContent = `${offer.name}: ${offer.percent_off}% off one exact complete kit. Ends ${new Date(offer.expires_at).toLocaleString('en-AU')}. One use per booking and shopper; the best eligible discount applies, not stacked. Gear is optional and purchased separately from your flight.`;
    const list = document.createElement('ul');
    offer.components.forEach((item) => {
      const row = document.createElement('li');
      const link = document.createElement('a');
      link.href = `${SHOP_PATHS.search}?q=${encodeURIComponent(item.sku)}`;
      link.textContent = `${item.quantity} × ${item.name} (${item.sku})`;
      row.append(link);
      list.append(row);
    });
    details.append(terms, list);
    operation = offer.status === 'ELIGIBLE' ? 'claim' : 'add';
    status.textContent = offer.status === 'CLAIMED'
      ? 'Offer saved to your account. Shop the exact products and quantities above, then review your cart total before purchasing. Claiming does not add products or place an order.'
      : 'Commerce has confirmed this booking is eligible. Claim the offer before shopping the kit.';
    button.textContent = offer.status === 'ELIGIBLE' ? 'Claim flight-linked offer' : 'Add missing kit products';
    button.hidden = false;
  }

  async function run(claim = false) {
    if (busy) return;
    busy = true;
    version += 1;
    const current = version;
    button.disabled = true;
    details.replaceChildren();
    panel.setAttribute('aria-busy', 'true');
    status.textContent = 'Checking your flight-linked offer...';
    try {
      if (!isAuthenticated()) {
        operation = 'signin';
        status.textContent = 'Sign in to WKND Shop with the same account used to confirm your Aero flight.';
        button.textContent = 'Sign in to check offer';
        button.hidden = false;
        return;
      }
      const key = claim ? 'claimWkndAeroBundleOffer' : 'wkndAeroBundleOffer';
      const result = await fetchGraphQl(claim ? AERO_OFFER_CLAIM : AERO_OFFER_QUERY, {
        method: 'POST', variables: { bookingId }, cache: 'no-cache',
      });
      if (current !== version) return;
      if (result.errors?.length) throw new Error('Flight offer service unavailable.');
      show(result.data?.[key]);
      if (claim && result.data?.[key]?.status === 'CLAIMED') {
        await refreshCart();
      }
    } catch {
      if (current !== version) return;
      details.replaceChildren();
      operation = 'check';
      status.textContent = 'Could not confirm your flight-linked offer. Your flight and ordinary shop checkout are unchanged. Sign in again if your session expired, then retry.';
      button.textContent = 'Retry flight-linked offer';
      button.hidden = false;
    } finally {
      if (current === version) {
        busy = false;
        button.disabled = false;
        panel.setAttribute('aria-busy', 'false');
      }
    }
  }

  async function addKit() {
    if (busy) return;
    if (!isAuthenticated()) {
      await run();
      return;
    }
    busy = true;
    version += 1;
    const current = version;
    button.disabled = true;
    panel.setAttribute('aria-busy', 'true');
    status.textContent = 'Checking your account, kit and current cart before adding products...';
    try {
      const { data, errors } = await fetchGraphQl(AERO_OFFER_QUERY, {
        method: 'POST', variables: { bookingId }, cache: 'no-cache',
      });
      if (current !== version) return;
      if (errors?.length) throw new Error('Flight offer service unavailable.');
      selectedOffer = validateAeroOffer(data?.wkndAeroBundleOffer, bookingId);
      if (selectedOffer.status !== 'CLAIMED') throw new Error('Offer is not claimed.');
      const cart = await refreshCart();
      if (current !== version || !isAuthenticated()) return;
      const additions = selectedOffer.components.map(({ sku, quantity }) => ({
        sku,
        quantity: Math.max(0, quantity - (cart?.items || [])
          .filter((item) => item.sku === sku)
          .reduce((sum, item) => sum + item.quantity, 0)),
      })).filter(({ quantity }) => quantity > 0);
      if (additions.length) await addProducts(additions);
      if (current !== version) return;
      const updated = await refreshCart();
      if (current !== version) return;
      if (selectedOffer.components.some(({ sku, quantity }) => (
        (updated?.items || []).filter((item) => item.sku === sku)
          .reduce((sum, item) => sum + item.quantity, 0) < quantity
      ))) throw new Error('Incomplete kit.');
      status.textContent = 'Kit products are in your cart. Review quantities, current prices and the applied discount before separate checkout. No order has been placed.';
      operation = 'check';
      button.textContent = 'Check offer again';
    } catch {
      if (current !== version) return;
      status.textContent = 'Could not confirm every kit product. Check your cart before trying again; some products may have been added. No order has been placed.';
      operation = 'check';
      button.textContent = 'Check offer again';
      await refreshCart().catch(() => {});
    } finally {
      if (current === version) {
        busy = false;
        button.disabled = false;
        panel.setAttribute('aria-busy', 'false');
      }
    }
  }

  button.addEventListener('click', async () => {
    if (operation === 'add') {
      await addKit();
      return;
    }
    if (operation === 'signin') {
      button.disabled = true;
      try {
        await signIn();
      } catch {
        status.textContent = 'Sign-in was not completed. Try again with the account used for your flight.';
        button.disabled = false;
        return;
      }
      button.disabled = false;
    }
    await run(operation === 'claim');
  });
  events.on('authenticated', () => {
    version += 1;
    busy = false;
    run();
  });
  run();
}
