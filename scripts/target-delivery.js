/**
 * Post-injection decoration for Adobe Target HTML offers on EDS pages.
 *
 * DA Send to Target exports undecorated markup (semantic block tables, not
 * `.block` / `data-block-status`). After Web SDK injects an offer, this module
 * runs the normal EDS block pipeline (decorateBlock → loadBlock) on that subtree.
 *
 * @see https://docs.da.live/administrators/guides/prepare-menu/send-to-adobe-target
 * @see https://www.aem.live/developer/target-integration
 * @see docs/TARGET-PERSONALIZATION-PLAN.md
 */

import {
  decorateBlock,
  decorateIcons,
  loadBlock,
  loadCSS,
} from './aem.js';

/** @returns {string} */
export function getTargetZoneSelector() {
  return '[data-targetlocation]';
}

const TARGET_METADATA_KEYS = ['target', 'adobetarget', 'adobe-target'];

/**
 * Whether page metadata opts in to Adobe Target delivery.
 * @returns {boolean}
 */
function isTargetPersonalizationEnabled() {
  if (typeof document === 'undefined') return false;
  return TARGET_METADATA_KEYS.some((key) => {
    const meta = document.querySelector(`meta[name="${key}"]`);
    const value = meta?.content?.trim().toLowerCase() || '';
    return value === 'on' || value === 'true' || value === 'yes';
  });
}

/**
 * @param {Element} section
 */
export function markTargetZone(section) {
  if (!section?.dataset?.targetlocation) return;
  section.classList.add('target');
  if (!isTargetPersonalizationEnabled()) {
    section.classList.add('target-ready');
  }
}

/**
 * Prefer outermost zone per location (section over nested wrapper).
 * @param {Element} main
 * @returns {Element[]}
 */
export function getTargetZones(main) {
  if (!main) return [];
  const zones = [...main.querySelectorAll(getTargetZoneSelector())];
  return zones.filter((zone) => !zone.parentElement?.closest('[data-targetlocation]'));
}

/**
 * Hoist nested data-targetlocation onto the parent .section (DA zone guidance).
 * @param {Element} main
 */
export function hoistTargetLocationToSection(main) {
  if (!main) return;
  main.querySelectorAll('.section [data-targetlocation]').forEach((inner) => {
    const section = inner.closest('.section');
    if (!section || inner === section) return;
    if (!section.dataset.targetlocation) {
      section.dataset.targetlocation = inner.dataset.targetlocation;
      markTargetZone(section);
    }
    inner.removeAttribute('data-targetlocation');
    inner.removeAttribute('data-targetzone');
  });
}

/**
 * @param {Element} block
 * @returns {string}
 */
