/* eslint-disable import/no-unresolved */
import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { fetchAeroOffer } from '../../../../scripts/aero-flight-offer.js';
import { AERO_SHOP_ORIGIN } from '../../../../scripts/aero-shop.js';
import { getBookingAccessToken, signInForBooking } from '../../../../scripts/aero-auth.js';

export default function FlightOffer({ bookingId, api, signedIn }) {
  const [offer, setOffer] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const active = useRef(null);
  const busy = useRef(false);

  async function check(claim, controller) {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(false);
    try {
      const token = await getBookingAccessToken(api);
      if (controller.signal.aborted) return;
      const result = await fetchAeroOffer(bookingId, token, { claim, signal: controller.signal });
      if (!controller.signal.aborted) setOffer(result);
    } catch {
      if (!controller.signal.aborted) {
        setOffer(null);
        setError(true);
      }
    } finally {
      if (!controller.signal.aborted) {
        busy.current = false;
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    busy.current = false;
    setOffer(null);
    setError(false);
    setLoading(false);
    if (signedIn) check(false, controller);
    return () => controller.abort();
  }, [bookingId, api, signedIn, attempt]);

  const available = signedIn && offer && ['ELIGIBLE', 'CLAIMED'].includes(offer.status);
  return h('section', {
    class: 'booking-gear', 'aria-label': 'Flight-linked gear offer', 'aria-busy': loading,
  }, [
    h('h2', null, 'Your flight-linked gear offer'),
    h('p', null, 'Optional WKND gear is purchased separately. Your flight is unchanged.'),
    !signedIn && h('button', {
      type: 'button',
      class: 'booking-btn booking-btn-secondary',
      onClick: async () => {
        try { await signInForBooking(api); } catch { setError(true); }
      },
    }, 'Sign in to check your offer'),
    loading && h('p', { role: 'status' }, 'Checking your flight-linked offer...'),
    error && h('div', null, [
      h('p', { role: 'alert' }, 'Your gear offer could not be confirmed. Retry without changing your flight.'),
      signedIn && h('button', {
        type: 'button', onClick: () => setAttempt((value) => value + 1),
      }, 'Retry flight-linked offer'),
    ]),
    offer?.status === 'INELIGIBLE' && h('p', { role: 'status' }, 'No flight-linked offer is available for this booking and account.'),
    offer?.status === 'REDEEMED' && h('p', { role: 'status' }, 'This flight-linked offer has already been used.'),
    available && h('div', null, [
      h('h3', null, offer.name),
      h('p', null, `${offer.percent_off}% off one exact complete kit, until ${new Date(offer.expires_at).toLocaleString('en-AU')}. One use per booking and shopper. The best eligible discount applies; offers do not stack.`),
      h('ul', null, offer.components.map((item) => h('li', { key: item.sku }, `${item.quantity} × ${item.name}`))),
      offer.status === 'ELIGIBLE' && h('button', {
        type: 'button',
        class: 'booking-btn booking-btn-primary',
        disabled: loading,
        onClick: () => check(true, active.current),
      }, 'Claim flight-linked offer'),
      offer.status === 'CLAIMED' && h('div', null, [
        h('p', { role: 'status' }, 'Offer saved to your account. No gear has been added or purchased.'),
        h('a', {
          href: `${AERO_SHOP_ORIGIN}/shop/cart?aero_booking=${encodeURIComponent(bookingId)}`,
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'booking-btn booking-btn-primary',
        }, 'Shop your kit (opens in a new tab)'),
        h('p', null, 'Sign in to WKND Shop with the same account, add the kit, and review the current prices before separate checkout.'),
      ]),
    ]),
  ]);
}
