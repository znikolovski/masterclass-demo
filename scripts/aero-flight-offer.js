import { MESH_ENDPOINT } from './commerce-config.js';
import validateAeroOffer from './aero-offer-validation.js';

export { default as validateAeroOffer } from './aero-offer-validation.js';

const FIELDS = `status reason booking_id promotion_id bundle_id name percent_off expires_at
  components { sku quantity name }`;
export const AERO_OFFER_QUERY = `query WkndAeroBundleOffer($bookingId: String!) {
  wkndAeroBundleOffer(booking_id: $bookingId) { ${FIELDS} }
}`;
export const AERO_OFFER_CLAIM = `mutation ClaimWkndAeroBundleOffer($bookingId: String!) {
  claimWkndAeroBundleOffer(booking_id: $bookingId) { ${FIELDS} }
}`;

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
