const START = '2026-07-24';
const END = '2026-10-22';
const DAY = 86400000;
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
});
const $ = (selector) => document.querySelector(selector);
const dateAt = (index) => new Date(Date.parse(START) + index * DAY).toISOString().slice(0, 10);
const formatDate = (date) => dateFormat.format(new Date(`${date}T00:00:00Z`));
const signed = (value, suffix = '%') => `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(2)}${suffix}`;
const baseline = Array.from({ length: 91 }, (_, index) => ({
  date: dateAt(index),
  price: 100 - (15 * index) / 90
    + Math.sin((index * Math.PI) / 90) * (Math.sin(index * 1.7) * 0.65
      + Math.sin(index * 0.35) * 1.2),
}));
const state = {
  datasets: [], active: new Set(), cursor: 90, days: 90,
};

function applyView() {
  const tickerOnly = new URLSearchParams(window.location.search).get('view') === 'ticker';
  document.body.classList.toggle('ticker-view', tickerOnly);
  document.title = tickerOnly ? 'WKND Adventures | Stock ticker' : 'WKND Adventures | Market simulator';
}

applyView();
window.addEventListener('popstate', applyView);

function message(text, error = false) {
  $('#status').textContent = text;
  $('#status').classList.toggle('error', error);
}

function validText(value, max) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function validateDocument(data) {
  if (!data || !Array.isArray(data.datasets)
    || data.datasets.length < 1 || data.datasets.length > 20) {
    throw new Error('Expected a "datasets" array containing 1–20 datasets.');
  }
  const ids = new Set();
  return data.datasets.map((dataset) => {
    if (!dataset || typeof dataset.id !== 'string' || !/^[a-z0-9-]{1,60}$/.test(dataset.id)
      || ids.has(dataset.id)) {
      throw new Error('Each dataset needs a unique id (lowercase letters, numbers, hyphens; max 60).');
    }
    ids.add(dataset.id);
    if (!validText(dataset.name, 100)
      || (dataset.description !== undefined && !validText(dataset.description, 240))
      || !Array.isArray(dataset.events) || !dataset.events.length || dataset.events.length > 20) {
      throw new Error(`Dataset "${dataset.id}" needs a name, 1–20 events, and an optional description.`);
    }
    const events = dataset.events.map((event) => {
      if (!event || typeof event.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(event.date)
        || !Number.isFinite(Date.parse(event.date))
        || new Date(event.date).toISOString().slice(0, 10) !== event.date
        || event.date < START || event.date > END
        || !validText(event.label, 160) || !Number.isFinite(event.impactPct)
        || event.impactPct < -95 || event.impactPct > 100) {
        throw new Error(`Dataset "${dataset.id}": events need a valid date (${START} to ${END}), label, and numeric impactPct from -95 to 100.`);
      }
      return { date: event.date, label: event.label, impactPct: event.impactPct };
    });
    return {
      id: dataset.id,
      name: dataset.name.trim(),
      description: dataset.description?.trim() || '',
      events: events.sort((a, b) => a.date.localeCompare(b.date)),
    };
  });
}

