/**
 * Asset impression and click tracking via ACDL for Analytics / Workspace reporting.
 * @see docs/ASSET-ANALYTICS-PLAN.md
 */

import { getMediaSourceType, extractAssetId } from './media.js';

const IMPRESSION_RATIO = 0.5;
const IMPRESSION_EVENT = 'assetImpression';
const CLICK_EVENT = 'assetClick';

/**
 * DAM / Media Bus images only — skip author avatars and broken placeholders.
 * @param {HTMLImageElement} img
 * @returns {boolean}
 */
function isTrackableImage(img) {
  if (!img || img.closest('.hero-byline-avatar')) return false;
  const src = img.currentSrc || img.src || '';
  if (!src || src.startsWith('about:') || src.startsWith('data:')) return false;
  return true;
}

/**
 * @param {HTMLImageElement} img
 * @returns {object} assetId, assetUrl, assetName, assetSource, block
 */
export function getAssetContext(img) {
  const src = img.currentSrc || img.src || '';
  const blockEl = img.closest('[class]');
  const blockClass = blockEl?.className?.split(/\s+/)
    .find((cls) => cls && !cls.includes('section') && !cls.includes('container')) || '';

  return {
    assetId: img.dataset.assetId || extractAssetId(src),
    assetUrl: src,
    assetName: img.alt || img.title || '',
    assetSource: img.dataset.assetSource || getMediaSourceType(src),
    block: blockClass,
  };
}

/**
 * @param {string} eventName
 * @param {HTMLImageElement} img
 */
export function pushAssetEvent(eventName, img) {
  if (typeof window === 'undefined' || !window.adobeDataLayer || !eventName || !img) return;
  if (!isTrackableImage(img)) return;

  const asset = getAssetContext(img);
  window.adobeDataLayer.push({
    event: eventName,
    asset,
    interaction: {
      label: asset.assetId || asset.assetName || 'asset',
      block: asset.block,
      detail: asset.assetUrl,
    },
  });
}

/**
 * Track visible asset impressions (50% in viewport) and image clicks.
 * @param {ParentNode} root
 */
export function initAssetAnalytics(root) {
  if (typeof window === 'undefined' || !root) return;
  if (root.dataset.assetAnalyticsInit === 'true') return;
  root.dataset.assetAnalyticsInit = 'true';

  const impressed = new WeakSet();

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting || entry.intersectionRatio < IMPRESSION_RATIO) return;
      const img = entry.target;
      if (!(img instanceof HTMLImageElement) || impressed.has(img)) return;
      impressed.add(img);
      pushAssetEvent(IMPRESSION_EVENT, img);
    });
  }, { threshold: IMPRESSION_RATIO });

  root.querySelectorAll('img[src]').forEach((img) => {
    if (!isTrackableImage(img)) return;
    observer.observe(img);
    img.addEventListener('click', () => {
      pushAssetEvent(CLICK_EVENT, img);
    });
  });
}
