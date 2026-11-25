// codegen:layout-pattern=generic-detail
// Sample data for standalone/preview mode.
// In production, data comes from bridge.toolResult (structuredContent, read flat as the item).
const SAMPLE_DATA = {
  adventure_id: 'patagonia-trek',
  route_title: 'W Circuit: 9 Days, 115 km',
  destination: 'Torres del Paine, Chile',
  travel_window: 'March',
  source_verification: 'Verified · February 2026',
  preparation_steps: [
    '6–8 months out — Reserve refugio and campsite beds through the Vertice and Las Torres portals; beds sell out first and gate every itinerary.',
    '3 months out — Book Puerto Natales lodging and the park-entrance shuttle for your chosen start date.',
    '1 month out — Confirm the CONAF park reservation and download your entry QR to carry at every control.',
    '2 weeks out — Reconfirm catamaran crossing times (Pudeto–Paine Grande) against your daily stages.',
    'On arrival — Attend the mandatory CONAF registration briefing at the park gate before starting.',
  ],
  permit_requirements: [
    'CONAF park-entrance reservation (Torres del Paine) — required for every visitor.',
    'Refugio / camp bed reservations via Vertice and Las Torres — mandatory to sleep or camp inside the park.',
    'Passport ID matching each reservation name, presented at control points.',
  ],
  transport_and_trailhead: [
    'Fly to Punta Arenas, then bus ~3 hr to Puerto Natales (the staging town).',
    'Park shuttle from Puerto Natales to Laguna Amarga gate; catamaran links Pudeto and Paine Grande.',
  ],
  seasonal_access: [
    'March is late shoulder season — stable-ish weather but shortening daylight and cooling nights.',
    'Some refugios begin reducing services toward season end; confirm each is still open for your dates.',
  ],
  official_checks: [
    'Current CONAF entry fees, quotas, and registration rules.',
    'Live refugio/camp availability and any closures with Vertice and Las Torres.',
    'Catamaran and shuttle timetables for your exact travel dates.',
  ],
};

// Brand tokens (DESIGN_TOKENS): ember accent on near-black ink.
const ACCENT = '#e8651a';
const INK = '#0f1a14';

function stepStatus(text) {
  if (/sell|first|early|urgent|\bnow\b|on arrival/i.test(text)) return 'urgent';
  if (/confirm|reconfirm|check|verify|download/i.test(text)) return 'confirm';
  return 'planned';
}
const STATUS_LABEL = { urgent: 'Book early', confirm: 'Confirm', planned: 'Planned' };

function splitStep(text) {
  const idx = text.indexOf('—');
  if (idx > 0 && idx < 40) {
    return { lead: text.slice(0, idx).trim(), body: text.slice(idx + 1).trim() };
  }
  return { lead: '', body: text.trim() };
}

