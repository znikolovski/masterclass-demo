/**
 * Destinations grid from Product Bus catalog.
 */
import { readBlockConfig } from '../../../scripts/aem.js';
import {
  fetchAdventureCatalog,
  getCatalogItems,
} from '../../../scripts/aero-catalog.js';
import {
  getCatalogItemImage,
  normalizeLocalDevMediaUrl,
} from '../../../scripts/aero-catalog-images.js';

/**
 * @param {string} category
 * @returns {string}
 */
function formatCategory(category) {
  if (!category) return '';
  return category.replace(/-/g, ' ');
}

/**
 * @param {Element} block
 * @param {object[]} items
 * @param {string} filter
 */
function renderGrid(block, items, filter) {
  const filtered = filter && filter !== 'all'
    ? items.filter((item) => (item.adventureCategory || item.extensions?.adventureCategory) === filter)
    : items;

  const grid = document.createElement('div');
  grid.className = 'destinations-grid-list';

  if (!filtered.length) {
    grid.innerHTML = '<p class="destinations-grid-empty">No destinations match this filter.</p>';
    block.append(grid);
    return;
  }

  filtered.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'destinations-grid-card';
    const slug = item.sku || '';
    const iata = item.destinationIata || item.extensions?.destinationIata || '';
    const category = item.adventureCategory || item.extensions?.adventureCategory || '';
    const img = normalizeLocalDevMediaUrl(getCatalogItemImage(item));
    const price = item.price?.final || 299;
    const name = item.name || slug;
    const desc = (item.description || '').replace(/<[^>]+>/g, '').slice(0, 100);

    card.innerHTML = `
      <a href="/adventures/${slug}" class="destinations-grid-media">
        ${img ? `<img src="${img}" alt="" loading="lazy" />` : '<div class="destinations-grid-placeholder" aria-hidden="true"></div>'}
        <div class="destinations-grid-card-copy">
          ${category ? `<span class="destinations-grid-tag">${formatCategory(category)}</span>` : ''}
          <h3>${name}</h3>
          ${desc ? `<p>${desc}</p>` : ''}
          <p class="destinations-grid-price">Flights from <strong>$${price}</strong>${iata ? ` · ${iata}` : ''}</p>
        </div>
      </a>
      <a href="/book/flights?dest=${iata}&adv=${slug}" class="destinations-grid-book">Book flights</a>`;
    grid.append(card);
  });

  block.append(grid);
}

/**
 * @param {Element} block
 * @param {object[]} items
 * @param {string} activeFilter
 */
function renderFilters(block, items, activeFilter) {
  const categories = [...new Set(items.map((item) => item.adventureCategory || item.extensions?.adventureCategory).filter(Boolean))];
  if (categories.length < 2) return;

  const filters = document.createElement('div');
  filters.className = 'destinations-grid-filters';
  filters.setAttribute('role', 'tablist');
  filters.setAttribute('aria-label', 'Filter destinations');

  const addChip = (label, value) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `destinations-grid-filter${value === activeFilter ? ' active' : ''}`;
    btn.textContent = label;
    btn.dataset.filter = value;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', value === activeFilter ? 'true' : 'false');
    btn.addEventListener('click', () => {
      block.querySelector('.destinations-grid-list')?.remove();
      block.querySelectorAll('.destinations-grid-filter').forEach((chip) => {
        chip.classList.toggle('active', chip.dataset.filter === value);
        chip.setAttribute('aria-selected', chip.dataset.filter === value ? 'true' : 'false');
      });
      renderGrid(block, items, value);
    });
    filters.append(btn);
  };

  addChip('All', 'all');
  categories.forEach((cat) => addChip(formatCategory(cat), cat));
  block.append(filters);
}

/**
 * @param {Element} block
 */
export default async function decorate(block) {
  const rows = [...block.children];
  const config = readBlockConfig(block);
  block.textContent = '';
  block.classList.add('block');

  const eyebrow = rows[0]?.querySelector(':scope > div')?.textContent.trim()
    || config.eyebrow || 'EXPLORE';
  const heading = rows[1]?.querySelector(':scope > div')?.textContent.trim()
    || config.heading || 'Destinations';
  const intro = rows[2]?.querySelector(':scope > div')?.textContent.trim()
    || config.intro || 'Every adventure starts with a destination. Browse routes, compare fares, and book your flight.';
  const filter = config.filter || 'all';
  const limit = parseInt(config.limit || '24', 10);

  const header = document.createElement('div');
  header.className = 'destinations-grid-header';
  header.innerHTML = `
    <p class="destinations-grid-eyebrow">${eyebrow}</p>
    <h2>${heading}</h2>
    <p class="destinations-grid-intro">${intro}</p>`;
  block.append(header);

  try {
    const catalog = await fetchAdventureCatalog();
    const items = getCatalogItems(catalog).slice(0, limit);
    renderFilters(block, items, filter);
    renderGrid(block, items, filter);
  } catch {
    block.innerHTML += '<p class="destinations-grid-empty">Unable to load destinations. Please try again later.</p>';
  }
}