function activeEvents() {
  return state.datasets.filter((dataset) => state.active.has(dataset.id))
    .flatMap((dataset) => dataset.events.map((event) => ({ ...event, dataset: dataset.name })))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function scenarioSeries(events) {
  return baseline.map((point) => ({
    ...point,
    price: events.filter((event) => event.date <= point.date)
      .reduce((price, event) => price * (1 + event.impactPct / 100), point.price),
  }));
}

function renderDatasets() {
  $('#datasets').replaceChildren();
  state.datasets.forEach((dataset) => {
    const label = document.createElement('label');
    label.className = 'dataset';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.active.has(dataset.id);
    checkbox.dataset.id = dataset.id;
    const content = document.createElement('span');
    content.className = 'dataset-copy';
    const title = document.createElement('strong');
    title.textContent = dataset.name;
    const description = document.createElement('span');
    description.className = 'dataset-description';
    description.textContent = dataset.description;
    const meta = document.createElement('span');
    meta.className = 'dataset-meta';
    const factors = dataset.events.map((event) => 1 + event.impactPct / 100);
    const impact = factors.reduce((factor, value) => factor * value, 1);
    meta.textContent = dataset.events.every((event) => event.impactPct === 0)
      ? `${dataset.events.length} context events · no sustained lift modeled`
      : `${dataset.events.length} events · ${signed((impact - 1) * 100)} combined impact`;
    content.append(title, description, meta);
    const toggle = document.createElement('span');
    toggle.className = 'switch';
    toggle.setAttribute('aria-hidden', 'true');
    label.append(checkbox, content, toggle);
    $('#datasets').append(label);
  });
}

function renderChart(points, reference, events) {
  const svg = $('#stock-chart');
  const prices = [...points, ...reference].map((point) => point.price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const padding = Math.max((high - low) * 0.18, high * 0.02, 1);
  const bottom = low - padding;
  const top = high + padding;
  const x = (index) => 18 + (index / Math.max(points.length - 1, 1)) * 690;
  const y = (price) => 280 - ((price - bottom) / (top - bottom)) * 255;
  const path = (series) => series.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(2)},${y(point.price).toFixed(2)}`).join(' ');
  const last = points.at(-1);
  const negative = last.price < points[0].price;
  svg.classList.toggle('chart-positive', !negative);
  const title = 'WKND simulated stock price';
  const description = `${formatDate(points[0].date)} to ${formatDate(last.date)}. Opening price ${currency.format(points[0].price)}; closing price ${currency.format(last.price)}. ${state.active.size} active datasets.`;
  svg.innerHTML = `<title id="chart-title">${title}</title><desc id="chart-description">${description}</desc>`;
  for (let index = 0; index < 5; index += 1) {
    const value = bottom + ((top - bottom) * index) / 4;
    svg.insertAdjacentHTML('beforeend', `<line class="gridline" x1="18" x2="708" y1="${y(value)}" y2="${y(value)}"/><text class="axis-label" x="724" y="${y(value) + 4}">${currency.format(value)}</text>`);
  }
  const line = path(points);
  svg.insertAdjacentHTML('beforeend', `<path class="chart-area" d="${line} L${x(points.length - 1)},280 L18,280 Z"/>`);
  if ($('#show-baseline').checked) {
    svg.insertAdjacentHTML('beforeend', `<path class="baseline-path" d="${path(reference)}"/>`);
  }
  svg.insertAdjacentHTML('beforeend', `<path class="price-path" d="${line}"/><circle class="last-point" cx="${x(points.length - 1)}" cy="${y(last.price)}" r="5"/>`);
  [0, Math.floor((points.length - 1) / 2), points.length - 1].forEach((index, position) => {
    const date = points[index].date.slice(5).replace('-', '/');
    svg.insertAdjacentHTML('beforeend', `<text class="axis-label" x="${x(index)}" y="315" text-anchor="${['start', 'middle', 'end'][position]}">${date}</text>`);
  });
  events.filter((event) => event.date >= points[0].date && event.date <= last.date)
    .forEach((event) => {
      const index = points.findIndex((point) => point.date === event.date);
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      marker.setAttribute('cx', x(index));
      marker.setAttribute('cy', y(points[index].price));
      marker.setAttribute('r', '5');
      marker.setAttribute('class', 'event-point');
      const tooltip = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      const effect = event.impactPct === 0 ? 'no sustained lift modeled' : signed(event.impactPct);
      tooltip.textContent = `${formatDate(event.date)}: ${event.label} (${effect})`;
      marker.append(tooltip);
      svg.append(marker);
    });
}

function renderEvents(events) {
  const container = $('#events');
  container.replaceChildren();
  const date = dateAt(state.cursor);
  $('#event-count').textContent = `${events.length} active event${events.length === 1 ? '' : 's'}`;
  if (!events.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'A clear trail, for now. Switch on a dataset to see its events here.';
    container.append(empty);
  }
  events.forEach((event) => {
    const row = document.createElement('article');
    row.className = 'event-row';
    const time = document.createElement('time');
    time.dateTime = event.date;
    time.textContent = formatDate(event.date);
    const content = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = event.label;
    const dataset = document.createElement('p');
    const eventStatus = event.impactPct === 0 ? ' · Context, illustrative date' : ' · Applied';
    dataset.textContent = `${event.dataset}${event.date > date ? ' · Upcoming, not yet applied' : eventStatus}`;
    content.append(name, dataset);
    const impact = document.createElement('span');
    impact.className = 'event-effect';
    if (event.impactPct !== 0) {
      impact.classList.add(event.impactPct < 0 ? 'negative' : 'positive');
    }
    impact.textContent = event.impactPct === 0 ? 'No sustained lift' : signed(event.impactPct);
    if (event.date > date) row.classList.add('upcoming');
    row.append(time, content, impact);
    container.append(row);
  });
}

function render() {
  const events = activeEvents();
  const series = scenarioSeries(events);
  const start = Math.max(0, state.cursor - state.days);
  const points = series.slice(start, state.cursor + 1);
  const reference = baseline.slice(start, state.cursor + 1);
  const first = points[0].price;
  const last = points.at(-1).price;
  const change = last - first;
  const percent = (change / first) * 100;
  $('#price').textContent = currency.format(last);
  const changeLabel = $('#price-change');
  const direction = change < 0 ? '−' : '+';
  const period = { 7: '1 week', 30: '1 month', 90: '3 months' }[state.days];
  changeLabel.textContent = `${direction}${currency.format(Math.abs(change))} (${Math.abs(percent).toFixed(2)}%) ${state.cursor < state.days ? 'over selected dates' : `over ${period}`}`;
  changeLabel.className = change < 0 ? 'negative' : 'positive';
  $('#quote-date').textContent = `${formatDate(points[0].date)} – ${formatDate(points.at(-1).date)} · Simulated closing prices`;
  $('#period-open').textContent = currency.format(first);
  $('#period-high').textContent = currency.format(Math.max(...points.map((point) => point.price)));
  $('#period-low').textContent = currency.format(Math.min(...points.map((point) => point.price)));
  const impact = (last / baseline[state.cursor].price - 1) * 100;
  $('#event-impact').textContent = signed(impact);
  $('#event-impact').className = impact < 0 ? 'negative' : 'positive';
  $('#active-count').textContent = `${state.active.size} active dataset${state.active.size === 1 ? '' : 's'}`;
  $('#simulation-date').value = dateAt(state.cursor);
  $('#date-scrubber').value = state.cursor;
  document.querySelectorAll('[data-days]').forEach((button) => {
    button.setAttribute('aria-pressed', Number(button.dataset.days) === state.days);
  });
  renderChart(points, reference, events);
  renderEvents(events);
}

async function importFiles(files) {
  if (!files.length) return;
  try {
    const documents = await Promise.all([...files].map(async (file) => {
      if (file.size > 1024 * 1024) throw new Error(`${file.name}: file exceeds the 1 MB limit.`);
      try {
        return validateDocument(JSON.parse(await file.text()));
      } catch (error) {
        throw new Error(`${file.name}: ${error.message}`);
      }
    }));
    const imported = documents.flat();
    const ids = imported.map((dataset) => dataset.id);
    if (new Set(ids).size !== ids.length) {
      throw new Error('Selected files contain duplicate dataset ids. Give each dataset a unique id.');
    }
    const merged = new Map(state.datasets.map((dataset) => [dataset.id, dataset]));
    imported.forEach((dataset) => merged.set(dataset.id, dataset));
    if (merged.size > 20) throw new Error('A maximum of 20 datasets can be loaded at once.');
    state.datasets = [...merged.values()];
    imported.forEach((dataset) => state.active.delete(dataset.id));
    renderDatasets();
    render();
    message(`Loaded ${imported.length} dataset${imported.length === 1 ? '' : 's'}. Switch them on to apply their events. Matching ids replace existing datasets.`);
  } catch (error) {
    message(`Could not load datasets. ${error.message} No datasets were changed.`, true);
  } finally {
    $('#file-input').value = '';
  }
}

async function init() {
  $('.ticker-view-link').addEventListener('click', (event) => {
    event.preventDefault();
    window.history.pushState(null, '', event.currentTarget.href);
    applyView();
  });
  try {
    const response = await fetch('./sample-data.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.datasets = validateDocument(await response.json());
    if (state.datasets.some((dataset) => dataset.id === 'new-destinations')) {
      state.active.add('new-destinations');
    }
  } catch (error) {
    message(`Could not load example datasets: ${error.message}. Serve this folder over HTTP, or load your own JSON file.`, true);
  }
  renderDatasets();
  render();
  $('#datasets').addEventListener('change', (event) => {
    const { id } = event.target.dataset;
    if (event.target.checked) state.active.add(id);
    else state.active.delete(id);
    if (scenarioSeries(activeEvents()).some((point) => (
      !Number.isFinite(point.price) || point.price <= 0
    ))) {
      state.active.delete(id);
      event.target.checked = false;
      message('This combination exceeds the numeric range of the simulator. The dataset was not enabled.', true);
      return;
    }
    render();
  });
  document.querySelectorAll('[data-days]').forEach((button) => {
    button.addEventListener('click', () => {
      state.days = Number(button.dataset.days);
      render();
    });
  });
  $('#show-baseline').addEventListener('change', render);
  $('#reset').addEventListener('click', () => {
    state.active.clear();
    state.cursor = 90;
    state.days = 90;
    $('#show-baseline').checked = true;
    renderDatasets();
    render();
    message('Reset to the default baseline: $85.00, down 15%. Loaded datasets are retained.');
  });
  $('#date-scrubber').addEventListener('input', (event) => {
    state.cursor = Number(event.target.value);
    render();
  });
  $('#simulation-date').addEventListener('change', (event) => {
    const date = event.target.value;
    if (!event.target.validity.valid || !date || date < START || date > END) {
      message(`Choose a simulation date between ${START} and ${END}.`, true);
      event.target.value = dateAt(state.cursor);
      return;
    }
    state.cursor = Math.round((Date.parse(date) - Date.parse(START)) / DAY);
    render();
  });
  $('#file-input').addEventListener('change', (event) => importFiles(event.target.files));
}

init();
