/*
 * Accordion Block
 * Recreate an accordion
 * https://www.hlx.live/developer/block-collection/accordion
 */

import { pushInteractionEvent } from '../../scripts/analytics-acdl.js';

const FAQ_LABEL_MAX = 100;

// Fallback-only path, used when the CDN edge function didn't already rewrite
// the block server-side. Same origin, since edge functions are routed by
// path on the site's own domain (via cdn.yaml), not a separate host.
// See https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/developing/edge-functions
const FAQ_TAG_ENDPOINT = '/faq-accordion';

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

/**
 * A single row with a single cell means the author entered a tag rather than
 * authoring question/answer rows directly.
 * @param {Element} block
 * @returns {boolean}
 */
function isTagMode(block) {
  const rows = [...block.children];
  return rows.length === 1 && rows[0].children.length === 1;
}

/**
 * Wire up analytics tracking on an accordion item that already has finished
 * `details`/`summary` markup (authored manually, or rewritten by the edge
 * function), rather than rebuilding it.
 * @param {Element} details
 * @param {number} index
 */
function bindFaqAnalytics(details, index) {
  const summary = details.querySelector('summary');
  const label = extractCellText(summary) || `FAQ ${index + 1}`;
  details.dataset.analyticsLabel = label;
  details.addEventListener('toggle', () => {
    if (!details.open) return;
    pushInteractionEvent('faqExpand', {
      block: 'accordion-faq',
      label: details.dataset.analyticsLabel,
      detail: '',
    });
  });
}

/**
 * Fallback only: fetch FAQ accordion markup for a tag from the edge function
 * endpoint client-side. This should only run when the CDN edge function did
 * not already rewrite the page (e.g. local dev without the CDN in front, or
 * an edge function failure) and the raw tag div reached the browser as-is.
 * The edge function returns finished `details`/`summary` markup, so no
 * further transformation happens here.
 * @param {Element} block
 * @param {string} tag
 */
async function decorateFromTag(block, tag) {
  block.setAttribute('aria-busy', 'true');
  try {
    const resp = await fetch(`${FAQ_TAG_ENDPOINT}?tag=${encodeURIComponent(tag)}`);
    if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
    block.innerHTML = await resp.text();
    block.querySelectorAll('details').forEach(bindFaqAnalytics);
  } catch (error) {
    console.error(`accordion-faq: failed to load FAQs for tag "${tag}"`, error);
    block.textContent = '';
  } finally {
    block.removeAttribute('aria-busy');
  }
}

export default async function decorate(block) {
  const preRendered = block.querySelector('details');
  if (preRendered) {
    // The CDN edge function already rewrote this block into finished
    // accordion markup (details/summary wrapped in a single div, so the
    // site's block detector still recognizes an all-div block root) before
    // it reached the browser. Nothing to transform.
    block.querySelectorAll('details').forEach(bindFaqAnalytics);
    return;
  }

  if (isTagMode(block)) {
    // The edge function didn't intercept/rewrite this request, so the raw
    // tag div reached the browser unprocessed. Fetch client-side as a
    // fallback so the FAQs still render.
    const tag = extractCellText(block.children[0].children[0]);
    block.textContent = '';
    if (!tag) return;
    await decorateFromTag(block, tag);
    return;
  }

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
