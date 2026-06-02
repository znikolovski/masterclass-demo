/* eslint-disable */
/* global WebImporter */

/**
 * Parser for cards-steps variant.
 * Base block: cards
 * Source: https://wknd-adventures.com/
 * Selector: .editorial-index
 *
 * Source structure:
 *   .editorial-index
 *     .editorial-index-item
 *       span.editorial-index-number (e.g. "01", "02", "03")
 *       div
 *         h3.h4-heading (step title)
 *         p.paragraph-lg (step description)
 *
 * Target: Each item becomes a row with [number, heading+description]
 */
export default function parse(element, { document }) {
  const items = element.querySelectorAll('.editorial-index-item');
  const cells = [];

  items.forEach((item) => {
    // Extract step number
    const numberEl = item.querySelector('.editorial-index-number, span[class*="number"]');

    // Extract content container (heading + description)
    const heading = item.querySelector('h3, h2, h4, [class*="heading"]');
    const description = item.querySelector('p, [class*="paragraph"]');

    // Build cell 1: the step number
    const numberCell = [];
    if (numberEl) {
      const numText = document.createElement('p');
      numText.textContent = numberEl.textContent.trim();
      numberCell.push(numText);
    }

    // Build cell 2: heading + description
    const contentCell = [];
    if (heading) contentCell.push(heading);
    if (description) contentCell.push(description);

    cells.push([numberCell, contentCell]);
  });

  const block = WebImporter.Blocks.createBlock(document, { name: 'cards-steps', cells });
  element.replaceWith(block);
}
