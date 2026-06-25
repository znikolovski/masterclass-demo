/**
 * Travel inspiration editorial page — Figma "Travel Inspiration (Orange)" layout.
 */
import {
  fetchAdventureCatalog,
  getCatalogItems,
} from '../../../scripts/aero-catalog.js';
import { getCatalogItemImage, normalizeLocalDevMediaUrl } from '../../../scripts/aero-catalog-images.js';
import { pushInteractionEvent } from '../../../scripts/analytics-acdl.js';

/**
 * @param {string} text
 * @returns {string}
 */
function accentHeadline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<span class="travel-inspiration-accent">$1</span>')
    .replace(/\*(.+?)\*/g, '<span class="travel-inspiration-muted-word">$1</span>');
}

/**
 * @param {Element} row
 * @returns {string[]}
 */
function rowCells(row) {
  return [...row.querySelectorAll(':scope > div')].map((cell) => {
    const img = cell.querySelector('picture img, img');
    if (img) return img.src;
    const link = cell.querySelector('a');
    if (link && cell.textContent.trim() === link.textContent.trim()) return link.href;
    return cell.textContent.trim();
  });
}

/**
 * @param {string} src
 * @returns {string}
 */
function cellText(src) {
  return typeof src === 'string' ? src.trim() : '';
}

/**
 * @param {string} key
 * @param {string[]} cells
 * @returns {boolean}
 */
function isSection(key, cells) {
  const first = cellText(cells[0]).toLowerCase();
  return first === `section:${key}` || first.startsWith(`section:${key}|`);
}

/**
 * @param {string} key
 * @param {string[]} cells
 * @returns {string}
 */
function sectionFlag(key, cells) {
  const first = cellText(cells[0]).toLowerCase();
  if (!first.startsWith(`section:${key}`)) return '';
  const parts = first.split('|');
  return parts[1]?.trim() || '';
}

/**
 * @param {Element} block
 * @param {string} className
 * @param {string} html
 * @returns {Element}
 */
function appendSection(block, className, html) {
  const el = document.createElement('section');
  el.className = className;
  el.innerHTML = html;
  block.append(el);
  return el;
}

/**
 * @param {object} item
 * @param {number} slot
 * @returns {string}
 */
function trendingCardHtml(item, slot) {
  const slug = item.sku || item.slug || '';
  const iata = item.destinationIata || item.extensions?.destinationIata || '';
  const img = normalizeLocalDevMediaUrl(getCatalogItemImage(item));
  const name = item.name || slug;
  const category = (item.adventureCategory || item.extensions?.adventureCategory || 'explorer').replace(/-/g, ' ');
  const shortName = name.split('—')[0].split(':')[0].trim();
  const location = shortName.split(' ').slice(-2).join(' ').toUpperCase() || shortName.toUpperCase();
  const desc = item.description?.replace(/<[^>]+>/g, '').slice(0, 72) || '';
  const bookUrl = `/book/flights?dest=${iata}&adv=${slug}`;
  const detailUrl = `/adventures/${slug}`;

  if (slot === 0) {
    return `
      <article class="travel-inspiration-trending-card travel-inspiration-trending-card--feature">
        <a href="${detailUrl}" class="travel-inspiration-trending-link">
          ${img ? `<img class="travel-inspiration-trending-bg" src="${img}" alt="${name}" loading="eager" />` : '<div class="travel-inspiration-trending-bg-placeholder" aria-hidden="true"></div>'}
          <div class="travel-inspiration-trending-copy">
            <p class="travel-inspiration-trending-eyebrow">${category.toUpperCase()}</p>
            <h3>${location}</h3>
            <span class="travel-inspiration-trending-cta">BOOK NOW <span aria-hidden="true">→</span></span>
          </div>
        </a>
      </article>`;
  }

  if (slot === 3) {
    return `
      <article class="travel-inspiration-trending-card travel-inspiration-trending-card--wide">
        <a href="${detailUrl}" class="travel-inspiration-trending-link">
          ${img ? `<img class="travel-inspiration-trending-bg" src="${img}" alt="${name}" loading="lazy" />` : '<div class="travel-inspiration-trending-bg-placeholder" aria-hidden="true"></div>'}
          <div class="travel-inspiration-trending-copy travel-inspiration-trending-copy--side">
            <h3>${location}</h3>
            ${desc ? `<p>${desc}</p>` : ''}
          </div>
        </a>
      </article>`;
  }

  if (slot === 1) {
    return `
      <article class="travel-inspiration-trending-card travel-inspiration-trending-card--compact travel-inspiration-trending-card--slot-1">
        <a href="${bookUrl}" class="travel-inspiration-trending-link">
          ${img ? `<img class="travel-inspiration-trending-bg" src="${img}" alt="${name}" loading="lazy" />` : '<div class="travel-inspiration-trending-bg-placeholder" aria-hidden="true"></div>'}
          <div class="travel-inspiration-trending-copy">
            <h3>${location}</h3>
          </div>
        </a>
      </article>`;
  }

  if (slot === 2) {
    return `
      <article class="travel-inspiration-trending-card travel-inspiration-trending-card--compact travel-inspiration-trending-card--slot-2">
        <a href="${bookUrl}" class="travel-inspiration-trending-link">
          ${img ? `<img class="travel-inspiration-trending-bg" src="${img}" alt="${name}" loading="lazy" />` : '<div class="travel-inspiration-trending-bg-placeholder" aria-hidden="true"></div>'}
          <div class="travel-inspiration-trending-copy">
            <h3>${location}</h3>
          </div>
        </a>
      </article>`;
  }

  return `
    <article class="travel-inspiration-trending-card travel-inspiration-trending-card--compact">
      <a href="${bookUrl}" class="travel-inspiration-trending-link">
        ${img ? `<img class="travel-inspiration-trending-bg" src="${img}" alt="${name}" loading="lazy" />` : '<div class="travel-inspiration-trending-bg-placeholder" aria-hidden="true"></div>'}
        <div class="travel-inspiration-trending-copy">
          <h3>${location}</h3>
        </div>
      </a>
    </article>`;
}