function getBlockName(block) {
  return block.dataset.blockName || block.classList[0] || '';
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isLayoutClassName(name) {
  return !name
    || name === 'section'
    || name === 'block'
    || name === 'default-content-wrapper'
    || name === 'target'
    || name === 'section-metadata'
    || name.endsWith('-wrapper')
    || name.endsWith('-container')
    || name.endsWith('-track');
}

/**
 * @param {Element} el
 * @returns {boolean}
 */
function isBlockRootCandidate(el) {
  if (el.tagName !== 'DIV') return false;
  if (el.classList.contains('block')) return Boolean(getBlockName(el));

  const name = el.classList[0];
  if (!name || isLayoutClassName(name)) return false;
  return el.classList.contains(name)
    && [...el.children].length > 0
    && [...el.children].every((child) => child.tagName === 'DIV');
}

/**
 * @param {Element} block
 * @returns {boolean}
 */
function isPreDecoratedBlock(block) {
  if (block.dataset.blockStatus === 'loaded') return true;
  const name = getBlockName(block);
  if (!name) return false;
  if ([...block.classList].some((cls) => cls.startsWith(`${name}-`) && cls !== name)) {
    return true;
  }
  return Boolean(block.querySelector(`[class*="${name}-"]`));
}

/**
 * @param {Element} block
 */
function ensureBlockLayoutClasses(block) {
  const blockName = getBlockName(block);
  if (!blockName) return;
  block.classList.add('block');
  block.dataset.blockName = blockName;
  const wrapper = block.parentElement;
  if (wrapper && !wrapper.classList.contains(`${blockName}-wrapper`)) {
    wrapper.classList.add(`${blockName}-wrapper`);
  }
  const section = block.closest('.section');
  if (section) section.classList.add(`${blockName}-container`);
}

/**
 * @param {Element} zone
 * @returns {Element[]}
 */
function collectZoneBlocks(zone) {
  const candidates = [...zone.querySelectorAll('div[class]')].filter(isBlockRootCandidate);
  return candidates.filter(
    (el) => !candidates.some((other) => other !== el && other.contains(el)),
  );
}

/**
 * @param {Element} block
 * @returns {Promise<void>}
 */
async function loadInjectedBlock(block) {
  const blockName = getBlockName(block);
  if (!blockName) return;

  if (isPreDecoratedBlock(block)) {
    ensureBlockLayoutClasses(block);
    await loadCSS(`${window.hlx.codeBasePath}/blocks/${blockName}/${blockName}.css`);
    block.dataset.blockStatus = 'loaded';
    return;
  }

  delete block.dataset.blockStatus;
  decorateBlock(block);
  await loadBlock(block);
}

/**
 * @param {Element} zone
 * @returns {Promise<void>}
 */
async function decorateTargetZone(zone) {
  markTargetZone(zone);

  const blocks = collectZoneBlocks(zone);
  if (!blocks.length) return;

  await Promise.all(blocks.map((block) => loadInjectedBlock(block)));
  decorateIcons(zone);

  const blockName = getBlockName(blocks[0]);
  const section = zone.classList.contains('section') ? zone : zone.closest('.section');
  if (section && blockName) section.classList.add(`${blockName}-container`);

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

/**
 * @param {Element} main
 * @returns {Promise<void>}
 */
export async function refreshTargetZones(main) {
  if (!main) return;
  getTargetZones(main).forEach((zone) => zone.classList.remove('target-ready'));
  await decorateTargetInjections(main);
}

/** @type {MutationObserver|null} */
let targetObserver = null;

/** @type {number|null} */
let refreshFrame = null;

/** @type {boolean} */
let martechListenerBound = false;

/** Fail-open if proposition fetch or decoration stalls (martech default timeout is 1s). */
const TARGET_REVEAL_TIMEOUT_MS = 2500;

/**
 * @param {MutationRecord[]} mutations
 */
function invalidateZonesAfterInjection(mutations) {
  mutations.forEach((mutation) => {
    if (mutation.type !== 'childList') return;
    const { target } = mutation;
    if (!(target instanceof Element)) return;
    const zone = target.matches('[data-targetlocation]')
      ? target
      : target.closest('[data-targetlocation]');
    if (zone) zone.classList.remove('target-ready');
  });
}

/**
 * Reveal target sections when decoration cannot complete (pairs with styles.css visibility rule).
 * @param {Element} main
 */
function revealPendingTargetZones(main) {
  getTargetZones(main).forEach((zone) => {
    const section = zone.classList.contains('section') ? zone : zone.closest('.section');
    (section || zone).classList.add('target-ready');
  });
}

/**
 * @param {Element} main
 */
function scheduleTargetRefresh(main) {
  if (refreshFrame) cancelAnimationFrame(refreshFrame);
  refreshFrame = requestAnimationFrame(() => {
    refreshFrame = null;
    refreshTargetZones(main).catch(() => {});
  });
}

/**
 * @param {Element} main
 */
export function initTargetDelivery(main) {
  if (!main || targetObserver) return;

  if (!martechListenerBound) {
    document.addEventListener('martech:propositions-applied', () => {
      scheduleTargetRefresh(main);
    });
    martechListenerBound = true;
  }

  targetObserver = new MutationObserver((mutations) => {
    invalidateZonesAfterInjection(mutations);

    const relevant = mutations.some((mutation) => {
      const { target } = mutation;
      if (!(target instanceof Element)) return false;
      return target.dataset?.targetlocation
        || target.closest?.('[data-targetlocation]')
        || (mutation.type === 'childList' && target.closest('main'));
    });
    if (relevant) scheduleTargetRefresh(main);
  });

  targetObserver.observe(main, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-targetlocation', 'class'],
  });

  scheduleTargetRefresh(main);

  window.setTimeout(() => revealPendingTargetZones(main), TARGET_REVEAL_TIMEOUT_MS);
}
