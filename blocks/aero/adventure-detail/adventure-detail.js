/**
 * Adventure detail page — catalog-driven hero, copy, and CTAs.
 */
import { readBlockConfig } from '../../../scripts/aem.js';
import { getAeroApiBase } from '../../../scripts/aero-blocks.js';
import {
  getCatalogItemImage,
  normalizeLocalDevMediaUrl,
  resolveCatalogImageUrl,
} from '../../../scripts/aero-catalog-images.js';

/**
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {string} path
 * @returns {string}
 */
function slugFromPath(path) {
  const parts = path.replace(/\/$/, '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

/**
 * @param {object} entity
 * @returns {string}
 */
function categoryLabel(entity) {
  const cat = entity.adventureCategory || entity.extensions?.adventureCategory || '';
  return cat.replace(/-/g, ' ');
}

/**
 * @param {object} entity
 * @param {Element} block
 */
function renderDetail(block, entity) {
  const iata = entity.destinationIata || entity.extensions?.destinationIata || '';
  const slug = entity.sku || '';
  const img = normalizeLocalDevMediaUrl(getCatalogItemImage(entity) || resolveCatalogImageUrl(entity.images?.[0]?.url));
  const desc = escapeHtml((entity.description || '').replace(/<[^>]+>/g, ''));
  const price = entity.price?.final || 399;
  const editorial = escapeHtml(entity.editorialUrl || `https://main--masterclass-demo--znikolovski.aem.live/blog/${slug}`);
  const name = escapeHtml(entity.name);
  const category = escapeHtml(categoryLabel(entity));

  block.innerHTML = `
    <article class="adventure-detail-inner">
      <div class="adventure-detail-hero"${img ? ` style="background-image:url('${escapeHtml(img)}')"` : ''}>
        <div class="adventure-detail-hero-copy">
          <p class="adventure-detail-eyebrow">${category}</p>
          <h1>${name}</h1>
        </div>
      </div>
      <div class="adventure-detail-body">
        <div class="adventure-detail-main">
          <p class="adventure-detail-lead">${desc}</p>
          <div class="adventure-detail-actions">
            <a class="adventure-detail-cta" href="/book/flights?dest=${escapeHtml(iata)}&amp;adv=${escapeHtml(slug)}">Find flights</a>
            <a class="adventure-detail-link" href="${editorial}" target="_blank" rel="noopener noreferrer">Read the full story on WKND Adventures</a>
          </div>
        </div>
        <aside class="adventure-detail-aside">
          <h2>Trip facts</h2>
          <dl>
            <div><dt>Destination airport</dt><dd>${escapeHtml(iata) || '—'}</dd></div>
            <div><dt>Category</dt><dd>${category || '—'}</dd></div>
            <div><dt>Flights from</dt><dd>$${price}</dd></div>
          </dl>
        </aside>
      </div>
    </article>`;
}

/**
 * @param {Element} block
 */
export default async function decorate(block) {
  const rows = [...block.children];
  const config = readBlockConfig(block);
  const authoredSlug = rows[0]?.querySelector(':scope > div')?.textContent.trim()
    || config.slug
    || block.dataset.slug
    || slugFromPath(window.location.pathname);

  block.textContent = '';
  block.classList.add('block');

  const api = getAeroApiBase();
  try {
    const resp = await fetch(`${api}/catalog/adventures/${authoredSlug}.json`);
    if (!resp.ok) throw new Error('not found');
    const entity = await resp.json();
    renderDetail(block, entity);
  } catch {
    block.innerHTML = '<div class="adventure-detail-empty"><h2>Adventure not found</h2><p><a href="/destinations">Browse destinations</a></p></div>';
  }
}
