// codegen:layout-pattern=generic-detail
// Sample data for standalone/preview mode.
// In production, data comes dynamically from bridge.toolResult.
const SAMPLE_DATA = {
  submission_type: 'Completed-route story',
  proposed_title: 'W Circuit: 9 Days, 115 km — A Field Account',
  destination: 'Torres del Paine',
  activity: 'Hiking',
  condition_date: 'February 2026',
  submission_summary: 'A first-person completed-route account of the W Circuit in Torres del Paine covering permit strategy, daily stage breakdowns, and refugio conditions across nine days and 115 km.',
  draft_sections: [
    'Overview & why this route',
    'Permit strategy and booking timeline',
    'Daily stage breakdown (Days 1–9)',
    'Refugio conditions and resupply notes',
    "Gear that mattered / gear that didn't",
    'Closing reflections',
  ],
  contributor_bio: 'Long-distance hiker documenting multi-day mountain routes across the Americas.',
  evidence_checklist: [
    '12 dated trail photos with GPS metadata',
    'Permit confirmation numbers',
    'Daily GPX tracks (115 km total)',
  ],
  missing_information: [
    'Refugio contact details for stage 4',
    'Exact water source locations for Day 6',
    'Photo captions with dates',
  ],
  editorial_flags: [
    'Verify current permit fees before publication',
    'Safety claim about river crossing needs confirmation',
    'Refugio availability may have changed since February 2026',
  ],
  readiness_status: 'Needs revision — add missing details before sending',
};

function isReady(status) {
  return /\bready\b/i.test(status || '') && !/not ready|needs|revis|incomplete|missing/i.test(status || '');
}

function assemblePackage(item) {
  const lines = [];
  if (item.proposed_title) lines.push(item.proposed_title);
  if (item.submission_type) lines.push(`Type: ${item.submission_type}`);
  const meta = [item.destination, item.activity, item.condition_date].filter(Boolean).join(' · ');
  if (meta) lines.push(meta);
  if (item.submission_summary) lines.push('', item.submission_summary);
  if (Array.isArray(item.draft_sections) && item.draft_sections.length) {
    lines.push('', 'Outline:');
    item.draft_sections.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  }
  if (Array.isArray(item.evidence_checklist) && item.evidence_checklist.length) {
    lines.push('', 'Evidence:');
    item.evidence_checklist.forEach((s) => lines.push(`- ${s}`));
  }
  if (Array.isArray(item.missing_information) && item.missing_information.length) {
    lines.push('', 'Missing information:');
    item.missing_information.forEach((s) => lines.push(`- ${s}`));
  }
  if (Array.isArray(item.editorial_flags) && item.editorial_flags.length) {
    lines.push('', 'Editorial flags:');
    item.editorial_flags.forEach((s) => lines.push(`- ${s}`));
  }
  if (item.contributor_bio) lines.push('', `Contributor: ${item.contributor_bio}`);
  return lines.join('\n');
}

function makeChip(text, cls) {
  const chip = document.createElement('span');
  chip.className = `pfs-chip ${cls}`;
  chip.textContent = text;
  return chip;
}

function makePanel(title, entries, variant) {
  const panel = document.createElement('section');
  panel.className = `pfs-panel pfs-panel--${variant}`;

  const h = document.createElement('h3');
  h.className = 'pfs-panel-title';
  h.textContent = title;
  const count = document.createElement('span');
  count.className = 'pfs-panel-count';
  count.textContent = String((entries || []).length);
  h.appendChild(count);
  panel.appendChild(h);

  const ul = document.createElement('ul');
  ul.className = 'pfs-panel-list';
  (entries || []).forEach((entry) => {
    const li = document.createElement('li');
    li.textContent = entry;
    ul.appendChild(li);
  });
  panel.appendChild(ul);
  return panel;
}

function makeCopyable(labelText, valueText) {
  const wrap = document.createElement('div');
  wrap.className = 'pfs-copyable';

  const head = document.createElement('div');
  head.className = 'pfs-copyable-head';
  const label = document.createElement('span');
  label.className = 'pfs-copyable-label';
  label.textContent = labelText;
  head.appendChild(label);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pfs-copy-btn';
  btn.textContent = 'Copy';
  btn.setAttribute('aria-label', `Copy ${labelText}`);
  btn.addEventListener('click', () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(valueText || '').then(() => {
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
      }).catch(() => {});
    }
  });
  head.appendChild(btn);
  wrap.appendChild(head);

  const val = document.createElement('p');
  val.className = 'pfs-copyable-value';
  val.textContent = valueText;
  wrap.appendChild(val);
  return wrap;
}