export default async function decorate(block, bridge) {
  let item;

  if (bridge) {
    bridge.applyHostStyles();
    const isPreview = bridge.hostContext?.preview === true;
    if (isPreview) {
      item = SAMPLE_DATA;
    } else {
      // Detail concept — structuredContent IS the item (flat). No wrapper key.
      const _result = await bridge.toolResult;
      item = _result?.structuredContent || {};
    }
  } else {
    item = SAMPLE_DATA;
  }

  block.textContent = '';

  if (!item || !item.route_title) {
    const empty = document.createElement('p');
    empty.className = 'ppa-empty';
    empty.textContent = 'No matching route logistics were found.';
    block.appendChild(empty);
  } else {
    renderPlan(block, item, bridge);
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

function renderPlan(block, item, bridge) {
  const card = document.createElement('div');
  card.className = 'ppa-card';

  // Header
  const header = document.createElement('div');
  header.className = 'ppa-header';

  const title = document.createElement('h3');
  title.className = 'ppa-title';
  title.textContent = item.route_title;
  header.appendChild(title);

  const sub = document.createElement('p');
  sub.className = 'ppa-subtitle';
  const subParts = [item.destination, item.travel_window].filter(Boolean);
  sub.textContent = subParts.join('  ·  ');
  header.appendChild(sub);

  if (item.source_verification) {
    const chip = document.createElement('span');
    chip.className = 'ppa-chip';
    chip.textContent = item.source_verification;
    header.appendChild(chip);
  }
  card.appendChild(header);

  const scroll = document.createElement('div');
  scroll.className = 'ppa-scroll';

  // Section 1 — preparation timeline
  const steps = Array.isArray(item.preparation_steps) ? item.preparation_steps : [];
  if (steps.length) {
    const sec = document.createElement('section');
    sec.className = 'ppa-section';

    const h = document.createElement('h4');
    h.className = 'ppa-section-title';
    h.textContent = 'Preparation timeline';
    sec.appendChild(h);

    const timeline = document.createElement('ol');
    timeline.className = 'ppa-timeline';

    steps.forEach((raw) => {
      const status = stepStatus(raw);
      const { lead, body } = splitStep(raw);

      const li = document.createElement('li');
      li.className = `ppa-step ppa-step--${status}`;

      const node = document.createElement('span');
      node.className = 'ppa-node';
      node.setAttribute('aria-hidden', 'true');
      li.appendChild(node);

      const content = document.createElement('div');
      content.className = 'ppa-step-content';

      const topRow = document.createElement('div');
      topRow.className = 'ppa-step-top';

      if (lead) {
        const leadEl = document.createElement('span');
        leadEl.className = 'ppa-step-lead';
        leadEl.textContent = lead;
        topRow.appendChild(leadEl);
      }

      const badge = document.createElement('span');
      badge.className = `ppa-badge ppa-badge--${status}`;
      badge.textContent = STATUS_LABEL[status];
      topRow.appendChild(badge);

      content.appendChild(topRow);

      const bodyEl = document.createElement('p');
      bodyEl.className = 'ppa-step-body';
      bodyEl.textContent = body;
      content.appendChild(bodyEl);

      li.appendChild(content);
      timeline.appendChild(li);
    });

    sec.appendChild(timeline);
    scroll.appendChild(sec);
  }

  // Section 2 — permit requirements
  const permits = Array.isArray(item.permit_requirements) ? item.permit_requirements : [];
  if (permits.length) {
    const sec = document.createElement('section');
    sec.className = 'ppa-section';

    const h = document.createElement('h4');
    h.className = 'ppa-section-title';
    h.textContent = 'Permits & reservations';
    sec.appendChild(h);

    const ul = document.createElement('ul');
    ul.className = 'ppa-permits';
    permits.forEach((p) => {
      const li = document.createElement('li');
      li.className = 'ppa-permit';
      const marker = document.createElement('span');
      marker.className = 'ppa-permit-marker';
      marker.setAttribute('aria-hidden', 'true');
      li.appendChild(marker);
      const txt = document.createElement('span');
      txt.className = 'ppa-permit-text';
      txt.textContent = p;
      li.appendChild(txt);
      ul.appendChild(li);
    });
    sec.appendChild(ul);
    scroll.appendChild(sec);
  }

  card.appendChild(scroll);

  // CTAs
  const actions = document.createElement('div');
  actions.className = 'ppa-actions';

  const makeCta = (label, message) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ppa-cta';
    btn.textContent = label;
    if (bridge) {
      btn.addEventListener('click', () => bridge.sendMessage(message));
    }
    return btn;
  };

  const routeName = item.route_title || 'this route';
  actions.appendChild(makeCta('Build Full Route Briefing', `Build a full route briefing for ${routeName}, including transport, trailhead access, and seasonal considerations.`));
  actions.appendChild(makeCta('Create Gear Checklist', `Create a gear checklist for ${routeName} in ${item.travel_window || 'my travel window'}.`));

  card.appendChild(actions);
  block.appendChild(card);
}
