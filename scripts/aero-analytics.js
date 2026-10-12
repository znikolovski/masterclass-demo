/**
 * Aero booking funnel ACDL events with cross-site attribution.
 */
import { readFlightAttribution } from './aero-blocks.js';
import { getJourney, saveJourney, pushJourneyEvent } from './journey-analytics.js';

/**
 * @param {string} eventName
 * @param {{ step?: number, label?: string }} detail
 */
export function pushBookingEvent(eventName, detail = {}) {
  if (typeof window === 'undefined') return;
  const attrs = readFlightAttribution();
  saveJourney({ ...getJourney(), adventure: attrs.adv || getJourney().adventure });
  pushJourneyEvent(eventName, detail);
}

/**
 * Listen for cross-site flight search start from embedded widget.
 */
export function initAeroEmbedAnalytics() {
  window.addEventListener('wknd:flight-search-start', (e) => {
    const detail = e.detail || {};
    if (detail.journeyTracked) return;
    pushBookingEvent('flightSearchStart', { onceKey: detail.searchId });
  });
}

if (typeof window !== 'undefined') {
  initAeroEmbedAnalytics();
}
