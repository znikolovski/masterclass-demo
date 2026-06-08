/**
 * Post-injection decoration for Adobe Target HTML offers on EDS pages.
 * Zones are marked with section metadata `targetlocation` → data-targetlocation.
 * @see docs/TARGET-PERSONALIZATION-PLAN.md
 */

import { decorateBlock, loadBlock, loadSection } from './aem.js';

/** @returns {string} */
export function getTargetZoneSelector() {
  return '[data-targetlocation]';
}

/**
 * @param {Element} section
 */
export function markTargetZone(section) {
  if (!section?.dataset?.targetlocation) return;
  section.classList.add('target');
}

/**
 * @param {Element} main
 * @returns {Element[]}
 */
export function getTargetZones(main) {
  if (!main) return [];
  return [...main.querySelectorAll(getTargetZoneSelector())];
}

/**
 * @param {Element} zone
 * @returns {Promise<void>}
 */
async function decorateTargetZone(zone) {
  markTargetZone(zone);

  zone.querySelectorAll(':scope > div').forEach((child) => {
    if (!child.classList.contains('block') && child.classList.length) {
      decorateBlock(child);
    }
  });

  if (zone.classList.contains('section')) {
    await loadSection(zone);
    zone.classList.add('target-ready');
    return;
  }

  const blocks = [...zone.querySelectorAll(':scope div.block')];
  await Promise.all(blocks.map((block) => loadBlock(block)));
  zone.closest('.section')?.classList.add('target-ready');
  zone.classList.add('target-ready');
}

/**
 * @param {Element} main
 * @returns {Promise<void>}
 */
export async function decorateTargetInjections(main) {
  if (!main) return;

  const pending = getTargetZones(main).filter(
    (zone) => !zone.classList.contains('target-ready'),
  );

  if (!pending.length) return;
  await Promise.all(pending.map((zone) => decorateTargetZone(zone)));
}

/** @type {MutationObserver|null} */
let targetObserver = null;

/**
 * @param {Element} main
 */
export function initTargetDelivery(main) {
  if (!main || targetObserver) return;

  const refresh = () => {
    decorateTargetInjections(main).catch(() => {});
  };

  targetObserver = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => {
      const { target } = mutation;
      if (!(target instanceof Element)) return false;
      return target.dataset?.targetlocation
        || target.closest?.('[data-targetlocation]')
        || (mutation.type === 'childList' && target.closest('main'));
    });
    if (relevant) refresh();
  });

  targetObserver.observe(main, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-targetlocation', 'class'],
  });

  refresh();
}
