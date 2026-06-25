/**
 * WKND Aero block registry — resolves assets under blocks/aero/{name}/.
 * Authoring class names stay flat (e.g. flight-search); only load paths differ.
 */

import { loadCSS } from './aem.js';

/** @type {Set<string>} */
export const AERO_BLOCKS = new Set([
  'aero-header',
  'aero-footer',
  'aero-hero',
  'flight-search',
  'adventures-bento',
  'aero-pass',
  'aero-newsletter',
  'destinations-grid',
  'travel-inspiration',
  'booking-journey',
  'adventure-detail',
]);

/**
 * @param {string} blockName
 * @returns {boolean}
 */
export function isAeroBlock(blockName) {
  return AERO_BLOCKS.has(blockName);
}

/**
 * @param {string} blockName
 * @returns {string} Base path without extension (css/js suffix appended by caller)
 */
export function getBlockAssetBase(blockName) {
  const base = window.hlx?.codeBasePath || '';
  if (isAeroBlock(blockName)) {
    return `${base}/blocks/aero/${blockName}/${blockName}`;
  }
  return `${base}/blocks/${blockName}/${blockName}`;
}

/**
 * @param {string} blockName
 * @returns {string}
 */
export function getBlockStylesheetHref(blockName) {
  return `${getBlockAssetBase(blockName)}.css`;
}

/**
 * Loads JS and CSS for a block (Aero subfolder or default blocks/).
 * @param {Element} block
 */
export async function loadSiteBlock(block) {
  const status = block.dataset.blockStatus;
  if (status === 'loading' || status === 'loaded') return block;

  block.dataset.blockStatus = 'loading';
  const { blockName } = block.dataset;
  const assetBase = getBlockAssetBase(blockName);

  try {
    const cssLoaded = loadCSS(`${assetBase}.css`);
    const decorationComplete = new Promise((resolve) => {
      (async () => {
        try {
          const mod = await import(`${assetBase}.js`);
          if (mod.default) await mod.default(block);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(`failed to load module for ${blockName}`, error);
        }
        resolve();
      })();
    });
    await Promise.all([cssLoaded, decorationComplete]);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`failed to load block ${blockName}`, error);
  }
  block.dataset.blockStatus = 'loaded';
  return block;
}

/**
 * Load Aero blocks from blocks/aero/ or fall back to default blocks/ path.
 * @param {Element} block
 */
export async function loadBlockOrSiteBlock(block) {
  const name = block.dataset.blockName || block.classList[0] || '';
  if (isAeroBlock(name)) return loadSiteBlock(block);
  const { loadBlock } = await import('./aem.js');
  return loadBlock(block);
}

/**
 * Default Aero Worker API base (override via page metadata `aero-api`).
 * @param {Document} [doc]
 * @returns {string}
 */
export function getAeroApiBase(doc = document) {
  const meta = doc.querySelector('meta[name="aero-api"]');
  if (meta?.content) return meta.content.replace(/\/$/, '');
  return 'https://wknd-aero-api.jaggah.workers.dev';
}

/** Default origin when none is authored or selected (Melbourne). */
export const DEFAULT_FLIGHT_ORIGIN = 'MEL';

/**
 * Read URL query params for cross-site adventure attribution.
 * @returns {{ origin: string, dest: string, adv: string, cid: string, ref: string }}
 */
export function getFlightAttribution() {
  const params = new URLSearchParams(window.location.search);
  return {
    origin: params.get('origin') || '',
    dest: params.get('dest') || '',
    adv: params.get('adv') || '',
    cid: params.get('cid') || '',
    ref: params.get('ref') || '',
  };
}

/**
 * Persist attribution in sessionStorage for booking funnel.
 * @param {{ origin?: string, dest?: string, adv?: string, cid?: string, ref?: string }} attrs
 */
export function persistFlightAttribution(attrs) {
  try {
    const existing = JSON.parse(sessionStorage.getItem('wknd:aero:attribution') || '{}');
    sessionStorage.setItem('wknd:aero:attribution', JSON.stringify({ ...existing, ...attrs }));
  } catch {
    /* ignore quota errors */
  }
}

/**
 * @returns {{ origin?: string, dest?: string, adv?: string, cid?: string, ref?: string }}
 */
export function readFlightAttribution() {
  try {
    return JSON.parse(sessionStorage.getItem('wknd:aero:attribution') || '{}');
  } catch {
    return {};
  }
}
