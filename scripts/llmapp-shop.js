/*
 * Shared rendering for the WKND shop LLM app widgets. Each shop tool with a UI has its own
 * dedicated EDS block (search-shop-products, get-shop-product, get-shop-cart,
 * prepare-shop-checkout) that composes these pieces. Tool data is rendered with DOM APIs only —
 * never parsed as HTML.
 */

export const SITE_ORIGIN = 'https://wknd-adventures.run.place';
export const DEMO_NOTICE = 'WKND Demo Pay — demonstration only. No payment is taken and nothing ships.';

/**
 * @param {string} tag
 * @param {string} [className]
 * @param {string|number} [text]
 * @returns {HTMLElement}
 */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

/** A widget CTA styled by styles/llmapp-widgets.css. */
export function button(text, variant = 'primary') {
  const node = el('button', `shop-widget-btn shop-widget-btn-${variant}`, text);
  node.type = 'button';
  return node;
}

/** An underlined text button. */
export function linkButton(text) {
  const node = el('button', 'shop-widget-link', text);
  node.type = 'button';
  return node;
}

/** @param {{ value: number, currency?: string }} amount */
export function money(amount) {
  if (!amount || typeof amount.value !== 'number' || !Number.isFinite(amount.value)) return '—';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: amount.currency || 'AUD' }).format(amount.value);
}

/** @param {string} message @param {'error'|'info'} [kind] */
export function alertBox(message, kind = 'error') {
  const box = el('p', `shop-widget-banner is-${kind}`, message);
  box.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  return box;
}

/** HTTPS image from the shop (Dynamic Media or the WKND site), or a neutral placeholder. */
export function productImage(src, alt, className) {
  let url;
  try {
    url = new URL(src);
  } catch {
    url = null;
  }
  if (!url || url.protocol !== 'https:') {
    const placeholder = el('div', `${className} shop-widget-placeholder`);
    placeholder.setAttribute('aria-hidden', 'true');
    return placeholder;
  }
  const img = el('img', className);
  img.src = url.href;
  img.alt = alt || '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.addEventListener('error', () => img.replaceWith(productImage(null, '', className)), { once: true });
  return img;
}

/** structuredContent from a tool result, a tools/call response or a bare payload. */
export function toolData(output) {
  if (!output || typeof output !== 'object') return null;
  const data = output.structuredContent || output;
  if (output.isError && !data.error) return { view: 'error', error: { message: 'The WKND shop could not complete that request.' } };
  return data;
}

/**
 * Calls a shop tool. Tools are kebab-case locally and may be snake_case in the LLM Apps UI.
 * @returns {Promise<object>} structuredContent
 */
export async function callShopTool(bridge, name, args) {
  if (!bridge?.callTool) throw new Error('Open this in ChatGPT or Claude to use your WKND cart.');
  let output;
  try {
    output = await bridge.callTool(name, args);
  } catch (error) {
    if (!/not found|unknown tool/i.test(String(error?.message))) throw error;
    output = await bridge.callTool(name.replace(/-/g, '_'), args);
  }
  const data = toolData(output);
  if (!data) throw new Error('No response from the WKND shop. Please try again.');
  return data;
}

/** Opens an HTTPS WKND link through the host (ChatGPT/Claude), falling back to a new tab. */
export async function openSiteLink(bridge, href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return;
  }
  if (url.protocol !== 'https:' || url.origin !== SITE_ORIGIN) return;
  if (bridge?.openLink) {
    const response = await bridge.openLink(url.href);
    if (response?.isError || response?.error) throw new Error('The host could not open the link.');
  } else if (!window.open(url.href, '_blank', 'noopener')) {
    throw new Error('The browser blocked the link.');
  }
}

/** True outside a real host (page previews, tools/widget-preview.html). */
export function isPreview(bridge) {
  return !bridge?.isEmbedded || bridge.hostContext?.preview === true;
}

/**
 * A button that continues in the conversation (e.g. "Show my WKND cart"), so the assistant runs
 * the tool whose dedicated widget handles that step. Disabled in previews.
 */
