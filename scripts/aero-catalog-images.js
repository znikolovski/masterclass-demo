/** Adventures site origin for catalog images (Media Bus paths from query-index). */
export const ADVENTURES_IMAGE_ORIGIN = 'https://main--masterclass-demo--znikolovski.aem.live';

/** Fallback LCP hero when authored or resolved image URL is missing or invalid. */
export const DEFAULT_AERO_HERO_IMAGE = 'https://content.da.live/znikolovski/masterclass-demo/.index/hero-mountain-83c7a2a5.jpeg';

/**
 * @param {string} [raw]
 * @returns {boolean}
 */
export function isValidImageSrc(raw) {
  if (!raw || typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return false;
  const lower = trimmed.toLowerCase();
  if (lower === 'about:error' || lower.startsWith('about:')) return false;
  try {
    const url = new URL(trimmed, typeof window !== 'undefined' ? window.location.href : 'https://example.com');
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * OG / page meta images that 404 or block LCP (AEM default placeholder, invalid URLs).
 * @param {string} [raw]
 * @returns {boolean}
 */
export function isUsableMetaImageUrl(raw) {
  if (!isValidImageSrc(raw)) return false;
  try {
    const url = new URL(raw.trim(), typeof window !== 'undefined' ? window.location.href : 'https://example.com');
    if (/\/default-meta-image\./i.test(url.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} hostname
 * @returns {boolean}
 */
export function isLocalDevHostname(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/**
 * AEM CLI may rewrite proxied asset URLs to https://localhost; dev server is HTTP-only.
 * @param {string} src
 * @param {string} [base]
 * @returns {string}
 */
export function normalizeLocalDevMediaUrl(src, base) {
  if (!src || typeof src !== 'string') return src;
  try {
    const baseHref = base || (typeof window !== 'undefined' ? window.location.href : 'http://localhost/');
    const baseUrl = new URL(baseHref);
    if (isLocalDevHostname(baseUrl.hostname)) baseUrl.protocol = 'http:';
    const url = new URL(src, baseUrl.href);
    if (isLocalDevHostname(url.hostname)) url.protocol = 'http:';
    return url.toString();
  } catch {
    return src;
  }
}

/**
 * Query-index "image" is often concatenated picture srcs (./media_a.jpg?.... ./media_b.jpg?...).
 * Extract the first media path and return an absolute Adventures URL.
 * @param {string} [raw]
 * @returns {string}
 */
export function resolveCatalogImageUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return '';

  if (/^https?:\/\//i.test(trimmed)) {
    const first = trimmed.match(/^https?:\/\/[^\s"'<>]+/i);
    return first ? first[0] : '';
  }

  const mediaMatch = trimmed.match(
    /\.\/?media_[a-f0-9]+\.(?:jpe?g|png|webp|avif)(?:\?[^./\s"'<>]*)?/i,
  );
  if (!mediaMatch) return '';

  let path = mediaMatch[0].replace(/^\.\//, '');
  if (!path.startsWith('/')) path = `/${path}`;
  // Trim anything after a second ./media_ glued into the query string
  path = path.replace(/(\.(?:jpe?g|png|webp|avif)\?[^/]*?)\.\/media_.*$/, '$1');

  return `${ADVENTURES_IMAGE_ORIGIN}${path}`;
}

/**
 * @param {{ images?: { url?: string }[], image?: string }} item
 * @returns {string}
 */
export function getCatalogItemImage(item) {
  const fromImages = item?.images?.[0]?.url;
  return resolveCatalogImageUrl(fromImages || item?.image || '');
}

/**
 * Normalize hero background URLs (absolute, Media Bus, or catalog paths).
 * @param {string} [raw]
 * @returns {string}
 */
export function resolveHeroImageUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || !isValidImageSrc(trimmed)) return '';

  if (/^https?:\/\//i.test(trimmed)) {
    const match = trimmed.match(/^https?:\/\/[^\s"'<>]+/i);
    return match && isValidImageSrc(match[0]) ? match[0] : '';
  }

  const fromCatalog = resolveCatalogImageUrl(trimmed);
  if (fromCatalog && isValidImageSrc(fromCatalog)) return fromCatalog;

  try {
    const resolved = new URL(trimmed, window.location.href).href;
    return isValidImageSrc(resolved) ? resolved : '';
  } catch {
    return '';
  }
}

/**
 * Resolve hero background URL with catalog / Media Bus normalization and fallback.
 * @param {string} [raw]
 * @returns {string}
 */
export function resolveHeroImageUrlWithFallback(raw) {
  const resolved = resolveHeroImageUrl(raw);
  return resolved || DEFAULT_AERO_HERO_IMAGE;
}
