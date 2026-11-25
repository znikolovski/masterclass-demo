import {
  el as element, offerCard, totalsList, callShopTool, followUpButton,
} from '../../scripts/llmapp-shop.js';

const CHECKOUT = 'https://main--wknd-aero--znikolovski.aem.live/book/flights';

function flightTime(value, timeZone) {
  return `${new Intl.DateTimeFormat('en', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: timeZone || 'UTC',
  }).format(new Date(value))} (${timeZone || 'UTC; airport local time unavailable'})`;
}

export default async function decorate(block, bridge) {
  block.classList.add('shop-widget');
  const title = block.querySelector('h2')?.textContent || 'Find flights with WKND Aero';
  block.replaceChildren(element('h2', '', title));
  const status = element('p', 'search-flights-status');
  status.setAttribute('role', 'status');
  const note = element('p', 'search-flights-note', 'Demo flights only, not real airline tickets. USD base fares exclude taxes and seat fees. Aero refreshes the fare at checkout; you sign in and confirm there.');
  const form = element('form', 'search-flights-form');
  const fields = {};
  [
    ['origin', 'Departure airport', 'text'],
    ['destination', 'Arrival airport', 'text'],
    ['depart', 'Departure date', 'date'],
    ['passengers', 'Travellers', 'number'],
  ].forEach(([name, label, type]) => {
    const wrapper = element('label', 'search-flights-field', label);
    const input = element('input');
    input.name = name;
    input.type = type;
    input.required = true;
    if (type === 'text') {
      input.pattern = '[A-Za-z]{3}';
      input.maxLength = 3;
      input.placeholder = name === 'origin' ? 'MEL' : 'PUQ';
    }
    if (type === 'date') input.min = new Date().toISOString().slice(0, 10);
    if (type === 'number') {
      input.min = '1';
      input.max = '6';
      input.value = '1';
    }
    fields[name] = input;
    wrapper.append(input);
    form.append(wrapper);
  });
  const submit = element('button', 'search-flights-submit', 'Search demo flights');
  submit.type = 'submit';
  form.append(submit);
  const results = element('div', 'search-flights-results');
  const discounts = element('section', 'search-flights-discounts');
  discounts.setAttribute('aria-label', 'WKND gear discounts');
  const discountNote = element('p', '', 'Gear discounts are separate from the flight fare. Flight-linked offers require a confirmed, eligible booking and are reviewed on your Aero confirmation. Check your signed-in Shop cart for audience-qualified offers and applied savings; Commerce determines eligibility and pricing.');
  const checkDiscounts = element('button', 'search-flights-submit', 'Check my gear discounts');
  checkDiscounts.type = 'button';
  checkDiscounts.disabled = !bridge?.isEmbedded || bridge.hostContext?.preview === true;
  const discountResults = element('div', 'search-flights-discount-results');
  discountResults.setAttribute('aria-live', 'polite');
  discounts.append(element('h3', '', 'Gear discounts'), discountNote, checkDiscounts, discountResults);
  block.append(note, status, form, results, discounts);
  let adventureId = '';
  let revision = 0;
  let initialTimer;
  let discountRevision = 0;

  checkDiscounts.addEventListener('click', async () => {
    discountRevision += 1;
    const current = discountRevision;
    checkDiscounts.disabled = true;
    discountResults.replaceChildren(element('p', '', 'Checking your signed-in Shop cart...'));
    try {
      const data = await callShopTool(bridge, 'get-shop-cart', {});
      if (current !== discountRevision) return;
      if (!data.cart?.totals || !Array.isArray(data.cart.lines)
        || !Array.isArray(data.cart.totals.discounts)
        || !Number.isFinite(data.cart.totals.grand_total?.value)
        || typeof data.cart.currency !== 'string') {
        throw new Error(data.error?.message || 'Sign in to WKND Shop to check your discounts.');
      }
      discountResults.replaceChildren(element('p', '', `Current Shop cart prices (${data.cart.currency}); these are not a discount on the flight above.`));
      if (!data.cart.lines.length) {
        discountResults.append(element('p', '', 'Your Shop cart is empty. Add gear before checking applicable savings.'));
      } else {
        const offer = offerCard(data.offer);
        if (offer) discountResults.append(offer);
        discountResults.append(totalsList(data.cart.totals));
        if (!data.cart.totals.discounts?.length && !offer) {
          discountResults.append(element('p', '', 'Commerce reports no discount on this cart right now.'));
        }
      }
      discountResults.append(followUpButton(bridge, 'Review discounts in Shop', 'Show my WKND Shop cart and applicable discounts. Do not change my cart or apply an offer without my confirmation.'));
    } catch (error) {
      if (current !== discountRevision) return;
      const message = element('p', '', error.message || 'Unable to check discounts. Sign in and try again.');
      message.setAttribute('role', 'alert');
      discountResults.replaceChildren(message);
    } finally {
      if (current === discountRevision) checkDiscounts.disabled = false;
    }
  });

  const failure = (message) => {
    clearTimeout(initialTimer);
    status.textContent = message;
    status.setAttribute('role', 'alert');
    results.replaceChildren();
    submit.disabled = false;
    form.setAttribute('aria-busy', 'false');
  };
  const render = (output) => {
    const data = output?.structuredContent;
    discountRevision += 1;
    discountResults.replaceChildren();
    checkDiscounts.disabled = false;
    results.replaceChildren();
    submit.disabled = false;
    form.setAttribute('aria-busy', 'false');
    if (!data || !Array.isArray(data.flights) || data.demo !== true || data.currency !== 'USD') {
      failure('Flight results are unavailable. Run Search Flights again.');
      return;
    }
    adventureId = data.query?.adventure_id || '';
    if (typeof data.discounts?.message === 'string') discountNote.textContent = data.discounts.message;
    Object.entries(fields).forEach(([name, input]) => {
      input.value = data.query?.[name] ?? (name === 'passengers' ? '1' : '');
    });
    status.setAttribute('role', output.isError ? 'alert' : 'status');
    status.textContent = output.content?.find((item) => item.type === 'text')?.text.split('\n')[0]
      || 'Review your travel details.';
    if (data.status !== 'ready') return;
    if (!data.flights.length) {
      status.textContent = 'No flights found. Try a different date or route.';
      return;
    }
    try {
      data.flights.forEach((flight) => {
        const url = new URL(flight.booking_url);
        if (url.origin + url.pathname !== CHECKOUT
          || url.username || url.password
          || url.searchParams.get('flight_id') !== flight.id
          || url.searchParams.get('origin') !== flight.origin
          || url.searchParams.get('dest') !== flight.destination
          || url.searchParams.get('depart') !== data.query?.depart
          || url.searchParams.get('passengers') !== String(data.query?.passengers)
          || (url.searchParams.get('adv') || '') !== adventureId
          || !Number.isFinite(flight.base_fare_per_person)
          || !Number.isFinite(Date.parse(flight.expires_at))
          || Date.parse(flight.expires_at) <= Date.now()) {
          throw new Error('Flight results are invalid or expired. Search again.');
        }
        const card = element('article', 'search-flights-card');
        card.append(
          element('h3', '', `${flight.id} · ${flight.origin} to ${flight.destination}`),
          element('p', '', `Departs ${flightTime(flight.departure_at, flight.origin_time_zone)}`),
          element('p', '', `Arrives ${flightTime(flight.arrival_at, flight.destination_time_zone)}`),
          element('p', '', `${flight.duration} · ${flight.cabin} · ${flight.aircraft}`),
          element('p', 'search-flights-price', `USD ${flight.base_fare_per_person.toFixed(2)} base fare per traveller`),
        );
        const link = element('a', 'search-flights-continue', 'Continue in Aero');
        link.href = url.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.setAttribute('aria-label', `Continue in Aero with ${flight.id}`);
        link.addEventListener('click', async (event) => {
          if (Date.parse(flight.expires_at) <= Date.now()) {
            event.preventDefault();
            failure('These flight results have expired. Search again.');
            return;
          }
          if (!bridge?.openLink || event.ctrlKey || event.metaKey) return;
          event.preventDefault();
          try {
            const opened = await bridge.openLink(url.href);
            if (opened?.isError || opened?.error) throw new Error('The host could not open Aero.');
          } catch {
            status.setAttribute('role', 'alert');
            status.textContent = 'Unable to open Aero from the host. Use the link in a new tab.';
          }
        });
        card.append(link);
        results.append(card);
      });
    } catch (error) {
      failure(error.message);
    }
  };
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!bridge?.isEmbedded || !form.reportValidity()) return;
    revision += 1;
    const current = revision;
    submit.disabled = true;
    results.replaceChildren();
    form.setAttribute('aria-busy', 'true');
    status.setAttribute('role', 'status');
    status.textContent = 'Searching demo flights...';
    const args = Object.fromEntries(
      Object.entries(fields).map(([name, input]) => [name, input.value]),
    );
    args.passengers = Number(args.passengers);
    if (adventureId) args.adventure_id = adventureId;
    try {
      const output = await bridge.callTool('search-flights', args);
      if (current === revision) render(output);
    } catch {
      if (current === revision) failure('Flight search is unavailable. Check that Search Flights is enabled and try again.');
    }
  });
  if (!bridge?.isEmbedded || bridge.hostContext?.preview) {
    submit.disabled = true;
    status.textContent = 'Open Search Flights in the WKND LLM app to search and select flights. No fares are shown in page previews.';
    return;
  }
  bridge.applyHostStyles(block);
  bridge.autoResize(block);
  const receive = (output) => {
    clearTimeout(initialTimer);
    revision += 1;
    render(output);
  };
  bridge.onToolResult(receive);
  status.textContent = 'Waiting for flight search results...';
  initialTimer = setTimeout(() => failure('Flight results are unavailable. Run Search Flights again.'), 15000);
  bridge.toolResult.then(receive).catch(() => failure('Unable to receive flight results from the host.'));
  bridge.toolCancelled.then(() => {
    revision += 1;
    failure('Flight search cancelled.');
  });
}
