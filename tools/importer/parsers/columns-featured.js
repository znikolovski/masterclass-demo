/* eslint-disable */
/* global WebImporter */

/**
 * Parser: columns-featured
 * Base block: columns
 * Source: https://wknd-adventures.com/
 * Selector: .featured-article
 * Generated: 2026-05-27
 *
 * Extracts a featured article layout with image on the left and
 * text content (tag, heading, description, CTA) on the right,
 * mapped to a two-column Columns block.
 */
export default function parse(element, { document }) {
  // Column 1: Featured image
  const image = element.querySelector('.featured-article-image img, img');

  // Column 2: Text content
  const tag = element.querySelector('.tag, p:first-child');
  const heading = element.querySelector('.h2-heading, h2, h3');
  const description = element.querySelector('.paragraph-lg, p.paragraph-lg, p:not(.tag):not(:first-child)');
  const ctaLink = element.querySelector('.featured-article-footer a, a.button, a[href]');

  // Build left column cell (image)
  const leftCell = [];
  if (image) leftCell.push(image);

  // Build right column cell (tag + heading + description + CTA)
  const rightCell = [];
  if (tag) rightCell.push(tag);
  if (heading) rightCell.push(heading);
  if (description) rightCell.push(description);
  if (ctaLink) rightCell.push(ctaLink);

  // Single row with two columns matching the Columns block structure
  const cells = [
    [leftCell, rightCell],
  ];

  const block = WebImporter.Blocks.createBlock(document, { name: 'columns-featured', cells });
  element.replaceWith(block);
}
