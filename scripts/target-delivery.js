/**
 * Post-injection decoration for Adobe Target HTML offers on EDS pages.
 * Zones are marked with section metadata `targetlocation` → data-targetlocation.
 * @see docs/TARGET-PERSONALIZATION-PLAN.md
 */

import {
  decorateBlock,
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
 * Send to Target exports preview HTML with blocks already decorated by EDS.
 * @param {Element} block
 * @returns {boolean}
 */
function isPreDecoratedBlock(block) {
  if (block.dataset.blockStatus === 'loaded') return true;
  const name = getBlockName(block);
  if (!name) return false;
  const first = block.firstElementChild;
  return Boolean(first?.className?.includes(name));
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
 * @param {Element} block
 * @returns {Promise<void>}
 */
async function loadInjectedBlock(block) {
  const blockName = getBlockName(block);
  if (!blockName) return;

  ensureBlockLayoutClasses(block);

  if (isPreDecoratedBlock(block)) {
    await loadCSS(`${window.hlx.codeBasePath}/blocks/${blockName}/${blockName}.css`);
    block.dataset.blockStatus = 'loaded';
    return;
  }

  delete block.dataset.blockStatus;
  if (!block.classList.contains('block')) decorateBlock(block);
  await loadBlock(block);
}

/**
 * @param {Element} zone
 * @returns {Element[]}
 */
function collectZoneBlocks(zone) {
  const blocks = new Set([
    ...zone.querySelectorAll(':scope div.block'),
    ...zone.querySelectorAll(':scope > div[class]'),
  ]);

  blocks.forEach((block) => {
    if (!getBlockName(block)) blocks.delete(block);
  });

  if (!blocks.size) {
    zone.querySelectorAll(':scope > div').forEach((child) => {
      if (!child.classList.contains('block') && child.classList.length) {
        decorateBlock(child);
        blocks.add(child);
      }
    });
  }

  return [...blocks];
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
  await Promise.all(blocks.map((block) => loadInjectedBlock(block)));
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
    decorateTargetInjections(main).catch(() => {});
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
