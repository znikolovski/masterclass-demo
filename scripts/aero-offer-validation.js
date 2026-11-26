export default function validateAeroOffer(offer, bookingId) {
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
