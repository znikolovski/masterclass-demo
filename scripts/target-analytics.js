/**
 * Target personalization context for ACDL / Launch.
 * @see docs/TARGET-PERSONALIZATION-PLAN.md
 */

import { getTargetZones } from './target-delivery.js';

/**
 * @returns {boolean}
 */
function isTrackingEnabled() {
  if (typeof window === 'undefined') return false;
  if (document.documentElement.classList.contains('adobe-ue-edit')) return false;
  return !!window.adobeDataLayer;
}

/**
 * @param {Document} doc
 * @param {(name: string, doc?: Document) => string} getMetadataValue
 */
export function pushTargetPageContext(doc, getMetadataValue) {
  if (!isTrackingEnabled()) return;

  const enabled = ['on', 'true', 'yes'].includes(
    (getMetadataValue('target', doc) || '').toLowerCase(),
  );

  window.adobeDataLayer.push({
    target: {
      enabled,
      zones: getTargetZones(document.querySelector('main')).map((el) => ({
        location: el.dataset.targetlocation || '',
        path: window.location.pathname,
      })),
    },
  });
}

/**
 * @param {Element} main
 */
export function initTargetAnalytics(main) {
  if (!isTrackingEnabled() || !main) return;

  const reportZone = (zone) => {
    window.adobeDataLayer.push({
      event: 'targetZoneReady',
      target: {
        location: zone.dataset.targetlocation || '',
        path: window.location.pathname,
      },
    });
  };

  getTargetZones(main).forEach((zone) => {
    if (zone.dataset.targetAnalyticsReady) return;
    zone.dataset.targetAnalyticsReady = 'true';
    reportZone(zone);
  });

  const observer = new MutationObserver(() => {
    getTargetZones(main)
      .filter((zone) => !zone.dataset.targetAnalyticsReady)
      .forEach((zone) => {
        zone.dataset.targetAnalyticsReady = 'true';
        reportZone(zone);
      });
  });

  observer.observe(main, { subtree: true, childList: true, attributes: true });
}