export function followUpButton(bridge, label, prompt, variant = 'secondary') {
  const node = button(label, variant);
  node.disabled = !bridge?.sendMessage || isPreview(bridge);
  node.addEventListener('click', () => bridge.sendMessage(prompt));
  return node;
}

/**
 * Keeps the host iframe sized to the widget. Returns `resized()`, to call after each render:
 * a ResizeObserver alone can miss growth that happens while the embed body is still hidden.
 */
export function trackSize(block, bridge) {
  if (!bridge?.reportSize) return () => {};
  let last = '';
  const report = () => {
    const width = Math.ceil(block.offsetWidth);
    const height = Math.ceil(block.offsetHeight);
    if (!height || `${width}x${height}` === last) return;
    last = `${width}x${height}`;
    bridge.reportSize(width, height);
  };
  let timer;
  new ResizeObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(report, 120);
  }).observe(block);
  return () => {
    requestAnimationFrame(report);
    setTimeout(report, 250);
  };
}

/**
 * Wires a widget block to its host: loading state, the initial and later tool results,
 * cancellation, a timeout and iframe sizing. `render(data)` receives structuredContent.
 * @returns {() => void} resized — call after re-rendering from user actions
 */
export function connectWidget(block, bridge, {
  title, loadingText, timeoutMessage, render,
}) {
  bridge.applyHostStyles?.(block);
  const loading = el('p', 'shop-widget-muted', loadingText);
  loading.setAttribute('role', 'status');
  block.replaceChildren(title, loading);
  const resized = trackSize(block, bridge);
  const receive = (output) => {
    const data = toolData(output);
    if (!data) return;
    render(data);
    resized();
  };
  bridge.onToolResult?.(receive);
  // Outlasts the tool's own Commerce wait (28 s for a cold backend) so a slow first call renders.
  const timer = setTimeout(() => receive({ view: 'error', error: { message: timeoutMessage } }), 35000);
  bridge.toolResult.then((output) => {
    clearTimeout(timer);
    receive(output);
  });
  bridge.toolCancelled?.then(() => {
    clearTimeout(timer);
    receive({ view: 'error', error: { message: 'Cancelled.' } });
  });
  return resized;
}

/**
 * Serialises user-initiated tool calls for a widget and disables its controls meanwhile.
 * @returns {(work: () => Promise<void>) => Promise<void>}
 */
export function busyRunner(block) {
  let busy = false;
  return async (work) => {
    if (busy) return;
    busy = true;
    block.setAttribute('aria-busy', 'true');
    const controls = [...block.querySelectorAll('button, input, select')].filter((c) => !c.disabled);
    controls.forEach((c) => { c.disabled = true; });
    try {
      await work();
    } finally {
      busy = false;
      block.setAttribute('aria-busy', 'false');
      controls.filter((c) => c.isConnected).forEach((c) => { c.disabled = false; });
    }
  };
}

/* ---------------- products ---------------- */

function priceLine(product) {
  const { price } = product;
  const line = el('p', 'shop-widget-price');
  if (typeof price?.min !== 'number') {
    line.textContent = 'Price unavailable';
    return line;
  }
  const ranged = typeof price.max === 'number' && price.max !== price.min;
  line.append(`${ranged ? 'From ' : ''}${money({ value: price.min, currency: price.currency })}`);
  if (typeof price.regular === 'number' && price.regular > price.min) {
    const was = el('s', 'shop-widget-was', money({ value: price.regular, currency: price.currency }));
    was.setAttribute('aria-label', `was ${was.textContent}`);
    line.append(' ', was);
  }
  return line;
}

