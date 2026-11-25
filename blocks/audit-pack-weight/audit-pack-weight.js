// codegen:layout-pattern=generic-detail
// Sample data for standalone/preview mode.
// In production, data comes dynamically from bridge.toolResult (a single flat object).
const SAMPLE_DATA = {
  current_weight_grams: 11800,
  potential_weight_grams: 9450,
  estimated_savings_grams: 2350,
  category_breakdown: [
    'Shelter: 2100 g',
    'Sleep system: 1850 g',
    'Cook system: 1200 g',
    'Clothing: 3100 g',
    'Electronics: 900 g',
    'Safety & navigation: 1450 g',
    'Miscellaneous: 1200 g',
  ],
  recommended_cuts: [
    'Second insulated jacket — 480 g — one puffy plus active layers covers the W Circuit’s February range; a duplicate is redundant.',
    'Camp chair — 620 g — refugios and established campsites provide seating; comfort item, not route-required.',
    'Full-size camera tripod — 750 g — a compact tabletop mount saves ~600 g with minimal loss for trail photos.',
  ],
  possible_swaps: [
    'Swap 2-person tent for a solo trekking-pole shelter — saves ~650 g (evidence-backed: WKND ultralight guide).',
    'Swap canister stove + steel pot for a titanium integrated system — saves ~300 g.',
    'Swap cotton layers for merino/synthetic — saves ~250 g and dries faster.',
  ],
  safety_critical_items: [
    'Waterproof hardshell — Patagonian weather turns fast; non-negotiable.',
    'Headlamp + spare batteries — required for pre-dawn stage starts.',
    'First-aid kit and blister care — 9-day remote route.',
    'Navigation (map + compass or GPS) — refugio-to-refugio routefinding.',
  ],
  missing_essentials: [
    'No listed water treatment — add filter or tablets for a 9-day route.',
    'No emergency shelter/bivy noted.',
  ],
  assumptions: [
    'Weights estimated where the list omitted them.',
    'February Patagonian shoulder-season conditions assumed.',
  ],
};

function fmtWeight(grams) {
  const n = Number(grams);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(2)} kg`;
  return `${Math.round(n)} g`;
}

// Parse "Category: 1234 g" / "Category — 1234g" into { label, grams }.
function parseCategory(str) {
  if (typeof str !== 'string') return { label: String(str), grams: null };
  const m = str.match(/^(.*?)[\s]*[:—–-][\s]*([\d.,]+)\s*g?\s*$/i);
  if (m) {
    const grams = parseFloat(m[2].replace(/,/g, ''));
    if (Number.isFinite(grams)) return { label: m[1].trim(), grams };
  }
  return { label: str, grams: null };
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function renderAudit(block, data, bridge) {
  block.textContent = '';
  const root = el('div', 'audit-pack-weight-card');

  // --- Summary stats row ---
  const summary = el('div', 'apw-summary');
  const stats = [
    { key: 'current', label: 'Current', value: data.current_weight_grams },
    { key: 'potential', label: 'Potential', value: data.potential_weight_grams },
    { key: 'savings', label: 'Savings', value: data.estimated_savings_grams },
  ];
  stats.forEach((s) => {
    const stat = el('div', `apw-stat apw-stat--${s.key}`);
    stat.appendChild(el('span', 'apw-stat-num', fmtWeight(s.value)));
    stat.appendChild(el('span', 'apw-stat-label', s.label));
    summary.appendChild(stat);
  });
  root.appendChild(summary);

  // --- Category breakdown bar chart ---
  const cats = (data.category_breakdown || []).map(parseCategory);
  if (cats.length) {
    const chart = el('div', 'apw-chart');
    chart.appendChild(el('div', 'apw-section-title', 'Weight by category'));
    const max = Math.max(1, ...cats.map((c) => c.grams || 0));
    cats.forEach((c) => {
      const row = el('div', 'apw-bar-row');
      row.appendChild(el('span', 'apw-bar-label', c.label));
      const track = el('div', 'apw-bar-track');
      const fill = el('div', 'apw-bar-fill');
      if (c.grams != null) fill.style.width = `${Math.max(4, (c.grams / max) * 100)}%`;
      else fill.style.width = '0%';
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el('span', 'apw-bar-val', c.grams != null ? fmtWeight(c.grams) : ''));
      chart.appendChild(row);
    });
    root.appendChild(chart);
  }

  // --- Lists ---
  const lists = el('div', 'apw-lists');
  const makeList = (title, items, variant, glyph) => {
    if (!items || !items.length) return;
    const panel = el('div', `apw-list apw-list--${variant}`);
    const head = el('div', 'apw-list-head');
    if (glyph) head.appendChild(el('span', 'apw-list-glyph', glyph));
    head.appendChild(el('span', 'apw-list-title', title));
    panel.appendChild(head);
    const ul = el('ul', 'apw-list-items');
    items.forEach((it) => ul.appendChild(el('li', 'apw-list-item', it)));
    panel.appendChild(ul);
    lists.appendChild(panel);
  };
  makeList('Recommended cuts', data.recommended_cuts, 'cut', '✂');
  makeList('Possible swaps', data.possible_swaps, 'swap', '⇄');
  makeList('Safety-critical (keep)', data.safety_critical_items, 'safety', '⛨');
  root.appendChild(lists);

  // --- CTAs ---
  const ctas = el('div', 'apw-ctas');
  const mkBtn = (label, msg) => {
    const b = el('button', 'apw-cta', label);
    b.type = 'button';
    if (bridge) b.addEventListener('click', () => bridge.sendMessage(msg));
    ctas.appendChild(b);
  };
  mkBtn('Generate Revised Checklist', 'Generate a revised packing checklist based on this audit.');
  mkBtn('Review Route Requirements', 'Review the route requirements for this trip.');
  root.appendChild(ctas);

  block.appendChild(root);
}

export default async function decorate(block, bridge) {
  let data;

  if (bridge) {
    bridge.applyHostStyles();
    const isPreview = bridge.hostContext?.preview === true;
    if (isPreview) {
      data = SAMPLE_DATA;
    } else {
      // Detail concept — structuredContent IS the audit object (flat). No wrapper key.
      const _result = await bridge.toolResult;
      data = _result?.structuredContent || {};
    }
  } else {
    data = SAMPLE_DATA;
  }

  const hasContent = data && (
    data.current_weight_grams != null
    || (data.category_breakdown && data.category_breakdown.length)
    || (data.recommended_cuts && data.recommended_cuts.length)
  );

  if (!hasContent) {
    block.textContent = '';
    block.appendChild(el('p', 'apw-empty', 'No pack audit results were returned.'));
  } else {
    renderAudit(block, data, bridge);
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
