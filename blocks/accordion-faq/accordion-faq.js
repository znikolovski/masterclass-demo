/*
 * Accordion Block
 * Recreate an accordion
 * https://www.hlx.live/developer/block-collection/accordion
 */

import { pushInteractionEvent } from '../../scripts/analytics-acdl.js';

export default function decorate(block) {
  [...block.children].forEach((row) => {
    // decorate accordion item label
    const label = row.children[0];
    const summary = document.createElement('summary');
    summary.className = 'accordion-faq-item-label';
    summary.append(...label.childNodes);
    // decorate accordion item body
    const body = row.children[1];
    body.className = 'accordion-faq-item-body';
    // decorate accordion item
    const details = document.createElement('details');

    details.className = 'accordion-faq-item';
    details.append(summary, body);
    details.addEventListener('toggle', () => {
      if (!details.open) return;
      pushInteractionEvent('faqExpand', {
        block: 'accordion-faq',
        label: summary.textContent.trim(),
        detail: '',
      });
    });
    row.replaceWith(details);
  });
}
