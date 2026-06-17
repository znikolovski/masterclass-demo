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

/** @type {'setHtml'} */
export const TARGET_APPLY_ACTION = 'setHtml';

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
 * Named Target mbox scopes from outermost page zones (after section hoisting).
 * @param {Element} [main]
 * @returns {string[]}
 */
export function getTargetDecisionScopes(main = document.querySelector('main')) {
  if (!main) return [];
  return getTargetZones(main)
    .map((zone) => zone.dataset.targetlocation?.trim())
    .filter(Boolean);
}

/**
 * applyPropositions metadata for form-based Target activities — maps each mbox scope
 * to the EDS zone selector authored via data-targetlocation / section metadata.
 * @see https://experienceleague.adobe.com/en/docs/platform-learn/migrate-target-to-websdk/render-form-based-activities
 * @param {Element} [main]
 * @returns {Record<string, {selector: string, actionType: string}>}
 */
export function buildTargetApplyMetadata(main = document.querySelector('main')) {
  if (!main) return {};
  const metadata = {};
  getTargetZones(main).forEach((zone) => {
    const scope = zone.dataset.targetlocation?.trim();
    if (!scope || metadata[scope]) return;
    metadata[scope] = {
      selector: `[data-targetlocation="${scope.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`,
      actionType: TARGET_APPLY_ACTION,
    };
  });
  return metadata;
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
/** Block names that may appear in DA/Target exports with non-table row markup. */
const KNOWN_BLOCK_ROOTS = new Set([
  'columns-featured',
  'fragment',
  'form',
  'hero-adventure',
  'columns',
  'cards',
]);

function isLayoutClassName(name) {
  return !name
    || name === 'section'
    || name === 'narrow'
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
  if (KNOWN_BLOCK_ROOTS.has(name) && el.classList.contains(name)) return true;
  return el.classList.contains(name)
    && [...el.children].length > 0
    && [...el.children].every((child) => child.tagName === 'DIV');
}

/**
 * @param {Element} block
 * @returns {boolean}
 */
function isUnresolvedFragmentPlaceholder(block) {
  const name = getBlockName(block);
  if (name !== 'fragment') return false;
  return Boolean(block.querySelector('a[href*="/fragments/"]'));
}

function isPreDecoratedBlock(block) {
  if (isUnresolvedFragmentPlaceholder(block)) return false;
  if (block.dataset.blockStatus === 'loaded') return true;
  const name = getBlockName(block);
  if (!name) return false;
  if ([...block.classList].some((cls) => cls.startsWith(`${name}-`) && cls !== name)) {
    return true;
  }
  return Boolean(block.querySelector(`[class*="${name}-"]`));
}

/**
 * @param {Element} parent
 * @param {string} wrapperClass
 * @param {Element} block
 * @returns {boolean}
 */
function parentIsExclusiveBlockWrapper(parent, wrapperClass, block) {
  return parent.classList.contains(wrapperClass)
    && parent.childElementCount === 1
    && parent.firstElementChild === block;
}

/**
 * Ensure each injected block gets its own wrapper element. Target offers often
 * place sibling blocks under one layout shell; decorateBlock() would otherwise
 * stack *-wrapper classes on that shared parent and break max-width.
 * @param {Element} block
 */
function ensureBlockLayoutClasses(block) {
  const blockName = getBlockName(block);
  if (!blockName) return;
  block.classList.add('block');
  block.dataset.blockName = blockName;

  const wrapperClass = `${blockName}-wrapper`;
  const parent = block.parentElement;
  if (!parent) return;

  if (!parentIsExclusiveBlockWrapper(parent, wrapperClass, block)) {
    const dedicatedWrapper = document.createElement('div');
    dedicatedWrapper.classList.add(wrapperClass);
    parent.insertBefore(dedicatedWrapper, block);
    dedicatedWrapper.append(block);
  }

  const section = block.closest('.section');
  if (section) section.classList.add(`${blockName}-container`);
}

/**
 * Hoist block content out of section style shells (e.g. narrow) so featured bands
 * can use full-bleed wrappers and fragment intro copy is not capped with the form.
 * @param {Element} zone
 */
function unwrapTargetLayoutShells(zone) {
  const section = zone.classList.contains('section') ? zone : zone.closest('.section');
  if (!section) return;

  section.querySelectorAll(':scope > .narrow').forEach((shell) => {
    while (shell.firstElementChild) {
      section.insertBefore(shell.firstElementChild, shell);
    }
    shell.remove();
  });
}

/**
 * @param {Element} zone
 * @returns {Element[]}
 */
function collectZoneBlocks(zone) {
  const candidates = [...zone.querySelectorAll('div[class]')].filter(isBlockRootCandidate);
  // Prefer innermost blocks so layout shells (e.g. section style "narrow") are not
  // treated as the only block when real blocks are nested inside.
  return candidates.filter(
    (el) => !candidates.some((other) => other !== el && el.contains(other)),
  );
}

/**
 * Clears EDS decoration state so Target can re-apply offers on an existing block node.
 * @param {Element} block
 */
function resetBlockDecorationState(block) {
  delete block.dataset.blockStatus;
  block.classList.remove('block');
  delete block.dataset.blockName;
}

/**
 * @param {Element} block
 * @param {{ force?: boolean }} [options]
 * @returns {Promise<void>}
 */
async function loadInjectedBlock(block, options = {}) {
  const { force = false } = options;
  const blockName = getBlockName(block);
  if (!blockName) return;

  if (force) {
    resetBlockDecorationState(block);
  }

  ensureBlockLayoutClasses(block);

  if (!force && isPreDecoratedBlock(block)) {
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
  unwrapTargetLayoutShells(zone);

  const blocks = collectZoneBlocks(zone);
  if (!blocks.length) return;

  zone.querySelectorAll('[data-block-status]').forEach((el) => {
    resetBlockDecorationState(el);
  });

  await Promise.all(blocks.map((block) => loadInjectedBlock(block, { force: true })));
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
