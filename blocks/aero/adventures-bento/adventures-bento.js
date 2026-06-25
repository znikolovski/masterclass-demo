/**
 * Adventures bento grid fed by Product Bus catalog API.
 */
import { readBlockConfig } from '../../../scripts/aem.js';
import {
  fetchAdventureCatalog,
  getCatalogItems,
} from '../../../scripts/aero-catalog.js';
import { getCatalogItemImage, normalizeLocalDevMediaUrl } from '../../../scripts/aero-catalog-images.js';
import { pushInteractionEvent } from '../../../scripts/analytics-acdl.js';

let catalogCache = null;
let catalogCacheAt = 0;

/**
 * @returns {Promise<object>}
 */
async function fetchCatalog() {
  if (catalogCache && Date.now() - catalogCacheAt < 300000) return catalogCache;
  const catalog = await fetchAdventureCatalog();
  catalogCache = catalog;
  catalogCacheAt = Date.now();
  return catalogCache;
}

/**
 * @param {number} length
 * @returns {string}
 */
function getTitleLengthClass(length) {
  if (length > 48) return 'adventures-bento-title-xlong';
  if (length > 32) return 'adventures-bento-title-long';
  if (length > 22) return 'adventures-bento-title-medium';
  return 'adventures-bento-title-short';
}

/**
 * @param {number} index
 * @returns {string}
 */
function getTileSizeClass(index) {
  if (index === 0) return 'adventures-bento-tile--feature';
  if (index === 1) return 'adventures-bento-tile--medium';
  if (index === 2) return 'adventures-bento-tile--tall';
  if (index === 5) return 'adventures-bento-tile--wide';
  if (index >= 3 && index <= 4) return 'adventures-bento-tile--compact';
  return 'adventures-bento-tile--standard';
}

/**
 * Reduce title font size until it fits the copy area (compact / small tiles).
 * @param {Element} grid
 */
function fitBentoTitles(grid) {
  grid.querySelectorAll('.adventures-bento-tile--compact .adventures-bento-copy, .adventures-bento-tile--tall .adventures-bento-copy, .adventures-bento-tile--medium .adventures-bento-copy').forEach((copy) => {
    const h3 = copy.querySelector('h3');
    const desc = copy.querySelector('p');
    if (!h3) return;

    h3.style.fontSize = '';
    if (desc) desc.hidden = false;

    const minSize = 11;
    let size = parseFloat(getComputedStyle(h3).fontSize) || 18;
    const reserveDesc = desc ? desc.offsetHeight + 10 : 0;
    let maxTitleHeight = Math.max(copy.clientHeight - reserveDesc - 12, 36);

    const shrink = () => {
      while (size > minSize && h3.scrollHeight > maxTitleHeight) {
        size -= 1;
        h3.style.fontSize = `${size}px`;
      }
    };

    shrink();

    if (h3.scrollHeight > maxTitleHeight && desc) {
      desc.hidden = true;
      maxTitleHeight = copy.clientHeight - 12;
      shrink();
    }

    if (h3.scrollHeight > maxTitleHeight) {
      h3.classList.add('adventures-bento-title-clamp');
    }
  });

  grid.querySelectorAll('.adventures-bento-tile--wide .adventures-bento-copy h3, .adventures-bento-tile--standard .adventures-bento-copy h3').forEach((h3) => {
    const copy = h3.closest('.adventures-bento-copy');
    if (!copy || h3.scrollHeight <= copy.clientHeight * 0.55) return;
    let size = parseFloat(getComputedStyle(h3).fontSize) || 18;
    while (size > 13 && h3.scrollHeight > copy.clientHeight * 0.55) {
      size -= 1;
      h3.style.fontSize = `${size}px`;
    }
  });
}

/**
 * @param {Element} grid
 */
function observeBentoTitleFit(grid) {
  fitBentoTitles(grid);
  if (typeof ResizeObserver === 'undefined') return;
  let frame = 0;
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => fitBentoTitles(grid));
  });
  grid.querySelectorAll('.adventures-bento-tile').forEach((tile) => observer.observe(tile));
}

/**
 * @param {Element} block
 */
export default async function decorate(block) {
  const rows = [...block.children];
  const config = readBlockConfig(block);
  const eyebrow = rows[0]?.querySelector(':scope > div')?.textContent.trim()
    || config.eyebrow || 'CURATION 01';
  const heading = rows[1]?.querySelector(':scope > div')?.textContent.trim()
    || config.heading || 'Featured Adventures';
  const limit = parseInt(rows[2]?.querySelector(':scope > div')?.textContent.trim()
    || config.limit || '6', 10);
  block.textContent = '';
  block.classList.add('block');

  const header = document.createElement('div');
  header.className = 'adventures-bento-header';
  header.innerHTML = `<p class="adventures-bento-eyebrow">${eyebrow}</p><h2>${heading}</h2><a href="/destinations" class="adventures-bento-view-all">View all destinations</a>`;
  block.append(header);

  const grid = document.createElement('div');
  grid.className = 'adventures-bento-grid';
  block.append(grid);

  try {
    const catalog = await fetchCatalog();
    const items = getCatalogItems(catalog).slice(0, limit);
    items.forEach((item, i) => {
      const tile = document.createElement('article');
      tile.className = `adventures-bento-tile ${getTileSizeClass(i)}`;
      const slug = item.sku || item.slug || '';
      const iata = item.destinationIata || item.extensions?.destinationIata || '';
      const img = normalizeLocalDevMediaUrl(getCatalogItemImage(item));
      const name = item.name || slug;
      const desc = item.description?.replace(/<[^>]+>/g, '').slice(0, 80) || '';
      const titleClass = getTitleLengthClass(name.length);
      tile.innerHTML = `
        <a href="/adventures/${slug}" class="adventures-bento-link">
          ${img ? `<img class="adventures-bento-bg" src="${img}" alt="${name}" loading="${i < 2 ? 'eager' : 'lazy'}" />` : '<div class="adventures-bento-bg-placeholder" aria-hidden="true"></div>'}
          <div class="adventures-bento-copy">
            <h3 class="${titleClass}">${name}</h3>
            ${desc ? `<p>${desc}</p>` : ''}
          </div>
        </a>
        <div class="adventures-bento-overlay">
          <div class="adventures-bento-overlay-actions">
            <a href="/adventures/${slug}" class="adventures-bento-overlay-label">See adventure details</a>
            <a href="/book/flights?dest=${iata}&adv=${slug}" class="adventures-bento-flights">Find flights</a>
          </div>
        </div>`;
      tile.querySelector('.adventures-bento-link')?.addEventListener('click', () => {
        pushInteractionEvent('adventureTileClick', { block: 'adventures-bento', label: slug, detail: String(i) });
      });
      tile.querySelector('.adventures-bento-overlay-label')?.addEventListener('click', () => {
        pushInteractionEvent('adventureTileClick', { block: 'adventures-bento', label: slug, detail: String(i) });
      });
      tile.querySelector('.adventures-bento-flights')?.addEventListener('click', () => {
        pushInteractionEvent('adventureFlightsClick', { block: 'adventures-bento', label: slug, detail: String(i) });
      });
      grid.append(tile);
    });
    observeBentoTitleFit(grid);
  } catch {
    grid.innerHTML = '<p class="adventures-bento-empty">Adventures catalog loading…</p>';
  }
}
