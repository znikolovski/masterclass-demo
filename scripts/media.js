/**
 * Responsive images for Edge Delivery Media Bus and Dynamic Media (AEM Assets).
 * Media Bus uses ?width=&format=webply; DM Open API uses wid/qlt/fmt params.
 * @see https://www.aem.live/docs/media
 */

import { createOptimizedPicture } from './aem.js';

const DM_HOST_PATTERNS = [
  /scene7\.com$/i,
  /\.adobeaemcloud\.com$/i,
  /adobedc\.net$/i,
];

const DM_PATH_PATTERNS = [
  /\/adobe\/assets\/urn:aaid:aem:/i,
  /\/is\/image\//i,
  /\/is\/content\//i,
];

const HERO_BREAKPOINTS = [
  { media: '(min-width: 900px)', width: 1200 },
  { width: 750 },
];

const CARD_BREAKPOINTS = [
  { media: '(min-width: 900px)', width: 900 },
  { width: 600 },
];

const DEFAULT_BREAKPOINTS = [
  { media: '(min-width: 900px)', width: 900 },
  { width: 600 },
];

const HERO_SELECTOR = '.hero-adventure, .carousel-hero, .hero';
const CARD_SELECTOR = '.activity-card-image, .cards, .columns-featured, .columns-gallery';

/**
 * @param {URL} url
 * @returns {boolean}
 */
export function isDynamicMediaUrl(url) {
  if (DM_PATH_PATTERNS.some((re) => re.test(url.pathname))) return true;
  return DM_HOST_PATTERNS.some((re) => re.test(url.hostname));
}

/**
 * @param {string} src
 * @returns {'dynamic-media'|'media-bus'|'aem-assets'|'external'}
 */
export function getMediaSourceType(src) {
  if (!src) return 'external';
  try {
    const url = new URL(src, window.location.href);
    if (isDynamicMediaUrl(url)) return 'dynamic-media';
    if (url.hostname === window.location.hostname) {
      if (url.pathname.includes('/media_')) return 'media-bus';
      if (url.pathname.startsWith('/assets/')) return 'aem-assets';
      return 'media-bus';
    }
    return 'external';
  } catch {
    return 'external';
  }
}

/**
 * @param {string} src
 * @returns {string}
 */
export function extractAssetId(src) {
  if (!src) return '';
  try {
    const url = new URL(src, window.location.href);
    const mediaMatch = url.pathname.match(/\/media_([a-f0-9]+)/i);
    if (mediaMatch) return mediaMatch[1];

    const dmMatch = url.pathname.match(/\/is\/(?:image|content)\/[^/]+\/([^/?]+)/i);
    if (dmMatch) return dmMatch[1];

    const assetsMatch = url.pathname.match(/\/assets\/(.+)/i);
    if (assetsMatch) return assetsMatch[1].replace(/\.[^.]+$/, '');

    const file = url.pathname.split('/').pop() || '';
    return file.replace(/\.[^.]+$/, '') || url.hostname;
  } catch {
    return '';
  }
}

/**
 * @param {string} baseSrc
 * @param {number} width
 * @param {string} [format]
 * @returns {string}
 */
function buildDynamicMediaUrl(baseSrc, width, format = 'webp') {
  const url = new URL(baseSrc, window.location.href);
  if (url.pathname.includes('/adobe/assets/')) {
    url.searchParams.set('width', String(width));
    if (format === 'webp') url.searchParams.set('format', 'webp');
    else url.searchParams.delete('format');
  } else {
    url.searchParams.set('wid', String(width));
    url.searchParams.set('qlt', '85');
    url.searchParams.set('fmt', format);
  }
  return url.toString();
}

/**
 * @param {string} src
 * @param {string} alt
 * @param {boolean} eager
 * @param {{ media?: string, width: number|string }[]} breakpoints
 * @returns {HTMLPictureElement}
 */
function createDynamicMediaPicture(src, alt, eager, breakpoints) {
  const picture = document.createElement('picture');

  breakpoints.forEach((br, index) => {
    const width = parseInt(String(br.width), 10);
    if (!width) return;

    const webpSource = document.createElement('source');
    if (br.media) webpSource.setAttribute('media', br.media);
    webpSource.setAttribute('type', 'image/webp');
    webpSource.setAttribute('srcset', buildDynamicMediaUrl(src, width, 'webp'));
    picture.appendChild(webpSource);

    if (index < breakpoints.length - 1) {
      const fallbackSource = document.createElement('source');
      if (br.media) fallbackSource.setAttribute('media', br.media);
      fallbackSource.setAttribute('srcset', buildDynamicMediaUrl(src, width, 'jpg'));
      picture.appendChild(fallbackSource);
    } else {
      const img = document.createElement('img');
      img.setAttribute('loading', eager ? 'eager' : 'lazy');
      img.setAttribute('alt', alt);
      img.src = buildDynamicMediaUrl(src, width, 'jpg');
      picture.appendChild(img);
    }
  });

  return picture;
}

