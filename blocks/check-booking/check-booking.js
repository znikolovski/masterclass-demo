function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function scheduled(instant, zone) {
  if (typeof instant !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(instant)) {
    return 'Scheduled date and time unavailable';
  }
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) return 'Scheduled date and time unavailable';
  if (typeof zone === 'string' && zone.trim()) {
    try {
      return `${new Intl.DateTimeFormat(undefined, {
        timeZone: zone, dateStyle: 'medium', timeStyle: 'short',
      }).format(date)} (${zone})`;
    } catch {
      // Preserve the published instant when its local time zone is unavailable.
    }
  }
  return `${date.toISOString()} (UTC; local time zone unavailable)`;
}

function isBooking(booking) {
  return booking && /^BK_[0-9a-f]{16}$/.test(booking.id);
}

/**
 * Render private tool results through the shared LLM Apps SDK, never a browser API token.
 * @param {Element} block
 * @param {object} [bridge]
 */
export default function decorate(block, bridge) {
  const title = block.querySelector('h2') || element('h2', 'Your WKND bookings');
  const form = element('form', undefined, 'check-booking-lookup');
  const field = element('div', undefined, 'check-booking-field');
  const input = element('input');
  input.id = `booking-id-${crypto.randomUUID()}`;
  input.name = 'booking_id';
  input.placeholder = 'BK_0123456789abcdef';
  input.pattern = 'BK_[0-9a-f]{16}';
  input.maxLength = 19;
  input.required = true;
  input.autocomplete = 'off';
  input.spellcheck = false;
  const label = element('label', 'Booking ID');
  label.htmlFor = input.id;
  field.append(label, input);
  const submit = element('button', 'View booking', 'check-booking-button');
  submit.type = 'submit';
  form.append(field, submit);
  const actions = element('nav');
  actions.setAttribute('aria-label', 'Booking actions');
  const listButton = element('button', 'My bookings', 'check-booking-button');
  listButton.type = 'button';
  actions.append(listButton);
  const status = element('p', 'Loading booking information...', 'check-booking-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const results = element('div', undefined, 'check-booking-results');
  block.replaceChildren(title, form, actions, status, results);
  let busy = true;
  let revision = 0;
  let initialTimer;
  let call;

  function setBusy(value) {
    busy = value;
    results.setAttribute('aria-busy', String(value));
    block.querySelectorAll('button').forEach((button) => { button.disabled = value; });
  }

  function failure(message) {
    clearTimeout(initialTimer);
    results.replaceChildren();
    status.textContent = message;
    status.setAttribute('role', 'alert');
    setBusy(false);
  }

  function safeLink(container, text, value) {
    let url;
    try {
      url = new URL(value);
    } catch {
      return;
    }
    if (url.protocol !== 'https:' || url.username || url.password) return;
    const link = element('a', text);
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    if (bridge?.openLink) {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        bridge.openLink(url.href).catch(() => {
          status.textContent = 'Unable to open the published source. Please try again.';
          status.setAttribute('role', 'alert');
        });
      });
    }
    container.append(link);
  }

  function row(list, name, value) {
    const text = value === null || value === undefined || value === '' ? 'Unavailable' : String(value);
    list.append(element('dt', name), element('dd', text));
  }

  function preparation(card, data) {
    card.append(element('h3', 'Adventure preparation'));
    card.append(element('p', 'Published guidance is not confirmation of a reservation, permit approval, or current access conditions.', 'check-booking-muted'));
    [['itinerary', 'Itinerary'], ['packingList', 'Packing list'], ['permits', 'Permits and access']].forEach(([key, heading]) => {
      card.append(element('h4', heading));
      const items = Array.isArray(data?.[key])
        ? data[key].filter((item) => typeof item === 'string' && item.trim()) : [];
      if (items.length) {
        const list = element('ul');
        items.forEach((item) => list.append(element('li', item)));
        card.append(list);
      } else {
        card.append(element('p', 'Unavailable - requirements have not been confirmed. Check the published source or contact the operator.', 'check-booking-muted'));
      }
    });
    safeLink(card, 'Published preparation source', data?.sourceUrl);
  }

  function bookingCard(booking, details) {
    const card = element('article', undefined, 'check-booking-card');
    card.append(element('h3', booking.id));
    if (booking.demo === true) {
      card.append(element('span', 'Demo booking - not a ticket', 'check-booking-badge'));
    } else if (booking.demo !== false) {
      card.append(element('p', 'Demo / ticket status unavailable', 'check-booking-muted'));
    }
    const list = element('dl');
    const flight = booking.flight || {};
    row(list, 'Status', booking.status);
    row(list, 'Route', flight.origin && flight.destination ? `${flight.origin} \u2192 ${flight.destination}` : null);
    row(list, 'Departs', scheduled(flight.departureAt, flight.originTimeZone));
    row(list, 'Arrives', scheduled(flight.arrivalAt, flight.destinationTimeZone));
    if (!flight.departureAt && flight.departTime) {
      row(list, 'Published departure time (no date)', flight.departTime);
    }
    row(list, 'Cabin', flight.cabin);
    if (details) {
      row(list, 'Aircraft', flight.aircraft);
      row(list, 'Duration', flight.duration);
      row(list, 'Seats', Array.isArray(booking.seats) ? booking.seats.join(', ') : null);
      row(list, 'Passengers', booking.passengerCount);
      row(list, 'Total', booking.total !== null && booking.total !== undefined && booking.currency
        ? `${booking.total} ${booking.currency}` : null);
    }
    card.append(list);
    if (booking.adventure) {
      card.append(element('h4', booking.adventure.title || 'Adventure'));
      safeLink(card, 'Read the published adventure', booking.adventure.editorialUrl);
    }
    if (details) preparation(card, booking.preparation);
    else {
      const button = element('button', 'View details', 'check-booking-button');
      button.type = 'button';
      button.setAttribute('aria-label', `View details for ${booking.id}`);
      button.addEventListener('click', () => call({ booking_id: booking.id }));
      card.append(button);
    }
    return card;
  }

  function render(output) {
    clearTimeout(initialTimer);
    const data = output?.structuredContent || output;
    if (output?.isError || data?.error) {
      failure(data?.error?.message || 'Booking information is unavailable. Sign in and try again.');
      return;
    }
    results.replaceChildren();
    status.setAttribute('role', 'status');
    if (data?.mode === 'details' && isBooking(data.booking)) {
      input.value = data.booking.id;
      results.append(bookingCard(data.booking, true));
      status.textContent = 'Booking details loaded.';
    } else if (data?.mode === 'list' && Array.isArray(data.bookings)
      && data.bookings.every(isBooking)) {
      data.bookings.forEach((booking) => results.append(bookingCard(booking, false)));
      status.textContent = data.bookings.length
        ? `${data.bookings.length} bookings on this page.` : 'No bookings found for your account.';
      if (typeof data.nextCursor === 'string' && data.nextCursor) {
        const next = element('button', 'Next page', 'check-booking-button');
        next.type = 'button';
        next.addEventListener('click', () => call({ cursor: data.nextCursor }));
        results.append(next);
      }
    } else {
      failure('No booking information was returned. Please try again.');
      return;
    }
    setBusy(false);
  }

  call = async (args) => {
    if (busy) return;
    revision += 1;
    const current = revision;
    results.replaceChildren();
    status.textContent = 'Loading booking information...';
    status.setAttribute('role', 'status');
    setBusy(true);
    try {
      const output = await bridge.callTool('check-booking', args);
      if (current === revision) render(output);
    } catch {
      if (current === revision) {
        failure('Unable to load bookings. Sign in, check that the tool is enabled, and try again.');
      }
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (form.reportValidity()) call({ booking_id: input.value.trim() });
  });
  listButton.addEventListener('click', () => call({}));
  setBusy(true);
  if (!bridge?.isEmbedded || bridge.hostContext?.preview) {
    status.textContent = 'Open Check Booking in ChatGPT or Claude and sign in to view your bookings. Private booking data is not available in page previews.';
    results.setAttribute('aria-busy', 'false');
    return;
  }
  bridge.applyHostStyles(block);
  bridge.autoResize(block);
  const receive = (output) => { revision += 1; render(output); };
  bridge.onToolResult(receive);
  initialTimer = setTimeout(() => {
    revision += 1;
    failure('Booking information is unavailable. Sign in and run Check Booking again.');
  }, 15000);
  bridge.toolResult.then(receive).catch(() => {
    revision += 1;
    failure('Unable to receive booking information from the host.');
  });
  bridge.toolCancelled.then(() => {
    revision += 1;
    failure('Booking lookup cancelled.');
  });
}
