/*
 * Prepare Shop Checkout — dedicated LLM app widget for the `prepare-shop-checkout` tool.
 * Checkout for the signed-in shopper's WKND cart: contact email, a new or saved address, delivery
 * method, coupon and the welcome-back offer (each step re-runs `prepare-shop-checkout`), then an
 * explicit "Place demo order" that calls `place-shop-demo-order` with the reviewed cart version
 * and total, and the receipt. WKND Demo Pay — no payment is taken and nothing ships.
 * Widget page: /eds-widgets/prepare-shop-checkout-demo (placeholder cell, as for the other tools).
 * An optional H2 replaces the default title ("Checkout").
 */
import {
  el, button, linkButton, alertBox, money, cartLines, totalsList, offerCard, followUpButton,
  connectWidget, isPreview, callShopTool, openSiteLink, busyRunner, DEMO_NOTICE,
} from '../../scripts/llmapp-shop.js';

const AU_STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];
const COUNTRIES = [['AU', 'Australia'], ['NZ', 'New Zealand'], ['US', 'United States'], ['GB', 'United Kingdom'], ['CA', 'Canada']];

function field(labelText, control, wide) {
  const wrap = el('div', `shop-checkout-field${wide ? ' is-wide' : ''}`);
  const label = el('label', undefined, labelText);
  control.id = control.id || `shop-checkout-${control.name}-${crypto.randomUUID().slice(0, 8)}`;
  label.htmlFor = control.id;
  wrap.append(label, control);
  return wrap;
}

function input(name, autocomplete, value = '', type = 'text') {
  const node = el('input');
  Object.assign(node, {
    name, type, autocomplete, value, required: true,
  });
  return node;
}

function select(name, options, current) {
  const node = el('select');
  node.name = name;
  options.forEach(([value, text]) => {
    const option = el('option', undefined, text);
    option.value = value;
    option.selected = value === current;
    node.append(option);
  });
  return node;
}

function panel(...children) {
  const section = el('section', 'shop-checkout-panel');
  section.append(...children);
  return section;
}

/**
 * @param {Element} block
 * @param {object} [bridge] LLM Apps SDK bridge (scripts/llmapps-sdk.js)
 */
