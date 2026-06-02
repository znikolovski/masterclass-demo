/* eslint-disable */
/* global WebImporter */

/**
 * Parser: hero-adventure
 * Base block: hero
 * Source: https://wknd-adventures.com/
 * Selector: section.hero-section
 * Generated: 2026-05-27
 *
 * Source structure:
 *   section.hero-section
 *     .hero-bg > img (background image)
 *     .hero-content > .hero-content-inner
 *       p.tag (eyebrow text)
 *       h1.h1-heading (main heading)
 *       p.paragraph-xl.hero-lead (description)
 *       .button-group > a.accent-button, a.button--ghost (CTAs)
 *
 * Target structure:
 *   Row 1: background image
 *   Row 2: eyebrow, heading, description, CTA links
 */
export default function parse(element, { document }) {
  // Extract background image
  const bgImage = element.querySelector('.hero-bg img, img[class*="bg"], .hero-section > img');

  // Extract eyebrow/tag text
  const eyebrow = element.querySelector('p.tag, .tag, [class*="eyebrow"]');

  // Extract main heading
  const heading = element.querySelector('h1, h2, [class*="heading"]');

  // Extract description/lead paragraph
  const description = element.querySelector('p.paragraph-xl, p.hero-lead, .hero-lead, p[class*="lead"], .hero-content p:not(.tag)');

  // Extract CTA links
  const ctaLinks = Array.from(element.querySelectorAll('.button-group a, .hero-content a.accent-button, .hero-content a.button--ghost, .hero-content a[class*="button"]'));

  // Extract byline (blog articles: author image + name + date)
  const byline = element.querySelector('.article-byline, .hero-byline, [class*="byline"]');
  const authorImg = byline ? byline.querySelector('img') : null;
  const authorTexts = byline ? byline.querySelectorAll('p, span:not(:has(img))') : [];

  // Build cells array matching hero block structure
  const cells = [];

  // Row 1: Background image
  if (bgImage) {
    cells.push([bgImage]);
  }

  // Row 2: Content cell (eyebrow + heading + description/byline + CTAs)
  const contentCell = [];
  if (eyebrow) contentCell.push(eyebrow);
  if (heading) contentCell.push(heading);
  if (description && !byline) contentCell.push(description);
  if (ctaLinks.length > 0) contentCell.push(...ctaLinks);
  if (byline) {
    if (authorImg) contentCell.push(authorImg);
    authorTexts.forEach((t) => contentCell.push(t));
  }
  if (contentCell.length > 0) {
    cells.push(contentCell);
  }

  const block = WebImporter.Blocks.createBlock(document, { name: 'hero-adventure', cells });
  element.replaceWith(block);
}
