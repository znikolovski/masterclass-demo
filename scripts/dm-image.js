/**
 * Dynamic Media with OpenAPI image helpers for WKND shop surfaces that don't use the
 * drop-ins' own AEM Assets rendering (search hits, OF1 recommendations, etc.).
 * Mirrors @dropins/tools/lib/aem/assets.js URL rules:
 *   {assetBase}/as/{alias}.{format}?width&quality
 * Product images are only ever served from DM OpenAPI (never AEM publish / the EDS media bus).
 */
const DM_PATH = /\/adobe\/assets\/urn:aaid:aem:[0-9a-f-]+/i;
const DEFAULT_WIDTHS = [240, 360, 480, 720, 960];

export function isDmUrl(url) {
  return typeof url === 'string' && DM_PATH.test(url);
}

function assetBase(url) {
  const u = new URL(url, window.location.href);
  const [path] = u.pathname.match(DM_PATH);
  return `${u.origin}${path}`;
}

function cleanAlias(alias) {
  const slug = String(alias || 'product').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'product';
}

/**
 * @param {string} url DM asset base or rendition URL (non-DM URLs are returned unchanged)
 * @param {{ width?: number, format?: 'webp'|'jpg'|'png', quality?: number, alias?: string }} opts
 */
export function dmRendition(url, {
  width = 960, format = 'webp', quality = 80, alias,
} = {}) {
  if (!isDmUrl(url)) return url;
  const params = new URLSearchParams({
    width: String(Math.round(width)),
    quality: String(quality),
  });
  return `${assetBase(url)}/as/${cleanAlias(alias)}.${format}?${params}`;
}

/**
 * Responsive <picture> for a product image (webp sources, jpg fallback).
 * @param {string} url
 * @param {string} alt
 * @param {{ widths?: number[], sizes?: string, eager?: boolean, alias?: string,
 *   width?: number, height?: number }} opts
 */
export function createDmPicture(url, alt = '', {
  widths = DEFAULT_WIDTHS, sizes = '(min-width: 900px) 25vw, 50vw', eager = false, alias,
  width = 800, height = 1000,
} = {}) {
  const picture = document.createElement('picture');
  const img = document.createElement('img');
  img.alt = alt;
  img.width = width;
  img.height = height;
  img.loading = eager ? 'eager' : 'lazy';
  img.decoding = 'async';
  if (eager) img.fetchPriority = 'high';
  if (isDmUrl(url)) {
    const source = document.createElement('source');
    source.type = 'image/webp';
    source.srcset = widths.map((w) => `${dmRendition(url, { width: w, alias })} ${w}w`).join(', ');
    source.sizes = sizes;
    picture.append(source);
    img.srcset = widths.map((w) => `${dmRendition(url, { width: w, format: 'jpg', alias })} ${w}w`).join(', ');
    img.sizes = sizes;
    img.src = dmRendition(url, { width: widths[Math.floor(widths.length / 2)], format: 'jpg', alias });
  } else {
    img.src = url;
  }
  picture.append(img);
  return picture;
}

/** Warm the DM delivery connection on shop pages. */
export function preconnectDm(origin) {
  if (!origin || document.head.querySelector(`link[rel="preconnect"][href="${origin}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = origin;
  link.crossOrigin = 'anonymous';
  document.head.append(link);
}
