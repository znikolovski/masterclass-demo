/**
 * Adobe Experience Platform Web SDK + Launch configuration.
 * @see https://www.aem.live/developer/martech-integration
 * @see docs/MARTECH.md
 */

import { mapPageToAnalytics } from './analytics-page.js';

export const WEB_SDK_CONFIG = {
  datastreamId: '56dee4fc-21a9-4e37-83ab-bdd874957aba',
  orgId: '28260E2056581D3B7F000101@AdobeOrg',
  onBeforeEventSend: (content) => mapPageToAnalytics(content),
};

/** Launch embed URLs — martech loads one library per page (see getLaunchUrls). */
export const MARTECH_CONFIG = {
  stagingLaunchUrl:
    'https://assets.adobedtm.com/7bd07c5f18b6/4496842e7a60/launch-49a2d20de828-staging.min.js',
  productionLaunchUrl:
    'https://assets.adobedtm.com/7bd07c5f18b6/4496842e7a60/launch-43614c033f3c.min.js',
};

/**
 * @returns {boolean} Whether Web SDK IDs are set (not placeholders).
 */
export function isMartechConfigured() {
  const { datastreamId, orgId } = WEB_SDK_CONFIG;
  if (!datastreamId || !orgId) return false;
  if (datastreamId.startsWith('REPLACE')) return false;
  if (orgId.startsWith('REPLACE')) return false;
  return true;
}

/**
 * @returns {string[]} Launch script URL for the current host (at most one).
 */
export function getLaunchUrls() {
  if (typeof window === 'undefined') return [];

  const { hostname } = window.location;
  const isLive = hostname.endsWith('.aem.live');
  const isLocal = hostname === 'localhost' || hostname === 'localhost.local';
  const isPreview = hostname.endsWith('.aem.page') || isLocal;

  let url = '';
  if (isLive) {
    url = MARTECH_CONFIG.productionLaunchUrl;
  } else if (isPreview) {
    url = MARTECH_CONFIG.stagingLaunchUrl;
  }

  if (!url || url.includes('REPLACE')) return [];
  return [url];
}