function optionPicker(option, selected, onChange) {
  const group = el('fieldset', 'shop-product-option');
  group.append(el('legend', undefined, option.title));
  const values = el('div', 'shop-product-values');
  const buttons = (option.values || []).map((value) => {
    const choice = el('button', `shop-product-value${value.in_stock ? '' : ' is-sold-out'}`);
    choice.type = 'button';
    choice.dataset.optionId = option.id;
    choice.dataset.valueId = value.id;
    choice.setAttribute('aria-pressed', String(selected[option.id] === value.id && value.in_stock));
    choice.setAttribute('aria-label', `${option.title} ${value.title}${value.in_stock ? '' : ', sold out'}`);
    choice.disabled = !value.in_stock;
    if (/^#[0-9a-f]{3,8}$/i.test(value.swatch || '')) {
      const swatch = el('span', 'shop-product-swatch');
      swatch.style.background = value.swatch;
      swatch.setAttribute('aria-hidden', 'true');
      choice.append(swatch);
    }
    choice.append(value.title);
    choice.addEventListener('click', () => {
      selected[option.id] = value.id;
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === choice)));
      onChange();
    });
    return choice;
  });
  values.append(...buttons);
  group.append(values);
  return group;
}

/**
 * A product with option pickers and Add to cart (via the `add-shop-cart-items` tool).
 * @param {object} product normalized product from the shop tools
 * @param {object} bridge
 * @param {{ preview?: boolean, detail?: boolean, selected?: object }} [opts]
 *   `selected` preselects option values ({ optionId: valueId })
 */
export function productCard(product, bridge, {
  preview = false, detail = false, selected: initial = {},
} = {}) {
  const card = el('article', `shop-product-card${detail ? ' is-detail' : ''}`);
  const selected = { ...initial };
  const status = el('p', 'shop-widget-status');
  status.setAttribute('role', 'status');
  const add = button(product.in_stock ? 'Add to cart' : 'Sold out');

  // A colour/size combination can be sold out while each value is in stock (`sold_out` lists them).
  const options = product.options || [];
  const soldOut = (choice) => {
    const ids = options.map((o) => choice[o.id]);
    return ids.every(Boolean) && (product.sold_out || []).some((combo) => (
      combo.length === ids.length && combo.every((id) => ids.includes(id))));
  };
  const ready = () => product.in_stock && !soldOut(selected) && options.every((o) => (
    (o.values || []).some((v) => v.id === selected[o.id] && v.in_stock)));
  const syncAvailability = () => card.querySelectorAll('.shop-product-value').forEach((choice) => {
    const { optionId, valueId } = choice.dataset;
    const option = options.find((o) => o.id === optionId);
    const value = option?.values.find((v) => v.id === valueId);
    if (!value) return;
    const unavailable = !value.in_stock || soldOut({ ...selected, [optionId]: valueId });
    choice.disabled = unavailable;
    choice.classList.toggle('is-sold-out', unavailable);
    choice.setAttribute('aria-label', `${option.title} ${value.title}${unavailable ? ', sold out' : ''}`);
  });
  const refresh = () => {
    syncAvailability();
    add.disabled = !ready();
    if (soldOut(selected) && !status.textContent) {
      status.textContent = 'That combination is sold out — choose another option.';
    }
  };

  const media = el('div', 'shop-product-media');
  media.append(productImage(product.image, product.image_alt || product.name, 'shop-product-image'));
  const body = el('div', 'shop-product-body');
  const eyebrow = product.in_stock ? (product.attributes?.activity?.value || 'WKND gear') : 'Sold out';
  body.append(el('span', `shop-product-eyebrow${product.in_stock ? '' : ' is-sold-out'}`, eyebrow));
  body.append(el('h3', undefined, product.name));
  const facts = [product.attributes?.material?.value,
    product.attributes?.weight_g ? `${product.attributes.weight_g.value} g` : null].filter(Boolean);
  if (facts.length) body.append(el('p', 'shop-widget-muted', facts.join(' · ')));
  if (detail && product.description) body.append(el('p', 'shop-product-description', product.description));
  body.append(priceLine(product));
  (product.options || []).forEach((option) => body.append(optionPicker(option, selected, () => {
    status.textContent = '';
    refresh();
  })));

  add.addEventListener('click', async () => {
    add.disabled = true;
    status.classList.remove('is-error');
    if (preview) {
      status.textContent = 'Preview only — open this in ChatGPT and sign in to add to your WKND cart.';
      refresh();
      return;
    }
    status.textContent = 'Adding to your WKND cart…';
    try {
      const data = await callShopTool(bridge, 'add-shop-cart-items', {
        sku: product.sku, quantity: 1, options: { ...selected },
      });
      if (data.error) throw new Error(data.error.message);
      const count = data.cart?.item_count;
      status.textContent = typeof count === 'number'
        ? `Added. Your cart now has ${count} item${count === 1 ? '' : 's'}.` : 'Added to your cart.';
    } catch (error) {
      status.classList.add('is-error');
      status.textContent = error?.message || 'Could not add this item. Please try again.';
    } finally {
      refresh();
    }
  });
  refresh();

  const actions = el('div', 'shop-widget-actions');
  actions.append(add);
  if (product.url) {
    const view = button('View on WKND', 'secondary');
    view.addEventListener('click', () => openSiteLink(bridge, product.url).catch(() => {
      status.classList.add('is-error');
      status.textContent = 'Unable to open WKND. Please try again.';
    }));
    actions.append(view);
  }
  body.append(actions, status);
  card.append(media, body);
  return card;
}

