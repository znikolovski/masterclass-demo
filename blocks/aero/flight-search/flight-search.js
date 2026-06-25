/**
 * Flight search widget — SSR form enhanced with attribution params.
 */
import { readBlockConfig } from '../../../scripts/aem.js';
import {
  getFlightAttribution,
  persistFlightAttribution,
  DEFAULT_FLIGHT_ORIGIN,
} from '../../../scripts/aero-blocks.js';
import {
  fetchAdventureCatalog,
  getAdventureDestinationOptions,
  getCatalogItems,
} from '../../../scripts/aero-catalog.js';
import { pushInteractionEvent } from '../../../scripts/analytics-acdl.js';

/** Major hub airports for origin selection. */
const ORIGIN_AIRPORTS = [
  { code: 'MEL', city: 'Melbourne' },
  { code: 'SFO', city: 'San Francisco' },
  { code: 'LAX', city: 'Los Angeles' },
  { code: 'JFK', city: 'New York' },
  { code: 'LHR', city: 'London' },
  { code: 'DEN', city: 'Denver' },
];

/**
 * @param {HTMLSelectElement} select
 * @param {{ code: string, label: string, slug: string }[]} destinations
 * @param {string} selectedCode
 * @param {string} selectedAdv
 */
function populateDestinationSelect(select, destinations, selectedCode, selectedAdv) {
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select destination';
  select.append(placeholder);

  destinations.forEach((dest) => {
    const option = document.createElement('option');
    option.value = dest.code;
    const shortLabel = dest.label.length > 28 ? `${dest.label.slice(0, 25)}…` : dest.label;
    option.textContent = `${shortLabel} (${dest.code})`;
    option.dataset.adv = dest.slug;
    const codeMatch = dest.code === selectedCode;
    const advMatch = !selectedAdv || dest.slug === selectedAdv;
    if (codeMatch && advMatch) option.selected = true;
    select.append(option);
  });

  if (selectedCode && !select.value) {
    const fallback = destinations.find((d) => d.code === selectedCode);
    if (fallback) {
      select.value = fallback.code;
      const opt = select.querySelector(`option[value="${fallback.code}"][data-adv="${fallback.slug}"]`);
      if (opt) opt.selected = true;
    }
  }
}

/**
 * @param {HTMLFormElement} form
 * @param {Record<string, string>} config
 * @param {{ code: string, label: string, slug: string }[]} destinations
 */
function buildSearchForm(form, config, destinations) {
  const urlAttrs = getFlightAttribution();
  const origin = config.origin || urlAttrs.origin || DEFAULT_FLIGHT_ORIGIN;
  const dest = config.destination || urlAttrs.dest || '';
  const selectedAdv = urlAttrs.adv || '';
  const passengers = config.passengers || '1';

  form.innerHTML = `
    <fieldset class="flight-search-fields">
      <legend class="sr-only">Search flights</legend>
      <label class="flight-search-field">
        <span class="flight-search-label">FROM</span>
        <select name="origin" aria-label="Origin airport">${ORIGIN_AIRPORTS.map((a) => `<option value="${a.code}"${a.code === origin ? ' selected' : ''}>${a.city} (${a.code})</option>`).join('')}</select>
      </label>
      <label class="flight-search-field">
        <span class="flight-search-label">TO</span>
        <select name="destination" aria-label="Destination airport" required></select>
      </label>
      <label class="flight-search-field">
        <span class="flight-search-label">WHEN</span>
        <input type="date" name="depart" aria-label="Departure date" required />
      </label>
      <label class="flight-search-field">
        <span class="flight-search-label">PASS</span>
        <select name="passengers" aria-label="Travellers">
          ${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}"${String(n) === passengers ? ' selected' : ''}>${n}</option>`).join('')}
        </select>
      </label>
      <button type="submit" class="flight-search-submit">FIND FLIGHTS</button>
    </fieldset>`;

  const destSelect = form.querySelector('select[name="destination"]');
  if (destSelect) populateDestinationSelect(destSelect, destinations, dest, selectedAdv);

  const departInput = form.querySelector('input[name="depart"]');
  if (departInput) {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    departInput.min = new Date().toISOString().slice(0, 10);
    departInput.value = d.toISOString().slice(0, 10);
  }
}

/**
 * @param {Element} block
 */
export default async function decorate(block) {
  block.classList.add('block');
  const config = readBlockConfig(block);
  const rows = [...block.children];
  block.textContent = '';

  let destinations = [];
  try {
    const catalog = await fetchAdventureCatalog();
    destinations = getAdventureDestinationOptions(getCatalogItems(catalog));
  } catch {
    destinations = [];
  }

  const form = document.createElement('form');
  form.className = 'flight-search-form';
  form.method = 'get';
  form.action = '/book/flights';
  buildSearchForm(form, config, destinations);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const destSelect = form.querySelector('select[name="destination"]');
    const selectedOption = destSelect?.selectedOptions?.[0];
    const params = new URLSearchParams();
    params.set('origin', String(data.get('origin') || DEFAULT_FLIGHT_ORIGIN));
    params.set('dest', String(data.get('destination') || ''));
    params.set('depart', String(data.get('depart') || ''));
    params.set('passengers', String(data.get('passengers') || '1'));

    const attrs = getFlightAttribution();
    const adv = selectedOption?.dataset.adv || attrs.adv || '';
    if (adv) params.set('adv', adv);
    if (attrs.cid) params.set('cid', attrs.cid);
    if (attrs.ref) params.set('ref', attrs.ref);

    persistFlightAttribution({
      origin: params.get('origin') || '',
      dest: params.get('dest') || '',
      adv: adv || '',
      cid: attrs.cid || '',
      ref: attrs.ref || '',
    });

    window.dispatchEvent(new CustomEvent('wknd:flight-search-start', {
      detail: Object.fromEntries(params),
    }));

    pushInteractionEvent('flightSearchStart', {
      block: 'flight-search',
      label: params.get('dest') || '',
      detail: adv || '',
    });

    const target = form.dataset.embed === 'true' && window.top !== window.self
      ? window.top.location
      : window.location;
    target.assign(`/book/flights?${params.toString()}`);
  });

  if (window.top !== window.self) form.dataset.embed = 'true';
  block.append(form);

  rows.forEach((row) => row.remove());
}
