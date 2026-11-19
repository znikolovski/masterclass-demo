/*
 * Get Shop Product — dedicated LLM app widget for the `get-shop-product` tool.
 * One WKND product in detail: description, live option availability (options the shopper already
 * named are preselected), the exact variant when fully chosen, and Add to cart through the
 * `add-shop-cart-items` tool.
 * Widget page: /eds-widgets/get-shop-product-demo (placeholder cell, as for the other tools).
 * An optional H2 replaces the default title ("WKND gear").
 */
import {
  el, alertBox, money, productCard, followUpButton, connectWidget, isPreview,
} from '../../scripts/llmapp-shop.js';

function variantLine(variant, missing) {
  if (variant) {
    const price = typeof variant.price?.min === 'number'
      ? money({ value: variant.price.min, currency: variant.price.currency }) : 'price unavailable';
    return el('p', 'shop-widget-banner is-info', `${variant.name}: ${price}, ${variant.in_stock ? 'in stock' : 'sold out'}.`);
  }
  if (missing?.length) return el('p', 'shop-widget-muted', `Choose ${missing.join(' and ')} to add it to your cart.`);
  return null;
}

function render(block, title, data, bridge, preview) {
  const header = el('div', 'shop-widget-header');
  header.append(title, followUpButton(bridge, 'View my cart', 'Show my WKND cart'));
  const nodes = [header];
  const product = Array.isArray(data?.products) ? data.products.find((p) => p && p.sku) : null;
  if (data?.error || !product) {
    nodes.push(alertBox(data?.error?.message || 'This WKND product is unavailable.'));
  } else {
    const variant = variantLine(data.selected_variant, data.missing_options);
    if (variant) nodes.push(variant);
    const selected = data.selected_options && typeof data.selected_options === 'object' ? data.selected_options : {};
    nodes.push(productCard(product, bridge, { preview, detail: true, selected }));
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
    const { SAMPLE_PRODUCT } = await import('../../scripts/llmapp-shop-samples.js');
    render(block, title, SAMPLE_PRODUCT, bridge, true);
    return;
  }
  connectWidget(block, bridge, {
    title,
    loadingText: 'Loading product…',
    timeoutMessage: 'This WKND product is unavailable right now. Please ask again.',
    render: (data) => render(block, title, data, bridge, false),
  });
}
