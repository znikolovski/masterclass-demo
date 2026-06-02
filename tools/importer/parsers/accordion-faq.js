/* eslint-disable */
/* global WebImporter */

/**
 * Parser for accordion-faq
 * Base block: accordion
 * Source: https://wknd-adventures.com/
 * Selector: .faq-list
 * Generated: 2026-05-27
 *
 * Source structure:
 *   .faq-list
 *     .faq-item (multiple)
 *       button.faq-question > span (question text) + span.faq-icon
 *       .faq-answer (answer text)
 *
 * Target structure (from block library):
 *   | Accordion-faq |                |
 *   | title cell    | content cell   |  (one row per FAQ item)
 */
export default function parse(element, { document }) {
  // Get all FAQ items from the source
  const faqItems = element.querySelectorAll('.faq-item');

  const cells = [];

  faqItems.forEach((item) => {
    // Extract question text from the button span (exclude .faq-icon)
    const questionButton = item.querySelector('.faq-question');
    const questionSpan = questionButton
      ? questionButton.querySelector('span:not(.faq-icon)')
      : null;

    // Extract answer content
    const answerDiv = item.querySelector('.faq-answer');

    // Build the row: [title cell, content cell]
    const titleCell = document.createElement('p');
    titleCell.textContent = questionSpan ? questionSpan.textContent.trim() : '';

    const contentCell = document.createElement('p');
    contentCell.textContent = answerDiv ? answerDiv.textContent.trim() : '';

    cells.push([titleCell, contentCell]);
  });

  const block = WebImporter.Blocks.createBlock(document, { name: 'accordion-faq', cells });
  element.replaceWith(block);
}
