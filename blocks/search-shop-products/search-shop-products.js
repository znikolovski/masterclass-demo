/*
 * Search Shop Products — dedicated LLM app widget for the `search-shop-products` tool.
 * Renders live WKND catalog results as a carousel; shoppers pick options and add items to their
 * signed-in WKND cart (the same cart as the website) through the `add-shop-cart-items` tool.
 * Widget page: /eds-widgets/search-shop-products-demo (placeholder cell, as for the other tools).
 * An optional H2 replaces the default title ("WKND gear").
 */
import {
  el, alertBox, productCard, followUpButton, connectWidget, isPreview,
} from '../../scripts/llmapp-shop.js';

/** Navigation arrow for the results carousel (scrolls by one card). */
function navButton(direction, label) {
  const node = el('button', `shop-carousel-nav shop-carousel-${direction}`, direction === 'prev' ? '◀' : '▶');
  node.type = 'button';
  node.setAttribute('aria-label', label);
  return node;
}

/** Horizontal, scroll-snapping carousel of product cards (1, 2 or 3 per view by widget width). */
function carousel(products, bridge, preview, resized) {
  const root = el('div', 'shop-carousel');
  root.setAttribute('role', 'region');
  root.setAttribute('aria-roledescription', 'carousel');
  root.setAttribute('aria-label', 'WKND gear results');
  const track = el('div', 'shop-carousel-track');
  track.tabIndex = 0;
  track.setAttribute('aria-label', 'Results — scroll for more');
  products.forEach((product, i) => {
    const card = productCard(product, bridge, { preview });
    card.setAttribute('aria-roledescription', 'slide');
    card.setAttribute('aria-label', `${i + 1} of ${products.length}: ${product.name}`);
    track.append(card);
  });
  const fade = el('div', 'shop-carousel-fade');
  const prev = navButton('prev', 'Previous products');
  const next = navButton('next', 'More products');
  const step = () => {
    const card = track.querySelector('.shop-product-card');
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    return card ? card.getBoundingClientRect().width + gap : track.clientWidth;
  };
  prev.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
  next.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));
  const update = () => {
    // centre the arrows on the product images rather than the (taller) cards
    const image = track.querySelector('.shop-product-media');
    if (image) root.style.setProperty('--shop-carousel-nav-top', `${image.offsetHeight / 2 + 4}px`);
    const end = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
    prev.hidden = track.scrollLeft <= 2;
    next.hidden = end;
    fade.hidden = end;
  };
  track.addEventListener('scroll', update, { passive: true });
  new ResizeObserver(() => {
    update();
    resized?.();
  }).observe(track);
  requestAnimationFrame(update);
  root.append(track, fade, prev, next);
  return root;
}

function render(block, title, data, bridge, preview, resized) {
  const header = el('div', 'shop-widget-header');
  header.append(title, followUpButton(bridge, 'View my cart', 'Show my WKND cart'));
  const nodes = [header];
  if (data?.error) {
    nodes.push(alertBox(data.error.message || 'The WKND shop is unavailable.'));
  } else {
    const products = Array.isArray(data?.products) ? data.products.filter((p) => p && p.sku) : [];
    if (data?.query) nodes.push(el('p', 'shop-widget-muted', `Results for “${data.query}”`));
    if (products.length) {
      nodes.push(carousel(products, bridge, preview, resized));
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
  const resized = connectWidget(block, bridge, {
    title,
    loadingText: 'Loading WKND gear…',
    timeoutMessage: 'WKND gear is unavailable right now. Please ask again.',
    render: (data) => render(block, title, data, bridge, false, () => resized()),
  });
}
