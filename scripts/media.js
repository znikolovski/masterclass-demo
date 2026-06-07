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

const DEFAULT_BREAKPOINTS = [
  { media: '(min-width: 900px)', width: 2000 },
  { width: 750 },
];

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
 * @param {string} src
 * @param {string} [alt]
 * @param {boolean} [eager]
 * @param {{ media?: string, width: number|string }[]} [breakpoints]
 * @returns {HTMLPictureElement|HTMLImageElement}
 */
export function createResponsivePicture(
  src,
  alt = '',
  eager = false,
  breakpoints = DEFAULT_BREAKPOINTS,
) {
  const sourceType = getMediaSourceType(src);

  if (sourceType === 'external') {
    const img = document.createElement('img');
    img.src = src;
    img.alt = alt;
    img.loading = eager ? 'eager' : 'lazy';
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
  return picture;
}

/**
 * Upgrade authored pictures after block decoration (Media Bus + DM + external).
 * @param {ParentNode} root
 * @param {{ eagerSelector?: string }} [options]
 */
export function optimizePictures(root, options = {}) {
  const { eagerSelector } = options;
  root.querySelectorAll('picture > img[src]').forEach((img) => {
    if (img.dataset.mediaOptimized === 'true') return;

    const picture = img.closest('picture');
    if (!picture) return;

    const eager = Boolean(eagerSelector && img.closest(eagerSelector));
    picture.replaceWith(createResponsivePicture(img.src, img.alt || '', eager));
  });
}
