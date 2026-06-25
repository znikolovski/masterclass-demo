/**
 * Google Maps JavaScript API configuration for the adventure-map block.
 *
 * Set GOOGLE_MAPS_API_KEY to a referrer-restricted key before enabling the map in
 * preview or production. Restrict to *.aem.page, *.aem.live, *.aem.network, localhost:3000.
 * Enable Maps JavaScript API only — do not commit unrestricted keys.
 *
 * Resolution order: page meta `google-maps-api-key`, then `window.hlx.mapsApiKey`,
 * then GOOGLE_MAPS_API_KEY below.
 */
export const GOOGLE_MAPS_API_KEY = '';

/**
 * @returns {string}
 */
export function getGoogleMapsApiKey() {
  if (typeof document !== 'undefined') {
    const meta = document.querySelector('meta[name="google-maps-api-key"]');
    const fromMeta = meta?.getAttribute('content')?.trim();
    if (fromMeta) return fromMeta;
  }
  if (typeof window !== 'undefined' && window.hlx?.mapsApiKey) {
    return String(window.hlx.mapsApiKey).trim();
  }
  return GOOGLE_MAPS_API_KEY.trim();
}

/** Default analytics cid appended to adventure links from map popups. */
export const DEFAULT_MAP_ANALYTICS_CID = 'adventure-map';

/** Default world zoom when fewer than two pins are available. */
export const DEFAULT_MAP_ZOOM = 2;
