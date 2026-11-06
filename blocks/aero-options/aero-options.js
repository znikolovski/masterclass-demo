import { normalizeOf1Text, selectOf1Entries } from '../../scripts/of1-context.js';
import { prepareAeroUrl } from '../../scripts/journey-analytics.js';

const FLIGHT_CATALOG_URL = 'https://wknd-of1-ingestion.jaggah.workers.dev/flight-options.json';
let catalog;

async function getCatalog() {
  if (!catalog) {
    catalog = fetch(new URL('../../of1/config/knowledge.json', import.meta.url))
      .then(async (curatedResponse) => {
        if (!curatedResponse.ok) throw new Error(`Aero catalog returned HTTP ${curatedResponse.status}`);
        const entities = await curatedResponse.json();
        if (!Array.isArray(entities)) throw new Error('Aero catalog is not an entity collection');
        let generatedEntries = [];
        let generatedError;
        try {
          const generatedResponse = await fetch(FLIGHT_CATALOG_URL);
          if (!generatedResponse.ok) {
            throw new Error(`Automatic Aero catalog returned HTTP ${generatedResponse.status}`);
          }
          const generated = await generatedResponse.json();
          if (!Array.isArray(generated?.entries)) {
            throw new Error('Automatic Aero catalog is not an entry collection');
          }
          generatedEntries = generated.entries;
        } catch (error) {
          generatedError = error;
        }
        const entriesById = new Map(
          entities.filter((entity) => entity.id?.startsWith('aero-')).map((entity) => [entity.id, entity]),
        );
        generatedEntries.forEach((entry) => {
          if (!entry.id?.startsWith('aero-')) throw new Error('Automatic Aero catalog contains an invalid entry');
          entriesById.set(entry.id, entry);
        });
        const entries = [...entriesById.values()];
        if (!entries.length) throw new Error('Aero catalog has no curated experiences');
        entries.forEach((entry) => {
          const { flightOptions: flight } = entry;
          const source = new URL(entry.url);
          const booking = new URL(flight?.bookingUrl);
          const adventureId = entry.id.slice(5);
          const isAeroExperience = source.origin === booking.origin
            && /^[a-z0-9-]+--wknd-aero--[a-z0-9-]+\.aem\.live$/.test(source.hostname)
            && source.pathname === `/adventures/${adventureId}`;
          const isAdventuresArticle = source.origin === 'https://wknd-adventures.run.place'
            && /^\/blog\/[a-z0-9-]+(?:\/[a-z0-9-]+)*\/?$/.test(source.pathname);
          const isAeroBooking = booking.protocol === 'https:'
            && /^[a-z0-9-]+--wknd-aero--[a-z0-9-]+\.aem\.live$/.test(booking.hostname);
          if (typeof entry.title !== 'string' || !entry.title.trim()
            || !Array.isArray(flight?.destinationTerms) || !flight.destinationTerms.length
            || !flight.destinationTerms.every((term) => (
              typeof term === 'string' && normalizeOf1Text(term).trim()
            ))
            || !/^[A-Z]{3}$/.test(flight.airport)
            || (flight.startingFare !== undefined && !/^\$\d+$/.test(flight.startingFare))
            || source.protocol !== 'https:' || (!isAeroExperience && !isAdventuresArticle)
            || (isAdventuresArticle
              && (typeof entry.sourceLabel !== 'string' || !entry.sourceLabel.trim()))
            || !isAeroBooking
            || booking.pathname !== '/book/flights'
            || booking.searchParams.get('dest') !== flight.airport
            || booking.searchParams.get('adv') !== adventureId) {
            throw new Error(`Invalid verified Aero information for ${entry.id}`);
          }
        });
        return { entries, generatedError };
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
  let catalogData;
  try {
    catalogData = await getCatalog();
  } catch (error) {
    const message = element('p', 'Flight options are unavailable right now. Please try again later.');
    message.setAttribute('role', 'status');
    block.replaceChildren(element('h2', 'WKND Aero flight options'), message);
    // eslint-disable-next-line no-console -- display and report source-data failures
    console.error('Unable to load verified WKND Aero options:', error);
    return;
  }
  const { entries, generatedError } = catalogData;
  const selected = selectOf1Entries(entries, (entry) => entry.flightOptions.destinationTerms);
  if (!selected.length) {
    if (generatedError) {
      block.replaceChildren(
        element('h2', 'WKND Aero flight options'),
        element('p', 'Automatic flight options are unavailable right now.', 'aero-options-status'),
      );
      block.querySelector('.aero-options-status').setAttribute('role', 'status');
      // eslint-disable-next-line no-console -- show the generated catalog delivery failure
      console.error('Unable to load automatic WKND Aero options:', generatedError);
      return;
    }
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
    if (flight.startingFare) {
      item.append(element('p', `Flights from ${flight.startingFare}`, 'aero-options-fare'));
    }
    const actions = element('div', '', 'aero-options-actions');
    [
      [entry.sourceLabel || 'View Aero experience', entry.url, 'secondary'],
      ['Find flights with WKND Aero', flight.bookingUrl, 'primary'],
    ].forEach(([label, href, style]) => {
      const link = element('a', label, `button ${style}`);
      link.href = prepareAeroUrl(href);
      link.setAttribute('aria-label', `${label} for ${title}`);
      actions.append(link);
    });
    item.append(actions);
    list.append(item);
  });
  panel.append(list);
  panel.append(element('p', 'Any starting fare shown is from the published article, not a full-trip quote. Check WKND Aero for current prices, dates, availability and inclusions.', 'aero-options-note'));
  if (generatedError) {
    const status = element(
      'p',
      'Automatic flight options are unavailable; showing verified catalog options only.',
      'aero-options-status',
    );
    status.setAttribute('role', 'status');
    panel.append(status);
    // eslint-disable-next-line no-console -- show the generated catalog delivery failure
    console.error('Unable to load automatic WKND Aero options:', generatedError);
  }
  block.replaceChildren(panel);
}
