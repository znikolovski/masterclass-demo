/**
 * Post-injection decoration for Adobe Target HTML offers on EDS pages.
 *
 * DA Send to Target exports undecorated markup (semantic block tables, not
 * `.block` / `data-block-status`). After Web SDK injects an offer, this module
 * runs the normal EDS block pipeline (decorateBlock → loadBlock) on that subtree.
 *
 * Martech applies propositions after initial section decoration (aem.live pattern);
 * this re-decoration step satisfies DA delivery guidance to "decorate as usual"
 * once offer HTML is in the DOM. Use a MutationObserver to catch async injections.
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
  loadSection,
} from './aem.js';

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
    || name.endsWith('-wrapper')
    || name.endsWith('-container')
    || name.endsWith('-track');
}

/**
 * EDS block roots are divs whose first class is the block name (often nested in bare wrappers).
 * @param {Element} el
 * @returns {boolean}
 */
function isBlockRootCandidate(el) {
  if (el.tagName !== 'DIV') return false;
  if (el.classList.contains('block')) return Boolean(getBlockName(el));

  const name = el.classList[0];
  if (!name || isLayoutClassName(name)) return false;
  if (el.classList.contains(name) && [...el.children].every((child) => child.tagName === 'DIV')) {
    return true;
  }
  return false;
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
 * Target often injects raw EDS markup inside an extra unclassed wrapper div.
 * @param {Element} zone
 * @returns {Element[]}
 */
function collectZoneBlocks(zone) {
  const candidates = [...zone.querySelectorAll(':scope div[class]')].filter(isBlockRootCandidate);
  const roots = candidates.filter(
    (el) => !candidates.some((other) => other !== el && other.contains(el)),
  );
  if (roots.length) return roots;
  return [...zone.querySelectorAll(':scope div.block')];
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

  if (zone.classList.contains('section')) {
    await loadSection(zone);
    zone.classList.add('target-ready');
    return;
  }

  const blocks = collectZoneBlocks(zone);
  if (!blocks.length) return;

  await Promise.all(blocks.map((block) => loadInjectedBlock(block)));
  decorateIcons(zone);
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

/**
 * Re-run decoration on all Target zones (e.g. after lazy-phase section load).
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
 * @param {Element} main
 */
export function initTargetDelivery(main) {
  if (!main || targetObserver) return;

  const refresh = () => {
    if (refreshFrame) cancelAnimationFrame(refreshFrame);
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = null;
      decorateTargetInjections(main).catch(() => {});
    });
  };

  targetObserver = new MutationObserver((mutations) => {
    invalidateZonesAfterInjection(mutations);

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
