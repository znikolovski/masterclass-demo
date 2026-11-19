/*
 * Search Shop Products — dedicated LLM app widget for the `search-shop-products` tool.
 * Renders live WKND catalog results; shoppers pick options and add items to their signed-in WKND
 * cart (the same cart as the website) through the `add-shop-cart-items` tool.
 * Widget page: /eds-widgets/search-shop-products-demo (placeholder cell, as for the other tools).
 * An optional H2 replaces the default title ("WKND gear").
 */
import {
  el, alertBox, productCard, followUpButton, connectWidget, isPreview,
} from '../../scripts/llmapp-shop.js';

function render(block, title, data, bridge, preview) {
  const header = el('div', 'shop-widget-header');
  header.append(title, followUpButton(bridge, 'View my cart', 'Show my WKND cart'));
  const nodes = [header];
  if (data?.error) {
    nodes.push(alertBox(data.error.message || 'The WKND shop is unavailable.'));
  } else {
    const products = Array.isArray(data?.products) ? data.products.filter((p) => p && p.sku) : [];
    if (data?.query) nodes.push(el('p', 'shop-widget-muted', `Results for “${data.query}”`));
    if (products.length) {
      const grid = el('div', 'shop-product-grid');
      products.forEach((p) => grid.append(productCard(p, bridge, { preview })));
      nodes.push(grid);
    } else {
      nodes.push(el('p', undefined, 'No WKND gear matched. Try a broader search.'));
    }
  }
  nodes.push(el('p', 'shop-widget-note', 'Prices in AUD incl. GST. WKND demo store — nothing is charged or shipped.'));
  block.replaceChildren(...nodes);
}

/**
 * @param {Element} block
 * @param {object} [bridge] LLM Apps SDK bridge (scripts/llmapps-sdk.js)
 */
export default async function decorate(block, bridge) {
  block.classList.add('shop-widget');
  const title = block.querySelector('h2') || el('h2', undefined, 'WKND gear');
  if (isPreview(bridge)) {
    const { SAMPLE_PRODUCTS } = await import('../../scripts/llmapp-shop-samples.js');
    render(block, title, SAMPLE_PRODUCTS, bridge, true);
    return;
  }
  connectWidget(block, bridge, {
    title,
    loadingText: 'Loading WKND gear…',
    timeoutMessage: 'WKND gear is unavailable right now. Please ask again.',
    render: (data) => render(block, title, data, bridge, false),
  });
}
