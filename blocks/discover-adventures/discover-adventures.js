// codegen:layout-pattern=carousel
// Sample data for standalone/preview mode.
// In production, data comes dynamically from bridge.toolResult.
const SAMPLE_DATA = [
  { adventure_id: 'patagonia-trek', title: 'W Circuit: 9 Days, 115 km', image_url: 'https://wknd-adventures.run.place/media_1e4b49be43a70d306b1c312d0d78dd369b5ccce40.jpg?width=1200&format=pjpg&optimize=medium', activity: 'Hiking', region: 'Americas', experience_level: 'Advanced', duration: '9 days · 115 km', verified_status: 'Verified · February 2026', match_reason: 'A demanding multi-day mountain expedition for experienced parties who want documented permit and stage detail.', physical_demand: 5, technical_skill: 3, remoteness: 4 },
  { adventure_id: 'kayaking-norway', title: 'Lofoten Islands: Arctic Surfing at the Top of the World', image_url: 'https://wknd-adventures.run.place/media_1bd10685af4f3d38127de55d4da60d4ef86518b8d.jpg?width=1200&format=pjpg&optimize=medium', activity: 'Surfing', region: 'Europe', experience_level: 'Advanced', duration: '7 days', verified_status: 'Verified · November 2025', match_reason: 'Cold-water surf expedition for confident surfers comfortable in serious neoprene and remote conditions.', physical_demand: 4, technical_skill: 4, remoteness: 5 },
  { adventure_id: 'alpine-cycling', title: 'Six Days Through the High Alps by Bike', image_url: 'https://wknd-adventures.run.place/media_1e56ff87aeb7dc7d3d4eb4acd41d468f583a00303.jpg?width=1200&format=pjpg&optimize=medium', activity: 'Cycling', region: 'Europe', experience_level: 'Advanced', duration: '6 days', verified_status: '', match_reason: 'High-pass road cycling for fit riders who want climb-by-climb resupply and surface beta.', physical_demand: 5, technical_skill: 2, remoteness: 3 },
  { adventure_id: 'surfing-costa-rica', title: "Pavones and Playa Negra: Finding Your Feet on Costa Rica's Breaks", image_url: 'https://wknd-adventures.run.place/media_168d4df680b92c68b36d08772450bd3d2ec2d19ce.jpg?width=1200&format=pjpg&optimize=medium', activity: 'Surfing', region: 'Americas', experience_level: 'Intermediate', duration: 'Flexible', verified_status: '', match_reason: 'Warm-water point-break guide suited to intermediate surfers wanting break selection and etiquette detail.', physical_demand: 3, technical_skill: 3, remoteness: 2 },
  { adventure_id: 'winter-mountaineering', title: 'Why Cold Routes Demand Warm Minds', image_url: 'https://wknd-adventures.run.place/media_12bab1a689efff46698aae2d4591400d1208853ff.avif?width=1200&format=pjpg&optimize=medium', activity: 'Winter Mountaineering', region: 'Alpine', experience_level: 'Advanced', duration: '1–3 days', verified_status: '', match_reason: 'Steep-snow and mixed-terrain guidance for experienced mountaineers heading into winter conditions.', physical_demand: 5, technical_skill: 5, remoteness: 4 },
  { adventure_id: 'yosemite-rock-climbing', title: 'First Light on the Valley', image_url: 'https://wknd-adventures.run.place/media_13abc2aa7399e068d346e9f883c5be81f0bdfabf5.avif?width=1200&format=pjpg&optimize=medium', activity: 'Climbing', region: 'Americas', experience_level: 'Beginner', duration: 'Flexible', verified_status: '', match_reason: 'Introductory Valley cragging for first-time climbers building rock skills on bolted terrain.', physical_demand: 3, technical_skill: 4, remoteness: 2 },
  { adventure_id: 'wild-swimming-guide', title: 'Reading a River', image_url: 'https://wknd-adventures.run.place/media_183099ae6d06ddd8bbd52f5416f41782c6d9af77c.jpg?width=1200&format=pjpg&optimize=medium', activity: 'Wild Swimming', region: 'Mountains', experience_level: 'Beginner', duration: 'Day trip', verified_status: '', match_reason: 'Approachable water-safety guidance for newcomers to cold-water and river swimming.', physical_demand: 2, technical_skill: 2, remoteness: 3 },
  { adventure_id: 'desert-survival-guide', title: '48 Hours in the Sonoran', image_url: 'https://wknd-adventures.run.place/media_13f721df562523f0924be582404e750aaffab42e1.jpg?width=1200&format=pjpg&optimize=medium', activity: 'Desert Trekking', region: 'Americas', experience_level: 'Intermediate', duration: '48 hours', verified_status: '', match_reason: 'Hot-desert travel skills for prepared trekkers managing heat and scarce water.', physical_demand: 4, technical_skill: 3, remoteness: 4 },
  { adventure_id: 'mountain-photography', title: 'The Camera on Your Back', image_url: 'https://wknd-adventures.run.place/media_1133e47f59378ddc186f3a3f410745aa74c3102bd.jpg?width=1200&format=pjpg&optimize=medium', activity: 'Photography', region: 'Alpine', experience_level: 'Intermediate', duration: 'Flexible', verified_status: '', match_reason: 'For photographers weighing image-making against the physical burden of gear on the trail.', physical_demand: 3, technical_skill: 2, remoteness: 3 },
  { adventure_id: 'ultralight-backpacking', title: 'Sub-10 lb: What to Cut, What to Keep', image_url: 'https://wknd-adventures.run.place/media_11fea14b0a8da0dcbcde423d0b4a86d48016fed3b.avif?width=1200&format=pjpg&optimize=medium', activity: 'Backpacking', region: 'General', experience_level: 'Intermediate', duration: 'Multi-day', verified_status: '', match_reason: 'Weight-optimization principles for backpackers refining a multi-day kit.', physical_demand: 4, technical_skill: 2, remoteness: 3 },
];