/**
 * @param {HTMLImageElement} img
 * @param {string} src
 */
export function annotateAssetMetadata(img, src) {
  const source = getMediaSourceType(src);
  const assetId = extractAssetId(src);
  img.dataset.assetSource = source;
  if (assetId) img.dataset.assetId = assetId;
  img.dataset.mediaOptimized = 'true';
}

/**
 * @param {HTMLPictureElement} picture
 * @param {string} src
 */
function annotatePicture(picture, src) {
  const img = picture.querySelector('img');
  if (img) annotateAssetMetadata(img, src);
}

/**
 * @param {HTMLImageElement|HTMLPictureElement} node
 * @param {{ width?: string, height?: string, loading?: string, sizes?: string }} attrs
 */
function applyImageAttributes(node, attrs = {}) {
  const img = node.tagName === 'IMG' ? node : node.querySelector('img');
  if (!img) return;
  if (attrs.width) img.setAttribute('width', attrs.width);
  if (attrs.height) img.setAttribute('height', attrs.height);
  if (attrs.loading) img.setAttribute('loading', attrs.loading);
  if (attrs.sizes) img.setAttribute('sizes', attrs.sizes);
}

/**
 * @param {HTMLImageElement} img
 * @param {string} [eagerSelector]
 * @returns {{ breakpoints: { media?: string, width: number }[], sizes: string, eager: boolean }}
 */
function getPictureConfig(img, eagerSelector) {
  const inHero = img.closest(HERO_SELECTOR);
  const eager = Boolean(inHero) || Boolean(eagerSelector && img.closest(eagerSelector));
  if (inHero) {
    return { breakpoints: HERO_BREAKPOINTS, sizes: '100vw', eager: true };
  }
  if (img.closest(CARD_SELECTOR)) {
    return {
      breakpoints: CARD_BREAKPOINTS,
      sizes: '(min-width: 900px) 33vw, 100vw',
      eager,
    };
  }
  return {
    breakpoints: DEFAULT_BREAKPOINTS,
    sizes: '(min-width: 900px) 50vw, 100vw',
    eager,
  };
}

/**
 * @param {string} src
 * @param {string} [alt]
 * @param {boolean} [eager]
 * @param {{ media?: string, width: number|string }[]} [breakpoints]
 * @param {{ width?: string, height?: string, loading?: string, sizes?: string }} [attrs]
 * @returns {HTMLPictureElement|HTMLImageElement}
 */
export function createResponsivePicture(
  src,
  alt = '',
  eager = false,
  breakpoints = DEFAULT_BREAKPOINTS,
  attrs = {},
) {
  const sourceType = getMediaSourceType(src);
  const loading = attrs.loading || (eager ? 'eager' : 'lazy');

  if (sourceType === 'external') {
    const img = document.createElement('img');
    img.src = src;
    img.alt = alt;
    img.loading = loading;
    applyImageAttributes(img, attrs);
    annotateAssetMetadata(img, src);
    return img;
  }

  let picture;
  if (sourceType === 'dynamic-media') {
    picture = createDynamicMediaPicture(src, alt, eager, breakpoints);
  } else {
    picture = createOptimizedPicture(
      src,
      alt,
      eager,
      breakpoints.map((br) => ({
        media: br.media,
        width: String(br.width),
      })),
    );
  }

  annotatePicture(picture, src);
  applyImageAttributes(picture, { ...attrs, loading });
  return picture;
}

/**
 * Upgrade authored pictures after block decoration (Media Bus + DM + external).
 * @param {ParentNode} root
 * @param {{ eagerSelector?: string, eagerAll?: boolean }} [options]
 */
export function optimizePictures(root, options = {}) {
  const { eagerSelector = HERO_SELECTOR, eagerAll = false } = options;
  root.querySelectorAll('picture > img[src]').forEach((img) => {
    if (img.dataset.mediaOptimized === 'true') return;

    const picture = img.closest('picture');
    if (!picture) return;

    const config = getPictureConfig(img, eagerSelector);
    const { breakpoints, sizes } = config;
    const eager = eagerAll || config.eager;
    const attrs = {
      width: img.getAttribute('width') || undefined,
      height: img.getAttribute('height') || undefined,
      loading: eager ? 'eager' : (img.getAttribute('loading') || undefined),
      sizes,
    };
    picture.replaceWith(createResponsivePicture(
      img.src,
      img.alt || '',
      eager,
      breakpoints,
      attrs,
    ));
  });
}
