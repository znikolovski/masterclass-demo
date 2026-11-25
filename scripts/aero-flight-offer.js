import { MESH_ENDPOINT } from './commerce-config.js';

const FIELDS = `status reason booking_id promotion_id bundle_id name percent_off expires_at
  components { sku quantity name }`;
export const AERO_OFFER_QUERY = `query WkndAeroBundleOffer($bookingId: String!) {
  wkndAeroBundleOffer(booking_id: $bookingId) { ${FIELDS} }
}`;
export const AERO_OFFER_CLAIM = `mutation ClaimWkndAeroBundleOffer($bookingId: String!) {
  claimWkndAeroBundleOffer(booking_id: $bookingId) { ${FIELDS} }
}`;

export function validateAeroOffer(offer, bookingId) {
  if (!offer || offer.booking_id !== bookingId
    || !['ELIGIBLE', 'CLAIMED', 'REDEEMED', 'INELIGIBLE'].includes(offer.status)
    || !Array.isArray(offer.components)) {
    throw new Error('Invalid flight offer response.');
  }
  if (['ELIGIBLE', 'CLAIMED'].includes(offer.status)
    && (!offer.promotion_id || !offer.bundle_id || !offer.name || offer.percent_off !== 50
      || !Number.isFinite(Date.parse(offer.expires_at))
      || Date.parse(offer.expires_at) <= Date.now() || !offer.components.length
      || new Set(offer.components.map((item) => item?.sku)).size !== offer.components.length
      || offer.components.some((item) => typeof item?.sku !== 'string' || !item.sku
        || typeof item.name !== 'string' || !item.name
        || !Number.isInteger(item.quantity) || item.quantity <= 0))) {
    throw new Error('Invalid flight offer details.');
  }
  return offer;
}

/** Uses the existing Aero audience; Commerce verifies ownership and confirmation server-side. */
export async function fetchAeroOffer(bookingId, token, { claim = false, signal } = {}) {
  if (!/^BK_[0-9a-f]{16}$/.test(bookingId) || !token) {
    throw new Error('A booking reference and sign-in are required.');
  }
  const response = await fetch(MESH_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Store: 'wknd_au' },
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
      : AbortSignal.timeout(10000),
    body: JSON.stringify({
      query: claim ? AERO_OFFER_CLAIM : AERO_OFFER_QUERY, variables: { bookingId },
    }),
  });
  if (!response.ok) throw new Error('Flight offer service unavailable.');
  const result = await response.json();
  if (result.errors?.length) throw new Error('Flight offer service unavailable.');
  return validateAeroOffer(result.data?.[claim ? 'claimWkndAeroBundleOffer' : 'wkndAeroBundleOffer'], bookingId);
}
