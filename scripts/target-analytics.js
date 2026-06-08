/**
 * Target personalization context for ACDL / Launch.
 * Does not replace Target reporting — supplements page context for Workspace QA.
 * @see docs/TARGET-PERSONALIZATION-PLAN.md
 */

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
      zones: [...document.querySelectorAll('main .target, main > .section.target')].map((el) => ({
        id: el.id || '',
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
        zoneId: zone.id || zone.dataset.targetId || '',
        path: window.location.pathname,
      },
    });
  };

  main.querySelectorAll('.target, .section.target').forEach((zone) => {
    if (zone.dataset.targetAnalyticsReady) return;
    zone.dataset.targetAnalyticsReady = 'true';
    reportZone(zone);
  });

  const observer = new MutationObserver(() => {
    main.querySelectorAll('.target:not([data-target-analytics-ready]), .section.target:not([data-target-analytics-ready])')
      .forEach((zone) => {
        zone.dataset.targetAnalyticsReady = 'true';
        reportZone(zone);
      });
  });

  observer.observe(main, { subtree: true, childList: true, attributes: true });
}