// Brand colors from DESIGN_TOKENS' color tier.
const PALETTE = ['#e8651a', '#f4f2ef', '#0f1a14', '#ffffff'];
const ACCENT = '#e8651a';
const CARD_COLORS = ['#378ef0', '#9256d9', '#0fb5ae', '#e68619', '#d83790', '#2dca72', '#4046ca', '#72b340'];

// Uses the brand color as-is (never darkened) and picks whichever foreground —
// light or dark — gives better contrast, so small text (11px meta/reason lines)
// stays WCAG-readable without shifting the card off-brand.
function getThemedCardBg(palette) {
  if (!palette || !palette[0]) return null;
  let hex = palette[0].replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  if (hex.length !== 6) return null;
  const [r, g, b] = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  const lum = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const bgLum = (0.2126 * lum(r)) + (0.7152 * lum(g)) + (0.0722 * lum(b));
  const whiteContrast = 1.05 / (bgLum + 0.05);
  const blackContrast = (bgLum + 0.05) / 0.05;
  return { bg: `#${hex}`, fg: whiteContrast >= blackContrast ? '#ffffff' : (palette[2] || '#0f1a14') };
}
const theme = getThemedCardBg(PALETTE);

function num(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function hasCoords(item) {
  const lat = num(item.latitude ?? item.lat);
  const lng = num(item.longitude ?? item.lng ?? item.lon);
  return lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export default async function decorate(block, bridge) {
  let items;

  if (bridge) {
    bridge.applyHostStyles();
    const isPreview = bridge.hostContext?.preview === true;
    if (isPreview) {
      items = SAMPLE_DATA;
    } else {
      const _result = await bridge.toolResult;
      const structuredContent = _result?.structuredContent || {};
      // structuredContent.adventures — bare array outputSchema; key derived from actionName "discover_adventures"
      items = structuredContent?.adventures || [];
    }
  } else {
    items = SAMPLE_DATA;
  }

  block.textContent = '';
  renderWidget(block, items || [], bridge);

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

function makeChip(label, value) {
  const chip = document.createElement('span');
  chip.className = 'da-chip';
  chip.textContent = `${label} ${value}`;
  return chip;
}

function buildCard(item, i, bridge, isTop) {
  const card = document.createElement('article');
  card.className = 'da-card';

  const imageWrap = document.createElement('div');
  imageWrap.className = 'da-card-image';

  const fallbackColor = CARD_COLORS[i % CARD_COLORS.length];
  const colorDiv = () => {
    const d = document.createElement('div');
    d.style.cssText = `width:100%;height:100%;background-color:${fallbackColor};`;
    return d;
  };
  if (item.image_url) {
    const img = document.createElement('img');
    img.src = item.image_url;
    img.alt = item.title || item.name || '';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    img.onerror = () => { if (img.parentNode) img.parentNode.replaceChild(colorDiv(), img); };
    imageWrap.appendChild(img);
  } else {
    imageWrap.appendChild(colorDiv());
  }

  if (isTop) {
    const ribbon = document.createElement('span');
    ribbon.className = 'da-ribbon';
    ribbon.textContent = 'Top match';
    imageWrap.appendChild(ribbon);
  }
  card.appendChild(imageWrap);

  const content = document.createElement('div');
  content.className = 'da-card-content';
  content.style.cssText = `background:${theme?.bg ?? '#1a1a1a'};color:${theme?.fg ?? '#fff'}`;

  const title = document.createElement('h3');
  title.className = 'da-title';
  title.textContent = item.title || item.name || '';
  content.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'da-meta';
  const parts = [item.region, item.activity, item.experience_level].filter(Boolean);
  meta.textContent = parts.join(' · ');
  content.appendChild(meta);

  const infoRow = document.createElement('div');
  infoRow.className = 'da-info-row';
  if (item.duration) {
    const dur = document.createElement('span');
    dur.className = 'da-duration';
    dur.textContent = item.duration;
    infoRow.appendChild(dur);
  }
  if (item.verified_status) {
    const ver = document.createElement('span');
    ver.className = 'da-verified';
    ver.textContent = item.verified_status;
    infoRow.appendChild(ver);
  }
  if (infoRow.childNodes.length) content.appendChild(infoRow);

  const reason = document.createElement('p');
  reason.className = 'da-reason';
  reason.textContent = item.match_reason || '';
  content.appendChild(reason);

  const chips = document.createElement('div');
  chips.className = 'da-chips';
  const pd = num(item.physical_demand);
  const ts = num(item.technical_skill);
  const rm = num(item.remoteness);
  if (pd !== null) chips.appendChild(makeChip('Demand', pd));
  if (ts !== null) chips.appendChild(makeChip('Skill', ts));
  if (rm !== null) chips.appendChild(makeChip('Remote', rm));
  if (chips.childNodes.length) content.appendChild(chips);

  const actions = document.createElement('div');
  actions.className = 'da-actions';
  const name = item.title || item.name || '';

  const primary = document.createElement('button');
  primary.className = 'da-cta da-cta-primary';
  primary.type = 'button';
  primary.textContent = 'Build My Briefing';
  if (bridge) primary.addEventListener('click', () => bridge.sendMessage(`Build my briefing for ${name}`));
  actions.appendChild(primary);

  const secondary = document.createElement('button');
  secondary.className = 'da-cta da-cta-secondary';
  secondary.type = 'button';
  secondary.textContent = 'Compare Adventures';
  if (bridge) secondary.addEventListener('click', () => bridge.sendMessage(`Compare adventures: ${name}`));
  actions.appendChild(secondary);

  content.appendChild(actions);
  card.appendChild(content);
  return card;
}

function renderWidget(block, items, bridge) {
  const root = document.createElement('div');
  root.className = 'da-root';

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'da-empty';
    empty.textContent = 'No matching adventures were found.';
    root.appendChild(empty);
    block.appendChild(root);
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'da-carousel-wrap';

  const track = document.createElement('div');
  track.className = 'da-track';

  const shown = items.slice(0, 8);
  shown.forEach((item, i) => track.appendChild(buildCard(item, i, bridge, i === 0)));
  wrapper.appendChild(track);

  const fade = document.createElement('div');
  fade.className = 'da-fade';
  fade.style.cssText = `position:absolute;top:0;right:0;height:100%;width:60px;background:linear-gradient(to right,transparent,${theme?.bg ?? '#1a1a1a'}cc);pointer-events:none;`;
  wrapper.appendChild(fade);

  const leftBtn = document.createElement('button');
  leftBtn.className = 'da-nav da-nav-left';
  leftBtn.type = 'button';
  leftBtn.setAttribute('aria-label', 'Scroll left');
  leftBtn.textContent = '◀';
  const rightBtn = document.createElement('button');
  rightBtn.className = 'da-nav da-nav-right';
  rightBtn.type = 'button';
  rightBtn.setAttribute('aria-label', 'Scroll right');
  rightBtn.textContent = '▶';

  const cardStep = () => {
    const first = track.querySelector('.da-card');
    return first ? first.getBoundingClientRect().width + 16 : 236;
  };
  leftBtn.addEventListener('click', () => track.scrollBy({ left: -cardStep(), behavior: 'smooth' }));
  rightBtn.addEventListener('click', () => track.scrollBy({ left: cardStep(), behavior: 'smooth' }));
  [leftBtn, rightBtn].forEach((btn) => btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
  }));

  const updateNav = () => {
    const maxScroll = track.scrollWidth - track.clientWidth - 2;
    leftBtn.style.display = track.scrollLeft <= 2 ? 'none' : 'flex';
    rightBtn.style.display = track.scrollLeft >= maxScroll ? 'none' : 'flex';
    fade.style.display = track.scrollLeft >= maxScroll ? 'none' : 'block';
  };
  track.addEventListener('scroll', updateNav);
  wrapper.appendChild(leftBtn);
  wrapper.appendChild(rightBtn);

  root.appendChild(wrapper);
  block.appendChild(root);
  requestAnimationFrame(updateNav);

  // Map view is only meaningful when items carry coordinates. The sample payload
  // has none, so no toggle renders in preview; a live tool result with coordinates
  // would enable it. Guard the whole surface on coordinates present at render time.
  const mappable = items.filter(hasCoords);
  if (mappable.length) {
    // Coordinates present — a map view could be mounted lazily here.
    // Left intentionally minimal: no coordinates in this action's schema.
  }
}