/* ---------------- cart ---------------- */

/** Subtotal, discounts, shipping, total and included GST. */
export function totalsList(t) {
  const list = el('dl', 'shop-widget-totals');
  const row = (label, value, className) => list.append(el('dt', className, label), el('dd', className, value));
  row('Subtotal', money(t.subtotal));
  (t.discounts || []).forEach((d) => row(d.label || 'Discount', `−${money(d.amount)}`));
  row('Shipping', t.shipping ? money(t.shipping) : 'Calculated at checkout');
  row('Total', money(t.grand_total), 'shop-widget-grand');
  (t.tax_included || []).forEach((x) => row(`Includes ${x.label}`, money(x.amount), 'shop-widget-tax'));
  return list;
}

/**
 * Cart lines; with `onQuantity(line, quantity)` each line gets −/+/Remove controls.
 * @param {object} cart normalized cart from the shop tools
 * @param {{ onQuantity?: Function }} [opts]
 */
export function cartLines(cart, { onQuantity } = {}) {
  const list = el('ul', 'shop-cart-lines');
  cart.lines.forEach((item) => {
    const label = `${item.name}${item.options?.length ? ` (${item.options.map((o) => o.value).join(', ')})` : ''}`;
    const row = el('li', 'shop-cart-line');
    row.append(productImage(item.image, '', 'shop-cart-thumb'));
    const body = el('div', 'shop-cart-line-body');
    const head = el('div', 'shop-widget-row');
    head.append(el('h3', undefined, item.name), el('span', 'shop-widget-amount', money(item.row_total)));
    body.append(head);
    if (item.options?.length) body.append(el('p', 'shop-widget-muted', item.options.map((o) => `${o.label}: ${o.value}`).join(' · ')));
    body.append(el('p', 'shop-widget-muted', `${money(item.unit_price)} each`));
    if (item.available === false) body.append(el('p', 'shop-cart-unavailable', item.message || 'Unavailable in this quantity'));
    if (onQuantity) {
      const controls = el('div', 'shop-cart-qty');
      controls.setAttribute('role', 'group');
      controls.setAttribute('aria-label', `Quantity of ${label}`);
      const less = el('button', 'shop-cart-step', '−');
      less.type = 'button';
      less.setAttribute('aria-label', `Decrease quantity of ${label}`);
      less.addEventListener('click', () => onQuantity(item, item.quantity - 1));
      const more = el('button', 'shop-cart-step', '+');
      more.type = 'button';
      more.setAttribute('aria-label', `Increase quantity of ${label}`);
      more.disabled = item.quantity >= 20;
      more.addEventListener('click', () => onQuantity(item, item.quantity + 1));
      const remove = linkButton('Remove');
      remove.setAttribute('aria-label', `Remove ${label}`);
      remove.addEventListener('click', () => onQuantity(item, 0));
      controls.append(less, el('span', 'shop-cart-count', item.quantity), more, remove);
      body.append(controls);
    } else {
      body.append(el('p', 'shop-widget-muted', `Qty ${item.quantity}`));
    }
    row.append(body);
    list.append(row);
  });
  return list;
}
