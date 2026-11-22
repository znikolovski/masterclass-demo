/*
 * Get Shop Cart — dedicated LLM app widget for the `get-shop-cart` tool.
 * The signed-in shopper's WKND cart (the same cart as the website). Quantity changes and removals
 * use the `update-shop-cart-items` tool; "Apply this offer" (welcome-back offer, when the shop
 * reports one) uses `prepare-shop-checkout` with `apply_offer`; "Check out" continues the
 * conversation so the assistant opens the dedicated `prepare-shop-checkout` widget.
 * Widget page: /eds-widgets/get-shop-cart-demo (placeholder cell, as for the other tools).
 * An optional H2 replaces the default title ("Your WKND cart").
 */
import {
  el, button, alertBox, cartLines, totalsList, offerCard, followUpButton, connectWidget, isPreview,
  callShopTool, openSiteLink, busyRunner, SITE_ORIGIN,
} from '../../scripts/llmapp-shop.js';

/**
 * @param {Element} block
 * @param {object} [bridge] LLM Apps SDK bridge (scripts/llmapps-sdk.js)
 */
export default async function decorate(block, bridge) {
  block.classList.add('shop-widget');
  const title = block.querySelector('h2') || el('h2', undefined, 'Your WKND cart');
  title.tabIndex = -1;
  const preview = isPreview(bridge);
  const run = busyRunner(block);
  let resized = () => {};
  let current = null;
  let render;

  const setQuantity = (line, quantity) => run(async () => {
    if (preview) {
      render({ ...current, error: { message: 'Preview only — open this in ChatGPT and sign in to manage your WKND cart.' } }, true);
      return;
    }
    try {
      const data = await callShopTool(bridge, 'update-shop-cart-items', {
        line_id: line.line_id, quantity, cart_version: current.cart.version,
      });
      render(data.cart ? data : { ...current, error: data.error }, true);
    } catch (error) {
      render({ ...current, error: { message: error?.message || 'Could not update your cart.' } }, true);
    }
  });

  // The shop claims the offer and applies it server-side; the result is the updated cart.
  const applyOffer = () => run(async () => {
    if (preview) {
      render({ ...current, error: { message: 'Preview only — open this in ChatGPT and sign in to use your offer.' } }, true);
      return;
    }
    try {
      const data = await callShopTool(bridge, 'prepare-shop-checkout', { cart_version: current.cart.version, apply_offer: true });
      render(data.cart ? data : { ...current, error: data.error }, true);
    } catch (error) {
      render({ ...current, error: { message: error?.message || 'We couldn’t apply this offer. Please try again.' } }, true);
    }
  });

  render = (data, fromUser) => {
    const nodes = [title];
    if (!data?.cart || !Array.isArray(data.cart.lines)) {
      nodes.push(alertBox(data?.error?.message || 'Your WKND cart is unavailable. Sign in and try again.'));
    } else {
      const { cart } = data;
      if (data.error?.message) nodes.push(alertBox(data.error.message));
      if (data.message) nodes.push(alertBox(data.message, 'info'));
      (data.warnings || []).filter((w) => w && w !== data.message).forEach((w) => nodes.push(alertBox(w, 'info')));
      if (!cart.lines.length) {
        nodes.push(
          el('p', undefined, 'Your WKND cart is empty.'),
          followUpButton(bridge, 'Browse WKND gear', 'Show me WKND adventure gear', 'primary'),
        );
      } else {
        nodes.push(
          el('p', 'shop-widget-muted', `${cart.item_count} item${cart.item_count === 1 ? '' : 's'}`),
          cartLines(cart, { onQuantity: setQuantity }),
        );
        const offer = offerCard(data.offer, { onApply: applyOffer });
        if (offer) nodes.push(offer);
        nodes.push(totalsList(cart.totals));
        if (cart.offer_applied) nodes.push(el('p', 'shop-widget-muted', 'Welcome-back offer applied.'));
        const actions = el('div', 'shop-widget-actions');
        const site = button('Open on WKND', 'secondary');
        site.addEventListener('click', () => openSiteLink(bridge, `${SITE_ORIGIN}/shop/cart`).catch(() => {
          render({ ...current, error: { message: 'Unable to open WKND. Please try again.' } });
        }));
        actions.append(followUpButton(bridge, 'Check out', 'Check out my WKND cart', 'primary'), site);
        nodes.push(actions);
      }
      nodes.push(el('p', 'shop-widget-note', 'This is the same cart you see when signed in on the WKND website.'));
      current = {
        ...data, error: undefined, message: undefined, warnings: [],
      };
    }
    block.replaceChildren(...nodes);
    if (fromUser) title.focus({ preventScroll: true });
    resized();
  };

  if (preview) {
    const { SAMPLE_CART } = await import('../../scripts/llmapp-shop-samples.js');
    render(SAMPLE_CART);
    return;
  }
  resized = connectWidget(block, bridge, {
    title,
    loadingText: 'Loading your WKND cart…',
    timeoutMessage: 'Your WKND cart is unavailable. Sign in and ask again.',
    render: (data) => render(data),
  });
}
