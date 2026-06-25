/**
 * Aero booking funnel ACDL events with cross-site attribution.
 */
import { readFlightAttribution } from './aero-blocks.js';

/**
 * @param {string} eventName
 * @param {{ step?: number, label?: string }} detail
 */
export function pushBookingEvent(eventName, detail = {}) {
  if (typeof window === 'undefined' || !window.adobeDataLayer) return;
  const attrs = readFlightAttribution();
  window.adobeDataLayer.push({
    event: eventName,
    booking: {
      step: detail.step,
      label: detail.label || '',
    },
    attribution: {
      adventure: attrs.adv || '',
      campaignId: attrs.cid || '',
      referrer: attrs.ref || '',
      destination: attrs.dest || '',
    },
  });
}

/**
 * Listen for cross-site flight search start from embedded widget.
 */
export function initAeroEmbedAnalytics() {
  window.addEventListener('wknd:flight-search-start', (e) => {
    if (!window.adobeDataLayer) return;
    const detail = e.detail || {};
    window.adobeDataLayer.push({
      event: 'flightSearchStart',
      attribution: {
        destination: detail.dest || '',
        adventure: detail.adv || '',
        campaignId: detail.cid || '',
        referrer: detail.ref || 'wknd-adventures',
      },
    });
  });
}

if (typeof window !== 'undefined') {
  initAeroEmbedAnalytics();
}
