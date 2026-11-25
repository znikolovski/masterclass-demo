/**
 * WKND Aero site footer.
 */
import { getMetadata } from '../../../scripts/aem.js';

/** Default footer rows when fragment fetch is unavailable. */
const DEFAULT_FOOTER_HTML = `
<div class="aero-footer">
  <div><div>WKND AERO</div><div>Adventure starts in the sky.</div></div>
  <div><div>EXPLORE</div><div>Destinations</div><div>/destinations</div></div>
  <div><div>Flights</div><div>/book/flights</div></div>
  <div><div>RESOURCES</div><div>Travel Inspiration</div><div>/travel-inspiration</div></div>
  <div><div>COMPANY</div><div>About</div><div>/about</div></div>
</div>`;

/**
 * @param {string} [footerMeta]
 * @returns {string}
 */
function resolveFooterPath(footerMeta) {
  if (footerMeta) return new URL(footerMeta, window.location).pathname;
  return '/footer';
}

/**
 * @param {Element} footerRoot
 * @returns {Element[]}
 */
function extractFooterRows(footerRoot) {
  if (footerRoot.classList.contains('aero-footer')) {
    return [...footerRoot.children];
  }
  const block = footerRoot.querySelector('.aero-footer');
  if (block) return [...block.children];
  return [...footerRoot.querySelectorAll(':scope > div')];
}

/**
 * @param {string} html
 * @returns {Element[]}
 */
function parseFooterRows(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const main = tmp.querySelector('main') || tmp;
  return extractFooterRows(main);
}

/**
 * @param {Element} block
 */
export default async function decorate(block) {
  const footerMeta = getMetadata('footer');
  const footerPath = resolveFooterPath(footerMeta);

  let rows = [...block.children].filter((row) => row.textContent.trim());
  if (!rows.length) {
    const paths = footerPath === '/footer' ? [footerPath] : [footerPath, '/footer'];
    for (let i = 0; i < paths.length && !rows.length; i += 1) {
      const resp = await fetch(`${paths[i]}.plain.html`);
      if (resp.ok) {
        rows = parseFooterRows(await resp.text());
      }
    }
    if (!rows.length) {
      rows = parseFooterRows(DEFAULT_FOOTER_HTML);
    }
  }

  block.textContent = '';
  block.classList.add('block', 'dark');

  const footer = document.createElement('div');
  footer.className = 'aero-footer-inner';

  const brandRow = rows[0];
  if (brandRow) {
    const brand = document.createElement('div');
    brand.className = 'aero-footer-brand';
    const cells = brandRow.querySelectorAll(':scope > div');
    const logo = brandRow.querySelector('img');
    if (logo) {
      brand.append(logo.cloneNode(true));
    } else if (cells[0]) {
      const h2 = document.createElement('h2');
      h2.textContent = cells[0].textContent.trim();
      brand.append(h2);
    }
    const tagline = cells[1];
    if (tagline) {
      const p = document.createElement('p');
      p.textContent = tagline.textContent.trim();
      brand.append(p);
    }
    footer.append(brand);
  }

  const columns = document.createElement('div');
  columns.className = 'aero-footer-columns';

  rows.slice(1).forEach((row) => {
    const cells = [...row.querySelectorAll(':scope > div')];
    if (!cells.length) return;

    const heading = cells[0]?.textContent.trim() || '';
    if (heading.startsWith('©')) return;

    const isColumnHeader = cells.length >= 2
      && heading === heading.toUpperCase()
      && heading.length < 24
      && !cells[1].querySelector('a')
      && (cells.length === 2 || cells[2]?.textContent.trim().startsWith('/'));

    if (isColumnHeader) {
      const col = document.createElement('div');
      col.className = 'aero-footer-col';
      const h3 = document.createElement('h3');
      h3.textContent = heading;
      col.append(h3);
      const ul = document.createElement('ul');
      for (let i = 1; i < cells.length; i += 2) {
        const label = cells[i]?.textContent.trim();
        const url = cells[i + 1]?.querySelector('a')?.href
          || cells[i + 1]?.textContent.trim()
          || cells[i]?.querySelector('a')?.href;
        if (label) {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = url || '#';
          a.textContent = label;
          li.append(a);
          ul.append(li);
        }
      }
      col.append(ul);
      columns.append(col);
      return;
    }

    if (cells.length >= 2) {
      let col = columns.querySelector('.aero-footer-col:last-child');
      if (!col || col.querySelector('h3')) {
        col = document.createElement('div');
        col.className = 'aero-footer-col';
        col.append(document.createElement('ul'));
        columns.append(col);
      }
      const ul = col.querySelector('ul');
      const label = cells[0].textContent.trim();
      const url = cells[1]?.querySelector('a')?.href || cells[1]?.textContent.trim();
      if (label && url) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = url;
        a.textContent = label;
        li.append(a);
        ul.append(li);
      }
    }
  });

  footer.append(columns);

  const copyright = document.createElement('p');
  copyright.className = 'aero-footer-copy';
  copyright.textContent = `© ${new Date().getFullYear()} WKND VOYAGES`;
  footer.append(copyright);

  block.append(footer);
}
