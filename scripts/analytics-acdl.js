/**
 * Push interaction events to the Adobe Client Data Layer for Launch ACDL rules.
 * @see docs/ANALYTICS-LAUNCH-PLAN.md §4d
 */

/**
 * @param {string} eventName ACDL event name (e.g. carouselChange, faqExpand)
 * @param {{ label?: string, block?: string, detail?: string }} interaction
 */
export function pushInteractionEvent(eventName, { label = '', block = '', detail = '' } = {}) {
  if (typeof window === 'undefined' || !window.adobeDataLayer || !eventName) return;
  window.adobeDataLayer.push({
    event: eventName,
    interaction: {
      label,
      block,
      detail,
    },
  });
}

/**
 * Push carouselChange only when the active slide index changes.
 * @param {Element} block
 * @param {number} slideIndex
 * @param {string} blockName
 */
export function pushCarouselChange(block, slideIndex, blockName) {
  const prev = block.dataset.analyticsSlide;
  const next = String(slideIndex);
  if (prev === next) return;
  block.dataset.analyticsSlide = next;
  pushInteractionEvent('carouselChange', {
    block: blockName,
    label: 'carousel-change',
    detail: `slide-${slideIndex + 1}`,
  });
}