function renderSubmission(block, item, bridge) {
  const card = document.createElement('div');
  card.className = 'pfs-card';

  // Header: title + chips
  const header = document.createElement('div');
  header.className = 'pfs-header';

  const title = document.createElement('h2');
  title.className = 'pfs-title';
  title.textContent = item.proposed_title || 'Untitled submission';
  header.appendChild(title);

  const chips = document.createElement('div');
  chips.className = 'pfs-chips';
  if (item.submission_type) chips.appendChild(makeChip(item.submission_type, 'pfs-chip--type'));
  if (item.readiness_status) {
    chips.appendChild(makeChip(item.readiness_status, isReady(item.readiness_status) ? 'pfs-chip--ready' : 'pfs-chip--warn'));
  }
  header.appendChild(chips);

  // Meta row
  const meta = document.createElement('div');
  meta.className = 'pfs-meta';
  [
    ['Destination', item.destination],
    ['Activity', item.activity],
    ['Date', item.condition_date],
  ].forEach(([k, v]) => {
    if (!v) return;
    const m = document.createElement('span');
    m.className = 'pfs-meta-item';
    const mk = document.createElement('span');
    mk.className = 'pfs-meta-key';
    mk.textContent = k;
    const mv = document.createElement('span');
    mv.className = 'pfs-meta-val';
    mv.textContent = v;
    m.appendChild(mk);
    m.appendChild(mv);
    meta.appendChild(m);
  });
  header.appendChild(meta);
  card.appendChild(header);

  const body = document.createElement('div');
  body.className = 'pfs-body';

  // Copyable summary
  if (item.submission_summary) {
    body.appendChild(makeCopyable('Submission summary', item.submission_summary));
  }

  // Draft sections ordered outline
  if (Array.isArray(item.draft_sections) && item.draft_sections.length) {
    const outline = document.createElement('section');
    outline.className = 'pfs-outline';
    const oh = document.createElement('h3');
    oh.className = 'pfs-panel-title';
    oh.textContent = 'Draft outline';
    outline.appendChild(oh);
    const ol = document.createElement('ol');
    ol.className = 'pfs-outline-list';
    item.draft_sections.forEach((s) => {
      const li = document.createElement('li');
      li.textContent = s;
      ol.appendChild(li);
    });
    outline.appendChild(ol);
    body.appendChild(outline);
  }

  // Three panels
  const panels = document.createElement('div');
  panels.className = 'pfs-panels';
  panels.appendChild(makePanel('Evidence checklist', item.evidence_checklist, 'evidence'));
  panels.appendChild(makePanel('Missing information', item.missing_information, 'missing'));
  panels.appendChild(makePanel('Editorial flags', item.editorial_flags, 'flags'));
  body.appendChild(panels);

  // Copyable contributor bio
  if (item.contributor_bio) {
    body.appendChild(makeCopyable('Contributor bio', item.contributor_bio));
  }

  card.appendChild(body);

  // CTAs
  const actions = document.createElement('div');
  actions.className = 'pfs-actions';

  const primary = document.createElement('button');
  primary.type = 'button';
  primary.className = 'pfs-btn pfs-btn--primary';
  primary.textContent = 'Copy Submission Package';
  primary.addEventListener('click', () => {
    const text = assemblePackage(item);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        primary.textContent = 'Copied Package';
        setTimeout(() => { primary.textContent = 'Copy Submission Package'; }, 1600);
      }).catch(() => {});
    }
  });
  actions.appendChild(primary);

  const secondary = document.createElement('button');
  secondary.type = 'button';
  secondary.className = 'pfs-btn pfs-btn--secondary';
  secondary.textContent = 'Review Missing Details';
  secondary.addEventListener('click', () => {
    if (bridge && bridge.sendMessage) {
      bridge.sendMessage('Help me fill in the missing details for my WKND submission');
    }
  });
  actions.appendChild(secondary);

  card.appendChild(actions);
  block.appendChild(card);
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

  if (!item || !item.proposed_title) {
    const empty = document.createElement('p');
    empty.className = 'pfs-empty';
    empty.textContent = 'No submission package was prepared.';
    block.appendChild(empty);
  } else {
    renderSubmission(block, item, bridge);
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
