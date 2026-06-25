/**
 * Aero homepage hero with embedded flight search.
 */
import { loadSiteBlock } from '../../../scripts/aero-blocks.js';
import { buildBlock } from '../../../scripts/aem.js';
import { resolveHeroImageUrlWithFallback } from '../../../scripts/aero-catalog-images.js';
import { createHeroAdventurePicture, resolvePictureSrc } from '../../../scripts/media.js';

/**
 * @param {string} text
 * @returns {string}
 */
function accentHeadline(text) {
  return text.replace(/\*\*(.+?)\*\*/g, '<span class="aero-hero-accent">$1</span>');
}

/**
 * Initialize a nested block inside another block (skip section wrapper decoration).
 * @param {Element} el
 * @param {string} blockName
 */
function initNestedBlock(el, blockName) {
  el.classList.add('block');
  el.dataset.blockName = blockName;
  el.dataset.blockStatus = 'initialized';
}

/**
 * Extract hero background URL from authored markup (supports srcset-only pictures).
 * @param {Element} block
 * @returns {string}
 */
function extractBackgroundUrl(block) {
  const img = block.querySelector('picture img, img');
  if (!img || img.closest('.flight-search')) return '';
  return resolveHeroImageUrlWithFallback(resolvePictureSrc(img));
}

/**
 * @param {string} src
 * @param {string} alt
 * @returns {HTMLPictureElement|null}
 */
function buildHeroPicture(src, alt) {
  const node = createHeroAdventurePicture(src, alt);
  if (!node) return null;
  if (node.tagName === 'PICTURE') return node;
  const picture = document.createElement('picture');
  picture.append(node);
  return picture;
}

/**
 * @param {Element} block
 */
export default async function decorate(block) {
  const rows = [...block.children];
  const isCompact = block.classList.contains('compact');
  const noSearch = block.classList.contains('no-search');

  const bgUrl = extractBackgroundUrl(block) || resolveHeroImageUrlWithFallback('');
  let headline = '';
  let subcopy = '';

  rows.forEach((row) => {
    const cells = row.querySelectorAll(':scope > div');
    if (cells[0]?.querySelector('picture, img')) return;
    if (cells[0]?.textContent.includes('**') || cells.length === 1) {
      if (!headline) headline = cells[0].textContent.trim();
      else if (!subcopy) subcopy = cells[0].textContent.trim();
    } else if (cells.length >= 2 && !headline) {
      headline = cells[0].textContent.trim();
      subcopy = cells[1]?.textContent.trim() || '';
    }
  });

  block.textContent = '';
  block.classList.add('block');
  if (isCompact) {
    block.classList.add('compact', 'no-search');
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'aero-hero-wrapper';

  const heroPicture = buildHeroPicture(bgUrl, headline || 'WKND Aero');
  if (heroPicture) wrapper.append(heroPicture);

  const overlay = document.createElement('div');
  overlay.className = 'aero-hero-content';

  const h1 = document.createElement('h1');
  h1.innerHTML = accentHeadline(headline || 'ADVENTURE IS THE **ONLY** DESTINATION.');
  overlay.append(h1);

  if (subcopy) {
    const p = document.createElement('p');
    p.className = 'aero-hero-subcopy';
    p.textContent = subcopy;
    overlay.append(p);
  }

  if (!noSearch && !isCompact) {
    const searchSlot = buildBlock('flight-search', '');
    initNestedBlock(searchSlot, 'flight-search');
    overlay.append(searchSlot);
    if (searchSlot.dataset.blockStatus !== 'loaded') {
      await loadSiteBlock(searchSlot);
    }
  }

  wrapper.append(overlay);
  block.append(wrapper);
}
