/* eslint-disable */
/* global WebImporter */

/**
 * Parser: columns-gallery
 * Base block: columns
 * Source: https://wknd-adventures.com/
 * Selector: .grid-images
 * Generated: 2026-05-27
 *
 * Extracts a grid of gallery images (typically 3 in a row) and maps each
 * image to its own column cell in a single-row Columns block.
 */
export default function parse(element, { document }) {
  // Extract all gallery images from the grid container
  const images = Array.from(element.querySelectorAll('img.gallery-img, img'));

  // Build a single row with one cell per image (each image is its own column)
  const row = images.map((img) => [img]);

  // cells is an array of rows; each row is an array of cells
  // For a 3-column layout: [[img1], [img2], [img3]] represents one row with 3 columns
  const cells = [row];

  const block = WebImporter.Blocks.createBlock(document, { name: 'columns-gallery', cells });
  element.replaceWith(block);
}
