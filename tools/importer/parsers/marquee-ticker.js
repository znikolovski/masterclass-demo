/* eslint-disable */
/* global WebImporter */

/**
 * Parser for marquee-ticker
 * Base block: marquee
 * Source: https://wknd-adventures.com/
 * Generated: 2026-05-27
 *
 * Extracts unique category text items from the ticker strip.
 * Source structure: .ticker-strip > .ticker-track > span (text items)
 * separated by span.ticker-sep (dot separators).
 * Items are duplicated in source for seamless CSS animation loop;
 * parser deduplicates to produce one row per unique category.
 */
export default function parse(element, { document }) {
  // Select all span elements inside the ticker track that are NOT separators
  const track = element.querySelector('.ticker-track');
  const allItems = track
    ? Array.from(track.querySelectorAll('span:not(.ticker-sep)'))
    : Array.from(element.querySelectorAll('span:not(.ticker-sep)'));

  // Extract unique text items (source duplicates items for CSS animation loop)
  const seen = new Set();
  const uniqueItems = [];
  allItems.forEach((span) => {
    const text = span.textContent.trim();
    if (text && !seen.has(text)) {
      seen.add(text);
      uniqueItems.push(text);
    }
  });

  // Build cells: one row per category item
  const cells = uniqueItems.map((item) => [item]);

  const block = WebImporter.Blocks.createBlock(document, { name: 'marquee-ticker', cells });
  element.replaceWith(block);
}
