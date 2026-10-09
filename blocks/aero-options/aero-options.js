import { normalizeOf1Text, selectOf1Entries } from '../../scripts/of1-context.js';

let catalog;

async function getCatalog() {
  if (!catalog) {
    catalog = fetch(new URL('../../of1/config/knowledge.json', import.meta.url))
      .then(async (response) => {
        if (!response.ok) throw new Error(`Aero catalog returned HTTP ${response.status}`);
        const entities = await response.json();
        if (!Array.isArray(entities)) throw new Error('Aero catalog is not an entity collection');
        const entries = entities.filter((entity) => entity.id?.startsWith('aero-'));
        if (!entries.length) throw new Error('Aero catalog has no curated experiences');
        entries.forEach((entry) => {
          const { flightOptions: flight } = entry;
          const source = new URL(entry.url);
          const booking = new URL(flight?.bookingUrl);
          if (typeof entry.title !== 'string' || !entry.title.trim()
            || !Array.isArray(flight?.destinationTerms) || !flight.destinationTerms.length
            || !flight.destinationTerms.every((term) => (
              typeof term === 'string' && normalizeOf1Text(term).trim()
            ))
            || !/^[A-Z]{3}$/.test(flight.airport) || !/^\$\d+$/.test(flight.startingFare)
            || source.protocol !== 'https:' || booking.origin !== source.origin
            || !/--wknd-aero--[a-z0-9-]+\.aem\.live$/.test(source.hostname)
            || source.pathname !== `/adventures/${entry.id.slice(5)}`
            || booking.pathname !== '/book/flights'
            || booking.searchParams.get('dest') !== flight.airport
            || booking.searchParams.get('adv') !== entry.id.slice(5)) {
            throw new Error(`Invalid verified Aero information for ${entry.id}`);
          }
        });
        return entries;
      }).catch((error) => {
        catalog = undefined;
        throw error;
      });
  }
  return catalog;
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export default async function decorate(block) {
  let entries;
  try {
    entries = await getCatalog();
  } catch (error) {
    const message = element('p', 'Flight options are unavailable right now. Please try again later.');
    message.setAttribute('role', 'status');
    block.replaceChildren(element('h2', 'WKND Aero flight options'), message);
    // eslint-disable-next-line no-console -- display and report source-data failures
    console.error('Unable to load verified WKND Aero options:', error);
    return;
  }
  const selected = selectOf1Entries(entries, (entry) => entry.flightOptions.destinationTerms);
  if (!selected.length) {
    block.closest('.section').hidden = true;
    return;
  }
  const panel = element('div', '', 'aero-options-panel');
  panel.append(element('h2', 'WKND Aero flight options'));
  panel.append(element('p', 'Source-backed flight options for these adventures.', 'aero-options-lead'));
  const list = element('ul', '', 'aero-options-list');
  selected.forEach((entry) => {
    const { flightOptions: flight } = entry;
    const item = element('li');
    const title = entry.title.replace('WKND Aero flight-linked experience: ', '');
    item.append(element('h3', title));
    item.append(element('p', `Destination airport: ${flight.airport}`));
    item.append(element('p', `Flights from ${flight.startingFare}`, 'aero-options-fare'));
    const actions = element('div', '', 'aero-options-actions');
    [
      ['View Aero experience', entry.url, 'secondary'],
      ['Find flights with WKND Aero', flight.bookingUrl, 'primary'],
    ].forEach(([label, href, style]) => {
      const link = element('a', label, `button ${style}`);
      link.href = href;
      link.setAttribute('aria-label', `${label} for ${title}`);
      actions.append(link);
    });
    item.append(actions);
    list.append(item);
  });
  panel.append(list);
  panel.append(element('p', 'Published starting flight fares, not full-trip quotes. Check WKND Aero for current prices, dates, availability and inclusions.', 'aero-options-note'));
  block.replaceChildren(panel);
}