/**
 * @param {Element} block
 */
export default async function decorate(block) {
  const rows = [...block.children];
  const cellsByRow = rows.map(rowCells);

  const eyebrow = cellText(cellsByRow[0]?.[0]) || 'TRAVEL INSPIRATION';
  const headline = cellText(cellsByRow[1]?.[0]) || 'WHERE THE JOURNEY **STARTS.**';
  const intro = cellText(cellsByRow[2]?.[0])
    || 'Explore the world\'s most rugged terrains and pristine shores through the eyes of professional explorers. Curated journeys for the bold.';

  const coverRowIndex = cellsByRow.findIndex((cells) => isSection('featured-cover', cells));
  const coverRowData = coverRowIndex >= 0
    ? cellsByRow[coverRowIndex]
    : cellsByRow.find((cells) => cells[0]?.includes('http') || cells[0]?.includes('/media_') || cells[0]?.includes('content.da.live'));
  const coverOffset = coverRowData && isSection('featured-cover', coverRowData) ? 1 : 0;
  const routeRows = cellsByRow.filter((cells) => isSection('featured-route', cells)
    || (cellText(cells[0]).toUpperCase().startsWith('FEATURED ROUTE')));
  const seasonalRow = cellsByRow.find((cells) => isSection('seasonal', cells));
  const trendingRow = cellsByRow.find((cells) => isSection('trending', cells));
  const departureRow = cellsByRow.find((cells) => isSection('departure', cells));
  const flightRow = cellsByRow.find((cells) => isSection('flight-status', cells));

  block.textContent = '';
  block.classList.add('block');

  const main = document.createElement('div');
  main.className = 'travel-inspiration-main';
  block.append(main);

  main.innerHTML = `
    <header class="travel-inspiration-hero">
      <div class="travel-inspiration-hero-title">
        <p class="travel-inspiration-eyebrow">${eyebrow}</p>
        <h1>${accentHeadline(headline)}</h1>
      </div>
      <div class="travel-inspiration-hero-intro">
        <p>${intro}</p>
        <span class="travel-inspiration-accent-bar" aria-hidden="true"></span>
      </div>
    </header>`;

  const coverImg = coverRowData?.[coverOffset] || 'https://content.da.live/znikolovski/masterclass-demo/.index/hero-mountain-83c7a2a5.jpeg';
  const coverEyebrow = cellText(coverRowData?.[coverOffset + 1]) || 'COVER STORY';
  const coverTitle = cellText(coverRowData?.[coverOffset + 2]) || 'THE ULTIMATE HIKING TRAILS';
  const coverDesc = cellText(coverRowData?.[coverOffset + 3])
    || 'From the jagged spires of Patagonia to the lush ridges of Kauai, we\'ve mapped the world\'s most demanding and rewarding treks.';
  const coverCta = cellText(coverRowData?.[coverOffset + 4]) || 'READ THE GUIDE';
  const coverUrl = cellText(coverRowData?.[coverOffset + 5]) || '/adventures/patagonia-trek';

  const routes = routeRows.length ? routeRows.map((cells, i) => {
    const offset = isSection('featured-route', cells) ? 1 : 0;
    const active = sectionFlag('featured-route', cells) === 'active' || i === 0;
    return {
      label: cellText(cells[offset]) || `FEATURED ROUTE 0${i + 1}`,
      title: cellText(cells[offset + 1]) || '',
      meta: cellText(cells[offset + 2]) || '',
      cta: cellText(cells[offset + 3]) || 'BOOK NOW',
      url: cellText(cells[offset + 4]) || '#',
      active,
    };
  }) : [
    {
      label: 'FEATURED ROUTE 01',
      title: 'PATAGONIA SKY PATH',
      meta: 'Estimated Flight Time: 14h 20m from NYC',
      cta: 'BOOK EL CHALTÉN',
      url: '/book/flights?dest=PUQ&adv=patagonia-trek',
      active: true,
    },
    {
      label: 'FEATURED ROUTE 02',
      title: 'DOLOMITES TRAVERSE',
      meta: 'Estimated Flight Time: 9h 45m from NYC',
      cta: 'BOOK VENICE-TREVISO',
      url: '/book/flights?dest=VCE&adv=alpine-cycling',
      active: false,
    },
  ];

  const featured = document.createElement('section');
  featured.className = 'travel-inspiration-featured';
  featured.innerHTML = `
    <article class="travel-inspiration-cover">
      <img class="travel-inspiration-cover-bg" src="${coverImg}" alt="" loading="eager" />
      <div class="travel-inspiration-cover-overlay">
        <p class="travel-inspiration-cover-eyebrow">${coverEyebrow}</p>
        <h2>${coverTitle}</h2>
        <p>${coverDesc}</p>
        <a href="${coverUrl}" class="travel-inspiration-cover-cta">${coverCta} <span aria-hidden="true">→</span></a>
      </div>
    </article>
    <div class="travel-inspiration-routes">
      ${routes.map((route) => `
        <article class="travel-inspiration-route${route.active ? ' travel-inspiration-route--active' : ''}">
          <p class="travel-inspiration-route-label">${route.label}</p>
          <h3>${route.title}</h3>
          <p class="travel-inspiration-route-meta">${route.meta}</p>
          <a href="${route.url}" class="travel-inspiration-route-cta">${route.cta}</a>
        </article>`).join('')}
    </div>`;
  main.append(featured);

  const seasonalOffset = seasonalRow && isSection('seasonal', seasonalRow) ? 1 : 0;
  const seasonalEyebrow = cellText(seasonalRow?.[seasonalOffset]) || 'SEASONAL EDIT';
  const seasonalHeading = cellText(seasonalRow?.[seasonalOffset + 1]) || 'HIDDEN **SURFING** *GEMS.*';
  const seasonalBody = cellText(seasonalRow?.[seasonalOffset + 2])
    || 'Forget the crowds of Oahu. We\'re taking you to the secret barrels of the Azores and the rugged breaks of Namibia\'s Skeleton Coast. This is surfing at its most primitive.';
  const seasonalImg = seasonalRow?.[seasonalOffset + 3]
    || 'https://content.da.live/znikolovski/masterclass-demo/.index/hero-mountain-83c7a2a5.jpeg';
  const seasonalBadge = cellText(seasonalRow?.[seasonalOffset + 4]) || '02';
  const stat1Label = cellText(seasonalRow?.[seasonalOffset + 5]) || 'DESTINATION';
  const stat1Value = cellText(seasonalRow?.[seasonalOffset + 6]) || 'PONTA DELGADA';
  const stat2Label = cellText(seasonalRow?.[seasonalOffset + 7]) || 'WATER TEMP';
  const stat2Value = cellText(seasonalRow?.[seasonalOffset + 8]) || '19°C / 66°F';
  const seasonalCta = cellText(seasonalRow?.[seasonalOffset + 9]) || 'EXPLORE THE SWELLS';
  const seasonalUrl = cellText(seasonalRow?.[seasonalOffset + 10]) || '/adventures/kayaking-norway';

  appendSection(main, 'travel-inspiration-seasonal', `
    <div class="travel-inspiration-seasonal-copy">
      <p class="travel-inspiration-eyebrow">${seasonalEyebrow}</p>
      <h2>${accentHeadline(seasonalHeading)}</h2>
      <p class="travel-inspiration-seasonal-body">${seasonalBody}</p>
      <div class="travel-inspiration-seasonal-stats">
        <div>
          <p class="travel-inspiration-stat-label">${stat1Label}</p>
          <p class="travel-inspiration-stat-value">${stat1Value}</p>
        </div>
        <div>
          <p class="travel-inspiration-stat-label">${stat2Label}</p>
          <p class="travel-inspiration-stat-value">${stat2Value}</p>
        </div>
      </div>
      <a href="${seasonalUrl}" class="travel-inspiration-seasonal-cta">${seasonalCta}</a>
    </div>
    <figure class="travel-inspiration-seasonal-media">
      <img src="${seasonalImg}" alt="" loading="lazy" />
      <span class="travel-inspiration-seasonal-badge">${seasonalBadge}</span>
    </figure>`);

  const trendingHeading = (() => {
    if (!trendingRow) return 'TRENDING DESTINATIONS';
    if (isSection('trending', trendingRow)) return cellText(trendingRow[1]) || 'TRENDING DESTINATIONS';
    return cellText(trendingRow[0]) || 'TRENDING DESTINATIONS';
  })();
  const trendingLimit = (() => {
    if (!trendingRow) return 4;
    const flag = sectionFlag('trending', trendingRow);
    if (flag && !Number.isNaN(parseInt(flag, 10))) return parseInt(flag, 10);
    if (isSection('trending', trendingRow)) {
      const limitCell = cellText(trendingRow[2]) || cellText(trendingRow[1]);
      const parsed = parseInt(limitCell, 10);
      return Number.isNaN(parsed) ? 4 : parsed;
    }
    const parsed = parseInt(cellText(trendingRow[1]), 10);
    return Number.isNaN(parsed) ? 4 : parsed;
  })();

  const trending = document.createElement('section');
  trending.className = 'travel-inspiration-trending';
  trending.innerHTML = `<h2 class="travel-inspiration-trending-heading">${trendingHeading}</h2><div class="travel-inspiration-trending-grid"></div>`;
  main.append(trending);
  const trendingGrid = trending.querySelector('.travel-inspiration-trending-grid');

  try {
    const catalog = await fetchAdventureCatalog();
    const items = getCatalogItems(catalog).slice(0, trendingLimit);
    items.forEach((item, i) => {
      trendingGrid.insertAdjacentHTML('beforeend', trendingCardHtml(item, i));
    });
    trendingGrid.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        pushInteractionEvent('adventureTileClick', { block: 'travel-inspiration', label: link.pathname, detail: 'trending' });
      });
    });
  } catch {
    trendingGrid.innerHTML = '<p class="travel-inspiration-empty">Trending destinations loading…</p>';
  }

  const departureOffset = departureRow && isSection('departure', departureRow) ? 1 : 0;
  const departureHeading = cellText(departureRow?.[departureOffset]) || 'READY FOR **DEPARTURE?**';
  const departureBody = cellText(departureRow?.[departureOffset + 1])
    || 'Access exclusive WKND fares and personalized adventure itineraries by signing into your WKND Pass account.';
  const primaryCta = cellText(departureRow?.[departureOffset + 2]) || 'SIGN IN TO WKND PASS';
  const primaryUrl = cellText(departureRow?.[departureOffset + 3]) || '/wknd-pass';
  const secondaryCta = cellText(departureRow?.[departureOffset + 4]) || 'CHECK FARES';
  const secondaryUrl = cellText(departureRow?.[departureOffset + 5]) || '/book/flights';

  const flightOffset = flightRow && isSection('flight-status', flightRow) ? 1 : 0;
  const flightNo = cellText(flightRow?.[flightOffset]) || 'WK92';
  const flightStatus = cellText(flightRow?.[flightOffset + 1]) || 'ON TIME';
  const fromCode = cellText(flightRow?.[flightOffset + 2]) || 'JFK';
  const fromCity = cellText(flightRow?.[flightOffset + 3]) || 'New York';
  const toCode = cellText(flightRow?.[flightOffset + 4]) || 'PDL';
  const toCity = cellText(flightRow?.[flightOffset + 5]) || 'Ponta Delgada';

  appendSection(block, 'travel-inspiration-departure', `
    <div class="travel-inspiration-departure-inner">
      <p class="travel-inspiration-departure-watermark" aria-hidden="true">WKND</p>
      <div class="travel-inspiration-departure-copy">
        <h2>${accentHeadline(departureHeading)}</h2>
        <p>${departureBody}</p>
        <div class="travel-inspiration-departure-actions">
          <a href="${primaryUrl}" class="travel-inspiration-btn travel-inspiration-btn--primary">${primaryCta}</a>
          <a href="${secondaryUrl}" class="travel-inspiration-btn travel-inspiration-btn--outline">${secondaryCta}</a>
        </div>
      </div>
      <aside class="travel-inspiration-flight-card" aria-label="Sample flight status">
        <div class="travel-inspiration-flight-card-header">
          <span>FLIGHT NO.</span>
          <span>STATUS</span>
        </div>
        <div class="travel-inspiration-flight-card-route">
          <div>
            <strong>${fromCode}</strong>
            <span>${fromCity}</span>
          </div>
          <span class="travel-inspiration-flight-icon" aria-hidden="true">✈</span>
          <div>
            <strong>${toCode}</strong>
            <span>${toCity}</span>
          </div>
        </div>
        <div class="travel-inspiration-flight-card-footer">
          <span>${flightNo}</span>
          <span>${flightStatus}</span>
        </div>
      </aside>
    </div>`);
}
