/**
 * Adobe Experience Platform Web SDK + Launch configuration.
 * Replace placeholders after creating a datastream and Launch property.
 * @see https://www.aem.live/developer/martech-integration
 * @see docs/MARTECH.md
 */

export const WEB_SDK_CONFIG = {
  datastreamId: '56dee4fc-21a9-4e37-83ab-bdd874957aba',
  orgId: '28260E2056581D3B7F000101@AdobeOrg',
};

/** Launch embed URLs (staging for .aem.page, production for .aem.live if different). */
export const MARTECH_CONFIG = {
  launchUrls: [
    'REPLACE_WITH_LAUNCH_EMBED_URL',
  ],
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
 * @returns {string[]} Launch script URLs with placeholders removed.
 */
export function getLaunchUrls() {
  return MARTECH_CONFIG.launchUrls.filter(
    (url) => url && !url.includes('REPLACE'),
  );
}
