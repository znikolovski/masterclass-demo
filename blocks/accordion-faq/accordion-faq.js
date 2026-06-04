/*
 * Accordion Block
 * Recreate an accordion
 * https://www.hlx.live/developer/block-collection/accordion
 */

import { pushInteractionEvent } from '../../scripts/analytics-acdl.js';

const FAQ_LABEL_MAX = 100;

/**
 * @param {Element} cell
 * @returns {string}
 */
function extractCellText(cell) {
  if (!cell) return '';
  const heading = cell.querySelector('h2, h3, h4, h5, h6');
  if (heading?.textContent?.trim()) return heading.textContent.trim();
  const paragraph = cell.querySelector('p');
  if (paragraph?.textContent?.trim()) return paragraph.textContent.trim();
  return cell.textContent?.trim() || '';
}

/**
 * @param {Element} bodyCell
 * @returns {string}
 */
function fallbackLabelFromBody(bodyCell) {
  const text = extractCellText(bodyCell);
  if (!text) return '';
  const sentence = text.match(/^[^.!?]+[.!?]?/)?.[0]?.trim() || text;
  return sentence.slice(0, FAQ_LABEL_MAX);
}

/**
 * @param {Element} labelCell
 * @param {Element} bodyCell
 * @param {number} index
 * @returns {string}
 */
function getFaqItemLabel(labelCell, bodyCell, index) {
  const fromLabel = extractCellText(labelCell);
  if (fromLabel) return fromLabel.slice(0, FAQ_LABEL_MAX);
  const fromBody = fallbackLabelFromBody(bodyCell);
  if (fromBody) return fromBody;
  return `FAQ ${index + 1}`;
}

export default function decorate(block) {
  [...block.children].forEach((row, index) => {
    const label = row.children[0];
    const body = row.children[1];
    const faqLabel = getFaqItemLabel(label, body, index);

    const summary = document.createElement('summary');
    summary.className = 'accordion-faq-item-label';
    summary.append(...label.childNodes);
    if (!extractCellText(summary)) {
      summary.textContent = faqLabel;
    }

    body.className = 'accordion-faq-item-body';

    const details = document.createElement('details');
    details.className = 'accordion-faq-item';
    details.dataset.analyticsLabel = faqLabel;
    details.append(summary, body);

    details.addEventListener('toggle', () => {
      if (!details.open) return;
      pushInteractionEvent('faqExpand', {
        block: 'accordion-faq',
        label: details.dataset.analyticsLabel || getFaqItemLabel(summary, body, index),
        detail: '',
      });
    });
    row.replaceWith(details);
  });
}
