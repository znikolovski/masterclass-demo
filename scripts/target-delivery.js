/**
 * Post-injection decoration for Adobe Target HTML offers on EDS pages.
 * Target replaces zone markup before blocks are decorated; this reloads those sections.
 * @see docs/TARGET-PERSONALIZATION-PLAN.md
 */

import { loadSection } from './aem.js';

const TARGET_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;

/**
 * @param {string} id
 * @returns {boolean}
 */
function isSafeTargetId(id) {
  return typeof id === 'string' && TARGET_ID_PATTERN.test(id);
}

/**
 * @param {Element} main
 * @returns {Promise<void>}
 */
export async function decorateTargetInjections(main) {
  if (!main) return;

  const pending = [
    ...main.querySelectorAll('.section.target:not([data-section-status="loaded"])'),
    ...main.querySelectorAll('.target .section:not([data-section-status="loaded"])'),
  ];

  const unique = [...new Set(pending)];
  if (!unique.length) return;

  await Promise.all(unique.map((section) => loadSection(section)));
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
      return target.classList?.contains('target')
        || target.closest?.('.target')
        || (mutation.type === 'childList' && target.closest('main'));
    });
    if (relevant) refresh();
  });

  targetObserver.observe(main, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['id', 'class'],
  });

  refresh();
}

/**
 * Applies Target zone markers from section-metadata rows.
 * @param {Element} section
 * @param {string} key
 * @param {string} value
 */
export function applyTargetZoneMetadata(section, key, value) {
  if (!section || !value) return;

  if (key === 'target-zone' && (value === 'on' || value === 'true' || value === 'yes')) {
    section.classList.add('target');
    section.dataset.targetZone = 'true';
    return;
  }

  if (key === 'target-id' && isSafeTargetId(value)) {
    section.id = value;
    section.dataset.targetId = value;
  }
}
