// codegen:layout-pattern=carousel
// Route-briefing dashboard — renders ONE briefing object (outputSchema is a single
// object, not an array). In production the data arrives via bridge.toolResult; this
// SAMPLE_DATA is the standalone/preview fixture.
const SAMPLE_DATA = {
  adventure_id: 'patagonia-trek',
  title: 'W Circuit: 9 Days, 115 km',
  region: 'Americas · Torres del Paine, Chile',
  activity: 'Hiking',
  duration: '9 days · 115 km',
  verified_status: 'Verified · February 2026',
  last_verified_date: 'February 2026',
  daily_stages: [
    'Laguna Amarga → Refugio Las Torres',
    'Base Torres mirador & return',
    'Los Cuernos → Francés valley',
    'Británico lookout & Paine Grande',
    'Grey glacier & refugio',
    'Grey → Paine Grande → catamaran',
    'Buffer / weather contingency day',
  ],
  access: 'Bus from Puerto Natales to Laguna Amarga, then park shuttle to Torres trailhead. Catamaran across Lago Pehoé links the west side.',
  permits: 'Park entry ticket required; refugio and camp bookings must be reserved in advance through Las Torres and Vertice operators.',
  water: 'Streams along the route are described as drinkable; carry capacity for the exposed stretch to Grey.',
  accommodation: 'Mix of refugios and designated campsites; some free CONAF camps, others paid and operator-run.',
  weather_window: 'Report frames November–March as the trekking season, with strong, shifting winds even at peak season.',
  hazards: [
    'Sudden high winds on exposed ridgelines',
    'Rapid weather changes near the glaciers',
    'River crossings after heavy rain',
  ],
  essential_gear: [
    'Waterproof shell & wind layer',
    'Sturdy broken-in boots',
    'Trekking poles',
    '2L+ water capacity',
    'Warm insulating midlayer',
  ],
  verification_notes: [
    'Confirm refugio and campsite availability with operators before departure',
    'Recheck catamaran timetable — schedule changes seasonally',
  ],
  missing_information: [
    'Exact per-day distances and elevation gain',
    'Current park entry pricing',
  ],
};

// Brand tokens (designTokens.color): ember accent on near-black ink / paper-white.
const ACCENT = '#e8651a';
const INK = '#0f1a14';
const PAPER = '#f4f2ef';
const CARD_COLORS = ['#0f1a14', '#3a2a1a', '#1a2a3a', '#2a1a2a'];

export default async function decorate(block, bridge) {
  let item;

  if (bridge) {
    bridge.applyHostStyles();
    const isPreview = bridge.hostContext?.preview === true;
    if (isPreview) {
      item = SAMPLE_DATA;
    } else {
      // Detail / single-object concept — structuredContent IS the briefing (flat).
      const _result = await bridge.toolResult;
      item = _result?.structuredContent || {};
    }
  } else {
    item = SAMPLE_DATA;
  }

  block.textContent = '';

  if (!item || !item.title) {
    const empty = document.createElement('p');
    empty.className = 'build-route-briefing-empty';
    empty.textContent = 'No matching route report was found.';
    block.appendChild(empty);
  } else {
    renderBriefing(block, item, bridge);
  }

  if (bridge) {
    bridge.reportSize(block.offsetWidth, block.offsetHeight);
    let resizeTimer;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => bridge.reportSize(block.offsetWidth, block.offsetHeight), 150);
    });
    ro.observe(block);
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null && text !== '') node.textContent = text;
  return node;
}