export default async function decorate(block, bridge) {
  block.classList.add('shop-widget');
  const title = block.querySelector('h2') || el('h2', undefined, 'Checkout');
  title.tabIndex = -1;
  const preview = isPreview(bridge);
  const run = busyRunner(block);
  let resized = () => {};
  let current = null;
  let editing = false;
  let render;

  const call = (tool, args) => run(async () => {
    if (preview) {
      render({ ...current, error: { message: 'Preview only — open this in ChatGPT and sign in to check out.' } }, true);
      return;
    }
    try {
      const data = await callShopTool(bridge, tool, args);
      render(data.cart || data.order ? data : { ...current, error: data.error }, true);
    } catch (error) {
      render({ ...current, error: { message: error?.message || 'The WKND shop could not complete that request.' } }, true);
    }
  });
  const prepare = (args) => call('prepare-shop-checkout', { cart_version: current.cart.version, ...args });

  function messages(data) {
    const list = [];
    if (data.error?.message) list.push(alertBox(data.error.message));
    (data.warnings || []).filter(Boolean).forEach((w) => list.push(alertBox(w, 'info')));
    return list;
  }

  function detailsForm(data) {
    const c = data.cart.checkout;
    const saved = data.saved_addresses || [];
    const prev = c.shipping_address || {};
    const form = el('form', 'shop-checkout-form');
    form.noValidate = true;
    form.append(el('h3', undefined, 'Delivery details'));
    const email = input('email', 'email', c.email || data.account_email || '', 'email');
    form.append(field('Email for order updates', email, true));

    let savedSelect = null;
    if (saved.length) {
      const preferred = saved.find((a) => a.default) || saved[0];
      savedSelect = select('saved', [['', 'Enter a new address'], ...saved.map((a) => [a.id, a.label])], c.shipping_address ? '' : preferred.id);
      form.append(field('Ship to', savedSelect, true));
    }
    const [first, ...rest] = (prev.name || '').split(' ');
    const country = select('country_code', COUNTRIES, prev.country || 'AU');
    const state = select('region', AU_STATES.map((s) => [s, s]), AU_STATES.includes(prev.region) ? prev.region : 'NSW');
    const regionText = input('region_text', 'address-level1', AU_STATES.includes(prev.region) ? '' : (prev.region || ''));
    regionText.required = false;
    const regionField = field('State', state);
    const controls = {
      firstname: input('firstname', 'given-name', first || ''),
      lastname: input('lastname', 'family-name', rest.join(' ')),
      street: input('street', 'street-address', (prev.street || []).join(', ')),
      city: input('city', 'address-level2', prev.city || ''),
      postcode: input('postcode', 'postal-code', prev.postcode || ''),
      telephone: input('telephone', 'tel', prev.telephone || '', 'tel'),
    };
    const manual = el('div', 'shop-checkout-fields');
    manual.append(
      field('First name', controls.firstname),
      field('Last name', controls.lastname),
      field('Street address', controls.street, true),
      field('Suburb / city', controls.city),
      regionField,
      field('Postcode', controls.postcode),
      field('Country', country),
      field('Phone', controls.telephone, true),
    );
    const syncCountry = () => {
      const control = country.value === 'AU' ? state : regionText;
      control.id = control.id || `shop-checkout-region-${crypto.randomUUID().slice(0, 8)}`;
      const label = el('label', undefined, country.value === 'AU' ? 'State' : 'State / region');
      label.htmlFor = control.id;
      regionField.replaceChildren(label, control);
    };
    country.addEventListener('change', syncCountry);
    syncCountry();
    const syncSaved = () => { manual.hidden = Boolean(savedSelect?.value); };
    savedSelect?.addEventListener('change', syncSaved);
    syncSaved();
    form.append(manual);

    const formError = el('p', 'shop-widget-banner is-error');
    formError.setAttribute('role', 'alert');
    formError.hidden = true;
    const actions = el('div', 'shop-widget-actions');
    const submit = button('Continue');
    submit.type = 'submit';
    actions.append(submit);
    if (c.shipping_address && c.email) {
      const cancel = linkButton('Cancel');
      cancel.addEventListener('click', () => { editing = false; render(current); });
      actions.append(cancel);
    }
    form.append(formError, actions);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const required = [email, ...(savedSelect?.value ? [] : Object.values(controls))];
      required.forEach((control) => control.removeAttribute('aria-invalid'));
      const invalid = required.find((control) => !control.value.trim() || !control.checkValidity());
      if (invalid) {
        invalid.setAttribute('aria-invalid', 'true');
        formError.textContent = `Please complete ${invalid.labels?.[0]?.textContent || 'every field'}.`;
        formError.hidden = false;
        invalid.focus();
        return;
      }
      formError.hidden = true;
      const args = { email: email.value.trim() };
      if (savedSelect?.value) {
        args.saved_address_id = savedSelect.value;
      } else {
        args.shipping_address = {
          firstname: controls.firstname.value.trim(),
          lastname: controls.lastname.value.trim(),
          street: controls.street.value.trim(),
          city: controls.city.value.trim(),
          region: country.value === 'AU' ? state.value : regionText.value.trim(),
          postcode: controls.postcode.value.trim(),
          country_code: country.value,
          telephone: controls.telephone.value.trim(),
        };
      }
      editing = false;
      prepare(args);
    });
    return panel(form);
  }

  function addressPanel(c) {
    const a = c.shipping_address;
    const head = el('div', 'shop-widget-row');
    const change = linkButton('Change');
    change.addEventListener('click', () => { editing = true; render(current); });
    head.append(el('h3', undefined, 'Delivery details'), change);
    const address = el('address');
    [c.email, a.name, (a.street || []).join(', '), [a.city, a.region, a.postcode, a.country].filter(Boolean).join(' ')]
      .filter(Boolean).forEach((text, i) => {
        if (i) address.append(el('br'));
        address.append(text);
      });
    return panel(head, address);
  }

  function methodsPanel(c) {
    const group = el('fieldset', 'shop-checkout-methods');
    group.append(el('legend', undefined, 'Delivery method'));
    c.shipping_methods.forEach((m) => {
      const label = el('label');
      const radio = el('input');
      Object.assign(radio, {
        type: 'radio', name: 'shop-checkout-method', value: m.code, checked: c.shipping_method?.code === m.code,
      });
      radio.addEventListener('change', () => prepare({ shipping_method: m.code }));
      label.append(radio, ` ${m.title} — ${money(m.amount)}`);
      group.append(label);
    });
    return panel(group);
  }

  function summaryPanel(cart, offer) {
    const section = panel(el('h3', undefined, 'Order summary'), cartLines(cart));
    const card = offerCard(offer, { onApply: () => prepare({ apply_offer: true }) });
    if (card) section.append(card);
    section.append(totalsList(cart.totals));
    if (cart.offer_applied) {
      const note = el('p', 'shop-widget-muted', 'Welcome-back offer applied. ');
      const remove = linkButton('Remove offer');
      remove.addEventListener('click', () => prepare({ remove_offer: true }));
      note.append(remove);
      section.append(note);
    } else if (cart.coupons?.length) {
      section.append(el('p', 'shop-widget-muted', `Coupon: ${cart.coupons.join(', ')}`));
    } else {
      const form = el('form', 'shop-checkout-coupon');
      const coupon = input('coupon', 'off');
      coupon.required = false;
      coupon.placeholder = 'e.g. WKND10';
      const apply = button('Apply', 'secondary');
      apply.type = 'submit';
      form.append(field('Coupon code', coupon), apply);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (coupon.value.trim()) prepare({ coupon_code: coupon.value.trim() });
      });
      section.append(form);
    }
    return section;
  }

  function checkoutView(data) {
    const { cart } = data;
    const c = cart.checkout;
    const nodes = [...messages(data)];
    if (!cart.lines.length) {
      nodes.push(
        el('p', undefined, 'Your WKND cart is empty.'),
        followUpButton(bridge, 'Browse WKND gear', 'Show me WKND adventure gear', 'primary'),
      );
      return nodes;
    }
    nodes.push(!c.shipping_address || !c.email || editing ? detailsForm(data) : addressPanel(c));
    if (c.shipping_methods?.length) nodes.push(methodsPanel(c));
    nodes.push(summaryPanel(cart, data.offer), el('p', 'shop-widget-notice', data.notice || DEMO_NOTICE));

    const actions = el('div', 'shop-widget-actions');
    const place = button(`Place demo order · ${money(cart.totals.grand_total)}`);
    place.disabled = !cart.ready;
    place.addEventListener('click', () => call('place-shop-demo-order', {
      cart_version: cart.version,
      expected_grand_total: cart.totals.grand_total.value,
      confirm: true,
    }));
    actions.append(place, followUpButton(bridge, 'Edit cart', 'Show my WKND cart'));
    nodes.push(actions);
    if (!cart.ready && c.shipping_address && c.email) nodes.push(el('p', 'shop-widget-muted', 'Choose a delivery method to continue.'));
    return nodes;
  }

  function orderView(data) {
    const o = data.order;
    const number = el('p');
    number.append('Order ', el('strong', undefined, o.number), o.status ? ` · ${o.status}` : '');
    const items = el('ul', 'shop-checkout-receipt');
    (o.items || []).forEach((i) => {
      const item = el('li', 'shop-widget-row');
      item.append(
        el('span', undefined, `${i.quantity} × ${i.name}${i.options?.length ? ` (${i.options.map((x) => x.value).join(', ')})` : ''}`),
        el('span', 'shop-widget-amount', money(i.row_total)),
      );
      items.append(item);
    });
    const nodes = [
      el('h3', undefined, 'Demo order placed'),
      number,
      el('p', 'shop-widget-notice', data.notice || DEMO_NOTICE),
      items,
      totalsList({ ...o.totals, tax_included: o.totals?.tax_included ? [{ label: 'GST', amount: o.totals.tax_included }] : [] }),
      el('p', 'shop-widget-muted', `${o.shipping_method || 'WKND Shipping'} to ${o.ship_to}. Confirmation to ${o.email}.`),
    ];
    if (o.url) {
      const view = button('View order on WKND', 'secondary');
      view.addEventListener('click', () => openSiteLink(bridge, o.url).catch(() => {}));
      nodes.push(view);
    }
    return nodes;
  }

  render = (incoming, fromUser) => {
    let data = incoming;
    if (data?.cart && current?.saved_addresses && !data.saved_addresses) {
      data = {
        ...data, saved_addresses: current.saved_addresses, account_email: current.account_email,
      };
    }
    let nodes;
    if (data?.order) {
      nodes = orderView(data);
    } else if (data?.cart && Array.isArray(data.cart.lines)) {
      nodes = checkoutView(data);
      current = { ...data, error: undefined, warnings: [] };
    } else {
      nodes = [alertBox(data?.error?.message || 'Checkout is unavailable. Sign in and try again.')];
    }
    block.replaceChildren(title, ...nodes);
    if (fromUser) title.focus({ preventScroll: true });
    resized();
  };

  if (preview) {
    const { SAMPLE_CHECKOUT } = await import('../../scripts/llmapp-shop-samples.js');
    render(SAMPLE_CHECKOUT);
    return;
  }
  resized = connectWidget(block, bridge, {
    title,
    loadingText: 'Preparing checkout…',
    timeoutMessage: 'Checkout is unavailable right now. Sign in and ask again.',
    render: (data) => render(data),
  });
}
