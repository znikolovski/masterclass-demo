/* eslint-disable */
/* global WebImporter */

/**
 * Parser: cards-article
 * Matches: .article-card-grid, .related-articles, section containing article cards
 * Selector: .article-card-grid, section:last-of-type .grid-layout
 *
 * Converts article card grids into a tabs-activity block with a single tab
 * so the tabs-activity JS handles card grouping.
 */
export default function parse(element, { document }) {
  const cards = element.querySelectorAll('.article-card, a[class*="card"]');
  if (cards.length === 0) return;

  const cells = [];

  // Single tab row: tab name + panel content
  const tabName = 'Featured';
  const panelContent = [];

  cards.forEach((card) => {
    const img = card.querySelector('img');
    const tag = card.querySelector('.tag, [class*="meta"] .tag, [class*="card-meta"] div');
    const heading = card.querySelector('h3, [class*="heading"]');
    const desc = card.querySelector('p[class*="secondary"], [class*="desc"]');

    if (img) {
      const p = document.createElement('p');
      const pic = document.createElement('picture');
      const newImg = document.createElement('img');
      newImg.src = img.src;
      newImg.alt = img.alt || '';
      pic.append(newImg);
      p.append(pic);
      panelContent.push(p);
    }
    if (tag) {
      const p = document.createElement('p');
      p.textContent = tag.textContent.trim();
      panelContent.push(p);
    }
    if (heading) {
      const h3 = document.createElement('h3');
      const link = card.closest('a') || card.querySelector('a');
      if (link) {
        const a = document.createElement('a');
        a.href = link.href;
        a.textContent = heading.textContent.trim();
        h3.append(a);
      } else {
        h3.textContent = heading.textContent.trim();
      }
      panelContent.push(h3);
    }
    if (desc) {
      const p = document.createElement('p');
      p.textContent = desc.textContent.trim();
      panelContent.push(p);
    }
  });

  // Build block: one row with tab name cell + panel content cell
  cells.push([tabName, panelContent]);

  const block = WebImporter.Blocks.createBlock(document, { name: 'tabs-activity', cells });
  element.replaceWith(block);
}