function renderBriefing(block, item, bridge) {
  const root = el('div', 'build-route-briefing-dash');

  // ── Header ────────────────────────────────────────────────────────────────
  const header = el('div', 'build-route-briefing-header');
  header.appendChild(el('h3', 'build-route-briefing-title', item.title));

  const meta = el('div', 'build-route-briefing-meta');
  [
    ['Region', item.region],
    ['Duration', item.duration],
    ['Activity', item.activity],
  ].forEach(([label, value]) => {
    if (!value) return;
    const cell = el('div', 'build-route-briefing-meta-cell');
    cell.appendChild(el('span', 'build-route-briefing-meta-label', label));
    cell.appendChild(el('span', 'build-route-briefing-meta-value', value));
    meta.appendChild(cell);
  });
  header.appendChild(meta);

  if (item.verified_status || item.last_verified_date) {
    const verify = el('div', 'build-route-briefing-verified');
    verify.appendChild(el('span', 'build-route-briefing-verified-dot'));
    verify.appendChild(el('span', 'build-route-briefing-verified-text',
      item.verified_status || ('Last verified ' + item.last_verified_date)));
    if (item.verified_status && item.last_verified_date
        && item.verified_status.indexOf(item.last_verified_date) === -1) {
      verify.appendChild(el('span', 'build-route-briefing-verified-date', '· ' + item.last_verified_date));
    }
    header.appendChild(verify);
  }
  root.appendChild(header);

  // ── Stage timeline ──────────────────────────────────────────────────────────
  if (Array.isArray(item.daily_stages) && item.daily_stages.length) {
    const section = el('div', 'build-route-briefing-section');
    section.appendChild(el('span', 'build-route-briefing-section-label', 'Daily stages'));
    const timeline = el('div', 'build-route-briefing-timeline');
    item.daily_stages.forEach((stage, i) => {
      const step = el('div', 'build-route-briefing-step');
      step.appendChild(el('span', 'build-route-briefing-step-day', 'Day ' + (i + 1)));
      step.appendChild(el('span', 'build-route-briefing-step-text', String(stage)));
      timeline.appendChild(step);
    });
    section.appendChild(timeline);
    root.appendChild(section);
  }

  // ── Confirmed detail panels ──────────────────────────────────────────────────
  const panelDefs = [
    ['Access', item.access],
    ['Permits', item.permits],
    ['Water', item.water],
    ['Accommodation', item.accommodation],
    ['Weather window', item.weather_window],
  ];
  const listDefs = [
    ['Hazards', item.hazards],
    ['Essential gear', item.essential_gear],
  ];
  const hasPanels = panelDefs.some(([, v]) => v)
    || listDefs.some(([, v]) => Array.isArray(v) && v.length);

  if (hasPanels) {
    const grid = el('div', 'build-route-briefing-panels');
    panelDefs.forEach(([label, value]) => {
      if (!value) return;
      const panel = el('div', 'build-route-briefing-panel');
      panel.appendChild(el('span', 'build-route-briefing-panel-label', label));
      panel.appendChild(el('p', 'build-route-briefing-panel-text', String(value)));
      grid.appendChild(panel);
    });
    listDefs.forEach(([label, values]) => {
      if (!Array.isArray(values) || !values.length) return;
      const panel = el('div', 'build-route-briefing-panel');
      panel.appendChild(el('span', 'build-route-briefing-panel-label', label));
      const ul = el('ul', 'build-route-briefing-chips');
      values.forEach((v) => {
        const li = el('li', 'build-route-briefing-chip', String(v));
        ul.appendChild(li);
      });
      panel.appendChild(ul);
      grid.appendChild(panel);
    });
    root.appendChild(grid);
  }

  // ── Verify-before-departure block (visually separated) ────────────────────────
  const verifyDefs = [
    ['Verify before departure', item.verification_notes],
    ['Not in this report', item.missing_information],
  ];
  const hasVerify = verifyDefs.some(([, v]) => Array.isArray(v) && v.length);
  if (hasVerify) {
    const flags = el('div', 'build-route-briefing-flags');
    verifyDefs.forEach(([label, values]) => {
      if (!Array.isArray(values) || !values.length) return;
      const flag = el('div', 'build-route-briefing-flag');
      flag.appendChild(el('span', 'build-route-briefing-flag-label', label));
      const ul = el('ul', 'build-route-briefing-flag-list');
      values.forEach((v) => {
        const li = el('li', 'build-route-briefing-flag-item', String(v));
        ul.appendChild(li);
      });
      flag.appendChild(ul);
      flags.appendChild(flag);
    });
    root.appendChild(flags);
  }

  // ── CTAs ──────────────────────────────────────────────────────────────────
  const routeName = item.title || 'this route';
  const actions = [
    ['Create Gear Checklist', 'Create a gear checklist for ' + routeName],
    ['Plan Permits & Access', 'Help me plan permits and access for ' + routeName],
    ['Compare Another Route', 'Compare another route with ' + routeName],
  ];
  const ctaRow = el('div', 'build-route-briefing-ctas');
  actions.forEach(([label, message], i) => {
    const btn = el('button', 'build-route-briefing-cta' + (i === 0 ? ' is-primary' : ''), label);
    btn.type = 'button';
    if (bridge) {
      btn.addEventListener('click', () => bridge.sendMessage(message));
    }
    ctaRow.appendChild(btn);
  });
  root.appendChild(ctaRow);

  block.appendChild(root);
}
