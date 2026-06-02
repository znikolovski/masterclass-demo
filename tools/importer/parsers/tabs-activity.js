/* eslint-disable */
/* global WebImporter */

/**
 * Parser for tabs-activity
 * Base block: tabs
 * Source: https://wknd-adventures.com/
 * Selector: .tab-container
 * Generated: 2026-05-27
 *
 * Source structure:
 * - .tab-menu with button.tab-menu-link elements (tab labels)
 * - .tab-pane divs each containing .article-card links (tab content)
 *
 * Target structure (Tabs block):
 * - 2 columns per row: Tab Label | Tab Content
 * - Each row represents one tab
 */
export default function parse(element, { document }) {
  // Extract tab labels from the tab menu buttons
  const tabButtons = Array.from(element.querySelectorAll('.tab-menu .tab-menu-link, .tab-menu button'));

  // Extract tab panes (content panels)
  const tabPanes = Array.from(element.querySelectorAll('.tab-pane'));

  const cells = [];

  // Build one row per tab: [label, content]
  tabButtons.forEach((button, index) => {
    const label = button.textContent.trim();
    const pane = tabPanes[index];

    if (!pane) return;

    // Build content for this tab pane from article cards
    const cards = Array.from(pane.querySelectorAll('.article-card, a[class*="card"]'));
    const contentElements = [];

    cards.forEach((card) => {
      // Extract image
      const img = card.querySelector('.article-card-image img, img');
      // Extract tag/category
      const tag = card.querySelector('.article-card-meta .tag, .tag');
      // Extract heading
      const heading = card.querySelector('h3, h2, .h6-heading');
      // Extract description
      const description = card.querySelector('p.paragraph-sm, .article-card-body p');
      // Get the link href
      const href = card.getAttribute('href') || card.querySelector('a')?.getAttribute('href');

      // Create a container for this card's content
      const cardContainer = document.createElement('div');

      if (img) {
        const imgClone = img.cloneNode(true);
        cardContainer.appendChild(imgClone);
      }

      if (tag) {
        const tagEl = document.createElement('p');
        tagEl.textContent = tag.textContent.trim();
        cardContainer.appendChild(tagEl);
      }

      if (heading) {
        const headingEl = document.createElement('h3');
        if (href) {
          const link = document.createElement('a');
          link.setAttribute('href', href);
          link.textContent = heading.textContent.trim();
          headingEl.appendChild(link);
        } else {
          headingEl.textContent = heading.textContent.trim();
        }
        cardContainer.appendChild(headingEl);
      }

      if (description) {
        const descEl = document.createElement('p');
        descEl.textContent = description.textContent.trim();
        cardContainer.appendChild(descEl);
      }

      contentElements.push(cardContainer);
    });

    // If no cards found, use the pane content directly
    if (contentElements.length === 0) {
      cells.push([label, pane]);
    } else {
      // Create a wrapper for all card content in this tab
      const contentWrapper = document.createElement('div');
      contentElements.forEach((el) => contentWrapper.appendChild(el));
      cells.push([label, contentWrapper]);
    }
  });

  const block = WebImporter.Blocks.createBlock(document, { name: 'tabs-activity', cells });
  element.replaceWith(block);
}
